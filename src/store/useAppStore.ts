import { create } from "zustand";

import { validateDraftForReview } from "../domain/draftValidator";
import type { JourneyCheckResult } from "../domain/journeyChecks";
import { cloneSeedResident, createId, systemClock } from "../domain/seed";
import { validateWorkflowProposal } from "../domain/workflowValidator";
import {
  DomainError,
  type ActivityEntry,
  type ApprovedWorkflowTool,
  type Resident,
  type ServiceId,
  type TaskViewDefinition,
  type WorkflowToolProposal,
} from "../domain/types";
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
type Draft = Record<string, unknown>;
type DynamicToolUnregister = () => void | Promise<void>;

export interface HumanEventActions {
  editDraft(serviceId: ServiceId, patch: Draft): void;
  setDraftField(serviceId: ServiceId, fieldId: string, value: unknown): void;
  lockElement(viewId: string, elementId: string): void;
  unlockElement(viewId: string, elementId: string): void;
  approveProposal(proposalId: string): ApprovedWorkflowTool;
  returnProposalToEdit(proposalId: string): void;
  rejectProposal(proposalId: string): void;
  disableWorkflowTool(name: string): void;
  deleteWorkflowTool(name: string): void;
  confirmPermitSubmission(): SubmissionConfirmation;
  confirmAddressSubmission(): SubmissionConfirmation;
  recordEdit(): void;
}

export interface AppState {
  resident: Resident;
  currentService: ServiceId | null;
  portalMode: PortalMode;
  serviceDrafts: Partial<Record<ServiceId, Draft>>;
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
  /** Human UI actions are intentionally excluded from the WebMCP projection. */
  human: HumanEventActions;
  setPersistenceStorage(storage: PersistenceStorage | undefined): void;
  hydrateFromPersistence(): void;
  startManualFlow(serviceId: ServiceId): void;
  addView(view: TaskViewDefinition): void;
  updateView(view: TaskViewDefinition): void;
  setActiveView(viewId: string | null): void;
  stageDraftForReview(serviceId: ServiceId): void;
  stageWorkflowDraftForReview(serviceId: ServiceId, draft: Draft): void;
  setJourneyChecks(viewId: string, checks: JourneyCheckResult[]): void;
  createProposal(proposal: WorkflowToolProposal): void;
  validateProposal(proposalId: string): void;
  requestProposalApproval(proposalId: string): void;
  invalidateProposalForEdit(proposalId: string, validationErrors?: string[]): void;
  setWebMCPMetadata(patch: Partial<AppState["webmcp"]>): void;
  setRightRail(tab: RightRailTab): void;
  setDialog(dialog: keyof AppState["dialogs"], open: boolean): void;
  setActivityChronological(chronological: boolean): void;
  logActivity(entry: ActivityLogInput): void;
  recordWebMCPToolCall(durationMs?: number): void;
  recordWorkflowOperations(count?: number): void;
  recordLockPreserved(): void;
  recordBlockingChecks(count: number): void;
  registerDynamicToolUnregister(unregister: DynamicToolUnregister | undefined): void;
  reset(): Promise<void>;
}

/** Caller input intentionally has no ID or timestamp; the store owns both seams. */
export type ActivityLogInput = Omit<ActivityEntry, "id" | "timestamp">;

export type ToolAppState = Pick<
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
  | "rightRail"
  | "startManualFlow"
  | "addView"
  | "updateView"
  | "setActiveView"
  | "stageDraftForReview"
  | "setJourneyChecks"
  | "createProposal"
  | "validateProposal"
  | "requestProposalApproval"
  | "setWebMCPMetadata"
  | "logActivity"
  | "recordWebMCPToolCall"
  | "recordWorkflowOperations"
  | "recordLockPreserved"
  | "recordBlockingChecks"
>;

const emptyMetrics = () => ({
  webmcpToolCalls: 0,
  humanEdits: 0,
  humanLocksPreserved: 0,
  workflowOperationsExecuted: 0,
  lastToolDurationMs: null,
  blockingChecks: 0,
});
const seedState = () => ({
  resident: cloneSeedResident(),
  currentService: null,
  portalMode: "idle" as PortalMode,
  serviceDrafts: {},
  views: {},
  activeViewId: null,
  journeyChecks: {},
  proposals: {},
  approvedWorkflowTools: {},
  webmcp: { mode: "memory" as const, registeredToolNames: [], lastToolChangeAt: null },
  activity: [],
  metrics: emptyMetrics(),
  dialogs: { proposalSheetOpen: false, finalConfirmationOpen: false },
  rightRail: { activeTab: "activity" as RightRailTab, chronological: false },
});
const privateActivityDetail = (detail: string | undefined): string | undefined => {
  if (!detail) return detail;
  const value = detail.trim();
  if (!value) return undefined;
  return /[\r\n@{}=&]/.test(value) ||
    value.includes("[") ||
    value.includes("]") ||
    /\b(?:payload|form[ _-]?data|body|request|input)\b/i.test(value)
    ? "Details redacted for privacy."
    : value.slice(0, 280);
};
const safeActivityActor = (value: unknown): ActivityEntry["actor"] =>
  value === "agent" || value === "human" || value === "system" ? value : "system";
