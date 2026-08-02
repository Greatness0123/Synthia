# Synthia — "Arms Down to 75° at Spawn Is General" Investigation

## Summary

The "arms down to 75°" movement on **every** agent is **not** caused by duplicate code or by motor programs leaking between agents. It is a single hardcoded rest-pose constant — `restArmAngleDeg = 75` — baked into `HumanoidPhysicsBinder.resetToBindPose()`, which every binder re-runs at every spawn/reset. The coordinator's motor programs (`stand_upright.json`, learned programs, etc.) **never contain arm targets**, so the 75° arm pitch is always the binder's own generic rest pose, identical for all agents. There is exactly **one remaining all-agents fan-out** (the `synthia:resetPose` button handler), and the 75° value itself is wrong for this rig: `+1.309 rad` pitch on the upper arm visually raises the arm to **~86° (near T-pose)**, not down at the side.

---

## What "arms down 75°" actually is

### 1. The constant
`src/world/engine/HumanoidPhysicsBinder.ts`
```ts
public restArmAngleDeg: number = 75;   // field declaration
```

### 2. Where it is applied — `resetToBindPose()`
```ts
const armsDownAngle = this.restArmAngleDeg * (Math.PI / 180);   // = 1.308996939 rad

// (a) pre-seeds arm-pitch qpos so the servo doesn't sweep on spawn ("Fix 5"):
const isArmPitch = boneName === 'mixamorigleftarm' || boneName === 'mixamorigrightarm';
qpos[model.jnt_qposadr[jntId]] = isArmPitch ? armsDownAngle : 0;

// (b) sets the per-agent motor targets:
this.currentTargets.set('mixamorigrightarm', { x: armsDownAngle, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigleftarm',  { x: armsDownAngle, y: 0, z: 0, isQuaternion: false });
```

### 3. What it does visually (measured, not guessed)
From the diagnostic capture documented in `project_info__76.md`:
- `ctrl` for both arm-pitch actuators = `1.3089969389957472` — **exactly** `75° × π/180`. The motor holds this constantly.
- Measured visual arm raise = **86.04°** — i.e. arms near-horizontal, **not** down at the side.
- This was constant across 65 samples with zero `synthia:action` events, zero timeline frames, zero spawns, ramp fully elapsed (`546/20`).

**Conclusion: the "arms down" rest pose in this rig is sign/axis-mapped backwards.** `+75°` pitch on `mixamorig*arm` (joint axis `"1 0 0"` in the MJCF) rotates the arm up and out. The reference file `model data/static model motion files/arms down to side.json` shows the true arms-down pose needs the full baked local quaternion (`x: 0.5522, y: -0.0575, z: -0.0861, w: 0.8273` for `mixamorigRightArm`), not a simple `+1.309 rad` pitch.

### 4. Why this is NOT from the motor programs
The motor programs never mention arms:
- `coordinator/programs/primitives/stand_upright.json` — jointTargets only: `pelvis`, `spine`, `left_hip`, `right_hip`. **No arm keys.**
- `src/world/agent/AgentLoop.ts` (client path) passes `motorPrograms: []` anyway (see `cycle()` → `payloadBuilder.build(worldState, agentId, { motorPrograms: [], ... })`).
- Each binder's `currentTargets` is a per-binder `Map` — motor targets **are** isolated per agent. The problem is not isolation of programs; it's that **`resetToBindPose()` wipes `currentTargets` and reseeds the same 75° arm target on every binder**, overwriting whatever per-agent program state existed.

---

## Trigger inventory — every place arms get commanded to 75°

| # | Trigger | File / Location | Scope | Fan-out to all agents? |
|---|---|---|---|---|
| 1 | Initial world build (agent_0) | `useWorld.ts` `build()` → `binder.setMode(worldStore.bodyMode)` → `resetToBindPose()` | agent_0 only | No |
| 2 | Spawn new agent | `useWorld.ts` `spawnAgent()` → `binder.resetPose(spawnPoint)` → `resetToBindPose()` | new agent only | No |
| 3 | **Reset Pose button** | `BodyControls.tsx` → `window.dispatchEvent('synthia:resetPose')` → `useWorld.ts` `handleResetPose` → **`humanoidPhysicsBindersRef.current.forEach(...)` → `binder.resetPose(...)`** | **ALL binders** | **YES — the one remaining fan-out** |
| 4 | `program_sequence: ["stand"/"upright"/"recover"/"reorient"]` | `HumanoidPhysicsBinder.executeProgramSequence()` → `resetToBindPose()` | target binder only | No |
| 5 | bodyMode toggle to `rigid` | `useWorld.ts` bodyMode effect → `binder.setMode(rigid, { resetPose: id === activeId })` | active agent only (already gated — fixed previously) | No |

The evidence from `project_info__75.md` and the regression tests (`multiAgentComposition.test.ts`) confirms fixes already land: the `setMode` fan-out was gated (`resetPose: id === activeId`), the spawn-time grounding re-arm is new-agent-only, stale-ID remapping now fails loudly, and `MotorController.init()` preserves the ctrl ramp. **The `synthia:resetPose` handler (row 3) is the surviving code path that moves every agent's arms at once.**

