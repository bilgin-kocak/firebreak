import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFirebreakState, useFirebreakStore } from "../store/useFirebreakStore";
import { STATIC_TOOL_NAMES } from "../webmcp/staticToolDefinitions";
import { App } from "./App";

vi.mock("../scene/FirebreakScene", () => ({
  FirebreakScene: () => (
    <div role="img" aria-label="Interactive warehouse rescue scene with four emergency robots" />
  ),
}));

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

  it("completes the canonical two-prompt journey with one visible human authorization", async () => {
    const user = userEvent.setup();
    render(<App accelerated />);
    await waitFor(() => expect(getFirebreakState().webmcp.registeredToolNames).toHaveLength(7));

    await user.click(screen.getByRole("button", { name: /start emergency/i }));
    await user.click(screen.getByRole("button", { name: /ask agent to plan rescue/i }));
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

    await user.click(screen.getByRole("button", { name: /execute approved rescue/i }));
    await waitFor(() => expect(getFirebreakState().world.phase).toBe("resolved"));
    expect(screen.getByRole("heading", { name: /mission complete/i })).toBeVisible();
    expect(screen.getByText(/2 workers safe/i)).toBeVisible();
    await waitFor(() =>
      expect(getFirebreakState().webmcp.registeredToolNames).toEqual(STATIC_TOOL_NAMES),
    );
    expect(screen.getByText(/7 tools live/i)).toBeVisible();
  });
});
