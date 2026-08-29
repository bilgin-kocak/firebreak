import { useCallback, useEffect, useRef, useState } from "react";

import { DeleteToolDialog } from "../components/DeleteToolDialog";
import { FinalConfirmationDialog } from "../components/FinalConfirmationDialog";
import { Header } from "../components/Header";
import { PortalShell } from "../components/PortalShell";
import { RightRail } from "../components/RightRail";
import { ToastRegion } from "../components/ToastRegion";
import { UnsupportedBrowserNotice } from "../components/UnsupportedBrowserNotice";
import { WebMCPSimulator } from "../components/WebMCPSimulator";
import { WorkflowProposalSheet } from "../components/WorkflowProposalSheet";
import { useAppStore, type SubmissionConfirmation } from "../store/useAppStore";
import { bootAppRuntime, type AppRuntime } from "./runtime";

const rootTextClasses = ["text-size-normal", "text-size-large", "text-size-xlarge"];

export const App = () => {
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const runtimeRef = useRef<AppRuntime | null>(null);
  const deleteOpenerRef = useRef<HTMLElement | null>(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SubmissionConfirmation | null>(null);
  const mode = useAppStore((state) => state.webmcp.mode);
  const activeViewId = useAppStore((state) => state.activeViewId);
  const textSize = useAppStore((state) =>
    activeViewId ? state.views[activeViewId]?.preferences.textSize : undefined,
  );
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
        useAppStore.getState().setWebMCPMetadata({ mode: "unavailable" });
        setToast(error instanceof Error ? error.message : "WebMCP tools could not be initialized.");
      });
    return () => {
      active = false;
      created?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove(...rootTextClasses);
    document.documentElement.classList.add(`text-size-${textSize ?? "normal"}`);
    return () => document.documentElement.classList.remove(...rootTextClasses);
  }, [textSize]);

  const resetDemo = useCallback(async () => {
    await reset();
    const currentRuntime = runtimeRef.current;
    if (currentRuntime) {
      const tools = await currentRuntime.adapter.getTools();
      setMetadata({
        mode: currentRuntime.adapter.mode,
        registeredToolNames: tools.map((tool) => tool.name).sort(),
        lastToolChangeAt: new Date().toISOString(),
      });
    }
    setConfirmation(null);
    setDeleteTarget(null);
    setSimulatorOpen(false);
    setToast("Demo reset.");
  }, [reset, setMetadata]);
  const closeSimulator = useCallback(() => setSimulatorOpen(false), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const openDelete = useCallback((name: string, opener: HTMLElement) => {
    deleteOpenerRef.current = opener;
    setDeleteTarget(name);
  }, []);

  const disableTool = (name: string) => {
    try {
      runtime?.dynamicTools.disable(name);
      setToast(`${name} disabled.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The tool could not be disabled.");
    }
  };
  const deleteTool = (name: string) => {
    try {
      runtime?.dynamicTools.delete(name);
      setDeleteTarget(null);
      setToast(`${name} deleted.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The tool could not be deleted.");
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header
        mode={mode}
        onReset={() => void resetDemo()}
        onOpenSimulator={() => setSimulatorOpen(true)}
      />
      <ToastRegion message={toast} onDismiss={() => setToast("")} />
      <div className="workspace-grid">
        <div className="workspace-primary">
          <UnsupportedBrowserNotice mode={mode} />
          <PortalShell
            confirmation={confirmation}
            onBack={() => void resetDemo()}
            onCopied={setToast}
          />
        </div>
        <RightRail onDisable={disableTool} onDelete={openDelete} onCopied={setToast} />
      </div>
      <footer className="site-footer">
        CivicWeave and Northstar City are fictional. This demonstration does not connect to a
        government service or submit real information.
      </footer>
      <WorkflowProposalSheet
        onApprove={async (proposalId) => {
          if (!runtime) throw new Error("WebMCP is still starting.");
          await runtime.dynamicTools.approveAndRegister(proposalId);
        }}
        onMessage={setToast}
      />
      <FinalConfirmationDialog
        onConfirmed={(result) => {
          setSimulatorOpen(false);
          setConfirmation(result);
          setToast("Fictional submission confirmed.");
        }}
      />
      <WebMCPSimulator
        open={simulatorOpen}
        runtime={runtime}
        onClose={closeSimulator}
        onMessage={setToast}
      />
      <DeleteToolDialog
        name={deleteTarget}
        returnFocusTarget={deleteOpenerRef.current}
        onClose={closeDelete}
        onDelete={deleteTool}
      />
    </div>
  );
};
