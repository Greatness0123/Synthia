# Synthia Diagnostic Poses — Comprehensive Guide & Axis Reference

This document details the axis conventions, joint limits, tendon synergy rules, and coordinate transformations used in Synthia's diagnostic pose library (`diagnostic_poses_v2.js`).

---

## 1. System Architecture & Action Pipeline

Synthia's pose pipeline processes joint overrides dispatched via browser events:

```
[Console / Script] 
       │
       ▼
window.dispatchEvent(new CustomEvent('synthia:action', { detail: { jointOverrides, sequence } }))
       │
       ▼
[useWorld.ts handleAction()] 
       │
       ▼
[HumanoidPhysicsBinder.validateAndApplyTimeline()] 
       │  • Checks anatomical limits & rig constraints
       │  • Validates tendon synergy (finger segment 1 requirement)
       │  • Clamps angles & logs rejections
       ▼
[MotorController.setTargets()]
       │  • Maps [X, Y, Z] targets to MuJoCo actuators:
       │      actuator 0 (YAW)   ← Z (index 2)
       │      actuator 1 (PITCH) ← X (index 0)
       │      actuator 2 (ROLL)  ← Y (index 1)
       ▼
[MuJoCo Physics Engine]
```

---

## 2. Joint Axis & Sign Conventions

### 2.1 Coordinate Mapping (Three.js ↔ MuJoCo)
- **Three.js World Space**: `+X` = Right, `+Y` = Up, `+Z` = Out of screen (facing viewer).
- **MuJoCo Space**: `worldToMuJoCo({x, y, z})` = `[x, -z, y]`.
  - MuJoCo `+X` = Three.js `+X` (Right)
  - MuJoCo `+Y` = Three.js `-Z` (Into screen / Backward)
  - MuJoCo `+Z` = Three.js `+Y` (Up)

### 2.2 Spherical 3-DOF Bones (`[X, Y, Z]` target array)
For 3-DOF joints (Head, Neck, Spine, Shoulders, Hips, Wrists), targets are provided as `[X, Y, Z]`:

| Input Index | Target Variable | Actuator Joint | MuJoCo Local Axis | Three.js Equivalent Axis | Positive Value (+deg) Motion | Negative Value (-deg) Motion |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Index 0 (`X`)** | `pitch` | `_pitch` | `1 0 0` (X) | Local X | **Forward Pitch / Flexion** (Lean fwd, nod down) | **Backward Pitch / Extension** (Lean back, tilt up) |
| **Index 1 (`Y`)** | `roll` | `_roll` | `0 1 0` (Y) | Local -Z | **Tilt LEFT** (towards character's left) | **Tilt RIGHT** (towards character's right) |
| **Index 2 (`Z`)** | `yaw` | `_yaw` | `0 0 1` (Z) | Local +Y | **Turn/Twist LEFT** (counter-clockwise top view) | **Turn/Twist RIGHT** (clockwise top view) |

#### Why `Y < 0` Tilts Right and `Y > 0` Tilts Left:
1. `Y` (index 1) drives the `_roll` actuator (`axis="0 1 0"` in MuJoCo local space).
2. Local `0 1 0` in MuJoCo corresponds to `-Z` in Three.js world space (pointing into the screen away from viewer).
3. By the right-hand rule around `-Z`, positive rotation causes a clockwise tilt when looking at the character from the front.
4. Clockwise tilt moves the top of the body to screen right (`+X`), which is the character's **LEFT side**.
5. Therefore:
   - `Y = -15 * DEG` tilts torso/head to character's **RIGHT**.
   - `Y = +15 * DEG` tilts torso/head to character's **LEFT**.
   - `Z = -20 * DEG` turns torso/head to character's **RIGHT**.
   - `Z = +20 * DEG` turns torso/head to character's **LEFT**.

---

## 3. Limb-Specific Conventions

