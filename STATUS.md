# CivicWeave Status

Last updated: 2026-08-29

## Current phase

Complete. The application is deployable as a static Vite site, the canonical two-prompt journey passes end to end, and the fresh required quality gate exits 0.

## Final quality gate

Authoritative command: `npm run check`

- Exit code: `0`.
- ESLint: passed with zero warnings.
- Prettier: all matched files conform.
- Strict TypeScript: passed with no diagnostics.
- Vitest: `16` files passed; `166` tests passed.
- Production build: passed; Vite transformed `1,645` modules.
- Playwright: `13` tests passed using `4` workers in `28.4s`.
- Accessibility: dense, adaptive, proposal, and submitted browser states have zero serious or critical axe violations in the tested canonical screens.
- Runtime: canonical `console` error and `pageerror` collections were both empty.
- Target size: the original browser assertion requiring every large-card target to be at least `44 × 44` CSS px passes. Large-card lock controls additionally pass a `45 × 45` safety-margin assertion after their CSS minimum was raised to `46 × 46`.
- Evals: `18` valid fixtures with `18` unique IDs.
- Build advisory: Vite reports the non-blocking main-chunk size advisory (`1,015.96 kB` minified, `285.03 kB` gzip), primarily because the deterministic browser axe scanner is shipped client-side.

## Section 26 acceptance evidence

### Product

| Criterion                                          | Final evidence                                                                                                                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polished fictional Northstar portal and disclaimer | `src/app/App.integration.test.tsx` verifies the six-service portal and persistent disclaimer; `canonical-dense-desktop.png` and `responsive-dense-mobile.png` show the final portal.                                             |
| Manual Parking Permit Renewal                      | The App integration suite completes the manual parking path and proves submission occurs only after the human confirmation dialog.                                                                                               |
| Generic Address Change architecture                | `serviceBlueprints.test.ts` asserts all six Section 14 fields; `workflowExecutor.test.ts`, `dynamicToolManager.test.ts`, and the App integration suite exercise the shared compiler, operation registry, manager, and manual UI. |
| Canonical prompts visible and copyable             | Prompt A is shown initially; exact Prompt B appears only after `renew_permit_guided` is enabled. App integration verifies exact copy text and clipboard calls.                                                                   |
| Adaptive view visibly differs from dense portal    | `canonical-dense-desktop.png`, `canonical-adaptive-desktop.png`, and the reduced-motion mobile captures show the dense-to-xlarge one-question transformation.                                                                    |
| Validated schema and approved components only      | `viewCompiler.test.ts`, `journeyChecks.test.ts`, strict tool schemas, and the `FieldKind`-only registry in `AdaptiveField.tsx` cover this boundary.                                                                              |
| Human edit and lock controls                       | App integration and canonical Playwright coverage edit adaptive values and lock the vehicle through visible controls.                                                                                                            |
| Agent patches cannot overwrite locks               | `viewCompiler.test.ts`, `staticTools.test.ts`, and the canonical E2E assert atomic `LOCKED_BY_USER` behavior and lock preservation.                                                                                              |
| Visible deterministic checks                       | The Checks rail and proposal capture show results; canonical E2E requires zero blocking failures before staging.                                                                                                                 |
| Honest manual/adaptive/compiled metrics            | `MetricsStrip` labels modeled counts, displays all six actual metrics, and is asserted in App integration and final screenshots.                                                                                                 |

### WebMCP

