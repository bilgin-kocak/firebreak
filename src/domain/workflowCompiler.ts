import { createId, systemClock } from "./seed";
import type { Clock, IdFactory, WorkflowToolProposal } from "./types";
import { validateWorkflowProposal, type WorkflowValidationOptions } from "./workflowValidator";

export type CompileWorkflowProposalInput = Omit<
  WorkflowToolProposal,
  "id" | "createdAt" | "status" | "validationErrors"
> &
  Partial<Pick<WorkflowToolProposal, "id" | "createdAt" | "status" | "validationErrors">>;

export interface WorkflowCompilerDependencies extends WorkflowValidationOptions {
  now?: Clock;
  idFactory?: IdFactory;
}

/** Compiles only trusted workflow data; it never accepts executable or presentation code. */
export const compileWorkflowProposal = (
  input: CompileWorkflowProposalInput,
  dependencies: WorkflowCompilerDependencies = {},
): WorkflowToolProposal => {
  const now = (dependencies.now ?? systemClock).now().toISOString();
  const draft: WorkflowToolProposal = {
    id: input.id ?? createId("workflow", dependencies.idFactory),
    viewId: input.viewId,
    serviceId: input.serviceId,
    name: input.name.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    parameters: input.parameters.map((parameter) => ({
      ...parameter,
      name: parameter.name.trim(),
      description: parameter.description.trim(),
    })),
    operations: input.operations.map((step) => ({
      operationId: step.operationId,
      bindings: step.bindings.map((binding) => ({ ...binding })),
    })),
    stopAt: input.stopAt,
    status: "draft",
    validationErrors: [],
    createdAt: input.createdAt ?? now,
  };
  const validation = validateWorkflowProposal(draft, dependencies);
  return {
    ...draft,
    status: validation.valid ? "awaiting_approval" : "draft",
    validationErrors: validation.errors.map((error) => error.message),
  };
};
