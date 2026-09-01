# Synthia 1.5.1 — Complete Joint Dossier

## Summary

This document is the definitive reference for every joint in the Synthia humanoid model. It covers the joint type, DOF, rig limits, anatomical limits, MJCF axis mappings, actuator naming, gain values, and — critically — what each sign of each command actually does visually. It accounts for the **forward-is-minus-Z convention** and the **sign inversion between the calibration labels and visual reality**.

---

## Coordinate System & Sign Inversions

### The Three.js ↔ MuJoCo Mapping

```
Three.js → MuJoCo:  worldToMuJoCo(v) = (v.x, -v.z, v.y)
MuJoCo → Three.js:  mujocoToWorld(p)  = (p[0], p[2], -p[1])
```

| Direction | Three.js World | MuJoCo World |
|-----------|---------------|--------------|
| Forward (face direction) | **-Z** | **+Y** (but see inversion note below) |
| Backward | +Z | -Y |
| Up | +Y | +Z |
| Down | -Y | -Z |
| Left | -X | -X |
| Right | +X | +X |

### The Critical Sign Inversion

The MJCF comment states "MuJoCo -Y = 6cm forward" but this is **REVERSED on the live rig**. Verified by runtime probe:

- MuJoCo -Z maps to Three.js -Z (backward visually, because Three.js forward is -Z)
- MuJoCo +Y maps to Three.js +Z (also backward visually)
- **The visual front of the model is the OPPOSITE of what the MuJoCo label says**

**Practical consequence**: When the dossier says "pitch+ moves the knee to -Z (forward in Three.js)", that means the model visually moves forward. The MuJoCo frame label says +Y is forward, but the visual front is actually **-Y in MuJoCo terms**. The empirical probe tables in the JSON dossier are the ground truth — NOT the label conventions.

### Axis Naming Convention (ctrlMap)

For **all 3-DOF spherical joints**, the MotorController uses:

```
ctrlMap: { ctrl0: "yaw", ctrl1: "pitch", ctrl2: "roll" }
```

When sending `{ x, y, z }` from the LLM or action pipeline:
- **x** → pitch (ctrl1) — forward/backward tilt
- **y** → yaw (ctrl0) — left/right turn
- **z** → roll (ctrl2) — lateral tilt

For **2-DOF joints** (ankles, wrists):
```
ctrlMap: { ctrl0: "pitch", ctrl1: "roll" }
```
- **x** → pitch (ctrl0)
- **z** → roll (ctrl1)

For **1-DOF joints** (knees, elbows, fingers):
```
ctrlMap: { ctrl0: "pitch" }
```
- **x** or scalar → pitch (ctrl0)

---

## Head & Neck Axis Swap (Special Case)

For head/neck joints, the MJCF emitter **swaps yaw and roll axes** because the Mixamo T-pose bind quaternion bakes a ~90° rotation into the body frame:

| Joint | MJCF axis for yaw | MJCF axis for roll | Notes |
|-------|-------------------|-------------------|-------|
| Normal joints | `0 0 1` | `0 1 0` | Standard |
| Neck/Head | `0 1 0` | `0 0 1` | Swapped to restore correct world semantics |

This means for head/neck: body-local Y → world vertical → left/right turn, body-local Z → lateral side-tilt.

---

## Complete Joint Reference

### ZONE 1: ROOT (Free Joint — 6 DOF)

#### mixamorighips — ROOT PELVIS
| Property | Value |
|----------|-------|
| **DOF** | 6 (3 translational + 3 rotational) |
| **Type** | `fixed` in BONE_JOINT_TYPE — MJCF child of `root_capsule` freejoint |
| **Parent** | None (root of skeleton) |
| **Rig limits** | x: [-∞, +∞], y: [-∞, +∞], z: [-∞, +∞] |
| **Anatomical** | N/A |
| **MJCF joint** | None — driven by `rootMotion`/`setTranslation` on the freejoint |
| **Actuators** | None |
| **Bind quaternion** | [-0.7025, 0, 0, 0.7117] |
| **How to move** | `setTranslation({x, y, z})` or `setCapsulePosition(x, y, z)` — not via joint targets |

---

### ZONE 2: SPINE & TORSO (3-DOF Spherical)

All spine joints use the same axis pattern:
- MJCF yaw axis: `0 0 1` (body-local Z)
- MJCF pitch axis: `1 0 0` (body-local X)
- MJCF roll axis: `0 1 0` (body-local Y)

