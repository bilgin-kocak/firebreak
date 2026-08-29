import { Braces, Play, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { AppRuntime } from "../app/runtime";
import { canonicalPreferences } from "../domain/seed";
import { useAppStore } from "../store/useAppStore";
import { createSchemaInputSample } from "../webmcp/toolInputSample";
import type { WebMCPToolMetadata } from "../webmcp/types";
import { useDialogFocus } from "./useDialogFocus";

interface WebMCPSimulatorProps {
  open: boolean;
  runtime: AppRuntime | null;
  onClose(): void;
  onMessage(message: string): void;
}

const canonicalOperations = [
  { operationId: "permit.load_current", bindings: [] },
  {
    operationId: "permit.set_vehicle",
    bindings: [{ argument: "vehicleId", source: "portal_state" as const, key: "currentVehicleId" }],
  },
  {
    operationId: "permit.set_duration",
    bindings: [{ argument: "months", source: "tool_input" as const, key: "durationMonths" }],
  },
  {
    operationId: "permit.set_contact",
    bindings: [{ argument: "email", source: "portal_state" as const, key: "contactEmail" }],
  },
  { operationId: "permit.calculate_fee", bindings: [] },
  { operationId: "permit.save_draft", bindings: [] },
  { operationId: "permit.stage_review", bindings: [] },
];

const canonicalCompileInput = {
  serviceId: "parking_permit_renewal",
  title: "Renew your parking permit",
  goal: "Prepare a plain-language parking permit renewal and stop for your approval.",
  preferences: canonicalPreferences,
  fieldOrder: [
    "vehicleId",
    "permitDurationMonths",
    "contactEmail",
    "communicationPreference",
    "currentPermitSummary",
  ],
  hiddenOptionalFields: [],
  copyOverrides: [],
  requireHumanConfirmation: true,
};

const canonicalStageInput = (viewId: string) => ({
  viewId,
  name: "renew_permit_guided",
  title: "Guided parking permit renewal",
  description:
    "Prepare a Northstar City parking permit renewal using the resident's current vehicle and contact details. Calculates the fee, saves a draft, and stops for human review without submitting.",
  parameters: [
    {
      name: "durationMonths",
      fieldId: "permitDurationMonths",
      description: "Choose a 6- or 12-month parking permit.",
      required: true,
    },
  ],
  operations: canonicalOperations,
  stopAt: "review",
});

const sampleInputForTool = (
  tool: WebMCPToolMetadata,
  activeViewId: string | null,
): Record<string, unknown> => {
  const viewId = activeViewId ?? "view_id_from_compile_task_view";
  switch (tool.name) {
    case "inspect_portal":
      return { serviceId: "all" };
    case "compile_task_view":
      return canonicalCompileInput;
    case "inspect_task_view":
      return activeViewId ? { viewId: activeViewId } : {};
    case "patch_task_view":
      return {
        viewId,
        patches: [{ type: "set_title", title: "Renew your parking permit" }],
      };
    case "run_journey_checks":
      return { viewId, includeDomChecks: true };
    case "stage_workflow_tool":
      return canonicalStageInput(viewId);
    case "list_workflow_tools":
      return { includeDisabled: true };
    default:
      return createSchemaInputSample(tool.inputSchema) as Record<string, unknown>;
  }
};

export const WebMCPSimulator = ({ open, runtime, onClose, onMessage }: WebMCPSimulatorProps) => {
  const [tools, setTools] = useState<WebMCPToolMetadata[]>([]);
  const [selected, setSelected] = useState("inspect_portal");
  const [input, setInput] = useState('{\n  "serviceId": "all"\n}');
  const [result, setResult] = useState("");
  const registeredNames = useAppStore((state) => state.webmcp.registeredToolNames);
  const activeViewId = useAppStore((state) => state.activeViewId);
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogFocus(open, close);
  useEffect(() => {
    if (open && runtime)
      void runtime.adapter.getTools().then((nextTools) => {
        setTools(nextTools);
        const chosenTool = nextTools.find((tool) => tool.name === selected) ?? nextTools[0];
        if (chosenTool) {
          setSelected(chosenTool.name);
          setInput(JSON.stringify(sampleInputForTool(chosenTool, activeViewId), null, 2));
        }
      });
  }, [activeViewId, open, registeredNames, runtime, selected]);
  if (!open) return null;
  const execute = async (name: string, value: unknown) => {
    if (!runtime) return;
    try {
      const output = await runtime.adapter.executeTool(name, value);
      setResult(JSON.stringify(output, null, 2));
      onMessage(`${name} completed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      setResult(JSON.stringify({ ok: false, message }, null, 2));
      onMessage(message);
    }
  };
  const runSelected = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      setResult(
        JSON.stringify(
          { ok: false, code: "INVALID_TOOL_INPUT", message: "Enter valid JSON." },
          null,
          2,
        ),
      );
      return;
    }
    await execute(selected, parsed);
  };
  const step = async (kind: "inspect" | "compile" | "checks" | "stage" | "invoke") => {
    if (kind === "inspect")
      return execute("inspect_portal", {
        serviceId: "parking_permit_renewal",
        includeCurrentState: true,
      });
    if (kind === "compile") return execute("compile_task_view", canonicalCompileInput);
    const viewId = useAppStore.getState().activeViewId;
    if (!viewId) {
      onMessage("Compile the guided view first.");
      return;
    }
    if (kind === "checks") return execute("run_journey_checks", { viewId, includeDomChecks: true });
    if (kind === "stage") return execute("stage_workflow_tool", canonicalStageInput(viewId));
    return execute("renew_permit_guided", { durationMonths: 12 });
  };
  const chosen = tools.find((tool) => tool.name === selected);
  return (
    <div className="dialog-backdrop simulator-backdrop">
      <div
        ref={dialogRef}
        className="simulator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulator-title"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Ordinary-browser testing</p>
            <h2 id="simulator-title">WebMCP Simulator</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="Close simulator"
          >
            <X size={20} />
          </button>
        </header>
        <div className="simulator-body">
          <section className="canonical-steps" aria-labelledby="canonical-title">
            <h3 id="canonical-title">Canonical one-click steps</h3>
            <div>
              {[
                ["inspect", "Inspect permit portal"],
                ["compile", "Compile low-vision view"],
                ["checks", "Run checks"],
                ["stage", "Stage guided tool"],
                ["invoke", "Invoke guided tool with 12 months"],
              ].map(([id, label], index) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    void step(id as "inspect" | "compile" | "checks" | "stage" | "invoke")
                  }
                  disabled={id === "invoke" && !registeredNames.includes("renew_permit_guided")}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>
          </section>
          <div className="simulator-grid">
            <section>
              <h3>Registered tools</h3>
              <label htmlFor="simulator-tool">Choose a tool</label>
              <select
                id="simulator-tool"
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  const tool = tools.find((item) => item.name === event.target.value);
                  if (tool)
                    setInput(JSON.stringify(sampleInputForTool(tool, activeViewId), null, 2));
                }}
              >
                {tools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
              {chosen ? (
                <div className="schema-summary">
                  <p>{chosen.description}</p>
                  <div className="annotation-list" aria-label="Tool annotations">
                    {Object.entries(chosen.annotations).map(([name, value]) => (
                      <span key={name}>
                        {name}: {String(value)}
                      </span>
                    ))}
                  </div>
                  <details>
                    <summary>Input schema</summary>
                    <pre>{JSON.stringify(chosen.inputSchema, null, 2)}</pre>
                  </details>
                </div>
              ) : null}
            </section>
            <section>
              <h3>JSON input</h3>
              <label htmlFor="simulator-input">Tool arguments</label>
              <textarea
                id="simulator-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                spellCheck={false}
              />
              <button
                className="button button-primary"
                type="button"
                onClick={() => void runSelected()}
                disabled={!runtime}
              >
                <Play size={17} /> Run selected tool
              </button>
            </section>
          </div>
          <section className="simulator-result" aria-live="polite">
            <h3>
              <Braces size={17} /> Result
            </h3>
            <pre>{result || "Run a tool to see its compact result."}</pre>
          </section>
          {activeViewId ? (
            <p className="simulator-context">
              Active view: <code>{activeViewId}</code>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
