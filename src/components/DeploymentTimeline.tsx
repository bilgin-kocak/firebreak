import { GitCommitHorizontal, Rocket } from "lucide-react";

import type { DeploymentRecord } from "../domain/airlockTypes";

export const DeploymentTimeline = ({ deployments }: { deployments: DeploymentRecord[] }) => (
  <section className="panel deployment-panel" aria-labelledby="deployments-title">
    <div className="panel-heading">
      <div>
        <span className="eyebrow">RELEASE CORRELATION</span>
        <h2 id="deployments-title">Checkout deployments</h2>
      </div>
      <Rocket size={18} />
    </div>
    <div className="deployment-track">
      {deployments.map((deployment) => {
        const status = deployment.current
          ? deployment.stable
            ? "CURRENT · restored stable"
            : "CURRENT · incident release"
          : deployment.stable
            ? "PREVIOUS · verified stable"
            : "ROLLED BACK · incident release";

        return (
          <article
            className={deployment.stable ? "deployment-stable" : "deployment-current"}
            key={deployment.id}
          >
            <span className="deployment-dot" aria-hidden="true" />
            <div>
              <strong className="mono">{deployment.version}</strong>
              <small>{status}</small>
            </div>
            <span className="commit mono">
              <GitCommitHorizontal size={13} /> {deployment.commit}
            </span>
          </article>
        );
      })}
    </div>
  </section>
);
