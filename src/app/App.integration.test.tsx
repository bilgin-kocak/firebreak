import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { installModelContextMock } from "../test/modelContextMock";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { App } from "./App";

vi.mock("../scene/FirebreakScene", () => ({
  FirebreakScene: () => (
    <div role="img" aria-label="Interactive warehouse rescue scene with four emergency robots" />
  ),
}));

async function invokePromptOneThroughNativeWebMCP(): Promise<void> {
  const modelContext = document.modelContext!;
  const call = async (name: string, input: unknown) => {
    const tool = (await modelContext.getTools!()).find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Tool '${name}' is not registered.`);
    return modelContext.executeTool!(tool, input);
  };
  await call("inspect_emergency", { incidentId: "WH-01" });
  await call("scan_hazards", {
    incidentId: "WH-01",
    sensorMode: "thermal",
  });
  await call("inspect_fleet", { incidentId: "WH-01" });
  const simulation = (await call("simulate_mission", {
    incidentId: "WH-01",
    strategy: "coordinated",
  })) as { data?: { simulationId?: string } };
  const simulationId = String(simulation.data?.simulationId ?? "");
  await call("validate_safety_envelope", { simulationId });
  await call("stage_mission_tool", {
    simulationId,
    toolName: "execute_rescue_mission",
  });
  await call("list_mission_tools", { incidentId: "WH-01" });
}

describe("Firebreak application", () => {
  beforeEach(() => {
    useFirebreakStore.getState().setPersistenceStorage(undefined);
    useFirebreakStore.getState().resetDemo();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("presents the official Firebreak identity at mission entry", async () => {
    render(<App accelerated />);

    expect(screen.getByText("FIREBREAK")).toBeVisible();
    expect(screen.getByText("Emergency robot commander")).toBeVisible();
    expect(
      screen.getByText("One agent. Four robots. One human-approved rescue boundary."),
    ).toBeVisible();
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual(STATIC_TOOL_NAMES),
    );
  });

  it("makes the robot rescue problem and playable controls immediately clear", async () => {
    render(<App accelerated />);

    expect(screen.getByRole("heading", { name: /rescue two workers/i })).toBeVisible();
    expect(screen.getByText(/you drive one robot. the agent coordinates four/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start emergency/i })).toBeVisible();
    expect(screen.getByRole("group", { name: /robot fleet/i })).toBeVisible();
    expect(screen.getByText(/WASD or left stick/i)).toBeVisible();
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual(STATIC_TOOL_NAMES),
    );
  });

  it("labels the no-model journey as a replay walkthrough", async () => {
    const user = userEvent.setup();
    render(<App accelerated />);
    await waitFor(() => expect(getFirebreakState().webmcp.registeredToolNames).toHaveLength(7));

    await user.click(screen.getByRole("button", { name: /start emergency/i }));
    expect(screen.getAllByText(/replay walkthrough/i)).toHaveLength(2);
    expect(screen.getAllByText(/no agent/i)).toHaveLength(2);
    expect(screen.queryByText(/live agent/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /replay planning walkthrough/i }));
    await waitFor(() => expect(getFirebreakState().mission.proposal?.status).toBe("staged"));

    const proposal = screen.getByRole("dialog", { name: /authorize rescue mission/i });
    expect(within(proposal).getByText(/four allowlisted robots/i)).toBeVisible();
    expect(within(proposal).getByText(/collapse zone excluded/i)).toBeVisible();
    expect(getFirebreakState().webmcp.registeredToolNames).toHaveLength(7);

    await user.click(within(proposal).getByRole("button", { name: /authorize one mission/i }));
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toContain("execute_rescue_mission"),
    );
    expect(screen.getByText(/8 tools live/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: /replay execution walkthrough/i }));
    await waitFor(() => expect(getFirebreakState().world.phase).toBe("resolved"));
    expect(screen.getByRole("heading", { name: /mission complete/i })).toBeVisible();
    expect(screen.getByText(/2 workers safe/i)).toBeVisible();
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual(STATIC_TOOL_NAMES),
    );
    expect(screen.getByText(/7 tools live/i)).toBeVisible();
  }, 15_000);

  it("lets a native Codex or ChatGPT agent complete both prompts through page tools", async () => {
    const user = userEvent.setup();
    installModelContextMock();
    render(<App accelerated />);
    await waitFor(() => expect(getFirebreakState().webmcp.mode).toBe("native"));
    await waitFor(() => expect(getFirebreakState().webmcp.registeredToolNames).toHaveLength(7));

    await user.click(screen.getByRole("button", { name: /start emergency/i }));
    expect(screen.getByText(/live agent/i)).toBeVisible();
    expect(screen.getByText(/send prompt 1 in codex or chatgpt/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /replay planning walkthrough/i }),
    ).not.toBeInTheDocument();

    await act(invokePromptOneThroughNativeWebMCP);
    await waitFor(() => expect(getFirebreakState().mission.proposal?.status).toBe("staged"));

    const proposal = screen.getByRole("dialog", { name: /authorize rescue mission/i });
    await user.click(within(proposal).getByRole("button", { name: /authorize one mission/i }));
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toContain("execute_rescue_mission"),
    );
    expect(screen.getByText(/send prompt 2 in codex or chatgpt/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /replay execution walkthrough/i }),
    ).not.toBeInTheDocument();
    expect(getFirebreakState().webmcp.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "human",
          status: "granted",
          name: "Authorize one mission",
        }),
        expect.objectContaining({
          kind: "toolchange",
          status: "changed",
          message: "7 → 8 tools",
        }),
      ]),
    );

    await act(async () => {
      const modelContext = document.modelContext!;
      const tool = (await modelContext.getTools!()).find(
        (candidate) => candidate.name === "execute_rescue_mission",
      );
      if (!tool) throw new Error("Dynamic mission tool is not registered.");
      await modelContext.executeTool!(tool, {
        strategy: "coordinated",
      });
    });
    await waitFor(() => expect(getFirebreakState().world.phase).toBe("resolved"));
    expect(screen.getByRole("heading", { name: /mission complete/i })).toBeVisible();
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual(STATIC_TOOL_NAMES),
    );
    expect(getFirebreakState().webmcp.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "toolchange",
          status: "changed",
          message: "8 → 7 tools",
        }),
      ]),
    );
    expect(
      getFirebreakState()
        .webmcp.trace.filter((entry) => entry.kind === "toolchange")
        .map((entry) => entry.message),
    ).toEqual(["7 → 8 tools", "8 → 7 tools"]);
  }, 15_000);

  it("makes a native safety refusal visible before the canonical agent journey", async () => {
    const user = userEvent.setup();
    installModelContextMock();
    render(<App accelerated />);
    await waitFor(() => expect(getFirebreakState().webmcp.mode).toBe("native"));
    await waitFor(() => expect(getFirebreakState().webmcp.registeredToolNames).toHaveLength(7));
    await user.click(screen.getByRole("button", { name: /start emergency/i }));

    await user.click(screen.getByRole("button", { name: /copy blocked-call test/i }));
    expect(screen.getByText(/blocked-call test copied/i)).toBeVisible();

    await act(async () => {
      const modelContext = document.modelContext!;
      const tool = (await modelContext.getTools!()).find(
        (candidate) => candidate.name === "simulate_mission",
      );
      if (!tool) throw new Error("Simulation tool is not registered.");
      await modelContext.executeTool!(tool, {
        incidentId: "WH-01",
        strategy: "coordinated",
      });
    });

    const trace = screen.getByRole("region", { name: /live webmcp trace/i });
    expect(trace).toBeVisible();
    expect(within(trace).getByText("simulate_mission")).toBeVisible();
    expect(within(trace).getByText(/blocked/i)).toBeVisible();
    expect(within(trace).getByText("HAZARD_SCAN_REQUIRED")).toBeVisible();
    expect(getFirebreakState().world.phase).toBe("active");
  });
});
