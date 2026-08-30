import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserSimulationDriver } from "../control/browserSimulationDriver";
import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { DynamicMissionToolManager } from "./dynamicToolManager";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";

async function stagedSetup(options: { wait?: (ms: number, signal: AbortSignal) => Promise<void> } = {}) {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry, { now: () => 1_000 });
  const driver = new BrowserSimulationDriver({
    readSnapshot: () => getFirebreakState().world,
    commitSnapshot: (snapshot) => getFirebreakState().replaceWorld(snapshot),
    wait: options.wait ?? (async () => undefined),
    playbackRate: 4,
  });
  const manager = new DynamicMissionToolManager(registry, {
    driver,
    now: () => 2_000,
  });
  await adapter.executeTool("scan_hazards", {
    incidentId: "WH-01",
    sensorMode: "thermal",
  });
  const simulation = (await adapter.executeTool("simulate_mission", {
    incidentId: "WH-01",
    strategy: "coordinated",
  })) as { data: { simulationId: string } };
  await adapter.executeTool("validate_safety_envelope", {
    simulationId: simulation.data.simulationId,
  });
  await adapter.executeTool("stage_mission_tool", {
    simulationId: simulation.data.simulationId,
    toolName: "execute_rescue_mission",
  });
  return { adapter, registry, manager };
}

describe("DynamicMissionToolManager", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
    useFirebreakStore.getState().startEmergency();
  });

  it("requires the visible authorization path before registering", async () => {
    const { adapter, manager } = await stagedSetup();
    const proposal = getFirebreakState().mission.proposal!;

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "execute_rescue_mission",
    );
    await expect(
      adapter.executeTool("execute_rescue_mission", { strategy: "coordinated" }),
    ).rejects.toMatchObject({ code: "TOOL_NOT_FOUND" });

    await manager.approveAndRegister(proposal.id);

    expect(getFirebreakState().mission.proposal?.status).toBe("registered");
    expect((await adapter.getTools()).map((tool) => tool.name)).toContain(
      "execute_rescue_mission",
    );
  });

  it("executes once, resolves the rescue, and unregisters itself", async () => {
    const { adapter, registry, manager } = await stagedSetup();
    await manager.approveAndRegister(getFirebreakState().mission.proposal!.id);

    const result = await adapter.executeTool("execute_rescue_mission", {
      strategy: "coordinated",
    });
    await registry.settleToolChanges();

    expect(result).toMatchObject({
      ok: true,
      code: "MISSION_EXECUTED",
      data: { rescuedWorkers: 2, safetyViolations: 0 },
    });
    expect(getFirebreakState().world.phase).toBe("resolved");
    expect(getFirebreakState().mission.receipt?.outcome).toBe("succeeded");
    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "execute_rescue_mission",
    );
    await expect(
      adapter.executeTool("execute_rescue_mission", { strategy: "coordinated" }),
    ).rejects.toMatchObject({ code: "TOOL_NOT_FOUND" });
  });

  it("rejects expanded dynamic input without moving robots", async () => {
    const { adapter, manager } = await stagedSetup();
    await manager.approveAndRegister(getFirebreakState().mission.proposal!.id);
    const before = structuredClone(getFirebreakState().world.robots);

    const result = await adapter.executeTool("execute_rescue_mission", {
      strategy: "coordinated",
      targetTopic: "/any/topic",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT" });
    expect(getFirebreakState().world.robots).toEqual(before);
  });

  it("revokes active authority and records cancellation", async () => {
    const wait = (_ms: number, signal: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    const { adapter, manager } = await stagedSetup({ wait });
    await manager.approveAndRegister(getFirebreakState().mission.proposal!.id);

    const execution = adapter.executeTool("execute_rescue_mission", {
      strategy: "coordinated",
    });
    await vi.waitFor(() => expect(getFirebreakState().world.phase).toBe("executing"));
    manager.revoke("Operator emergency stop");
    const result = await execution;

    expect(result).toMatchObject({ ok: false, code: "EXECUTION_CANCELLED" });
    expect(getFirebreakState().mission.receipt?.outcome).toBe("cancelled");
    expect(getFirebreakState().mission.receipt?.reason).toContain(
      "Operator emergency stop",
    );
  });
});
