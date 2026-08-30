import { expect, test } from "@playwright/test";

import {
  approve,
  boot,
  collectRuntimeErrors,
  executeApproved,
  executeTool,
  runPromptA,
  screenshot,
  STATIC_TOOLS,
  startEmergency,
  toolNames,
} from "./helpers";

test("canonical two-prompt rescue plans, authorizes, moves the fleet, and unregisters", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const runtimeErrors = collectRuntimeErrors(page);
  await boot(page);
  await screenshot(page, testInfo, "firebreak-01-initial-desktop.png");

  await startEmergency(page);
  const before = await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem("firebreak.world.v1")!);
    return envelope.data.robots["SCOUT-1"].position;
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(260);
  await page.keyboard.up("w");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const envelope = JSON.parse(localStorage.getItem("firebreak.world.v1")!);
        return envelope.data.robots["SCOUT-1"].position;
      }),
    )
    .not.toEqual(before);

  await page.evaluate(() => {
    document.documentElement.dataset.toolchangeCount = "0";
    document.modelContext!.addEventListener("toolchange", () => {
      const count = Number(document.documentElement.dataset.toolchangeCount ?? "0");
      document.documentElement.dataset.toolchangeCount = String(count + 1);
    });
  });
  await runPromptA(page);
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByText("11/11")).toBeVisible();
  await screenshot(page, testInfo, "firebreak-02-routes-and-proposal.png");

  await approve(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.toolchangeCount))
    .toBe("1");
  await expect(page.getByText("8 tools live")).toBeVisible();
  await expect(page.getByText("ONE-USE AUTHORITY LIVE")).toBeVisible();
  await screenshot(page, testInfo, "firebreak-03-authority-live.png");

  await executeApproved(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.toolchangeCount))
    .toBe("2");
  await expect(page.getByText("2 workers safe")).toBeVisible();
  await expect(page.getByText("0 violations")).toBeVisible();
  await expect(page.getByText("One-use tool consumed and unregistered.")).toBeVisible();
  await expect(page.getByText("7 tools live")).toBeVisible();
  await screenshot(page, testInfo, "firebreak-04-mission-complete.png");

  await expect(
    executeTool(page, "execute_rescue_mission", { strategy: "coordinated" }),
  ).rejects.toThrow(/not registered/i);
  expect(runtimeErrors).toEqual([]);
});
