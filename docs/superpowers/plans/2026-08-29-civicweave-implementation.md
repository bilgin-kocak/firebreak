# CivicWeave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete deployable CivicWeave static application and prove the canonical two-prompt WebMCP journey, safety boundaries, accessibility, persistence, and responsive presentation.

**Architecture:** A strict TypeScript React SPA owns all resident data and operations in-browser. Domain modules compile and validate plain data definitions; a narrow WebMCP adapter registers exactly seven static tools at the top-level document and human-approved dynamic tools with `AbortController`, while Zustand maintains the shared human/agent UI state. Native and memory adapters execute the same definitions, and every compiled workflow can call only prewritten service operations before stopping at review.

**Tech Stack:** Vite, React 19, strict TypeScript, Zustand, Zod, Lucide React, plain CSS, Vitest, React Testing Library, Playwright, axe-core, ESLint, and Prettier.

**Spec:** `CivicWeave_Complete_Build_Spec.md`

## Global Constraints

- Register exactly seven static tools: `inspect_portal`, `compile_task_view`, `inspect_task_view`, `patch_task_view`, `run_journey_checks`, `stage_workflow_tool`, and `list_workflow_tools`.
- Keep a direct production call to top-level `document.modelContext.registerTool(...)`; never install tools inside iframes or monkey-patch the native API.
- Generate only validated interface and workflow data. Never generate or execute JavaScript, JSX, HTML, CSS, selectors, URLs, or network requests.
- Human UI controls alone may lock content, approve/register/disable/delete workflows, and perform final submission.
- Revalidate all inputs, proposals, and restored definitions at their execution or registration boundary.
- Dynamic registration uses an `AbortController`; failed or cancelled workflow execution rolls back the complete draft snapshot.
- Use the exact seed resident, fees, confirmation numbers, prompt copy, persistence keys, and stable error codes from the build spec.
- All adaptive copy is rendered through normal React escaping; `dangerouslySetInnerHTML`, `eval`, and `new Function` are prohibited.
- Strict TypeScript, lint with zero warnings, Prettier, all Vitest and Playwright tests, axe checks, and production build must pass.

---

### Task 1: Project foundation and executable domain contracts

**Files:**
- Create: `package.json`, TypeScript/Vite/ESLint/Prettier/Vitest/Playwright configuration, `index.html`
- Create: `src/domain/types.ts`, `src/domain/schemas.ts`, `src/domain/seed.ts`, `src/domain/serviceBlueprints.ts`
- Test: `src/domain/serviceBlueprints.test.ts`, `src/test/setup.ts`, `src/test/fixtures.ts`

**Interfaces:**
- Produces the exact domain types from Section 13, `serviceBlueprints: Record<ServiceId, ServiceBlueprint>`, `getServiceBlueprint(serviceId)`, canonical preferences, and deterministic `createId`/clock test seams.
- Uses Zod schemas at every external input and persistence boundary.

- [ ] Create the strict project configuration and scripts listed in Section 25.1.
- [ ] Write failing blueprint tests for both generic services, required fields, modeled parking interactions, and non-compilable human submit operations.
- [ ] Run the focused tests and confirm they fail because domain modules are absent.
- [ ] Implement types, seed data, schemas, and blueprints with materially distinct plain-language labels.
- [ ] Run the focused tests and typecheck until green.

### Task 2: Safe interface compiler, atomic patching, and deterministic checks

**Files:**
- Create: `src/domain/viewCompiler.ts`, `src/domain/viewValidator.ts`, `src/domain/journeyChecks.ts`
- Test: `src/domain/viewCompiler.test.ts`, `src/domain/journeyChecks.test.ts`

**Interfaces:**
- Produces `compileTaskView(input, now): TaskViewDefinition`, `patchTaskView(view, patches): TaskViewDefinition`, `validateTaskView(view)`, and `runJourneyChecks(view, context): Promise<JourneyCheckResult[]>`.
- Locked targets are `field:<fieldId>`, `copy:<fieldId>`, and `title`; any conflict throws a structured domain error with `LOCKED_BY_USER` and applies no patch.

- [ ] Write failing tests for required insertion, duplicate removal, unknown fields, required visibility, copy limits, plain labels, atomic patches, and all three lock targets.
- [ ] Confirm each focused failure names the missing behavior.
- [ ] Implement normalization and validation without accepting component names or executable presentation values.
- [ ] Write failing checks tests for the canonical pass, missing confirmation, human-only submit protection, progress, locks, labels, known/unique fields, safe copy, and optional DOM axe results.
- [ ] Implement the deterministic checks and confirm the focused suite passes.

