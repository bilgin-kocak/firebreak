import { describe, expect, it } from "vitest";

import { compileTaskView } from "./viewCompiler";
import { runJourneyChecks } from "./journeyChecks";
import { validateTaskView } from "./viewValidator";

const canonicalView = () =>
  compileTaskView(
    {
      serviceId: "parking_permit_renewal",
      title: "Guided permit renewal",
      goal: "Renew my parking permit",
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
    },
    new Date("2026-08-29T10:00:00.000Z"),
  );

const result = async (view = canonicalView()) => runJourneyChecks(view, {});
const check = (checks: Awaited<ReturnType<typeof result>>, id: string) =>
  checks.find((item) => item.id === id);

describe("deterministic journey checks", () => {
  it("breaks if a canonical safe view does not pass its deterministic checks", async () => {
    const checks = await result();

    expect(checks.filter((item) => item.status === "fail")).toEqual([]);
  });

  it("breaks if a confirmation gate is absent", async () => {
    const checks = await result({ ...canonicalView(), requireHumanConfirmation: false as true });

    expect(check(checks, "confirmation_gate_present")?.status).toBe("fail");
  });

  it("breaks if the final human submit operation becomes compilable", async () => {
    const checks = await runJourneyChecks(canonicalView(), {
      operationSafety: { finalHumanOperationCompilable: true },
    });

    expect(check(checks, "human_submit_not_compilable")?.status).toBe("fail");
  });

  it("breaks if requested progress is missing from the mounted presentation", async () => {
    const checks = await runJourneyChecks(canonicalView(), {
      presentation: { progressPresent: false },
    });

    expect(check(checks, "progress_indicator_present")?.status).toBe("fail");
  });

  it("breaks if a recorded lock target is invalid", async () => {
    const checks = await result({ ...canonicalView(), lockedElementIds: ["field:notAField"] });

    expect(check(checks, "locked_elements_preserved")?.status).toBe("fail");
  });

  it("breaks if a lock target includes an unenforceable trailing segment", async () => {
    const view = { ...canonicalView(), lockedElementIds: ["field:vehicleId:extra"] };

    expect(validateTaskView(view).valid).toBe(false);
    expect(
      (await result(view)).find((item) => item.id === "locked_elements_preserved")?.status,
    ).toBe("fail");
  });

  it("breaks if trusted field IDs are unknown or duplicated", async () => {
    const checks = await result({
      ...canonicalView(),
      fieldOrder: ["vehicleId", "vehicleId", "agentComponent"],
    });

    expect(check(checks, "field_ids_known")?.status).toBe("fail");
    expect(check(checks, "field_ids_unique")?.status).toBe("fail");
  });

  it("breaks if copy exceeds the safe plain-text budget", async () => {
    const checks = await result({
      ...canonicalView(),
      copyOverrides: [{ fieldId: "vehicleId", label: "x".repeat(101) }],
    });

    expect(check(checks, "copy_lengths_safe")?.status).toBe("fail");
  });

  it("breaks if stored copy is whitespace-only or not already trimmed", async () => {
    const view = {
      ...canonicalView(),
      copyOverrides: [{ fieldId: "vehicleId", label: "  Your vehicle  ", helpText: "   " }],
    };

    expect(validateTaskView(view).valid).toBe(false);
    expect(check(await result(view), "copy_lengths_safe")?.status).toBe("fail");
  });

  it("returns validation and failed checks for an unknown restored service instead of throwing", async () => {
    const restoredView = {
      ...canonicalView(),
      serviceId: "untrusted_service",
    } as unknown as ReturnType<typeof canonicalView>;

    expect(validateTaskView(restoredView).valid).toBe(false);
    await expect(runJourneyChecks(restoredView, {})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "field_ids_known", status: "fail" })]),
    );
  });

  it("breaks if rendered labels are unavailable", async () => {
    const checks = await runJourneyChecks(canonicalView(), {
      presentation: { labelsPresent: false },
    });

    expect(check(checks, "labels_present")?.status).toBe("fail");
  });

  it("uses an optional narrow DOM axe seam only when a view is mounted", async () => {
    const checks = await runJourneyChecks(canonicalView(), {
      includeDomChecks: true,
      dom: {
        mounted: true,
        runAxe: async () => ({ violations: [{ id: "color-contrast", impact: "serious" }] }),
      },
    });

    expect(check(checks, "axe_dom_scan")).toMatchObject({ status: "fail" });
  });
});
