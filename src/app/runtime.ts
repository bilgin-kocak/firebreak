import axe from "axe-core";

import { createMemoryAdapter } from "../webmcp/memoryAdapter";
import { createNativeAdapter } from "../webmcp/nativeAdapter";
import { registerStaticTools } from "../webmcp/registerStaticTools";
import { ToolRegistry } from "../webmcp/registry";
import { DynamicToolManager } from "../webmcp/dynamicToolManager";
import type { WebMCPAdapter } from "../webmcp/adapter";

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

const hasValidHeadingOrder = (root: ParentNode): boolean => {
  const levels = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) =>
    Number(heading.tagName.slice(1)),
  );
  return levels.every((level, index) => index === 0 || level - (levels[index - 1] ?? level) <= 1);
};

const createJourneyChecksProvider = () => ({
  async getContext() {
    const root = document.querySelector<HTMLElement>("#adaptive-workspace");
    return {
      presentation: {
        labelsPresent:
          root !== null &&
          [...root.querySelectorAll("input, select, textarea")].every(
            (control) =>
              Boolean(control.getAttribute("aria-label")) ||
              Boolean(control.id && root.querySelector(`label[for="${control.id}"]`)),
          ),
        headingOrderValid: root !== null && hasValidHeadingOrder(root),
        focusableControlsReachable:
          root !== null && root.querySelectorAll("button, input, select, textarea").length > 0,
        largeTargetsPresent: root?.querySelector(".large-card-control") !== null,
        progressPresent: root?.querySelector("progress, [role='progressbar']") !== null,
      },
      dom: {
        mounted: root !== null,
        runAxe: async () => {
          if (!root) return { violations: [] };
          const result = await axe.run(root);
          return {
            violations: result.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
            })),
          };
        },
      },
    };
  },
});

export const bootAppRuntime = async (): Promise<AppRuntime> => {
  const modelContext = document.modelContext;
  const adapter = supportsNativeWebMCP(modelContext)
    ? createNativeAdapter(modelContext)
    : createMemoryAdapter();
  const registry = new ToolRegistry(adapter);
  await registerStaticTools(registry, { journeyChecksProvider: createJourneyChecksProvider() });
  const dynamicTools = new DynamicToolManager(registry);
  await dynamicTools.restoreEnabled();

  return {
    adapter,
    registry,
    dynamicTools,
    dispose() {
      dynamicTools.disposeAll();
      registry.dispose();
    },
  };
};
