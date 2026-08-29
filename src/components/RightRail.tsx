import { Activity, ListChecks, Wrench } from "lucide-react";
import type { KeyboardEvent } from "react";

import { useAppStore, type RightRailTab } from "../store/useAppStore";
import { ActivityLedger } from "./ActivityLedger";
import { JourneyChecks } from "./JourneyChecks";
import { ToolSurface } from "./ToolSurface";

interface RightRailProps {
  onDisable(name: string): void;
  onDelete(name: string, opener: HTMLElement): void;
  onCopied(message: string): void;
}
const tabs: Array<[RightRailTab, string, typeof Activity]> = [
  ["activity", "Activity", Activity],
  ["tool_surface", "Tool Surface", Wrench],
  ["checks", "Checks", ListChecks],
];

export const RightRail = ({ onDisable, onDelete, onCopied }: RightRailProps) => {
  const active = useAppStore((state) => state.rightRail.activeTab);
  const setTab = useAppStore((state) => state.setRightRail);
  const registeredCount = useAppStore((state) => state.webmcp.registeredToolNames.length);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex]?.[0];
    if (!nextTab) return;
    setTab(nextTab);
    document.getElementById(`tab-${nextTab}`)?.focus();
  };
  return (
    <aside className="right-rail" aria-label="Session inspector">
      <div className="rail-tabs" role="tablist" aria-label="Session inspector panels">
        {tabs.map(([id, label, Icon], index) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            aria-selected={active === id}
            aria-controls={`panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            type="button"
            onClick={() => setTab(id)}
            onKeyDown={(event) => handleTabKey(event, index)}
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
          <ToolSurface onDisable={onDisable} onDelete={onDelete} onCopied={onCopied} />
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