### 3.1 Shoulders (`mixamorigrightarm`, `mixamorigleftarm`)
- **`X` (pitch)**:
  - `X > 0`: Adduction (lowers arm down toward side of body).
  - `X < 0`: Abduction (raises arm outward / overhead up to `-90°` or `-135°`).
- **`Z` (yaw / swing)**:
  - **Right Arm**: `Z < 0` swings arm FORWARD; `Z > 0` swings arm BACKWARD.
  - **Left Arm**: `Z > 0` swings arm FORWARD; `Z < 0` swings arm BACKWARD.
- **`Y` (roll / twist)**:
  - Internal / external rotation along arm longitudinal axis.

### 3.2 Elbows / Forearms (`mixamorigrightforearm`, `mixamorigleftforearm`)
- **DOF**: 1 (Scalar value in radians).
- **Range**: `[0, 2.531 rad]` (0° to ~145°).
- **Behavior**:
  - `scalar > 0`: Flexion (bends elbow inward).
  - `scalar <= 0`: Extended (straight arm). Negative values clamped to 0 (no hyperextension).

### 3.3 Hips / UpLegs (`mixamorigrightupleg`, `mixamorigleftupleg`)
- **`X` (pitch)**: `X > 0` = kick forward; `X < 0` = kick backward.
- **`Z` (yaw/abduction)**: `Z > 0` = abduct leg outward to the side.

### 3.4 Knees / Legs (`mixamorigrightleg`, `mixamorigleftleg`)
- **DOF**: 1 (Scalar value in radians).
- **Range**: `[-2.618, 0]` (-150° to 0°).
- **Behavior**:
  - `scalar < 0`: Flexion (bends knee backward).
  - `scalar >= 0`: Straight leg. Positive values clamped to 0.

### 3.5 Ankles / Feet (`mixamorigrightfoot`, `mixamorigleftfoot`)
- **DOF**: 2 (`[X, 0, Z]`).
- **Behavior**:
  - `X > 0`: Dorsiflexion (toes up / heel strike).
  - `X < 0`: Plantarflexion (toes pointed down / push-off).

---

## 4. Hand & Finger Anatomy Rules

### 4.1 Finger Axes & Sign
- **DOF**: 1 (Scalar value per segment).
- **Range**: `[0, 1.745 rad]` (0° to 100° per segment).
- **Flexion direction**:
  - `scalar > 0`: Flexes segment **TOWARD PALM** (curling finger inward).
  - `scalar = 0`: Fully extended (flat hand).
  - `scalar < 0`: Clamped to 0 (no back-of-hand snapping).

### 4.2 Tendon Synergy Rule
Human hand biomechanics dictate that terminal phalanges (DIP/PIP joints) cannot flex independently without activating the MCP joint.

In `HumanoidPhysicsBinder.ts`:
If `mixamorig{side}hand{finger}2` or `3` is included in an override, `mixamorig{side}hand{finger}1` **MUST ALSO** be present in the override payload and > 0.
If segment 1 is missing, the validator rejects segment 2 and 3 overrides as `tendon_synergy_violation`.

### 4.3 Safe Closed Fist Angles
To form a anatomical fist without clipping or backsnap:
```javascript
// Example: Right Index Finger
'mixamorigrighthandindex1': 75 * DEG, // MCP flex
'mixamorigrighthandindex2': 85 * DEG, // PIP flex
'mixamorigrighthandindex3': 70 * DEG  // DIP flex
```

---

## 5. Timeline Sequences
For animated/timed poses, supply a `sequence` array:
```javascript
sendSequence("Walk Cycle", [
  { timeOffsetMs: 0,   overrides: { ... } },
  { timeOffsetMs: 250, overrides: { ... } },
  { timeOffsetMs: 500, overrides: { ... } },
]);
```
The internal stepper in `HumanoidPhysicsBinder.syncVisuals()` automatically interpolates smoothly between timeline frames using high-precision performance timers.
