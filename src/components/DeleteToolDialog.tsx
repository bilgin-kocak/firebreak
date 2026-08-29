import { Trash2, X } from "lucide-react";
import { useCallback } from "react";

import { useDialogFocus } from "./useDialogFocus";

interface DeleteToolDialogProps {
  name: string | null;
  returnFocusTarget: HTMLElement | null;
  onClose(): void;
  onDelete(name: string): void;
}

export const DeleteToolDialog = ({
  name,
  returnFocusTarget,
  onClose,
  onDelete,
}: DeleteToolDialogProps) => {
  const close = useCallback(() => onClose(), [onClose]);
  const findFallback = useCallback(
    () => document.querySelector<HTMLElement>("#tool-surface-heading"),
    [],
  );
  const dialogRef = useDialogFocus(Boolean(name), close, returnFocusTarget, findFallback);
  if (!name) return null;
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="small-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Human confirmation</p>
            <h2 id="delete-title">Delete compiled tool</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            aria-label="Close delete confirmation"
          >
            <X size={20} />
          </button>
        </header>
        <div className="small-dialog-body">
          <p>
            Delete <code>{name}</code> from saved workflow definitions? It will no longer be
            available in this browser.
          </p>
        </div>
        <footer className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={close}>
            Cancel
          </button>
          <button
            className="button button-danger"
            data-autofocus
            type="button"
            onClick={() => onDelete(name)}
          >
            <Trash2 size={17} /> Delete tool
          </button>
        </footer>
      </div>
    </div>
  );
};