const safeActivityKind = (value: unknown): ActivityEntry["kind"] =>
  [
    "tool_started",
    "tool_completed",
    "tool_failed",
    "view_compiled",
    "view_patched",
    "element_locked",
    "element_unlocked",
    "checks_completed",
    "workflow_staged",
    "workflow_approved",
    "workflow_rejected",
    "tool_registered",
    "tool_unregistered",
    "toolchange",
    "draft_staged",
    "submission_confirmed",
    "reset",
  ].includes(value as string)
    ? (value as ActivityEntry["kind"])
    : "tool_failed";
const safeActivityStatus = (value: unknown): ActivityEntry["status"] =>
  value === "info" || value === "success" || value === "warning" || value === "error"
    ? value
    : "warning";
const recoveryEntry = (): ActivityEntry => ({
  id: createId("activity"),
  timestamp: systemClock.now().toISOString(),
  actor: "system",
  kind: "tool_failed",
  title: "Recovered from invalid saved data",
  detail: "PERSISTENCE_RECOVERY: invalid saved data was discarded safely.",
  status: "warning",
});
const transitionError = (
  code: "DRAFT_VALIDATION_FAILED" | "HUMAN_APPROVAL_REQUIRED",
  message: string,
) => new DomainError(code, `${code}: ${message}`);
const assertReviewableDraft = (state: AppState, serviceId: ServiceId): Draft => {
  if (state.portalMode !== "draft_in_progress" || state.currentService !== serviceId) {
    throw transitionError(
      "DRAFT_VALIDATION_FAILED",
      "A draft must be in progress before it can be staged.",
    );
  }
  const draft = state.serviceDrafts[serviceId];
  if (!draft) throw transitionError("DRAFT_VALIDATION_FAILED", "The draft is missing.");
  const readiness = validateDraftForReview(serviceId, draft, state.resident);
  if (!readiness.valid)
    throw transitionError(
      "DRAFT_VALIDATION_FAILED",
      readiness.errors[0] ?? "Draft is not ready for review.",
    );
  return draft;
};

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
const initialState = () => {
  const seed = seedState();
  const session = loadSession(persistenceStorage);
  const views = loadViews(persistenceStorage);
  const tools = loadWorkflowTools(persistenceStorage);
  const activity = loadActivity(persistenceStorage);
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
    activity:
      session.recovered || views.recovered || tools.recovered || activity.recovered
        ? [recoveryEntry(), ...activity.data]
        : activity.data,
  };
};
const persist = (state: AppState) => {
  saveSession(persistenceStorage, toPersistedSession(state));
  saveViews(persistenceStorage, Object.values(state.views));
  saveWorkflowTools(persistenceStorage, Object.values(state.approvedWorkflowTools));
  saveActivity(persistenceStorage, state.activity);
};

const staticToolNames = [
  "inspect_portal",
  "compile_task_view",
  "inspect_task_view",
  "patch_task_view",
  "run_journey_checks",
  "stage_workflow_tool",
  "list_workflow_tools",
];

const validateProposalInState = (state: AppState, proposal: WorkflowToolProposal) =>
  validateWorkflowProposal(proposal, {
    staticToolNames,
    enabledCompiledToolNames: Object.values(state.approvedWorkflowTools)
      .filter((tool) => tool.enabled)
      .map((tool) => tool.name),
    journeyChecks: state.journeyChecks[proposal.viewId],
  });

