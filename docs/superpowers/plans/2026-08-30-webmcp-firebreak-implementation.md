# Firebreak: WebMCP Emergency Robot Commander — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace WebMCP Airlock with a complete, playable 3D emergency-robot game in which a browser agent inspects, safely authorizes, and coordinates a four-robot warehouse rescue.

**Architecture:** A deterministic TypeScript mission domain owns all safety-critical state and feeds both a Babylon.js renderer and WebMCP handlers. A `RobotDriver` boundary supports the default browser simulation and an opt-in ROS 2 adapter, while the existing imperative registration and dynamic `AbortController` lifecycle are generalized for the new mission.

**Tech Stack:** React, TypeScript, Vite, Zustand, Zod, Babylon.js, Havok, Browser Gamepad API, roslibjs, Vitest, Testing Library, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-30-webmcp-firebreak-design.md`

## Global Constraints

- The canonical app is a static browser experience with no backend, credentials, remote assets, or required ROS installation.
- Exactly seven static tools register: `inspect_emergency`, `scan_hazards`, `inspect_fleet`, `simulate_mission`, `validate_safety_envelope`, `stage_mission_tool`, and `list_mission_tools`.
- The only dynamic tool is `execute_rescue_mission`, registered only by the visible **Authorize one mission** action.
- The dynamic tool is one-use, five-minute authority owned by an `AbortController`, with visible `toolchange` on registration and unregistration.
- The deterministic domain, not Babylon frame rate, is the source of mission truth.
- The agent may select only project-owned strategies, robot identifiers, operations, topic names, and message types.
- One authorization covers all approved robot movements; no repeated confirmations occur during execution.
- Keyboard and touch are required control paths; standard gamepad input is required through the browser API and automated mock coverage.
- Desktop target is 1440×1000; mobile target is 390×844 with no horizontal overflow.
- Accessibility requires semantic scene state, keyboard parity, visible focus, 44×44 targets, reduced motion, and zero serious or critical axe findings in canonical states.
- Expected failures must not create uncaught rejections, blank scenes, runtime console errors, or false success receipts.
- No shipped screen, document, fixture, package metadata, or test name may describe the product as Airlock after the pivot.

---

## Planned file structure

### Retained and generalized

- `src/webmcp/adapter.ts` — generic WebMCP adapter contract.
- `src/webmcp/nativeAdapter.ts` — top-level imperative browser adapter.
- `src/webmcp/memoryAdapter.ts` — ordinary-browser and test adapter.
- `src/webmcp/types.ts` — generic typed tool definitions.
- `src/components/useDialogFocus.ts` — accessible dialog focus behavior.
- `src/components/ToastRegion.tsx` — live status announcements.
- `e2e/helpers.ts` — native-like WebMCP boot helpers, renamed data helpers.

### Replaced domain and runtime

- `src/domain/firebreakTypes.ts` — all world, mission, plan, safety, and receipt types.
- `src/domain/firebreakSchemas.ts` — strict Zod schemas and versioned persistence schemas.
- `src/domain/firebreakSeed.ts` — deterministic warehouse seed and reset snapshot.
- `src/domain/missionSimulator.ts` — fixed coordinated routes and outcome prediction.
- `src/domain/safetyCompiler.ts` — safety gates and mission proposal compilation.
- `src/domain/missionExecutor.ts` — cancellable concurrent mission orchestration.
- `src/control/controlTypes.ts` — normalized manual input and `RobotDriver` interfaces.
- `src/control/inputController.ts` — keyboard, touch, gamepad, dead-zone, and stop behavior.
- `src/control/browserSimulationDriver.ts` — deterministic browser movement and contextual actions.
- `src/control/ros2Driver.ts` — allowlisted roslibjs connection, topics, messages, and stop-all.
- `src/store/useFirebreakStore.ts` — world, mission, UI, and runtime actions.
- `src/store/firebreakPersistence.ts` — validated versioned hydration and stale-authority reconciliation.
- `src/app/runtime.ts` — adapter, driver, registration, reset, and teardown ownership.

### Replaced WebMCP surface

- `src/webmcp/staticToolDefinitions.ts` — seven Firebreak tool definitions.
- `src/webmcp/registerStaticTools.ts` — static registration and cleanup.
- `src/webmcp/dynamicToolManager.ts` — one-use Firebreak authority lifecycle.
- `src/webmcp/toolInputSample.ts` — canonical input examples for visible tool cards.
- `src/webmcp/results.ts` — compact structured Firebreak results.

### New presentation

- `src/scene/FirebreakScene.tsx` — Babylon lifecycle and canvas fallback.
- `src/scene/createWarehouseScene.ts` — scene, lights, materials, warehouse, camera, and effects.
- `src/scene/createRobotMesh.ts` — procedural role-specific robot geometry.
- `src/scene/sceneSynchronizer.ts` — snapshot-to-mesh, routes, markers, particles, and camera sync.
- `src/components/FirebreakGame.tsx` — full-screen composition.
- `src/components/GameHud.tsx` — title, timer, emergency state, objectives, and connection state.
- `src/components/RobotSelector.tsx` — fleet selection and role/status cards.
- `src/components/TouchControls.tsx` — mobile drive, turn, action, and robot selection.
- `src/components/ManualControlHelp.tsx` — keyboard and gamepad instructions.
- `src/components/MissionControl.tsx` — two-prompt simulator and tool activity.
- `src/components/MissionProposalSheet.tsx` — one visible authorization surface.
- `src/components/MissionProgress.tsx` — concurrent task progress and stop control.
- `src/components/MissionReceipt.tsx` — truthful outcome and one-use lifecycle.
- `src/components/ToolSurface.tsx` — seven-to-eight-to-seven tool visualization.
- `src/components/AccessibleSceneSummary.tsx` — semantic duplicate of critical canvas state.
- `src/styles/index.css` — complete responsive game styling.

### Removed product-specific Airlock files

- Delete the old `airlock*`, remediation, incident, production-topology, telemetry, deployment, proposal, recovery, permission, and receipt implementations after their generalized behavior has equivalent Firebreak coverage.
- Retain historical CivicWeave and Airlock design/plan documents under `docs/superpowers/`; remove Airlock naming only from shipped product materials.

---

### Task 1: Install the 3D and robot communication stack and establish the Firebreak domain

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/domain/firebreakTypes.ts`
- Create: `src/domain/firebreakSchemas.ts`
- Create: `src/domain/firebreakSeed.ts`
- Create: `src/domain/firebreakSeed.test.ts`

