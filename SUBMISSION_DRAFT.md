# WebMCP challenge submission draft

## Project name

WebMCP Firebreak

## Tagline

Play one rescue robot. Let an agent safely coordinate the fleet.

## One-line pitch

Firebreak lets a human drive one emergency robot while a WebMCP agent plans and executes a safety-proved, human-authorized, one-use rescue across four robots.

## The problem

Emergency robot fleets have a coordination gap. A person can understand mission intent and make judgment calls, but cannot continuously drive several specialist robots at once. An AI agent can coordinate at machine speed, but giving it permanent, free-form movement authority creates unacceptable risk.

Firebreak demonstrates a third model: shared control with temporary compiled authority. The agent can inspect, simulate, and prove a rescue. The website turns the passing proof into an exact capability. A person authorizes that mission once, then the fleet operates autonomously inside the reviewed routes and the capability disappears.

## What it does

The browser opens on warehouse emergency WH-01: a battery fire, two trapped workers, a hazardous load, a collapse zone, and four specialist robots.

The player can immediately select and drive any robot using keyboard, touch, or gamepad controls. Prompt 1 asks the WebMCP agent to coordinate the whole fleet. Through seven static tools it:

1. inspects the emergency and objectives;
2. performs a thermal hazard scan;
3. inspects four role-limited robots;
4. simulates synchronized rescue routes;
5. validates eleven safety gates;
6. stages a one-use mission tool; and
7. inspects the resulting capability surface.

The agent stops at a visible human decision boundary. The operator reviews four named robots, exact bounded routes, the excluded collapse zone, one-use scope, five-minute expiry, and the 11/11 proof. Clicking **Authorize one mission** registers `execute_rescue_mission` as the eighth tool.

Prompt 2 invokes it. Four 3D robots move concurrently: SCOUT-1 maps danger, MEDIC-2 rescues one worker, SUPPRESS-3 isolates and contains the battery fire, and HAUL-4 rescues the second worker while moving the exposed load. A receipt reports two workers safe, the fire contained, the load secured, and zero violations. The one-use tool unregisters and the surface returns to seven tools.

## Why WebMCP is essential

Firebreak is built around a website-owned capability surface, not DOM automation or a chatbot pretending to control a scene.

- Seven static tools register through top-level imperative `document.modelContext.registerTool` calls.
- Every input uses a closed JSON schema plus strict runtime validation.
- Simulation is bound to the current world revision and fingerprint.
- The dynamic interface is compiled only from a current passing proof.
- No tool exists for human approval; registration requires the visible user action.
- An `AbortController` owns dynamic authority and emits visible `toolchange` on registration and removal.
- The tool surface visibly changes 7 → 8 → 7.
- The same handlers run through a browser-local adapter where native WebMCP is unavailable.

Without WebMCP, this would be a rescue game with a scripted automation button. With WebMCP, the agent discovers and invokes live website capabilities, and the site can safely create and revoke a new capability as the shared situation changes.

## What is technically distinctive

- A real-time Babylon.js warehouse with four distinct procedural robot meshes, hazards, workers, route overlays, smoke, fire, and three camera modes.
- Keyboard, touch, and Gamepad API inputs normalized into one control contract.
- Deterministic synchronized route simulation with polygon intersection and 250 ms separation sampling.
- Eleven execution-blocking checks over revision, fingerprint, fleet allowlist, route completeness, geofence, separation, battery, duration, robot roles, recovery snapshot, and one-use budget.
- Full browser-state rollback on cancellation or driver failure.
- Versioned, schema-validated recovery that never restores live authority after reload.
- An optional ROSLIB driver with fixed ROS 2 topics/types, secure bridge URLs, a 350 ms velocity watchdog, Nav2-compatible pose goals, telemetry, and fleet emergency stop.
- Responsive visual design, keyboard-complete dialogs, reduced motion, 44 px targets, and zero serious or critical axe findings across judged states.

## The “wow” moment

The judge first drives one robot like a game. One prompt then draws four safe routes across the burning warehouse. One human click makes a new WebMCP tool appear live. A second prompt launches four robots at once, resolves every objective, produces a receipt, and visibly deletes its own authority.

## Safety and honesty

WH-01 is a fictional browser emergency designed for an instantly repeatable demonstration. It does not claim deployment on real emergency hardware. The optional ROS 2/Gazebo adapter is a narrow integration path and is tested against a fake bridge; physical robot certification remains separate work.

The safety claim is specific and testable: the agent cannot create arbitrary commands or grant itself control. It can execute only a fresh, website-compiled, human-authorized mission over allowlisted robots and reviewed routes.

## How to run

```sh
npm install
npm run dev
```

Open the printed URL, click **Start emergency**, and follow the two prompts on screen. No key, account, backend, or robot is required.

Run the entire release gate with:

```sh
npm run check
```

## Built with

React 19, TypeScript, Vite, Babylon.js, Havok, Zustand, Zod, imperative WebMCP, ROSLIB, Vitest, Playwright, Testing Library, axe-core, and Lucide.

## Links

- Live demo: `[ADD DEPLOYED URL]`
- Source: `[ADD REPOSITORY URL]`
- Demo video: `[ADD VIDEO URL]`

## License

MIT
