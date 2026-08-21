# RMBS v1 Plan Audit — Synthia 1.5.1 (MuJoCo WASM humanoid)

**Audited plan:** REACTION-MASS BALANCE SYSTEM (RMBS) v1 — physical sliding reaction-mass actuator + closed-form COM-tracking balance, wrapped in a mode-machine.
**Audit scope:** read-only verification of every integration point against this codebase, all conflicts/corruptions, solver stability, sign/axis checks, unforeseen consequences, and a refined implementation plan.

---

## A) VERDICT

**Yes — with changes.** Confidence: **0.65 / 1.0** (medium-high).

The codebase is unusually well-prepared for this plan: a true 500 Hz per-step hook already exists and is exercised in production (`WorldEngine.start(onStep)` → `useWorld.ts` per-binder loop calling 3 controllers per step), the established `ComReflexController` already implements the exact closed-form the RMBS needs as a rival (COM error + capture point + forced step with per-leg FSM and mandatory-plant exit), and MuJoCo runs at `timestep=0.002` with `integrator="implicitfast"` and `iterations=200` — a stiff, 500 Hz-stable configuration.

The plan **cannot be dropped in verbatim**. Five concrete blockers must be resolved first, each with an exact, codebase-verified edit (Section B):

1. **The 120 N·m capsule-balance torque (`applyCapsuleBalance`) and the Road-4 COM reflex will actively fight the reaction mass.** The plan says "disable balance" but only names `applyCapsuleBalance`; the reflex (`applyComReflexStep`) must also be gated in GROUNDED/AIRBALL and **must be force-disabled in ACROBATIC** — the existing reflex would fight an authored somersault (it fires lean corrections and forced steps mid-flip). This is the single most important missing piece in the plan.
2. **`computeComWorld` / `refreshReflexBodyCache` (Road-4) and the `useWorld` diagnostics silently include every body whose name doesn't start with `env_slot_`/`piano_`/`floor`/`world` — the new `reaction_mass` body will corrupt the Road-4 reflex COM and all displayed COM telemetry.** Must exclude by name.
3. **`HUMANOID_MASS_KG = 90` (kinematic GRF) and `push()`'s hard-coded `mass = 70` go stale** once +12 kg is added (real total ≈ 102). `push()` already overestimates ΔV by ~30% today; the gates T3/T6 rely on `push()`.
4. **Support center cannot be computed from `getContactForceRegistry()` alone** — the registry stores force/normal per geom but **no contact position**. Only the raw `data.contact[]` loop (pattern already exists in `useWorld.ts` diagnostics) yields contact position; or use the Road-4 sole-gap stance convention (`PLANTED_GAP_M = 5 mm`), which is the established "groundedness" ground truth for stand/walk.
5. **The authored timeline carries no reference torso up-vector, contact schedule, or COM offset** — only per-bone joint overrides + `rootMotion`. The RMBS "reference state from the authored timeline" must fall back to world-up + actual-physics torso orientation (plan already allows this) and derive its acrobatic trigger from **actual** capsule/spine2 `xquat`, not the timeline.

Everything else in the plan maps cleanly, with exact signatures below.

---

## B) REFINED PLAN — exact files + edits

### B.1 Physical mechanism — `src/world/engine/MJCFHumanoidTemplate.ts`

