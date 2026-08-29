import { parkingPermitFees } from "./seed";
import type { OperationSideEffect, Resident, ServiceId } from "./types";

export type JsonSchema = {
  type: "string" | "integer" | "number" | "boolean" | "object";
  enum?: readonly (string | number | boolean)[];
  format?: "email" | "date";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

export type ServiceDraft = Record<string, unknown>;

export interface WorkflowProgressEntry {
  operationId: string;
  status: "completed" | "failed";
}

export interface WorkflowExecutionContext {
  resident: Resident;
  serviceDrafts: Partial<Record<ServiceId, ServiceDraft>>;
  progress: WorkflowProgressEntry[];
  onProgress?: (entry: WorkflowProgressEntry) => void;
  portalState?: Partial<Record<ServiceId, "idle" | "staged_for_review" | "submitted">>;
}

export interface OperationResult {
  detail?: string;
}

export interface OperationDefinition {
  id: string;
  title: string;
  description: string;
  serviceId: ServiceId;
  sideEffect: OperationSideEffect;
  compilable: boolean;
  inputSchema: JsonSchema;
  dependencies: string[];
  execute: (
    context: WorkflowExecutionContext,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<OperationResult>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const isCalendarDate = (value: string): boolean => {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const validateJsonSchema = (schema: JsonSchema, value: unknown): boolean => {
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.format === "email" && !emailPattern.test(value)) return false;
    if (schema.format === "date" && !isCalendarDate(value)) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) return false;
  }
  if (schema.type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) {
    return false;
  }
  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    return false;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") return false;
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) return false;
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      if (Object.keys(record).some((key) => !allowed.has(key))) return false;
    }
    for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
      if (key in record && !validateJsonSchema(propertySchema, record[key])) return false;
    }
  }
  return schema.enum === undefined || schema.enum.includes(value as string | number | boolean);
};

const assertNotAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new Error("Execution cancelled");
};

const parkingDraft = (context: WorkflowExecutionContext): ServiceDraft =>
  (context.serviceDrafts.parking_permit_renewal ??= {});

const addressDraft = (context: WorkflowExecutionContext): ServiceDraft =>
  (context.serviceDrafts.address_change ??= {});

const operation = (
  definition: Omit<OperationDefinition, "execute"> & Pick<OperationDefinition, "execute">,
): OperationDefinition => definition;

