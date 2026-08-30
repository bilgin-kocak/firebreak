import { CheckCircle2, Cpu, RadioTower } from "lucide-react";

import { useAppStore } from "../store/useAppStore";

export const ToolSurface = ({
  onInvoke,
  onDisable,
  onDelete,
}: {
  onInvoke(): Promise<void>;
  onDisable(): void;
  onDelete(): void;
}) => {
  const names = useAppStore((state) => state.webmcp.registeredToolNames);
  const approved = useAppStore((state) => state.approvedResponseTools.rollback_checkout_release);
  const dynamicLive = names.includes("rollback_checkout_release");
  return (
    <section className="rail-section" aria-labelledby="tools-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIVE AGENT SURFACE</span>
          <h2 id="tools-title">{names.length || 7} tools registered</h2>
        </div>
        <RadioTower size={18} />
      </div>
      <ul className="tool-list">
        {names
          .filter((name) => name !== "rollback_checkout_release")
          .map((name) => (
            <li key={name}>
              <Cpu size={13} />
              <span className="mono">{name}</span>
              <small>static</small>
            </li>
          ))}
        {dynamicLive ? (
          <li className="dynamic-tool-row">
            <CheckCircle2 size={14} />
            <span className="mono">rollback_checkout_release</span>
            <small>ONE USE · LIVE</small>
          </li>
        ) : null}
      </ul>
      {dynamicLive ? (
        <div className="prompt-b-card">
          <span className="prompt-label">PROMPT B</span>
          <p>
            Use <span className="mono">rollback_checkout_release</span> with a 10% canary.
          </p>
          <button className="button button-recovery" type="button" onClick={() => void onInvoke()}>
            Invoke approved response
          </button>
          <div className="tool-human-actions">
            <button type="button" onClick={onDisable}>
              Disable
            </button>
            <button type="button" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <p className="rail-empty">
          {approved?.status === "completed"
            ? "One-use tool consumed and unregistered."
            : "A response tool appears here only after human approval."}
        </p>
      )}
    </section>
  );
};
