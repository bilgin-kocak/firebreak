import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FirebreakError } from "../domain/firebreakTypes";
import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { createMemoryAdapter } from "./memoryAdapter";
import { ToolRegistry } from "./registry";
import type { RegistryToolDefinition } from "./types";

function definition(
  execute: RegistryToolDefinition<{ incidentId: "WH-01" }>["execute"] = vi.fn(async () => ({
    ok: true,
  })),
) {
  return {
    name: "inspect_emergency",
    description: "Inspect the active warehouse emergency.",
    inputSchema: {
      type: "object",
      properties: { incidentId: { type: "string", enum: ["WH-01"] } },
      required: ["incidentId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputValidator: z.object({ incidentId: z.literal("WH-01") }).strict(),
    origin: "built_in" as const,
    execute,
  };
}

describe("WebMCP tool registry", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
  });

  it("registers definitions, records origin, and prevents duplicates", async () => {
    const registry = new ToolRegistry(createMemoryAdapter());
    await registry.register(definition());

    expect(registry.getRegistrations()).toEqual([
      expect.objectContaining({ name: "inspect_emergency", origin: "built_in" }),
    ]);
    await expect(registry.register(definition())).rejects.toMatchObject({
      code: "TOOL_ALREADY_REGISTERED",
    });
    expect(getFirebreakState().webmcp.registeredToolNames).toEqual(["inspect_emergency"]);
  });

  it("validates inputs before domain execution and returns compact failures", async () => {
    const adapter = createMemoryAdapter();
    const execute = vi.fn(async () => ({ ok: true }));
    const registry = new ToolRegistry(adapter);
    await registry.register(definition(execute));

    const result = await adapter.executeTool("inspect_emergency", {
      incidentId: "WH-01",
      arbitraryCode: "alert(1)",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_TOOL_INPUT",
      retryable: true,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result).length).toBeLessThan(1_500);
    expect(getFirebreakState().webmcp.toolCallCount).toBe(1);
  });

  it("converts domain failures into structured tool results", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registry.register(
      definition(async () => {
        throw new FirebreakError(
          "SAFETY_CHECKS_FAILED",
          "Current robot routes do not pass the safety envelope.",
          { failedCheckIds: ["geofence"] },
        );
      }),
    );

    await expect(
      adapter.executeTool("inspect_emergency", { incidentId: "WH-01" }),
    ).resolves.toEqual({
      ok: false,
      code: "SAFETY_CHECKS_FAILED",
      message: "Current robot routes do not pass the safety envelope.",
      retryable: false,
      details: { failedCheckIds: ["geofence"] },
    });
  });

  it("reconciles metadata when AbortController unregisters a tool", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    const controller = new AbortController();
    await registry.register(definition(), { signal: controller.signal });

    controller.abort();
    await vi.waitFor(() => {
      expect(registry.getRegistrations()).toEqual([]);
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual([]);
      expect(getFirebreakState().webmcp.lastToolChangeAt).not.toBeNull();
    });
  });
});
