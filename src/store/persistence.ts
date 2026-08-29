import { z } from "zod";

import {
  activityEntrySchema,
  approvedWorkflowToolSchema,
  residentSchema,
  taskViewDefinitionSchema,
  workflowToolProposalSchema,
} from "../domain/schemas";
import type {
  ActivityEntry,
  ApprovedWorkflowTool,
  Resident,
  ServiceId,
  TaskViewDefinition,
  WorkflowToolProposal,
} from "../domain/types";

export const PERSISTENCE_KEYS = {
  session: "civicweave:v1:session",
  views: "civicweave:v1:views",
  workflowTools: "civicweave:v1:workflow-tools",
  activity: "civicweave:v1:activity",
} as const;

const PERSISTENCE_VERSION = 1;

export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceLoad<T> {
  data: T;
  recovered: boolean;
}

export type PersistedSession = {
  resident: Resident;
  currentService: ServiceId | null;
  portalMode:
    | "idle"
    | "manual_flow_active"
    | "adaptive_view_active"
    | "draft_in_progress"
    | "staged_for_review"
    | "submitted";
  serviceDrafts: Partial<Record<ServiceId, Record<string, unknown>>>;
  activeViewId: string | null;
  proposals: Record<string, WorkflowToolProposal>;
  metrics: {
    webmcpToolCalls: number;
    humanEdits: number;
    humanLocksPreserved: number;
    workflowOperationsExecuted: number;
    lastToolDurationMs: number | null;
    blockingChecks: number;
  };
};

const serviceIdSchema = z.enum(["parking_permit_renewal", "address_change"]);
const portalModeSchema = z.enum([
  "idle",
  "manual_flow_active",
  "adaptive_view_active",
  "draft_in_progress",
  "staged_for_review",
  "submitted",
]);
const persistedSessionSchema: z.ZodType<PersistedSession> = z.object({
  resident: residentSchema,
  currentService: serviceIdSchema.nullable(),
  portalMode: portalModeSchema,
  serviceDrafts: z
    .object({
      parking_permit_renewal: z.record(z.unknown()).optional(),
      address_change: z.record(z.unknown()).optional(),
    })
    .strict(),
  activeViewId: z.string().min(1).nullable(),
  proposals: z.record(workflowToolProposalSchema),
  metrics: z.object({
    webmcpToolCalls: z.number().int().nonnegative(),
    humanEdits: z.number().int().nonnegative(),
    humanLocksPreserved: z.number().int().nonnegative(),
    workflowOperationsExecuted: z.number().int().nonnegative(),
    lastToolDurationMs: z.number().nonnegative().nullable(),
    blockingChecks: z.number().int().nonnegative(),
  }),
});

const viewsSchema = z.array(taskViewDefinitionSchema);
const workflowToolsSchema = z.array(approvedWorkflowToolSchema);
const activitySchema = z.array(activityEntrySchema);

const envelopeSchema = <T>(schema: z.ZodType<T>) =>
  z.object({ version: z.literal(PERSISTENCE_VERSION), data: schema });

export const getBrowserStorage = (): PersistenceStorage | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const save = <T>(storage: PersistenceStorage | undefined, key: string, data: T): void => {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ version: PERSISTENCE_VERSION, data }));
  } catch {
    // Browser storage is optional; the resident experience remains available without it.
  }
};

const discard = (storage: PersistenceStorage | undefined, key: string): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // A blocked storage implementation cannot compromise the in-memory state.
  }
};

const load = <T>(
  storage: PersistenceStorage | undefined,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): PersistenceLoad<T> => {
  if (!storage) return { data: fallback, recovered: false };
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { data: fallback, recovered: false };
    const parsed: unknown = JSON.parse(raw);
    const result = envelopeSchema(schema).safeParse(parsed);
    if (result.success) return { data: result.data.data as T, recovered: false };
  } catch {
    // Invalid browser data is safely discarded below.
  }
  discard(storage, key);
  return { data: fallback, recovered: true };
};

export const saveSession = (
  storage: PersistenceStorage | undefined,
  data: PersistedSession,
): void => save(storage, PERSISTENCE_KEYS.session, data);

export const loadSession = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<PersistedSession | null> =>
  load(storage, PERSISTENCE_KEYS.session, persistedSessionSchema.nullable(), null);

export const saveViews = (
  storage: PersistenceStorage | undefined,
  data: TaskViewDefinition[],
): void => save(storage, PERSISTENCE_KEYS.views, data);

export const loadViews = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<TaskViewDefinition[]> => load(storage, PERSISTENCE_KEYS.views, viewsSchema, []);

export const saveWorkflowTools = (
  storage: PersistenceStorage | undefined,
  data: ApprovedWorkflowTool[],
): void => save(storage, PERSISTENCE_KEYS.workflowTools, data);

export const loadWorkflowTools = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<ApprovedWorkflowTool[]> =>
  load(storage, PERSISTENCE_KEYS.workflowTools, workflowToolsSchema, []);

export const saveActivity = (
  storage: PersistenceStorage | undefined,
  data: ActivityEntry[],
): void => save(storage, PERSISTENCE_KEYS.activity, data);

export const loadActivity = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<ActivityEntry[]> => load(storage, PERSISTENCE_KEYS.activity, activitySchema, []);

export const clearPersistedState = (storage: PersistenceStorage | undefined): void => {
  for (const key of Object.values(PERSISTENCE_KEYS)) discard(storage, key);
};
