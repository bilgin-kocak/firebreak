# Firebreak contributor guide

Firebreak is a static React + TypeScript WebMCP application. Treat the seven-tool surface and the human authorization boundary as product invariants.

## Commands

- `npm run dev` — local Vite server
- `npm run check` — complete release gate
- `npm run test:e2e` — Chromium, accessibility, responsive, and canonical browser tests
- `npm run build` — production output in `dist/`

## WebMCP invariants

- Keep the native call at top-level imperative `document.modelContext.registerTool`.
- Keep exactly seven static tools in `STATIC_TOOL_NAMES`; do not add an agent-callable approval tool.
- Compile `execute_rescue_mission` only from a current passing simulation and a visible human authorization.
- The dynamic tool must be one-use, owned by an `AbortController`, visibly emit `toolchange`, and unregister on every terminal or authority-loss path.
- All JSON schemas stay closed and all inputs receive independent strict runtime validation.
- Human authorization and agent calls must remain visibly distinct in the live trace.
- Never persist live authority or raw trace inputs/results.

## Product honesty

- The browser warehouse is deterministic simulation, not a certified physical deployment.
- The ordinary-browser replay contains no model and must remain labeled **Replay walkthrough · no agent**.
- The optional ROS adapter is an integration boundary tested with a fake bridge unless live hardware evidence is added.
