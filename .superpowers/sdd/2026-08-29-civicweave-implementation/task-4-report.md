# Task 4 — Shared Store, Persistence, and Reset Report

## Files

- Created `src/store/persistence.ts`: four exact versioned keys, guarded Zod envelope loading, safe discard, typed per-key load/save helpers, browser-storage boundary, and reset clearing.
- Created `src/store/useAppStore.ts`: one Zustand store for resident/session, portal states, drafts, task views, locks, checks, proposals, approved tools, WebMCP metadata, activity, metrics, dialog/right-rail state, human-only submissions, recovery, and dynamic unregister-aware reset.
- Created `src/store/selectors.ts`: focused component selectors and exported `getAppState()` for non-React handlers.
- Created `src/store/persistence.test.ts` and `src/store/useAppStore.test.ts`.

## Red / Green Evidence

1. Red — `npm test -- src/store/persistence.test.ts src/store/useAppStore.test.ts`
   - Failed as intended because `./persistence` did not exist in either suite.
2. Green persistence — `npm test -- src/store/persistence.test.ts`
   - `6 passed` after guarded envelope implementation.
3. Red recovery action — `npm test -- src/store/useAppStore.test.ts`
   - Failed as intended with `store.hydrateFromPersistence is not a function`.
4. Green store — `npm test -- src/store/useAppStore.test.ts src/store/persistence.test.ts`
   - `14 passed` after recovery hydration and state actions.

## Verification Commands and Output

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0, zero warnings.
- `npm run format:check` — `All matched files use Prettier code style!`
- `npm test` — `7 passed`, `73 passed`.
- `npm run build` — blocked before application code by Vite: `Rollup failed to resolve import "/src/main.tsx" from index.html`. The source entry does not exist yet and is outside Task 4.
- `git diff --check` — exit 0.

## Decisions

- Persistence envelopes are `{ version: 1, data }`; malformed, invalid, or version-mismatched data is removed without throwing.
- Recovery is visible as a system activity entry whose detail includes the stable `PERSISTENCE_RECOVERY` code. The existing domain activity union has no dedicated recovery kind, so it uses `tool_failed` with warning status.
- Activity redacts email addresses and truncates payload/form-data/body content.
- Only human store actions confirm final submissions. Permit confirmation is `NST-PP-2026-08421`; address confirmation is `NST-AC-2026-03116`.
- Reset awaits the registered dynamic-tool unregister hook, clears all four persistence keys, restores the seed state, and then records an in-memory reset entry. It intentionally does not re-persist that entry, preserving the requirement that reset leaves all four keys cleared.

## Self-Review

- One shared Zustand state boundary exists and exposes `getAppState()`.
- Views retain human locks in `lockedElementIds`; direct human edits are stored in service drafts.
- Proposal staging cannot register; `approveProposal` is a human action seam and produces approved metadata.
- Domain validation remains outside store actions.
- Selectors avoid broad subscriptions for common UI consumers.
- The dynamic unregister callback is module-resident and deliberately excluded from persistence.

## Concerns

- The full production build cannot pass until the task responsible for `src/main.tsx` adds that missing application entry.
- WebMCP registration will need to wire its dynamic-manager unregister function into `registerDynamicToolUnregister`; Task 4 provides the seam but does not implement WebMCP registration.

## Fix Round 1

### Root Causes

- Draft staging previously set `staged_for_review` unconditionally, and edits could reopen a submitted portal state.
- Activity redaction only replaced same-line email/payload fragments, leaving JSON keys and multiline form data visible.
- Human actions lived beside agent actions in the same exported store projection.
- Proposal status was accepted from callers rather than advanced through enforced transitions.
- Reset awaited the dynamic unregister hook without a recovery path.

### Changes

