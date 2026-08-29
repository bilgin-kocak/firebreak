import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppState, resetAppStoreForTests, useAppStore } from "../store/useAppStore";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";

const names = [
  "inspect_portal",
  "compile_task_view",
  "inspect_task_view",
  "patch_task_view",
  "run_journey_checks",
  "stage_workflow_tool",
  "list_workflow_tools",
];

const compileInput = {
  serviceId: "parking_permit_renewal",
  title: "Renew my permit",
  goal: "Prepare a parking permit renewal for review.",
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
  description:
    "Prepare a Northstar City permit renewal and stop for human review without submitting.",
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

const setup = async (dependencies: Parameters<typeof registerStaticTools>[1] = {}) => {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry, {
    now: () => new Date("2026-08-29T10:00:00.000Z"),
    ...dependencies,
  });
  return { adapter, registry };
};

const compileView = async (adapter: ReturnType<typeof createMemoryAdapter>) => {
  const result = (await adapter.executeTool("compile_task_view", compileInput)) as {
    ok: boolean;
    data: { viewId: string };
  };
  expect(result.ok).toBe(true);
  return result.data.viewId;
};

describe("seven static WebMCP tools", () => {
  beforeEach(() => resetAppStoreForTests());

  it("registers exactly the seven stable tools once with exact annotations and narrow schemas", async () => {
    const { adapter, registry } = await setup();
    const tools = await adapter.getTools();

    expect(tools.map((tool) => tool.name)).toEqual(names);
    expect(tools.filter((tool) => tool.annotations.readOnlyHint).map((tool) => tool.name)).toEqual([
      "inspect_portal",
      "inspect_task_view",
      "run_journey_checks",
      "list_workflow_tools",
    ]);
    expect(tools.every((tool) => tool.annotations.untrustedContentHint === false)).toBe(true);
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    await expect(registerStaticTools(registry)).rejects.toMatchObject({
      code: "TOOL_ALREADY_REGISTERED",
    });
    expect(await adapter.getTools()).toHaveLength(7);
  });

  it("rejects unknown properties before inspecting trusted capability IDs", async () => {
    const { adapter } = await setup();

    await expect(
      adapter.executeTool("inspect_portal", { serviceId: "all", executable: "alert(1)" }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_TOOL_INPUT" });

    const result = await adapter.executeTool("inspect_portal", {
      serviceId: "parking_permit_renewal",
      includeCurrentState: true,
    });
    expect(result).toMatchObject({
      ok: true,
      code: "PORTAL_INSPECTED",
      data: {
        service: {
          id: "parking_permit_renewal",
          allowedOperationIds: expect.arrayContaining([
            "permit.load_current",
            "permit.stage_review",
          ]),
          finalHumanOperationId: "permit.submit",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("execute");
  });

  it("compiles into shared UI state and exposes human locks without mutable references", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);
    useAppStore.getState().human.lockElement(viewId, "field:vehicleId");

    const inspected = (await adapter.executeTool("inspect_task_view", { viewId })) as {
      data: { lockedElementIds: string[] };
    };
    inspected.data.lockedElementIds.push("title");

    expect(getAppState()).toMatchObject({
      portalMode: "adaptive_view_active",
      activeViewId: viewId,
      views: { [viewId]: { preferences: { textSize: "xlarge" }, revision: 2 } },
    });
    expect(getAppState().views[viewId]?.lockedElementIds).toEqual(["field:vehicleId"]);
  });

  it("refuses a locked atomic patch and leaves the shared view unchanged", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);
    useAppStore.getState().human.lockElement(viewId, "field:vehicleId");
    expect(getAppState().metrics.humanLocksPreserved).toBe(0);

    const result = await adapter.executeTool("patch_task_view", {
      viewId,
      patches: [
        { type: "set_title", title: "Changed title" },
        {
          type: "move_field",
          fieldId: "vehicleId",
          afterFieldId: "permitDurationMonths",
        },
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "LOCKED_BY_USER",
      details: { lockedElementIds: ["field:vehicleId"] },
    });
    expect(getAppState().views[viewId]).toMatchObject({ title: "Renew my permit", revision: 2 });
    expect(getAppState().metrics.humanLocksPreserved).toBe(1);
  });

  it("updates journey-check state and stages human review without registering a tool", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);

    const checks = await adapter.executeTool("run_journey_checks", {
      viewId,
      includeDomChecks: false,
    });
    expect(checks).toMatchObject({
      ok: true,
      code: "CHECKS_COMPLETED",
      data: { blockingFailures: 0 },
    });
    expect(getAppState().journeyChecks[viewId]?.length).toBeGreaterThan(10);
    expect(getAppState().rightRail.activeTab).toBe("checks");

    const staged = await adapter.executeTool("stage_workflow_tool", proposalInput(viewId));
    expect(staged).toMatchObject({
      ok: true,
      code: "WORKFLOW_STAGED",
      data: { requiresHumanApproval: true, status: "awaiting_approval" },
    });
    expect(useAppStore.getState().dialogs.proposalSheetOpen).toBe(true);
    expect(getAppState().approvedWorkflowTools).toEqual({});
    expect((await adapter.getTools()).map((tool) => tool.name)).toEqual(names);
  });

  it("refuses to stage before an explicit current journey-check run", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);

    await expect(
      adapter.executeTool("stage_workflow_tool", proposalInput(viewId)),
    ).resolves.toMatchObject({
      ok: false,
      code: "CHECKS_FAILED",
      message: expect.stringMatching(/run journey checks.*retry/i),
    });
    expect(getAppState().proposals).toEqual({});
  });

  it("invalidates check proof after patch and lock mutations, then accepts a fresh rerun", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);

    await adapter.executeTool("run_journey_checks", { viewId });
    await adapter.executeTool("patch_task_view", {
      viewId,
      patches: [{ type: "set_title", title: "Renew my accessible permit" }],
    });
    await expect(
      adapter.executeTool("stage_workflow_tool", proposalInput(viewId)),
    ).resolves.toMatchObject({ ok: false, code: "CHECKS_FAILED" });

    await adapter.executeTool("run_journey_checks", { viewId });
    useAppStore.getState().human.lockElement(viewId, "field:vehicleId");
    await expect(
      adapter.executeTool("stage_workflow_tool", proposalInput(viewId)),
    ).resolves.toMatchObject({ ok: false, code: "CHECKS_FAILED" });

    await adapter.executeTool("run_journey_checks", { viewId });
    useAppStore.getState().human.unlockElement(viewId, "field:vehicleId");
    await expect(
      adapter.executeTool("stage_workflow_tool", proposalInput(viewId)),
    ).resolves.toMatchObject({ ok: false, code: "CHECKS_FAILED" });

    await adapter.executeTool("run_journey_checks", { viewId });
    await expect(
      adapter.executeTool("stage_workflow_tool", proposalInput(viewId)),
    ).resolves.toMatchObject({ ok: true, code: "WORKFLOW_STAGED" });
  });

  it("discards an asynchronous check result when the checked view changes", async () => {
    let releaseContext!: () => void;
    const contextPending = new Promise<void>((resolve) => {
      releaseContext = resolve;
    });
    const getContext = vi.fn(async () => {
      await contextPending;
      return {
        presentation: {
          labelsPresent: true,
          headingOrderValid: true,
          focusableControlsReachable: true,
          largeTargetsPresent: true,
          progressPresent: true,
        },
        dom: { mounted: true, runAxe: async () => ({ violations: [] }) },
      };
    });
    const { adapter } = await setup({ journeyChecksProvider: { getContext } });
    const viewId = await compileView(adapter);

    const pendingChecks = adapter.executeTool("run_journey_checks", {
      viewId,
      includeDomChecks: true,
    });
    await vi.waitFor(() => expect(getContext).toHaveBeenCalledOnce());
    useAppStore.getState().human.lockElement(viewId, "field:vehicleId");
    releaseContext();

    await expect(pendingChecks).resolves.toMatchObject({
      ok: false,
      code: "CHECKS_FAILED",
      message: expect.stringMatching(/changed.*run journey checks again/i),
    });
    expect(getAppState().journeyChecks[viewId]).toBeUndefined();
  });

  it("requires current check proof at approval after a view mutation", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);
    await adapter.executeTool("run_journey_checks", { viewId });
    await adapter.executeTool("stage_workflow_tool", proposalInput(viewId));
    const proposal = Object.values(getAppState().proposals)[0];
    if (!proposal) throw new Error("Expected a staged proposal fixture");

    useAppStore.getState().human.lockElement(viewId, "field:vehicleId");
    expect(() => useAppStore.getState().human.approveProposal(proposal.id)).toThrow(
      /CHECKS_FAILED.*run journey checks.*retry/i,
    );
    expect(getAppState().proposals[proposal.id]?.status).toBe("awaiting_approval");
    expect(getAppState().approvedWorkflowTools).toEqual({});

    await adapter.executeTool("run_journey_checks", { viewId });
    expect(useAppStore.getState().human.approveProposal(proposal.id).status).toBe("registered");
  });

  it("runs a trusted injected DOM scan only when includeDomChecks is true", async () => {
    const runAxe = vi.fn(async () => ({
      violations: [{ id: "color-contrast", impact: "critical" as const }],
    }));
    const getContext = vi.fn(() => ({
      presentation: {
        labelsPresent: true,
        headingOrderValid: true,
        focusableControlsReachable: true,
        largeTargetsPresent: true,
        progressPresent: true,
      },
      dom: { mounted: true, runAxe },
    }));
    const { adapter } = await setup({ journeyChecksProvider: { getContext } });
    const viewId = await compileView(adapter);

    await expect(
      adapter.executeTool("run_journey_checks", { viewId, includeDomChecks: true }),
    ).resolves.toMatchObject({
      ok: true,
      code: "CHECKS_COMPLETED",
      data: { blockingFailures: 1, failedCheckIds: ["axe_dom_scan"] },
    });
    expect(runAxe).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith(viewId);
    expect(getAppState().journeyChecks[viewId]).toContainEqual(
      expect.objectContaining({ id: "axe_dom_scan", status: "fail" }),
    );

    await adapter.executeTool("run_journey_checks", { viewId, includeDomChecks: false });
    expect(runAxe).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
  });

  it("lists only compact workflow metadata", async () => {
    const { adapter } = await setup();
    const viewId = await compileView(adapter);
    await adapter.executeTool("run_journey_checks", { viewId });
    await adapter.executeTool("stage_workflow_tool", proposalInput(viewId));

    const listed = await adapter.executeTool("list_workflow_tools", {});
    expect(listed).toMatchObject({
      ok: true,
      code: "WORKFLOW_TOOLS_LISTED",
      data: { tools: [{ name: "renew_permit_guided", status: "awaiting_approval" }] },
    });
    expect(JSON.stringify(listed).length).toBeLessThan(1500);
    expect(JSON.stringify(listed)).not.toContain("permit.set_contact");
  });
});
