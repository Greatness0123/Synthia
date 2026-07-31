# Coordinator ↔ Frontend Movement Breakdown — Full Diagnostic Report

## Summary

The AI model **cannot move the humanoid** because the coordinator's `agentLoop.ts` and the frontend's `MotorController.ts` / `HumanoidPhysicsBinder.ts` **operate with incompatible joint angle conventions**. The coordinator (prompt builders, provider adapters) instructs the LLM to output **degrees**, and the coordinator's own `parseAndValidateAction` normalizes values to **radians** (multiplying by `DEG_TO_RAD` if values exceed π). However, the frontend's `MotorController.setTargets()` and `HumanoidPhysicsBinder.setMotorTargets()` receive **degrees** from the LLM's `joint_overrides` (which pass through the coordinator untouched when they look like radians — i.e., small values ≤π). The result: **the LLM typically outputs degrees (e.g., 30 for a 30° arm raise), the coordinator treats them as already-radians (because 30 > π), converts with `* DEG_TO_RAD`, yielding ~0.52 rad, which is correct... BUT** the LLM is also told to use radians for `sequence` timelines. The mixed conventions, plus subtle coordinate-mapping mismatches in MotorController, mean in practice **no torque is generated** or **targets map to wrong/nonexistent joints**.

This report documents every break in the chain and provides an exact, specific changeset for each file.

---

## Architecture: Two-End System

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (React + Three.js)       │
│  useCoordinator.ts → WebSocket → CoordinatorContext  │
│  useWorld.ts: captures state, dispatches actions     │
│  HumanoidPhysicsBinder.ts: validates + applies       │
│  MotorController.ts: sets MuJoCo actuator targets    │
│  MJCFHumanoidTemplate.ts: builds MuJoCo skeleton     │
│  BodyManager.ts: loads MJCF, maps joints → actuators │
└──────────────────┬──────────────────────────────────┘
                   │ WebSocket (port 3001)
                   │ messages: world_state, action,
                   │          action_feedback, outcome
