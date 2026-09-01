import { expect, test } from "@playwright/test";

import {
  approve,
  boot,
  executeApproved,
  invokeNativePlanningJourney,
  STATIC_TOOLS,
  toolNames,
} from "./helpers";

test("reload removes dynamic authority and requires a fresh human decision", async ({ page }) => {
  await boot(page);
  await invokeNativePlanningJourney(page);
  await approve(page);
  await page.reload();

  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByRole("button", { name: "Review mission authority" })).toBeVisible();
  await page.getByRole("button", { name: "Review mission authority" }).click();
  await expect(page.getByRole("dialog", { name: "Authorize rescue mission" })).toBeVisible();
});

test("completed rescue receipt persists without restoring consumed authority", async ({ page }) => {
  await boot(page);
  await invokeNativePlanningJourney(page);
  await approve(page);
  await executeApproved(page);
  await page.reload();

  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
  await expect(page.getByText("2 workers safe")).toBeVisible();
});

test("reset revokes authority, restores the seed, and preserves unrelated storage", async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => localStorage.setItem("outside-firebreak", "keep"));
  await invokeNativePlanningJourney(page);
  await approve(page);
  await page.getByRole("button", { name: "Reset warehouse demo" }).click();

  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByRole("button", { name: "Start emergency" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("outside-firebreak"))).toBe("keep");
});
