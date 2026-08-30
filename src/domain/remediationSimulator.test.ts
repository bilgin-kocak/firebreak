import { describe, expect, it } from "vitest";

import { AirlockError } from "./airlockTypes";
import { createInitialIncidentState } from "./incidentSeed";
import { simulateRemediation } from "./remediationSimulator";

describe("simulateRemediation", () => {
  it.each([
    [5, 0.8, 520],
    [10, 0.6, 420],
    [25, 0.7, 460],
  ] as const)("predicts a bounded %i percent canary", (canaryPercent, errorRate, latency) => {
    const result = simulateRemediation(
      createInitialIncidentState(),
      { serviceId: "checkout-api", canaryPercent },
      new Date("2026-08-30T09:01:00.000Z"),
    );

    expect(result).toMatchObject({
      incidentRevision: 1,
      currentRelease: "2026.08.30.3",
      targetRelease: "2026.08.30.2",
      canaryPercent,
      predictedErrorRate: errorRate,
      predictedP95LatencyMs: latency,
      rollbackAvailable: true,
      productionMutations: 1,
    });
  });

  it("binds the plan hash to incident revision and canary", () => {
    const state = createInitialIncidentState();
    const first = simulateRemediation(state, { serviceId: "checkout-api", canaryPercent: 10 });
    const repeat = simulateRemediation(state, { serviceId: "checkout-api", canaryPercent: 10 });
    state.incident.revision = 2;
    const changed = simulateRemediation(state, { serviceId: "checkout-api", canaryPercent: 10 });

    expect(repeat.planHash).toBe(first.planHash);
    expect(changed.planHash).not.toBe(first.planHash);
  });

  it("rejects a canary outside the closed schema", () => {
    expect(() =>
      simulateRemediation(createInitialIncidentState(), {
        serviceId: "checkout-api",
        canaryPercent: 50 as 10,
      }),
    ).toThrowError(AirlockError);
  });
});
