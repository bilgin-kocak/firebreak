import { expect, type Page, type TestInfo } from "@playwright/test";

import { trustedRemediationOperationIds } from "../src/domain/incidentSeed";
import { installModelContextMock } from "../src/test/modelContextMock";

export const STATIC_TOOLS = [
  "inspect_deployments",
  "inspect_incident",
  "list_response_tools",
  "query_telemetry",
  "run_airlock_checks",
  "simulate_remediation",
  "stage_response_tool",
] as const;

export interface ToolResult<T extends Record<string, unknown> = Record<string, unknown>> {
  ok: boolean;
  code: string;
  message: string;
  data?: T;
}

export const executeTool = <T extends Record<string, unknown>>(
  page: Page,
  name: string,
  input: unknown,
): Promise<ToolResult<T>> =>
  page.evaluate(
    async ({ toolName, toolInput }) =>
      (await document.modelContext!.executeTool(toolName, toolInput)) as ToolResult<T>,
    { toolName: name, toolInput: input },
  );

export const toolNames = (page: Page) =>
  page.evaluate(async () =>
    (await document.modelContext!.getTools()).map((tool) => tool.name).sort(),
  );

export const boot = async (page: Page) => {
  await page.addInitScript(installModelContextMock);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Checkout is failing in production" }),
  ).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByText("Native WebMCP")).toHaveCount(1);
};

export const runPromptA = async (
  page: Page,
  afterTelemetry?: () => Promise<void>,
): Promise<string> => {
  expect(await executeTool(page, "inspect_incident", { incidentId: "INC-4821" })).toMatchObject({
    ok: true,
    code: "INCIDENT_INSPECTED",
  });
  expect(
    await executeTool(page, "query_telemetry", { incidentId: "INC-4821", limit: 8 }),
  ).toMatchObject({
    ok: true,
    code: "TELEMETRY_QUERIED",
    data: { quarantinedEvidenceIds: ["log-third-party-injection"] },
  });
  await afterTelemetry?.();
  expect(
    await executeTool(page, "inspect_deployments", { serviceId: "checkout-api" }),
  ).toMatchObject({
    ok: true,
    code: "DEPLOYMENTS_INSPECTED",
  });
  const simulation = await executeTool<{ simulationId: string }>(page, "simulate_remediation", {
    incidentId: "INC-4821",
    serviceId: "checkout-api",
    canaryPercent: 10,
  });
  const simulationId = simulation.data?.simulationId;
  if (!simulationId) throw new Error("Simulation proof was not returned.");
  expect(simulation).toMatchObject({
    ok: true,
    code: "REMEDIATION_SIMULATED",
    data: { predictedErrorRate: 0.6, predictedP95LatencyMs: 420 },
  });
  expect(await executeTool(page, "run_airlock_checks", { simulationId })).toMatchObject({
    ok: true,
    code: "AIRLOCK_CHECKS_COMPLETED",
    data: { checkCount: 9, blockingFailures: 0 },
  });
  expect(
    await executeTool(page, "stage_response_tool", {
      simulationId,
      name: "rollback_checkout_release",
      title: "Rollback checkout release",
      description: "Canary and restore the previous stable checkout release.",
      operationIds: [...trustedRemediationOperationIds],
    }),
  ).toMatchObject({
    ok: true,
    code: "RESPONSE_TOOL_STAGED",
    data: { status: "awaiting_approval", requiresHumanApproval: true },
  });
  expect(await executeTool(page, "list_response_tools", {})).toMatchObject({
    ok: true,
    code: "RESPONSE_TOOLS_LISTED",
  });
  return simulationId;
};

export const approve = async (page: Page) => {
  const dialog = page.getByRole("dialog", { name: "Approve one-use response?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Approve & register once" }).click();
  await expect.poll(() => toolNames(page)).toContain("rollback_checkout_release");
};

export const screenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
};

export const expectNoOverflow = async (page: Page) => {
  const widths = await page.evaluate(() => ({
    rootClient: document.documentElement.clientWidth,
    rootScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.rootScroll).toBeLessThanOrEqual(widths.rootClient);
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient);
};

export const collectRuntimeErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
};
