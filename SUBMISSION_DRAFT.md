# WebMCP challenge submission draft

## Project name

Firebreak: WebMCP Emergency Robot Commander

## Tagline

One agent. Four robots. One human-approved rescue boundary.

## One-line pitch

Firebreak lets a human drive one emergency robot while a WebMCP agent plans a rescue, passes eleven deterministic safety checks, and executes once after human authorization.

## The real problem

Emergency robot fleets have a coordination gap. A person can understand mission intent and make judgment calls, but cannot continuously drive several specialist robots at once. An AI agent can coordinate at machine speed, but giving it permanent, free-form movement authority creates unacceptable risk.

Firebreak demonstrates a third model: shared control with temporary compiled authority. The agent can inspect, simulate, and prove a rescue. The website turns the passing proof into an exact capability. A person authorizes that mission once, then the fleet operates autonomously inside the reviewed routes and the capability disappears.

What can people and agents do together that was impossible before? A human can make one understandable high-stakes decision while an agent coordinates several interdependent actions inside that exact boundary at machine speed—and the website automatically removes the authority afterward.

## Why this is a strong WebMCP use case

Traditional UI automation would force the agent to scrape labels and guess the current robot state, while a broad robot API would give it more authority than the mission requires. WebMCP lets the website expose the exact typed capabilities that are safe now, enforce their order in code, and visibly add or remove authority as the shared situation changes.

Firebreak is therefore not a chatbot layered over a robot game. The judged path uses a real Codex or ChatGPT agent to call live website tools. The website remains the source of truth for state, validation, policy, and execution.

## How it creates a better experience

The operator does not have to drive four robots, translate an AI plan into manual commands, or approve dozens of low-level actions. One prompt produces a synchronized, inspectable plan. One understandable human decision grants only that plan. A cinematic execution view then clears away the planning interface, follows the real robot movement automatically, and ends on a receipt.

The live trace makes the invisible protocol legible: judges can see agent calls, a blocked request, the human grant, and the exact 7 → 8 → 7 capability lifecycle without reading source code.

## What people and agents can now do together

A human can make one understandable high-stakes decision while an agent coordinates several interdependent physical-world-style actions inside that exact boundary at machine speed. The website automatically removes the authority afterward. Doing all three together—multi-actor coordination, exact human-approved scope, and automatic revocation—is the new experience Firebreak demonstrates.

## What the product does

The browser opens on warehouse emergency WH-01: a battery fire, two trapped workers, a hazardous load, a collapse zone, and four specialist robots.

The player can immediately select and drive any robot using keyboard, touch, or gamepad controls. Prompt 1 asks the WebMCP agent to coordinate the whole fleet. Through seven static tools it:

1. inspects the emergency and objectives;
2. performs a thermal hazard scan;
3. inspects four role-limited robots;
4. simulates synchronized rescue routes;
5. validates eleven safety gates;
6. stages a one-use mission tool; and
7. inspects the resulting capability surface.

The live trace also makes failure legible: if the agent requests simulation before the required hazard scan, the typed handler returns `HAZARD_SCAN_REQUIRED`; no route appears and no robot moves.

The agent stops at a visible human decision boundary. The operator reviews four named robots, exact bounded routes, the excluded collapse zone, one-use scope, five-minute post-authorization expiry, and the 11/11 proof. Clicking **Authorize one mission** registers `execute_rescue_mission` as the eighth tool.

Fresh-chat latency does not steal emergency time: the 90-second clock runs only while the agent is actively planning or the fleet is executing. It visibly pauses before the first tool call, during human review, and after authorization while the operator sends Prompt 2. The copied prompts explicitly constrain the agent to the current Firebreak tab’s WebMCP tools instead of web search.

Prompt 2 invokes it. Four simulated 3D robots move concurrently: SCOUT-1 maps danger, MEDIC-2 rescues one worker, SUPPRESS-3 isolates and contains the battery fire, and HAUL-4 rescues the second worker while moving the exposed load. A deterministic receipt reports two workers safe, the fire contained, the load secured, and zero violations. The one-use tool unregisters and the surface returns to seven tools.

During movement, Firebreak enters a cinematic execution mode driven by the live mission state. The planning panels and tool drawer clear away, the camera automatically follows each robot, colored progress and action milestones stay visible, and the final wide view resolves into the receipt. This is presentation of the real execution, not a video or scripted substitute for the agent.

## How WebMCP is implemented

Firebreak is built around a website-owned capability surface, not DOM automation or a chatbot pretending to control a scene.