**Interfaces:**
- Produces: `createFirebreakSeed(): FirebreakSnapshot`.
- Produces: `FirebreakSnapshotSchema.parse(value): FirebreakSnapshot`.
- Produces identifiers `INCIDENT_ID`, `ROBOT_IDS`, `WORKER_IDS`, `SAFE_ZONE`, and `COLLAPSE_ZONE`.
- `FirebreakSnapshot` contains `revision`, `phase`, `elapsedMs`, `robots`, `workers`, `hazards`, `objectives`, `routes`, `events`, and `receipt`.

- [x] **Step 1: Add runtime packages**

Run:

```sh
npm install @babylonjs/core @babylonjs/havok roslib
```

Expected: `package.json` and lockfile include all three packages without peer-dependency errors.

- [x] **Step 2: Write the failing seed tests**

Create assertions equivalent to:

```ts
const seed = createFirebreakSeed();
expect(seed.incidentId).toBe("WH-01");
expect(Object.keys(seed.robots)).toEqual(ROBOT_IDS);
expect(Object.values(seed.workers)).toHaveLength(2);
expect(seed.hazards.collapseZone).toEqual(COLLAPSE_ZONE);
expect(seed.objectives.map((item) => item.status)).toEqual([
  "pending",
  "pending",
  "pending",
  "pending",
]);
expect(FirebreakSnapshotSchema.parse(seed)).toEqual(seed);
expect(createFirebreakSeed()).toEqual(seed);
```

Also reject an unknown robot role, battery outside `0..100`, duplicate objective identifier, non-finite position, and extra schema property.

- [x] **Step 3: Run the test to verify failure**

Run: `npm test -- src/domain/firebreakSeed.test.ts`

Expected: FAIL because the Firebreak domain modules do not exist.

- [x] **Step 4: Implement the domain types, strict schemas, and deterministic seed**

Use these exact unions:

```ts
type EmergencyPhase =
  | "ready"
  | "active"
  | "planned"
  | "authorized"
  | "executing"
  | "resolved"
  | "failed";
type RobotId = "SCOUT-1" | "MEDIC-2" | "SUPPRESS-3" | "HAUL-4";
type RobotRole = "scout" | "rescue" | "suppress" | "haul";
type ObjectiveId =
  | "scan-hazards"
  | "rescue-workers"
  | "contain-fire"
  | "move-container";
type ObjectiveStatus = "pending" | "active" | "complete" | "failed";
```

Give every robot a unique start position, role, color token, 100% battery, `idle` status, heading, and empty route progress. Seed both workers as trapped, the container as exposed, fire intensity as `1`, smoke as `0.35`, and the collapse zone as an explicit polygon.

- [x] **Step 5: Run the domain test**

Run: `npm test -- src/domain/firebreakSeed.test.ts`

Expected: PASS.

- [x] **Step 6: Commit the domain foundation**

```sh
git add package.json package-lock.json src/domain/firebreakTypes.ts src/domain/firebreakSchemas.ts src/domain/firebreakSeed.ts src/domain/firebreakSeed.test.ts
git commit -m "feat: add Firebreak emergency domain"
```

---

### Task 2: Build deterministic manual robot controls and driver boundaries

**Files:**
- Create: `src/control/controlTypes.ts`
- Create: `src/control/inputController.ts`
- Create: `src/control/inputController.test.ts`
- Create: `src/control/browserSimulationDriver.ts`
- Create: `src/control/browserSimulationDriver.test.ts`

