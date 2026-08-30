import { Bot, Clock3, MapPinned, ShieldCheck, X } from "lucide-react";

import type { MissionProposal } from "../domain/firebreakTypes";

export function AuthorizationSheet({
  proposal,
  busy,
  onAuthorize,
  onClose,
}: {
  proposal: MissionProposal;
  busy: boolean;
  onAuthorize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop">
      <section
        className="authorization-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="authorize-title"
      >
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Close mission proposal">
          <X aria-hidden="true" />
        </button>
        <div className="sheet-kicker">
          <ShieldCheck size={16} aria-hidden="true" /> Human decision boundary
        </div>
        <h2 id="authorize-title">Authorize rescue mission</h2>
        <p className="sheet-lede">
          The agent planned and proved the route. Only you can give the robots temporary movement authority.
        </p>
        <div className="authority-grid">
          <article>
            <Bot aria-hidden="true" />
            <strong>Four allowlisted robots</strong>
            <span>SCOUT-1 · MEDIC-2 · SUPPRESS-3 · HAUL-4</span>
          </article>
          <article>
            <MapPinned aria-hidden="true" />
            <strong>Collapse zone excluded</strong>
            <span>Exact reviewed routes only. No free-form topics or targets.</span>
          </article>
          <article>
            <Clock3 aria-hidden="true" />
            <strong>One use · 5 minute expiry</strong>
            <span>Stops on cancellation, failure, completion, or authority loss.</span>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <strong>11 / 11 safety gates</strong>
            <span>State, geofence, separation, battery, role, duration, and rollback.</span>
          </article>
        </div>
        <details className="route-proof">
          <summary>Review compiled mission proof</summary>
          <code>{proposal.id}</code>
          <ul>
            {proposal.allowedRobotIds.map((robotId) => (
              <li key={robotId}>
                {robotId}: {proposal.routes[robotId].waypoints.length} bounded waypoints
              </li>
            ))}
          </ul>
        </details>
        <button
          className="authorize-button"
          type="button"
          disabled={busy}
          onClick={onAuthorize}
        >
          <ShieldCheck aria-hidden="true" /> {busy ? "Registering mission…" : "Authorize one mission"}
        </button>
        <p className="authority-footnote">This click is never available to the agent.</p>
      </section>
    </div>
  );
}
