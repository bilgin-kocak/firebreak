import { Activity, ListChecks, Wrench } from "lucide-react";

import { useAppStore, type RightRailTab } from "../store/useAppStore";
import { ActivityLedger } from "./ActivityLedger";
import { JourneyChecks } from "./JourneyChecks";
import { ToolSurface } from "./ToolSurface";

interface RightRailProps {
  onDisable(name: string): void;
  onDelete(name: string): void;
}
const tabs: Array<[RightRailTab, string, typeof Activity]> = [
  ["activity", "Activity", Activity],
  ["tool_surface", "Tool Surface", Wrench],
  ["checks", "Checks", ListChecks],
];

export const RightRail = ({ onDisable, onDelete }: RightRailProps) => {
  const active = useAppStore((state) => state.rightRail.activeTab);
  const setTab = useAppStore((state) => state.setRightRail);
  const registeredCount = useAppStore((state) => state.webmcp.registeredToolNames.length);
  return (
    <aside className="right-rail" aria-label="Session inspector">
      <div className="rail-tabs" role="tablist" aria-label="Session inspector panels">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`panel-${id}`}
            type="button"
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`}>
        {active === "activity" ? (
          <ActivityLedger />
        ) : active === "tool_surface" ? (
          <ToolSurface onDisable={onDisable} onDelete={onDelete} />
        ) : (
          <JourneyChecks />
        )}
      </div>
      <p className="rail-status" aria-live="polite">
        {registeredCount} registered tools
      </p>
    </aside>
  );
};
