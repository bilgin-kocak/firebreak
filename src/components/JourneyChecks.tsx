import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import { useAppStore } from "../store/useAppStore";

export const JourneyChecks = () => {
  const activeViewId = useAppStore((state) => state.activeViewId);
  const storedChecks = useAppStore((state) =>
    activeViewId ? state.journeyChecks[activeViewId] : undefined,
  );
  const checks = storedChecks ?? [];
  const blocking = checks.filter((check) => check.status === "fail").length;
  return (
    <section className="rail-panel" aria-labelledby="checks-heading">
      <div className="rail-panel-heading">
        <div>
          <p className="eyebrow">Deterministic</p>
          <h2 id="checks-heading">Journey checks</h2>
        </div>
        {checks.length ? (
          <span className={blocking ? "count-badge warning" : "count-badge success"}>
            {blocking} blocking checks
          </span>
        ) : null}
      </div>
      {checks.length ? (
        <ul className="check-list">
          {checks.map((check) => (
            <li key={check.id} className={`check-${check.status}`}>
              {check.status === "pass" ? (
                <CheckCircle2 size={17} />
              ) : check.status === "fail" ? (
                <XCircle size={17} />
              ) : (
                <AlertTriangle size={17} />
              )}
              <p>
                <strong>{check.title}</strong>
                <small>{check.detail}</small>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <CircleDashed size={22} />
          <p>
            <strong>Checks have not run</strong>
            <span>Compile a task view, then run deterministic checks.</span>
          </p>
        </div>
      )}
    </section>
  );
};
