## 1. Why arms go backward on spawn instead of hanging by the side

This is a **wrong-axis bug in `resetToBindPose()`** in `src/world/engine/HumanoidPhysicsBinder.ts`. That function runs on every spawn — in `spawnAgent()` it's called twice: once via `setMode(bodyMode)` → `setMode('rigid')` → `resetToBindPose()`, and again via `binder.resetPose(spawnPoint)` → `resetToBindPose()`.

Here's what it commands for the arms (rest angle = 75° = 1.309 rad):

```ts
// HumanoidPhysicsBinder.ts, resetToBindPose()
this.currentTargets.set('mixamorigleftarm',  { x: 0, y: 0, z:  armsDownAngle });
this.currentTargets.set('mixamorigrightarm', { x: 0, y: 0, z: -armsDownAngle });
```

and it also writes the same ±75° straight into each arm's **`_roll`** joint qpos.

**The problem:** the `z` index of the target array maps to the **roll** actuator/joint:

- `MotorController.setTargets()` → `roll = parsedTarget.z` → `ctrl[actuatorIds[2]]` → `act_…_roll`
- In `MJCFHumanoidTemplate.ts` the arm `_roll` joint is declared as `axis="0 1 0"` (body-local Y)

But this project's own verified convention — documented in `DIAGNOSTIC_POSES_GUIDE.md` §3.1 and used by every working pose in `diagnostic_poses.js`/`diagnostic_poses_v2.js` — is:

> **`X` (pitch, axis 1 0 0) = adduction — lowers the arm to the side.** The canonical arms-down pose is `'mixamorigrightarm': [75 * DEG, 0, 0]`.

So the arms-down rest is being applied on the **roll axis instead of the pitch axis**. The Mixamo T-pose bind quaternion is baked into the MJCF body frame (the code comment in `MJCFHumanoidTemplate.ts` explicitly says this "physically flips what axis 0 0 1 and 0 1 0 actually do in world space"), so after that transform a ±75° "roll" rotation sweeps the arms **backward** instead of down to the sides.

**Why it's a spawn-only artifact:** on spawn the entire MuJoCo world is rebuilt (`spawnAgent` → `generateCombinedMCF()` → `loadMJCFModel()`), so every joint starts at qpos 0 → the model flashes into T-pose. Then `resetToBindPose()` commands the bad roll target and the 20-step ctrl ramp (~40 ms at 500 Hz × 2 ms steps labeled in `MotorController`) sweeps the arms to ±75° of wrong-axis roll — pinned backward. Existing agents don't show it because `StateRehydrator.capture()/restore()` preserves their previous ctrl/qpos state across the world reload (that's the "arms crossed behind back" fix noted in the `spawnAgent` comments — the code takes great care to NOT touch old agents' `currentTargets` or ctrl ramp, so only the new agent snaps).

**Likely fix (for Act Mode):** in `resetToBindPose()`, use pitch instead of roll — `{ x: armsDownAngle, y: 0, z: 0 }` for **both** arms (the guide shows X=+75° lowers the right arm, and X=+75° with the left arm's mirrored convention also lowers it), and write the rest angle into the `_pitch` joint qpos rather than `_roll`. Note the left/right asymmetry currently in the code (`+75°` left, `-75°` right) is itself suspicious — every verified pose in the diagnostic scripts uses **the same sign** for both arms' X. Note also this same head/neck fix was already done in `MJCFHumanoidTemplate.ts` (the `isHeadNeck ? '0 1 0' : '0 0 1'` axis swap) — **the arms were missed when that fix was applied.**

---

## 2. Does running a diagnostic pose affect all models or none until an agent id is given?

**It affects exactly one binder — and without an `agentId`, that binder is `agent_0`.**

In `src/world/hooks/useWorld.ts`, the `synthia:action` handler does:

```ts
const { ..., agentId = 'agent_0' } = e.detail;
const binder = humanoidPhysicsBindersRef.current.get(agentId) as any;
if (!binder) return;
```

Consequences:

- `diagnostic_poses.js`, `diagnostic_poses_v2.js`, and `console_walking.js` all dispatch `synthia:action` **without** an `agentId` → they always act on **agent_0 only**.
- There is **no broadcast** in the action handler. Other agents' `currentTargets`, ctrl values, and poses are untouched.
- To target another agent, add `agentId: 'agent_1'` (etc.) to the `CustomEvent` detail — then **only that agent** is affected. It's strictly one-at-a-time, never "all."

Two gotchas worth knowing:

1. **`synthia:resetPose` is the exception** — it loops over *every* binder:
   ```ts
   humanoidPhysicsBindersRef.current.forEach((binder, id) => { binder.resetPose(...) });
   ```
   So `walkStop()` in `console_walking.js`, and the "Reset Pose" button in `BodyControls.tsx`, reset **all** agents at once, regardless of agent id.

2. **`console_walking.js` has a split-brain quirk:** its joint frames dispatch `synthia:action` with no agentId (→ always agent_0's legs), but its root-motion step moves the capsule via `window.__SYNTHIA_HUMANOID_BINDER__` — which `useWorld` reassigns to the **most recently spawned** agent each time `spawnAgent()` runs. So after spawning extra agents, running the walk script animates agent_0's limbs while the forward translation pushes the newest agent. That can look like "poses affecting the wrong model."

**Short answer:** diagnostic poses affect exactly one model — **agent_0 by default, or whichever agent id you specify — never all of them**, unless you also fire `synthia:resetPose`.