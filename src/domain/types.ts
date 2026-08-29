export type ServiceId = "parking_permit_renewal" | "address_change";

export type ViewPreference = {
  textSize: "normal" | "large" | "xlarge";
  languageStyle: "plain" | "standard";
  navigationStyle: "one_field_per_step" | "grouped";
  controlStyle: "large_cards" | "standard" | "compact";
  showProgress: boolean;
  preserveBranding: boolean;
};

export type FieldKind =
  "text" | "email" | "date" | "select" | "radio" | "readonly_summary" | "boolean";

export interface FieldDefinition {
  id: string;
  serviceId: ServiceId;
  label: string;
  plainLabel: string;
  description: string;
  plainDescription: string;
  kind: FieldKind;
  required: boolean;
  options?: Array<{ label: string; value: string | number }>;
  source: "user_input" | "portal_state" | "derived";
  defaultValuePath?: string;
  validation: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

export interface CopyOverride {
  fieldId: string;
  label?: string;
  helpText?: string;
}

export interface TaskViewDefinition {
  id: string;
  serviceId: ServiceId;
  title: string;
  goal: string;
  preferences: ViewPreference;
  fieldOrder: string[];
  hiddenOptionalFields: string[];
  copyOverrides: CopyOverride[];
  lockedElementIds: string[];
  requireHumanConfirmation: true;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type ViewPatch =
  | { type: "set_preference"; key: keyof ViewPreference; value: string | boolean }
  | { type: "move_field"; fieldId: string; beforeFieldId?: string; afterFieldId?: string }
  | { type: "set_copy"; fieldId: string; label?: string; helpText?: string }
  | { type: "set_visibility"; fieldId: string; visible: boolean }
  | { type: "set_title"; title: string };

export type OperationSideEffect = "read" | "draft_write" | "stage" | "human_only";

export interface OperationBinding {
  argument: string;
  source: "tool_input" | "portal_state" | "literal";
  key?: string;
  value?: unknown;
}

export interface WorkflowOperationStep {
  operationId: string;
  bindings: OperationBinding[];
}

export interface WorkflowParameter {
  name: string;
  fieldId: string;
  description: string;
  required: boolean;
}

export type WorkflowProposalStatus =
  "draft" | "validated" | "awaiting_approval" | "registered" | "rejected" | "disabled";

export interface WorkflowToolProposal {
  id: string;
  viewId: string;
  serviceId: ServiceId;
  name: string;
  title: string;
  description: string;
  parameters: WorkflowParameter[];
  operations: WorkflowOperationStep[];
  stopAt: "review";
  status: WorkflowProposalStatus;
  validationErrors: string[];
  createdAt: string;
}

export interface ApprovedWorkflowTool extends WorkflowToolProposal {
  status: "registered" | "disabled";
  approvedAt: string;
  enabled: boolean;
  registrationRevision: number;
}

export type ActivityActor = "agent" | "human" | "system";
export type ActivityKind =
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "view_compiled"
  | "view_patched"
  | "element_locked"
  | "element_unlocked"
  | "checks_completed"
  | "workflow_staged"
  | "workflow_approved"
  | "workflow_rejected"
  | "tool_registered"
  | "tool_unregistered"
  | "toolchange"
  | "draft_staged"
  | "submission_confirmed"
  | "reset";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actor: ActivityActor;
  kind: ActivityKind;
  title: string;
  detail?: string;
  toolName?: string;
  durationMs?: number;
  status: "info" | "success" | "warning" | "error";
}

export interface ServiceBlueprint {
  id: ServiceId;
  title: string;
  shortDescription: string;
  fields: FieldDefinition[];
  baselineJourney: Array<{
    id: string;
    label: string;
    interactionCost: number;
  }>;
  allowedOperationIds: string[];
  finalHumanOperationId: string;
}

export interface Address {
  street: string;
  city: string;
  postalCode: string;
}

export interface Vehicle {
  id: string;
  label: string;
  plate: string;
}

export interface ParkingPermit {
  id: string;
  vehicleId: string;
  expiresOn: string;
  zone: string;
}

export interface Resident {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: Address;
  vehicles: Vehicle[];
  activeParkingPermit: ParkingPermit;
}

export interface Clock {
  now: () => Date;
}

export type IdFactory = () => string;

export type ErrorCode =
  | "UNSUPPORTED_BROWSER"
  | "TOOL_ALREADY_REGISTERED"
  | "TOOL_NOT_FOUND"
  | "INVALID_TOOL_INPUT"
  | "UNKNOWN_SERVICE"
  | "UNKNOWN_FIELD"
  | "REQUIRED_FIELD_HIDDEN"
  | "LOCKED_BY_USER"
  | "VIEW_NOT_FOUND"
  | "VIEW_VALIDATION_FAILED"
  | "CHECKS_FAILED"
  | "INVALID_WORKFLOW_NAME"
  | "TOOL_NAME_COLLISION"
  | "INVALID_PARAMETER"
  | "UNKNOWN_OPERATION"
  | "CROSS_SERVICE_OPERATION"
  | "HUMAN_ONLY_OPERATION"
  | "DEPENDENCY_ORDER_INVALID"
  | "INVALID_BINDING"
  | "REVIEW_STEP_REQUIRED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "WORKFLOW_NOT_APPROVED"
  | "EXECUTION_CANCELLED"
  | "OPERATION_FAILED"
  | "DRAFT_VALIDATION_FAILED"
  | "PERSISTENCE_RECOVERY";

export class DomainError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
