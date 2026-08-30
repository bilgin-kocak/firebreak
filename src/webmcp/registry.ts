import { FirebreakError } from "../domain/firebreakTypes";
import { getFirebreakState, type FirebreakState } from "../store/useFirebreakStore";
import type { WebMCPAdapter } from "./adapter";
import { compactResult, errorResult } from "./results";
import type { RegistryToolDefinition, ToolOrigin, WebMCPToolMetadata } from "./types";

export interface ToolRegistration extends WebMCPToolMetadata {
  origin: ToolOrigin;
}

export interface ToolRegistryDependencies {
  getState?: () => FirebreakState;
  now?: () => number;
}

export class ToolRegistry {
  private readonly registrations = new Map<string, ToolRegistration>();
  private readonly pendingNames = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly getState: () => FirebreakState;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;
  private toolChangeReconciliation: Promise<void> = Promise.resolve();

  public constructor(
    private readonly adapter: WebMCPAdapter,
    dependencies: ToolRegistryDependencies = {},
  ) {
    this.getState = dependencies.getState ?? getFirebreakState;
    this.now = dependencies.now ?? (() => performance.now());
    this.unsubscribe = adapter.subscribeToToolChange(() => {
      this.toolChangeReconciliation = this.toolChangeReconciliation
        .catch(() => undefined)
        .then(() => this.reconcile(true));
      void this.toolChangeReconciliation.catch(() => undefined);
    });
    this.getState().setWebMCP({ mode: adapter.mode });
  }

  public async register<TInput>(
    definition: RegistryToolDefinition<TInput>,
    options: { signal?: AbortSignal } = {},
  ): Promise<void> {
    if (this.registrations.has(definition.name) || this.pendingNames.has(definition.name)) {
      throw new FirebreakError(
        "TOOL_ALREADY_REGISTERED",
        `Tool '${definition.name}' is already registered.`,
      );
    }
    const controller =
      definition.origin === "human_approved_workflow" && !options.signal
        ? new AbortController()
        : undefined;
    const registrationSignal = options.signal ?? controller?.signal;
    this.pendingNames.add(definition.name);
    const wrapped = {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
      execute: async (input: unknown, context?: { signal?: AbortSignal }) => {
        const startedAt = this.now();
        try {
          const parsed = await definition.inputValidator.parseAsync(input);
          const output = compactResult(await definition.execute(parsed, context?.signal));
          void Math.max(0, this.now() - startedAt);
          this.getState().recordToolCall();
          return output;
        } catch (error) {
          void Math.max(0, this.now() - startedAt);
          this.getState().recordToolCall();
          return compactResult(errorResult(error));
        }
      },
    };

    try {
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
    } finally {
      this.pendingNames.delete(definition.name);
    }
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

  public async settleToolChanges(): Promise<void> {
    await this.toolChangeReconciliation;
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
    this.getState().setWebMCP({
      mode: this.adapter.mode,
      registeredToolNames: names,
      ...(logToolChange ? { lastToolChangeAt: Date.now() } : {}),
    });
  }
}
