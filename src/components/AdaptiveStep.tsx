import type { ReactNode } from "react";

import { LockButton } from "./LockButton";

interface AdaptiveStepProps {
  index: number;
  total: number;
  fieldId: string;
  locked: boolean;
  copyLocked: boolean;
  onToggleFieldLock(): void;
  onToggleCopyLock(): void;
  children: ReactNode;
}

export const AdaptiveStep = ({
  index,
  total,
  fieldId,
  locked,
  copyLocked,
  onToggleFieldLock,
  onToggleCopyLock,
  children,
}: AdaptiveStepProps) => (
  <section className="adaptive-step" data-field-id={fieldId}>
    <div className="adaptive-step-tools">
      <span>
        Question {index + 1} of {total}
      </span>
      <div>
        <LockButton
          label={`${fieldId === "vehicleId" ? "vehicle" : fieldId} field`}
          locked={locked}
          onToggle={onToggleFieldLock}
        />
        <LockButton label={`${fieldId} copy`} locked={copyLocked} onToggle={onToggleCopyLock} />
      </div>
    </div>
    {children}
  </section>
);
