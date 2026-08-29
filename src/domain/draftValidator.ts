import { operationRegistry, validateJsonSchema } from "./operationRegistry";
import { parkingPermitFees } from "./seed";
import { getServiceBlueprint } from "./serviceBlueprints";
import type { Resident, ServiceId } from "./types";

export type ServiceDraftValues = Record<string, unknown>;

export interface DraftReadiness {
  valid: boolean;
  errors: string[];
  fieldErrors?: Record<string, string>;
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
  if (!draft) return { valid: false, errors: ["draft is missing"], fieldErrors: {} };
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};
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
      fieldErrors.vehicleId = "Choose a vehicle registered to this resident account.";
    }
    const durationSchema = operationRegistry["permit.set_duration"]?.inputSchema;
    if (!durationSchema || !validateJsonSchema(durationSchema, { months: draft.durationMonths })) {
      errors.push("permit duration is invalid");
      fieldErrors.permitDurationMonths = "Choose a 6- or 12-month permit.";
    }
    const contactSchema = operationRegistry["permit.set_contact"]?.inputSchema;
    if (!contactSchema || !validateJsonSchema(contactSchema, { email: draft.contactEmail })) {
      errors.push("contact email is invalid");
      fieldErrors.contactEmail = "Enter a valid contact email address.";
    }
    const duration = draft.durationMonths;
    const expectedFee = duration === 6 || duration === 12 ? parkingPermitFees[duration] : undefined;
    if (draft.fee !== expectedFee) {
      errors.push("matching fee");
      fieldErrors.permitDurationMonths ??=
        "Choose the permit duration again so the fee can be calculated.";
    }
  } else {
    const street = typeof draft.newStreet === "string" ? draft.newStreet.trim() : "";
    const city = typeof draft.newCity === "string" ? draft.newCity.trim() : "";
    const postalCode = typeof draft.newPostalCode === "string" ? draft.newPostalCode.trim() : "";
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
        street,
        city,
        postalCode,
      })
    ) {
      errors.push("new address is invalid");
    }
    if (street.length < 3 || street.length > 120)
      fieldErrors.newStreet = "Enter a street address with at least 3 characters.";
    if (city.length < 2 || city.length > 80)
      fieldErrors.newCity = "Enter a city with at least 2 characters.";
    if (postalCode.length < 3 || postalCode.length > 16)
      fieldErrors.newPostalCode = "Enter a postal code with at least 3 characters.";
    const dateSchema = operationRegistry["address.set_effective_date"]?.inputSchema;
    if (!dateSchema || !validateJsonSchema(dateSchema, { effectiveDate: draft.effectiveDate })) {
      errors.push("effective date is invalid");
      fieldErrors.effectiveDate = "Choose the date this address change starts.";
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
  };
};