const noInput: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export const operationRegistry: Record<string, OperationDefinition> = {
  "permit.load_current": operation({
    id: "permit.load_current",
    title: "Load current permit",
    description: "Loads the resident's current permit, vehicle, and contact details.",
    serviceId: "parking_permit_renewal",
    sideEffect: "read",
    compilable: true,
    inputSchema: noInput,
    dependencies: [],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      return { detail: `Loaded ${context.resident.activeParkingPermit.id}` };
    },
  }),
  "permit.set_vehicle": operation({
    id: "permit.set_vehicle",
    title: "Set permit vehicle",
    description: "Selects a resident vehicle for the renewal draft.",
    serviceId: "parking_permit_renewal",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: { vehicleId: { type: "string", minLength: 1 } },
      required: ["vehicleId"],
      additionalProperties: false,
    },
    dependencies: ["permit.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      const vehicleId = args.vehicleId;
      if (
        typeof vehicleId !== "string" ||
        !context.resident.vehicles.some((vehicle) => vehicle.id === vehicleId)
      ) {
        throw new Error("Vehicle is not registered to this resident");
      }
      parkingDraft(context).vehicleId = vehicleId;
      return {};
    },
  }),
  "permit.set_duration": operation({
    id: "permit.set_duration",
    title: "Set permit duration",
    description: "Sets a six- or twelve-month permit duration.",
    serviceId: "parking_permit_renewal",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: { months: { type: "integer", enum: [6, 12] } },
      required: ["months"],
      additionalProperties: false,
    },
    dependencies: ["permit.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      if (!validateJsonSchema({ type: "integer", enum: [6, 12] }, args.months)) {
        throw new Error("Permit duration must be 6 or 12 months");
      }
      parkingDraft(context).durationMonths = args.months;
      return {};
    },
  }),
  "permit.set_contact": operation({
    id: "permit.set_contact",
    title: "Set contact email",
    description: "Sets the email used for permit renewal notices.",
    serviceId: "parking_permit_renewal",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: { email: { type: "string", format: "email", maxLength: 254 } },
      required: ["email"],
      additionalProperties: false,
    },
    dependencies: ["permit.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      if (!validateJsonSchema({ type: "string", format: "email", maxLength: 254 }, args.email)) {
        throw new Error("A valid contact email is required");
      }
      parkingDraft(context).contactEmail = args.email;
      return {};
    },
  }),
  "permit.calculate_fee": operation({
    id: "permit.calculate_fee",
    title: "Calculate permit fee",
    description: "Calculates the trusted fictional permit fee.",
    serviceId: "parking_permit_renewal",
    sideEffect: "read",
    compilable: true,
    inputSchema: noInput,
    dependencies: ["permit.set_duration"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      const months = parkingDraft(context).durationMonths;
      if (months !== 6 && months !== 12) throw new Error("Permit duration must be set first");
      parkingDraft(context).fee = parkingPermitFees[months];
      return {};
    },
  }),
  "permit.save_draft": operation({
    id: "permit.save_draft",
    title: "Save permit draft",
    description: "Persists the permit draft in the in-browser state only.",
    serviceId: "parking_permit_renewal",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: noInput,
    dependencies: [
      "permit.set_vehicle",
      "permit.set_duration",
      "permit.set_contact",
      "permit.calculate_fee",
    ],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      parkingDraft(context).saved = true;
      return {};
    },
  }),
  "permit.stage_review": operation({
    id: "permit.stage_review",
    title: "Stage permit review",
    description: "Stages the saved permit draft for human review.",
    serviceId: "parking_permit_renewal",
    sideEffect: "stage",
    compilable: true,
    inputSchema: noInput,
    dependencies: [
      "permit.set_vehicle",
      "permit.set_duration",
      "permit.set_contact",
      "permit.calculate_fee",
      "permit.save_draft",
    ],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      const draft = parkingDraft(context);
      if (
        !draft.vehicleId ||
        !draft.durationMonths ||
        !draft.contactEmail ||
        !draft.fee ||
        !draft.saved
      ) {
        throw new Error("Permit draft is incomplete");
      }
      draft.status = "staged_for_review";
      context.portalState ??= {};
      context.portalState.parking_permit_renewal = "staged_for_review";
      return {};
    },
  }),
  "permit.submit": operation({
    id: "permit.submit",
    title: "Submit permit renewal",
    description: "Human-only final permit submission.",
    serviceId: "parking_permit_renewal",
    sideEffect: "human_only",
    compilable: false,
    inputSchema: noInput,
    dependencies: ["permit.stage_review"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      parkingDraft(context).status = "submitted";
      context.portalState ??= {};
      context.portalState.parking_permit_renewal = "submitted";
      return { detail: "NST-PP-2026-08421" };
    },
  }),
  "address.load_current": operation({
    id: "address.load_current",
    title: "Load current address",
    description: "Loads the resident's current address into the workflow context.",
    serviceId: "address_change",
    sideEffect: "read",
    compilable: true,
    inputSchema: noInput,
    dependencies: [],
    async execute(_context, _args, signal) {
      assertNotAborted(signal);
      return {};
    },
  }),
  "address.set_new": operation({
    id: "address.set_new",
    title: "Set new address",
    description: "Sets the new street, city, and postal code on the draft.",
    serviceId: "address_change",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: {
        street: { type: "string", minLength: 3, maxLength: 120 },
        city: { type: "string", minLength: 2, maxLength: 80 },
        postalCode: { type: "string", minLength: 3, maxLength: 16 },
      },
      required: ["street", "city", "postalCode"],
      additionalProperties: false,
    },
    dependencies: ["address.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      const schema = operationRegistry["address.set_new"]?.inputSchema;
      if (!schema || !validateJsonSchema(schema, args)) throw new Error("New address is invalid");
      Object.assign(addressDraft(context), {
        newStreet: args.street,
        newCity: args.city,
        newPostalCode: args.postalCode,
      });
      return {};
    },
  }),
  "address.set_effective_date": operation({
    id: "address.set_effective_date",
    title: "Set effective date",
    description: "Sets the date the address change takes effect.",
    serviceId: "address_change",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: { effectiveDate: { type: "string", format: "date" } },
      required: ["effectiveDate"],
      additionalProperties: false,
    },
    dependencies: ["address.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      if (!validateJsonSchema({ type: "string", format: "date" }, args.effectiveDate)) {
        throw new Error("Effective date is invalid");
      }
      addressDraft(context).effectiveDate = args.effectiveDate;
      return {};
    },
  }),
  "address.set_voter_preference": operation({
    id: "address.set_voter_preference",
    title: "Set voter-record preference",
    description: "Records the optional fictional voter-record update preference.",
    serviceId: "address_change",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: {
      type: "object",
      properties: { updateVoterRecord: { type: "boolean" } },
      required: ["updateVoterRecord"],
      additionalProperties: false,
    },
    dependencies: ["address.load_current"],
    async execute(context, args, signal) {
      assertNotAborted(signal);
      if (typeof args.updateVoterRecord !== "boolean")
        throw new Error("Voter preference is invalid");
      addressDraft(context).updateVoterRecord = args.updateVoterRecord;
      return {};
    },
  }),
  "address.validate": operation({
    id: "address.validate",
    title: "Validate address draft",
    description: "Validates the required address values before the draft is saved.",
    serviceId: "address_change",
    sideEffect: "read",
    compilable: true,
    inputSchema: noInput,
    dependencies: ["address.set_new", "address.set_effective_date"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      const draft = addressDraft(context);
      if (!draft.newStreet || !draft.newCity || !draft.newPostalCode || !draft.effectiveDate) {
        throw new Error("Address draft is incomplete");
      }
      return {};
    },
  }),
  "address.save_draft": operation({
    id: "address.save_draft",
    title: "Save address draft",
    description: "Persists the address draft in the in-browser state only.",
    serviceId: "address_change",
    sideEffect: "draft_write",
    compilable: true,
    inputSchema: noInput,
    dependencies: ["address.validate"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      addressDraft(context).saved = true;
      return {};
    },
  }),
  "address.stage_review": operation({
    id: "address.stage_review",
    title: "Stage address review",
    description: "Stages the saved address draft for human review.",
    serviceId: "address_change",
    sideEffect: "stage",
    compilable: true,
    inputSchema: noInput,
    dependencies: ["address.validate", "address.save_draft"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      const draft = addressDraft(context);
      if (!draft.saved) throw new Error("Address draft must be saved first");
      draft.status = "staged_for_review";
      context.portalState ??= {};
      context.portalState.address_change = "staged_for_review";
      return {};
    },
  }),
  "address.submit": operation({
    id: "address.submit",
    title: "Submit address change",
    description: "Human-only final address-change submission.",
    serviceId: "address_change",
    sideEffect: "human_only",
    compilable: false,
    inputSchema: noInput,
    dependencies: ["address.stage_review"],
    async execute(context, _args, signal) {
      assertNotAborted(signal);
      addressDraft(context).status = "submitted";
      context.portalState ??= {};
      context.portalState.address_change = "submitted";
      return { detail: "NST-AC-2026-03116" };
    },
  }),
};

/** Trusted source schemas make portal-state bindings as narrow as tool-input bindings. */
export const portalStateAllowlist: Record<ServiceId, Record<string, JsonSchema>> = {
  parking_permit_renewal: {
    currentVehicleId: { type: "string", minLength: 1 },
    contactEmail: { type: "string", format: "email", maxLength: 254 },
  },
  address_change: {
    currentStreet: { type: "string", minLength: 3, maxLength: 120 },
    currentCity: { type: "string", minLength: 2, maxLength: 80 },
    currentPostalCode: { type: "string", minLength: 3, maxLength: 16 },
  },
};

export const resolvePortalStateValue = (
  context: WorkflowExecutionContext,
  serviceId: ServiceId,
  key: string,
): unknown => {
  if (!(key in portalStateAllowlist[serviceId])) return undefined;
  if (serviceId === "parking_permit_renewal") {
    if (key === "currentVehicleId") return context.resident.activeParkingPermit.vehicleId;
    if (key === "contactEmail") return context.resident.email;
  }
  if (serviceId === "address_change") {
    if (key === "currentStreet") return context.resident.address.street;
    if (key === "currentCity") return context.resident.address.city;
    if (key === "currentPostalCode") return context.resident.address.postalCode;
  }
  return undefined;
};
