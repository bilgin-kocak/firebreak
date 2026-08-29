import { getServiceBlueprint, serviceBlueprints } from "./serviceBlueprints";
import { viewPatchSchema, viewPreferenceSchema } from "./schemas";
import type { CopyOverride, TaskViewDefinition, ViewPatch, ViewPreference } from "./types";
import { DomainError } from "./types";
import { validateTaskView } from "./viewValidator";

export interface CompileTaskViewInput {
  serviceId: TaskViewDefinition["serviceId"];
  title: string;
  goal: string;
  preferences: ViewPreference;
  fieldOrder: string[];
  hiddenOptionalFields: string[];
  copyOverrides: CopyOverride[];
  requireHumanConfirmation: true;
}

export interface ResolvedFieldCopy {
  label: string;
  helpText: string;
}

const normalizeText = (value: unknown, maxLength: number, name: string): string => {
  if (typeof value !== "string") {
    throw new DomainError("VIEW_VALIDATION_FAILED", `${name} must be plain text.`, { name });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new DomainError("VIEW_VALIDATION_FAILED", `${name} must be 1–${maxLength} characters.`, {
      name,
    });
  }
  return normalized;
};

const ensureKnown = (fieldId: string, knownIds: Set<string>): void => {
  if (!knownIds.has(fieldId)) {
    throw new DomainError("UNKNOWN_FIELD", `Field '${fieldId}' is not provided by this service.`, {
      fieldId,
    });
  }
};

const unique = (ids: string[]): string[] => [...new Set(ids)];

const preferenceKeys: Array<keyof ViewPreference> = [
  "textSize",
  "languageStyle",
  "navigationStyle",
  "controlStyle",
  "showProgress",
  "preserveBranding",
];

const normalizePreferences = (preferences: unknown): ViewPreference => {
  if (
    typeof preferences !== "object" ||
    preferences === null ||
    Object.keys(preferences).some((key) => !preferenceKeys.includes(key as keyof ViewPreference))
  ) {
    throw new DomainError("VIEW_VALIDATION_FAILED", "Preferences contain an untrusted key.");
  }
  const parsed = viewPreferenceSchema.safeParse(preferences);
  if (!parsed.success) {
    throw new DomainError(
      "VIEW_VALIDATION_FAILED",
      "Preferences do not match trusted view options.",
      {
        errors: parsed.error.issues.map((issue) => issue.message),
      },
    );
  }
  return parsed.data;
};

const normalizeCopyOverrides = (
  copyOverrides: CopyOverride[],
  knownIds: Set<string>,
): CopyOverride[] => {
  const seen = new Set<string>();
  return copyOverrides.map((copy) => {
    ensureKnown(copy.fieldId, knownIds);
    if (seen.has(copy.fieldId)) {
      throw new DomainError(
        "VIEW_VALIDATION_FAILED",
        `Copy for '${copy.fieldId}' was supplied more than once.`,
        {
          fieldId: copy.fieldId,
        },
      );
    }
    seen.add(copy.fieldId);
    const normalized: CopyOverride = { fieldId: copy.fieldId };
    if (copy.label !== undefined) normalized.label = normalizeText(copy.label, 100, "Copy label");
    if (copy.helpText !== undefined)
      normalized.helpText = normalizeText(copy.helpText, 240, "Copy help text");
    return normalized;
  });
};

const makeId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "view_test_fallback";

const assertValid = (view: TaskViewDefinition): void => {
  const validation = validateTaskView(view);
  if (!validation.valid) {
    throw new DomainError("VIEW_VALIDATION_FAILED", "The requested view is not safe to display.", {
      errors: validation.errors,
    });
  }
};

