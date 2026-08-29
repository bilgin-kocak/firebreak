import { describe, expect, it } from "vitest";

import { getServiceBlueprint, serviceBlueprints } from "./serviceBlueprints";

describe("service blueprints", () => {
  it("exposes the two generic municipal services", () => {
    expect(Object.keys(serviceBlueprints).sort()).toEqual([
      "address_change",
      "parking_permit_renewal",
    ]);
    expect(getServiceBlueprint("address_change").title).toBe("Address Change");
    expect(getServiceBlueprint("parking_permit_renewal").title).toBe("Parking Permit Renewal");
  });

  it("keeps every required parking renewal field in the trusted blueprint", () => {
    const parking = getServiceBlueprint("parking_permit_renewal");

    expect(parking.fields.filter((field) => field.required).map((field) => field.id)).toEqual([
      "vehicleId",
      "permitDurationMonths",
      "contactEmail",
      "currentPermitSummary",
    ]);
  });

  it("models the parking permit journey as thirteen interactions", () => {
    const parking = getServiceBlueprint("parking_permit_renewal");

    expect(parking.baselineJourney.reduce((total, step) => total + step.interactionCost, 0)).toBe(
      13,
    );
  });

  it("uses materially simpler plain-language labels", () => {
    const parking = getServiceBlueprint("parking_permit_renewal");
    const duration = parking.fields.find((field) => field.id === "permitDurationMonths");

    expect(duration?.label).toBe("Requested permit validity period");
    expect(duration?.plainLabel).toBe("How long should the new permit last?");
    expect(duration?.plainLabel).not.toContain("validity period");
  });

  it("makes final submission human-only and unavailable for compilation", () => {
    const parking = getServiceBlueprint("parking_permit_renewal");
    const address = getServiceBlueprint("address_change");

    expect(parking.finalHumanOperationId).toBe("permit.submit");
    expect(parking.allowedOperationIds).not.toContain("permit.submit");
    expect(address.finalHumanOperationId).toBe("address.submit");
    expect(address.allowedOperationIds).not.toContain("address.submit");
  });
});
