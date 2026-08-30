type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minItems?: number;
  minimum?: number;
  minLength?: number;
  additionalProperties?: boolean;
};

export const createSchemaInputSample = (rawSchema: Record<string, unknown>): unknown => {
  const schema = rawSchema as JsonSchema;
  if ("const" in schema) return schema.const;
  if (schema.enum?.length) return structuredClone(schema.enum[0]);
  if (schema.type === "object") {
    return Object.fromEntries(
      (schema.required ?? []).map((name) => {
        const property = schema.properties?.[name];
        if (!property) throw new Error(`Required schema property '${name}' is missing.`);
        return [name, createSchemaInputSample(property as Record<string, unknown>)];
      }),
    );
  }
  if (schema.type === "array") {
    if (!schema.items) return [];
    return Array.from({ length: schema.minItems ?? 0 }, () =>
      createSchemaInputSample(schema.items as Record<string, unknown>),
    );
  }
  if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "boolean") return true;
  if (schema.type === "string") return "sample".padEnd(schema.minLength ?? 1, "x");
  throw new Error("Cannot generate a safe sample for this schema.");
};
