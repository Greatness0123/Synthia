# RMBS v1 Plan Audit — Synthia 1.5.1 (MuJoCo WASM humanoid)

**Audited plan:** REACTION-MASS BALANCE SYSTEM (RMBS) v1 — physical sliding reaction-mass actuator + closed-form COM-tracking balance, wrapped in a mode-machine.
**Audit scope:** read-only verification of every integration point against this codebase, all conflicts/corruptions, solver stability, sign/axis checks, unforeseen consequences, and a refined implementation plan. Full report saved to `project_info__104.md`.

---

## A) VERDICT

**Yes — with changes.** Confidence: **0.65 / 1.0** (medium-high).

The codebase is unusually well-prepared for this plan: a true 500 Hz per-step hook already exists and is exercised in production (`WorldEngine.start(onStep)` → `useWorld.ts` per-binder loop calling 3 controllers per step), the established `ComReflexController` already implements the exact closed-form the RMBS needs as a rival (COM error + capture point + forced step with per-leg FSM and mandatory-plant exit), and MuJoCo runs at `timestep=0.002` with `integrator="implicitfast"` and `iterations=200` — a stiff, 500 Hz-stable configuration.

The plan **cannot be dropped in verbatim**. Five concrete blockers must be resolved first:

1. **`applyCapsuleBalance` (120 N·m xfrc torque) AND the Road-4 reflex `applyComReflexStep` will both fight the reaction mass.** The reflex is the bigger omission — it fires lean corrections and forced capture steps even mid-flip, so it must be mode-gated and **force-disabled in ACROBATIC**. This is the plan's #1 missing piece.
2. **All hand-rolled COM readers silently include any new `reaction_mass` body** (they exclude only `env_slot_`/`piano_`/`floor`/`world`) — this corrupts the Road-4 reflex COM and all displayed COM telemetry. Must exclude by name.
3. **`HUMANOID_MASS_KG = 90` (KGRF) and `push()`'s hard-coded `mass = 70` go stale** with +12 kg (real total ≈ 102); `push()` is already ~30% off today. The T3/T6 gates depend on `push()`.
4. **`getContactForceRegistry()` has no contact position** — only force/normal per geom. Support center needs the raw `data.contact[]` loop (already written in `useWorld.ts` diagnostics) or the Road-4 sole-gap stance convention (≤ 5 mm gap = planted), which is the established ground truth.
5. **The authored timeline has no reference torso up-vector / contact schedule / COM offset** — only `{timeOffsetMs, overrides}` + `rootMotion`. The mode machine must derive its acrobatic trigger from **actual** physics (`xquat` up-componnent, `upZ = 1 − 2(qx²+qy²)`, threshold < 0.5), with world-up fallback.

---

## B) REFINED PLAN — exact files + edits

### B.1 Physical mechanism — `src/world/engine/MJCFHumanoidTemplate.ts`

The "pelvis" is the **`root_capsule` body** (`mass="15.0"`, `contype="0" conaffinity="0"`, `<freejoint name="${prefix}root_freejoint"/>`); `mixamorighips` is a `fixed` child below it. Insert inside the `root_capsule` body block, after `${hipsBranch}`:

```xml
<body name="${prefix}reaction_mass" pos="0 0 0">
  <joint name="${prefix}rm_slide_lr" type="slide" axis="1 0 0" range="-0.4 0.4" limited="true" damping="2" armature="0.2"/>
  <joint name="${prefix}rm_slide_fa" type="slide" axis="0 1 0" range="-0.4 0.4" limited="true" damping="2" armature="0.2"/>
  <inertial pos="0 0 0" mass="12.0" diaginertia="0.25 0.25 0.25"/>
  <geom name="${prefix}reaction_mass_geom" type="sphere" size="0.18" pos="0 0 0" contype="0" conaffinity="0"/>
</body>
```

Actuators (append to `actuatorsXml`):

```xml
<position name="act_${prefix}rm_slide_lr" joint="${prefix}rm_slide_lr" kp="1500" kv="100" ctrlrange="-0.4 0.4" forcerange="-400 400"/>
<position name="act_${prefix}rm_slide_fa" joint="${prefix}rm_slide_fa" kp="1500" kv="100" ctrlrange="-0.4 0.4" forcerange="-400 400"/>
```

**Coordinate convention (verified):** MuJoCo **Z-up**, X-right, **+Y = forward** (= Three −Z). `worldToMuJoCo(v) = [v.x, −v.z, v.y]` (`PhysicsEngine.ts`). `gravity="0 0 -9.81"`, `timestep="0.002" iterations="200" integrator="implicitfast"`. So LR slide = **`1 0 0`**, FA slide = **`0 1 0`** — and because these axes live in the free (6-DOF) root's frame, the rails **tilt with the pelvis**: the controller must rotate world targets into the pelvis frame via `data.xquat[capId*4..+3]` every step. Multi-agent isolation is automatic (the combined-MJCF generator prefixes every body/actuator).

