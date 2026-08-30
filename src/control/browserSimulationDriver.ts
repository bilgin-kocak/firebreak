import type {
  FirebreakSnapshot,
  MissionAction,
  MissionProgressEvent,
  MissionRoute,
  PolygonPoint,
  RobotId,
  Vector3Value,
} from "../domain/firebreakTypes";
import { WAREHOUSE_OBSTACLES } from "../domain/firebreakSeed";
import type { BrowserDriverOptions, ManualRobotCommand, MissionRobotDriver } from "./controlTypes";

const WORLD_BOUNDS = { minX: -13.5, maxX: 13.5, minZ: -9.5, maxZ: 9.5 };
const GROUND_SPEED = 2.4;
const DRONE_SPEED = 3.2;
const TURN_SPEED = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function distance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function isPointInPolygon(
  point: Pick<Vector3Value, "x" | "z">,
  polygon: PolygonPoint[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    const intersects =
      currentPoint.z > point.z !== previousPoint.z > point.z &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.z - currentPoint.z)) /
          (previousPoint.z - currentPoint.z) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointAllowed(
  point: Pick<Vector3Value, "x" | "z">,
  collapseZone: PolygonPoint[],
  obstacles: PolygonPoint[][] = WAREHOUSE_OBSTACLES,
): boolean {
  return (
    point.x >= WORLD_BOUNDS.minX &&
    point.x <= WORLD_BOUNDS.maxX &&
    point.z >= WORLD_BOUNDS.minZ &&
    point.z <= WORLD_BOUNDS.maxZ &&
    !isPointInPolygon(point, collapseZone) &&
    obstacles.every((obstacle) => !isPointInPolygon(point, obstacle))
  );
}

export function isSegmentAllowed(
  start: Pick<Vector3Value, "x" | "z">,
  end: Pick<Vector3Value, "x" | "z">,
  collapseZone: PolygonPoint[],
): boolean {
  const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
  const samples = Math.max(1, Math.ceil(segmentLength / 0.2));
  for (let sample = 1; sample <= samples; sample += 1) {
    const ratio = sample / samples;
    if (
      !isPointAllowed(
        {
          x: start.x + (end.x - start.x) * ratio,
          z: start.z + (end.z - start.z) * ratio,
        },
        collapseZone,
      )
    ) {
      return false;
    }
  }
  return true;
}

function updateObjective(
  snapshot: FirebreakSnapshot,
  objectiveId: FirebreakSnapshot["objectives"][number]["id"],
): void {
  snapshot.objectives = snapshot.objectives.map((objective) =>
    objective.id === objectiveId ? { ...objective, status: "complete" } : objective,
  );
}

function appendEvent(
  snapshot: FirebreakSnapshot,
  kind: FirebreakSnapshot["events"][number]["kind"],
  message: string,
): void {
  snapshot.events = [
    ...snapshot.events,
    {
      id: `${kind}-${snapshot.revision}-${snapshot.events.length}`,
      atMs: snapshot.elapsedMs,
      kind,
      message,
    },
  ].slice(-200);
}

function tryContextAction(snapshot: FirebreakSnapshot, robotId: RobotId): boolean {
  const robot = snapshot.robots[robotId];
  if (robot.role === "scout" && distance(robot.position, snapshot.hazards.fire.position) <= 5) {
    snapshot.hazards.scanned = true;
    updateObjective(snapshot, "scan-hazards");
    appendEvent(snapshot, "control", `${robotId} completed a thermal hazard scan.`);
    return true;
  }

  if (
    robot.role === "suppress" &&
    distance(robot.position, snapshot.hazards.fire.position) <= 2.75
  ) {
    snapshot.hazards.powerIsolated = true;
    snapshot.hazards.fire = {
      ...snapshot.hazards.fire,
      intensity: 0.12,
      contained: true,
    };
    updateObjective(snapshot, "contain-fire");
    appendEvent(snapshot, "control", `${robotId} contained Battery Bay B.`);
    return true;
  }

  if (robot.role === "rescue" || robot.role === "haul") {
    const assigned = Object.values(snapshot.workers).find(
      (worker) => worker.status === "rescuing" && worker.assignedRobot === robotId,
    );
    if (assigned && isPointInPolygon(robot.position, snapshot.safeZone)) {
      snapshot.workers[assigned.id] = {
        ...assigned,
        status: "safe",
        position: { x: robot.position.x, y: 0.9, z: robot.position.z },
      };
      if (Object.values(snapshot.workers).every((worker) => worker.status === "safe")) {
        updateObjective(snapshot, "rescue-workers");
      }
      appendEvent(snapshot, "control", `${robotId} delivered ${assigned.label} to the safe zone.`);
      return true;
    }

    const nearbyWorker = Object.values(snapshot.workers).find(
      (worker) => worker.status === "trapped" && distance(robot.position, worker.position) <= 2.25,
    );
    if (nearbyWorker) {
      snapshot.workers[nearbyWorker.id] = {
        ...nearbyWorker,
        status: "rescuing",
        assignedRobot: robotId,
      };
      appendEvent(snapshot, "control", `${robotId} secured ${nearbyWorker.label} for evacuation.`);
      return true;
    }
  }

  if (robot.role === "haul") {
    if (
      snapshot.hazards.container.status === "moving" &&
      isPointInPolygon(robot.position, snapshot.safeZone)
    ) {
      snapshot.hazards.container = {
        ...snapshot.hazards.container,
        position: { ...snapshot.hazards.container.targetPosition },
        status: "safe",
      };
      updateObjective(snapshot, "move-container");
      appendEvent(snapshot, "control", `${robotId} secured the hazardous container.`);
      return true;
    }
    if (
      snapshot.hazards.container.status === "exposed" &&
      distance(robot.position, snapshot.hazards.container.position) <= 2.25
    ) {
      snapshot.hazards.container = { ...snapshot.hazards.container, status: "moving" };
      appendEvent(snapshot, "control", `${robotId} attached the hazardous container.`);
      return true;
    }
  }

  return false;
}