### Task 3: Trusted operations, workflow validation, schema derivation, and rollback executor

**Files:**
- Create: `src/domain/operationRegistry.ts`, `src/domain/workflowCompiler.ts`, `src/domain/workflowValidator.ts`, `src/domain/workflowExecutor.ts`
- Test: `src/domain/workflowValidator.test.ts`, `src/domain/workflowExecutor.test.ts`

**Interfaces:**
- Produces `operationRegistry`, `compileWorkflowProposal`, `validateWorkflowProposal`, `deriveDynamicInputSchema`, and `executeWorkflow(proposal, input, context, signal)`.
- The executor snapshots `serviceDrafts[serviceId]`, resolves one binding per required argument, executes sequentially, checks abort before each step, records compact progress, restores the snapshot on any error/cancellation, and returns `DRAFT_STAGED` only after `stage_review`.

- [ ] Write failing validator tests for names, collisions, service isolation, human-only operations, dependency order, bindings, operation and parameter budgets, review termination, and `additionalProperties: false` schema output.
- [ ] Implement validation against trusted operation definitions only and pass focused tests.
- [ ] Write failing executor tests for exact operation order, 6/12-month fees, review staging, failure rollback, abort rollback, and explicit non-submission.
- [ ] Implement operations and executor, then run focused and domain suites green.

### Task 4: Shared store, versioned persistence, and reset semantics

**Files:**
- Create: `src/store/useAppStore.ts`, `src/store/selectors.ts`, `src/store/persistence.ts`
- Test: `src/store/persistence.test.ts`, `src/store/useAppStore.test.ts`

**Interfaces:**
- Produces `useAppStore`, `getAppState`, safe per-key load/save functions, and actions for portal/service/draft/view/locks/checks/proposals/approved tools/WebMCP metadata/activity/metrics/dialog/right-rail state.
- Invalid or mismatched persisted envelopes are discarded without throwing and surface a `PERSISTENCE_RECOVERY` activity entry.

- [ ] Write failing persistence tests for valid restore, version mismatch, malformed JSON, schema-invalid definitions, and the four exact storage keys.
- [ ] Implement guarded persistence and confirm recovery tests pass.
- [ ] Write failing store tests for state-machine transitions, human locks/edits, proposal lifecycle, final human submission, redacted activity, and reset-to-seed behavior.
- [ ] Implement focused store actions, selectors, and subscriptions, then pass the store suite.

### Task 5: WebMCP adapters, registry wrapper, and seven static tools

**Files:**
- Create: `src/webmcp/global.d.ts`, `src/webmcp/types.ts`, `src/webmcp/results.ts`, `src/webmcp/adapter.ts`, `src/webmcp/nativeAdapter.ts`, `src/webmcp/memoryAdapter.ts`, `src/webmcp/registry.ts`, `src/webmcp/staticToolDefinitions.ts`, `src/webmcp/registerStaticTools.ts`
- Test: `src/webmcp/memoryAdapter.test.ts`, `src/webmcp/staticTools.test.ts`, `src/webmcp/registry.test.ts`

**Interfaces:**
- Produces `WebMCPAdapter`, `createNativeAdapter(document.modelContext)`, `createMemoryAdapter()`, `ToolRegistry`, `createStaticToolDefinitions(dependencies)`, and `registerStaticTools`.
- `nativeAdapter.registerTool` visibly calls `document.modelContext.registerTool(definition, { signal })`; handler wrapping validates with Zod, times and logs calls, and converts all failures to compact serializable results.

- [ ] Write failing adapter tests for register/list/execute, duplicate prevention, `toolchange`, abort unregistration, cancellation forwarding, and no production monkey-patch.
- [ ] Implement memory and native adapters and pass adapter tests.
- [ ] Write failing integration tests asserting the seven exact tools register once, schemas reject unknown properties, read/write annotations are correct, portal inspection exposes capability IDs, compilation updates shared UI state, locks are inspectable and immutable, checks update state, staging opens review without registration, and listing is compact.
- [ ] Implement the registry and seven definitions through domain/store dependencies; pass WebMCP integration tests.

### Task 6: Human-approved dynamic registration and reload lifecycle

**Files:**
- Create: `src/webmcp/dynamicToolManager.ts`
- Test: `src/webmcp/dynamicToolManager.test.ts`

