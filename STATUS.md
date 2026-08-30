# WebMCP Airlock status

**Status:** Complete and deployable  
**Verified:** 2026-08-30  
**Environment:** Node.js 22, Chromium, desktop 1440×1000, mobile 390×844

## Shipped product

WebMCP Airlock is fully implemented as a static, browser-local React application. The canonical `INC-4821` journey works end to end in both a native-like top-level WebMCP context and the ordinary-browser simulator:

1. Seven static tools register.
2. Prompt A investigates the outage through real handlers.
3. Third-party prompt injection is visibly quarantined.
4. Release correlation, a deterministic 10% canary, and nine Airlock gates pass.
5. The agent stages `rollback_checkout_release` without registering it.
6. A person approves one precise permission envelope.
7. The dynamic tool registers and emits visible `toolchange`.
8. Prompt B invokes it in the same page session.
9. The trusted executor snapshots, canaries, promotes, resolves, and records a receipt.
10. Checkout recovers to 0.6% errors and 420 ms p95 latency on release `2026.08.30.2`.
11. The one-use tool unregisters through its `AbortController`, emits a second visible `toolchange`, and rejects a second invocation.

## Architecture and safety evidence

| Requirement                  | Evidence                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level imperative WebMCP  | Native adapter calls `document.modelContext.registerTool`; native-like Playwright boot installs the context before page load.                                                      |
| Exactly seven static tools   | Static name constant, registry tests, Tool Surface, and canonical seven→eight→seven assertions.                                                                                    |
| Strict typed inputs          | Closed JSON schemas plus strict Zod runtime validation; extra properties and invalid canary values are tested.                                                                     |
| Evidence trust boundary      | `query_telemetry` has `untrustedContentHint: true`; the canonical third-party instruction is inert, classified, quarantined, and excluded from authority.                          |
| Safe response compilation    | Policy checks enforce incident revision, checkout-only scope, trusted registry membership, dependency order, expiry, canary thresholds, rollback path, and one mutation.           |
| Human-approved dynamic tool  | No agent approval tool exists; the visible proposal sheet is the only approval path.                                                                                               |
| Autonomous bounded execution | One approval covers six fixed trusted operations; execution requires no repeated confirmation inside the approved envelope.                                                        |
| AbortController lifecycle    | Disable, delete, reset, successful consumption, and expiry remove dynamic registration safely.                                                                                     |
| Visible `toolchange`         | Tool Surface count and dynamic highlighting update; Activity exposes `WebMCP tool surface changed`; canonical E2E asserts both native events.                                      |
| Failure safety               | Cancellation and operation failure restore the complete snapshot and record a failed/cancelled receipt.                                                                            |
| Durable recovery             | Versioned `airlock.incident.v1`, `airlock.responses.v1`, and `airlock.ui.v1` envelopes revalidate on hydration; corrupt, stale, expired, and completed authority does not restore. |
| No hidden production power   | No backend, network request, credential, arbitrary code, shell, URL, selector, customer-data export, deletion, secret access, or unrelated-service operation exists.               |

## Verification results

The latest complete component gate passed:

| Check                      | Result                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| ESLint                     | Passed with zero warnings                                                                        |
| Prettier check             | Passed                                                                                           |
| Strict TypeScript check    | Passed                                                                                           |
| Unit and integration tests | 15 files, 67 tests passed                                                                        |
| Production build           | Passed; 1,630 modules transformed                                                                |
| Playwright                 | 11 tests passed                                                                                  |
| Accessibility              | Zero serious or critical axe findings in initial, proposal, live-tool, and recovered states      |
| Interaction sizing         | Every visible tested control is at least 44×44 CSS pixels                                        |
| Keyboard and dialogs       | Approval, Prompt B, focus trap, and focus navigation passed                                      |
| Persistence lifecycle      | Reload, enabled restoration, expiry, completion, disable, delete, reset, and cancellation passed |
| Responsive presentation    | Desktop and mobile canonical states have no horizontal overflow                                  |
| Runtime errors             | Canonical console-error and page-error collection is empty                                       |

The authoritative final command is `npm run check`, which runs lint, formatting, typecheck, Vitest, production build, and the complete Playwright suite in order.

## Screenshot inspection

Fresh Playwright screenshots were captured and inspected at original resolution for:

- Desktop initial incident, quarantined threat, proposal, dynamic tool live, and resolved receipt states.
- Desktop responsive initial and proposal states.
- Mobile initial, proposal, and recovered states.

The final inspection confirmed readable hierarchy, consistent status colors and labels, no clipped controls or horizontal overflow, a usable stacked mobile topology, an unobscured approval sheet, and the corrected deployment timeline: `2026.08.30.2` is **CURRENT · restored stable**, while `2026.08.30.3` is **ROLLED BACK · incident release**.

## Submission assets

- `README.md`: product, journey, WebMCP architecture, safety, setup, tests, deployment, and limitations.
- `DEMO_SCRIPT.md`: timed 2:45 walkthrough.
- `SUBMISSION_DRAFT.md`: complete challenge narrative with placeholders only for external URLs.
- `evals/webmcp-cases.json`: 16 valid tool-selection and safety fixtures.
- `LICENSE`: MIT.

## Honest limits

Airlock is a fictional incident and deterministic safety demonstration, not a real production-control plane. The injection detector recognizes the shipped fixture; it does not claim general prompt-injection prevention. Native WebMCP depends on browser availability, while the memory simulator proves the same local handlers and lifecycle in ordinary browsers. Automated accessibility checks are regression evidence, not formal certification.

No known P0 requirement, acceptance criterion, test failure, runtime console error, or presentation blocker remains.
