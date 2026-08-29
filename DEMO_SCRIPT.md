# CivicWeave demo script

Target runtime: **2:58**. This script assumes a fresh CivicWeave session in a browser with native WebMCP available. Keep the browser, agent conversation, and Tool Surface visible enough that the changing shared state is easy to follow.

## Before recording

- Open the deployed HTTPS app and confirm the header says **Native WebMCP**.
- Click **Reset demo** so only the seven static tools are present.
- Keep browser zoom at 100% and use a desktop viewport large enough to show the portal and right rail.
- Have Prompt A and Prompt B ready in their copyable cards, but let the recording show the copy action.
- Confirm the Activity, Tool Surface, and Checks tabs start clean.

## 0:00–0:18 — Problem

**Screen:** Begin on the polished but dense Northstar City dashboard. Briefly open Parking Permit Renewal so the conventional steps and surrounding portal navigation are visible.

**Narration:**

> Websites expose the same interface to everyone, even when people arrive with different goals and needs.

## 0:18–0:38 — Intent

**Screen:** Return to the prompt cards, copy Prompt A, and paste it into the agent:

> Renew my parking permit. I have low vision and want plain language, extra-large controls, one question per screen, and no submission without my approval. Use my current vehicle and email contact. Build the interface, verify it, then propose a reusable tool called `renew_permit_guided`.

**Narration:**

> With WebMCP, the agent reads the portal’s trusted fields and capabilities instead of guessing through the interface.

## 0:38–1:08 — Interface compilation

**Screen:** Show `inspect_portal` in Activity, then `compile_task_view`. Let the dense workflow transition to the extra-large, plain-language, one-question-at-a-time view. Point out the goal, preference chips, progress indicator, and “Generated from trusted portal fields” notice.

**Narration:**

> The agent did not generate HTML or code. It selected from safe website-owned fields and interface rules.

## 1:08–1:25 — Human control

**Screen:** Select Maya’s current vehicle and lock the vehicle block. Set the visible duration to 12 months as a human edit. Let the agent inspect the view and apply a small safe refinement to an unlocked block. Show **Locked by you** still present on the vehicle.

**Narration:**

> The human and agent share the same live state, and human choices win. A conflicting patch fails atomically instead of overriding the lock.

## 1:25–1:43 — Verification

**Screen:** Show `run_journey_checks`, then open **Checks**. Highlight required fields, reachable controls, large target size, progress indicator, confirmation gate, and human-only submission. Show zero blocking failures.

**Narration:**

> The website deterministically verifies completeness, bindings, safety, and tested accessibility properties. The model is not grading its own work.

## 1:43–2:05 — Toolsmith moment

**Screen:** Let `stage_workflow_tool` stage `renew_permit_guided`. Show that the tool is not registered yet. In the proposal sheet, point to the single duration input, trusted operation sequence, **Stops at review**, and **Cannot submit** badges. Click **Approve & Register**. Switch to **Tool Surface** as the new row pulses, then show the separate `toolchange` entry.

**Narration:**

> The agent can propose, but only a person can approve. Now that bounded workflow becomes a brand-new WebMCP tool, registered live in the page.

## 2:05–2:32 — Invoke the new tool

**Screen:** Copy and paste Prompt B:

> Use the new `renew_permit_guided` tool for a 12-month permit.

Show the dynamic call execute the trusted operations, calculate the fictional $60 fee, save the browser draft, and open review. Pause on `status: awaiting_user_confirmation` and the visible note that submission did not occur.

**Narration:**

> The new tool is immediately discoverable in the same session. It prepares the draft through trusted operations and stops exactly where the human boundary begins.

## 2:32–2:47 — Human final approval

**Screen:** Review the vehicle, email, duration, and fee. Click the visible **Confirm & Submit** control, confirm in the dialog, and show `NST-PP-2026-08421` with the persistent fictional-service disclaimer.

**Narration:**

> No agent tool can submit. Only this explicit human confirmation produces the fictional result.

## 2:47–2:58 — Thesis

**Screen:** End on the Manual / Adaptive / Compiled modeled-interaction cards, with the registered tool visible in the rail.

**Narration:**

> Most websites give agents fixed tools. CivicWeave lets people and agents safely grow the interface and the tool surface together.

End before **3:00**.
