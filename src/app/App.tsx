import { useCallback, useEffect, useRef, useState } from "react";

import { AirlockSimulator } from "../components/AirlockSimulator";
import { IncidentCommandCenter } from "../components/IncidentCommandCenter";
import { IncidentHeader } from "../components/IncidentHeader";
import { ResponseProposalSheet } from "../components/ResponseProposalSheet";
import { ToastRegion } from "../components/ToastRegion";
import { useAppStore } from "../store/useAppStore";
import { bootAppRuntime, type AppRuntime } from "./runtime";

export const App = () => {
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const [toast, setToast] = useState("");
  const incident = useAppStore((state) => state.incidentState.incident);
  const mode = useAppStore((state) => state.webmcp.mode);
  const simulatorOpen = useAppStore((state) => state.dialogs.simulatorOpen);
  const setDialog = useAppStore((state) => state.setDialog);
  const reset = useAppStore((state) => state.reset);
  const setMetadata = useAppStore((state) => state.setWebMCPMetadata);

  useEffect(() => {
    let active = true;
    let created: AppRuntime | null = null;
    useAppStore.getState().hydrateFromPersistence();
    void bootAppRuntime()
      .then((next) => {
        created = next;
        if (!active) {
          next.dispose();
          return;
        }
        runtimeRef.current = next;
        setRuntime(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMetadata({ mode: "unavailable" });
        setToast(error instanceof Error ? error.message : "WebMCP initialization failed safely.");
      });
    return () => {
      active = false;
      created?.dispose();
      runtimeRef.current = null;
    };
  }, [setMetadata]);

  const resetDemo = useCallback(async () => {
    await reset();
    setToast("Airlock reset to INC-4821.");
  }, [reset]);

  return (
    <div className="app-shell">
      <IncidentHeader
        incident={incident}
        mode={mode}
        onOpenSimulator={() => setDialog("simulatorOpen", true)}
        onReset={() => void resetDemo()}
      />
      <ToastRegion message={toast} onDismiss={() => setToast("")} />
      <IncidentCommandCenter runtime={runtime} onMessage={setToast} />
      <ResponseProposalSheet
        onApprove={async (proposalId) => {
          if (!runtime) throw new Error("WebMCP is still starting.");
          await runtime.dynamicTools.approveAndRegister(proposalId);
        }}
        onMessage={setToast}
      />
      <AirlockSimulator
        open={simulatorOpen}
        runtime={runtime}
        onClose={() => setDialog("simulatorOpen", false)}
        onMessage={setToast}
      />
    </div>
  );
};
