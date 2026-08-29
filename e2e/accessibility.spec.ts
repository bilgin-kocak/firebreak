import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

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

const compileCanonical = async (page: Page) => {
  const result = await execute<{ data: { viewId: string } }>(
    page,
    "compile_task_view",
    compileInput,
  );
  await expect(page.getByRole("heading", { name: "Renew your parking permit" })).toBeVisible();
  return result.data.viewId;
};

const seriousOrCritical = async (page: Page) => {
  await page.locator("body").evaluate(async (body) => {
    await Promise.all(
      body
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
};

const tabTo = async (page: Page, target: Locator) => {
  for (let attempts = 0; attempts < 80; attempts += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus never reached ${await target.getAttribute("aria-label")}`);
};

test("dense, adaptive, proposal, and submitted states have no serious or critical axe violations", async ({
  page,
}) => {
  await boot(page);
  expect(await seriousOrCritical(page)).toEqual([]);

  const viewId = await compileCanonical(page);
  expect(await seriousOrCritical(page)).toEqual([]);

  await execute(page, "run_journey_checks", { viewId, includeDomChecks: true });
  await execute(page, "stage_workflow_tool", proposalInput(viewId));
  expect(await seriousOrCritical(page)).toEqual([]);

  await page
    .getByRole("dialog", { name: "Review reusable tool" })
    .getByRole("button", { name: "Approve & Register" })
    .click();
  await execute(page, "renew_permit_guided", { durationMonths: 12 });
  await page
    .getByRole("dialog", { name: "Confirm fictional submission" })
    .getByRole("button", { name: "Confirm & Submit" })
    .click();
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
  expect(await seriousOrCritical(page)).toEqual([]);
});

test("large-card adaptive controls meet the 44 by 44 pixel target minimum", async ({ page }) => {
  await boot(page);
  await compileCanonical(page);

  const targets = page.locator(
    "#adaptive-workspace button:not([disabled]), #adaptive-workspace input:not([disabled]):not([type='radio']):not([type='checkbox']), #adaptive-workspace select:not([disabled]), #adaptive-workspace textarea:not([disabled]), #adaptive-workspace label.large-card-control",
  );
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
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.filter(({ width, height }) => width < 44 || height < 44)).toEqual([]);
});

test("the primary human lock, registration, and submission gates are keyboard-only operable", async ({
  page,
}) => {
  await boot(page);
  const viewId = await compileCanonical(page);
  const lockVehicle = page.getByRole("button", { name: "Lock vehicle field" });

  await tabTo(page, lockVehicle);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unlock vehicle field" })).toBeVisible();

  await execute(page, "run_journey_checks", { viewId, includeDomChecks: true });
  await execute(page, "stage_workflow_tool", proposalInput(viewId));
  const approve = page
    .getByRole("dialog", { name: "Review reusable tool" })
    .getByRole("button", { name: "Approve & Register" });
  await expect(approve).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tool-row-renew_permit_guided")).toBeVisible();

  await execute(page, "renew_permit_guided", { durationMonths: 12 });
  const confirm = page
    .getByRole("dialog", { name: "Confirm fictional submission" })
    .getByRole("button", { name: "Confirm & Submit" });
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Submission confirmed" })).toBeVisible();
});
