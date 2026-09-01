import type { WebMCPRegisteredTool, WebMCPToolDefinition } from "../webmcp/types";

/**
 * Installs the narrow native-like browser boundary used by Playwright.
 *
 * Keep this function self-contained: Playwright serializes it into an init script,
 * before the application bundle runs. Production code never imports or installs it.
 */
export function installModelContextMock(): void {
  interface StoredTool {
    definition: WebMCPToolDefinition;
    descriptor: WebMCPRegisteredTool;
    unregister?: () => void;
  }

  const tools = new Map<string, StoredTool>();
  const events = new EventTarget();
  const emitToolChange = () => events.dispatchEvent(new Event("toolchange"));

  const modelContext: NonNullable<Document["modelContext"]> = {
    async registerTool(definition, options = {}) {
      if (tools.has(definition.name)) {
        throw new Error(`Tool '${definition.name}' is already registered.`);
      }
      if (options.signal?.aborted) {
        throw new DOMException("Tool registration was cancelled.", "AbortError");
      }

      const unregister = options.signal
        ? () => {
            const active = tools.get(definition.name);
            if (active?.definition !== definition) return;
            tools.delete(definition.name);
            emitToolChange();
          }
        : undefined;

      const descriptor: WebMCPRegisteredTool = {
        name: definition.name,
        description: definition.description,
        inputSchema: structuredClone(definition.inputSchema),
        annotations: structuredClone(definition.annotations),
        origin: window.location.origin,
        window,
      };
      tools.set(definition.name, { definition, descriptor, unregister });
      if (options.signal && unregister) {
        options.signal.addEventListener("abort", unregister, { once: true });
      }
      emitToolChange();
    },

    async getTools(): Promise<WebMCPRegisteredTool[]> {
      return [...tools.values()].map(({ descriptor }) => descriptor);
    },

    async executeTool(tool, input, options = {}) {
      const stored = tools.get(tool.name);
      if (!stored) throw new Error(`Tool '${tool.name}' is not registered.`);
      if (stored.descriptor !== tool) {
        throw new Error(`Tool '${tool.name}' descriptor is not registered by this context.`);
      }
      if (options.signal?.aborted) {
        throw new DOMException("Tool execution was cancelled.", "AbortError");
      }
      return stored.definition.execute(structuredClone(input), { signal: options.signal });
    },

    addEventListener(type, listener) {
      events.addEventListener(type, listener);
    },

    removeEventListener(type, listener) {
      events.removeEventListener(type, listener);
    },
  };

  Object.defineProperty(document, "modelContext", {
    configurable: true,
    enumerable: true,
    value: modelContext,
  });
}
