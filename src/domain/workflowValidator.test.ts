import { describe, expect, it } from "vitest";

import { operationRegistry } from "./operationRegistry";
import { compileWorkflowProposal } from "./workflowCompiler";
import { deriveDynamicInputSchema, validateWorkflowProposal } from "./workflowValidator";
import type { WorkflowToolProposal } from "./types";

const now = new Date("2026-08-29T10:00:00.000Z");

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
  status: "draft",
  validationErrors: [],
  createdAt: now.toISOString(),
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
  status: "draft",
  validationErrors: [],
  createdAt: now.toISOString(),
});

describe("trusted operation registry", () => {
  it("keeps both final submission operations human-only and non-compilable", () => {
    expect(operationRegistry["permit.submit"]).toMatchObject({
      sideEffect: "human_only",
      compilable: false,
    });
    expect(operationRegistry["address.submit"]).toMatchObject({
      sideEffect: "human_only",
      compilable: false,
    });
  });
});

describe("workflow proposal validator", () => {
  it("accepts the canonical bounded parking workflow", () => {
    expect(validateWorkflowProposal(canonicalProposal()).valid).toBe(true);
  });

  it("requires a non-empty recorded journey-check proof before staging", () => {
    for (const journeyChecks of [undefined, []]) {
      expect(
        validateWorkflowProposal(canonicalProposal(), {
          journeyChecks,
          requireJourneyCheckProof: true,
        }).errors,
      ).toContainEqual(
        expect.objectContaining({
          code: "CHECKS_FAILED",
          message: expect.stringMatching(/run journey checks.*retry/i),
        }),
      );
    }
  });

  it("accepts optional blank workflow titles and parameter descriptions", () => {
    const proposal = canonicalProposal();
    proposal.title = "";
    proposal.parameters[0]!.description = "";

    expect(validateWorkflowProposal(proposal).valid).toBe(true);
  });

  it("rejects names that do not meet the tool-name contract", () => {
    const proposal = canonicalProposal();
    proposal.name = "Renew Permit!";

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_WORKFLOW_NAME" }),
    );
  });

  it("rejects collisions with static and enabled compiled tools", () => {
    expect(
      validateWorkflowProposal(canonicalProposal(), {
        staticToolNames: ["renew_permit_guided"],
        enabledCompiledToolNames: ["another_tool"],
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: "TOOL_NAME_COLLISION" }));
  });

  it("rejects operations from another service", () => {
    const proposal = canonicalProposal();
    proposal.operations[0] = { operationId: "address.load_current", bindings: [] };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "CROSS_SERVICE_OPERATION" }),
    );
  });

  it("rejects a same-service compilable operation outside the blueprint allowlist", () => {
    const operationId = "permit.internal_audit";
    const fixture = operationRegistry["permit.load_current"];
    if (!fixture) throw new Error("Trusted operation fixture is missing");
    operationRegistry[operationId] = {
      ...fixture,
      id: operationId,
      title: "Internal permit audit",
      description: "A trusted same-service operation not exposed by the permit blueprint.",
    };
    try {
      const proposal = canonicalProposal();
      proposal.operations.splice(-1, 0, { operationId, bindings: [] });

      expect(validateWorkflowProposal(proposal).errors).toContainEqual({
        code: "UNKNOWN_OPERATION",
        message:
          "Workflow operation is not allowed by this service blueprint. Remove it and retry staging.",
        path: "operations.6",
      });
    } finally {
      delete operationRegistry[operationId];
    }
  });

  it("rejects all human-only operations even when they are added to an allowed workflow", () => {
    const proposal = canonicalProposal();
    proposal.operations.splice(-1, 0, { operationId: "permit.submit", bindings: [] });

    const submitErrorCodes = validateWorkflowProposal(proposal)
      .errors.filter((error) => error.path === "operations.6")
      .map((error) => error.code);
    expect(submitErrorCodes).toContain("HUMAN_ONLY_OPERATION");
    expect(submitErrorCodes).not.toContain("CROSS_SERVICE_OPERATION");
  });

  it("requires dependencies to occur before the operation that needs them", () => {
    const proposal = canonicalProposal();
    const calculateFee = proposal.operations[4];
    const setDuration = proposal.operations[2];
    if (!calculateFee || !setDuration) throw new Error("test setup failed");
    proposal.operations[2] = calculateFee;
    proposal.operations[4] = setDuration;

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_ORDER_INVALID" }),
    );
  });

  it("requires exactly one compatible binding for every required operation argument", () => {
    const proposal = canonicalProposal();
    proposal.operations[2] = { operationId: "permit.set_duration", bindings: [] };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_BINDING" }),
    );
  });

  it("rejects unknown portal-state keys and literals outside an operation schema", () => {
    const proposal = canonicalProposal();
    proposal.operations[1] = {
      operationId: "permit.set_vehicle",
      bindings: [{ argument: "vehicleId", source: "portal_state", key: "unsafeAgentPath" }],
    };
    proposal.operations[2] = {
      operationId: "permit.set_duration",
      bindings: [{ argument: "months", source: "literal", value: 9 }],
    };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_BINDING" }),
    );
  });

  it("rejects allowlisted portal state whose trusted value schema cannot satisfy an argument", () => {
    const proposal = canonicalProposal();
    proposal.operations[2] = {
      operationId: "permit.set_duration",
      bindings: [{ argument: "months", source: "portal_state", key: "currentVehicleId" }],
    };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_BINDING" }),
    );
  });

  it("rejects a tool-input field whose length range can exceed the operation argument", () => {
    const proposal = addressProposal();
    proposal.operations[1] = {
      operationId: "address.set_new",
      bindings: [
        { argument: "street", source: "tool_input", key: "street" },
        { argument: "city", source: "tool_input", key: "city" },
        { argument: "postalCode", source: "tool_input", key: "street" },
      ],
    };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_BINDING" }),
    );
  });

  it("rejects impossible calendar dates in literal bindings", () => {
    const proposal = addressProposal();
    proposal.operations[2] = {
      operationId: "address.set_effective_date",
      bindings: [{ argument: "effectiveDate", source: "literal", value: "2026-02-30" }],
    };

    expect(validateWorkflowProposal(proposal).errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_BINDING" }),
    );
  });

  it("enforces operation and parameter budgets", () => {
    const proposal = canonicalProposal();
    proposal.operations = Array.from({ length: 9 }, () => ({
      operationId: "permit.load_current",
      bindings: [],
    }));
    proposal.parameters = Array.from({ length: 7 }, (_, index) => ({
      name: `parameter${index}`,
      fieldId: "permitDurationMonths",
      description: "A bounded tool parameter.",
      required: true,
    }));

    expect(validateWorkflowProposal(proposal).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "WORKFLOW_BUDGET_EXCEEDED",
          message: expect.stringMatching(/8/),
        }),
        expect.objectContaining({ code: "INVALID_PARAMETER", message: expect.stringMatching(/6/) }),
      ]),
    );
  });

  it("requires a final stage-review operation and a review stop boundary", () => {
    const proposal = canonicalProposal();
    proposal.operations.pop();
    (proposal as { stopAt: string }).stopAt = "submit";

    expect(validateWorkflowProposal(proposal).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "REVIEW_STEP_REQUIRED" }),
        expect.objectContaining({
          code: "REVIEW_STEP_REQUIRED",
          message: expect.stringMatching(/stopAt/),
        }),
      ]),
    );
  });

  it("rejects a proposal while any supplied journey check is blocking", () => {
    expect(
      validateWorkflowProposal(canonicalProposal(), {
        journeyChecks: [{ id: "required_fields_present", status: "fail" }],
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: "CHECKS_FAILED" }));
  });

  it("derives the canonical narrow input schema with no additional properties", () => {
    expect(deriveDynamicInputSchema(canonicalProposal())).toEqual({
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
    });
  });

  it("compiles proposal data only and marks a validated proposal ready for human review", () => {
    const proposal = compileWorkflowProposal(
      {
        ...canonicalProposal(),
        id: undefined,
        createdAt: undefined,
      },
      { now: { now: () => now }, idFactory: () => "compiled" },
    );

    expect(proposal).toMatchObject({
      id: "workflow_compiled",
      status: "awaiting_approval",
      validationErrors: [],
    });
  });
});
