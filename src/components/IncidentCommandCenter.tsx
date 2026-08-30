import { Activity, CheckCircle2, ShieldAlert, Wrench } from "lucide-react";

import type { AppRuntime } from "../app/runtime";
import { useAppStore } from "../store/useAppStore";
import { DeploymentTimeline } from "./DeploymentTimeline";
import { ExecutionReceipt } from "./ExecutionReceipt";
import { PermissionEnvelope } from "./PermissionEnvelope";
import { RecoveryProgress } from "./RecoveryProgress";
import { ServiceTopology } from "./ServiceTopology";
import { TelemetryPanel } from "./TelemetryPanel";
import { ToolSurface } from "./ToolSurface";

export const IncidentCommandCenter = ({
  runtime,
  onMessage,
}: {
  runtime: AppRuntime | null;
  onMessage(message: string): void;
}) => {
  const state = useAppStore();
  const incident = state.incidentState.incident;
  const resolved = incident.status === "resolved";
  const currentChecks = Object.values(state.checks).at(-1) ?? [];
  const activity = state.rightRail.chronological ? [...state.activity].reverse() : state.activity;

  const invoke = async () => {
    if (!runtime) return;
    const result = (await runtime.adapter.executeTool("rollback_checkout_release", {
      canaryPercent: 10,
    })) as { ok?: boolean; message?: string };
    onMessage(result.message ?? (result.ok ? "Incident resolved." : "Recovery failed safely."));
  };

  return (
    <main id="main-content" className="command-main">
      <section
        className={`incident-hero incident-${incident.status}`}
        aria-labelledby="incident-title"
      >
        <div>
          <span className="eyebrow">NORTHSTAR COMMERCE · FICTIONAL ENVIRONMENT</span>
          <h1 id="incident-title">
            {resolved ? "Checkout path restored" : "Checkout is failing in production"}
          </h1>
          <p>
            {resolved
              ? "The previous stable release is serving healthy traffic. The response authority has been consumed."
              : "Release 2026.08.30.3 correlates with a severe error and latency spike across the payment path."}
          </p>
        </div>
        <div className="hero-metrics" aria-label="Incident metrics">
          <div>
            <span className="metric-label">Error rate</span>
            <strong className={`metric-value ${resolved ? "metric-good" : "metric-bad"}`}>
              {incident.errorRate}%
            </strong>
            <small>{resolved ? "within ≤1% gate" : "baseline 0.4%"}</small>
          </div>
          <div>
            <span className="metric-label">p95 latency</span>
            <strong className={`metric-value ${resolved ? "metric-good" : "metric-bad"}`}>
              {incident.p95LatencyMs.toLocaleString()}
              <span> ms</span>
            </strong>
            <small>{resolved ? "within ≤800 ms gate" : "baseline 390 ms"}</small>
          </div>
          <div>
            <span className="metric-label">Incident revision</span>
            <strong className="metric-value mono">r{incident.revision}</strong>
            <small>{incident.status}</small>
          </div>
        </div>
      </section>

      <div className="command-grid">
        <div className="command-primary">
          <ServiceTopology
            services={state.incidentState.services}
            edges={state.incidentState.edges}
            phase={state.recoveryPhase}
            threatBlocked={Boolean(state.assessments["log-third-party-injection"])}
          />
          <div className="lower-grid">
            <TelemetryPanel
              telemetry={state.incidentState.telemetry}
              assessments={state.assessments}
            />
            <div className="lower-stack">
              <DeploymentTimeline deployments={state.incidentState.deployments} />
              <RecoveryProgress phase={state.recoveryPhase} progress={state.progress} />
              {state.receipt ? <ExecutionReceipt receipt={state.receipt} /> : null}
            </div>
          </div>
        </div>

        <aside className="command-rail" aria-label="Airlock controls and audit">
          <PermissionEnvelope policy={state.incidentState.policy} />
          <div className="rail-tabs" role="tablist" aria-label="Incident side panel">
            {(["tools", "checks", "activity"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={state.rightRail.activeTab === tab}
                type="button"
                onClick={() => state.setRightRail(tab)}
              >
                {tab === "tools" ? (
                  <Wrench size={14} />
                ) : tab === "checks" ? (
                  <ShieldAlert size={14} />
                ) : (
                  <Activity size={14} />
                )}{" "}
                {tab}
              </button>
            ))}
          </div>
          <div className="rail-panel">
            {state.rightRail.activeTab === "tools" ? (
              <ToolSurface
                onInvoke={invoke}
                onDisable={() => {
                  runtime?.dynamicTools.disable("rollback_checkout_release");
                  onMessage("rollback_checkout_release disabled.");
                }}
                onDelete={() => {
                  runtime?.dynamicTools.delete("rollback_checkout_release");
                  onMessage("rollback_checkout_release deleted.");
                }}
              />
            ) : null}
            {state.rightRail.activeTab === "checks" ? (
              <section className="rail-section" aria-labelledby="checks-title">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">DETERMINISTIC GATES</span>
                    <h2 id="checks-title">
                      {currentChecks.length
                        ? `${currentChecks.filter((check) => check.status === "pass").length}/${currentChecks.length} pass`
                        : "Awaiting proof"}
                    </h2>
                  </div>
                  <ShieldAlert size={18} />
                </div>
                <ul className="check-list">
                  {currentChecks.map((check) => (
                    <li key={check.id} className={`check-${check.status}`}>
                      <CheckCircle2 size={14} />
                      <span>
                        <strong>{check.label}</strong>
                        <small>{check.detail}</small>
                      </span>
                    </li>
                  ))}
                </ul>
                {!currentChecks.length ? (
                  <p className="rail-empty">
                    Run Prompt A to evaluate scope, trust, mutation, freshness, and recovery gates.
                  </p>
                ) : null}
              </section>
            ) : null}
            {state.rightRail.activeTab === "activity" ? (
              <section className="rail-section" aria-labelledby="activity-title">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">AUDIT LEDGER</span>
                    <h2 id="activity-title">Live decisions</h2>
                  </div>
                  <Activity size={18} />
                </div>
                <ol className="activity-list">
                  {activity.map((entry) => (
                    <li key={entry.id} className={`activity-${entry.status}`}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{entry.title}</strong>
                        <small>
                          {entry.toolName ? (
                            <span className="mono">{entry.toolName}</span>
                          ) : (
                            entry.actor
                          )}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
                {!activity.length ? (
                  <p className="rail-empty">
                    Agent calls, human approval, toolchange, and recovery actions appear here.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </aside>
      </div>
      <p className="fictional-disclaimer">
        Fictional local demonstration. No real infrastructure, credentials, secrets, customer data,
        or network operations are used.
      </p>
    </main>
  );
};