**Interfaces:**
- Produces: `NormalizedControl { throttle: number; turn: number; action: boolean; selectDelta: -1 | 0 | 1; selectRobot?: RobotId }`.
- Produces: `normalizeGamepad(gamepad: GamepadLike, deadZone?: number): NormalizedControl`.
- Produces: `createInputController(options): InputController` with `start()`, `stop()`, `setTouchState()`, and `getSnapshot()`.
- Produces: `RobotDriver` with `connect`, `disconnect`, `commandManual`, `executePlan`, and `stopAll`.
- Produces: `BrowserSimulationDriver` implementing `RobotDriver` against injected `getSnapshot` and `commitSnapshot` callbacks.

- [x] **Step 1: Write failing control tests**

Cover:

```ts
expect(applyDeadZone(0.08, 0.15)).toBe(0);
expect(normalizeGamepad(xboxPad).throttle).toBeCloseTo(0.75);
expect(normalizeGamepad(xboxPad).turn).toBeCloseTo(-0.5);
expect(normalizeGamepad(nextRobotPad).selectDelta).toBe(1);
```

Dispatch keyboard events and assert `W`, arrows, `Q/E`, `Space`, and `1–4` map correctly. Blur, visibility loss, stop, and gamepad disconnect must emit an all-zero control snapshot.

- [x] **Step 2: Run the control tests to verify failure**

Run: `npm test -- src/control/inputController.test.ts`

Expected: FAIL because the controller is missing.

- [x] **Step 3: Implement input normalization and lifecycle**

Poll `navigator.getGamepads()` inside `requestAnimationFrame`, normalize only the standard mapping, clamp axes to `-1..1`, apply a `0.15` dead zone, edge-detect selection and action buttons, and merge keyboard, touch, and gamepad input by greatest absolute movement value. Stop movement when focus or the active controller is lost.

- [x] **Step 4: Write failing browser-driver tests**

Assert that manual commands move only the selected robot, never cross warehouse bounds or the collapse polygon, consume battery proportionally, and stop when given a zero command. Assert that a contextual action completes only when the correct role is in range.

- [x] **Step 5: Implement the browser driver**

Use fixed-step movement with bounded `deltaMs`, a project-owned `isPointAllowed` collision/geofence helper, and immutable snapshot commits. Do not read Babylon mesh positions. Return typed progress events from `executePlan` and honor the supplied `AbortSignal` before and after every step.

- [x] **Step 6: Run the control and browser-driver tests**

Run: `npm test -- src/control`

Expected: PASS.

- [x] **Step 7: Commit manual control**

```sh
git add src/control
git commit -m "feat: add playable robot controls"
```

---

### Task 3: Simulate, validate, and execute the coordinated mission

**Files:**
- Create: `src/domain/missionSimulator.ts`
- Create: `src/domain/missionSimulator.test.ts`
- Create: `src/domain/safetyCompiler.ts`
- Create: `src/domain/safetyCompiler.test.ts`
- Create: `src/domain/missionExecutor.ts`
- Create: `src/domain/missionExecutor.test.ts`

**Interfaces:**
- Produces: `simulateCoordinatedMission(snapshot): MissionSimulation`.
- Produces: `validateSafetyEnvelope(snapshot, simulation): SafetyCheckReport`.
- Produces: `compileMissionProposal(snapshot, simulation, report, now): MissionProposal`.
- Produces: `executeMission({ snapshot, proposal, driver, signal, onProgress }): Promise<MissionExecutionResult>`.
- `MissionExecutionResult` is a discriminated union for `succeeded`, `cancelled`, and `failed` with a truthful `MissionReceipt`.

- [x] **Step 1: Write failing simulation tests**

Assert the coordinated simulation returns one route for every robot, completes four objectives in at most 45 seconds, preserves at least 20% predicted battery, never intersects the collapse polygon, and has pairwise separation at synchronized route samples.

Mutate the seed to block one route and assert simulation returns `feasible: false` with a stable reason code instead of fabricating success.

- [x] **Step 2: Implement fixed route simulation**

Use project-owned route templates keyed by robot identifier, explicit waypoint actions, deterministic duration and battery estimates, and geometry helpers for polygon containment and route separation. Bind the simulation to the exact incident revision and a stable hash of relevant world state.

- [x] **Step 3: Write failing safety compiler tests**

Require passing gates for incident revision, robot allowlist, route completeness, collapse-zone exclusion, worker clearance, robot separation, battery reserve, execution duration, contextual-action role, rollback snapshot, and one-use budget. Reject a stale revision, unknown robot, reordered unsafe action, altered route, 19% battery, 46-second duration, and extra operation.

- [x] **Step 4: Implement checks and proposal compilation**

Compile only a passing simulation. The proposal must contain immutable cloned routes, exact allowed operations, `authorizedAt: null`, `expiresAt: null`, `oneUse: true`, and `status: "staged"`. The compiler must not mutate or authorize store state.

- [x] **Step 5: Write failing executor tests**

Use a fake driver to assert all four approved routes start, progress is reported, objectives complete, and the success receipt includes elapsed time, final batteries, rescued workers, contained fire, relocated container, zero violations, and the proposal identifier.