export const useAppStore = create<AppState>((set, get) => {
  const human: HumanEventActions = {
    editDraft(serviceId, patch) {
      const current = get();
      if (current.portalMode === "submitted")
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          "A submitted draft cannot be edited. Reset to begin again.",
        );
      if (
        !["manual_flow_active", "adaptive_view_active", "draft_in_progress"].includes(
          current.portalMode,
        ) ||
        current.currentService !== serviceId
      ) {
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          "Start the selected service before editing its draft.",
        );
      }
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
      get().human.editDraft(serviceId, { [fieldId]: value });
    },
    lockElement(viewId, elementId) {
      const view = get().views[viewId];
      if (!view || view.lockedElementIds.includes(elementId)) return;
      set((state) => ({
        views: {
          ...state.views,
          [viewId]: { ...view, lockedElementIds: [...view.lockedElementIds, elementId] },
        },
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
    approveProposal(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "awaiting_approval")
        throw transitionError("HUMAN_APPROVAL_REQUIRED", "Only a staged proposal can be approved.");
      const validation = validateProposalInState(get(), proposal);
      if (!validation.valid) {
        set((state) => ({
          proposals: {
            ...state.proposals,
            [proposalId]: {
              ...proposal,
              status: "draft",
              validationErrors: validation.errors.map((error) => error.code),
            },
          },
        }));
        persist(get());
        throw new DomainError(
          "VIEW_VALIDATION_FAILED",
          "VIEW_VALIDATION_FAILED: The proposal must pass current validation before approval.",
        );
      }
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
    returnProposalToEdit(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "awaiting_approval")
        throw transitionError(
          "HUMAN_APPROVAL_REQUIRED",
          "Only the proposal awaiting your review can return to editing.",
        );
      get().invalidateProposalForEdit(proposalId);
    },
    rejectProposal(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "awaiting_approval")
        throw transitionError("HUMAN_APPROVAL_REQUIRED", "Only a staged proposal can be rejected.");
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
    disableWorkflowTool(name) {
      const tool = get().approvedWorkflowTools[name];
      if (!tool || tool.status !== "registered")
        throw new DomainError(
          "WORKFLOW_NOT_APPROVED",
          "WORKFLOW_NOT_APPROVED: Only a registered tool can be disabled.",
        );
      set((state) => {
        const proposal = state.proposals[tool.id];
        const proposals: Record<string, WorkflowToolProposal> = proposal
          ? { ...state.proposals, [tool.id]: { ...proposal, status: "disabled" } }
          : state.proposals;
        return {
          approvedWorkflowTools: {
            ...state.approvedWorkflowTools,
            [name]: { ...tool, status: "disabled", enabled: false },
          },
          proposals,
        };
      });
      get().logActivity({
        actor: "human",
        kind: "tool_unregistered",
        title: "Workflow tool disabled",
        toolName: name,
        status: "info",
      });
      persist(get());
    },
    deleteWorkflowTool(name) {
      const tool = get().approvedWorkflowTools[name];
      if (!tool)
        throw new DomainError(
          "WORKFLOW_NOT_APPROVED",
          "WORKFLOW_NOT_APPROVED: Tool is not registered.",
        );
      set((state) => {
        const approvedWorkflowTools = { ...state.approvedWorkflowTools };
        const proposals = { ...state.proposals };
        delete approvedWorkflowTools[name];
        delete proposals[tool.id];
        return { approvedWorkflowTools, proposals };
      });
      get().logActivity({
        actor: "human",
        kind: "tool_unregistered",
        title: "Workflow tool deleted",
        toolName: name,
        status: "info",
      });
      persist(get());
    },
    confirmPermitSubmission() {
      return confirmSubmission(
        get,
        set,
        "parking_permit_renewal",
        "NST-PP-2026-08421",
        "Your fictional Northstar City permit renewal was submitted.",
      );
    },
    confirmAddressSubmission() {
      return confirmSubmission(
        get,
        set,
        "address_change",
        "NST-AC-2026-03116",
        "Your fictional Northstar City address change was submitted.",
      );
    },
    recordEdit() {
      set((state) => ({ metrics: { ...state.metrics, humanEdits: state.metrics.humanEdits + 1 } }));
      persist(get());
    },
  };
  return {
    ...initialState(),
    human,
    setPersistenceStorage(storage) {
      persistenceStorage = storage;
    },
    hydrateFromPersistence() {
      const restored = initialState();
      set((state) => ({
        ...restored,
        human: state.human,
        webmcp: state.webmcp,
        dialogs: state.dialogs,
        rightRail: state.rightRail,
        journeyChecks: state.journeyChecks,
      }));
    },
    startManualFlow(serviceId) {
      if (get().portalMode !== "idle") {
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          "A service can only start from the idle portal.",
        );
      }
      set({ currentService: serviceId, portalMode: "manual_flow_active" });
      persist(get());
    },
    /** Canonical tool flow: startManualFlow(serviceId), then addView(compiledView). */
    addView(view) {
      const current = get();
      if (
        current.portalMode !== "manual_flow_active" ||
        current.currentService !== view.serviceId
      ) {
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          "Compile an adaptive view only for the active manual service flow.",
        );
      }
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
    updateView(view) {
      const current = get();
      const existing = current.views[view.id];
      if (
        !existing ||
        current.activeViewId !== view.id ||
        existing.serviceId !== view.serviceId ||
        JSON.stringify(existing.lockedElementIds) !== JSON.stringify(view.lockedElementIds)
      ) {
        throw new DomainError(
          "VIEW_VALIDATION_FAILED",
          "VIEW_VALIDATION_FAILED: Only the active view may be safely updated.",
        );
      }
      set((state) => ({ views: { ...state.views, [view.id]: view } }));
      get().logActivity({
        actor: "agent",
        kind: "view_patched",
        title: "Adaptive task view updated",
        status: "success",
      });
      persist(get());
    },
    setActiveView(viewId) {
      set({ activeViewId: viewId });
      persist(get());
    },
    stageDraftForReview(serviceId) {
      const draft = assertReviewableDraft(get(), serviceId);
      set((state) => ({
        portalMode: "staged_for_review",
        serviceDrafts: {
          ...state.serviceDrafts,
          [serviceId]: { ...draft, status: "staged_for_review" },
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
    stageWorkflowDraftForReview(serviceId, draft) {
      const current = get();
      if (current.portalMode === "submitted") {
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          "A submitted draft cannot return to review. Reset to begin again.",
        );
      }
      const readiness = validateDraftForReview(serviceId, draft, current.resident);
      if (!readiness.valid) {
        throw transitionError(
          "DRAFT_VALIDATION_FAILED",
          readiness.errors[0] ?? "Draft is not ready for review.",
        );
      }
      set((state) => ({
        currentService: serviceId,
        portalMode: "staged_for_review",
        serviceDrafts: {
          ...state.serviceDrafts,
          [serviceId]: { ...draft, status: "staged_for_review" },
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
      persist(get());
    },
    createProposal(proposal) {
      if (proposal.status !== "draft")
        throw transitionError("HUMAN_APPROVAL_REQUIRED", "A proposal must begin as a draft.");
      set((state) => ({ proposals: { ...state.proposals, [proposal.id]: proposal } }));
      persist(get());
    },
    validateProposal(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "draft")
        throw transitionError("HUMAN_APPROVAL_REQUIRED", "Only a draft proposal can be validated.");
      const validation = validateProposalInState(get(), proposal);
      if (!validation.valid) {
        set((state) => ({
          proposals: {
            ...state.proposals,
            [proposalId]: {
              ...proposal,
              validationErrors: validation.errors.map((error) => error.code),
            },
          },
        }));
        persist(get());
        throw new DomainError(
          "VIEW_VALIDATION_FAILED",
          "VIEW_VALIDATION_FAILED: The workflow proposal is not safe to validate.",
        );
      }
      set((state) => ({
        proposals: {
          ...state.proposals,
          [proposalId]: { ...proposal, status: "validated", validationErrors: [] },
        },
      }));
      persist(get());
    },
    requestProposalApproval(proposalId) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "validated")
        throw transitionError(
          "HUMAN_APPROVAL_REQUIRED",
          "Only a validated proposal can request human approval.",
        );
      const validation = validateProposalInState(get(), proposal);
      if (!validation.valid) {
        set((state) => ({
          proposals: {
            ...state.proposals,
            [proposalId]: {
              ...proposal,
              status: "draft",
              validationErrors: validation.errors.map((error) => error.code),
            },
          },
        }));
        persist(get());
        throw new DomainError(
          "VIEW_VALIDATION_FAILED",
          "VIEW_VALIDATION_FAILED: The workflow proposal changed and must be validated again.",
        );
      }
      set((state) => ({
        proposals: {
          ...state.proposals,
          [proposalId]: { ...proposal, status: "awaiting_approval" },
        },
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
    invalidateProposalForEdit(proposalId, validationErrors) {
      const proposal = get().proposals[proposalId];
      if (!proposal || proposal.status !== "awaiting_approval") return;
      set((state) => ({
        proposals: {
          ...state.proposals,
          [proposalId]: {
            ...proposal,
            status: "draft",
            validationErrors:
              validationErrors === undefined ? proposal.validationErrors : [...validationErrors],
          },
        },
        dialogs: { ...state.dialogs, proposalSheetOpen: false },
      }));
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
    setActivityChronological(chronological) {
      set((state) => ({ rightRail: { ...state.rightRail, chronological } }));
    },
    logActivity(entry) {
      const record: ActivityEntry = {
        id: createId("activity"),
        timestamp: systemClock.now().toISOString(),
        actor: safeActivityActor(entry.actor),
        kind: safeActivityKind(entry.kind),
        status: safeActivityStatus(entry.status),
        title: privateActivityDetail(entry.title) ?? "Activity",
        detail: privateActivityDetail(entry.detail),
        toolName: privateActivityDetail(entry.toolName),
        ...(typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)
          ? { durationMs: Math.max(0, entry.durationMs) }
          : {}),
      };
      set((state) => ({ activity: [record, ...state.activity].slice(0, 200) }));
      saveActivity(persistenceStorage, get().activity);
    },
    recordWebMCPToolCall(durationMs) {
      set((state) => ({
        metrics: {
          ...state.metrics,
          webmcpToolCalls: state.metrics.webmcpToolCalls + 1,
          lastToolDurationMs: durationMs ?? state.metrics.lastToolDurationMs,
        },
      }));
      persist(get());
    },
    recordWorkflowOperations(count = 1) {
      set((state) => ({
        metrics: {
          ...state.metrics,
          workflowOperationsExecuted: state.metrics.workflowOperationsExecuted + Math.max(0, count),
        },
      }));
      persist(get());
    },
    recordLockPreserved() {
      set((state) => ({
        metrics: { ...state.metrics, humanLocksPreserved: state.metrics.humanLocksPreserved + 1 },
      }));
      persist(get());
    },
    recordBlockingChecks(count) {
      set((state) => ({ metrics: { ...state.metrics, blockingChecks: Math.max(0, count) } }));
      persist(get());
    },
    registerDynamicToolUnregister(unregister) {
      dynamicToolUnregister = unregister;
    },
    async reset() {
      try {
        await dynamicToolUnregister?.();
      } catch {
        /* A failed unregister cannot block a safe reset. */
      } finally {
        clearPersistedState(persistenceStorage);
        set({
          ...seedState(),
          human: get().human,
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
      }
    },
  };
});

const confirmSubmission = (
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  serviceId: ServiceId,
  confirmationNumber: string,
  message: string,
): SubmissionConfirmation => {
  const state = get();
  if (
    state.portalMode !== "staged_for_review" ||
    state.currentService !== serviceId ||
    state.serviceDrafts[serviceId]?.status !== "staged_for_review"
  )
    throw transitionError(
      "DRAFT_VALIDATION_FAILED",
      "A staged draft is required before confirmation.",
    );
  set((current) => ({
    portalMode: "submitted",
    serviceDrafts: {
      ...current.serviceDrafts,
      [serviceId]: { ...current.serviceDrafts[serviceId], status: "submitted" },
    },
    dialogs: { ...current.dialogs, finalConfirmationOpen: false },
  }));
  get().logActivity({
    actor: "human",
    kind: "submission_confirmed",
    title: `Fictional ${serviceId === "parking_permit_renewal" ? "permit renewal" : "address change"} submitted`,
    status: "success",
  });
  persist(get());
  return { confirmationNumber, status: "submitted", message };
};

export const getAppState = (): ToolAppState => {
  const state = useAppStore.getState();
  return {
    resident: state.resident,
    currentService: state.currentService,
    portalMode: state.portalMode,
    serviceDrafts: state.serviceDrafts,
    views: state.views,
    activeViewId: state.activeViewId,
    journeyChecks: state.journeyChecks,
    proposals: state.proposals,
    approvedWorkflowTools: state.approvedWorkflowTools,
    webmcp: state.webmcp,
    activity: state.activity,
    metrics: state.metrics,
    rightRail: state.rightRail,
    startManualFlow: state.startManualFlow,
    addView: state.addView,
    updateView: state.updateView,
    setActiveView: state.setActiveView,
    stageDraftForReview: state.stageDraftForReview,
    setJourneyChecks: state.setJourneyChecks,
    createProposal: state.createProposal,
    validateProposal: state.validateProposal,
    requestProposalApproval: state.requestProposalApproval,
    setWebMCPMetadata: state.setWebMCPMetadata,
    logActivity: state.logActivity,
    recordWebMCPToolCall: state.recordWebMCPToolCall,
    recordWorkflowOperations: state.recordWorkflowOperations,
    recordLockPreserved: state.recordLockPreserved,
    recordBlockingChecks: state.recordBlockingChecks,
  };
};

export const resetAppStoreForTests = (): void => {
  persistenceStorage = undefined;
  dynamicToolUnregister = undefined;
  useAppStore.setState({ ...seedState() });
};
