import { getServiceBlueprint, serviceBlueprints } from "./serviceBlueprints";
import type { TaskViewDefinition } from "./types";

export interface JourneyCheckResult {
  id: string;
  title: string;
  status: "pass" | "fail" | "warning";
  detail: string;
  affectedElementIds?: string[];
}

export interface AxeViolation {
  id: string;
  impact?: "minor" | "moderate" | "serious" | "critical" | null;
}

export interface JourneyCheckContext {
  includeDomChecks?: boolean;
  operationSafety?: { finalHumanOperationCompilable?: boolean };
  presentation?: {
    labelsPresent?: boolean;
    headingOrderValid?: boolean;
    focusableControlsReachable?: boolean;
    largeTargetsPresent?: boolean;
    progressPresent?: boolean;
  };
  dom?: { mounted: boolean; runAxe: () => Promise<{ violations: AxeViolation[] }> };
  toolMetadata?: { description: string; parameterCount: number; operationCount: number };
}

const result = (
  id: string,
  title: string,
  status: JourneyCheckResult["status"],
  detail: string,
  affectedElementIds?: string[],
): JourneyCheckResult => ({
  id,
  title,
  status,
  detail,
  ...(affectedElementIds ? { affectedElementIds } : {}),
});

/** Deterministic checks are pure over view data unless an explicit mounted-DOM seam is supplied. */
export const runJourneyChecks = async (
  view: TaskViewDefinition,
  context: JourneyCheckContext,
): Promise<JourneyCheckResult[]> => {
  if (!(view.serviceId in serviceBlueprints)) {
    return [
      result(
        "field_ids_known",
        "Field IDs are trusted",
        "fail",
        "The view references an unknown service.",
        [String(view.serviceId)],
      ),
    ];
  }
  const blueprint = getServiceBlueprint(view.serviceId);
  const knownIds = new Set(blueprint.fields.map((field) => field.id));
  const requiredIds = blueprint.fields.filter((field) => field.required).map((field) => field.id);
  const checks: JourneyCheckResult[] = [];
  const missingRequired = requiredIds.filter((id) => !view.fieldOrder.includes(id));
  const hiddenRequired = requiredIds.filter((id) => view.hiddenOptionalFields.includes(id));
  const unknown = view.fieldOrder.filter((id) => !knownIds.has(id));
  const duplicate = view.fieldOrder.filter((id, index) => view.fieldOrder.indexOf(id) !== index);
  const unsafeCopy = view.copyOverrides.filter(
    (copy) =>
      !knownIds.has(copy.fieldId) ||
      (copy.label !== undefined &&
        (typeof copy.label !== "string" ||
          !copy.label.trim() ||
          copy.label !== copy.label.trim() ||
          copy.label.length > 100)) ||
      (copy.helpText !== undefined &&
        (typeof copy.helpText !== "string" ||
          !copy.helpText.trim() ||
          copy.helpText !== copy.helpText.trim() ||
          copy.helpText.length > 240)),
  );
  const validLockTargets = new Set([
    "title",
    ...blueprint.fields.flatMap((field) => [`field:${field.id}`, `copy:${field.id}`]),
  ]);
  const invalidLocks = view.lockedElementIds.filter((lock) => !validLockTargets.has(lock));

  checks.push(
    result(
      "required_fields_present",
      "Required fields are present",
      missingRequired.length ? "fail" : "pass",
      missingRequired.length
        ? "Required fields are missing from the view."
        : "All required fields are present.",
      missingRequired,
    ),
    result(
      "required_fields_visible",
      "Required fields are visible",
      hiddenRequired.length ? "fail" : "pass",
      hiddenRequired.length ? "Required fields are hidden." : "No required field is hidden.",
      hiddenRequired,
    ),
    result(
      "field_ids_known",
      "Field IDs are trusted",
      unknown.length ? "fail" : "pass",
      unknown.length
        ? "The view references unknown fields."
        : "Every field comes from the trusted blueprint.",
      unknown,
    ),
    result(
      "field_ids_unique",
      "Field IDs are unique",
      duplicate.length ? "fail" : "pass",
      duplicate.length ? "The view repeats field IDs." : "Every visible field appears once.",
      duplicate,
    ),
    result(
      "copy_lengths_safe",
      "Copy stays within safe limits",
      unsafeCopy.length ? "fail" : "pass",
      unsafeCopy.length
        ? "Copy is unknown or exceeds its plain-text limit."
        : "All copy is bounded plain text.",
      unsafeCopy.map((copy) => `copy:${copy.fieldId}`),
    ),
    result(
      "confirmation_gate_present",
      "Human confirmation gate is present",
      view.requireHumanConfirmation === true ? "pass" : "fail",
      view.requireHumanConfirmation === true
        ? "Review remains human-controlled."
        : "The human confirmation gate is missing.",
    ),
    result(
      "human_submit_not_compilable",
      "Final submission remains human-only",
      context.operationSafety?.finalHumanOperationCompilable === true ? "fail" : "pass",
      context.operationSafety?.finalHumanOperationCompilable === true
        ? "The final submit operation became compilable."
        : "No compiled workflow can submit.",
    ),
    result(
      "locked_elements_preserved",
      "Human locks refer to trusted elements",
      invalidLocks.length ? "fail" : "pass",
      invalidLocks.length
        ? "One or more lock targets are invalid."
        : "All recorded locks remain valid.",
      invalidLocks,
    ),
    result(
      "labels_present",
      "Labels are present",
      context.presentation?.labelsPresent === false ? "fail" : "pass",
      context.presentation?.labelsPresent === false
        ? "Rendered labels are missing."
        : "Trusted labels are available for every field.",
    ),
    result(
      "heading_order_valid",
      "Heading order is valid",
      context.presentation?.headingOrderValid === false ? "fail" : "pass",
      context.presentation?.headingOrderValid === false
        ? "Mounted headings are out of order."
        : "View heading structure is valid.",
    ),
    result(
      "focusable_controls_reachable",
      "Controls are keyboard reachable",
      context.presentation?.focusableControlsReachable === false ? "fail" : "pass",
      context.presentation?.focusableControlsReachable === false
        ? "A required control is unreachable by keyboard."
        : "Controls have a reachable presentation contract.",
    ),
  );

  if (view.preferences.controlStyle === "large_cards") {
    checks.push(
      result(
        "large_target_size",
        "Large controls are available",
        context.presentation?.largeTargetsPresent === false ? "fail" : "pass",
        context.presentation?.largeTargetsPresent === false
          ? "Large-card targets are missing."
          : "Large-card mode requires large targets.",
      ),
    );
  }
  if (view.preferences.showProgress) {
    checks.push(
      result(
        "progress_indicator_present",
        "Progress indicator is present",
        context.presentation?.progressPresent === false ? "fail" : "pass",
        context.presentation?.progressPresent === false
          ? "Requested progress is not rendered."
          : "Progress is requested and available to the renderer.",
      ),
    );
  }
  if (context.includeDomChecks) {
    if (!context.dom?.mounted) {
      checks.push(
        result(
          "axe_dom_scan",
          "Mounted DOM accessibility scan",
          "warning",
          "No adaptive view is mounted for an axe scan.",
        ),
      );
    } else {
      const scan = await context.dom.runAxe();
      const blocking = scan.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      checks.push(
        result(
          "axe_dom_scan",
          "Mounted DOM accessibility scan",
          blocking.length ? "fail" : "pass",
          blocking.length
            ? "Axe found serious or critical issues."
            : "Axe found no serious or critical issues.",
          blocking.map((violation) => violation.id),
        ),
      );
    }
  }
  if (context.toolMetadata) {
    const metadata = context.toolMetadata;
    const safe =
      metadata.description.trim().length > 0 &&
      metadata.description.length <= 500 &&
      metadata.parameterCount <= 6 &&
      metadata.operationCount <= 8;
    checks.push(
      result(
        "tool_metadata_budget",
        "Tool metadata stays within budget",
        safe ? "pass" : "fail",
        safe
          ? "Attached tool metadata is within its deterministic budget."
          : "Attached tool metadata exceeds its budget.",
      ),
    );
  }
  return checks;
};
