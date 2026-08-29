# One-Shot Build Prompt for Claude Code or Codex

Place `CivicWeave_Complete_Build_Spec.md` in the repository root, then give the coding agent this prompt:

---

Read `CivicWeave_Complete_Build_Spec.md` completely before changing files. Treat it as the product and engineering source of truth.

Implement the entire CivicWeave project end to end. Do not ask me clarifying questions and do not stop at scaffolding, mock screens, TODOs, or a partial happy path. Use the safest and simplest interpretation when a minor detail is unspecified.

You must:

1. Build every P0 requirement and satisfy every acceptance criterion in Section 26.
2. Preserve the required WebMCP architecture: top-level imperative `document.modelContext.registerTool`, seven static tools, safe schema-based interface compilation, human-approved dynamic tool registration, `AbortController` unregistration, visible `toolchange`, and human-only final submission.
3. Never generate or execute arbitrary JavaScript, HTML, CSS, selectors, URLs, or network requests.
4. Implement native WebMCP feature detection and the memory/simulator adapter for local and automated testing.
5. Implement the complete two-prompt canonical journey, including dynamic registration and invocation of `renew_permit_guided`.
6. Create all tests, eval fixtures, README, demo script, submission draft, MIT license, and `STATUS.md` required by the specification.
7. Run lint, formatting check, strict typecheck, unit/integration tests, Playwright tests, and production build. Fix every failure.
8. Use Playwright to capture and inspect desktop and mobile screenshots; correct visible UI, overflow, focus, accessibility, and interaction problems.
9. Keep working until the project is deployable and the canonical E2E flow passes with no runtime console errors.

Maintain `STATUS.md` while you work. At the end, update it with the exact commands run, their results, any justified deviations, and concise instructions for testing the deployed app in ChatGPT’s built-in browser and in simulator mode.

Begin by reading the full specification and creating an implementation checklist in `STATUS.md`, then execute it without waiting for additional approval.
