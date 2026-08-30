# WebMCP Airlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CivicWeave municipal demo with a deployable, highly visual WebMCP Airlock incident-response application that detects a deterministic untrusted instruction, compiles a one-use rollback tool, resolves a fictional checkout incident autonomously after one human approval, and unregisters the tool after use.

**Architecture:** Preserve the native/memory WebMCP adapter boundary, registry, direct top-level registration, dynamic `AbortController` lifecycle, and tested accessibility foundations. Replace the civic domain, store, static tools, dynamic workflow compiler, UI, tests, and submission assets with an incident domain built from validated data, trusted remediation operations, revision-bound simulation proofs, and a living service-topology interface.

**Tech Stack:** React 19, Vite 5, strict TypeScript, Zustand 5, Zod 3, Vitest, Testing Library, Playwright, axe-core, plain CSS, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-30-webmcp-airlock-design.md`

## Global Constraints

- The application is entirely client-side and fictional; no real infrastructure, credentials, customer data, backend, arbitrary network calls, generated code, or executable user content.
- Exactly seven static tools register through direct top-level `document.modelContext.registerTool(...)` calls.
- All tool inputs are strict and closed with `additionalProperties: false`, then revalidated at execution time.
- `query_telemetry` is read-only and sets `untrustedContentHint: true`.
- Only a visible human action can approve and register `rollback_checkout_release`.
- The approved tool is one-use, revision-bound, expiration-bound, and automatically unregisters through its `AbortController` after success.
- A failed or cancelled response restores the exact pre-execution incident snapshot.
- Native and memory modes run the same tool definitions and handlers.
- Every production behavior is implemented test-first with a witnessed failing test.
- Desktop and mobile canonical states have no serious/critical axe findings, horizontal overflow, obscured controls, or runtime console errors.

---

## File Structure

### Preserve with narrow edits

- `src/webmcp/nativeAdapter.ts`: direct native registration boundary.
- `src/webmcp/memoryAdapter.ts`: ordinary-browser simulator execution.
- `src/webmcp/adapter.ts`, `src/webmcp/types.ts`, `src/webmcp/results.ts`: shared WebMCP contracts.
- `src/webmcp/registry.ts`: static registration, execution activity, and tool metadata.
- `src/components/useDialogFocus.ts`, `src/components/ToastRegion.tsx`: accessible UI primitives.
- `src/test/modelContextMock.ts`: native-like E2E and integration test bridge.

### Create

- `src/domain/airlockTypes.ts`: incident, policy, evidence, simulation, proposal, progress, and receipt types.
- `src/domain/airlockSchemas.ts`: Zod persistence and domain schemas.
- `src/domain/incidentSeed.ts`: deterministic INC-4821 fixture and reset factories.
- `src/domain/trustClassifier.ts`: bounded canonical untrusted-evidence classifier.
- `src/domain/airlockPolicy.ts`: policy compilation and proposal validation.
- `src/domain/remediationSimulator.ts`: deterministic canary simulation and plan hash.
- `src/domain/remediationOperations.ts`: trusted operation registry.
- `src/domain/remediationExecutor.ts`: snapshot, execution, rollback, cancellation, and receipt creation.
- `src/domain/airlockChecks.ts`: revision-bound deterministic checks.
- Focused `.test.ts` files beside every new domain module.
- `src/components/IncidentCommandCenter.tsx`: page composition and canonical prompts.
- `src/components/ServiceTopology.tsx`: accessible animated dependency graph.
- `src/components/IncidentHeader.tsx`: incident identity, severity, timing, and recovery status.
- `src/components/TelemetryPanel.tsx`: evidence stream and quarantine state.
- `src/components/DeploymentTimeline.tsx`: current/previous release and canary timeline.
- `src/components/PermissionEnvelope.tsx`: visible scope, restrictions, budget, expiry, and use count.
- `src/components/RecoveryProgress.tsx`: operation progress and health transition.
- `src/components/ExecutionReceipt.tsx`: final immutable outcome and blocked-threat summary.
- `src/components/ResponseProposalSheet.tsx`: one-use response-tool review gate.
- `src/components/AirlockSimulator.tsx`: ordinary-browser canonical and manual tool runner.

### Replace or substantially rewrite

- `src/domain/types.ts`, `src/domain/schemas.ts`, `src/domain/seed.ts`, `src/domain/operationRegistry.ts`, `src/domain/workflowCompiler.ts`, `src/domain/workflowValidator.ts`, `src/domain/workflowExecutor.ts`, `src/domain/journeyChecks.ts`: export Airlock-compatible facades or be removed after callers migrate.
- `src/store/useAppStore.ts`, `src/store/selectors.ts`, `src/store/persistence.ts`: Airlock state and versioned envelopes.
- `src/webmcp/staticToolDefinitions.ts`, `src/webmcp/registerStaticTools.ts`, `src/webmcp/dynamicToolManager.ts`: Airlock tools and lifecycle.
- `src/app/runtime.ts`, `src/app/App.tsx`: Airlock boot and composition.
- Civic components under `src/components/`: remove after replacement is green.
- `src/styles/index.css`: complete operations-room visual system.
- `src/app/App.integration.test.tsx`, `e2e/*.spec.ts`: Airlock acceptance suites.
- `README.md`, `DEMO_SCRIPT.md`, `SUBMISSION_DRAFT.md`, `STATUS.md`, `evals/webmcp-cases.json`: truthful Airlock assets.

---

### Task 1: Incident domain and deterministic fixture

**Files:**
- Create: `src/domain/airlockTypes.ts`
- Create: `src/domain/airlockSchemas.ts`
- Create: `src/domain/incidentSeed.ts`
- Test: `src/domain/incidentSeed.test.ts`

**Interfaces:**
- Produces: `IncidentState`, `ServiceNode`, `DependencyEdge`, `TelemetryEntry`, `DeploymentRecord`, `IncidentPolicy`, `RemediationSimulation`, `AirlockCheck`, `ResponseToolProposal`, `ApprovedResponseTool`, `ExecutionReceipt`.
- Produces: `createInitialIncidentState(): IncidentState` and `createCanonicalPolicy(now: Date): IncidentPolicy`.

- [ ] **Step 1: Write failing seed tests** asserting INC-4821 identity, five services, checkout release `2026.08.30.3`, previous stable `2026.08.30.2`, `31.8%` errors, `4820 ms` p95, one third-party injection fixture, and fresh independent objects per factory call.
- [ ] **Step 2: Run `npm test -- src/domain/incidentSeed.test.ts`** and confirm failure because the Airlock modules do not exist.
- [ ] **Step 3: Implement strict types, Zod schemas, and seed factories** with no civic fields and with ISO timestamps supplied by a clock argument where persistence depends on time.
- [ ] **Step 4: Run the focused test and `npm run typecheck`**; confirm both pass.
- [ ] **Step 5: Commit** with `feat: add Airlock incident domain`.

### Task 2: Trust classifier and policy compiler

**Files:**
- Create: `src/domain/trustClassifier.ts`
- Create: `src/domain/airlockPolicy.ts`
- Test: `src/domain/trustClassifier.test.ts`
- Test: `src/domain/airlockPolicy.test.ts`

**Interfaces:**
- Produces: `classifyEvidence(entry: TelemetryEntry): EvidenceAssessment`.
- Produces: `validateResponseProposal(input, context): ResponseToolProposal`.
- Produces error codes `UNTRUSTED_EVIDENCE`, `OPERATION_NOT_ALLOWLISTED`, `CROSS_SERVICE_OPERATION`, `MUTATION_BUDGET_EXCEEDED`, `POLICY_EXPIRED`, `SIMULATION_STALE`, and `DEPENDENCY_ORDER_INVALID`.

- [ ] **Step 1: Write failing trust tests** proving the canonical third-party instruction is quarantined, normal third-party data remains untrusted but not flagged as an attack, platform metrics are trusted, and rendered content remains inert text.
- [ ] **Step 2: Run the trust test** and confirm the expected missing-module failure.
- [ ] **Step 3: Implement the bounded deterministic classifier** using provenance and explicit canonical-risk patterns; document that it is a fixture detector, not a universal injection classifier.
- [ ] **Step 4: Write failing policy tests** for valid checkout rollback and atomic rejection of unknown, cross-service, forbidden, destructive, over-budget, expired, stale, and dependency-invalid proposals.
- [ ] **Step 5: Run the policy test** and confirm every new case fails for missing behavior.
- [ ] **Step 6: Implement policy validation** against exact allowlists and trusted operation metadata, returning one validated proposal or one structured domain error without partial state writes.
- [ ] **Step 7: Run both focused tests and typecheck**; confirm green.
- [ ] **Step 8: Commit** with `feat: enforce Airlock evidence and response policy`.

### Task 3: Deterministic simulation, checks, and trusted execution

**Files:**
- Create: `src/domain/remediationSimulator.ts`
- Create: `src/domain/remediationOperations.ts`
- Create: `src/domain/remediationExecutor.ts`
- Create: `src/domain/airlockChecks.ts`
- Test: matching `.test.ts` files.

**Interfaces:**
- Produces: `simulateRemediation(state, input, now): RemediationSimulation`.
- Produces: `runAirlockChecks(context): AirlockCheck[]`.
- Produces: `executeRemediation(definition, context, signal): Promise<ExecutionReceipt>`.
- Trusted operation IDs are exactly `system.capture_snapshot`, `checkout.select_previous_stable`, `checkout.start_canary`, `checkout.evaluate_canary`, `checkout.promote_rollback`, and `incident.resolve`.

- [ ] **Step 1: Write failing simulator tests** for 5/10/25% canaries, canonical 10% predicted metrics, stable plan hashes, invalid canary input, and revision changes producing different proof.
- [ ] **Step 2: Run simulator tests** and witness the expected failures.
- [ ] **Step 3: Implement deterministic simulation** without timers, randomness, network access, or mutation of the source state.
- [ ] **Step 4: Write failing check tests** covering all nine design checks, quarantined evidence, stale proofs, and zero blocking failures for the canonical plan.
- [ ] **Step 5: Implement checks** with stable IDs, human-readable evidence, and explicit blocking status.
- [ ] **Step 6: Write failing executor tests** for ordered progress, exact state recovery, immutable receipt data, one production mutation, mid-step cancellation, operation failure rollback, and rejected second use.
- [ ] **Step 7: Implement the trusted operation registry and executor** with a complete deep snapshot captured before work and restored on every unsuccessful terminal path.
- [ ] **Step 8: Run all new domain tests and typecheck**; confirm green.
- [ ] **Step 9: Commit** with `feat: add deterministic Airlock remediation engine`.

### Task 4: Airlock store and persistence

**Files:**
- Rewrite: `src/store/useAppStore.ts`
- Rewrite: `src/store/selectors.ts`
- Rewrite: `src/store/persistence.ts`
- Rewrite tests: `src/store/useAppStore.test.ts`, `src/store/persistence.test.ts`

**Interfaces:**
- Store actions include `recordThreat`, `saveSimulation`, `saveChecks`, `stageResponseTool`, `approveResponseTool`, `recordProgress`, `resolveIncident`, `saveReceipt`, `completeResponseTool`, `disableResponseTool`, `deleteResponseTool`, `reset`, and `hydrateFromPersistence`.
- Persistence keys are `airlock.incident.v1`, `airlock.responses.v1`, and `airlock.ui.v1`.

- [ ] **Step 1: Replace store tests first** with failing Airlock assertions for reset, revision invalidation, stale async write rejection, threat recording, proposal lifecycle, progress, receipt, completion, and exact key clearing.
- [ ] **Step 2: Run store tests** and confirm they fail against the civic store.
- [ ] **Step 3: Implement the minimal Airlock Zustand store** using atomic actions and explicit revision checks.
- [ ] **Step 4: Replace persistence tests first** with failing valid restore, corrupt envelope recovery, expired/completed response filtering, stale revision filtering, and independent-envelope reconciliation cases.
- [ ] **Step 5: Implement versioned persistence** and visible `PERSISTENCE_RECOVERY` activity.
- [ ] **Step 6: Run store/persistence tests and typecheck**; confirm green.
- [ ] **Step 7: Commit** with `feat: persist Airlock incident and response state`.

### Task 5: Seven Airlock static tools

**Files:**
- Rewrite: `src/webmcp/staticToolDefinitions.ts`
- Modify: `src/webmcp/registerStaticTools.ts`
- Rewrite: `src/webmcp/staticTools.test.ts`
- Modify: `src/webmcp/toolInputSample.ts`
- Rewrite: `src/webmcp/toolInputSample.test.ts`

**Interfaces:**
- Exact tool names are those in the design, with `query_telemetry` setting both `readOnlyHint: true` and `untrustedContentHint: true`.
- `stage_response_tool` consumes a current passing check proof and exact simulation ID.

- [ ] **Step 1: Write failing registry tests** asserting exact names, annotations, descriptions, closed schemas, strict runtime rejection, and no civic names.
- [ ] **Step 2: Run the focused tests** and confirm failures against existing definitions.
- [ ] **Step 3: Implement tool schemas and handlers** using the new store/domain modules, preserving structured success/error results and activity timing.
- [ ] **Step 4: Write failing behavior tests** for inspection, bounded telemetry results, quarantine visibility, deployment inspection, simulation persistence, checks, staging without registration, and compact listing.
- [ ] **Step 5: Implement behavior and safe simulator samples** for every static tool.
- [ ] **Step 6: Run WebMCP static/registry/sample tests and typecheck**; confirm green.
- [ ] **Step 7: Commit** with `feat: expose Airlock through seven WebMCP tools`.

### Task 6: One-use dynamic rollback tool lifecycle

**Files:**
- Rewrite: `src/webmcp/dynamicToolManager.ts`
- Rewrite: `src/webmcp/dynamicToolManager.test.ts`
- Modify: `src/app/runtime.ts`
- Rewrite: `src/app/runtime.test.ts`

**Interfaces:**
- `approveAndRegister(proposalId: string): Promise<ApprovedResponseTool>` remains a human-UI-only method.
- Dynamic input schema contains only required integer `canaryPercent` enum `[5, 10, 25]`.
- Successful execution schedules abort/unregistration after the execution result and state receipt are committed.

- [ ] **Step 1: Write failing manager tests** for approval validation, direct registration, live truth, input closure, same-session execution, progress, receipt, successful self-unregistration, second-use rejection, expiry, disable/delete, reload revalidation, cancellation, and rollback.
- [ ] **Step 2: Run manager/runtime tests** and confirm expected failures.
- [ ] **Step 3: Implement the Airlock dynamic manager** using one `AbortController` per registration and exact current-revision validation before approval, restore, and invocation.
- [ ] **Step 4: Ensure self-unregistration occurs after result delivery** and emits visible activity plus toolchange without aborting the just-completed invocation.
- [ ] **Step 5: Run manager, adapter, registry, and runtime tests**; confirm green.
- [ ] **Step 6: Commit** with `feat: register one-use Airlock response tools`.

### Task 7: Operations-room UI and living topology

**Files:**
- Create the Airlock components listed in File Structure.
- Rewrite: `src/app/App.tsx`
- Rewrite: `src/components/Header.tsx`, `RightRail.tsx`, `ToolSurface.tsx`, `ActivityLedger.tsx`, `JourneyChecks.tsx`.
- Rewrite: `src/styles/index.css`
- Rewrite first portion of `src/app/App.integration.test.tsx`.

**Interfaces:**
- `ServiceTopology` receives incident services, edges, phase, and quarantined source IDs; it exposes a complete textual status list.
- `IncidentCommandCenter` receives runtime/open-simulator callbacks and derives all live state from the store.

- [ ] **Step 1: Write failing integration tests** for the initial incident, exact prompts, fictional disclaimer, service status text alternative, responsive semantic regions, and absence of civic copy.
- [ ] **Step 2: Run the focused integration tests** and confirm failure.
- [ ] **Step 3: Implement the command-center shell and header** with the topology as the dominant first-screen element.
- [ ] **Step 4: Implement topology and timeline state rendering** for active, quarantined, canary, recovered, and reduced-motion states.
- [ ] **Step 5: Implement evidence, policy, checks, activity, tool surface, progress, and receipt panels** with plain-language copy and escaped content.
- [ ] **Step 6: Implement the complete token system and responsive CSS** using the design palette, system fonts, visible focus, 44px targets, and no horizontal overflow.
- [ ] **Step 7: Run integration tests, axe initial-state check, typecheck, and formatting**; confirm green.
- [ ] **Step 8: Commit** with `feat: build the Airlock incident command center`.

### Task 8: Human review, simulator, and canonical application journey

**Files:**
- Create: `src/components/ResponseProposalSheet.tsx`
- Create: `src/components/AirlockSimulator.tsx`
- Rewrite: `src/components/WebMCPSimulator.test.tsx` or replace with `AirlockSimulator.test.tsx`.
- Complete: `src/app/App.integration.test.tsx`
- Remove obsolete civic components after all imports are gone.

**Interfaces:**
- Proposal review shows service scope, operations, one mutation, simulation proof, expiry, one-use status, and forbidden capabilities.
- Simulator one-click sequence mirrors Prompt A and enables Prompt B only after live registration.

- [ ] **Step 1: Write failing integration tests** for quarantine, simulation, passing checks, staging without registration, proposal focus trap, rejection/edit return, approval registration, Prompt B visibility, invocation, recovery, receipt, and automatic disappearance of the tool.
- [ ] **Step 2: Run the focused tests** and confirm failure.
- [ ] **Step 3: Implement the proposal sheet** with human-only approval and honest registration-failure recovery.
- [ ] **Step 4: Implement the simulator** with exact tool metadata, generated samples, manual JSON execution, and canonical one-click actions.
- [ ] **Step 5: Connect recovery progress, receipt, self-unregistration, disable/delete, reset, reload, and persistence recovery UI**.
- [ ] **Step 6: Remove obsolete civic production and test files** only after `rg` confirms no imports.
- [ ] **Step 7: Run all Vitest tests, typecheck, lint, and format check**; confirm green.
- [ ] **Step 8: Commit** with `feat: complete the Airlock two-prompt journey`.

### Task 9: Browser, accessibility, responsive, and lifecycle acceptance

**Files:**
- Rewrite: `e2e/canonical-flow.spec.ts`
- Rewrite: `e2e/persistence.spec.ts`
- Rewrite: `e2e/accessibility.spec.ts`
- Rewrite: `e2e/responsive.spec.ts`
- Rewrite or remove: `e2e/app.spec.ts`

**Interfaces:**
- Native-like browser mock begins with exactly seven tools and records execution cancellation plus abort unregistration.
- Named screenshots cover initial, quarantined, proposal, canary, resolved, and mobile states.

- [ ] **Step 1: Write the canonical failing Playwright test** that executes the seven-tool Prompt A sequence, clicks human approval, invokes the eighth tool, observes recovery and receipt, then observes automatic unregistration and two toolchange transitions.
- [ ] **Step 2: Run only canonical Playwright** and confirm failure before browser implementation is considered complete.
- [ ] **Step 3: Fix application/browser integration until canonical passes** without console or page errors.
- [ ] **Step 4: Add failing persistence/lifecycle tests** for reload re-registration before use, expiry, completed-tool non-restore, disable, reset, and AbortSignal cancellation.
- [ ] **Step 5: Add failing accessibility tests** for axe canonical states, focus traps, keyboard-only approval/reset/simulator, 44px controls, reduced motion, and textual topology alternatives.
- [ ] **Step 6: Add failing responsive tests** for 1440×1000 and 390×844, no horizontal overflow, in-viewport actions, and stable screenshots.
- [ ] **Step 7: Implement every browser-level correction and rerun all Playwright tests with four workers**.
- [ ] **Step 8: Inspect every named screenshot at original resolution and correct hierarchy, clipping, contrast, motion capture, and mobile density defects**.
- [ ] **Step 9: Commit** with `test: complete Airlock browser acceptance`.

### Task 10: Submission assets and final gate

**Files:**
- Rewrite: `README.md`
- Rewrite: `DEMO_SCRIPT.md`
- Rewrite: `SUBMISSION_DRAFT.md`
- Rewrite: `STATUS.md`
- Rewrite: `evals/webmcp-cases.json`, `evals/README.md`
- Preserve: `LICENSE`
- Modify: `package.json` only if names or scripts require truthful updates.

**Interfaces:**
- README contains product, problem, WebMCP necessity, architecture, security limits, exact tools, local setup, browser testing, complete verification, deployment, and fictional-data disclaimer.
- Demo script is under three minutes and centers the topology attack-block-recovery sequence.
- Evals contain at least 18 unique valid tool-selection, schema, adversarial, stale-proof, and lifecycle cases.

- [ ] **Step 1: Rewrite documentation and eval fixtures** with no CivicWeave municipal claims, placeholder links only where deployment/repository/video URLs are externally unknown, and explicit limits on deterministic injection detection.
- [ ] **Step 2: Run fixture/schema tests and `rg` for stale civic product claims**; remove all unintended remnants.
- [ ] **Step 3: Run `npm run check`** and require exit code zero for lint, format, strict typecheck, Vitest, production build, and all Playwright tests.
- [ ] **Step 4: Run the production preview and canonical journey once more** while collecting browser console/page errors; require empty collections.
- [ ] **Step 5: Inspect final desktop and mobile screenshots** and record exact paths and counts in `STATUS.md`.
- [ ] **Step 6: Run `git diff --check`, inspect `git status`, and review the complete diff against the design completion gate**.
- [ ] **Step 7: Commit** with `feat: complete WebMCP Airlock submission`.

---

## Final Self-Review

- Every design requirement maps to one of Tasks 1–10.
- Dynamic registration, same-session invocation, automatic unregistration, and visible toolchange map to Tasks 6, 8, and 9.
- Deterministic security, trust labeling, policy enforcement, freshness, and rollback map to Tasks 2–4.
- The living topology and visual wow sequence map to Tasks 7–9.
- Submission accuracy and deployability map to Task 10.
- No task requires a backend, external credential, real infrastructure, embedded model, or browser extension.
