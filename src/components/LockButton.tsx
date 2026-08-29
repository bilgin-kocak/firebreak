import { Lock, Unlock } from "lucide-react";

interface LockButtonProps {
  locked: boolean;
  label: string;
  onToggle(): void;
}

export const LockButton = ({ locked, label, onToggle }: LockButtonProps) => (
  <button
    className={`lock-button ${locked ? "is-locked" : ""}`}
    type="button"
    onClick={onToggle}
    aria-pressed={locked}
    aria-label={`${locked ? "Unlock" : "Lock"} ${label}`}
  >
    {locked ? <Lock size={16} /> : <Unlock size={16} />}
    {locked ? "Locked by you." : "Lock"}
  </button>
);
