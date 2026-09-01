import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Radio,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useFirebreakStore } from "../store/useFirebreakStore";

const friendly: Record<string, string> = {
  inspect_emergency: "Inspect emergency",
  scan_hazards: "Scan hazards",
  inspect_fleet: "Inspect fleet",
  simulate_mission: "Simulate routes",
  validate_safety_envelope: "Validate safety",
  stage_mission_tool: "Stage authority",
  list_mission_tools: "List mission tools",
  execute_rescue_mission: "Execute rescue mission",
};

export function FirebreakToolSurface() {
  const names = useFirebreakStore((state) => state.webmcp.registeredToolNames);
  const mode = useFirebreakStore((state) => state.webmcp.mode);
  const lastChange = useFirebreakStore((state) => state.webmcp.lastToolChangeAt);
  const trace = useFirebreakStore((state) => state.webmcp.trace);
  const [open, setOpen] = useState(false);
  const hasAutoOpened = useRef(false);
  const dynamic = names.includes("execute_rescue_mission");
  const displayedTrace = [...trace].reverse();

  useEffect(() => {
    if (trace.length === 0) {
      hasAutoOpened.current = false;
    } else if (!hasAutoOpened.current) {
      hasAutoOpened.current = true;
      setOpen(true);
    }
  }, [trace.length]);

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {lastChange
          ? `WebMCP tool surface changed. ${names.length} tools are now registered.`
          : `WebMCP tool surface ready with ${names.length} registered tools.`}
      </p>
      <details
        className={`tool-surface ${dynamic ? "tool-surface-authorized" : ""}`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          <span className="tool-live-dot" aria-hidden="true" />
          <span>
            <strong>{names.length} tools live</strong>
            <small>
              {dynamic
                ? "One-use movement authority granted"
                : "Planning only · no movement authority"}
            </small>
          </span>
          <span className="tool-mode">
            <Radio size={13} aria-hidden="true" /> {mode === "native" ? "WebMCP" : "Local WebMCP"}
          </span>
          <ChevronDown className="details-chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="tool-surface-body" tabIndex={0} aria-label="WebMCP tools and trace">
          <p className="toolchange-note">
            {lastChange ? "Tool surface changed visibly" : "Tool surface ready"}
          </p>
          <section className="webmcp-trace" role="region" aria-label="Live WebMCP trace">
            <header>
              <span>
                <Activity size={14} aria-hidden="true" /> Live WebMCP trace
              </span>
              <small>{trace.length ? `${trace.length} events` : "waiting for agent"}</small>
            </header>
            {trace.length ? (
              <ol>
                {displayedTrace.map((entry, index) => {
                  const Icon =
                    entry.kind === "human"
                      ? UserCheck
                      : entry.kind === "toolchange"
                        ? Activity
                        : entry.status === "blocked"
                          ? CircleAlert
                          : entry.status === "succeeded"
                            ? Check
                            : Radio;
                  return (
                    <li
                      key={entry.id}
                      className={`trace-entry trace-${entry.kind} trace-${entry.status}`}
                    >
                      <span className="trace-index">
                        {String(trace.length - index).padStart(2, "0")}
                      </span>
                      <Icon className="trace-icon" size={14} aria-hidden="true" />
                      <span className="trace-main">
                        <span className="trace-title">
                          <code>{entry.name}</code>
                          <strong>{entry.status}</strong>
                        </span>
                        {entry.inputSummary ? (
                          <code className="trace-input">{entry.inputSummary}</code>
                        ) : null}
                        {entry.code || entry.message ? (
                          <span className="trace-result">
                            {entry.code ? <code>{entry.code}</code> : null}
                            {entry.message ? <span>{entry.message}</span> : null}
                          </span>
                        ) : null}
                      </span>
                      {entry.durationMs !== undefined ? (
                        <small className="trace-duration">{Math.round(entry.durationMs)} ms</small>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p>Agent calls, refusals, human approval, and authority changes will appear here.</p>
            )}
          </section>
          <div className="tool-inventory-heading">
            <span>Registered capability surface</span>
            <small>{names.length} active</small>
          </div>
          <ul className="tool-inventory">
            {names.map((name) => (
              <li key={name} className={name === "execute_rescue_mission" ? "dynamic-tool" : ""}>
                {name === "execute_rescue_mission" ? (
                  <Bot size={14} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={14} aria-hidden="true" />
                )}
                <span>{friendly[name] ?? name}</span>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </>
  );
}
