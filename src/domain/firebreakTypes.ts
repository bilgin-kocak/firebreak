export type EmergencyPhase =
  "ready" | "active" | "planned" | "authorized" | "executing" | "resolved" | "failed";

export type RobotId = "SCOUT-1" | "MEDIC-2" | "SUPPRESS-3" | "HAUL-4";
export type RobotRole = "scout" | "rescue" | "suppress" | "haul";
export type RobotStatus =
  "idle" | "manual" | "enroute" | "acting" | "stopped" | "complete" | "offline";

export type WorkerId = "WORKER-A" | "WORKER-B";
export type WorkerStatus = "trapped" | "rescuing" | "safe";

export type ObjectiveId = "scan-hazards" | "rescue-workers" | "contain-fire" | "move-container";
export type ObjectiveStatus = "pending" | "active" | "complete" | "failed";

export interface Vector3Value {
  x: number;
  y: number;
  z: number;
}

export interface PolygonPoint {
  x: number;
  z: number;
}

export interface RobotState {
  id: RobotId;
  label: string;
  role: RobotRole;
  color: string;
  position: Vector3Value;
  heading: number;
  battery: number;
  health: number;
  status: RobotStatus;
  routeProgress: number;
}

export interface WorkerState {
  id: WorkerId;
  label: string;
  position: Vector3Value;
  status: WorkerStatus;
  assignedRobot: RobotId | null;
}

export interface ObjectiveState {
  id: ObjectiveId;
  label: string;
  detail: string;
  status: ObjectiveStatus;
}

export interface HazardState {
  scanned: boolean;
  smoke: number;
  fire: {
    position: Vector3Value;
    intensity: number;
    contained: boolean;
  };
  collapseZone: PolygonPoint[];
  container: {
    position: Vector3Value;
    targetPosition: Vector3Value;
    status: "exposed" | "moving" | "safe";
  };
  powerIsolated: boolean;
}

export interface MissionEvent {
  id: string;
  atMs: number;
  kind: "system" | "control" | "tool" | "mission" | "warning";
  message: string;
}

export type MissionStrategy = "coordinated";
export type MissionAction =
  | "scan-hazards"
  | "rescue-worker-a"
  | "deliver-worker-a"
  | "isolate-power"
  | "suppress-fire"
  | "rescue-worker-b"
  | "pickup-container"
  | "deliver-worker-b-and-container";

export interface MissionWaypoint {
  position: Vector3Value;
  atMs: number;
  action?: MissionAction;
}

export interface MissionRoute {
  robotId: RobotId;
  waypoints: MissionWaypoint[];
  durationMs: number;
  predictedBatteryEnd: number;
}

export interface MissionPredictions {
  rescuedWorkers: number;
  fireContained: boolean;
  containerSafe: boolean;
  safetyViolations: number;
}

export interface MissionSimulation {
  id: string;
  incidentId: "WH-01";
  incidentRevision: number;
  stateHash: string;
  strategy: MissionStrategy;
  feasible: boolean;
  reasonCode: "READY" | "NO_SAFE_ROUTE" | "ROBOT_CONFLICT";
  durationMs: number;
  routes: Record<RobotId, MissionRoute>;
  predictions: MissionPredictions;
}

export type SafetyCheckId =
  | "revision"
  | "state"
  | "robots"
  | "routes"
  | "geofence"
  | "separation"
  | "battery"
  | "duration"
  | "roles"
  | "rollback"
  | "budget";

export interface SafetyCheck {
  id: SafetyCheckId;
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface SafetyCheckReport {
  simulationId: string;
  incidentRevision: number;
  stateHash: string;
  passed: boolean;
  checks: SafetyCheck[];
}

export type MissionProposalStatus =
  | "staged"
  | "authorized"
  | "registered"
  | "executing"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired"
  | "revoked";

export interface MissionProposal {
  id: string;
  incidentId: "WH-01";
  incidentRevision: number;
  stateHash: string;
  simulationId: string;
  strategy: MissionStrategy;
  status: MissionProposalStatus;
  routes: Record<RobotId, MissionRoute>;
  allowedRobotIds: RobotId[];
  checks: SafetyCheck[];
  createdAt: number;
  authorizedAt: number | null;
  expiresAt: number | null;
  oneUse: true;
  consumedAt: number | null;
}

export interface MissionReceipt {
  id: string;
  proposalId: string;
  outcome: "succeeded" | "cancelled" | "failed";
  startedAt: number;
  completedAt: number;
  durationMs: number;
  rescuedWorkers: number;
  fireContained: boolean;
  containerSafe: boolean;
  safetyViolations: number;
  finalBattery: Record<RobotId, number>;
  partialProgress: Record<RobotId, number>;
  reason: string | null;
}

export interface MissionProgressEvent {
  robotId: RobotId;
  progress: number;
  status: "enroute" | "acting" | "complete";
  message: string;
}

export interface FirebreakSnapshot {
  version: 1;
  incidentId: "WH-01";
  revision: number;
  phase: EmergencyPhase;
  elapsedMs: number;
  durationLimitMs: number;
  selectedRobotId: RobotId;
  safeZone: PolygonPoint[];
  robots: Record<RobotId, RobotState>;
  workers: Record<WorkerId, WorkerState>;
  hazards: HazardState;
  objectives: ObjectiveState[];
  routes: Record<RobotId, Vector3Value[]>;
  events: MissionEvent[];
  receipt: MissionReceipt | null;
}

export type FirebreakErrorCode =
  | "INVALID_TOOL_INPUT"
  | "TOOL_ALREADY_REGISTERED"
  | "TOOL_NOT_FOUND"
  | "UNSUPPORTED_BROWSER"
  | "EMERGENCY_NOT_ACTIVE"
  | "HAZARD_SCAN_REQUIRED"
  | "SIMULATION_NOT_FOUND"
  | "SIMULATION_STALE"
  | "SAFETY_CHECKS_FAILED"
  | "HUMAN_AUTHORIZATION_REQUIRED"
  | "AUTHORITY_EXPIRED"
  | "AUTHORITY_USED"
  | "AUTHORITY_REVOKED"
  | "EXECUTION_CANCELLED"
  | "DRIVER_DISCONNECTED"
  | "OPERATION_FAILED";

export class FirebreakError extends Error {
  public constructor(
    public readonly code: FirebreakErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FirebreakError";
  }
}
