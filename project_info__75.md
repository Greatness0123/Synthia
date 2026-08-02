# Synthia — Multi-Agent Cross-Coupling Investigation
**Problem:** When an agent spawns, already-spawned agents (aside from the original) get thrown up, then the remaining models (including the original) have their arms move — i.e., there is a connection linking the agents somewhere in the code.

---

## Verdict: Where the "connection" lives

All agents share a **single MuJoCo `MjModel`/`MjData`** (`PhysicsEngine` is a singleton in `useWorld`). Every agent's physics state lives in the **same flat WASM arrays** (`data.qpos`, `data.qvel`, `data.ctrl`, `data.xfrc_applied`, `data.xpos`, `data.xquat`) indexed by **raw integer body/actuator/geom IDs**. There is no per-agent physics world. Any stale or wrong ID indexes directly into another agent's bodies — that is the fundamental link.

There are **four concrete coupling points** in the code, described below by severity.

---

## 1. THE ARM MOVER — `useWorld`'s `bodyMode` effect fans out to EVERY agent (`setMode` → `resetToBindPose`)

**File:** `src/world/hooks/useWorld.ts` (~line 400 area)

```ts
useEffect(() => {
  if (worldStore.bodyType === 'humanoid') {
    humanoidPhysicsBindersRef.current.forEach((binder) => {
      binder.setMode(worldStore.bodyMode);
    });
  }
}, [worldStore.bodyMode, worldStore.bodyType]);
```

**The chain:**
`setMode('rigid')` in `src/world/engine/HumanoidPhysicsBinder.ts`:

```ts
public setMode(mode: 'rigid' | 'ragdoll'): void {
  if (mode === 'ragdoll') {
    this.motorController.setLimpMode(true);
  } else {
    this.motorController.setLimpMode(false);
    this.resetToBindPose();        // ← wipes EVERY agent's pose/motors
    ...
```

`resetToBindPose()`:

```ts
public resetToBindPose(): void {
  this.setGaitActive(false);
  this.currentTargets.clear();          // ← erases each agent's live motor targets
  this.motorController.resetRamp();     // ← resets the 20-frame servo ramp to 0
  ...writes qpos of all joints to bind pose (arms → armsDownAngle 75°)...
}
```

**Why it matches the symptom exactly:** `resetToBindPose` runs on **every binder** in the map. It clears `currentTargets` and zeroes the motor ramp. MuJoCo's position servos then drive all joints back to the MJCF bind pose — every model's **arms sweep/move** simultaneously. `resetToBindPose` also directly writes joint `qpos` to bind-pose angles for all agents it's called on, so the arms visibly snap.

The regression test `src/world/engine/__tests__/multiAgentComposition.test.ts` already documents this exact family of bugs ("existing agents snap to T-pose when a new agent spawns") — the previous fix addressed the ctrl-ramp restart in `MotorController.init()`, but **this `useWorld` effect still calls `setMode`/`resetToBindPose` on all agents whenever `bodyMode` or `bodyType` changes** (e.g., toggling Rigid/Ragdoll in the UI, or bodyType initialization).

> Note: `spawnAgent()` intentionally only calls `setMode` on the *new* binder (comment "Fix 3"), but this **other** effect is not gated to any single agent — it is the surviving fan-out that links all agents' arms.

---

## 2. THE THROWN-UP — spawn-time vertical snap via stale `boneInfoMap` feet + `targetSpawnGrounded` reset

**File:** `src/world/hooks/useWorld.ts` — inside `spawnAgent()`:

```ts
// Fix 4: After restoring, re-arm spawn grounding... for ALL binders
for (const [, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
  (activeBinder as any).targetSpawnGrounded = false;        // ← re-arms grounding pass
  (activeBinder as any).previousFootPositions?.clear();
}
```

**Then, the very next frame**, `syncVisuals()` in `src/world/engine/HumanoidPhysicsBinder.ts` runs this for **every** (including old) agent:

```ts
if (!this.targetSpawnGrounded && dist >= 0) {
  let lowestFootY = Infinity;
  for (const [name, info] of this.boneInfoMap) {          // ← STALE bind-pose feet
    if (name.includes('foot') || name.includes('toe')) { ... }
  }
  if (lowestFootY < Infinity) {
    const delta = this.groundSurfaceY - lowestFootY;
    if (Math.abs(delta) > 0.001) {
      this.setCapsulePosition(t.x, t.y + delta - this.capsuleCenterY, t.z);  // ← vertical YANK
    }
  }
  this.targetSpawnGrounded = true;
}
```

