# Task 5 Report — WebMCP adapters, registry, and static tools

## Status

Implemented the narrow top-level WebMCP boundary, native and in-memory adapters, registry instrumentation, compact result helpers, and exactly seven static tools. Static tool handlers use the existing domain compiler/checker/workflow validator and the shared Zustand store. No approval, registration, disable, delete, or submit agent tool was added.

## Files

Created:

- `src/webmcp/global.d.ts`
- `src/webmcp/types.ts`
- `src/webmcp/results.ts`
- `src/webmcp/adapter.ts`
- `src/webmcp/nativeAdapter.ts`
- `src/webmcp/memoryAdapter.ts`
- `src/webmcp/registry.ts`
- `src/webmcp/staticToolDefinitions.ts`
- `src/webmcp/registerStaticTools.ts`
- `src/webmcp/memoryAdapter.test.ts`
- `src/webmcp/registry.test.ts`
- `src/webmcp/staticTools.test.ts`

Updated:

- `src/store/useAppStore.ts` — added a guarded `updateView` action so a validated atomic patch can persist to the real shared store without bypassing lock identity or persistence.

## TDD evidence

### Adapter red

Command:

```text
npm test -- src/webmcp/memoryAdapter.test.ts
```

Observed result: exit 1. Vitest failed to resolve `./memoryAdapter`, proving the adapter behavior did not exist.

### Adapter green

Command:

```text
npm test -- src/webmcp/memoryAdapter.test.ts
```

Observed result: exit 0; 1 file passed, 4 tests passed. After the native case was added, the same file passed 5/5 tests.

### Registry red

Command:

```text
npm test -- src/webmcp/registry.test.ts
```

Observed result: exit 1. Vitest failed to resolve `./registry`, proving registry validation/instrumentation did not exist.

### Registry green

Command:

```text
npm test -- src/webmcp/registry.test.ts src/webmcp/memoryAdapter.test.ts
```

Observed result: exit 0; 2 files passed, 9 tests passed.

### Static tools red

Command:

```text
npm test -- src/webmcp/staticTools.test.ts
```

Observed result: exit 1. Vitest failed to resolve `./registerStaticTools`, proving the seven-tool integration did not exist.

### Static tools green

Command:

```text
npm test -- src/webmcp/staticTools.test.ts
```

Observed result: exit 0; 1 file passed, 6 tests passed.

### Lifecycle review red/green

Command:

```text
npm test -- src/webmcp/registry.test.ts
```

Observed red: exit 1; 1 of 5 tests failed because abort-driven unregistration left stale origin metadata in `ToolRegistry`.

Observed green after reconciling metadata against adapter discovery: exit 0; 1 file passed, 5 tests passed.

## Final verification

Commands and exact outcomes:

```text
npm run lint
```

Exit 0; ESLint completed with zero warnings/errors.

```text
npm run format:check
```

Exit 0; `All matched files use Prettier code style!`

```text
npm run typecheck
```

Exit 0; `tsc --noEmit` completed without diagnostics.

```text
npm test
```

Exit 0; 11 test files passed, 105 tests passed.

```text
npm run build
```

Exit 1 after `tsc -b` succeeded. Vite transformed 2 modules, then failed to resolve `/src/main.tsx` from `index.html`. The repository does not yet contain the application entry file; this is outside the Task 5 file boundary and not caused by the WebMCP changes.

## Decisions

- Kept the production native call explicit at top level: `document.modelContext.registerTool(definition, { signal })`; no monkey-patch or simulator installation on `document` exists.
- Declared only the five browser methods used by this build in `global.d.ts`.
- Used one `Map` and local listener set for simulator lifecycle; abort removes the tool and emits local `toolchange`.
- Centralized all execution validation in `ToolRegistry` with strict Zod schemas, before any domain handler runs.
- Kept result objects JSON-compatible and enforced a 1,500-character boundary fallback.
- Stored registry origin separately from adapter metadata and reconciled both the registry and shared Tool Surface after lifecycle events.
- Implemented the seven schemas from Section 20 with root and nested `additionalProperties: false` object boundaries.
- Compiled views through `compileTaskView`, then performed the required `startManualFlow` and `addView` shared-state transitions.
- Applied patches with `patchTaskView` first and persisted only the complete validated candidate, preserving atomicity and human locks.
- Staged workflows through `compileWorkflowProposal` plus the store's validate/request-review state transitions; the handler never calls adapter registration.
- Returned compact capability IDs, view/check summaries, and workflow metadata rather than the whole application store.