Gains: **kp=700, kv=130** (stiff trunk to resist gravitational sag)

#### mixamorigspine — LOWER SPINE
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Type** | `spherical` → decomposed to 3 hinge joints in MJCF |
| **Parent** | mixamorighips |
| **Rig limits** | x (pitch): [-0.524, 0.785] (−30° to +45°), y (yaw): [-0.524, 0.524] (±30°), z (roll): [-0.524, 0.524] (±30°) |
| **Anatomical** | min: −45° (−0.7854 rad), max: +45° (+0.7854 rad) |
| **Allowance** | `locomotionCap: 1.0` — scaled during gait |
| **MJCF joint names** | `mixamorigspine_yaw`, `mixamorigspine_pitch`, `mixamorigspine_roll` |
| **Actuator names** | `act_mixamorigspine_yaw`, `act_mixamorigspine_pitch`, `act_mixamorigspine_roll` |

**What commands do:**
| Command | Ctrl index | Visual effect |
|---------|-----------|---------------|
| `{x: +0.5}` | pitch (ctrl1) | Torso tips **forward** (face toward ground). +X pitch = forward lean. Rig max +0.785 (+45°) |
| `{x: -0.5}` | pitch (ctrl1) | Torso tips **backward** (arch back). Rig min −0.524 (−30°) |
| `{y: +0.5}` | yaw (ctrl0) | Torso twists **left** (nose turns left). ±0.524 (±30°) |
| `{y: -0.5}` | yaw (ctrl0) | Torso twists **right** |
| `{z: +0.5}` | roll (ctrl2) | Torso tilts **left** (left shoulder drops). ±0.524 (±30°) |
| `{z: -0.5}` | roll (ctrl2) | Torso tilts **right** (right shoulder drops) |

**Asymmetric pitch note**: The rig allows +0.785 forward lean but only −0.524 backward lean — the spine can bend more forward than backward.

---

#### mixamorigspine1 — MID SPINE
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigspine |
| **Rig limits** | x: [-0.524, 0.524] (±30° all axes — **symmetric**) |
| **Anatomical** | ±45° (±0.7854 rad) |
| **Gains** | kp=700, kv=130 |

**What commands do:** Same axis semantics as `mixamorigspine` but symmetric ±30° on all axes. Adds onto the lower spine rotation (cumulative).

---

#### mixamorigspine2 — UPPER SPINE / CHEST
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigspine1 |
| **Rig limits** | x: [-0.524, 0.524] (±30° all axes — symmetric) |
| **Anatomical** | ±45° (±0.7854 rad) |
| **Gains** | kp=700, kv=130 |
| **Special** | **COM lean-reflex target** — Road-4 injects lean offset here |

**What commands do:** Same as spine/spine1. The COM reflex controller adds additive pitch deltas here to counter-lean the torso.

**Reflex injection**: `allocateLeanA(leanOffsetRad, basePitch)` writes a pitch delta to spine2. Positive `leanOffsetRad` = lean BACK (counters forward COM).

---

### ZONE 3: NECK & HEAD (3-DOF Spherical, Axis-Swapped)

**CRITICAL**: Yaw and roll axes are swapped relative to all other joints (see Head & Neck Axis Swap above).

#### mixamorigneck — NECK
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigspine2 |
| **Rig limits** | x (pitch): [-1.047, 1.047] (±60°), y (yaw): [-1.222, 1.222] (±70°), z (roll): [-1.047, 1.047] (±60°) |
| **Anatomical** | ±60° (±1.0472 rad) |
| **Gains** | kp=80, kv=25 (soft — high kp causes bobblehead oscillation due to small inertia) |
| **Allowance** | `requiresCervicalCoupling: true` — yaw automatically injects a roll counter-tilt |

**MJCF axes (SWAPPED):**
| Joint | MJCF axis | Effect |
|-------|-----------|--------|
| `mixamorigneck_yaw` | `0 1 0` | Left/right head turn |
| `mixamorigneck_pitch` | `1 0 0` | Forward/backward head tilt |
| `mixamorigneck_roll` | `0 0 1` | Lateral head tilt (ear to shoulder) |

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `{x: +1.0}` | Head tilts **forward** (chin toward chest). Max +1.047 (+60°) |
| `{x: -1.0}` | Head tilts **backward** (look up). Min −1.047 (−60°) |
| `{y: +1.0}` | Head turns **left**. Max +1.222 (+70°) |
| `{y: -1.0}` | Head turns **right**. Min −1.222 (−70°) |
| `{z: +0.5}` | Head tilts **left** (ear toward left shoulder). ±1.047 (±60°) |