Abort midway and assert stop-all runs, the browser snapshot is restored, no objective remains complete, and a cancelled receipt records partial progress. Simulate a driver error and assert the failed path behaves similarly. Start two calls and assert the second is rejected before driver movement.

- [x] **Step 6: Implement cancellable concurrent execution**

Clone authority before execution, validate it again, capture a snapshot, and execute routes concurrently through the driver. Check cancellation between progress updates and before commit. On browser-mode failure restore the complete snapshot; on ROS mode stop movement and preserve truthful partial state. Never commit after registration authority is revoked.

- [x] **Step 7: Run mission tests**

Run: `npm test -- src/domain/missionSimulator.test.ts src/domain/safetyCompiler.test.ts src/domain/missionExecutor.test.ts`

Expected: PASS.

- [x] **Step 8: Commit the mission engine**

```sh
git add src/domain
git commit -m "feat: add bounded robot mission engine"
```

---

### Task 4: Replace the store, persistence, and application runtime

**Files:**
- Create: `src/store/useFirebreakStore.ts`
- Create: `src/store/useFirebreakStore.test.ts`
- Create: `src/store/firebreakPersistence.ts`
- Create: `src/store/firebreakPersistence.test.ts`
- Rewrite: `src/app/runtime.ts`
- Rewrite: `src/app/runtime.test.ts`
- Delete after migration: `src/store/useAppStore.ts`
- Delete after migration: `src/store/useAppStore.test.ts`
- Delete after migration: `src/store/selectors.ts`
- Delete after migration: `src/store/persistence.ts`
- Delete after migration: `src/store/persistence.test.ts`

**Interfaces:**
- Produces: `useFirebreakStore` with actions `startEmergency`, `tickManual`, `selectRobot`, `setTouchControl`, `applyScan`, `setSimulation`, `stageProposal`, `authorizeProposal`, `beginExecution`, `applyProgress`, `finishExecution`, `revokeMission`, `resetDemo`, and `hydrate`.
- Produces: `createAppRuntime(adapter, options): FirebreakRuntime` with `start`, `destroy`, `runPromptA`, `authorizeMission`, `runPromptB`, `cancelExecution`, and `reset`.
- Persistence keys are `firebreak.world.v1`, `firebreak.missions.v1`, and `firebreak.ui.v1`.

- [x] **Step 1: Write failing store tests**

Test phase transitions `ready → active → planned → authorized → executing → resolved`, reject invalid transitions, keep manual movement in `active`, prevent authorization before passing checks, and make reset reproduce the exact seed while preserving reduced-effects preference.

- [x] **Step 2: Implement the focused Zustand store**

Keep runtime objects outside persisted slices. Every mutation increments a monotonic revision or records why it intentionally does not. Expose selectors for selected robot, objective summary, active proposal, active receipt, and tool surface state.

- [x] **Step 3: Write failing persistence tests**

Round-trip valid resolved state. Reject corrupt JSON, unknown version, invalid robot, non-finite positions, stale simulation hash, staged proposal bound to another revision, expired authority, completed authority, and any persisted active registration. Hydration must restore world state without registering a dynamic tool automatically unless the stored authorization is valid and unused in the same page bootstrap policy.

- [x] **Step 4: Implement persistence reconciliation**

Use strict schemas and graph validation. Store only serializable domain and UI slices. Never persist the driver, ROS URL credentials, controller handles, AbortControllers, timers, Babylon objects, or in-flight promises.

- [x] **Step 5: Write failing runtime lifecycle tests**

Assert start registers seven static tools once; destroy aborts dynamic registration, execution, input, timers, and drivers; reset is safe during execution; and repeated start/destroy calls are idempotent.

- [x] **Step 6: Implement runtime ownership**

Construct the input controller, selected driver, static registry, and dynamic tool manager from injected dependencies. Use one root `AbortController` and child signals. Keep native WebMCP access top-level through the adapter.

- [x] **Step 7: Run store and runtime tests**

Run: `npm test -- src/store src/app/runtime.test.ts`

Expected: PASS.

- [x] **Step 8: Commit state and runtime**

```sh
git add src/store src/app/runtime.ts src/app/runtime.test.ts
git rm src/store/useAppStore.ts src/store/selectors.ts src/store/persistence.ts
git commit -m "feat: add Firebreak runtime and persistence"
```

---

### Task 5: Rebuild the WebMCP surface for Firebreak

**Files:**
- Rewrite: `src/webmcp/staticToolDefinitions.ts`
- Rewrite: `src/webmcp/registerStaticTools.ts`
- Rewrite: `src/webmcp/dynamicToolManager.ts`
- Rewrite: `src/webmcp/results.ts`
- Rewrite: `src/webmcp/toolInputSample.ts`
- Rewrite: `src/webmcp/staticTools.test.ts`
- Rewrite: `src/webmcp/registry.test.ts`
- Rewrite: `src/webmcp/dynamicToolManager.test.ts`
- Rewrite: `src/webmcp/toolInputSample.test.ts`
- Retain and adjust: `src/webmcp/adapter.ts`
- Retain and adjust: `src/webmcp/nativeAdapter.ts`
- Retain and adjust: `src/webmcp/memoryAdapter.ts`

