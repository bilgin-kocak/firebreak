import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import type { SubmissionConfirmation } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";
import { useDialogFocus } from "./useDialogFocus";

export const FinalConfirmationDialog = ({
  onConfirmed,
}: {
  onConfirmed(result: SubmissionConfirmation): void;
}) => {
  const open = useAppStore((state) => state.dialogs.finalConfirmationOpen);
  const serviceId = useAppStore((state) => state.currentService);
  const storedDraft = useAppStore((state) =>
    serviceId ? state.serviceDrafts[serviceId] : undefined,
  );
  const draft = storedDraft ?? {};
  const setDialog = useAppStore((state) => state.setDialog);
  const confirmPermit = useAppStore((state) => state.human.confirmPermitSubmission);
  const confirmAddress = useAppStore((state) => state.human.confirmAddressSubmission);
  const submittedRef = useRef(false);
  useEffect(() => {
    if (open) submittedRef.current = false;
  }, [open]);
  const close = useCallback(() => setDialog("finalConfirmationOpen", false), [setDialog]);
  const findFallback = useCallback(
    () => document.querySelector<HTMLElement>("#submission-success-heading"),
    [],
  );
  const preferSuccess = useCallback(() => submittedRef.current, []);
  const dialogRef = useDialogFocus(open, close, undefined, findFallback, preferSuccess);
  if (!open || !serviceId) return null;
  const confirm = () => {
    submittedRef.current = true;
    try {
      onConfirmed(serviceId === "parking_permit_renewal" ? confirmPermit() : confirmAddress());
    } catch (error) {
      submittedRef.current = false;
      throw error;
    }
  };
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Final human-only step</p>
            <h2 id="confirmation-title">Confirm fictional submission</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="Close confirmation"
          >
            <X size={20} />
          </button>
        </header>
        <div className="confirmation-body">
          <div className="awaiting-banner">
            <AlertCircle size={21} />
            <p>
              <strong>This draft is awaiting your confirmation.</strong>
              <span>No agent or compiled tool can use this final action.</span>
            </p>
          </div>
          <h3>
            {serviceId === "parking_permit_renewal" ? "Parking permit renewal" : "Address change"}
          </h3>
          <dl className="review-list">
            {serviceId === "parking_permit_renewal" ? (
              <>
                <div>
                  <dt>Vehicle</dt>
                  <dd>NST-4821</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{String(draft.durationMonths)} months</dd>
                </div>
                <div>
                  <dt>Fictional fee</dt>
                  <dd>${String(draft.fee)}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{String(draft.contactEmail)}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>New address</dt>
                  <dd>
                    {String(draft.newStreet)}, {String(draft.newCity)} {String(draft.newPostalCode)}
                  </dd>
                </div>
                <div>
                  <dt>Effective date</dt>
                  <dd>{String(draft.effectiveDate)}</dd>
                </div>
                <div>
                  <dt>Voter record</dt>
                  <dd>
                    {draft.updateVoterRecord ? "Include update request" : "No update request"}
                  </dd>
                </div>
              </>
            )}
          </dl>
          <p className="fictional-warning">
            This action updates only this fictional browser demonstration.
          </p>
        </div>
        <footer className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={close}>
            Keep as draft
          </button>
          <button className="button button-primary" data-autofocus type="button" onClick={confirm}>
            <CheckCircle2 size={18} /> Confirm &amp; Submit
          </button>
        </footer>
      </div>
    </div>
  );
};