**Why it matches the symptom:** `boneInfoMap.worldPosition` is only refreshed in `repositionModel()`/`extractBonePositions()` — **never during normal physics-driven movement**. So for an agent that has drifted/walked since spawn, `lowestFootY` is the *original bind-pose* foot height, while `groundSurfaceY` is the *current* ground under the capsule. The `delta` forces an instantaneous vertical teleport of the capsule. If the teleport moves the body into the floor, the contact solver resolves the penetration by launching the agent upward — the "thrown up" pop. It happens only to *already-spawned* agents because only they have stale `targetSpawnGrounded` + stale bone maps (the original agent_0 also gets it if it has moved, which is why the user says "asides the original").

**Supporting detail:** `setCapsulePosition` also zeroes all 6 root velocities, so the agent loses all momentum at the moment of the yank, then the penetration push reads as a violent vertical impulse.

---

## 3. Cross-agent ID indexing — stale/numeric body IDs into the shared `data` arrays

**Files:** `src/world/engine/BodyManager.ts` (`getCapsuleBody`, `getRigidBodiesMap`, `getBoneColliderHandle`), `src/world/engine/HumanoidPhysicsBinder.ts` (`syncVisuals`, `applyKinematicGroundReactionForces`, `applyCapsuleBalance`, `executeJump`, `push`), `src/world/engine/MotorController.ts` (`setTargets`, `setLimpMode`, `applyGainsToModel`).

Every one of these reads/writes the **shared** `data` arrays by numeric ID:

```ts
// BodyProxy (HumanoidPhysicsBinder.ts)
public translation() {
  const idx = this.bodyId * 3;
  // reads this.data.xpos[idx] — this.data is the SHARED MjData
}
public rotation() {
  const idx = this.bodyId * 4;   // this.data.xquat[idx]
}
```

```ts
// MotorController.setTargets — zero-ALL-ours-then-write-ours
this.actuatorMap.forEach((actuatorIds) => {
  for (const id of actuatorIds) { ctrl[id] = 0; }   // if ID stale → zeroes ANOTHER agent's motor
});
```

```ts
// MotorController.applyCapsuleBalance — writes xfrc_applied for one capsule ID
const idx = capsuleBodyId * 6;
xfrc[idx + 3] = tx; xfrc[idx + 4] = ty; xfrc[idx + 5] = tz;
```

**Failure mode:** `BodyManager.remapIdsAgainstLoadedWorld()` re-maps by name after every world reload:

```ts
const rootBodyId = module.mj_name2id(model, ..., this.prefix + 'root_capsule');
if (rootBodyId >= 0) { this.capsuleBodyId = rootBodyId; ... }
```

If `mj_name2id` returns `-1` (name missing from the compiled combined MJCF), the `>= 0` guard silently **keeps the old (dead) numeric ID**. `getCapsuleBody()` then returns an ID that indexes into a different agent's slice of `data.xpos`/`data.xquat` → that binder's **modelRoot and every visual bone follow another agent's physics body** — the literal "connection that links them." Because MuJoCo `body_dofadr[capsuleBodyId]` is also wrong, `applyKinematicGroundReactionForces`/`applyCapsuleBalance`/`executeJump` write impulses/torques into the wrong agent's DOFs → that agent gets "thrown up." This also explains why the effect is intermittent/agent-order dependent (only some agents mis-map).

---

## 4. The world-rebuild trigger itself — spawn compounds the coupling

**File:** `src/world/hooks/useWorld.ts` — `spawnAgent()`:

```ts
const baseXml = generateCombinedMCF();
physicsEngine.loadMJCFModel(baseXml);      // deletes the ONLY MjModel/MjData, builds one world for ALL agents

for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
  activeBinder.getMultiBodyManager().remapIdsAgainstLoadedWorld(...);
  activeBinder.initMotorController();
  if (id === agentId) {
    ... createJointsWithZeroMotors / activateMotors / setMode ...   // new agent
  } else {
    activeBinder.deactivateMultiBody();
    if (worldStore.useMultiBodyPD) await activeBinder.activateMultiBody();  // old agents
  }
}
```

Because there is **one MjModel/MjData for all agents**, spawning a single agent reloads the entire world and requires every existing binder to be re-pointed at the new WASM heap (via `remapIdsAgainstLoadedWorld` + `initMotorController` + `deactivate/activateMultiBody`). Any gap in that chain — a missed `remap`, a `MotorController.init()` that restores `baseGains`, a `deactivateMultiBody()` that fails to re-run `activateMultiBody()` (e.g. `useMultiBodyPD === false` leaving `mbActive=false` while `syncVisuals` still reads proxies) — translates the new agent's mistake into movement on all agents.

