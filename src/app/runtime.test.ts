import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "../store/useAppStore";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { bootAppRuntime } from "./runtime";

describe("Airlock runtime", () => {
  beforeEach(async () => {
    useAppStore.getState().setPersistenceStorage(undefined);
    await useAppStore.getState().reset();
    Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
  });

  it("boots the same seven tools in ordinary-browser memory mode", async () => {
    const runtime = await bootAppRuntime();
    expect(runtime.adapter.mode).toBe("memory");
    expect((await runtime.adapter.getTools()).map((tool) => tool.name)).toEqual(STATIC_TOOL_NAMES);
    runtime.dispose();
  });
});
