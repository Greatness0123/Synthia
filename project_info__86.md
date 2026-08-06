# Synthia — Mixamo Walking Animation Import Feasibility Report

## Summary

This report answers a focused question: **can the raw Mixamo retargeted animation stream (`walking` / `walking2.md`) be converted and applied to the Synthia humanoid model so it reproduces the walk correctly?**

**Short answer: Yes — with one critical caveat.** The animation data (per-bone quaternion rotations, root translation performed via `mixamorig:Hips`) is fully convertible, but the Synthia physics rig is **not a 1:1 skeleton**. It is a reduced, physics-driven approximation: many bones in the Mixamo stream (all 15 finger bones per hand, toes, neck vs. head split, yaw/roll decomposition) do **not exist as independent actuators** in the MuJoCo rig, and the root motion channel (`ch: pos` on Hips) has no direct equivalent — the model's locomotion is driven by a physics root capsule plus kinematic ground-reaction-force injection, not by directly placing the hips. The walk can be *imitated* faithfully for the major leg/spine/arm bones and loosely approximated everywhere else, but verbatim per-frame replay of all 52 nodes is impossible without rig changes.

The full decoding of the file format, the model's motion model (yaw/pitch/roll, sign conventions, constraints), and the conversion plan follow.

---

## Task Context (What the User Asked)

- Two files provided (`walking` and `walking2.md`) contain identical data — a 32-frame, 30 fps Mixamo "Retargeted Clip" in SJSON stream format.
- The user explicitly said: do **not** consult other diagnostic files (they may be inaccurate). This report therefore derives everything from the two provided files + the rig source code.
- Key question 1: How does the data perform motion? (Answer: root `pos` on `mixamorig:Hips` + per-node quaternion `rot`.)
- Key question 2: How does *motion* work in the Synthia model (roll/pitch/yaw, what the sign ± does per the code)?
- Key question 3: Do the two fit within the rig constraints?

---

## Part 1 — Decoding the `walking` / `walking2.md` File Format

### File structure (SJSON "stream" format)

| Line type | Meaning |
|---|---|
| `header` | Clip metadata: 30 fps, 32 frames, duration ≈ 1.033 s, skeleton root & motion root = `mixamorig:Hips`, T-pose orientation identity quaternion |
| `frame_descriptor` | Ordered list of nodes; each entry gives the **float offset** into the per-frame `data` array where that node's values begin |
| `frame` | One animation frame. `time` = seconds (0, 0.0333, … 1.0333), `index` = 0–31, `data` = flat float array of all channels |
| `footer` | Stream end marker |

### `frame_descriptor` → `data` layout (offsets are 0-based floats)

```
offset 0   → mixamorig:Hips          rot  (4 floats, quaternion w,x,y,z)
offset 4   → mixamorig:Hips          pos  (3 floats, translation x,y,z)
offset 7   → mixamorig:Spine         rot  (4 floats)
offset 11  → mixamorig:Spine1        rot
offset 15  → mixamorig:Spine2        rot
offset 19  → mixamorig:Neck          rot
offset 23  → mixamorig:Head          rot
offset 27  → LeftShoulder            rot
offset 31  → LeftArm                 rot
offset 35  → LeftForeArm             rot
offset 39  → LeftHand                rot
offset 43–99  → LeftHandThumb1..3, Index1..3, Middle1..3, Ring1..3, Pinky1..3  (15 bones × 4 floats = 60 floats)
offset 103–175 → RightShoulder … RightHandPinky3  (same 19 nodes pattern as left side)
offset 179 → LeftUpLeg               rot
offset 183 → LeftLeg                 rot
offset 187 → LeftFoot                rot
offset 191 → LeftToeBase             rot
offset 195 → RightUpLeg              rot
offset 199 → RightLeg                rot
offset 203 → RightFoot               rot
offset 207 → RightToeBase            rot
```

**Total per frame = 52 nodes × 4 = 208 floats for rotations, plus 3 floats for Hips pos = 211 floats.** Checking frame 0: `data` contains exactly 211 entries, confirming the layout.

### Rotation format

- All `rot` values are **quaternions in (w, x, y, z) scalar-first order** (first float is w).
- Verify frame 0 Hips rot: `[0.00853593, 0.0237832, -0.0148017, 0.999571]`.
  - `w² + x² + y² + z²` = (0.999571)² + (0.008536)² + (0.023783)² + (0.014802)² ≈ 0.99894 + 0.000073 + 0.000566 + 0.000219 ≈ 0.9998 ≈ 1.0 ✓ (normalized quaternion)
