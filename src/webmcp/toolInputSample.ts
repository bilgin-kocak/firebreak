import { validateJsonSchema, type JsonSchema } from "../domain/operationRegistry";

type SampleSchema = JsonSchema & { const?: unknown };

const maximumGeneratedStringLength = 4_096;

const sampleError = (detail: string): Error =>
  new Error(`Cannot generate a verified sample: ${detail}`);

const withinLength = (value: string, schema: SampleSchema): boolean =>
  value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);

const buildDomain = (length: number): string => {
  const labelCount = Math.ceil((length + 1) / 64);
  const characterCount = length - (labelCount - 1);
  if (length < 1 || characterCount < labelCount) {
    throw sampleError("the email length bounds cannot form a domain.");
  }
  const baseLength = Math.floor(characterCount / labelCount);
  let remainder = characterCount % labelCount;
  const labels = Array.from({ length: labelCount }, (_, index) => {
    const labelLength = baseLength + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return String.fromCharCode(98 + (index % 24)).repeat(labelLength);
  });
  if (labels.some((label) => label.length > 63)) {
    throw sampleError("the email domain would require a label longer than 63 characters.");
  }
  return labels.join(".");
};

const emailWithLength = (length: number): string => {
  const topLevelDomain = length >= 8 ? "test" : "c";
  const addressCharacters = length - topLevelDomain.length - 2;
  if (addressCharacters < 2) {
    throw sampleError("the email maximum length is too short for a valid address.");
  }
  const localLength = Math.min(64, addressCharacters - 1);
  const domainLength = addressCharacters - localLength;
  return `${"a".repeat(localLength)}@${buildDomain(domainLength)}.${topLevelDomain}`;
};

const constrainedEmail = (schema: SampleSchema): string => {
  const preferred = "resident@example.test";
  if (withinLength(preferred, schema)) return preferred;
  const minimum = Math.max(5, schema.minLength ?? 0);
  const maximum = Math.min(254, schema.maxLength ?? 254);
  if (minimum > maximum) {
    throw sampleError("the email minLength/maxLength bounds are unsatisfiable.");
  }
  return emailWithLength(minimum);
};

interface PatternToken {
  value: string;
  minimum: number;
  maximum: number;
}

const isEscaped = (source: string, index: number): boolean => {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
};

const classValue = (source: string): string => {
  let expression: RegExp;
  try {
    expression = new RegExp(`^[${source}]$`);
  } catch {
    throw sampleError(`unsupported pattern character class [${source}].`);
  }
  const candidates = ["A", "Z", "a", "z", "0", "9", "_", "-", " ", ".", "@"];
  for (let code = 33; code <= 126; code += 1) candidates.push(String.fromCharCode(code));
  const value = candidates.find((candidate) => expression.test(candidate));
  if (!value) throw sampleError(`unsupported pattern character class [${source}].`);
  return value;
};

const parseQuantifier = (
  source: string,
  start: number,
): { minimum: number; maximum: number; next: number } => {
  const marker = source[start];
  if (marker === "+") return { minimum: 1, maximum: Infinity, next: start + 1 };
  if (marker === "*") return { minimum: 0, maximum: Infinity, next: start + 1 };
  if (marker === "?") return { minimum: 0, maximum: 1, next: start + 1 };
  if (marker !== "{") return { minimum: 1, maximum: 1, next: start };
  const close = source.indexOf("}", start + 1);
  if (close < 0) throw sampleError("unsupported pattern quantifier with no closing brace.");
  const body = source.slice(start + 1, close);
  const match = /^(\d+)(?:,(\d*))?$/.exec(body);
  if (!match) throw sampleError(`unsupported pattern quantifier {${body}}.`);
  const minimum = Number(match[1]);
  const maximum = match[2] === undefined ? minimum : match[2] === "" ? Infinity : Number(match[2]);
  if (minimum > maximum || minimum > maximumGeneratedStringLength) {
    throw sampleError(`unsatisfiable pattern quantifier {${body}}.`);
  }
  return { minimum, maximum, next: close + 1 };
};

