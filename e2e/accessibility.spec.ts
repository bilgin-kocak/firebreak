import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { approve, boot, executeApproved, runPromptA } from "./helpers";

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
  await runPromptA(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await approve(page);
  expect(await seriousOrCritical(page)).toEqual([]);
  await executeApproved(page);
  expect(await seriousOrCritical(page)).toEqual([]);
});

test("every visible interactive target is at least 44 by 44 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
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

test("authorization and execution are fully keyboard operable", async ({ page }) => {
  await boot(page);
  await runPromptA(page);
  const authorize = page.getByRole("button", { name: "Authorize one mission" });
  await expect(authorize).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Execute approved rescue" })).toBeVisible();

  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("Tab");
    if (await page.getByRole("button", { name: "Execute approved rescue" }).evaluate(
      (element) => element === document.activeElement,
    )) break;
  }
  await expect(page.getByRole("button", { name: "Execute approved rescue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible({
    timeout: 20_000,
  });
});
