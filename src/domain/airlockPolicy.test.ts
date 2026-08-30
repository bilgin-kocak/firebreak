import { describe, expect, it } from "vitest";

import type { RemediationSimulation } from "./airlockTypes";
import { AirlockError } from "./airlockTypes";
import { validateResponseProposal, type ResponseProposalInput } from "./airlockPolicy";
import { createCanonicalPolicy, trustedRemediationOperationIds } from "./incidentSeed";

const simulation: RemediationSimulation = {
  id: "simulation-1",
  incidentId: "INC-4821",
  incidentRevision: 1,
  targetServiceId: "checkout-api",
  currentRelease: "2026.08.30.3",
  targetRelease: "2026.08.30.2",
  canaryPercent: 10,
  predictedErrorRate: 0.6,
  predictedP95LatencyMs: 420,
  rollbackAvailable: true,
  productionMutations: 1,
  planHash: "airlock-1-checkout-api-2026.08.30.2-10",
  createdAt: "2026-08-30T09:01:00.000Z",
};

const input = (
  operations: readonly string[] = trustedRemediationOperationIds,
): ResponseProposalInput => ({
  incidentId: "INC-4821",
  name: "rollback_checkout_release",
  title: "Rollback checkout safely",
  description: "Canary the previous stable release, promote it when healthy, and resolve INC-4821.",
  simulationId: "simulation-1",
  incidentRevision: 1,
  operations: operations.map((operationId) => ({ operationId })),
});

const expectCode = (run: () => unknown, code: AirlockError["code"]) => {
  expect(run).toThrowError(AirlockError);
  try {
    run();
  } catch (error) {
    expect((error as AirlockError).code).toBe(code);
  }
};

describe("validateResponseProposal", () => {
  it("compiles the exact trusted rollback into an awaiting-approval proposal", () => {
    const proposal = validateResponseProposal(input(), {
      policy: createCanonicalPolicy(new Date("2026-08-30T09:00:00.000Z")),
      simulation,
      now: new Date("2026-08-30T09:02:00.000Z"),
      createId: () => "response-1",
    });

    expect(proposal).toMatchObject({
      id: "response-1",
      name: "rollback_checkout_release",
      simulationId: "simulation-1",
      incidentRevision: 1,
      status: "awaiting_approval",
    });
    expect(proposal.operations.map((step) => step.operationId)).toEqual([
      ...trustedRemediationOperationIds,
    ]);
  });

  it("rejects unknown operations atomically", () => {
    expectCode(
      () =>
        validateResponseProposal(input(["system.capture_snapshot", "customer.export_data"]), {
          policy: createCanonicalPolicy(),
          simulation,
        }),
      "OPERATION_NOT_ALLOWLISTED",
    );
  });

  it("rejects cross-service operations even when their name resembles a remediation", () => {
    expectCode(
      () =>
        validateResponseProposal(input(["system.capture_snapshot", "payments.promote_rollback"]), {
          policy: {
            ...createCanonicalPolicy(),
            allowedOperationIds: ["system.capture_snapshot", "payments.promote_rollback"],
          },
          simulation,
        }),
      "CROSS_SERVICE_OPERATION",
    );
  });

  it("rejects operation order that skips a dependency", () => {
    const reversed = [...trustedRemediationOperationIds];
    [reversed[2], reversed[3]] = [reversed[3]!, reversed[2]!];
    expectCode(
      () =>
        validateResponseProposal(input(reversed), { policy: createCanonicalPolicy(), simulation }),
      "DEPENDENCY_ORDER_INVALID",
    );
  });

  it("rejects an expired policy", () => {
    expectCode(
      () =>
        validateResponseProposal(input(), {
          policy: createCanonicalPolicy(new Date("2026-08-30T09:00:00.000Z")),
          simulation,
          now: new Date("2026-08-30T09:10:00.001Z"),
        }),
      "POLICY_EXPIRED",
    );
  });

  it("rejects a simulation for an older incident revision", () => {
    expectCode(
      () =>
        validateResponseProposal(input(), {
          policy: { ...createCanonicalPolicy(), simulationRevision: 2 },
          simulation,
        }),
      "SIMULATION_STALE",
    );
  });

  it("rejects more production mutations than the policy permits", () => {
    expectCode(
      () =>
        validateResponseProposal(input(), {
          policy: createCanonicalPolicy(),
          simulation: { ...simulation, productionMutations: 2 as 1 },
        }),
      "MUTATION_BUDGET_EXCEEDED",
    );
  });
});
