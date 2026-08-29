import { beforeEach, describe, expect, it } from "vitest";

import { canonicalPreferences } from "../domain/seed";
import { DomainError, type WorkflowToolProposal } from "../domain/types";
import { PERSISTENCE_KEYS, type PersistenceStorage } from "./persistence";
import { selectOrderedActivity } from "./selectors";
import {
  getAppState,
  resetAppStoreForTests,
  type ActivityLogInput,
  useAppStore,
} from "./useAppStore";

const createStorage = (): PersistenceStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const view = {
  id: "view_1",
  serviceId: "parking_permit_renewal" as const,
  title: "Renew permit",
  goal: "Renew my permit",
  preferences: canonicalPreferences,
  fieldOrder: ["vehicleId", "permitDurationMonths", "contactEmail", "currentPermitSummary"],
  hiddenOptionalFields: [],
  copyOverrides: [],
  lockedElementIds: [],
  requireHumanConfirmation: true as const,
  revision: 1,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

const proposal: WorkflowToolProposal = {
  id: "proposal_1",
  viewId: view.id,
  serviceId: "parking_permit_renewal",
  name: "renew_permit_guided",
  title: "Guided permit renewal",
  description: "Stages a permit renewal for review.",
  parameters: [],
  operations: [{ operationId: "permit.stage_review", bindings: [] }],
  stopAt: "review",
  status: "awaiting_approval",
  validationErrors: [],
  createdAt: "2026-08-29T00:00:00.000Z",
};

const validProposal: WorkflowToolProposal = {
  ...proposal,
  id: "proposal_valid",
  status: "draft",
  parameters: [
    {
      name: "durationMonths",
      fieldId: "permitDurationMonths",
      description: "Choose a 6- or 12-month parking permit.",
      required: true,
    },
  ],
  operations: [
    { operationId: "permit.load_current", bindings: [] },
    {
      operationId: "permit.set_vehicle",
      bindings: [{ argument: "vehicleId", source: "portal_state", key: "currentVehicleId" }],
    },
    {
      operationId: "permit.set_duration",
      bindings: [{ argument: "months", source: "tool_input", key: "durationMonths" }],
    },
    {
      operationId: "permit.set_contact",
      bindings: [{ argument: "email", source: "portal_state", key: "contactEmail" }],
    },
    { operationId: "permit.calculate_fee", bindings: [] },
    { operationId: "permit.save_draft", bindings: [] },
    { operationId: "permit.stage_review", bindings: [] },
  ],
};

describe("CivicWeave app store", () => {
  beforeEach(() => {
    resetAppStoreForTests();
  });

  it("exposes current state to non-React WebMCP handlers", () => {
    expect(getAppState().resident.name).toBe("Maya Chen");
    expect(getAppState().portalMode).toBe("idle");
  });

  it("moves the portal through adaptive, draft, review, and submitted states", () => {
    const store = useAppStore.getState();
    store.startManualFlow("parking_permit_renewal");
    store.addView(view);
    store.human.editDraft("parking_permit_renewal", {
      vehicleId: "vehicle_aurora",
      durationMonths: 12,
      contactEmail: "maya.chen@example.test",
      fee: 60,
    });
    store.stageDraftForReview("parking_permit_renewal");
    const result = store.human.confirmPermitSubmission();

    expect(result).toEqual({
      confirmationNumber: "NST-PP-2026-08421",
      status: "submitted",
      message: "Your fictional Northstar City permit renewal was submitted.",
    });
    expect(getAppState().portalMode).toBe("submitted");
    expect(getAppState().serviceDrafts.parking_permit_renewal).toMatchObject({
      status: "submitted",
      durationMonths: 12,
    });
  });

  it("allows only a human action to make the fictional address submission transition", () => {
    const store = useAppStore.getState();
    store.startManualFlow("address_change");
    store.human.editDraft("address_change", {
      newStreet: "8 Cove Road",
      newCity: "Northstar",
      newPostalCode: "NS 20418",
      effectiveDate: "2026-09-01",
    });
    store.stageDraftForReview("address_change");

    expect(store.human.confirmAddressSubmission()).toEqual({
      confirmationNumber: "NST-AC-2026-03116",
      status: "submitted",
      message: "Your fictional Northstar City address change was submitted.",
    });
  });

  it("preserves a human lock and edit in the view state", () => {
    const store = useAppStore.getState();
    store.startManualFlow("parking_permit_renewal");
    store.addView(view);
    store.human.setDraftField("parking_permit_renewal", "contactEmail", "maya@example.test");
    store.human.lockElement(view.id, "field:vehicleId");

    expect(getAppState().views[view.id]?.lockedElementIds).toContain("field:vehicleId");
    expect(getAppState().serviceDrafts.parking_permit_renewal?.contactEmail).toBe(
      "maya@example.test",
    );
  });

  it("keeps proposal staging separate from human approval and registration", () => {
    const store = useAppStore.getState();
    store.createProposal(validProposal);
    store.validateProposal(validProposal.id);
    store.requestProposalApproval(validProposal.id);

    expect(getAppState().proposals[validProposal.id]?.status).toBe("awaiting_approval");
    expect(getAppState().approvedWorkflowTools).toEqual({});
    store.human.approveProposal(validProposal.id);
    expect(getAppState().approvedWorkflowTools[validProposal.name]).toMatchObject({
      status: "registered",
      enabled: true,
    });
  });

  it("redacts full emails and form payloads from the activity ledger", () => {
    useAppStore.getState().logActivity({
      actor: "agent",
      kind: "tool_completed",
      title: "Draft updated",
      detail: "contactEmail=maya.chen@example.test payload={durationMonths:12,secret:keep}",
      status: "success",
    });

    const detail = getAppState().activity[0]?.detail ?? "";
    expect(detail).not.toContain("maya.chen@example.test");
    expect(detail).not.toContain("secret:keep");
    expect(detail).toBe("Details redacted for privacy.");
  });

  it("surfaces PERSISTENCE_RECOVERY when unsafe saved data is discarded", () => {
    const storage = createStorage();
    storage.setItem(PERSISTENCE_KEYS.views, "not valid json");
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);

    store.hydrateFromPersistence();

    expect(getAppState().views).toEqual({});
    expect(getAppState().activity[0]?.detail).toContain("PERSISTENCE_RECOVERY");
  });

  it("clears all persisted keys, invokes dynamic unregister, restores seed, then logs reset", async () => {
    const storage = createStorage();
    for (const key of Object.values(PERSISTENCE_KEYS)) storage.setItem(key, "persisted");
    let unregistered = 0;
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);
    store.registerDynamicToolUnregister(async () => {
      unregistered += 1;
    });
    store.startManualFlow("parking_permit_renewal");
    store.addView(view);

    await store.reset();

    expect(unregistered).toBe(1);
    expect([...storage.values.keys()]).toEqual([]);
    expect(getAppState().views).toEqual({});
    expect(getAppState().resident.name).toBe("Maya Chen");
    expect(getAppState().activity[0]).toMatchObject({ kind: "reset", actor: "system" });
  });

  it("rejects forbidden draft transitions and accepts complete parking and address review drafts", () => {
    const store = useAppStore.getState();
    expect(() => store.human.confirmPermitSubmission()).toThrow("DRAFT_VALIDATION_FAILED");
    expect(() => store.stageDraftForReview("parking_permit_renewal")).toThrow(DomainError);
    expect(() => store.stageDraftForReview("parking_permit_renewal")).toThrow(
      "DRAFT_VALIDATION_FAILED",
    );

    store.startManualFlow("parking_permit_renewal");
    store.human.editDraft("parking_permit_renewal", {
      vehicleId: "vehicle_aurora",
      durationMonths: 12,
      contactEmail: "maya.chen@example.test",
      fee: 60,
    });
    store.stageDraftForReview("parking_permit_renewal");
    expect(store.human.confirmPermitSubmission()?.status).toBe("submitted");
    expect(() => store.human.editDraft("parking_permit_renewal", { durationMonths: 6 })).toThrow(
      "DRAFT_VALIDATION_FAILED",
    );

    resetAppStoreForTests();
    const next = useAppStore.getState();
    next.startManualFlow("address_change");
    expect(() => next.human.confirmAddressSubmission()).toThrow("DRAFT_VALIDATION_FAILED");
    next.human.editDraft("address_change", {
      newStreet: "8 Cove Road",
      newCity: "Northstar",
      newPostalCode: "NS 20418",
      effectiveDate: "2026-09-01",
    });
    next.stageDraftForReview("address_change");
    expect(next.human.confirmAddressSubmission()?.confirmationNumber).toBe("NST-AC-2026-03116");
    expect(() => next.human.editDraft("address_change", { newCity: "Elsewhere" })).toThrow(
      "DRAFT_VALIDATION_FAILED",
    );
  });

  it("keeps human-only controls out of the narrow WebMCP-facing API", () => {
    const toolState = getAppState();

    expect(toolState).not.toHaveProperty("human");
    expect(toolState).not.toHaveProperty("approveProposal");
    expect(toolState).not.toHaveProperty("lockElement");
    expect(toolState).not.toHaveProperty("confirmPermitSubmission");
  });

  it("lets the tool-facing API enter a service flow before compiling a view without human capabilities", () => {
    const toolState = getAppState();
    toolState.startManualFlow("parking_permit_renewal");
    toolState.addView(view);

    expect(getAppState().portalMode).toBe("adaptive_view_active");
    expect(toolState).not.toHaveProperty("human");
    expect(toolState).not.toHaveProperty("confirmPermitSubmission");
  });

  it("enforces workflow proposal transitions through validation, review, registration, disable, and delete", () => {
    const store = useAppStore.getState();
    const draft = { ...validProposal, status: "draft" as const };
    store.createProposal(draft);
    expect(() => store.requestProposalApproval(draft.id)).toThrow("HUMAN_APPROVAL_REQUIRED");
    expect(() => store.human.approveProposal(draft.id)).toThrow("HUMAN_APPROVAL_REQUIRED");

    store.validateProposal(draft.id);
    store.requestProposalApproval(draft.id);
    expect(getAppState().proposals[draft.id]?.status).toBe("awaiting_approval");
    store.human.approveProposal(draft.id);
    expect(getAppState().proposals[draft.id]?.status).toBe("registered");
    store.human.disableWorkflowTool(draft.name);
    expect(getAppState().approvedWorkflowTools[draft.name]?.status).toBe("disabled");
    expect(() => store.human.disableWorkflowTool(draft.name)).toThrow("WORKFLOW_NOT_APPROVED");
    store.human.deleteWorkflowTool(draft.name);
    expect(getAppState().approvedWorkflowTools[draft.name]).toBeUndefined();

    resetAppStoreForTests();
    const rejected = { ...validProposal, id: "proposal_rejected", status: "draft" as const };
    useAppStore.getState().createProposal(rejected);
    useAppStore.getState().validateProposal(rejected.id);
    useAppStore.getState().requestProposalApproval(rejected.id);
    useAppStore.getState().human.rejectProposal(rejected.id);
    expect(getAppState().proposals[rejected.id]?.status).toBe("rejected");
  });

  it("never persists raw JSON, form-data variants, multiline payloads, or emails in activity detail", () => {
    const storage = createStorage();
    const raw = `payload={"contactEmail":"maya.chen@example.test","secret":"keep"}\nform-data: email=other@example.test`;
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);
    store.logActivity({
      actor: "agent",
      kind: "tool_completed",
      title: "Completed",
      detail: raw,
      status: "success",
    });

    const saved = storage.getItem(PERSISTENCE_KEYS.activity) ?? "";
    expect(getAppState().activity[0]?.detail).not.toContain("maya.chen@example.test");
    expect(getAppState().activity[0]?.detail).not.toContain("secret");
    expect(saved).not.toContain("maya.chen@example.test");
    expect(saved).not.toContain("other@example.test");
    expect(saved).not.toContain("form-data");
    expect(saved).not.toContain("secret");
  });

  it("sanitizes tool names before they reach memory or persisted activity", () => {
    const storage = createStorage();
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);
    store.logActivity({
      actor: "agent",
      kind: "tool_completed",
      title: "Completed",
      toolName: "tool_maya.chen@example.test_payload={secret}",
      status: "success",
    });

    expect(getAppState().activity[0]?.toolName).not.toContain("maya.chen@example.test");
    expect(storage.getItem(PERSISTENCE_KEYS.activity)).not.toContain("secret");
  });

  it("generates activity IDs internally and never persists a caller-controlled identifier", () => {
    const storage = createStorage();
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);
    const safeInput: ActivityLogInput = {
      actor: "agent",
      kind: "tool_completed",
      title: "Completed",
      status: "success",
    };
    // @ts-expect-error Activity IDs are intentionally not accepted from callers.
    safeInput.id = "activity_maya.chen@example.test_payload={secret}";
    store.logActivity({
      ...safeInput,
      ...({ id: "activity_maya.chen@example.test_payload={secret}" } as Record<string, unknown>),
    } as ActivityLogInput);

    expect(getAppState().activity[0]?.id).not.toContain("maya.chen@example.test");
    expect(storage.getItem(PERSISTENCE_KEYS.activity)).not.toContain("secret");
  });

  it("offers newest and chronological activity ordering without mutating the ledger", () => {
    const store = useAppStore.getState();
    store.logActivity({
      actor: "system",
      kind: "reset",
      title: "First",
      status: "info",
    });
    store.logActivity({
      actor: "system",
      kind: "reset",
      title: "Second",
      status: "info",
    });

    expect(selectOrderedActivity(getAppState()).map((entry) => entry.title)).toEqual([
      "Second",
      "First",
    ]);
    store.setActivityChronological(true);
    expect(selectOrderedActivity(getAppState()).map((entry) => entry.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("records explicit WebMCP, operation, edit, lock, duration, and blocking-check metrics", () => {
    const store = useAppStore.getState();
    store.recordWebMCPToolCall(42);
    store.recordWorkflowOperations(3);
    store.recordBlockingChecks(2);
    store.human.recordEdit();
    store.human.recordLockPreserved();

    expect(getAppState().metrics).toEqual({
      webmcpToolCalls: 1,
      humanEdits: 1,
      humanLocksPreserved: 1,
      workflowOperationsExecuted: 3,
      lastToolDurationMs: 42,
      blockingChecks: 2,
    });
  });

  it("resets safely even if dynamic-tool unregister fails", async () => {
    const storage = createStorage();
    const store = useAppStore.getState();
    store.setPersistenceStorage(storage);
    store.registerDynamicToolUnregister(async () => Promise.reject(new Error("unregister failed")));
    storage.setItem(PERSISTENCE_KEYS.session, "persisted");

    await expect(store.reset()).resolves.toBeUndefined();
    expect(storage.getItem(PERSISTENCE_KEYS.session)).toBeNull();
    expect(getAppState().resident.name).toBe("Maya Chen");
    expect(getAppState().activity[0]).toMatchObject({ kind: "reset" });
  });

  it("requires legal portal edges for human drafts and tool-compiled adaptive views", () => {
    const store = useAppStore.getState();
    expect(() => store.human.editDraft("parking_permit_renewal", {})).toThrow(
      "DRAFT_VALIDATION_FAILED",
    );
    expect(() => store.addView(view)).toThrow("DRAFT_VALIDATION_FAILED");

    store.startManualFlow("parking_permit_renewal");
    store.addView(view);
    expect(getAppState().portalMode).toBe("adaptive_view_active");
    store.human.editDraft("parking_permit_renewal", { contactEmail: "maya.chen@example.test" });
    expect(getAppState().portalMode).toBe("draft_in_progress");
  });

  it("delegates review readiness to the domain validator", () => {
    const store = useAppStore.getState();
    store.startManualFlow("parking_permit_renewal");
    store.human.editDraft("parking_permit_renewal", {
      vehicleId: "vehicle_aurora",
      durationMonths: 12,
      contactEmail: "maya.chen@example.test",
      fee: 35,
    });

    expect(() => store.stageDraftForReview("parking_permit_renewal")).toThrow("matching fee");
  });

  it("blocks invalid workflow proposals before validation, approval, or registration", () => {
    const store = useAppStore.getState();
    const invalid: WorkflowToolProposal = {
      ...validProposal,
      id: "proposal_human_only",
      name: "bad_human_only",
      operations: [{ operationId: "permit.submit", bindings: [] }],
    };
    store.createProposal(invalid);

    expect(() => store.validateProposal(invalid.id)).toThrow("VIEW_VALIDATION_FAILED");
    expect(getAppState().proposals[invalid.id]?.status).toBe("draft");
    expect(getAppState().proposals[invalid.id]?.validationErrors).toContain("HUMAN_ONLY_OPERATION");
    expect(() => store.requestProposalApproval(invalid.id)).toThrow("HUMAN_APPROVAL_REQUIRED");
    expect(() => store.human.approveProposal(invalid.id)).toThrow("HUMAN_APPROVAL_REQUIRED");
  });

  it("validates and revalidates canonical proposals before approval", () => {
    const store = useAppStore.getState();
    store.createProposal(validProposal);
    store.validateProposal(validProposal.id);
    store.requestProposalApproval(validProposal.id);

    expect(getAppState().proposals[validProposal.id]?.status).toBe("awaiting_approval");
    expect(store.human.approveProposal(validProposal.id).status).toBe("registered");
  });
});
