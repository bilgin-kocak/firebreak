import { useEffect, useRef } from "react";

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const dialogStack: HTMLElement[] = [];

export const useDialogFocus = (
  open: boolean,
  onClose: () => void,
  returnTarget?: HTMLElement | null,
  getFallbackTarget?: () => HTMLElement | null,
) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const capturedTarget =
      returnTarget ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const dialog = dialogRef.current;
    if (dialog) dialogStack.push(dialog);
    const controls = () =>
      dialog ? [...dialog.querySelectorAll<HTMLElement>(focusableSelector)] : [];
    const initial = dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? controls()[0];
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialog && dialogStack.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const available = controls();
      const first = available[0];
      const last = available.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (dialog) {
        const index = dialogStack.lastIndexOf(dialog);
        if (index >= 0) dialogStack.splice(index, 1);
      }
      if (capturedTarget?.isConnected) capturedTarget.focus();
      else {
        const fallback = getFallbackTarget?.();
        if (fallback?.isConnected) fallback.focus();
        else {
          // A successful action can replace the entire view in the same React
          // commit that removes this dialog. Let that replacement mount before
          // resolving its meaningful focus destination.
          window.setTimeout(() => getFallbackTarget?.()?.focus(), 0);
        }
      }
    };
  }, [getFallbackTarget, onClose, open, returnTarget]);

  return dialogRef;
};