**Critical rule:** do **NOT** register `reaction_mass` in `BodyManager.bodyMap`/`actuatorMap`. `MotorController.setTargets()` zeroes+rewrites `data.ctrl` for every actuator in its map at the 60 Hz `onFrame` flush (which runs after `onStep`) — the RM actuators must live outside that map, written directly.

### B.2 New controller — `src/world/engine/ReactionMassController.ts` (new file)

Pattern after `ComReflexController` (pure math + tiny latches, deterministic, unit-testable). Inputs: `cTotal/mTotal/pRmMj/vRmMj/mRm/vComMj/h/supportCenterMj/torsoUpMj/acrobaticFlag/saturatedWindowS/dt/params`. Output: `{ctrlLr, ctrlFa, mode, saturated}`.

- Mode each step: `acrobatic` if flag OR `dot(torsoUpMj, [0,0,1]) < 0.5`; else `airball` if no actual contact; else `grounded`; `saturated` latches on rail clamp.
- **GROUNDED:** `target = supportCenter + kCap·vCom·√(h/g)` (horizontal), `pRmDes = (M·target − m_r·c_r)/m_rm` (algebra verified), clamp to rails, write `data.ctrl` directly.
- **AIRBALL:** hold-centered + mild anti-spin (reaction-wheel authority is physically weak from a centered rail — keep it minimal).
- **ACROBATIC:** hold-centered, passive — that's how the somersault survives.
- **SATURATED:** hold at the rail for `stepWindowS = 0.4` while a reactive step dispatches, then resume.
- Cache body/joint/actuator ids; **re-attach lazily when `world.model` pointer changes** (survives world recompile + `StateRehydrator` rollback).

### B.3 Binder wiring — `src/world/engine/HumanoidPhysicsBinder.ts`

1. Fields: `private reactionMass = new ReactionMassController();`, `private reactionMassEnabled = false;`, `public lastRmbsStats`.
2. New `applyReactionMassStep(dtS = 0.002): boolean` — reads `data.subtree_com[0*3..]` + `data.subtree_linvel[0*3..]` (these exist on the WASM `MjData`, **currently unused** — O(1) per body, exactly what `M·C_total` wants), RM body `xpos/cvel`, support center, delegates to the controller, writes `data.ctrl`.
3. **Gate the existing stack by mode**:
   - `applyBalanceStep`: when RMBS active and mode ≠ airball, zero the capsule `xfrc_applied[cap*6+3..5]` torque slots and return (prevents a stale 120 N·m torque).
   - `useWorld` per-step loop: skip `applyComReflexStep` when RMBS mode = `acrobatic`. The Road-3 root velocity drive already self-suspends airborne — no change.
4. **Exclude the RM from Road-4 COM readers:** add `|| name.includes('reaction_mass')` to the skip filter in `refreshReflexBodyCache()` and the `computeComWorld()` loop.
5. **Dynamic mass:** replace `HUMANOID_MASS_KG = 90` and `push()`'s `mass = 70` with a sum over the agent's bodies (or `90 + mRm`).
6. Add `setReactionMassEnabled(bool)`, `setReactionMassAcrobatic(bool)`, `getReactionMassController()`, and RM slide reset (`ctrl=0`, `qpos=0`) in `resetToBindPose()`/`resetPose()`.

### B.4 Support center

- Stand/walk (T1, T2, T3, T4, T6): **Road-4 sole-gap stance** — planted when `footSoleGapM()` ≤ `PLANTED_GAP_M = 0.005`; support center = average of planted foot `xpos`. Zero new API.
- Sit/lie/landing (T5): raw contact loop — the exact `data.contact.get(i)` + `mj_contactForce(DoubleBuffer(6))` pattern already in `useWorld.ts` diagnostics; filter to agent geoms by prefix, weight by normal force. (A `PhysicsEngine.getRawContacts()` helper is recommended to DRY the copy-paste.)
- Groundedness for the mode machine: **not** `_isGrounded` (capsule-ray test reads false mid-walk). Use registry-contact OR sole-planted.

### B.5 Production hook — `src/world/hooks/useWorld.ts`

Add one line in the existing 500 Hz `onStep` closure (after `applyComReflexStep(0.002)`):

```ts
binder.applyReactionMassStep(0.002);   // NEW
```

`WorldEngine.ts` needs **no change**. Optional: `worldStore.useReactionMass` toggle, wired like `useMultiBodyPD`.

### B.6 Gates — `src/world/engine/__tests__/road5ReactionMass.test.ts` (new)

