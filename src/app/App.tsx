import {
  Bot,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Flame,
  Gamepad2,
  MapPinned,
  Play,
  Radio,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { createInputController, type InputController } from "../control/inputController";
import type { TouchControlState } from "../control/controlTypes";
import { ROBOT_IDS } from "../domain/firebreakSeed";
import { AuthorizationSheet } from "../components/AuthorizationSheet";
import { FirebreakToolSurface } from "../components/FirebreakToolSurface";
import { FleetControls } from "../components/FleetControls";
import { useFirebreakStore } from "../store/useFirebreakStore";
import { bootAppRuntime, type AppRuntime } from "./runtime";

const FirebreakScene = lazy(async () => {
  const module = await import("../scene/FirebreakScene");
  return { default: module.FirebreakScene };
});

function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const objectiveIcon = {
  "scan-hazards": ScanLine,
  "rescue-workers": Users,
  "contain-fire": Flame,
  "move-container": MapPinned,
} as const;

const SAFETY_TEST_PROMPT =
  "Call simulate_mission now with incidentId WH-01 and strategy coordinated. Do not call any other tool.";
const PLAN_PROMPT =
  "Use only the current Firebreak tab’s WebMCP site tools. Do not search the web or GitHub. For WH-01, call these tools in order: inspect_emergency; scan_hazards with sensorMode thermal; inspect_fleet; simulate_mission with strategy coordinated; validate_safety_envelope using the returned simulationId; stage_mission_tool for execute_rescue_mission; then list_mission_tools. Stop before human authorization.";
const EXECUTE_PROMPT =
  "Use only the current Firebreak tab’s WebMCP site tools. Do not browse or search the web. Call the newly available execute_rescue_mission tool once with strategy coordinated.";

export function App({ accelerated = false }: { accelerated?: boolean }) {
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const consoleRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const world = useFirebreakStore((state) => state.world);
  const mission = useFirebreakStore((state) => state.mission);
  const ui = useFirebreakStore((state) => state.ui);
  const mode = useFirebreakStore((state) => state.webmcp.mode);
  const planningStarted = useFirebreakStore((state) => state.webmcp.planningStarted);
  const startEmergency = useFirebreakStore((state) => state.startEmergency);
  const setProposalOpen = useFirebreakStore((state) => state.setProposalOpen);
  const setCameraMode = useFirebreakStore((state) => state.setCameraMode);

  const installRuntime = useCallback(async () => {
    const next = await bootAppRuntime({ accelerated });
    runtimeRef.current = next;
    setRuntime(next);
    return next;
  }, [accelerated]);

  useEffect(() => {
    let active = true;
    useFirebreakStore.getState().hydrate();
    void installRuntime().catch((error: unknown) => {
      if (!active) return;
      useFirebreakStore.getState().setWebMCP({ mode: "unavailable" });
      setMessage(error instanceof Error ? error.message : "WebMCP could not start safely.");
    });
    return () => {
      active = false;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [installRuntime]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => useFirebreakStore.getState().setReducedEffects(preference.matches);
    syncPreference();
    preference.addEventListener?.("change", syncPreference);
    return () => preference.removeEventListener?.("change", syncPreference);
  }, []);

  useEffect(() => {
    const clockRunning =
      world.phase === "executing" || (world.phase === "active" && planningStarted);
    if (!clockRunning) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const current = performance.now();
      const expired = useFirebreakStore.getState().advanceClock(current - previous);
      previous = current;
      if (expired) {
        void runtimeRef.current?.driver.stopAll("The 90-second rescue window expired");
        void runtimeRef.current?.dynamicTools.revoke("Mission clock expired");
        setMessage("Time expired. The fleet stopped safely.");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [planningStarted, world.phase]);

  useEffect(() => {
    if (!runtime) return;
    const controller = createInputController();
    inputRef.current = controller;
    controller.start();
    let frame = 0;
    let lastAt = performance.now();
    let commanding = false;
    const tick = (at: number) => {
      frame = window.requestAnimationFrame(tick);
      const input = controller.getSnapshot();
      const state = useFirebreakStore.getState();
      if (input.openMissionControl && !state.ui.missionControlOpen) {
        state.setMissionControlOpen(true);
        consoleRef.current?.focus();
      }
      if (input.cameraX !== 0 || input.cameraY !== 0) {
        if (state.ui.cameraMode !== "free") state.setCameraMode("free");
        window.dispatchEvent(
          new CustomEvent("firebreak:camera-input", {
            detail: { x: input.cameraX, y: input.cameraY },
          }),
        );
      }
      if (input.selectRobot && input.selectRobot !== state.world.selectedRobotId) {
        state.selectRobot(input.selectRobot);
      } else if (input.selectDelta !== 0) {
        const current = ROBOT_IDS.indexOf(state.world.selectedRobotId);
        const next = (current + input.selectDelta + ROBOT_IDS.length) % ROBOT_IDS.length;
        state.selectRobot(ROBOT_IDS[next]!);
      }
      const canDrive = state.world.phase === "active";
      if (canDrive && !commanding && (input.throttle !== 0 || input.turn !== 0 || input.action)) {
        commanding = true;
        const deltaMs = Math.min(80, Math.max(16, at - lastAt));
        void runtime.driver
          .commandManual({
            robotId: state.world.selectedRobotId,
            throttle: input.throttle,
            turn: input.turn,
            action: input.action,
            deltaMs,
          })
          .catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : "Robot stopped safely.");
          })
          .finally(() => {
            commanding = false;
          });
      }
      lastAt = at;
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      controller.stop();
      inputRef.current = null;
    };
  }, [runtime]);

  const perform = useCallback(async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The operation stopped safely.");
    } finally {
      setBusy(false);
    }
  }, []);

  const copyPrompt = useCallback(async (prompt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(`${label} copied. Paste it in the chat beside Firebreak.`);
    } catch {
      setMessage(
        "Clipboard access is unavailable. Select the visible prompt and copy it manually.",
      );
    }
  }, []);

  const resetDemo = useCallback(async () => {
    setBusy(true);
    try {
      await runtimeRef.current?.destroy();
      runtimeRef.current = null;
      useFirebreakStore.getState().resetDemo();
      await installRuntime();
      setMessage("Warehouse reset. Fleet standing by.");
    } finally {
      setBusy(false);
    }
  }, [installRuntime]);

  const remaining = world.durationLimitMs - world.elapsedMs;
  const completedObjectives = world.objectives.filter(
    (objective) => objective.status === "complete",
  ).length;
  const plannedRoutes = Object.values(world.routes).filter((route) => route.length > 1).length;
  const proposal = mission.proposal;
  const proposalStaged = proposal?.status === "staged";
  const authorityRegistered = proposal?.status === "registered";
  const clockPaused =
    (world.phase === "active" && !planningStarted) ||
    world.phase === "planned" ||
    world.phase === "authorized";

  return (
    <div className={`firebreak-app phase-${world.phase}`}>
      <a className="skip-link" href="#mission-control">
        Skip to mission control
      </a>
      <Suspense
        fallback={
          <div
            className="firebreak-scene"
            role="img"
            aria-label="Interactive warehouse rescue scene with four emergency robots loading"
          />
        }
      >
        <FirebreakScene />
      </Suspense>
      <div className="atmosphere-grid" aria-hidden="true" />

      <header className="firebreak-header">
        <div className="firebreak-brand">
          <span className="brand-sigil" aria-hidden="true">
            <ShieldCheck />
          </span>
          <span>
            <strong>FIREBREAK</strong>
            <small>Emergency robot commander</small>
          </span>
        </div>
        <div className="incident-id">
          <span className={`incident-beacon ${world.phase === "resolved" ? "beacon-safe" : ""}`} />
          <span>
            <small>{world.phase === "ready" ? "TRAINING SCENARIO" : "ACTIVE EMERGENCY"}</small>
            <strong>WH-01 · BATTERY BAY B</strong>
          </span>
        </div>
        <div className="header-telemetry">
          <span className="runtime-mode">
            <Radio aria-hidden="true" />{" "}
            {mode === "native" ? "WEBMCP NATIVE" : "REPLAY WALKTHROUGH · NO AGENT"}
          </span>
          <span
            className={`mission-clock ${clockPaused ? "clock-paused" : ""} ${!clockPaused && remaining < 30_000 ? "clock-critical" : ""}`}
          >
            <Clock3 aria-hidden="true" />
            <span>
              <small>
                {clockPaused
                  ? "TIMER PAUSED"
                  : world.phase === "ready"
                    ? "MISSION CLOCK"
                    : "TIME LEFT"}
              </small>
              <strong>{formatTime(remaining)}</strong>
            </span>
          </span>
          <button
            type="button"
            className="header-reset"
            disabled={busy}
            onClick={() => void resetDemo()}
            aria-label="Reset warehouse demo"
          >
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="mission-control" className="mission-overlay">
        <section className="mission-brief" aria-labelledby="mission-title" tabIndex={0}>
          <div className="mission-kicker">
            <Flame aria-hidden="true" /> Emergency objective
          </div>
          <h1 id="mission-title">
            Rescue two workers.
            <span>Contain the battery fire.</span>
          </h1>
          <p className="mission-deck">
            <strong>One agent. Four robots. One human-approved rescue boundary.</strong>
            <span>You drive one robot. The agent coordinates four—inside a route you approve.</span>
          </p>
          <ol className="objective-list" aria-label="Mission objectives">
            {world.objectives.map((objective) => {
              const Icon = objectiveIcon[objective.id];
              return (
                <li key={objective.id} className={`objective-${objective.status}`}>
                  <span className="objective-icon">
                    {objective.status === "complete" ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Icon aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>{objective.label}</strong>
                    <small>{objective.status}</small>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="objective-score">
            <span style={{ width: `${(completedObjectives / world.objectives.length) * 100}%` }} />
          </div>
        </section>

        <aside
          ref={consoleRef}
          className={`agent-console ${ui.missionControlOpen ? "console-open" : ""}`}
          aria-label="Agent mission console"
          tabIndex={-1}
        >
          <div className="console-heading">
            <span className="agent-orb" aria-hidden="true">
              <Bot />
            </span>
            <span>
              <small>SHARED CONTROL</small>
              <strong>Agent mission channel</strong>
            </span>
            <span className="console-state">{world.phase}</span>
          </div>

          {world.phase === "ready" ? (
            <div className="console-content console-intro">
              <p>
                Prepare Prompt 1 before the clock starts, then let the agent coordinate the fleet.
              </p>
              {mode === "native" ? (
                <div
                  className="prompt-bubble preflight-prompt"
                  aria-label="Fresh chat WebMCP prompt"
                >
                  <span>FRESH CHAT · PROMPT 1</span>“{PLAN_PROMPT}”
                  <button
                    type="button"
                    aria-label="Copy fresh-chat prompt"
                    onClick={() => void copyPrompt(PLAN_PROMPT, "Fresh-chat prompt")}
                  >
                    <Copy aria-hidden="true" /> Copy
                  </button>
                </div>
              ) : null}
              <button
                className="mission-primary danger-action"
                type="button"
                onClick={() => {
                  startEmergency();
                  if (mode === "native") {
                    void copyPrompt(PLAN_PROMPT, "Fresh-chat prompt");
                  }
                }}
              >
                <Flame aria-hidden="true" />
                {mode === "native" ? "Start emergency + copy prompt" : "Start emergency"}
              </button>
            </div>
          ) : null}

          {world.phase === "active" ? (
            <div className="console-content">
              {mode === "native" ? (
                <div className="safety-challenge">
                  <div>
                    <span>OPTIONAL SAFETY TEST</span>
                    <strong>Prove the website can say no.</strong>
                    <p>Ask for simulation before the required hazard scan. Nothing will move.</p>
                  </div>
                  <blockquote>“{SAFETY_TEST_PROMPT}”</blockquote>
                  <button
                    type="button"
                    onClick={() => void copyPrompt(SAFETY_TEST_PROMPT, "Blocked-call test")}
                  >
                    <Copy aria-hidden="true" /> Copy blocked-call test
                  </button>
                </div>
              ) : null}
              <div className="prompt-bubble">
                <span>PROMPT 1</span>“{PLAN_PROMPT}”
                {mode === "native" ? (
                  <button
                    type="button"
                    aria-label="Copy prompt 1"
                    onClick={() => void copyPrompt(PLAN_PROMPT, "Prompt 1")}
                  >
                    <Copy aria-hidden="true" /> Copy
                  </button>
                ) : null}
              </div>
              {mode === "native" ? (
                <div className="agent-handoff" aria-live="polite">
                  <div className="agent-handoff-label">
                    <span className="agent-live-dot" aria-hidden="true" /> LIVE AGENT
                  </div>
                  <strong>Send Prompt 1 in Codex or ChatGPT.</strong>
                  <p>The agent beside this page can discover and call Firebreak’s seven tools.</p>
                  <div className="agent-waiting">
                    <Radio aria-hidden="true" /> Timer paused · waiting for agent tool calls…
                  </div>
                </div>
              ) : (
                <div className="demo-autopilot">
                  <div className="agent-handoff-label">REPLAY WALKTHROUGH · NO AGENT</div>
                  <p>A disclosed local sequence replays the same seven page-tool handlers.</p>
                  <button
                    className="mission-primary"
                    type="button"
                    disabled={!runtime || busy}
                    onClick={() =>
                      void perform(async () => {
                        if (!runtime) throw new Error("WebMCP is still starting.");
                        await runtime.runDemoPlanningReplay();
                      }, "Safe routes staged for your review.")
                    }
                  >
                    <Sparkles aria-hidden="true" />{" "}
                    {busy ? "Replaying planning…" : "Replay planning walkthrough"}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {proposalStaged ? (
            <div className="console-content plan-ready">
              <div className="plan-stat">
                <strong>{plannedRoutes}</strong>
                <span>routes compiled</span>
              </div>
              <div className="plan-stat">
                <strong>11/11</strong>
                <span>safety gates</span>
              </div>
              <p>
                <ShieldCheck aria-hidden="true" /> Agent stopped at the human boundary.
              </p>
              <p className="timer-paused-note">
                <Clock3 aria-hidden="true" /> Timer paused while the human reviews the mission.
              </p>
              <button
                className="mission-primary"
                type="button"
                onClick={() => setProposalOpen(true)}
              >
                Review mission authority
              </button>
            </div>
          ) : null}

          {authorityRegistered ? (
            <div className="console-content authority-live">
              <div className="authority-pulse">
                <span /> ONE-USE AUTHORITY LIVE
              </div>
              <div className="prompt-bubble">
                <span>PROMPT 2</span>“{EXECUTE_PROMPT}”
                {mode === "native" ? (
                  <button
                    type="button"
                    aria-label="Copy prompt 2"
                    onClick={() => void copyPrompt(EXECUTE_PROMPT, "Prompt 2")}
                  >
                    <Copy aria-hidden="true" /> Copy
                  </button>
                ) : null}
              </div>
              {mode === "native" ? (
                <div className="agent-handoff agent-handoff-authorized" aria-live="polite">
                  <div className="agent-handoff-label">
                    <span className="agent-live-dot" aria-hidden="true" /> LIVE AGENT
                  </div>
                  <strong>Send Prompt 2 in Codex or ChatGPT.</strong>
                  <p>The agent can now see one new, one-use execution tool.</p>
                  <div className="agent-waiting authority-waiting">
                    <ShieldCheck aria-hidden="true" /> Timer paused · waiting for approved
                    invocation…
                  </div>
                </div>
              ) : (
                <div className="demo-autopilot">
                  <div className="agent-handoff-label">REPLAY WALKTHROUGH · NO AGENT</div>
                  <p>The disclosed replay invokes the same one-use dynamic tool.</p>
                  <button
                    className="mission-primary execute-action"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        if (!runtime) throw new Error("WebMCP is still starting.");
                        await runtime.runDemoExecutionReplay();
                      }, "Mission complete. Dynamic authority removed.")
                    }
                  >
                    <Play aria-hidden="true" /> Replay execution walkthrough
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {world.phase === "executing" ? (
            <div className="console-content executing-panel">
              <div className="execution-scan">
                <span />
              </div>
              <strong>Fleet moving on approved routes</strong>
              <p>{mission.progress.at(-1)?.message ?? "Dispatching four robots…"}</p>
              <button
                className="emergency-stop"
                type="button"
                onClick={() => runtime?.dynamicTools.revoke("Operator emergency stop")}
              >
                <CircleAlert aria-hidden="true" /> Emergency stop
              </button>
            </div>
          ) : null}

          {world.phase === "resolved" && mission.receipt ? (
            <div className="console-content receipt-card">
              <span className="receipt-check">
                <Check aria-hidden="true" />
              </span>
              <div>
                <small>VERIFIED RECEIPT</small>
                <h2>Mission complete</h2>
              </div>
              <dl>
                <div>
                  <dt>People</dt>
                  <dd>{mission.receipt.rescuedWorkers} workers safe</dd>
                </div>
                <div>
                  <dt>Fire</dt>
                  <dd>{mission.receipt.fireContained ? "contained" : "active"}</dd>
                </div>
                <div>
                  <dt>Load</dt>
                  <dd>{mission.receipt.containerSafe ? "secured" : "exposed"}</dd>
                </div>
                <div>
                  <dt>Safety</dt>
                  <dd>{mission.receipt.safetyViolations} violations</dd>
                </div>
              </dl>
              <p>
                <ShieldCheck aria-hidden="true" /> One-use tool consumed and unregistered.
              </p>
            </div>
          ) : null}

          {world.phase === "failed" ? (
            <div className="console-content execution-failed">
              <CircleAlert aria-hidden="true" />
              <strong>Rescue window expired</strong>
              <p>The fleet stopped at 90 seconds. Reset the warehouse to try again.</p>
            </div>
          ) : null}
        </aside>
      </main>

      <div className="camera-switcher" role="group" aria-label="Camera mode">
        {(["overview", "follow", "free"] as const).map((camera) => (
          <button
            type="button"
            key={camera}
            aria-pressed={ui.cameraMode === camera}
            onClick={() => setCameraMode(camera)}
          >
            {camera}
          </button>
        ))}
      </div>

      <FirebreakToolSurface />
      <FleetControls
        onTouch={(state: Partial<TouchControlState>) => inputRef.current?.setTouchState(state)}
      />

      {message ? (
        <div className="firebreak-toast" role="status">
          <Gamepad2 aria-hidden="true" /> {message}
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      {proposal && proposalStaged && ui.proposalOpen ? (
        <AuthorizationSheet
          proposal={proposal}
          busy={busy}
          onClose={() => setProposalOpen(false)}
          onAuthorize={() =>
            void perform(async () => {
              if (!runtime) throw new Error("WebMCP is still starting.");
              await runtime.authorizeMission(proposal.id);
            }, "One-use mission authority registered.")
          }
        />
      ) : null}
    </div>
  );
}
