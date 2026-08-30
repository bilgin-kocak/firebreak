import type {
  IncidentPolicy,
  RemediationSimulation,
  ResponseOperationStep,
  ResponseToolProposal,
  ServiceId,
} from "./airlockTypes";
import { AirlockError } from "./airlockTypes";
import { trustedRemediationOperationIds } from "./incidentSeed";

export interface ResponseProposalInput {
  incidentId: "INC-4821";
  name: "rollback_checkout_release";
  title: string;
  description: string;
  simulationId: string;
  incidentRevision: number;
  operations: ResponseOperationStep[];
}

export interface ProposalValidationContext {
  policy: IncidentPolicy;
  simulation: RemediationSimulation;
  now?: Date;
  createId?: () => string;
}

interface OperationMetadata {
  serviceId: ServiceId | "system" | "incident";
  dependencies: string[];
}

const operationMetadata: Record<string, OperationMetadata> = {
  "system.capture_snapshot": { serviceId: "system", dependencies: [] },
  "checkout.select_previous_stable": {
    serviceId: "checkout-api",
    dependencies: ["system.capture_snapshot"],
  },
  "checkout.start_canary": {
    serviceId: "checkout-api",
    dependencies: ["checkout.select_previous_stable"],
  },
  "checkout.evaluate_canary": {
    serviceId: "checkout-api",
    dependencies: ["checkout.start_canary"],
  },
  "checkout.promote_rollback": {
    serviceId: "checkout-api",
    dependencies: ["checkout.evaluate_canary"],
  },
  "incident.resolve": {
    serviceId: "incident",
    dependencies: ["checkout.promote_rollback"],
  },
  "payments.promote_rollback": {
    serviceId: "payments",
    dependencies: ["system.capture_snapshot"],
  },
};

const assertOperationSequence = (steps: ResponseOperationStep[], policy: IncidentPolicy): void => {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!policy.allowedOperationIds.includes(step.operationId)) {
      throw new AirlockError(
        "OPERATION_NOT_ALLOWLISTED",
        `${step.operationId} is outside the approved response boundary.`,
      );
    }
    const metadata = operationMetadata[step.operationId];
    if (!metadata) {
      throw new AirlockError(
        "OPERATION_NOT_ALLOWLISTED",
        `${step.operationId} is not a trusted Airlock operation.`,
      );
    }
    if (
      metadata.serviceId !== "system" &&
      metadata.serviceId !== "incident" &&
      !policy.serviceIds.includes(metadata.serviceId as "checkout-api")
    ) {
      throw new AirlockError(
        "CROSS_SERVICE_OPERATION",
        `${step.operationId} would modify a service outside the checkout incident.`,
      );
    }
    if (metadata.dependencies.some((dependency) => !seen.has(dependency))) {
      throw new AirlockError(
        "DEPENDENCY_ORDER_INVALID",
        `${step.operationId} appears before its required safety step.`,
      );
    }
    seen.add(step.operationId);
  }
  if (
    steps.length !== trustedRemediationOperationIds.length ||
    trustedRemediationOperationIds.some((operationId, index) => steps[index]?.operationId !== operationId)
  ) {
    throw new AirlockError(
      "DEPENDENCY_ORDER_INVALID",
      "The response tool must contain the complete trusted rollback sequence.",
    );
  }
};

export const validateResponseProposal = (
  input: ResponseProposalInput,
  context: ProposalValidationContext,
): ResponseToolProposal => {
  const now = context.now ?? new Date(context.simulation.createdAt);
  if (new Date(context.policy.expiresAt).getTime() <= now.getTime()) {
    throw new AirlockError("POLICY_EXPIRED", "The operator permission has expired.");
  }
  if (
    input.incidentRevision !== context.policy.simulationRevision ||
    context.simulation.incidentRevision !== input.incidentRevision ||
    input.simulationId !== context.simulation.id
  ) {
    throw new AirlockError(
      "SIMULATION_STALE",
      "Run a new simulation for the current incident revision.",
    );
  }
  if (context.simulation.productionMutations > context.policy.maxProductionMutations) {
    throw new AirlockError(
      "MUTATION_BUDGET_EXCEEDED",
      "The response requires more production mutations than the operator allowed.",
    );
  }
  if (input.incidentId !== context.policy.incidentId) {
    throw new AirlockError("CROSS_SERVICE_OPERATION", "The response targets another incident.");
  }
  assertOperationSequence(input.operations, context.policy);

  const createId = context.createId ?? (() => `response-${Date.now()}`);
  return {
    id: createId(),
    incidentId: "INC-4821",
    name: "rollback_checkout_release",
    title: input.title.trim(),
    description: input.description.trim(),
    simulationId: input.simulationId,
    incidentRevision: input.incidentRevision,
    policy: {
      ...context.policy,
      serviceIds: [...context.policy.serviceIds],
      allowedOperationIds: [...context.policy.allowedOperationIds],
      forbiddenCapabilities: [...context.policy.forbiddenCapabilities],
    },
    operations: input.operations.map((step) => ({ ...step })),
    status: "awaiting_approval",
    createdAt: now.toISOString(),
  };
};
