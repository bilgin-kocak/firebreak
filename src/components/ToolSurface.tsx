import { Ban, Braces, Check, Trash2 } from "lucide-react";

import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { useAppStore } from "../store/useAppStore";
import { DemoPromptCard } from "./DemoPromptCard";
import { PROMPT_B } from "./ServiceDashboard";

interface ToolSurfaceProps {
  onDisable(name: string): void;
  onDelete(name: string, opener: HTMLElement): void;
  onCopied(message: string): void;
}

const staticDescriptions: Record<(typeof STATIC_TOOL_NAMES)[number], string> = {
  inspect_portal: "Inspect trusted service capabilities.",
  compile_task_view: "Compile a safe adaptive interface.",
  inspect_task_view: "Read the active view and human locks.",
  patch_task_view: "Apply a safe, atomic view patch.",
  run_journey_checks: "Verify completeness and accessibility.",
  stage_workflow_tool: "Stage a reusable tool for human review.",
  list_workflow_tools: "List compiled workflow metadata.",
};

export const ToolSurface = ({ onDisable, onDelete, onCopied }: ToolSurfaceProps) => {
  const registered = useAppStore((state) => state.webmcp.registeredToolNames);
  const approved = useAppStore((state) => state.approvedWorkflowTools);
  const lastChange = useAppStore((state) => state.webmcp.lastToolChangeAt);
  return (
    <section className="rail-panel" aria-labelledby="tool-surface-heading">
      <div className="rail-panel-heading">
        <div>
          <p className="eyebrow">Live capability graph</p>
          <h2 id="tool-surface-heading" tabIndex={-1}>
            Tool Surface
          </h2>
        </div>
        <span className="count-badge">{registered.length} live</span>
      </div>
      <h3 className="tool-group-heading">Static</h3>
      <ul className="tool-list">
        {STATIC_TOOL_NAMES.map((name) => (
          <li key={name} className="tool-row">
            <span className="tool-icon">
              <Braces size={16} />
            </span>
            <div>
              <code>{name}</code>
              <p>{staticDescriptions[name]}</p>
              <span className="tool-meta">
                <span>Built-in</span>
                <span>
                  {name.startsWith("inspect") || name.startsWith("list") || name.startsWith("run")
                    ? "Read"
                    : "Write"}
                </span>
                <span>
                  {registered.includes(name) ? (
                    <>
                      <Check size={12} /> Registered
                    </>
                  ) : (
                    "Unavailable"
                  )}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="tool-group-heading">Compiled</h3>
      {Object.values(approved).length ? (
        <>
          <ul className="tool-list">
            {Object.values(approved).map((tool) => (
              <li
                key={tool.name}
                data-testid={`tool-row-${tool.name}`}
                className={`tool-row compiled-row ${lastChange ? "row-pulse" : ""}`}
              >
                <span className="tool-icon">
                  <Braces size={16} />
                </span>
                <div>
                  <code>{tool.name}</code>
                  <p>{tool.description}</p>
                  <span className="tool-meta">
                    <span>Human-approved workflow</span>
                    <span>Write</span>
                    <span>{tool.enabled ? "Registered" : "Disabled"}</span>
                  </span>
                  <div className="row-actions">
                    {tool.enabled ? (
                      <button type="button" onClick={() => onDisable(tool.name)}>
                        <Ban size={14} /> Disable
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) => onDelete(tool.name, event.currentTarget)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {approved.renew_permit_guided ? (
            <div className="compiled-prompt">
              <DemoPromptCard
                number={2}
                title="Use the tool you approved"
                prompt={PROMPT_B}
                onCopied={onCopied}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-state compact">
          <Braces size={20} />
          <p>
            <strong>No compiled tools yet</strong>
            <span>Human-approved workflows appear here live.</span>
          </p>
        </div>
      )}
    </section>
  );
};
