import { beforeEach, describe, expect, it } from "vitest";

import { trustedRemediationOperationIds } from "../domain/incidentSeed";
import { getAppState, useAppStore } from "../store/useAppStore";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";
import { STATIC_TOOL_NAMES } from "./staticToolDefinitions";

const setup = async () => {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry, { now: () => new Date("2026-08-30T09:02:00.000Z") });
  return { adapter, registry };
};

describe("seven static Airlock tools", () => {
  beforeEach(async () => {
    useAppStore.getState().setPersistenceStorage(undefined);
    await useAppStore.getState().reset();
  });

  it("registers exactly seven closed-schema tools with truthful trust annotations", async () => {
    const { adapter } = await setup();
    const tools = await adapter.getTools();
    expect(tools.map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
    expect(tools).toHaveLength(7);
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(tools.find((tool) => tool.name === "query_telemetry")?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(tools.filter((tool) => tool.annotations.untrustedContentHint)).toHaveLength(1);
    expect(tools.map((tool) => tool.name).join(" ")).not.toMatch(/portal|permit|civic|view/);
  });

  it("rejects unknown input fields before domain execution", async () => {
    const { adapter } = await setup();
    await expect(
      adapter.executeTool("inspect_incident", { incidentId: "INC-4821", execute: "anything" }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT" });
  });

  it("inspects the incident and deployment correlation without exposing executors", async () => {
    const { adapter } = await setup();
    await expect(
      adapter.executeTool("inspect_incident", { incidentId: "INC-4821" }),
    ).resolves.toMatchObject({
      ok: true,
      code: "INCIDENT_INSPECTED",
      data: { incident: { errorRate: 31.8, p95LatencyMs: 4820 }, serviceCount: 5 },
    });
    const deployments = await adapter.executeTool("inspect_deployments", {
      serviceId: "checkout-api",
    });
    expect(deployments).toMatchObject({
      ok: true,
      data: { currentRelease: "2026.08.30.3", previousStableRelease: "2026.08.30.2" },
    });
    expect(JSON.stringify(deployments)).not.toContain("execute");
  });

  it("returns bounded untrusted telemetry and visibly quarantines the injected instruction", async () => {
    const { adapter } = await setup();
    const result = await adapter.executeTool("query_telemetry", {
      incidentId: "INC-4821",
      serviceId: "checkout-api",
      limit: 8,
    });
    expect(result).toMatchObject({
      ok: true,
      code: "TELEMETRY_QUERIED",
      data: {
        quarantinedEvidenceIds: ["log-third-party-injection"],
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: "log-third-party-injection",
            trust: "untrusted",
            quarantined: true,
          }),
        ]),
      },
    });
    expect(getAppState().assessments["log-third-party-injection"]).toMatchObject({
      trustedForAction: false,
      injectionRisk: true,
    });
  });

  it("simulates, checks, and stages the exact rollback without registering it", async () => {
    const { adapter } = await setup();
    await adapter.executeTool("query_telemetry", {
      incidentId: "INC-4821",
      limit: 8,
    });
    const simulation = (await adapter.executeTool("simulate_remediation", {
      incidentId: "INC-4821",
      serviceId: "checkout-api",
      canaryPercent: 10,
    })) as { ok: boolean; data: { simulationId: string } };
    expect(simulation).toMatchObject({
      ok: true,
      code: "REMEDIATION_SIMULATED",
      data: { predictedErrorRate: 0.6, predictedP95LatencyMs: 420 },
    });
    const checks = await adapter.executeTool("run_airlock_checks", {
      simulationId: simulation.data.simulationId,
    });
    expect(checks).toMatchObject({
      ok: true,
      code: "AIRLOCK_CHECKS_COMPLETED",
      data: { checkCount: 9, blockingFailures: 0 },
    });
    const staged = await adapter.executeTool("stage_response_tool", {
      simulationId: simulation.data.simulationId,
      name: "rollback_checkout_release",
      title: "Rollback checkout release",
      description: "Canary and restore the previous stable checkout release.",
      operationIds: [...trustedRemediationOperationIds],
    });
    expect(staged).toMatchObject({
      ok: true,
      code: "RESPONSE_TOOL_STAGED",
      data: { status: "awaiting_approval", requiresHumanApproval: true },
    });
    expect(getAppState().dialogs.proposalSheetOpen).toBe(true);
    expect(getAppState().approvedResponseTools).toEqual({});
    expect((await adapter.getTools()).map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
  });

  it("refuses staging without a current passing proof and lists a compact response surface", async () => {
    const { adapter } = await setup();
    const staged = await adapter.executeTool("stage_response_tool", {
      simulationId: "missing",
      name: "rollback_checkout_release",
      title: "Rollback checkout release",
      description: "Canary and restore the previous stable checkout release.",
      operationIds: [...trustedRemediationOperationIds],
    });
    expect(staged).toMatchObject({ ok: false, code: "SIMULATION_NOT_FOUND" });
    await expect(adapter.executeTool("list_response_tools", {})).resolves.toMatchObject({
      ok: true,
      data: { staged: [], approved: [] },
    });
  });
});
