import { describe, expect, it } from "vitest";

import { executeWorkflow, type WorkflowExecutionContext } from "./workflowExecutor";
import { operationRegistry } from "./operationRegistry";
import type { WorkflowToolProposal } from "./types";
import { cloneSeedResident } from "./seed";

const canonicalProposal = (): WorkflowToolProposal => ({
  id: "workflow_renew",
  viewId: "view_renew",
  serviceId: "parking_permit_renewal",
  name: "renew_permit_guided",
  title: "Guided parking permit renewal",
  description: "Prepare a permit renewal, save a draft, and stop for human review.",
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
  status: "awaiting_approval",
  validationErrors: [],
  createdAt: "2026-08-29T10:00:00.000Z",
});

const addressProposal = (): WorkflowToolProposal => ({
  id: "workflow_address",
  viewId: "view_address",
  serviceId: "address_change",
  name: "update_address_guided",
  title: "Guided address change",
  description: "Prepare an address change and stop for human review.",
  parameters: [
    { name: "street", fieldId: "newStreet", description: "New street address.", required: true },
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
      description: "Date the address takes effect.",
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
  status: "awaiting_approval",
  validationErrors: [],
  createdAt: "2026-08-29T10:00:00.000Z",
});

const createContext = (): WorkflowExecutionContext => ({
  resident: cloneSeedResident(),
  serviceDrafts: {
    parking_permit_renewal: { preserved: "before-run" },
  },
  portalState: { parking_permit_renewal: "idle" },
  progress: [],
});

describe("workflow executor", () => {
  it("executes trusted parking operations in proposal order and stages a $60 review draft", async () => {
    const context = createContext();

    const result = await executeWorkflow(canonicalProposal(), { durationMonths: 12 }, context);

    expect(result).toMatchObject({
      code: "DRAFT_STAGED",
      status: "awaiting_user_confirmation",
      fee: 60,
      submitted: false,
    });
    expect(context.progress.map((entry) => entry.operationId)).toEqual(
      canonicalProposal().operations.map((step) => step.operationId),
    );
    expect(context.serviceDrafts.parking_permit_renewal).toMatchObject({
      vehicleId: "vehicle_aurora",
      durationMonths: 12,
      contactEmail: "maya.chen@example.test",
      fee: 60,
      saved: true,
      status: "staged_for_review",
    });
  });

  it("uses the trusted six-month fee without submitting", async () => {
    const context = createContext();

    const result = await executeWorkflow(canonicalProposal(), { durationMonths: 6 }, context);

    expect(result).toMatchObject({ fee: 35, submitted: false });
    expect(context.serviceDrafts.parking_permit_renewal).not.toMatchObject({ status: "submitted" });
  });

  it("restores the exact service draft snapshot after a failed operation", async () => {
    const context = createContext();
    const before = structuredClone(context.serviceDrafts.parking_permit_renewal);
    const proposal = canonicalProposal();
    proposal.operations[3] = {
      operationId: "permit.set_contact",
      bindings: [{ argument: "email", source: "literal", value: "not-an-email" }],
    };

    const result = await executeWorkflow(proposal, { durationMonths: 12 }, context);

    expect(result).toMatchObject({ code: "OPERATION_FAILED", submitted: false });
    expect(context.serviceDrafts.parking_permit_renewal).toEqual(before);
  });

  it("checks cancellation before every operation and restores the exact snapshot", async () => {
    const context = createContext();
    const before = structuredClone(context.serviceDrafts.parking_permit_renewal);
    const controller = new AbortController();
    context.onProgress = (entry) => {
      if (entry.operationId === "permit.set_vehicle") controller.abort();
    };

    const result = await executeWorkflow(
      canonicalProposal(),
      { durationMonths: 12 },
      context,
      controller.signal,
    );

    expect(result).toMatchObject({ code: "EXECUTION_CANCELLED", submitted: false });
    expect(context.serviceDrafts.parking_permit_renewal).toEqual(before);
    expect(context.progress.map((entry) => entry.operationId)).toEqual([
      "permit.load_current",
      "permit.set_vehicle",
    ]);
  });

  it("rolls back when cancellation is raised immediately after the final staging operation", async () => {
    const context = createContext();
    const before = structuredClone(context.serviceDrafts.parking_permit_renewal);
    const portalStateBefore = context.portalState?.parking_permit_renewal;
    const controller = new AbortController();
    context.onProgress = (entry) => {
      if (entry.operationId === "permit.stage_review") controller.abort();
    };

    const result = await executeWorkflow(
      canonicalProposal(),
      { durationMonths: 12 },
      context,
      controller.signal,
    );

    expect(result).toMatchObject({ code: "EXECUTION_CANCELLED", submitted: false });
    expect(context.serviceDrafts.parking_permit_renewal).toEqual(before);
    expect(context.portalState?.parking_permit_renewal).toBe(portalStateBefore);
  });

  it("never invokes a human-only submit operation even if an invalid proposal includes it", async () => {
    const context = createContext();
    const proposal = canonicalProposal();
    proposal.operations.splice(-1, 0, { operationId: "permit.submit", bindings: [] });

    const result = await executeWorkflow(proposal, { durationMonths: 12 }, context);

    expect(result).toMatchObject({ code: "OPERATION_FAILED", submitted: false });
    expect(context.serviceDrafts.parking_permit_renewal).toEqual({ preserved: "before-run" });
  });

  it("rolls back draft and portal state when a progress observer throws after a mutation", async () => {
    const context = createContext();
    const draftBefore = structuredClone(context.serviceDrafts.parking_permit_renewal);
    const portalStateBefore = context.portalState?.parking_permit_renewal;
    context.onProgress = (entry) => {
      if (entry.operationId === "permit.set_vehicle") throw new Error("timeline unavailable");
    };

    await expect(
      executeWorkflow(canonicalProposal(), { durationMonths: 12 }, context),
    ).resolves.toMatchObject({
      code: "OPERATION_FAILED",
      submitted: false,
    });
    expect(context.serviceDrafts.parking_permit_renewal).toEqual(draftBefore);
    expect(context.portalState?.parking_permit_renewal).toBe(portalStateBefore);
  });

  it("stages an Address Change through the shared executor without submitting", async () => {
    const context = createContext();

    const result = await executeWorkflow(
      addressProposal(),
      {
        street: "500 Market Street",
        city: "Northstar",
        postalCode: "NS 20419",
        effectiveDate: "2026-10-01",
      },
      context,
    );

    expect(result).toMatchObject({
      code: "DRAFT_STAGED",
      status: "awaiting_user_confirmation",
      submitted: false,
    });
    expect(context.serviceDrafts.address_change).toMatchObject({
      street: "500 Market Street",
      city: "Northstar",
      postalCode: "NS 20419",
      effectiveDate: "2026-10-01",
      saved: true,
      status: "staged_for_review",
    });
  });

  it("rolls back an Address Change on cancellation through the same executor", async () => {
    const context = createContext();
    context.serviceDrafts.address_change = { preserved: "address-before" };
    context.portalState = { ...context.portalState, address_change: "idle" };
    const draftBefore = structuredClone(context.serviceDrafts.address_change);
    const portalStateBefore = context.portalState.address_change;
    const controller = new AbortController();
    context.onProgress = (entry) => {
      if (entry.operationId === "address.set_new") controller.abort();
    };

    const result = await executeWorkflow(
      addressProposal(),
      {
        street: "500 Market Street",
        city: "Northstar",
        postalCode: "NS 20419",
        effectiveDate: "2026-10-01",
      },
      context,
      controller.signal,
    );

    expect(result).toMatchObject({ code: "EXECUTION_CANCELLED", submitted: false });
    expect(context.serviceDrafts.address_change).toEqual(draftBefore);
    expect(context.portalState.address_change).toBe(portalStateBefore);
  });

  it("rejects impossible calendar dates in dynamic input and direct operation execution", async () => {
    const context = createContext();
    const addressBefore = context.serviceDrafts.address_change;

    const result = await executeWorkflow(
      addressProposal(),
      {
        street: "500 Market Street",
        city: "Northstar",
        postalCode: "NS 20419",
        effectiveDate: "2026-02-30",
      },
      context,
    );

    expect(result).toMatchObject({ code: "OPERATION_FAILED", submitted: false });
    expect(context.serviceDrafts.address_change).toBe(addressBefore);
    await expect(
      operationRegistry["address.set_effective_date"]?.execute(context, {
        effectiveDate: "2026-99-99",
      }),
    ).rejects.toThrow("Effective date is invalid");
  });
});
