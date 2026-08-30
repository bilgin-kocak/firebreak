import { expect, test } from "@playwright/test";

import { boot, collectRuntimeErrors, startEmergency } from "./helpers";

test("mocked standard gamepad drives, switches robots, moves the camera, and opens mission control", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);
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
