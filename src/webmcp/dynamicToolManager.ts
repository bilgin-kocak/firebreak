import { z } from "zod";

import { runJourneyChecks } from "../domain/journeyChecks";
import { getServiceBlueprint } from "../domain/serviceBlueprints";
import { operationRegistry, validateJsonSchema } from "../domain/operationRegistry";
import {
  executeWorkflow,
  type WorkflowExecutionContext,
  type WorkflowExecutionResult,
} from "../domain/workflowExecutor";
import { DomainError, type WorkflowToolProposal } from "../domain/types";
import { deriveDynamicInputSchema, validateWorkflowProposal } from "../domain/workflowValidator";
import { useAppStore } from "../store/useAppStore";
import type { ToolRegistry } from "./registry";
import { successResult } from "./results";
import { STATIC_TOOL_NAMES } from "./staticToolDefinitions";
import type { RegistryToolDefinition } from "./types";

const writeAnnotations = {
  readOnlyHint: false,
  untrustedContentHint: false,
} as const;

export class DynamicToolManager {
  private readonly controllers = new Map<string, AbortController>();

  public constructor(private readonly registry: ToolRegistry) {
    useAppStore.getState().registerDynamicToolUnregister(() => this.disposeAll());
  }

  public async approveAndRegister(proposalId: string): Promise<void> {
    const proposal = useAppStore.getState().proposals[proposalId];
    if (!proposal || proposal.status !== "awaiting_approval") {
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "Only the human approval control can register a staged workflow.",
      );
    }
    await this.assertCurrentlyValid(proposal);

