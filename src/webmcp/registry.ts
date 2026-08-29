import { DomainError } from "../domain/types";
import { getAppState, type ToolAppState } from "../store/useAppStore";
import type { WebMCPAdapter } from "./adapter";
import { compactResult, errorResult } from "./results";
import type { RegistryToolDefinition, ToolOrigin, WebMCPToolMetadata } from "./types";

export interface ToolRegistration extends WebMCPToolMetadata {
  origin: ToolOrigin;
}

export interface ToolRegistryDependencies {
  getState?: () => ToolAppState;
  now?: () => number;
}

export class ToolRegistry {
  private readonly registrations = new Map<string, ToolRegistration>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly getState: () => ToolAppState;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;

  public constructor(
    private readonly adapter: WebMCPAdapter,
    dependencies: ToolRegistryDependencies = {},
  ) {
    this.getState = dependencies.getState ?? getAppState;
    this.now = dependencies.now ?? (() => performance.now());
    this.unsubscribe = adapter.subscribeToToolChange(() => {
      void this.reconcile(true);
    });
    this.getState().setWebMCPMetadata({ mode: adapter.mode });
  }

  public async register<TInput>(
    definition: RegistryToolDefinition<TInput>,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    if (this.registrations.has(definition.name)) {
      throw new DomainError(
        "TOOL_ALREADY_REGISTERED",
        `Tool '${definition.name}' is already registered.`,
      );
    }
    const controller =
      definition.origin === "human_approved_workflow" && !options.signal
        ? new AbortController()
        : undefined;
    const registrationSignal = options.signal ?? controller?.signal;
    const wrapped = {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
      execute: async (input: unknown, context?: { signal?: AbortSignal }) => {
        const startedAt = this.now();
        const state = this.getState();
        state.logActivity({
          actor: "agent",
          kind: "tool_started",
          title: "WebMCP tool started",
          toolName: definition.name,
          status: "info",
        });
        try {
          const parsed = await definition.inputValidator.parseAsync(input);
          const output = compactResult(await definition.execute(parsed, context?.signal));
          const durationMs = Math.max(0, this.now() - startedAt);
          this.getState().recordWebMCPToolCall(durationMs);
          this.getState().logActivity({
            actor: "agent",
            kind: "tool_completed",
            title: "WebMCP tool completed",
            toolName: definition.name,
            durationMs,
            status: "success",
          });
          return output;
        } catch (error) {
          const durationMs = Math.max(0, this.now() - startedAt);
          this.getState().recordWebMCPToolCall(durationMs);
          this.getState().logActivity({
            actor: "agent",
            kind: "tool_failed",
            title: "WebMCP tool failed safely",
            toolName: definition.name,
            durationMs,
            status: "error",
          });
          return compactResult(errorResult(error));
        }
      },
    };

    await this.adapter.registerTool(wrapped, { signal: registrationSignal });
    this.registrations.set(definition.name, {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
      origin: definition.origin,
    });
    if (controller) this.controllers.set(definition.name, controller);
    await this.reconcile();
    this.getState().logActivity({
      actor: "system",
      kind: "tool_registered",
      title: "WebMCP tool registered",
      toolName: definition.name,
      status: "success",
    });
  }

  public getRegistrations(): ToolRegistration[] {
    return [...this.registrations.values()];
  }

  public unregister(name: string): void {
    this.controllers.get(name)?.abort();
    this.controllers.delete(name);
    this.registrations.delete(name);
    void this.reconcile();
  }

  public dispose(): void {
    this.unsubscribe();
  }

  private async reconcile(logToolChange = false): Promise<void> {
    const names = (await this.adapter.getTools()).map((tool) => tool.name).sort();
    const activeNames = new Set(names);
    for (const name of this.registrations.keys()) {
      if (!activeNames.has(name)) {
        this.registrations.delete(name);
        this.controllers.delete(name);
      }
    }
    this.getState().setWebMCPMetadata({
      mode: this.adapter.mode,
      registeredToolNames: names,
      ...(logToolChange ? { lastToolChangeAt: new Date().toISOString() } : {}),
    });
    if (logToolChange) {
      this.getState().logActivity({
        actor: "system",
        kind: "toolchange",
        title: "WebMCP tool surface changed",
        status: "info",
      });
    }
  }
}
