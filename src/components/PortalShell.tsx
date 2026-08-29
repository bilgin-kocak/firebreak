import { CheckCircle2 } from "lucide-react";

import type { SubmissionConfirmation } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";
import { AdaptiveWorkspace } from "./AdaptiveWorkspace";
import { ManualAddressFlow } from "./ManualAddressFlow";
import { ManualPermitFlow } from "./ManualPermitFlow";
import { MetricsStrip } from "./MetricsStrip";
import { PortalSidebar } from "./PortalSidebar";
import { ServiceDashboard } from "./ServiceDashboard";

interface PortalShellProps {
  confirmation: SubmissionConfirmation | null;
  onBack(): void;
  onCopied(message: string): void;
}

const SubmittedServiceSuccess = ({
  serviceId,
  confirmation,
}: {
  serviceId: "parking_permit_renewal" | "address_change";
  confirmation: SubmissionConfirmation | null;
}) => {
  const draft = useAppStore((state) => state.serviceDrafts[serviceId] ?? {});
  const permit = serviceId === "parking_permit_renewal";
  const confirmationNumber =
    confirmation?.confirmationNumber ?? (permit ? "NST-PP-2026-08421" : "NST-AC-2026-03116");
  return (
    <section
      className="submission-success-view"
      role="region"
      aria-labelledby="submission-success-heading"
    >
      <div className="submission-success-hero">
        <CheckCircle2 size={34} aria-hidden="true" />
        <div>
          <p className="eyebrow">Fictional submission complete</p>
          <h1 id="submission-success-heading" tabIndex={-1}>
            Submission confirmed
          </h1>
          <p>
            {confirmation?.message ??
              `Your fictional Northstar City ${permit ? "permit renewal" : "address change"} was submitted.`}
          </p>
        </div>
      </div>
      <div className="submitted-summary">
        <p>
          <span>Confirmation number</span>
          <strong>{confirmationNumber}</strong>
        </p>
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
            </>
          )}
        </dl>
        <p className="submitted-readonly-note">
          This completed draft is read-only. Reset the fictional demo to begin another service.
        </p>
      </div>
    </section>
  );
};

export const PortalShell = ({ confirmation, onBack, onCopied }: PortalShellProps) => {
  const mode = useAppStore((state) => state.portalMode);
  const service = useAppStore((state) => state.currentService);
  const activeViewId = useAppStore((state) => state.activeViewId);
  const start = useAppStore((state) => state.startManualFlow);
  return (
    <div className="portal-frame">
      <PortalSidebar />
      <main id="main-content" className="portal-main" tabIndex={-1}>
        {mode === "submitted" && service ? (
          <SubmittedServiceSuccess serviceId={service} confirmation={confirmation} />
        ) : mode === "idle" ? (
          <ServiceDashboard onStart={start} onCopied={onCopied} />
        ) : activeViewId ? (
          <AdaptiveWorkspace />
        ) : service === "parking_permit_renewal" ? (
          <ManualPermitFlow onBack={onBack} />
        ) : (
          <ManualAddressFlow onBack={onBack} />
        )}
        <MetricsStrip />
      </main>
    </div>
  );
};
