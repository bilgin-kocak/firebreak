import { create } from "zustand";

import { cloneSeedResident, createId, systemClock } from "../domain/seed";
import type {
  ActivityEntry,
  ApprovedWorkflowTool,
  Resident,
  ServiceId,
  TaskViewDefinition,
  WorkflowToolProposal,
} from "../domain/types";
import type { JourneyCheckResult } from "../domain/journeyChecks";
import {
  clearPersistedState,
  getBrowserStorage,
  loadActivity,
  loadSession,
  loadViews,
  loadWorkflowTools,
  saveActivity,
  saveSession,
  saveViews,
  saveWorkflowTools,
  type PersistedSession,
  type PersistenceStorage,
} from "./persistence";

export type PortalMode =
  | "idle"
  | "manual_flow_active"
  | "adaptive_view_active"
  | "draft_in_progress"
  | "staged_for_review"
  | "submitted";

export type RightRailTab = "activity" | "tool_surface" | "checks";

export type SubmissionConfirmation = {
  confirmationNumber: string;
  status: "submitted";
  message: string;
};

type DynamicToolUnregister = () => void | Promise<void>;

export interface AppState {
  resident: Resident;
  currentService: ServiceId | null;
  portalMode: PortalMode;
  serviceDrafts: Partial<Record<ServiceId, Record<string, unknown>>>;
  views: Record<string, TaskViewDefinition>;
  activeViewId: string | null;
  journeyChecks: Record<string, JourneyCheckResult[]>;
  proposals: Record<string, WorkflowToolProposal>;
  approvedWorkflowTools: Record<string, ApprovedWorkflowTool>;
  webmcp: {
    mode: "native" | "memory" | "unavailable";
    registeredToolNames: string[];
    lastToolChangeAt: string | null;
  };
  activity: ActivityEntry[];
  metrics: {
    webmcpToolCalls: number;
    humanEdits: number;
    humanLocksPreserved: number;
    workflowOperationsExecuted: number;
    lastToolDurationMs: number | null;
    blockingChecks: number;
  };
  dialogs: { proposalSheetOpen: boolean; finalConfirmationOpen: boolean };
  rightRail: { activeTab: RightRailTab; chronological: boolean };
  setPersistenceStorage(storage: PersistenceStorage | undefined): void;
  hydrateFromPersistence(): void;
  startManualFlow(serviceId: ServiceId): void;
  addView(view: TaskViewDefinition): void;
  setActiveView(viewId: string | null): void;
  updateDraft(serviceId: ServiceId, patch: Record<string, unknown>): void;
  setDraftField(serviceId: ServiceId, fieldId: string, value: unknown): void;
  stageDraftForReview(serviceId: ServiceId): void;
  lockElement(viewId: string, elementId: string): void;
  unlockElement(viewId: string, elementId: string): void;
  setJourneyChecks(viewId: string, checks: JourneyCheckResult[]): void;
  stageProposal(proposal: WorkflowToolProposal): void;
  approveProposal(proposalId: string): ApprovedWorkflowTool | undefined;
  rejectProposal(proposalId: string): void;
  setWebMCPMetadata(patch: Partial<AppState["webmcp"]>): void;
  setRightRail(tab: RightRailTab): void;
  setDialog(dialog: keyof AppState["dialogs"], open: boolean): void;
  logActivity(
    entry: Omit<ActivityEntry, "id" | "timestamp"> &
      Partial<Pick<ActivityEntry, "id" | "timestamp">>,
  ): void;
  registerDynamicToolUnregister(unregister: DynamicToolUnregister | undefined): void;
  confirmPermitSubmission(): SubmissionConfirmation | undefined;
  confirmAddressSubmission(): SubmissionConfirmation | undefined;
  reset(): Promise<void>;
}

const emptyMetrics = () => ({
  webmcpToolCalls: 0,
  humanEdits: 0,
  humanLocksPreserved: 0,
  workflowOperationsExecuted: 0,
  lastToolDurationMs: null,
  blockingChecks: 0,
});

