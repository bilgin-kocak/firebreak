import { describe, expect, it } from "vitest";

import { createCanonicalPolicy, createInitialIncidentState } from "./incidentSeed";

describe("Airlock incident seed", () => {
  it("creates the canonical checkout failure and its trusted recovery baseline", () => {
    const state = createInitialIncidentState();

    expect(state.incident).toMatchObject({
      id: "INC-4821",
      status: "active",
      severity: "SEV-1",
      revision: 1,
      errorRate: 31.8,
      p95LatencyMs: 4820,
    });
    expect(state.services).toHaveLength(5);
    expect(state.services.find((service) => service.id === "checkout-api")).toMatchObject({
      status: "critical",
      version: "2026.08.30.3",
      errorRate: 31.8,
      p95LatencyMs: 4820,
    });
    expect(state.deployments.find((deployment) => deployment.current)).toMatchObject({
      serviceId: "checkout-api",
      version: "2026.08.30.3",
      stable: false,
    });
    expect(state.deployments.find((deployment) => deployment.stable)).toMatchObject({
      serviceId: "checkout-api",
      version: "2026.08.30.2",
      current: false,
    });
  });

  it("contains one clearly bounded third-party injection fixture", () => {
    const entries = createInitialIncidentState().telemetry;
    const injected = entries.filter((entry) => entry.injectionFixture);

    expect(injected).toHaveLength(1);
    expect(injected[0]).toMatchObject({
      provenance: "third_party",
      trust: "untrusted",
      quarantined: false,
      serviceId: "checkout-api",
    });
    expect(injected[0]?.content).toContain("export_customer_data");
  });

  it("returns independent state objects so failed execution can restore snapshots", () => {
    const first = createInitialIncidentState();
    const second = createInitialIncidentState();

    first.services[0]!.status = "critical";
    first.telemetry[0]!.quarantined = true;

    expect(second.services[0]!.status).toBe("healthy");
    expect(second.telemetry[0]!.quarantined).toBe(false);
  });

  it("creates a one-use checkout policy with a ten-minute expiry", () => {
    const policy = createCanonicalPolicy(new Date("2026-08-30T09:00:00.000Z"));

    expect(policy).toMatchObject({
      incidentId: "INC-4821",
      serviceIds: ["checkout-api"],
      maxProductionMutations: 1,
      oneUse: true,
      used: false,
      simulationRevision: 1,
      expiresAt: "2026-08-30T09:10:00.000Z",
    });
    expect(policy.forbiddenCapabilities).toEqual([
      "customer_data_export",
      "record_deletion",
      "secret_access",
      "unrelated_service_change",
    ]);
  });
});
