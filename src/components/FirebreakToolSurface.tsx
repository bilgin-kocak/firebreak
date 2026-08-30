import { Bot, ChevronDown, Radio, ShieldCheck } from "lucide-react";

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
  const dynamic = names.includes("execute_rescue_mission");
  return (
    <details className={`tool-surface ${dynamic ? "tool-surface-authorized" : ""}`}>
      <summary>
        <span className="tool-live-dot" aria-hidden="true" />
        <span>
          <strong>{names.length} tools live</strong>
          <small>{dynamic ? "One-use movement authority granted" : "Planning only · no movement authority"}</small>
        </span>
        <span className="tool-mode">
          <Radio size={13} aria-hidden="true" /> {mode === "native" ? "WebMCP" : "Local WebMCP"}
        </span>
        <ChevronDown className="details-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="tool-surface-body">
        <p className="toolchange-note" aria-live="polite">
          {lastChange ? "Tool surface changed visibly" : "Tool surface ready"}
        </p>
        <ul>
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
  );
}