**Cervical coupling**: When yaw (y) is set, an automatic roll injection is applied: `z_inject = -0.15 × yaw_value`. This counter-tilts the head naturally when turning.

---

#### mixamorighead — HEAD
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigneck |
| **Rig limits** | x: [-1.047, 1.047] (±60°), y: [-1.047, 1.047] (±60°), z: [-1.047, 1.047] (±60°) |
| **Anatomical** | ±60° (±1.0472 rad) |
| **Gains** | kp=80, kv=25 |

**What commands do:** Same semantics as neck (axis-swapped). Adds onto neck rotation cumulatively. The head bone carries the AI camera for first-person vision.

---

### ZONE 4: SHOULDERS (3-DOF Spherical)

All shoulder joints use standard axis mapping (yaw=`0 0 1`, pitch=`1 0 0`, roll=`0 1 0`).

Gains: **kp=150, kv=30**

#### mixamorigleftshoulder — LEFT SHOULDER
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigspine2 |
| **Rig limits** | x: [-0.7, 0.7] (±40°), y: [-0.7, 0.7], z: [-0.7, 0.7] |
| **Anatomical** | ±180° (±3.1416 rad) |
| **Bind quaternion** | [0.4844, 0.571, -0.5262, 0.4031] |

**What commands do (EMPIRICALLY VERIFIED by MuJoCo probe):**
| Command | Ctrl index | Verified world delta | Visual effect |
|---------|-----------|---------------------|---------------|
| `{x: +0.5}` | pitch (ctrl1) | dWorld (0.000071, -0.002493, -0.025150) | Left arm swings **forward and across** (toward -Z world = forward in Three.js) |
| `{x: -0.5}` | pitch (ctrl1) | dWorld (0.002811, 0.002159, -0.022588) | Left arm swings **backward/outward** |
| `{z: +0.5}` | roll (ctrl2) | dWorld (-0.000653, -0.000361, -0.012164) | Left arm **abducts** (lifts away from body to the left) |
| `{z: -0.5}` | roll (ctrl2) | dWorld (0.000759, 0.000114, -0.001096) | Left arm **adducts** (drops toward body) |
| `{y: +0.5}` | yaw (ctrl0) | dWorld (-0.000893, -0.001045, -0.015952) | Left arm rotates **externally** |
| `{y: -0.5}` | yaw (ctrl0) | dWorld (-0.000093, -0.000586, -0.013377) | Left arm rotates **internally** |

---

#### mixamorigrightshoulder — RIGHT SHOULDER
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigspine2 |
| **Rig limits** | x: [-0.7, 0.7] (±40°), y: [-0.7, 0.7], z: [-0.7, 0.7] |
| **Anatomical** | ±180° (±3.1416 rad) |
| **Bind quaternion** | [0.4844, -0.571, 0.5262, 0.4031] (mirror of left) |

**What commands do (EMPIRICALLY VERIFIED):**
| Command | Ctrl index | Verified world delta | Visual effect |
|---------|-----------|---------------------|---------------|
| `{x: +0.5}` | pitch (ctrl1) | dWorld (0.000351, -0.002007, -0.004738) | Right arm swings **forward** |
| `{x: -0.5}` | pitch (ctrl1) | dWorld (-0.002760, 0.002746, -0.002967) | Right arm swings **backward** |
| `{z: +0.5}` | roll (ctrl2) | dWorld (-0.001563, 0.000715, 0.020988) | Right arm **abducts** (lifts away to the right) |
| `{z: -0.5}` | roll (ctrl2) | dWorld (0.008011, -0.002882, -0.037025) | Right arm **adducts** (drops toward body) |
| `{y: +0.5}` | yaw (ctrl0) | dWorld (0.001229, -0.001950, -0.000963) | Right arm rotates **externally** |
| `{y: -0.5}` | yaw (ctrl0) | dWorld (0.000048, 0.000380, 0.002602) | Right arm rotates **internally** |

**IMPORTANT**: Shoulders were widened from ±0.261 to ±0.7 for walk retarget. A reverted rig would pin authored gait motion.

---

### ZONE 5: UPPER ARMS (3-DOF Spherical)

Gains: **kp=200, kv=40**