**Interfaces:**
- Produces `DynamicToolManager.approveAndRegister`, `.restoreEnabled`, `.disable`, `.delete`, and `.disposeAll`; controllers are stored by name only in memory.
- Approval and restore revalidate persisted proposals, derive the narrow input schema, create the dynamic handler, register through the active adapter, then update metadata and announce `toolchange`.

- [ ] Write failing tests proving staging alone cannot register, only the approval method registers, invalid restored definitions stay disabled, canonical execution stages fee 60 without submitting, `toolchange` is distinct, and disable/delete abort registrations.
- [ ] Implement the manager and pass all lifecycle tests.

### Task 7: Credible portal and adaptive human interface

**Files:**
- Create: `src/main.tsx`, `src/app/App.tsx`, all components listed in Section 9, `src/styles/index.css`
- Test: `src/app/App.integration.test.tsx`, component-focused tests where behavior warrants them

**Interfaces:**
- Produces one application shell with manual dashboard/flows, compiled adaptive renderer, activity/tool/check rail, proposal and confirmation dialogs, simulator, toasts, and persistent disclaimer.
- The safe component registry is keyed only by `FieldKind`; human locks and final controls call store/domain actions directly and are not WebMCP tools.

- [ ] Write failing integration tests for credible initial content, both manual services, exact copyable prompts, manual parking/address completion, adaptive UI activation, xlarge one-field navigation, human edit/lock, dialog focus/Escape/return, proposal human approval, compiled tool invocation, final human submit, disable/delete, and reset.
- [ ] Implement semantic components and application bootstrap with native feature detection and memory fallback.
- [ ] Implement the municipal service-desk visual system from the spec tokens, including a restrained woven capability ribbon as the single signature element, visible focus, 44px large-card targets, responsive right-rail tabs, and reduced-motion behavior.
- [ ] Run integration tests and axe-based component checks until green without runtime warnings.

### Task 8: Browser model-context mock and canonical Playwright coverage

**Files:**
- Create: `src/test/modelContextMock.ts`
- Create: `e2e/canonical-flow.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/persistence.spec.ts`, `e2e/responsive.spec.ts`

**Interfaces:**
- The init script installs an EventTarget-like top-level model context before app load, supports AbortSignal unregistration and execution cancellation, and exposes test-only calls through serializable page evaluation.

- [ ] Write the canonical E2E test for all 17 Section 25.4 steps and assert no console/page errors.
- [ ] Run it and confirm it fails at the first unimplemented browser contract.
- [ ] Implement/fix the model-context mock and UI integration until the canonical two-prompt journey passes.
- [ ] Add failing reload, disable, reset, keyboard-only, axe, desktop 1440×1000, mobile 390×844, and horizontal-overflow tests.
- [ ] Fix browser behavior and responsive presentation until all Playwright tests pass.
- [ ] Capture named desktop and mobile screenshots, inspect them, and correct layout, contrast, focus, density, and dialog issues.

### Task 9: Evals and submission assets

**Files:**
- Create: `evals/webmcp-cases.json`, `evals/README.md`, `README.md`, `DEMO_SCRIPT.md`, `SUBMISSION_DRAFT.md`, `LICENSE`
- Update: `STATUS.md`

**Interfaces:**
- Evals contain at least 14 schema/tool-selection cases including safe failure and agent refusal to submit.
- Documentation uses the exact thesis and canonical prompts, truthfully distinguishes CivicWeave from form filling and saved notebook workflows, and includes the required Mermaid architecture.

- [ ] Create and validate the eval JSON with every required intent case.
- [ ] Write README sections, browser/setup/test/deploy instructions, tool table, human boundaries, security invariants, limitations, and disclaimer.
- [ ] Write the sub-three-minute demo script and ready-to-edit submission prose without fabricated links or metrics.
- [ ] Add the MIT license and update the final status checklist.

### Task 10: Full quality gate and acceptance audit

**Files:**
- Update: `STATUS.md`

**Interfaces:**
- `npm run check` proves lint, format, strict typecheck, Vitest unit/integration tests, production build, and Playwright tests in the required order.

- [ ] Run formatting and fix every reported file.
- [ ] Run lint, strict typecheck, complete Vitest suite, production build, and complete Playwright suite with fresh output.
- [ ] Use systematic root-cause investigation and a failing regression test for every discovered defect.
- [ ] Re-read all Section 26 acceptance criteria and map each to UI evidence, a deterministic test, or both.
- [ ] Inspect the final desktop and mobile screenshots and verify the canonical browser console has no errors.
- [ ] Record exact command results, counts, screenshot paths, deviations, and all 16 final self-review answers in `STATUS.md`.

