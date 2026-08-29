import { ArrowLeft, ArrowRight, CarFront, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { validateDraftForReview } from "../domain/draftValidator";
import { parkingPermitFees } from "../domain/seed";
import { useAppStore } from "../store/useAppStore";

export const ManualPermitFlow = ({ onBack }: { onBack(): void }) => {
  const resident = useAppStore((state) => state.resident);
  const storedDraft = useAppStore((state) => state.serviceDrafts.parking_permit_renewal);
  const draft = storedDraft ?? {};
  const mode = useAppStore((state) => state.portalMode);
  const setField = useAppStore((state) => state.human.setDraftField);
  const editDraft = useAppStore((state) => state.human.editDraft);
  const stage = useAppStore((state) => state.stageDraftForReview);
  const reopen = useAppStore((state) => state.setDialog);
  const vehicleId = String(draft.vehicleId ?? resident.activeParkingPermit.vehicleId);
  const duration =
    draft.durationMonths === 6 || draft.durationMonths === 12 ? draft.durationMonths : undefined;
  const email = String(draft.contactEmail ?? resident.email);
  const fee = useMemo(() => (duration ? parkingPermitFees[duration] : null), [duration]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const review = () => {
    const candidate = {
      vehicleId,
      durationMonths: duration,
      contactEmail: email,
      communicationPreference: draft.communicationPreference ?? "email",
      fee: duration ? parkingPermitFees[duration] : undefined,
    };
    const readiness = validateDraftForReview("parking_permit_renewal", candidate, resident);
    if (!readiness.valid) {
      const nextErrors = readiness.fieldErrors ?? {};
      setErrors(nextErrors);
      const first = ["vehicleId", "permitDurationMonths", "contactEmail"].find(
        (id) => nextErrors[id],
      );
      const target =
        first === "permitDurationMonths"
          ? document.querySelector<HTMLElement>('input[name="manualDuration"]')
          : first
            ? document.getElementById(`manual-${first}`)
            : null;
      target?.focus();
      return;
    }
    try {
      setErrors({});
      setFormError("");
      editDraft("parking_permit_renewal", candidate);
      stage("parking_permit_renewal");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Review this draft and try again.");
    }
  };

  return (
    <section className="flow-view" aria-labelledby="permit-flow-title">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Services
      </button>
      <div className="flow-heading">
        <div>
          <p className="eyebrow">Permits · Resident parking</p>
          <h1 id="permit-flow-title" tabIndex={-1}>
            Parking Permit Renewal
          </h1>
          <p>Review your current permit and prepare a fictional renewal.</p>
        </div>
        <span className="flow-step">Step 1 of 3</span>
      </div>
      <div className="manual-layout">
        <form
          className="manual-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <fieldset
            aria-invalid={Boolean(errors.vehicleId)}
            aria-describedby={errors.vehicleId ? "manual-vehicle-error" : undefined}
          >
            <legend>1. Select your vehicle</legend>
            {resident.vehicles.map((vehicle) => (
              <label className="choice-row" key={vehicle.id}>
                <input
                  type="radio"
                  name="manualVehicle"
                  aria-invalid={Boolean(errors.vehicleId)}
                  aria-describedby={errors.vehicleId ? "manual-vehicle-error" : undefined}
                  checked={vehicleId === vehicle.id}
                  onChange={() => setField("parking_permit_renewal", "vehicleId", vehicle.id)}
                />
                <CarFront size={22} />
                <span>
                  <strong>{vehicle.label}</strong>
                  <small>Plate {vehicle.plate}</small>
                </span>
              </label>
            ))}
            {errors.vehicleId ? (
              <p className="field-error" id="manual-vehicle-error">
                {errors.vehicleId}
              </p>
            ) : null}
          </fieldset>
          <fieldset
            aria-invalid={Boolean(errors.permitDurationMonths)}
            aria-describedby={errors.permitDurationMonths ? "manual-duration-error" : undefined}
          >
            <legend>2. Choose permit duration</legend>
            <div className="choice-grid">
              {[6, 12].map((months) => (
                <label className="choice-tile" key={months}>
                  <input
                    type="radio"
                    name="manualDuration"
                    aria-label={`${months} months`}
                    aria-invalid={Boolean(errors.permitDurationMonths)}
                    aria-describedby={
                      errors.permitDurationMonths ? "manual-duration-error" : undefined
                    }
                    checked={duration === months}
                    onChange={() => setField("parking_permit_renewal", "durationMonths", months)}
                  />
                  <span>
                    <strong>{months} months</strong>
                    <small>${parkingPermitFees[months as 6 | 12]} fictional fee</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.permitDurationMonths ? (
              <p className="field-error" id="manual-duration-error">
                {errors.permitDurationMonths}
              </p>
            ) : null}
          </fieldset>
          <div className="field-stack">
            <label htmlFor="manual-contact-email">3. Contact email</label>
            <p id="manual-contact-help">Permit updates will be sent to this address.</p>
            <input
              id="manual-contact-email"
              aria-describedby={`manual-contact-help${errors.contactEmail ? " manual-contact-error" : ""}`}
              aria-invalid={Boolean(errors.contactEmail)}
              type="email"
              value={email}
              onChange={(event) =>
                setField("parking_permit_renewal", "contactEmail", event.target.value)
              }
              required
            />
            {errors.contactEmail ? (
              <p className="field-error" id="manual-contact-error">
                {errors.contactEmail}
              </p>
            ) : null}
          </div>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          {mode === "staged_for_review" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => reopen("finalConfirmationOpen", true)}
            >
              Return to review <ArrowRight size={17} />
            </button>
          ) : (
            <button className="button button-primary" type="submit">
              Review permit renewal <ArrowRight size={17} />
            </button>
          )}
        </form>
        <aside className="record-summary" aria-label="Current permit summary">
          <ShieldCheck size={24} />
          <p className="eyebrow">Current permit</p>
          <h2>Resident Zone B</h2>
          <dl>
            <div>
              <dt>Plate</dt>
              <dd>NST-4821</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>September 18, 2026</dd>
            </div>
            <div>
              <dt>Renewal fee</dt>
              <dd>{fee ? `$${fee}` : "Select a duration"}</dd>
            </div>
          </dl>
          <p className="summary-note">No payment is collected in this demonstration.</p>
        </aside>
      </div>
    </section>
  );
};
