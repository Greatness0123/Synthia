# Synthia — "Every Spawned Agent Adds 75° to the Preexisting Models' Arms" (Verified Alignment)

## Summary

The user's symptom, stated precisely: **every time a new agent is spawned, the arms of ALL previously-spawned agents move by ~75° (from arms-down at side toward arms-out), and this repeats with each additional spawn.** The 75° is not a coincidence — it is exactly `restArmAngleDeg = 75` → `1.308996939 rad`, the single hardcoded rest-pose constant in `HumanoidPhysicsBinder`. Every mechanism that can move an old agent's arms during a spawn ultimately re-asserts this same value. The "adding" feels cumulative because each spawn re-runs the exact same 0°→75° arm sweep on every pre-existing binder: arms visually drop to the bind pose (0°) during the world rebuild, then get re-commanded back to 75° when the rebuild finishes. So each spawn **re-adds** the same 75° displacement to every old model's arms.

---

## Why it is exactly 75° — the trail of a single constant

Every path below ends at the same source:

| Location | Code | What it does |
|---|---|---|
| `src/world/engine/HumanoidPhysicsBinder.ts` | `public restArmAngleDeg: number = 75;` | The one and only source of the 75 |
| `resetToBindPose()` | `const armsDownAngle = this.restArmAngleDeg * (Math.PI/180);` → `1.308996939` | |
| `resetToBindPose()` (qpos pre-seed, "Fix 5") | `qpos[jnt_qposadr] = isArmPitch ? armsDownAngle : 0;` for `mixamorigleftarm`/`mixamorigrightarm` | Rewrites old agents' arm-pitch qpos to 1.309 when it runs |
| `resetToBindPose()` (targets) | `currentTargets.set('mixamorigleftarm', {x: armsDownAngle, ...})` (both arms) | Reseeds per-agent motor targets to 1.309 |
| `MotorController.setTargets()` | `ctrl[actuatorIds[1]] = pitch * rampFactor;` (pitch = target.x = 1.309) | Position-servo command holding arms at 1.309 |
| `getUprightPreset()` | `arms_down_angle_deg: this.restArmAngleDeg` | Even advertises 75 to the LLM |

The measured diagnostic (documented in `project_info__76.md`) confirms: settled agents hold arm-pitch `ctrl = 1.3089969389957472` — exactly 75°, with visual raise 86°. Any code that re-runs `resetToBindPose()` on an old binder, or any frame that reads bind-pose qpos (0 rad) instead of the commanded 1.309, produces a visible ~75° arm motion.

---

## The spawn-time sequence that "re-adds" 75° to EVERY old agent

`src/world/hooks/useWorld.ts` → `spawnAgent()` (the `+ Spawn Agent` button → `window.synthia.spawnAgent()`):

```
 1. new HumanoidPhysicsBinder(...)                                 // new agent
 2. await binder.loadAndVisualizeBindPose(probePoint)              // GLB bind pose (arms DOWN)
 3. binder.ensureCapsuleGeometry(); binder.repositionModel(...)
 4. humanoidPhysicsBindersRef.current.set('agent_N', binder)
 5. physicsEngine.setMutating(true); setReady(false)
 6. capturedState = StateRehydrator.capture(physicsEngine, existingAgentIds, ...)
 7. baseXml = generateCombinedMCF()                                // bakes ALL agents
 8. physicsEngine.loadMJCFModel(baseXml)   ☠ // DELETES the one shared MjModel/MjData
 9. physicsEngine.setReady(true)           ☠ // per-frame loop can resume NOW
10. for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
      bm.remapIdsAgainstLoadedWorld(...)
      activeBinder.initMotorController()
      if (id === agentId) {
        await createJointsWithZeroMotors()      ☠ // await → rAF can fire mid-rebuild
        await activateMotorsWithStiffnessAndDamping(80, 10)  ☠ // await
        deactivateMultiBody()                   ☠ // clears AvatarSynchronizer.prevWorldQuat
        if (useMultiBodyPD) await activateMultiBody()         ☠ // await
        setMode(bodyMode) → resetToBindPose()   // NEW agent arms → 1.309
      } else {
        activeBinder.deactivateMultiBody()      ☠ // OLD agents: synchronizer CLEARED
        if (useMultiBodyPD) await activeBinder.activateMultiBody()  ☠ // await
      }
    }
11. StateRehydrator.restore(physicsEngine, capturedState, ...)    // old agents' qpos/qvel/ctrl
12. new binder: setCapsulePosition(spawnPoint); resetPose(spawnPoint) → resetToBindPose()
13. physicsEngine.setMutating(false)
```

