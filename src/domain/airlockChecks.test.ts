import { describe, expect, it } from "vitest";

import { runAirlockChecks } from "./airlockChecks";
import { classifyEvidence } from "./trustClassifier";
import { createInitialIncidentState, trustedRemediationOperationIds } from "./incidentSeed";
import { simulateRemediation } from "./remediationSimulator";

describe("runAirlockChecks", () => {
  it("produces a complete passing proof for the quarantined canonical rollback", () => {
    const state = createInitialIncidentState();
    const assessments = state.telemetry.map(classifyEvidence);
    const simulation = simulateRemediation(state, {
      serviceId: "checkout-api",
      canaryPercent: 10,
    });
    const checks = runAirlockChecks({
      state,
      simulation,
      assessments,
      operationIds: [...trustedRemediationOperationIds],
      now: new Date("2026-08-30T09:02:00.000Z"),
    });

    expect(checks).toHaveLength(9);
    expect(checks.filter((check) => check.blocking && check.status === "fail")).toEqual([]);
    expect(checks.find((check) => check.id === "untrusted-evidence")).toMatchObject({
      status: "pass",
      blocking: true,
    });
  });

  it("fails when the injection fixture has not been quarantined", () => {
    const state = createInitialIncidentState();
    const simulation = simulateRemediation(state, {
      serviceId: "checkout-api",
      canaryPercent: 10,
    });
    const checks = runAirlockChecks({
      state,
      simulation,
      assessments: state.telemetry
        .filter((entry) => !entry.injectionFixture)
        .map(classifyEvidence),
      operationIds: [...trustedRemediationOperationIds],
    });

    expect(checks.find((check) => check.id === "untrusted-evidence")?.status).toBe("fail");
  });

  it("fails a simulation for a stale incident revision", () => {
    const state = createInitialIncidentState();
    const simulation = simulateRemediation(state, {
      serviceId: "checkout-api",
      canaryPercent: 10,
    });
    state.incident.revision = 2;
    const checks = runAirlockChecks({
      state,
      simulation,
      assessments: state.telemetry.map(classifyEvidence),
      operationIds: [...trustedRemediationOperationIds],
    });

    expect(checks.find((check) => check.id === "current-revision")?.status).toBe("fail");
  });
});
