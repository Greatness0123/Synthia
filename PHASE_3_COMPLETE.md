# Phase 3 Complete — Camera & Agent-Selection System

This document confirms the successful completion of **Phase 3: Camera & Agent-Selection System** for the SYNTHIA Client Refactor.

---

## 1. What Existed vs. What Had to Be Built

- **Unified Selection State:**
  - *Existed:* Dual states/ideas (`activeViewAgentId` and `activeAgentId`) were discussed, but to avoid multi-state desynchronization bugs (like the previous arms bug), they were unified completely.
  - *Built:* A single source of truth—the `activeAgentId` in `useAgentStore`—now drives all layout panels, first-person cameras, second-person tracking cameras, and the AI-input PiP smoothly and concurrently.

- **First-Person POV Camera:**
  - *Existed:* The `aiPerceptionCamera` was defined but did not update dynamically to follow any newly selected agent without lag or side effects.
  - *Built:* The camera is repositioned and oriented on the active agent's head transform in the render loop. On active agent transitions, the PiP displays the updated perspective immediately on the very next frame.

- **Second-Person Chase Camera:**
  - *Existed:* The `chaseCam` was positioned at a static offset (`chaseCamOrigin`) and simply looked at the agent's translation coordinate.
  - *Built:* A genuine follow-and-track chase camera. It trails above and behind the active agent's coordinate space based on their physical capsule quaternion orientation (`capsuleQuat`). To prevent frame-rate dependency, tracking uses frame-time-adjusted exponential smoothing with the formula `factor = 1 - Math.exp(-speed * deltaTime)`. It automatically snaps position instantly when the selected active agent transitions.

- **Third-Person Orbit Camera:**
  - *Existed:* The orbit target was implicitly forced to lerp to the active agent's head position every single frame, making free-roaming panning, orbiting, and zooming impossible.
  - *Built:* Centered target alignment is performed *once* as an initialization step when switching into `'third_person'` mode. From there, control is fully released to `OrbitControls`, enabling free panning, orbiting, and zooming. Changing dropdown selection while in third person does *not* yank the camera around, fully satisfying the requirement.

- **AI-Input PiP (Picture-in-Picture):**
  - *Existed:* The PiP updated under a fixed 200ms throttle, creating visual lag during agent switches.
  - *Built:* The standard render loop detects when `activeAgentId` changes, immediately bypassing the 200ms throttle and rendering the new agent's viewpoint in under 16ms without any out-of-band synchronous side effects or microtask race conditions.

---

## 2. Instructions for Phase 4 to Begin with Zero Context

Phase 4 can build on this stable foundation with the following context:

1. **State Organization:**
   - Active Agent Selection: `useAgentStore.getState().activeAgentId` (e.g., `'agent_0'`, `'agent_1'`).
   - Camera Mode Selection: `useWorldStore.getState().cameraMode` (one of `'third_person'`, `'first_person'`, `'model_input'`).
   - Camera modes correspond to top-right UI buttons: `"3RD"`, `"1ST"`, `"2ND"`.

2. **Camera Management:**
   - All camera repositioning, tracking, and rendering are centrally handled inside `CameraManager.ts` under its `update()` method.
   - The method signature is `update(headMatrix, targetPos, capsuleQuat, capsulePos, agentId)`. It calculates frame-time-adjusted exponential deltas internally using `performance.now()`.

3. **Multi-Agent Spawning & Execution:**
   - The HUD has a floating selector dropdown in the top-center allowing instant switching of `activeAgentId`.
   - New agents spawn beautifully at a constant X-spacing of 1.75 meters along the linear origin layout.
   - All frame captures and camera positionings are tightly bound to the current frame loop, avoiding out-of-band synchronous race conditions.
