# SYNTHIA Multi-Agent Spawn Instability — Diagnosis & Fix

## Summary

A bug in the Phase 2 client-side multi-agent spawn pipeline causes three correlated symptoms: **(1)** every newly spawned agent is launched violently upward the instant physics resumes, **(2)** the previously-spawned agents degrade into unstable poses (most visibly "arms crossed behind the back") while only the newest agent appears stable, and **(3)** the newest agent eventually settles into a stable "arms by side" pose *only after* being launched into the air and falling back. All three symptoms share one upstream defect: **`spawnAgent()` never initializes the new agent's physics geometry correctly, and `StateRehydrator` restores an incomplete physics state** (positions/velocities but *not* actuator controls, and no re-grounding of the old agents).

---

## Root Cause 1 — The Upward Launch: `capsuleCenterY` is `0` for every spawned agent

### The defect

`HumanoidPhysicsBinder::createRigidBodiesAndColliders()` is the **only** code path that sets `this.capsuleCenterY = this.modelHeight / 2` (≈ `0.9`):

```ts
// HumanoidPhysicsBinder.ts
public async createRigidBodiesAndColliders(): Promise<boolean> {
  ...
  this.capsuleCenterY = this.modelHeight / 2;   // ← ONLY place this is assigned
  const success = await this.bodyManager.activate(... this.capsuleCenterY ...);
  ...
}
```

In `useWorld.ts::spawnAgent()`, the new binder goes through **STEP A only**:

```ts
const stepA = await binder.loadAndVisualizeBindPose(probePoint);  // STEP A: GLB load, extract bones
if (!stepA) { ... return null; }
binder.repositionModel(spawnPoint.x, spawnPoint.y, spawnPoint.z);
...
humanoidPhysicsBindersRef.current.set(agentId, binder);   // ← added to map BEFORE world rebuild
...
const baseXml = generateCombinedMCF();                     // ← reads capsuleCenterY == 0 !
physicsEngine.loadMJCFModel(baseXml);
```

`createRigidBodiesAndColliders()` is **never called** for spawned agents — so `capsuleCenterY` stays at its field initializer `0`.

### Chain of events

1. `generateCombinedMCF()` → `generateAgentSubtreeMJCF(boneInfoMap, capsuleCenterY=0, ...)` emits the new agent's root body at **MuJoCo Z = 0** (floor level):

   ```ts
   // MJCFHumanoidTemplate.ts
   const capsulePosThree = { x: modelX, y: capsuleCenterY /* = 0 */, z: modelZ };
   const capsulePosMj = PhysicsEngine.worldToMuJoCo(capsulePosThree);  // → [x, 0, 0]
   ```

2. The root body carries a **colliding** `torso_collider` sphere (`contype="2" conaffinity="1"`, radius `0.12`) at `pos="0 0 0"` — i.e., **half-buried in the floor**.

3. The root body's inertia is `mass 0.001, diaginertia 5.0 3.0 5.0` — an extremely light, high-inertia body.

4. On the first physics steps, the contact solver (iterations=100, implicitfast) must resolve a 1.2–9 cm deep interpenetration against a body of mass **0.001 kg**. By `F = J / m`, the resulting ejection velocity is enormous: **the whole skeleton is catapulted skyward.**

5. The `registerVelocityClampBody()` guard exists on `PhysicsEngine` (clamps linear speed at 10 m/s) but **no binder ever calls it** — nothing damps the launch.

> Note: the *initial* `agent_0` does *not* launch because its bootstrap path (`build()` effect in `useWorld.ts`) calls `createRigidBodiesAndColliders()`, which correctly sets `capsuleCenterY = 0.9` → root at Z=0.9 → torso collider above the floor. Every *spawned* agent (`agent_1`, `agent_2`, …) is broken.

### Why the newest agent eventually becomes "stable"

