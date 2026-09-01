import { expect, test } from "@playwright/test";

import { approve, boot, executeTool, invokeNativePlanningJourney, startEmergency } from "./helpers";

test("fresh-chat handoffs do not consume the 90-second mission clock", async ({ page }) => {
  await boot(page);

  const preflight = page.getByLabel("Fresh chat WebMCP prompt");
  await expect(preflight).toContainText("Use only the current Firebreak tab’s WebMCP site tools");
  await expect(preflight).toContainText("Do not search the web or GitHub");
  await expect(page.getByRole("button", { name: "Copy fresh-chat prompt" })).toBeVisible();

  const premature = await executeTool(page, "inspect_emergency", { incidentId: "WH-01" });
  expect(premature).toMatchObject({ ok: false, code: "EMERGENCY_NOT_ACTIVE" });

  await startEmergency(page);
  await expect(page.getByText("TIMER PAUSED", { exact: true })).toBeVisible();
  await expect(page.getByText("01:30", { exact: true })).toBeVisible();
  await page.waitForTimeout(1_250);
  await expect(page.getByText("01:30", { exact: true })).toBeVisible();

  await executeTool(page, "inspect_emergency", { incidentId: "WH-01" });
  await expect.poll(async () => page.getByText(/^01:2\d$/).count()).toBe(1);

  await invokeNativePlanningJourney(page);
  await expect(page.getByText(/timer paused while the human reviews/i)).toBeVisible();
  const reviewTime = await page.locator(".mission-clock strong").textContent();
  await page.waitForTimeout(1_250);
  await expect(page.locator(".mission-clock strong")).toHaveText(reviewTime ?? "");

  await approve(page);
  await expect(page.getByText(/timer paused.*waiting for approved invocation/i)).toBeVisible();
  const authorizationTime = await page.locator(".mission-clock strong").textContent();
  await page.waitForTimeout(1_250);
  await expect(page.locator(".mission-clock strong")).toHaveText(authorizationTime ?? "");
});
