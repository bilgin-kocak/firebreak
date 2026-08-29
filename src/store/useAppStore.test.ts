import { beforeEach, describe, expect, it } from "vitest";

import { canonicalPreferences } from "../domain/seed";
import type { WorkflowToolProposal } from "../domain/types";
import { PERSISTENCE_KEYS, type PersistenceStorage } from "./persistence";
import { getAppState, resetAppStoreForTests, useAppStore } from "./useAppStore";

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
    store.addView(view);
    store.updateDraft("parking_permit_renewal", { durationMonths: 12, fee: 60 });
    store.stageDraftForReview("parking_permit_renewal");
    const result = store.confirmPermitSubmission();

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
    store.updateDraft("address_change", { newStreet: "8 Cove Road" });
    store.stageDraftForReview("address_change");

    expect(store.confirmAddressSubmission()).toEqual({
      confirmationNumber: "NST-AC-2026-03116",
      status: "submitted",
      message: "Your fictional Northstar City address change was submitted.",
    });
  });

  it("preserves a human lock and edit in the view state", () => {
    const store = useAppStore.getState();
    store.addView(view);
    store.setDraftField("parking_permit_renewal", "contactEmail", "maya@example.test");
    store.lockElement(view.id, "field:vehicleId");

    expect(getAppState().views[view.id]?.lockedElementIds).toContain("field:vehicleId");
    expect(getAppState().serviceDrafts.parking_permit_renewal?.contactEmail).toBe(
      "maya@example.test",
    );
  });

  it("keeps proposal staging separate from human approval and registration", () => {
    const store = useAppStore.getState();
    store.stageProposal(proposal);

    expect(getAppState().proposals[proposal.id]?.status).toBe("awaiting_approval");
    expect(getAppState().approvedWorkflowTools).toEqual({});
    store.approveProposal(proposal.id);
    expect(getAppState().approvedWorkflowTools[proposal.name]).toMatchObject({
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
    expect(detail).toContain("[redacted email]");
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
    store.addView(view);

    await store.reset();

    expect(unregistered).toBe(1);
    expect([...storage.values.keys()]).toEqual([]);
    expect(getAppState().views).toEqual({});
    expect(getAppState().resident.name).toBe("Maya Chen");
    expect(getAppState().activity[0]).toMatchObject({ kind: "reset", actor: "system" });
  });
});