After the launch, the agent falls back. During flight and settle, its position actuators (spine kp=700, hips kp=900, knees kp=1000, ankles kp=600) plus the `applyCapsuleBalance` torque (kp=100) drive it upright. The arms, pulled by *ramped* position targets (see Root Cause 2), finish at the target angle. Visually this reads as "launched, then landed and stabilized."

---

## Root Cause 2 — Old agents degrade after every reload: `StateRehydrator` never captures/restores `data.ctrl`, and the reload wipes each old agent's commanded pose

### 2a. ctrl is not part of the captured state

`CapturedAgentState` contains only `rootPos, rootQuat, rootVel, jointAngles, jointVels` (`StateRehydrator.ts`). **`data.ctrl` is never captured.** After `loadMJCFModel()` a fresh `MjData` is created, so **all actuators' ctrl is zeroed** for every agent.

The arm/spine/hip pose of a standing agent is held *entirely* by the continuous ctrl stream written each frame by `MotorController.setTargets()` + `applyCapsuleBalance()`. Restoring qpos without ctrl means the old agent's **commanded pose is silently dropped.**

### 2b. The reload loop force-resets every agent's targets

In `spawnAgent()`, the per-binder loop runs for **all** binders (old + new):

```ts
for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
  ...
  activeBinder.setMode(worldStore.bodyMode);   // 'rigid' → resetToBindPose()
}
```

`setMode('rigid')` → `resetToBindPose()` does four destructive things to **every** old agent:

```ts
this.currentTargets.clear();                 // ← erases the AI's commanded pose
this.motorController.resetRamp();            // ← re-arms the 20-step ctrl ramp from ZERO
// ... qpos/qvel of every hinge forced to 0 ...
// sets arms-down target { x: 1.309, y: 0, z: 0 }
```

### 2c. The resulting transient

After the reload:
- old agents' qpos is *briefly* zeroed (loop), then restored by `StateRehydrator.restore()` (by-name, correct);
- but their ctrl is `0` and **ramps from zero over 20 steps** (`rampFactor = min(1, stepCount/20)`);
- their `currentTargets` were wiped and replaced with the canonical arms-down/spine-neutral set — **any pose the AI had commanded is forgotten**;
- their restored `qvel` can be non-zero (captured mid-settle), which handshakes badly with a re-zeroed ctrl stream.

During the ramp, gravity dominates the arm servos (kp=200). The arms — which are mechanically a 1-DOF pendulum about the baked pitch axis starting from wherever their restored qpos was — swing under gravity toward the hang, and the `applyCapsuleBalance` torque (which does not know the arms exist) is simultaneously trying to erect the trunk. Any residual yaw/roll restored from a pre-capture flail is now *unconstrained* (their ctrl targets are 0 = "hold T-pose yaw/roll"), so arms that start even slightly out of plane can be pulled around the torso by arm–torso collisions. The visually reported "arms crossed behind the back" is the combination of these effects once the old agent's previous pose was not the exact arms-down/neutral set.

### Why the newest agent is immune

The newest agent's qpos starts at pristine 0 (T-pose bind), qvel = 0, ctrl ramps cleanly 0→target with no restored state to fight. It converges to the commanded pose. It only looks different because it starts from the *T-pose* and sweeps 75° through the torso region; since it is the only agent whose internal servo state is self-consistent, it "carries the stable arms-by-side position."

> **Net effect:** every spawn perturbs *all* older agents (target wipe + ctrl zero + ramp restart + stale restore); the newest agent is the only one with self-consistent servo state. Hence "the latest model is the only stable model."

---

## Root Cause 3 — Stale one-shot grounding & GRF state on old agents after reload

Two per-binder flags survive world reloads because the binder objects are reused (not recreated) across spawns:

- `targetSpawnGrounded` is set `false` once at construction, then `true` after the first successful ground ray in `syncVisuals()` — **forever**. The spawn-ground alignment block:

  ```ts
  if (!this.targetSpawnGrounded && dist >= 0) { ... this.setCapsulePosition(...) ... this.targetSpawnGrounded = true; }
  ```

  never re-runs after a world rebuild. Any agent whose root height was corrupted by the capsuleCenterY=0 launch/landing is never re-grounded.

