# CivicWeave submission draft

This prose is ready to edit for the challenge form. Replace the three explicit link placeholders before publishing; no links, usage figures, model-accuracy claims, or endorsements are implied here.

## Project title

CivicWeave

## Tagline

The portal that compiles itself around your goal.

## One-line summary

CivicWeave lets a person and an agent safely compile an accessible task interface and a reusable WebMCP tool from website-owned capabilities, register that tool live after human approval, and stop every execution before human-only submission.

## The problem

Public-service portals are usually organized around agencies, menus, and forms, while people arrive with goals and constraints: renew a permit, use plain language, make controls larger, preserve information already on file, and never submit without asking. People must translate their needs into a fixed interface. Agents that only click the same interface inherit its ambiguity and brittleness.

## The solution

CivicWeave is a fully client-side demonstration inside the fictional Northstar City Services portal. A resident describes the task and interaction preferences. Through WebMCP, the agent reads typed service capabilities and asks the website to compile a temporary interface from trusted fields and approved presentation rules. The resident can edit and lock that shared interface. The website then runs deterministic journey and accessibility checks.

Once the journey passes, the agent can stage a reusable workflow proposal. A human reviews its schema, bindings, operation sequence, and stop boundary, then explicitly approves registration. CivicWeave registers the new tool live. The agent can discover and invoke it immediately, but execution prepares only a visible draft and stops for human confirmation.

## How CivicWeave uses WebMCP

CivicWeave registers exactly seven imperative tools in the top-level document: `inspect_portal`, `compile_task_view`, `inspect_task_view`, `patch_task_view`, `run_journey_checks`, `stage_workflow_tool`, and `list_workflow_tools`. These tools share the live page state with the resident and expose narrow JSON Schemas instead of relying on screen scraping.

The defining moment comes after the agent stages `renew_permit_guided`. Staging cannot approve or register anything. When the person clicks **Approve & Register**, the page revalidates the saved definition, creates an `AbortController`, calls `document.modelContext.registerTool(...)`, displays the newly registered tool, and records the browser’s `toolchange` event. The agent then invokes the new tool in the same session for a 12-month permit.

This is not WebMCP wrapped around ordinary buttons. The available tool surface grows live from a validated, human-approved workflow definition.

## Why it is better with a human and agent together

The agent is good at turning natural-language intent into a constrained interface and operation sequence. The website is authoritative about field IDs, schemas, validation, live data, and safe operations. The human remains authoritative about edits, locks, tool approval, disabling or deleting tools, and final submission.

That separation is visible throughout the experience: the agent proposes; the website validates; the person approves. Human choices win when a field or copy block is locked. The dynamic tool can prepare but cannot submit.

## Creativity and ambition

Most tool-enabled sites expose a fixed catalog. CivicWeave demonstrates a safe toolsmith architecture in which the website can compile both a task-specific interface and a new reusable capability without generating executable code. The workflow is data: bounded metadata, a narrow parameter schema, ordered references to prewritten operations, and a hard stop at review.

The same generic compiler, validators, operation registry, dynamic lifecycle, and human boundaries support both Parking Permit Renewal and Address Change. The goal is not arbitrary website automation; it is a deep proof that one trusted application can offer many interfaces and a tool surface that grows with the user.

## Potential impact

This pattern could help complex service portals serve people with different accessibility needs, levels of familiarity, and task goals without surrendering control of business rules or side effects. Website owners keep authority over data, components, validation, and operations. People gain a simpler interface and reusable capability while retaining explicit control over consequential actions.

The demonstration is intentionally narrow and fictional, but the architecture applies to other trusted, form-heavy applications that can define safe fields and reversible operations.

## Technical implementation

CivicWeave is a static Vite, React, and strict TypeScript application. Zustand holds shared in-browser state, Zod validates external inputs, and plain CSS provides the responsive municipal interface. A safe interface compiler interprets schema-validated definitions through website-owned React components. A workflow compiler accepts only trusted operations from the selected service, validates dependencies and bindings, derives a schema with `additionalProperties: false`, and always terminates at review.

A narrow WebMCP adapter uses native `document.modelContext` when available and an in-memory simulator in ordinary browsers. Dynamic tools are registered with `AbortController`, revalidated before registration and reload, and unregistered when disabled or deleted. Workflow execution snapshots the service draft, runs operations sequentially, and rolls back on cancellation or failure. Versioned `localStorage` persists the current session, views, approved definitions, and redacted activity.

**CivicWeave does not generate executable code. It generates validated interface and workflow definitions interpreted by website-owned components and operations.**

## Safety and permission model

- An agent can inspect, compile, patch unlocked interface definitions, run checks, stage a proposal, list tools, and invoke an approved tool.
- An agent cannot lock or unlock content, approve registration, disable or delete tools, or submit a draft.
- Every tool input is revalidated at execution time.
- Every dynamic proposal is revalidated before registration and after reload.
- Generated copy is rendered as escaped text; no generated value is executed.
- Workflows reference only prewritten same-service operations and cannot include `human_only` operations.
- Failed or cancelled execution restores the full draft snapshot.
- No arbitrary JavaScript, HTML, CSS, selectors, URLs, or network requests are generated or executed.
- No real municipal system, payment, identity provider, database, or external service is connected.

## Testing and evals

The repository includes strict typechecking, zero-warning linting, formatting checks, Vitest unit and integration coverage, a production build, and Playwright browser tests. The browser suite injects a native-like top-level `modelContext` before page load and exercises the full two-prompt journey: seven static tools, interface compilation, a human lock, deterministic checks, proposal staging, human registration, visible `toolchange`, dynamic invocation, review staging, and final human-only confirmation.

Additional Playwright coverage checks reload and re-registration, disable and reset behavior, keyboard navigation, desktop and mobile overflow, axe serious/critical findings, screenshots, and runtime console errors. The `evals/` fixtures cover schema/tool selection, both services, safe failures, lock preservation, invalid dynamic input, and refusal to submit. They are fixtures and deterministic browser checks, not a guarantee of any particular model’s selection behavior or formal accessibility certification.

### Testing instructions

```sh
npm install
npx playwright install chromium
npm run check
```

For an ordinary browser, run `npm run dev`, open the app, click **How to test**, and follow the simulator’s canonical steps. In a browser exposing native WebMCP, confirm the header says **Native WebMCP**, then use the two copyable prompt cards.

## Built with

- Vite
- React
- TypeScript
- Zustand
- Zod
- Lucide React
- Plain CSS
- Vitest and React Testing Library
- Playwright
- axe-core
- ESLint and Prettier
- Imperative WebMCP with a first-party native/memory adapter

## Links to add before submission

- Live demo: `LIVE_DEMO_URL_TO_ADD`
- Repository: `REPOSITORY_URL_TO_ADD`
- Video: `VIDEO_URL_TO_ADD`

## Disclaimer

CivicWeave and Northstar City are fictional. This demonstration does not connect to a government service or submit real information. All residents, vehicles, addresses, permits, fees, and confirmation numbers shown are fictional test data.
