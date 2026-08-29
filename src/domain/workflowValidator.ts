import { getServiceBlueprint } from "./serviceBlueprints";
import {
  operationRegistry,
  portalStateAllowlist,
  type JsonSchema,
  validateJsonSchema,
} from "./operationRegistry";
import type { ErrorCode, ServiceId, WorkflowParameter, WorkflowToolProposal } from "./types";

export interface WorkflowValidationError {
  code: ErrorCode;
  message: string;
  path?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationError[];
}

export interface WorkflowValidationOptions {
  staticToolNames?: readonly string[];
  enabledCompiledToolNames?: readonly string[];
  journeyChecks?: ReadonlyArray<{ id: string; status: "pass" | "fail" | "warning" }>;
}

export interface DynamicInputSchema {
  type: "object";
  properties: Record<string, JsonSchema & { description: string }>;
  required: string[];
  additionalProperties: false;
}

const add = (
  errors: WorkflowValidationError[],
  code: ErrorCode,
  message: string,
  path?: string,
): void => {
  errors.push({ code, message, ...(path ? { path } : {}) });
};

const fieldInputSchema = (serviceId: ServiceId, fieldId: string): JsonSchema | undefined => {
  const field = getServiceBlueprint(serviceId).fields.find((candidate) => candidate.id === fieldId);
  if (!field) return undefined;
  if (field.kind === "boolean") return { type: "boolean" };
  if (field.kind === "email") return { type: "string", format: "email", maxLength: 254 };
  if (field.kind === "date") return { type: "string", format: "date" };
  if (field.options?.length) {
    const values = field.options.map((option) => option.value);
    const type = values.every((value) => typeof value === "number") ? "integer" : "string";
    return { type, enum: values as (string | number)[] };
  }
  return {
    type: "string",
    minLength: field.validation.minLength,
    maxLength: field.validation.maxLength,
    pattern: field.validation.pattern,
  };
};

/** Returns true only when every value admitted by sourceSchema is valid for argumentSchema. */
const schemasCompatible = (sourceSchema: JsonSchema, argumentSchema: JsonSchema): boolean => {
  if (sourceSchema.type !== argumentSchema.type) return false;
  if (sourceSchema.enum !== undefined) {
    return sourceSchema.enum.every((value) => validateJsonSchema(argumentSchema, value));
  }
  if (argumentSchema.enum !== undefined) return false;
  if (argumentSchema.format !== undefined && sourceSchema.format !== argumentSchema.format) {
    return false;
  }
  if (
    argumentSchema.minLength !== undefined &&
    (sourceSchema.minLength === undefined || sourceSchema.minLength < argumentSchema.minLength)
  ) {
    return false;
  }
  if (
    argumentSchema.maxLength !== undefined &&
    (sourceSchema.maxLength === undefined || sourceSchema.maxLength > argumentSchema.maxLength)
  ) {
    return false;
  }
  if (argumentSchema.pattern !== undefined && sourceSchema.pattern !== argumentSchema.pattern) {
    return false;
  }
  return true;
};

const propertySchemas = (schema: JsonSchema): Record<string, JsonSchema> => schema.properties ?? {};

const knownParameter = (
  parameters: readonly WorkflowParameter[],
  name: string | undefined,
): WorkflowParameter | undefined => parameters.find((parameter) => parameter.name === name);

