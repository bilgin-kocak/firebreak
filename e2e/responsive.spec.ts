import { expect, test } from "@playwright/test";

import { approve, boot, expectNoOverflow, executeTool, runPromptA, screenshot } from "./helpers";

test("desktop command center and proposal stay in bounds", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await boot(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-airlock-desktop.png");
  await runPromptA(page);
  await expect(page.getByRole("dialog", { name: "Approve one-use response?" })).toBeVisible();
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-airlock-proposal-desktop.png");
});

test("mobile initial, proposal, and recovered states stay in bounds", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expectNoOverflow(page);
  await expect(page.getByRole("button", { name: /simulator/i })).toBeInViewport();
  await screenshot(page, testInfo, "responsive-airlock-mobile.png");

  await runPromptA(page);
  await expect(page.getByRole("dialog", { name: "Approve one-use response?" })).toBeVisible();
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-airlock-proposal-mobile.png");

  await approve(page);
  await executeTool(page, "rollback_checkout_release", { canaryPercent: 10 });
  await expect(page.getByRole("heading", { name: "Checkout recovered" })).toBeVisible();
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-airlock-recovered-mobile.png");
});
