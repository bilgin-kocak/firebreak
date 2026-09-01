import { afterEach, describe, expect, it } from "vitest";

import type { WebMCPToolDefinition } from "../webmcp/types";
import { installModelContextMock } from "./modelContextMock";

const definition: WebMCPToolDefinition = {
  name: "inspect_emergency",
  description: "Inspect the emergency.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  async execute(input) {
    return input;
  },
};

describe("native-like model context boundary", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "modelContext");
  });

  it("executes only stable identity-bearing descriptors returned by this context", async () => {
    installModelContextMock();
    const modelContext = document.modelContext!;
    await modelContext.registerTool(definition);
    const [registered] = await modelContext.getTools!();

    expect(registered).toMatchObject({
      name: definition.name,
      origin: window.location.origin,
      window,
    });
    await expect(modelContext.executeTool!({ ...registered! }, {})).rejects.toThrow(
      /descriptor is not registered/i,
    );
    await expect(modelContext.executeTool!(registered!, { incidentId: "WH-01" })).resolves.toEqual({
      incidentId: "WH-01",
    });
  });
});
