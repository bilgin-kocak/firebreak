import { FirebreakError } from "../domain/firebreakTypes";
import { getFirebreakState, type FirebreakState } from "../store/useFirebreakStore";
import type { WebMCPAdapter } from "./adapter";
import { compactResult, errorResult } from "./results";
import type { RegistryToolDefinition, ToolOrigin, WebMCPToolMetadata } from "./types";

const MAX_TRACE_SUMMARY_CHARS = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeInput(value: unknown, inputSchema: Record<string, unknown>): string {
  try {
    if (!isRecord(value) || !isRecord(inputSchema.properties)) {
      return "[invalid input shape]";
    }
    const safe: Record<string, string | number | boolean | null> = {};
    for (const key of Object.keys(inputSchema.properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (/token|secret|password|api.?key/i.test(key)) {
        safe[key] = "[redacted]";
        continue;
      }
      const item = value[key];
      const propertySchema = inputSchema.properties[key];
      const allowedValues = isRecord(propertySchema) ? propertySchema.enum : undefined;
      if (
        typeof item === "string" &&
        Array.isArray(allowedValues) &&
        allowedValues.includes(item)
      ) {
        safe[key] = item;
      } else if (typeof item === "string") {
        safe[key] = `<string:${item.length}>`;
      } else if (item === null || typeof item === "number" || typeof item === "boolean") {
        safe[key] = item;
      } else if (Array.isArray(item)) {
        safe[key] = `[${item.length} items]`;
      } else {
        safe[key] = "[structured value]";
      }
    }
    const json = JSON.stringify(safe);
    return json.length > MAX_TRACE_SUMMARY_CHARS
      ? `${json.slice(0, MAX_TRACE_SUMMARY_CHARS - 1)}…`
      : json;
  } catch {
    return "[unavailable]";
  }
}

function isFailureResult(result: unknown): boolean {
  return isRecord(result) && result.ok === false;
}

function resultDetails(result: unknown): { code?: string; message?: string } {
  try {
    if (typeof result !== "object" || result === null) return {};
    const record = result as { code?: unknown; message?: unknown };
    const code = record.code;
    const message = record.message;
    return {
      ...(typeof code === "string" ? { code: code.slice(0, 64) } : {}),
      ...(typeof message === "string"
        ? { message: message.slice(0, MAX_TRACE_SUMMARY_CHARS) }
        : {}),
    };
  } catch {
    return {};
  }
}

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
  private readonly pendingOrigins = new Map<string, ToolOrigin>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly getState: () => FirebreakState;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;
  private toolChangeReconciliation: Promise<void> = Promise.resolve();
  private traceSequence = 0;

  public constructor(
    private readonly adapter: WebMCPAdapter,
    dependencies: ToolRegistryDependencies = {},
  ) {
    this.getState = dependencies.getState ?? getFirebreakState;
    this.now = dependencies.now ?? (() => performance.now());
    this.unsubscribe = adapter.subscribeToToolChange(() => {
      void this.queueReconcile(true).catch(() => undefined);
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
    this.pendingOrigins.set(definition.name, definition.origin);
    const wrapped = {
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
      execute: async (input: unknown, context?: { signal?: AbortSignal }) => {
        const startedAt = this.now();
        const traceId = `tool-${definition.name}-${++this.traceSequence}`;
        this.getState().recordWebMCPTrace({
          id: traceId,
          kind: "tool",
          name: definition.name,
          status: "running",
          at: Date.now(),
          inputSummary: summarizeInput(input, definition.inputSchema),
        });
        try {
          const parsed = await definition.inputValidator.parseAsync(input);
          const output = compactResult(await definition.execute(parsed, context?.signal));
          const durationMs = Math.max(0, this.now() - startedAt);
          this.getState().updateWebMCPTrace(traceId, {
            status: isFailureResult(output) ? "blocked" : "succeeded",
            durationMs,
            ...resultDetails(output),
          });
          this.getState().recordToolCall();
          return output;
        } catch (error) {
          const output = compactResult(errorResult(error));
          const durationMs = Math.max(0, this.now() - startedAt);
          this.getState().updateWebMCPTrace(traceId, {
            status: "blocked",
            durationMs,
            ...resultDetails(output),
          });
          this.getState().recordToolCall();
          return output;
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
      await this.queueReconcile();
    } finally {
      this.pendingNames.delete(definition.name);
      this.pendingOrigins.delete(definition.name);
    }
  }

  public getRegistrations(): ToolRegistration[] {
    return [...this.registrations.values()];
  }

  public unregister(name: string): void {
    this.controllers.get(name)?.abort();
    this.controllers.delete(name);
    this.registrations.delete(name);
    void this.queueReconcile();
  }

  public dispose(): void {
    this.unsubscribe();
  }

  public async settleToolChanges(): Promise<void> {
    await this.toolChangeReconciliation;
  }

  private queueReconcile(logToolChange = false): Promise<void> {
    this.toolChangeReconciliation = this.toolChangeReconciliation
      .catch(() => undefined)
      .then(() => this.reconcile(logToolChange));
    return this.toolChangeReconciliation;
  }

  private async reconcile(logToolChange = false): Promise<void> {
    const previousNames = this.getState().webmcp.registeredToolNames;
    const names = (await this.adapter.getTools()).map((tool) => tool.name);
    const changedNames = new Set([
      ...previousNames.filter((name) => !names.includes(name)),
      ...names.filter((name) => !previousNames.includes(name)),
    ]);
    const dynamicChanged = [...changedNames].some(
      (name) =>
        (this.registrations.get(name)?.origin ?? this.pendingOrigins.get(name)) ===
        "human_approved_workflow",
    );
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
    if (dynamicChanged && previousNames.length !== names.length) {
      this.getState().recordWebMCPTrace({
        id: `toolchange-${++this.traceSequence}`,
        kind: "toolchange",
        name: "WebMCP tool surface",
        status: "changed",
        at: Date.now(),
        message: `${previousNames.length} → ${names.length} tools`,
      });
    }
  }
}