**Also at play:** `StateRehydrator.capture(physicsEngine, existingAgentIds, objectsList)` (in `spawnAgent`) only captures/restores state for agents in `existingAgentIds` (old agents, filtered at `const existingAgentIds = Array.from(humanoidPhysicsBindersRef.current.keys()).filter(id => id !== agentId);`). The new agent's state is whatever the baked MJCF positions + `resetPose(spawnPoint)` produce — which is correct only if `generateAgentSubtreeMJCF`'s baked capsule position (`capsulePosThree = {x: hipsWorldPos.x, y: capsuleCenterY, z: hipsWorldPos.z}` in `MJCFHumanoidTemplate.ts`) still matches the visual spawn point. If any old/last binder's `boneInfoMap.worldPosition` is stale, that agent's baked capsule lands at its old spawn coordinate; combined with the post-spawn grounding yank (#2), this is the second contributor to the vertical throw.

---

## Summary table — the links

| # | File / location | Mechanism | Symptom |
|---|---|---|---|
| 1 | `useWorld.ts` bodyMode effect → `setMode('rigid')` → `resetToBindPose()`/`resetRamp()` on **all** binders | Clears every agent's `currentTargets` + motor ramp; servos drive all joints to bind pose | **All remaining agents' arms move** |
| 2 | `spawnAgent()` re-arms `targetSpawnGrounded=false` for all → `syncVisuals()` stale-feet grounding pass | Vertical teleport/penetration + velocity zeroing on old agents | **Already-spawned agents thrown up** |
| 3 | `BodyManager.remapIdsAgainstLoadedWorld` stale-ID fallback; all reads via **numeric IDs into one shared `MjData`** | Stale body/actuator IDs index into another agent's `qpos/qvel/ctrl/xfrc` | Cross-agent arm movement + throws; "connection" between models |
| 4 | `spawnAgent()` full-world `loadMJCFModel` rebuild | Every binder must re-map/re-init; any gap in the chain faults all agents | Amplifies 2+3 on every spawn |

---

## Files involved (full map)

| File | Role |
|---|---|
| `src/world/hooks/useWorld.ts` | Owns the single `PhysicsEngine`, the `Map<agentId, HumanoidPhysicsBinder>`, spawnAgent world-rebuild, per-frame loop iterating **all** binders, and the bodyMode fan-out effect |
| `src/world/engine/PhysicsEngine.ts` | Singleton MjModel/MjData holder; `loadMJCFModel` deletes old world |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Per-agent binder; `syncVisuals` (grounding yank + GRF + AvatarSynchronizer), `setMode`→`resetToBindPose`, `BodyProxy` numeric reads |
| `src/world/engine/BodyManager.ts` | Per-agent ID maps; `remapIdsAgainstLoadedWorld` is the only re-pointing after a world reload |
| `src/world/engine/MotorController.ts` | Zero-all/ctrl-write; ramp; `applyCapsuleBalance` writes to shared `xfrc_applied` |
| `src/world/engine/MJCFHumanoidTemplate.ts` | `generateCombinedMultiAgentMJCF` bakes all agents' poses from (possibly stale) `boneInfoMap.worldPosition` |
| `src/world/engine/StateRehydrator.ts` | Captures/restores old agents' `qpos/qvel/jointAngles/ctrl` across reloads (only for `existingAgentIds`) |
| `src/world/engine/AvatarSynchronizer.ts` | Applies physics world-quaternions to each agent's bones; per-binder but reads shared proxies |

---

## Suggested fixes (for Act Mode)

1. **Gate the bodyMode effect** — apply `setMode`/`resetToBindPose` only to the *active* agent (or only when the value actually differs from the previous value), and never call `resetToBindPose` on agents other than the one being explicitly commanded.
2. **Stop re-arming `targetSpawnGrounded=false` for old agents** in `spawnAgent` — only the newly spawned binder needs the grounding pass. Old agents should keep their current grounding state.
3. **Make stale IDs fail loudly** — in `BodyManager.remapIdsAgainstLoadedWorld`, if `capsuleBodyId` lookup returns `-1`, invalidate the binder (`mbActive=false`, return false) instead of silently keeping the old ID.
4. **Optionally isolate physics per agent** — if true isolation is required, give each agent its own `PhysicsEngine` (its own MjModel/MjData), or at least validate every numeric ID against `model.nbody`/`model.nu` before reading.

---

## Suggested reading order for the fix

1. `src/world/hooks/useWorld.ts` — spawnAgent + per-frame onFrame loop + bodyMode effect (the fans-out)
2. `src/world/engine/HumanoidPhysicsBinder.ts` — `syncVisuals`, `setMode`, `resetToBindPose`, `applyKinematicGroundReactionForces` (the yank + arm snap)
3. `src/world/engine/BodyManager.ts` — `remapIdsAgainstLoadedWorld` (stale-ID risk)
4. `src/world/engine/MotorController.ts` — `init`, `setTargets`, `applyCapsuleBalance` (shared ctrl/xfrc writes)
5. `src/world/engine/__tests__/multiAgentComposition.test.ts` — existing regression tests documenting this exact bug family; add new tests for the two remaining paths above.
