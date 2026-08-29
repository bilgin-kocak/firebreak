import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeWorkflow as executeTrustedWorkflow } from "../domain/workflowExecutor";
import { canonicalPreferencesFixture } from "../test/fixtures";
import { getAppState, resetAppStoreForTests, useAppStore } from "../store/useAppStore";
import type { WebMCPAdapter } from "./adapter";
import { DynamicToolManager } from "./dynamicToolManager";
import { createMemoryAdapter } from "./memoryAdapter";
import { registerStaticTools } from "./registerStaticTools";
import { ToolRegistry } from "./registry";
import { createSchemaInputSample } from "./toolInputSample";

const canonicalProposalInput = {
  name: "renew_permit_guided",
  title: "Guided parking permit renewal",
  description:
    "Prepare a Northstar City parking permit renewal, save a draft, and stop for human review.",
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
} as const;

const stageCanonicalOnAdapter = async (adapter: WebMCPAdapter) => {
  await adapter.executeTool("compile_task_view", {
    serviceId: "parking_permit_renewal",
    title: "Renew your parking permit",
    goal: "Prepare a renewal and stop for human review.",
    preferences: canonicalPreferencesFixture,
    fieldOrder: ["vehicleId", "permitDurationMonths", "contactEmail", "currentPermitSummary"],
    hiddenOptionalFields: ["communicationPreference"],
    copyOverrides: [],
    requireHumanConfirmation: true,
  });
  const viewId = getAppState().activeViewId;
  if (!viewId) throw new Error("Canonical view was not created");
  await adapter.executeTool("run_journey_checks", { viewId });
  await adapter.executeTool("stage_workflow_tool", { viewId, ...canonicalProposalInput });
  const proposalId = Object.values(getAppState().proposals).find(
    (proposal) => proposal.status === "awaiting_approval",
  )?.id;
  if (!proposalId) throw new Error("Canonical proposal was not staged");
  return proposalId;
};

const stageCanonicalProposal = async (adapter: WebMCPAdapter = createMemoryAdapter()) => {
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry);
  const proposalId = await stageCanonicalOnAdapter(adapter);
  return { adapter, registry, proposalId };
};

const stageAddressProposal = async () => {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry);
  await adapter.executeTool("compile_task_view", {
    serviceId: "address_change",
    title: "Change your address",
    goal: "Prepare an address change and stop for human review.",
    preferences: canonicalPreferencesFixture,
    fieldOrder: ["currentAddressSummary", "newStreet", "newCity", "newPostalCode", "effectiveDate"],
    hiddenOptionalFields: ["updateVoterRecord"],
    copyOverrides: [],
    requireHumanConfirmation: true,
  });
  const viewId = getAppState().activeViewId;
  if (!viewId) throw new Error("Address view was not created");
  await adapter.executeTool("run_journey_checks", { viewId });
  await adapter.executeTool("stage_workflow_tool", {
    viewId,
    name: "change_address_guided",
    title: "Guided address change",
    description: "Prepare a Northstar City address change and stop for human review.",
    parameters: [
      { name: "street", fieldId: "newStreet", description: "New street.", required: true },
      { name: "city", fieldId: "newCity", description: "New city.", required: true },
      {
        name: "postalCode",
        fieldId: "newPostalCode",
        description: "New postal code.",
        required: true,
      },
      {
        name: "effectiveDate",
        fieldId: "effectiveDate",
        description: "Effective date.",
        required: true,
      },
    ],
    operations: [
      { operationId: "address.load_current", bindings: [] },
      {
        operationId: "address.set_new",
        bindings: [
          { argument: "street", source: "tool_input", key: "street" },
          { argument: "city", source: "tool_input", key: "city" },
          { argument: "postalCode", source: "tool_input", key: "postalCode" },
        ],
      },
      {
        operationId: "address.set_effective_date",
        bindings: [{ argument: "effectiveDate", source: "tool_input", key: "effectiveDate" }],
      },
      { operationId: "address.validate", bindings: [] },
      { operationId: "address.save_draft", bindings: [] },
      { operationId: "address.stage_review", bindings: [] },
    ],
    stopAt: "review",
  });
  const proposalId = Object.keys(getAppState().proposals)[0];
  if (!proposalId) throw new Error("Address proposal was not staged");
  return { adapter, registry, proposalId };
};