| Criterion                                         | Final evidence                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct top-level native registration              | `src/webmcp/nativeAdapter.ts` directly calls `document.modelContext.registerTool(...)`; no iframe or production monkey-patch exists.                |
| Exactly seven static tools                        | `staticTools.test.ts` and canonical Playwright enumeration assert the exact seven stable names.                                                     |
| Narrow schemas with `additionalProperties: false` | Static registry tests reject extra executable-looking properties; derived dynamic schema tests assert the same closed boundary.                     |
| Read/write annotations                            | `staticTools.test.ts` and simulator integration verify `readOnlyHint` and `untrustedContentHint` metadata.                                          |
| Tool calls update UI and Activity                 | The registry records timing, metrics, and activity; canonical screenshots and tests show shared live entries.                                       |
| Dynamic `AbortController` lifecycle               | `dynamicToolManager.test.ts`, memory-adapter tests, and persistence Playwright coverage prove registration-signal unregistration.                   |
| Visible `toolchange` listener                     | Canonical E2E observes the browser event and the separate visible Activity entry.                                                                   |
| Staging cannot approve/register                   | Static-tool tests and canonical E2E prove `stage_workflow_tool` opens review while the dynamic name is absent.                                      |
| Registration approval is human-only               | Approval is only the proposal-sheet button; no static or dynamic approval tool is defined.                                                          |
| Approval registers `renew_permit_guided`          | Canonical E2E clicks **Approve & Register** and observes the eighth live tool.                                                                      |
| New tool appears and runs in the same session     | Canonical E2E asserts the Tool Surface row and invokes it through the same `document.modelContext`.                                                 |
| Dynamic execution stops at review                 | Manager and canonical tests require `DRAFT_STAGED`, `awaiting_user_confirmation`, fee `60`, and `submitted: false`.                                 |
| Final submission is human UI only                 | Executor/validator tests exclude submit operations; only the visible **Confirm & Submit** action reaches the final store action.                    |
| Disable/delete unregister                         | Persistence E2E proves Disable aborts registration; App integration covers human-confirmed Delete and metadata removal.                             |
| Native detection and memory simulator             | Canonical tests use the native-like top-level mock; App/runtime and ordinary-browser Playwright tests use the same definitions through memory mode. |

### Safety

| Criterion                                                            | Final evidence                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No generated code, markup, styles, selectors, URLs, or network calls | Compiler/tool schemas accept data definitions only; source audit finds no `eval`, `new Function`, `dangerouslySetInnerHTML`, or production fetch boundary. |
| Trusted registry operations only                                     | Workflow validator tests reject unknown and cross-service operation IDs.                                                                                   |
| Human-only operations blocked                                        | Validator and executor tests require the precise `HUMAN_ONLY_OPERATION`; a same-service submit no longer emits a misleading cross-service error.           |
| Failure/cancellation rollback                                        | `workflowExecutor.test.ts` asserts exact draft and portal-state rollback for both services, observer failures, and cancellation.                           |
| Required fields cannot be hidden                                     | Compiler, validator, static-tool, and eval cases cover compile and patch failure.                                                                          |
| Explicit final confirmation                                          | Manual, adaptive, and dynamic paths all stop at the accessible confirmation dialog before the human button.                                                |
| Fictional data and no affiliation implication                        | Header subtitle, simulator notice, submission copy, README, and persistent footer state the fictional boundary.                                            |

### Quality

| Criterion                           | Final evidence                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript                   | Fresh `npm run check`: passed.                                                                                                                                                         |
| ESLint zero warnings                | Fresh `npm run check`: passed.                                                                                                                                                         |
| Prettier                            | Fresh `npm run check`: passed.                                                                                                                                                         |
| Unit and integration tests          | `16` Vitest files and `166` tests passed.                                                                                                                                              |
| Playwright tests                    | All `13` passed using the authoritative four-worker run.                                                                                                                               |
| Production build                    | Passed with `1,645` modules transformed.                                                                                                                                               |
| No serious/critical axe findings    | Playwright scans dense, adaptive, proposal, and submitted canonical states; all passed.                                                                                                |
| Desktop/mobile presentation         | All ten named screenshots were freshly recaptured and inspected; no overflow, clipping in the live viewport, obscured controls, mid-fade adaptive state, or contrast defect was found. |
| No canonical runtime console errors | `e2e/canonical-flow.spec.ts` records and asserts an empty error collection.                                                                                                            |
| Reload and reset                    | Persistence Playwright tests cover approval re-registration, Disable, exact four-key clearing, and seven-tool reset.                                                                   |

### Submission assets

| Criterion                                                            | Final evidence                                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| MIT license                                                          | `LICENSE` contains the MIT license.                                                                                        |
| README product/architecture/safety/setup/testing/deployment coverage | `README.md` contains all 17 required sections and the exact no-executable-code statement.                                  |
| Mermaid architecture                                                 | Included in README.                                                                                                        |
| Two canonical prompts                                                | Included exactly in README and the enabled UI journey.                                                                     |
| Distinction from form filling and notebooks                          | README explicitly explains both distinctions.                                                                              |
| Sub-three-minute demo script                                         | `DEMO_SCRIPT.md` is timed to `2:58`.                                                                                       |
| Complete submission draft                                            | `SUBMISSION_DRAFT.md` contains every required field and only placeholders for unknown links.                               |
| At least 12 evals                                                    | `evals/webmcp-cases.json` contains `18` documented fixtures.                                                               |
| Final status evidence                                                | This file records the fresh gate, every Section 26 criterion, screenshot paths, deviations, and all 16 Section 34 answers. |

