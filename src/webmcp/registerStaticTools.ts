import type { ToolRegistry } from "./registry";
import { createStaticToolDefinitions, type StaticToolDependencies } from "./staticToolDefinitions";

export const registerStaticTools = async (
  registry: ToolRegistry,
  dependencies: StaticToolDependencies = {},
): Promise<void> => {
  for (const definition of createStaticToolDefinitions(dependencies)) {
    await registry.register(definition);
  }
};
