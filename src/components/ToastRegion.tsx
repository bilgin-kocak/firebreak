import { X } from "lucide-react";

export const ToastRegion = ({ message, onDismiss }: { message: string; onDismiss(): void }) => (
  <div className="toast-region" aria-live="polite" aria-atomic="true">
    {message ? (
      <div className="toast">
        <span>{message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={onDismiss}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    ) : null}
  </div>
);
