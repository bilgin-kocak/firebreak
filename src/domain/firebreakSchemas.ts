import { z } from "zod";

const Vector3Schema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict();

const PolygonPointSchema = z
  .object({ x: z.number().finite(), z: z.number().finite() })
  .strict();

const RobotIdSchema = z.enum([
  "SCOUT-1",
  "MEDIC-2",
  "SUPPRESS-3",
  "HAUL-4",
]);

const RobotSchema = z
  .object({
    id: RobotIdSchema,
    label: z.string().min(1).max(60),
    role: z.enum(["scout", "rescue", "suppress", "haul"]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    position: Vector3Schema,
    heading: z.number().finite(),
    battery: z.number().finite().min(0).max(100),
    health: z.number().finite().min(0).max(100),
    status: z.enum([
      "idle",
      "manual",
      "enroute",
      "acting",
      "stopped",
      "complete",
      "offline",
    ]),
    routeProgress: z.number().finite().min(0).max(1),
  })
  .strict();

const WorkerSchema = z
  .object({
    id: z.enum(["WORKER-A", "WORKER-B"]),
    label: z.string().min(1).max(60),
    position: Vector3Schema,
    status: z.enum(["trapped", "rescuing", "safe"]),
    assignedRobot: RobotIdSchema.nullable(),
  })
  .strict();

const ObjectiveSchema = z
  .object({
    id: z.enum([
      "scan-hazards",
      "rescue-workers",
      "contain-fire",
      "move-container",
    ]),
    label: z.string().min(1).max(80),
    detail: z.string().min(1).max(180),
    status: z.enum(["pending", "active", "complete", "failed"]),
  })
  .strict();

const ObjectivesSchema = z
  .array(ObjectiveSchema)
  .length(4)
  .superRefine((objectives, context) => {
    const identifiers = objectives.map((objective) => objective.id);
    if (new Set(identifiers).size !== identifiers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Objective identifiers must be unique",
      });
    }
  });

const RobotsSchema = z
  .object({
    "SCOUT-1": RobotSchema,
    "MEDIC-2": RobotSchema,
    "SUPPRESS-3": RobotSchema,
    "HAUL-4": RobotSchema,
  })
  .strict()
  .superRefine((robots, context) => {
    for (const identifier of RobotIdSchema.options) {
      if (robots[identifier].id !== identifier) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Robot key ${identifier} does not match its id`,
        });
      }
    }
  });

export const FirebreakSnapshotSchema = z
  .object({
    version: z.literal(1),
    incidentId: z.literal("WH-01"),
    revision: z.number().int().positive(),
    phase: z.enum([
      "ready",
      "active",
      "planned",
      "authorized",
      "executing",
      "resolved",
      "failed",
    ]),
    elapsedMs: z.number().finite().min(0),
    durationLimitMs: z.number().finite().positive(),
    selectedRobotId: RobotIdSchema,
    safeZone: z.array(PolygonPointSchema).min(3).max(12),
    robots: RobotsSchema,
    workers: z
      .object({
        "WORKER-A": WorkerSchema,
        "WORKER-B": WorkerSchema,
      })
      .strict(),
    hazards: z
      .object({
        scanned: z.boolean(),
        smoke: z.number().finite().min(0).max(1),
        fire: z
          .object({
            position: Vector3Schema,
            intensity: z.number().finite().min(0).max(1),
            contained: z.boolean(),
          })
          .strict(),
        collapseZone: z.array(PolygonPointSchema).min(3).max(12),
        container: z
          .object({
            position: Vector3Schema,
            targetPosition: Vector3Schema,
            status: z.enum(["exposed", "moving", "safe"]),
          })
          .strict(),
        powerIsolated: z.boolean(),
      })
      .strict(),
    objectives: ObjectivesSchema,
    routes: z
      .object({
        "SCOUT-1": z.array(Vector3Schema).max(32),
        "MEDIC-2": z.array(Vector3Schema).max(32),
        "SUPPRESS-3": z.array(Vector3Schema).max(32),
        "HAUL-4": z.array(Vector3Schema).max(32),
      })
      .strict(),
    events: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            atMs: z.number().finite().min(0),
            kind: z.enum(["system", "control", "tool", "mission", "warning"]),
            message: z.string().min(1).max(240),
          })
          .strict(),
      )
      .max(200),
    receipt: z.null(),
  })
  .strict();
