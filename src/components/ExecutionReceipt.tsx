import { Ban, CheckCircle2, CircleX, Fingerprint, ShieldBan } from "lucide-react";

import type { ExecutionReceipt as Receipt } from "../domain/airlockTypes";

export const ExecutionReceipt = ({ receipt }: { receipt: Receipt }) => {
  const resolved = receipt.status === "incident_resolved";
  const cancelled = receipt.status === "cancelled";
  const title = resolved
    ? "Checkout recovered"
    : cancelled
      ? "Recovery cancelled"
      : "Recovery failed";
  const releaseSummary = resolved
    ? `${receipt.fromRelease} → ${receipt.toRelease}`
    : `${receipt.fromRelease} retained · ${receipt.toRelease} not promoted`;

  return (
    <section
      className={`panel receipt-panel receipt-${receipt.status}`}
      aria-labelledby="receipt-title"
    >
      <div className="receipt-seal">
        {resolved ? (
          <CheckCircle2 size={24} aria-hidden="true" />
        ) : cancelled ? (
          <Ban size={24} aria-hidden="true" />
        ) : (
          <CircleX size={24} aria-hidden="true" />
        )}
      </div>
      <div>
        <span className="eyebrow">
          {resolved
            ? "IMMUTABLE EXECUTION RECEIPT"
            : cancelled
              ? "CANCELLED EXECUTION RECEIPT"
              : "FAILED EXECUTION RECEIPT"}
        </span>
        <h2 id="receipt-title">{title}</h2>
        <p className="mono">{releaseSummary}</p>
      </div>
      <dl>
        <div>
          <dt>Error rate</dt>
          <dd>{receipt.finalErrorRate}%</dd>
        </div>
        <div>
          <dt>p95 latency</dt>
          <dd>{receipt.finalP95LatencyMs} ms</dd>
        </div>
        <div>
          <dt>Mutations</dt>
          <dd>{receipt.productionMutations}</dd>
        </div>
        <div>
          <dt>Canary</dt>
          <dd>{receipt.canaryPercent}%</dd>
        </div>
      </dl>
      <p className="receipt-proof">
        <ShieldBan size={15} /> {receipt.blockedEvidenceIds.length} hostile evidence path blocked
      </p>
      <p className="receipt-id mono">
        <Fingerprint size={14} /> {receipt.id}
      </p>
    </section>
  );
};