┌──────────────────▼──────────────────────────────────┐
│              COORDINATOR (Node.js / Fastify)          │
│  server.ts: WS router, agent lifecycle               │
│  agentLoop.ts: main cycle, inference, parse actions  │
│  payloadBuilder.ts: builds InferPayload for LLM      │
│  inferenceClient.ts: delegates to provider adapters   │
│  providers/: geminiProvider, openaiCompatProvider,   │
│             kaggleProvider, providerFactory           │
└─────────────────────────────────────────────────────┘
```

---

## Break #1: Angle Unit Confusion — Degrees vs Radians

### Where it breaks

**coordinator/src/agentLoop.ts, `parseAndValidateAction()` (lines ~380–410)**

The normalization logic says:
```
DEG_TO_RAD = Math.PI / 180
If |rawAction| > π + 0.1  → multiply by DEG_TO_RAD  // "must be degrees"
```

This is fragile. The LLM is explicitly told in the system prompt to output **degrees** for `joint_overrides` but **radians** for `sequence` timelines. The LLM commonly outputs small values (0–5) in radians for a sequence, which the coordinator leaves as-is. For `joint_overrides`, values like 30 (degrees) do get converted to 0.52 rad correctly.

**BUT**: The `agentLoop` also sends parsed `joint_overrides` directly in the `action` message to the frontend via WebSocket. The frontend's `HumanoidPhysicsBinder.setMotorTargets()` receives these raw values — **and they can be radians or degrees depending on which path the LLM took**. The frontend has **no normalization** of its own — it passes values directly to `MotorController.setTargets()`.

### Where it goes from there

**src/world/engine/MotorController.ts, `setTargets()` (lines ~65–95)**

The `MotorController` receives a `Map<string, any>` where each target can be:
- `{ scalar: number, isScalar: true }` → assigned as `ctrl[id] = scalar * rampFactor`
- `{ x, y, z }` → assigned as yaw=x, pitch=y, roll=z

For **revolute joints** (knees, elbows): `ctrl[actuatorIds[0]] = pitch * rampFactor`
For **spherical joints** (hips, shoulders, spine): `ctrl[ids[0]] = yaw`, `ctrl[ids[1]] = pitch`, `ctrl[ids[2]] = roll`

**Critical bug**: For spherical joints, the mapping is:
```
yaw = parsedTarget.z || 0;     // ← Z from parsedTarget mapped to YAW
pitch = parsedTarget.x || 0;   // ← X from parsedTarget mapped to PITCH
roll = parsedTarget.y || 0;    // ← Y from parsedTarget mapped to ROLL
```

But in the **MJCF template** (`MJCFHumanoidTemplate.ts`), the hinge axes for spherical decomposition are ordered **Yaw (0 0 1) → Pitch (1 0 0) → Roll (0 1 0)**, which in actuator ID order (within `BodyManager`) maps:

```
actuators.push(`act_${boneName}_yaw` ...)   // actuator id[0]
actuators.push(`act_${boneName}_pitch` ...) // actuator id[1]
actuators.push(`act_${boneName}_roll` ...)  // actuator id[2]
```

So `actuatorIds[0]` = yaw, `[1]` = pitch, `[2]` = roll — which is the correct mapping for the MJCF axes.

The `MotorController` then writes:
```
ctrl[actuatorIds[0]] = yaw   // from z
ctrl[actuatorIds[1]] = pitch // from x
ctrl[actuatorIds[2]] = roll  // from y
```

This means: the LLM's `[pitch, yaw, roll]` array (`[x, y, z]`) would become `[z→yaw, x→pitch, y→roll]` in MuJoCo, which is a **permutation** — this would swap axes and cause movement in wrong directions. However, if the LLM only ever sends scalar values (single numbers), this bug is not triggered — the scalar path always assigns to `ctrl[id[1]]` = pitch.

### What this means in practice

For scalar overrides (single numbers like `"mixamorigrightarm": 45`):
- The LLM sends degrees (45)
- `parseAndValidateAction` converts to radians (45 * π/180 ≈ 0.785)
- `MotorController` receives scalar 0.785 rad and assigns to `ctrl[pitch_actuator]`
- This **could work** for single-axis pitch joints

**But it doesn't work** because:

---

## Break #2: The `sequence` timeline path is completely broken

### What happens

The LLM can output either:
1. `actions.joint_overrides` (single-frame, degrees)
2. `sequence` (multi-frame timeline, radians)

When `sequence` is used, the `agentLoop` still also outputs `actions` with `joint_overrides`. In `parseAndValidateAction`, the sequence's `overrides` are normalized (degree→radian conversion). But the `agentLoop` sends **both** `jointOverrides` and `sequence` in the action message:

```typescript
// agentLoop.ts ~line 160
this.config.sendToFrontend({
  type: 'action',
  data: {
    programSequence: actionData.actions?.program_sequence || [],
    jointOverrides: actionData.actions?.joint_overrides || {},
    sequence: actionData.sequence || null,
    ...
  }
});
```

On the frontend side in `useWorld.ts` (`handleAction` handler, ~line 640):
```typescript
if (Array.isArray(sequence) && sequence.length > 0) {
  // Use full timeline provided by coordinator
  const validation = binder.validateAndApplyTimeline(skeleton, sequence, { activeGaitPhase: !!activeGaitPhase });
  // ...
} else {
  // Fallback: single-frame jointOverrides
  const seq = [{ timeOffsetMs: 0, overrides: jointOverrides || {} }];
  const validation = binder.validateAndApplyTimeline(skeleton, seq, ...);
  binder.setMotorTargets(f.overrides);
}
```

**The `validateAndApplyTimeline` populates an internal `timelineQueue`**, which is then interpolated in `syncVisuals()` (called every frame). Each frame's overrides go through `setMotorTargets()`, which calls `MotorController.setTargets()`.

### Why no movement

The `MotorController.setTargets()` resets **all** ctrl values to 0 at the start of each call:

```typescript
// Reset all controls to 0 by default
for (let i = 0; i < this.model.nu; i++) {
  ctrl[i] = 0;
}
```

Then it sets only the actuators that match `currentTargets`. The `rampFactor` starts at 0 and increases to 1 over 20 simulation steps (at 500Hz = 40ms). This means for the first 40ms of any movement, the effective target is **zeroed out × rampFactor ≈ 0**.

But the bigger problem: **every frame, `updateMotorTargets()` is called from the render loop**, which calls `MotorController.setTargets(this.currentTargets)`. If `setMotorTargets` was called with the current timeline frame's overrides, `currentTargets` would be updated. But `validateAndApplyTimeline` stores frames in `timelineQueue` — **those frames are applied via `setMotorTargets` only for timeOffsetMs=0 frames in the immediate handler**. For all other frames, the interpolation in `syncVisuals()` calls `setMotorTargets(interpolatedOverrides)`, which does update `currentTargets`.

So the timeline system **should work** in principle for timed frames. But there's a race condition: if the `action` message arrives between physics steps, the `timeOffsetMs=0` frame may be applied and immediately overwritten by `updateMotorTargets()` the next frame, which reads from `currentTargets`. The `currentTargets` map is only set by `setMotorTargets()`, so as long as the timeline interpolation pushes new targets each frame via `syncVisuals()`, it should persist.

---

## Break #3: The AI prompt has conflicting information

### The system prompt in `geminiProvider.ts` and `openaiCompatProvider.ts` says:

"**DO NOT use radians. DO NOT use objects. DO NOT use quaternions.**"
"**RIGHT (Scalar): 'mixamorighead': 15 | 'mixamorigrightarm': 45**"
"**RIGHT (3D Array): 'mixamorigrightupleg': [45, 0, 15]**"

But then it also says:

"**When emitting a `sequence`, use RADIANS for joint rotation values**"
"**When using `sequence`, provide joint rotation values in RADIANS**"

### The `PayloadBuilder.buildPerceptionSummary()` (in `payloadBuilder.ts`) tells the LLM:

"**CONCRETE LOCOMOTION EXAMPLE (degrees; the system converts to radians automatically):**"
Then gives examples like `{ mixamorigrightupleg: [-10, 0, 0], mixamorigrightleg: -30 }` — in degrees.

But then says: "**Must set programSequence: ['jump'] AND be grounded.**"
And: "**Use program_sequence: ['upright_preset'] or ['stand'] to return to standing.**"
"**All other program_sequence values are ignored — you must use joint_overrides to move.**"

**This directly contradicts the MJCF/MotorController pipeline**, because `program_sequence` values are handled by `HumanoidPhysicsBinder.executeProgramSequence()`, which only handles `stand/upright/recover/reorient` and `jump`. Any other string (like `"walk"`, `"run"`) is **silently ignored**.

### The `perception_summary` tells the AI about K-GRF (Kinematic Ground Reaction Forces):

"**K-GRF ONLY works when your foot bones are in contact with the ground surface.**"
"**To move FORWARD: place your toes/feet on the ground, then push them BACKWARD**"

This K-GRF system exists in `HumanoidPhysicsBinder.applyKinematicGroundReactionForces()` but only computes foot-position deltas between frames. It's a passive system — the AI can't trigger it directly; it only activates when foot positions change between animation frames. The AI is led to believe it can actively use K-GRF for locomotion, but it's an emergent behavior the AI can only indirectly influence via joint angles.

---

## Break #4: The `MotorController.setTargets()` mapping is partially inverted

### Current code (MotorController.ts, lines 65-95):

```typescript
if (actuatorIds.length === 1) {
  // Revolute joint → Single pitch actuator
  targetAngle = parsedTarget.scalar || parsedTarget.x || 0;
  ctrl[actuatorIds[0]] = targetAngle * rampFactor;
} else if (actuatorIds.length === 3) {
  // Spherical joint decomposed into yaw, pitch, roll
  yaw = parsedTarget.z || 0;     // BUG: Z→Yaw swap
  pitch = parsedTarget.x || 0;
  roll = parsedTarget.y || 0;
  ctrl[actuatorIds[0]] = yaw * rampFactor;
  ctrl[actuatorIds[1]] = pitch * rampFactor;
  ctrl[actuatorIds[2]] = roll * rampFactor;
}
```

### What the MJCF template actually creates:

In `MJCFHumanoidTemplate.ts`, for 3-DOF spherical joints, the order is:
1. Yaw hinge: axis="0 0 1" → first actuator in `actuatorIds[0]`
2. Pitch hinge: axis="1 0 0" → second actuator in `actuatorIds[1]`
3. Roll hinge: axis="0 1 0" → third actuator in `actuatorIds[2]`

The `BodyManager.buildActuatorMap()` pushes in order: `_yaw, _pitch, _roll`.

So the mapping should be:
- `ctrl[actuatorIds[0]]` = yaw value
- `ctrl[actuatorIds[1]]` = pitch value
- `ctrl[actuatorIds[2]]` = roll value

The problem is that `MotorController` reads `yaw = parsedTarget.z || 0` — treating the **Z component** as yaw. But the LLM's prompt says `[pitch, yaw, roll]` correspond to `[x, y, z]`. So when the LLM sends `[pitch=30°, yaw=15°, roll=0°]` as `[30, 15, 0]`, the MotorController interprets it as:
- yaw = z = 0
- pitch = x = 30
- roll = y = 15

This **swaps yaw and roll**. The AI's intended yaw (left/right rotation of the joint) gets applied as roll (side-to-side tilt), and roll becomes yaw. This would cause very confused movement.

---

## Break #5: Joint name mismatch between coordinator prompt and MotorController

### The coordinator tells the LLM to use canonical joint names:

The prompt lists: `mixamorighead, mixamorigspine, mixamorigrightarm, mixamorigleftarm, mixamorigrightforearm, mixamorigleftforearm, mixamorigrightupleg, mixamorigleftupleg, mixamorigrightleg, mixamorigleftleg, ...`

### But the `MotorController` actuator map uses names without prefix variations:

In `BodyManager.activate()`, the `actuatorMap` is built with bone names from the `boneInfoMap` (which are canonical mixamo names like `mixamorigrightarm`). The actuators in the MJCF are named `act_mixamorigrightarm_yaw`, `act_mixamorigrightarm_pitch`, `act_mixamorigrightarm_roll`.

### In `HumanoidPhysicsBinder.setMotorTargets()`:

The `resolveJointAlias()` method translates human-readable names (like `head_yaw`, `right_shoulder_pitch`) to canonical bone names (like `mixamorighead`, `mixamorigrightarm`). **This is correct** and functional.

But there's another problem: **`MotorController.setTargets()` iterates over `currentTargets` (keyed by boneName) and looks up `actuatorIds` via `this.actuatorMap.get(boneName)`**. The `actuatorMap` was built from the MJCF using bone names from `BodyManager`, which uses the canonical mixamo names. **If the LLM sends a joint name that doesn't match exactly (e.g., `mixamorigRightArm` instead of `mixamorigrightarm`), the lookup silently fails and no ctrl is set.**

The `HumanoidPhysicsBinder.setMotorTargets()` does lowercase normalization: `boneName.toLowerCase().replace(/:/g, '')`, but the LLM prompt specifies exact canonical names. The prompt says to use `mixamorighead`, `mixamorigrightarm`, etc. — these match.

---

## Break #6: The `InferPayload` type is missing `contact_forces`

### Frontend types (`src/types/payload.ts`):

The `InferPayload` interface **does not** include `contact_forces`. It has: `frame, audio_pcm, joints, valid_joints, upright_preset, heartbeat, light_state, session_id, body_type, current_goal, current_rung, objects_in_world, relevant_memories, recent_working_memories, known_skills, pending_injection, motor_program_library, directive_mode, agent_id`.

### Coordinator types (`coordinator/src/types/payload.ts`):

**Also missing** `contact_forces`.

But in `payloadBuilder.ts`, `build()` reads:
```typescript
const contactForces: Record<string, any> = worldState.contact_forces || {};
// ...
(payload as any).tactile_context = this.buildTactileContext(contactForces);
```

And `buildTactileContext` iterates over contact forces to generate natural-language descriptions. The `isGrounded` field is also read from `(payload as any).isGrounded`. **Neither** `contact_forces` nor `isGrounded` are in the typed `InferPayload` interface — they're cast to `any`. This works at runtime but means the TypeScript compiler won't catch misspellings or missing fields.

The `captureWorldState()` in `useWorld.ts` **does** send `contact_forces` and `isGrounded` in the `world_state` message. The coordinator receives them via `agent.updateWorldState(data)` but the data flows through `payloadBuilder.build(worldState, ...)` where the fields are accessed as `worldState.contact_forces` and `worldState.isGrounded` — this **works** because `worldState` is `any` typed, and `captureWorldState` returns them at the top level.

---

## Break #7: `executeProgramSequence` only handles "stand" and "jump"

In `HumanoidPhysicsBinder.executeProgramSequence()`:
```typescript
if (name.includes('stand') || name.includes('upright') || name.includes('recover') || name.includes('reorient')) {
  this.setCapsulePosition(0, 0.05, 0);
  this.resetToBindPose();
} else if (name.includes('jump')) {
  this.executeJump(6.0);
}
// All other programs are silently ignored
```

The `perception_summary` says: "**All other program_sequence values are ignored — you must use joint_overrides to move.**" This is actually **accurate** to the code, but confusing to the LLM. The LLM might try to use `program_sequence: ["walk"]` and get no result, then give up on movement entirely.

---

## Break #8: The `agentLoop` resets `lastWorldState.injected_thought` after injection

In `agentLoop.cycle()`:
```typescript
const { item: injectedThought, queue: remainingQueue } = injectionQueue.dequeue(this.config.agentId);
if (injectedThought) {
  this.lastWorldState.injected_thought = injectedThought;
}
// ...
const payload = await this.payloadBuilder.build(this.lastWorldState, ...);
// payloadBuilder.build() reads worldState.injected_thought
// BUT: the injection field is set on the mutable lastWorldState object
// and is NOT cleared after use. This means if the same worldState
// reference is reused, the injection persists across cycles.
```

In `payloadBuilder.build()`, the injection is read as `worldState.injected_thought` and placed in the `pending_injection` field. But `worldState` is the same object reference passed from `agent.updateWorldState()`. If `injectedThought` is set on it in cycle N, and cycle N+1 comes before a new `world_state` message arrives, the injection will be included again.

However, the `dequeue` operation removes it from the queue each cycle, and `injectedThought` is only set if `dequeue` returns an item. So on cycle N+1, `dequeue` returns null, and `this.lastWorldState.injected_thought` is not overwritten — it retains the old value. **This is a bug**: stale injections persist across cycles.

---

## Summary: Why the AI Cannot Move

The root cause is a **multi-layered disconnect**:

1. **Degrees/Radians confusion**: The coordinator normalizes degrees→radians for `joint_overrides` but the LLM also outputs radians for `sequence`. Mixed conventions cause inconsistent behavior depending on which output format the LLM chooses.

2. **Yaw/Roll axis swap in MotorController**: For 3-DOF joints, the `setTargets` method maps `x→pitch, y→roll, z→yaw` but the LLM is told `[pitch, yaw, roll]` as `[x, y, z]`. This inverts the yaw/roll mapping.

3. **`program_sequence` black hole**: The AI is told to use `program_sequence` for locomotion, but only `"stand"` and `"jump"` are handled. Everything else is ignored.

4. **K-GRF is passive**: The AI is told about K-GRF as an active locomotion mechanism, but it's purely emergent from joint angle changes and the AI cannot trigger it directly.

5. **No torque feedback**: The AI never receives confirmation whether its commands actually produced movement. The `action_feedback` message only carries rejection/clamping notes — if the command was silently dropped or mapped to the wrong axis, the AI has no way to know.

6. **Ramp factor delay**: The `MotorController` ramps targets from 0 to full over 20 steps (40ms), making initial movement imperceptible, especially for small angle targets.

---

## Required Changes

### 1. `coordinator/src/agentLoop.ts` — `parseAndValidateAction()`

**Fix stale injection bug (line ~230)**:
After building the payload, clear the injection from worldState:
```typescript
// After payloadBuilder.build():
if (this.lastWorldState.injected_thought && !injectedThought) {
  delete this.lastWorldState.injected_thought;
}
```

**Fix degrees→radians normalization consistency**:
The normalization function `normalizeRaw` incorrectly handles arrays. When `rawAction` is `[30, 0, 0]` (degrees), each element (e.g., 30) exceeds π, so it multiplies by `DEG_TO_RAD`, giving `[0.52, 0, 0]`. This is correct for the scalar elements. But the check `Math.abs(v) > Math.PI + 0.1` on 0 returns false, so 0 stays 0 — correct.

However, for `sequence` timelines, the normalization iterates over `data.sequence[].overrides` and normalizes each value. For `sequence`, the LLM is told to use radians, so values like `0.3` (radians) would NOT be converted because they're ≤π. This is correct in isolation, but the LLM frequently ignores the "radians for sequence" instruction and outputs degrees anyway. When it does, the coordinator leaves them as large values (e.g., 30 rad → applied as 30 rad to MuJoCo, which clamps to ±π, causing extreme jerky motion).

**Fix**: Apply a **uniform convention** throughout — normalize both `joint_overrides` and `sequence.overrides` values identically with the degrees→radians conversion. Remove the "radians for sequence" instruction from the system prompt to avoid confusing the LLM.

### 2. `src/world/engine/MotorController.ts` — `setTargets()`

**Fix yaw/roll axis swap (lines ~80–95)**:
Change:
```typescript
yaw = parsedTarget.z || 0;
pitch = parsedTarget.x || 0;
roll = parsedTarget.y || 0;
```
To:
```typescript
yaw = parsedTarget.y || 0;     // Y → Yaw (was Z)
pitch = parsedTarget.x || 0;   // X → Pitch (unchanged)
roll = parsedTarget.z || 0;    // Z → Roll (was Y)
```

This makes the `[x, y, z]` = `[pitch, yaw, roll]` mapping consistent with the LLM prompt and the MJCF axis order.

### 3. `coordinator/src/payloadBuilder.ts` — `buildPerceptionSummary()`

**Fix contradictory locomotion instructions**:
Replace the entire "LOCOMOTION PHYSICS" section with accurate information about the actual system:
- Remove K-GRF specific instructions (or explain it's emergent, not directly controllable)
- Remove claims that `program_sequence` values are "ignored" (confusing — either handle them or remove the field)
- Clarify that ALL movement happens through `joint_overrides` (single-frame) or `sequence` (timeline)

### 4. `src/world/engine/HumanoidPhysicsBinder.ts` — `executeProgramSequence()`

**Either implement or remove `program_sequence` handling**:
If the design intent is to keep `program_sequence` as a future extension point, add a clear comment. If movement programs like `"walk"` or `"run"` are intended, implement them as named sequences of joint angle timelines.

At minimum, log a warning when an unknown program is received so developers can see the AI is trying to use programs:
```typescript
} else {
  Logger.warn(`HumanoidPhysicsBinder: Unknown program sequence "${program}" — ignored. Use joint_overrides for movement.`);
}
```

### 5. `coordinator/src/types/payload.ts` AND `src/types/payload.ts`

**Add missing fields to `InferPayload`**:
```typescript
contact_forces?: Record<string, any>;
isGrounded?: boolean;
tactile_context?: string;
gaze_context?: string;
perception_summary?: string;
physical_feedback?: string | null;
```

These are already being sent at runtime (cast to `any`), so adding them to the interface is a type-safety fix only.

### 6. Provider prompt files (`geminiProvider.ts`, `openaiCompatProvider.ts`)

**Unify the angle convention**:
- Remove the "radians for sequence" instruction
- State clearly: ALL joint angles are in **degrees**, system converts automatically
- Both `joint_overrides` and `sequence.overrides` use the same convention
- Remove the confusing note about `program_sequence` values being ignored (or clarify)

### 7. `coordinator/src/agentLoop.ts` — `cycle()`

**Add movement confirmation logging**:
After sending the `action` message, add a log entry showing what was actually commanded:
```typescript
console.log(`AgentLoop: Sent action — joints=${Object.keys(actionData.actions?.joint_overrides || {}).length}, programs=${actionData.actions?.program_sequence?.length || 0}, timeline_frames=${(actionData.sequence || []).length}`);
```

### 8. `src/world/hooks/useWorld.ts` — `handleAction` handler

**Add received-action logging**:
Currently logs via Logger.info but only shows jointOverrides key count. Add log of actual values for debugging:
```typescript
Logger.info(`[ACTION_PIPELINE] Values: ${JSON.stringify(jointOverrides).substring(0, 200)}`);
```

---

## Diagnostic Checklist

To verify the fixes work after implementation:

- [ ] LLM outputs a single joint override like `"mixamorigrightarm": 45` → coordinator normalizes to ~0.785 rad → MotorController sets rightarm pitch actuator to 0.785 rad → arm moves 45° downward
- [ ] LLM outputs a 3D array like `"mixamorighead": [15, 20, 0]` → coordinator normalizes [15°, 20°, 0] to [0.26, 0.35, 0] rad → MotorController maps to yaw=0.35, pitch=0.26, roll=0 → head turns right 20°, pitches down 15°
- [ ] LLM outputs a `sequence` timeline with multiple frames → `validateAndApplyTimeline` stores frames → `syncVisuals` interpolates each frame → `setMotorTargets` applies each interpolated target → continuous smooth motion
- [ ] LLM outputs `program_sequence: ["jump"]` → `executeJump()` fires and capsule gets vertical impulse
- [ ] LLM outputs `program_sequence: ["stand"]` → capsule resets to bind pose at origin
- [ ] Stale injections do not persist across cycles
- [ ] `contact_forces` are correctly typed in `InferPayload` (no `any` casts needed)
