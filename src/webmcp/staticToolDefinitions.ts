import { z } from "zod";

import { runJourneyChecks, type JourneyCheckContext } from "../domain/journeyChecks";
import { operationRegistry } from "../domain/operationRegistry";
import { getServiceBlueprint, serviceBlueprints } from "../domain/serviceBlueprints";
import { compileTaskView, patchTaskView } from "../domain/viewCompiler";
import { compileWorkflowProposal } from "../domain/workflowCompiler";
import { DomainError, type ServiceId } from "../domain/types";
import { getAppState, type ToolAppState } from "../store/useAppStore";
import { successResult } from "./results";
import type { RegistryToolDefinition } from "./types";

export interface StaticToolDependencies {
  getState?: () => ToolAppState;
  now?: () => Date;
  journeyChecksProvider?: JourneyChecksProvider;
}

export interface JourneyChecksProvider {
  getContext(
    viewId: string,
  ):
    | Pick<JourneyCheckContext, "presentation" | "dom">
    | Promise<Pick<JourneyCheckContext, "presentation" | "dom">>;
}

const readAnnotations = { readOnlyHint: true, untrustedContentHint: false } as const;
const writeAnnotations = { readOnlyHint: false, untrustedContentHint: false } as const;
const serviceId = z.enum(["parking_permit_renewal", "address_change"]);
const strict = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const defineTool = <TInput>(
  definition: RegistryToolDefinition<TInput>,
): RegistryToolDefinition<TInput> => definition;

const inspectPortalSchema = {
  type: "object",
  properties: {
    serviceId: {
      type: "string",
      enum: ["all", "parking_permit_renewal", "address_change"],
      description: "Service to inspect. Use all only to list available services.",
    },
    includeCurrentState: {
      type: "boolean",
      description:
        "Include the current fictional resident and draft values needed to build the task.",
    },
  },
  required: ["serviceId"],
  additionalProperties: false,
} as const;

const preferencesJsonSchema = {
  type: "object",
  properties: {
    textSize: { type: "string", enum: ["normal", "large", "xlarge"] },
    languageStyle: { type: "string", enum: ["plain", "standard"] },
    navigationStyle: { type: "string", enum: ["one_field_per_step", "grouped"] },
    controlStyle: { type: "string", enum: ["large_cards", "standard", "compact"] },
    showProgress: { type: "boolean" },
    preserveBranding: { type: "boolean" },
  },
  required: [
    "textSize",
    "languageStyle",
    "navigationStyle",
    "controlStyle",
    "showProgress",
    "preserveBranding",
  ],
  additionalProperties: false,
} as const;

const compileTaskViewJsonSchema = {
  type: "object",
  properties: {
    serviceId: { type: "string", enum: ["parking_permit_renewal", "address_change"] },
    title: { type: "string", maxLength: 100 },
    goal: { type: "string", maxLength: 240 },
    preferences: preferencesJsonSchema,
    fieldOrder: { type: "array", items: { type: "string" }, maxItems: 12 },
    hiddenOptionalFields: { type: "array", items: { type: "string" }, maxItems: 12 },
    copyOverrides: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          fieldId: { type: "string" },
          label: { type: "string", maxLength: 100 },
          helpText: { type: "string", maxLength: 240 },
        },
        required: ["fieldId"],
        additionalProperties: false,
      },
    },
    requireHumanConfirmation: { type: "boolean", const: true },
  },
  required: [
    "serviceId",
    "title",
    "goal",
    "preferences",
    "fieldOrder",
    "hiddenOptionalFields",
    "copyOverrides",
    "requireHumanConfirmation",
  ],
  additionalProperties: false,
} as const;

const patchVariantsJsonSchema = [
  {
    type: "object",
    properties: {
      type: { const: "set_preference" },
      key: {
        type: "string",
        enum: [
          "textSize",
          "languageStyle",
          "navigationStyle",
          "controlStyle",
          "showProgress",
          "preserveBranding",
        ],
      },
      value: {},
    },
    required: ["type", "key", "value"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      type: { const: "move_field" },
      fieldId: { type: "string" },
      beforeFieldId: { type: "string" },
      afterFieldId: { type: "string" },
    },
    required: ["type", "fieldId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      type: { const: "set_copy" },
      fieldId: { type: "string" },
      label: { type: "string", maxLength: 100 },
      helpText: { type: "string", maxLength: 240 },
    },
    required: ["type", "fieldId"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: {
      type: { const: "set_visibility" },
      fieldId: { type: "string" },
      visible: { type: "boolean" },
    },
    required: ["type", "fieldId", "visible"],
    additionalProperties: false,
  },
  {
    type: "object",
    properties: { type: { const: "set_title" }, title: { type: "string", maxLength: 100 } },
    required: ["type", "title"],
    additionalProperties: false,
  },
] as const;

const patchTaskViewJsonSchema = {
  type: "object",
  properties: {
    viewId: { type: "string" },
    patches: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { oneOf: patchVariantsJsonSchema },
    },
  },
  required: ["viewId", "patches"],
  additionalProperties: false,
} as const;

