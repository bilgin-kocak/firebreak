# WebMCP Firebreak status

**Status:** Complete and deployable  
**Verified:** 2026-08-30  
**Environment:** Node.js 22.20.0, Chromium, desktop 1440×900/1440×1000, mobile 390×844

## Shipped product

WebMCP Firebreak is implemented as a static browser application with a complete playable and agent-driven warehouse rescue:

1. The user starts emergency `WH-01` and can drive any selected robot through keyboard, touch, or gamepad input.
2. Exactly seven static WebMCP tools register at the top-level model context.
3. Prompt 1 inspects the emergency and four-robot fleet, scans hazards, simulates four synchronized routes, validates eleven gates, and stages `execute_rescue_mission`.
4. Staging leaves the tool count at seven and opens a visible review sheet.
5. Only the human **Authorize one mission** control can create authority.
6. The dynamic tool registers with an `AbortController`, emits `toolchange`, and changes the visible surface from seven to eight tools.
7. Prompt 2 executes the exact reviewed route set across SCOUT-1, MEDIC-2, SUPPRESS-3, and HAUL-4.
8. Both workers reach safety, the battery fire is contained, the hazardous load is secured, and a receipt reports zero safety violations.
9. Successful execution consumes and unregisters the dynamic tool, emits `toolchange`, and returns the surface to seven tools.
10. Reload never restores live movement authority; a completed receipt persists safely.

## Architecture and safety evidence

| Requirement                 | Evidence                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level imperative WebMCP | The native adapter calls `document.modelContext.registerTool`; Playwright installs a native-like context before page load and records calls/events.             |
| Seven static tools          | One canonical constant, registry tests, UI count, and browser assertions enforce the exact seven names.                                                         |
| Strict schemas              | Every tool has `additionalProperties: false` plus strict Zod validation; extra fields and invalid enums are rejected before handlers run.                       |
| Safe interface compilation  | Only a current passing simulation can compile the fixed `execute_rescue_mission` interface; the agent never supplies routes, topics, robot IDs, or coordinates. |
| Human-approved registration | No approval tool exists. The only authorization path is the visible, focus-trapped human control.                                                               |
| `AbortController` lifecycle | Completion, failure, cancellation, reset, reload, runtime destruction, and revocation remove page-session authority.                                            |
| Visible `toolchange`        | The Tool Surface displays seven→eight→seven and native-like E2E asserts registration/unregistration events.                                                     |
| Human-only final boundary   | Prompt 1 stages but cannot register or move the fleet. Prompt 2 exists only after a person authorizes the reviewed mission.                                     |
| Stale-state defense         | Revision and FNV-1a world fingerprints bind the simulation, safety proof, proposal, and execution.                                                              |
| Route safety                | Eleven checks cover exact robots, complete routes, collapse-zone exclusion, 1.25 m separation, battery, duration, roles, recovery, and one-use budget.          |
| Failure behavior            | Browser execution stops and restores the pre-run world. ROS mode stops and retains truthful partial progress.                                                   |
| Persistence                 | Three versioned Zod-validated envelopes recover world, mission, and UI state without restoring registered authority.                                            |
| ROS boundary                | Code-owned allowlists fix four namespaces, topic names, message types, clamps, watchdog, secure bridge URL rules, and fleet stop.                               |

## Verification results

| Check                      | Result                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Prettier                   | Passed across the repository                                                                |
| ESLint                     | Passed with zero warnings                                                                   |
| Strict TypeScript          | Passed                                                                                      |
| Unit and integration tests | 17 files, 65 tests passed on Vitest 4.1.11                                                  |
| Production build           | Passed on Vite 8.2.2; 2,151 modules transformed                                             |
| Dependency audit           | `npm audit` reports 0 vulnerabilities                                                       |
| Playwright                 | 9 tests passed in Chromium                                                                  |
| Canonical journey          | Prompt 1 → human authorization → Prompt 2 → receipt → unregistration passed                 |
| Accessibility              | No serious or critical axe findings in ready, proposal, authority, and resolved states      |
| Target sizing              | Every visible tested interactive target is at least 44×44 CSS pixels                        |
| Keyboard                   | Authorization and execution work without a pointer; dialog focus is trapped and restored    |
| Persistence                | Reload revocation, completed receipt recovery, and reset isolation passed                   |
| Responsive UI              | Desktop and mobile judged states have no horizontal overflow                                |
| Visual QA                  | Initial, proposal, authority, executing, and completed desktop/mobile screenshots inspected |
| Runtime errors             | Playwright and in-app production inspection collected zero console errors or page errors    |

The main application shell is 317.19 kB minified (94.76 kB gzip). The Babylon scene is lazy-loaded as a separate 1,073.58 kB chunk (254.55 kB gzip). Havok is a separate 2,094.56 kB WebAssembly asset (668.98 kB gzip).

The authoritative full command is `npm run check`; it runs formatting, lint, strict typechecking, all Vitest tests, a production build, and the complete Playwright suite.

## Release assets

- `README.md`: product, controls, WebMCP architecture, safety, setup, testing, deployment, and limits.
- `DEMO_SCRIPT.md`: timed 2:45 judge walkthrough with backup instructions.
- `SUBMISSION_DRAFT.md`: complete challenge narrative with placeholders only for external URLs.
- `evals/webmcp-cases.json`: 21 tool-selection, schema, safety, lifecycle, and refusal fixtures.
- `robotics/README.md`: honest optional ROS 2 Jazzy, Gazebo Harmonic, Nav2, and rosbridge integration guide.
- `robotics/rosbridge-allowlist.yaml`: server-side topic/type allowlist example.
- `LICENSE`: MIT.

## Honest limits

WH-01 is a fictional, deterministic browser emergency and not a certified live dispatch product. The ROS adapter is covered with a fake bridge; no live Gazebo environment or physical robot was available for this release gate. Native WebMCP remains browser-dependent. Automated accessibility tests are regression evidence, not formal certification.

No known P0 failure, TODO, mock-only control, runtime console error, or presentation blocker remains.
