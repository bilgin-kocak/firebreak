import type { WebMCPToolDefinition, WebMCPToolMetadata } from "./types";

interface ModelContext {
  registerTool(definition: WebMCPToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
  getTools(): Promise<WebMCPToolMetadata[]>;
  executeTool(name: string, input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
  addEventListener(type: "toolchange", listener: () => void): void;
  removeEventListener(type: "toolchange", listener: () => void): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