const workflowBindingJsonSchema = {
  type: "object",
  properties: {
    argument: { type: "string" },
    source: { type: "string", enum: ["tool_input", "portal_state", "literal"] },
    key: { type: "string" },
    value: {},
  },
  required: ["argument", "source"],
  additionalProperties: false,
} as const;

const stageWorkflowJsonSchema = {
  type: "object",
  properties: {
    viewId: { type: "string" },
    name: { type: "string", maxLength: 30, pattern: "^[a-z][a-z0-9_]*$" },
    title: { type: "string", maxLength: 100 },
    description: { type: "string", maxLength: 500 },
    parameters: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          name: { type: "string", pattern: "^[a-z][a-zA-Z0-9]*$" },
          fieldId: { type: "string" },
          description: { type: "string", maxLength: 150 },
          required: { type: "boolean" },
        },
        required: ["name", "fieldId", "description", "required"],
        additionalProperties: false,
      },
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          operationId: { type: "string" },
          bindings: { type: "array", items: workflowBindingJsonSchema },
        },
        required: ["operationId", "bindings"],
        additionalProperties: false,
      },
    },
    stopAt: { type: "string", const: "review" },
  },
  required: ["viewId", "name", "title", "description", "parameters", "operations", "stopAt"],
  additionalProperties: false,
} as const;

const preferencesValidator = strict({
  textSize: z.enum(["normal", "large", "xlarge"]),
  languageStyle: z.enum(["plain", "standard"]),
  navigationStyle: z.enum(["one_field_per_step", "grouped"]),
  controlStyle: z.enum(["large_cards", "standard", "compact"]),
  showProgress: z.boolean(),
  preserveBranding: z.boolean(),
});
const copyValidator = strict({
  fieldId: z.string(),
  label: z.string().max(100).optional(),
  helpText: z.string().max(240).optional(),
});
const patchValidator = z.discriminatedUnion("type", [
  strict({
    type: z.literal("set_preference"),
    key: z.enum([
      "textSize",
      "languageStyle",
      "navigationStyle",
      "controlStyle",
      "showProgress",
      "preserveBranding",
    ]),
    value: z.union([z.string(), z.boolean()]),
  }),
  strict({
    type: z.literal("move_field"),
    fieldId: z.string(),
    beforeFieldId: z.string().optional(),
    afterFieldId: z.string().optional(),
  }),
  strict({
    type: z.literal("set_copy"),
    fieldId: z.string(),
    label: z.string().max(100).optional(),
    helpText: z.string().max(240).optional(),
  }),
  strict({ type: z.literal("set_visibility"), fieldId: z.string(), visible: z.boolean() }),
  strict({ type: z.literal("set_title"), title: z.string().max(100) }),
]);
const parameterValidator = strict({
  name: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  fieldId: z.string(),
  description: z.string().max(150),
  required: z.boolean(),
});
const bindingValidator = strict({
  argument: z.string(),
  source: z.enum(["tool_input", "portal_state", "literal"]),
  key: z.string().optional(),
  value: z.unknown().optional(),
});
const operationValidator = strict({
  operationId: z.string(),
  bindings: z.array(bindingValidator),
});

const serviceCurrentState = (state: ToolAppState, selected: ServiceId) =>
  selected === "parking_permit_renewal"
    ? {
        resident: {
          vehicles: state.resident.vehicles.map((vehicle) => ({ ...vehicle })),
          contactEmail: state.resident.email,
          activePermit: { ...state.resident.activeParkingPermit },
        },
        draft: structuredClone(state.serviceDrafts[selected] ?? {}),
      }
    : {
        resident: { currentAddress: { ...state.resident.address } },
        draft: structuredClone(state.serviceDrafts[selected] ?? {}),
      };