**Interfaces:**
- Produces: `STATIC_TOOL_NAMES` as the exact seven-name readonly tuple.
- Produces: `createStaticToolDefinitions(runtime): ToolDefinition[]`.
- Produces: `DynamicMissionToolManager` with `registerAuthorized`, `revoke`, `expire`, `consume`, and `destroy`.
- Dynamic input is exactly `{ strategy: "coordinated" }` with `additionalProperties: false`.

- [x] **Step 1: Replace tests with the seven-tool contract**

Assert registration order and exact schemas. Invoke every valid handler and assert it returns visible domain changes plus bounded structured output. For each tool reject a missing required field, wrong literal, unknown identifier, and extra property without mutation.

- [x] **Step 2: Implement the static handlers**

Map the tools to runtime operations:

```ts
inspect_emergency -> runtime.inspectEmergency
scan_hazards -> runtime.scanHazards
inspect_fleet -> runtime.inspectFleet
simulate_mission -> runtime.simulateMission
validate_safety_envelope -> runtime.validateMission
stage_mission_tool -> runtime.stageMission
list_mission_tools -> runtime.listMissionTools
```

Keep descriptions action-oriented and include the safety limitations an agent needs to choose correctly.

- [x] **Step 3: Write the dynamic lifecycle tests**

Prove the agent cannot authorize, staged state does not register, human authorization registers once, `toolchange` is visible, invalid inputs fail, simultaneous calls reject, caller abort cancels, revoke/reset/expiry abort active work, success consumes the tool, failure records a truthful receipt, and second invocation is impossible.

- [x] **Step 4: Generalize the dynamic manager**

Compile the definition only from a strict, passing, current proposal. Clone the proposal before handing it to execution. Tie active execution to both invocation and registration signals. Abort the registration on every terminal authority state.

- [x] **Step 5: Run all WebMCP tests**

Run: `npm test -- src/webmcp`

Expected: PASS with exactly seven static names and one dynamic name.

- [x] **Step 6: Commit the WebMCP pivot**

```sh
git add src/webmcp
git commit -m "feat: expose Firebreak WebMCP robot tools"
```

---

### Task 6: Build the Babylon warehouse, procedural robots, and scene synchronization

**Files:**
- Create: `src/scene/createWarehouseScene.ts`
- Create: `src/scene/createRobotMesh.ts`
- Create: `src/scene/sceneSynchronizer.ts`
- Create: `src/scene/sceneSynchronizer.test.ts`
- Create: `src/scene/FirebreakScene.tsx`
- Create: `src/scene/FirebreakScene.test.tsx`

**Interfaces:**
- Produces: `createWarehouseScene(canvas, options): Promise<WarehouseSceneHandle>`.
- Produces: `createRobotMesh(scene, robot): RobotMeshHandle` keyed by `RobotId`.
- Produces: `createSceneSynchronizer(sceneHandle): SceneSynchronizer` with `applySnapshot`, `setCameraMode`, `setSelectedRobot`, `setReducedEffects`, `resize`, and `dispose`.
- `FirebreakScene` accepts snapshot, selected robot, camera mode, reduced-effects state, and initialization callbacks.

- [x] **Step 1: Write failing pure synchronization tests**

Test position interpolation clamps, heading conversion, route-segment generation, objective-marker visibility, effect intensity mapping, and camera target selection without requiring WebGL.

- [x] **Step 2: Implement the warehouse and robot factories**

Build floors, aisles, shelves, battery bay, safe zone, collapse grid, workers, container, doors, lights, and emergency fixtures from Babylon primitives. Build the four robot silhouettes procedurally with role colors, emissive lamps, wheels/tracks/rotors, labels, and selection rings. Initialize Havok when available and use simple fallback collision bodies when it is not.

- [x] **Step 3: Implement snapshot synchronization**

Update meshes from deterministic positions, animate only visual interpolation, draw planned route ribbons, show scan rings and hazard markers, change objective props, reduce fire/smoke on success, and keep one authoritative animation loop. Dispose every observer, mesh, material, texture, particle system, engine, and resize listener.

- [x] **Step 4: Write failing component lifecycle tests**

Mock the scene factory and assert one initialization, snapshot updates without recreation, resize forwarding, fallback on initialization rejection, and complete disposal on unmount.

- [x] **Step 5: Implement the React canvas wrapper and fallback**

Use a labelled canvas with a sibling status element. Lazy initialize Babylon after mount, never block WebMCP registration, and show a semantic fallback rather than a blank region when graphics fail.

- [x] **Step 6: Run scene tests and production build**

Run:

```sh
npm test -- src/scene
npm run build
```

Expected: tests and build pass; no Babylon package is loaded from a remote CDN.

- [x] **Step 7: Commit the 3D scene**

```sh
git add src/scene package.json package-lock.json
git commit -m "feat: render the Firebreak robot rescue"
```

---

### Task 7: Build the playable HUD and canonical human-agent journey

