Your plan is correct — every one of the six items maps to real, confirmed code, with two caveats I want to flag. Let me walk each one with the evidence.

---

**#1 — Close the interleave window (ROOT BUG — fix first). ✅ Correct.**

Confirmed in `src/world/hooks/useWorld.ts`, inside `spawnAgent()`:

```
physicsEngine.loadMJCFModel(baseXml);
physicsEngine.setReady(true);        // ← world "resumes" HERE
...
for (const [id, activeBinder] of ...entries()) {
  ...
  await activeBinder.activateMultiBody();   // ← rAF can fire mid-loop
}
StateRehydrator.restore(...);               // ← restore runs AFTER the awaits
```

`WorldEngine.animate()` gates `onFrame` **only** on `physicsEngine.isReady`:

```ts
if (this.physicsEngine.isReady) {
  while (this.physicsAccumulator >= this.FIXED_TIMESTEP) { this.physicsEngine.step(); ... }
  if (!this.physicsEngine.isBroken && onFrame) { onFrame(); }
}
```

And `onFrame` (the second callback passed to `worldEngineRef.current.start`) runs `binder.updateMotorTargets()` + `binder.syncVisuals()` for **every binder** with **no** `isMutating` guard. So `setReady(true)` before the remap loop/restore = old binders read the half-built world (all qpos = 0 = bind pose, arms down) and hard-set their visuals to it — then `restore` rewrites qpos to the captured 1.309 and the next frame snaps arms back out. **That's your 75° sweep on every old agent, once per spawn.**

Concrete change: delete the `physicsEngine.setReady(true)` line immediately after `loadMJCFModel(baseXml)`, and re-add it after `StateRehydrator.restore(...)` (before `setMutating(false)`). Also add `if (physicsEngineRef.current?.isMutating) return;` at the top of `onFrame` as belt-and-suspenders (the per-step diag callback already does exactly this; `onFrame` is the gap). Keeping `isReady=false` also stalls `step()` — it checks `isReady` — so physics simply doesn't advance mid-rebuild.

---

**#2 — Don't wipe `prevWorldQuat` on old binders. ✅ Correct, one nuance.**

`deactivateMultiBody()` does `this.avatarSynchronizer.clear()`, and `activateMultiBody()` does `this.avatarSynchronizer.clear()` again then re-registers all bones. In `spawnAgent()`, old binders run **both**. `AvatarSynchronizer.synchronize()` with an empty `prevWorldQuat` does `smoothedQuat.copy(rawWorldQuat)` — the hard snap instead of the 0.85 slerp.

**Nuance:** `activateMultiBody()` also clears + re-registers `observationBuilder` — that **must stay**, because old binders' `BodyProxy` objects hold stale numeric IDs and need re-pointing at the new world. Only the smoothing buffer wipe is wrong. So the clean fix is a variant: `activateMultiBody({ preserveSmoothing: true })` that, when set, re-seeds each bone's `prevWorldQuat` from that bone's *current visual quaternion* at registration (or skips `clear()` since `registerBone` overwrites each key anyway). Re-seeding from the current visual pose is the right baseline because `StateRehydrator.restore` rewrites qpos to the captured pose immediately after.

---

**#3 — Restore synchronously right after `loadMJCFModel`. ✅ Mostly right, one real caveat.**

Good news: the agent half of `StateRehydrator.restore` resolves everything by **name** via `mj_name2id`:

```ts
const ji = module.mj_name2id(model, ..., jntName);   // agent joints: name-based, safe before remap
const ai = module.mj_name2id(model, ..., actName);   // agent actuators: name-based, safe
```

So moving it earlier for the humanoids is safe and doesn't depend on the binders' remapped ID maps.

**Caveat:** the **objects** half of `restore` uses stale **numeric** `obj.bodyId` captured before reload:

```ts
const dofAdr = model.body_dofadr[obj.bodyId];   // objects: NUMERIC — stale unless body order is identical
```

Today it works by layout luck (env_slot / piano / custom bodies are baked in stable order). If you move restore earlier it's no more or less broken than now, but it's a latent landmine. Cheap fix while you're in there: key object rehydration by name (`env_slot_${slotIndex}` / `custom_${id}` / `piano_body`) via `mj_name2id` so it's order-independent forever.