- Seven static tools register through top-level imperative `document.modelContext.registerTool` calls.
- Every input uses a closed JSON schema plus strict runtime validation.
- Simulation is bound to the current world revision and fingerprint.
- The dynamic interface is compiled only from a current passing proof.
- No tool exists for human approval; registration requires the visible user action.
- An `AbortController` owns dynamic authority and emits visible `toolchange` on registration and removal.
- The tool surface visibly changes 7 → 8 → 7.
- A visible trace distinguishes agent calls, blocked results, the human grant, and `toolchange` events without storing raw tool data.
- The normal-browser **Replay walkthrough · no agent** exercises the same handlers as a disclosed deterministic fallback; the live judged path uses a real Codex/ChatGPT agent through native WebMCP.

Without WebMCP, this is only a rescue simulation with deterministic automation. With WebMCP, a real Codex or ChatGPT agent discovers and invokes live website capabilities, and the site safely creates and revokes a new capability as the shared situation changes.

The transferable pattern is **compiled one-use authority**. The same lifecycle can guard production deploys, large refunds, fund transfers, bulk deletes, or incident remediation: inspect and simulate, prove policy, obtain one visible human grant, act once, emit a receipt, and self-revoke.

## What is technically distinctive

- A real-time Babylon.js warehouse with four distinct procedural robot meshes, hazards, workers, route overlays, smoke, fire, and three camera modes.
- Keyboard, complete touch controls, and Gamepad API driving/camera/selection inputs normalized into one control contract.
- Deterministic synchronized route simulation with polygon intersection and 250 ms separation sampling.
- Eleven execution-blocking checks over revision, fingerprint, fleet allowlist, route completeness, geofence, separation, battery, duration, robot roles, recovery snapshot, and one-use budget.
- Full browser-state rollback on cancellation or driver failure.
- Versioned, schema-validated recovery that never restores live authority after reload.
- An optional ROSLIB driver with fixed ROS 2 topics/types, secure bridge URLs, a 350 ms velocity watchdog, Nav2-compatible pose goals, fresh odometry/battery confirmation, positive role-action feedback, and fleet emergency stop.
- Responsive visual design, keyboard-complete dialogs, reduced motion, 44 px targets, and zero serious or critical axe findings across judged states.

## The “wow” moment

One prompt draws four proven routes across a burning warehouse. One human click makes a new WebMCP tool appear live. A second prompt clears the interface into an auto-directed rescue, launches four robots at once, resolves every objective, produces a receipt, and visibly deletes its own authority.

## Safety and honesty

WH-01 is a fictional browser emergency designed for an instantly repeatable demonstration. It does not claim deployment on real emergency hardware. The optional ROS 2/Gazebo adapter is a narrow integration path and is tested against a fake bridge; physical robot certification remains separate work.

The safety claim is specific and testable: the agent cannot create arbitrary commands or grant itself control. It can execute only a fresh, website-compiled, human-authorized mission over allowlisted robots and reviewed routes.

## How to run

```sh
npm install
npm run dev
```

Open the printed URL in a fresh Codex or ChatGPT built-in browser chat and confirm **WebMCP Native**. Click **Start emergency + copy prompt**, paste Prompt 1 into the surrounding chat, authorize the reviewed mission, then copy and paste Prompt 2. The application needs no API key, backend, or robot; it uses the agent already signed into the host app. In an ordinary browser, the clearly labeled **Replay walkthrough · no agent** is available for local rehearsal.

Run the entire release gate with:

```sh
npm run check
```

## Built with

React 19, TypeScript, Vite, Babylon.js, Havok, Zustand, Zod, imperative WebMCP, ROSLIB, Vitest, Playwright, Testing Library, axe-core, and Lucide.

## Links

- Live demo: [firebreak-eosin.vercel.app](https://firebreak-eosin.vercel.app/)
- Source: [github.com/bilgin-kocak/firebreak](https://github.com/bilgin-kocak/firebreak)
- Demo video: `[ADD VIDEO URL]`

## Final submission checklist

- [x] Public live URL with no login or credentials required
- [x] Public source repository
- [x] MIT license
- [x] Exact judge testing instructions in README
- [x] Specific description covering WebMCP fit, experience, collaboration, and implementation
- [ ] Public YouTube demo under three minutes with narration audio
- [ ] Replace the demo-video placeholder above
- [ ] Confirm teammate names and all Devpost form fields
- [ ] Open every submitted link in an incognito window before final submission

## License

MIT
