# Synthia Humanoid — Bone Mass & Weight Distribution Analysis

## Why The Humanoid Keeps Falling: Root Cause Analysis

This report documents every bone's mass in the Synthia humanoid physics model, compares it against ground-truth anthropomorphic reference data (ProtoMotions SMPL/AMP humanoids), and identifies the specific mass-distribution defects causing the persistent backward fall.

---

## 1. Complete Bone Mass Table (Synthia's `COMPLETE_MIXAMO_PHYSICS_MATRIX`)

Source: `src/constants/physics.ts` (lines 44–201)

### 1A. Axial Skeleton (Torso Core)

| Bone (Canonical Name) | Mass (kg) | Ixx (kg·m²) | Iyy | Izz | Category |
|---|---|---|---|---|---|
| `mixamorighips` | **12.0** | 0.450 | 0.350 | 0.400 | Pelvis/hips |
| `mixamorigspine` | **6.0** | 0.200 | 0.100 | 0.180 | Lower spine |
| `mixamorigspine1` | **5.0** | 0.150 | 0.080 | 0.140 | Mid spine |
| `mixamorigspine2` | **4.0** | 0.120 | 0.060 | 0.110 | Upper spine |
| `mixamorigneck` | **1.2** | 0.015 | 0.010 | 0.015 | Neck |
| `mixamorighead` | **4.3** | 0.040 | 0.035 | 0.040 | Head |
| **Axial subtotal** | **32.5** | | | | |

### 1B. Left Upper Limb

| Bone | Mass (kg) | Ixx | Iyy | Izz |
|---|---|---|---|---|
| `mixamorigleftshoulder` | **1.5** | 0.020 | 0.005 | 0.020 |
| `mixamorigleftarm` | **2.2** | 0.030 | 0.010 | 0.030 |
| `mixamorigleftforearm` | **1.4** | 0.020 | 0.008 | 0.020 |
| `mixamoriglefthand` | **0.4** | 0.005 | 0.002 | 0.005 |
| **Left arm subtotal** | **5.5** | | | |

### 1C. Right Upper Limb

| Bone | Mass (kg) | Ixx | Iyy | Izz |
|---|---|---|---|---|
| `mixamorigrightshoulder` | **1.5** | 0.020 | 0.005 | 0.020 |
| `mixamorigrightarm` | **2.2** | 0.030 | 0.010 | 0.030 |
| `mixamorigrightforearm` | **1.4** | 0.020 | 0.008 | 0.020 |
| `mixamorigrighthand` | **0.4** | 0.005 | 0.002 | 0.005 |
| **Right arm subtotal** | **5.5** | | | |

### 1D. Left Lower Limb

| Bone | Mass (kg) | Ixx | Iyy | Izz |
|---|---|---|---|---|
| `mixamorigleftupleg` | **8.5** | 0.150 | 0.050 | 0.150 |
| `mixamorigleftleg` | **4.2** | 0.100 | 0.030 | 0.100 |
| `mixamorigleftfoot` | **1.1** | 0.010 | 0.005 | 0.010 |
| **Left leg subtotal** | **13.8** | | | |

### 1E. Right Lower Limb

| Bone | Mass (kg) | Ixx | Iyy | Izz |
|---|---|---|---|---|
| `mixamorigrightupleg` | **8.5** | 0.150 | 0.050 | 0.150 |
| `mixamorigrightleg` | **4.2** | 0.100 | 0.030 | 0.100 |
| `mixamorigrightfoot` | **1.1** | 0.010 | 0.005 | 0.010 |
| **Right leg subtotal** | **13.8** | | | |

### 1F. Finger & Thumb Micro-Masses (0.008–0.020 kg each)

| Bone Group | Count | Each Mass (kg) | Subtotal |
|---|---|---|---|
| Left hand fingers (index, middle, ring, pinky × 3 segments) | 12 bones | 0.008–0.020 | ~0.16 |
| Left hand thumb (× 3 segments) | 3 | 0.010–0.020 | ~0.045 |
| Right hand fingers | 12 | 0.008–0.020 | ~0.16 |
| Right hand thumb | 3 | 0.010–0.020 | ~0.045 |
| **Finger subtotal** | **30** | | **~0.41** |