Clone the `road4ComReflex.test.ts` harness (deterministic 500 Hz, `STEPS_PER_FRAME = 8`, GLTFLoader disk mock, warm-up settle). The per-step order mirrors useWorld. T3/T6 push impulses go through the existing `binder.push(part, impulse)` — **after the B.3 mass fix** (`push()` currently divides by 70 against a ~90 kg body). Extend `multiAgentComposition.test.ts` to assert RM body/joint/actuator presence + prefix isolation; `StateRehydrator` round-trips RM `qpos`/`ctrl` automatically (prefix scan — a free win).

### B.7 Diagnostics

`PhysicsDiagnostic` is automatically **safe** (iterates `getRigidBodiesMap()`, where the RM is deliberately absent). Expose `window.__SYNTHIA_RMBS__` for mode/mass/COM/support telemetry. The `useWorld` diag ring's COM **will** include the RM mass — name-exclude it if fall-diagnosis exports must stay comparable.

---

## C) UNFORESEEN CONSEQUENCES + MITIGATIONS

| # | Consequence | Mitigation |
|---|---|---|
| 1 | Road-4 reflex fights RMBS and fights flips (fires mid-air) | Mode gate across balance + reflex + RMBS; ACROBATIC → skip balance + reflex, RM holds |
| 2 | 60 Hz pose flush (`setTargets` zeroes ctrl in its map) clobbers RM ctrl | Never add RM to `BodyManager.actuatorMap`; RM writes `data.ctrl` directly |
| 3 | Road-4 `computeComWorld`/`refreshReflexBodyCache` silently corrupt | Name-exclude `reaction_mass` in both |
| 4 | `HUMANOID_MASS_KG = 90` + `push()` `mass = 70` stale | Dynamic mass sum in both sites |
| 5 | Slide rails tilt with the pelvis; gravity biases the mass | High-kp position servo holds it; rotate world targets into pelvis frame via `xquat`; `damping="2"` + `armature="0.2"` |
| 6 | Limit-bounce energy at ±0.4 rails | armature + kv; kp ≤ 1500; forcerange ±400; soft clamp before hard stop (saturation latch) |
| 7 | Wrong support center = active destabilizer | Sole-gap stance for stand/walk; raw `contact.pos` for sit/lie |
| 8 | AIRBALL reaction-wheel authority is weak (tiny lever arm) | Keep AIRBALL minimal; somersault is won by passivity, not active damping |
| 9 | Timeline has no reference torso/contact/COM | Use actual `xquat` up for the trigger; world-up fallback; explicit `acrobaticFlag` override |
| 10 | `_isGrounded` is false mid-walk (capsule above ground) | Mode machine: registry-contact OR sole-planted |
| 11 | Figure-skater effect during flips (radial mass motion) | Don't fight; ACROBATIC hold-centered |
| 12 | Rehydrate/rollback: new MjModel, different ids | Lazy re-attach on `world.model` pointer change |
| 13 | Multi-agent crosstalk | Existing prefix machinery isolates automatically |
| 14 | `resetToBindPose` leaves RM ctrl hot | RM reset hook in reset paths |

---

## D) MISSING APIS THAT MUST BE ADDED FIRST

1. **`ReactionMassController.ts`** (new) — the controller; model on `ComReflexController` (pure, injectable, stats + `diagnose()`).
2. **Binder methods** — `applyReactionMassStep`, enable/flag setters, `getReactionMassController`, mode gates on balance/reflex, RM name-exclusions, dynamic mass in KGRF + `push`.
3. **MJCF emission** — RM body + 2 slide joints + 2 position actuators in `generateAgentSubtreeMJCF`.
4. **`useWorld.ts`** — 1-line per-binder call in the 500 Hz closure (+ optional store toggle).
5. **Optional:** `PhysicsEngine.getRawContacts()` — DRY the duplicated `data.contact[]` loop.
6. **No new MuJoCo API needed** — `data.subtree_com`/`subtree_linvel` already exist (unused); `xpos`/`cvel`/`xquat`/`ctrl`/`qpos`/`qvel` all already readable via `PhysicsEngine.getWorld()`.

---

## Task 1 reference — exact integration points

| Plan asks | Exact location & signature |
|---|---|
| Root/pelvis + convention | `MJCFHumanoidTemplate.ts` → `generateAgentSubtreeMJCF(..., prefix)` → `<body name="${prefix}root_capsule">` + `root_freejoint`; MuJoCo Z-up, +Y = forward; mapping in `PhysicsEngine.ts` (`worldToMuJoCo`/`mujocoToWorld`); solver `timestep="0.002" iterations="200" integrator="implicitfast"` |
| 500 Hz hook + timeline | `WorldEngine.start(onStep?: () => void, onFrame?: () => void)`; production wiring `useWorld.ts` start(...) closure calls `applyBalanceStep(); applyRootVelocityDrive(performance.now()); applyComReflexStep(0.002)` per 500 Hz step. Timeline readable via `binder.timelineQueue`/`syncVisuals()` (60 Hz); **no reference torso/contact/COM fields exist** → fallback required |
| Contact/support API | `PhysicsEngine.getContactForceRegistry(): Map<number, ColliderContactState>` = `{inContact, impulse_magnitude, contact_normal:[x,y,z], contact_force?:[x,y,z], max_force_magnitude, lastUpdate}` — **no contact position**; use raw `data.contact[]` loop (useWorld) or sole-gap stance |
| subtree_com / linvel / xpos | `world.data.subtree_com` / `subtree_linvel` (Float64Array, `bodyId*3`, MuJoCo frame) — available, unused. `xpos[bodyId*3..]` / `cvel[bodyId*6+3..]` (wrapped by `BodyProxy.translation()/linvel()`). Established pattern: `HumanoidPhysicsBinder.computeComWorld()` + `refreshReflexBodyCache()` |