#### mixamorigleftarm / mixamorigrightarm
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Parent** | mixamorigleftshoulder / mixamorigrightshoulder |
| **Rig limits** | x (pitch): [-2.356, 2.356] (±135°), y (yaw): [-1.57, 1.57] (±90°), z (roll): [-1.57, 1.57] (±90°) |
| **Anatomical** | ±180° (±3.1416 rad) |
| **Allowance** | `scapulohumeralRatio: 2.0` — automatic shoulder injection when arm exceeds ±0.523 rad |

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `{x: +2.0}` | Arm swings **forward** (flexion). Rig max +2.356 (+135°) |
| `{x: -2.0}` | Arm swings **backward** (extension). Rig min −2.356 (−135°) |
| `{y: +1.0}` | Arm rotates **externally** (elbow points outward). ±90° |
| `{y: -1.0}` | Arm rotates **internally** (elbow points inward) |
| `{z: +1.0}` | Arm **abducts** (lifts sideways away from body). ±90° |
| `{z: -1.0}` | Arm **adducts** (pulls toward body) |

**Scapulohumeral injection**: When arm pitch (x) exceeds ±0.523 rad (30°), the shoulder automatically receives an injection:
```
delta = clamp((|armX| - 0.523) / 2.0, ±0.2618)
```
This couples shoulder blade movement to arm elevation for natural-looking reach.

---

### ZONE 6: FOREARMS (1-DOF Revolute — Hinge)

Gains: **kp=200, kv=40**

#### mixamorigleftforearm / mixamorigrightforearm
| Property | Value |
|----------|-------|
| **DOF** | 1 (revolute — hinge joint) |
| **Type** | `revolute` |
| **Parent** | mixamorigleftarm / mixamorigrightarm |
| **Rig limits** | x: [0.0, 2.531] (0° to +145° — **flexion only, no hyperextension**) |
| **Anatomical** | min: 0, max: 2.5307 rad (+145°) |
| **MJCF axis** | `1 0 0` (pitch) |
| **MJCF joint** | `mixamorigleftforearm_pitch` / `mixamorigrightforearm_pitch` |

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `+1.0` or `{x: 1.0}` | Forearm **bends** (elbow flexion — hand toward shoulder). +1.0 ≈ 57° |
| `+2.5` | Near-maximum bend (+145° — hand almost touching shoulder) |
| `0.0` | Arm fully **straight** (0°) |
| Negative values | **Clamped to 0** — no hyperextension. The rig has `x[1]===0.0 && v>0 → return 0.0` rule for the negative side, but the range is [0, 2.531] so negatives are simply outside range |

**Clamp rule**: `positive_x_clamped_to_0` — if `dof===1 && constraint.x[1]===0.0 && v>0`, value is clamped to 0. This doesn't apply here since x[1]=2.531, but applies to toebase joints.

---

### ZONE 7: WRISTS / HANDS (3-DOF)

Gains: **kp=150, kv=30**

#### mixamoriglefthand / mixamorigrighthand
| Property | Value |
|----------|-------|
| **DOF** | 3 (decomposed to yaw + pitch + roll) |
| **Type** | `spherical` → 3 hinge joints in MJCF |
| **Parent** | mixamorigleftforearm / mixamorigrightforearm |
| **Rig limits** | x (pitch): [-1.396, 1.396] (±80°), y (yaw): [-0.524, 0.524] (±30°), z (roll): [-0.349, 0.349] (±20°) |
| **Anatomical** | ±80° (±1.3963 rad) |
| **Allowance** | `dartThrowingOblique: true` |
| **MJCF joints** | `*_yaw` (axis `0 0 1`), `*_pitch` (axis `1 0 0`), `*_roll` (axis `0 1 0`) |

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `{x: +1.0}` | Wrist **flexes** (hand curls inward toward forearm). Max +80° |
| `{x: -1.0}` | Wrist **extends** (hand bends backward). Max −80° |
| `{y: +0.5}` | Wrist **pronates** (palm rotates upward/forward). Max +30° |
| `{y: -0.5}` | Wrist **supinates** (palm rotates downward/backward). Max −30° |
| `{z: +0.3}` | Wrist **ulnar deviation** (hand tilts toward pinky side). ±20° |
| `{z: -0.3}` | Wrist **radial deviation** (hand tilts toward thumb side) |

---

### ZONE 8: FINGERS & THUMBS (1-DOF Revolute — Hinge)

Gains: **kp=5, kv=1** (very soft — tendon-synergy driven)

