import { create } from "zustand";

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
import { AirlockError } from "../domain/airlockTypes";
import { createCanonicalPolicy, createInitialIncidentState } from "../domain/incidentSeed";
import {
  clearPersistedState,
  getBrowserStorage,
  loadIncidentEnvelope,
  loadResponseEnvelope,
  loadUiEnvelope,
  saveIncidentEnvelope,
  saveResponseEnvelope,
  saveUiEnvelope,
  type PersistenceStorage,
  type RightRailTab,
} from "./persistence";

type DynamicToolUnregister = () => void | Promise<void>;
export type ActivityLogInput = Omit<AirlockActivityEntry, "id" | "timestamp">;

export interface HumanActions {
  approveResponseTool(proposalId: string): ApprovedResponseTool;
  rejectResponseTool(proposalId: string): void;
}

export interface AppState {
  incidentState: IncidentState;
  assessments: Record<string, EvidenceAssessment>;
  simulations: Record<string, RemediationSimulation>;
  checks: Record<string, AirlockCheck[]>;
  checkRevisions: Record<string, number>;
  proposals: Record<string, ResponseToolProposal>;
  approvedResponseTools: Record<string, ApprovedResponseTool>;
  progress: RecoveryProgressEntry[];
  receipt: ExecutionReceipt | null;
  recoveryPhase: RecoveryPhase;
  activity: AirlockActivityEntry[];
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
  dialogs: { proposalSheetOpen: boolean; simulatorOpen: boolean };
  rightRail: { activeTab: RightRailTab; chronological: boolean };
  human: HumanActions;
  setPersistenceStorage(storage: PersistenceStorage | undefined): void;
  hydrateFromPersistence(): void;
  recordThreat(assessment: EvidenceAssessment): void;
  saveSimulation(simulation: RemediationSimulation, expectedRevision: number): boolean;
  saveChecks(simulationId: string, expectedRevision: number, checks: AirlockCheck[]): boolean;
  stageResponseTool(proposal: ResponseToolProposal): void;
  recordProgress(entry: RecoveryProgressEntry): void;
  replaceIncidentState(incidentState: IncidentState): void;
  saveReceipt(receipt: ExecutionReceipt): void;
  completeResponseTool(name: string): void;
  disableResponseTool(name: string): void;
  deleteResponseTool(name: string): void;
  setRecoveryPhase(phase: RecoveryPhase): void;
  setWebMCPMetadata(patch: Partial<AppState["webmcp"]>): void;
  setRightRail(tab: RightRailTab): void;
  setDialog(dialog: keyof AppState["dialogs"], open: boolean): void;
  setActivityChronological(chronological: boolean): void;
  logActivity(entry: ActivityLogInput): void;
  recordWebMCPToolCall(durationMs?: number): void;
  recordBlockingChecks(count: number): void;
  registerDynamicToolUnregister(unregister: DynamicToolUnregister | undefined): void;
  toolProjection(): ToolAppState;
  reset(): Promise<void>;
}

export type ToolAppState = Pick<
  AppState,
  | "incidentState"
  | "assessments"
  | "simulations"
  | "checks"
  | "checkRevisions"
  | "proposals"
  | "approvedResponseTools"
  | "progress"
  | "receipt"
  | "recoveryPhase"
  | "webmcp"
  | "metrics"
  | "activity"
  | "recordThreat"
  | "saveSimulation"
  | "saveChecks"
  | "stageResponseTool"
  | "recordProgress"
  | "replaceIncidentState"
  | "saveReceipt"
  | "completeResponseTool"
  | "setRecoveryPhase"
  | "setWebMCPMetadata"
  | "logActivity"
  | "recordWebMCPToolCall"
  | "recordBlockingChecks"
>;

const freshIncidentState = (): IncidentState => {
  const state = createInitialIncidentState();
  state.policy = createCanonicalPolicy(new Date());
  return state;
};

const emptyState = () => ({
  incidentState: freshIncidentState(),
  assessments: {},
  simulations: {},
  checks: {},
  checkRevisions: {},
  proposals: {},
  approvedResponseTools: {},
  progress: [],
  receipt: null,
  recoveryPhase: "idle" as RecoveryPhase,
  activity: [],
  webmcp: {
    mode: "memory" as const,
    registeredToolNames: [] as string[],
    lastToolChangeAt: null as string | null,
  },
  metrics: { webmcpToolCalls: 0, lastToolDurationMs: null as number | null, blockingChecks: 0 },
  dialogs: { proposalSheetOpen: false, simulatorOpen: false },
  rightRail: { activeTab: "tools" as RightRailTab, chronological: false },
});

