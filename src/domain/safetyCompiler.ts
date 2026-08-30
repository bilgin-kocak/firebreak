import { ROBOT_IDS } from "./firebreakSeed";
import type {
  FirebreakSnapshot,
  MissionAction,
  MissionProposal,
  MissionSimulation,
  RobotRole,
  SafetyCheck,
  SafetyCheckReport,
} from "./firebreakTypes";
import {
  minimumSynchronizedSeparation,
  missionStateHash,
  routeIntersectsPolygon,
} from "./missionSimulator";

const ROLE_ACTIONS: Record<RobotRole, readonly MissionAction[]> = {
  scout: ["scan-hazards"],
  rescue: ["rescue-worker-a", "deliver-worker-a"],
  suppress: ["isolate-power", "suppress-fire"],
  haul: [
    "rescue-worker-b",
    "pickup-container",
    "deliver-worker-b-and-container",
  ],
};

function check(
  id: SafetyCheck["id"],
  label: string,
  passed: boolean,
  detail: string,
): SafetyCheck {
  return { id, label, status: passed ? "passed" : "failed", detail };
}

export function validateSafetyEnvelope(
  snapshot: FirebreakSnapshot,
  simulation: MissionSimulation,
): SafetyCheckReport {
  const routeIds = Object.keys(simulation.routes);
  const exactRobots =
    routeIds.length === ROBOT_IDS.length &&
    ROBOT_IDS.every((robotId) => routeIds.includes(robotId));
  const routesComplete = ROBOT_IDS.every((robotId) => {
    const route = simulation.routes[robotId];
    return (
      route.robotId === robotId &&
      route.waypoints.length >= 2 &&
      route.waypoints[0]?.atMs === 0 &&
      route.waypoints.at(-1)?.atMs === route.durationMs
    );
  });
  const routesOutsideCollapse = ROBOT_IDS.every(
    (robotId) =>
      !routeIntersectsPolygon(
        simulation.routes[robotId],
        snapshot.hazards.collapseZone,
      ),
  );
  const rolesValid = ROBOT_IDS.every((robotId) => {
    const allowed = ROLE_ACTIONS[snapshot.robots[robotId].role];
    return simulation.routes[robotId].waypoints.every(
      (point) => !point.action || allowed.includes(point.action),
    );
  });
  const checks: SafetyCheck[] = [
    check(
      "revision",
      "Current emergency revision",
      simulation.incidentRevision === snapshot.revision,
      "The plan must match the exact visible emergency revision.",
    ),
    check(
      "state",
      "Current world fingerprint",
      simulation.stateHash === missionStateHash(snapshot),
      "Robot, worker, and hazard state must be unchanged since simulation.",
    ),
    check(
      "robots",
      "Four allowlisted robots",
      exactRobots,
      "Only the four visible Firebreak robots may receive commands.",
    ),
    check(
      "routes",
      "Complete route definitions",
      simulation.feasible && routesComplete,
      "Every robot needs a time-bounded route from its current position.",
    ),
    check(
      "geofence",
      "Collapse zone excluded",
      routesOutsideCollapse,
      "No waypoint or route segment may enter the forbidden polygon.",
    ),
    check(
      "separation",
      "Robot separation",
      minimumSynchronizedSeparation(simulation.routes) >= 1.25,
      "Synchronized routes maintain at least 1.25 metres of separation.",
    ),
    check(
      "battery",
      "Battery reserve",
      ROBOT_IDS.every(
        (robotId) => simulation.routes[robotId].predictedBatteryEnd >= 20,
      ),
      "Every robot must finish with at least 20% predicted battery.",
    ),
    check(
      "duration",
      "Execution time",
      simulation.durationMs <= 45_000,
      "The one-use mission must finish within 45 seconds.",
    ),
    check(
      "roles",
      "Role-specific actions",
      rolesValid,
      "Each contextual action must be assigned to the correct robot role.",
    ),
    check(
      "rollback",
      "Browser recovery snapshot",
      snapshot.receipt === null && snapshot.phase !== "executing",
      "A clean pre-run snapshot is available before browser movement starts.",
    ),
    check(
      "budget",
      "One-use mission budget",
      simulation.strategy === "coordinated",
      "Authority permits one coordinated mission and no arbitrary operations.",
    ),
  ];

  return {
    simulationId: simulation.id,
    incidentRevision: snapshot.revision,
    stateHash: missionStateHash(snapshot),
    passed: checks.every((item) => item.status === "passed"),
    checks,
  };
}

export function compileMissionProposal(
  snapshot: FirebreakSnapshot,
  simulation: MissionSimulation,
  report: SafetyCheckReport,
  now: number,
): MissionProposal {
  if (
    !simulation.feasible ||
    !report.passed ||
    report.simulationId !== simulation.id ||
    simulation.incidentRevision !== snapshot.revision ||
    report.stateHash !== missionStateHash(snapshot)
  ) {
    throw new Error("Mission proposal requires a current passing safety report");
  }

  return {
    id: `MISSION-${snapshot.incidentId}-R${snapshot.revision}-${simulation.stateHash}`,
    incidentId: snapshot.incidentId,
    incidentRevision: snapshot.revision,
    stateHash: simulation.stateHash,
    simulationId: simulation.id,
    strategy: simulation.strategy,
    status: "staged",
    routes: structuredClone(simulation.routes),
    allowedRobotIds: [...ROBOT_IDS],
    checks: structuredClone(report.checks),
    createdAt: now,
    authorizedAt: null,
    expiresAt: null,
    oneUse: true,
    consumedAt: null,
  };
}
