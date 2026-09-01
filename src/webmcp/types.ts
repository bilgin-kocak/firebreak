import type { z } from "zod";

export type WebMCPAnnotations = {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
};

export type WebMCPExecutionContext = { signal?: AbortSignal };

export interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: WebMCPAnnotations;
  execute(input: unknown, context?: WebMCPExecutionContext): Promise<unknown>;
}

export type WebMCPToolMetadata = Omit<WebMCPToolDefinition, "execute">;

export interface WebMCPRegisteredTool extends WebMCPToolMetadata {
  origin: string;
  window: Window;
  title?: string;
}

export type ToolOrigin = "built_in" | "human_approved_workflow";

export interface RegistryToolDefinition<TInput = unknown> extends Omit<
  WebMCPToolDefinition,
  "execute"
> {
  inputValidator: z.ZodType<TInput>;
  origin: ToolOrigin;
  execute(input: TInput, signal?: AbortSignal): Promise<unknown>;
}
