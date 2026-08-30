import type {
  AirlockCheck,
  EvidenceAssessment,
  IncidentState,
  RemediationSimulation,
} from "./airlockTypes";
import { trustedRemediationOperationIds } from "./incidentSeed";

export interface AirlockCheckContext {
  state: IncidentState;
  simulation: RemediationSimulation;
  assessments: EvidenceAssessment[];
  operationIds: string[];
  now?: Date;
}

const check = (
  id: string,
  label: string,
  pass: boolean,
  passDetail: string,
  failDetail: string,
): AirlockCheck => ({
  id,
  label,
  status: pass ? "pass" : "fail",
  detail: pass ? passDetail : failDetail,
  blocking: true,
});

export const runAirlockChecks = (context: AirlockCheckContext): AirlockCheck[] => {
  const { state, simulation } = context;
  const now = context.now ?? new Date(simulation.createdAt);
  const current = state.deployments.find(
    (deployment) => deployment.serviceId === "checkout-api" && deployment.current,
  );
  const stable = state.deployments.find(
    (deployment) => deployment.serviceId === "checkout-api" && deployment.stable,
  );
  const injectionAssessment = context.assessments.find((assessment) => assessment.injectionRisk);
  const exactSequence =
    context.operationIds.length === trustedRemediationOperationIds.length &&
    trustedRemediationOperationIds.every(
      (operationId, index) => context.operationIds[index] === operationId,
    );

  return [
    check(
      "incident-active",
      "Incident is active",
      state.incident.status === "active",
      "INC-4821 is active and can accept a response.",
      "The incident is no longer active.",
    ),
    check(
      "current-revision",
      "Simulation matches current incident",
      simulation.incidentRevision === state.incident.revision &&
        state.policy.simulationRevision === state.incident.revision,
      `Simulation is bound to revision ${state.incident.revision}.`,
      "The incident changed after simulation; run it again.",
    ),
    check(
      "trusted-release",
      "Previous stable release is verified",
      current?.version === simulation.currentRelease &&
        stable?.version === simulation.targetRelease &&
        stable.stable,
      `${simulation.targetRelease} is the verified previous stable release.`,
      "The selected rollback release is not the current verified stable target.",
    ),
    check(
      "untrusted-evidence",
      "Untrusted instruction is quarantined",
      Boolean(injectionAssessment && !injectionAssessment.trustedForAction),
      "The third-party instruction is excluded from response authority.",
      "The injected evidence has not been identified and quarantined.",
    ),
    check(
      "service-scope",
      "Response is limited to Checkout API",
      simulation.targetServiceId === "checkout-api" && state.policy.serviceIds.length === 1,
      "Only checkout-api may be changed.",
      "The response would cross the operator-approved service boundary.",
    ),
    check(
      "operation-allowlist",
      "Trusted operation sequence is complete",
      exactSequence &&
        context.operationIds.every((operationId) =>
          state.policy.allowedOperationIds.includes(operationId),
        ),
      "All six response steps are trusted and dependency ordered.",
      "The response contains an unknown, missing, or misordered operation.",
    ),
    check(
      "mutation-budget",
      "Production mutation budget is respected",
      simulation.productionMutations <= state.policy.maxProductionMutations,
      "The response performs one approved production mutation.",
      "The response exceeds the one-mutation limit.",
    ),
    check(
      "recovery-thresholds",
      "Canary meets recovery thresholds",
      simulation.predictedErrorRate <= 1 && simulation.predictedP95LatencyMs <= 800,
      `${simulation.predictedErrorRate}% errors and ${simulation.predictedP95LatencyMs} ms p95 are within limits.`,
      "The canary does not meet the required health thresholds.",
    ),
    check(
      "rollback-and-expiry",
      "Rollback and permission window are available",
      simulation.rollbackAvailable && new Date(state.policy.expiresAt).getTime() > now.getTime(),
      "A full snapshot is available and the one-use permission is current.",
      "The rollback path is unavailable or the permission expired.",
    ),
  ];
};
