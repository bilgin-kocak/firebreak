export type EmergencyPhase =
  | "ready"
  | "active"
  | "planned"
  | "authorized"
  | "executing"
  | "resolved"
  | "failed";

export type RobotId = "SCOUT-1" | "MEDIC-2" | "SUPPRESS-3" | "HAUL-4";
export type RobotRole = "scout" | "rescue" | "suppress" | "haul";
export type RobotStatus =
  | "idle"
  | "manual"
  | "enroute"
  | "acting"
  | "stopped"
  | "complete"
  | "offline";

export type WorkerId = "WORKER-A" | "WORKER-B";
export type WorkerStatus = "trapped" | "rescuing" | "safe";

export type ObjectiveId =
  | "scan-hazards"
  | "rescue-workers"
  | "contain-fire"
  | "move-container";
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
  receipt: null;
}
