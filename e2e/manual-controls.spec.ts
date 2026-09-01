import { expect, type Page, test } from "@playwright/test";

import {
  approve,
  boot,
  collectRuntimeErrors,
  invokeNativePlanningJourney,
  startApprovedExecution,
  startEmergency,
  STATIC_TOOLS,
  toolNames,
} from "./helpers";

const installGamepad = async (page: Page) => {
  await page.addInitScript(() => {
    const state = {
      id: "Firebreak Test Controller",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [state],
    });
    (
      window as unknown as {
        setFirebreakGamepad(axes: number[], pressedButtons?: number[]): void;
      }
    ).setFirebreakGamepad = (axes, pressedButtons = []) => {
      state.axes = [...axes];
      state.buttons = Array.from({ length: 16 }, (_, index) => ({
        pressed: pressedButtons.includes(index),
        value: pressedButtons.includes(index) ? 1 : 0,
      }));
    };
  });
};

test("mocked standard gamepad drives, switches robots, moves the camera, and opens mission control", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await installGamepad(page);
  await boot(page);
  await startEmergency(page);

  const before = await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem("firebreak.world.v1")!);
    return envelope.data.robots["SCOUT-1"].position;
  });
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, -1, 0, 0]),
  );
  await page.waitForTimeout(320);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0]),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const envelope = JSON.parse(localStorage.getItem("firebreak.world.v1")!);
        return envelope.data.robots["SCOUT-1"].position;
      }),
    )
    .not.toEqual(before);

  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0], [5]),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0]),
  );
  await expect(page.getByRole("button", { name: /MEDIC-2/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0.8, -0.5]),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0]),
  );
  await expect(page.getByRole("button", { name: "free" })).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0], [9]),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0]),
  );
  await expect(page.getByLabel("Agent mission console")).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("cinematic execution locks hidden controls and emergency stop revokes authority", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await installGamepad(page);
  await boot(page);
  await invokeNativePlanningJourney(page);
  await approve(page);
  await startApprovedExecution(page);

  const before = await page.evaluate(() => ({
    world: JSON.parse(localStorage.getItem("firebreak.world.v1")!).data,
    ui: JSON.parse(localStorage.getItem("firebreak.ui.v1")!).data,
  }));
  await page.keyboard.down("4");
  await page.waitForTimeout(120);
  await page.keyboard.up("4");
  const afterKeyboard = await page.evaluate(
    () => JSON.parse(localStorage.getItem("firebreak.world.v1")!).data.selectedRobotId,
  );
  expect(afterKeyboard).toBe(before.world.selectedRobotId);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0.8, -0.5], [5, 9]),
  );
  await page.waitForTimeout(180);
  await page.evaluate(() =>
    (
      window as unknown as { setFirebreakGamepad(axes: number[], buttons?: number[]): void }
    ).setFirebreakGamepad([0, 0, 0, 0]),
  );

  const after = await page.evaluate(() => ({
    world: JSON.parse(localStorage.getItem("firebreak.world.v1")!).data,
    ui: JSON.parse(localStorage.getItem("firebreak.ui.v1")!).data,
  }));
  expect(after.world.selectedRobotId).toBe(before.world.selectedRobotId);
  expect(after.ui.cameraMode).toBe(before.ui.cameraMode);
  expect(after.ui.missionControlOpen).toBe(before.ui.missionControlOpen);

  await page.getByRole("button", { name: /emergency stop/i }).click();
  const result = await page.evaluate(async () => {
    const running = (
      window as Window & {
        __firebreakMissionExecution?: Promise<unknown>;
      }
    ).__firebreakMissionExecution;
    if (!running) throw new Error("Mission execution was not started.");
    return running;
  });
  expect(result).toMatchObject({ ok: false, code: "EXECUTION_CANCELLED" });
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);

  const cancelled = await page.evaluate(() => ({
    world: JSON.parse(localStorage.getItem("firebreak.world.v1")!).data,
    mission: JSON.parse(localStorage.getItem("firebreak.missions.v1")!).data,
  }));
  expect(cancelled.world.phase).toBe("active");
  const cancelledRobots = cancelled.world.robots as Record<string, { status: string }>;
  expect(Object.values(cancelledRobots).every((robot) => robot.status === "idle")).toBe(true);
  expect(cancelled.mission.receipt).toMatchObject({ outcome: "cancelled" });
  expect(runtimeErrors).toEqual([]);
});
