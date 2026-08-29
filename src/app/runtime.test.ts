import { afterEach, describe, expect, it, vi } from "vitest";

import { createJourneyChecksProvider } from "./runtime";

describe("mounted journey presentation checks", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("measures every visible large-card control and fails for one undersized target", async () => {
    document.body.innerHTML = `
      <section id="adaptive-workspace" class="controls-large_cards">
        <h1>Adaptive task</h1>
        <button id="title-lock">Lock title</button>
        <label class="large-card-control"><input type="radio" name="duration">12 months</label>
        <button id="copy-lock">Lock copy</button>
        <button id="next">Next question</button>
        <progress max="2" value="1"></progress>
      </section>
    `;
    let undersized = true;
    const measured: string[] = [];
    const provider = createJourneyChecksProvider({
      measureTarget(element) {
        measured.push(element.id || element.className);
        return element.id === "copy-lock" && undersized
          ? { width: 43, height: 44 }
          : { width: 44, height: 44 };
      },
      runAxe: vi.fn().mockResolvedValue({ violations: [] }),
    });

    const failing = await provider.getContext("view_1");
    expect(measured).toEqual(
      expect.arrayContaining(["title-lock", "large-card-control", "copy-lock", "next"]),
    );
    expect(failing.presentation.largeTargetsPresent).toBe(false);

    undersized = false;
    measured.length = 0;
    const passing = await provider.getContext("view_1");
    expect(measured).toHaveLength(4);
    expect(passing.presentation.largeTargetsPresent).toBe(true);
  });
});