**Files:**
- Rewrite: `src/app/App.tsx`
- Rewrite: `src/app/App.integration.test.tsx`
- Create: `src/components/FirebreakGame.tsx`
- Create: `src/components/GameHud.tsx`
- Create: `src/components/RobotSelector.tsx`
- Create: `src/components/TouchControls.tsx`
- Create: `src/components/ManualControlHelp.tsx`
- Create: `src/components/MissionControl.tsx`
- Create: `src/components/MissionProposalSheet.tsx`
- Create: `src/components/MissionProgress.tsx`
- Create: `src/components/MissionReceipt.tsx`
- Rewrite: `src/components/ToolSurface.tsx`
- Create: `src/components/AccessibleSceneSummary.tsx`
- Rewrite: `src/styles/index.css`
- Delete: `src/components/AirlockSimulator.tsx`
- Delete: `src/components/DeploymentTimeline.tsx`
- Delete: `src/components/ExecutionReceipt.tsx`
- Delete: `src/components/ExecutionReceipt.test.tsx`
- Delete: `src/components/IncidentCommandCenter.tsx`
- Delete: `src/components/IncidentHeader.tsx`
- Delete: `src/components/PermissionEnvelope.tsx`
- Delete: `src/components/RecoveryProgress.tsx`
- Delete: `src/components/ResponseProposalSheet.tsx`
- Delete: `src/components/ServiceTopology.tsx`
- Delete: `src/components/TelemetryPanel.tsx`

**Interfaces:**
- `FirebreakGame` receives the runtime and store and owns no policy decisions.
- `MissionControl` calls only `runPromptA` and `runPromptB`.
- `MissionProposalSheet` calls only the human event `authorizeMission` or `revokeMission`.
- `TouchControls` emits the same normalized control shape as keyboard and gamepad.

- [x] **Step 1: Write failing application integration tests**

Test initial copy explains the product, **Start emergency** changes the scene state, manual keyboard input moves only the selected robot, Prompt A uses all seven tools, four planned routes become visible, the proposal names all robots and safety limits, authorization registers the dynamic tool, Prompt B completes every objective, the receipt is visible, and the tool count returns to seven.

Also assert no agent-facing function can call authorization and the final mission does not request extra confirmations.

- [x] **Step 2: Implement the full-screen composition**

Place the 3D scene as the full viewport background. Use a slim top HUD, mission objectives at upper left, robot selector at the bottom, tool activity in a collapsible right drawer, and a single proposal/progress bottom sheet. Keep the primary visual path unobstructed.

- [x] **Step 3: Implement manual and touch controls**

Show keyboard/gamepad hints only until the first input. Render touch controls only on coarse pointers or explicit accessibility preference. Provide visible selected-robot state and stop controls.

- [x] **Step 4: Implement the two-prompt simulator**

Show the exact Prompt A and Prompt B copy in an accessible drawer. The ordinary-browser buttons invoke the identical tool definitions through the memory adapter, expose tool-call progress, and never bypass policy or dynamic registration.

- [x] **Step 5: Implement proposal, progress, receipt, and tool surface**

The proposal lists mission, robots, tasks, forbidden zone, duration, battery reserve, one-use limit, expiry, and stop conditions. Progress shows four concurrent lanes. The receipt truthfully distinguishes succeeded, failed, and cancelled. Tool surface visibly changes `7 → 8 → 7` and announces `toolchange`.

- [x] **Step 6: Implement the complete visual system**

Use local/system typography, industrial spacing, translucent overlays with opaque fallback, cyan/orange/red status tokens, clear focus rings, reduced-motion rules, 44-pixel controls, desktop overlays, and a mobile bottom-sheet layout. Do not use a centered hero, generic card grid, or decorative gradient text.

- [x] **Step 7: Run integration, accessibility-oriented component tests, and build**

Run:

```sh
npm test -- src/app src/components
npm run typecheck
npm run build
```

Expected: PASS.

- [x] **Step 8: Remove obsolete Airlock implementation files**

Use `rg -l "Airlock|checkout-api|INC-4821|rollback_checkout_release" src e2e evals README.md STATUS.md DEMO_SCRIPT.md SUBMISSION_DRAFT.md` to identify product-specific files. Delete obsolete source and tests only after their Firebreak replacements pass. Historical files under `docs/superpowers/` and `CivicWeave_Complete_Build_Spec.md` remain.

- [x] **Step 9: Commit the playable application**

```sh
git add src index.html
git commit -m "feat: build the playable Firebreak experience"
```

---

### Task 8: Add the optional allowlisted ROS 2 control adapter

**Files:**
- Create: `src/control/ros2Driver.ts`
- Create: `src/control/ros2Driver.test.ts`
- Create: `src/control/roslib.d.ts` only if the installed package lacks sufficient declarations.
- Create: `robotics/README.md`
- Create: `robotics/rosbridge-allowlist.yaml`

