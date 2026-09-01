import type { WebMCPRegisteredTool, WebMCPToolDefinition } from "./types";

interface ModelContext {
  registerTool(definition: WebMCPToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
  getTools?(): Promise<WebMCPRegisteredTool[]>;
  executeTool?(
    tool: WebMCPRegisteredTool,
    input: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
  addEventListener?(type: "toolchange", listener: () => void): void;
  removeEventListener?(type: "toolchange", listener: () => void): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