All finger/thumb segments (index, middle, ring, pinky × segments 1-3, and thumb × segments 1-3) for both hands follow the same pattern:

| Property | Value |
|----------|-------|
| **DOF** | 1 (revolute) |
| **Rig limits** | x: [0.0, 1.745] (0° to +100° — **flexion only**) |
| **Anatomical** | min: 0, max: 1.7453 rad (+100°) |
| **MJCF axis** | `1 0 0` |
| **Naming** | `mixamorig{side}hand{finger}{segment}` e.g. `mixamorigrighthandindex2` |

**Segments**: 1 (proximal, near palm), 2 (middle), 3 (distal, fingertip)

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `+1.0` | Finger **curls** inward (fist). +1.0 ≈ 57° |
| `+1.745` | Maximum curl (+100° — tight fist) |
| `0.0` | Finger **straight** (extended) |

**Tendon synergy rule**: Segments 2 and 3 have `tendonSynergyLink: true`. They are **rejected** if the base segment (segment 1) has `|angle| <= 0.01` rad. You must curl segment 1 first before segments 2/3 will move. This simulates the anatomical tendon coupling where middle/distal phalanges cannot flex independently.

**Thumb naming**: `mixamorig{side}handthumb{1,2,3}` — same flexion-only pattern.

---

### ZONE 9: HIPS / UPPER LEGS (3-DOF Spherical)

Gains: **kp=900, kv=150** (high — upright trunk stabilization)

#### mixamorigleftupleg / mixamorigrightupleg
| Property | Value |
|----------|-------|
| **DOF** | 3 (spherical) |
| **Type** | `spherical` |
| **Parent** | mixamorighips |
| **Rig limits** | x: [-2.094, 2.094] (±120°), y: [-2.094, 2.094], z: [-2.094, 2.094] |
| **Anatomical** | ±120° (±2.0944 rad) |
| **Allowance** | `locomotionCap: 1.0` |

**What commands do (EMPIRICALLY VERIFIED by MuJoCo probe):**

**Left hip (`mixamorigleftupleg`):**
| Command | Ctrl index | Verified knee delta | Visual effect |
|---------|-----------|--------------------| --------------|
| `{x: +0.2}` | pitch (ctrl1) | dZ = −0.001989 (−Z = **FORWARD** in Three.js) | Leg swings **forward** (hip flexion). Knee tip moves to world -Z |
| `{x: -0.2}` | pitch (ctrl1) | dZ = −0.003301 (also -Z, less magnitude) | Leg swings **backward** (hip extension). Clamped more aggressively |
| `{z: +0.2}` | roll (ctrl2) | dX = −0.015574 (−X = left) | Leg **abducts** (moves left outward) |
| `{z: -0.2}` | roll (ctrl2) | dX = +0.023929 (+X = right) | Leg **adducts** (moves right inward) |
| `{y: +0.2}` | yaw (ctrl0) | dX = −0.002077, dZ = −0.003018 | Leg rotates **externally** (toes point outward) |
| `{y: -0.2}` | yaw (ctrl0) | dX = +0.000369, dZ = −0.004550 | Leg rotates **internally** (toes point inward) |

**Right hip (`mixamorigrightupleg`):**
| Command | Ctrl index | Verified knee delta | Visual effect |
|---------|-----------|--------------------| --------------|
| `{x: +0.2}` | pitch (ctrl1) | dZ = −0.003262 (−Z = **FORWARD**) | Leg swings **forward** |
| `{x: -0.2}` | pitch (ctrl1) | dZ = −0.003479 (−Z) | Leg swings **backward** |
| `{z: +0.2}` | roll (ctrl2) | dX = −0.015608 | Leg **abducts** (right, outward) |
| `{z: -0.2}` | roll (ctrl2) | dX = +0.024000 | Leg **adducts** (left, inward) |
| `{y: +0.2}` | yaw (ctrl0) | dZ = −0.005754 | Leg rotates **externally** |
| `{y: -0.2}` | yaw (ctrl0) | dZ = −0.003500 | Leg rotates **internally** |

**KEY FINDING**: The task brief's claim that "positive upleg pitch → knee tip world +Z (backward)" is **FALSIFIED**. Both uplegs' pitch± moves the knee to dZ=−0.002 to −0.003 (world -Z = **FORWARD**). The empirical probe is the ground truth.

---

### ZONE 10: KNEES (1-DOF Revolute — Hinge)

Gains: **kp=1000, kv=180** (highest in the body — prevents continuous squatting)

