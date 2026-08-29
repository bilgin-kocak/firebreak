import { ArrowLeft, ArrowRight, BadgeCheck, ShieldCheck, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { validateDraftForReview } from "../domain/draftValidator";
import { parkingPermitFees } from "../domain/seed";
import { getServiceBlueprint } from "../domain/serviceBlueprints";
import type { FieldDefinition } from "../domain/types";
import { resolveFieldCopy } from "../domain/viewCompiler";
import { useAppStore } from "../store/useAppStore";
import { AdaptiveField } from "./AdaptiveField";
import { AdaptiveStep } from "./AdaptiveStep";
import { LockButton } from "./LockButton";

const draftValue = (
  field: FieldDefinition,
  draft: Record<string, unknown>,
  resident: ReturnType<typeof useAppStore.getState>["resident"],
): unknown => {
  if (field.id === "permitDurationMonths") return draft.durationMonths;
  if (field.id === "vehicleId") return draft.vehicleId ?? resident.activeParkingPermit.vehicleId;
  if (field.id === "contactEmail") return draft.contactEmail ?? resident.email;
  if (field.id === "currentPermitSummary")
    return {
      zone: resident.activeParkingPermit.zone,
      expiresOn: resident.activeParkingPermit.expiresOn,
      plate: resident.vehicles[0]?.plate ?? "",
    };
  if (field.id === "currentAddressSummary") return resident.address;
  return draft[field.id];
};

export const AdaptiveWorkspace = () => {
  const activeViewId = useAppStore((state) => state.activeViewId);
  const view = useAppStore((state) => (activeViewId ? state.views[activeViewId] : undefined));
  const resident = useAppStore((state) => state.resident);
  const storedDraft = useAppStore((state) =>
    view ? state.serviceDrafts[view.serviceId] : undefined,
  );
  const draft = storedDraft ?? {};
  const human = useAppStore((state) => state.human);
  const stage = useAppStore((state) => state.stageDraftForReview);
  const portalMode = useAppStore((state) => state.portalMode);
  const setDialog = useAppStore((state) => state.setDialog);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  useEffect(() => {
    setStepIndex(0);
    setErrors({});
    setFormError("");
  }, [view?.id]);
  const blueprint = useMemo(() => (view ? getServiceBlueprint(view.serviceId) : undefined), [view]);
  if (!view || !blueprint) return null;
  if (portalMode === "staged_for_review") {
    const permit = view.serviceId === "parking_permit_renewal";
    return (
      <section
        id="adaptive-workspace"
        className="adaptive-workspace adaptive-staged-review"
        aria-labelledby="adaptive-title"
      >
        <div className="adaptive-hero adaptive-staged-hero">
          <p className="eyebrow">Adaptive draft status</p>
          <h1 id="adaptive-title" tabIndex={-1}>
            Staged for human review
          </h1>
          <p>{view.title} is ready for your final decision.</p>
        </div>
        <div className="trusted-notice" role="status">
          <ShieldCheck size={19} />
          <p>
            <strong>This draft remains unsubmitted.</strong>
            <span>Only you can reopen the review and use the final confirmation action.</span>
          </p>
        </div>
        <div className="adaptive-staged-summary">
          <h2>Draft summary</h2>
          <dl className="review-list">
            {permit ? (
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
          <button
            id="adaptive-return-to-review"
            className="button button-primary"
            type="button"
            onClick={() => setDialog("finalConfirmationOpen", true)}
          >
            <BadgeCheck size={18} /> Return to review
          </button>
        </div>
      </section>
    );
  }
  const visibleFields = view.fieldOrder
    .filter((id) => !view.hiddenOptionalFields.includes(id))
    .map((id) => blueprint.fields.find((field) => field.id === id))
    .filter((field): field is FieldDefinition => Boolean(field));
  const grouped = view.preferences.navigationStyle === "grouped";
  const currentFields = grouped
    ? visibleFields
    : [visibleFields[Math.min(stepIndex, visibleFields.length - 1)]].filter(
        (field): field is FieldDefinition => Boolean(field),
      );
  const setValue = (fieldId: string, value: unknown) => {
    setErrors((current) => ({ ...current, [fieldId]: "" }));
    setFormError("");
    if (fieldId === "permitDurationMonths") {
      const months = value === 6 || value === 12 ? value : Number(value);
      human.editDraft(view.serviceId, {
        permitDurationMonths: months,
        durationMonths: months,
        fee: months === 6 || months === 12 ? parkingPermitFees[months] : undefined,
      });
    } else human.setDraftField(view.serviceId, fieldId, value);
  };
  const toggleLock = (elementId: string) =>
    view.lockedElementIds.includes(elementId)
      ? human.unlockElement(view.id, elementId)
      : human.lockElement(view.id, elementId);
  const reviewDraft = () => {
    if (view.serviceId === "parking_permit_renewal") {
      const duration =
        draft.durationMonths === 6 || draft.durationMonths === 12
          ? draft.durationMonths
          : undefined;
      return {
        ...draft,
        vehicleId: draft.vehicleId ?? resident.activeParkingPermit.vehicleId,
        durationMonths: duration,
        permitDurationMonths: duration,
        contactEmail: draft.contactEmail ?? resident.email,
        fee: duration ? parkingPermitFees[duration] : undefined,
      };
    }
    return { ...draft, updateVoterRecord: Boolean(draft.updateVoterRecord) };
  };
  const validateAndFocus = (fieldIds: string[]): boolean => {
    const readiness = validateDraftForReview(view.serviceId, reviewDraft(), resident);
    const relevant = Object.fromEntries(
      Object.entries(readiness.fieldErrors ?? {}).filter(([id]) => fieldIds.includes(id)),
    );
    if (Object.keys(relevant).length === 0) return true;
    setErrors((current) => ({ ...current, ...relevant }));
    const first = fieldIds.find((id) => relevant[id]);
    if (first) {
      const fieldRoot = document.querySelector<HTMLElement>(`[data-field-id="${first}"]`);
      fieldRoot?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    }
    return false;
  };
  const nextStep = () => {
    const current = visibleFields[stepIndex];
    if (current && !validateAndFocus([current.id])) return;
    setStepIndex((index) => Math.min(visibleFields.length - 1, index + 1));
  };
  const prepareReview = () => {
    const editableFieldIds = visibleFields
      .filter((field) => field.kind !== "readonly_summary")
      .map((field) => field.id);
    if (!validateAndFocus(editableFieldIds)) return;
    try {
      setErrors({});
      setFormError("");
      human.editDraft(view.serviceId, reviewDraft());
      stage(view.serviceId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Review this draft and try again.");
    }
  };
  return (
    <section
      id="adaptive-workspace"
      className={`adaptive-workspace controls-${view.preferences.controlStyle}`}
      aria-labelledby="adaptive-title"
    >
      <div className="adaptive-hero">
        <div className="adaptive-kicker">
          <WandSparkles size={18} /> Compiled adaptive view
        </div>
        <div className="adaptive-title-row">
          <div>
            <h1 id="adaptive-title" tabIndex={-1}>
              {view.title}
            </h1>
            <p>{view.goal}</p>
          </div>
          <LockButton
            label="generated title"
            locked={view.lockedElementIds.includes("title")}
            onToggle={() => toggleLock("title")}
          />
        </div>
        <div className="preference-chips">
          <span>{view.preferences.textSize} text</span>
          <span>{view.preferences.languageStyle} language</span>
          <span>{grouped ? "grouped fields" : "one question at a time"}</span>
          <span>human confirmation</span>
        </div>
      </div>
      <div className="trusted-notice">
        <ShieldCheck size={19} />
        <p>
          <strong>Generated from trusted portal fields.</strong>
          <span>No arbitrary code, markup, or submission action was created.</span>
        </p>
      </div>
      {view.preferences.showProgress && !grouped ? (
        <div className="adaptive-progress">
          <div>
            <span>
              Step {stepIndex + 1} of {visibleFields.length}
            </span>
            <span>{Math.round(((stepIndex + 1) / visibleFields.length) * 100)}%</span>
          </div>
          <progress aria-label="Task progress" max={visibleFields.length} value={stepIndex + 1} />
        </div>
      ) : null}
      <div className="adaptive-fields">
        {currentFields.map((field, localIndex) => {
          const copy = resolveFieldCopy(view, field.id);
          const actualIndex = grouped ? localIndex : stepIndex;
          return (
            <AdaptiveStep
              key={field.id}
              index={actualIndex}
              total={visibleFields.length}
              fieldId={field.id}
              locked={view.lockedElementIds.includes(`field:${field.id}`)}
              copyLocked={view.lockedElementIds.includes(`copy:${field.id}`)}
              onToggleFieldLock={() => toggleLock(`field:${field.id}`)}
              onToggleCopyLock={() => toggleLock(`copy:${field.id}`)}
            >
              <AdaptiveField
                field={field}
                label={copy.label}
                helpText={copy.helpText}
                value={draftValue(field, draft, resident)}
                large={view.preferences.controlStyle === "large_cards"}
                error={errors[field.id]}
                onChange={(value) => setValue(field.id, value)}
              />
            </AdaptiveStep>
          );
        })}
      </div>
      {formError ? (
        <p className="form-error adaptive-form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <div className="adaptive-navigation">
        {!grouped ? (
          <button
            className="button button-secondary"
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          >
            <ArrowLeft size={18} /> Previous question
          </button>
        ) : (
          <span />
        )}
        {!grouped && stepIndex < visibleFields.length - 1 ? (
          <button className="button button-primary" type="button" onClick={nextStep}>
            Next question <ArrowRight size={18} />
          </button>
        ) : (
          <button className="button button-primary" type="button" onClick={prepareReview}>
            <BadgeCheck size={18} /> Review draft
          </button>
        )}
      </div>
    </section>
  );
};
