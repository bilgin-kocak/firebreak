import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFirebreakSeed } from "../domain/firebreakSeed";
import { simulateCoordinatedMission } from "../domain/missionSimulator";
import {
  Ros2Driver,
  ROS_TOPIC_MAP,
  type RosConnectionLike,
  type RoslibFactory,
  type RosTopicLike,
} from "./ros2Driver";

class FakeRos implements RosConnectionLike {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  connectedUrl = "";
  closed = false;
  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }
  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }
  connect(url: string) {
    this.connectedUrl = url;
    queueMicrotask(() => this.listeners.get("connection")?.forEach((listener) => listener()));
  }
  close() {
    this.closed = true;
  }
  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

class FakeTopic implements RosTopicLike {
  publications: unknown[] = [];
  subscribers = new Set<(message: unknown) => void>();
  constructor(
    readonly name: string,
    readonly messageType: string,
    private readonly onPublish?: (topic: FakeTopic, message: unknown) => void,
  ) {}
  publish(message: unknown) {
    this.publications.push(structuredClone(message));
    this.onPublish?.(this, message);
  }
  subscribe(listener: (message: unknown) => void) {
    this.subscribers.add(listener);
  }
  unsubscribe(listener?: (message: unknown) => void) {
    if (listener) this.subscribers.delete(listener);
    else this.subscribers.clear();
  }
}

function setup(
  setupOptions: {
    echoGoalTelemetry?: boolean;
    echoBatteryTelemetry?: boolean;
    echoActionResult?: boolean;
    disconnectDuringWait?: boolean;
  } = {},
) {
  const ros = new FakeRos();
  const topics: FakeTopic[] = [];
  const factory: RoslibFactory = {
    createRos: () => ros,
    createTopic: (_ros, options) => {
      const topic = new FakeTopic(options.name, options.messageType, (publishedTopic, message) => {
        const robot = Object.values(ROS_TOPIC_MAP).find(
          (candidate) =>
            candidate.goalPose === publishedTopic.name ||
            candidate.actionCommand === publishedTopic.name,
        );
        if (!robot) return;
        if (setupOptions.echoGoalTelemetry && publishedTopic.name === robot.goalPose) {
          const position = (message as { pose: { position: { x: number; y: number; z: number } } })
            .pose.position;
          topics
            .find((candidate) => candidate.name === robot.odom)
            ?.subscribers.forEach((listener) =>
              listener({ pose: { pose: { position: { ...position } } } }),
            );
          if (setupOptions.echoBatteryTelemetry !== false) {
            topics
              .find((candidate) => candidate.name === robot.battery)
              ?.subscribers.forEach((listener) => listener({ percentage: 0.75 }));
          }
        }
        const echoAction = setupOptions.echoActionResult ?? setupOptions.echoGoalTelemetry;
        if (echoAction && publishedTopic.name === robot.actionCommand) {
          const action = (message as { data: string }).data;
          topics
            .find((candidate) => candidate.name === robot.actionResult)
            ?.subscribers.forEach((listener) => listener({ data: `${action}:succeeded` }));
        }
      });
      topics.push(topic);
      return topic;
    },
    createMessage: (value) => value,
  };
  const driver = new Ros2Driver({
    url: "ws://127.0.0.1:9090",
    rosFactory: factory,
    commandTimeoutMs: 250,
    now: () => 1_700_000_000_250,
    wait: async () => {
      if (setupOptions.disconnectDuringWait) ros.emit("close");
    },
  });
  const topic = (name: string) => topics.find((candidate) => candidate.name === name)!;
  return { ros, topics, driver, topic };
}

