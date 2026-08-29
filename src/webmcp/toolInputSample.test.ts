import { describe, expect, it } from "vitest";

import { validateJsonSchema } from "../domain/operationRegistry";
import { createSchemaInputSample } from "./toolInputSample";

describe("createSchemaInputSample", () => {
  it("builds and verifies a long email within satisfiable length bounds", () => {
    const schema = {
      type: "string" as const,
      format: "email" as const,
      minLength: 100,
      maxLength: 120,
    };

    const sample = createSchemaInputSample(schema);

    expect(sample).toBeTypeOf("string");
    expect(String(sample).length).toBeGreaterThanOrEqual(100);
    expect(String(sample).length).toBeLessThanOrEqual(120);
    expect(validateJsonSchema(schema, sample)).toBe(true);
    expect(
      String(sample)
        .split("@")[1]
        ?.split(".")
        .every((label) => label.length <= 63),
    ).toBe(true);
  });

  it("deterministically generates anchored literals, classes, escapes, and quantifiers", () => {
    const schema = {
      type: "string" as const,
      pattern: "^Z{2}-[0-9]{2}\\.[A-Z]\\d$",
    };

    const first = createSchemaInputSample(schema);
    const second = createSchemaInputSample(schema);

    expect(first).toBe("ZZ-00.A0");
    expect(second).toBe(first);
    expect(validateJsonSchema(schema, first)).toBe(true);
  });

  it("throws a clear error rather than returning an unchecked unsupported pattern", () => {
    expect(() => createSchemaInputSample({ type: "string", pattern: "^(?=A)A$" })).toThrow(
      /cannot generate a verified sample.*unsupported pattern/i,
    );
  });
});