## Self-review

- Confirmed exactly seven stable static names and no tool containing approval or submission behavior.
- Confirmed read/write annotations match Section 20 and all P0 seed outputs use `untrustedContentHint: false`.
- Confirmed the memory adapter does not assign to or replace `document.modelContext`.
- Confirmed missing native execution context is handled through optional chaining on `context?.signal`.
- Confirmed external input is revalidated on every execution, including strict nested objects.
- Confirmed DomainError and Zod failures become compact structured results and unexpected errors do not leak internals.
- Confirmed tool calls time/log start, completion, or failure and update shared metrics.
- Confirmed abort-driven unregistration updates adapter discovery, registry origin metadata, and shared registered names.
- Confirmed inspection clones arrays/objects so returned data cannot mutate the store by reference.
- Confirmed static staging opens the human proposal sheet and leaves both adapter registrations and approved tools unchanged.
- Attempted the optional independent Codex CLI review. The installed review script used an unsupported flag; the compatible invocation was then blocked because transmitting repository contents lacked explicit authorization. No bypass was attempted; the local spec checklist above was used instead.

## Concerns

- Repository-level production build remains blocked by the pre-existing missing `src/main.tsx`. Lint, format, typecheck, and the latest full 109-test suite pass.
- Dynamic workflow construction/approval/registration is intentionally not implemented here; Task 5 provides registry controller support and static staging only, with the human approval path reserved for the later dynamic-tool task.

## Fix Round 1

### Root causes and fixes

1. `memoryAdapter.executeTool` parsed string input before invoking the registry-wrapped handler. A malformed JSON string therefore threw directly from the adapter and skipped structured `INVALID_TOOL_INPUT`, timing, Activity entries, and metrics. The adapter now parses valid JSON but forwards malformed text to the registry's strict Zod boundary, where it becomes the same compact, logged failure as any other invalid external input.
2. `ToolRegistry.register` checked only completed registration metadata. Two calls could both pass that check before either awaited adapter call completed. A synchronous `pendingNames` reservation now covers the whole asynchronous registration, rejects concurrent duplicates, and is released in `finally` so a failed adapter call can be retried safely.
3. The static `run_journey_checks` handler passed no rendered UI or axe context even when `includeDomChecks` was true. `StaticToolDependencies` now accepts a narrow trusted `JourneyChecksProvider` keyed only by `viewId`; the provider supplies presentation facts and the mounted DOM/axe adapter only when DOM checks are requested. The domain checker remains responsible for interpreting scan results and the shared store persists those results.

### Red evidence

Command:

```text
npm test -- src/webmcp/registry.test.ts src/webmcp/staticTools.test.ts
```

Observed result: exit 1; 3 tests failed. Malformed JSON rejected with an uncaught `DomainError`, concurrent registration timed out waiting on the permissive adapter instead of rejecting the reserved duplicate, and the injected critical axe violation was not executed/stored (`blockingFailures` remained 0).

### Green evidence

Command:

```text
npm test -- src/webmcp/registry.test.ts src/webmcp/staticTools.test.ts src/webmcp/memoryAdapter.test.ts
```

Observed result: exit 0; 3 files passed, 20 tests passed.

Command:

```text
npm run typecheck
npm run lint
npm run format:check
```

Observed results after formatting: all exit 0; TypeScript had no diagnostics, ESLint had zero warnings/errors, and Prettier reported all files matched.

Command:

```text
npm test
```

Observed result: exit 0; 11 test files passed, 109 tests passed.

### Fix-round self-review

- Valid JSON strings still reach handlers as parsed objects; malformed JSON cannot bypass registry result/log/metric instrumentation.
- The pending-name reservation is established before the first await and released on every exit path.
- Failed adapter registration does not leave completed metadata or block a same-name retry.
- The DOM provider receives only the selected `viewId`, is never called when `includeDomChecks` is false, and cannot replace the trusted domain checker.
- The original seven names, schemas, annotations, and human-only approval/submission boundaries are unchanged.
