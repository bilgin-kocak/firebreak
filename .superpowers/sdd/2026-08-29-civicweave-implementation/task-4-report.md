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
