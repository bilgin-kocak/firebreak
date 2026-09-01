import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { collectRuntimeErrors, expectNoOverflow } from "./helpers";

const seriousOrCritical = async (page: Parameters<typeof collectRuntimeErrors>[0]) => {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
};

test("ordinary browsers disclose and complete the no-agent replay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto("/");

  await expect(page).toHaveTitle("Firebreak: WebMCP Emergency Robot Commander");
  await expect(page.getByText("7 tools live", { exact: true })).toBeVisible();
  await expect(page.locator("canvas[data-scene-ready='true']")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Start emergency" }).click();

  const console = page.getByLabel("Agent mission console");
  await expect(console.getByText("REPLAY WALKTHROUGH · NO AGENT")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay planning walkthrough" })).toBeVisible();
  await expectNoOverflow(page);
  expect(await seriousOrCritical(page)).toEqual([]);

  await page.getByRole("button", { name: "Replay planning walkthrough" }).click();
  const dialog = page.getByRole("dialog", { name: "Authorize rescue mission" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Authorize one mission" }).click();

  await expect(page.getByText("8 tools live", { exact: true })).toBeVisible();
  await expect(console.getByText("REPLAY WALKTHROUGH · NO AGENT")).toBeVisible();
  await page.getByRole("button", { name: "Replay execution walkthrough" }).click();

  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("7 tools live", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
