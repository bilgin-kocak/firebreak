import { z } from "zod";

import { runAirlockChecks } from "../domain/airlockChecks";
import type { ApprovedResponseTool, ResponseToolProposal } from "../domain/airlockTypes";
import { AirlockError } from "../domain/airlockTypes";
import {
  executeRemediation,
  type RemediationExecutionOptions,
} from "../domain/remediationExecutor";
import { getAppState, useAppStore } from "../store/useAppStore";
import type { ToolRegistry } from "./registry";
import { successResult } from "./results";
import type { RegistryToolDefinition } from "./types";

const annotations = { readOnlyHint: false, untrustedContentHint: false } as const;
const inputSchema = {
  type: "object",
  properties: {
    canaryPercent: {
      type: "integer",
      enum: [5, 10, 25],
      description: "Bounded checkout traffic percentage for the rollback canary.",
    },
  },
  required: ["canaryPercent"],
  additionalProperties: false,
} as const;
const inputValidator = z
  .object({ canaryPercent: z.union([z.literal(5), z.literal(10), z.literal(25)]) })
  .strict();

type ExecuteRemediation = (
  proposal: ResponseToolProposal,
  options: RemediationExecutionOptions,
) => ReturnType<typeof executeRemediation>;

export interface DynamicToolManagerDependencies {
  executeRemediation?: ExecuteRemediation;
  now?: () => Date;
}

const combineAbortSignals = (
  signals: Array<AbortSignal | undefined>,
): { signal: AbortSignal; cleanup(): void } => {
  const controller = new AbortController();
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      for (const signal of activeSignals) signal.removeEventListener("abort", abort);
    },
  };
};

export class DynamicToolManager {
  private readonly controllers = new Map<string, AbortController>();
  private readonly executing = new Set<string>();
  private readonly execute: ExecuteRemediation;
  private readonly now: () => Date;
  private receiptSequence = 0;

  public constructor(
    private readonly registry: ToolRegistry,
    dependencies: DynamicToolManagerDependencies = {},
  ) {
    this.execute = dependencies.executeRemediation ?? executeRemediation;
    this.now = dependencies.now ?? (() => new Date());
    useAppStore.getState().registerDynamicToolUnregister(() => this.disposeAll());
  }