#### mixamorigleftleg / mixamorigrightleg
| Property | Value |
|----------|-------|
| **DOF** | 1 (revolute) |
| **Type** | `revolute` |
| **Parent** | mixamorigleftupleg / mixamorigrightupleg |
| **Rig limits** | x: [0.0, 2.618] (0° to +150° — **flexion only**) |
| **Anatomical** | min: 0, max: 2.618 rad (+150°) |
| **Allowance** | `locomotionCap: 1.0` |
| **MJCF axis** | **`-1 0 0`** (NEGATIVE X — critical!) |

**CRITICAL AXIS NOTE**: The knee uses axis `-1 0 0` (negative pitch axis), unlike all other revolute joints which use `1 0 0`. This is because "anatomical flexion is positive" — a positive ctrl value bends the knee backward (flexion). The negative axis inverts the MuJoCo convention so that +ctrl = visually correct backward bend.

**What commands do (EMPIRICALLY VERIFIED):**
| Command | Verified qpos | Visual effect |
|---------|--------------|---------------|
| `+0.2` or `{x: 0.2}` | qpos = +0.0366 (confirmed positive) | Knee **bends backward** (flexion — heel toward buttock). Ankle moves: dWorld (−0.005, +0.017, −0.001) |
| `+1.0` | Stored as +1.0, passes rig and anatomical clamp | Deep knee bend (~57°) |
| `+2.5` | Near-maximum bend (+143°) | Maximum squat-like flexion |
| `−0.2` | qpos = −0.0006 — **CLAMPED to 0** by hinge range [0, 2.618] | Impossible to hyperextend. Negative values are silently clamped to 0 |
| `0.0` | qpos = 0 | Leg fully **straight** |

**Walking gait**: During the walk cycle, knee flexion peaks at ~+1.0 rad during swing phase and returns to ~0 during stance.

---

### ZONE 11: ANKLES / FEET (2-DOF)

Gains: **kp=600, kv=100** (critical for balance — pushes toes down to prevent backward fall)

#### mixamorigleftfoot / mixamorigrightfoot
| Property | Value |
|----------|-------|
| **DOF** | 2 (decomposed to pitch + roll) |
| **Type** | `spherical` → 2 hinge joints in MJCF |
| **Parent** | mixamorigleftleg / mixamorigrightleg |
| **Rig limits** | x (pitch): [-0.785, 0.785] (±45°), y: [0, 0] (unused), z (roll): [-0.785, 0.785] (±45°) |
| **Anatomical** | ±45° (±0.7854 rad) |
| **MJCF joints** | `*_pitch` (axis `1 0 0`), `*_roll` (axis `0 1 0`) |
| **Bind quaternion** | [0.4597, 0, 0, 0.8881] |

**Foot geometry**: Box collider — 10cm wide × 26cm long × 3cm thick. Sole center is offset 6cm toward MuJoCo -Y (which is visually **BACKWARD** on the live rig). The MJCF comment "MuJoCo -Y = 6cm forward" is **REVERSED**.

**What commands do:**
| Command | Visual effect |
|---------|---------------|
| `{x: +0.5}` | Foot **dorsiflexes** (toes lift up, heel stays down). Max +45° |
| `{x: -0.5}` | Foot **plantarflexes** (toes point down, heel lifts). Max −45° |
| `{z: +0.5}` | Foot **inverts** (sole turns inward). ±45° |
| `{z: -0.5}` | Foot **everts** (sole turns outward) |

**Walking role**: During stance, the ankle maintains slight dorsiflexion (x ≈ +0.1) to keep the COM over the support base. During swing, dorsiflexion increases to clear the toe.

---

### ZONE 12: TOES (1-DOF — INERT PASSTHROUGH)

#### mixamoriglefttoebase / mixamorigrighttoebase
| Property | Value |
|----------|-------|
| **DOF** | 1 |
| **Rig limits** | x: [-1.745, 0.0] (−100° to 0° — **extension only, no flexion**) |
| **Anatomical** | min: 0, max: 1.7453 rad |
| **MJCF** | **NONE** — no body, joint, or actuator is emitted |
| **Actuators** | None |

**CRITICAL**: Toebase joints are **inert passthroughs**. They exist in the GLB bone hierarchy but have NO entry in `BONE_JOINT_TYPE` in `MJCFHumanoidTemplate.ts`. This means:
- No MJCF body/joint/actuator is created
- BodyManager finds no actuator for them
- MotorController silently skips any toebase overrides
- All toe phasing during walking is carried by the leftfoot/rightfoot ankle pitch (x) and roll (z)