### 1G. Root Capsule (Single Rigid Body)

| Element | Mass (kg) | Ixx | Iyy | Izz |
|---|---|---|---|---|
| **Root capsule** | **70** | **10.0** | **10.0** | **10.0** |

---

## 2. CRITICAL: Total Body Mass Calculation

### Synthia's current configuration (MuJoCo MJCF):

| Component | Mass (kg) |
|---|---|
| Root capsule | **70** |
| Axial skeleton (hips → head) | 32.5 |
| Left arm | 5.5 |
| Right arm | 5.5 |
| Left leg | 13.8 |
| Right leg | 13.8 |
| Fingers (both hands) | ~0.4 |
| **TOTAL** | **~141 kg** |

### Ground-truth reference (ProtoMotions SMPL / AMP humanoid):
| Reference Model | Total Mass (kg) |
|---|---|
| SMPL (smpl_humanoid.xml) | **63.31** |
| AMP (amp_humanoid.xml) | **~55–60** |
| SMPL-X (smplx_humanoid.xml) | **~70** |

**Synthia is 2.0×–2.5× heavier than ground truth humanoid.**

---

## 3. THE CORE PROBLEM: Root Capsule Mass = 70 kg

The root capsule in `MJCFHumanoidTemplate.ts` (line ~130) is defined with:
```
<inertial pos="0 0 0" mass="70" diaginertia="10.0 10.0 10.0"/>
```

This is **not** a capsule that represents the body — it's a single lumped mass that is supposed to act as the root body connecting the skeleton branches. But the individual bones **already carry their own masses** from the physics matrix. So you have:
- 70 kg (root capsule) + ~71 kg (skeleton bones) = ~141 kg total
- This is roughly the mass of **two adult humans** stacked together

### How this causes the backward fall:

1. **The balance controller applies a maximum torque of 60 Nm** (see `MotorController.ts` line ~168: `MAX_BALANCE_TORQUE = 60.0`)
2. For a 70 kg humanoid (ground truth), 60 Nm of corrective torque at the CoM is marginal but workable
3. For a **141 kg** humanoid, 60 Nm is ~**half** what's needed — the torque-to-inertia ratio is critically insufficient
4. The `resetToBindPose()` method prescribes `FORWARD_BIAS = 0.05` rad (~3°) forward lean as a compensatory measure — this is a **band-aid** on the real problem

### Evidence from `fall_diagnosis.json`:

The diagnosis data clearly shows:
- **Frame 81**: Tilt = 11.6°, xfrc applied = [40.3, -0.4, -0.01] (balancing torque ramps up)
- **Frame 91**: Tilt = 17.8°, xfrc = [≈60, ...] (torque **saturates** at 60 Nm limit)
- **Frames 92–130**: Tilt increases uncontrollably from 18.6° → 93°, while xfrc stays pegged at max 60 Nm
- **Frame 130**: ncon jumps from 0–1 to 20 — the body has hit the ground
- **Frame 131+: rootH** remains at ~0.15–0.20 m — the humanoid is lying on the floor

The balance torque saturates at frame 92 and can never recover. The body is simply **too heavy** for the PD controller to stabilize.

---

## 4. Second Problem: Inertia Ratios Are Wrong

### The current diagonal inertia for the root capsule:
```
diaginertia="10.0 10.0 10.0"
```
This is isotropic (same in all axes). A human body is not isotropic — the moment of inertia about the vertical axis is much smaller than about the horizontal axes.

### Additionally, per-bone inertia assignment:

The physics matrix maps bone inertia from "Three local" to "MuJoCo local" in `MJCFHumanoidTemplate.ts` (line ~97):
```typescript
// Three Y-axis mapped to MuJoCo Z-axis
const ixx = phys.principalInertia.x;
const iyy = phys.principalInertia.z;    // <-- THIS IS THE SWAP
const izz = phys.principalInertia.y;
```

The comment says "Three Y-axis mapped to MuJoCo Z-axis" but the mapping is:
- ixx = physics.x (correct, MuJoCo X = Three X)
- iyy = physics.z (MuJoCo Y = Three Z)  
- izz = physics.y (MuJoCo Z = Three Y)

This mapping is **correct** given the coordinate system difference (Three.js Y-up vs MuJoCo Z-up). However, **many bone inertias have Ixx ≈ Izz** (e.g., upleg: 0.15, 0.15), meaning the swap has little effect. The real issue is that **the inertial values are too large** relative to the bone masses.

---

## 5. Bone Mass Comparison: Synthia vs. Ground Truth

### Leg Segment Comparison:

| Segment | Ground Truth (SMPL, kg) | Synthia (kg) | Ratio |
|---|---|---|---|
| Pelvis | 5.1 | 12.0 | **2.35×** |
| Left thigh (Hip + upleg) | 7.5 + L_Knee capsule = 7.5 + has no separate | 8.5 (upleg only) | ~1.1× |
| Right thigh | 7.3 | 8.5 | 1.16× |
| Left shin (leg) | 3.5 | 4.2 | 1.2× |
| Right shin | 3.5 | 4.2 | 1.2× |
| Left foot | 1.5 | 1.1 | **0.73×** |
| Right foot | 1.6 | 1.1 | **0.69×** |

### Arm Segment Comparison:

| Segment | Ground Truth (SMPL, kg) | Synthia (kg) | Ratio |
|---|---|---|---|
| L_Shoulder/Thorax | 1.1 (thorax) + 1.9 (shoulder) = 3.0 | 1.5 (shoulder only) | **0.5×** |
| L_Upper arm | 1.5 | 2.2 | **1.47×** |
| L_Forearm | 1.0 | 1.4 | 1.4× |
| L_Hand | 0.4 | 0.4 | 1.0× |

Key observation: Synthia's foot masses are **too light** (0.69–0.73×) while upper body mass is **too heavy** (hips 2.35×). This shifts the center of mass upward, making the humanoid inherently top-heavy and harder to balance.

---

## 6. Third Problem: CM Height Analysis

Using the Synthia mass distribution:
- Heavy hips (12 kg) + heavy torso (spine 6+5+4 = 15 kg) + head (4.3 kg) = **31.3 kg** in the upper body  
- Plus arms at shoulder height = **5.5 + 5.5 = 11 kg** added high
- Legs = **13.8 + 13.8 = 27.6 kg** lower

The center of mass is biased upward because:
1. The hips/pelvis are grossly overweight (12 kg vs 5.1 kg ground truth)
2. The root capsule adds 70 kg centered at mid-torso height

The effective CM is near the root capsule center (~0.9 m), which is far too high for the narrow base of support (small feet). The ankle torque required to correct a tilt of even 5° is:

```
τ_needed = m × g × h_CM × sin(tilt)
         = 141 × 9.81 × 0.9 × sin(5°)
         = 141 × 9.81 × 0.9 × 0.087
         = 108.4 Nm
```

But the balance controller can only produce **60 Nm** maximum. So even a **5° tilt** requires more torque than available. By the time tilt reaches 11.6° (frame 81 of diagnosis), the needed torque is:

```
τ_needed = 141 × 9.81 × 0.9 × sin(11.6°)
         = 141 × 9.81 × 0.9 × 0.201
         = 250 Nm
```

This is **4× the available torque**. The fall is mathematically inevitable.

---

## 7. Summary of Defects Causing the Fall

