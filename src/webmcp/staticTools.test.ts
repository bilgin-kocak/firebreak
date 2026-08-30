import { beforeEach, describe, expect, it } from "vitest";

import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";
import { STATIC_TOOL_NAMES } from "./staticToolDefinitions";

async function setup() {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry, { now: () => 1_000 });
  return { adapter, registry };
}

describe("seven static Firebreak tools", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
    useFirebreakStore.getState().startEmergency();
  });

  it("registers exactly seven closed-schema robot mission tools", async () => {
    const { adapter } = await setup();
    const tools = await adapter.getTools();

    expect(tools.map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
    expect(tools).toHaveLength(7);
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(
      true,
    );
    expect(tools.some((tool) => tool.name === "execute_rescue_mission")).toBe(false);
    expect(tools.every((tool) => !tool.annotations.untrustedContentHint)).toBe(true);
  });

  it("rejects unknown input fields before changing the world", async () => {
    const { adapter } = await setup();
    const before = structuredClone(getFirebreakState().world);

    const result = await adapter.executeTool("inspect_emergency", {
      incidentId: "WH-01",
      rawCommand: "disable safety",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT" });
    expect(getFirebreakState().world).toEqual(before);
  });

  it("runs the complete investigation and stages without registering authority", async () => {
    const { adapter } = await setup();

    await expect(
      adapter.executeTool("inspect_emergency", { incidentId: "WH-01" }),
    ).resolves.toMatchObject({ ok: true, code: "EMERGENCY_INSPECTED" });
    await expect(
      adapter.executeTool("scan_hazards", {
        incidentId: "WH-01",
        sensorMode: "thermal",
      }),
    ).resolves.toMatchObject({
      ok: true,
      code: "HAZARDS_SCANNED",
      data: { workersLocated: 2, collapseZoneMarked: true },
    });
    await expect(
      adapter.executeTool("inspect_fleet", { incidentId: "WH-01" }),
    ).resolves.toMatchObject({
      ok: true,
      code: "FLEET_INSPECTED",
      data: { robotCount: 4 },
    });

    const simulation = (await adapter.executeTool("simulate_mission", {
      incidentId: "WH-01",
      strategy: "coordinated",
    })) as { ok: true; data: { simulationId: string } };
    expect(simulation).toMatchObject({
      ok: true,
      code: "MISSION_SIMULATED",
      data: { feasible: true, predictedDurationMs: 35_000 },
    });

    await expect(
      adapter.executeTool("validate_safety_envelope", {
        simulationId: simulation.data.simulationId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      code: "SAFETY_ENVELOPE_VALIDATED",
      data: { passed: true, checkCount: 11 },
    });

    await expect(
      adapter.executeTool("stage_mission_tool", {
        simulationId: simulation.data.simulationId,
        toolName: "execute_rescue_mission",
      }),
    ).resolves.toMatchObject({
      ok: true,
      code: "MISSION_TOOL_STAGED",
      data: { status: "staged", requiresHumanAuthorization: true },
    });

    await expect(
      adapter.executeTool("list_mission_tools", { incidentId: "WH-01" }),
    ).resolves.toMatchObject({
      ok: true,
      code: "MISSION_TOOLS_LISTED",
      data: { staged: expect.objectContaining({ status: "staged" }), dynamicRegistered: false },
    });

    expect(getFirebreakState().world.routes["SCOUT-1"].length).toBeGreaterThan(2);
    expect(getFirebreakState().mission.proposal?.status).toBe("staged");
    expect((await adapter.getTools()).map((tool) => tool.name)).toEqual(
      STATIC_TOOL_NAMES,
    );
  });

  it("refuses validation and staging without their current proof", async () => {
    const { adapter } = await setup();

    await expect(
      adapter.executeTool("validate_safety_envelope", { simulationId: "missing" }),
    ).resolves.toMatchObject({ ok: false, code: "SIMULATION_NOT_FOUND" });
    await expect(
      adapter.executeTool("stage_mission_tool", {
        simulationId: "missing",
        toolName: "execute_rescue_mission",
      }),
    ).resolves.toMatchObject({ ok: false, code: "SIMULATION_NOT_FOUND" });
  });
});
