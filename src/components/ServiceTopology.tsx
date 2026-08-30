import { Box, Check, Database, Server, ShieldBan, ShoppingCart } from "lucide-react";

import type { DependencyEdge, RecoveryPhase, ServiceNode } from "../domain/airlockTypes";

const icons = {
  storefront: ShoppingCart,
  "checkout-api": Server,
  payments: Box,
  orders: Database,
  inventory: Box,
};

export const ServiceTopology = ({
  services,
  edges,
  phase,
  threatBlocked,
}: {
  services: ServiceNode[];
  edges: DependencyEdge[];
  phase: RecoveryPhase;
  threatBlocked: boolean;
}) => {
  const service = (id: ServiceNode["id"]) => services.find((node) => node.id === id)!;
  const node = (id: ServiceNode["id"], className: string) => {
    const item = service(id);
    const Icon = icons[id];
    return (
      <article className={`topology-node ${className} node-${item.status}`} data-service={id}>
        <span className="node-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="node-copy">
          <strong>{item.name}</strong>
          <small className="mono">{item.version}</small>
        </span>
        <span className="node-health">
          <b>{item.errorRate}%</b>
          <small>{item.status}</small>
        </span>
      </article>
    );
  };

  return (
    <section className={`topology-card phase-${phase}`} aria-labelledby="topology-title">
      <div className="panel-heading topology-heading">
        <div>
          <span className="eyebrow">LIVE SERVICE MAP</span>
          <h2 id="topology-title">Checkout failure propagation</h2>
        </div>
        <div className="topology-legend" aria-label="Status legend">
          <span>
            <i className="legend-critical" /> Critical
          </span>
          <span>
            <i className="legend-canary" /> Canary
          </span>
          <span>
            <i className="legend-healthy" /> Healthy
          </span>
        </div>
      </div>
      <div className="topology-field">
        <div className="topology-lines" aria-hidden="true">
          <span className="line line-a" />
          <span className="line line-b" />
          <span className="line line-c" />
          <span className="line line-d" />
        </div>
        {node("storefront", "node-storefront")}
        {node("checkout-api", "node-checkout")}
        {node("payments", "node-payments")}
        {node("orders", "node-orders")}
        {node("inventory", "node-inventory")}
        <div className={`threat-packet ${threatBlocked ? "is-blocked" : ""}`}>
          <ShieldBan size={18} aria-hidden="true" />
          <span>{threatBlocked ? "UNTRUSTED PATH BLOCKED" : "THIRD-PARTY LOG DETECTED"}</span>
        </div>
        {phase === "incident_resolved" ? (
          <div className="recovery-sweep" role="status">
            <Check size={18} aria-hidden="true" /> Recovery verified across checkout path
          </div>
        ) : null}
      </div>
      <details className="topology-alternative">
        <summary>Text view of service status and dependencies</summary>
        <ul>
          {services.map((item) => (
            <li key={item.id}>
              {item.name}: {item.status}; {item.errorRate}% errors; {item.p95LatencyMs} ms p95.
            </li>
          ))}
          {edges.map((edge) => (
            <li key={`${edge.from}-${edge.to}`}>
              {edge.from} connects to {edge.to}: {edge.status}.
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
};
