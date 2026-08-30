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
    async ({ toolName, toolInput }) =>
      (await document.modelContext!.executeTool(toolName, toolInput)) as ToolResult<T>,
    { toolName: name, toolInput: input },
  );

export const toolNames = (page: Page) =>
  page.evaluate(async () => (await document.modelContext!.getTools()).map((tool) => tool.name));

export const boot = async (page: Page) => {
  await page.addInitScript(installModelContextMock);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /rescue two workers/i })).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS]);
  await expect(page.getByText("WEBMCP NATIVE")).toHaveCount(1);
  await expect(
    page.getByRole("img", { name: /interactive warehouse rescue scene/i }),
  ).toBeVisible();
};

export const startEmergency = async (page: Page) => {
  const start = page.getByRole("button", { name: "Start emergency" });
  if (await start.isVisible()) await start.click();
  await expect(page.getByRole("button", { name: /ask agent to plan rescue/i })).toBeVisible();
};

export const runPromptA = async (page: Page) => {
  await startEmergency(page);
  await page.getByRole("button", { name: /ask agent to plan rescue/i }).click();
  await expect(page.getByRole("dialog", { name: "Authorize rescue mission" })).toBeVisible();
  await expect(page.getByText("routes compiled")).toBeVisible();
};

export const approve = async (page: Page) => {
  const dialog = page.getByRole("dialog", { name: "Authorize rescue mission" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Authorize one mission" }).click();
  await expect.poll(() => toolNames(page)).toEqual([...STATIC_TOOLS, "execute_rescue_mission"]);
  await expect(page.getByRole("button", { name: "Execute approved rescue" })).toBeVisible();
};

export const executeApproved = async (page: Page) => {
  await page.getByRole("button", { name: "Execute approved rescue" }).click();
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
