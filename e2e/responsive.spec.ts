import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { installModelContextMock } from "../src/test/modelContextMock";

const compileInput = {
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

const boot = async (page: Page) => {
  await page.addInitScript(installModelContextMock);
  await page.goto("/");
  await expect(page.getByText("7 registered tools")).toBeVisible();
};

const noHorizontalOverflow = async (page: Page) =>
  page.evaluate(() => ({
    rootClientWidth: document.documentElement.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

const expectNoHorizontalOverflow = async (page: Page) => {
  const widths = await noHorizontalOverflow(page);
  expect(widths.rootScrollWidth).toBeLessThanOrEqual(widths.rootClientWidth);
  expect(widths.bodyScrollWidth).toBeLessThanOrEqual(widths.bodyClientWidth);
};

const screenshot = (page: Page, testInfo: TestInfo, name: string) =>
  page.screenshot({ path: testInfo.outputPath(name), fullPage: true });

const boxesOverlap = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

test("desktop 1440 by 1000 dense, adaptive, and proposal states do not overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await boot(page);
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "responsive-dense-desktop.png");

  const compiled = await execute<{ data: { viewId: string } }>(
    page,
    "compile_task_view",
    compileInput,
  );
  await expect(page.getByRole("heading", { name: "Renew your parking permit" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await execute(page, "run_journey_checks", {
    viewId: compiled.data.viewId,
    includeDomChecks: true,
  });
  await execute(page, "stage_workflow_tool", proposalInput(compiled.data.viewId));
  await expect(page.getByRole("dialog", { name: "Review reusable tool" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "responsive-proposal-desktop.png");
});

test("mobile 390 by 844 keeps every canonical state in bounds and captures the journey", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "responsive-dense-mobile.png");

  const compiled = await execute<{ data: { viewId: string } }>(
    page,
    "compile_task_view",
    compileInput,
  );
  await expect(page.getByRole("heading", { name: "Renew your parking permit" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "responsive-adaptive-mobile.png");

  await execute(page, "run_journey_checks", {
    viewId: compiled.data.viewId,
    includeDomChecks: true,
  });
  await execute(page, "stage_workflow_tool", proposalInput(compiled.data.viewId));
  const proposal = page.getByRole("dialog", { name: "Review reusable tool" });
  await expect(proposal).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await screenshot(page, testInfo, "responsive-proposal-mobile.png");

  await proposal.getByRole("button", { name: "Approve & Register" }).click();
  await execute(page, "renew_permit_guided", { durationMonths: 12 });
  const confirmation = page.getByRole("dialog", { name: "Confirm fictional submission" });
  await expect(confirmation).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await confirmation.getByRole("button", { name: "Confirm & Submit" }).click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const successToast = page.locator(".toast");
  const submittedNote = page.locator(".submitted-readonly-note");
  await expect(successToast).toBeVisible();
  const successToastBox = await successToast.boundingBox();
  const submittedNoteBox = await submittedNote.boundingBox();
  expect(successToastBox).not.toBeNull();
  expect(submittedNoteBox).not.toBeNull();
  expect(boxesOverlap(successToastBox!, submittedNoteBox!)).toBe(false);
  await screenshot(page, testInfo, "responsive-submitted-mobile.png");
});
