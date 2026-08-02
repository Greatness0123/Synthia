# Synthia 1.5.1 — Validation Report: Multi-Agent T-Pose Desync Diagnosis

## Summary

This report validates a third-party diagnosis claiming that **existing agents pop into T-pose / move their arms when a new agent spawns**, attributed to three root causes: (1) `data.ctrl` lost during world reload, (2) stale actuator/body integer IDs after `generateCombinedMultiAgentMJCF` recompile, and (3) event-bus bleed of `synthia:action` across agents. The diagnosis is **directionally correct on the symptom and partially correct on root cause #1, but two of the three root causes are already fixed in this codebase, and the proposed fix code does not match the actual APIs**. The real residual mechanism behind the visual pop is a **ctrl ramp restart on every spawn**, which the diagnosis does not identify.

## Verdict table

| Claim in diagnosis | Verdict | Evidence |
|---|---|---|
| Root cause 1: `data.ctrl` reset to zeros on world reload | **CORRECT symptom, INCOMPLETE fix** | `PhysicsEngine.loadMJCFModel()` deletes model+data and allocates fresh `MjData` → ctrl all zeros. `StateRehydrator` ALREADY captures/restores ctrl by actuator name ("Fix 2" comment in code), but the restored ctrl is overwritten within one frame by `MotorController.setTargets()` because the ramp restarts. |
| Root cause 2: stale integer IDs after reload | **ALREADY FIXED** | `BodyManager.remapIdsAgainstLoadedWorld()` re-queries every body/geom/actuator ID by name after every `loadMJCFModel`, called for every binder in `useWorld.spawnAgent()`. `multiAgentComposition.test.ts` asserts ID isolation. |
| Root cause 3: `synthia:action` bleed across agents | **ALREADY FIXED** | `useWorld` `handleAction`/`handlePush`/`handleRootMotion` all do strict `humanoidPhysicsBindersRef.current.get(agentId)` lookups. `MotorController.setTargets()` zeroes ONLY its own actuator IDs before writing. |
| Fix 1: rehydrate ctrl via `StateRehydrator` instance | **WRONG API, already exists in different form** | The actual `StateRehydrator` is a static class (`capture(engine, ids, objects)` / `restore(engine, captured, objects)`), not instance methods. Proposes `binder.motorController.getTargetsCopy()` / `setTargets(Float64Array)` — these methods do not exist. |
| Fix 2: re-query `mj_name2id` with prefix | **WRONG as written, already implemented** | Actuator names are `act_${prefix}${boneName}_${suffix}` (MJCFHumanoidTemplate.ts). The diagnosis's lookup `${prefix}${jointName}` is missing the `act_` prefix and would return -1. The existing `remapIdsAgainstLoadedWorld` already does this correctly. |
| Fix 3: strict agentId guard in event handlers | **ALREADY IMPLEMENTED verbatim-ish** | `handleAction` in useWorld.ts does exactly `humanoidPhysicsBindersRef.current.get(agentId)` then applies. (Diagnosis's `validateAndApplyTimeline(targets)` also has the wrong signature — real signature takes `(skeleton, sequence, options)`.) |

---

## The Actual Root Cause of the Visual Pop

The mechanism is a **20-frame ctrl ramp restart, triggered for every binder on every spawn**:

1. In `useWorld.spawnAgent()`, after `loadMJCFModel`, the code loops over **all** binders (old + new) and calls `activeBinder.initMotorController()`.
2. `MotorController.init()` performs `this.simulationStepCount = 0` (MotorController.ts, in `init()`).
3. The per-frame loop in `useWorld.start()` calls `binder.updateMotorTargets()` for every binder each render frame.
4. `MotorController.setTargets()` computes `rampFactor = Math.min(1.0, simulationStepCount / 20)` and multiplies **every** joint target by it: `ctrl[id] = targetAngle * rampFactor`.
5. Because `onFrame` runs at ~60 Hz (one call per render frame, not per physics step), the ramp takes **~20 frames ≈ 333 ms** to go from 0 → full.
6. For the first ~333 ms after a spawn, every existing agent's position-servo targets are scaled toward ~0. With ctrl ≈ 0, MuJoCo position actuators drive each joint toward the **0-angle configuration of the MJCF** — and since the MJCF bakes the bind pose (Mixamo T-pose) into the body `quat` attributes with joints at 0, this forces existing agents' arms out toward the T-pose.

**Why StateRehydrator's ctrl restore does not save this:** `StateRehydrator.restore()` writes the saved per-agent ctrl values and calls `mj_forward`. But `WorldEngine.start()` resets the physics accumulator when ready flips false→true, so ~0 steps run before the next `onFrame` fires `updateMotorTargets()`, which overwrites the just-restored ctrl with `target * 0` on the first frame. The restore is effectively nullified by the ramp restart.

This precisely matches the video: a ~1/3-second arm-snap toward T-pose for existing agents, occurring each time a new agent spawns.

### The minimal, correct fix direction (not implemented in this repo)

One of:
- Remove `activeBinder.initMotorController()` from the old-binder branch in `spawnAgent()` (it's only needed for the new binder; old binders keep their already-valid actuator maps since `remapIdsAgainstLoadedWorld` has already refreshed them), **or**
- Save/restore `motorController.simulationStepCount` across spawns so the ramp doesn't restart, **or**
- Remove the ramp entirely or drive it from the global step count rather than a per-init counter.

---

## Key Code Facts (for context)

### StateRehydrator (`src/world/engine/StateRehydrator.ts`)
- **Static** class. `capture(physicsEngine, activeAgentIds, objects)` reads `qpos`/`qvel` per joint and — already — `data.ctrl` per actuator, keyed by **actuator name** (`mj_id2name` with `mjOBJ_ACTUATOR`), filtered by `agentId_` prefix.
- `restore(physicsEngine, captured, objectsList)` writes qpos/qvel roots + joints by name, then ctrl: `mj_name2id(model, mjOBJ_ACTUATOR, actName)` → `data.ctrl[ai] = value`. Ends with `physicsEngine.forward()`.
- So the diagnosis's "Fix 1" is substantially **already present** — the missing piece is the ramp restart behavior that defeats it.

### BodyManager (`src/world/engine/BodyManager.ts`)
- Activates by generating single-agent MJCF and calling `physicsEngine.loadMJCFModel`.
- `remapIdsAgainstLoadedWorld(boneInfoMap)` — **the exact "Fix 2" the diagnosis proposes, already implemented**:
  - Re-queries `mj_name2id` for `{prefix}root_capsule`, `{prefix}{boneName}`, geoms, and actuators using the **correct** full name `act_${this.prefix}${boneName}${suffix}`.
- Actuator naming in `MJCFHumanoidTemplate.ts`: `<position name="act_${prefix}${boneName}_${suffix}" ...>` — note the mandatory `act_` prefix the diagnosis's snippet omits.

### MotorController (`src/world/engine/MotorController.ts`)
- `init(actuatorMap, model, data)` — builds its own actuator-ID set, stores base gains, **resets `simulationStepCount = 0`** (the ramp).
- `setTargets(currentTargets)` — zeroes **only its own** actuator IDs, then applies `target * rampFactor`. This is the exact site of the T-pose transient.
- `resetRamp()` — public method that also zeroes the counter (called by `resetToBindPose()` → used on resetPose).
- `setLimpMode`/`setGainScale` mutate only own actuator gain rows — isolation is already carefully maintained.

### useWorld.ts spawn flow (`src/world/hooks/useWorld.ts`)
```
spawnAgent()
  → new HumanoidPhysicsBinder(agentId)
  → loadAndVisualizeBindPose()
  → ensureCapsuleGeometry()
  → binders map .set(agentId, binder)
  → physicsEngine.setMutating(true)
  → StateRehydrator.capture(engine, existingAgentIds, objectsList)   // excludes new agent ✓
  → generateCombinedMCF() (re-prefixed per agent)
  → physicsEngine.loadMJCFModel(baseXml)
  → for EVERY binder: bm.remapIdsAgainstLoadedWorld(...); activeBinder.initMotorController();  // ← ramp restart for old agents
       new agent: createJointsWithZeroMotors + activateMotors + setMode (full pose reset)
       old agents: deactivateMultiBody + activateMultiBody only      // currentTargets preserved ✓
  → StateRehydrator.restore(engine, captured, objectsList)
  → for every binder: targetSpawnGrounded=false; previousFootPositions.clear()
  → new agent setCapsulePosition + resetPose
  → physicsEngine.setMutating(false)
```

### Event routing (`src/world/hooks/useWorld.ts`)
- `handleAction`: `const binder = humanoidPhysicsBindersRef.current.get(agentId)` — strict by-`agentId` lookup, returns early if absent. **No bleed.**
- `handlePush`, `handleRootMotion`: same strict pattern.
- The coordinator (`coordinator/src/agentLoop.ts` / `server.ts`) is downstream of this; actions arrive with an agentId and are routed per-binder.

### Tests
- `src/world/engine/__tests__/multiAgentComposition.test.ts` verifies: distinct body IDs for `mixamorigspine` across agents, distinct capsule IDs, state capture/restore across combined-model reload, and physics stays unbroken. **Passing coverage of the ID-isolation claim**, but no test exercises the ctrl-ramp-restart behavior on old agents during a NEW-agent spawn (the residual bug).

---

## What the diagnosis got right / wrong

**Right:**
- Fresh `MjData` after `loadMJCFModel` has ctrl = zeros — the reload does lose motor targets.
- The visual symptom at spawn is real and stems from the world-recompile path (`generateCombinedMultiAgentMJCF` → `loadMJCFModel`).
- Zeroing internal motor controller state on a reload IS the family of bug that causes the pop.

**Wrong / misleading:**
- Claims stale IDs and event bleed are live causes — both are already correctly handled (`remapIdsAgainstLoadedWorld`, by-name ctrl restore, strict per-agent event routing).
- The proposed code will not compile/run against this codebase: `StateRehydrator` is static; `MotorController` has no `getTargetsCopy`/`setTargets(Float64Array)`; `HumanoidPhysicsBinder` has no `rebindModelData`; `validateAndApplyTimeline` requires a skeleton + sequence.
- Fix 2's actuator lookup is missing the `act_` name prefix, so it would silently resolve nothing.
- The actual culprit — `initMotorController()` resetting `simulationStepCount` for all binders, combined with the per-frame `rampFactor` overwrite of the restored ctrl — is not mentioned.

## Suggested follow-up (if this needs fixing in Act Mode)
1. In `spawnAgent()`, skip `initMotorController()` for old binders (post-`remapIdsAgainstLoadedWorld` their actuator maps are already valid), or preserve `simulationStepCount` across `init`.
2. Add a regression test: spawn agent_0, settle >20 frames, set distinctive arm targets, spawn agent_1, assert agent_0's `data.ctrl` values don't drop toward 0 and its arm joint qpos don't deviate beyond tolerance.
3. Optionally, drive `rampFactor` from the absolute physics step count (`physicsEngine.getStepCount()`) instead of a per-init counter so a spawn never restarts anyone's ramp.
