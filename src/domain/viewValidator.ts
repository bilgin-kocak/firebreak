import { getServiceBlueprint, serviceBlueprints } from "./serviceBlueprints";
import { taskViewDefinitionSchema } from "./schemas";
import type { TaskViewDefinition } from "./types";

export interface TaskViewValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Security invariant: a view definition is data over trusted blueprint fields;
 * it never carries executable presentation code or component names.
 */
export const validateTaskView = (view: TaskViewDefinition): TaskViewValidationResult => {
  const errors: string[] = [];
  const parsed = taskViewDefinitionSchema.safeParse(view);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }

  if (!(view.serviceId in serviceBlueprints)) {
    errors.push(`Unknown service: ${String(view.serviceId)}`);
    return { valid: false, errors };
  }
  const blueprint = getServiceBlueprint(view.serviceId);
  const knownIds = new Set(blueprint.fields.map((field) => field.id));
  const requiredIds = blueprint.fields.filter((field) => field.required).map((field) => field.id);

  for (const fieldId of view.fieldOrder) {
    if (!knownIds.has(fieldId)) errors.push(`Unknown field: ${fieldId}`);
  }
  for (const fieldId of view.hiddenOptionalFields) {
    if (!knownIds.has(fieldId)) errors.push(`Unknown field: ${fieldId}`);
    if (requiredIds.includes(fieldId)) errors.push(`Required field cannot be hidden: ${fieldId}`);
  }
  for (const fieldId of requiredIds) {
    if (!view.fieldOrder.includes(fieldId)) errors.push(`Required field missing: ${fieldId}`);
  }
  if (new Set(view.fieldOrder).size !== view.fieldOrder.length)
    errors.push("Field IDs must be unique");
  if (new Set(view.hiddenOptionalFields).size !== view.hiddenOptionalFields.length) {
    errors.push("Hidden field IDs must be unique");
  }

  for (const copy of view.copyOverrides) {
    if (!knownIds.has(copy.fieldId)) errors.push(`Unknown copy field: ${copy.fieldId}`);
    if (
      copy.label !== undefined &&
      (typeof copy.label !== "string" ||
        !copy.label.trim() ||
        copy.label !== copy.label.trim() ||
        copy.label.length > 100)
    ) {
      errors.push(`Unsafe copy label: ${copy.fieldId}`);
    }
    if (
      copy.helpText !== undefined &&
      (typeof copy.helpText !== "string" ||
        !copy.helpText.trim() ||
        copy.helpText !== copy.helpText.trim() ||
        copy.helpText.length > 240)
    ) {
      errors.push(`Unsafe copy help text: ${copy.fieldId}`);
    }
  }
  if (new Set(view.copyOverrides.map((copy) => copy.fieldId)).size !== view.copyOverrides.length) {
    errors.push("Copy overrides must be unique per field");
  }

  const validLockTargets = new Set([
    "title",
    ...blueprint.fields.flatMap((field) => [`field:${field.id}`, `copy:${field.id}`]),
  ]);
  for (const lock of view.lockedElementIds) {
    if (!validLockTargets.has(lock)) errors.push(`Invalid lock target: ${lock}`);
  }

  return { valid: errors.length === 0, errors };
};