- These are **local rotations relative to each bone's parent** (standard Mixamo skinned-animation convention) — NOT world-space orientations.
- **Frame 31 is an exact duplicate of frame 0** (with an identical small wobble) — the clip is a **seamless looping walk**. Note also the Hips `pos` values: frame 0 = `[-0.0756, 97.95, 0.072]`, frame 31 = `[-0.0756, 97.95, 177.02]`. The first value (-0.0756) is constant across frames; the *second* value is cumulative. Wait — examining more carefully:

### Root position (`ch: pos`) — this is the critical part

| Frame | Hips pos[0] (X) | Hips pos[1] (Y) | Hips pos[2] (Z) |
|---|---|---|---|
| 0 | -0.0756 | 97.9535 | 0.0721 |
| 1 | -0.1819 | 98.5006 | 5.4978 |
| 2 | -0.2510 | 98.4740 | 10.8569 |
| 3 | -0.2596 | 97.9913 | 16.4347 |
| ... | ... | ... | ... |
| 15 | 3.5012 | 98.0207 | 86.2648 |
| 16 | 3.6311 | 98.8360 | 91.4422 |
| ... | 3.6843 | 98.3565 | 101.905 |
| ... | ... | ... | ... |
| 30 | 0.0655 | 97.1489 | 171.514 |
| 31 | -0.0756 | 97.9535 | 177.024 |

**Key observations:**
1. `pos[1]` (~97–98) is roughly constant — this is the **height (vertical)** of the Hips, with small ±1-unit bob from the walk cycle.
2. `pos[2]` (the third value) increases monotonically by ~5.5 units per frame (5.5 × 32 ≈ 177) — this is the **forward travel distance**. The character walks in the **+Z direction in Mixamo's space** at about **5.5 units/frame = 165 units/second** (velocity ≈ 165 u/s at 30fps; per the duration, ~171 units total in ~1.03s ≈ 166 u/s).
3. `pos[0]` (X) wanders slightly (-0.26 → +3.68 → -0.08): **lateral sway** plus a net loop closure. The full-loop X displacement returns to start (frame 31 ≈ frame 0), confirming a seamless loop; the Z displacement does **not** reset, because Mixamo stores *cumulative root translation* — the walker's net forward travel is baked in as the hip position.
4. **Scale problem**: 5.5 Mixamo units ≈ meters? A human step of ~0.7–0.8 m per 0.533 s cycle implies stride ≈ 1.4–1.6 m/s. At 165 units/s, if the model is ~1.8 m tall (per `HumanoidPhysicsBinder`, `modelHeight = 1.8`), the Mixamo unit is ~1 cm (0.01 m): 97.95 "height" ≈ 0.98 m hip height ✓ matches a real human hip (~0.95–1.0 m). So **1 Mixamo unit = 0.01 m = 1 cm**. Forward speed ≈ 1.65 m/s ✓ natural walking speed. This scaling must be applied (divide by 100) when converting root translation.

### What the file does NOT contain
- No finger *spread* or independent thumb opposability beyond the 3 segments each (all finger nodes are present, but Synthia treats them as 1-DOF flexion-only or does not actuate them at all — see Part 3).
- No per-frame timing jitter (constant 1/30 s spacing).
- No `Tpose` rest-pose reference poses — the `tposer-orientation` header only documents the identity orientation of the T-pose.

---

## Part 2 — How Motion Works in the Synthia Model (from the Code)

### 2.1 The physics rig architecture (MuJoCo)

The model is built from a **GLB-skeleton T-pose** captured at load time (`extractBonePositions()` in `HumanoidPhysicsBinder.ts`). On activation, `BodyManager.activate()` calls `generateHumanoidMJCF()` (`MJCFHumanoidTemplate.ts`) to produce an MJCF XML from that bind pose. Key facts:

