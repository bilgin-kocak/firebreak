import { Check, ShieldCheck, X } from "lucide-react";
import { useCallback, useState } from "react";

import { useAppStore } from "../store/useAppStore";
import { useDialogFocus } from "./useDialogFocus";

const noChecks: never[] = [];

export const ResponseProposalSheet = ({
  onApprove,
  onMessage,
}: {
  onApprove(proposalId: string): Promise<void>;
  onMessage(message: string): void;
}) => {
  const open = useAppStore((state) => state.dialogs.proposalSheetOpen);
  const proposal = useAppStore((state) =>
    Object.values(state.proposals).find((item) => item.status === "awaiting_approval"),
  );
  const checks = useAppStore((state) =>
    proposal ? (state.checks[proposal.simulationId] ?? noChecks) : noChecks,
  );
  const close = useAppStore((state) => state.setDialog);
  const reject = useAppStore((state) => state.human.rejectResponseTool);
  const [busy, setBusy] = useState(false);
  const onClose = useCallback(() => close("proposalSheetOpen", false), [close]);
  const ref = useDialogFocus(open && Boolean(proposal), onClose);
  if (!open || !proposal) return null;
  const simulation = useAppStore.getState().simulations[proposal.simulationId];

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="proposal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-title"
        ref={ref}
      >
        <div className="dialog-header">
          <div className="dialog-icon">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <div>
            <span className="eyebrow">HUMAN AUTHORIZATION GATE</span>
            <h2 id="proposal-title">Approve one-use response?</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close response review"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="dialog-lede">
          The agent prepared a fixed recovery interface. Approval authorizes the complete bounded
          run—no repeated confirmations inside this envelope.
        </p>
        <div className="proposal-tool-name mono">rollback_checkout_release</div>
        <div className="proposal-summary-grid">
          <div>
            <span>Target</span>
            <strong>checkout-api only</strong>
          </div>
          <div>
            <span>Canary proof</span>
            <strong>
              {simulation?.canaryPercent ?? 10}% → {simulation?.predictedErrorRate ?? 0.6}% errors
            </strong>
          </div>
          <div>
            <span>Production budget</span>
            <strong>1 mutation</strong>
          </div>
          <div>
            <span>Lifetime</span>
            <strong>One use · revision {proposal.incidentRevision}</strong>
          </div>
        </div>
        <ol className="proposal-operations">
          {proposal.operations.map((operation) => (
            <li key={operation.operationId}>
              <Check size={14} /> <span className="mono">{operation.operationId}</span>
            </li>
          ))}
        </ol>
        <div className="proposal-checks">
          <strong>
            {checks.filter((check) => check.status === "pass").length}/{checks.length} safety gates
            pass
          </strong>
          <span>Customer export, deletion, secrets, and unrelated services remain impossible.</span>
        </div>
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              reject(proposal.id);
              onMessage("Proposal returned without registering a tool.");
            }}
          >
            Return for revision
          </button>
          <button
            className="button button-primary"
            type="button"
            data-autofocus
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onApprove(proposal.id)
                .then(() => {
                  close("proposalSheetOpen", false);
                  onMessage("");
                })
                .catch((error: unknown) =>
                  onMessage(error instanceof Error ? error.message : "Approval failed safely."),
                )
                .finally(() => setBusy(false));
            }}
          >
            <ShieldCheck size={17} /> {busy ? "Registering…" : "Approve & register once"}
          </button>
        </div>
      </div>
    </div>
  );
};
