import { HelpCircle, RotateCcw, Sparkles } from "lucide-react";

interface HeaderProps {
  mode: "native" | "memory" | "unavailable";
  onReset(): void;
  onOpenSimulator(): void;
}

export const Header = ({ mode, onReset, onOpenSimulator }: HeaderProps) => (
  <header className="site-header">
    <div className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">
        <Sparkles size={19} strokeWidth={2.2} />
      </span>
      <span>
        <strong>CivicWeave</strong>
        <small>Northstar City Services — fictional demonstration.</small>
      </span>
    </div>
    <div className="header-actions">
      <span className={`status-badge status-${mode}`}>
        <span aria-hidden="true" className="status-dot" />
        {mode === "native" ? "Native WebMCP" : mode === "memory" ? "Simulator" : "Unavailable"}
      </span>
      <button className="button button-quiet" type="button" onClick={onOpenSimulator}>
        <HelpCircle size={17} /> How to test
      </button>
      <button className="button button-quiet" type="button" onClick={onReset}>
        <RotateCcw size={17} /> Reset demo
      </button>
    </div>
  </header>
);
