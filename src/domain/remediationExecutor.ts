import type {
  ExecutionReceipt,
  IncidentState,
  RecoveryProgressEntry,
  ResponseToolProposal,
} from "./airlockTypes";
import { AirlockError } from "./airlockTypes";
import {
  remediationOperationRegistry,
  type RemediationOperationDefinition,
} from "./remediationOperations";

export interface RemediationExecutionOptions {
  state: IncidentState;
  canaryPercent: 5 | 10 | 25;
  quarantinedEvidenceIds?: string[];
  signal?: AbortSignal;
  now?: () => Date;
  createId?: () => string;
  onProgress?: (entry: RecoveryProgressEntry) => void;
  registry?: Record<string, RemediationOperationDefinition>;
}

const restoreState = (target: IncidentState, snapshot: IncidentState): void => {
  const restored = structuredClone(snapshot);
  target.incident = restored.incident;
  target.services = restored.services;
  target.edges = restored.edges;
  target.telemetry = restored.telemetry;
  target.deployments = restored.deployments;
  target.policy = restored.policy;
};

export const executeRemediation = async (
  proposal: ResponseToolProposal,
  options: RemediationExecutionOptions,
): Promise<ExecutionReceipt> => {
  if (proposal.policy.used) {
    throw new AirlockError("RESPONSE_ALREADY_USED", "This one-use response has already run.");
  }
  if (![5, 10, 25].includes(options.canaryPercent)) {
    throw new AirlockError("INVALID_CANARY_PERCENT", "Canary must be 5, 10, or 25 percent.");
  }
  const snapshot = structuredClone(options.state);
  const registry = options.registry ?? remediationOperationRegistry;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `receipt-${Date.now()}`);
  const startedAt = now().toISOString();
  const context = {
    state: options.state,
    proposal,
    canaryPercent: options.canaryPercent,
    productionMutations: 0,
  };

  try {
    for (const step of proposal.operations) {
      if (options.signal?.aborted) {
        throw new AirlockError("EXECUTION_CANCELLED", "Recovery was cancelled.");
      }
      const operation = registry[step.operationId];
      if (!operation) {
        throw new AirlockError(
          "OPERATION_NOT_ALLOWLISTED",
          `${step.operationId} is not a trusted remediation operation.`,
        );
      }
      try {
        await operation.execute(context, options.signal);
      } catch (error) {
        if (
          options.signal?.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw new AirlockError("EXECUTION_CANCELLED", "Recovery was cancelled.");
        }
        throw error;
      }
      options.onProgress?.({
        operationId: operation.id,
        phase: operation.phase,
        detail: operation.detail,
        timestamp: now().toISOString(),
      });
      if (options.signal?.aborted) {
        throw new AirlockError("EXECUTION_CANCELLED", "Recovery was cancelled.");
      }
    }
    if (context.productionMutations !== proposal.policy.maxProductionMutations) {
      throw new AirlockError(
        "MUTATION_BUDGET_EXCEEDED",
        "Recovery did not use the exact approved mutation budget.",
      );
    }
    proposal.policy.used = true;
    return {
      id: createId(),
      incidentId: "INC-4821",
      toolName: "rollback_checkout_release",
      status: "incident_resolved",
      canaryPercent: options.canaryPercent,
      fromRelease: "2026.08.30.3",
      toRelease: "2026.08.30.2",
      finalErrorRate: options.state.incident.errorRate,
      finalP95LatencyMs: options.state.incident.p95LatencyMs,
      productionMutations: context.productionMutations,
      blockedEvidenceIds: [...(options.quarantinedEvidenceIds ?? [])],
      operationIds: proposal.operations.map((step) => step.operationId),
      startedAt,
      completedAt: now().toISOString(),
    };
  } catch (error) {
    restoreState(options.state, snapshot);
    if (error instanceof AirlockError) throw error;
    throw new AirlockError(
      "OPERATION_FAILED",
      error instanceof Error ? error.message : "Recovery operation failed.",
    );
  }
};
