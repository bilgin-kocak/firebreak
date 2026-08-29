import { describe, expect, it } from "vitest";

import { DomainError, type ViewPreference } from "./types";
import { compileTaskView, patchTaskView, resolveFieldCopy } from "./viewCompiler";

const preferences: ViewPreference = {
  textSize: "xlarge",
  languageStyle: "plain",
  navigationStyle: "one_field_per_step",
  controlStyle: "large_cards",
  showProgress: true,
  preserveBranding: true,
};

const compile = (overrides: Partial<Parameters<typeof compileTaskView>[0]> = {}) =>
  compileTaskView(
    {
      serviceId: "parking_permit_renewal",
      title: "  Permit renewal  ",
      goal: "  Renew my permit  ",
      preferences,
      fieldOrder: ["permitDurationMonths", "vehicleId", "vehicleId"],
      hiddenOptionalFields: ["communicationPreference"],
      copyOverrides: [{ fieldId: "permitDurationMonths", label: "  Pick a length  " }],
      requireHumanConfirmation: true,
      ...overrides,
    },
    new Date("2026-08-29T10:00:00.000Z"),
  );

describe("safe task view compiler", () => {
  it("breaks if omitted required fields are not inserted in blueprint order", () => {
    const view = compile();

    expect(view.fieldOrder).toEqual([
      "permitDurationMonths",
      "vehicleId",
      "contactEmail",
      "currentPermitSummary",
    ]);
  });

  it("breaks if duplicate trusted field IDs remain in the generated order", () => {
    expect(compile().fieldOrder.filter((id) => id === "vehicleId")).toHaveLength(1);
  });

  it("breaks if an untrusted field ID reaches the generated view", () => {
    expect(() => compile({ fieldOrder: ["vehicleId", "agentComponent"] })).toThrow(
      expect.objectContaining({ code: "UNKNOWN_FIELD" }),
    );
  });

  it("breaks if an agent supplies an untrusted presentation property", () => {
    expect(() =>
      compile({
        preferences: {
          ...preferences,
          component: "<script>alert(1)</script>",
          selector: "#adaptive-view",
          url: "https://untrusted.example",
        } as ViewPreference,
      }),
    ).toThrow(expect.objectContaining({ code: "VIEW_VALIDATION_FAILED" }));
  });

  it("breaks with a domain error if the requested service is unknown", () => {
    expect(() =>
      compile({
        serviceId: "untrusted_service" as Parameters<typeof compileTaskView>[0]["serviceId"],
      }),
    ).toThrow(expect.objectContaining({ code: "UNKNOWN_SERVICE" }));
  });

  it("breaks if a required field can be hidden during compilation", () => {
    expect(() => compile({ hiddenOptionalFields: ["contactEmail"] })).toThrow(
      expect.objectContaining({ code: "REQUIRED_FIELD_HIDDEN" }),
    );
  });

  it("breaks if copy is not trimmed and constrained to plain safe strings", () => {
    expect(compile().copyOverrides).toEqual([
      { fieldId: "permitDurationMonths", label: "Pick a length" },
    ]);
    expect(() =>
      compile({ copyOverrides: [{ fieldId: "vehicleId", label: "x".repeat(101) }] }),
    ).toThrow(expect.objectContaining({ code: "VIEW_VALIDATION_FAILED" }));
  });

  it("breaks if plain language does not select the trusted plain labels", () => {
    expect(resolveFieldCopy(compile({ copyOverrides: [] }), "permitDurationMonths")).toMatchObject({
      label: "How long should the new permit last?",
      helpText: "Choose six months or one year.",
    });
  });

  it("breaks if one invalid patch leaves earlier patches applied", () => {
    const view = compile();

    expect(() =>
      patchTaskView(view, [
        { type: "set_title", title: "Changed" },
        { type: "set_visibility", fieldId: "contactEmail", visible: false },
      ]),
    ).toThrow(expect.objectContaining({ code: "REQUIRED_FIELD_HIDDEN" }));
    expect(view.title).toBe("Permit renewal");
    expect(view.hiddenOptionalFields).toEqual(["communicationPreference"]);
  });

  it("breaks if an invalid patch is silently ignored after a valid patch", () => {
    const view = compile();

    expect(() =>
      patchTaskView(view, [
        { type: "set_title", title: "Changed" },
        { type: "untrusted_presentation" } as unknown as Parameters<
          typeof patchTaskView
        >[1][number],
      ]),
    ).toThrow(expect.objectContaining({ code: "VIEW_VALIDATION_FAILED" }));
    expect(view.title).toBe("Permit renewal");
  });

  it("breaks if a locked field is changed", () => {
    const view = { ...compile(), lockedElementIds: ["field:vehicleId"] };

    expect(() =>
      patchTaskView(view, [
        { type: "move_field", fieldId: "vehicleId", afterFieldId: "permitDurationMonths" },
      ]),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "LOCKED_BY_USER" }));
  });

  it("breaks if a partial copy patch erases untouched safe copy", () => {
    const view = compile({
      copyOverrides: [
        { fieldId: "vehicleId", label: "Your car", helpText: "Choose the car for this permit." },
      ],
    });

    expect(
      patchTaskView(view, [{ type: "set_copy", fieldId: "vehicleId", label: "Your vehicle" }]),
    ).toMatchObject({
      copyOverrides: [
        {
          fieldId: "vehicleId",
          label: "Your vehicle",
          helpText: "Choose the car for this permit.",
        },
      ],
    });
  });

  it("breaks if locked copy is changed", () => {
    const view = { ...compile(), lockedElementIds: ["copy:vehicleId"] };

    expect(() =>
      patchTaskView(view, [{ type: "set_copy", fieldId: "vehicleId", label: "Car" }]),
    ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "LOCKED_BY_USER" }));
  });

  it("breaks if a locked title is changed", () => {
    const view = { ...compile(), lockedElementIds: ["title"] };

    expect(() => patchTaskView(view, [{ type: "set_title", title: "Changed" }])).toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "LOCKED_BY_USER" }),
    );
  });
});
