import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRuntime } from "../app/runtime";
import { resetAppStoreForTests } from "../store/useAppStore";
import { createMemoryAdapter } from "../webmcp/memoryAdapter";
import { WebMCPSimulator } from "./WebMCPSimulator";

describe("WebMCPSimulator schema examples", () => {
  beforeEach(() => resetAppStoreForTests());

  it("shows a clear error and disables execution for an unsupported schema sample", async () => {
    const adapter = createMemoryAdapter();
    await adapter.registerTool({
      name: "unsupported_pattern_tool",
      description: "A test tool with an unsupported trusted pattern.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string", pattern: "^(?=A)A$" } },
        required: ["code"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        return { ok: true };
      },
    });
    const runtime = { adapter } as AppRuntime;

    render(<WebMCPSimulator open runtime={runtime} onClose={vi.fn()} onMessage={vi.fn()} />);

    const simulator = await screen.findByRole("dialog", { name: /webmcp simulator/i });
    expect(
      await within(simulator).findByText(/cannot generate a verified sample/i),
    ).toHaveTextContent(/unsupported pattern/i);
    expect(within(simulator).getByLabelText(/tool arguments/i)).toHaveValue("{}");
    expect(within(simulator).getByRole("button", { name: /run selected tool/i })).toBeDisabled();
  });
});