---

## Why each agent appears to "general-move" at spawn even with separate programs

The visible sequence on every spawn:

1. `loadAndVisualizeBindPose()` renders the GLB bind pose → **arms down** (what the user sees on the fresh model).
2. `resetPose(spawnPoint)` → `resetToBindPose()` immediately:
   - rewrites arm-pitch `qpos` to `+1.309 rad`
   - reseeds `currentTargets` for both arms to `+1.309 rad`
3. `syncVisuals()` + `AvatarSynchronizer` (0.85 slerp/frame) sweep the visual arms from bind-pose-down to the +1.309 rad physics pose over ~0.5 s → visually **~86° raise**.
4. Result: "fresh agent looks correct for a moment, then all agents converge to arms-out with no LLM command."

The "general" appearance across multiple agents: every binder runs the identical `resetToBindPose()` with the identical hardcoded 75°, so all agents converge to the same wrong pose whenever any of triggers 1–4 fires. It is not code duplication — it's a single shared constant applied at multiple lifecycle points.

---

## File map (everything touching this behavior)

| File | Role in the issue |
|---|---|
| `src/world/engine/HumanoidPhysicsBinder.ts` | **Owner of the bug**: `restArmAngleDeg = 75`, `resetToBindPose()` (qpos pre-seed + currentTargets reseed), `executeProgramSequence()` stand→reset, `getUprightPreset()` exposes `arms_down_angle_deg` to the LLM |
| `src/world/hooks/useWorld.ts` | Trigger points: `build()` init, `spawnAgent()` resetPose, `handleResetPose` (the **all-binder fan-out**), bodyMode effect (already gated) |
| `src/components/godmode/BodyControls.tsx` | Reset Pose button → dispatches `synthia:resetPose` (no agentId → all agents) |
| `src/world/engine/MotorController.ts` | `setTargets()` maps the `{x: 1.309}` target to the arm-pitch actuator; holds it forever |
| `src/world/engine/AvatarSynchronizer.ts` | 0.85 slerp per frame turns the physics snap into a visible arm sweep |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Arm joint axis `"1 0 0"` (pitch); shows the head/neck axis-swap workaround for the same class of bind-quaternion frame bug |
| `coordinator/programs/primitives/stand_upright.json` | Proof motor programs never command arms |
| `model data/static model motion files/arms down to side.json` | Reference for the true arms-down local quaternion |
| `src/world/engine/__tests__/multiAgentComposition.test.ts` | Existing regression tests for the previously-fixed fan-outs (mode, grounding, stale IDs, ramp) — none yet covering `resetToBindPose` arm rest target or the `synthia:resetPose` fan-out |

---

## Recommended fix directions (for Act Mode — not performed here)

1. **Gate the Reset Pose button per-agent**: `BodyControls.handleResetPose` should dispatch `synthia:resetPose` with `detail: { agentId: activeAgentId }`, and `useWorld.handleResetPose` should reset only `humanoidPhysicsBindersRef.current.get(agentId)` — mirroring the fix already applied to the bodyMode effect.
2. **Fix the rest-angle mapping**: empirically determine the arm-pitch command that yields arms truly down. Candidates:
   - `target = 0` (pure bind = arms down) → simplest, since pre-seeding qpos to nonzero is what causes the sweep;
   - or `target = -restArmAngleDeg` if the sign is inverted relative to the rig's pitch axis.
   The console experiment from `project_info__76.md` (`b.setMotorTargets({ mixamorigleftarm: 0, mixamorigrightarm: 0 })`) will confirm which.
3. **Reconsider `restArmAngleDeg` exposure**: `getUprightPreset()` sends `arms_down_angle_deg: 75` to the LLM. A model may echo that value back as a joint override, compounding the wrong-pose issue. If 75° is not physically arms-down, it should be corrected at the source.
4. **Add regression tests** to `multiAgentComposition.test.ts`:
   - `resetPose(spawnPoint)` seeds `currentTargets['mixamorig*arm'].x === restArmAngleDeg * π/180` (documents current behavior);
   - `synthia:resetPose` with an agentId in detail only resets that binder.

## Suggested reading order

1. `src/world/engine/HumanoidPhysicsBinder.ts` — `resetToBindPose()` (~line 950), `restArmAngleDeg`, `executeProgramSequence()`, `getUprightPreset()`
2. `src/world/hooks/useWorld.ts` — `handleResetPose`, `spawnAgent()`, `build()`, bodyMode effect
3. `src/components/godmode/BodyControls.tsx` — the DispatchEvent source
4. `project_info__76.md` — the measured evidence (86° raise, exact ctrl = 1.309 rad)
5. `src/world/engine/MJCFHumanoidTemplate.ts` — arm pitch axis + the head/neck axis-swap precedent