## Final screenshot artifacts and inspection

Desktop:

- `/Users/bilginkocak/hobby/civicweave/test-results/canonical-flow-canonical-t-c61d4-mits-through-the-human-gate-chromium/canonical-dense-desktop.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/canonical-flow-canonical-t-c61d4-mits-through-the-human-gate-chromium/canonical-adaptive-desktop.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/canonical-flow-canonical-t-c61d4-mits-through-the-human-gate-chromium/canonical-proposal-desktop.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/canonical-flow-canonical-t-c61d4-mits-through-the-human-gate-chromium/canonical-submitted-desktop.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-desktop-1440-by-9aae9-osal-states-do-not-overflow-chromium/responsive-dense-desktop.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-desktop-1440-by-9aae9-osal-states-do-not-overflow-chromium/responsive-proposal-desktop.png`

Mobile (`390 × 844` viewport):

- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-mobile-390-by-8-f82aa-ds-and-captures-the-journey-chromium/responsive-dense-mobile.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-mobile-390-by-8-f82aa-ds-and-captures-the-journey-chromium/responsive-adaptive-mobile.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-mobile-390-by-8-f82aa-ds-and-captures-the-journey-chromium/responsive-proposal-mobile.png`
- `/Users/bilginkocak/hobby/civicweave/test-results/responsive-mobile-390-by-8-f82aa-ds-and-captures-the-journey-chromium/responsive-submitted-mobile.png`

The responsive capture suite emulates `prefers-reduced-motion: reduce` before loading the page, so `responsive-adaptive-mobile.png` is fully opaque and cannot be captured during the 240 ms entrance animation. Desktop and mobile dense, adaptive, proposal, and submitted surfaces were inspected at original resolution. Focus indicators, dialogs, in-flow status announcement, sticky actions, internal rail scrolling, disclaimer, and the 70/30-to-stacked layout are visually sound.

## Unavoidable deviations

None.

Environment note: a sandboxed browser run cannot bind `127.0.0.1:5173` (`EPERM`); the approved local-server run completed normally. This is a test-host restriction, not an application deviation. Experimental native-WebMCP availability remains browser-dependent as documented; the native-like browser contract and memory fallback are both tested.

## Final self-review (Section 34)

1. **Yes.** The hero, 20-second README explanation, Prompt A, and visible capability ribbon communicate the product without source review.
2. **Yes.** The six-service Northstar portal is credible; information density, not deliberate bad design, establishes the problem.
3. **Yes.** The canonical view visibly applies xlarge text, large controls, plain language, one-question navigation, and progress.
4. **Yes.** Native status, typed Tool Surface metadata, Activity entries, and model-context E2E calls make WebMCP usage explicit.
5. **Yes.** The human vehicle lock is visible and a conflicting agent patch returns `LOCKED_BY_USER` atomically.
6. **Yes.** Fifteen deterministic checks cover completeness, safety, presentation, locks, and mounted axe results.
7. **Yes.** `stage_workflow_tool` stops at the proposal sheet before registration.
8. **Yes.** Approval exists only as a human proposal-sheet control.
9. **Yes.** Approval creates the new live `renew_permit_guided` registration.
10. **Yes.** Tool Surface highlighting, the polite announcement, and a distinct Activity entry expose `toolchange`.
11. **Yes.** The canonical test invokes the new tool in the same page session.
12. **Yes.** The dynamic tool returns `awaiting_user_confirmation` and cannot call `permit.submit`.
13. **Yes.** Final submission exists only behind the visible human confirmation dialog.
14. **Yes.** Ordinary-browser simulator mode runs the same definitions and handlers without monkey-patching `document.modelContext`.
15. **Yes.** The fresh full `npm run check` exits 0 with `166` Vitest and `13` Playwright tests passing.
16. **Yes.** README/submission claims are bounded to implemented, testable behavior and explicitly qualify modeled metrics, eval fixtures, deterministic accessibility checks, browser compatibility, and fictional services.
