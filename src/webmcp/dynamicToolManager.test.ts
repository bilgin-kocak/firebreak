import { beforeEach, describe, expect, it, vi } from "vitest";

import { runAirlockChecks } from "../domain/airlockChecks";
import { validateResponseProposal } from "../domain/airlockPolicy";
import { AirlockError } from "../domain/airlockTypes";
import { trustedRemediationOperationIds } from "../domain/incidentSeed";
import { simulateRemediation } from "../domain/remediationSimulator";
import { classifyEvidence } from "../domain/trustClassifier";
import { getAppState, useAppStore } from "../store/useAppStore";
import { DynamicToolManager } from "./dynamicToolManager";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";
import { STATIC_TOOL_NAMES } from "./staticToolDefinitions";

const stageCanonicalProposal = () => {
  const state = getAppState();
  const assessment = classifyEvidence(
    state.incidentState.telemetry.find((entry) => entry.id === "log-third-party-injection")!,
  );
  state.recordThreat(assessment);
  const simulation = simulateRemediation(state.incidentState, {
    serviceId: "checkout-api",
    canaryPercent: 10,
  });
  state.saveSimulation(simulation, 1);
  state.saveChecks(
    simulation.id,
    1,
    runAirlockChecks({
      state: getAppState().incidentState,
      simulation,
      assessments: [assessment],
      operationIds: [...trustedRemediationOperationIds],
    }),
  );
  const proposal = validateResponseProposal(
    {
      incidentId: "INC-4821",
      name: "rollback_checkout_release",
      title: "Rollback checkout release",
      description: "Canary and restore the previous stable checkout release.",
      simulationId: simulation.id,
      incidentRevision: 1,
      operations: trustedRemediationOperationIds.map((operationId) => ({ operationId })),
    },
    {
      policy: getAppState().incidentState.policy,
      simulation,
      createId: () => "response-1",
    },
  );
  getAppState().stageResponseTool(proposal);
  return proposal;
};

const setup = async () => {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry);
  const manager = new DynamicToolManager(registry);
  return { adapter, registry, manager };
};