export const deriveDynamicInputSchema = (proposal: WorkflowToolProposal): DynamicInputSchema => {
  const properties: DynamicInputSchema["properties"] = {};
  const required: string[] = [];
  for (const parameter of proposal.parameters) {
    const schema = fieldInputSchema(proposal.serviceId, parameter.fieldId);
    if (!schema) continue;
    properties[parameter.name] = { ...schema, description: parameter.description };
    if (parameter.required) required.push(parameter.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
};

export const validateWorkflowProposal = (
  proposal: WorkflowToolProposal,
  options: WorkflowValidationOptions = {},
): WorkflowValidationResult => {
  const errors: WorkflowValidationError[] = [];
  const blueprint = getServiceBlueprint(proposal.serviceId);
  const allNames = new Set([
    ...(options.staticToolNames ?? []),
    ...(options.enabledCompiledToolNames ?? []),
  ]);

  if (!/^[a-z][a-z0-9_]*$/.test(proposal.name) || proposal.name.length > 30) {
    add(
      errors,
      "INVALID_WORKFLOW_NAME",
      "Tool names must match the lowercase bounded naming contract.",
      "name",
    );
  }
  if (allNames.has(proposal.name)) {
    add(errors, "TOOL_NAME_COLLISION", "Tool name collides with a registered tool.", "name");
  }
  if (
    proposal.title.length > 100 ||
    !proposal.description.trim() ||
    proposal.description.length > 500
  ) {
    add(
      errors,
      "INVALID_WORKFLOW_NAME",
      "Workflow text exceeds its safe budget or the description is empty.",
    );
  }
  if (proposal.operations.length > 8) {
    add(
      errors,
      "WORKFLOW_BUDGET_EXCEEDED",
      "A workflow may contain at most 8 operation steps.",
      "operations",
    );
  }
  if (proposal.parameters.length > 6) {
    add(errors, "INVALID_PARAMETER", "A workflow may expose at most 6 parameters.", "parameters");
  }

  const parameterNames = new Set<string>();
  for (const parameter of proposal.parameters) {
    const field = blueprint.fields.find((candidate) => candidate.id === parameter.fieldId);
    if (
      !/^[a-z][a-zA-Z0-9]*$/.test(parameter.name) ||
      parameter.name.length === 0 ||
      parameter.description.length > 150 ||
      !field ||
      parameterNames.has(parameter.name)
    ) {
      add(
        errors,
        "INVALID_PARAMETER",
        "Parameters must have unique safe names and map to known service fields.",
        `parameters.${parameter.name}`,
      );
    }
    parameterNames.add(parameter.name);
  }

  proposal.operations.forEach((step, index) => {
    const operation = operationRegistry[step.operationId];
    if (!operation) {
      add(
        errors,
        "UNKNOWN_OPERATION",
        "Workflow references an unknown trusted operation.",
        `operations.${index}`,
      );
      return;
    }
    const belongsToService = operation.serviceId === proposal.serviceId;
    if (!belongsToService) {
      add(
        errors,
        "CROSS_SERVICE_OPERATION",
        "Workflow operations must belong to the selected service.",
        `operations.${index}`,
      );
    }
    if (
      belongsToService &&
      operation.compilable &&
      operation.sideEffect !== "human_only" &&
      !blueprint.allowedOperationIds.includes(operation.id)
    ) {
      add(
        errors,
        "UNKNOWN_OPERATION",
        "Workflow operation is not allowed by this service blueprint. Remove it and retry staging.",
        `operations.${index}`,
      );
    }
    if (!operation.compilable || operation.sideEffect === "human_only") {
      add(
        errors,
        "HUMAN_ONLY_OPERATION",
        "Human-only operations can never be compiled.",
        `operations.${index}`,
      );
    }
    for (const dependency of operation.dependencies) {
      if (
        !proposal.operations.slice(0, index).some((previous) => previous.operationId === dependency)
      ) {
        add(
          errors,
          "DEPENDENCY_ORDER_INVALID",
          `Operation ${operation.id} requires ${dependency} before it.`,
          `operations.${index}`,
        );
      }
    }

    const argumentsByName = propertySchemas(operation.inputSchema);
    for (const [argument, argumentSchema] of Object.entries(argumentsByName)) {
      if (!operation.inputSchema.required?.includes(argument)) continue;
      const bindings = step.bindings.filter((binding) => binding.argument === argument);
      if (bindings.length !== 1) {
        add(
          errors,
          "INVALID_BINDING",
          `Required argument ${argument} needs exactly one binding.`,
          `operations.${index}`,
        );
        continue;
      }
      const binding = bindings[0];
      if (!binding) continue;
      if (binding.source === "tool_input") {
        const parameter = knownParameter(proposal.parameters, binding.key);
        const schema = parameter
          ? fieldInputSchema(proposal.serviceId, parameter.fieldId)
          : undefined;
        if (
          !parameter ||
          !parameter.required ||
          !schema ||
          !schemasCompatible(schema, argumentSchema)
        ) {
          add(
            errors,
            "INVALID_BINDING",
            `Tool-input binding for ${argument} is not a compatible required parameter.`,
            `operations.${index}`,
          );
        }
      }
      if (binding.source === "portal_state") {
        const sourceSchema = binding.key
          ? portalStateAllowlist[proposal.serviceId][binding.key]
          : undefined;
        if (!sourceSchema || !schemasCompatible(sourceSchema, argumentSchema)) {
          add(
            errors,
            "INVALID_BINDING",
            `Portal-state binding for ${argument} is not allowlisted or compatible.`,
            `operations.${index}`,
          );
        }
      }
      if (binding.source === "literal" && !validateJsonSchema(argumentSchema, binding.value)) {
        add(
          errors,
          "INVALID_BINDING",
          `Literal binding for ${argument} does not match its trusted schema.`,
          `operations.${index}`,
        );
      }
    }
    for (const binding of step.bindings) {
      if (!(binding.argument in argumentsByName)) {
        add(
          errors,
          "INVALID_BINDING",
          `Binding references unknown argument ${binding.argument}.`,
          `operations.${index}`,
        );
      }
      if (binding.source !== "literal" && !binding.key) {
        add(
          errors,
          "INVALID_BINDING",
          "Nonliteral bindings require a trusted key.",
          `operations.${index}`,
        );
      }
    }
  });

  const lastStep = proposal.operations.at(-1);
  if (
    lastStep?.operationId !== blueprint.allowedOperationIds.at(-1) ||
    !lastStep?.operationId.endsWith(".stage_review")
  ) {
    add(
      errors,
      "REVIEW_STEP_REQUIRED",
      "The final operation must be the trusted stage_review operation.",
      "operations",
    );
  }
  if (proposal.stopAt !== "review") {
    add(errors, "REVIEW_STEP_REQUIRED", "stopAt must be exactly review.", "stopAt");
  }
  if (options.journeyChecks?.some((check) => check.status === "fail")) {
    add(
      errors,
      "CHECKS_FAILED",
      "Blocking journey checks must pass before a workflow can be approved.",
    );
  }
  const inputSchema = deriveDynamicInputSchema(proposal);
  if (inputSchema.additionalProperties !== false) {
    add(errors, "INVALID_BINDING", "Derived tool input schema must reject additional properties.");
  }

  return { valid: errors.length === 0, errors };
};