- `previousFootPositions` is only cleared in `resetPose()` / `resetToBindPose()` — neither of which is called for **existing** agents during `spawnAgent()`. `applyKinematicGroundReactionForces()` therefore compares post-reload foot positions to pre-reload ones, producing spurious Δ values → phantom GRF impulses on old agents right after each spawn.

---

## Root Cause 4 — Self-collision during the arm sweep (why arms specifically end up crossed/behind)

The bind qpos=0 is the **T-pose** (arms fully horizontal, per the x-bot.glb bind pose). `resetToBindPose()` commands the arms to `x = 1.309 rad` (75°) about the baked pitch axis. Any agent starting from T-pose — and any old agent whose restored arm qpos is near 0 — must sweep ~75° on the way to the target. During that sweep the arm spheres (`radius 0.04`, `contype=2`) and the `torso_collider` (radius 0.12) interpenetrate. MuJoCo's contact solver projects the arm out of the torso; because only the pitch DOF is commanded (yaw/roll ctrl = 0 = "hold T-pose"), the arm cannot swing *through* the side plane and gets deflected **behind the trunk**. Replayed on every reload for every non-pristine agent, this produces the persistent crossed-behind look for all agents except the freshest one.

---

## Proposed Fix (ordered; each item standalone)

### Fix 1 — Give spawned agents correct capsule geometry (kills the launch)

In `HumanoidPhysicsBinder`, add a public method and call it in `spawnAgent()` immediately after `loadAndVisualizeBindPose` (before adding the binder to the map / before `generateCombinedMCF`):

```ts
public ensureCapsuleGeometry(): void {
  this.capsuleCenterY = this.modelHeight / 2;
  (this.bodyManager as any).capsuleCenterY = this.capsuleCenterY;  // keep BodyManager offset consistent
}
```

In `useWorld.ts::spawnAgent()`:

```ts
const stepA = await binder.loadAndVisualizeBindPose(probePoint);
if (!stepA) { ... }
binder.ensureCapsuleGeometry();   // ← NEW: fix root height before MJCF generation
```

Also repair *legacy* spawned binders (agent_1, …) whose `capsuleCenterY` is still 0 — e.g. inside `generateCombinedMCF()`:

```ts
capsuleCenterY: binder.getCapsuleCenterY() || (binder as any).modelHeight / 2,
```

With this, the new agent's root sits at Z=0.9, the torso_collider is above the floor, and the contact solver has nothing to catapult.

### Fix 2 — Capture & restore `data.ctrl` in `StateRehydrator`

Extend `CapturedAgentState` with `ctrl: Record<string, number>`:

- **capture()**: for actuator index `ai` in `model.nu`, look up `mj_id2name(model, mjOBJ_ACTUATOR, ai)`; if the name starts with `act_${agentId}_`, store `data.ctrl[ai]`.
- **restore()**: for each captured entry, `mj_name2id(...)` the actuator name and write `data.ctrl[id] = value`.

This makes old agents resume their exact commanded servo state on the first step after reload — no 20-step ramp from zero, no pose flop.

### Fix 3 — Don't destroy old agents' commanded pose during spawn

In the `spawnAgent()` per-binder loop, gate the destructive reset to the **new** binder only, and for old binders just re-map + re-init:

```ts
for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
  activeBinder.getMultiBodyManager().remapIdsAgainstLoadedWorld(activeBinder.getBoneInfoMap());
  activeBinder.initMotorController();
  if (id === agentId) {                    // only the new agent gets a pose reset
    await activeBinder.createJointsWithZeroMotors();
    await activeBinder.activateMotorsWithStiffnessAndDamping(80, 10);
    activeBinder.deactivateMultiBody();
    if (worldStore.useMultiBodyPD) await activeBinder.activateMultiBody();
    activeBinder.setMode(worldStore.bodyMode);
  }
}
```

