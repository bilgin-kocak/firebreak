import { expect, test } from "@playwright/test";

import {
  approve,
  boot,
  collectRuntimeErrors,
  executeTool,
  runPromptA,
  screenshot,
  STATIC_TOOLS,
  toolNames,
} from "./helpers";

test("canonical two-prompt incident journey quarantines, approves, resolves, and unregisters", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const runtimeErrors = collectRuntimeErrors(page);
  await boot(page);
  await screenshot(page, testInfo, "airlock-01-initial-desktop.png");
  await expect(page.getByText("31.8%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("4,820", { exact: false }).first()).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.dataset.toolchangeCount = "0";
    document.modelContext!.addEventListener("toolchange", () => {
      const current = Number(document.documentElement.dataset.toolchangeCount ?? "0");
      document.documentElement.dataset.toolchangeCount = String(current + 1);
    });
  });

  await runPromptA(page, async () => {
    await expect(page.getByText("UNTRUSTED PATH BLOCKED")).toBeVisible();
    await expect(page.getByText("QUARANTINED")).toBeVisible();
    await screenshot(page, testInfo, "airlock-02-threat-quarantined.png");
  });
  await expect(page.getByRole("dialog", { name: "Approve one-use response?" })).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await screenshot(page, testInfo, "airlock-03-proposal.png");

  await approve(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.toolchangeCount))
    .toBe("1");
  await expect(page.getByRole("button", { name: "Invoke approved response" })).toBeVisible();
  await screenshot(page, testInfo, "airlock-04-tool-live.png");

  const result = await executeTool<{
    receiptId: string;
    finalErrorRate: number;
    finalP95LatencyMs: number;
    productionMutations: number;
  }>(page, "rollback_checkout_release", { canaryPercent: 10 });
  expect(result).toMatchObject({
    ok: true,
    code: "INCIDENT_RESOLVED",
    data: { finalErrorRate: 0.6, finalP95LatencyMs: 420, productionMutations: 1 },
  });
  await expect(page.getByRole("heading", { name: "Checkout path restored" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checkout recovered" })).toBeVisible();
  await expect(page.getByText("Recovery verified across checkout path")).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.toolchangeCount))
    .toBe("2");
  await expect(page.getByText("One-use tool consumed and unregistered.")).toBeVisible();
  await page.getByRole("tab", { name: "activity" }).click();
  await expect(page.getByText("WebMCP tool surface changed").first()).toBeVisible();
  await page.getByRole("tab", { name: "tools" }).click();
  await screenshot(page, testInfo, "airlock-05-resolved.png");

  await expect(
    executeTool(page, "rollback_checkout_release", { canaryPercent: 10 }),
  ).rejects.toThrow(/not registered/i);
  expect(runtimeErrors).toEqual([]);
});