    const controller = new AbortController();
    try {
      await this.registry.register(this.createDefinition(proposal), {
        signal: controller.signal,
      });
      useAppStore.getState().human.approveProposal(proposalId);
      this.controllers.set(proposal.name, controller);
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  public async restoreEnabled(): Promise<void> {
    const enabledTools = Object.values(useAppStore.getState().approvedWorkflowTools).filter(
      (tool) => tool.enabled && tool.status === "registered",
    );
    for (const tool of enabledTools) {
      if (this.controllers.has(tool.name)) continue;
      try {
        await this.assertCurrentlyValid(tool);
      } catch (error) {
        if (error instanceof DomainError && error.code === "VIEW_VALIDATION_FAILED") {
          const current = useAppStore.getState().approvedWorkflowTools[tool.name];
          if (current?.enabled && current.status === "registered") {
            useAppStore.getState().human.disableWorkflowTool(tool.name);
          }
          continue;
        }
        throw error;
      }

      const controller = new AbortController();
      try {
        await this.registry.register(this.createDefinition(tool), {
          signal: controller.signal,
        });
        this.controllers.set(tool.name, controller);
        useAppStore.getState().logActivity({
          actor: "system",
          kind: "tool_registered",
          title: "Saved approval; registered for this tab.",
          toolName: tool.name,
          status: "success",
        });
      } catch {
        controller.abort();
        useAppStore.getState().logActivity({
          actor: "system",
          kind: "tool_failed",
          title: "Saved workflow could not be registered for this tab",
          toolName: tool.name,
          status: "warning",
        });
      }
    }
  }

  public disable(name: string): void {
    const tool = useAppStore.getState().approvedWorkflowTools[name];
    if (!tool || tool.status !== "registered") {
      throw new DomainError(
        "WORKFLOW_NOT_APPROVED",
        "Only a registered human-approved workflow can be disabled.",
      );
    }
    this.abortRegistration(name);
    useAppStore.getState().human.disableWorkflowTool(name);
  }

  /** The caller owns the visible human confirmation dialog before invoking this method. */
  public delete(name: string): void {
    if (!useAppStore.getState().approvedWorkflowTools[name]) {
      throw new DomainError(
        "WORKFLOW_NOT_APPROVED",
        "Only a saved human-approved workflow can be deleted.",
      );
    }
    this.abortRegistration(name);
    useAppStore.getState().human.deleteWorkflowTool(name);
  }

  public disposeAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  private abortRegistration(name: string): void {
    this.controllers.get(name)?.abort();
    this.controllers.delete(name);
  }

  private async assertCurrentlyValid(proposal: WorkflowToolProposal): Promise<void> {
    const state = useAppStore.getState();
    const view = state.views[proposal.viewId];
    if (!view || view.serviceId !== proposal.serviceId) {
      throw new DomainError(
        "VIEW_VALIDATION_FAILED",
        "The persisted workflow no longer has a matching trusted task view.",
      );
    }
    const blueprint = getServiceBlueprint(proposal.serviceId);
    const currentChecks = await runJourneyChecks(view, {
      operationSafety: {
        finalHumanOperationCompilable:
          operationRegistry[blueprint.finalHumanOperationId]?.compilable,
      },
      toolMetadata: {
        description: proposal.description,
        parameterCount: proposal.parameters.length,
        operationCount: proposal.operations.length,
      },
    });
    const validation = validateWorkflowProposal(proposal, {
      staticToolNames: STATIC_TOOL_NAMES,
      enabledCompiledToolNames: Object.values(state.approvedWorkflowTools)
        .filter((tool) => tool.enabled && tool.name !== proposal.name)
        .map((tool) => tool.name),
      journeyChecks: [...(state.journeyChecks[proposal.viewId] ?? []), ...currentChecks],
    });
    if (!validation.valid) {
      throw new DomainError(
        "VIEW_VALIDATION_FAILED",
        validation.errors[0]?.message ?? "The workflow is no longer safe to register.",
        { validationErrors: validation.errors.map((error) => error.code) },
      );
    }
  }

  private createDefinition(
    proposal: WorkflowToolProposal,
  ): RegistryToolDefinition<Record<string, unknown>> {
    const inputSchema = deriveDynamicInputSchema(proposal);
    return {
      name: proposal.name,
      description: proposal.description,
      inputSchema: { ...inputSchema },
      annotations: writeAnnotations,
      origin: "human_approved_workflow",
      inputValidator: z.custom<Record<string, unknown>>(
        (input) => validateJsonSchema(inputSchema, input),
        "Dynamic tool input did not match the trusted workflow schema.",
      ),
      execute: (input, signal) => this.executeProposal(proposal, input, signal),
    };
  }

  private async executeProposal(
    proposal: WorkflowToolProposal,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    const before = useAppStore.getState();
    if (before.portalMode === "submitted") {
      throw new DomainError(
        "DRAFT_VALIDATION_FAILED",
        "A human-submitted draft is final until the demo is reset.",
      );
    }
    const serviceDrafts = structuredClone(before.serviceDrafts);
    const context: WorkflowExecutionContext = {
      resident: structuredClone(before.resident),
      serviceDrafts,
      progress: [],
      portalState: {
        [proposal.serviceId]:
          before.portalMode === "staged_for_review" ? "staged_for_review" : "idle",
      },
      onProgress: (entry) => {
        const state = useAppStore.getState();
        state.recordWorkflowOperations();
        state.logActivity({
          actor: "system",
          kind: entry.status === "completed" ? "tool_completed" : "tool_failed",
          title:
            entry.status === "completed"
              ? "Trusted workflow operation completed"
              : "Trusted workflow operation failed",
          detail: entry.operationId,
          toolName: proposal.name,
          status: entry.status === "completed" ? "success" : "error",
        });
      },
    };
    const execution = await executeWorkflow(proposal, input, context, signal);
    if (execution.code !== "DRAFT_STAGED") {
      throw new DomainError(execution.code, this.executionFailureMessage(execution));
    }
    if (proposal.serviceId === "address_change") {
      const draft = context.serviceDrafts.address_change ?? {};
      context.serviceDrafts.address_change = {
        ...draft,
        newStreet: draft.street,
        newCity: draft.city,
        newPostalCode: draft.postalCode,
      };
    }

    const snapshot = {
      currentService: before.currentService,
      portalMode: before.portalMode,
      serviceDrafts: structuredClone(before.serviceDrafts),
      dialogs: { ...before.dialogs },
    };
    try {
      useAppStore.setState({
        currentService: proposal.serviceId,
        portalMode: "draft_in_progress",
        serviceDrafts: structuredClone(context.serviceDrafts),
      });
      useAppStore.getState().stageDraftForReview(proposal.serviceId);
    } catch (error) {
      useAppStore.setState(snapshot);
      throw error;
    }

    const draft = context.serviceDrafts[proposal.serviceId] ?? {};
    if (proposal.serviceId === "parking_permit_renewal") {
      const durationMonths = draft.durationMonths;
      return successResult(
        "DRAFT_STAGED",
        `Prepared a ${String(durationMonths)}-month parking permit renewal and stopped for your review. Submission did not occur.`,
        {
          status: "awaiting_user_confirmation",
          submitted: false,
          draftId: "draft_permit_001",
          durationMonths,
          fee: draft.fee,
          currency: "USD",
          nextAction: "Review the visible draft and use the human Confirm & Submit button.",
        },
      );
    }
    return successResult(
      "DRAFT_STAGED",
      "Prepared the address change and stopped for your review. Submission did not occur.",
      {
        status: "awaiting_user_confirmation",
        submitted: false,
        draftId: "draft_address_001",
        nextAction: "Review the visible draft and use the human Confirm & Submit button.",
      },
    );
  }

  private executionFailureMessage(execution: WorkflowExecutionResult): string {
    if (execution.code === "EXECUTION_CANCELLED") {
      return "The workflow was cancelled and its draft changes were rolled back.";
    }
    return execution.error ?? "The workflow failed and its draft changes were rolled back.";
  }
}
