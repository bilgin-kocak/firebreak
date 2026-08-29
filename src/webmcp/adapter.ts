import type { WebMCPToolDefinition, WebMCPToolMetadata } from "./types";

export interface WebMCPAdapter {
  mode: "native" | "memory";
  registerTool(definition: WebMCPToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
  getTools(): Promise<WebMCPToolMetadata[]>;
  executeTool(name: string, input: unknown, signal?: AbortSignal): Promise<unknown>;
  subscribeToToolChange(listener: () => void): () => void;
}