- Enforced staged-review draft requirements for both services and stable `DomainError` codes for forbidden state transitions.
- Moved edit, lock/unlock, approval/rejection, disable/delete, and final confirmation into `state.human`; `getAppState()` now returns a deliberately narrower `ToolAppState` with no human capabilities.
- Added proposal transitions `draft → validated → awaiting_approval → registered → disabled`, plus the rejection branch and human-only delete.
- Replaced partial activity redaction with a conservative allowlist sanitizer: JSON, assignments, bracketed data, form-data/body/payload labels, multiline text, and email-like text become `Details redacted for privacy.` before persistence.
- Added chronological ordering selector/action, explicit metric actions, and reset cleanup in `try/catch/finally`.

### Red / Green Evidence

1. Red — `npm test -- src/store/useAppStore.test.ts`
   - `7 failed`: idle staging did not throw; WebMCP projection exposed human actions; proposal transition/metric/order APIs were absent; raw payload kept `secret`; unregister rejection escaped reset.
2. Green — `npm test -- src/store/useAppStore.test.ts src/store/persistence.test.ts`
   - `2 passed`, `21 passed`.
3. Full verification — `npm run typecheck && npm run lint && npm run format:check && npm test`
   - Typecheck exit 0; lint exit 0; Prettier clean; `7 passed`, `80 passed`.

### Exact Commands and Output

- `npm test -- src/store/useAppStore.test.ts src/store/persistence.test.ts` — 2 files passed, 21 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0, zero warnings.
- `npm run format:check` — `All matched files use Prettier code style!`
- `npm test` — 7 test files passed, 80 tests passed.

### Remaining Concern

- Dynamic registration/disable/delete implementation must invoke the relevant browser adapter unregister lifecycle around the human-only store methods; this store supplies the capability boundary and reset hook, while the WebMCP task owns adapter lifecycle wiring.

## Fix Round 2

### Root Causes

- The store treated portal modes as labels rather than legal graph edges, allowing idle edits and direct compilation from arbitrary modes.
- Activity sanitization omitted `toolName`, letting free text bypass the privacy boundary.
- Proposal transition code marked a caller-supplied draft as validated without invoking `validateWorkflowProposal` or retaining its errors.
- Review-readiness logic was duplicated in the store instead of sharing trusted domain semantics.

### Changes

- Enforced `idle → manual_flow_active → adaptive_view_active/draft_in_progress → staged_for_review → submitted`; human edits require an active matching service, while `addView` requires the canonical `startManualFlow(serviceId)` followed by compilation for that same service. The caller sequence is documented next to `addView`.
- Sanitized `toolName` with the same conservative free-text sanitizer used for title/detail before an activity entry is stored or persisted.
- `validateProposal`, approval staging, and human approval now call `validateWorkflowProposal` with current view checks, static names, and enabled dynamic names. Failed validation stores stable error codes and blocks all later transitions.
- Added `src/domain/draftValidator.ts`, using service blueprints and the trusted operation schemas; the store delegates review-readiness checks to it.

### Red / Green Evidence

1. Red — `npm test -- src/domain/draftValidator.test.ts src/store/useAppStore.test.ts`
   - Missing domain validator import, unsanitized `toolName`, idle editing, and invalid human-only proposal validation all failed as expected.
2. Green focused — `npm test -- src/domain/draftValidator.test.ts src/store/useAppStore.test.ts src/store/persistence.test.ts`
   - 3 files passed, 28 tests passed.
3. Full verification — `npm run typecheck && npm run lint && npm run format:check && npm test`
   - Typecheck exit 0; lint exit 0; Prettier clean; 8 files passed, 87 tests passed.

### Exact Commands and Output

- `npm test -- src/domain/draftValidator.test.ts src/store/useAppStore.test.ts src/store/persistence.test.ts` — 3 files passed, 28 tests passed.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0, zero warnings.
- `npm run format:check` — `All matched files use Prettier code style!`
- `npm test` — 8 test files passed, 87 tests passed.

### Remaining Concern

- The production build remains blocked by the separate missing `src/main.tsx` entry. Dynamic browser registration remains responsible for connecting its adapter-specific disable/delete unregister lifecycle to these human-only store operations.
