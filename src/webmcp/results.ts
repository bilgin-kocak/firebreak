import { ZodError } from "zod";

import { AirlockError, type AirlockErrorCode } from "../domain/airlockTypes";

export interface ToolSuccess<TData = Record<string, unknown>> {
  ok: true;
  code: string;
  message: string;
  data?: TData;
}

export interface ToolFailure {
  ok: false;
  code: AirlockErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type ToolResult<TData = Record<string, unknown>> = ToolSuccess<TData> | ToolFailure;

export const successResult = <TData extends Record<string, unknown>>(
  code: string,
  message: string,
  data?: TData,
): ToolSuccess<TData> => ({ ok: true, code, message, ...(data ? { data } : {}) });

export const failureResult = (
  code: AirlockErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): ToolFailure => ({ ok: false, code, message, retryable, ...(details ? { details } : {}) });

export const errorResult = (error: unknown): ToolFailure => {
  if (error instanceof ZodError) {
    return failureResult(
      "INVALID_TOOL_INPUT",
      "Tool input did not match the trusted schema.",
      true,
      {
        issues: error.issues.slice(0, 4).map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    );
  }
  if (error instanceof AirlockError) {
    return failureResult(error.code, error.message, false, error.details);
  }
  return failureResult(
    "OPERATION_FAILED",
    "The tool could not complete safely. No untrusted details were returned.",
    false,
  );
};

/** Keeps the WebMCP boundary JSON-compatible and within the typical metadata budget. */
export const compactResult = (result: unknown, maxChars = 6_000): unknown => {
  const json = JSON.stringify(result);
  if (json.length <= maxChars) return JSON.parse(json) as unknown;
  if (typeof result === "object" && result !== null && "ok" in result) {
    const record = result as { ok: unknown; code?: unknown; message?: unknown };
    return {
      ok: record.ok,
      code: record.code,
      message: String(record.message ?? "Tool result exceeded the compact output budget.").slice(
        0,
        420,
      ),
      ...(record.ok === false ? { retryable: false } : {}),
    };
  }
  return failureResult(
    "OPERATION_FAILED",
    "Tool result exceeded the compact output budget.",
    false,
  );
};
