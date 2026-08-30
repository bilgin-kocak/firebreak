import { describe, expect, it } from "vitest";

import { validateResponseProposal } from "./airlockPolicy";
import type { RecoveryProgressEntry } from "./airlockTypes";
import { AirlockError } from "./airlockTypes";
import { createInitialIncidentState, trustedRemediationOperationIds } from "./incidentSeed";
import { executeRemediation } from "./remediationExecutor";
import { remediationOperationRegistry } from "./remediationOperations";
import { simulateRemediation } from "./remediationSimulator";

const setup = () => {
  const state = createInitialIncidentState();
  const simulation = simulateRemediation(state, {
    serviceId: "checkout-api",
    canaryPercent: 10,
  });
  const proposal = validateResponseProposal(
    {
      incidentId: "INC-4821",
      name: "rollback_checkout_release",
      title: "Rollback checkout safely",
      description: "Promote the previous stable release after a healthy canary.",
      simulationId: simulation.id,
      incidentRevision: 1,
      operations: trustedRemediationOperationIds.map((operationId) => ({ operationId })),
    },
    { policy: state.policy, simulation, now: new Date("2026-08-30T09:02:00.000Z") },
  );
  return { state, simulation, proposal };
};

describe("executeRemediation", () => {
  it("resolves the incident in trusted order and returns an immutable receipt", async () => {
    const { state, proposal } = setup();
    const progress: RecoveryProgressEntry[] = [];
    const receipt = await executeRemediation(proposal, {
      state,
      canaryPercent: 10,
      quarantinedEvidenceIds: ["log-third-party-injection"],
      now: () => new Date("2026-08-30T09:03:00.000Z"),
      createId: () => "receipt-1",
      onProgress: (entry) => progress.push(entry),
    });

    expect(progress.map((entry) => entry.phase)).toEqual([
      "snapshotting",
      "snapshotting",
      "canary_started",
      "canary_healthy",
      "rollback_promoted",
      "incident_resolved",
    ]);
    expect(state.incident).toMatchObject({
      status: "resolved",
      errorRate: 0.6,
      p95LatencyMs: 420,
      revision: 2,
    });
    expect(state.services.find((service) => service.id === "checkout-api")).toMatchObject({
      status: "healthy",
      version: "2026.08.30.2",
    });
    expect(receipt).toMatchObject({
      id: "receipt-1",
      status: "incident_resolved",
      productionMutations: 1,
      blockedEvidenceIds: ["log-third-party-injection"],
      fromRelease: "2026.08.30.3",
      toRelease: "2026.08.30.2",
    });
    state.incident.errorRate = 99;
    expect(receipt.finalErrorRate).toBe(0.6);
  });

  it("restores the exact incident snapshot after an operation failure", async () => {
    const { state, proposal } = setup();
    const before = structuredClone(state);
    const registry = {
      ...remediationOperationRegistry,
      "checkout.evaluate_canary": {
        ...remediationOperationRegistry["checkout.evaluate_canary"]!,
        execute: async () => {
          throw new Error("canary telemetry unavailable");
        },
      },
    };

    await expect(
      executeRemediation(proposal, { state, canaryPercent: 10, registry }),
    ).rejects.toMatchObject({ code: "OPERATION_FAILED" });
    expect(state).toEqual(before);
  });

  it("restores the exact incident snapshot when execution is cancelled", async () => {
    const { state, proposal } = setup();
    const before = structuredClone(state);
    const controller = new AbortController();

    await expect(
      executeRemediation(proposal, {
        state,
        canaryPercent: 10,
        signal: controller.signal,
        onProgress: (entry) => {
          if (entry.phase === "canary_started") controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "EXECUTION_CANCELLED" });
    expect(state).toEqual(before);
  });

  it("rejects a response policy that has already been consumed", async () => {
    const { state, proposal } = setup();
    proposal.policy.used = true;

    await expect(executeRemediation(proposal, { state, canaryPercent: 10 })).rejects.toEqual(
      expect.objectContaining<Partial<AirlockError>>({ code: "RESPONSE_ALREADY_USED" }),
    );
  });
});
