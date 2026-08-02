Let me re-read the current state of the actual source files to confirm nothing changed vs. what I documented, then map this new symptom to concrete code paths.

<read_batch>
<paths>
src/world/hooks/useWorld.ts
src/world/engine/HumanoidPhysicsBinder.ts
src/world/engine/MotorController.ts
src/world/engine/AvatarSynchronizer.ts
src/world/engine/StateRehydrator.ts
src/world/engine/PhysicsEngine.ts
src/world/engine/WorldEngine.ts
</paths>
</read_batch>

I have all seven files loaded. They match my previous snapshot. Now, here's the diagnosis of the new symptom.

---

## New symptom: original agent "arms down → flail up → back to arms down" at spawn

Timeline of the initial build (agent_0 only, no second agent yet), from `useWorld`'s `build()`:

```
 1. loadAndVisualizeBindPose(probe)     → GLB bind pose rendered  → ⬇ arms DOWN (correct)
 2. repositionModel(spawnPoint)
 3. createRigidBodiesAndColliders()     → MJCF baked + loaded; qpos all 0 = BIND POSE → ⬇ arms DOWN
 4. createJointsWithZeroMotors()        → no-op
 5. activateMotorsWithStiffnessAndDamping(80, 10)  → buildStep='D'
 6. activateMultiBody()                 → registers proxies + CLEARS avatarSynchronizer
 7. setMode('rigid')                    → setLimpMode(false) + resetToBindPose()
       resetToBindPose():
         currentTargets.clear()
         motorController.resetRamp()        // simulationStepCount = 0
         qpos[arm_pitch] = armsDownAngle    // = 1.309 rad for both arms  ← ⬆ arms UP/OUT
         currentTargets[arms] = { x: 1.309 }
 8. startAgentClientLoop('agent_0')     → LLM may issue arm overrides on top
 9. physicsEngineRef.current.forward()  → mj_forward recomputes xpos from qpos
```

So the sequence the eye sees:

- **Frame 0:** bind pose → visual arms **down** (correct). ✓ matches your report.
- **Then:** `resetToBindPose()` overwrites the arm-pitch `qpos` to **+1.309 rad** while the body is still in the bind pose (all other qpos = 0). Physics + `syncVisuals` now render arms **up/out** — the "flail upward." ✓ matches your report.
- **Then:** the position servos (kp=200) drive the arm pitch toward the `currentTargets` value... which is **also 1.309**. So the servos shouldn't pull the arms back down.

**Wait — that doesn't close the loop. If both qpos and ctrl target are 1.309, arms should settle UP, not return down.** So the "come back to arms-down" leg of your symptom has to come from one of these:

### Mechanism A — the ctrl ramp restarts (most likely)
`resetToBindPose()` calls `motorController.resetRamp()` → `simulationStepCount = 0`. Look at `MotorController.setTargets()`:

```ts
const rampFactor = Math.min(1.0, this.simulationStepCount / 20);
this.simulationStepCount++;
ctrl[actuatorIds[1]] = pitch * rampFactor;   // pitch = 1.309
```

For the first ~20 frames after reset, `ctrl[pitch]` is **scaled toward 0** (frame 1 → 0.065, frame 5 → 0.33, frame 20 → 1.309). With `ctrl ≈ 0`, the position servos are effectively **unpowered**, and the arm's *physics* state — which has qpos=1.309 — is overridden by... no wait, qpos is still 1.309 in the physics. The arm should stay up regardless of ctrl.

Unless — the **visual** side is what comes back down. Here's the full chain:

- `syncVisuals()` reads the **physics** body quaternion and slerps the visual bone toward it. The physics arm is at pitch 1.309 (the qpos we wrote), so the visual should be up.

Hmm — but note `mj_forward()` is only called on step 9 of build(). It was NOT called after `resetToBindPose()` stepped inside the loop. Between step 7 and step 9 the data is in whatever state `mj_step` left it. The physics hierarchy hasn't recomputed `xquat` for the hinge offsets yet. So `syncVisuals()` reads `xquat` from a **stale forward pass** — joints show bind pose (arms down) — while `xpos` etc. are also stale. Then at frame 6/7/8, syncVisuals shows arms **down** even though qpos was written to 1.309. Then:

- `forward()` at step 9 recomputes the whole kinematic chain → xquat now reflects qpos=1.309 → arms visibly **fly UP**. ✓ "flail upwards"
- Servos, meanwhile, ramp up from 0 (ramp was reset). At the same instant the physics arms are up at qpos 1.309 and ctrl is ramping 0→1.309 — so the servo holds them up; the arm **stays up** as long as ctrl ≥ current torque needs.
- BUT the LLM cycle (started at step 8) only starts after ~1-2 seconds, and if it never commands arms, nothing should pull them back down.