describe("allowlisted ROS 2 driver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects only to local ws or secure wss endpoints and creates exact allowlisted topics", async () => {
    for (const url of [
      "javascript:alert(1)",
      "ws://robot.example.com:9090",
      "http://localhost:9090",
    ]) {
      const { driver } = setup();
      await expect(driver.connectTo(url)).rejects.toThrow(/ROS bridge URL/i);
    }

    const { driver, ros, topics } = setup();
    await driver.connect();
    expect(driver.connectionState).toBe("connected");
    expect(ros.connectedUrl).toBe("ws://127.0.0.1:9090/");
    expect(topics).toHaveLength(25);
    expect(topics.map(({ name, messageType }) => ({ name, messageType }))).toEqual(
      expect.arrayContaining([
        {
          name: ROS_TOPIC_MAP["SCOUT-1"].cmdVel,
          messageType: "geometry_msgs/msg/Twist",
        },
        {
          name: ROS_TOPIC_MAP["HAUL-4"].goalPose,
          messageType: "geometry_msgs/msg/PoseStamped",
        },
        { name: ROS_TOPIC_MAP["MEDIC-2"].odom, messageType: "nav_msgs/msg/Odometry" },
        {
          name: ROS_TOPIC_MAP["SUPPRESS-3"].battery,
          messageType: "sensor_msgs/msg/BatteryState",
        },
        {
          name: ROS_TOPIC_MAP["HAUL-4"].actionCommand,
          messageType: "std_msgs/msg/String",
        },
        {
          name: ROS_TOPIC_MAP["HAUL-4"].actionResult,
          messageType: "std_msgs/msg/String",
        },
        { name: "/firebreak/fleet/emergency_stop", messageType: "std_msgs/msg/Bool" },
      ]),
    );
  });

  it("clamps manual velocity and publishes zero velocity after the watchdog timeout", async () => {
    const { driver, topic } = setup({ echoGoalTelemetry: true });
    await driver.connect();

    await driver.commandManual({
      robotId: "MEDIC-2",
      throttle: 9,
      turn: -4,
      action: true,
      deltaMs: 16,
    });
    const cmd = topic(ROS_TOPIC_MAP["MEDIC-2"].cmdVel);
    expect(cmd.publications[0]).toEqual({
      linear: { x: 1.2, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -1.8 },
    });
    expect(topic(ROS_TOPIC_MAP["MEDIC-2"].actionCommand).publications).toEqual([
      { data: "manual-context-action" },
    ]);

    await vi.advanceTimersByTimeAsync(250);
    expect(cmd.publications.at(-1)).toEqual({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  });

  it("rejects unknown robots and expanded command objects before publishing", async () => {
    const { driver, topics } = setup();
    await driver.connect();
    const before = topics.flatMap((topic) => topic.publications).length;

    await expect(
      driver.commandManual({
        robotId: "INJECTED-5",
        throttle: 1,
        turn: 0,
        action: false,
        deltaMs: 16,
      } as never),
    ).rejects.toThrow(/allowlisted/i);
    await expect(
      driver.commandManual({
        robotId: "SCOUT-1",
        throttle: 1,
        turn: 0,
        action: false,
        deltaMs: 16,
        topic: "/cmd_vel",
      } as never),
    ).rejects.toThrow(/shape/i);
    expect(topics.flatMap((topic) => topic.publications)).toHaveLength(before);
  });

  it("publishes bounded map-frame navigation goals and progress for an approved route", async () => {
    const { driver, topic } = setup({ echoGoalTelemetry: true });
    await driver.connect();
    const route = simulateCoordinatedMission(createFirebreakSeed()).routes["HAUL-4"];
    const progress = vi.fn();
    await driver.executeRoute(route, {
      signal: new AbortController().signal,
      onProgress: progress,
    });

    const goals = topic(ROS_TOPIC_MAP["HAUL-4"].goalPose).publications as Array<{
      header: { frame_id: string };
      pose: { position: { x: number; z: number }; orientation: { w: number } };
    }>;
    expect(goals).toHaveLength(route.waypoints.length - 1);
    expect(goals[0]).toMatchObject({
      header: { frame_id: "map" },
      pose: { position: { x: route.waypoints[1]!.position.x, z: route.waypoints[1]!.position.z } },
    });
    expect(goals.at(-1)?.pose.orientation.w).toBe(1);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 1 }));
    expect(topic(ROS_TOPIC_MAP["HAUL-4"].actionCommand).publications).toEqual([
      { data: "rescue-worker-b" },
      { data: "pickup-container" },
      { data: "deliver-worker-b-and-container" },
    ]);
  });

  it("refuses to claim success without positive feedback for fixed mission actions", async () => {
    const { driver } = setup({ echoGoalTelemetry: true, echoActionResult: false });
    await driver.connect();
    const route = simulateCoordinatedMission(createFirebreakSeed()).routes["SCOUT-1"];

    await expect(
      driver.executeRoute(route, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/did not confirm mission action/i);
  });

  it("fails closed when odometry and battery do not confirm arrival", async () => {
    const { driver } = setup();
    await driver.connect();
    const route = simulateCoordinatedMission(createFirebreakSeed()).routes["HAUL-4"];

    await expect(
      driver.executeRoute(route, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/telemetry|arrival/i);
  });

  it("requires fresh battery telemetry for every approved waypoint", async () => {
    const { driver } = setup({ echoGoalTelemetry: true, echoBatteryTelemetry: false });
    await driver.connect();
    const route = simulateCoordinatedMission(createFirebreakSeed()).routes["SCOUT-1"];

    await expect(
      driver.executeRoute(route, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(/telemetry|arrival/i);
  });

  it("does not report route success after rosbridge disconnects mid-run", async () => {
    const { driver } = setup({ echoGoalTelemetry: true, disconnectDuringWait: true });
    await driver.connect();
    const route = simulateCoordinatedMission(createFirebreakSeed()).routes["MEDIC-2"];

    await expect(
      driver.executeRoute(route, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DISCONNECTED" });
  });

  it("stops every robot, unsubscribes telemetry, and closes the bridge", async () => {
    const { driver, ros, topics, topic } = setup();
    await driver.connect();
    expect(topics.filter((candidate) => candidate.subscribers.size > 0)).toHaveLength(12);

    await driver.stopAll("Operator stop");
    for (const map of Object.values(ROS_TOPIC_MAP)) {
      expect(topic(map.cmdVel).publications.at(-1)).toMatchObject({ linear: { x: 0 } });
    }
    expect(topic("/firebreak/fleet/emergency_stop").publications.at(-1)).toEqual({ data: true });

    await driver.disconnect();
    expect(topics.every((candidate) => candidate.subscribers.size === 0)).toBe(true);
    expect(ros.closed).toBe(true);
    expect(driver.connectionState).toBe("disconnected");
  });
});