---

## Task 2 — every conflicting reader/writer

| Site | Conflict | Fix |
|---|---|---|
| `computeComWorld()` | includes RM → reflex COM corrupted | name-exclude |
| `refreshReflexBodyCache()` | same | name-exclude |
| `useWorld.ts` diag ring COM + `com_pendulum_recorder.js` | display/export COM skews | name-exclude (or accept) |
| `MotorController.setTargets()` / `setLimpMode(true)` | zeroes ctrl for map actuators at 60 Hz | keep RM out of actuatorMap |
| `MotorController.applyCapsuleBalance()` | 120 N·m xfrc torque fights RM mid-flip | gate/zero in non-airball RMBS modes; skip ACROBATIC |
| `applyKinematicGroundReactionForces()` | `HUMANOID_MASS_KG = 90` stale | dynamic mass |
| `HumanoidPhysicsBinder.push()` | hard-coded `mass = 70` (already wrong) | dynamic mass |
| `StateRehydrator.capture/restore` | **benign** — RM slide state round-trips free | re-attach ids on model change |
| `resetToBindPose()`/`resetPose()` | RM ctrl/qpos not reset | RM reset hook |
| `PhysicsDiagnostic` | **safe** (iterates bodyMap only) | none |

---

## Task 3 — solver stability

`timestep=0.002` + `implicitfast` + `iterations=200` is stiff and forgiving. 12 kg sled ±0.4 m: worst-case F ≈ 240 N, `kp=1500` peaks ~600 N, below `forcerange=±400` clamp at steady state. **Recommended:** `mass 12`, `armature 0.2` (best anti-chatter knob), `damping 2`, `kp 1500`, `kv 100`, `forcerange −400 400`. If jitter appears, `PhysicsDiagnostic` will show it; slides aren't 6-DOF so `registerVelocityClampBody` doesn't apply — rely on armature/kv. No joint-offset balance exists anywhere (plan's disable is a no-op); the only root corrector is the xfrc capsule balance.

## Task 4 — sign/axis flags

- Three forward = (0,0,−1) ≡ MuJoCo +Y. The capture term `v·√(h/g)` must be converted with `[x, −z, y]` — a miss flips the FA rail command (the plan's risk #8). `com_pendulum_recorder.js` already implements this correctly — use as reference.
- LR = `1 0 0`, FA = `0 1 0` (both frames agree X=X).
- **Pelvis rotation:** rotate `pDes` into the pelvis frame via capsule `xquat` before computing slide targets; assuming identity orientation makes any lean a persistent unreachable error — a slow destabilizer.
- Algebra `p_rm_des = (M·target − m_r·c_r)/m_rm`, `c_r = (M·C_total − m_rm·p_rm)/(M − m_rm)` verified consistent.
- ACROBATIC torso-up threshold: use actual up `upZ = 1 − 2(qx²+qy²)` < 0.5 (identical expression to the road3/road4 `tiltDeg()` helpers).

## Suggested reading order

1. `src/world/hooks/useWorld.ts` — the 500 Hz per-step closure (the hook).
2. `src/world/engine/HumanoidPhysicsBinder.ts` — `applyBalanceStep`, `applyComReflexStep`, `computeComWorld`, `refreshReflexBodyCache`, `footSoleGapM`, `capsuleYawForwardVec` (90% of the wiring lives here).
3. `src/world/engine/ComReflexController.ts` — the existing closed-form + step FSM; decide whether SATURATED reuses its forced-step dispatch (recommended).
4. `src/world/engine/MJCFHumanoidTemplate.ts` — the RM body/actuator insertion point + axis evidence.
5. `src/world/engine/MotorController.ts` — `applyCapsuleBalance` (torque to gate) + `setTargets` (why RM stays out of the pose map).
6. `src/world/engine/__tests__/road4ComReflex.test.ts` — the deterministic harness to clone for T1–T6.

Ready to go deeper on any section — the per-step wiring, the RM controller math, or the gate harness design.
</explore_mode_respond>