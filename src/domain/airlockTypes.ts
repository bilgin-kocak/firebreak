export type ServiceId =
  | "storefront"
  | "checkout-api"
  | "payments"
  | "orders"
  | "inventory";

export type ServiceStatus = "healthy" | "degraded" | "critical" | "recovering";
export type IncidentStatus = "active" | "recovering" | "resolved";
export type EvidenceProvenance = "platform" | "dependency" | "third_party";
export type EvidenceTrust = "trusted" | "untrusted";

export interface ServiceNode {
  id: ServiceId;
  name: string;
  kind: "edge" | "service" | "dependency" | "data";
  status: ServiceStatus;
  version: string;
  errorRate: number;
  p95LatencyMs: number;
}

export interface DependencyEdge {
  from: ServiceId;
  to: ServiceId;
  status: "normal" | "saturated" | "blocked" | "canary";
  requestsPerMinute: number;
}

export interface TelemetryEntry {
  id: string;
  timestamp: string;
  serviceId: ServiceId;
  channel: "metric" | "trace" | "log" | "deployment";
  provenance: EvidenceProvenance;
  trust: EvidenceTrust;
  title: string;
  content: string;
  quarantined: boolean;
  injectionFixture: boolean;
}

export interface DeploymentRecord {
  id: string;
  serviceId: ServiceId;
  version: string;
  deployedAt: string;
  current: boolean;
  stable: boolean;
  commit: string;
}

export interface IncidentRecord {
  id: "INC-4821";
  title: string;
  severity: "SEV-1";
  status: IncidentStatus;
  startedAt: string;
  resolvedAt?: string;
  revision: number;
  errorRate: number;
  p95LatencyMs: number;
  affectedServiceIds: ServiceId[];
}

export type ForbiddenCapability =
  | "customer_data_export"
  | "record_deletion"
  | "secret_access"
  | "unrelated_service_change";

export interface IncidentPolicy {
  incidentId: "INC-4821";
  serviceIds: ["checkout-api"];
  allowedOperationIds: string[];
  forbiddenCapabilities: ForbiddenCapability[];
  maxProductionMutations: 1;
  simulationRevision: number;
  expiresAt: string;
  oneUse: true;
  used: boolean;
}

export interface IncidentState {
  incident: IncidentRecord;
  services: ServiceNode[];
  edges: DependencyEdge[];
  telemetry: TelemetryEntry[];
  deployments: DeploymentRecord[];
  policy: IncidentPolicy;
}

export interface EvidenceAssessment {
  evidenceId: string;
  trustedForAction: boolean;
  injectionRisk: boolean;
  reason: string;
}

export interface RemediationSimulation {
  id: string;
  incidentId: "INC-4821";
  incidentRevision: number;
  targetServiceId: "checkout-api";
  currentRelease: string;
  targetRelease: string;
  canaryPercent: 5 | 10 | 25;
  predictedErrorRate: number;
  predictedP95LatencyMs: number;
  rollbackAvailable: boolean;
  productionMutations: 1;
  planHash: string;
  createdAt: string;
}

export type AirlockCheckStatus = "pass" | "fail" | "warning";

export interface AirlockCheck {
  id: string;
  label: string;
  status: AirlockCheckStatus;
  detail: string;
  blocking: boolean;
}

export interface ResponseOperationStep {
  operationId: string;
}

export type ResponseToolStatus =
  | "awaiting_approval"
  | "registered"
  | "rejected"
  | "disabled"
  | "expired"
  | "completed";

export interface ResponseToolProposal {
  id: string;
  incidentId: "INC-4821";
  name: "rollback_checkout_release";
  title: string;
  description: string;
  simulationId: string;
  incidentRevision: number;
  policy: IncidentPolicy;
  operations: ResponseOperationStep[];
  status: ResponseToolStatus;
  createdAt: string;
}

export interface ApprovedResponseTool extends ResponseToolProposal {
  status: "registered" | "disabled" | "expired" | "completed";
  approvedAt: string;
  registrationRevision: number;
  enabled: boolean;
}

export type RecoveryPhase =
  | "idle"
  | "snapshotting"
  | "canary_started"
  | "canary_healthy"
  | "rollback_promoted"
  | "incident_resolved"
  | "failed"
  | "cancelled";

export interface RecoveryProgressEntry {
  operationId: string;
  phase: RecoveryPhase;
  detail: string;
  timestamp: string;
}

export interface ExecutionReceipt {
  id: string;
  incidentId: "INC-4821";
  toolName: "rollback_checkout_release";
  status: "incident_resolved" | "failed" | "cancelled";
  canaryPercent: 5 | 10 | 25;
  fromRelease: string;
  toRelease: string;
  finalErrorRate: number;
  finalP95LatencyMs: number;
  productionMutations: number;
  blockedEvidenceIds: string[];
  operationIds: string[];
  startedAt: string;
  completedAt: string;
}

export type AirlockActivityActor = "agent" | "human" | "system" | "airlock";
export type AirlockActivityKind =
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "threat_detected"
  | "evidence_quarantined"
  | "simulation_completed"
  | "checks_completed"
  | "response_staged"
  | "response_approved"
  | "response_rejected"
  | "tool_registered"
  | "tool_unregistered"
  | "toolchange"
  | "recovery_progress"
  | "incident_resolved"
  | "persistence_recovery"
  | "reset";

export interface AirlockActivityEntry {
  id: string;
  timestamp: string;
  actor: AirlockActivityActor;
  kind: AirlockActivityKind;
  title: string;
  detail?: string;
  toolName?: string;
  durationMs?: number;
  status: "info" | "success" | "warning" | "error";
}

export type AirlockErrorCode =
  | "INVALID_TOOL_INPUT"
  | "INCIDENT_NOT_FOUND"
  | "INCIDENT_ALREADY_RESOLVED"
  | "EVIDENCE_NOT_FOUND"
  | "UNTRUSTED_EVIDENCE"
  | "DEPLOYMENT_NOT_FOUND"
  | "INVALID_CANARY_PERCENT"
  | "SIMULATION_NOT_FOUND"
  | "SIMULATION_STALE"
  | "CHECKS_FAILED"
  | "OPERATION_NOT_ALLOWLISTED"
  | "CROSS_SERVICE_OPERATION"
  | "MUTATION_BUDGET_EXCEEDED"
  | "POLICY_EXPIRED"
  | "DEPENDENCY_ORDER_INVALID"
  | "HUMAN_APPROVAL_REQUIRED"
  | "RESPONSE_NOT_APPROVED"
  | "RESPONSE_ALREADY_USED"
  | "EXECUTION_CANCELLED"
  | "OPERATION_FAILED"
  | "PERSISTENCE_RECOVERY";

export class AirlockError extends Error {
  public constructor(
    public readonly code: AirlockErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AirlockError";
  }
}
