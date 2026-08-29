import { operationRegistry, validateJsonSchema } from "./operationRegistry";
import { parkingPermitFees } from "./seed";
import { getServiceBlueprint } from "./serviceBlueprints";
import type { Resident, ServiceId } from "./types";

export type ServiceDraftValues = Record<string, unknown>;

export interface DraftReadiness {
  valid: boolean;
  errors: string[];
}

const requiredDraftFieldIds = (serviceId: ServiceId): string[] =>
  getServiceBlueprint(serviceId)
    .fields.filter((field) => field.required && field.kind !== "readonly_summary")
    .map((field) => field.id);

const draftValueForField = (draft: ServiceDraftValues, fieldId: string): unknown =>
  fieldId === "permitDurationMonths" ? draft.durationMonths : draft[fieldId];

/**
 * Uses the service blueprint and the same trusted operation schemas used by
 * workflow execution. This is a readiness check only; it never mutates drafts.
 */
export const validateDraftForReview = (
  serviceId: ServiceId,
  draft: ServiceDraftValues | undefined,
  resident: Resident,
): DraftReadiness => {
  if (!draft) return { valid: false, errors: ["draft is missing"] };
  const errors: string[] = [];
  const required = requiredDraftFieldIds(serviceId);

  if (serviceId === "parking_permit_renewal") {
    if (
      required.some(
        (fieldId) =>
          draftValueForField(draft, fieldId) === undefined ||
          draftValueForField(draft, fieldId) === "",
      )
    ) {
      errors.push("required permit fields are missing");
    }
    if (
      typeof draft.vehicleId !== "string" ||
      !resident.vehicles.some((vehicle) => vehicle.id === draft.vehicleId)
    ) {
      errors.push("vehicle is not registered to the resident");
    }
    const durationSchema = operationRegistry["permit.set_duration"]?.inputSchema;
    if (!durationSchema || !validateJsonSchema(durationSchema, { months: draft.durationMonths })) {
      errors.push("permit duration is invalid");
    }
    const contactSchema = operationRegistry["permit.set_contact"]?.inputSchema;
    if (!contactSchema || !validateJsonSchema(contactSchema, { email: draft.contactEmail })) {
      errors.push("contact email is invalid");
    }
    const duration = draft.durationMonths;
    const expectedFee = duration === 6 || duration === 12 ? parkingPermitFees[duration] : undefined;
    if (draft.fee !== expectedFee) errors.push("matching fee");
  } else {
    if (
      required.some(
        (fieldId) =>
          draftValueForField(draft, fieldId) === undefined ||
          draftValueForField(draft, fieldId) === "",
      )
    ) {
      errors.push("required address fields are missing");
    }
    const addressSchema = operationRegistry["address.set_new"]?.inputSchema;
    if (
      !addressSchema ||
      !validateJsonSchema(addressSchema, {
        street: draft.newStreet,
        city: draft.newCity,
        postalCode: draft.newPostalCode,
      })
    ) {
      errors.push("new address is invalid");
    }
    const dateSchema = operationRegistry["address.set_effective_date"]?.inputSchema;
    if (!dateSchema || !validateJsonSchema(dateSchema, { effectiveDate: draft.effectiveDate })) {
      errors.push("effective date is invalid");
    }
  }
  return { valid: errors.length === 0, errors };
};
