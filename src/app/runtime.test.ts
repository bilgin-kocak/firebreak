import { beforeEach, describe, expect, it } from "vitest";

import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { bootAppRuntime } from "./runtime";

describe("Firebreak runtime", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("boots seven tools and completes the two-prompt journey in memory mode", async () => {
    const runtime = await bootAppRuntime({ accelerated: true });
    expect(runtime.adapter.mode).toBe("memory");
    expect((await runtime.adapter.getTools()).map((tool) => tool.name)).toEqual(
      STATIC_TOOL_NAMES,
    );

    useFirebreakStore.getState().startEmergency();
    await runtime.runPromptA();
    expect(getFirebreakState().mission.proposal?.status).toBe("staged");

    await runtime.authorizeMission(getFirebreakState().mission.proposal!.id);
    expect((await runtime.adapter.getTools()).map((tool) => tool.name)).toContain(
      "execute_rescue_mission",
    );

    await runtime.runPromptB();
    expect(getFirebreakState().world.phase).toBe("resolved");
    expect((await runtime.adapter.getTools()).map((tool) => tool.name)).toEqual(
      STATIC_TOOL_NAMES,
    );

    await runtime.destroy();
    expect(await runtime.adapter.getTools()).toEqual([]);
  });
});