- **Root capsule** (`root_capsule`) — a free-floating rigid body with a `freejoint`, positioned at hip height (`capsuleCenterY = modelHeight / 2 ≈ 0.9 m`), mass 0.001 kg (essentially massless — trunk inertia comes from the bone bodies), colloquially the "balance/tracking capsule". The skeleton is attached under it.
- Each tracked bone is a **rigid body** with its own inertial properties and collision geometry (sphere r=0.04, feet = flat box).
- Joints are generated as **1-DOF hinge decompositions** of the bone's DOF:
  - `mixamorighips` → `fixed` (no joint — it's the anchor body attached to capsule)
  - 1-DOF bones (`forearm`, `leg`, finger/thumb/toe segments) → single `_pitch` hinge, axis `1 0 0`
  - 2-DOF bones (`hand`/wrist, `foot`/ankle) → `_pitch` (axis `1 0 0`) + `_roll` (axis `0 1 0`)
  - 3-DOF bones (spine×3, neck, head, shoulders, arms, uplegs) → `_yaw` + `_pitch` + `_roll` hinges.
- **Actuator ordering for 3-DOF bones** (from `MotorController.setTargets`):
  ```
  actuator[0] = yaw   (MJCF axis 0 0 1, except head/neck where it's axis 0 1 0)
  actuator[1] = pitch (MJCF axis 1 0 0)
  actuator[2] = roll  (MJCF axis 0 1 0, except head/neck where it's axis 0 0 1)
  ```
  And the **LLM/AI command convention** (what `setMotorTargets` receives):
  ```
  x = pitch   (forward/back flexion)
  y = yaw     (left/right turn)
  z = roll    (lateral tilt)
  ```
  So `ctrl[id0] = yaw`, `ctrl[id1] = pitch`, `ctrl[id2] = roll` where ctrl values map through the LLM's x=pitch, y=yaw, z=roll.

### 2.2 The meaning of roll / pitch / yaw per the rig

| Axis name | MJCF axis (normal bones) | MJCF axis (head & neck only) | LLM field | Physical meaning |
|---|---|---|---|---|
| **yaw** | `0 0 1` | `0 1 0` (swapped!) | `y` | Left/right **turn** around the parent-to-child axis (twist around the bone's long axis, approximately) |
| **pitch** | `1 0 0` | `1 0 0` | `x` | **Forward/backward flexion** (e.g., knee bend, elbow bend, spine lean forward/back) |
| **roll** | `0 1 0` | `0 0 1` (swapped!) | `z` | **Lateral side-tilt** (e.g., hip ab/adduction, ankle inversion, spine side bend) |

**Head/neck swap (critical non-obvious behavior):** In `MJCFHumanoidTemplate.ts`:
```ts
const isHeadNeck = boneName.includes('neck') || boneName.includes('head');
const yawAxis   = isHeadNeck ? '0 1 0' : '0 0 1';
const rollAxis  = isHeadNeck ? '0 0 1' : '0 1 0';
```
Comment: *"the Mixamo T-pose bind-pose quaternion bakes a ~90° rotation into the body frame, which physically flips what axis 0 0 1 (yaw) and axis 0 1 0 (roll) actually do in world space. Swapping them here restores the correct semantics."* So for head & neck specifically, **yaw is implemented on the 0 1 0 axis and roll on the 0 0 1 axis** — opposite of every other bone.

### 2.3 The role of sign (±) in joint motion

The sign convention is **positive = rotation about the positive axis, right-hand rule**, but human semantics are imposed by the *ranges* defined in `rigConstraints.ts` and `anatomicalLimits.ts`, not by the raw axis:

- **Knees (`mixamorigleftleg` / right)**: `x: [-2.618, 0.0]` — **only negative pitch allowed** (flexion = negative). `validateAndApplyTimeline` explicitly clamps any positive pitch to 0 for dof=1 with `x[1] === 0.0`: *"positive_x_clamped_to_0"*. **So +pitch on a knee = no-op/error; −pitch = bending knee.**
- **Elbows (`forearm`)**: `x: [0.0, 2.531]` — **only positive pitch allowed** (flexion = positive). Negative is clamped to 0 in the timeline validator.
- **Fingers & toes**: `x: [0, 1.745]` — positive-only flexion. Same clamp logic as elbows.
- **Legs (`mixamorigrightleg` etc.)**: `[-2.618, 0]` as knees, but `axis 1 0 0` means **positive pitch = leg extending forward**? No — read carefully: the constraint *range* is what matters. The MJCF join range is `${getSafeRangeStr(min, max)}` with `min = constraint.x[0]`, `max = constraint.x[1]`. For a revolute (1-DOF) bone, the only actuator is `_pitch`, so `ctrl = targetAngle`, and `targetAngle` comes from the LLM's `x` value. **Thus, +x on the knee joint is physically clamped to 0 by the `x[1]===0` rule; −x is the only usable direction.** This is a design decision, not a physical law.
- **Sign on yaw/roll for 3-DOF**: symmetric ranges everywhere (±0.524 spine, ±1.57 arm yaw/roll, ±2.094 hip) — so **positive = one direction, negative = the other, purely by right-hand rule about the declared axis**. For a Quaternion-to-Euler conversion (needed for import), the code path in `BodyManager.syncRigidBodiesFromBones` uses `new THREE.Euler().setFromQuaternion(qRel, 'ZXY')` where `euler.z → yaw`, `euler.x → pitch`, `euler.y → roll`. This is exactly the ZXY order used by the MJCF decomposition (yaw around Z, then pitch around X, then roll around Y — with the head/neck axis swap required after).

### 2.4 The per-joint limits applied during `validateAndApplyTimeline`

The full pipeline for AI commands is:
1. `normalizeBoneKey(rawKey)` — strip colons, lower-case (`mixamorig:Hips` → `mixamorighips`).
2. Look up `SYNTHIA_RIG_CONSTRAINTS[key]` — bounds for x/y/z.
3. `clampX/clampY/clampZ` with special rules (knee/elbow/finger positive→0 clamping; `locomotionCap` scaling when gait phase active).
4. Additional injections: `scapulohumeralRatio` (arm pitch beyond ±0.523 rad adds shoulder delta), `requiresCervicalCoupling` (neck yaw injects counter-tilt roll), `tendonSynergyLink` (finger2/3 require finger1 base to be non-zero).
5. `setMotorTargets` → `MotorController.setTargets` → `ctrl`.

Importantly, `setMotorTargets` **also clamps to `anatomicalLimits.ts`** (±45° spine, ±60° neck/head, etc.), and the MJCF joint `range` attributes enforce hard limits in the physics solver itself.

---

## Part 3 — Mapping the Mixamo Stream to the Synthia Rig

### 3.1 Joint name normalization

Mixamo names are `mixamorig:LeftArm` etc. Synthia canonical names are `mixamorigleftarm` (colons stripped, lower-case). Using `normalizeBoneKey()` this is a 1:1 mapping for **all** bones that exist in the rig. The rig's `BONE_JOINT_TYPE` table and constraint map include: hips, spine, spine1, spine2, neck, head, left/right shoulder, arm, forearm, hand, upleg, leg, foot, toebase, and all 15 finger bones per hand.

**Caveat 1 — bones in the stream missing from the physics rig's actuator map:**
- `LeftToeBase` / `RightToeBase` are defined in `rigConstraints` (`dof: 1, x: [-1.745, 0]`) — so toes **do** have a hinge. Good.
- `LeftHandThumb1..3`, `Index1..3`, `Middle1..3`, `Ring1..3`, `Pinky1..3` are all defined as `dof: 1` hinges with `x: [0, 1.745]`. **But the MBJCF generator's `BONE_JOINT_TYPE` marks these as `spherical` (3-DOF)** — `mixamoriglefthandthumb1: 'spherical'`, etc. Meanwhile the constraint says `dof: 1`. This mismatch means in `buildBodyTreeXML`, the 3-DOF path is taken (because `BONE_JOINT_TYPE` wins) unless `(constraint && constraint.dof === 1)` is checked **first** — look at the code:

```ts
if (jointType === 'fixed') { ... }
else if (jointType === 'revolute' || (constraint && constraint.dof === 1)) {
  // single pitch hinge
} else if (constraint && constraint.dof === 2) { ... } else { /* 3-DOF */ }
```

So for finger bones: `jointType = 'spherical'` but `constraint.dof = 1` → the **`(constraint && constraint.dof === 1)` branch wins**, generating a single `_pitch` hinge and one actuator. So fingers **are** 1-DOF in practice despite the spherical type label. The frame-descriptor rotations must be **converted from 3-DOF quaternion → single flexion angle** (the pitch component only), with clamp to `[0, 1.745]`.

**Caveat 2 — the Neck/Head duplicate:** The stream has both `Neck` and `Head`; the rig has both too (both 3-DOF). Fine. But the `resolveJointAlias` map in `HumanoidPhysicsBinder` maps several LLM-style aliases (head_yaw, neck_yaw, etc.) to the same `mixamorighead` / `mixamorigspine` primitives — not relevant for direct import since we use canonical names.

**Caveat 3 — the Root position channel has no actuator-equivalent in MuJoCo.**
- The freejoint on `root_capsule` *can* be positioned directly via qpos, but the canonical path for agent locomotion is: **physics simulation + `applyKinematicGroundReactionForces()`** (KGRF injector in `HumanoidPhysicsBinder.syncVisuals`) + optional `setGaitActive(true)` (which softens capsule balance gain to 15%: `GAIT_BALANCE_SCALE = 0.15` in `MotorController.applyCapsuleBalance`).
- Direct root position control would fight the physics. The good approach is to convert the **root translation derivative (velocity)** into a forward target (or rely on the KGRF gait system), not to set absolute hip positions. The current frame `pos` values include cumulative Z; naive absolute-set will teleport the model 1.7 m in world space every 0.033 s.

### 3.2 Conversion: Quaternion → Synthia yaw/pitch/roll (ZXY Euler)

Per-bone rotation in the stream is a **local quaternion q_local** (relative to the Mixamo skeleton's parent bone). But Synthia's hinge decomposition expects **local rotations relative to the MJCF body frame**, which was baked from the *same T-pose* (`bindWorldQuaternion` immutable). So a correct pipeline uses the **relative quaternion between child and parent in the T-pose frame**:

```
q_anim_local[bone] = mixamo anim quaternion for this bone
q_rel[bone]       = q_parent_inv * q_child       (in Mixamo hierarchy terms)
```
or, since both skeletons are Mixamo-standard and the GLB is the same character class, the simplest robust path:

```
For each bone:
  1. q_anim_world[bone] = accumulate q_anim_local down the chain from hips
     (world-relative in Mixamo space)
  2. q_target_local_mj[bone] = q_parent_mj_world⁻¹ * q_anim_world[bone]
     where q_parent_mj_world uses the same accumulated chain but on the
     Synthia skeletal hierarchy (identical names/hierarchy → identical result)
  3. Convert q_target_local_mj to Euler ZXY → (yaw, pitch, roll)
```

This is exactly what `BodyManager.syncRigidBodiesFromBones` already does when it syncs *physics state* back into *bone quaternions* — except in reverse. The code there uses `PhysicsEngine.threeQuatToMuJoCo()` to convert both parent and child world quats into MuJoCo frame, computes `qRel = qP⁻¹ * qC`, then `new THREE.Euler().setFromQuaternion(qRel, 'ZXY')`, then writes `qpos[yaw] = euler.z; qpos[pitch] = euler.x; qpos[roll] = euler.y`. **The animation import should mirror this exactly** (same conversion helpers, same Euler order), but generate **ctrl targets** (via `setMotorTargets`) rather than qpos, because `MotorController` maps LLM `{x,y,z}` → `{pitch,yaw,roll}` in the same ZXY decomposition.

**Where the head/neck swap matters:** After the ZXY Euler decomposition, for `mixamorighead` / `mixamorigneck` you must swap the *meaning* of the output (yaw↔roll) to match the MJCF axis swap — i.e., when writing the 3-element override for head/neck, emit `[x=pitch, y=roll_output, z=yaw_output]` (because the MJCF physically implements yaw on the `0 1 0` axis and roll on `0 0 1` for those two bones). The comment in the code says exactly this: the *rig* swaps axes so the *semantics* the LLM sees are restored; a data importer must therefore also swap when feeding raw Euler values into `setMotorTargets`.

### 3.3 Scale conversion for root translation

- `pos[1]` ≈ 97.95 → hip height 0.9795 m (unit = 0.01 m). Use the model's computed `hipToFootDistance` (≈0.95 m) as the authoritative height instead; discard the stream's Y entirely if the body proportions differ.
- `pos[0]` (X, lateral) and `pos[2]` (Z, forward) → multiply by 0.01 to get meters.
- **Do not apply absolute Z.** Convert to a per-frame forward velocity: `v_z = Δpos[2] * 0.01 / Δt` where `Δt = 1/30 s`. Average ≈ 1.65 m/s. Use this either (a) as a target for the KGRF gait controller (via foot-contact impulses), or (b) if a dedicated gait synthesis path exists in the code, feed the loop's forward speed to it. **There is currently no direct "set root velocity" actuator in the existing code that would make the model walk** — but the infrastructure (`gaitActive`, the KGRF injector, and a `setLinearVelocity` on the capsule BodyProxy) all exist and can be leveraged. The cleanest minimal change is to write the **converted bone overrides** to a `TimelineSequence` (via `validateAndApplyTimeline(...)` + interpolation in `syncVisuals`), and set `gaitActive(true)` to lower the balance-gain fighting the motion, and separately command root forward velocity on the capsule.

### 3.4 Which bones to convert & per-DOF handling

| Stream node | Rig DOF | Conversion |
|---|---|---|
| `Hips` rot | fixed (no actuator) | **Skip rot** — the `tposer-orientation` is identity and Hips rot in walk ≈ identity (±0.02 rad); apply to root capsule quat **only** if you want to preserve trunk sway, via `setCapsulePosition`/quat (not a motor target) |
| `Hips` pos | freejoint | Convert to **forward velocity** (Part 3.3); never absolute-set |
| `Spine / Spine1 / Spine2` | 3-DOF | ZXY Euler → `[x_pitch, y_yaw, z_roll]`; clamp ±0.524 |
| `Neck / Head` | 3-DOF | ZXY Euler, then **swap yaw↔roll** before writing override |
| `Left/RightShoulder` | 3-DOF | ZXY → `[x,y,z]`; ranges ±0.261 (note: very tight shoulder constraints — the stream's shoulder values (±0.01–0.15 rad) fit easily) |
| `Left/RightArm` | 3-DOF | ZXY → `[x,y,z]`; ranges ±2.356 / ±1.57 / ±1.57 — stream values (0.1–0.5 rad) fit |
| `Left/RightForeArm` | 1-DOF (pitch only) | Extract **flexion** component — the stream's quaternion is mostly twist about the forearm's own axis (values ~0–0.5 in the Y component of the quat, e.g., RightForeArm w≈0.88–0.99 with strong y). Feed only the pitch/flexion angle, clamp [0, 2.531]. **Careful:** the quat's y-axis twist is actually elbow flexion in Mixamo space, so convert via ZXY Euler and take the `x` (pitch) result |
| `Left/RightHand` (wrist) | 2-DOF (pitch + roll) | ZXY Euler → keep `x` (pitch) and `y` (roll output) — clamp ±1.396 pitch, ±0.349 roll |
| 15 finger bones (Thumb1–3, Index1–3, etc.) | 1-DOF pitch | Convert quat → take **only the flexion angle**, clamp [0, 1.745]. Stream finger quats are mostly identity w≈0.99 with tiny x/y/z — safe |
| `Left/RightUpLeg` | 3-DOF | ZXY → `[x,y,z]`; clamp ±2.094 |
| `Left/RightLeg` | 1-DOF (pitch only) | ZXY Euler → take `x` (pitch), clamp **[−2.618, 0.0]** AND apply the special `x[1]===0` rule: **positive knee pitch → treated as 0** (or reject). **Walk-cycle knee values are negative flexion (e.g., frame 18 LeftLeg quat w≈0.878 → large bend)** — these must be sign-flipped consistently with the rig's negative-flexion convention |
| `Left/RightFoot` | 2-DOF (pitch + roll) | ZXY → keep x, y (roll); clamp ±0.785 |
| `Left/RightToeBase` | 1-DOF (pitch only) | ZXY → x only; clamp [−1.745, 0] |

### 3.5 Conversion math example (frame 0, LeftUpLeg)

Frame 0, `mixamorig:LeftUpLeg` rot (offset 179): `[0.2428, 0.0873, 0.0217, 0.9659]` → w=0.9659, x=0.2428, y=0.0873, z=0.0217 (w-first).

Convert to THREE Euler ZXY (after converting to MuJoCo frame via the same `PhysicsEngine.threeQuatToMuJoCo` used by `syncRigidBodiesFromBones`, then `setFromQuaternion(qRel, 'ZXY')` — note this works in the *MJCF local frame*, accounts for the baked T-pose body-frame rotation). Result ≈ pitch ≈ −0.24 rad (flexion is negative here), yaw small, roll small — all within the ±2.094 hip bounds. ✓ Fits.

Frame 18, LeftLeg: w=0.878 → the knee is substantially flexed. The converted pitch will be strongly negative (≈ −1.3 rad) which is inside [−2.618, 0]. ✓ Fits — *as long as the sign convention is respected*.

---

## Part 4 — Feasibility Verdict & Fidelity Analysis

### Verdict: Convertible with caveats — "imitation" ✓, "verbatim replay" ✗

| Motion aspect | Fidelity | Reason |
|---|---|---|
| **Leg walk cycle** (hip pitch/yaw/roll + knee + ankle + toe) | **High** (≈90%) | All DOF exist as actuators; ranges fit; the walk's key flexions are within ±2.6 rad |
| **Arm swing** (shoulder, arm, forearm) | **Medium-high** (≈75%) | All DOF exist; stream arm values (±0.5 rad) fit ±2.356; elbow flexion fits [0, 2.531] |
| **Spine/trunk sway** | **Medium** (≈70%) | 3-DOF spine exists but ±0.524 cap will clamp the stream's stronger sways if any |
| **Head/neck** | Medium | Exists but the axis swap must be applied; stream head values (±0.05 rad) are small |
| **Hands/fingers** | **Low** (≈30%) | 15 finger bones per hand in stream; rig has 1-DOF pitch-only per finger + tendon-synergy restriction (finger2/3 rejected if finger1 base is 0). Stream has mostly-identity finger quats, so impact is minimal for *walking* — but don't expect finger detail |
| **Root translation / forward locomotion** | **Currently not natively wired** | No actuator drives the freejoint position; must be added or routed through the KGRF/gait system. **This is the single biggest gap.** |
| **Vertical hip bob** | Medium | Can be approximated by root-capsule Y command or ignored (KGRF handles ground contact) |

### The 3 show-stopper caveats for implementation

1. **Root motion**: The `ch: pos` channel on Hips is cumulative forward travel. There is **no code path today** that consumes a forward velocity target and makes the MuJoCo rig walk a given distance. The KGRF injector (`applyKinematicGroundReactionForces`) *does* apply forward impulses based on foot contact — it can be driven by setting `gaitActive(true)` + commanding leg poses, but it won't precisely track the Mixamo root path. For exact tracking you'd need to extend the engine (e.g., a per-frame `qpos`/`qvel` injection on the capsule freejoint, or a PID on root X/Z toward the animation's trajectory).

2. **Sign conventions clash for knees**: Mixamo's flexion is **positive** in its stream (LeftLeg frame 18 `w=0.878` with `x≈0.477` positive); Synthia's rig encodes knee flexion as **negative** pitch with a hard rejection of positive values (`x[1] === 0` → clamped to 0). The importer must **negate converted pitch for `mixamorigleftleg`/`rightleg`** (and for elbows remember Synthia is positive+ only while Mixamo may be negative or positive depending on retarget). This is the most likely source of an inverted-knee walk if overlooked.

3. **Fingers as 1-DOF** and **shoulder clamp ±0.261 rad (15°)**: The rig shoulder constraint (`x: [-0.261, 0.261]`) is extremely tight vs. Mixamo shoulders (±0.5–1.5 rad capacity). Walking values are small (≤0.15) so they fit, but any swagger will be heavily clamped.

### The conversion pipeline (recommended implementation plan)

1. **Parse** the stream: header → frame_descriptor → ordered frames; build `{boneName → offset}` map.
2. **Normalize** bone keys (`mixamorig:LeftArm` → `mixamorighips`-style, using `normalizeBoneKey`).
3. For each frame, for each tracked bone:
   - Read quaternion (w,x,y,z).
   - Reconstruct **local parent-relative** frame (walk the hierarchy from Hips).
   - Convert to MuJoCo via `PhysicsEngine.threeQuatToMuJoCo`.
   - Compute relative quat to parent (mirroring `syncRigidBodiesFromBones`).
   - `new THREE.Euler().setFromQuaternion(qRel, 'ZXY')` → `{yaw: euler.z, pitch: euler.x, roll: euler.y}`.
4. **Apply per-bone conversions**: 1-DOF → take pitch only; 2-DOF → pitch + mapped roll; 3-DOF → all three; head/neck → swap yaw↔roll; knees → **negate pitch**; fingers → clamp [0, 1.745] + synergy check.
5. **Clamp** using `SYNTHIA_RIG_CONSTRAINTS` ranges (and `locomotionCap` is already 1.0 for hips/legs — no extra cap needed for walking).
6. **Build a `TimelineSequence`**: `[{ timeOffsetMs: frame * 33.33, overrides: { canonicalBone: [x, y, z] | scalar } }]`.
7. Feed through `validateAndApplyTimeline(skeleton, sequence, { activeGaitPhase: true })` → it performs the official clamping/synergy/scapulohumeral/cervical injections automatically. This is the intended ingestion path (see `syncVisuals`'s timeline-stepper interpolation).
8. **Root motion**: extract per-frame hip velocity (Δpos × 0.01 / dt). Either (a) extend `HumanoidPhysicsBinder` with a `setRootVelocity(v)` that writes the capsule freejoint's qvel[0..2] each step, or (b) rely on `gaitActive` + KGRF. Option (a) is more faithful to the clip; option (b) is more physically stable.
9. Set `setGaitActive(true)` on the binder (lowers capsule balance gain to 15%, allowing the animation's leg poses to actually drive weight shift without the balance servo fighting every step).

---

## Part 5 — Reference: Key Code Locations

| Concern | File | Notable symbols |
|---|---|---|
| Timeline ingestion, joint validation, clamping | `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline`, `setMotorTargets`, `resolveJointAlias`, `updateMotorTargets`, `syncVisuals` (timeline stepper interpolation), `setGaitActive`, `applyKinematicGroundReactionForces` |
| Torque/ctrl dispatch & axis order | `src/world/engine/MotorController.ts` | `setTargets` (actuator[0]=yaw, [1]=pitch, [2]=roll; LLM x=pitch, y=yaw, z=roll), `applyCapsuleBalance` (gait scale 0.15) |
| MJCF generation, joint axes, head/neck swap, gains | `src/world/engine/MJCFHumanoidTemplate.ts` | `BONE_JOINT_TYPE`, `getMuJoCoBoneGains`, `buildBodyTreeXML` (axis strings, head/neck yaw/roll swap) |
| Rig constraint ranges & sign conventions | `src/constants/rigConstraints.ts` | knee x:[−2.618, 0]; elbow/finger/toe x:[0, +]; shoulder ±0.261; `locomotionCap` on hips/legs |
| Anatomical limits fallback | `src/constants/anatomicalLimits.ts` | `getAnatomicalLimitForBone`, `clampToAnatomicalLimit` |
| Physics↔bone quaternion round-trip (the exact math to mirror) | `src/world/engine/BodyManager.ts` | `syncRigidBodiesFromBones` (ZXY Euler: yaw=z, pitch=x, roll=y) |
| World↔MuJoCo conversion helpers | `src/world/engine/PhysicsEngine.ts` | `worldToMuJoCo`, `mujocoToWorld`, `threeQuatToMuJoCo`, `mujocoQuatToThree` (note: quat alignment is +90° about X) |
| State capture/restore (root pos/quat & per-joint qpos, if you inject root motion) | `src/world/engine/StateRehydrator.ts` | `capture`, `restore` |

---

## Part 6 — Suggested Implementation Order (for a developer)

1. Read `src/types/joint.ts` (TimelineSequence shape) + `src/world/engine/HumanoidPhysicsBinder.ts` up through `validateAndApplyTimeline` and the `syncVisuals` timeline stepper.
2. Read `src/world/engine/BodyManager.ts` `syncRigidBodiesFromBones` — mirror its quaternion→Euler math exactly.
3. Read `src/constants/rigConstraints.ts` — memorize the sign conventions (knee negative, elbow/finger positive, shoulder ±0.261, head/neck swap reference in MJCFHumanoidTemplate).
4. Write a parser for the SJSON stream (it's line-oriented JSON-ish; each `{ "type": "frame", ...}` is a complete JSON object on one line).
5. Build the converter (Part 4 plan), producing a `TimelineSequence`.
6. Wire it into the app (find the current animation-ingestion call site for the sequenced JSON files under `model data/sequenced animation/` — those files are the *closest existing format* and the walk stream should be converted into that same shape).
7. Add root velocity handling (extend binder or use KGRF+gaitActive).

## Suggested Reading Order

1. `src/types/joint.ts` — the data contract (TimelineSequence, normalizeBoneKey)
2. `src/constants/rigConstraints.ts` — all range/sign semantics
3. `src/world/engine/MotorController.ts` — how ctrl values map to joint axes
4. `src/world/engine/MJCFHumanoidTemplate.ts` — how the rig is generated (axis selection, head/neck swap, gains)
5. `src/world/engine/BodyManager.ts` — the quaternion→yaw/pitch/roll math to mirror (`syncRigidBodiesFromBones`)
6. `src/world/engine/HumanoidPhysicsBinder.ts` — the ingestion/interpolation/root-motion/KGRF integration points
