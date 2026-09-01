import { BrowserSimulationDriver } from "../control/browserSimulationDriver";
import type { MissionRobotDriver } from "../control/controlTypes";
import { FirebreakError } from "../domain/firebreakTypes";
import { getFirebreakState } from "../store/useFirebreakStore";
import type { WebMCPAdapter } from "../webmcp/adapter";
import { DynamicMissionToolManager } from "../webmcp/dynamicToolManager";
import { createMemoryAdapter } from "../webmcp/memoryAdapter";
import { createNativeAdapter } from "../webmcp/nativeAdapter";
import { registerStaticTools } from "../webmcp/registerStaticTools";
import { ToolRegistry } from "../webmcp/registry";

interface SuccessfulToolResult {
  ok: true;
  data?: Record<string, unknown>;
}

export interface AppRuntime {
  adapter: WebMCPAdapter;
  registry: ToolRegistry;
  dynamicTools: DynamicMissionToolManager;
  driver: MissionRobotDriver;
  runPromptA(): Promise<void>;
  authorizeMission(proposalId: string): Promise<void>;
  runPromptB(): Promise<void>;
  destroy(): Promise<void>;
  dispose(): void;
}

export interface AppRuntimeOptions {
  accelerated?: boolean;
  driver?: MissionRobotDriver;
  now?: () => number;
}

const supportsNativeWebMCP = (
  modelContext: Document["modelContext"],
): modelContext is NonNullable<Document["modelContext"]> =>
  Boolean(modelContext && typeof modelContext.registerTool === "function");

function expectSuccess(result: unknown): SuccessfulToolResult {
  if (
    typeof result !== "object" ||
    result === null ||
    !("ok" in result) ||
    (result as { ok: unknown }).ok !== true
  ) {
    const message =
      typeof result === "object" && result !== null && "message" in result
        ? String((result as { message: unknown }).message)
        : "The WebMCP journey stopped safely.";
    throw new FirebreakError("OPERATION_FAILED", message);
  }
  return result as SuccessfulToolResult;
}

export const bootAppRuntime = async (options: AppRuntimeOptions = {}): Promise<AppRuntime> => {
  const modelContext = document.modelContext;
  const adapter = supportsNativeWebMCP(modelContext)
    ? createNativeAdapter(modelContext)
    : createMemoryAdapter();
  const registry = new ToolRegistry(adapter, { now: options.now });
  const rootController = new AbortController();
  await registerStaticTools(registry, { now: options.now }, { signal: rootController.signal });

  const driver =
    options.driver ??
    new BrowserSimulationDriver({
      readSnapshot: () => getFirebreakState().world,
      commitSnapshot: (snapshot) => getFirebreakState().replaceWorld(snapshot),
      playbackRate: options.accelerated ? 100_000 : 10,
      ...(options.accelerated ? { wait: async () => undefined } : {}),
    });
  await driver.connect();
  const dynamicTools = new DynamicMissionToolManager(registry, {
    driver,
    now: options.now,
  });
  let destroyed = false;

  const runtime: AppRuntime = {
    adapter,
    registry,
    dynamicTools,
    driver,
    async runPromptA() {
      expectSuccess(await adapter.executeTool("inspect_emergency", { incidentId: "WH-01" }));
      expectSuccess(
        await adapter.executeTool("scan_hazards", {
          incidentId: "WH-01",
          sensorMode: "thermal",
        }),
      );
      expectSuccess(await adapter.executeTool("inspect_fleet", { incidentId: "WH-01" }));
      const simulation = expectSuccess(
        await adapter.executeTool("simulate_mission", {
          incidentId: "WH-01",
          strategy: "coordinated",
        }),
      );
      const simulationId = String(simulation.data?.simulationId ?? "");
      expectSuccess(await adapter.executeTool("validate_safety_envelope", { simulationId }));
      expectSuccess(
        await adapter.executeTool("stage_mission_tool", {
          simulationId,
          toolName: "execute_rescue_mission",
        }),
      );
      expectSuccess(await adapter.executeTool("list_mission_tools", { incidentId: "WH-01" }));
    },
    async authorizeMission(proposalId) {
      await dynamicTools.approveAndRegister(proposalId);
    },
    async runPromptB() {
      expectSuccess(
        await adapter.executeTool("execute_rescue_mission", {
          strategy: "coordinated",
        }),
      );
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        await dynamicTools.destroy();
        await driver.disconnect();
      } finally {
        rootController.abort(new Error("Firebreak runtime destroyed"));
        await registry.settleToolChanges();
        registry.dispose();
      }
    },
    dispose() {
      void runtime.destroy();
    },
  };
  return runtime;
};
