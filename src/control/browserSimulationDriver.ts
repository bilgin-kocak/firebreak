import type {
  FirebreakSnapshot,
  PolygonPoint,
  RobotId,
  Vector3Value,
} from "../domain/firebreakTypes";
import type {
  BrowserDriverOptions,
  ManualRobotCommand,
  RobotDriver,
} from "./controlTypes";

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
): boolean {
  return (
    point.x >= WORLD_BOUNDS.minX &&
    point.x <= WORLD_BOUNDS.maxX &&
    point.z >= WORLD_BOUNDS.minZ &&
    point.z <= WORLD_BOUNDS.maxZ &&
    !isPointInPolygon(point, collapseZone)
  );
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
  if (
    robot.role === "scout" &&
    distance(robot.position, snapshot.hazards.fire.position) <= 5
  ) {
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

  return false;
}

export class BrowserSimulationDriver implements RobotDriver {
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

    if (
      throttle !== 0 &&
      !isPointAllowed(nextPosition, snapshot.hazards.collapseZone)
    ) {
      snapshot.robots[command.robotId] = { ...robot, status: "stopped" };
      snapshot.revision += 1;
      appendEvent(
        snapshot,
        "warning",
        `${command.robotId} stopped before the collapse zone.`,
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
    snapshot.selectedRobotId = command.robotId;
    snapshot.elapsedMs += command.deltaMs;
    snapshot.revision += 1;
    this.options.commitSnapshot(snapshot);
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
