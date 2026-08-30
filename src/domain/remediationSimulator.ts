import type { IncidentState, RemediationSimulation } from "./airlockTypes";
import { AirlockError } from "./airlockTypes";

export interface RemediationSimulationInput {
  serviceId: "checkout-api";
  canaryPercent: 5 | 10 | 25;
}

const predictions = {
  5: { errorRate: 0.8, latencyMs: 520 },
  10: { errorRate: 0.6, latencyMs: 420 },
  25: { errorRate: 0.7, latencyMs: 460 },
} as const;

export const simulateRemediation = (
  state: IncidentState,
  input: RemediationSimulationInput,
  now = new Date("2026-08-30T09:01:00.000Z"),
): RemediationSimulation => {
  if (![5, 10, 25].includes(input.canaryPercent)) {
    throw new AirlockError("INVALID_CANARY_PERCENT", "Canary percentage must be 5, 10, or 25.");
  }
  if (state.incident.status === "resolved") {
    throw new AirlockError("INCIDENT_ALREADY_RESOLVED", "INC-4821 is already resolved.");
  }
  const current = state.deployments.find(
    (deployment) => deployment.serviceId === input.serviceId && deployment.current,
  );
  const stable = state.deployments.find(
    (deployment) => deployment.serviceId === input.serviceId && deployment.stable,
  );
  if (!current || !stable) {
    throw new AirlockError(
      "DEPLOYMENT_NOT_FOUND",
      "A current and previous stable checkout release are required.",
    );
  }
  const prediction = predictions[input.canaryPercent];
  const planHash = [
    "airlock",
    state.incident.id,
    state.incident.revision,
    input.serviceId,
    current.version,
    stable.version,
    input.canaryPercent,
  ].join("-");
  return {
    id: `simulation-${state.incident.revision}-${input.canaryPercent}`,
    incidentId: "INC-4821",
    incidentRevision: state.incident.revision,
    targetServiceId: "checkout-api",
    currentRelease: current.version,
    targetRelease: stable.version,
    canaryPercent: input.canaryPercent,
    predictedErrorRate: prediction.errorRate,
    predictedP95LatencyMs: prediction.latencyMs,
    rollbackAvailable: true,
    productionMutations: 1,
    planHash,
    createdAt: now.toISOString(),
  };
};
