import { Info } from "lucide-react";

export const UnsupportedBrowserNotice = ({
  mode,
}: {
  mode: "native" | "memory" | "unavailable";
}) =>
  mode === "memory" ? (
    <aside className="notice" aria-label="WebMCP browser status">
      <Info size={17} />
      <p>
        <strong>WebMCP Simulator is active.</strong> The same trusted tools run locally in this
        browser.
      </p>
    </aside>
  ) : null;
