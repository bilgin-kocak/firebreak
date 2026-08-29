import { Bot, MousePointerClick, WandSparkles } from "lucide-react";

import { getServiceBlueprint } from "../domain/serviceBlueprints";
import { useAppStore } from "../store/useAppStore";

export const MetricsStrip = () => {
  const activeViewId = useAppStore((state) => state.activeViewId);
  const view = useAppStore((state) => (activeViewId ? state.views[activeViewId] : undefined));
  const metrics = useAppStore((state) => state.metrics);
  if (!view) return null;
  const manual = getServiceBlueprint(view.serviceId).baselineJourney.reduce(
    (sum, item) => sum + item.interactionCost,
    0,
  );
  const adaptive =
    view.fieldOrder.filter((id) => !view.hiddenOptionalFields.includes(id)).length + 1;
  return (
    <section className="metrics-strip" aria-label="Modeled journey comparison">
      <article>
        <MousePointerClick size={19} />
        <p>
          <span>Manual portal</span>
          <strong>{manual}</strong>
          <small>Modeled interaction count</small>
        </p>
      </article>
      <article>
        <WandSparkles size={19} />
        <p>
          <span>Adaptive view</span>
          <strong>{adaptive}</strong>
          <small>Modeled interaction count</small>
        </p>
      </article>
      <article>
        <Bot size={19} />
        <p>
          <span>Compiled tool</span>
          <strong>1 + 1</strong>
          <small>Agent call + human confirmation</small>
        </p>
      </article>
      <article className="actual-metrics">
        <span>{metrics.webmcpToolCalls} tool calls</span>
        <span>{metrics.humanEdits} human edits</span>
        <span>{metrics.humanLocksPreserved} locks preserved</span>
      </article>
    </section>
  );
};
