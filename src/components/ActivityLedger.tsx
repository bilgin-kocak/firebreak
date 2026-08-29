import { Bot, CircleCheck, CircleX, UserRound } from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";

export const ActivityLedger = () => {
  const storedActivity = useAppStore((state) => state.activity);
  const chronological = useAppStore((state) => state.rightRail.chronological);
  const setOrder = useAppStore((state) => state.setActivityChronological);
  const staticNames = new Set<string>(STATIC_TOOL_NAMES);
  const hasDynamicLifecycle = storedActivity.some(
    (entry) => entry.kind === "workflow_approved" || entry.kind === "tool_unregistered",
  );
  let keptToolChange = false;
  const visibleNewestFirst = storedActivity.filter((entry) => {
    if (entry.kind === "tool_registered" && entry.toolName && staticNames.has(entry.toolName)) {
      return false;
    }
    if (entry.kind === "toolchange") {
      if (!hasDynamicLifecycle || keptToolChange) return false;
      keptToolChange = true;
    }
    return true;
  });
  const activity = chronological ? [...visibleNewestFirst].reverse() : visibleNewestFirst;
  return (
    <section className="rail-panel" aria-labelledby="activity-heading">
      <div className="rail-panel-heading">
        <div>
          <p className="eyebrow">Shared session</p>
          <h2 id="activity-heading">Activity</h2>
        </div>
        <button className="text-button" type="button" onClick={() => setOrder(!chronological)}>
          {chronological ? "Newest first" : "Oldest first"}
        </button>
      </div>
      {activity.length ? (
        <ol className="activity-list">
          {activity.map((entry) => (
            <li key={entry.id}>
              <span className={`activity-icon status-${entry.status}`}>
                {entry.actor === "agent" ? (
                  <Bot size={15} />
                ) : entry.actor === "human" ? (
                  <UserRound size={15} />
                ) : entry.status === "error" ? (
                  <CircleX size={15} />
                ) : (
                  <CircleCheck size={15} />
                )}
              </span>
              <div>
                <p>
                  <strong>{entry.title}</strong>
                  <time dateTime={entry.timestamp}>
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </p>
                {entry.toolName ? <code>{entry.toolName}</code> : null}
                {entry.detail ? <small>{entry.detail}</small> : null}
                {entry.durationMs !== undefined ? (
                  <small>{Math.round(entry.durationMs)} ms</small>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <Bot size={22} />
          <p>
            <strong>No tool activity yet</strong>
            <span>WebMCP calls and human decisions will appear here.</span>
          </p>
        </div>
      )}
    </section>
  );
};
