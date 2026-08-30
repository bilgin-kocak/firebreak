import { isPointInPolygon } from "../control/browserSimulationDriver";
import { ROBOT_IDS } from "./firebreakSeed";
import type {
  FirebreakSnapshot,
  MissionRoute,
  MissionSimulation,
  PolygonPoint,
  RobotId,
  Vector3Value,
} from "./firebreakTypes";

function waypoint(
  x: number,
  y: number,
  z: number,
  atMs: number,
  action?: MissionRoute["waypoints"][number]["action"],
): MissionRoute["waypoints"][number] {
  return {
    position: { x, y, z },
    atMs,
    ...(action ? { action } : {}),
  };
}

function createRoutes(snapshot: FirebreakSnapshot): Record<RobotId, MissionRoute> {
  const starts = snapshot.robots;
  return {
    "SCOUT-1": {
      robotId: "SCOUT-1",
      durationMs: 20_000,
      predictedBatteryEnd: 74,
      waypoints: [
        { position: { ...starts["SCOUT-1"].position }, atMs: 0 },
        waypoint(-9, 2.8, -3, 4_000),
        waypoint(-7, 3.2, 2, 8_000),
        waypoint(-1, 3.4, 6, 12_000),
        waypoint(4, 3.1, 6, 16_000),
        waypoint(7, 3, 5, 20_000, "scan-hazards"),
      ],
    },
    "MEDIC-2": {
      robotId: "MEDIC-2",
      durationMs: 34_000,
      predictedBatteryEnd: 63,
      waypoints: [
        { position: { ...starts["MEDIC-2"].position }, atMs: 0 },
        waypoint(-8, 0.45, -5, 4_000),
        waypoint(-8, 0.45, 0, 9_000),
        waypoint(-3, 0.45, 1, 14_000),
        waypoint(3, 0.45, 1, 19_000),
        waypoint(10, 0.45, -0.5, 24_000, "rescue-worker-a"),
        waypoint(-12, 0.45, 6, 34_000, "deliver-worker-a"),
      ],
    },
    "SUPPRESS-3": {
      robotId: "SUPPRESS-3",
      durationMs: 18_000,
      predictedBatteryEnd: 68,
      waypoints: [
        { position: { ...starts["SUPPRESS-3"].position }, atMs: 0 },
        waypoint(-5, 0.52, -6.5, 4_000),
        waypoint(-6, 0.52, -1, 8_000),
        waypoint(-2, 0.52, 3, 12_000),
        waypoint(4.5, 0.52, 3, 17_000, "isolate-power"),
        waypoint(4.5, 0.52, 3, 18_000, "suppress-fire"),
      ],
    },
    "HAUL-4": {
      robotId: "HAUL-4",
      durationMs: 35_000,
      predictedBatteryEnd: 57,
      waypoints: [
        { position: { ...starts["HAUL-4"].position }, atMs: 0 },
        waypoint(-2, 0.48, -6.5, 5_000),
        waypoint(1, 0.48, -0.5, 10_000),
        waypoint(3, 0.48, 6, 15_000),
        waypoint(10.5, 0.48, 6, 20_000, "rescue-worker-b"),
        waypoint(8.5, 0.48, 7, 24_000, "pickup-container"),
        waypoint(-10, 0.48, 7, 35_000, "deliver-worker-b-and-container"),
      ],
    },
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function missionStateHash(snapshot: FirebreakSnapshot): string {
  return fnv1a(
    JSON.stringify({
      incidentId: snapshot.incidentId,
      revision: snapshot.revision,
      phase: snapshot.phase,
      robots: ROBOT_IDS.map((id) => ({
        id,
        position: snapshot.robots[id].position,
        battery: snapshot.robots[id].battery,
        health: snapshot.robots[id].health,
      })),
      workers: snapshot.workers,
      hazards: snapshot.hazards,
    }),
  );
}

function interpolate(route: MissionRoute, atMs: number): Vector3Value {
  const first = route.waypoints[0]!;
  const last = route.waypoints.at(-1)!;
  if (atMs <= first.atMs) return first.position;
  if (atMs >= last.atMs) return last.position;

  for (let index = 1; index < route.waypoints.length; index += 1) {
    const next = route.waypoints[index]!;
    const previous = route.waypoints[index - 1]!;
    if (atMs <= next.atMs) {
      const ratio = (atMs - previous.atMs) / (next.atMs - previous.atMs);
      return {
        x: previous.position.x + (next.position.x - previous.position.x) * ratio,
        y: previous.position.y + (next.position.y - previous.position.y) * ratio,
        z: previous.position.z + (next.position.z - previous.position.z) * ratio,
      };
    }
  }
  return last.position;
}

export function routeIntersectsPolygon(
  route: MissionRoute,
  polygon: PolygonPoint[],
): boolean {
  for (let index = 1; index < route.waypoints.length; index += 1) {
    const start = route.waypoints[index - 1]!;
    const end = route.waypoints[index]!;
    const distance = Math.hypot(
      end.position.x - start.position.x,
      end.position.z - start.position.z,
    );
    const samples = Math.max(2, Math.ceil(distance / 0.2));
    for (let sample = 0; sample <= samples; sample += 1) {
      const ratio = sample / samples;
      if (
        isPointInPolygon(
          {
            x: start.position.x + (end.position.x - start.position.x) * ratio,
            z: start.position.z + (end.position.z - start.position.z) * ratio,
          },
          polygon,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function minimumSynchronizedSeparation(
  routes: Record<RobotId, MissionRoute>,
): number {
  const durationMs = Math.max(...ROBOT_IDS.map((id) => routes[id].durationMs));
  let minimum = Number.POSITIVE_INFINITY;
  for (let atMs = 0; atMs <= durationMs; atMs += 250) {
    for (let left = 0; left < ROBOT_IDS.length; left += 1) {
      for (let right = left + 1; right < ROBOT_IDS.length; right += 1) {
        const a = interpolate(routes[ROBOT_IDS[left]!], atMs);
        const b = interpolate(routes[ROBOT_IDS[right]!], atMs);
        minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
  }
  return minimum;
}

export function simulateCoordinatedMission(
  snapshot: FirebreakSnapshot,
): MissionSimulation {
  const routes = createRoutes(snapshot);
  const stateHash = missionStateHash(snapshot);
  const geofenceFailure = Object.values(routes).some((route) =>
    routeIntersectsPolygon(route, snapshot.hazards.collapseZone),
  );
  const robotConflict = minimumSynchronizedSeparation(routes) < 1.25;
  const feasible = !geofenceFailure && !robotConflict;

  return {
    id: `SIM-${snapshot.incidentId}-R${snapshot.revision}-${stateHash}`,
    incidentId: snapshot.incidentId,
    incidentRevision: snapshot.revision,
    stateHash,
    strategy: "coordinated",
    feasible,
    reasonCode: geofenceFailure
      ? "NO_SAFE_ROUTE"
      : robotConflict
        ? "ROBOT_CONFLICT"
        : "READY",
    durationMs: Math.max(...Object.values(routes).map((route) => route.durationMs)),
    routes,
    predictions: {
      rescuedWorkers: feasible ? 2 : 0,
      fireContained: feasible,
      containerSafe: feasible,
      safetyViolations: feasible ? 0 : 1,
    },
  };
}
