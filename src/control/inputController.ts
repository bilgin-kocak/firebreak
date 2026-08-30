import type { RobotId } from "../domain/firebreakTypes";
import type {
  InputSnapshot,
  NormalizedControl,
  TouchControlState,
} from "./controlTypes";

export interface GamepadButtonLike {
  pressed: boolean;
  value: number;
}

export interface GamepadLike {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
}

export interface InputController {
  start(): void;
  stop(): void;
  setTouchState(state: Partial<TouchControlState>): void;
  getSnapshot(): InputSnapshot;
}

export interface InputControllerOptions {
  getGamepads?: () => readonly (GamepadLike | null)[];
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

const ZERO_CONTROL: NormalizedControl = {
  throttle: 0,
  turn: 0,
  cameraX: 0,
  cameraY: 0,
  action: false,
  selectDelta: 0,
};

const ROBOT_KEY_MAP: Partial<Record<string, RobotId>> = {
  Digit1: "SCOUT-1",
  Digit2: "MEDIC-2",
  Digit3: "SUPPRESS-3",
  Digit4: "HAUL-4",
};

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function applyDeadZone(value: number, deadZone = 0.15): number {
  const clamped = clampAxis(value);
  return Math.abs(clamped) < deadZone ? 0 : clamped;
}

function isPressed(gamepad: GamepadLike, index: number): boolean {
  return Boolean(gamepad.buttons[index]?.pressed);
}

export function normalizeGamepad(
  gamepad: GamepadLike,
  deadZone = 0.15,
): NormalizedControl {
  if (!gamepad.connected || gamepad.mapping !== "standard") {
    return { ...ZERO_CONTROL };
  }

  const leftBumper = isPressed(gamepad, 4);
  const rightBumper = isPressed(gamepad, 5);

  return {
    throttle: -applyDeadZone(gamepad.axes[1] ?? 0, deadZone),
    turn: applyDeadZone(gamepad.axes[0] ?? 0, deadZone),
    cameraX: applyDeadZone(gamepad.axes[2] ?? 0, deadZone),
    cameraY: -applyDeadZone(gamepad.axes[3] ?? 0, deadZone),
    action: isPressed(gamepad, 0),
    selectDelta: leftBumper === rightBumper ? 0 : rightBumper ? 1 : -1,
  };
}

export function createInputController(
  options: InputControllerOptions = {},
): InputController {
  const pressedKeys = new Set<string>();
  let touch: TouchControlState = { throttle: 0, turn: 0, action: false };
  let gamepad = { ...ZERO_CONTROL };
  let previousGamepadSelect: -1 | 0 | 1 = 0;
  let running = false;
  let frameHandle: number | null = null;

  const getGamepads =
    options.getGamepads ??
    (() =>
      typeof navigator.getGamepads === "function"
        ? Array.from(navigator.getGamepads())
        : []);
  const requestFrame =
    options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));

  function clear(): void {
    pressedKeys.clear();
    touch = { throttle: 0, turn: 0, action: false };
    gamepad = { ...ZERO_CONTROL };
    previousGamepadSelect = 0;
  }

  function poll(): void {
    if (!running) return;
    const active = getGamepads().find(
      (candidate): candidate is GamepadLike =>
        Boolean(candidate?.connected && candidate.mapping === "standard"),
    );
    const next = active ? normalizeGamepad(active) : { ...ZERO_CONTROL };
    const selectDelta =
      next.selectDelta !== 0 && next.selectDelta === previousGamepadSelect
        ? 0
        : next.selectDelta;
    previousGamepadSelect = next.selectDelta;
    gamepad = { ...next, selectDelta };
    frameHandle = requestFrame(poll);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (
      event.code.startsWith("Arrow") ||
      event.code === "Space" ||
      event.code in ROBOT_KEY_MAP ||
      ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(event.code)
    ) {
      event.preventDefault();
      pressedKeys.add(event.code);
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressedKeys.delete(event.code);
  }

  function keyboardSnapshot(): InputSnapshot {
    const forward = pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp");
    const reverse = pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown");
    const left =
      pressedKeys.has("KeyA") ||
      pressedKeys.has("ArrowLeft") ||
      pressedKeys.has("KeyQ");
    const right =
      pressedKeys.has("KeyD") ||
      pressedKeys.has("ArrowRight") ||
      pressedKeys.has("KeyE");
    const selectRobot = Object.entries(ROBOT_KEY_MAP).find(([code]) =>
      pressedKeys.has(code),
    )?.[1];
    const active =
      forward || reverse || left || right || pressedKeys.has("Space") || selectRobot;

    return {
      throttle: Number(forward) - Number(reverse),
      turn: Number(right) - Number(left),
      cameraX: 0,
      cameraY: 0,
      action: pressedKeys.has("Space"),
      selectDelta: 0,
      ...(selectRobot ? { selectRobot } : {}),
      source: active ? "keyboard" : "none",
    };
  }

  return {
    start() {
      if (running) return;
      running = true;
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", clear);
      document.addEventListener("visibilitychange", clear);
      frameHandle = requestFrame(poll);
    },
    stop() {
      if (!running) {
        clear();
        return;
      }
      running = false;
      if (frameHandle !== null) cancelFrame(frameHandle);
      frameHandle = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      clear();
    },
    setTouchState(state) {
      touch = {
        throttle: clampAxis(state.throttle ?? 0),
        turn: clampAxis(state.turn ?? 0),
        action: Boolean(state.action),
      };
    },
    getSnapshot() {
      const keyboard = keyboardSnapshot();
      if (keyboard.source === "keyboard") return keyboard;
      if (touch.throttle !== 0 || touch.turn !== 0 || touch.action) {
        return {
          ...ZERO_CONTROL,
          ...touch,
          source: "touch",
        };
      }
      if (
        gamepad.throttle !== 0 ||
        gamepad.turn !== 0 ||
        gamepad.cameraX !== 0 ||
        gamepad.cameraY !== 0 ||
        gamepad.action ||
        gamepad.selectDelta !== 0
      ) {
        return { ...gamepad, source: "gamepad" };
      }
      return { ...ZERO_CONTROL, source: "none" };
    },
  };
}
