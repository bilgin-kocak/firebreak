# Firebreak: WebMCP Emergency Robot Commander — status

**Status:** Deployed release candidate; narrated demo-video upload pending

**Verified:** 2026-09-01

**Live:** [firebreak-eosin.vercel.app](https://firebreak-eosin.vercel.app/)

**Verified source:** current `main` release (full gate below)

**Environment:** Node.js 22.20.0, Chromium, desktop 1440×900/1440×1000, mobile 390×844

## Shipped product

Firebreak is implemented as a static browser application with a complete playable and agent-driven warehouse rescue:

1. The user starts emergency `WH-01` and can drive any selected robot through keyboard, full touch controls, or standard-gamepad driving, camera, action, and fleet-selection input.
2. Exactly seven static WebMCP tools register at the top-level model context.
3. A fresh-chat Prompt 1 is visible before start and copied by the one-click start control. It explicitly restricts the agent to the current tab’s site tools. In the observed GPT-5.6 Sol run, the real agent invoked the native surface to inspect, scan, simulate, validate eleven gates, and stage `execute_rescue_mission`.
4. Staging leaves the tool count at seven and opens a visible review sheet.
5. Only the human **Authorize one mission** control can create authority.
6. The dynamic tool registers with an `AbortController`, emits `toolchange`, and changes the visible surface from seven to eight tools.
7. The complete Prompt 2 path is proven by the native-like browser boundary test; a final human-approved live recording remains an external demo task.
8. In the deterministic browser scenario, both workers reach safety, the battery fire is contained, the hazardous load is secured, and a receipt reports zero safety violations.
9. Successful execution consumes and unregisters the dynamic tool, emits `toolchange`, and returns the surface to seven tools.
10. Reload never restores live movement authority; a completed receipt persists safely.
11. In ordinary browsers, **Replay walkthrough · no agent** is explicitly identified as a deterministic fallback and never masquerades as a live agent.
12. A bounded, non-persistent live trace shows safe input summaries, successes, refusals, the human grant, and exact 7 → 8 → 7 `toolchange` events.
13. The 90-second active-mission clock visibly pauses during fresh-chat cold start, human review, and the approved Prompt 2 handoff; a dedicated browser regression proves those waits consume no rescue time.
14. Live execution now clears the planning interface into a cinematic HUD, gives every robot a guaranteed camera shot before the final wide view, shows live progress and one-use authority, preserves stored operator controls, and keeps Emergency Stop visible.

## Architecture and safety evidence

| Requirement                 | Evidence                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top-level imperative WebMCP | The native adapter calls `document.modelContext.registerTool`; Playwright installs a native-like context before page load and records calls/events.                      |
| Seven static tools          | One canonical constant, registry tests, UI count, and browser assertions enforce the exact seven names.                                                                  |
| Strict schemas              | Every tool has `additionalProperties: false` plus strict Zod validation; extra fields and invalid enums are rejected before handlers run.                                |
| Safe interface compilation  | Only a current passing simulation can compile the fixed `execute_rescue_mission` interface; the agent never supplies routes, topics, robot IDs, or coordinates.          |
| Human-approved registration | No approval tool exists. The only authorization path is the visible, focus-trapped human control.                                                                        |
| `AbortController` lifecycle | Completion, failure, cancellation, reset, reload, proactive five-minute expiry, runtime destruction, and revocation remove page-session authority.                       |
| Visible `toolchange`        | The Tool Surface and live trace display seven→eight→seven; native-like E2E asserts exactly those two registration events.                                                |
| Safe live trace             | Schema-declared input summaries are bounded and secret-aware; raw result data is never retained; hostile getters fail closed.                                            |
| Human-only final boundary   | Prompt 1 stages but cannot register or move the fleet. Prompt 2 exists only after a person authorizes the reviewed mission.                                              |
| Stale-state defense         | Revision and FNV-1a world fingerprints bind the simulation, safety proof, proposal, and execution.                                                                       |
| Route safety                | Eleven checks cover exact robots, complete routes, collapse-zone and shelf exclusion, 1.25 m separation, battery, duration, roles, recovery, and one-use budget.         |
| Failure behavior            | Browser execution stops and restores the pre-run world. ROS mode stops and retains truthful partial progress.                                                            |
| Persistence                 | Three versioned Zod-validated envelopes recover world, mission, and UI state without persisting in-flight execution or restoring registered authority.                   |
| ROS boundary                | Fixed namespaces/topics/types, fresh odometry and battery, positive role-action feedback, clamps, watchdog, secure bridge rules, and fleet stop fail closed.             |
| Mission limits              | A deterministic 90-second active clock pauses at agent/human handoffs; once planning or execution is active, expiry and the 45-second execution deadline stop the fleet. |

## Verification results

| Check                      | Result                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier                   | Passed across the repository                                                                                                              |
| ESLint                     | Passed with zero warnings                                                                                                                 |
| Strict TypeScript          | Passed                                                                                                                                    |
| Unit and integration tests | 18 files, 97 tests passed on Vitest 4.1.11                                                                                                |
| Production build           | Passed on Vite 8.2.2; 2,151 modules transformed                                                                                           |
| Dependency audit           | `npm audit` reports 0 vulnerabilities                                                                                                     |
| Playwright                 | 13 tests passed in Chromium, including camera sequencing, Emergency Stop, control locking, and fresh-chat timer handoff                   |
| Canonical journey          | Native-like refusal → Prompt 1 → human grant → Prompt 2 → four camera cuts → final wide → receipt → unregistration passed                 |
| Accessibility              | No serious or critical axe findings in ready, proposal, authority, executing, and resolved states                                         |
| Target sizing              | Every visible tested interactive target is at least 44×44 CSS pixels                                                                      |
| Keyboard and gamepad       | Keyboard-only authorization works; mocked gamepad drives, switches robots, moves camera, and opens mission control                        |
| Persistence                | Reload revocation, completed receipt recovery, and reset isolation passed                                                                 |
| Responsive UI              | Desktop and mobile judged states have no horizontal overflow                                                                              |
| Visual QA                  | Initial, proposal, authority, executing, and completed desktop/mobile screenshots inspected; judge image committed under `docs/assets/`   |
| Runtime errors             | Playwright plus local and deployed in-app inspection collected zero console errors or page errors                                         |
| Built-in browser check     | On 2026-09-01, the public HTTPS build exposed all seven native tools and completed the real Prompt 1 tool chain through 11/11 gates       |
| Public deployment          | Vercel HTTPS loaded the Babylon scene, returned the expected `HAZARD_SCAN_REQUIRED` refusal, staged the proposal, and stopped at approval |

The main application shell is 333.45 kB minified (99.41 kB gzip). The Babylon scene is lazy-loaded as a separate 1,074.85 kB chunk (254.98 kB gzip). Havok is a separate 2,094.56 kB WebAssembly asset (668.98 kB gzip).

The authoritative full command is `npm run check`; it runs formatting, lint, strict typechecking, all Vitest tests, a production build, and the complete Playwright suite.

## Release assets

- `README.md`: product, controls, WebMCP architecture, safety, setup, testing, deployment, and limits.
- `DEMO_SCRIPT.md`: timed 2:10 clip-by-clip real-agent recording plan with a cold open, refusal, cinematic execution, narration, and final edit checklist.
- `SUBMISSION_DRAFT.md`: complete challenge narrative with a placeholder only for the demo-video URL.
- `evals/webmcp-cases.json`: 21 authored tool-selection, schema, safety, lifecycle, and refusal fixtures; no live-model pass rate is claimed.
- `robotics/README.md`: honest optional ROS 2 Jazzy, Gazebo Harmonic, Nav2, and rosbridge integration guide.
- `robotics/rosbridge-allowlist.yaml`: server-side topic/type allowlist example.
- `LICENSE`: MIT.

## Honest limits

WH-01 is a fictional, deterministic browser emergency and not a certified live dispatch product. The ROS adapter is covered with a fake bridge; no live Gazebo environment or physical robot was available for this release gate. Native WebMCP remains browser- and rollout-dependent. GPT-5.6 Sol completed the actual native Prompt 1 journey and stopped at human authorization; the full authorization and Prompt 2 journey remains covered by the native-like browser test until a person approves the live staged mission. The 21 eval cases are authored fixtures rather than a live-model benchmark. Automated accessibility tests are regression evidence, not formal certification.

No known local P0 failure, TODO, runtime console error, or presentation blocker remains. The narrated real-agent video is the remaining submission operation.
