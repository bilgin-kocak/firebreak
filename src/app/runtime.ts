import type { WebMCPAdapter } from "../webmcp/adapter";
import { DynamicToolManager } from "../webmcp/dynamicToolManager";
import { createMemoryAdapter } from "../webmcp/memoryAdapter";
import { createNativeAdapter } from "../webmcp/nativeAdapter";
import { registerStaticTools } from "../webmcp/registerStaticTools";
import { ToolRegistry } from "../webmcp/registry";

export interface AppRuntime {
  adapter: WebMCPAdapter;
  registry: ToolRegistry;
  dynamicTools: DynamicToolManager;
  dispose(): void;
}

const supportsNativeWebMCP = (
  modelContext: Document["modelContext"],
): modelContext is NonNullable<Document["modelContext"]> =>
  Boolean(
    modelContext &&
    typeof modelContext.registerTool === "function" &&
    typeof modelContext.getTools === "function" &&
    typeof modelContext.executeTool === "function" &&
    typeof modelContext.addEventListener === "function" &&
    typeof modelContext.removeEventListener === "function",
  );

export const bootAppRuntime = async (): Promise<AppRuntime> => {
  const modelContext = document.modelContext;
  const adapter = supportsNativeWebMCP(modelContext)
    ? createNativeAdapter(modelContext)
    : createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry);
  const dynamicTools = new DynamicToolManager(registry);
  await dynamicTools.restoreEnabled();
  return {
    adapter,
    registry,
    dynamicTools,
    dispose() {
      void dynamicTools.disposeAll();
      registry.dispose();
    },
  };
};
