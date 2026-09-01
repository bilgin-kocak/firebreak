import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  approve,
  boot,
  executeApproved,
  finishApprovedExecution,
  invokeNativePlanningJourney,
  startApprovedExecution,
} from "./helpers";

const seriousOrCritical = async (page: Parameters<typeof boot>[0]) => {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
};

test("ready, proposal, authority, and resolved states have no serious axe findings", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await invokeNativePlanningJourney(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await approve(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await startApprovedExecution(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await finishApprovedExecution(page);
  expect(await seriousOrCritical(page)).toEqual([]);
});

test("every visible interactive target is at least 44 by 44 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.getByRole("button", { name: /^Start emergency/ }).click();
  const controls = page.locator(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary",
  );
  const undersized = await controls.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent?.trim(),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(undersized).toEqual([]);
});

test("human authorization is keyboard operable and agent execution stays external", async ({
  page,
}) => {
  await boot(page);
  await invokeNativePlanningJourney(page);
  const authorize = page.getByRole("button", { name: "Authorize one mission" });
  await expect(authorize).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/send prompt 2 in codex or chatgpt/i)).toBeVisible();
  await executeApproved(page);
});
