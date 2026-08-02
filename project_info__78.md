# Synthia — Old Agents' Arms Move on Every New Spawn (Corrected Investigation)

## Summary (framing correction)

You're right — the pose is correct; the bug is cross-agent disturbance. **Every time you spawn a new agent, the arms of all previously-spawned agents move.** The mechanism is NOT a wrong pose constant and NOT duplicate motor programs. It's the **spawn-time world rebuild**: spawning calls `physicsEngine.loadMJCFModel()` which **deletes the only `MjModel`/`MjData` and rebuilds one shared world containing all agents**, then re-points every existing binder at the new WASM arrays. During that rebuild, existing binders are torn down and re-activated (`deactivateMultiBody()` + `activateMultiBody()`), their `MotorController`s re-initialized, and their state restored — and every one of those steps has a secondary effect on the old agents' arms, rankable by likelihood.

---

## The spawn-time world rebuild — concrete sequence

`src/world/hooks/useWorld.ts` → `spawnAgent()` (also the `+ Spawn Agent` button → `window.synthia.spawnAgent()`):

```
 1. new HumanoidPhysicsBinder(physicsEngine, scene, 'agent_N')   // new agent only
 2. await binder.loadAndVisualizeBindPose(probePoint)            // adds GLB to scene
 3. binder.ensureCapsuleGeometry(); binder.repositionModel(...)
 4. humanoidPhysicsBindersRef.current.set('agent_N', binder)     // new binder enters shared map
 5. physicsEngine.setMutating(true); physicsEngine.setReady(false)
 6. existingAgentIds = all other agents
 7. capturedState = StateRehydrator.capture(physicsEngine, existingAgentIds, objectsList)
 8. baseXml = generateCombinedMCF()                              // bakes ALL agents' poses
 9. physicsEngine.loadMJCFModel(baseXml)                         // ☠ DELETES the shared MjModel/MjData
10. physicsEngine.setReady(true)                                 // ☠ animation loop resumes NOW
11. for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
      bm.remapIdsAgainstLoadedWorld(...)
      activeBinder.initMotorController()                         // ☠ resets controller state for ALL
      if (id === agentId) { new-agent branch: createJoints/activateMotors/deactivateMultibody/
                            activateMultiBody/setMode(→resetToBindPose) + awaits }
      else { activeBinder.deactivateMultiBody();                 // ☠ clears avatarSynchronizer
             if (useMultiBodyPD) await activeBinder.activateMultiBody(); }  // ☠ await → frame interleaves
    }
12. StateRehydrator.restore(physicsEngine, capturedState, objectsList)   // re-writes qpos/qvel/ctrl
13. new binder only: targetSpawnGrounded=false; previousFootPositions.clear
14. new binder only: setCapsulePosition(spawnPoint); resetPose(spawnPoint) → resetToBindPose()
15. physicsEngine.setMutating(false)
```

**The per-frame loop that applies disturbances to every agent** (same file, the `onFrame` callback passed to `worldEngineRef.current.start`):

```ts
for (const [id, binder] of humanoidPhysicsBindersRef.current.entries()) {
  binder.updateMotorTargets();   // → MotorController.setTargets + applyCapsuleBalance — NO mutating guard
  binder.syncVisuals();          // → BodyProxy reads/writes shared data arrays — NO mutating guard
  ...
}
```

`WorldEngine.start()` only invokes `onFrame` when `physicsEngine.isReady === true`, so the hazard window is exactly **steps 10–15**: `isReady` flips true before the remap loop (which contains `await activateMultiBody()` calls) has re-pointed every binder, and `updateMotorTargets`/`syncVisuals` never check `isMutating`/`isReady`.

---

## Why the arms move — ranked mechanisms (all present in current code)

### 1. `deactivateMultiBody()` clears the `AvatarSynchronizer` on EVERY old binder at EVERY spawn → first sync after reload is a hard snap, not the 0.85 slerp

`src/world/engine/HumanoidPhysicsBinder.ts`:

```ts
public deactivateMultiBody(): void {
  this.observationBuilder.clear();
  this.avatarSynchronizer.clear();   // ☠ wipes prevWorldQuat for ALL bones
  this.mbActive = false;
}
```

`src/world/engine/AvatarSynchronizer.ts` `synchronize()`:

```ts
const prev = this.prevWorldQuat.get(canonicalName);
if (prev) {
  smoothedQuat.copy(prev).slerp(rawWorldQuat, this.smoothingAlpha);  // normal 0.85 slerp
} else {
  smoothedQuat.copy(rawWorldQuat);    // ☠ no prev → HARD SET to whatever physics says this frame
}
```