  public async approveAndRegister(proposalId: string): Promise<ApprovedResponseTool> {
    const proposal = getAppState().proposals[proposalId];
    if (!proposal || proposal.status !== "awaiting_approval") {
      throw new AirlockError(
        "HUMAN_APPROVAL_REQUIRED",
        "Only the visible human approval control can register a staged response.",
      );
    }
    this.assertCurrentlyValid(proposal);
    const controller = new AbortController();
    try {
      await this.registry.register(this.createDefinition(proposal), { signal: controller.signal });
      const approved = getAppState().human.approveResponseTool(proposalId);
      this.controllers.set(approved.name, controller);
      return approved;
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  public async restoreEnabled(): Promise<void> {
    for (const tool of Object.values(getAppState().approvedResponseTools)) {
      if (!tool.enabled || tool.status !== "registered" || this.controllers.has(tool.name))
        continue;
      try {
        this.assertCurrentlyValid(tool);
        const controller = new AbortController();
        await this.registry.register(this.createDefinition(tool), { signal: controller.signal });
        this.controllers.set(tool.name, controller);
      } catch {
        getAppState().disableResponseTool(tool.name);
        getAppState().logActivity({
          actor: "system",
          kind: "tool_failed",
          title: "Saved response authority was not restored",
          toolName: tool.name,
          status: "warning",
        });
      }
    }
  }

  public disable(name: string): void {
    const tool = getAppState().approvedResponseTools[name];
    if (!tool || tool.status !== "registered") {
      throw new AirlockError("RESPONSE_NOT_APPROVED", "No registered response tool was found.");
    }
    this.abort(name);
    getAppState().disableResponseTool(name);
    getAppState().logActivity({
      actor: "human",
      kind: "tool_unregistered",
      title: "Response tool disabled",
      toolName: name,
      status: "warning",
    });
  }

  public delete(name: string): void {
    if (!getAppState().approvedResponseTools[name]) {
      throw new AirlockError("RESPONSE_NOT_APPROVED", "No saved response tool was found.");
    }
    this.abort(name);
    getAppState().deleteResponseTool(name);
  }

  public async disposeAll(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    await this.registry.settleToolChanges();
  }

  private abort(name: string): void {
    this.controllers.get(name)?.abort();
    this.controllers.delete(name);
  }

  private assertCurrentlyValid(proposal: ResponseToolProposal): void {
    const state = getAppState();
    const simulation = state.simulations[proposal.simulationId];
    if (!simulation) throw new AirlockError("SIMULATION_NOT_FOUND", "Simulation proof is missing.");
    if (
      proposal.incidentRevision !== state.incidentState.incident.revision ||
      simulation.incidentRevision !== state.incidentState.incident.revision ||
      state.checkRevisions[proposal.simulationId] !== state.incidentState.incident.revision
    ) {
      throw new AirlockError(
        "SIMULATION_STALE",
        "Response authority is bound to an older revision.",
      );
    }
    if (new Date(proposal.policy.expiresAt).getTime() <= this.now().getTime()) {
      throw new AirlockError("POLICY_EXPIRED", "Response authority expired before registration.");
    }
    if (proposal.policy.used) {
      throw new AirlockError("RESPONSE_ALREADY_USED", "This response authority was already used.");
    }
    const liveChecks = runAirlockChecks({
      state: state.incidentState,
      simulation,
      assessments: Object.values(state.assessments),
      operationIds: proposal.operations.map((operation) => operation.operationId),
      now: this.now(),
    });
    if (liveChecks.some((check) => check.blocking && check.status !== "pass")) {
      throw new AirlockError("CHECKS_FAILED", "Live Airlock gates no longer pass.");
    }
  }

  private createDefinition(
    proposal: ResponseToolProposal,
  ): RegistryToolDefinition<z.infer<typeof inputValidator>> {
    return {
      name: "rollback_checkout_release",
      description:
        "Execute the human-approved, one-use checkout rollback for INC-4821. Captures a snapshot, runs a bounded canary, promotes only after healthy telemetry, resolves the incident, then unregisters itself.",
      inputSchema,
      annotations,
      inputValidator,
      origin: "human_approved_workflow",
      execute: async (input, signal) => {
        if (this.executing.has(proposal.name)) {
          throw new AirlockError(
            "RESPONSE_ALREADY_USED",
            "This one-use response is already executing.",
          );
        }
        this.executing.add(proposal.name);
        const executionSignal = combineAbortSignals([
          signal,
          this.controllers.get(proposal.name)?.signal,
        ]);
        const state = getAppState();
        const approved = state.approvedResponseTools[proposal.name];
        const attemptStartedAt = this.now().toISOString();
        const attemptReceiptId = `receipt-${this.now().getTime()}-${++this.receiptSequence}`;
        const blockedEvidenceIds = Object.values(state.assessments)
          .filter((assessment) => assessment.injectionRisk)
          .map((assessment) => assessment.evidenceId);
        try {
          if (!approved || !approved.enabled || approved.status !== "registered") {
            throw new AirlockError("RESPONSE_NOT_APPROVED", "The rollback tool is not enabled.");
          }
          this.assertCurrentlyValid(approved);
          const workingState = structuredClone(state.incidentState);
          const receipt = await this.execute(structuredClone(approved), {
            state: workingState,
            canaryPercent: input.canaryPercent,
            quarantinedEvidenceIds: blockedEvidenceIds,
            signal: executionSignal.signal,
            now: this.now,
            onProgress: (entry) => getAppState().recordProgress(entry),
          });
          const current = getAppState().approvedResponseTools[proposal.name];
          if (
            executionSignal.signal.aborted ||
            !current ||
            !current.enabled ||
            current.status !== "registered" ||
            current.approvedAt !== approved.approvedAt
          ) {
            throw new AirlockError(
              "EXECUTION_CANCELLED",
              "Response authority was revoked before recovery committed.",
            );
          }
          getAppState().replaceIncidentState(workingState);
          getAppState().saveReceipt(receipt);
          getAppState().completeResponseTool(proposal.name);

          setTimeout(() => {
            this.abort(proposal.name);
            getAppState().logActivity({
              actor: "system",
              kind: "tool_unregistered",
              title: "One-use response tool automatically unregistered",
              toolName: proposal.name,
              status: "success",
            });
          }, 0);

          return successResult("INCIDENT_RESOLVED", "Checkout recovered; one-use tool consumed.", {
            receiptId: receipt.id,
            finalErrorRate: receipt.finalErrorRate,
            finalP95LatencyMs: receipt.finalP95LatencyMs,
            productionMutations: receipt.productionMutations,
            blockedEvidenceIds: receipt.blockedEvidenceIds,
          });
        } catch (error) {
          const current = getAppState().approvedResponseTools[proposal.name];
          if (current?.enabled && current.status === "registered") {
            const cancelled = error instanceof AirlockError && error.code === "EXECUTION_CANCELLED";
            const incidentState = getAppState().incidentState;
            const currentRelease =
              incidentState.deployments.find((deployment) => deployment.current)?.version ??
              "2026.08.30.3";
            const stableRelease =
              incidentState.deployments.find((deployment) => deployment.stable)?.version ??
              "2026.08.30.2";
            getAppState().saveReceipt({
              id: attemptReceiptId,
              incidentId: "INC-4821",
              toolName: "rollback_checkout_release",
              status: cancelled ? "cancelled" : "failed",
              canaryPercent: input.canaryPercent,
              fromRelease: currentRelease,
              toRelease: stableRelease,
              finalErrorRate: incidentState.incident.errorRate,
              finalP95LatencyMs: incidentState.incident.p95LatencyMs,
              productionMutations: 0,
              blockedEvidenceIds,
              operationIds: current.operations.map((operation) => operation.operationId),
              startedAt: attemptStartedAt,
              completedAt: this.now().toISOString(),
            });
          }
          throw error;
        } finally {
          executionSignal.cleanup();
          this.executing.delete(proposal.name);
        }
      },
    };
  }
}
