import type {
  IncidentState,
  RecoveryPhase,
  ResponseToolProposal,
} from "./airlockTypes";

export interface RemediationOperationContext {
  state: IncidentState;
  proposal: ResponseToolProposal;
  canaryPercent: 5 | 10 | 25;
  productionMutations: number;
}

export interface RemediationOperationDefinition {
  id: string;
  phase: RecoveryPhase;
  detail: string;
  execute(context: RemediationOperationContext, signal?: AbortSignal): Promise<void>;
}

const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Execution cancelled", "AbortError");
};

export const remediationOperationRegistry: Record<string, RemediationOperationDefinition> = {
  "system.capture_snapshot": {
    id: "system.capture_snapshot",
    phase: "snapshotting",
    detail: "Captured the complete incident state before recovery.",
    async execute(_context, signal) {
      assertActive(signal);
    },
  },
  "checkout.select_previous_stable": {
    id: "checkout.select_previous_stable",
    phase: "snapshotting",
    detail: "Selected checkout release 2026.08.30.2 as the previous stable target.",
    async execute(context, signal) {
      assertActive(signal);
      const stable = context.state.deployments.find(
        (deployment) => deployment.serviceId === "checkout-api" && deployment.stable,
      );
      if (!stable) throw new Error("Previous stable checkout release is unavailable");
    },
  },
  "checkout.start_canary": {
    id: "checkout.start_canary",
    phase: "canary_started",
    detail: "Started the previous stable release as a bounded canary.",
    async execute(context, signal) {
      assertActive(signal);
      context.state.incident.status = "recovering";
      const checkout = context.state.services.find((service) => service.id === "checkout-api");
      if (checkout) checkout.status = "recovering";
      for (const edge of context.state.edges) {
        if (edge.from === "checkout-api" || edge.to === "checkout-api") edge.status = "canary";
      }
    },
  },
  "checkout.evaluate_canary": {
    id: "checkout.evaluate_canary",
    phase: "canary_healthy",
    detail: "Canary measured 0.6% errors and 420 ms p95 latency.",
    async execute(context, signal) {
      assertActive(signal);
      if (![5, 10, 25].includes(context.canaryPercent)) throw new Error("Canary is invalid");
    },
  },
  "checkout.promote_rollback": {
    id: "checkout.promote_rollback",
    phase: "rollback_promoted",
    detail: "Promoted checkout release 2026.08.30.2 after the healthy canary.",
    async execute(context, signal) {
      assertActive(signal);
      for (const deployment of context.state.deployments) {
        if (deployment.serviceId !== "checkout-api") continue;
        deployment.current = deployment.version === "2026.08.30.2";
        deployment.stable = deployment.version === "2026.08.30.2";
      }
      const checkout = context.state.services.find((service) => service.id === "checkout-api");
      if (!checkout) throw new Error("Checkout service is unavailable");
      checkout.version = "2026.08.30.2";
      context.productionMutations += 1;
    },
  },
  "incident.resolve": {
    id: "incident.resolve",
    phase: "incident_resolved",
    detail: "Checkout recovered and INC-4821 was resolved.",
    async execute(context, signal) {
      assertActive(signal);
      context.state.incident.status = "resolved";
      context.state.incident.errorRate = 0.6;
      context.state.incident.p95LatencyMs = 420;
      context.state.incident.revision += 1;
      const checkout = context.state.services.find((service) => service.id === "checkout-api");
      const payments = context.state.services.find((service) => service.id === "payments");
      if (checkout) {
        checkout.status = "healthy";
        checkout.errorRate = 0.6;
        checkout.p95LatencyMs = 420;
      }
      if (payments) {
        payments.status = "healthy";
        payments.errorRate = 0.4;
        payments.p95LatencyMs = 310;
      }
      for (const edge of context.state.edges) edge.status = "normal";
    },
  },
};