Normal operation hides physics-vs-visual discrepancies via 85% slerp. After `deactivateMultiBody()` + `activateMultiBody()`, the synchronizer re-registers with an empty `prevWorldQuat`, so the **first `syncVisuals()` after a spawn hard-sets every bone to the raw physics quaternion**. Any offset between the physics pose the restore produces and the pose the visuals were holding becomes an instant visible arm snap. The offset source is #3.

### 2. `initMotorController()` → `MotorController.init()` resets per-binder controller state on EVERY old binder at EVERY spawn

`src/world/engine/MotorController.ts` `init()`:

```ts
this.globalStiffnessScale = 1.0;
this.globalDampingScale = 1.0;
this.limpModeActive = false;
// (simulationStepCount deliberately preserved — the ramp fix)
```

So if anything set non-default gains (the `setGainScale(...)` public API or a prior `setLimpMode`), a spawn silently restores units — `baseGains` are re-read from the fresh model and the scaled values the servos were running on are gone. A servo stiffness discontinuity makes joints (especially the low-gain arms, kp=200) visibly re-settle. Latent unless the user/UI touched stiffness, but a real "arms move with no command" contributor.

### 3. The MJCF bake uses STALE `worldPosition` but LIVE bone quats → baked pose ≠ exact restored pose → the #1 hard snap lands on a slightly different pose

`src/world/engine/MJCFHumanoidTemplate.ts` `buildBodyTreeXML()`:

```ts
const threePos = boneInfo.worldPosition.clone();   // ☠ refreshed only in repositionModel()/extractBonePositions()
const threeQuat = new THREE.Quaternion();
bone.getWorldQuaternion(threeQuat);                // live — avatarSynchronizer has been slerping it
```

`boneInfo.worldPosition` is a snapshot taken at bind-pose extraction and is **never updated during physics-driven movement**. Any agent that has moved (walked, raised an arm) before the spawn is then baked with joint centers at the OLD bind positions but orientations at the CURRENT pose. After reload + `StateRehydrator.restore` (exact qpos), the cleared synchronizer hard-sets visuals to the restored pose while the baked body geometry sits at stale coordinates → arm-length mismatch → visible displacement/snap.

### 4. The interleave frame: `setReady(true)` precedes the remap loop; the loop's `await activateMultiBody()` yields to the browser; `updateMotorTargets()`/`syncVisuals()` have no mutating guard

`src/world/hooks/useWorld.ts` — step 10 before step 11, and inside step 11:

```ts
if (worldStore.useMultiBodyPD) {
  await activeBinder.activateMultiBody();   // ☠ yields → a rAF fires mid-rebuild
}
```

`MotorController.setTargets()` zeroes "our" actuators by raw numeric ID:

```ts
this.actuatorMap.forEach((actuatorIds) => {
  for (const id of actuatorIds) { ctrl[id] = 0; }   // stale ID → zeroes ANOTHER agent's ctrl
});
```

`applyCapsuleBalance()` writes `xfrc_applied[capsuleBodyId * 6 + 3..5]` — the range guard only rejects `>= model.nbody`, not in-range IDs belonging to another agent.

In the normal spawn order the old agents' numeric ID ranges are preserved by layout luck (agent subtrees are emitted first, in map insertion order, with stable body counts — floor/env slots/piano come after), so this is mostly latent today. It becomes a hard cross-write whenever the combined world's body ordering diverges (custom meshes, env-slot insertion, agent reordering, or spawns while a move happened). It is the same "connection" documented in `project_info__75.md` — the shared-`MjData` numeric-ID indexing — but the four prior fixes (loud remap failure, ramp preservation, gated grounding re-arm, gated `setMode`) already neutralized most of its triggers.

### 5. `StateRehydrator` restores qpos/qvel/ctrl but NOT the per-binder `currentTargets` Map

`src/world/engine/StateRehydrator.ts` restores by actuator **name**:

```ts
for (const [actName, value] of Object.entries(state.ctrl)) {
  const ai = module.mj_name2id(...); if (ai >= 0) data.ctrl[ai] = value;
}
```

