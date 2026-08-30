import { FirebreakError } from "../domain/firebreakTypes";
import type { WebMCPAdapter } from "./adapter";

type NativeModelContext = NonNullable<Document["modelContext"]>;

export const createNativeAdapter = (modelContext: NativeModelContext): WebMCPAdapter => ({
  mode: "native",
  async registerTool(definition, options) {
    if (!document.modelContext) {
      throw new FirebreakError("UNSUPPORTED_BROWSER", "Native WebMCP is not available.");
    }
    // Keep the standard top-level integration explicit and reviewable in the production bundle.
    await document.modelContext.registerTool(definition, { signal: options?.signal });
  },
  async getTools() {
    return modelContext.getTools();
  },
  async executeTool(name, input, signal) {
    return modelContext.executeTool(name, input, { signal });
  },
  subscribeToToolChange(listener) {
    modelContext.addEventListener("toolchange", listener);
    return () => modelContext.removeEventListener("toolchange", listener);
  },
});
