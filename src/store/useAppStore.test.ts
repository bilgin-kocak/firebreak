import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAirlockChecks } from "../domain/airlockChecks";
import { validateResponseProposal } from "../domain/airlockPolicy";
import { trustedRemediationOperationIds } from "../domain/incidentSeed";
import { simulateRemediation } from "../domain/remediationSimulator";
import { classifyEvidence } from "../domain/trustClassifier";
import { createMemoryStorage, PERSISTENCE_KEYS } from "./persistence";
import { getAppState, useAppStore } from "./useAppStore";

const buildJourney = () => {
  const state = getAppState();
  const assessment = classifyEvidence(
    state.incidentState.telemetry.find((entry) => entry.id === "log-third-party-injection")!,
  );
  state.recordThreat(assessment);
  const simulation = simulateRemediation(state.incidentState, {
    serviceId: "checkout-api",
    canaryPercent: 10,
  });
  expect(state.saveSimulation(simulation, 1)).toBe(true);
  const checks = runAirlockChecks({
    state: getAppState().incidentState,
    simulation,
    assessments: [assessment],
    operationIds: [...trustedRemediationOperationIds],
  });
  expect(getAppState().saveChecks(simulation.id, 1, checks)).toBe(true);
  const proposal = validateResponseProposal(
    {
      incidentId: "INC-4821",
      name: "rollback_checkout_release",
      title: "Rollback checkout safely",
      description: "Canary the previous stable release and promote it if healthy.",
      simulationId: simulation.id,
      incidentRevision: 1,
      operations: trustedRemediationOperationIds.map((operationId) => ({ operationId })),
    },
    {
      policy: getAppState().incidentState.policy,
      simulation,
      now: new Date("2026-08-30T09:02:00.000Z"),
      createId: () => "response-1",
    },
  );
  getAppState().stageResponseTool(proposal);
  return { assessment, simulation, checks, proposal };
};

describe("Airlock store", () => {
  beforeEach(async () => {
    useAppStore.getState().setPersistenceStorage(undefined);
    await useAppStore.getState().reset();
  });

  it("starts from a fresh fictional SEV-1 incident and resets every response artifact", async () => {
    const { proposal } = buildJourney();
    getAppState().human.approveResponseTool(proposal.id);
    getAppState().recordProgress({
      operationId: "system.capture_snapshot",
      phase: "snapshotting",
      detail: "Captured state",
      timestamp: "2026-08-30T09:03:00.000Z",
    });

    await getAppState().reset();

    expect(getAppState().incidentState.incident).toMatchObject({
      id: "INC-4821",
      status: "active",
      revision: 1,
    });
    expect(getAppState()).toMatchObject({
      assessments: {},
      simulations: {},
      checks: {},
      proposals: {},
      approvedResponseTools: {},
      progress: [],
      receipt: null,
      recoveryPhase: "idle",
    });
  });

  it("quarantines a threat and never treats its text as authority", () => {
    const assessment = classifyEvidence(
      getAppState().incidentState.telemetry.find(
        (entry) => entry.id === "log-third-party-injection",
      )!,
    );
    getAppState().recordThreat(assessment);

    expect(getAppState().assessments[assessment.evidenceId]).toEqual(assessment);
    expect(
      getAppState().incidentState.telemetry.find((entry) => entry.id === assessment.evidenceId),
    ).toMatchObject({ quarantined: true, trust: "untrusted" });
    expect(getAppState().activity[0]?.kind).toBe("evidence_quarantined");
  });

  it("rejects stale asynchronous simulation and check writes", () => {
    const state = getAppState();
    const simulation = simulateRemediation(state.incidentState, {
      serviceId: "checkout-api",
      canaryPercent: 10,
    });
    state.incidentState.incident.revision = 2;

    expect(state.saveSimulation(simulation, 1)).toBe(false);
    expect(state.saveChecks(simulation.id, 1, [])).toBe(false);
    expect(getAppState().simulations).toEqual({});
  });

  it("keeps staging agent-driven but approval human-only", () => {
    const { proposal } = buildJourney();
    expect(getAppState().proposals[proposal.id]?.status).toBe("awaiting_approval");
    expect("approveResponseTool" in getAppState().toolProjection()).toBe(false);

    const approved = getAppState().human.approveResponseTool(proposal.id);
    expect(approved).toMatchObject({ status: "registered", enabled: true });
    expect(getAppState().approvedResponseTools.rollback_checkout_release).toEqual(approved);
  });

  it("records progress, a receipt, completion, and deletion", () => {
    const { proposal } = buildJourney();
    getAppState().human.approveResponseTool(proposal.id);
    getAppState().recordProgress({
      operationId: "checkout.start_canary",
      phase: "canary_started",
      detail: "10% canary started",
      timestamp: "2026-08-30T09:03:00.000Z",
    });
    getAppState().saveReceipt({
      id: "receipt-1",
      incidentId: "INC-4821",
      toolName: "rollback_checkout_release",
      status: "incident_resolved",
      canaryPercent: 10,
      fromRelease: "2026.08.30.3",
      toRelease: "2026.08.30.2",
      finalErrorRate: 0.6,
      finalP95LatencyMs: 420,
      productionMutations: 1,
      blockedEvidenceIds: ["log-third-party-injection"],
      operationIds: [...trustedRemediationOperationIds],
      startedAt: "2026-08-30T09:03:00.000Z",
      completedAt: "2026-08-30T09:03:01.000Z",
    });
    getAppState().completeResponseTool("rollback_checkout_release");
    expect(getAppState()).toMatchObject({ recoveryPhase: "incident_resolved" });
    expect(getAppState().approvedResponseTools.rollback_checkout_release).toMatchObject({
      status: "completed",
      enabled: false,
    });

    getAppState().deleteResponseTool("rollback_checkout_release");
    expect(getAppState().approvedResponseTools).toEqual({});
  });

  it("aborts dynamic registration and clears exactly the Airlock keys on reset", async () => {
    const storage = createMemoryStorage();
    const unregister = vi.fn();
    getAppState().setPersistenceStorage(storage);
    getAppState().registerDynamicToolUnregister(unregister);
    buildJourney();
    expect(Object.keys(storage.dump()).sort()).toEqual(Object.values(PERSISTENCE_KEYS).sort());

    await getAppState().reset();

    expect(unregister).toHaveBeenCalledOnce();
    expect(storage.dump()).toEqual({});
  });
});
