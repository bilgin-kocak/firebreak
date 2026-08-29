import { ArrowLeft, ArrowRight, CarFront, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

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

  const review = () => {
    if (!duration) return;
    editDraft("parking_permit_renewal", {
      vehicleId,
      durationMonths: duration,
      contactEmail: email,
      communicationPreference: draft.communicationPreference ?? "email",
      fee: parkingPermitFees[duration],
    });
    stage("parking_permit_renewal");
  };

  return (
    <section className="flow-view" aria-labelledby="permit-flow-title">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Services
      </button>
      <div className="flow-heading">
        <div>
          <p className="eyebrow">Permits · Resident parking</p>
          <h1 id="permit-flow-title">Parking Permit Renewal</h1>
          <p>Review your current permit and prepare a fictional renewal.</p>
        </div>
        <span className="flow-step">Step 1 of 3</span>
      </div>
      <div className="manual-layout">
        <form
          className="manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <fieldset>
            <legend>1. Select your vehicle</legend>
            {resident.vehicles.map((vehicle) => (
              <label className="choice-row" key={vehicle.id}>
                <input
                  type="radio"
                  name="manualVehicle"
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
          </fieldset>
          <fieldset>
            <legend>2. Choose permit duration</legend>
            <div className="choice-grid">
              {[6, 12].map((months) => (
                <label className="choice-tile" key={months}>
                  <input
                    type="radio"
                    name="manualDuration"
                    aria-label={`${months} months`}
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
          </fieldset>
          <div className="field-stack">
            <label htmlFor="manual-contact-email">3. Contact email</label>
            <p id="manual-contact-help">Permit updates will be sent to this address.</p>
            <input
              id="manual-contact-email"
              aria-describedby="manual-contact-help"
              type="email"
              value={email}
              onChange={(event) =>
                setField("parking_permit_renewal", "contactEmail", event.target.value)
              }
              required
            />
          </div>
          {mode === "staged_for_review" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => reopen("finalConfirmationOpen", true)}
            >
              Return to review <ArrowRight size={17} />
            </button>
          ) : (
            <button className="button button-primary" type="submit" disabled={!duration || !email}>
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
