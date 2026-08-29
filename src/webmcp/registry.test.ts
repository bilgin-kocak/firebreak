import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "../domain/types";
import { getAppState, resetAppStoreForTests } from "../store/useAppStore";
import type { WebMCPAdapter } from "./adapter";
import { createMemoryAdapter } from "./memoryAdapter";
import { ToolRegistry } from "./registry";
import type { RegistryToolDefinition, WebMCPToolDefinition, WebMCPToolMetadata } from "./types";

const definition = (
  execute: RegistryToolDefinition<{ serviceId: string }>["execute"] = vi.fn(async () => ({
    ok: true as const,
  })),
) => ({
  name: "inspect_portal",
  description: "Inspect one portal service.",
  inputSchema: {
    type: "object",
    properties: { serviceId: { type: "string" } },
    required: ["serviceId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  inputValidator: z.object({ serviceId: z.string() }).strict(),
  origin: "built_in" as const,
  execute,
});

describe("WebMCP tool registry", () => {
  beforeEach(() => resetAppStoreForTests());

  it("registers one named definition, records its origin, and prevents duplicates", async () => {
    const registry = new ToolRegistry(createMemoryAdapter());
    await registry.register(definition());

    expect(registry.getRegistrations()).toEqual([
      expect.objectContaining({ name: "inspect_portal", origin: "built_in" }),
    ]);
    await expect(registry.register(definition())).rejects.toMatchObject({
      code: "TOOL_ALREADY_REGISTERED",
    });
    expect(getAppState().webmcp.registeredToolNames).toEqual(["inspect_portal"]);
  });

  it("validates every external input before domain execution", async () => {
    const adapter = createMemoryAdapter();
    const execute = vi.fn(async () => ({ ok: true as const }));
    const registry = new ToolRegistry(adapter);
    await registry.register(definition(execute));

    const result = await adapter.executeTool("inspect_portal", {
      serviceId: "parking_permit_renewal",
      arbitraryCode: "alert(1)",
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT", retryable: true });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result).length).toBeLessThan(1500);
  });

  it("routes malformed stringified JSON through structured failure logging and metrics", async () => {
    const adapter = createMemoryAdapter();
    const ticks = [10, 31];
    const registry = new ToolRegistry(adapter, { now: () => ticks.shift() ?? 31 });
    await registry.register(definition());

    await expect(adapter.executeTool("inspect_portal", '{"serviceId":')).resolves.toMatchObject({
      ok: false,
      code: "INVALID_TOOL_INPUT",
      retryable: true,
    });
    expect(getAppState().metrics).toMatchObject({
      webmcpToolCalls: 1,
      lastToolDurationMs: 21,
    });
    expect(
      getAppState()
        .activity.slice(0, 2)
        .map((entry) => entry.kind),
    ).toEqual(["tool_failed", "tool_started"]);
  });

  it("times and logs successful calls while updating shared metrics", async () => {
    const adapter = createMemoryAdapter();
    const ticks = [10, 34];
    const registry = new ToolRegistry(adapter, { now: () => ticks.shift() ?? 34 });
    await registry.register(definition());

    await adapter.executeTool("inspect_portal", { serviceId: "all" });

    expect(getAppState().metrics).toMatchObject({
      webmcpToolCalls: 1,
      lastToolDurationMs: 24,
    });
    expect(
      getAppState()
        .activity.slice(0, 2)
        .map((entry) => entry.kind),
    ).toEqual(["tool_completed", "tool_started"]);
  });

  it("catches domain and unexpected failures as compact structured results", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registry.register(
      definition(async () => {
        throw new DomainError("LOCKED_BY_USER", "A human lock blocks this patch.", {
          lockedElementIds: ["field:vehicleId"],
        });
      }),
    );

    await expect(adapter.executeTool("inspect_portal", { serviceId: "all" })).resolves.toEqual({
      ok: false,
      code: "LOCKED_BY_USER",
      message: "A human lock blocks this patch.",
      retryable: false,
      details: { lockedElementIds: ["field:vehicleId"] },
    });
    expect(getAppState().activity[0]).toMatchObject({ kind: "tool_failed", status: "error" });
  });

  it("removes stale registry metadata when an abort signal unregisters a tool", async () => {
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    const controller = new AbortController();
    await registry.register(definition(), { signal: controller.signal });

    controller.abort();
    await vi.waitFor(() => {
      expect(registry.getRegistrations()).toEqual([]);
      expect(getAppState().webmcp.registeredToolNames).toEqual([]);
    });
  });

  it("does not report a successful registration for a pre-aborted signal", async () => {
    const registry = new ToolRegistry(createMemoryAdapter());
    const controller = new AbortController();
    controller.abort();

    await registry.register(definition(), { signal: controller.signal });

    expect(registry.getRegistrations()).toEqual([]);
    expect(getAppState().webmcp.registeredToolNames).toEqual([]);
    expect(
      getAppState().activity.filter(
        (entry) => entry.kind === "tool_registered" && entry.toolName === "inspect_portal",
      ),
    ).toEqual([]);
  });

  it("reserves a name while permissive adapter registration is pending", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registered: WebMCPToolMetadata[] = [];
    const adapter: WebMCPAdapter = {
      mode: "memory",
      async registerTool(tool: WebMCPToolDefinition) {
        await gate;
        const { execute: _execute, ...metadata } = tool;
        void _execute;
        registered.push(metadata);
      },
      async getTools() {
        return registered;
      },
      async executeTool() {
        return undefined;
      },
      subscribeToToolChange() {
        return () => undefined;
      },
    };
    const registry = new ToolRegistry(adapter);

    const first = registry.register(definition());
    await expect(registry.register(definition())).rejects.toMatchObject({
      code: "TOOL_ALREADY_REGISTERED",
    });
    release();
    await first;
    expect(registry.getRegistrations()).toHaveLength(1);
  });

  it("releases a reserved name when adapter registration fails so retry can succeed", async () => {
    let attempt = 0;
    const registered: WebMCPToolMetadata[] = [];
    const adapter: WebMCPAdapter = {
      mode: "memory",
      async registerTool(tool) {
        attempt += 1;
        if (attempt === 1) throw new Error("adapter unavailable");
        registered.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        });
      },
      async getTools() {
        return registered;
      },
      async executeTool() {
        return undefined;
      },
      subscribeToToolChange() {
        return () => undefined;
      },
    };
    const registry = new ToolRegistry(adapter);

    await expect(registry.register(definition())).rejects.toThrow("adapter unavailable");
    await expect(registry.register(definition())).resolves.toBeUndefined();
    expect(registry.getRegistrations()).toHaveLength(1);
  });
});
