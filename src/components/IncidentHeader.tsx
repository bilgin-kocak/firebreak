import { Clock3, RotateCcw, ShieldCheck, TerminalSquare } from "lucide-react";

import type { IncidentRecord } from "../domain/airlockTypes";

export const IncidentHeader = ({
  incident,
  mode,
  onOpenSimulator,
  onReset,
}: {
  incident: IncidentRecord;
  mode: "native" | "memory" | "unavailable";
  onOpenSimulator(): void;
  onReset(): void;
}) => (
  <header className="command-header">
    <a className="skip-link" href="#main-content">
      Skip to incident command center
    </a>
    <div className="brand-lockup" aria-label="WebMCP Airlock">
      <span className="airlock-mark" aria-hidden="true">
        <ShieldCheck size={24} />
      </span>
      <span>
        <strong>WEBMCP AIRLOCK</strong>
        <small>Safe autonomy for production incidents</small>
      </span>
    </div>
    <div className="incident-ribbon" aria-label="Current incident">
      <span className={`severity-chip severity-${incident.status}`}>{incident.severity}</span>
      <span className="mono">{incident.id}</span>
      <span className="incident-ribbon-title">{incident.title}</span>
      <span className="clock-chip">
        <Clock3 size={14} aria-hidden="true" /> 00:14:32
      </span>
    </div>
    <div className="header-actions">
      <span className={`mode-chip mode-${mode}`}>
        <span aria-hidden="true" /> {mode === "native" ? "Native WebMCP" : "Browser simulator"}
      </span>
      <button className="button button-secondary" type="button" onClick={onOpenSimulator}>
        <TerminalSquare size={17} aria-hidden="true" /> Simulator
      </button>
      <button className="button button-quiet" type="button" onClick={onReset}>
        <RotateCcw size={17} aria-hidden="true" /> Reset
      </button>
    </div>
  </header>
);