const parsePattern = (pattern: string): { tokens: PatternToken[]; endAnchored: boolean } => {
  let source = pattern;
  if (source.startsWith("^")) source = source.slice(1);
  const endAnchored = source.endsWith("$") && !isEscaped(source, source.length - 1);
  if (endAnchored) source = source.slice(0, -1);
  const tokens: PatternToken[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const marker = source[cursor];
    let value: string;
    if (marker === "[") {
      let close = cursor + 1;
      while (close < source.length && (source[close] !== "]" || isEscaped(source, close))) {
        close += 1;
      }
      if (close >= source.length) throw sampleError("unsupported pattern character class.");
      value = classValue(source.slice(cursor + 1, close));
      cursor = close + 1;
    } else if (marker === "\\") {
      const escaped = source[cursor + 1];
      if (!escaped) throw sampleError("unsupported trailing pattern escape.");
      if (escaped === "d") value = "0";
      else if (escaped === "w") value = "a";
      else if (escaped === "s") value = " ";
      else if ("\\.^$|?*+()[]{}-/".includes(escaped)) value = escaped;
      else throw sampleError(`unsupported pattern escape \\${escaped}.`);
      cursor += 2;
    } else if (marker === ".") {
      value = "a";
      cursor += 1;
    } else {
      if ("()|{}+*?^$".includes(marker ?? "")) {
        throw sampleError(`unsupported pattern token ${marker}.`);
      }
      value = marker ?? "";
      cursor += 1;
    }
    const quantifier = parseQuantifier(source, cursor);
    cursor = quantifier.next;
    tokens.push({ value, minimum: quantifier.minimum, maximum: quantifier.maximum });
  }
  return { tokens, endAnchored };
};

const constrainedPattern = (schema: SampleSchema): string => {
  if (!schema.pattern) throw sampleError("a pattern was expected.");
  let expression: RegExp;
  try {
    expression = new RegExp(schema.pattern);
  } catch {
    throw sampleError("the trusted pattern is not a valid regular expression.");
  }
  const { tokens, endAnchored } = parsePattern(schema.pattern);
  const counts = tokens.map((token) => token.minimum);
  const minimumLength = schema.minLength ?? 0;
  const maximumLength = Math.min(
    schema.maxLength ?? maximumGeneratedStringLength,
    maximumGeneratedStringLength,
  );
  let length = counts.reduce((total, count) => total + count, 0);
  if (length > maximumLength) throw sampleError("the pattern and maxLength are unsatisfiable.");
  for (let index = 0; index < tokens.length && length < minimumLength; index += 1) {
    const capacity = Math.min(tokens[index]?.maximum ?? 0, maximumLength) - (counts[index] ?? 0);
    const added = Math.min(capacity, minimumLength - length);
    counts[index] = (counts[index] ?? 0) + added;
    length += added;
  }
  let value = tokens.map((token, index) => token.value.repeat(counts[index] ?? 0)).join("");
  if (value.length < minimumLength && !endAnchored) {
    value += "a".repeat(minimumLength - value.length);
  }
  expression.lastIndex = 0;
  if (!withinLength(value, schema) || !expression.test(value)) {
    throw sampleError("unsupported pattern could not produce a value satisfying every constraint.");
  }
  return value;
};

const constrainedString = (schema: SampleSchema): string => {
  if (schema.format === "email") return constrainedEmail(schema);
  if (schema.format === "date") return "2026-09-01";
  if (schema.pattern) return constrainedPattern(schema);
  const minimum = Math.max(0, schema.minLength ?? 0);
  const maximum = Math.min(
    schema.maxLength ?? maximumGeneratedStringLength,
    maximumGeneratedStringLength,
  );
  if (minimum > maximum) {
    throw sampleError("the string minLength/maxLength bounds are unsatisfiable.");
  }
  const base = "sample";
  const desiredLength = Math.min(maximum, Math.max(minimum, Math.min(base.length, maximum)));
  return base.repeat(Math.ceil(desiredLength / base.length)).slice(0, desiredLength);
};

const generateSample = (schema: SampleSchema): unknown => {
  if ("const" in schema) return schema.const;
  if (schema.enum?.length) {
    const choice = [...schema.enum]
      .reverse()
      .find((candidate) => validateJsonSchema(schema, candidate));
    if (choice === undefined) throw sampleError("the enum has no value valid for its schema.");
    return choice;
  }
  if (schema.type === "boolean") return true;
  if (schema.type === "number" || schema.type === "integer") return 1;
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries(
      (schema.required ?? []).map((key) => {
        const property = properties[key];
        if (!property) throw sampleError(`required property '${key}' has no schema.`);
        return [key, createSchemaInputSample(property as Record<string, unknown>)];
      }),
    );
  }
  if (schema.type === "string") return constrainedString(schema);
  throw sampleError("the schema type is unsupported.");
};

/** Build a deterministic example and prove it satisfies the trusted workflow schema. */
export const createSchemaInputSample = (rawSchema: Record<string, unknown>): unknown => {
  const schema = rawSchema as SampleSchema;
  const sample = generateSample(schema);
  const constantValid = !("const" in schema) || Object.is(schema.const, sample);
  const schemaValid = schema.type ? validateJsonSchema(schema, sample) : constantValid;
  if (!constantValid || !schemaValid) {
    throw sampleError("the generated value failed final schema validation.");
  }
  return sample;
};
