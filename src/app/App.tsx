import {
  Bot,
  Check,
  CircleAlert,
  Clock3,
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

export function App({ accelerated = false }: { accelerated?: boolean }) {
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const world = useFirebreakStore((state) => state.world);
  const mission = useFirebreakStore((state) => state.mission);
  const ui = useFirebreakStore((state) => state.ui);
  const mode = useFirebreakStore((state) => state.webmcp.mode);
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
      if (input.selectRobot && input.selectRobot !== state.world.selectedRobotId) {
        state.selectRobot(input.selectRobot);
      } else if (input.selectDelta !== 0) {
        const current = ROBOT_IDS.indexOf(state.world.selectedRobotId);
        const next = (current + input.selectDelta + ROBOT_IDS.length) % ROBOT_IDS.length;
        state.selectRobot(ROBOT_IDS[next]!);
      }
      const canDrive = state.world.phase === "active" || state.world.phase === "planned";
      if (
        canDrive &&
        !commanding &&
        (input.throttle !== 0 || input.turn !== 0 || input.action)
      ) {
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
            <small>WebMCP robot command</small>
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
            <Radio aria-hidden="true" /> {mode === "native" ? "WEBMCP NATIVE" : "BROWSER SIM"}
          </span>
          <span className={`mission-clock ${remaining < 30_000 ? "clock-critical" : ""}`}>
            <Clock3 aria-hidden="true" />
            <span>
              <small>TIME LEFT</small>
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
          <p>You drive one robot. The agent coordinates four—inside a route you approve.</p>
          <ol className="objective-list" aria-label="Mission objectives">
            {world.objectives.map((objective) => {
              const Icon = objectiveIcon[objective.id];
              return (
                <li key={objective.id} className={`objective-${objective.status}`}>
                  <span className="objective-icon">
                    {objective.status === "complete" ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}
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

        <aside className="agent-console" aria-label="Agent mission console">
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
                Start the emergency, try driving a robot, then let the agent coordinate the whole fleet.
              </p>
              <button className="mission-primary danger-action" type="button" onClick={startEmergency}>
                <Flame aria-hidden="true" /> Start emergency
              </button>
            </div>
          ) : null}

          {world.phase === "active" ? (
            <div className="console-content">
              <div className="prompt-bubble">
                <span>PROMPT 1</span>
                “Assess WH-01, plan a coordinated rescue, verify safety, and stage the mission tool.”
              </div>
              <button
                className="mission-primary"
                type="button"
                disabled={!runtime || busy}
                onClick={() =>
                  void perform(async () => {
                    if (!runtime) throw new Error("WebMCP is still starting.");
                    await runtime.runPromptA();
                  }, "Safe routes staged for your review.")
                }
              >
                <Sparkles aria-hidden="true" /> {busy ? "Planning safe routes…" : "Ask agent to plan rescue"}
              </button>
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
              <p><ShieldCheck aria-hidden="true" /> Agent stopped at the human boundary.</p>
              <button className="mission-primary" type="button" onClick={() => setProposalOpen(true)}>
                Review mission authority
              </button>
            </div>
          ) : null}

          {authorityRegistered ? (
            <div className="console-content authority-live">
              <div className="authority-pulse"><span /> ONE-USE AUTHORITY LIVE</div>
              <div className="prompt-bubble">
                <span>PROMPT 2</span>
                “Execute the approved rescue mission now.”
              </div>
              <button
                className="mission-primary execute-action"
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (!runtime) throw new Error("WebMCP is still starting.");
                    await runtime.runPromptB();
                  }, "Mission complete. Dynamic authority removed.")
                }
              >
                <Play aria-hidden="true" /> Execute approved rescue
              </button>
            </div>
          ) : null}

          {world.phase === "executing" ? (
            <div className="console-content executing-panel">
              <div className="execution-scan"><span /></div>
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
              <span className="receipt-check"><Check aria-hidden="true" /></span>
              <div>
                <small>VERIFIED RECEIPT</small>
                <h2>Mission complete</h2>
              </div>
              <dl>
                <div><dt>People</dt><dd>{mission.receipt.rescuedWorkers} workers safe</dd></div>
                <div><dt>Fire</dt><dd>{mission.receipt.fireContained ? "contained" : "active"}</dd></div>
                <div><dt>Load</dt><dd>{mission.receipt.containerSafe ? "secured" : "exposed"}</dd></div>
                <div><dt>Safety</dt><dd>{mission.receipt.safetyViolations} violations</dd></div>
              </dl>
              <p><ShieldCheck aria-hidden="true" /> One-use tool consumed and unregistered.</p>
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
      <FleetControls onTouch={(state: Partial<TouchControlState>) => inputRef.current?.setTouchState(state)} />

      {message ? (
        <div className="firebreak-toast" role="status">
          <Gamepad2 aria-hidden="true" /> {message}
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button>
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
