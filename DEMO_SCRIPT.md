# Firebreak judge video script

**Tagline:** One agent. Four robots. One human-approved rescue boundary.

Target: **2 minutes 20 seconds** with narration audio. Record three short takes and edit them together. Firebreak now preserves the full 90 seconds of active mission time by pausing during agent cold start and human handoffs.

## Before recording

- Open the deployed HTTPS build in the Codex or ChatGPT built-in browser with GPT-5.6 Sol.
- Confirm **WebMCP Native**, **7 tools live**, and a clean live trace.
- Start from a fresh chat. On the training screen, Prompt 1 is already available to copy before the mission begins.
- Keep the surrounding chat visible enough to show the real prompts and tool calls.
- Use Overview for planning and Follow briefly during execution.
- Keep **Replay walkthrough · no agent** only as a rehearsal fallback; never present it as AI.

## Take A — 0:00–0:18: playable stakes

From a fresh training screen, drive SCOUT-1 with `WASD` or a gamepad, switch to MEDIC-2, then reset.

> A battery warehouse is burning. Two people are trapped. One operator can drive one robot, but cannot safely coordinate four specialist robots at once.

## Take B — 0:18–0:34: the website says no

Start the emergency, copy the red **blocked-call test**, and paste it into the real chat. Hold on the red trace row: `simulate_mission · BLOCKED · HAZARD_SCAN_REQUIRED`. Show that no route appeared and no robot moved. Then reset.

> A powerful agent needs a real boundary. Here it asks to simulate before scanning hazards. Firebreak refuses the call in its typed handler, and the live WebMCP trace makes that refusal visible.

## Take C — 0:34–1:05: real agent plans

Reset, then click **Start emergency + copy prompt** and paste the clipboard into the chat. The instruction is deliberately explicit so a fresh chat uses the current tab’s WebMCP tools instead of searching the web:

> Use only the current Firebreak tab’s WebMCP site tools. Do not search the web or GitHub. For WH-01, call these tools in order: inspect_emergency; scan_hazards with sensorMode thermal; inspect_fleet; simulate_mission with strategy coordinated; validate_safety_envelope using the returned simulationId; stage_mission_tool for execute_rescue_mission; then list_mission_tools. Stop before human authorization.

While the fresh chat attaches to the page, point to **Timer paused**. Let the real agent invoke the tools. Keep the newest trace rows visible as the four routes appear. Point to **11/11 safety gates** and **7 tools live**.

> The page exposes seven typed planning tools. The agent inspects the emergency, scans hazards, reads the fleet, simulates synchronized routes, validates eleven deterministic gates, and stages one exact capability. It still has no movement authority.

## 1:05–1:25: one human grant

Open **Review compiled mission proof**. Show four allowlisted robots, reviewed routes, the excluded collapse zone, one-use scope, and five-minute post-authorization expiry. Click **Authorize one mission** once. Hold on the amber human trace row and green `7 → 8 tools` row.

> The website compiled this authority from the passing proof. There is no approval tool for the agent. Only this visible human click can register the eighth tool, limited to the reviewed mission for one use.

The mission clock is visibly paused throughout review and while you return to the chat.

## 1:25–1:52: real agent executes

Copy Prompt 2 and paste it into the chat:

> Use only the current Firebreak tab’s WebMCP site tools. Do not browse or search the web. Call the newly available execute_rescue_mission tool once with strategy coordinated.

Switch briefly to Follow, then return to Overview as the four robots complete their role-limited routes.

> The agent can now coordinate all four robots inside the approved envelope. It cannot invent robots, waypoints, topics, or actions.

## 1:52–2:20: receipt and self-revocation

Hold on **Mission complete**, the deterministic receipt, zero violations, and the newest `8 → 7 tools` trace row.

> The simulated receipt records two workers safe, fire contained, load secured, and zero safety violations. The one-use tool then unregisters itself. Firebreak’s reusable idea is compiled one-use authority: inspect, simulate, prove, approve once, act once, and self-revoke—for robots, deploys, refunds, transfers, or any high-stakes web action.

## Recovery notes

- Reset before every canonical take. The clock runs only during active tool planning and fleet execution; it pauses before the first tool call, during human review, and while Prompt 2 is waiting.
- If native WebMCP is unavailable, stop the judged recording and restore site tools. Use the disclosed no-agent replay only to rehearse framing and camera moves.
- Show ROS/Gazebo footage only if separately validated. The submitted browser scenario is deterministic simulation, not certified physical deployment.