const stageEmailProposal = async () => {
  const adapter = createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry);
  await adapter.executeTool("compile_task_view", {
    serviceId: "parking_permit_renewal",
    title: "Renew your parking permit",
    goal: "Prepare a renewal and stop for human review.",
    preferences: canonicalPreferencesFixture,
    fieldOrder: ["vehicleId", "permitDurationMonths", "contactEmail", "currentPermitSummary"],
    hiddenOptionalFields: ["communicationPreference"],
    copyOverrides: [],
    requireHumanConfirmation: true,
  });
  const viewId = getAppState().activeViewId;
  if (!viewId) throw new Error("Email view was not created");
  await adapter.executeTool("run_journey_checks", { viewId });
  await adapter.executeTool("stage_workflow_tool", {
    viewId,
    name: "renew_permit_email_guided",
    title: "Guided permit renewal by email",
    description: "Prepare a parking permit renewal with a supplied email and stop for review.",
    parameters: [
      {
        name: "contactEmail",
        fieldId: "contactEmail",
        description: "Email for renewal notices.",
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
        bindings: [{ argument: "months", source: "literal", value: 12 }],
      },
      {
        operationId: "permit.set_contact",
        bindings: [{ argument: "email", source: "tool_input", key: "contactEmail" }],
      },
      { operationId: "permit.calculate_fee", bindings: [] },
      { operationId: "permit.save_draft", bindings: [] },
      { operationId: "permit.stage_review", bindings: [] },
    ],
    stopAt: "review",
  });
  const proposalId = Object.values(getAppState().proposals).find(
    (proposal) => proposal.status === "awaiting_approval",
  )?.id;
  if (!proposalId) throw new Error("Email proposal was not staged");
  return { adapter, registry, proposalId };
};