export const createStaticToolDefinitions = (
  dependencies: StaticToolDependencies = {},
): RegistryToolDefinition<unknown>[] => {
  const getState = dependencies.getState ?? getAppState;
  const now = dependencies.now ?? (() => new Date());

  return [
    defineTool({
      name: "inspect_portal",
      description: "Inspect trusted CivicWeave service capabilities and current session state.",
      inputSchema: inspectPortalSchema,
      annotations: readAnnotations,
      inputValidator: strict({
        serviceId: z.enum(["all", "parking_permit_renewal", "address_change"]),
        includeCurrentState: z.boolean().optional(),
      }),
      origin: "built_in",
      async execute(input) {
        if (input.serviceId === "all") {
          return successResult("PORTAL_INSPECTED", "Listed available Northstar City services.", {
            services: Object.values(serviceBlueprints).map((blueprint) => ({
              id: blueprint.id,
              title: blueprint.title,
              description: blueprint.shortDescription,
            })),
          });
        }
        const blueprint = getServiceBlueprint(input.serviceId);
        return successResult("PORTAL_INSPECTED", `Inspected ${blueprint.title}.`, {
          service: {
            id: blueprint.id,
            title: blueprint.title,
            fields: blueprint.fields.map((field) => ({
              id: field.id,
              required: field.required,
              source: field.source,
              kind: field.kind,
            })),
            allowedOperationIds: [...blueprint.allowedOperationIds],
            finalHumanOperationId: blueprint.finalHumanOperationId,
          },
          ...(input.includeCurrentState
            ? { currentState: serviceCurrentState(getState(), input.serviceId) }
            : {}),
        });
      },
    }),
    defineTool({
      name: "compile_task_view",
      description: "Compile a safe task-specific interface from trusted portal fields.",
      inputSchema: compileTaskViewJsonSchema,
      annotations: writeAnnotations,
      inputValidator: strict({
        serviceId,
        title: z.string().max(100),
        goal: z.string().max(240),
        preferences: preferencesValidator,
        fieldOrder: z.array(z.string()).max(12),
        hiddenOptionalFields: z.array(z.string()).max(12),
        copyOverrides: z.array(copyValidator).max(12),
        requireHumanConfirmation: z.literal(true),
      }),
      origin: "built_in",
      async execute(input) {
        const view = compileTaskView(input, now());
        getState().startManualFlow(input.serviceId);
        getState().addView(view);
        return successResult("VIEW_COMPILED", "Created a trusted adaptive task view.", {
          viewId: view.id,
          revision: view.revision,
          visibleFieldIds: [...view.fieldOrder],
          preferences: { ...view.preferences },
          nextAction: "Inspect the view, preserve human locks, then run journey checks.",
        });
      },
    }),
    defineTool({
      name: "inspect_task_view",
      description: "Inspect the active generated view, locks, checks, and current values.",
      inputSchema: {
        type: "object",
        properties: { viewId: { type: "string" } },
        additionalProperties: false,
      },
      annotations: readAnnotations,
      inputValidator: strict({ viewId: z.string().optional() }),
      origin: "built_in",
      async execute(input) {
        const state = getState();
        const viewId = input.viewId ?? state.activeViewId;
        const view = viewId ? state.views[viewId] : undefined;
        if (!view)
          throw new DomainError("VIEW_NOT_FOUND", "The requested task view was not found.");
        return successResult("VIEW_INSPECTED", "Inspected the current adaptive task view.", {
          view: {
            id: view.id,
            serviceId: view.serviceId,
            title: view.title,
            revision: view.revision,
            preferences: { ...view.preferences },
            fieldOrder: [...view.fieldOrder],
            hiddenOptionalFields: [...view.hiddenOptionalFields],
          },
          lockedElementIds: [...view.lockedElementIds],
          currentValues: structuredClone(state.serviceDrafts[view.serviceId] ?? {}),
          checkStatus: (state.journeyChecks[view.id] ?? []).map((check) => ({
            id: check.id,
            status: check.status,
          })),
        });
      },
    }),
    defineTool({
      name: "patch_task_view",
      description: "Atomically apply safe incremental changes while respecting human locks.",
      inputSchema: patchTaskViewJsonSchema,
      annotations: writeAnnotations,
      inputValidator: strict({
        viewId: z.string(),
        patches: z.array(patchValidator).min(1).max(12),
      }),
      origin: "built_in",
      async execute(input) {
        const view = getState().views[input.viewId];
        if (!view)
          throw new DomainError("VIEW_NOT_FOUND", "The requested task view was not found.");
        const patched = patchTaskView(view, input.patches);
        getState().updateView(patched);
        return successResult("VIEW_PATCHED", "Applied the safe view patch.", {
          viewId: patched.id,
          revision: patched.revision,
          lockedElementIds: [...patched.lockedElementIds],
          visibleFieldIds: [...patched.fieldOrder],
        });
      },
    }),
    defineTool({
      name: "run_journey_checks",
      description: "Run deterministic completeness, safety, and accessibility checks.",
      inputSchema: {
        type: "object",
        properties: {
          viewId: { type: "string" },
          includeDomChecks: { type: "boolean" },
        },
        required: ["viewId"],
        additionalProperties: false,
      },
      annotations: readAnnotations,
      inputValidator: strict({ viewId: z.string(), includeDomChecks: z.boolean().optional() }),
      origin: "built_in",
      async execute(input) {
        const view = getState().views[input.viewId];
        if (!view)
          throw new DomainError("VIEW_NOT_FOUND", "The requested task view was not found.");
        const blueprint = getServiceBlueprint(view.serviceId);
        const renderedContext = input.includeDomChecks
          ? await dependencies.journeyChecksProvider?.getContext(view.id)
          : undefined;
        const checks = await runJourneyChecks(view, {
          includeDomChecks: input.includeDomChecks,
          presentation: renderedContext?.presentation,
          dom: renderedContext?.dom,
          operationSafety: {
            finalHumanOperationCompilable:
              operationRegistry[blueprint.finalHumanOperationId]?.compilable,
          },
        });
        getState().setJourneyChecks(view.id, checks);
        const failures = checks.filter((check) => check.status === "fail");
        const warnings = checks.filter((check) => check.status === "warning");
        return successResult("CHECKS_COMPLETED", "Completed deterministic journey checks.", {
          total: checks.length,
          blockingFailures: failures.length,
          warnings: warnings.length,
          failedCheckIds: failures.map((check) => check.id),
        });
      },
    }),
    defineTool({
      name: "stage_workflow_tool",
      description: "Validate and stage a reusable workflow proposal for human review.",
      inputSchema: stageWorkflowJsonSchema,
      annotations: writeAnnotations,
      inputValidator: strict({
        viewId: z.string(),
        name: z
          .string()
          .max(30)
          .regex(/^[a-z][a-z0-9_]*$/),
        title: z.string().max(100),
        description: z.string().max(500),
        parameters: z.array(parameterValidator).max(6),
        operations: z.array(operationValidator).min(1).max(8),
        stopAt: z.literal("review"),
      }),
      origin: "built_in",
      async execute(input) {
        const state = getState();
        const view = state.views[input.viewId];
        if (!view)
          throw new DomainError("VIEW_NOT_FOUND", "The requested task view was not found.");
        const proposal = compileWorkflowProposal(
          { ...input, serviceId: view.serviceId },
          {
            now: { now },
            staticToolNames: STATIC_TOOL_NAMES,
            enabledCompiledToolNames: Object.values(state.approvedWorkflowTools)
              .filter((tool) => tool.enabled)
              .map((tool) => tool.name),
            journeyChecks: state.journeyChecks[view.id],
          },
        );
        if (proposal.status !== "awaiting_approval") {
          throw new DomainError(
            "VIEW_VALIDATION_FAILED",
            proposal.validationErrors[0] ?? "The workflow proposal is not safe to stage.",
          );
        }
        const draft = { ...proposal, status: "draft" as const };
        getState().createProposal(draft);
        getState().validateProposal(draft.id);
        getState().requestProposalApproval(draft.id);
        return successResult("WORKFLOW_STAGED", "Staged the workflow for human review only.", {
          proposalId: draft.id,
          name: draft.name,
          status: "awaiting_approval",
          validationErrors: [],
          requiresHumanApproval: true,
          nextAction: "Review the visible proposal and use the human approval control.",
        });
      },
    }),
    defineTool({
      name: "list_workflow_tools",
      description: "List compact metadata for staged, registered, and disabled workflow tools.",
      inputSchema: {
        type: "object",
        properties: { includeDisabled: { type: "boolean" } },
        additionalProperties: false,
      },
      annotations: readAnnotations,
      inputValidator: strict({ includeDisabled: z.boolean().optional() }),
      origin: "built_in",
      async execute(input) {
        const state = getState();
        const tools = [
          ...Object.values(state.proposals).map((proposal) => ({
            id: proposal.id,
            name: proposal.name,
            title: proposal.title,
            serviceId: proposal.serviceId,
            status: proposal.status,
            requiresHumanApproval: proposal.status === "awaiting_approval",
          })),
          ...Object.values(state.approvedWorkflowTools)
            .filter((tool) => !state.proposals[tool.id])
            .map((tool) => ({
              id: tool.id,
              name: tool.name,
              title: tool.title,
              serviceId: tool.serviceId,
              status: tool.status,
              enabled: tool.enabled,
            })),
        ].filter((tool) => input.includeDisabled || tool.status !== "disabled");
        return successResult("WORKFLOW_TOOLS_LISTED", "Listed compiled workflow tools.", {
          tools,
        });
      },
    }),
  ];
};

export const STATIC_TOOL_NAMES = [
  "inspect_portal",
  "compile_task_view",
  "inspect_task_view",
  "patch_task_view",
  "run_journey_checks",
  "stage_workflow_tool",
  "list_workflow_tools",
] as const;