---

**#4 — Preserve `MotorController` state across `init()`. ✅ Correct.**

`MotorController.init()` hard-resets:

```ts
this.globalStiffnessScale = 1.0;
this.globalDampingScale = 1.0;
this.limpModeActive = false;
```

`baseGains` are correctly re-read from the fresh model (fine), but scaled gains + limp state are silently reverted on every spawn. If anything customized stiffness or a binder was in ragdoll, the arms (kp=200 — the lowest gain in `getMuJoCoBoneGains`) visibly re-settle. Fix: snapshot `globalStiffnessScale / globalDampingScale / limpModeActive` on the binder before the reload; after `initMotorController()`, re-assign and call `setGainScale(...)` / `setLimpMode(...)`. **Do not touch `simulationStepCount`** — it's already deliberately preserved in `init()` (that was the previous fix).

---

**#5 — Refresh `worldPosition` before the bake. ✅ Correct, cheap and safe.**

`boneInfo.worldPosition` is only refreshed in `extractBonePositions()` (bind pose) and `repositionModel()`. `generateCombinedMCF()` → `generateAgentSubtreeMJCF()` bakes stale `boneInfo.worldPosition` + **live** `bone.getWorldQuaternion()`. After reload + restore, orientations are exact but joint centers are stale → visible bone-length displacement exactly on the frames where `syncVisuals` hard-sets (post-#2-fix it's slerped, but still wrong geometry). Fix: add a `refreshBoneWorldPositions()` (same loop `repositionModel` uses — `bone.getWorldPosition → info.worldPosition.copy`) and call it on every binder at the top of `generateCombinedMCF`. Bonus: this makes the baked capsule positions match where each agent actually is.

---

**#6 — Gate Reset Pose per agent. ✅ Correct, and correctly scoped as a separate trigger.**

`src/components/godmode/BodyControls.tsx` dispatches `synthia:resetPose` with **no detail**:

```ts
const handleResetPose = () => {
  window.dispatchEvent(new CustomEvent('synthia:resetPose'));
};
```

`useWorld`'s handler then runs `resetPose()` on **every** binder:

```ts
humanoidPhysicsBindersRef.current.forEach((binder, id) => { ... binder.resetPose(...); });
```

→ every binder → `resetToBindPose()` → arms re-commanded to +1.309 + qpos rewritten. This is a real all-agent fan-out, but it's the **Reset Pose button**, not the spawn path — so yes, separate fix, same reason. Mirror the bodyMode gating that's already in the tree: dispatch `detail: { agentId: activeAgentId }` and reset only `humanoidPhysicsBindersRef.current.get(agentId)`. This is the **only remaining all-agent fan-out** in the codebase after the bodyMode gate landed.

---

**Recommended implementation order:**

1. **#1** — move `setReady(true)` in `spawnAgent` to after restore + add the `isMutating` guard in `onFrame` (root timing bug; smallest diff; kills the sweep at the source).
2. **#3** — move `StateRehydrator.restore` to right after `loadMJCFModel`, and switch object rehydration to name-based.
3. **#2** — `activateMultiBody({ preserveSmoothing: true })` for old binders.
4. **#6** — gate `synthia:resetPose` with `agentId` (independent, quick win).
5. **#5** — `refreshBoneWorldPositions()` before `generateCombinedMCF()`.
6. **#4** — snapshot/reapply MotorController gains + limp across `init()`.

**One important scoping note:** none of these six touch `restArmAngleDeg`. They stop *old agents* from showing a hard arm snap at spawn — which is exactly your symptom ("arms of all previously spawned models move with every new spawn"). The 75° value itself is a separate, quieter issue: it's where arms settle (measured at ~86° visual raise, not arms-down, per the capture documented in `project_info__76.md`). Worth correcting after the motion bug is gone, or the arms will still converge to the wrong rest pose — they just won't visibly sweep on spawn anymore.

If you want the exact line numbers for any of the six edits, say the word and I'll pull them.