export const compileTaskView = (input: CompileTaskViewInput, now: Date): TaskViewDefinition => {
  if (!(input.serviceId in serviceBlueprints)) {
    throw new DomainError(
      "UNKNOWN_SERVICE",
      "The requested service is not available in this portal.",
      {
        serviceId: input.serviceId,
      },
    );
  }
  const blueprint = getServiceBlueprint(input.serviceId);
  const knownIds = new Set(blueprint.fields.map((field) => field.id));
  const requiredIds = blueprint.fields.filter((field) => field.required).map((field) => field.id);

  for (const fieldId of input.fieldOrder) ensureKnown(fieldId, knownIds);
  for (const fieldId of input.hiddenOptionalFields) {
    ensureKnown(fieldId, knownIds);
    if (requiredIds.includes(fieldId)) {
      throw new DomainError(
        "REQUIRED_FIELD_HIDDEN",
        `Required field '${fieldId}' cannot be hidden.`,
        {
          fieldId,
        },
      );
    }
  }

  const requestedOrder = unique(input.fieldOrder);
  const fieldOrder = [
    ...requestedOrder,
    ...requiredIds.filter((fieldId) => !requestedOrder.includes(fieldId)),
  ];
  const timestamp = now.toISOString();
  const view: TaskViewDefinition = {
    id: makeId(),
    serviceId: input.serviceId,
    title: normalizeText(input.title, 100, "Title"),
    goal: normalizeText(input.goal, 240, "Goal"),
    preferences: normalizePreferences(input.preferences),
    fieldOrder,
    hiddenOptionalFields: unique(input.hiddenOptionalFields),
    copyOverrides: normalizeCopyOverrides(input.copyOverrides, knownIds),
    lockedElementIds: [],
    requireHumanConfirmation: input.requireHumanConfirmation,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  assertValid(view);
  return view;
};

const lockedTargetsForPatch = (patch: ViewPatch): string[] => {
  switch (patch.type) {
    case "move_field":
    case "set_visibility":
      return [`field:${patch.fieldId}`];
    case "set_copy":
      return [`copy:${patch.fieldId}`];
    case "set_title":
      return ["title"];
    case "set_preference":
      return [];
  }
};

const cloneView = (view: TaskViewDefinition): TaskViewDefinition => ({
  ...view,
  preferences: { ...view.preferences },
  fieldOrder: [...view.fieldOrder],
  hiddenOptionalFields: [...view.hiddenOptionalFields],
  copyOverrides: view.copyOverrides.map((copy) => ({ ...copy })),
  lockedElementIds: [...view.lockedElementIds],
});

const applyPatch = (view: TaskViewDefinition, patch: ViewPatch): void => {
  const blueprint = getServiceBlueprint(view.serviceId);
  const knownIds = new Set(blueprint.fields.map((field) => field.id));
  const requiredIds = new Set(
    blueprint.fields.filter((field) => field.required).map((field) => field.id),
  );

  switch (patch.type) {
    case "set_preference":
      view.preferences[patch.key] = patch.value as never;
      return;
    case "set_title":
      view.title = normalizeText(patch.title, 100, "Title");
      return;
    case "set_copy": {
      ensureKnown(patch.fieldId, knownIds);
      const existingIndex = view.copyOverrides.findIndex((item) => item.fieldId === patch.fieldId);
      const copy = normalizeCopyOverrides(
        [
          {
            ...(existingIndex === -1 ? {} : view.copyOverrides[existingIndex]),
            ...patch,
          },
        ],
        knownIds,
      )[0]!;
      if (existingIndex === -1) view.copyOverrides.push(copy);
      else view.copyOverrides[existingIndex] = copy;
      return;
    }
    case "set_visibility":
      ensureKnown(patch.fieldId, knownIds);
      if (!patch.visible && requiredIds.has(patch.fieldId)) {
        throw new DomainError(
          "REQUIRED_FIELD_HIDDEN",
          `Required field '${patch.fieldId}' cannot be hidden.`,
          {
            fieldId: patch.fieldId,
          },
        );
      }
      view.hiddenOptionalFields = patch.visible
        ? view.hiddenOptionalFields.filter((fieldId) => fieldId !== patch.fieldId)
        : unique([...view.hiddenOptionalFields, patch.fieldId]);
      return;
    case "move_field": {
      ensureKnown(patch.fieldId, knownIds);
      if (patch.beforeFieldId) ensureKnown(patch.beforeFieldId, knownIds);
      if (patch.afterFieldId) ensureKnown(patch.afterFieldId, knownIds);
      if (patch.beforeFieldId && patch.afterFieldId) {
        throw new DomainError("VIEW_VALIDATION_FAILED", "A field may have one placement target.");
      }
      const next = view.fieldOrder.filter((fieldId) => fieldId !== patch.fieldId);
      const target = patch.beforeFieldId ?? patch.afterFieldId;
      if (!target) {
        next.push(patch.fieldId);
      } else {
        const index = next.indexOf(target);
        if (index === -1) {
          throw new DomainError(
            "VIEW_VALIDATION_FAILED",
            `Placement target '${target}' is not visible.`,
          );
        }
        next.splice(patch.beforeFieldId ? index : index + 1, 0, patch.fieldId);
      }
      view.fieldOrder = next;
    }
  }
};

export const patchTaskView = (
  view: TaskViewDefinition,
  patches: ViewPatch[],
): TaskViewDefinition => {
  if (patches.length === 0) {
    throw new DomainError("VIEW_VALIDATION_FAILED", "At least one patch is required.");
  }
  const validatedPatches = patches.map((patch) => {
    const parsed = viewPatchSchema.safeParse(patch);
    if (!parsed.success) {
      throw new DomainError("VIEW_VALIDATION_FAILED", "A requested patch is not safe to apply.", {
        errors: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return parsed.data;
  });
  const lockedElementIds = new Set(view.lockedElementIds);
  const conflicts = unique(
    validatedPatches.flatMap(lockedTargetsForPatch).filter((id) => lockedElementIds.has(id)),
  );
  if (conflicts.length > 0) {
    throw new DomainError(
      "LOCKED_BY_USER",
      "The requested patch would change content the user locked.",
      { lockedElementIds: conflicts },
    );
  }

  const candidate = cloneView(view);
  for (const patch of validatedPatches) applyPatch(candidate, patch);
  candidate.revision += 1;
  candidate.updatedAt = new Date().toISOString();
  assertValid(candidate);
  return candidate;
};

export const resolveFieldCopy = (view: TaskViewDefinition, fieldId: string): ResolvedFieldCopy => {
  const field = getServiceBlueprint(view.serviceId).fields.find((item) => item.id === fieldId);
  if (!field) {
    throw new DomainError("UNKNOWN_FIELD", `Field '${fieldId}' is not provided by this service.`, {
      fieldId,
    });
  }
  const copy = view.copyOverrides.find((item) => item.fieldId === fieldId);
  return {
    label:
      copy?.label ?? (view.preferences.languageStyle === "plain" ? field.plainLabel : field.label),
    helpText:
      copy?.helpText ??
      (view.preferences.languageStyle === "plain" ? field.plainDescription : field.description),
  };
};
