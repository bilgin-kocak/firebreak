import {
  operationRegistry,
  resolvePortalStateValue,
  type ServiceDraft,
  type WorkflowExecutionContext,
  type WorkflowProgressEntry,
  validateJsonSchema,
} from "./operationRegistry";
import type { OperationBinding, WorkflowOperationStep, WorkflowToolProposal } from "./types";
import { deriveDynamicInputSchema, validateWorkflowProposal } from "./workflowValidator";

export type { WorkflowExecutionContext, WorkflowProgressEntry } from "./operationRegistry";

export interface WorkflowExecutionResult {
  code: "DRAFT_STAGED" | "EXECUTION_CANCELLED" | "OPERATION_FAILED";
  status: "awaiting_user_confirmation" | "cancelled" | "failed";
  submitted: false;
  fee?: number;
  completedOperationIds: string[];
  error?: string;
}

const cloneDraft = (draft: ServiceDraft | undefined): ServiceDraft | undefined =>
  draft === undefined ? undefined : structuredClone(draft);

const rollback = (
  context: WorkflowExecutionContext,
  serviceId: WorkflowToolProposal["serviceId"],
  existed: boolean,
  snapshot: ServiceDraft | undefined,
  hadPortalState: boolean,
  hadServicePortalState: boolean,
  portalStateSnapshot: NonNullable<
    WorkflowExecutionContext["portalState"]
  >[WorkflowToolProposal["serviceId"]],
): void => {
  if (existed && snapshot !== undefined) context.serviceDrafts[serviceId] = snapshot;
  else delete context.serviceDrafts[serviceId];
  if (!hadPortalState) {
    context.portalState = undefined;
    return;
  }
  context.portalState ??= {};
  if (hadServicePortalState && portalStateSnapshot !== undefined) {
    context.portalState[serviceId] = portalStateSnapshot;
  } else {
    delete context.portalState[serviceId];
  }
};

const resolveBinding = (
  binding: OperationBinding,
  proposal: WorkflowToolProposal,
  input: Record<string, unknown>,
  context: WorkflowExecutionContext,
): unknown => {
  if (binding.source === "literal") return binding.value;
  if (!binding.key) throw new Error("Binding key is missing");
  if (binding.source === "tool_input") {
    if (!proposal.parameters.some((parameter) => parameter.name === binding.key)) {
      throw new Error("Binding references an undeclared tool input");
    }
    return input[binding.key];
  }
  const value = resolvePortalStateValue(context, proposal.serviceId, binding.key);
  if (value === undefined) throw new Error("Portal-state binding is not available");
  return value;
};

const resolveArguments = (
  step: WorkflowOperationStep,
  proposal: WorkflowToolProposal,
  input: Record<string, unknown>,
  context: WorkflowExecutionContext,
): Record<string, unknown> => {
  const operation = operationRegistry[step.operationId];
  if (!operation) throw new Error("Unknown operation");
  const args: Record<string, unknown> = {};
  for (const argument of operation.inputSchema.required ?? []) {
    const bindings = step.bindings.filter((binding) => binding.argument === argument);
    if (bindings.length !== 1)
      throw new Error(`Argument ${argument} must have exactly one binding`);
    const binding = bindings[0];
    if (!binding) throw new Error(`Argument ${argument} binding is missing`);
    args[argument] = resolveBinding(binding, proposal, input, context);
  }
  if (!validateJsonSchema(operation.inputSchema, args))
    throw new Error("Resolved operation arguments are invalid");
  return args;
};

const isCancelled = (signal?: AbortSignal): boolean => signal?.aborted === true;

const recordProgress = (
  context: WorkflowExecutionContext,
  entry: WorkflowProgressEntry,
): string | undefined => {
  context.progress.push(entry);
  try {
    context.onProgress?.(entry);
    return undefined;
  } catch {
    return "Workflow progress observer failed";
  }
};

export const executeWorkflow = async (
  proposal: WorkflowToolProposal,
  input: Record<string, unknown>,
  context: WorkflowExecutionContext,
  signal?: AbortSignal,
): Promise<WorkflowExecutionResult> => {
  const existed = Object.prototype.hasOwnProperty.call(context.serviceDrafts, proposal.serviceId);
  const snapshot = cloneDraft(context.serviceDrafts[proposal.serviceId]);
  const hadPortalState = context.portalState !== undefined;
  const hadServicePortalState = Object.prototype.hasOwnProperty.call(
    context.portalState ?? {},
    proposal.serviceId,
  );
  const portalStateSnapshot = context.portalState?.[proposal.serviceId];
  const completedOperationIds: string[] = [];
  const fail = (
    code: "EXECUTION_CANCELLED" | "OPERATION_FAILED",
    error?: string,
  ): WorkflowExecutionResult => {
    rollback(
      context,
      proposal.serviceId,
      existed,
      snapshot,
      hadPortalState,
      hadServicePortalState,
      portalStateSnapshot,
    );
    return {
      code,
      status: code === "EXECUTION_CANCELLED" ? "cancelled" : "failed",
      submitted: false,
      completedOperationIds,
      ...(error ? { error } : {}),
    };
  };

  if (isCancelled(signal)) return fail("EXECUTION_CANCELLED");
  const validation = validateWorkflowProposal(proposal);
  if (!validation.valid) return fail("OPERATION_FAILED", validation.errors[0]?.message);
  const inputSchema = deriveDynamicInputSchema(proposal);
  if (!validateJsonSchema(inputSchema, input))
    return fail("OPERATION_FAILED", "Dynamic tool input is invalid");

  for (const step of proposal.operations) {
    if (isCancelled(signal)) return fail("EXECUTION_CANCELLED");
    const operation = operationRegistry[step.operationId];
    if (!operation || !operation.compilable || operation.sideEffect === "human_only") {
      return fail("OPERATION_FAILED", "Workflow attempted a human-only or unknown operation");
    }
    try {
      const args = resolveArguments(step, proposal, input, context);
      await operation.execute(context, args, signal);
      completedOperationIds.push(operation.id);
      const observerError = recordProgress(context, {
        operationId: operation.id,
        status: "completed",
      });
      if (observerError) return fail("OPERATION_FAILED", observerError);
      if (isCancelled(signal)) return fail("EXECUTION_CANCELLED");
    } catch (error) {
      if (isCancelled(signal)) return fail("EXECUTION_CANCELLED");
      recordProgress(context, { operationId: operation.id, status: "failed" });
      return fail("OPERATION_FAILED", error instanceof Error ? error.message : "Operation failed");
    }
  }

  const draft = context.serviceDrafts[proposal.serviceId];
  if (!draft || draft.status !== "staged_for_review") {
    return fail("OPERATION_FAILED", "Workflow did not stage a draft for review");
  }
  return {
    code: "DRAFT_STAGED",
    status: "awaiting_user_confirmation",
    submitted: false,
    completedOperationIds,
    ...(typeof draft.fee === "number" ? { fee: draft.fee } : {}),
  };
};