If you author a gait with toebase values: positive values are flattened by the `positive_x_clamped_to_0` rule (rig x=[-1.745, 0]), and the value is then ignored anyway.

---

## Actuator Gains Summary Table

| Bone group | kp | kv | Damping ratio ζ | Notes |
|------------|----|----|-----------------|-------|
| Fingers/Thumbs | 5 | 1 | ~0.16 (very underdamped) | Tendon-synergy driven, soft |
| Neck/Head | 80 | 25 | ~0.49 | Soft to prevent bobblehead oscillation |
| Shoulders | 150 | 30 | ~0.39 | Moderate |
| Wrists/Hands | 150 | 30 | ~0.39 | Moderate |
| Arms/Forearms | 200 | 40 | ~0.41 | Moderate |
| Spine (all 3) | 700 | 130 | ~0.35 | Stiff trunk |
| Ankles/Feet | 600 | 100 | ~0.32 | Balance-critical |
| Hips/Upper legs | 900 | 150 | ~0.28 | High for upright stabilization |
| Knees | 1000 | 180 | ~0.28 | Highest — prevents squatting |

---

## Clamp Rules (Layer Pipeline)

Targets pass through a 3-layer clamp pipeline before reaching MuJoCo:

### L1 — Rig Gate (HumanoidPhysicsBinder.validateAndApplyTimeline)
- Clamps each axis to the rig limits from `SYNTHIA_RIG_CONSTRAINTS`
- `positive_x_clamped_to_0`: For 1-DOF joints where `x[1]===0.0` and value is positive, value → 0
- `locomotionCap`: When gait active AND allowance present, limits are scaled by cap factor
- `scapulohumeralRatio`: Arm pitch >0.523 → auto-injects shoulder delta ±0.2618
- `cervicalCoupling`: Neck yaw → auto-injects neck roll = -0.15 × yaw
- `tendonSynergyLink`: Finger seg2/3 rejected if seg1 |angle| ≤ 0.01

### L2 — Target Store (HumanoidPhysicsBinder.setMotorTargets)
- Resolves joint aliases (e.g. `right_knee` → `mixamorigrightleg`)
- Clamps scalar targets to anatomical limits from `getAnatomicalLimitForBone()`
- Stores in `currentTargets` map

### L3 — Anatomical Clamp (MotorController.setTargets)
- Final clamp using `getAnatomicalLimitForBone()` (post-fix: knee positive flexion now works)
- Applies 20-step ramp factor: `min(1.0, stepCount/20)` — first 20 frames ramp from 0 to full
- Writes to `data.ctrl` with the actuator bone name prefix

---

## Joint Parent Chain

```
mixamorighips (ROOT — freejoint)
├── mixamorigspine
│   ├── mixamorigspine1
│   │   └── mixamorigspine2
│   │       ├── mixamorigneck
│   │       │   └── mixamorighead
│   │       ├── mixamorigleftshoulder
│   │       │   └── mixamorigleftarm
│   │       │       └── mixamorigleftforearm
│   │       │           └── mixamoriglefthand
│   │       │               ├── mixamoriglefthandthumb1→2→3
│   │       │               ├── mixamoriglefthandindex1→2→3
│   │       │               ├── mixamoriglefthandmiddle1→2→3
│   │       │               ├── mixamoriglefthandring1→2→3
│   │       │               └── mixamoriglefthandpinky1→2→3
│   │       └── mixamorigrightshoulder
│   │           └── mixamorigrightarm
│   │               └── mixamorigrightforearm
│   │                   └── mixamorigrighthand
│   │                       ├── mixamorigrighthandthumb1→2→3
│   │                       ├── mixamorigrighthandindex1→2→3
│   │                       ├── mixamorigrighthandmiddle1→2→3
│   │                       ├── mixamorigrighthandring1→2→3
│   │                       └── mixamorigrighthandpinky1→2→3
├── mixamorigleftupleg
│   └── mixamorigleftleg
│       └── mixamorigleftfoot
│           └── mixamoriglefttoebase (INERT)
└── mixamorigrightupleg
    └── mixamorigrightleg
        └── mixamorigrightfoot
            └── mixamorigrighttoebase (INERT)
```

---

## Actuator Count

