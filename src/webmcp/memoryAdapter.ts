import { FirebreakError } from "../domain/firebreakTypes";
import type { WebMCPAdapter } from "./adapter";
import type { WebMCPToolDefinition, WebMCPToolMetadata } from "./types";

const parseInput = (input: unknown): unknown => {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    // Preserve malformed text for the registry's Zod/error/logging boundary.
    return input;
  }
};

export const createMemoryAdapter = (): WebMCPAdapter => {
  const tools = new Map<string, WebMCPToolDefinition>();
  const listeners = new Set<() => void>();
  const emitToolChange = () => listeners.forEach((listener) => listener());

  return {
    mode: "memory",
    async registerTool(definition, options) {
      if (tools.has(definition.name)) {
        throw new FirebreakError(
          "TOOL_ALREADY_REGISTERED",
          `Tool '${definition.name}' is already registered.`,
        );
      }
      if (options?.signal?.aborted) return;
      tools.set(definition.name, definition);
      emitToolChange();
      options?.signal?.addEventListener(
        "abort",
        () => {
          if (tools.delete(definition.name)) emitToolChange();
        },
        { once: true },
      );
    },
    async getTools(): Promise<WebMCPToolMetadata[]> {
      return [...tools.values()].map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      }));
    },
    async executeTool(name, input, signal) {
      const definition = tools.get(name);
      if (!definition) {
        throw new FirebreakError("TOOL_NOT_FOUND", `Tool '${name}' is not registered.`);
      }
      return definition.execute(parseInput(input), { signal });
    },
    subscribeToToolChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
