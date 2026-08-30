import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "../store/useAppStore";
import { CANONICAL_PROMPT_A } from "../components/AirlockSimulator";
import { App } from "./App";

describe("WebMCP Airlock application", () => {
  beforeEach(async () => {
    useAppStore.getState().setPersistenceStorage(undefined);
    await useAppStore.getState().reset();
    Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
  });

  it("renders the complete fictional incident with an accessible topology alternative", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Checkout is failing in production" }),
    ).toBeVisible();
    expect(screen.getAllByText("31.8%")[0]).toBeVisible();
    expect(screen.getAllByText("4,820", { exact: false })[0]).toBeVisible();
    expect(screen.getByText(/fictional local demonstration/i)).toBeVisible();
    expect(screen.getByText(/text view of service status/i)).toBeVisible();
    await waitFor(() => expect(useAppStore.getState().webmcp.registeredToolNames).toHaveLength(7));
  });

  it("completes the canonical two-prompt journey with one human approval", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(useAppStore.getState().webmcp.registeredToolNames).toHaveLength(7));

    await user.click(screen.getByRole("button", { name: /simulator/i }));
    expect(screen.getByText(CANONICAL_PROMPT_A)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /run investigation/i }));

    expect(await screen.findByRole("heading", { name: /approve one-use response/i })).toBeVisible();
    expect(screen.getByText("rollback_checkout_release")).toBeVisible();
    expect(screen.getByText(/9\/9 safety gates pass/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /approve & register once/i }));

    await waitFor(() =>
      expect(useAppStore.getState().webmcp.registeredToolNames).toContain(
        "rollback_checkout_release",
      ),
    );
    expect(screen.getByRole("button", { name: /invoke approved response/i })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /invoke approved response/i }));

    expect(await screen.findByRole("heading", { name: "Checkout path restored" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Checkout recovered" })).toBeVisible();
    expect(screen.getByText("CURRENT · restored stable")).toBeVisible();
    expect(screen.getByText("ROLLED BACK · incident release")).toBeVisible();
    expect(screen.getByText(/hostile evidence path blocked/i)).toBeVisible();
    await waitFor(() =>
      expect(useAppStore.getState().webmcp.registeredToolNames).not.toContain(
        "rollback_checkout_release",
      ),
    );
  });
});