| # | Defect | Impact | Fix Priority |
|---|---|---|---|
| 1 | **Root capsule mass = 70 kg** adds duplicate body mass on top of individual bone masses | Total mass ≈ 141 kg (2× human); balance torque ceiling 60 Nm is only ~25% of what's needed | **CRITICAL** |
| 2 | **Hips/pelvis mass 12.0 kg** is 2.35× the ground-truth 5.1 kg | Raises CM, increases required balancing torque | HIGH |
| 3 | **Foot masses 1.1 kg** (0.69–0.73× ground truth) | Too little mass low down to lower CM; less inertial stability at base | HIGH |
| 4 | **Root capsule inertia isotropic** (10,10,10) when it should be (≈5, ≈3, ≈5) | Wrong rotational dynamics; capsule too resistant to some rotations and not enough to others | MEDIUM |
| 5 | **Max balance torque = 60 Nm hardcoded** | Saturated at 60 Nm regardless of body mass; no adaptive scaling | MEDIUM |
| 6 | **Forward bias = 0.05 rad** (3°) is a band-aid | Compensates for mass defects rather than fixing them | LOW (temporary) |
| 7 | **Shoulder mass too light** (1.5 vs 3.0 ground truth) | Arms don't contribute enough to rotational damping | LOW |

---

## 8. Recommended Mass Corrections

### Immediate fix: Remove the 70 kg root capsule mass

The root capsule should be a pure kinematic connector with **zero inertial properties**. Change `mass="70"` to `mass="0.001"` (near-zero, MuJoCo requires >0) and `diaginertia="0.001 0.001 0.001"`.

This brings total mass from ~141 kg → ~71 kg (matching ground truth).

### With corrected mass, recalculate torque capacity:

```
τ_needed at 5° tilt = 71 × 9.81 × 0.9 × sin(5°) = 54.8 Nm
τ_available = 60 Nm
Margin: ~5 Nm (9%) — **tight but recoverable**
```

The 60 Nm limit then provides enough authority to correct tilts up to ~5.5°. Combined with the existing forward bias and active PD control, the humanoid should stand stably.

### Secondary fix: Adjust individual bone masses to match ground truth

| Bone | Current (kg) | Target (kg) |
|---|---|---|
| mixamorighips | 12.0 | **5.0** |
| mixamorigleftfoot | 1.1 | **1.5** |
| mixamorigrightfoot | 1.1 | **1.5** |
| mixamorigleftarm | 2.2 | **1.5** |
| mixamorigrightarm | 2.2 | **1.5** |

These bring the distribution in line with the SMPL reference and lower the CM.

---

## 9. Fall Diagnosis Data Summary

Source: `fall_diagnosis.json` (300 data points across frames 81–380)

| Metric | At Fall Initiation (Frame 81) | At Tilt Saturation (Frame 92) | At Ground Impact (Frame 130) | Post-Fall (Frame 200+) |
|---|---|---|---|---|
| Tilt angle | 11.6° | 18.6° | 93° | ~90° (on ground) |
| Root height | 0.885 m | 0.863 m | 0.162 m | ~0.2 m |
| Root Vy (horizontal vel.) | 0.48 m/s | 0.72 m/s | -0.16 m/s (rebound) | ~0 |
| Root Vz (vertical vel.) | -0.08 m/s | -0.19 m/s | -1.53 m/s | ~0 |
| Balancing torque (xfrc) | 40.3 Nm | **59.99 Nm (SATURATED)** | 59.99 Nm | ~60 Nm |
| Foot height (avg) | 0.104 m | 0.100 m | 0.119 m (lifting) | 0.104 m |
| Contacts (ncon) | 1 | 1 | 20 (ground hit) | 3–4 |

The data confirms: balance torque saturates at frame 92 and the humanoid is mechanically incapable of recovery from that point forward.

---

## 10. One-Line Diagnosis

**The humanoid is 141 kg (twice normal) because the root capsule carries 70 kg AND every skeleton bone carries its own mass. The 60 Nm balance torque ceiling is only ~25% of what's needed to stabilize this mass. Fix: remove root capsule mass (set to near-zero) and optionally adjust individual bone masses to match SMPL ground truth.**
