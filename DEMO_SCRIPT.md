# WebMCP Firebreak demo script

Target runtime: **2 minutes 45 seconds**. Use a desktop browser at 100% zoom with sound off. Begin from a reset warehouse.

## Before recording

- Run `npm run dev` or open the deployed HTTPS build.
- Click the reset icon and confirm **7 tools live**.
- Connect a gamepad if available; keyboard input is equally reliable.
- Keep the camera in **Overview** until the fleet starts, then switch to **Follow** for a closer shot.
- In a normal browser the badge reads **Browser Sim**. With a native implementation it reads **WebMCP Native**; both use the same tool definitions and handlers.

## 0:00–0:18 — Immediate stakes

**Screen:** Full warehouse, trapped workers, four robots, battery fire, and 90-second clock. Click **Start emergency**.

**Narration:**

> A battery warehouse is burning. Two people are trapped. One operator can drive one robot—but cannot coordinate a whole rescue fleet at once.

## 0:18–0:36 — Make it a game

**Screen:** Select MEDIC-2 with `2`. Drive it with `WASD`, then select SCOUT-1 with `1`. If using a controller, show the stick movement once.

**Narration:**

> This is a playable robot command system, not a mock dashboard. Keyboard, touch, and gamepad commands move the selected robot through the same driver interface used by mission execution.

## 0:36–1:02 — Prompt 1: coordinate four

**Screen:** Click **Ask agent to plan rescue**. Leave the prompt visible:

> Assess WH-01, plan a coordinated rescue, verify safety, and stage the mission tool.

**Narration:**

> WebMCP gives the agent seven typed tools. It inspects the emergency and fleet, maps the hazards, synchronizes four role-specific routes, and checks the exact plan. Notice what it does not have: movement authority.

**Screen:** Let the four colored routes appear. Point to `11/11 safety gates` and `7 tools live`.

## 1:02–1:35 — The human boundary

**Screen:** Show the authorization sheet. Expand **Review compiled mission proof**.

**Narration:**

> The website—not the model—compiled this capability. It is limited to four named robots, these reviewed waypoints, one coordinated strategy, one use, five minutes, and a forbidden collapse zone. Eleven deterministic gates verify revision, geofence, separation, battery, roles, duration, and recovery.

**Screen:** Click **Authorize one mission**. Pause on **8 tools live** and `execute_rescue_mission`.

**Narration:**

> Only this visible human control can register the eighth tool. The agent cannot call an approval tool or invent a robot command.

## 1:35–2:15 — Prompt 2: fleet rescue

**Screen:** Click **Execute approved rescue** while this prompt is visible:

> Execute the approved rescue mission now.

Switch the camera to **Follow** for several seconds, then return to **Overview**.

**Narration:**

> Now the agent can act autonomously inside the reviewed envelope. SCOUT-1 maps the danger. MEDIC-2 extracts one worker. SUPPRESS-3 isolates power and contains the fire. HAUL-4 rescues the second worker and moves the hazardous load. All four routes run together, not as four manual confirmations.

## 2:15–2:38 — Proof and revocation

**Screen:** Hold on **Mission complete**, two workers safe, fire contained, load secured, zero violations, and the green objectives.

**Narration:**

> The receipt proves the physical outcome and final battery for every robot. On success, the one-use capability consumes itself through an AbortController.

**Screen:** Point to **7 tools live** and “One-use tool consumed and unregistered.”

## 2:38–2:45 — Close

**Narration:**

> Firebreak turns WebMCP into shared control: humans set the boundary, agents coordinate beyond human speed, and authority disappears when the job is done.

## Backup if anything interrupts the recording

- Press the reset icon; the complete browser journey takes under one minute at the shipped playback rate.
- If a controller disconnects, continue with `WASD`; the app does not change modes silently.
- If native WebMCP is unavailable, continue in Browser Sim. Do not claim it is native.
- A real ROS/Gazebo bridge is optional and should only be shown if it has been validated separately.
