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

export const PortalShell = ({ confirmation, onBack, onCopied }: PortalShellProps) => {
  const mode = useAppStore((state) => state.portalMode);
  const service = useAppStore((state) => state.currentService);
  const activeViewId = useAppStore((state) => state.activeViewId);
  const start = useAppStore((state) => state.startManualFlow);
  return (
    <div className="portal-frame">
      <PortalSidebar />
      <main id="main-content" className="portal-main" tabIndex={-1}>
        {mode === "idle" ? (
          <ServiceDashboard onStart={start} onCopied={onCopied} />
        ) : activeViewId ? (
          <AdaptiveWorkspace />
        ) : service === "parking_permit_renewal" ? (
          <ManualPermitFlow onBack={onBack} />
        ) : (
          <ManualAddressFlow onBack={onBack} />
        )}
        {confirmation ? (
          <section className="submission-success" role="status">
            <CheckCircle2 size={30} />
            <div>
              <p className="eyebrow">Fictional submission complete</p>
              <h2>{confirmation.confirmationNumber}</h2>
              <p>{confirmation.message}</p>
            </div>
          </section>
        ) : null}
        <MetricsStrip />
      </main>
    </div>
  );
};