let persistenceStorage: PersistenceStorage | undefined = getBrowserStorage();
let dynamicToolUnregister: DynamicToolUnregister | undefined;
let activitySequence = 0;
const activityId = () => `activity-${Date.now()}-${++activitySequence}`;

const responseData = (state: AppState) => ({
  simulations: state.simulations,
  checks: state.checks,
  checkRevisions: state.checkRevisions,
  proposals: state.proposals,
  approvedResponseTools: state.approvedResponseTools,
  progress: state.progress,
  receipt: state.receipt,
  recoveryPhase: state.recoveryPhase,
  activity: state.activity,
});

const uiData = (state: AppState) => ({
  dialogs: state.dialogs,
  rightRail: state.rightRail,
  webmcp: state.webmcp,
  metrics: state.metrics,
});

const persist = (state: AppState): void => {
  saveIncidentEnvelope(persistenceStorage, {
    incidentState: state.incidentState,
    assessments: state.assessments,
  });
  saveResponseEnvelope(persistenceStorage, responseData(state));
  saveUiEnvelope(persistenceStorage, uiData(state));
};

const recoveryActivity = (): AirlockActivityEntry => ({
  id: activityId(),
  timestamp: new Date().toISOString(),
  actor: "system",
  kind: "persistence_recovery",
  title: "Recovered from invalid saved state",
  detail: "PERSISTENCE_RECOVERY: stale or corrupt authority was safely discarded.",
  status: "warning",
});