### The per-frame loop that shows the 75° on old agents (NO mutating guard)

```ts
// onFrame callback in useWorld.ts:
for (const [id, binder] of humanoidPhysicsBindersRef.current.entries()) {
  binder.updateMotorTargets();   // MotorController.setTargets + applyCapsuleBalance
  binder.syncVisuals();          // BodyProxy reads data.qpos/data.xquat — the interleave reads
}
```

`WorldEngine.start()` runs `onFrame` whenever `physicsEngine.isReady === true`. Because `setReady(true)` happens at step 9, **before** any of the `await`s in step 10, a `requestAnimationFrame` can fire while old agents' `data.qpos` is still all-zero (fresh MJCF default = bind pose = arms at 0 rad). `syncVisuals()` then pushes the bind pose (arms down) to the visuals — and because `deactivateMultiBody()` cleared the `AvatarSynchronizer`, the slerp buffer is empty and this is a **hard set**.

When step 11 (`StateRehydrator.restore`) later re-writes the captured qpos — which includes the old agents' arm-pitch qpos of 1.309 — the next `syncVisuals()` hard-sets arms back to 75°. **Net effect, per spawn, per old agent: arms visibly swept 0° → 75°.**

This is the exact "75° is added" feeling: the rebuild momentarily shows the bind pose (arms down, 0°), then re-asserts the 75° rest target, so a fresh ~75° arm raise appears on every pre-existing model with every spawn.

---

## Ranked mechanisms — all present in current code, all converge on 75°

### 1. Interleave frame: qpos=0 bind pose vs. restore to 1.309 (the 0→75 sweep — PRIMARY)
- `setReady(true)` (step 9) precedes the remap loop (step 10); the loop contains 3–4 `await`s (`createJointsWithZeroMotors`, `activateMotorsWithStiffnessAndDamping`, `activateMultiBody`).
- Each `await` yields a `rAF` where `onFrame` runs `syncVisuals()` on old binders reading **qpos=0** (bind, arms down).
- `StateRehydrator.restore` runs **after** the loop, restoring old agents' arm qpos to 1.309 → next frame hard-sets arms to 75°.
- **Result: visible ~75° arm motion on every old agent, once per spawn.** This is the "75° added" signature.

### 2. AvatarSynchronizer cleared on every old binder at every spawn → hard set, no slerp, motion fully visible
- `HumanoidPhysicsBinder.deactivateMultiBody()` → `this.avatarSynchronizer.clear()`.
- `AvatarSynchronizer.synchronize()` with no `prevWorldQuat` does `smoothedQuat.copy(rawWorldQuat)` — no 0.85 slerp, so a 0↔75 qpos discrepancy appears as an **instant arm snap** instead of being hidden.
- This is what turns mechanism #1's frame-level discrepancy into a visible arm movement.

### 3. `currentTargets` (the per-binder JS Map) survives the reload but the world does not
- `currentTargets` is NOT cleared by `loadMJCFModel` — old binders keep their live targets (arms = 1.309 if `resetToBindPose` ever ran on them, which it does for agent_0 at init).
- After reload, `updateMotorTargets()` re-asserts those targets via position servos; combined with the qpos=0 interleave, the arms' servo error is momentarily 1.309 rad → large corrective motion.
- This is the only "memory" that carries the 75° across a spawn for old agents.

### 4. `initMotorController()` resets per-binder gain/limp state on every old binder
- `MotorController.init()` re-reads `baseGains` from the fresh model and resets `globalStiffnessScale = 1.0`, `limpModeActive = false`.
- If stiffness/limp were customized, a spawn silently changes servo gains → arms (kp=200, the lowest gains in `getMuJoCoBoneGains`) re-settle visibly. Latent, but real.

### 5. Stale `worldPosition` baked into the combined MJCF
- `MJCFHumanoidTemplate.buildBodyTreeXML()` uses `boneInfo.worldPosition` (bind-pose snapshot, never refreshed during movement) with live `bone.getWorldQuaternion()`.
- After reload + restore, baked joint centers are stale even though orientations are exact → arm-length/position mismatch visible on the cleared-synchronizer first frame.