function moveAttachedPayloads(
  snapshot: FirebreakSnapshot,
  robotId: RobotId,
  position: Vector3Value,
): void {
  for (const worker of Object.values(snapshot.workers)) {
    if (worker.status === "rescuing" && worker.assignedRobot === robotId) {
      snapshot.workers[worker.id] = {
        ...worker,
        position: { x: position.x, y: 0.9, z: position.z },
      };
    }
  }
  if (snapshot.robots[robotId].role === "haul" && snapshot.hazards.container.status === "moving") {
    snapshot.hazards.container = {
      ...snapshot.hazards.container,
      position: { x: position.x, y: 0.65, z: position.z },
    };
  }
}

function applyMissionAction(snapshot: FirebreakSnapshot, action: MissionAction | undefined): void {
  if (!action) return;
  if (action === "scan-hazards") {
    snapshot.hazards.scanned = true;
    updateObjective(snapshot, "scan-hazards");
  } else if (action === "rescue-worker-a") {
    snapshot.workers["WORKER-A"] = {
      ...snapshot.workers["WORKER-A"],
      status: "rescuing",
      assignedRobot: "MEDIC-2",
    };
  } else if (action === "deliver-worker-a") {
    snapshot.workers["WORKER-A"] = {
      ...snapshot.workers["WORKER-A"],
      status: "safe",
      assignedRobot: "MEDIC-2",
      position: { x: -12, y: 0.9, z: 6 },
    };
  } else if (action === "isolate-power") {
    snapshot.hazards.powerIsolated = true;
  } else if (action === "suppress-fire") {
    snapshot.hazards.fire = {
      ...snapshot.hazards.fire,
      intensity: 0.08,
      contained: true,
    };
    updateObjective(snapshot, "contain-fire");
  } else if (action === "rescue-worker-b") {
    snapshot.workers["WORKER-B"] = {
      ...snapshot.workers["WORKER-B"],
      status: "rescuing",
      assignedRobot: "HAUL-4",
    };
  } else if (action === "pickup-container") {
    snapshot.hazards.container = {
      ...snapshot.hazards.container,
      status: "moving",
    };
  } else if (action === "deliver-worker-b-and-container") {
    snapshot.workers["WORKER-B"] = {
      ...snapshot.workers["WORKER-B"],
      status: "safe",
      assignedRobot: "HAUL-4",
      position: { x: -9, y: 0.9, z: 8 },
    };
    snapshot.hazards.container = {
      ...snapshot.hazards.container,
      position: { ...snapshot.hazards.container.targetPosition },
      status: "safe",
    };
    updateObjective(snapshot, "rescue-workers");
    updateObjective(snapshot, "move-container");
  }
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const handle = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(handle);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class BrowserSimulationDriver implements MissionRobotDriver {
  readonly mode = "browser" as const;
  private connected = true;

  constructor(private readonly options: BrowserDriverOptions) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.stopAll("Browser simulation disconnected");
    this.connected = false;
  }

  async commandManual(command: ManualRobotCommand): Promise<void> {
    if (!this.connected) throw new Error("Browser simulation is disconnected");
    const snapshot = structuredClone(this.options.readSnapshot());
    const robot = snapshot.robots[command.robotId];
    const seconds = clamp(command.deltaMs, 0, 1000) / 1000;
    const throttle = clamp(command.throttle, -1, 1);
    const turn = clamp(command.turn, -1, 1);
    const nextHeading = robot.heading + turn * TURN_SPEED * seconds;
    const speed = robot.role === "scout" ? DRONE_SPEED : GROUND_SPEED;
    const nextPosition = {
      ...robot.position,
      x: robot.position.x + Math.sin(nextHeading) * throttle * speed * seconds,
      z: robot.position.z + Math.cos(nextHeading) * throttle * speed * seconds,
    };

    const keepsRobotSeparation = Object.values(snapshot.robots).every(
      (other) => other.id === command.robotId || distance(nextPosition, other.position) >= 1.25,
    );
    if (
      throttle !== 0 &&
      (!isSegmentAllowed(robot.position, nextPosition, snapshot.hazards.collapseZone) ||
        !keepsRobotSeparation)
    ) {
      snapshot.robots[command.robotId] = { ...robot, status: "stopped" };
      snapshot.revision += 1;
      appendEvent(
        snapshot,
        "warning",
        `${command.robotId} stopped before the collapse zone, warehouse obstacle, or another robot.`,
      );
      this.options.commitSnapshot(snapshot);
      return;
    }

    const moved = throttle !== 0 || turn !== 0;
    const acted = command.action && tryContextAction(snapshot, command.robotId);
    if (!moved && !acted) return;

    snapshot.robots[command.robotId] = {
      ...snapshot.robots[command.robotId],
      position: moved ? nextPosition : robot.position,
      heading: nextHeading,
      battery: clamp(
        robot.battery - (Math.abs(throttle) * 0.12 + Math.abs(turn) * 0.04) * seconds,
        0,
        100,
      ),
      status: moved ? "manual" : snapshot.robots[command.robotId].status,
    };
    if (moved) moveAttachedPayloads(snapshot, command.robotId, nextPosition);
    snapshot.selectedRobotId = command.robotId;
    snapshot.revision += 1;
    this.options.commitSnapshot(snapshot);
  }

  async executeRoute(
    route: MissionRoute,
    options: {
      signal: AbortSignal;
      onProgress: (event: MissionProgressEvent) => void;
    },
  ): Promise<void> {
    if (!this.connected) throw new Error("Browser simulation is disconnected");
    const wait = this.options.wait ?? defaultWait;
    const playbackRate = Math.max(1, this.options.playbackRate ?? 3.5);
    const initialBattery = this.options.readSnapshot().robots[route.robotId].battery;

    for (let index = 1; index < route.waypoints.length; index += 1) {
      if (options.signal.aborted) throw options.signal.reason;
      const previous = route.waypoints[index - 1]!;
      const waypoint = route.waypoints[index]!;
      const simulatedSegmentMs = waypoint.atMs - previous.atMs;
      const playbackSegmentMs = simulatedSegmentMs / playbackRate;
      const steps = Math.max(1, Math.min(2, Math.ceil(playbackSegmentMs / 120)));
      for (let step = 1; step <= steps; step += 1) {
        await wait(playbackSegmentMs / steps, options.signal);
        if (options.signal.aborted) throw options.signal.reason;
        const ratio = step / steps;
        const atMs = previous.atMs + simulatedSegmentMs * ratio;
        const progress = Math.max(0, Math.min(1, atMs / route.durationMs));
        const finalStep = step === steps;
        const snapshot = structuredClone(this.options.readSnapshot());
        const position = {
          x: previous.position.x + (waypoint.position.x - previous.position.x) * ratio,
          y: previous.position.y + (waypoint.position.y - previous.position.y) * ratio,
          z: previous.position.z + (waypoint.position.z - previous.position.z) * ratio,
        };
        if (finalStep) applyMissionAction(snapshot, waypoint.action);
        const status =
          finalStep && index === route.waypoints.length - 1
            ? "complete"
            : finalStep && waypoint.action
              ? "acting"
              : "enroute";
        snapshot.robots[route.robotId] = {
          ...snapshot.robots[route.robotId],
          position,
          battery: initialBattery + (route.predictedBatteryEnd - initialBattery) * progress,
          routeProgress: progress,
          status,
        };
        moveAttachedPayloads(snapshot, route.robotId, position);
        snapshot.revision += 1;
        this.options.commitSnapshot(snapshot);
        options.onProgress({
          robotId: route.robotId,
          progress,
          status,
          message:
            finalStep && waypoint.action
              ? `${route.robotId}: ${waypoint.action}`
              : `${route.robotId} following approved route`,
        });
      }
    }
  }

  async stopAll(reason: string): Promise<void> {
    const snapshot = structuredClone(this.options.readSnapshot());
    for (const robotId of Object.keys(snapshot.robots) as RobotId[]) {
      snapshot.robots[robotId] = {
        ...snapshot.robots[robotId],
        status: "stopped",
      };
    }
    snapshot.revision += 1;
    appendEvent(snapshot, "warning", `All robots stopped: ${reason}`);
    this.options.commitSnapshot(snapshot);
  }
}