describe("one-use rollback tool lifecycle", () => {
  beforeEach(async () => {
    useAppStore.getState().setPersistenceStorage(undefined);
    await useAppStore.getState().reset();
  });

  it("requires a staged proposal and visible human approval path", async () => {
    const { manager } = await setup();
    await expect(manager.approveAndRegister("missing")).rejects.toMatchObject({
      code: "HUMAN_APPROVAL_REQUIRED",
    });
  });

  it("registers one exact, closed, one-use rollback interface", async () => {
    const { adapter, manager } = await setup();
    const proposal = stageCanonicalProposal();
    const approved = await manager.approveAndRegister(proposal.id);
    const tool = (await adapter.getTools()).find(
      (definition) => definition.name === "rollback_checkout_release",
    );

    expect(approved).toMatchObject({ status: "registered", enabled: true });
    expect(tool).toMatchObject({
      name: "rollback_checkout_release",
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      inputSchema: {
        required: ["canaryPercent"],
        additionalProperties: false,
      },
    });
    expect(await adapter.getTools()).toHaveLength(8);
  });

  it("rejects unknown dynamic input without touching the incident", async () => {
    const { adapter, manager } = await setup();
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);
    const before = structuredClone(getAppState().incidentState);

    await expect(
      adapter.executeTool("rollback_checkout_release", {
        canaryPercent: 10,
        exportCustomerData: true,
      }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT" });
    expect(getAppState().incidentState).toEqual(before);
  });

  it("runs the trusted response, commits a receipt, then unregisters itself", async () => {
    vi.useFakeTimers();
    try {
      const { adapter, manager, registry } = await setup();
      const proposal = stageCanonicalProposal();
      await manager.approveAndRegister(proposal.id);

      await expect(
        adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 }),
      ).resolves.toMatchObject({
        ok: true,
        code: "INCIDENT_RESOLVED",
        data: { receiptId: expect.any(String), finalErrorRate: 0.6, finalP95LatencyMs: 420 },
      });
      expect(getAppState()).toMatchObject({
        recoveryPhase: "incident_resolved",
        incidentState: { incident: { status: "resolved", revision: 2 } },
        receipt: { productionMutations: 1, blockedEvidenceIds: ["log-third-party-injection"] },
      });

      await vi.runAllTimersAsync();
      await registry.settleToolChanges();
      expect((await adapter.getTools()).map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
      expect(getAppState().approvedResponseTools.rollback_checkout_release).toMatchObject({
        status: "completed",
        enabled: false,
      });
      await expect(
        adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 }),
      ).rejects.toMatchObject({ code: "TOOL_NOT_FOUND" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores exact state and keeps the tool registered when execution fails", async () => {
    const executeRemediation = vi.fn(async () => {
      throw new AirlockError("OPERATION_FAILED", "canary unavailable");
    });
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry, { executeRemediation });
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);
    const before = structuredClone(getAppState().incidentState);

    await expect(
      adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 }),
    ).resolves.toMatchObject({ ok: false, code: "OPERATION_FAILED" });
    expect(getAppState().incidentState).toEqual(before);
    expect(getAppState().receipt).toMatchObject({
      status: "failed",
      productionMutations: 0,
    });
    expect(getAppState().recoveryPhase).toBe("failed");
    expect((await adapter.getTools()).map((tool) => tool.name)).toContain(
      "rollback_checkout_release",
    );
  });

  it("records caller cancellation without consuming or unregistering the response", async () => {
    const { adapter, manager } = await setup();
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);
    const before = structuredClone(getAppState().incidentState);
    const execution = new AbortController();
    execution.abort();

    await expect(
      adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 }, execution.signal),
    ).resolves.toMatchObject({ ok: false, code: "EXECUTION_CANCELLED" });
    expect(getAppState().incidentState).toEqual(before);
    expect(getAppState().receipt).toMatchObject({
      status: "cancelled",
      productionMutations: 0,
    });
    expect(getAppState().approvedResponseTools.rollback_checkout_release).toMatchObject({
      status: "registered",
      enabled: true,
      policy: { used: false },
    });
  });

  it("allows only one in-flight invocation of the one-use response", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const executeRemediation = vi.fn(async () => {
      if (executeRemediation.mock.calls.length === 1) await firstGate;
      throw new AirlockError("OPERATION_FAILED", "test gate released");
    });
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry, { executeRemediation });
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);

    const first = adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 });
    await vi.waitFor(() => expect(executeRemediation).toHaveBeenCalledTimes(1));
    await expect(
      adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 }),
    ).resolves.toMatchObject({ ok: false, code: "RESPONSE_ALREADY_USED" });
    expect(executeRemediation).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(first).resolves.toMatchObject({ ok: false, code: "OPERATION_FAILED" });
  });

  it("cancels an in-flight response when its registration is disabled", async () => {
    const executeRemediation = vi.fn(
      async (_proposal, options) =>
        new Promise<never>((_resolve, reject) => {
          const cancel = () =>
            reject(new AirlockError("EXECUTION_CANCELLED", "registration revoked"));
          if (options.signal?.aborted) cancel();
          else options.signal?.addEventListener("abort", cancel, { once: true });
        }),
    );
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry, { executeRemediation });
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);
    const before = structuredClone(getAppState().incidentState);

    const execution = adapter.executeTool("rollback_checkout_release", { canaryPercent: 10 });
    await vi.waitFor(() => expect(executeRemediation).toHaveBeenCalledTimes(1));
    manager.disable("rollback_checkout_release");

    await expect(execution).resolves.toMatchObject({ ok: false, code: "EXECUTION_CANCELLED" });
    expect(getAppState().incidentState).toEqual(before);
    expect(getAppState().recoveryPhase).toBe("idle");
  });

  it("disables and deletes a registered response through human UI commands", async () => {
    const { adapter, manager, registry } = await setup();
    const proposal = stageCanonicalProposal();
    await manager.approveAndRegister(proposal.id);
    manager.disable("rollback_checkout_release");
    await registry.settleToolChanges();
    expect((await adapter.getTools()).map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
    expect(getAppState().approvedResponseTools.rollback_checkout_release?.enabled).toBe(false);

    manager.delete("rollback_checkout_release");
    expect(getAppState().approvedResponseTools).toEqual({});
  });
});