(Optionally keep `setMode`/`resetToBindPose` for old agents only if a hard re-pose is desired, but then Fix 2 makes the ramp harmless.)

### Fix 4 — Re-arm grounding + clear GRF history for all agents after restore

After `StateRehydrator.restore()`, for every binder:

```ts
(activeBinder as any).targetSpawnGrounded = false;   // allow one re-alignment against new floor
(activeBinder as any).previousFootPositions?.clear();
```

Optionally call `physicsEngine.registerVelocityClampBody(capsuleBodyId)` for the new agent as a launch guard.

### Fix 5 — Spawn arms already at target (kills the torso sweep)

In `resetToBindPose()`, instead of starting arm qpos at 0 (T-pose) and letting the servo sweep 75°, seed the arm joint qpos directly:

```ts
// after the hinge-zeroing loop:
const armPitchNames = ['mixamorigleftarm_pitch', 'mixamorigrightarm_pitch'];
for (const n of armPitchNames) {
  const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + n);
  if (jntId >= 0) qpos[model.jnt_qposadr[jntId]] = armsDownAngle;
}
```

Agents then *spawn already in the arms-down pose* instead of swinging from T-pose through the torso, eliminating both the crossed-behind deflection and most of the launch-settle visual.

### Verification

1. After Fix 1: spawn `agent_1` — it should stand at X=1.75 with feet on the floor, **no upward launch** (`rootH` in the diag ring should never exceed ~1.0).
2. After Fix 2+3: spawn `agent_2` — `agent_0` and `agent_1` must retain their exact pre-spawn poses (check `getJointState()` before/after via `window.__SYNTHIA_HUMANOID_BINDERS__`).
3. After Fix 5: no visual arm sweep at any spawn — arms appear at sides immediately.
4. Run `npm test` — `multiAgentComposition.test.ts` must still pass (it validates capture/rehydrate; extend it to assert ctrl round-trip).

---

## Module Reference (files touched by this bug)

| File | Role in the bug |
|------|-----------------|
| `src/world/hooks/useWorld.ts` | `spawnAgent()` — skips `createRigidBodiesAndColliders`, force-resets all binders, never re-grounds old agents |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `capsuleCenterY` only set in `createRigidBodiesAndColliders()`; `resetToBindPose()` wipes targets + ramps; `targetSpawnGrounded`/`previousFootPositions` stale across reloads |
| `src/world/engine/BodyManager.ts` | `activate()` stores its own `capsuleCenterY`; `remapIdsAgainstLoadedWorld()` correctly remaps IDs (not the bug) |
| `src/world/engine/StateRehydrator.ts` | **Never captures/restores `data.ctrl`** — the core completeness defect |
| `src/world/engine/MotorController.ts` | `setTargets()` zeroes its own ctrl then writes `target × rampFactor` (20-step ramp); `resetRamp()` re-arms the ramp on every `resetToBindPose` |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Root capsule + `torso_collider` placed at Z=`capsuleCenterY`; with 0 the torso collider is buried and exploded by the solver |
| `src/world/engine/PhysicsEngine.ts` | `registerVelocityClampBody()`/`clampRegisteredBodyVelocities()` exist but are never wired to agent bodies |

---

## Suggested Reading Order

1. `src/world/hooks/useWorld.ts` — the spawn orchestration (start at `spawnAgent`)
2. `src/world/engine/HumanoidPhysicsBinder.ts` — binder lifecycle, `resetToBindPose`, `syncVisuals`, grounding logic
3. `src/world/engine/StateRehydrator.ts` — what is/isn't preserved across world reloads
4. `src/world/engine/MJCFHumanoidTemplate.ts` — how the root capsule/`torso_collider` geometry is emitted per agent
5. `src/world/engine/MotorController.ts` — the ctrl ramp and per-agent actuator isolation