It does not touch `binder.currentTargets` (a JS Map that survives the reload intact — good), but it also does not re-validate that the restored ctrl matches what `setTargets` will write next frame. Since the interleave frame (#4) runs `setTargets(currentTargets)` BEFORE `restore` runs, ctrl is overwritten with the JS targets, then `restore` overwrites them back with the captured values — benign only when both agree. Any drift becomes a one-frame servo jump on old agents.

---

## The two remaining ALL-AGENT disturbance sources outside spawn

### A. Reset Pose button — still fans out to ALL agents (the last unfixed fan-out)

`src/components/godmode/BodyControls.tsx` → dispatches `synthia:resetPose` with **no agentId**:

```ts
const handleResetPose = () => {
  window.dispatchEvent(new CustomEvent('synthia:resetPose'));
};
```

`src/world/hooks/useWorld.ts` `handleResetPose`:

```ts
humanoidPhysicsBindersRef.current.forEach((binder, id) => { ... binder.resetPose(...) });   // ☠ ALL agents → resetToBindPose → arms re-commanded, qpos rewritten
```

### B. The bodyMode effect — already gated (confirmed in current code)

```ts
binder.setMode(worldStore.bodyMode, { resetPose: id === activeId });   // active agent only ✓
```

This was the historical "all arms move" fan-out (see `multiAgentComposition.test.ts` regression) and is fixed in the current tree. The Reset Pose handler (A) is now the only surviving all-binder command path.

---

## "Why arms specifically?" — the amplification detail

Arms are the most visibly affected joints because:

1. They are the lowest-gain servos (`getMuJoCoBoneGains`: arms kp=200 / kv=40; knees 1000, hips 900) — a state discontinuity (hard snap, gain reset, one-frame ctrl overwrite) moves them more and longer than stiff joints.
2. `resetToBindPose()` explicitly commands both arms to `restArmAngleDeg × π/180` with a **qpos pre-seed** — any time an old binder's `resetToBindPose` runs (currently only via the Reset Pose button, `program_sequence:["stand"]`, or `isOutOfWorldBounds`), its arms are the joints that visibly jump.
3. `AvatarSynchronizer` slerps rotation only (syncTranslation: false) — rotational disturbances (arm pitch) are the ones the visuals chase.

---

## Recommended fix directions (for Act Mode)

1. **Make `syncVisuals()` / `updateMotorTargets()` skip while the physics world is being mutated/rebuilt.** Add a guard in `HumanoidPhysicsBinder` for `this.physicsEngine.isMutating` (and/or a `worldDirty` flag that `spawnAgent` raises from step 5 until step 15). This closes hazard window #4 completely — no binder reads/writes the shared arrays with stale or half-remapped IDs.
2. **Don't `clear()` the AvatarSynchronizer on old binders during a spawn.** `deactivateMultiBody()` + `activateMultiBody()` exists to re-point at the new world's IDs; add a variant that preserves `prevWorldQuat` (or re-sync `prevWorldQuat` from the restored pose) so the hard-set snap (#1) cannot occur. The hard-set is what turns sub-pixel restore error into a visible arm jump.
3. **Refresh `boneInfoMap.worldPosition` before `generateCombinedMCF()`.** Call a `refreshBoneWorldPositions()` (or reuse `repositionModel`-style update) on every binder right before the bake, so baked joint centers match current poses (#3).
4. **Gate the Reset Pose button per agent.** Dispatch `synthia:resetPose` with `detail: { agentId: activeAgentId }` and have `handleResetPose` reset only that binder (mirror of the bodyMode fix).
5. **Reduce the interleave window.** Move `StateRehydrator.restore` directly after `loadMJCFModel`/`setReady` and before the remap loop's first `await` — or collect all remap/activate work synchronously with no `await` between `setReady(true)` and the last binder re-point. Every `await` in the loop is a frame where old binders act on a half-restored world.
6. **Have `MotorController.init()` preserve gain/limp state** (capture before reload, re-apply after) instead of resetting `globalStiffnessScale = 1.0` / `limpModeActive = false` unconditionally.

## Suggested reading order

1. `src/world/hooks/useWorld.ts` — `spawnAgent()` (steps 5–15 above) + the per-frame `onFrame` loop
2. `src/world/engine/HumanoidPhysicsBinder.ts` — `syncVisuals()`, `deactivateMultiBody()`, `activateMultiBody()`, `resetToBindPose()`
3. `src/world/engine/AvatarSynchronizer.ts` — the `prevWorldQuat`-less hard set
4. `src/world/engine/MotorController.ts` — `init()` state resets, `setTargets()` zero-all-then-write
5. `src/world/engine/StateRehydrator.ts` — what is and is not restored across the reload
6. `project_info__75.md` — the four already-fixed coupling paths this report builds on
