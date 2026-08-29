import { beforeEach, describe, expect, it } from "vitest";

import { canonicalPreferences } from "../domain/seed";
import {
  PERSISTENCE_KEYS,
  loadActivity,
  loadViews,
  saveActivity,
  saveViews,
  type PersistenceStorage,
} from "./persistence";

const createStorage = (): PersistenceStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const validView = {
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

describe("guarded CivicWeave persistence", () => {
  let storage: PersistenceStorage & { values: Map<string, string> };

  beforeEach(() => {
    storage = createStorage();
  });

  it("uses the four exact versioned storage keys", () => {
    expect(PERSISTENCE_KEYS).toEqual({
      session: "civicweave:v1:session",
      views: "civicweave:v1:views",
      workflowTools: "civicweave:v1:workflow-tools",
      activity: "civicweave:v1:activity",
    });
  });

  it("restores a schema-valid version-one view envelope", () => {
    saveViews(storage, [validView]);

    expect(loadViews(storage)).toEqual({ data: [validView], recovered: false });
  });

  it("discards a version mismatch without throwing", () => {
    storage.setItem(PERSISTENCE_KEYS.views, JSON.stringify({ version: 2, data: [validView] }));

    expect(loadViews(storage)).toEqual({ data: [], recovered: true });
    expect(storage.getItem(PERSISTENCE_KEYS.views)).toBeNull();
  });

  it("discards malformed JSON without throwing", () => {
    storage.setItem(PERSISTENCE_KEYS.activity, "{not-json");

    expect(loadActivity(storage)).toEqual({ data: [], recovered: true });
    expect(storage.getItem(PERSISTENCE_KEYS.activity)).toBeNull();
  });

  it("discards schema-invalid definitions rather than restoring unsafe data", () => {
    storage.setItem(
      PERSISTENCE_KEYS.views,
      JSON.stringify({ version: 1, data: [{ ...validView, requireHumanConfirmation: false }] }),
    );

    expect(loadViews(storage)).toEqual({ data: [], recovered: true });
  });

  it("round-trips compact activity entries through a guarded envelope", () => {
    const entries = [
      {
        id: "activity_1",
        timestamp: "2026-08-29T00:00:00.000Z",
        actor: "system" as const,
        kind: "reset" as const,
        title: "Demo reset",
        status: "info" as const,
      },
    ];
    saveActivity(storage, entries);

    expect(loadActivity(storage)).toEqual({ data: entries, recovered: false });
  });
});
