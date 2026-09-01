import { expect, type Page, type TestInfo } from "@playwright/test";

import { installModelContextMock } from "../src/test/modelContextMock";

export const STATIC_TOOLS = [
  "inspect_emergency",
  "scan_hazards",
  "inspect_fleet",
  "simulate_mission",
  "validate_safety_envelope",
  "stage_mission_tool",
  "list_mission_tools",
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
    async ({ toolName, toolInput }) => {
      const modelContext = document.modelContext!;
      const tool = (await modelContext.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Tool '${toolName}' is not registered.`);
      return (await modelContext.executeTool(tool, toolInput)) as ToolResult<T>;
    },
    { toolName: name, toolInput: input },
  );

export const toolNames = (page: Page) =>
  page.evaluate(async () => (await document.modelContext!.getTools()).map((tool) => tool.name));

export const boot = async (page: Page) => {
  await page.addInitScript(installModelContextMock);
  await page.goto("/");
  await expect(page).toHaveTitle("Firebreak: WebMCP Emergency Robot Commander");
  await expect(page.getByRole("heading", { name: /rescue two workers/i })).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByText("WEBMCP NATIVE")).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /interactive warehouse rescue scene/i }),
  ).toBeVisible();
  await expect(page.locator("canvas[data-scene-ready='true']")).toBeVisible({ timeout: 20_000 });
};

export const startEmergency = async (page: Page) => {
  const start = page.getByRole("button", { name: "Start emergency" });
  if (await start.isVisible()) await start.click({ noWaitAfter: true });
  await expect(page.getByText("LIVE AGENT", { exact: true })).toBeVisible();
  await expect(page.getByText(/send prompt 1 in codex or chatgpt/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /replay planning walkthrough/i })).toHaveCount(0);
};

export const invokeNativePlanningJourney = async (page: Page) => {
  await startEmergency(page);
  await executeTool(page, "inspect_emergency", { incidentId: "WH-01" });
  await executeTool(page, "scan_hazards", {
    incidentId: "WH-01",
    sensorMode: "thermal",
  });
  await executeTool(page, "inspect_fleet", { incidentId: "WH-01" });
  const simulation = await executeTool<{ simulationId: string }>(page, "simulate_mission", {
    incidentId: "WH-01",
    strategy: "coordinated",
  });
  const simulationId = String(simulation.data?.simulationId ?? "");
  expect(simulationId).not.toBe("");
  await executeTool(page, "validate_safety_envelope", { simulationId });
  await executeTool(page, "stage_mission_tool", {
    simulationId,
    toolName: "execute_rescue_mission",
  });
  await executeTool(page, "list_mission_tools", { incidentId: "WH-01" });
  await expect(page.getByRole("dialog", { name: "Authorize rescue mission" })).toBeVisible();
  await expect(page.getByText("routes compiled")).toBeVisible();
};

export const approve = async (page: Page) => {
  const dialog = page.getByRole("dialog", { name: "Authorize rescue mission" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Authorize one mission" }).click({ noWaitAfter: true });
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS, "execute_rescue_mission"]);
  await expect(page.getByText(/send prompt 2 in codex or chatgpt/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /replay execution walkthrough/i })).toHaveCount(0);
};

export const executeApproved = async (page: Page) => {
  const result = await executeTool(page, "execute_rescue_mission", { strategy: "coordinated" });
  expect(result.ok).toBe(true);
  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
};

export const screenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
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
