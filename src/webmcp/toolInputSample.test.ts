import { describe, expect, it } from "vitest";

import { createStaticToolDefinitions } from "./staticToolDefinitions";
import { createSchemaInputSample } from "./toolInputSample";

describe("Airlock simulator samples", () => {
  it("creates closed, JSON-compatible inputs for every static tool", () => {
    for (const tool of createStaticToolDefinitions()) {
      const sample = createSchemaInputSample(tool.inputSchema);
      expect(() => JSON.stringify(sample)).not.toThrow();
      expect(tool.inputValidator.safeParse(sample).success).toBe(true);
    }
  });

  it("uses the first bounded enum value deterministically", () => {
    expect(createSchemaInputSample({ type: "integer", enum: [5, 10, 25] })).toBe(5);
  });
});
