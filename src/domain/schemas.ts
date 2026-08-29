import { z } from "zod";

import type {
  ActivityEntry,
  ApprovedWorkflowTool,
  FieldDefinition,
  ServiceBlueprint,
  TaskViewDefinition,
  ViewPatch,
  ViewPreference,
  WorkflowToolProposal,
} from "./types";

export const serviceIdSchema = z.enum(["parking_permit_renewal", "address_change"]);

export const viewPreferenceSchema: z.ZodType<ViewPreference> = z.object({
  textSize: z.enum(["normal", "large", "xlarge"]),
  languageStyle: z.enum(["plain", "standard"]),
  navigationStyle: z.enum(["one_field_per_step", "grouped"]),
  controlStyle: z.enum(["large_cards", "standard", "compact"]),
  showProgress: z.boolean(),
  preserveBranding: z.boolean(),
});

export const fieldKindSchema = z.enum([
  "text",
  "email",
  "date",
  "select",
  "radio",
  "readonly_summary",
  "boolean",
]);

export const fieldDefinitionSchema: z.ZodType<FieldDefinition> = z.object({
  id: z.string().min(1),
  serviceId: serviceIdSchema,
  label: z.string().min(1),
  plainLabel: z.string().min(1),
  description: z.string(),
  plainDescription: z.string(),
  kind: fieldKindSchema,
  required: z.boolean(),
  options: z
    .array(z.object({ label: z.string().min(1), value: z.union([z.string(), z.number()]) }))
    .optional(),
  source: z.enum(["user_input", "portal_state", "derived"]),
  defaultValuePath: z.string().min(1).optional(),
  validation: z.object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
    pattern: z.string().optional(),
  }),
});

export const copyOverrideSchema = z.object({
  fieldId: z.string().min(1),
  label: z.string().trim().min(1).max(100).optional(),
  helpText: z.string().trim().min(1).max(240).optional(),
});

export const taskViewDefinitionSchema: z.ZodType<TaskViewDefinition> = z.object({
  id: z.string().min(1),
  serviceId: serviceIdSchema,
  title: z.string().trim().min(1).max(100),
  goal: z.string().trim().min(1).max(240),
  preferences: viewPreferenceSchema,
  fieldOrder: z.array(z.string().min(1)).max(12),
  hiddenOptionalFields: z.array(z.string().min(1)).max(12),
  copyOverrides: z.array(copyOverrideSchema).max(12),
  lockedElementIds: z.array(z.string().min(1)),
  requireHumanConfirmation: z.literal(true),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const viewPatchSchema: z.ZodType<ViewPatch> = z.discriminatedUnion("type", [
  z.object({
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
  z.object({
    type: z.literal("move_field"),
    fieldId: z.string().min(1),
    beforeFieldId: z.string().min(1).optional(),
    afterFieldId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal("set_copy"),
    fieldId: z.string().min(1),
    label: z.string().trim().min(1).max(100).optional(),
    helpText: z.string().trim().min(1).max(240).optional(),
  }),
  z.object({
    type: z.literal("set_visibility"),
    fieldId: z.string().min(1),
    visible: z.boolean(),
  }),
  z.object({ type: z.literal("set_title"), title: z.string().trim().min(1).max(100) }),
]);

const operationBindingSchema = z.object({
  argument: z.string().min(1),
  source: z.enum(["tool_input", "portal_state", "literal"]),
  key: z.string().min(1).optional(),
  value: z.unknown().optional(),
});

const workflowOperationStepSchema = z.object({
  operationId: z.string().min(1),
  bindings: z.array(operationBindingSchema),
});

const workflowParameterSchema = z.object({
  name: z.string().min(1),
  fieldId: z.string().min(1),
  description: z.string().min(1).max(150),
  required: z.boolean(),
});

export const workflowToolProposalSchema = z.object({
  id: z.string().min(1),
  viewId: z.string().min(1),
  serviceId: serviceIdSchema,
  name: z.string().min(1).max(30),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  parameters: z.array(workflowParameterSchema).max(6),
  operations: z.array(workflowOperationStepSchema).min(1).max(8),
  stopAt: z.literal("review"),
  status: z.enum(["draft", "validated", "awaiting_approval", "registered", "rejected", "disabled"]),
  validationErrors: z.array(z.string()),
  createdAt: z.string().datetime(),
}) satisfies z.ZodType<WorkflowToolProposal>;

export const approvedWorkflowToolSchema: z.ZodType<ApprovedWorkflowTool> =
  workflowToolProposalSchema.extend({
    status: z.enum(["registered", "disabled"]),
    approvedAt: z.string().datetime(),
    enabled: z.boolean(),
    registrationRevision: z.number().int().positive(),
  });

export const activityEntrySchema: z.ZodType<ActivityEntry> = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  actor: z.enum(["agent", "human", "system"]),
  kind: z.enum([
    "tool_started",
    "tool_completed",
    "tool_failed",
    "view_compiled",
    "view_patched",
    "element_locked",
    "element_unlocked",
    "checks_completed",
    "workflow_staged",
    "workflow_approved",
    "workflow_rejected",
    "tool_registered",
    "tool_unregistered",
    "toolchange",
    "draft_staged",
    "submission_confirmed",
    "reset",
  ]),
  title: z.string().min(1),
  detail: z.string().optional(),
  toolName: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.enum(["info", "success", "warning", "error"]),
});

export const serviceBlueprintSchema: z.ZodType<ServiceBlueprint> = z.object({
  id: serviceIdSchema,
  title: z.string().min(1),
  shortDescription: z.string().min(1),
  fields: z.array(fieldDefinitionSchema).min(1),
  baselineJourney: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      interactionCost: z.number().int().nonnegative(),
    }),
  ),
  allowedOperationIds: z.array(z.string().min(1)),
  finalHumanOperationId: z.string().min(1),
});

export const residentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().min(1),
  }),
  vehicles: z.array(
    z.object({ id: z.string().min(1), label: z.string().min(1), plate: z.string().min(1) }),
  ),
  activeParkingPermit: z.object({
    id: z.string().min(1),
    vehicleId: z.string().min(1),
    expiresOn: z.string().date(),
    zone: z.string().min(1),
  }),
});
