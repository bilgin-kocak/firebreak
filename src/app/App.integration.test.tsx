import axe from "axe-core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppStoreForTests, useAppStore } from "../store/useAppStore";
import type { WebMCPToolDefinition } from "../webmcp/types";
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

const compileGroupedAddressView = async (user: ReturnType<typeof userEvent.setup>) => {
  const simulator = await openSimulator(user);
  await user.selectOptions(within(simulator).getByLabelText(/choose a tool/i), "compile_task_view");
  const input = within(simulator).getByLabelText(/tool arguments/i);
  fireEvent.change(input, {
    target: {
      value: JSON.stringify({
        serviceId: "address_change",
        title: "Change your address",
        goal: "Prepare an address change and stop for your approval.",
        preferences: {
          textSize: "large",
          languageStyle: "plain",
          navigationStyle: "grouped",
          controlStyle: "large_cards",
          showProgress: false,
          preserveBranding: true,
        },
        fieldOrder: [
          "newStreet",
          "newCity",
          "newPostalCode",
          "effectiveDate",
          "currentAddressSummary",
        ],
        hiddenOptionalFields: ["updateVoterRecord"],
        copyOverrides: [],
        requireHumanConfirmation: true,
      }),
    },
  });
  await user.click(within(simulator).getByRole("button", { name: /run selected tool/i }));
  await screen.findByRole("heading", { name: /change your address/i });
  await user.click(within(simulator).getByRole("button", { name: /close simulator/i }));
};

