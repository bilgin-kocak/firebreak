import { BatteryMedium, Crosshair, Gamepad2 } from "lucide-react";

import { ROBOT_IDS } from "../domain/firebreakSeed";
import type { TouchControlState } from "../control/controlTypes";
import { useFirebreakStore } from "../store/useFirebreakStore";

const roleLabel = {
  scout: "Thermal drone",
  rescue: "Medic rover",
  suppress: "Fire unit",
  haul: "Hazard carrier",
} as const;

export function FleetControls({
  onTouch,
}: {
  onTouch: (state: Partial<TouchControlState>) => void;
}) {
  const robots = useFirebreakStore((state) => state.world.robots);
  const selected = useFirebreakStore((state) => state.world.selectedRobotId);
  const selectRobot = useFirebreakStore((state) => state.selectRobot);
  const setNeutral = () => onTouch({ throttle: 0, turn: 0, action: false });
  return (
    <div className="fleet-dock">
      <div className="control-hint">
        <Gamepad2 aria-hidden="true" />
        <span>
          <strong>Drive selected robot</strong>
          <small>
            WASD or left stick · right stick camera · Space / A acts · M / Start console
          </small>
        </span>
      </div>
      <div className="robot-fleet" role="group" aria-label="Robot fleet">
        {ROBOT_IDS.map((robotId, index) => {
          const robot = robots[robotId];
          return (
            <button
              key={robotId}
              type="button"
              className={`robot-card ${selected === robotId ? "robot-selected" : ""}`}
              onClick={() => selectRobot(robotId)}
              aria-pressed={selected === robotId}
              style={{ "--robot-color": robot.color } as React.CSSProperties}
            >
              <span className="robot-index">{index + 1}</span>
              <span className="robot-avatar" aria-hidden="true">
                <span />
              </span>
              <span className="robot-copy">
                <strong>{robotId}</strong>
                <small>{roleLabel[robot.role]}</small>
              </span>
              <span className="robot-battery">
                <BatteryMedium size={13} aria-hidden="true" /> {Math.round(robot.battery)}%
              </span>
            </button>
          );
        })}
      </div>
      <div className="touch-pad" role="group" aria-label="Touch robot controls">
        <button
          type="button"
          aria-label="Turn left"
          onPointerDown={() => onTouch({ turn: -1 })}
          onPointerUp={setNeutral}
          onPointerCancel={setNeutral}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Drive forward"
          onPointerDown={() => onTouch({ throttle: 1 })}
          onPointerUp={setNeutral}
          onPointerCancel={setNeutral}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Turn right"
          onPointerDown={() => onTouch({ turn: 1 })}
          onPointerUp={setNeutral}
          onPointerCancel={setNeutral}
        >
          →
        </button>
        <button
          className="touch-reverse"
          type="button"
          aria-label="Drive backward"
          onPointerDown={() => onTouch({ throttle: -1 })}
          onPointerUp={setNeutral}
          onPointerCancel={setNeutral}
        >
          ↓
        </button>
        <button
          className="touch-action"
          type="button"
          aria-label="Use robot action"
          onPointerDown={() => onTouch({ action: true })}
          onPointerUp={setNeutral}
          onPointerCancel={setNeutral}
        >
          <Crosshair aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
