import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { installModelContextMock } from "../src/test/modelContextMock";

const STATIC_TOOLS = [
  "compile_task_view",
  "inspect_portal",
  "inspect_task_view",
  "list_workflow_tools",
  "patch_task_view",
  "run_journey_checks",
  "stage_workflow_tool",
] as const;

const canonicalCompileInput = {
  serviceId: "parking_permit_renewal",
  title: "Renew your parking permit",
  goal: "Prepare a plain-language parking permit renewal and stop for your approval.",
  preferences: {
    textSize: "xlarge",
    languageStyle: "plain",
    navigationStyle: "one_field_per_step",
    controlStyle: "large_cards",
    showProgress: true,
    preserveBranding: true,
  },
  fieldOrder: [
    "vehicleId",
    "permitDurationMonths",
    "contactEmail",
    "communicationPreference",
    "currentPermitSummary",
  ],
  hiddenOptionalFields: [],
  copyOverrides: [],
  requireHumanConfirmation: true,
} as const;

const canonicalStageInput = (viewId: string) => ({
  viewId,
  name: "renew_permit_guided",
  title: "Guided parking permit renewal",
  description:
    "Prepare a Northstar City parking permit renewal using the resident's current vehicle and contact details. Calculates the fee, saves a draft, and stops for human review without submitting.",
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

interface ToolResult<TData extends Record<string, unknown> = Record<string, unknown>> {
  ok: boolean;
  code: string;
  message: string;
  data?: TData;
}

export const executeModelTool = async <TData extends Record<string, unknown>>(
  page: Page,
  name: string,
  input: unknown,
): Promise<ToolResult<TData>> =>
  page.evaluate(
    async ({ toolName, toolInput }) =>
      (await document.modelContext!.executeTool(toolName, toolInput)) as ToolResult<TData>,
    { toolName: name, toolInput: input },
  );

export const prepareCanonicalProposal = async (page: Page): Promise<string> => {
  const compiled = await executeModelTool<{ viewId: string }>(
    page,
    "compile_task_view",
    canonicalCompileInput,
  );
  expect(compiled).toMatchObject({ ok: true, code: "VIEW_COMPILED" });
  const viewId = compiled.data?.viewId;
  expect(viewId).toEqual(expect.any(String));
  if (!viewId) throw new Error("compile_task_view did not return its viewId");

  const checked = await executeModelTool<{ blockingFailures: number }>(page, "run_journey_checks", {
    viewId,
    includeDomChecks: true,
  });
  expect(checked).toMatchObject({
    ok: true,
    code: "CHECKS_COMPLETED",
    data: { blockingFailures: 0 },
  });
  const staged = await executeModelTool<{ status: string }>(
    page,
    "stage_workflow_tool",
    canonicalStageInput(viewId),
  );
  expect(staged).toMatchObject({
    ok: true,
    code: "WORKFLOW_STAGED",
    data: { status: "awaiting_approval" },
  });
  return viewId;
};

export const installNativeLikeContext = async (page: Page): Promise<void> => {
  await page.addInitScript(installModelContextMock);
};

const screenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
};

const boxesOverlap = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

test("canonical two-prompt journey compiles, approves, invokes, and submits through the human gate", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installNativeLikeContext(page);
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));

  // 1. Load the portal in native-like WebMCP mode.
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
  await expect(page.getByText("Native WebMCP")).toBeVisible();
  await screenshot(page, testInfo, "canonical-dense-desktop.png");

  // 2. The page has exactly the seven static P0 tools.
  await expect
    .poll(async () =>
      page.evaluate(async () =>
        (await document.modelContext!.getTools()).map((tool) => tool.name).sort(),
      ),
    )
    .toEqual([...STATIC_TOOLS]);

  // 3. Inspect the trusted permit capability graph through modelContext.
  const inspected = await executeModelTool<{ service: { id: string } }>(page, "inspect_portal", {
    serviceId: "parking_permit_renewal",
    includeCurrentState: true,
  });
  expect(inspected).toMatchObject({
    ok: true,
    code: "PORTAL_INSPECTED",
    data: { service: { id: "parking_permit_renewal" } },
  });

  // 4–5. Compile the canonical adaptive view and verify its visible xlarge presentation.
  const compiled = await executeModelTool<{ viewId: string }>(
    page,
    "compile_task_view",
    canonicalCompileInput,
  );
  expect(compiled).toMatchObject({ ok: true, code: "VIEW_COMPILED" });
  const viewId = compiled.data?.viewId;
  expect(viewId).toEqual(expect.any(String));
  if (!viewId) throw new Error("compile_task_view did not return its viewId");
  await expect(page.getByRole("heading", { name: "Renew your parking permit" })).toBeVisible();
  await expect(page.getByText("xlarge text")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.className))
    .toContain("text-size-xlarge");
  await expect(
    page.getByText("Last tool duration", { exact: true }).locator("..").locator("strong"),
  ).toHaveText(/^\d+(?:\.\d)? ms$/);
  await screenshot(page, testInfo, "canonical-adaptive-desktop.png");

  // 6. Lock the vehicle field through the visible human UI.
  const vehicleStep = page.locator('[data-field-id="vehicleId"]');
  await vehicleStep.getByRole("button", { name: "Lock vehicle field" }).click();
  await expect(vehicleStep.getByRole("button", { name: "Unlock vehicle field" })).toBeVisible();
  await expect(vehicleStep.getByText("Locked by you.")).toBeVisible();

  // 7. A safe patch changes another target and preserves the human lock.
  const patched = await executeModelTool<{ lockedElementIds: string[] }>(page, "patch_task_view", {
    viewId,
    patches: [{ type: "set_title", title: "Renew your permit with guided review" }],
  });
  expect(patched).toMatchObject({
    ok: true,
    code: "VIEW_PATCHED",
    data: { lockedElementIds: ["field:vehicleId"] },
  });
  const viewAfterPatch = await executeModelTool<{ lockedElementIds: string[] }>(
    page,
    "inspect_task_view",
    { viewId },
  );
  expect(viewAfterPatch.data?.lockedElementIds).toContain("field:vehicleId");
  await expect(vehicleStep.getByRole("button", { name: "Unlock vehicle field" })).toBeVisible();

  // 8. Deterministic checks have no blocking failures.
  const checked = await executeModelTool<{ blockingFailures: number; failedCheckIds: string[] }>(
    page,
    "run_journey_checks",
    { viewId, includeDomChecks: true },
  );
  expect(checked).toMatchObject({
    ok: true,
    code: "CHECKS_COMPLETED",
    data: { blockingFailures: 0, failedCheckIds: [] },
  });

  await page.evaluate(() => {
    document.documentElement.dataset.toolchangeCount = "0";
    document.modelContext!.addEventListener("toolchange", () => {
      const current = Number(document.documentElement.dataset.toolchangeCount ?? "0");
      document.documentElement.dataset.toolchangeCount = String(current + 1);
    });
  });

  // 9–10. Staging opens human review and cannot itself register the proposed tool.
  const staged = await executeModelTool<{ status: string; requiresHumanApproval: boolean }>(
    page,
    "stage_workflow_tool",
    canonicalStageInput(viewId),
  );
  expect(staged).toMatchObject({
    ok: true,
    code: "WORKFLOW_STAGED",
    data: { status: "awaiting_approval", requiresHumanApproval: true },
  });
  const proposal = page.getByRole("dialog", { name: "Review reusable tool" });
  await expect(proposal).toBeVisible();
  await expect(proposal.getByText("Stops at review")).toBeVisible();
  await expect(proposal.getByText("Cannot submit", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (await document.modelContext!.getTools()).map((tool) => tool.name),
    ),
  ).not.toContain("renew_permit_guided");
  await screenshot(page, testInfo, "canonical-proposal-desktop.png");

  // 11–12. Human approval registers the live row and produces a separately observed toolchange.
  await proposal.getByRole("button", { name: "Approve & Register" }).click();
  await expect(proposal).toBeHidden();
  await expect
    .poll(async () =>
      page.evaluate(async () => (await document.modelContext!.getTools()).map((tool) => tool.name)),
    )
    .toContain("renew_permit_guided");
  await expect(page.getByTestId("tool-row-renew_permit_guided")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Number(document.documentElement.dataset.toolchangeCount ?? "0")),
    )
    .toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText("WebMCP tool surface changed")).toBeVisible();

  // 13–15. The new tool stages the exact 12-month, $60 draft and does not submit it.
  const dynamicResult = await executeModelTool<{
    status: string;
    submitted: boolean;
    durationMonths: number;
    fee: number;
    currency: string;
  }>(page, "renew_permit_guided", { durationMonths: 12 });
  expect(dynamicResult).toMatchObject({
    ok: true,
    code: "DRAFT_STAGED",
    data: {
      status: "awaiting_user_confirmation",
      submitted: false,
      durationMonths: 12,
      fee: 60,
      currency: "USD",
    },
  });
  const confirmationDialog = page.getByRole("dialog", {
    name: "Confirm fictional submission",
  });
  await expect(confirmationDialog).toBeVisible();
  await expect(confirmationDialog.getByText("12 months")).toBeVisible();
  await expect(confirmationDialog.getByText("$60")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toHaveCount(0);

  // 16–17. Only the visible human control submits and shows the exact confirmation.
  await confirmationDialog.getByRole("button", { name: "Confirm & Submit" }).click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
  await expect(page.getByText("NST-PP-2026-08421")).toBeVisible();
  await expect(
    page.getByText("Your fictional Northstar City permit renewal was submitted."),
  ).toBeVisible();
  const successToast = page.locator(".toast");
  const desktopRailPanel = page.locator('.right-rail [role="tabpanel"]');
  await expect(successToast).toBeVisible();
  await expect(page.locator(".toast-region")).toHaveAttribute("aria-live", "polite");
  const successToastBox = await successToast.boundingBox();
  const desktopRailPanelBox = await desktopRailPanel.boundingBox();
  expect(successToastBox).not.toBeNull();
  expect(desktopRailPanelBox).not.toBeNull();
  expect(boxesOverlap(successToastBox!, desktopRailPanelBox!)).toBe(false);
  await screenshot(page, testInfo, "canonical-submitted-desktop.png");

  const dismissNotification = page.getByRole("button", { name: "Dismiss notification" });
  await expect(dismissNotification).toBeVisible();
  await dismissNotification.press("Enter");
  await expect(successToast).toBeHidden();

  expect(runtimeErrors).toEqual([]);
});