const installTransientNativeRegistrationFailure = () => {
  const tools = new Map<string, WebMCPToolDefinition>();
  const listeners = new Set<() => void>();
  let dynamicAttempts = 0;
  const emit = () => listeners.forEach((listener) => listener());
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      async registerTool(definition: WebMCPToolDefinition, options?: { signal?: AbortSignal }) {
        if (definition.name === "renew_permit_guided" && dynamicAttempts++ === 0) {
          throw new Error("Transient WebMCP registration failure.");
        }
        if (options?.signal?.aborted) return;
        tools.set(definition.name, definition);
        emit();
        options?.signal?.addEventListener(
          "abort",
          () => {
            if (tools.delete(definition.name)) emit();
          },
          { once: true },
        );
      },
      async getTools() {
        return [...tools.values()].map((definition) => ({
          name: definition.name,
          description: definition.description,
          inputSchema: definition.inputSchema,
          annotations: definition.annotations,
        }));
      },
      async executeTool(name: string, input: unknown, options?: { signal?: AbortSignal }) {
        const definition = tools.get(name);
        if (!definition) throw new Error(`Tool '${name}' is not registered.`);
        return definition.execute(input, { signal: options?.signal });
      },
      addEventListener(_type: "toolchange", listener: () => void) {
        listeners.add(listener);
      },
      removeEventListener(_type: "toolchange", listener: () => void) {
        listeners.delete(listener);
      },
    } satisfies NonNullable<Document["modelContext"]>,
  });
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
    expect(screen.getByText("Saturday, August 29")).toBeInTheDocument();
    expect(screen.getAllByTestId("service-card")).toHaveLength(6);
    expect(screen.getByText(promptA)).toBeInTheDocument();
    expect(screen.queryByText(promptB)).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "CivicWeave and Northstar City are fictional",
    );
    await screen.findByText("7 registered tools");
    expect(screen.getByText("No tool activity yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy prompt 1/i }));
    expect(writeText).toHaveBeenCalledWith(promptA);
  });

  it("implements roving keyboard navigation for the Right Rail tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("7 registered tools");

    const activity = screen.getByRole("tab", { name: "Activity" });
    const tools = screen.getByRole("tab", { name: "Tool Surface" });
    const checks = screen.getByRole("tab", { name: "Checks" });
    expect(activity).toHaveAttribute("tabindex", "0");
    expect(tools).toHaveAttribute("tabindex", "-1");
    expect(checks).toHaveAttribute("tabindex", "-1");

    activity.focus();
    await user.keyboard("{ArrowRight}");
    expect(tools).toHaveFocus();
    expect(tools).toHaveAttribute("aria-selected", "true");
    expect(tools).toHaveAttribute("tabindex", "0");
    expect(activity).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{End}");
    expect(checks).toHaveFocus();
    expect(checks).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(activity).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(checks).toHaveFocus();
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

  it("returns final-confirmation focus to review on Escape and to read-only success after submit", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start parking permit renewal/i }));
    await user.click(screen.getByLabelText(/12 months/i));
    const review = screen.getByRole("button", { name: /review permit renewal/i });

    await user.click(review);
    expect(
      await screen.findByRole("dialog", { name: /confirm fictional submission/i }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(review).toHaveFocus());

    await user.click(review);
    const confirmation = await screen.findByRole("dialog", {
      name: /confirm fictional submission/i,
    });
    await user.click(within(confirmation).getByRole("button", { name: /confirm & submit/i }));
    const successHeading = await screen.findByRole("heading", { name: /submission confirmed/i });
    await waitFor(() => expect(successHeading).toHaveFocus());
    expect(review).not.toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(main).queryByRole("radio")).not.toBeInTheDocument();

    const submittedDraft = structuredClone(
      useAppStore.getState().serviceDrafts.parking_permit_renewal,
    );
    expect(() =>
      useAppStore
        .getState()
        .human.setDraftField("parking_permit_renewal", "contactEmail", "unsafe-edit@example.test"),
    ).toThrow(/submitted draft cannot be edited/i);
    expect(useAppStore.getState().serviceDrafts.parking_permit_renewal).toEqual(submittedDraft);
  });

  it("focuses post-render success after native-like confirmation opened from the document body", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/7 registered tools/i);
    document.body.tabIndex = -1;
    document.body.focus();
    act(() => {
      useAppStore.getState().stageWorkflowDraftForReview("parking_permit_renewal", {
        vehicleId: "vehicle_aurora",
        durationMonths: 12,
        contactEmail: "maya.chen@example.test",
        fee: 60,
        saved: true,
      });
    });

    const confirmation = await screen.findByRole("dialog", {
      name: /confirm fictional submission/i,
    });
    await user.click(within(confirmation).getByRole("button", { name: /confirm & submit/i }));

    const successHeading = await screen.findByRole("heading", { name: /submission confirmed/i });
    await waitFor(() => expect(successHeading).toHaveFocus());
    document.body.removeAttribute("tabindex");
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

  it("shows actionable manual address errors, focuses the first invalid field, and preserves fixes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start address change/i }));

    const review = screen.getByRole("button", { name: /review address change/i });
    expect(review).toBeEnabled();
    await user.click(review);

    const street = screen.getByLabelText(/new street address/i);
    expect(street).toHaveFocus();
    expect(street).toHaveAttribute("aria-invalid", "true");
    expect(street).toHaveAccessibleDescription(/at least 3 characters/i);

    await user.type(street, "42 Cedar Way");
    await user.type(screen.getByLabelText(/new city/i), "Northstar");
    await user.type(screen.getByLabelText(/new postal code/i), "NS 20422");
    await user.type(screen.getByLabelText(/effective date/i), "2026-09-01");
    await user.click(review);

    expect(
      await screen.findByRole("dialog", { name: /confirm fictional submission/i }),
    ).toBeVisible();
    expect(useAppStore.getState().serviceDrafts.address_change?.newStreet).toBe("42 Cedar Way");
  });

  it("requires an explicit permit duration and focuses its inline error", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /start parking permit renewal/i }));

    const review = screen.getByRole("button", { name: /review permit renewal/i });
    expect(review).toBeEnabled();
    await user.click(review);

    const duration = screen.getByLabelText(/6 months/i);
    expect(duration).toHaveFocus();
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(duration).toHaveAccessibleDescription(/choose a 6- or 12-month permit/i);
    expect(
      useAppStore.getState().serviceDrafts.parking_permit_renewal?.durationMonths,
    ).toBeUndefined();

    await user.click(screen.getByLabelText(/12 months/i));
    await user.click(review);
    expect(
      await screen.findByRole("dialog", { name: /confirm fictional submission/i }),
    ).toBeVisible();
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

  it("keeps a one-field adaptive permit on its missing duration until the human fixes it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await user.click(screen.getByRole("button", { name: /close simulator/i }));

    await user.click(screen.getByRole("button", { name: /next question/i }));
    const next = screen.getByRole("button", { name: /next question/i });
    await user.click(next);

    const duration = screen.getByLabelText(/6 months/i);
    expect(duration).toHaveFocus();
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/question 2 of 5/i)).toBeInTheDocument();
    expect(
      useAppStore.getState().serviceDrafts.parking_permit_renewal?.durationMonths,
    ).toBeUndefined();

    await user.click(screen.getByLabelText(/12 months/i));
    await user.click(next);
    expect(screen.getByLabelText(/what email should we use/i)).toBeVisible();
  });

  it("validates a grouped adaptive address without losing corrected values", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileGroupedAddressView(user);

    expect(screen.getByText(/grouped fields/i)).toBeInTheDocument();
    const review = screen.getByRole("button", { name: /review draft/i });
    await user.click(review);

    const street = screen.getByLabelText(/new street address/i);
    expect(street).toHaveFocus();
    expect(street).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/what city/i)).toHaveAttribute("aria-invalid", "true");

    await user.type(street, "8 Cove Road");
    await user.type(screen.getByLabelText(/what city/i), "Northstar");
    await user.type(screen.getByLabelText(/new postal code/i), "NS 20418");
    await user.type(screen.getByLabelText(/when did you move/i), "2026-09-01");
    await user.click(review);

    expect(
      await screen.findByRole("dialog", { name: /confirm fictional submission/i }),
    ).toBeVisible();
    expect(useAppStore.getState().serviceDrafts.address_change?.newStreet).toBe("8 Cove Road");
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
    const success = await screen.findByRole("region", { name: /submission confirmed/i });
    await waitFor(() =>
      expect(within(success).getByRole("heading", { name: /submission confirmed/i })).toHaveFocus(),
    );
    expect(screen.queryByRole("dialog", { name: /webmcp simulator/i })).not.toBeInTheDocument();
    expect(within(success).getByText("NST-PP-2026-08421")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("radio")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).queryByRole("button", { name: /review draft/i }),
    ).not.toBeInTheDocument();
    expect(() =>
      useAppStore.getState().human.setDraftField("parking_permit_renewal", "durationMonths", 6),
    ).toThrow(/submitted draft cannot be edited/i);
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

  it("returns a proposal to editing and reviews the newest restaged proposal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await runSimulatorStep(user, /stage guided tool/i);
    const firstSheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const firstId = Object.values(useAppStore.getState().proposals).find(
      (proposal) => proposal.status === "awaiting_approval",
    )?.id;
    expect(firstId).toBeDefined();

    await user.click(within(firstSheet).getByRole("button", { name: /back to edit/i }));
    expect(useAppStore.getState().proposals[firstId!]?.status).toBe("draft");
    await waitFor(() => expect(firstSheet).not.toBeInTheDocument());

    await runSimulatorStep(user, /stage guided tool/i);
    const secondSheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const newest = Object.values(useAppStore.getState().proposals).find(
      (proposal) => proposal.status === "awaiting_approval",
    );
    expect(newest?.id).toBeDefined();
    expect(newest?.id).not.toBe(firstId);
    expect(secondSheet).toHaveAttribute("data-proposal-id", newest?.id);
  });

  it("shows parameter requirement, complete safe bindings, and current proposal failures", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await runSimulatorStep(user, /stage guided tool/i);
    const proposal = Object.values(useAppStore.getState().proposals).find(
      (item) => item.status === "awaiting_approval",
    );
    expect(proposal).toBeDefined();
    const viewId = proposal!.viewId;

    act(() => {
      useAppStore.setState((state) => ({
        proposals: {
          ...state.proposals,
          [proposal!.id]: {
            ...proposal!,
            validationErrors: ["Stored validation detail"],
            operations: proposal!.operations.map((operation, index) =>
              index === 2
                ? {
                    ...operation,
                    bindings: [
                      ...operation.bindings,
                      {
                        argument: "months",
                        source: "literal" as const,
                        value: "<script>unsafe()</script>",
                      },
                    ],
                  }
                : operation,
            ),
          },
        },
        journeyChecks: {
          ...state.journeyChecks,
          [viewId]: [
            {
              id: "large_target_size",
              title: "Large controls are available",
              status: "fail",
              detail: "One control is too small.",
            },
          ],
        },
      }));
    });

    const sheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    expect(within(sheet).getByText("Required")).toBeInTheDocument();
    expect(within(sheet).getAllByText(/source: portal_state/i)).toHaveLength(2);
    expect(within(sheet).getByText(/key: currentVehicleId/i)).toBeInTheDocument();
    expect(within(sheet).getByText(/source: literal/i)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/literal binding value/i)).toHaveTextContent(
      '"<script>unsafe()</script>"',
    );
    expect(sheet.querySelector("script")).toBeNull();
    expect(within(sheet).getByText(/^2 current validation errors$/i)).toBeInTheDocument();
    expect(within(sheet).getByText(/^1 blocking journey checks$/i)).toBeInTheDocument();
    expect(within(sheet).getByText("Stored validation detail")).toBeInTheDocument();
    const approve = within(sheet).getByRole("button", { name: /approve & register/i });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(
      /resolve 2 validation errors and 1 blocking check/i,
    );
  });

  it("renders a complete long literal binding value without executing its markup", async () => {
    const user = userEvent.setup();
    const longEmail = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(125)}`;
    expect(longEmail).toHaveLength(254);
    render(<App />);
    await compileAndCheck(user);
    await runSimulatorStep(user, /stage guided tool/i);
    const proposal = Object.values(useAppStore.getState().proposals).find(
      (item) => item.status === "awaiting_approval",
    );
    expect(proposal).toBeDefined();

    act(() => {
      useAppStore.setState((state) => ({
        proposals: {
          ...state.proposals,
          [proposal!.id]: {
            ...proposal!,
            operations: proposal!.operations.map((operation) =>
              operation.operationId === "permit.set_contact"
                ? {
                    ...operation,
                    bindings: [{ argument: "email", source: "literal" as const, value: longEmail }],
                  }
                : operation,
            ),
          },
        },
      }));
    });

    const sheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const literal = within(sheet).getByLabelText(/literal binding value/i);
    expect(literal).toHaveTextContent(JSON.stringify(longEmail));
    expect(literal.textContent).toBe(JSON.stringify(longEmail));
    expect(literal.textContent?.endsWith(`${"c".repeat(125)}"`)).toBe(true);
    expect(sheet.querySelector("script")).toBeNull();
  });

  it("cleans up proposal focus and dialog state when approval revalidation loses a race", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    const simulator = await screen.findByRole("dialog", { name: /webmcp simulator/i });
    const stageButton = within(simulator).getByRole("button", { name: /stage guided tool/i });
    await user.click(stageButton);
    const sheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const proposal = Object.values(useAppStore.getState().proposals).find(
      (item) => item.status === "awaiting_approval",
    );
    expect(proposal).toBeDefined();

    fireEvent.click(within(sheet).getByRole("button", { name: /approve & register/i }));
    act(() => {
      useAppStore.setState((state) => ({
        journeyChecks: {
          ...state.journeyChecks,
          [proposal!.viewId]: [
            {
              id: "large_target_size",
              title: "Large controls are available",
              status: "fail",
              detail: "A newly measured control is too small.",
            },
          ],
        },
      }));
    });

    await waitFor(() => expect(sheet).not.toBeInTheDocument());
    expect(useAppStore.getState().dialogs.proposalSheetOpen).toBe(false);
    expect(useAppStore.getState().proposals[proposal!.id]?.status).toBe("draft");
    await waitFor(() =>
      expect(useAppStore.getState().webmcp.registeredToolNames).not.toContain(
        "renew_permit_guided",
      ),
    );
    await waitFor(() => expect(stageButton).toHaveFocus());
    await user.keyboard("{Tab}");
    expect(simulator).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(simulator).not.toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: /tool surface/i }));
    expect(screen.getByTestId(`tool-row-${proposal!.name}-validation-error`)).toHaveTextContent(
      "Validation error",
    );
  });

  it("returns a proposal to edit and removes its focus trap when fresh checks fail before registration", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    const simulator = await screen.findByRole("dialog", { name: /webmcp simulator/i });
    const stageButton = within(simulator).getByRole("button", { name: /stage guided tool/i });
    await user.click(stageButton);
    const sheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const approve = within(sheet).getByRole("button", { name: /approve & register/i });
    const proposal = Object.values(useAppStore.getState().proposals).find(
      (item) => item.status === "awaiting_approval",
    );
    expect(proposal).toBeDefined();
    const view = useAppStore.getState().views[proposal!.viewId];
    expect(view).toBeDefined();

    act(() => {
      useAppStore.setState((state) => ({
        views: {
          ...state.views,
          [view!.id]: {
            ...view!,
            hiddenOptionalFields: [...view!.hiddenOptionalFields, "contactEmail"],
          },
        },
      }));
    });
    expect(approve).toBeEnabled();

    await user.click(approve);

    await waitFor(() => expect(sheet).not.toBeInTheDocument());
    expect(useAppStore.getState().proposals[proposal!.id]).toMatchObject({
      status: "draft",
      validationErrors: ["CHECKS_FAILED"],
    });
    expect(useAppStore.getState().dialogs.proposalSheetOpen).toBe(false);
    expect(useAppStore.getState().webmcp.registeredToolNames).not.toContain("renew_permit_guided");
    expect(screen.queryByText(/review remains open; you can retry/i)).not.toBeInTheDocument();
    await waitFor(() => expect(stageButton).toHaveFocus());
    await user.keyboard("{Tab}");
    expect(simulator).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(simulator).not.toBeInTheDocument());
  });

  it("keeps a transient registration failure in review and permits a successful retry", async () => {
    const user = userEvent.setup();
    installTransientNativeRegistrationFailure();
    render(<App />);
    await compileAndCheck(user);
    await runSimulatorStep(user, /stage guided tool/i);
    const sheet = await screen.findByRole("dialog", { name: /review reusable tool/i });
    const approve = within(sheet).getByRole("button", { name: /approve & register/i });

    await user.click(approve);

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      /transient webmcp registration failure/i,
    );
    expect(sheet).toBeInTheDocument();
    expect(approve).toHaveFocus();
    expect(
      Object.values(useAppStore.getState().proposals).find(
        (proposal) => proposal.status === "awaiting_approval",
      ),
    ).toBeDefined();
    await user.keyboard("{Tab}");
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.click(approve);

    await waitFor(() => expect(sheet).not.toBeInTheDocument());
    expect(useAppStore.getState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "registered",
      enabled: true,
    });
  });

  it("uses live registration truth when an enabled saved workflow is unavailable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await approveGuidedTool(user);
    const simulator = screen.getByRole("dialog", { name: /webmcp simulator/i });
    await user.click(within(simulator).getByRole("button", { name: /close simulator/i }));

    act(() => {
      const state = useAppStore.getState();
      state.setWebMCPMetadata({
        registeredToolNames: state.webmcp.registeredToolNames.filter(
          (name) => name !== "renew_permit_guided",
        ),
      });
      useAppStore.setState({ portalMode: "idle", currentService: null, activeViewId: null });
    });

    expect(useAppStore.getState().approvedWorkflowTools.renew_permit_guided).toMatchObject({
      status: "registered",
      enabled: true,
    });
    expect(screen.queryByText(promptB)).not.toBeInTheDocument();

    const unavailableSimulator = await openSimulator(user);
    expect(
      within(unavailableSimulator).getByRole("button", {
        name: /invoke guided tool with 12 months/i,
      }),
    ).toBeDisabled();
    await user.click(
      within(unavailableSimulator).getByRole("button", { name: /close simulator/i }),
    );

    await user.click(screen.getByRole("tab", { name: /tool surface/i }));
    const toolRow = screen.getByTestId("tool-row-renew_permit_guided");
    expect(toolRow).toHaveTextContent("Registration failed");
    expect(toolRow).not.toHaveTextContent("Registered");
    expect(toolRow).toHaveTextContent(/reload.*retry registration/i);
    expect(screen.queryByText(promptB)).not.toBeInTheDocument();

    act(() => {
      const state = useAppStore.getState();
      state.setWebMCPMetadata({
        registeredToolNames: [...state.webmcp.registeredToolNames, "renew_permit_guided"].sort(),
      });
    });

    expect(toolRow).toHaveTextContent("Registered");
    expect(screen.getAllByText(promptB)).toHaveLength(2);

    const availableSimulator = await openSimulator(user);
    expect(
      within(availableSimulator).getByRole("button", {
        name: /invoke guided tool with 12 months/i,
      }),
    ).toBeEnabled();
  });

  it("prefills every static simulator tool with canonical JSON and shows complete annotations", async () => {
    const user = userEvent.setup();
    render(<App />);
    const simulator = await openSimulator(user);
    const chooser = within(simulator).getByLabelText(/choose a tool/i);
    const input = within(simulator).getByLabelText(/tool arguments/i);
    const expectedSamples: Record<string, (sample: Record<string, unknown>) => void> = {
      inspect_portal: (sample) => expect(sample).toEqual({ serviceId: "all" }),
      compile_task_view: (sample) => {
        expect(sample.serviceId).toBe("parking_permit_renewal");
        expect(sample.requireHumanConfirmation).toBe(true);
        expect(sample.fieldOrder).toEqual(expect.arrayContaining(["permitDurationMonths"]));
      },
      inspect_task_view: (sample) => expect(sample).toEqual({}),
      patch_task_view: (sample) => {
        expect(sample.viewId).toBeTruthy();
        expect(sample.patches).toEqual([{ type: "set_title", title: "Renew your parking permit" }]);
      },
      run_journey_checks: (sample) => {
        expect(sample.viewId).toBeTruthy();
        expect(sample.includeDomChecks).toBe(true);
      },
      stage_workflow_tool: (sample) => {
        expect(sample.name).toBe("renew_permit_guided");
        expect(sample.stopAt).toBe("review");
        expect(sample.operations).toHaveLength(7);
      },
      list_workflow_tools: (sample) => expect(sample).toEqual({ includeDisabled: true }),
    };

    for (const [name, assertSample] of Object.entries(expectedSamples)) {
      await user.selectOptions(chooser, name);
      assertSample(JSON.parse((input as HTMLTextAreaElement).value) as Record<string, unknown>);
      expect(within(simulator).getByText(/^readOnlyHint: (true|false)$/)).toBeInTheDocument();
      expect(within(simulator).getByText(/^untrustedContentHint: false$/)).toBeInTheDocument();
    }
  });

  it("keeps exact Prompt B copyable and prefills the approved dynamic tool", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);
    await compileAndCheck(user);
    await approveGuidedTool(user);

    const promptCard = screen.getByText(promptB).closest("article");
    expect(promptCard).not.toBeNull();
    await user.click(within(promptCard!).getByRole("button", { name: /copy prompt 2/i }));
    expect(writeText).toHaveBeenCalledWith(promptB);

    const simulator = await screen.findByRole("dialog", { name: /webmcp simulator/i });
    await user.selectOptions(
      within(simulator).getByLabelText(/choose a tool/i),
      "renew_permit_guided",
    );
    expect(
      JSON.parse(
        (within(simulator).getByLabelText(/tool arguments/i) as HTMLTextAreaElement).value,
      ),
    ).toEqual({
      durationMonths: 12,
    });
    expect(within(simulator).getByText(/^readOnlyHint: false$/)).toBeInTheDocument();
    expect(within(simulator).getByText(/^untrustedContentHint: false$/)).toBeInTheDocument();
  });

  it("reports every actual metric and counts a lock only when an agent patch is rejected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await user.click(screen.getByRole("button", { name: /close simulator/i }));

    for (const label of [
      "WebMCP calls",
      "Human edits",
      "Locks preserved",
      "Workflow operations",
      "Last tool duration",
      "Blocking checks",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Locks preserved").closest("span")).toHaveTextContent("0");

    await user.click(screen.getByRole("button", { name: /lock vehicleId copy/i }));
    expect(screen.getByText("Locks preserved").closest("span")).toHaveTextContent("0");

    const simulator = await openSimulator(user);
    await user.selectOptions(within(simulator).getByLabelText(/choose a tool/i), "patch_task_view");
    fireEvent.change(within(simulator).getByLabelText(/tool arguments/i), {
      target: {
        value: JSON.stringify({
          viewId: useAppStore.getState().activeViewId,
          patches: [{ type: "set_copy", fieldId: "vehicleId", label: "A patched label" }],
        }),
      },
    });
    await user.click(within(simulator).getByRole("button", { name: /run selected tool/i }));
    await waitFor(() =>
      expect(screen.getByText("Locks preserved").closest("span")).toHaveTextContent("1"),
    );
  });

  it("lets a human disable and delete a compiled tool with confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await compileAndCheck(user);
    await approveGuidedTool(user);
    await user.click(screen.getByRole("tab", { name: /tool surface/i }));

    const toolRow = screen.getByTestId("tool-row-renew_permit_guided");
    expect(screen.getByText(promptB)).toBeInTheDocument();
    await user.click(within(toolRow).getByRole("button", { name: /disable/i }));
    expect(toolRow).toHaveTextContent("Disabled");
    expect(screen.queryByText(promptB)).not.toBeInTheDocument();
    const deleteButton = within(toolRow).getByRole("button", { name: /delete/i });
    await user.click(deleteButton);
    let confirmDelete = await screen.findByRole("dialog", { name: /delete compiled tool/i });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(confirmDelete).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();

    await user.click(deleteButton);
    confirmDelete = await screen.findByRole("dialog", { name: /delete compiled tool/i });
    await user.click(within(confirmDelete).getByRole("button", { name: /delete tool/i }));
    expect(screen.queryByTestId("tool-row-renew_permit_guided")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /tool surface/i })).toHaveFocus();
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

  it("unregisters dynamic tools after every reset while retaining the mounted runtime", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (let cycle = 0; cycle < 2; cycle += 1) {
      await compileAndCheck(user);
      await approveGuidedTool(user);
      expect(useAppStore.getState().webmcp.registeredToolNames).toContain("renew_permit_guided");
      await user.click(screen.getByRole("button", { name: /reset demo/i }));
      await waitFor(() => {
        expect(useAppStore.getState().webmcp.registeredToolNames).toHaveLength(7);
        expect(useAppStore.getState().webmcp.registeredToolNames).not.toContain(
          "renew_permit_guided",
        );
        expect(useAppStore.getState().approvedWorkflowTools).toEqual({});
      });
    }
  });

  it("has no serious or critical axe violations on the initial portal", async () => {
    render(<App />);
    await screen.findByText(/7 registered tools/i);
    const result = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      result.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
});