The "pelvis" is the **`root_capsule` body** (the codebase's mass-heavy root, `mass="15.0"`, `diaginertia="2.5 1.2 2.5"`, `contype="0" conaffinity="0"`) with `<freejoint name="${prefix}root_freejoint"/>`. `mixamorighips` is a `fixed`-joint child **below** it. Add the reaction-mass body **inside the `root_capsule` body block**, after `${hipsBranch}`:

```xml
<body name="${prefix}reaction_mass" pos="0 0 0">
  <joint name="${prefix}rm_slide_lr" type="slide" axis="1 0 0" range="-0.4 0.4" limited="true" damping="2" armature="0.2"/>
  <joint name="${prefix}rm_slide_fa" type="slide" axis="0 1 0" range="-0.4 0.4" limited="true" damping="2" armature="0.2"/>
  <inertial pos="0 0 0" mass="12.0" diaginertia="0.25 0.25 0.25"/>
  <geom name="${prefix}reaction_mass_geom" type="sphere" size="0.18" pos="0 0 0" contype="0" conaffinity="0"/>
</body>
```

and append to `actuatorsXml`:

```xml
<position name="act_${prefix}rm_slide_lr" joint="${prefix}rm_slide_lr" kp="1500" kv="100" ctrlrange="-0.4 0.4" forcerange="-400 400"/>
<position name="act_${prefix}rm_slide_fa" joint="${prefix}rm_slide_fa" kp="1500" kv="100" ctrlrange="-0.4 0.4" forcerange="-400 400"/>
```

**Coordinate convention (verified):** MuJoCo is **Z-up** (`gravity="0 0 -9.81"`; `executeJump` boosts `qvel[dofAdr+2]`). The mapping is `worldToMuJoCo(v)=[v.x, -v.z, v.y]`, `mujocoToWorld(p)={x:p[0], y:p[2], z:-p[1]}`. **Forward (Three) = (0,0,-1) = MuJoCo +Y.** So with an identity-orientation root capsule:
- left/right slide axis = **`1 0 0`**
- fore/aft slide axis = **`0 1 0`**

These axes are declared in the child body's local frame; since the root capsule is free (6-DOF), the rails **tilt with the pelvis**. The controller must rotate the world-frame desired displacement into the pelvis frame using `data.xquat[capId*4..+3]` each step (see B.3). A sign error here turns the system into a destabilizer — this is the plan's own risk #8 and it is real.

Because `generateCombinedMultiAgentMJCF` calls `generateAgentSubtreeMJCF` per agent with `prefix`, the RM body + actuators are automatically multi-agent isolated (names `agent_N_reaction_mass`, etc.).

**Critical wiring rule:** the RM actuators must **NOT** be added to `BodyManager.actuatorMap` (i.e., don't add a `reaction_mass` key to `boneInfoMap`/`bodyMap`). `MotorController.setTargets()` zeroes `data.ctrl` for **every actuator in its own map** at the 60 Hz flush (`onFrame`), which runs **after** the 500 Hz `onStep` in the same frame. If the RM actuators were in that map, the pose flush would clobber the RM command every frame.

### B.2 New controller — `src/world/engine/ReactionMassController.ts` (new file)

Pattern after `ComReflexController` (pure math + tiny latches; deterministic; unit-testable without MuJoCo):

```ts
export interface ReactionMassInput {
  cTotal: {x,y,z};        // world COM incl. RM (from data.subtree_com[body0*3..] in MuJoCo frame, or mass-weighted sum)
  mTotal: number;         // total mass incl. RM (dynamic: sum model.body_mass over agent bodies)
  pRmMj:  {x,y,z};        // RM body xpos (MuJoCo frame)
  vRmMj:  {x,y,z};        // RM body linvel (data.cvel[cv+3..])
  mRm: number;
  vComMj: {x,y,z};        // robot-only COM velocity (MuJoCo frame)
  h: number;              // COM height above ground
  supportCenterMj: {x,y}; // support center (MuJoCo frame)
  torsoUpMj: {x,y,z};     // actual torso/root up vector (from capsule xquat or spine2 xquat)
  acrobaticFlag: boolean; // explicit override from the action pipeline
  saturatedWindowS: number; // reactive-step window remaining
  dt: number;
  params: ReactionMassParams; // mRm, railRange, kCap, saturationThreshold, stepWindowS
}
export interface ReactionMassCommand {
  ctrlLr: number; ctrlFa: number;   // absolute qpos targets for the two position actuators
  mode: 'grounded' | 'airball' | 'acrobatic' | 'saturated';
  saturated: boolean;
}
```

Laws:
- **Mode select each step:** `acrobatic` if flag OR `dot(torsoUpMj, [0,0,1]) < 0.5` (actual up, MuJoCo +Z; 0.5 ≈ 60° — the plan's "~0.5" threshold). Else `airball` if **no actual contact**; else `grounded`.
- **GROUNDED:** `target = supportCenter + kCap·vCom·√(h/g)` (world horizontal). Convert to MuJoCo `[x, y]`, then to pelvis-local slide coordinates: `qposDes = dot(pDes − anchor, eAxis)` where `eAxis` = rotated slide axis (`eWorld = R_pelvis · eLocal`). `pRmDes = (M·target − m_r·c_r)/m_rm` (algebra verified: `M·C = m_r·c_r + m_rm·p_rm` ⇒ `p_rm_des = (M·target − m_r·c_r)/m_rm`). Clamp to rails. If clamped residual > saturation threshold → latch `saturated`.
- **AIRBALL:** hold centered (target 0,0) + mild anti-spin: accelerate the mass along the two slide axes to oppose the horizontal component of the torso angular velocity (`data.cvel[capId*6+0..2]` projected onto the slide axes, factored by the lever arm). Note the physics: with a pelvis-centered rail the lever arm ≈ small, so reaction-wheel authority is **weak** — keep this law minimal and never let it exceed the rails.
- **ACROBATIC:** `ctrl = 0` targets (hold-centered), no correction. Passivity is the feature.
- **SATURATED:** hold `ctrl` at the rail while a reactive step is dispatched (B.4); resume after `stepWindowS = 0.4`.
- Write `data.ctrl[actIdLr] = qposDes`, `data.ctrl[actIdFa] = qposDes` directly. Cache body/joint/actuator ids; **re-attach lazily when `world.model` pointer changes** (survives world recompile + rehydrate).

### B.3 Binder wiring — `src/world/engine/HumanoidPhysicsBinder.ts`

1. Add fields: `private reactionMass: ReactionMassController = new ReactionMassController();` + `private reactionMassEnabled = false;` + `public lastRmbsStats`.
2. Add `public applyReactionMassStep(dtS = 0.002): boolean` (returns false unless `buildStep === 'D' && reactionMassEnabled`). It: (a) reads `data.subtree_com[0*3..]` / `data.subtree_linvel[0*3..]` — **this is the codebase's answer to "how to read subtree_com"**: `world.data.subtree_com` / `world.data.subtree_linvel` exist on the WASM `MjData` (3 floats/body, MuJoCo world frame) but are currently **unused**; the codebase instead hand-rolls mass-weighted sums. Either works; the built-in is O(1) per body and is what the plan's `M·C_total` wants; (b) reads RM body xpos/cvel via `name2id(BODY, prefix+'reaction_mass')`; (c) computes support center (B.4); (d) calls `reactionMass.computeStep(...)`; (e) writes `data.ctrl`.
3. **Gate the existing controllers by RMBS mode** — the plan's mode machine must extend over the whole per-step stack:
   ```ts
   public applyBalanceStep(): boolean {
     if (this.buildStep !== 'D') return false;
     if (this.reactionMassEnabled && this.reactionMass.mode() !== 'airball') {
       // zero the xfrc torque slot so a stale 120 N·m torque doesn't linger
       const cap = this.bodyManager.getCapsuleBody();
       const xfrc = this.physicsEngine.getWorld().data.xfrc_applied;
       xfrc[cap*6+3] = xfrc[cap*6+4] = xfrc[cap*6+5] = 0;
       return true;
     }
     ...existing applyCapsuleBalance...
   }
   ```
   and in `useWorld`'s per-step loop, when the RMBS reports `acrobatic`, also skip `applyComReflexStep` (and the RMBS controller is already in hold mode). The Road-3 root **velocity** drive already self-suspends airborne (`applyRootVelocityDrive` checks `_isGrounded`) so a flip isn't fought by it, but the reflex is not airborne-gated — it must be mode-gated.
4. **Exclude the RM body from the Road-4 COM readers:** in `refreshReflexBodyCache()`, add `|| name.includes('reaction_mass')` to the skip condition, and same in `computeComWorld`'s skip test. This is the exact corruption the plan's risk #2 warned about.
5. **Fix the mass constants:** replace `HUMANOID_MASS_KG = 90` with a dynamic `sum(body_mass)` over the agent's bodies (or `90 + mRm`), and replace `push()`'s `const mass = 70` with the same dynamic sum.
6. Add `getReactionMassController()`, `setReactionMassEnabled(bool)`, `setReactionMassAcrobatic(bool)` (explicit flag), and reset hooks: in `resetToBindPose()`/`resetPose()` command RM `ctrl=0` + slide `qpos=0`.

### B.4 Support center — reuse the established patterns, no new low-level API

For standing/walking gates (T1, T2, T3, T4, T6): use the **Road-4 sole-gap convention** — a foot is planted when its sole gap ≤ `PLANTED_GAP_M = 0.005` (`footSoleGapM()` already exists in the binder; gap = `xpos[foot*3+2] + 0.02 − 0.01`). Support center = average of planted foot `xpos` (MuJoCo frame). This matches the existing stance logic exactly and needs zero new physics access.

For general body-part contact (sit/lie, T5 landing): iterate the **raw contact array** — the exact loop already written in `useWorld.ts` diagnostics (`d.contact.get(i)`, `contact.geom1/geom2`, `contact.pos`, `mj_contactForce` with a `DoubleBuffer(6)`) — filter to this agent's geoms (name prefix), weight by normal force. `getContactForceRegistry()` is **not sufficient** (no contact position); a small `PhysicsEngine.getRawContacts(): {geom1, geom2, pos, normal, force}[]` helper would DRY the duplicated loop (see D).

**Groundedness ground truth for the mode machine:** do not use `_isGrounded` (capsule-bottom-vs-ground-ray) — during walking the pelvis capsule is above ground while feet are planted, so `_isGrounded` is false mid-gait. Use "any agent geom in contact (registry) OR either sole planted (Road-4 gap test)".

### B.5 Production hook — `src/world/hooks/useWorld.ts`

In the existing per-step closure passed to `worldEngine.start(onStep, onFrame)` (the 500 Hz loop), add one line per binder after the existing three:

```ts
binder.applyBalanceStep();
binder.applyRootVelocityDrive(performance.now());
binder.applyComReflexStep(0.002);
binder.applyReactionMassStep(0.002);   // NEW
```

Ordering is correct: the 60 Hz pose flush (`binder.updateMotorTargets()`) runs later in `onFrame`, and since the RM actuators are absent from the pose `actuatorMap`, the frame flush cannot clobber the RM `data.ctrl` written in `onStep`. `WorldEngine.ts` itself needs **no change** — `start(onStep?, onFrame?)` is a plain callback hook.

Optional: `src/store/worldStore.ts` add `useReactionMass: boolean` (default true) + setter, wired as a dependency like `useMultiBodyPD`, so the feature can be toggled from the UI and off in regression tests.

### B.6 Gates — `src/world/engine/__tests__/road5ReactionMass.test.ts` (new)

Clone the `road4ComReflex.test.ts` harness exactly (deterministic 500 Hz loop, `STEPS_PER_FRAME = 8`, `GLTFLoader` disk mock, warm-up settle, `applyFrame`). Per-step loop mirrors useWorld: `applyBalanceStep → applyRootVelocityDrive → applyComReflexStep/applyReactionMassStep` (with the mode gates). The "3 random pushes" of T3 and the "big push" of T6 use the existing `synthia:push` / `binder.push(part, impulse)` path — **after the B.3 mass fix**, since `push()` currently divides by 70 while the real mass is ~90 (and ~102 with the RM).

Also extend the existing `src/world/engine/__tests__/multiAgentComposition.test.ts` to assert the RM body/joints/actuators are present and isolated for `agent_0` vs `agent_1` (prefix scan), and that `StateRehydrator.capture/restore` round-trips the RM slide `qpos`/`ctrl` (it will, automatically, because `StateRehydrator` scans all joints/actuators by prefix — a built-in free win, no edit needed).

### B.7 Diagnostics — no code change required

`PhysicsDiagnostic` iterates `BodyManager.getRigidBodiesMap()`, which only contains `root_capsule` + bone keys — the RM body will **not** appear (it must not be added to `bodyMap`). For RM-specific telemetry, expose `window.__SYNTHIA_RMBS__` with mode/mass/com/support from `lastRmbsStats`, and optionally reuse binder `renderDebugSpheres` to draw the mass/COM/support points. The `useWorld` diag ring COM (used in fall diagnosis exports) **will** include the RM mass — display-only skew; fix by adding the same name exclusion to the diag ring's body loop if the exports must stay comparable to pre-RMBS runs.

---

## C) UNFORESEEN CONSEQUENCES + MITIGATIONS

| # | Consequence | Why it happens | Mitigation |
|---|---|---|---|
| 1 | **Road-4 reflex fights RMBS AND fights flips** | `applyComReflexStep` runs unconditionally per 500 Hz step; it injects spine2 lean + swing-hip capture deltas. During an authored somersault it fires forced steps mid-air. | Mode-machine gate must span balance + reflex + RMBS together. ACROBATIC → skip `applyBalanceStep` + `applyComReflexStep`, RMBS holds. This gate is the plan's #1 missing piece. |
| 2 | **60 Hz pose flush clobbers RM ctrl** | `MotorController.setTargets()` zeroes + rewrites ctrl for every actuator in its `actuatorMap` during `onFrame`, which runs after `onStep` in the same frame. | Never add `reaction_mass` to `BodyManager.actuatorMap`/`bodyMap`. RM controller writes `data.ctrl` directly (outside the pose map). |
| 3 | **Road-4 COM corrupted by the RM mass** | `refreshReflexBodyCache()`/`computeComWorld()` include every non-env body; `reaction_mass` passes the filter. The reflex's lean + capture math silently degrades. | Add `name.includes('reaction_mass')` to both skip filters (B.3.4). |
| 4 | **Stale mass constants** | `HUMANOID_MASS_KG = 90` (KGRF) and `push()`'s `mass = 70` become wrong; `push()` is already 25–30% off today even without the RM. T3/T6 push magnitudes would be chaotic. | Dynamic mass sum in both sites (B.3.5). |
| 5 | **Slide rails tilt with the pelvis** | Joint axes live in the child (pelvis) frame; pitch/roll tilts the rails, so gravity biases the mass along the rails. | High-kp position servo holds the mass against gravity (it shows up only as a static load, not instability). Controller must rotate world targets into the pelvis frame via `xquat` each step. Add `damping="2"` + `armature="0.2"` to kill rail chatter. |
| 6 | **Limit-bounce energy at ±0.4 rails** | `limited="true"` hinges are hard stops; a 12 kg mass driven hard into a stop injects energy. | `armature` on the joints, `kv` damping, keep `kp ≤ 1500`, `forcerange ±400`, and clamp targets with a soft ramp near the rail (the RMBS saturation latch fires before hard contact with the stop). |
| 7 | **Support center wrong = active destabilizer** | Registry lacks contact positions; wrong center flips the sign of the corrective mass displacement. | Use Road-4 sole-gap stance for stand/walk (exact, already tested); raw `data.contact.pos` loop (already in useWorld) for sit/lie/landing. |
| 8 | **AIRBALL reaction-wheel authority is weak** | Translational rails through the pelvis give a tiny lever arm; linear acceleration produces near-zero torque about the COM. | Keep AIRBALL minimal (hold-centered + mild damping). Do NOT rely on it to recover spin. The somersault is won by passivity (ACROBATIC), not active damping. |
| 9 | **No reference torso/contact/COM in the authored timeline** | Timeline schema is `{timeOffsetMs, overrides}` only; `rootMotion` is a velocity hint. | Use actual physics for the torso-up trigger (`xquat`), world-up fallback for reference, and the explicit `acrobaticFlag` override. Add optional artifact fields later if needed. |
| 10 | **`_isGrounded` is the wrong groundedness signal** | Capsule-bottom-vs-ground-ray is false while walking (pelvis above ground, feet planted). | Mode machine uses registry-contact OR sole-planted (B.4). |
| 11 | **Somersault spin-rate shaping (unexpected bonus)** | Moving the mass radially toward/away from the rotation axis changes moment of inertia mid-flip (figure-skater effect). | Not required by the plan; don't fight it — ACROBATIC hold-centered is fine. |
| 12 | **Rehydrate/rollback is free but must be re-attached** | `StateRehydrator` captures RM slide `qpos`/`qvel`/`ctrl` automatically (prefix scan). The new `MjModel` has different ids. | RM controller re-attaches lazily on `world.model` pointer change (B.2). |
| 13 | **Multi-agent crosstalk** | Two agents each with `reaction_mass` bodies — absolute names clash without prefix. | Prefix-based naming (`generateAgentSubtreeMJCF(prefix)`), one `ReactionMassController` per binder. Verified: the combined-MJCF generator already prefixes every body/joint/actuator. |
| 14 | **`resetToBindPose` leaves RM ctrl hot** | It only resets the pose map's joints. A high RM ctrl persists across reset. | Reset hook in `resetPose()`/`resetToBindPose()` (B.3.6). |

---

## D) MISSING APIS THAT MUST BE ADDED FIRST

1. **`ReactionMassController.ts`** (new) — the controller itself; the single biggest new piece. Model it structurally on `ComReflexController` (pure math, injectable inputs, stats + `diagnose()` for the gates).
2. **Binder methods** — `applyReactionMassStep(dtS)`, `setReactionMassEnabled(bool)`, `setReactionMassAcrobatic(bool)`, `getReactionMassController()`, `lastRmbsStats`; balance/reflex mode gates; RM-name exclusions in `refreshReflexBodyCache`/`computeComWorld`; dynamic mass in KGRF + `push`.
3. **MJCF emission** — RM body + 2 slide joints + 2 position actuators in `generateAgentSubtreeMJCF` (flows into both single- and combined-agent XML).
4. **`useWorld.ts`** — 1-line per-binder call in the existing 500 Hz `onStep` closure; optional `worldStore.useReactionMass` flag.
5. **Optional but recommended:** `PhysicsEngine.getRawContacts()` helper — extracts the `data.contact[]` + `mj_contactForce` loop that is currently copy-pasted in `useWorld.ts` diagnostics, so the RMBS support-center reader and the diag ring share one implementation.
6. **No new MuJoCo API needed** — `data.subtree_com` and `data.subtree_linvel` already exist on the WASM `MjData` (unused today, exactly what the plan's `M·C_total` wants); `data.xpos`/`data.cvel`/`data.xquat`/`data.ctrl`/`data.qpos`/`data.qvel` are all already read through `PhysicsEngine.getWorld()`.

---

## Integration Point Reference (task 1)

| Plan asks | Exact location & signature |
|---|---|
| Root/pelvis body + coordinate convention | `src/world/engine/MJCFHumanoidTemplate.ts` → `generateAgentSubtreeMJCF(..., prefix)` builds `<body name="${prefix}root_capsule">` with `<freejoint name="${prefix}root_freejoint"/>`, inertial mass 15.0, `contype="0" conaffinity="0"` capsule. Convention: MuJoCo Z-up, X-right, **+Y = forward** (= Three −Z); mapping `worldToMuJoCo(v)=[v.x,−v.z,v.y]` in `src/world/engine/PhysicsEngine.ts`; `gravity="0 0 −9.81"`, `timestep="0.002" iterations="200" integrator="implicitfast"` in `generateHumanoidMJCF`. |
| 500 Hz hook + timeline readability | `WorldEngine.start(onStep?: () => void, onFrame?: () => void)` (`WorldEngine.ts`, `FIXED_TIMESTEP = 0.002`). Production wiring: `src/world/hooks/useWorld.ts` start(...) closure calls per binder `applyBalanceStep(); applyRootVelocityDrive(performance.now()); applyComReflexStep(0.002)` per 500 Hz step. Timeline (authored pose) is readable: `binder.timelineQueue`/`timelineSequenceStart` are private but steppable via `syncVisuals()` at 60 Hz; **no reference torso/contact/COM fields exist in the timeline schema** — fallback required (C9). |
| Contact/support API | `PhysicsEngine.getContactForceRegistry(): Map<number, ColliderContactState>` with `{inContact, impulse_magnitude, contact_normal:[x,y,z], contact_force?:[x,y,z], max_force_magnitude, lastUpdate}` (MuJoCo frame; `contact_normal` = contact frame's first column). Geom ids via `BodyManager.getBoneColliderHandle(boneName)`. **No contact position stored** → raw `data.contact[]` loop (pattern in `useWorld.ts` diag) or Road-4 sole-gap stance (`PLANTED_GAP_M = 0.005`, `footSoleGapM()` in binder) for support center. |
| subtree_com / subtree_linvel / body xpos | No wrappers exist. `world.data.subtree_com` / `world.data.subtree_linvel` (Float64Array, `bodyId*3`, MuJoCo frame) are available on the WASM `MjData` but unused. Body xpos: `data.xpos[bodyId*3+0..2]` (MuJoCo frame), wrapped by `BodyProxy.translation()/linvel()/angvel()`. Established codebase pattern is the hand-rolled mass-weighted COM: `HumanoidPhysicsBinder.computeComWorld()` (private) + `refreshReflexBodyCache()` (private, body-id cache built at enable). |

## Conflicting readers/writers (task 2) — complete list

| Site | What it reads/writes | RMBS conflict | Fix |
|---|---|---|---|
| `HumanoidPhysicsBinder.computeComWorld()` | mass-weighted COM+vel over all non-env bodies | Includes RM → Road-4 lean/capture math corrupted | Name-exclude `reaction_mass` |
| `HumanoidPhysicsBinder.refreshReflexBodyCache()` | builds the body-id list | Same | Name-exclude |
| `useWorld.ts` diag ring bodyCache + inline COM sum | all non-env bodies | Displayed COM (fall diagnosis exports) skews by RM position | Name-exclude (or accept skew) |
| `com_pendulum_recorder.js` | same COM sum, browser console | Recorded COM data skew | Name-exclude (console-only tool) |
| `PhysicsDiagnostic` | iterates `BodyManager.getRigidBodiesMap()` only | **Safe** — RM absent from bodyMap | none |
| `MotorController.setTargets()` / `setTargetAngle()` / `setLimpMode(true)` | zeroes+rewrites ctrl for **its own actuatorMap** at 60 Hz | RM ctrl would be clobbered **if** RM actuators enter the map | Keep RM out of `BodyManager.actuatorMap`; RM writes `data.ctrl` directly |
| `MotorController.applyCapsuleBalance()` | writes `data.xfrc_applied[cap*6+3..5]` torque (≤120 N·m) + zeroes force slots, per step | Fights the RM in GROUNDED; also runs mid-flip | Gate/zero when RMBS active; skip in ACROBATIC |
| `HumanoidPhysicsBinder.applyBalanceStep()` | caller of the above; called from useWorld + road2/3/4 gates | Same | Same |
| `HumanoidPhysicsBinder.applyComReflexStep()` | additive spine2 lean + swing-hip capture deltas per step | Fights RMBS; fights flips | Mode gate (skip in ACROBATIC; keep with RMBS only if tuned together) |
| `HumanoidPhysicsBinder.applyKinematicGroundReactionForces()` | qvel impulse using `HUMANOID_MASS_KG = 90` | Stale once mass = 102 | Dynamic mass sum |
| `HumanoidPhysicsBinder.push()` | qvel impulse using hard-coded `mass = 70` | Already wrong; T3/T6 pushes become untunable | Dynamic mass sum |
| `StateRehydrator.capture/restore` | scans all joints+actuators by `prefix` | **Benign/free win** — RM slide qpos/qvel/ctrl round-trip automatically | none (re-attach RM ids on model change) |
| `resetToBindPose()` / `resetPose()` | resets pose-map joints only | RM slide ctrl/qpos not reset → mass stays displaced | RM reset hook |
| `BodyManager` (bodyMap/geomMap/actuatorMap) | maps only `boneInfoMap` keys | RM deliberately unmapped (correct) | none |

## Solver stability assessment (task 3)

Config: `timestep=0.002` (500 Hz), `integrator="implicitfast"`, `iterations=200` — an unusually stiff/forgiving setup for joint-space PD. A 12 kg sled ±0.4 m needs F ≈ m·a ≈ 12·20 = 240 N worst-case transient; a position actuator with `kp=1500` peaks around 600 N at full error, well under a `forcerange="−400 400"` clamp if kp stays ≤ 1500. The real risks are (a) joint-limit bounce and (b) rail chatter. Recommended concrete parameters:

- `mass = 12` kg on the RM body (per plan).
- `armature = 0.2` on both slide joints — this is the single most effective anti-chatter knob; it adds rotational-equivalent inertia to the joint without drag.
- `damping = 2` (N·s/m) on both slide joints.
- `kp = 1500`, `kv = 100` on both position actuators (slightly underdamped but stable at 500 Hz; raise kp only after observing the jitter diagnostic).
- `forcerange = −400 400`, `ctrlrange = −0.4 0.4`.
- Keep `iterations=200` and `implicitfast` as-is. If energy blowup still appears in `PhysicsDiagnostic`, register the RM body's slide DOFs with the existing `PhysicsEngine.registerVelocityClampBody` (10 m/s clamp — these are the DOF 6-only; slides are not 6-DOF so this specific helper doesn't apply to slides — instead rely on armature/kv).

No change to the root freejoint (stays 6-DOF) and no joint-offset balance exists anywhere in this codebase — the plan's "disable any joint-offset balance" is a no-op here; the only root corrector is the xfrc capsule balance (already covered).

## Closed-form sign/axis check (task 4)

- **Height:** `h = C_y` in Three (or `subtree_com[0*3+2]` in MuJoCo); `√(h/g)` uses the vertical component — correct in either frame.
- **Forward/capture term:** Three forward = (0,0,−1) (used by `ComReflexController.forwardVec` and KGRF `modelForward`). MuJoCo forward = +Y. When converting `target = support + kCap·v·√(h/g)` from Three → MuJoCo, apply `[x, −z, y]` — an error here flips the fore/aft rail command, i.e., the plan's risk #8. The `com_pendulum_recorder.js` already implements the same capture-point formula with the correct mapping — reuse it as a reference implementation.
- **Slide axes:** LR = `axis="1 0 0"` (both frames agree X=X); FA = `axis="0 1 0"` (MuJoCo +Y = forward).
- **Pelvis rotation:** `pDes` must be rotated into the pelvis frame using the capsule `xquat` before computing slide qpos targets (`qpos = dot(pDes − anchor, R·eLocal)`). If instead the controller assumes identity pelvis orientation, any lean becomes a commanded-but-unreachable target, effectively a persistent error — a slow destabilizer rather than a sign flip.
- **AlgeGra:** `p_rm_des = (M·target − m_r·c_r)/m_rm` and `c_r = (M·C_total − m_rm·p_rm)/(M − m_rm)` verified consistent.
- **Torso-up for ACROBATIC:** use ACTUAL up from `xquat` (`upZ = 1 − 2(qx²+qy²)` on the capsule, the exact expression used in the road3/road4 `tiltDeg()` helpers) — threshold `< 0.5` matches the plan and the helpers' math exactly.

---

## Suggested Reading Order (for the implementer)

1. `src/world/hooks/useWorld.ts` — the 500 Hz per-step closure; read the `worldEngineRef.current.start(onStep, onFrame)` block to see the exact production hook and ordering (line ~"Per-step (500Hz)" comment).
2. `src/world/engine/HumanoidPhysicsBinder.ts` — `applyBalanceStep`, `applyRootVelocityDrive`, `applyComReflexStep`, `computeComWorld`, `refreshReflexBodyCache`, `footSoleGapM`, `capsuleYawForwardVec`. This file is where 90% of the new wiring lives.
3. `src/world/engine/ComReflexController.ts` — the established closed-form (e, v, captureM = e + v·√(h/g), forced-step FSM). The RMBS GROUNDED/SATURATED laws are the same math family; decide whether SATURATED reuses the reflex's forced-step dispatch (recommended) to avoid two step-law controllers fighting.
4. `src/world/engine/MJCFHumanoidTemplate.ts` — `generateAgentSubtreeMJCF` root_capsule block; the exact insertion point for the RM body + actuators; the coordinate/axis evidence.
5. `src/world/engine/MotorController.ts` — `applyCapsuleBalance` (the torque to gate/zero), `setTargets` (why RM actuators must stay out of the pose map).
6. `src/world/engine/__tests__/road4ComReflex.test.ts` — the deterministic 500 Hz harness to clone for the RMBS gates (T1–T6) and the push/impulse path.
