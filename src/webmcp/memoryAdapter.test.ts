import { describe, expect, it, vi } from "vitest";

import { createMemoryAdapter } from "./memoryAdapter";
import { createNativeAdapter } from "./nativeAdapter";
import type { WebMCPToolDefinition } from "./types";

const tool = (execute: WebMCPToolDefinition["execute"] = async (input) => input) => ({
  name: "inspect_incident",
  description: "Inspect the incident.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  execute,
});

describe("native WebMCP adapter", () => {
  it("delegates registration, execution, discovery, and toolchange to the top-level modelContext", async () => {
    const registerTool = vi.fn(async () => undefined);
    const getTools = vi.fn(async () => []);
    const executeTool = vi.fn(async () => ({ ok: true }));
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const modelContext = {
      registerTool,
      getTools,
      executeTool,
      addEventListener,
      removeEventListener,
    };
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const adapter = createNativeAdapter(document.modelContext!);
    const controller = new AbortController();
    const listener = vi.fn();

    await adapter.registerTool(tool(), { signal: controller.signal });
    await adapter.executeTool("inspect_incident", {}, controller.signal);
    await adapter.getTools();
    const unsubscribe = adapter.subscribeToToolChange(listener);
    unsubscribe();

    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "inspect_incident" }),
      {
        signal: controller.signal,
      },
    );
    expect(executeTool).toHaveBeenCalledWith("inspect_incident", {}, { signal: controller.signal });
    expect(addEventListener).toHaveBeenCalledWith("toolchange", listener);
    expect(removeEventListener).toHaveBeenCalledWith("toolchange", listener);
    Reflect.deleteProperty(document, "modelContext");
  });
});

describe("memory WebMCP adapter", () => {
  it("registers, lists, and executes the same handler with parsed JSON input", async () => {
    const adapter = createMemoryAdapter();
    await adapter.registerTool(tool());

    expect(await adapter.getTools()).toEqual([
      expect.objectContaining({ name: "inspect_incident", description: "Inspect the incident." }),
    ]);
    await expect(
      adapter.executeTool("inspect_incident", '{"incidentId":"INC-4821"}'),
    ).resolves.toEqual({
      incidentId: "INC-4821",
    });
  });

  it("rejects duplicate names instead of replacing the first handler", async () => {
    const adapter = createMemoryAdapter();
    await adapter.registerTool(tool(async () => "first"));

    await expect(adapter.registerTool(tool(async () => "second"))).rejects.toMatchObject({
      code: "TOOL_ALREADY_REGISTERED",
    });
    await expect(adapter.executeTool("inspect_incident", {})).resolves.toBe("first");
  });

  it("emits local toolchange events on registration and abort unregistration", async () => {
    const adapter = createMemoryAdapter();
    const listener = vi.fn();
    const unsubscribe = adapter.subscribeToToolChange(listener);
    const controller = new AbortController();

    await adapter.registerTool(tool(), { signal: controller.signal });
    controller.abort();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(await adapter.getTools()).toEqual([]);
    unsubscribe();
  });

  it("forwards execution cancellation without installing anything on document", async () => {
    const documentBefore = document.modelContext;
    const adapter = createMemoryAdapter();
    let receivedSignal: AbortSignal | undefined;
    await adapter.registerTool(
      tool(async (_input, context) => {
        receivedSignal = context?.signal;
        return { aborted: context?.signal?.aborted };
      }),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(adapter.executeTool("inspect_incident", {}, controller.signal)).resolves.toEqual({
      aborted: true,
    });
    expect(receivedSignal).toBe(controller.signal);
    expect(document.modelContext).toBe(documentBefore);
  });
});