describe("DynamicToolManager", () => {
  beforeEach(() => resetAppStoreForTests());

  it("keeps staging registration-free until the human approval method succeeds", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools).toEqual({});

    await manager.approveAndRegister(proposalId);

    expect((await adapter.getTools()).map((tool) => tool.name)).toContain("renew_permit_guided");
    expect(getAppState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "registered",
      enabled: true,
    });
    expect(
      registry
        .getRegistrations()
        .find((registration) => registration.name === "renew_permit_guided"),
    ).toMatchObject({
      origin: "human_approved_workflow",
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      inputSchema: {
        type: "object",
        properties: {
          durationMonths: {
            type: "integer",
            enum: [6, 12],
            description: "Choose a 6- or 12-month parking permit.",
          },
        },
        required: ["durationMonths"],
        additionalProperties: false,
      },
    });
    expect((await adapter.getTools()).map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([
        "approveAndRegister",
        "restoreEnabled",
        "disable",
        "delete",
        "disposeAll",
        "permit.submit",
      ]),
    );
  });

  it("does not persist approval metadata when dynamic registration fails", async () => {
    const memory = createMemoryAdapter();
    const adapter: WebMCPAdapter = {
      mode: memory.mode,
      async registerTool(definition, options) {
        if (definition.name === "renew_permit_guided") {
          throw new Error("WebMCP registration unavailable");
        }
        await memory.registerTool(definition, options);
      },
      getTools: () => memory.getTools(),
      executeTool: (name, input, signal) => memory.executeTool(name, input, signal),
      subscribeToToolChange: (listener) => memory.subscribeToToolChange(listener),
    };
    const { registry, proposalId } = await stageCanonicalProposal(adapter);
    const manager = new DynamicToolManager(registry);

    await expect(manager.approveAndRegister(proposalId)).rejects.toThrow(
      "WebMCP registration unavailable",
    );

    expect(getAppState().approvedWorkflowTools).toEqual({});
    expect(getAppState().proposals[proposalId]?.status).toBe("awaiting_approval");
  });

  it("returns an awaiting proposal to editable draft when current checks fail before registration", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const proposal = getAppState().proposals[proposalId];
    if (!proposal) throw new Error("Canonical proposal was not persisted");
    const view = getAppState().views[proposal.viewId];
    if (!view) throw new Error("Canonical proposal lost its task view");
    useAppStore.setState({
      views: {
        ...getAppState().views,
        [view.id]: {
          ...view,
          hiddenOptionalFields: [...view.hiddenOptionalFields, "contactEmail"],
        },
      },
    });
    const manager = new DynamicToolManager(registry);

    await expect(manager.approveAndRegister(proposalId)).rejects.toMatchObject({
      code: "CHECKS_FAILED",
      details: { validationErrors: ["CHECKS_FAILED"] },
    });

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().proposals[proposalId]).toMatchObject({
      status: "draft",
      validationErrors: ["CHECKS_FAILED"],
    });
    expect(useAppStore.getState().dialogs.proposalSheetOpen).toBe(false);
  });

  it("re-registers a valid enabled saved approval for the new tab", async () => {
    const first = await stageCanonicalProposal();
    const firstManager = new DynamicToolManager(first.registry);
    await firstManager.approveAndRegister(first.proposalId);
    firstManager.disposeAll();

    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry);

    await manager.restoreEnabled();

    expect((await adapter.getTools()).map((tool) => tool.name)).toContain("renew_permit_guided");
    expect(getAppState().activity).toContainEqual(
      expect.objectContaining({
        kind: "tool_registered",
        title: "Saved approval; registered for this tab.",
        toolName: "renew_permit_guided",
      }),
    );
  });

  it("keeps a failed restored registration unavailable and retryable", async () => {
    const first = await stageCanonicalProposal();
    const firstManager = new DynamicToolManager(first.registry);
    await firstManager.approveAndRegister(first.proposalId);
    await firstManager.disposeAll();

    const memory = createMemoryAdapter();
    let dynamicAttempts = 0;
    const adapter: WebMCPAdapter = {
      mode: memory.mode,
      async registerTool(definition, options) {
        if (definition.name === "renew_permit_guided" && dynamicAttempts++ === 0) {
          throw new Error("Transient restored registration failure");
        }
        await memory.registerTool(definition, options);
      },
      getTools: () => memory.getTools(),
      executeTool: (name, input, signal) => memory.executeTool(name, input, signal),
      subscribeToToolChange: (listener) => memory.subscribeToToolChange(listener),
    };
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry);

    await manager.restoreEnabled();

    expect(getAppState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "registered",
      enabled: true,
    });
    expect(getAppState().webmcp.registeredToolNames).not.toContain("renew_permit_guided");
    expect(getAppState().activity).toContainEqual(
      expect.objectContaining({
        kind: "tool_failed",
        title: "Saved workflow could not be registered for this tab",
        toolName: "renew_permit_guided",
      }),
    );

    await manager.restoreEnabled();

    expect(getAppState().webmcp.registeredToolNames).toContain("renew_permit_guided");
  });

  it("rejects a different proposal whose name belongs to an enabled saved definition", async () => {
    const first = await stageCanonicalProposal();
    const staged = getAppState().proposals[first.proposalId];
    if (!staged) throw new Error("Canonical proposal was not persisted");
    const collisionId = "workflow_name_collision";
    useAppStore.setState({
      proposals: {
        ...getAppState().proposals,
        [collisionId]: { ...structuredClone(staged), id: collisionId },
      },
    });
    const firstManager = new DynamicToolManager(first.registry);
    await firstManager.approveAndRegister(first.proposalId);
    firstManager.disposeAll();
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry);

    await expect(manager.approveAndRegister(collisionId)).rejects.toMatchObject({
      code: "TOOL_NAME_COLLISION",
    });

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools.renew_permit_guided?.id).toBe(first.proposalId);
    expect(getAppState().proposals[collisionId]).toMatchObject({
      status: "draft",
      validationErrors: ["TOOL_NAME_COLLISION"],
    });
  });

  it("keeps an invalid restored definition unregistered and persists it as disabled", async () => {
    const first = await stageCanonicalProposal();
    const firstManager = new DynamicToolManager(first.registry);
    await firstManager.approveAndRegister(first.proposalId);
    firstManager.disposeAll();
    const viewId = getAppState().approvedWorkflowTools.renew_permit_guided?.viewId;
    if (!viewId) throw new Error("Approved tool lost its view reference");
    const view = getAppState().views[viewId];
    if (!view) throw new Error("Approved tool lost its persisted view");
    useAppStore.setState({
      views: {
        ...getAppState().views,
        [viewId]: { ...view, hiddenOptionalFields: ["contactEmail"] },
      },
    });
    const adapter = createMemoryAdapter();
    const registry = new ToolRegistry(adapter);
    await registerStaticTools(registry);
    const manager = new DynamicToolManager(registry);

    await manager.restoreEnabled();

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "disabled",
      enabled: false,
    });
  });

  it("executes the canonical compiled workflow against store state and stops at review", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);

    const result = await adapter.executeTool("renew_permit_guided", {
      durationMonths: 12,
    });

    expect(result).toEqual({
      ok: true,
      code: "DRAFT_STAGED",
      message:
        "Prepared a 12-month parking permit renewal and stopped for your review. Submission did not occur.",
      data: {
        status: "awaiting_user_confirmation",
        submitted: false,
        draftId: "draft_permit_001",
        durationMonths: 12,
        fee: 60,
        currency: "USD",
        nextAction: "Review the visible draft and use the human Confirm & Submit button.",
      },
    });
    expect(getAppState().serviceDrafts.parking_permit_renewal).toMatchObject({
      vehicleId: "vehicle_aurora",
      durationMonths: 12,
      contactEmail: "maya.chen@example.test",
      fee: 60,
      saved: true,
      status: "staged_for_review",
    });
    expect(getAppState().portalMode).toBe("staged_for_review");
    expect(useAppStore.getState().dialogs.finalConfirmationOpen).toBe(true);
    expect(getAppState().metrics.workflowOperationsExecuted).toBe(7);
    expect(
      getAppState().activity.filter(
        (entry) => entry.title === "Trusted workflow operation completed",
      ),
    ).toHaveLength(7);
    expect(getAppState().serviceDrafts.parking_permit_renewal).not.toMatchObject({
      status: "submitted",
    });
  });

  it("records toolchange separately from approval and registration", async () => {
    const { registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);

    await manager.approveAndRegister(proposalId);

    await vi.waitFor(() => {
      const kinds = getAppState().activity.map((entry) => entry.kind);
      expect(kinds).toContain("workflow_approved");
      expect(kinds).toContain("tool_registered");
      expect(kinds).toContain("toolchange");
    });
    expect(getAppState().activity.find((entry) => entry.kind === "toolchange")).toMatchObject({
      title: "WebMCP tool surface changed",
      actor: "system",
    });
  });

  it("aborts registration before persisting a human disable", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    let enabledAtUnregister: boolean | undefined;
    let dynamicChanges = 0;
    adapter.subscribeToToolChange(() => {
      dynamicChanges += 1;
      if (dynamicChanges === 2) {
        enabledAtUnregister = getAppState().approvedWorkflowTools.renew_permit_guided?.enabled;
      }
    });
    await manager.approveAndRegister(proposalId);

    manager.disable("renew_permit_guided");

    expect(enabledAtUnregister).toBe(true);
    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "disabled",
      enabled: false,
    });
  });

  it("aborts registration before deleting after caller-side human confirmation", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    let existedAtUnregister: boolean | undefined;
    let dynamicChanges = 0;
    adapter.subscribeToToolChange(() => {
      dynamicChanges += 1;
      if (dynamicChanges === 2) {
        existedAtUnregister = Boolean(getAppState().approvedWorkflowTools.renew_permit_guided);
      }
    });
    await manager.approveAndRegister(proposalId);

    manager.delete("renew_permit_guided");

    expect(existedAtUnregister).toBe(true);
    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools.renew_permit_guided).toBeUndefined();
    expect(getAppState().proposals[proposalId]).toBeUndefined();
  });

  it("unregisters all dynamic tools when the shared demo store resets", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);

    await useAppStore.getState().reset();

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools).toEqual({});
  });

  it("keeps the reset unregister lifecycle active across repeated approvals", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);

    await useAppStore.getState().reset();

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools).toEqual({});

    const secondProposalId = await stageCanonicalOnAdapter(adapter);
    await manager.approveAndRegister(secondProposalId);
    expect((await adapter.getTools()).map((tool) => tool.name)).toContain("renew_permit_guided");

    await useAppStore.getState().reset();

    expect((await adapter.getTools()).map((tool) => tool.name)).not.toContain(
      "renew_permit_guided",
    );
    expect(getAppState().approvedWorkflowTools).toEqual({});
  });

  it("returns a safe cancellation and leaves the store draft snapshot unchanged", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);
    useAppStore.setState({
      serviceDrafts: { parking_permit_renewal: { preserved: "before-cancel" } },
    });
    const before = structuredClone(getAppState().serviceDrafts);
    const controller = new AbortController();
    controller.abort();

    const result = await adapter.executeTool(
      "renew_permit_guided",
      { durationMonths: 12 },
      controller.signal,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "EXECUTION_CANCELLED",
      retryable: false,
    });
    expect(getAppState().serviceDrafts).toEqual(before);
    expect(getAppState().portalMode).toBe("adaptive_view_active");
  });

  it("does not commit when execution is aborted after the executor finishes", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const controller = new AbortController();
    const manager = new DynamicToolManager(registry, {
      async executeWorkflow(...args) {
        const result = await executeTrustedWorkflow(...args);
        controller.abort();
        return result;
      },
    });
    await manager.approveAndRegister(proposalId);
    useAppStore.setState({
      serviceDrafts: { parking_permit_renewal: { preserved: "before-late-abort" } },
    });
    const before = structuredClone(getAppState().serviceDrafts);

    const result = await adapter.executeTool(
      "renew_permit_guided",
      { durationMonths: 12 },
      controller.signal,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "EXECUTION_CANCELLED",
      retryable: false,
    });
    expect(getAppState().serviceDrafts).toEqual(before);
    expect(getAppState().portalMode).toBe("adaptive_view_active");
  });

  it("preserves newer submitted state changed after execution and before commit", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const newerDraft = {
      preserved: "newer-human-state",
      status: "submitted",
    };
    const manager = new DynamicToolManager(registry, {
      async executeWorkflow(...args) {
        const result = await executeTrustedWorkflow(...args);
        useAppStore.setState({
          currentService: "parking_permit_renewal",
          portalMode: "submitted",
          serviceDrafts: { parking_permit_renewal: structuredClone(newerDraft) },
        });
        return result;
      },
    });
    await manager.approveAndRegister(proposalId);

    const result = await adapter.executeTool("renew_permit_guided", {
      durationMonths: 12,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "OPERATION_FAILED",
      retryable: false,
    });
    expect(getAppState().portalMode).toBe("submitted");
    expect(getAppState().serviceDrafts.parking_permit_renewal).toEqual(newerDraft);
  });

  it("does not regress a human-submitted portal back to review", async () => {
    const { adapter, registry, proposalId } = await stageCanonicalProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);
    useAppStore.setState({
      currentService: "parking_permit_renewal",
      portalMode: "submitted",
      serviceDrafts: {
        parking_permit_renewal: {
          preserved: "human-submitted",
          status: "submitted",
        },
      },
    });
    const before = structuredClone(getAppState().serviceDrafts);

    const result = await adapter.executeTool("renew_permit_guided", {
      durationMonths: 12,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "DRAFT_VALIDATION_FAILED",
      retryable: false,
    });
    expect(getAppState().portalMode).toBe("submitted");
    expect(getAppState().serviceDrafts).toEqual(before);
  });

  it("uses the same manager to stage the secondary address service", async () => {
    const { adapter, registry, proposalId } = await stageAddressProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);

    const result = await adapter.executeTool("change_address_guided", {
      street: "500 Market Street",
      city: "Northstar",
      postalCode: "NS 20419",
      effectiveDate: "2026-10-01",
    });

    expect(result).toMatchObject({
      ok: true,
      code: "DRAFT_STAGED",
      data: { status: "awaiting_user_confirmation", submitted: false },
    });
    expect(getAppState().serviceDrafts.address_change).toEqual({
      newStreet: "500 Market Street",
      newCity: "Northstar",
      newPostalCode: "NS 20419",
      effectiveDate: "2026-10-01",
      saved: true,
      status: "staged_for_review",
    });
  });

  it("creates a schema-valid simulator sample for a dynamic email tool", async () => {
    const { adapter, registry, proposalId } = await stageEmailProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);
    const tool = (await adapter.getTools()).find(
      (candidate) => candidate.name === "renew_permit_email_guided",
    );
    if (!tool) throw new Error("Email tool was not registered");

    const sample = createSchemaInputSample(tool.inputSchema) as Record<string, unknown>;
    expect(sample).toEqual({ contactEmail: "resident@example.test" });
    await expect(adapter.executeTool(tool.name, sample)).resolves.toMatchObject({
      ok: true,
      code: "DRAFT_STAGED",
    });
    expect(getAppState().serviceDrafts.parking_permit_renewal?.contactEmail).toBe(
      "resident@example.test",
    );
  });

  it("creates schema-valid constrained strings and dates for a dynamic address tool", async () => {
    const { adapter, registry, proposalId } = await stageAddressProposal();
    const manager = new DynamicToolManager(registry);
    await manager.approveAndRegister(proposalId);
    const tool = (await adapter.getTools()).find(
      (candidate) => candidate.name === "change_address_guided",
    );
    if (!tool) throw new Error("Address tool was not registered");

    const sample = createSchemaInputSample(tool.inputSchema) as Record<string, unknown>;
    expect(sample).toMatchObject({ effectiveDate: "2026-09-01" });
    expect(String(sample.street).length).toBeGreaterThanOrEqual(3);
    expect(String(sample.city).length).toBeGreaterThanOrEqual(2);
    expect(String(sample.postalCode).length).toBeGreaterThanOrEqual(3);
    await expect(adapter.executeTool(tool.name, sample)).resolves.toMatchObject({
      ok: true,
      code: "DRAFT_STAGED",
    });
  });

  it("honors enum, primitive type, length, and trusted pattern constraints in samples", () => {
    expect(createSchemaInputSample({ type: "integer", enum: [6, 12] })).toBe(12);
    expect(createSchemaInputSample({ type: "boolean" })).toBe(true);
    const sample = createSchemaInputSample({
      type: "string",
      minLength: 5,
      maxLength: 8,
      pattern: "^[A-Z0-9]+$",
    });
    expect(sample).toMatch(/^[A-Z0-9]+$/);
    expect(String(sample)).toHaveLength(5);
  });
});
