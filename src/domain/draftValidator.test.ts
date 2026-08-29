import { describe, expect, it } from "vitest";

import { cloneSeedResident } from "./seed";
import { validateDraftForReview } from "./draftValidator";

describe("draft review readiness", () => {
  it("requires the trusted parking operation inputs and matching fee", () => {
    expect(
      validateDraftForReview(
        "parking_permit_renewal",
        {
          vehicleId: "vehicle_aurora",
          durationMonths: 12,
          contactEmail: "maya.chen@example.test",
          fee: 35,
        },
        cloneSeedResident(),
      ),
    ).toMatchObject({ valid: false, errors: ["matching fee"] });

    expect(
      validateDraftForReview(
        "parking_permit_renewal",
        {
          vehicleId: "vehicle_aurora",
          durationMonths: 12,
          contactEmail: "maya.chen@example.test",
          fee: 60,
        },
        cloneSeedResident(),
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  it("uses the address blueprint and trusted schemas for review readiness", () => {
    expect(
      validateDraftForReview(
        "address_change",
        {
          newStreet: "8 Cove Road",
          newCity: "N",
          newPostalCode: "NS 20418",
          effectiveDate: "not-a-date",
        },
        cloneSeedResident(),
      ),
    ).toMatchObject({ valid: false });

    expect(
      validateDraftForReview(
        "address_change",
        {
          newStreet: "8 Cove Road",
          newCity: "Northstar",
          newPostalCode: "NS 20418",
          effectiveDate: "2026-09-01",
        },
        cloneSeedResident(),
      ),
    ).toEqual({ valid: true, errors: [] });
  });
});
