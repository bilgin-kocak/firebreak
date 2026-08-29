import { ArrowLeft, CheckCircle2, Database, ShieldCheck, X } from "lucide-react";
import { useCallback } from "react";

import { operationRegistry } from "../domain/operationRegistry";
import { getServiceBlueprint } from "../domain/serviceBlueprints";
import { useAppStore } from "../store/useAppStore";
import { useDialogFocus } from "./useDialogFocus";

interface WorkflowProposalSheetProps {
  onApprove(proposalId: string): Promise<void>;
  onMessage(message: string): void;
}

export const WorkflowProposalSheet = ({ onApprove, onMessage }: WorkflowProposalSheetProps) => {
  const open = useAppStore((state) => state.dialogs.proposalSheetOpen);
  const proposal = useAppStore((state) =>
    Object.values(state.proposals).find((item) => item.status === "awaiting_approval"),
  );
  const setDialog = useAppStore((state) => state.setDialog);
  const reject = useAppStore((state) => state.human.rejectProposal);
  const close = useCallback(() => setDialog("proposalSheetOpen", false), [setDialog]);
  const dialogRef = useDialogFocus(open, close);
  if (!open || !proposal) return null;
  const blueprint = getServiceBlueprint(proposal.serviceId);
  const approve = async () => {
    try {
      await onApprove(proposal.id);
      onMessage(`${proposal.name} registered.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The workflow could not be registered.");
    }
  };
  return (
    <div className="dialog-backdrop proposal-backdrop">
      <div
        ref={dialogRef}
        className="proposal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-title"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Human review required</p>
            <h2 id="proposal-title">Review reusable tool</h2>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="Close proposal">
            <X size={20} />
          </button>
        </header>
        <div className="proposal-body">
          <section className="proposal-intro">
            <span className="compiled-mark">
              <ShieldCheck size={22} />
            </span>
            <div>
              <code>{proposal.name}</code>
              <h3>{proposal.title}</h3>
              <p>{proposal.description}</p>
            </div>
          </section>
          <div className="safety-badges">
            <span>Stops at review</span>
            <span>Cannot submit</span>
            <span>Runs only in this page/session when registered</span>
          </div>
          <section>
            <div className="proposal-section-title">
              <h3>Input parameters</h3>
              <span>{proposal.parameters.length}</span>
            </div>
            {proposal.parameters.map((parameter) => {
              const field = blueprint.fields.find((item) => item.id === parameter.fieldId);
              return (
                <article className="parameter-row" key={parameter.name}>
                  <code>{parameter.name}</code>
                  <p>{parameter.description}</p>
                  <small>
                    Type:{" "}
                    {field?.kind === "radio" &&
                    field.options?.every((option) => typeof option.value === "number")
                      ? "integer"
                      : (field?.kind ?? "string")}
                    {field?.options
                      ? ` · Allowed: ${field.options.map((option) => String(option.value)).join(", ")}`
                      : ""}
                  </small>
                </article>
              );
            })}
          </section>
          <section>
            <div className="proposal-section-title">
              <h3>Exact operation sequence</h3>
              <span>{proposal.operations.length}</span>
            </div>
            <ol className="operation-list">
              {proposal.operations.map((step, index) => {
                const operation = operationRegistry[step.operationId];
                return (
                  <li key={`${step.operationId}-${index}`}>
                    <span>{index + 1}</span>
                    <div>
                      <p>
                        <strong>{operation?.title ?? step.operationId}</strong>
                        <code>{step.operationId}</code>
                      </p>
                      <small>{operation?.description}</small>
                      <div className="operation-meta">
                        <span className={`effect-${operation?.sideEffect}`}>
                          {operation?.sideEffect.replace("_", " ")}
                        </span>
                        {step.bindings.map((binding) => (
                          <span key={`${binding.argument}-${binding.source}`}>
                            <Database size={12} /> {binding.argument} ← {binding.source}
                            {binding.key ? `:${binding.key}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="safety-summary">
            <ShieldCheck size={20} />
            <div>
              <h3>Safety summary</h3>
              <p>
                This definition can call only prewritten {blueprint.title} operations. It has no
                submission operation, generated code, URLs, or network access.
              </p>
            </div>
          </section>
          <p className="validation-pass">
            <CheckCircle2 size={17} /> Validation passed · 0 blocking journey checks
          </p>
        </div>
        <footer className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={close}>
            <ArrowLeft size={17} /> Back to edit
          </button>
          <button
            className="button button-danger-quiet"
            type="button"
            onClick={() => reject(proposal.id)}
          >
            Reject
          </button>
          <button
            className="button button-primary"
            data-autofocus
            type="button"
            onClick={() => void approve()}
          >
            Approve &amp; Register
          </button>
        </footer>
      </div>
    </div>
  );
};
