import { CircleAlert, Crosshair, Radio, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

import { ROBOT_IDS } from "../domain/firebreakSeed";
import type { FirebreakSnapshot, MissionProgressEvent, RobotId } from "../domain/firebreakTypes";

const actionCallout = (event: MissionProgressEvent | undefined): string => {
  if (!event) return "FLEET LAUNCH";
  const message = event.message.toLowerCase();
  if (message.includes("scan-hazards")) return "HAZARD MAP LOCKED";
  if (message.includes("rescue-worker")) return "WORKER SECURED";
  if (message.includes("deliver-worker-b-and-container")) return "FINAL EVACUATION";
  if (message.includes("deliver-worker")) return "WORKER EVACUATED";
  if (message.includes("isolate-power")) return "POWER ISOLATED";
  if (message.includes("suppress-fire")) return "BATTERY FIRE CONTAINED";
  if (message.includes("pickup-container")) return "HAZARDOUS LOAD ATTACHED";
  return "APPROVED ROUTE ACTIVE";
};

interface CinematicMissionHUDProps {
  world: FirebreakSnapshot;
  progress: MissionProgressEvent[];
  focusRobotId: RobotId;
  finalWide: boolean;
  reducedMotion: boolean;
  onEmergencyStop(): void;
}

export function CinematicMissionHUD({
  world,
  progress,
  focusRobotId,
  finalWide,
  reducedMotion,
  onEmergencyStop,
}: CinematicMissionHUDProps) {
  const latest = progress.at(-1);
  const fleetProgress =
    ROBOT_IDS.reduce((total, robotId) => total + world.robots[robotId].routeProgress, 0) /
    ROBOT_IDS.length;
  const directorLabel = reducedMotion
    ? "AUTO DIRECTOR · OVERVIEW"
    : finalWide
      ? "AUTO DIRECTOR · FINAL WIDE"
      : `AUTO DIRECTOR · FOLLOWING ${focusRobotId}`;

  return (
    <section className="cinematic-hud" role="region" aria-label="Cinematic mission view">
      <div className="cinematic-frame" aria-hidden="true" />
      <header className="cinematic-topline">
        <span className="cinematic-live">
          <Radio aria-hidden="true" /> AUTONOMOUS RESCUE IN PROGRESS
        </span>
        <span className="cinematic-authority">
          <ShieldCheck aria-hidden="true" /> 8 tools live · one-use authority
        </span>
      </header>

      <div className="cinematic-event">
        <span className="cinematic-director">
          <Crosshair aria-hidden="true" /> {directorLabel}
        </span>
        <strong aria-live="polite">{finalWide ? "FINAL APPROACH" : actionCallout(latest)}</strong>
        <small>
          {latest?.message ?? "Dispatching four robots on the approved safety envelope."}
        </small>
      </div>

      <div
        className="cinematic-progress"
        role="progressbar"
        aria-label="Fleet progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fleetProgress * 100)}
      >
        <span style={{ width: `${fleetProgress * 100}%` }} />
      </div>

      <div className="cinematic-bottomline">
        <ol className="cinematic-fleet" aria-label="Executing robot fleet">
          {ROBOT_IDS.map((robotId) => {
            const robot = world.robots[robotId];
            const focused = !reducedMotion && !finalWide && focusRobotId === robotId;
            return (
              <li
                key={robotId}
                className={focused ? "cinematic-robot-focused" : ""}
                style={{ "--robot-color": robot.color } as CSSProperties}
              >
                <span className="cinematic-robot-beacon" aria-hidden="true" />
                <span>
                  <strong>{robotId}</strong>
                  <small>{robot.status}</small>
                </span>
                <b>{Math.round(robot.routeProgress * 100)}%</b>
              </li>
            );
          })}
        </ol>
        <button className="cinematic-stop" type="button" onClick={onEmergencyStop}>
          <CircleAlert aria-hidden="true" /> Emergency stop
        </button>
      </div>
    </section>
  );
}
