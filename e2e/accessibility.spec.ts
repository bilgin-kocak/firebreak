import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { boot, executeTool, runPromptA } from "./helpers";

const seriousOrCritical = async (page: Page) => {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
};

const tabTo = async (page: Page, locator: Locator) => {
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press("Tab");
    if (await locator.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("Keyboard focus did not reach the requested control.");
};

test("initial, proposal, live-tool, and recovered states have no serious axe findings", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await runPromptA(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await page.getByRole("button", { name: "Approve & register once" }).click();
  await expect(page.getByRole("button", { name: "Invoke approved response" })).toBeVisible();
  expect(await seriousOrCritical(page)).toEqual([]);
  await executeTool(page, "rollback_checkout_release", { canaryPercent: 10 });
  await expect(page.getByRole("heading", { name: "Checkout recovered" })).toBeVisible();
  expect(await seriousOrCritical(page)).toEqual([]);
});

test("every visible interactive target is at least 44 by 44 pixels", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: /simulator/i }).click();
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
          width: box.width,
          height: box.height,
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(undersized).toEqual([]);
});

test("approval and Prompt B are keyboard operable and dialogs trap focus", async ({ page }) => {
  await boot(page);
  await runPromptA(page);
  const approve = page.getByRole("button", { name: "Approve & register once" });
  await expect(approve).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(approve).toBeFocused();
  await page.keyboard.press("Enter");

  const invoke = page.getByRole("button", { name: "Invoke approved response" });
  await tabTo(page, invoke);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Checkout recovered" })).toBeVisible();
});
