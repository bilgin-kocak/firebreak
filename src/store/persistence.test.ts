import { describe, expect, it } from "vitest";

import { validateResponseProposal } from "../domain/airlockPolicy";
import { createInitialIncidentState, trustedRemediationOperationIds } from "../domain/incidentSeed";
import { simulateRemediation } from "../domain/remediationSimulator";
import {
  clearPersistedState,
  createMemoryStorage,
  loadIncidentEnvelope,
  loadResponseEnvelope,
  loadUiEnvelope,
  PERSISTENCE_KEYS,
  saveIncidentEnvelope,
  saveResponseEnvelope,
  saveUiEnvelope,
} from "./persistence";

const responseFixture = () => {
  const incidentState = createInitialIncidentState();
  const simulation = simulateRemediation(incidentState, {
    serviceId: "checkout-api",
    canaryPercent: 10,
  });
  const proposal = validateResponseProposal(
    {
      incidentId: "INC-4821",
      name: "rollback_checkout_release",
      title: "Rollback checkout",
      description: "Safely restore the previous stable release.",
      simulationId: simulation.id,
      incidentRevision: 1,
      operations: trustedRemediationOperationIds.map((operationId) => ({ operationId })),
    },
    { policy: incidentState.policy, simulation, createId: () => "response-1" },
  );
  return { simulation, proposal };
};

describe("Airlock persistence", () => {
  it("round-trips three independently validated envelopes", () => {
    const storage = createMemoryStorage();
    const incidentState = createInitialIncidentState();
    const { simulation, proposal } = responseFixture();
    saveIncidentEnvelope(storage, { incidentState, assessments: {} });
    saveResponseEnvelope(storage, {
      simulations: { [simulation.id]: simulation },
      checks: {},
      checkRevisions: {},
      proposals: { [proposal.id]: proposal },
      approvedResponseTools: {},
      progress: [],
      receipt: null,
      recoveryPhase: "idle",
      activity: [],
    });
    saveUiEnvelope(storage, {
      dialogs: { proposalSheetOpen: false, simulatorOpen: false },
      rightRail: { activeTab: "evidence", chronological: false },
      webmcp: { mode: "memory", registeredToolNames: [], lastToolChangeAt: null },
      metrics: { webmcpToolCalls: 0, lastToolDurationMs: null, blockingChecks: 0 },
    });

    expect(loadIncidentEnvelope(storage).data?.incidentState).toEqual(incidentState);
    expect(loadResponseEnvelope(storage).data?.proposals[proposal.id]).toEqual(proposal);
    expect(loadUiEnvelope(storage).data?.rightRail.activeTab).toBe("evidence");
  });

  it("discards only a corrupt envelope and reports recovery", () => {
    const storage = createMemoryStorage({
      [PERSISTENCE_KEYS.incident]: "{not-json",
    });
    saveUiEnvelope(storage, {
      dialogs: { proposalSheetOpen: false, simulatorOpen: false },
      rightRail: { activeTab: "activity", chronological: false },
      webmcp: { mode: "memory", registeredToolNames: [], lastToolChangeAt: null },
      metrics: { webmcpToolCalls: 0, lastToolDurationMs: null, blockingChecks: 0 },
    });

    expect(loadIncidentEnvelope(storage)).toEqual({ data: null, recovered: true });
    expect(loadUiEnvelope(storage).recovered).toBe(false);
    expect(storage.getItem(PERSISTENCE_KEYS.incident)).toBeNull();
  });

  it("filters expired and stale registered response tools during load", () => {
    const storage = createMemoryStorage();
    const { simulation, proposal } = responseFixture();
    const approved = {
      ...proposal,
      status: "registered" as const,
      approvedAt: "2026-08-30T09:02:00.000Z",
      registrationRevision: 1,
      enabled: true,
    };
    saveResponseEnvelope(storage, {
      simulations: { [simulation.id]: simulation },
      checks: { [simulation.id]: [] },
      checkRevisions: { [simulation.id]: 1 },
      proposals: { [proposal.id]: { ...proposal, status: "registered" } },
      approvedResponseTools: { rollback_checkout_release: approved },
      progress: [],
      receipt: null,
      recoveryPhase: "idle",
      activity: [],
    });

    expect(
      loadResponseEnvelope(storage, {
        incidentRevision: 1,
        now: new Date("2026-08-30T09:03:00.000Z"),
      }).data?.approvedResponseTools.rollback_checkout_release,
    ).toEqual(approved);
    expect(
      loadResponseEnvelope(storage, {
        incidentRevision: 2,
        now: new Date("2026-08-30T09:03:00.000Z"),
      }).data?.approvedResponseTools,
    ).toEqual({});
    expect(
      loadResponseEnvelope(storage, {
        incidentRevision: 1,
        now: new Date("2026-08-30T09:20:00.000Z"),
      }).data?.approvedResponseTools,
    ).toEqual({});
  });

  it("discards stale and dangling response graphs during reconciliation", () => {
    const storage = createMemoryStorage();
    const { simulation, proposal } = responseFixture();
    saveResponseEnvelope(storage, {
      simulations: { [simulation.id]: simulation },
      checks: { [simulation.id]: [] },
      checkRevisions: { [simulation.id]: 1 },
      proposals: { [proposal.id]: proposal },
      approvedResponseTools: {},
      progress: [],
      receipt: null,
      recoveryPhase: "idle",
      activity: [],
    });

    expect(loadResponseEnvelope(storage, { incidentRevision: 2, now: new Date() })).toMatchObject({
      recovered: true,
      data: { simulations: {}, checks: {}, checkRevisions: {}, proposals: {} },
    });
  });

  it("clears exactly the three Airlock keys", () => {
    const storage = createMemoryStorage({ outsider: "keep" });
    for (const key of Object.values(PERSISTENCE_KEYS)) storage.setItem(key, "saved");

    clearPersistedState(storage);

    expect(storage.dump()).toEqual({ outsider: "keep" });
  });
});
