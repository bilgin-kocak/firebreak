import { expect, test } from "@playwright/test";

import {
  approve,
  boot,
  expectNoOverflow,
  finishApprovedExecution,
  invokeNativePlanningJourney,
  screenshot,
  startApprovedExecution,
} from "./helpers";

test("desktop rescue, proposal, and resolved views keep the warehouse dominant", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-desktop.png");

  await invokeNativePlanningJourney(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-proposal-desktop.png");

  await approve(page);
  await startApprovedExecution(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-executing-desktop.png");
  await finishApprovedExecution(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-complete-desktop.png");
});

test("mobile rescue, proposal, and resolved views have no horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expectNoOverflow(page);
  await expect(page.getByRole("group", { name: "Touch robot controls" })).toBeInViewport();
  await screenshot(page, testInfo, "responsive-firebreak-mobile.png");

  await invokeNativePlanningJourney(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-proposal-mobile.png");

  await approve(page);
  await startApprovedExecution(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-executing-mobile.png");
  await finishApprovedExecution(page);
  await expectNoOverflow(page);
  await screenshot(page, testInfo, "responsive-firebreak-complete-mobile.png");
});