const seedState = (): Pick<
  AppState,
  | "resident"
  | "currentService"
  | "portalMode"
  | "serviceDrafts"
  | "views"
  | "activeViewId"
  | "journeyChecks"
  | "proposals"
  | "approvedWorkflowTools"
  | "webmcp"
  | "activity"
  | "metrics"
  | "dialogs"
  | "rightRail"
> => ({
  resident: cloneSeedResident(),
  currentService: null,
  portalMode: "idle",
  serviceDrafts: {},
  views: {},
  activeViewId: null,
  journeyChecks: {},
  proposals: {},
  approvedWorkflowTools: {},
  webmcp: { mode: "memory", registeredToolNames: [], lastToolChangeAt: null },
  activity: [],
  metrics: emptyMetrics(),
  dialogs: { proposalSheetOpen: false, finalConfirmationOpen: false },
  rightRail: { activeTab: "activity", chronological: false },
});

const redactActivityText = (text: string | undefined): string | undefined => {
  if (!text) return text;
  const emailRedacted = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
  return emailRedacted.replace(/\b(payload|formData|body)\s*[=:].*$/i, "[redacted payload]");
};

const recoveryEntry = (): ActivityEntry => ({
  id: createId("activity"),
  timestamp: systemClock.now().toISOString(),
  actor: "system",
  kind: "tool_failed",
  title: "Recovered from invalid saved data",
  detail: "PERSISTENCE_RECOVERY: invalid saved data was discarded safely.",
  status: "warning",
});

let persistenceStorage: PersistenceStorage | undefined = getBrowserStorage();
let dynamicToolUnregister: DynamicToolUnregister | undefined;

const toPersistedSession = (state: AppState): PersistedSession => ({
  resident: state.resident,
  currentService: state.currentService,
  portalMode: state.portalMode,
  serviceDrafts: state.serviceDrafts,
  activeViewId: state.activeViewId,
  proposals: state.proposals,
  metrics: state.metrics,
});

const initialState = (): ReturnType<typeof seedState> => {
  const seed = seedState();
  const session = loadSession(persistenceStorage);
  const views = loadViews(persistenceStorage);
  const tools = loadWorkflowTools(persistenceStorage);
  const activity = loadActivity(persistenceStorage);
  const recovered = session.recovered || views.recovered || tools.recovered || activity.recovered;
  const restored = session.data;
  return {
    ...seed,
    ...(restored
      ? {
          resident: restored.resident,
          currentService: restored.currentService,
          portalMode: restored.portalMode,
          serviceDrafts: restored.serviceDrafts,
          activeViewId: restored.activeViewId,
          proposals: restored.proposals,
          metrics: restored.metrics,
        }
      : {}),
    views: Object.fromEntries(views.data.map((view) => [view.id, view])),
    approvedWorkflowTools: Object.fromEntries(tools.data.map((tool) => [tool.name, tool])),
    activity: recovered ? [recoveryEntry(), ...activity.data] : activity.data,
  };
};

