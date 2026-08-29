import axe from "axe-core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppStoreForTests, useAppStore } from "../store/useAppStore";
import { App } from "./App";

const promptA =
  "Renew my parking permit. I have low vision and want plain language, extra-large controls, one question per screen, and no submission without my approval. Use my current vehicle and email contact. Build the interface, verify it, then propose a reusable tool called `renew_permit_guided`.";
const promptB = "Use the new `renew_permit_guided` tool for a 12-month permit.";

const openSimulator = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /how to test/i }));
  return screen.findByRole("dialog", { name: /webmcp simulator/i });
};

const runSimulatorStep = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  const dialog = await screen.findByRole("dialog", { name: /webmcp simulator/i });
  await user.click(within(dialog).getByRole("button", { name }));
};

const compileAndCheck = async (user: ReturnType<typeof userEvent.setup>) => {
  await openSimulator(user);
  await runSimulatorStep(user, /inspect permit portal/i);
  await runSimulatorStep(user, /compile low-vision view/i);
  await screen.findByRole("heading", { name: /renew your parking permit/i });
  await runSimulatorStep(user, /run checks/i);
  await waitFor(() => {
    const state = useAppStore.getState();
    const checks = state.activeViewId ? state.journeyChecks[state.activeViewId] : undefined;
    expect(checks?.filter((check) => check.status === "fail").map((check) => check.id)).toEqual([]);
  });
  await waitFor(() => expect(screen.getByText(/0 blocking checks/i)).toBeInTheDocument());
};

const approveGuidedTool = async (user: ReturnType<typeof userEvent.setup>) => {
  await runSimulatorStep(user, /stage guided tool/i);
  const proposal = await screen.findByRole("dialog", { name: /review reusable tool/i });
  expect(within(proposal).getByText("renew_permit_guided")).toBeInTheDocument();
  expect(within(proposal).getByText(/cannot submit/i)).toBeInTheDocument();
  await user.click(within(proposal).getByRole("button", { name: /approve & register/i }));
  await screen.findByText(/renew_permit_guided registered/i);
};

describe("CivicWeave application", () => {
  beforeEach(() => {
    Reflect.deleteProperty(document, "modelContext");
    resetAppStoreForTests();
    vi.restoreAllMocks();
  });

  it("falls back to the simulator when the browser exposes only a partial native API", async () => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool: vi.fn() },
    });

    render(<App />);

    expect(await screen.findByText("Simulator")).toBeInTheDocument();
    expect(await screen.findByText("7 registered tools")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("presents a credible six-service portal, exact prompts, and a persistent disclaimer", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<App />);

    expect(screen.getByRole("banner")).toHaveTextContent("Northstar City Services");
    expect(screen.getByRole("heading", { name: /welcome, maya chen/i })).toBeInTheDocument();
    expect(screen.getAllByTestId("service-card")).toHaveLength(6);
    expect(screen.getByText(promptA)).toBeInTheDocument();
    expect(screen.getByText(promptB)).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "CivicWeave and Northstar City are fictional",
    );
    await screen.findByText("7 registered tools");
    expect(screen.getByText("No tool activity yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy prompt 1/i }));
    expect(writeText).toHaveBeenCalledWith(promptA);
  });

  it("completes the manual parking flow only after a human confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start parking permit renewal/i }));
    expect(screen.getByRole("heading", { name: /parking permit renewal/i })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/12 months/i));
    await user.clear(screen.getByLabelText(/contact email/i));
    await user.type(screen.getByLabelText(/contact email/i), "maya.updated@example.test");
    await user.click(screen.getByRole("button", { name: /review permit renewal/i }));

    const confirmation = await screen.findByRole("dialog", {
      name: /confirm fictional submission/i,
    });
    expect(within(confirmation).getByText(/\$60/)).toBeInTheDocument();
    expect(screen.queryByText("NST-PP-2026-08421")).not.toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: /confirm & submit/i }));
    expect(await screen.findByText("NST-PP-2026-08421")).toBeInTheDocument();
  });

  it("completes the generic manual address flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start address change/i }));
    await user.type(screen.getByLabelText(/new street/i), "42 Cedar Way");
    await user.type(screen.getByLabelText(/new city/i), "Northstar");
    await user.type(screen.getByLabelText(/new postal code/i), "NS 20422");
    await user.type(screen.getByLabelText(/effective date/i), "2026-09-01");
    await user.click(screen.getByLabelText(/also update your voter record/i));
    await user.click(screen.getByRole("button", { name: /review address change/i }));

    const confirmation = await screen.findByRole("dialog", {
      name: /confirm fictional submission/i,
    });
    await user.click(within(confirmation).getByRole("button", { name: /confirm & submit/i }));
    expect(await screen.findByText("NST-AC-2026-03116")).toBeInTheDocument();
  });

  it("renders an xlarge one-field adaptive journey that retains edits and human locks", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);

    expect(document.documentElement).toHaveClass("text-size-xlarge");
    expect(screen.getByText(/step 1 of 5/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /lock vehicle field/i }));
    expect(screen.getByText("Locked by you.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next question/i }));
    await user.click(screen.getByLabelText(/12 months/i));
    await user.click(screen.getByRole("button", { name: /previous question/i }));
    await user.click(screen.getByRole("button", { name: /next question/i }));
    expect(screen.getByLabelText(/12 months/i)).toBeChecked();
  });

  it("keeps proposal approval and final submission human-only", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await approveGuidedTool(user);

    await runSimulatorStep(user, /invoke guided tool with 12 months/i);
    const confirmation = await screen.findByRole("dialog", {
      name: /confirm fictional submission/i,
    });
    expect(within(confirmation).getByText(/awaiting your confirmation/i)).toBeInTheDocument();
    expect(screen.queryByText("NST-PP-2026-08421")).not.toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: /confirm & submit/i }));
    expect(await screen.findByText("NST-PP-2026-08421")).toBeInTheDocument();
  });

  it("traps proposal focus, closes on Escape, and returns focus to the staging control", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    const simulator = await screen.findByRole("dialog", { name: /webmcp simulator/i });
    const stageButton = within(simulator).getByRole("button", { name: /stage guided tool/i });
    await user.click(stageButton);

    const proposal = await screen.findByRole("dialog", { name: /review reusable tool/i });
    expect(within(proposal).getByRole("button", { name: /approve & register/i })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(proposal).not.toBeInTheDocument());
    expect(stageButton).toHaveFocus();
  });

  it("lets a human disable and delete a compiled tool with confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await approveGuidedTool(user);
    await user.click(screen.getByRole("tab", { name: /tool surface/i }));

    const toolRow = screen.getByTestId("tool-row-renew_permit_guided");
    await user.click(within(toolRow).getByRole("button", { name: /disable/i }));
    expect(toolRow).toHaveTextContent("Disabled");
    await user.click(within(toolRow).getByRole("button", { name: /delete/i }));
    const confirmDelete = await screen.findByRole("dialog", { name: /delete compiled tool/i });
    await user.click(within(confirmDelete).getByRole("button", { name: /delete tool/i }));
    expect(screen.queryByTestId("tool-row-renew_permit_guided")).not.toBeInTheDocument();
  });

  it("resets the shared portal and registered tool surface", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await user.click(screen.getByRole("button", { name: /reset demo/i }));

    expect(await screen.findByRole("heading", { name: /welcome, maya chen/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /renew your parking permit/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/demo reset/i).length).toBeGreaterThan(0);
  });

  it("has no serious or critical axe violations on the initial portal", async () => {
    render(<App />);
    await screen.findByText(/7 registered tools/i);
    const result = await axe.run(document.body);
    expect(
      result.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
});
