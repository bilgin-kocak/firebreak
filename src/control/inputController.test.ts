import { afterEach, describe, expect, it } from "vitest";

import {
  applyDeadZone,
  createInputController,
  normalizeGamepad,
  type GamepadLike,
} from "./inputController";

function button(pressed = false, value = pressed ? 1 : 0) {
  return { pressed, value };
}

function gamepad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    id: "Standard Gamepad",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => button()),
    ...overrides,
  };
}

describe("manual input normalization", () => {
  afterEach(() => {
    window.dispatchEvent(new Event("blur"));
  });

  it("applies a stable dead zone and standard gamepad mapping", () => {
    expect(applyDeadZone(0.08, 0.15)).toBe(0);
    expect(applyDeadZone(-0.12, 0.15)).toBe(0);
    expect(applyDeadZone(0.75, 0.15)).toBe(0.75);

    const buttons = Array.from({ length: 16 }, () => button());
    buttons[0] = button(true);
    buttons[5] = button(true);
    const control = normalizeGamepad(
      gamepad({ axes: [-0.5, -0.75, 0.25, -0.2], buttons }),
    );

    expect(control).toEqual({
      throttle: 0.75,
      turn: -0.5,
      cameraX: 0.25,
      cameraY: 0.2,
      action: true,
      selectDelta: 1,
    });
  });

  it("rejects non-standard or disconnected gamepads", () => {
    expect(normalizeGamepad(gamepad({ mapping: "" }))).toEqual({
      throttle: 0,
      turn: 0,
      cameraX: 0,
      cameraY: 0,
      action: false,
      selectDelta: 0,
    });
    expect(normalizeGamepad(gamepad({ connected: false }))).toEqual({
      throttle: 0,
      turn: 0,
      cameraX: 0,
      cameraY: 0,
      action: false,
      selectDelta: 0,
    });
  });

  it("maps keyboard controls and clears them on blur", () => {
    const controller = createInputController();
    controller.start();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3" }));

    expect(controller.getSnapshot()).toMatchObject({
      throttle: 1,
      turn: -1,
      action: true,
      selectRobot: "SUPPRESS-3",
      source: "keyboard",
    });

    window.dispatchEvent(new Event("blur"));

    expect(controller.getSnapshot()).toMatchObject({
      throttle: 0,
      turn: 0,
      action: false,
      source: "none",
    });
    controller.stop();
  });

  it("merges touch input and stops cleanly", () => {
    const controller = createInputController();
    controller.start();
    controller.setTouchState({ throttle: -0.6, turn: 0.4, action: true });

    expect(controller.getSnapshot()).toMatchObject({
      throttle: -0.6,
      turn: 0.4,
      action: true,
      source: "touch",
    });

    controller.stop();

    expect(controller.getSnapshot()).toMatchObject({
      throttle: 0,
      turn: 0,
      action: false,
      source: "none",
    });
  });
});
