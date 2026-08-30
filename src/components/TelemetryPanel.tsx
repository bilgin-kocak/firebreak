import { Ban, CheckCircle2, Radio, TriangleAlert } from "lucide-react";

import type { EvidenceAssessment, TelemetryEntry } from "../domain/airlockTypes";

export const TelemetryPanel = ({
  telemetry,
  assessments,
}: {
  telemetry: TelemetryEntry[];
  assessments: Record<string, EvidenceAssessment>;
}) => (
  <section className="panel evidence-panel" aria-labelledby="evidence-title">
    <div className="panel-heading">
      <div>
        <span className="eyebrow">EVIDENCE STREAM</span>
        <h2 id="evidence-title">Signals &amp; trust</h2>
      </div>
      <Radio size={18} className="signal-icon" aria-hidden="true" />
    </div>
    <div className="evidence-list">
      {telemetry.map((entry) => {
        const assessment = assessments[entry.id];
        const blocked = entry.quarantined || assessment?.injectionRisk;
        return (
          <article className={`evidence-item ${blocked ? "evidence-blocked" : ""}`} key={entry.id}>
            <div className="evidence-meta">
              <span className="mono">{entry.channel.toUpperCase()}</span>
              <span className={`trust-chip trust-${entry.trust}`}>
                {blocked ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                {blocked ? "QUARANTINED" : entry.trust.toUpperCase()}
              </span>
            </div>
            <h3>{entry.title}</h3>
            <p className="evidence-content mono">{entry.content}</p>
            {blocked ? (
              <p className="threat-note">
                <TriangleAlert size={14} aria-hidden="true" /> Instruction rendered as inert text
                and excluded from authority.
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  </section>
);
