import { AlertTriangle, ArrowLeft, CheckCircle2, Database, ShieldCheck, X } from "lucide-react";
import { useCallback, useState } from "react";

import { operationRegistry } from "../domain/operationRegistry";
import { getServiceBlueprint } from "../domain/serviceBlueprints";
import { validateWorkflowProposal } from "../domain/workflowValidator";
import { useAppStore } from "../store/useAppStore";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { useDialogFocus } from "./useDialogFocus";

interface WorkflowProposalSheetProps {
  onApprove(proposalId: string): Promise<void>;
  onMessage(message: string): void;
}

export const WorkflowProposalSheet = ({ onApprove, onMessage }: WorkflowProposalSheetProps) => {
  const [approvalFailure, setApprovalFailure] = useState<{
    proposalId: string;
    message: string;
  } | null>(null);
  const open = useAppStore((state) => state.dialogs.proposalSheetOpen);
  const proposals = useAppStore((state) => state.proposals);
  const approved = useAppStore((state) => state.approvedWorkflowTools);
  const journeyChecks = useAppStore((state) => state.journeyChecks);
  const proposal = Object.values(proposals)
    .filter((item) => item.status === "awaiting_approval")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);
  const setDialog = useAppStore((state) => state.setDialog);
  const returnToEdit = useAppStore((state) => state.human.returnProposalToEdit);
  const reject = useAppStore((state) => state.human.rejectProposal);
  const close = useCallback(() => setDialog("proposalSheetOpen", false), [setDialog]);
  const renderedOpen = open && Boolean(proposal);
  const dialogRef = useDialogFocus(renderedOpen, close);
  if (!renderedOpen || !proposal) return null;
  const blueprint = getServiceBlueprint(proposal.serviceId);
  const currentChecks = journeyChecks[proposal.viewId] ?? [];
  const blockingChecks = currentChecks.filter((check) => check.status === "fail");
  const validation = validateWorkflowProposal(proposal, {
    staticToolNames: STATIC_TOOL_NAMES,
    enabledCompiledToolNames: Object.values(approved)
      .filter((tool) => tool.enabled)
      .map((tool) => tool.name),
    journeyChecks: currentChecks,
  });
  const literalValue = (value: unknown): string => {
    const serialized = JSON.stringify(value);
    return serialized ?? "undefined";
  };
  const approve = async () => {
    setApprovalFailure(null);
    try {
      await onApprove(proposal.id);
      onMessage(`${proposal.name} registered.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The workflow could not be registered.";
      const current = useAppStore.getState().proposals[proposal.id];
      if (!current || current.status !== "awaiting_approval") {
        // Revalidation moved the proposal out of review; reconcile the
        // detached sheet and its focus-trap entry.
        setDialog("proposalSheetOpen", false);
      } else {
        // Adapter failures do not invalidate the reviewed definition. Keep
        // it in the modal review surface so the human can safely retry.
        setApprovalFailure({ proposalId: proposal.id, message });
      }
      onMessage(message);
    }
  };
  const approvalError =
    approvalFailure?.proposalId === proposal.id ? approvalFailure.message : undefined;
  const approvalReason = validation.valid
    ? undefined
    : `Resolve ${validation.errors.length} validation ${validation.errors.length === 1 ? "error" : "errors"} and ${blockingChecks.length} blocking ${blockingChecks.length === 1 ? "check" : "checks"} before approval.`;
  return (
    <div className="dialog-backdrop proposal-backdrop">
      <div
        ref={dialogRef}
        className="proposal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-title"
        data-proposal-id={proposal.id}
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
                  <div className="parameter-name">
                    <code>{parameter.name}</code>
                    <span>{parameter.required ? "Required" : "Optional"}</span>
                  </div>
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
                          <div
                            className="binding-detail"
                            key={`${binding.argument}-${binding.source}-${binding.key ?? literalValue(binding.value)}`}
                          >
                            <Database size={12} />
                            <span>Argument: {binding.argument}</span>
                            <span>Source: {binding.source}</span>
                            <span>Key: {binding.key ?? "—"}</span>
                            {binding.source === "literal" ? (
                              <span className="binding-value">
                                Value:{" "}
                                <code aria-label="Literal binding value">
                                  {literalValue(binding.value)}
                                </code>
                              </span>
                            ) : (
                              <span>Value: —</span>
                            )}
                          </div>
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
          <section
            className={`validation-summary ${validation.valid ? "validation-pass" : "validation-fail"}`}
            aria-label="Current proposal validation"
          >
            {validation.valid ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <div>
              <p>
                <strong>{validation.errors.length} current validation errors</strong>
                <strong>{blockingChecks.length} blocking journey checks</strong>
              </p>
              {validation.errors.length ? (
                <ul>
                  {validation.errors.map((error, index) => (
                    <li key={`${error.code}-${error.path ?? index}`}>{error.message}</li>
                  ))}
                </ul>
              ) : (
                <span>Validation passed against the current definition and checks.</span>
              )}
              {proposal.validationErrors.length ? (
                <div className="recorded-validation">
                  <span>Recorded validation details</span>
                  <ul>
                    {proposal.validationErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        </div>
        <footer className="dialog-actions">
          {approvalError ? (
            <p className="approval-attempt-error" role="alert">
              Registration did not complete. {approvalError} Review remains open; you can retry.
            </p>
          ) : null}
          {approvalReason ? (
            <p className="approval-disabled-reason" id="proposal-approval-reason">
              {approvalReason}
            </p>
          ) : null}
          <button
            className="button button-secondary"
            type="button"
            onClick={() => returnToEdit(proposal.id)}
          >
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
            disabled={!validation.valid}
            aria-describedby={approvalReason ? "proposal-approval-reason" : undefined}
            onClick={() => void approve()}
          >
            Approve &amp; Register
          </button>
        </footer>
      </div>
    </div>
  );
};
