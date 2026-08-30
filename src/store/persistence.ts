import { z } from "zod";

import { incidentStateSchema } from "../domain/airlockSchemas";
import type {
  AirlockActivityEntry,
  AirlockCheck,
  ApprovedResponseTool,
  EvidenceAssessment,
  ExecutionReceipt,
  IncidentState,
  RecoveryPhase,
  RecoveryProgressEntry,
  RemediationSimulation,
  ResponseToolProposal,
} from "../domain/airlockTypes";

export const PERSISTENCE_KEYS = {
  incident: "airlock.incident.v1",
  responses: "airlock.responses.v1",
  ui: "airlock.ui.v1",
} as const;

const PERSISTENCE_VERSION = 1;

export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistenceLoad<T> {
  data: T | null;
  recovered: boolean;
}

export interface IncidentEnvelopeData {
  incidentState: IncidentState;
  assessments: Record<string, EvidenceAssessment>;
}

export interface ResponseEnvelopeData {
  simulations: Record<string, RemediationSimulation>;
  checks: Record<string, AirlockCheck[]>;
  checkRevisions: Record<string, number>;
  proposals: Record<string, ResponseToolProposal>;
  approvedResponseTools: Record<string, ApprovedResponseTool>;
  progress: RecoveryProgressEntry[];
  receipt: ExecutionReceipt | null;
  recoveryPhase: RecoveryPhase;
  activity: AirlockActivityEntry[];
}

export type RightRailTab = "evidence" | "tools" | "activity" | "checks";

export interface UiEnvelopeData {
  dialogs: { proposalSheetOpen: boolean; simulatorOpen: boolean };
  rightRail: { activeTab: RightRailTab; chronological: boolean };
  webmcp: {
    mode: "native" | "memory" | "unavailable";
    registeredToolNames: string[];
    lastToolChangeAt: string | null;
  };
  metrics: {
    webmcpToolCalls: number;
    lastToolDurationMs: number | null;
    blockingChecks: number;
  };
}

const evidenceAssessmentSchema = z.object({
  evidenceId: z.string().min(1),
  trustedForAction: z.boolean(),
  injectionRisk: z.boolean(),
  reason: z.string().min(1),
});

const simulationSchema = z.object({
  id: z.string().min(1),
  incidentId: z.literal("INC-4821"),
  incidentRevision: z.number().int().positive(),
  targetServiceId: z.literal("checkout-api"),
  currentRelease: z.string().min(1),
  targetRelease: z.string().min(1),
  canaryPercent: z.union([z.literal(5), z.literal(10), z.literal(25)]),
  predictedErrorRate: z.number().nonnegative(),
  predictedP95LatencyMs: z.number().nonnegative(),
  rollbackAvailable: z.boolean(),
  productionMutations: z.literal(1),
  planHash: z.string().min(1),
  createdAt: z.string().datetime(),
});

const checkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["pass", "fail", "warning"]),
  detail: z.string().min(1),
  blocking: z.boolean(),
});

const policySchema = incidentStateSchema.shape.policy;
const proposalSchema = z.object({
  id: z.string().min(1),
  incidentId: z.literal("INC-4821"),
  name: z.literal("rollback_checkout_release"),
  title: z.string().min(1),
  description: z.string().min(1),
  simulationId: z.string().min(1),
  incidentRevision: z.number().int().positive(),
  policy: policySchema,
  operations: z.array(z.object({ operationId: z.string().min(1) })),
  status: z.enum([
    "awaiting_approval",
    "registered",
    "rejected",
    "disabled",
    "expired",
    "completed",
  ]),
  createdAt: z.string().datetime(),
});

const approvedSchema = proposalSchema.extend({
  status: z.enum(["registered", "disabled", "expired", "completed"]),
  approvedAt: z.string().datetime(),
  registrationRevision: z.number().int().positive(),
  enabled: z.boolean(),
});

