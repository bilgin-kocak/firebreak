import { Clock, LockKeyhole, ShieldX } from "lucide-react";

import type { IncidentPolicy } from "../domain/airlockTypes";

export const PermissionEnvelope = ({ policy }: { policy: IncidentPolicy }) => (
  <section className="panel permission-panel" aria-labelledby="permission-title">
    <div className="panel-heading">
      <div>
        <span className="eyebrow">AUTHORITY ENVELOPE</span>
        <h2 id="permission-title">What autonomy can touch</h2>
      </div>
      <LockKeyhole size={18} aria-hidden="true" />
    </div>
    <dl className="permission-grid">
      <div>
        <dt>Service scope</dt>
        <dd className="mono">checkout-api only</dd>
      </div>
      <div>
        <dt>Mutation budget</dt>
        <dd>1 production change</dd>
      </div>
      <div>
        <dt>Use limit</dt>
        <dd>{policy.used ? "Consumed" : "One use"}</dd>
      </div>
      <div>
        <dt>Proof revision</dt>
        <dd className="mono">r{policy.simulationRevision}</dd>
      </div>
    </dl>
    <div className="forbidden-list">
      <span>
        <ShieldX size={15} aria-hidden="true" /> Never allowed
      </span>
      <ul>
        <li>Customer data export</li>
        <li>Record deletion</li>
        <li>Secret access</li>
        <li>Unrelated services</li>
      </ul>
    </div>
    <p className="expiry-line">
      <Clock size={14} aria-hidden="true" /> Time-bound and revision-bound approval
    </p>
  </section>
);
