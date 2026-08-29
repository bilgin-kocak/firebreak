import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { installModelContextMock } from "../src/test/modelContextMock";

const compileInput = {
  serviceId: "parking_permit_renewal",
  title: "Renew your parking permit",
  goal: "Prepare a renewal and stop for human review.",
  preferences: {
    textSize: "xlarge",
    languageStyle: "plain",
    navigationStyle: "one_field_per_step",
    controlStyle: "large_cards",
    showProgress: true,
    preserveBranding: true,
  },
  fieldOrder: ["vehicleId", "permitDurationMonths", "contactEmail", "currentPermitSummary"],
  hiddenOptionalFields: ["communicationPreference"],
  copyOverrides: [],
  requireHumanConfirmation: true,
};

const proposalInput = (viewId: string) => ({
  viewId,
  name: "renew_permit_guided",
  title: "Guided parking permit renewal",
  description: "Prepare a Northstar City parking permit renewal and stop for human review.",
  parameters: [
    {
      name: "durationMonths",
      fieldId: "permitDurationMonths",
      description: "Choose a 6- or 12-month parking permit.",
      required: true,
    },
  ],
  operations: [
    { operationId: "permit.load_current", bindings: [] },
    {
      operationId: "permit.set_vehicle",
      bindings: [{ argument: "vehicleId", source: "portal_state", key: "currentVehicleId" }],
    },
    {
      operationId: "permit.set_duration",
      bindings: [{ argument: "months", source: "tool_input", key: "durationMonths" }],
    },
    {
      operationId: "permit.set_contact",
      bindings: [{ argument: "email", source: "portal_state", key: "contactEmail" }],
    },
    { operationId: "permit.calculate_fee", bindings: [] },
    { operationId: "permit.save_draft", bindings: [] },
    { operationId: "permit.stage_review", bindings: [] },
  ],
  stopAt: "review",
});

const execute = <T>(page: Page, name: string, input: unknown): Promise<T> =>
  page.evaluate(
    async ({ toolName, toolInput }) =>
      (await document.modelContext!.executeTool(toolName, toolInput)) as T,
    { toolName: name, toolInput: input },
  );

const toolNames = (page: Page) =>
  page.evaluate(async () => (await document.modelContext!.getTools()).map((tool) => tool.name));

const boot = async (page: Page) => {
  await page.addInitScript(installModelContextMock);
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
};

const seriousOrCritical = async (page: Page) => {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
};

const approveCanonicalTool = async (page: Page) => {
  const compiled = await execute<{ ok: true; data: { viewId: string } }>(
    page,
    "compile_task_view",
    compileInput,
  );
  const viewId = compiled.data.viewId;
  await execute(page, "run_journey_checks", { viewId, includeDomChecks: true });
  await execute(page, "stage_workflow_tool", proposalInput(viewId));
  await page
    .getByRole("dialog", { name: "Review reusable tool" })
    .getByRole("button", { name: "Approve & Register" })
    .click();
  await expect.poll(() => toolNames(page)).toContain("renew_permit_guided");
};

test("reload revalidates and re-registers an enabled human-approved workflow", async ({ page }) => {
  await boot(page);
  await approveCanonicalTool(page);

  await page.reload();

  await expect(page.getByText("Native WebMCP")).toBeVisible();
  await expect.poll(() => toolNames(page)).toContain("renew_permit_guided");
  await expect(page.getByText("8 registered tools")).toBeVisible();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("Saved approval; registered for this tab.")).toBeVisible();
});

test("a staged adaptive draft reopens the same human review before and after reload", async ({
  page,
}, testInfo) => {
  await boot(page);
  const compiled = await execute<{ ok: true; data: { viewId: string } }>(
    page,
    "compile_task_view",
    compileInput,
  );
  await execute(page, "run_journey_checks", {
    viewId: compiled.data.viewId,
    includeDomChecks: true,
  });

  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByLabel("12 months").click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByRole("button", { name: "Review draft" }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm fictional submission" });
  await confirmation.getByRole("button", { name: "Keep as draft" }).click();

  const returnToReview = page.getByRole("button", { name: "Return to review" });
  await expect(page.getByRole("heading", { name: "Staged for human review" })).toBeVisible();
  await expect(page.getByText(/remains unsubmitted/i)).toBeVisible();
  await expect(returnToReview).toBeFocused();
  expect(await seriousOrCritical(page)).toEqual([]);
  const persistedBeforeReopen = await page.evaluate(() => ({
    session: localStorage.getItem("civicweave:v1:session"),
    activity: localStorage.getItem("civicweave:v1:activity"),
    views: localStorage.getItem("civicweave:v1:views"),
  }));

  await returnToReview.click();
  await expect(confirmation).toBeVisible();
  expect(
    await page.evaluate(() => ({
      session: localStorage.getItem("civicweave:v1:session"),
      activity: localStorage.getItem("civicweave:v1:activity"),
      views: localStorage.getItem("civicweave:v1:views"),
    })),
  ).toEqual(persistedBeforeReopen);
  await confirmation.getByRole("button", { name: "Keep as draft" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("adaptive-staged-desktop.png"),
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Staged for human review" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await seriousOrCritical(page)).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("adaptive-staged-reload-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Return to review" }).click();
  await confirmation.getByRole("button", { name: "Confirm & Submit" }).click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
});

test("Disable unregisters through the registration AbortSignal and keeps saved metadata", async ({
  page,
}) => {
  await boot(page);
  await approveCanonicalTool(page);
  const row = page.getByTestId("tool-row-renew_permit_guided");

  await row.getByRole("button", { name: "Disable" }).click();

  await expect.poll(() => toolNames(page)).not.toContain("renew_permit_guided");
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Disable" })).toHaveCount(0);
});

test("Reset clears views, approvals, persistence, and dynamic registrations", async ({ page }) => {
  await boot(page);
  await approveCanonicalTool(page);

  await page.getByRole("button", { name: "Reset demo" }).click();

  await expect(page.getByRole("heading", { name: "Welcome, Maya Chen" })).toBeVisible();
  await expect.poll(() => toolNames(page)).toHaveLength(7);
  await expect(page.getByTestId("tool-row-renew_permit_guided")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      [
        "civicweave:v1:session",
        "civicweave:v1:views",
        "civicweave:v1:workflow-tools",
        "civicweave:v1:activity",
      ].filter((key) => localStorage.getItem(key) !== null),
    ),
  ).toEqual([]);
});

test("native-like modelContext forwards execution cancellation and unregisters on abort", async ({
  page,
}) => {
  await boot(page);

  const result = await page.evaluate(async () => {
    const registration = new AbortController();
    await document.modelContext!.registerTool(
      {
        name: "cancellation_probe",
        description: "Test-only cancellation probe.",
        inputSchema: { type: "object", additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (_input, context) =>
          new Promise<{ cancelled: boolean }>((resolve) => {
            if (context?.signal?.aborted) {
              resolve({ cancelled: true });
              return;
            }
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
      {
        signal: execution.signal,
      },
    );
    execution.abort();
    const executionResult = await pending;
    registration.abort();
    const remaining = (await document.modelContext!.getTools()).map((tool) => tool.name);
    return { executionResult, remaining };
  });

  expect(result.executionResult).toEqual({ cancelled: true });
  expect(result.remaining).not.toContain("cancellation_probe");
});
