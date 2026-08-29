import type { JsonSchema } from "../domain/operationRegistry";

type SampleSchema = JsonSchema & { const?: unknown };

const withinLength = (value: string, schema: SampleSchema): boolean =>
  value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);

const constrainedEmail = (schema: SampleSchema): string => {
  const preferred = "resident@example.test";
  if (withinLength(preferred, schema)) return preferred;
  const minimum = Math.max(5, schema.minLength ?? 0);
  const maximum = schema.maxLength ?? 254;
  const suffix = "@b.co";
  const localLength = Math.max(1, Math.min(64, minimum - suffix.length));
  const candidate = `${"a".repeat(localLength)}${suffix}`;
  return candidate.length <= maximum ? candidate : "a@b.co";
};

const constrainedPattern = (schema: SampleSchema): string | undefined => {
  if (!schema.pattern) return undefined;
  const expression = new RegExp(schema.pattern);
  const minimum = Math.max(1, schema.minLength ?? 1);
  const maximum = Math.min(schema.maxLength ?? Math.max(minimum, 32), 64);
  const seeds = ["A", "a", "0", "ABC123", "sample", "NS 20418", "resident"];
  for (const seed of seeds) {
    for (let length = minimum; length <= maximum; length += 1) {
      const candidate = seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
      expression.lastIndex = 0;
      if (expression.test(candidate)) return candidate;
    }
  }
  return undefined;
};

const constrainedString = (schema: SampleSchema): string => {
  if (schema.format === "email") return constrainedEmail(schema);
  if (schema.format === "date") return "2026-09-01";
  const patterned = constrainedPattern(schema);
  if (patterned !== undefined) return patterned;
  const minimum = Math.max(1, schema.minLength ?? 1);
  const maximum = schema.maxLength ?? Infinity;
  const base = "sample";
  const desiredLength = Math.min(maximum, Math.max(minimum, Math.min(base.length, maximum)));
  return base.repeat(Math.ceil(desiredLength / base.length)).slice(0, desiredLength);
};

/** Build a deterministic valid example for trusted dynamic workflow schemas. */
export const createSchemaInputSample = (rawSchema: Record<string, unknown>): unknown => {
  const schema = rawSchema as SampleSchema;
  if ("const" in schema) return schema.const;
  const choices = Array.isArray(schema.enum) ? schema.enum : [];
  if (choices.length) return choices.at(-1);
  if (schema.type === "boolean") return true;
  if (schema.type === "number" || schema.type === "integer") return 1;
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries(
      (schema.required ?? []).map((key) => [
        key,
        createSchemaInputSample(properties[key] as Record<string, unknown>),
      ]),
    );
  }
  return constrainedString(schema);
};
