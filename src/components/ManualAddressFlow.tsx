import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { useState } from "react";

import { validateDraftForReview } from "../domain/draftValidator";
import { useAppStore } from "../store/useAppStore";

export const ManualAddressFlow = ({ onBack }: { onBack(): void }) => {
  const resident = useAppStore((state) => state.resident);
  const storedDraft = useAppStore((state) => state.serviceDrafts.address_change);
  const draft = storedDraft ?? {};
  const mode = useAppStore((state) => state.portalMode);
  const setField = useAppStore((state) => state.human.setDraftField);
  const editDraft = useAppStore((state) => state.human.editDraft);
  const stage = useAppStore((state) => state.stageDraftForReview);
  const reopen = useAppStore((state) => state.setDialog);
  const field = (name: string) => String(draft[name] ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const review = () => {
    const candidate = {
      newStreet: field("newStreet"),
      newCity: field("newCity"),
      newPostalCode: field("newPostalCode"),
      effectiveDate: field("effectiveDate"),
      updateVoterRecord: Boolean(draft.updateVoterRecord),
    };
    const readiness = validateDraftForReview("address_change", candidate, resident);
    if (!readiness.valid) {
      const nextErrors = readiness.fieldErrors ?? {};
      setErrors(nextErrors);
      const first = ["newStreet", "newCity", "newPostalCode", "effectiveDate"].find(
        (id) => nextErrors[id],
      );
      if (first) document.getElementById(`manual-${first}`)?.focus();
      return;
    }
    try {
      setErrors({});
      setFormError("");
      editDraft("address_change", candidate);
      stage("address_change");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Review this address and try again.");
    }
  };
  return (
    <section className="flow-view" aria-labelledby="address-flow-title">
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Services
      </button>
      <div className="flow-heading">
        <div>
          <p className="eyebrow">Records · Resident profile</p>
          <h1 id="address-flow-title" tabIndex={-1}>
            Address Change
          </h1>
          <p>Update the fictional address used across Northstar City records.</p>
        </div>
        <span className="flow-step">Step 1 of 2</span>
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
          <div className="address-fields">
            {(
              [
                ["newStreet", "New street address", "text"],
                ["newCity", "New city", "text"],
                ["newPostalCode", "New postal code", "text"],
                ["effectiveDate", "Effective date", "date"],
              ] as const
            ).map(([id, label, type]) => (
              <div className="field-stack" key={id}>
                <label htmlFor={`manual-${id}`}>{label}</label>
                <input
                  id={`manual-${id}`}
                  type={type}
                  value={field(id)}
                  aria-invalid={Boolean(errors[id])}
                  aria-describedby={errors[id] ? `manual-${id}-error` : undefined}
                  onChange={(event) => {
                    setErrors((current) => ({ ...current, [id]: "" }));
                    setField("address_change", id, event.target.value);
                  }}
                  required
                />
                {errors[id] ? (
                  <p className="field-error" id={`manual-${id}-error`}>
                    {errors[id]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(draft.updateVoterRecord)}
              onChange={(event) =>
                setField("address_change", "updateVoterRecord", event.target.checked)
              }
            />
            <span>
              <strong>Also update your voter record?</strong>
              <small>Fictional demonstration only.</small>
            </span>
          </label>
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
              Review address change <ArrowRight size={17} />
            </button>
          )}
        </form>
        <aside className="record-summary" aria-label="Current address summary">
          <MapPin size={24} />
          <p className="eyebrow">Current address</p>
          <h2>{resident.address.street}</h2>
          <p>
            {resident.address.city}
            <br />
            {resident.address.postalCode}
          </p>
          <p className="summary-note">Changing this record does not contact a real city service.</p>
        </aside>
      </div>
    </section>
  );
};
