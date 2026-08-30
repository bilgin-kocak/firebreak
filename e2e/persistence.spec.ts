import { expect, test } from "@playwright/test";

import { approve, boot, executeTool, runPromptA, STATIC_TOOLS, toolNames } from "./helpers";

const prepareApproved = async (page: Parameters<typeof boot>[0]) => {
  await runPromptA(page);
  await approve(page);
};

test("reload revalidates and restores an enabled, unexpired one-use tool", async ({ page }) => {
  await boot(page);
  await prepareApproved(page);
  await page.reload();
  await expect.poll(() => toolNames(page)).toContain("rollback_checkout_release");
  await expect(page.getByRole("button", { name: "Invoke approved response" })).toBeVisible();
});

test("completed and expired response tools never restore", async ({ page }) => {
  await boot(page);
  await prepareApproved(page);
  await executeTool(page, "rollback_checkout_release", { canaryPercent: 10 });
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await page.reload();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByRole("heading", { name: "Checkout path restored" })).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await runPromptA(page);
  await approve(page);
  await page.evaluate(() => {
    const raw = localStorage.getItem("airlock.responses.v1");
    if (!raw) throw new Error("response envelope missing");
    const envelope = JSON.parse(raw) as {
      data: { approvedResponseTools: Record<string, { policy: { expiresAt: string } }> };
    };
    envelope.data.approvedResponseTools.rollback_checkout_release!.policy.expiresAt =
      "2020-01-01T00:00:00.000Z";
    localStorage.setItem("airlock.responses.v1", JSON.stringify(envelope));
  });
  await page.reload();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
});

test("human disable and delete unregister through AbortController", async ({ page }) => {
  await boot(page);
  await prepareApproved(page);
  await page.getByRole("button", { name: "Disable" }).click();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);

  await page.getByRole("button", { name: "Reset" }).click();
  await runPromptA(page);
  await approve(page);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
});

test("reset removes only documented Airlock keys and all dynamic authority", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.setItem("outside-airlock", "keep"));
  await prepareApproved(page);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  expect(
    await page.evaluate(() => ({
      incident: localStorage.getItem("airlock.incident.v1"),
      responses: localStorage.getItem("airlock.responses.v1"),
      ui: localStorage.getItem("airlock.ui.v1"),
      outside: localStorage.getItem("outside-airlock"),
    })),
  ).toEqual({ incident: null, responses: null, ui: null, outside: "keep" });
});

test("native-like context forwards execution cancellation and abort unregistration", async ({
  page,
}) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const registration = new AbortController();
    await document.modelContext!.registerTool(
      {
        name: "cancellation_probe",
        description: "Test-only cancellation probe.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (_input, context) =>
          new Promise<{ cancelled: boolean }>((resolve) => {
            context?.signal?.addEventListener(
              "abort",
              () => resolve({ cancelled: context.signal?.aborted === true }),
              { once: true },
            );
          }),
      },
      { signal: registration.signal },
    );
    const execution = new AbortController();
    const pending = document.modelContext!.executeTool(
      "cancellation_probe",
      {},
      { signal: execution.signal },
    );
    execution.abort();
    const executionResult = await pending;
    registration.abort();
    return {
      executionResult,
      remaining: (await document.modelContext!.getTools()).map((tool) => tool.name),
    };
  });
  expect(result.executionResult).toEqual({ cancelled: true });
  expect(result.remaining).not.toContain("cancellation_probe");
});