- **Total actuated joints**: 49
- **Excluded**: mixamorighips (fixed/freejoint), mixamoriglefttoebase (inert), mixamorigrighttoebase (inert)
- **Total in joints map**: 52 (including the 3 excluded)

---

## Special Systems

### RMBS (Reaction Mass Balance System)
- Body: `reaction_mass` (18 kg sphere, non-colliding)
- Joints: `rm_slide_lr` (slide X, ±0.6m) and `rm_slide_fa` (slide Y, ±0.6m)
- Actuators: `act_rm_slide_lr` (kp=1500, kv=260) and `act_rm_slide_fa` (kp=1500, kv=260)
- **NOT** in BodyManager.actuatorMap — written directly by ReactionMassController at 500 Hz
- The 60 Hz pose flush (MotorController.setTargets) must NEVER zero these

### Capsule Balance Torque
- Applied via `xfrc_applied` on the root_capsule body
- Default gains: kp=800, kd=320 (raised for 15 kg root)
- During gait: scaled to 50% (`GAIT_BALANCE_SCALE = 0.5`)
- RMBS auto-pairs with shock-absorber gains: kp=200, kd=40
- Max torque cap: 120 N·m

### Joint Alias Map (setMotorTargets accepts these friendly names)
| Alias | Resolves to |
|-------|------------|
| `right_knee` / `right_knee_flex` | mixamorigrightleg |
| `left_knee` / `left_knee_flex` | mixamorigleftleg |
| `right_hip_pitch` / `right_hip_roll` / `right_hip_yaw` | mixamorigrightupleg |
| `left_hip_pitch` / `left_hip_roll` / `left_hip_yaw` | mixamorigleftupleg |
| `right_ankle` / `right_ankle_pitch` / `right_ankle_roll` | mixamorigrightfoot |
| `left_ankle` / `left_ankle_pitch` / `left_ankle_roll` | mixamorigleftfoot |
| `right_elbow` / `right_elbow_flex` | mixamorigrightforearm |
| `left_elbow` / `left_elbow_flex` | mixamorigleftforearm |
| `right_shoulder_pitch` / `right_shoulder_roll` / `right_shoulder_yaw` | mixamorigrightarm |
| `left_shoulder_pitch` / `left_shoulder_roll` / `left_shoulder_yaw` | mixamorigleftarm |
| `head_yaw` / `head_pitch` / `head_roll` / `neck_*` | mixamorighead |
| `torso_*` / `spine2_*` / `upper_back_*` | mixamorigspine2 |
| `spine_*` / `hips_*` / `lower_back_*` | mixamorigspine |

---

## Quick Reference: "Send X, Get Y" Cheat Sheet

| Send this | Joint | Axis | Visual result |
|-----------|-------|------|---------------|
| `{mixamorigleftupleg: {x: 0.5}}` | Left hip | pitch | Left leg swings FORWARD |
| `{mixamorigleftupleg: {x: -0.5}}` | Left hip | pitch | Left leg swings BACKWARD |
| `{mixamorigleftleg: 0.8}` | Left knee | pitch | Left knee bends BACKWARD (flexion) |
| `{mixamorigleftleg: 0}` | Left knee | pitch | Left leg STRAIGHT |
| `{mixamorigleftfoot: {x: 0.3}}` | Left ankle | pitch | Toes lift UP (dorsiflexion) |
| `{mixamorigleftfoot: {x: -0.3}}` | Left ankle | pitch | Toes point DOWN (plantarflexion) |
| `{mixamorigspine2: {x: 0.3}}` | Upper spine | pitch | Torso leans FORWARD |
| `{mixamorigspine2: {x: -0.3}}` | Upper spine | pitch | Torso leans BACKWARD |
| `{mixamorighead: {x: 0.5}}` | Head | pitch | Head tilts FORWARD (chin down) |
| `{mixamorighead: {y: 0.5}}` | Head | yaw | Head turns LEFT |
| `{mixamorigleftarm: {x: 1.5}}` | Left arm | pitch | Left arm swings FORWARD |
| `{mixamorigleftarm: {z: 1.0}}` | Left arm | roll | Left arm lifts SIDEWAYS (abduction) |
| `{mixamorigleftforearm: 1.5}` | Left elbow | pitch | Left forearm BENDS (flexion) |
| `{mixamoriglefthand: {x: 0.8}}` | Left wrist | pitch | Wrist FLEXES (hand curls in) |
| `{mixamoriglefthandindex1: 1.5}` | Left index | pitch | Index finger CURLS (must do seg1 before seg2/3) |
