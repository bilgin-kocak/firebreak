import { ROBOT_IDS } from "../domain/firebreakSeed";
import type { MissionProgressEvent, MissionRoute, RobotId } from "../domain/firebreakTypes";
import { FirebreakError } from "../domain/firebreakTypes";
import type { ManualRobotCommand, MissionRobotDriver } from "./controlTypes";

export interface RosConnectionLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  connect(url: string): void;
  close(): void;
}

export interface RosTopicLike {
  publish(message: unknown): void;
  subscribe(listener: (message: unknown) => void): void;
  unsubscribe(listener?: (message: unknown) => void): void;
}

export interface RoslibFactory {
  createRos(): RosConnectionLike;
  createTopic(ros: RosConnectionLike, options: { name: string; messageType: string }): RosTopicLike;
  createMessage(value: Record<string, unknown>): unknown;
}

export const ROS_TOPIC_MAP = Object.freeze({
  "SCOUT-1": Object.freeze({
    cmdVel: "/firebreak/scout-1/cmd_vel",
    goalPose: "/firebreak/scout-1/goal_pose",
    odom: "/firebreak/scout-1/odom",
    battery: "/firebreak/scout-1/battery",
  }),
  "MEDIC-2": Object.freeze({
    cmdVel: "/firebreak/medic-2/cmd_vel",
    goalPose: "/firebreak/medic-2/goal_pose",
    odom: "/firebreak/medic-2/odom",
    battery: "/firebreak/medic-2/battery",
  }),
  "SUPPRESS-3": Object.freeze({
    cmdVel: "/firebreak/suppress-3/cmd_vel",
    goalPose: "/firebreak/suppress-3/goal_pose",
    odom: "/firebreak/suppress-3/odom",
    battery: "/firebreak/suppress-3/battery",
  }),
  "HAUL-4": Object.freeze({
    cmdVel: "/firebreak/haul-4/cmd_vel",
    goalPose: "/firebreak/haul-4/goal_pose",
    odom: "/firebreak/haul-4/odom",
    battery: "/firebreak/haul-4/battery",
  }),
} satisfies Record<RobotId, Record<"cmdVel" | "goalPose" | "odom" | "battery", string>>);

const ESTOP_TOPIC = "/firebreak/fleet/emergency_stop";
const COMMAND_KEYS = ["action", "deltaMs", "robotId", "throttle", "turn"] as const;

export interface Ros2DriverOptions {
  url: string;
  rosFactory?: RoslibFactory;
  now?: () => number;
  commandTimeoutMs?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

interface RobotTopics {
  cmdVel: RosTopicLike;
  goalPose: RosTopicLike;
  odom: RosTopicLike;
  battery: RosTopicLike;
  odomListener: (message: unknown) => void;
  batteryListener: (message: unknown) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function validatedUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FirebreakError("OPERATION_FAILED", "ROS bridge URL is invalid.");
  }
  const secure = url.protocol === "wss:";
  const local = url.protocol === "ws:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!secure && !local) {
    throw new FirebreakError(
      "OPERATION_FAILED",
      "ROS bridge URL must use wss:// or a local ws:// endpoint.",
    );
  }
  return url.toString();
}

function isRobotId(value: unknown): value is RobotId {
  return typeof value === "string" && (ROBOT_IDS as readonly string[]).includes(value);
}

