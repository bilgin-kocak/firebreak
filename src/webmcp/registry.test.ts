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
    expect(getFirebreakState().webmcp.trace.at(-1)).toMatchObject({
      status: "blocked",
      inputSummary: '{"incidentId":"WH-01"}',
    });
    expect(getFirebreakState().webmcp.trace.at(-1)?.inputSummary).not.toContain("arbitraryCode");
  });

  it("marks an explicit failure result as blocked even when the handler returns it", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registry.register(
      definition(async () => ({
        ok: false,
        code: "SAFETY_CHECKS_FAILED",
        message: "Safety proof rejected.",
        retryable: false,
      })),
    );

    await adapter.executeTool("inspect_emergency", { incidentId: "WH-01" });

    expect(getFirebreakState().webmcp.trace.at(-1)).toMatchObject({
      status: "blocked",
      code: "SAFETY_CHECKS_FAILED",
    });
  });

  it("stores only bounded code-owned result fields in the trace", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registry.register(
      definition(async () => ({
        ok: false,
        code: "X".repeat(500),
        message: "M".repeat(500),
        data: { secret: "must-never-enter-the-trace" },
      })),
    );

    await adapter.executeTool("inspect_emergency", { incidentId: "WH-01" });

    const trace = getFirebreakState().webmcp.trace.at(-1);
    expect(trace?.code).toHaveLength(64);
    expect(trace?.message).toHaveLength(180);
    expect(JSON.stringify(trace)).not.toContain("must-never-enter-the-trace");
  });

  it("bounds opaque declared strings before storing their trace summary", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    const opaqueDefinition: RegistryToolDefinition<{ simulationId: string }> = {
      name: "validate_safety_envelope",
      description: "Validate one opaque simulation identifier.",
      inputSchema: {
        type: "object",
        properties: { simulationId: { type: "string", minLength: 1 } },
        required: ["simulationId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      inputValidator: z.object({ simulationId: z.string().min(1) }).strict(),
      origin: "built_in",
      execute: async () => ({ ok: true, code: "VALIDATED", message: "Validated." }),
    };
    await registry.register(opaqueDefinition);

    await adapter.executeTool("validate_safety_envelope", { simulationId: "x".repeat(500) });

    expect(getFirebreakState().webmcp.trace.at(-1)?.inputSummary).toBe(
      '{"simulationId":"<string:500>"}',
    );
  });

  it("fails closed when a hostile input getter cannot be summarized", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registry.register(definition());
    const hostile = Object.defineProperty({}, "incidentId", {
      enumerable: true,
      get() {
        throw new Error("hostile getter");
      },
    });

    await expect(adapter.executeTool("inspect_emergency", hostile)).resolves.toMatchObject({
      ok: false,
      code: "OPERATION_FAILED",
    });
    expect(getFirebreakState().webmcp.trace.at(-1)).toMatchObject({
      status: "blocked",
      inputSummary: "[unavailable]",
    });
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

    expect(getFirebreakState().webmcp.trace).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "inspect_emergency",
        status: "blocked",
        code: "SAFETY_CHECKS_FAILED",
        inputSummary: '{"incidentId":"WH-01"}',
      }),
    ]);
  });

  it("shows a tool call as running before completing it with a result and duration", async () => {
    const adapter = createMemoryAdapter();
    let finish!: (value: { ok: true; code: string; message: string }) => void;
    const registry = new ToolRegistry(adapter, {
      now: (() => {
        let current = 1_000;
        return () => {
          current += 25;
          return current;
        };
      })(),
    });
    await registry.register(
      definition(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );

    const execution = adapter.executeTool("inspect_emergency", { incidentId: "WH-01" });

    expect(getFirebreakState().webmcp.trace).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "inspect_emergency",
        status: "running",
        inputSummary: '{"incidentId":"WH-01"}',
      }),
    ]);

    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish({ ok: true, code: "EMERGENCY_INSPECTED", message: "Emergency inspected." });
    await execution;

    expect(getFirebreakState().webmcp.trace).toEqual([
      expect.objectContaining({
        kind: "tool",
        name: "inspect_emergency",
        status: "succeeded",
        code: "EMERGENCY_INSPECTED",
        message: "Emergency inspected.",
        durationMs: 25,
      }),
    ]);
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
