import type { FirebreakSnapshot, PolygonPoint, RobotId } from "./firebreakTypes";

export const INCIDENT_ID = "WH-01" as const;
export const ROBOT_IDS = [
  "SCOUT-1",
  "MEDIC-2",
  "SUPPRESS-3",
  "HAUL-4",
] as const satisfies readonly RobotId[];

export const SAFE_ZONE: PolygonPoint[] = [
  { x: -13, z: 5 },
  { x: -8, z: 5 },
  { x: -8, z: 9 },
  { x: -13, z: 9 },
];

export const COLLAPSE_ZONE: PolygonPoint[] = [
  { x: 1, z: -6 },
  { x: 8, z: -6 },
  { x: 8, z: -2 },
  { x: 1, z: -2 },
];

export function createFirebreakSeed(): FirebreakSnapshot {
  return {
    version: 1,
    incidentId: INCIDENT_ID,
    revision: 1,
    phase: "ready",
    elapsedMs: 0,
    durationLimitMs: 90_000,
    selectedRobotId: "SCOUT-1",
    safeZone: SAFE_ZONE.map((point) => ({ ...point })),
    robots: {
      "SCOUT-1": {
        id: "SCOUT-1",
        label: "Thermal scout",
        role: "scout",
        color: "#45d7ff",
        position: { x: -9, y: 2.4, z: -8 },
        heading: 0,
        battery: 100,
        health: 100,
        status: "idle",
        routeProgress: 0,
      },
      "MEDIC-2": {
        id: "MEDIC-2",
        label: "Rescue rover",
        role: "rescue",
        color: "#72f1b8",
        position: { x: -6, y: 0.45, z: -8 },
        heading: 0,
        battery: 100,
        health: 100,
        status: "idle",
        routeProgress: 0,
      },
      "SUPPRESS-3": {
        id: "SUPPRESS-3",
        label: "Fire suppression rover",
        role: "suppress",
        color: "#ff9d3d",
        position: { x: -3, y: 0.52, z: -8 },
        heading: 0,
        battery: 100,
        health: 100,
        status: "idle",
        routeProgress: 0,
      },
      "HAUL-4": {
        id: "HAUL-4",
        label: "Hazard carrier",
        role: "haul",
        color: "#c7a7ff",
        position: { x: 0, y: 0.48, z: -8 },
        heading: 0,
        battery: 100,
        health: 100,
        status: "idle",
        routeProgress: 0,
      },
    },
    workers: {
      "WORKER-A": {
        id: "WORKER-A",
        label: "Mara Chen",
        position: { x: 10, y: 0.9, z: -0.5 },
        status: "trapped",
        assignedRobot: null,
      },
      "WORKER-B": {
        id: "WORKER-B",
        label: "Jon Bell",
        position: { x: 10.5, y: 0.9, z: 6 },
        status: "trapped",
        assignedRobot: null,
      },
    },
    hazards: {
      scanned: false,
      smoke: 0.35,
      fire: {
        position: { x: 4.5, y: 0.6, z: 3 },
        intensity: 1,
        contained: false,
      },
      collapseZone: COLLAPSE_ZONE.map((point) => ({ ...point })),
      container: {
        position: { x: 8.5, y: 0.65, z: 7 },
        targetPosition: { x: -10, y: 0.65, z: 7 },
        status: "exposed",
      },
      powerIsolated: false,
    },
    objectives: [
      {
        id: "scan-hazards",
        label: "Map the emergency",
        detail: "Reveal heat, smoke, workers, and safe routes.",
        status: "pending",
      },
      {
        id: "rescue-workers",
        label: "Rescue both workers",
        detail: "Move Mara and Jon to the marked safe zone.",
        status: "pending",
      },
      {
        id: "contain-fire",
        label: "Contain Battery Bay B",
        detail: "Isolate power and suppress the battery fire.",
        status: "pending",
      },
      {
        id: "move-container",
        label: "Move the hazardous load",
        detail: "Relocate the exposed container before fire reaches it.",
        status: "pending",
      },
    ],
    routes: {
      "SCOUT-1": [],
      "MEDIC-2": [],
      "SUPPRESS-3": [],
      "HAUL-4": [],
    },
    events: [
      {
        id: "system-ready",
        atMs: 0,
        kind: "system",
        message: "Fleet ready. Start the warehouse emergency when prepared.",
      },
    ],
    receipt: null,
  };
}