export const useAppStore = create<AppState>((set, get) => {
  const update = (recipe: (state: AppState) => Partial<AppState>): void => {
    set((state) => ({ ...recipe(state) }));
    persist(get());
  };

  const logActivity = (entry: ActivityLogInput): void => {
    update((state) => ({
      activity: [
        {
          ...entry,
          id: activityId(),
          timestamp: new Date().toISOString(),
          detail: entry.detail?.slice(0, 360),
        },
        ...state.activity,
      ].slice(0, 160),
    }));
  };

  const human: HumanActions = {
    approveResponseTool(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "awaiting_approval") {
        throw new AirlockError(
          "HUMAN_APPROVAL_REQUIRED",
          "Only the visible human review can approve this response tool.",
        );
      }
      const checks = get().checks[proposal.simulationId] ?? [];
      if (
        proposal.incidentRevision !== get().incidentState.incident.revision ||
        checks.length === 0 ||
        checks.some((check) => check.blocking && check.status !== "pass")
      ) {
        throw new AirlockError(
          "CHECKS_FAILED",
          "Current Airlock checks must pass before approval.",
        );
      }
      if (new Date(proposal.policy.expiresAt).getTime() <= Date.now()) {
        throw new AirlockError("POLICY_EXPIRED", "The one-use permission has expired.");
      }
      const approved: ApprovedResponseTool = {
        ...structuredClone(proposal),
        status: "registered",
        approvedAt: new Date().toISOString(),
        registrationRevision: get().incidentState.incident.revision,
        enabled: true,
      };
      update((state) => ({
        proposals: {
          ...state.proposals,
          [proposalId]: { ...state.proposals[proposalId]!, status: "registered" },
        },
        approvedResponseTools: { ...state.approvedResponseTools, [approved.name]: approved },
      }));
      logActivity({
        actor: "human",
        kind: "response_approved",
        title: "One-use rollback tool approved",
        toolName: approved.name,
        status: "success",
      });
      return approved;
    },
    rejectResponseTool(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal) return;
      update((state) => ({
        proposals: {
          ...state.proposals,
          [proposalId]: { ...proposal, status: "rejected" },
        },
        dialogs: { ...state.dialogs, proposalSheetOpen: false },
      }));
      logActivity({
        actor: "human",
        kind: "response_rejected",
        title: "Response tool returned for revision",
        status: "warning",
      });
    },
  };

  return {
    ...emptyState(),
    human,
    setPersistenceStorage(storage) {
      persistenceStorage = storage;
    },
    hydrateFromPersistence() {
      const fallback = emptyState();
      const incident = loadIncidentEnvelope(persistenceStorage);
      const incidentState = incident.data?.incidentState ?? fallback.incidentState;
      const responses = loadResponseEnvelope(persistenceStorage, {
        incidentRevision: incidentState.incident.revision,
        now: new Date(),
      });
      const ui = loadUiEnvelope(persistenceStorage);
      const recovered = incident.recovered || responses.recovered || ui.recovered;
      set({
        ...fallback,
        ...(incident.data ?? {}),
        ...(responses.data ?? {}),
        ...(ui.data ?? {}),
        activity: recovered
          ? [recoveryActivity(), ...(responses.data?.activity ?? [])]
          : (responses.data?.activity ?? []),
        human,
      });
      persist(get());
    },
    recordThreat(assessment) {
      update((state) => ({
        incidentState: {
          ...state.incidentState,
          telemetry: state.incidentState.telemetry.map((entry) =>
            entry.id === assessment.evidenceId
              ? { ...entry, quarantined: assessment.injectionRisk || !assessment.trustedForAction }
              : entry,
          ),
        },
        assessments: { ...state.assessments, [assessment.evidenceId]: assessment },
        activity: [
          {
            id: activityId(),
            timestamp: new Date().toISOString(),
            actor: "airlock",
            kind: "evidence_quarantined",
            title: assessment.injectionRisk
              ? "Untrusted instruction blocked"
              : "Untrusted evidence isolated",
            detail: assessment.reason,
            status: assessment.injectionRisk ? "warning" : "info",
          },
          ...state.activity,
        ],
      }));
    },
    saveSimulation(simulation, expectedRevision) {
      if (
        get().incidentState.incident.revision !== expectedRevision ||
        simulation.incidentRevision !== expectedRevision
      ) {
        return false;
      }
      update((state) => ({
        simulations: { ...state.simulations, [simulation.id]: structuredClone(simulation) },
        checks: {},
        checkRevisions: {},
      }));
      logActivity({
        actor: "agent",
        kind: "simulation_completed",
        title: "Safe rollback simulation completed",
        detail: `${simulation.canaryPercent}% canary predicts ${simulation.predictedErrorRate}% errors.`,
        status: "success",
      });
      return true;
    },
    saveChecks(simulationId, expectedRevision, checks) {
      const simulation = get().simulations[simulationId];
      if (
        !simulation ||
        simulation.incidentRevision !== expectedRevision ||
        get().incidentState.incident.revision !== expectedRevision
      ) {
        return false;
      }
      update((state) => ({
        checks: { ...state.checks, [simulationId]: structuredClone(checks) },
        checkRevisions: { ...state.checkRevisions, [simulationId]: expectedRevision },
        metrics: {
          ...state.metrics,
          blockingChecks: checks.filter((item) => item.blocking && item.status !== "pass").length,
        },
      }));
      logActivity({
        actor: "airlock",
        kind: "checks_completed",
        title: "Nine Airlock gates evaluated",
        status: checks.some((item) => item.blocking && item.status !== "pass")
          ? "error"
          : "success",
      });
      return true;
    },
    stageResponseTool(proposal) {
      if (
        proposal.incidentRevision !== get().incidentState.incident.revision ||
        get().checkRevisions[proposal.simulationId] !== proposal.incidentRevision
      ) {
        throw new AirlockError("SIMULATION_STALE", "The response proof is not current.");
      }
      update((state) => ({
        proposals: { ...state.proposals, [proposal.id]: structuredClone(proposal) },
        dialogs: { ...state.dialogs, proposalSheetOpen: true },
      }));
      logActivity({
        actor: "agent",
        kind: "response_staged",
        title: "Rollback tool staged for human review",
        toolName: proposal.name,
        status: "info",
      });
    },
    recordProgress(entry) {
      update((state) => ({
        progress: [...state.progress, structuredClone(entry)],
        recoveryPhase: entry.phase,
        activity: [
          {
            id: activityId(),
            timestamp: entry.timestamp,
            actor: "airlock",
            kind: "recovery_progress",
            title: entry.detail,
            toolName: "rollback_checkout_release",
            status: "info",
          },
          ...state.activity,
        ],
      }));
    },
    replaceIncidentState(incidentState) {
      update(() => ({ incidentState: structuredClone(incidentState) }));
    },
    saveReceipt(receipt) {
      update(() => ({ receipt: structuredClone(receipt), recoveryPhase: receipt.status }));
      logActivity({
        actor: "airlock",
        kind: "incident_resolved",
        title: "Incident resolved with an immutable receipt",
        toolName: receipt.toolName,
        status: "success",
      });
    },
    completeResponseTool(name) {
      const tool = get().approvedResponseTools[name];
      if (!tool) return;
      update((state) => ({
        approvedResponseTools: {
          ...state.approvedResponseTools,
          [name]: {
            ...tool,
            policy: { ...tool.policy, used: true },
            status: "completed",
            enabled: false,
          },
        },
        proposals: {
          ...state.proposals,
          [tool.id]: {
            ...state.proposals[tool.id]!,
            status: "completed",
            policy: { ...tool.policy, used: true },
          },
        },
      }));
    },
    disableResponseTool(name) {
      const tool = get().approvedResponseTools[name];
      if (!tool) return;
      update((state) => ({
        approvedResponseTools: {
          ...state.approvedResponseTools,
          [name]: { ...tool, status: "disabled", enabled: false },
        },
      }));
    },
    deleteResponseTool(name) {
      update((state) => {
        const approvedResponseTools = { ...state.approvedResponseTools };
        delete approvedResponseTools[name];
        return { approvedResponseTools };
      });
    },
    setRecoveryPhase(recoveryPhase) {
      update(() => ({ recoveryPhase }));
    },
    setWebMCPMetadata(patch) {
      update((state) => ({ webmcp: { ...state.webmcp, ...patch } }));
    },
    setRightRail(activeTab) {
      update((state) => ({ rightRail: { ...state.rightRail, activeTab } }));
    },
    setDialog(dialog, open) {
      update((state) => ({ dialogs: { ...state.dialogs, [dialog]: open } }));
    },
    setActivityChronological(chronological) {
      update((state) => ({ rightRail: { ...state.rightRail, chronological } }));
    },
    logActivity,
    recordWebMCPToolCall(durationMs) {
      update((state) => ({
        metrics: {
          ...state.metrics,
          webmcpToolCalls: state.metrics.webmcpToolCalls + 1,
          lastToolDurationMs: durationMs ?? null,
        },
      }));
    },
    recordBlockingChecks(blockingChecks) {
      update((state) => ({ metrics: { ...state.metrics, blockingChecks } }));
    },
    registerDynamicToolUnregister(unregister) {
      dynamicToolUnregister = unregister;
    },
    toolProjection() {
      const state = get();
      return {
        incidentState: state.incidentState,
        assessments: state.assessments,
        simulations: state.simulations,
        checks: state.checks,
        checkRevisions: state.checkRevisions,
        proposals: state.proposals,
        approvedResponseTools: state.approvedResponseTools,
        progress: state.progress,
        receipt: state.receipt,
        recoveryPhase: state.recoveryPhase,
        webmcp: state.webmcp,
        metrics: state.metrics,
        activity: state.activity,
        recordThreat: state.recordThreat,
        saveSimulation: state.saveSimulation,
        saveChecks: state.saveChecks,
        stageResponseTool: state.stageResponseTool,
        recordProgress: state.recordProgress,
        replaceIncidentState: state.replaceIncidentState,
        saveReceipt: state.saveReceipt,
        completeResponseTool: state.completeResponseTool,
        setRecoveryPhase: state.setRecoveryPhase,
        setWebMCPMetadata: state.setWebMCPMetadata,
        logActivity: state.logActivity,
        recordWebMCPToolCall: state.recordWebMCPToolCall,
        recordBlockingChecks: state.recordBlockingChecks,
      };
    },
    async reset() {
      await dynamicToolUnregister?.();
      const webmcp = get().webmcp;
      clearPersistedState(persistenceStorage);
      set({ ...emptyState(), webmcp, human });
    },
  };
});

export const getAppState = (): AppState => useAppStore.getState();
export const resetAppStoreForTests = (): void => {
  persistenceStorage = undefined;
  dynamicToolUnregister = undefined;
  useAppStore.setState({ ...emptyState(), human: useAppStore.getState().human });
};
export const getCurrentChecks = (
  state: Pick<AppState, "checks" | "checkRevisions" | "incidentState">,
  simulationId: string,
): AirlockCheck[] | undefined =>
  state.checkRevisions[simulationId] === state.incidentState.incident.revision
    ? state.checks[simulationId]
    : undefined;