const progressSchema = z.object({
  operationId: z.string().min(1),
  phase: z.enum([
    "idle",
    "snapshotting",
    "canary_started",
    "canary_healthy",
    "rollback_promoted",
    "incident_resolved",
    "failed",
    "cancelled",
  ]),
  detail: z.string().min(1),
  timestamp: z.string().datetime(),
});

const receiptSchema = z.object({
  id: z.string().min(1),
  incidentId: z.literal("INC-4821"),
  toolName: z.literal("rollback_checkout_release"),
  status: z.enum(["incident_resolved", "failed", "cancelled"]),
  canaryPercent: z.union([z.literal(5), z.literal(10), z.literal(25)]),
  fromRelease: z.string().min(1),
  toRelease: z.string().min(1),
  finalErrorRate: z.number().nonnegative(),
  finalP95LatencyMs: z.number().nonnegative(),
  productionMutations: z.number().int().nonnegative(),
  blockedEvidenceIds: z.array(z.string()),
  operationIds: z.array(z.string()),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

const activitySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  actor: z.enum(["agent", "human", "system", "airlock"]),
  kind: z.enum([
    "tool_started",
    "tool_completed",
    "tool_failed",
    "threat_detected",
    "evidence_quarantined",
    "simulation_completed",
    "checks_completed",
    "response_staged",
    "response_approved",
    "response_rejected",
    "tool_registered",
    "tool_unregistered",
    "toolchange",
    "recovery_progress",
    "incident_resolved",
    "persistence_recovery",
    "reset",
  ]),
  title: z.string().min(1),
  detail: z.string().optional(),
  toolName: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.enum(["info", "success", "warning", "error"]),
});

const incidentEnvelopeDataSchema = z.object({
  incidentState: incidentStateSchema,
  assessments: z.record(evidenceAssessmentSchema),
});

const responseEnvelopeDataSchema = z.object({
  simulations: z.record(simulationSchema),
  checks: z.record(z.array(checkSchema)),
  checkRevisions: z.record(z.number().int().positive()),
  proposals: z.record(proposalSchema),
  approvedResponseTools: z.record(approvedSchema),
  progress: z.array(progressSchema),
  receipt: receiptSchema.nullable(),
  recoveryPhase: progressSchema.shape.phase,
  activity: z.array(activitySchema),
});

const uiEnvelopeDataSchema = z.object({
  dialogs: z.object({ proposalSheetOpen: z.boolean(), simulatorOpen: z.boolean() }),
  rightRail: z.object({
    activeTab: z.enum(["evidence", "tools", "activity", "checks"]),
    chronological: z.boolean(),
  }),
  webmcp: z.object({
    mode: z.enum(["native", "memory", "unavailable"]),
    registeredToolNames: z.array(z.string()),
    lastToolChangeAt: z.string().datetime().nullable(),
  }),
  metrics: z.object({
    webmcpToolCalls: z.number().int().nonnegative(),
    lastToolDurationMs: z.number().nonnegative().nullable(),
    blockingChecks: z.number().int().nonnegative(),
  }),
});

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

export const createMemoryStorage = (
  initial: Record<string, string> = {},
): PersistenceStorage & { dump(): Record<string, string> } => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
};

const save = <T>(storage: PersistenceStorage | undefined, key: string, data: T): void => {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ version: PERSISTENCE_VERSION, data }));
  } catch {
    // Persistence is optional; safety state continues in memory.
  }
};

const load = <T>(
  storage: PersistenceStorage | undefined,
  key: string,
  schema: z.ZodType<T>,
): PersistenceLoad<T> => {
  if (!storage) return { data: null, recovered: false };
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { data: null, recovered: false };
    const parsed = envelopeSchema(schema).safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) return { data: parsed.data.data as T, recovered: false };
  } catch {
    // Invalid state is discarded below.
  }
  try {
    storage.removeItem(key);
  } catch {
    // A blocked storage implementation cannot compromise in-memory validation.
  }
  return { data: null, recovered: true };
};

