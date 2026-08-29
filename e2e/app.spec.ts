import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("initial portal has no serious accessibility violations, including contrast", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("large-card adaptive controls all meet the 44 pixel target minimum", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
  await page.getByRole("button", { name: "How to test" }).click();
  const simulator = page.getByRole("dialog", { name: "WebMCP Simulator" });
  await simulator.getByRole("button", { name: /compile low-vision view/i }).click();
  await expect(page.getByRole("heading", { name: "Renew your parking permit" })).toBeVisible();
  await simulator.getByRole("button", { name: /close simulator/i }).click();

  const targets = page.locator(
    "#adaptive-workspace button:not([disabled]), #adaptive-workspace input:not([disabled]):not([type='radio']):not([type='checkbox']), #adaptive-workspace select:not([disabled]), #adaptive-workspace textarea:not([disabled]), #adaptive-workspace label.large-card-control",
  );
  await expect(targets).toHaveCount(5);
  const sizes = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const { width, height } = element.getBoundingClientRect();
      return {
        label: element.getAttribute("aria-label") ?? element.textContent?.trim(),
        width,
        height,
      };
    }),
  );
  expect(sizes.filter(({ width, height }) => width < 44 || height < 44)).toEqual([]);
});

test("mobile adaptive and proposal surfaces have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
  await page.getByRole("button", { name: "How to test" }).click();
  const simulator = page.getByRole("dialog", { name: "WebMCP Simulator" });
  await simulator.getByRole("button", { name: /compile low-vision view/i }).click();
  await expect(simulator.getByText(/VIEW_COMPILED/)).toBeVisible();
  await simulator.getByRole("button", { name: /run checks/i }).click();
  await expect(simulator.getByText(/CHECKS_COMPLETED/)).toBeVisible();
  await simulator.getByRole("button", { name: /stage guided tool/i }).click();
  await expect(page.getByRole("dialog", { name: /review reusable tool/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