### 6. Numeric-ID cross-writes (the historical "connection")
- All agents share one `MjData`; `setTargets()` zeroes "our" actuators by numeric ID, `applyCapsuleBalance()` writes `xfrc_applied[capsuleBodyId*6+3..5]`.
- Validated against `model.nbody/nu` only when `BodyManager.remapIdsAgainstLoadedWorld` was invoked for that binder — the loop does remap all binders before any physics write, so this is latent today; it becomes live when the combined world's body order diverges (custom meshes, env slots, agent reorder).

---

## Why it "feels cumulative" but is actually re-displayed

There is no code path that adds `+1.309` to a *stored* value each spawn — the motor controller writes **absolute** targets (`ctrl[id] = pitch * rampFactor`, never `ctrl[id] += pitch`). The accumulation is perceptual:

- Each spawn rebuilds the world → old agents' qpos resets to 0 (bind pose, arms down).
- The rebuild then re-asserts the same 75° rest target (from the surviving `currentTargets` and/or `resetToBindPose`).
- So each spawn re-displays the identical **0° → 75° arms-out sweep** on every pre-existing model. To the eye: "75° keeps getting added to the old models every time I spawn."

If old agents were ever NOT holding 1.309 (e.g., an LLM set arms to a different target), then `currentTargets` holds that other target and the sweep magnitude differs — the constant 75° appears whenever the old agent's arms were at the rest target from a prior `resetToBindPose`.

---

## File map

| File | Role |
|---|---|
| `src/world/engine/HumanoidPhysicsBinder.ts` | `restArmAngleDeg = 75`; `resetToBindPose()` qpos pre-seed + target reseed; `deactivateMultiBody()` clears synchronizer; `syncVisuals()` unguarded |
| `src/world/engine/AvatarSynchronizer.ts` | `clear()` wipes `prevWorldQuat` → hard set on first sync after rebuild |
| `src/world/hooks/useWorld.ts` | `spawnAgent()` interleave (setReady before remap loop, awaits inside loop); unguarded per-frame `updateMotorTargets`/`syncVisuals` |
| `src/world/engine/StateRehydrator.ts` | Captures/restores qpos (incl. arm 1.309) but runs AFTER the loop; restore = the 75° re-assertion |
| `src/world/engine/MotorController.ts` | `setTargets()` absolute write; `init()` gain/limp reset; `applyCapsuleBalance()` shared xfrc |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Bakes stale `worldPosition` + live bone quats into combined MJCF |
| `src/components/godmode/BodyControls.tsx` | Reset-Pose button still fans out to ALL agents (no agentId) — `synthia:resetPose` |
| `src/world/engine/__tests__/multiAgentComposition.test.ts` | Regression coverage for the previously-fixed fan-outs; none yet for interleave-frame qpos reset or synchronizer clear |

---

## Recommended fix directions (for Act Mode)

1. **Close the interleave window (kills the 75° sweep on old agents):** keep `physicsEngine.setReady(false)` until the remap loop AND `StateRehydrator.restore` complete. Move `setReady(true)` to after step 11, or add a `worldDirty` guard checked by `updateMotorTargets()`/`syncVisuals()`.
2. **Don't `clear()` the AvatarSynchronizer on OLD binders during spawn.** Preserve `prevWorldQuat` across `deactivateMultiBody()`/`activateMultiBody()` (re-point IDs but keep the slerp buffer) so the 0↔75 discrepancy is filtered as it is during normal physics.
3. **Restore before any `await` after `setReady`.** Reorder so `StateRehydrator.restore` runs synchronously right after `loadMJCFModel`, before the loop's first `await` yields a frame.
4. **Gate the Reset Pose button per agent** (`detail: { agentId }`), mirroring the already-fixed bodyMode effect.
5. **Preserve `MotorController` state across `init()`** (capture `globalStiffnessScale`/`limpModeActive` before reload, re-apply after).
6. **Refresh `boneInfoMap.worldPosition` before `generateCombinedMCF()`** so the bake matches live poses.

## Suggested reading order

1. `src/world/hooks/useWorld.ts` — `spawnAgent()` steps 5–13 + the per-frame `onFrame` loop (the interleave is here)
2. `src/world/engine/HumanoidPhysicsBinder.ts` — `resetToBindPose()` (75° source), `deactivateMultiBody()` (synchronizer clear), `syncVisuals()`
3. `src/world/engine/AvatarSynchronizer.ts` — `clear()` + the `prevWorldQuat`-less hard set
4. `src/world/engine/StateRehydrator.ts` — the post-loop restore that re-asserts 1.309
5. `src/world/engine/MotorController.ts` — absolute target writes + `init()` resets
6. `project_info__76.md` — the measured proof that settled arms hold exactly 1.309 rad