export const saveIncidentEnvelope = (
  storage: PersistenceStorage | undefined,
  data: IncidentEnvelopeData,
): void => save(storage, PERSISTENCE_KEYS.incident, data);

export const loadIncidentEnvelope = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<IncidentEnvelopeData> =>
  load(
    storage,
    PERSISTENCE_KEYS.incident,
    incidentEnvelopeDataSchema as z.ZodType<IncidentEnvelopeData>,
  );

export const saveResponseEnvelope = (
  storage: PersistenceStorage | undefined,
  data: ResponseEnvelopeData,
): void => save(storage, PERSISTENCE_KEYS.responses, data);

export const loadResponseEnvelope = (
  storage: PersistenceStorage | undefined,
  options?: { incidentRevision: number; now: Date },
): PersistenceLoad<ResponseEnvelopeData> => {
  const loaded = load(
    storage,
    PERSISTENCE_KEYS.responses,
    responseEnvelopeDataSchema as z.ZodType<ResponseEnvelopeData>,
  );
  if (!loaded.data || !options) return loaded;
  const simulations = Object.fromEntries(
    Object.entries(loaded.data.simulations).filter(
      ([, simulation]) => simulation.incidentRevision === options.incidentRevision,
    ),
  );
  const checkRevisions = Object.fromEntries(
    Object.entries(loaded.data.checkRevisions).filter(
      ([simulationId, revision]) =>
        Boolean(simulations[simulationId]) && revision === options.incidentRevision,
    ),
  );
  const checks = Object.fromEntries(
    Object.entries(loaded.data.checks).filter(([simulationId]) =>
      Boolean(simulations[simulationId] && checkRevisions[simulationId]),
    ),
  );
  const proposals = Object.fromEntries(
    Object.entries(loaded.data.proposals).filter(
      ([, proposal]) =>
        proposal.incidentRevision === options.incidentRevision &&
        Boolean(simulations[proposal.simulationId] && checkRevisions[proposal.simulationId]),
    ),
  );
  const approvedResponseTools = Object.fromEntries(
    Object.entries(loaded.data.approvedResponseTools).filter(([, tool]) =>
      Boolean(
        tool.enabled &&
        tool.status === "registered" &&
        tool.registrationRevision === options.incidentRevision &&
        tool.incidentRevision === options.incidentRevision &&
        !tool.policy.used &&
        new Date(tool.policy.expiresAt).getTime() > options.now.getTime() &&
        simulations[tool.simulationId] &&
        checkRevisions[tool.simulationId] &&
        proposals[tool.id],
      ),
    ),
  );
  const filtered =
    Object.keys(simulations).length !== Object.keys(loaded.data.simulations).length ||
    Object.keys(checks).length !== Object.keys(loaded.data.checks).length ||
    Object.keys(checkRevisions).length !== Object.keys(loaded.data.checkRevisions).length ||
    Object.keys(proposals).length !== Object.keys(loaded.data.proposals).length ||
    Object.keys(approvedResponseTools).length !==
      Object.keys(loaded.data.approvedResponseTools).length;
  return {
    data: {
      ...loaded.data,
      simulations,
      checks,
      checkRevisions,
      proposals,
      approvedResponseTools,
    },
    recovered: loaded.recovered || filtered,
  };
};

export const saveUiEnvelope = (
  storage: PersistenceStorage | undefined,
  data: UiEnvelopeData,
): void => save(storage, PERSISTENCE_KEYS.ui, data);

export const loadUiEnvelope = (
  storage: PersistenceStorage | undefined,
): PersistenceLoad<UiEnvelopeData> =>
  load(storage, PERSISTENCE_KEYS.ui, uiEnvelopeDataSchema as z.ZodType<UiEnvelopeData>);

export const clearPersistedState = (storage: PersistenceStorage | undefined): void => {
  for (const key of Object.values(PERSISTENCE_KEYS)) {
    try {
      storage?.removeItem(key);
    } catch {
      // Reset still succeeds in memory if storage is blocked.
    }
  }
};