function zeroTwist(): Record<string, unknown> {
  return {
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
  };
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = window.setTimeout(resolve, Math.min(milliseconds, 2_000));
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

async function loadDefaultFactory(): Promise<RoslibFactory> {
  const roslib = await import("roslib");
  return {
    createRos: () => new roslib.Ros() as unknown as RosConnectionLike,
    createTopic: (ros, options) =>
      new roslib.Topic({
        ros: ros as never,
        name: options.name,
        messageType: options.messageType,
      }) as unknown as RosTopicLike,
    createMessage: (value) => value,
  };
}

export class Ros2Driver implements MissionRobotDriver {
  readonly mode = "ros2" as const;
  public connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  private url: string;
  private factory: RoslibFactory | null;
  private ros: RosConnectionLike | null = null;
  private readonly topics = new Map<RobotId, RobotTopics>();
  private estop: RosTopicLike | null = null;
  private readonly watchdogs = new Map<RobotId, number>();
  private connectionListener: (() => void) | null = null;
  private errorListener: ((error?: unknown) => void) | null = null;
  private closeListener: (() => void) | null = null;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private readonly commandTimeoutMs: number;
  private readonly telemetry = new Map<RobotId, { odom?: unknown; battery?: unknown }>();

  public constructor(options: Ros2DriverOptions) {
    this.url = validatedUrl(options.url);
    this.factory = options.rosFactory ?? null;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? defaultWait;
    this.commandTimeoutMs = Math.max(100, Math.min(2_000, options.commandTimeoutMs ?? 350));
  }

  public async connectTo(url: string): Promise<void> {
    if (this.connectionState !== "disconnected") await this.disconnect();
    this.url = validatedUrl(url);
    await this.connect();
  }

  public async connect(): Promise<void> {
    if (this.connectionState === "connected") return;
    this.url = validatedUrl(this.url);
    this.connectionState = "connecting";
    this.factory ??= await loadDefaultFactory();
    const ros = this.factory.createRos();
    this.ros = ros;
    await new Promise<void>((resolve, reject) => {
      const onConnection = () => resolve();
      const onError = (error?: unknown) =>
        reject(error instanceof Error ? error : new Error("ROS bridge connection failed"));
      this.connectionListener = onConnection;
      this.errorListener = onError;
      ros.on("connection", onConnection);
      ros.on("error", onError);
      ros.connect(this.url);
    }).catch((error) => {
      this.connectionState = "disconnected";
      throw error;
    });
    this.connectionState = "connected";
    this.closeListener = () => {
      this.connectionState = "disconnected";
      this.clearWatchdogs();
    };
    ros.on("close", this.closeListener);
    this.createTopics();
  }

  public async disconnect(): Promise<void> {
    if (!this.ros) {
      this.connectionState = "disconnected";
      return;
    }
    if (this.connectionState === "connected") await this.stopAll("ROS bridge disconnect");
    this.clearWatchdogs();
    for (const topics of this.topics.values()) {
      topics.odom.unsubscribe(topics.odomListener);
      topics.battery.unsubscribe(topics.batteryListener);
    }
    this.topics.clear();
    if (this.connectionListener) this.ros.off("connection", this.connectionListener);
    if (this.errorListener) this.ros.off("error", this.errorListener);
    if (this.closeListener) this.ros.off("close", this.closeListener);
    this.ros.close();
    this.ros = null;
    this.estop = null;
    this.connectionState = "disconnected";
  }

  public async commandManual(command: ManualRobotCommand): Promise<void> {
    const keys = Object.keys(command).sort();
    if (
      keys.length !== COMMAND_KEYS.length ||
      !COMMAND_KEYS.every((key, index) => key === keys[index])
    ) {
      throw new FirebreakError("INVALID_TOOL_INPUT", "Manual robot command has an invalid shape.");
    }
    if (!isRobotId(command.robotId)) {
      throw new FirebreakError("INVALID_TOOL_INPUT", "Robot is not allowlisted for Firebreak.");
    }
    this.assertConnected();
    const topic = this.topics.get(command.robotId)!.cmdVel;
    topic.publish(
      this.factory!.createMessage({
        linear: { x: clamp(command.throttle, -1, 1) * 1.2, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: clamp(command.turn, -1, 1) * 1.8 },
      }),
    );
    const existing = this.watchdogs.get(command.robotId);
    if (existing !== undefined) window.clearTimeout(existing);
    this.watchdogs.set(
      command.robotId,
      window.setTimeout(() => {
        if (this.connectionState === "connected") {
          topic.publish(this.factory!.createMessage(zeroTwist()));
        }
        this.watchdogs.delete(command.robotId);
      }, this.commandTimeoutMs),
    );
  }

  public async executeRoute(
    route: MissionRoute,
    options: {
      signal: AbortSignal;
      onProgress: (event: MissionProgressEvent) => void;
    },
  ): Promise<void> {
    if (!isRobotId(route.robotId)) {
      throw new FirebreakError("INVALID_TOOL_INPUT", "Route robot is not allowlisted.");
    }
    this.assertConnected();
    const goalTopic = this.topics.get(route.robotId)!.goalPose;
    for (let index = 1; index < route.waypoints.length; index += 1) {
      if (options.signal.aborted) throw options.signal.reason;
      const previous = route.waypoints[index - 1]!;
      const waypoint = route.waypoints[index]!;
      const timestamp = this.now();
      goalTopic.publish(
        this.factory!.createMessage({
          header: {
            stamp: {
              sec: Math.floor(timestamp / 1_000),
              nanosec: (timestamp % 1_000) * 1_000_000,
            },
            frame_id: "map",
          },
          pose: {
            position: { ...waypoint.position },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        }),
      );
      await this.wait(waypoint.atMs - previous.atMs, options.signal);
      if (options.signal.aborted) throw options.signal.reason;
      const progress = index / (route.waypoints.length - 1);
      options.onProgress({
        robotId: route.robotId,
        progress,
        status:
          index === route.waypoints.length - 1
            ? "complete"
            : waypoint.action
              ? "acting"
              : "enroute",
        message: waypoint.action
          ? `${route.robotId}: ${waypoint.action}`
          : `${route.robotId} navigating approved ROS goal`,
      });
    }
  }

  public async stopAll(reason: string): Promise<void> {
    void reason;
    if (this.connectionState !== "connected" || !this.factory) return;
    this.clearWatchdogs();
    for (const robotId of ROBOT_IDS) {
      this.topics.get(robotId)?.cmdVel.publish(this.factory.createMessage(zeroTwist()));
    }
    this.estop?.publish(this.factory.createMessage({ data: true }));
  }

  public getTelemetry(robotId: RobotId): { odom?: unknown; battery?: unknown } {
    return { ...(this.telemetry.get(robotId) ?? {}) };
  }

  private createTopics(): void {
    const factory = this.factory!;
    const ros = this.ros!;
    for (const robotId of ROBOT_IDS) {
      const names = ROS_TOPIC_MAP[robotId];
      const odom = factory.createTopic(ros, {
        name: names.odom,
        messageType: "nav_msgs/msg/Odometry",
      });
      const battery = factory.createTopic(ros, {
        name: names.battery,
        messageType: "sensor_msgs/msg/BatteryState",
      });
      const odomListener = (message: unknown) => {
        this.telemetry.set(robotId, { ...this.telemetry.get(robotId), odom: message });
      };
      const batteryListener = (message: unknown) => {
        this.telemetry.set(robotId, { ...this.telemetry.get(robotId), battery: message });
      };
      odom.subscribe(odomListener);
      battery.subscribe(batteryListener);
      this.topics.set(robotId, {
        cmdVel: factory.createTopic(ros, {
          name: names.cmdVel,
          messageType: "geometry_msgs/msg/Twist",
        }),
        goalPose: factory.createTopic(ros, {
          name: names.goalPose,
          messageType: "geometry_msgs/msg/PoseStamped",
        }),
        odom,
        battery,
        odomListener,
        batteryListener,
      });
    }
    this.estop = factory.createTopic(ros, {
      name: ESTOP_TOPIC,
      messageType: "std_msgs/msg/Bool",
    });
  }

  private clearWatchdogs(): void {
    for (const timeout of this.watchdogs.values()) window.clearTimeout(timeout);
    this.watchdogs.clear();
  }

  private assertConnected(): void {
    if (this.connectionState !== "connected" || !this.factory) {
      throw new FirebreakError("DRIVER_DISCONNECTED", "ROS 2 bridge is not connected.");
    }
  }
}
