import { CheckCircle2, Fingerprint, ShieldBan } from "lucide-react";

import type { ExecutionReceipt as Receipt } from "../domain/airlockTypes";

export const ExecutionReceipt = ({ receipt }: { receipt: Receipt }) => (
  <section className="panel receipt-panel" aria-labelledby="receipt-title">
    <div className="receipt-seal">
      <CheckCircle2 size={24} aria-hidden="true" />
    </div>
    <div>
      <span className="eyebrow">IMMUTABLE EXECUTION RECEIPT</span>
      <h2 id="receipt-title">Checkout recovered</h2>
      <p>
        <span className="mono">{receipt.fromRelease}</span> →{" "}
        <span className="mono">{receipt.toRelease}</span>
      </p>
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