**Interfaces:**
- Produces: `new Ros2Driver({ url, rosFactory, now, commandTimeoutMs }): RobotDriver`.
- Only trusted robot identifiers may map to `/firebreak/<robot-slug>/cmd_vel`, `/goal_pose`, `/odom`, and `/battery`.
- Produces: `connect`, `disconnect`, `commandManual`, `executePlan`, and `stopAll` with the same behavior contract as the browser driver.

- [x] **Step 1: Write failing ROS adapter tests with a fake ROSLIB factory**

Assert connection state, exact topic names, exact ROS 2 message types, velocity clamping, zero-velocity timeout, navigation goal shape, odometry and battery subscription cleanup, stop-all publication for all four robots, and disconnection cleanup.

Attempt an unknown robot, topic override, message-type override, raw message, `javascript:` URL, insecure remote `ws:` URL outside localhost, and extra command property; assert rejection before publication.

- [x] **Step 2: Implement the allowlisted adapter**

Use `roslibjs` only behind an injected factory so tests do not need ROS. Accept `ws://localhost`, `ws://127.0.0.1`, or secure `wss://` URLs. Build topics from a frozen map. Clamp numeric fields, publish zero velocity on stop and timeout, and remove every listener on disconnect.

- [x] **Step 3: Document the reference ROS environment**

Document ROS 2 Jazzy, Gazebo Harmonic, Nav2, `rosbridge_suite`, namespaced topics, controller mapping, TLS guidance, network isolation, emergency stop, and the distinction between browser snapshot rollback and physical stop-only behavior. Include a concrete launch/check sequence using the official AWS small warehouse world without claiming it is required for the hosted demo.

- [x] **Step 4: Run ROS adapter tests and full unit suite**

Run:

```sh
npm test -- src/control/ros2Driver.test.ts
npm test
```

Expected: PASS with no live ROS connection.

- [x] **Step 5: Commit the robotics bridge**

```sh
git add src/control/ros2Driver.ts src/control/ros2Driver.test.ts src/control/roslib.d.ts robotics
git commit -m "feat: add allowlisted ROS 2 robot control"
```

---

### Task 9: Replace end-to-end coverage and inspect the real rendered game

