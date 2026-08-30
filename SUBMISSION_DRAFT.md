# WebMCP challenge submission draft

## Project name

WebMCP Airlock

## Tagline

Safe autonomy for production incidents.

## Short description

WebMCP Airlock lets an incident agent investigate a fictional checkout outage, quarantine hostile telemetry, prove a safe rollback, and propose a one-use response tool. A human approves the exact permission envelope once; the tool then runs autonomously, restores checkout, records an audit receipt, and unregisters itself.

## The problem

Incident-response agents are often trapped between two unsafe choices. Read-only agents can explain an outage but cannot recover it. Broadly privileged agents can act, but a hallucination, stale observation, or malicious log entry can cause production damage.

Airlock demonstrates a third option: compile temporary production authority from a fresh deterministic proof. The site owns the allowed operations, affected service, dependency order, expiry, mutation budget, canary thresholds, and rollback behavior. The agent receives only the capability needed for this incident and only after one visible human authorization.

## What it does

The canonical incident is a checkout failure after release `2026.08.30.3`. Through seven static WebMCP tools, an agent:

1. Inspects the incident and service topology.
2. Queries bounded telemetry whose result is explicitly annotated as untrusted.
3. Quarantines a visible prompt-injection attempt hidden in third-party content.
4. Correlates the failure with the latest checkout deployment.
5. Simulates a 10% canary of previous stable release `2026.08.30.2`.
6. Runs nine deterministic safety gates.
7. Stages—but cannot approve—a one-use `rollback_checkout_release` tool.

The operator reviews the exact permission envelope and approves once. The eighth tool registers live and emits `toolchange`. When invoked, it captures a snapshot, canaries, promotes the rollback, resolves the incident, and returns a receipt. Checkout improves from 31.8% errors and 4,820 ms p95 latency to 0.6% and 420 ms. The registration is aborted after success, emits a second `toolchange`, and cannot be invoked again.

## Why WebMCP is essential

Airlock is built around the website's live capability surface, not DOM scraping or a simulated chat response. Seven static tools register imperatively through `document.modelContext.registerTool`. The human-approved response is derived from the validated proposal and registered dynamically in the same page session. An `AbortController` owns its lifetime. The Tool Surface visibly moves seven → eight → seven as browser capabilities change.

Without WebMCP, this would be a static incident dashboard. With WebMCP, the website can expose typed evidence and policy-aware operations, the agent can reason over shared state, and the operator can grant a new capability at the moment it becomes safe.

## What is technically distinctive

- Exactly seven strict static tools and one derived dynamic tool.
- Closed JSON schemas and runtime revalidation on every call.
- Explicit `untrustedContentHint` on telemetry plus deterministic quarantine.
- Revision-bound simulation and check proofs that cannot survive state changes.
- Trusted operation registry; no arbitrary code, URL, selector, network, or shell execution.
- Scope, dependency, forbidden-capability, expiry, and production-mutation enforcement.
- One human goal-level authorization followed by autonomous bounded execution.
- Full snapshot restoration on failure or cancellation.
- Immutable receipt and successful one-use self-unregistration.
- Native and ordinary-browser adapters sharing identical handlers.
- Versioned persistence with safe recovery and revalidation.

## User experience

The interface is designed as a cinematic but credible operations room. Its central service topology is a living explanation of the incident: the checkout path starts red, a hostile telemetry path is visibly blocked, the canary moves through amber, and the full path ends green. Evidence provenance, policy constraints, recovery phases, tool lifecycle, and the final receipt remain understandable without opening developer tools.

The responsive mobile layout preserves the same narrative without horizontal overflow. Dialogs trap and restore focus, interactive targets are at least 44 by 44 pixels, the topology includes a complete text alternative, reduced motion is supported, and all tested canonical states have zero serious or critical axe findings.

## Safety boundaries

Airlock is a fictional local demonstration. It never reaches real infrastructure, credentials, secrets, customer data, or external networks. It does not claim its deterministic fixture detector solves prompt injection generally. Its claim is narrower and testable: a website can label untrusted evidence, exclude it from authority decisions, compile a narrowly scoped temporary tool from a fresh proof, and revoke that tool automatically.

## How to run

```sh
npm install
npm run dev
```

Open the printed local URL and use **Simulator** in an ordinary browser. No keys or accounts are required. Run `npm run check` for lint, formatting, strict typecheck, unit and integration tests, production build, Playwright, accessibility, persistence, responsive, and runtime-error checks.

## Links

- Live demo: `[ADD DEPLOYED URL]`
- Source: `[ADD REPOSITORY URL]`
- Demo video: `[ADD VIDEO URL]`

## Built with

React 19, TypeScript, Vite, Zustand, Zod, imperative WebMCP, Vitest, Playwright, Testing Library, axe-core, and Lucide icons.

## License

MIT