const persist = (state: AppState): void => {
  saveSession(persistenceStorage, toPersistedSession(state));
  saveViews(persistenceStorage, Object.values(state.views));
  saveWorkflowTools(persistenceStorage, Object.values(state.approvedWorkflowTools));
  saveActivity(persistenceStorage, state.activity);
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState(),
  setPersistenceStorage(storage) {
    persistenceStorage = storage;
  },
  hydrateFromPersistence() {
    const restored = initialState();
    set((state) => ({
      ...restored,
      webmcp: state.webmcp,
      dialogs: state.dialogs,
      rightRail: state.rightRail,
      journeyChecks: state.journeyChecks,
    }));
  },
  startManualFlow(serviceId) {
    set({ currentService: serviceId, portalMode: "manual_flow_active" });
    persist(get());
  },
  addView(view) {
    set((state) => ({
      views: { ...state.views, [view.id]: view },
      activeViewId: view.id,
      currentService: view.serviceId,
      portalMode: "adaptive_view_active",
    }));
    get().logActivity({
      actor: "agent",
      kind: "view_compiled",
      title: "Adaptive task view created",
      status: "success",
    });
    persist(get());
  },
  setActiveView(viewId) {
    set({ activeViewId: viewId });
    persist(get());
  },
  updateDraft(serviceId, patch) {
    set((state) => ({
      currentService: serviceId,
      portalMode: "draft_in_progress",
      serviceDrafts: {
        ...state.serviceDrafts,
        [serviceId]: { ...state.serviceDrafts[serviceId], ...patch },
      },
      metrics: { ...state.metrics, humanEdits: state.metrics.humanEdits + 1 },
    }));
    persist(get());
  },
  setDraftField(serviceId, fieldId, value) {
    get().updateDraft(serviceId, { [fieldId]: value });
  },
  stageDraftForReview(serviceId) {
    set((state) => ({
      currentService: serviceId,
      portalMode: "staged_for_review",
      serviceDrafts: {
        ...state.serviceDrafts,
        [serviceId]: { ...state.serviceDrafts[serviceId], status: "staged_for_review" },
      },
      dialogs: { ...state.dialogs, finalConfirmationOpen: true },
    }));
    get().logActivity({
      actor: "agent",
      kind: "draft_staged",
      title: "Draft staged for human review",
      status: "success",
    });
    persist(get());
  },
  lockElement(viewId, elementId) {
    const view = get().views[viewId];
    if (!view || view.lockedElementIds.includes(elementId)) return;
    set((state) => ({
      views: {
        ...state.views,
        [viewId]: { ...view, lockedElementIds: [...view.lockedElementIds, elementId] },
      },
      metrics: { ...state.metrics, humanLocksPreserved: state.metrics.humanLocksPreserved + 1 },
    }));
    get().logActivity({
      actor: "human",
      kind: "element_locked",
      title: "Element locked by you",
      status: "info",
    });
    persist(get());
  },
  unlockElement(viewId, elementId) {
    const view = get().views[viewId];
    if (!view || !view.lockedElementIds.includes(elementId)) return;
    set((state) => ({
      views: {
        ...state.views,
        [viewId]: {
          ...view,
          lockedElementIds: view.lockedElementIds.filter((id) => id !== elementId),
        },
      },
    }));
    get().logActivity({
      actor: "human",
      kind: "element_unlocked",
      title: "Element unlocked",
      status: "info",
    });
    persist(get());
  },
  setJourneyChecks(viewId, checks) {
    const blockingChecks = checks.filter((check) => check.status === "fail").length;
    set((state) => ({
      journeyChecks: { ...state.journeyChecks, [viewId]: checks },
      metrics: { ...state.metrics, blockingChecks },
      rightRail: { ...state.rightRail, activeTab: "checks" },
    }));
    get().logActivity({
      actor: "system",
      kind: "checks_completed",
      title: "Journey checks completed",
      status: blockingChecks ? "warning" : "success",
    });
  },
  stageProposal(proposal) {
    if (proposal.status !== "awaiting_approval") return;
    set((state) => ({
      proposals: { ...state.proposals, [proposal.id]: proposal },
      dialogs: { ...state.dialogs, proposalSheetOpen: true },
    }));
    get().logActivity({
      actor: "agent",
      kind: "workflow_staged",
      title: "Workflow proposal staged for human review",
      toolName: proposal.name,
      status: "info",
    });
    persist(get());
  },
  approveProposal(proposalId) {
    const proposal = get().proposals[proposalId];
    if (!proposal || proposal.status !== "awaiting_approval") return undefined;
    const approved: ApprovedWorkflowTool = {
      ...proposal,
      status: "registered",
      approvedAt: systemClock.now().toISOString(),
      enabled: true,
      registrationRevision: 1,
    };
    set((state) => ({
      proposals: { ...state.proposals, [proposalId]: { ...proposal, status: "registered" } },
      approvedWorkflowTools: { ...state.approvedWorkflowTools, [approved.name]: approved },
      dialogs: { ...state.dialogs, proposalSheetOpen: false },
      rightRail: { ...state.rightRail, activeTab: "tool_surface" },
    }));
    get().logActivity({
      actor: "human",
      kind: "workflow_approved",
      title: "Workflow approved by you",
      toolName: approved.name,
      status: "success",
    });
    persist(get());
    return approved;
  },
  rejectProposal(proposalId) {
    const proposal = get().proposals[proposalId];
    if (!proposal || proposal.status !== "awaiting_approval") return;
    set((state) => ({
      proposals: { ...state.proposals, [proposalId]: { ...proposal, status: "rejected" } },
      dialogs: { ...state.dialogs, proposalSheetOpen: false },
    }));
    get().logActivity({
      actor: "human",
      kind: "workflow_rejected",
      title: "Workflow proposal rejected",
      toolName: proposal.name,
      status: "info",
    });
    persist(get());
  },
  setWebMCPMetadata(patch) {
    set((state) => ({ webmcp: { ...state.webmcp, ...patch } }));
  },
  setRightRail(tab) {
    set((state) => ({ rightRail: { ...state.rightRail, activeTab: tab } }));
  },
  setDialog(dialog, open) {
    set((state) => ({ dialogs: { ...state.dialogs, [dialog]: open } }));
  },
  logActivity(entry) {
    const record: ActivityEntry = {
      id: entry.id ?? createId("activity"),
      timestamp: entry.timestamp ?? systemClock.now().toISOString(),
      ...entry,
      title: redactActivityText(entry.title) ?? "Activity",
      detail: redactActivityText(entry.detail),
    };
    set((state) => ({ activity: [record, ...state.activity].slice(0, 200) }));
    saveActivity(persistenceStorage, get().activity);
  },
  registerDynamicToolUnregister(unregister) {
    dynamicToolUnregister = unregister;
  },
  confirmPermitSubmission() {
    const draft = get().serviceDrafts.parking_permit_renewal;
    if (get().portalMode !== "staged_for_review" || draft?.status !== "staged_for_review")
      return undefined;
    const result: SubmissionConfirmation = {
      confirmationNumber: "NST-PP-2026-08421",
      status: "submitted",
      message: "Your fictional Northstar City permit renewal was submitted.",
    };
    // Security invariant: this UI action is deliberately not exposed as a WebMCP tool.
    set((state) => ({
      portalMode: "submitted",
      serviceDrafts: {
        ...state.serviceDrafts,
        parking_permit_renewal: { ...draft, status: "submitted" },
      },
      dialogs: { ...state.dialogs, finalConfirmationOpen: false },
    }));
    get().logActivity({
      actor: "human",
      kind: "submission_confirmed",
      title: "Fictional permit renewal submitted",
      status: "success",
    });
    persist(get());
    return result;
  },
  confirmAddressSubmission() {
    const draft = get().serviceDrafts.address_change;
    if (get().portalMode !== "staged_for_review" || draft?.status !== "staged_for_review")
      return undefined;
    const result: SubmissionConfirmation = {
      confirmationNumber: "NST-AC-2026-03116",
      status: "submitted",
      message: "Your fictional Northstar City address change was submitted.",
    };
    // Security invariant: this UI action is deliberately not exposed as a WebMCP tool.
    set((state) => ({
      portalMode: "submitted",
      serviceDrafts: { ...state.serviceDrafts, address_change: { ...draft, status: "submitted" } },
      dialogs: { ...state.dialogs, finalConfirmationOpen: false },
    }));
    get().logActivity({
      actor: "human",
      kind: "submission_confirmed",
      title: "Fictional address change submitted",
      status: "success",
    });
    persist(get());
    return result;
  },
  async reset() {
    await dynamicToolUnregister?.();
    dynamicToolUnregister = undefined;
    clearPersistedState(persistenceStorage);
    set({
      ...seedState(),
      activity: [
        {
          id: createId("activity"),
          timestamp: systemClock.now().toISOString(),
          actor: "system",
          kind: "reset",
          title: "Demo reset",
          status: "info",
        },
      ],
    });
  },
}));

export const getAppState = (): AppState => useAppStore.getState();

/** Test-only reset avoids browser storage and restores a deterministic seed. */
export const resetAppStoreForTests = (): void => {
  persistenceStorage = undefined;
  dynamicToolUnregister = undefined;
  useAppStore.setState({ ...seedState() });
};
