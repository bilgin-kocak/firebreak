import { Check, Circle, LoaderCircle } from "lucide-react";

import type { RecoveryPhase, RecoveryProgressEntry } from "../domain/airlockTypes";

const phases: Array<{ id: RecoveryPhase; label: string }> = [
  { id: "snapshotting", label: "Snapshot" },
  { id: "canary_started", label: "10% canary" },
  { id: "canary_healthy", label: "Health gate" },
  { id: "rollback_promoted", label: "Promote" },
  { id: "incident_resolved", label: "Resolved" },
];

export const RecoveryProgress = ({
  phase,
  progress,
}: {
  phase: RecoveryPhase;
  progress: RecoveryProgressEntry[];
}) => {
  const activeIndex = phases.findIndex((item) => item.id === phase);
  return (
    <section className="panel recovery-panel" aria-labelledby="recovery-title" aria-live="polite">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AUTONOMOUS RUN</span>
          <h2 id="recovery-title">Recovery sequence</h2>
        </div>
        <span className={`phase-chip phase-chip-${phase}`}>{phase.replaceAll("_", " ")}</span>
      </div>
      <ol className="recovery-steps">
        {phases.map((item, index) => {
          const done = activeIndex > index || phase === "incident_resolved";
          const active = activeIndex === index && phase !== "incident_resolved";
          return (
            <li className={done ? "is-done" : active ? "is-active" : ""} key={item.id}>
              <span aria-hidden="true">
                {done ? (
                  <Check size={14} />
                ) : active ? (
                  <LoaderCircle size={14} />
                ) : (
                  <Circle size={12} />
                )}
              </span>
              {item.label}
            </li>
          );
        })}
      </ol>
      <p className="latest-progress">
        {progress.at(-1)?.detail ?? "Waiting for an approved one-use response tool."}
      </p>
    </section>
  );
};