**Files:**
- Rewrite: `e2e/helpers.ts`
- Rewrite: `e2e/canonical-flow.spec.ts`
- Rewrite: `e2e/accessibility.spec.ts`
- Rewrite: `e2e/responsive.spec.ts`
- Rewrite: `e2e/persistence.spec.ts`
- Create: `e2e/manual-controls.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Native-like bootstrap records static and dynamic tool definitions, `toolchange` events, tool invocations, page errors, and console errors.
- Screenshots are written under Playwright output and inspected at original resolution.

- [x] **Step 1: Rewrite the canonical E2E test and verify it fails**

From fresh storage, assert:

1. The 3D canvas and semantic warehouse summary load.
2. Emergency ignition starts WH-01.
3. Seven static tools exist.
4. Prompt A invokes all seven and reveals four route indicators.
5. Human authorization adds `execute_rescue_mission` and emits `toolchange`.
6. Prompt B invokes the dynamic tool once.
7. Both workers are safe, fire is contained, container is moved, and zero violations are shown.
8. The tool is removed, another `toolchange` fires, and second invocation fails.
9. Console and page error arrays are empty.

Run: `npm run test:e2e -- e2e/canonical-flow.spec.ts`

Expected before UI completion: FAIL at the first missing Firebreak assertion.

- [x] **Step 2: Add manual keyboard and mocked gamepad E2E coverage**

Press `2`, hold `W`, and assert `MEDIC-2` coordinates change while other robots remain fixed. Install a deterministic `navigator.getGamepads` mock before page load, drive with the left stick, press the bumper, and assert robot selection changes. Dispatch blur and assert movement stops.

- [x] **Step 3: Add lifecycle and persistence coverage**

Cover refresh of active world state, invalid stored state fallback, staged proposal hydration, unused authorization policy, expiry, revoke, cancellation, reset during execution, completion, and no restoration of consumed authority.

- [x] **Step 4: Add accessibility and responsive checks**

Run axe in ready, active, planned, authorized, executing, and resolved states. Assert focus trap/restore, visible focus, live announcements, semantic summary, 44×44 controls, reduced-motion behavior, keyboard-only journey, and no horizontal overflow at desktop and mobile sizes.

- [x] **Step 5: Run Playwright and capture canonical screenshots**

Run: `npm run test:e2e`

Expected: all tests pass and screenshots exist for desktop ready, ignition, plan reveal, authorized tool, fleet execution, resolved receipt, plus mobile ignition, proposal, execution, and resolved states.

- [x] **Step 6: Inspect screenshots and fix presentation**

Open every screenshot at original resolution. Correct unreadable hierarchy, blocked scene content, excessive panel coverage, clipped controls, indistinct robots, poor route visibility, weak fire/smoke drama, mobile overflow, and low contrast. Re-run affected screenshots after each correction.

- [x] **Step 7: Commit end-to-end quality**

```sh
git add e2e playwright.config.ts src
git commit -m "test: verify the Firebreak rescue journey"
```

---

### Task 10: Replace documentation, evaluation fixtures, and submission materials

**Files:**
- Rewrite: `README.md`
- Rewrite: `DEMO_SCRIPT.md`
- Rewrite: `SUBMISSION_DRAFT.md`
- Rewrite: `STATUS.md`
- Rewrite: `evals/README.md`
- Rewrite: `evals/webmcp-cases.json`
- Modify: `package.json`
- Modify: `index.html`
- Retain: `LICENSE`

**Interfaces:**
- README commands match package scripts exactly.
- Demo script completes in 2:30–3:00 from fresh storage and includes manual play, both prompts, one authorization, fleet execution, receipt, and ROS credibility note.
- Eval fixtures use only the seven static tools and one dynamic tool with strict expected arguments and safe rejections.

- [x] **Step 1: Rename package and page metadata**

Set package name to `webmcp-firebreak`, document title to `Firebreak: WebMCP Emergency Robot Commander`, description to the one-sentence product value, and theme color to the visual-system navy.

- [x] **Step 2: Rewrite the README**

Explain the problem in plain language, playable controls, two-prompt journey, WebMCP value, exact tool contracts, one-boundary autonomy model, browser architecture, optional ROS mode, setup, tests, deployment, accessibility, and honest limits. Do not claim certification, real emergency readiness, or successful physical-robot testing unless performed.

- [x] **Step 3: Rewrite the demo and submission**

Make the first ten seconds visual and understandable. Include a shot-by-shot script, controller actions, prompt text, narration, expected tool changes, cinematic camera moments, and final score. Align the submission narrative with usefulness, originality, execution, thoughtful WebMCP use, and human-agent collaboration.

- [x] **Step 4: Replace eval fixtures**

Include at least 18 cases: canonical selection, valid alternative ordering, schema errors, unsafe route, stale simulation, collapse-zone violation, low battery, unknown robot, expiry, agent authorization attempt, simultaneous invocation, cancellation, replay, ROS topic injection, and successful receipt.

- [x] **Step 5: Rewrite STATUS from fresh evidence only**

Record final command outputs, test counts, build status, browser sizes, screenshot states, accessibility results, console-error results, controller automation, and any unperformed hardware or ROS manual checks explicitly.

- [x] **Step 6: Scan for stale product copy and placeholders**

Run:

```sh
rg -n "WebMCP Airlock|INC-4821|checkout-api|rollback_checkout_release|Northstar Commerce|TBD|TODO|FIXME" --glob '!docs/superpowers/**' --glob '!CivicWeave_Complete_Build_Spec.md' .
```

Expected: no shipped product matches. Historical design references remain only in excluded paths.

- [x] **Step 7: Commit submission materials**

```sh
git add README.md DEMO_SCRIPT.md SUBMISSION_DRAFT.md STATUS.md evals package.json package-lock.json index.html LICENSE
git commit -m "docs: prepare Firebreak hackathon submission"
```

---

### Task 11: Run the complete release gate, independent review, and final commit

**Files:**
- Modify: any source, test, style, or documentation file required to fix verified failures.

**Interfaces:**
- `npm run check` remains the single authoritative local release command.

- [x] **Step 1: Run formatting and lint**

Run:

```sh
npm run format
npm run lint
npm run format:check
```

Expected: zero warnings and clean formatting check.

- [x] **Step 2: Run strict types and all unit/integration tests**

Run:

```sh
npm run typecheck
npm test
```

Expected: zero type errors and all tests pass.

- [x] **Step 3: Run production build and Playwright**

Run:

```sh
npm run build
npm run test:e2e
```

Expected: production assets build and every browser test passes with no console or page errors.

- [x] **Step 4: Run the authoritative aggregate gate**

Run: `npm run check`

Expected: lint, formatting, strict typecheck, unit/integration, build, and Playwright all pass in one fresh sequence.

- [x] **Step 5: Request an independent code review**

Review the full branch diff against the spec with special attention to unsafe ROS publication, stale authority, cancellation races, Babylon disposal, manual control stop behavior, accessibility, deterministic tests, and overengineering. Fix every confirmed P0/P1 issue and rerun the affected tests.

- [x] **Step 6: Inspect final desktop and mobile screenshots**

Verify at original resolution that the product reads as a game within ten seconds, the robots and emergency are unmistakable, the scene dominates the interface, controls do not obscure mission action, copy is concise, and resolved state is visually satisfying.

- [x] **Step 7: Check repository status and commit final fixes**

Run:

```sh
git diff --check
git status --short
git diff --stat feat/civicweave-complete-build...HEAD
```

Then stage only Firebreak work and commit:

```sh
git add src e2e robotics evals docs README.md DEMO_SCRIPT.md SUBMISSION_DRAFT.md STATUS.md package.json package-lock.json index.html LICENSE playwright.config.ts
git commit -m "fix: harden Firebreak release"
```

If there are no final changes, do not create an empty commit.

- [x] **Step 8: Report completion with evidence**

Report branch name, commits, exact release-gate results, screenshot inspection, runtime error result, deployment command, optional ROS status, and honest remaining limitations. Do not call the project complete if any acceptance criterion or required check is failing.