So "come back to arms-down" still isn't fully explained by Mechanism A alone. That means one of the following:

### Mechanism B — the walk-out-of-bounds reset (real, in `useWorld` per-frame loop)
The per-frame `onFrame` has:

```ts
if (binder.isOutOfWorldBounds()) {
  ... spawnX ...
  binder.resetPose(agentSpawn);   // → setCapsulePosition + resetToBindPose + previousFootPositions.clear
}
```

`resetPose()` → `resetToBindPose()` — **again**. If at any point the capsule's position reads out-of-bounds (fueled by `WORLD_BOUNDARY_RADIUS = 50`, or a NaN/corrupt xpos during the stale-data window, or `mj_forward` explosion), the reset re-runs — that's a *second* flail cycle.

### Mechanism C — `setGaitActive(false)` side-effect in `resetToBindPose` (amplifier, not cause)
`resetToBindPose()` calls `setGaitActive(false)` first, which touches the motor controller — but it doesn't alter gains, so minor.

### Mechanism D — the human "flail" is actually the `AvatarSynchronizer` hard-set on a stale/incorrect quat
`activateMultiBody()` called `this.avatarSynchronizer.clear()`. So the first `syncVisuals()` after activation did `smoothedQuat.copy(rawWorldQuat)` with a **stale xquat** — could be any odd intermediate orientation → **flash of random arm orientation**, then as qpos gets recomputed by the next step/forward, the slerp buffer is now seeded and subsequent frames smoothly move to the real pose. This creates "flail up then settle."

---

## What the measurement would show (how to verify)

In the browser console, right after spawn:

```js
const b = window.__SYNTHIA_HUMANOID_BINDER__;
const mc = b.motorController;
console.log('ramp', mc.simulationStepCount);
console.log('arm qpos target', b.currentTargets.get('mixamorigleftarm'));
console.log('arm qpos physics', /* read via module.mj_name2id + data.qpos */);
```

If `ramp` is < 20 and rising, and qpos target is 1.309, Mechanism A is confirmed.

---

## The cleanest fix that addresses ALL of the above

**Don't write arms to 1.309 in `resetToBindPose()` at all.** The bind pose of the GLB is already arms-down — that's what the user sees at frame 0 and calls "correct." The `armsDownAngle = restArmAngleDeg * π/180` qpos pre-seed ("Fix 5") and the `currentTargets` reseed to 1.309 are the *entire* reason the arms leave the bind pose. Remove them:

```ts
// resetToBindPose() — replace the arm branches:
qpos[jnt_qposadr] = 0;                    // bind = arms down; don't pre-seed 1.309
...
this.currentTargets.set('mixamorigleftarm',  { x: 0, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigrightarm', { x: 0, y: 0, z: 0, isQuaternion: false });
```

That gives: frame 0 arms down (bind), qpos=0 matches bind, ctrl target 0 = bind, servos hold bind with zero motion. The flail cannot happen because nothing ever commands 1.309.

**This is the same value that's wrong everywhere** — `restArmAngleDeg = 75` is the one number that all 5 prompt layers + the binder + the motor controller share. Fix it at the source (`resetToBindPose`) so the mechanical layer stops injecting the arm disturbance; fix the prompts (`InferenceClient ×2`, `openaiCompatProvider`, `geminiProvider`, `kaggle_server.py`) so the LLM stops *believing* arms-down is "75° from T-pose."

---

## Updated recommendation — priority order with the new symptom

| Priority | Fix | Kills |
|---|---|---|
| 1 | **`resetToBindPose()`: arms → 0, not 1.309** (remove qpos pre-seed + target reseed) | Original-model flail-up-then-back at spawn (new symptom) |
| 2 | **#1 interleave close** (setReady after restore + `onFrame` mutating guard) | Old-agent arm sweep on every spawn (original symptom) |
| 3 | **#2 preserve AvatarSynchronizer slerp** | Hard-snap flash on old binders |
| 4 | **#6 gate `synthia:resetPose`** | All-agent Reset Pose fan-out |
| 5 | **#3 restore before awaits** + name-based object rehydrate | Half-restored world frames |
| 6 | **#5 refresh `worldPosition` before bake** | Stale joint-center geometry |
| 7 | **#4 preserve MotorController gains across init** | Servo re-settle on spawn |

The newly reported flail is **item 1**, which is the mechanical `restArmAngleDeg = 75` being applied by `resetToBindPose()` on the freshly-initialized binder — contradicting the bind pose it just loaded. That's the single most direct "code pushing the arms" left in the tree, and it explains why the original model does the dance every time it initializes.