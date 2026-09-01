import { FirebreakError } from "../domain/firebreakTypes";
import type { WebMCPAdapter } from "./adapter";
import type { WebMCPToolDefinition, WebMCPToolMetadata } from "./types";

type NativeModelContext = NonNullable<Document["modelContext"]>;

const metadataFor = (definition: WebMCPToolDefinition): WebMCPToolMetadata => ({
  name: definition.name,
  description: definition.description,
  inputSchema: definition.inputSchema,
  annotations: definition.annotations,
});

const parseInput = (input: unknown): unknown => {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
};

export const createNativeAdapter = (modelContext: NativeModelContext): WebMCPAdapter => {
  const definitions = new Map<string, WebMCPToolDefinition>();
  const listeners = new Set<() => void>();
  const hasNativeToolChange =
    typeof modelContext.addEventListener === "function" &&
    typeof modelContext.removeEventListener === "function";
  const emitLocalToolChange = () => listeners.forEach((listener) => listener());

  return {
    mode: "native",
    async registerTool(definition, options) {
      if (!document.modelContext) {
        throw new FirebreakError("UNSUPPORTED_BROWSER", "Native WebMCP is not available.");
      }
      // Keep the standard top-level integration explicit and reviewable in the production bundle.
      await document.modelContext.registerTool(definition, { signal: options?.signal });
      definitions.set(definition.name, definition);
      if (!hasNativeToolChange) emitLocalToolChange();
      options?.signal?.addEventListener(
        "abort",
        () => {
          if (definitions.delete(definition.name) && !hasNativeToolChange) {
            emitLocalToolChange();
          }
        },
        { once: true },
      );
    },
    async getTools() {
      if (typeof modelContext.getTools === "function") return modelContext.getTools();
      return [...definitions.values()].map(metadataFor);
    },
    async executeTool(name, input, signal) {
      if (
        typeof modelContext.getTools === "function" &&
        typeof modelContext.executeTool === "function"
      ) {
        const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
        if (!tool) {
          throw new FirebreakError("TOOL_NOT_FOUND", `Tool '${name}' is not registered.`);
        }
        return modelContext.executeTool(tool, input, { signal });
      }
      const definition = definitions.get(name);
      if (!definition) {
        throw new FirebreakError("TOOL_NOT_FOUND", `Tool '${name}' is not registered.`);
      }
      return definition.execute(parseInput(input), { signal });
    },
    subscribeToToolChange(listener) {
      listeners.add(listener);
      if (hasNativeToolChange) modelContext.addEventListener?.("toolchange", listener);
      return () => {
        listeners.delete(listener);
        if (hasNativeToolChange) modelContext.removeEventListener?.("toolchange", listener);
      };
    },
  };
};
