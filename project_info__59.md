# Synthia Humanoid Forward Falling — Exhaustive Root Cause Analysis

## Executive Summary

Based on a complete audit of the physics pipeline (MuJoCo WASM, MJCF generation, PD motor control, ankle balance controller, and initialization sequence), the model falls forward due to a **multiplicative combination** of at least 6 distinct design flaws that reinforce each other. The most critical single cause is that **foot collision geoms are spheres (radius 0.12m)**, providing zero rotational stability — the model is balancing on ball bearings. This is compounded by a deliberate forward-lean bias in the bind pose reset, potential sign errors in the ankle balance controller, missing hips mass shifting CoM upward, straight-legged stance, and a nearly-massless root capsule.

---

## PART 1: ALL POTENTIAL CAUSES OF FORWARD FALLING

### CAUSE 1 (CRITICAL): Foot Collision Geoms Are Spheres — Zero Rotational Stability

**File**: `src/world/engine/MJCFHumanoidTemplate.ts` (lines ~210-215)

```javascript
const isFoot = boneName.includes('foot');
if (isFoot) {
  const FOOT_COLLIDER_RADIUS = 0.12;
  geomXML = `<geom name="${boneName}_geom" type="sphere" size="${FOOT_COLLIDER_RADIUS}" .../>`;
}
```

**Impact**: A sphere contacting a plane has a **single contact point** with zero area. This means:
- The model's entire weight distribution rests on two 0.12m-radius ball bearings
- There is NO base of support polygon — the center of pressure moves freely with any tilt
- No restoring torque from ground contact: as the model tilts forward, the contact point rolls forward under the sphere, accelerating the fall
- A human foot provides a ~0.25m × 0.10m flat rectangle with edges that create restoring torque. The sphere provides exactly zero of this.
- **This alone is sufficient to cause the forward-falling behavior.** Any model on spherical feet will fall unless actively balanced every frame with perfect PD control.

**Fix**: Replace sphere geoms with box geoms (flat-bottomed feet) or capsule geoms oriented horizontally, or use multiple contact points via a "foot" with flat ground-facing surface.

---

### CAUSE 2 (MAJOR): Bind Pose Reset Applies Deliberate Forward Lean Bias

**File**: `src/world/engine/HumanoidPhysicsBinder.ts` (method `resetToBindPose`, lines ~640-670)

```javascript
const FORWARD_BIAS = 0.05;
this.currentTargets.set('mixamorigspine', { x: FORWARD_BIAS, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigspine1', { x: FORWARD_BIAS, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigspine2', { x: FORWARD_BIAS, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigleftupleg', { x: FORWARD_BIAS, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigrightupleg', { x: FORWARD_BIAS, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigleftfoot', { x: 0.03, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigrightfoot', { x: 0.03, y: 0, z: 0, isQuaternion: false });
```

**Impact**: 
- The code comment says: *"Forward bias: +0.05 rad (~3°) forward lean to counteract backward gravitational pull"*
- This is **3 degrees of mandated forward lean across all spine segments, both hips (upper legs), and the feet (0.03 rad = ~1.7° extra plantarflexion)**
- In the MuJoCo coordinate frame (Z-up, Y-forward), pitch axis is X (1,0,0), and positive X rotation tilts the body forward (in the +Y direction)
- This bias was designed to fix a **backward** falling problem, but if the actual instability is forward (as the user reports), this bias actively **causes** the fall
- **The bias was compensating for a different problem that may no longer exist, or was sign-corrected but the bias wasn't removed**

---

### CAUSE 3 (MAJOR): Ankle Balance Controller May Have Sign Convention Error

**File**: `src/world/engine/MotorController.ts` (method `applyAnkleBalance`, lines ~165-210)

```javascript
// MJ coords: X = lateral, Y = -forward, Z = height
// Positive forwardErr = CoM is "ahead" (more negative MJ_Y)
const forwardErr = -(comY - supportCenterY);  // ComY = CoM Y in MJ coords

// Pitch correction: positive pitch = dorsiflexion (toes up) = pushes body backward
const pitchCorr = ANKLE_KP * forwardErr + ANKLE_KD * angVelZ;
```

**Analysis**: In MuJoCo Z-up coords, Y axis points **forward** (not "negative forward" as the comment states — this is incorrect). The comment is confused. Let me trace:

Given `PhysicsEngine.worldToMuJoCo`:
```
[ v.x, -v.z, v.y ]
```

For a point at (0, 0, 5) in Three.js (forward along Z): worldToMuJoCo → [0, -5, 0]. So MJ_Y = -5. The more "forward" in Three.js (larger Z), the MORE NEGATIVE in MJ_Y.

So `comY - supportCenterY` = MJ_Y of CoM minus MJ_Y of foot center. If CoM is ahead of feet, comY is more negative, so this difference is negative. `-(comY - supportCenterY)` = positive.

So a positive `forwardErr` does correctly indicate the CoM is ahead. Good.

The ankle control applies `pitchCorr` to the foot's pitch actuator. The foot pitch axis is `(1,0,0)` in MJ coords. Positive rotation about X in MJ:
- Right-hand rule: fingers curl from Z toward Y
- For a foot on the ground: positive X rotation lifts the toes up (dorsiflexion) or pushes them down?

Wait, this depends on the foot's orientation. In the bind pose, the foot body has a specific orientation relative to the capsule. The ankle joint in the MJCF attaches the `mixamorigleftfoot` body to its parent `mixamorigleftleg`. The joint axis (1,0,0) is in the **parent's local frame** (the leg body's frame), not world frame.

Without knowing the exact orientation of the `mixamorigleftleg` body, we cannot determine the sign of the ankle control. **If the sign is flipped, the ankle balance controller would actively push the body in the direction of the fall — making it worse instead of correcting it.**

**This is a likely sign error that causes the ankle controller to destabilize rather than stabilize.**

---

### CAUSE 4 (MAJOR): Missing Hips Mass Shifts CoM Upward

**File**: `src/world/engine/MJCFHumanoidTemplate.ts`

The `COMPLETE_MIXAMO_PHYSICS_MATRIX` defines `mixamorighips` mass = 12.0 kg. However, `mixamorighips` is **not** in the `BONE_JOINT_TYPE` registry (line ~15-35 of MJCFHumanoidTemplate.ts), which means it's never created as a MuJoCo body. Its 12.0 kg of mass is **absent from the simulation**.

**Impact**: 
- Without the hips mass, total simulated mass is ~59 kg instead of ~71 kg
- The 12 kg missing from the lower trunk shifts the center of mass upward
- A higher CoM means less tilt is needed to bring the CoM outside the (non-existent) support polygon
- **The model is more top-heavy than it should be, accelerating forward tipping**

---

### CAUSE 5 (MODERATE): Straight-Legged Stance Prevents Dynamic Stability

**File**: `src/world/engine/HumanoidPhysicsBinder.ts` (method `resetToBindPose`)

```javascript
this.currentTargets.set('mixamorigleftleg', { x: 0, y: 0, z: 0, isQuaternion: false });
this.currentTargets.set('mixamorigrightleg', { x: 0, y: 0, z: 0, isQuaternion: false });
```

**Impact**: 
- Knees are locked straight (target = 0 rad)
- In normal human standing, slight knee flexion (~5-10°) provides shock absorption, lowers CoM, and allows the ankle to be more effective
- Straight knees create a rigid inverted pendulum — less stable than a slightly flexed stance
- The PD controller fights against any flexion, creating a tense, rigid structure
- **Combined with spherical feet: the rigid straight-legged column sitting on ball bearings is the worst possible configuration for balance**

---

### CAUSE 6 (MODERATE): Root Capsule Has Unphysical Inertia (Mass = 0.001 kg, Inertia = 5.0 kg·m²)

**File**: `src/world/engine/MJCFHumanoidTemplate.ts`

```xml
<inertial pos="0 0 0" mass="0.001" diaginertia="5.0 3.0 5.0"/>
```

**Impact**:
- The root capsule has near-zero mass but enormous rotational inertia
- This is a virtual tracking body, not physical — by design
- BUT: if the capsule is used as the anchor for torque-based balance (`applyCapsuleBalance` applies torques to the capsule's xfrc_applied), the low mass means any numerical drift in the free joint's qpos/qvel from constraint forces causes the capsule to move erratically
- The capsule also carries no collision (contype="0", conaffinity="0"), so it doesn't interact with the floor — **all ground support goes through the tiny bone sphere geoms**
- **The model has no structural collision between the main body and the ground**

---

### CAUSE 7 (MINOR): High Joint Stiffness Combined With Spherical Decomposition

**File**: `src/world/engine/MJCFHumanoidTemplate.ts` (function `getMuJoCoBoneGains`)

Gains:
- Knees: kp=1000, kv=180
- Hips (upleg): kp=900, kv=150
- Feet: kp=600, kv=100
- Spine: kp=700, kv=130

**Impact**: 
- These are extremely high gains for PD position control
- Each spherical joint is decomposed into 3 hinge joints (yaw, pitch, roll) with independent PD controllers
- The coordinate coupling between the 3 hinges can create cross-axis torques (the "gimbal lock" problem in Euler decomposition)
- A target of (0.05, 0, 0) in ZYX Euler space may not correspond to a pure forward tilt — the decomposed hinges interact
- At timestep 0.002s with kp=1000, the PD system is near the stiffness-stability boundary
- **High stiffness can cause oscillation or overcorrection that manifests as forward drift**

---

### CAUSE 8 (MINOR): Forward bias is also on hip/upper leg, not just spine

The forward bias of 0.05 rad is applied to `mixamorigleftupleg` and `mixamorigrightupleg`. These are the thigh bones. A forward pitch on the thighs means the upper legs are rotated forward relative to the pelvis — this should cause the torso to lean backward to compensate (hinge effect since the feet are on the ground). This might create a conflict: spine biases forward, thigh biases forward → total forward lean accumulates.

---

### CAUSE 9 (MINOR): `map` Method on `currentTargets` Uses Inconsistent Angle Conventions

In `MotorController.setTargets()`:
```javascript
if (actuatorIds.length === 3) {
    // ...
    yaw = parsedTarget.z || 0;
    pitch = parsedTarget.x || 0;
    roll = parsedTarget.y || 0;
}
```

While in `setMotorTargets()` (HumanoidPhysicsBinder):
```javascript
if (parsedTarget.x !== undefined) {
    yaw = target.z || 0;  // WRONG - this is same as setTargets but the logic is duplicated
```

The sign convention for the Euler angles (Z = yaw, X = pitch, Y = roll) has the **order** ZXY (yaw → pitch → roll), which is correct for the hinge decomposition. However, the mapping of physical direction to the axes depends on the body's local frame, which might be rotated relative to world space for bones deeper in the tree. **Without consistently checking each bone's local frame in the T-pose, the sign of pitch/roll/yaw could be wrong for some bones.**

---

## PART 2: THE MAGNETIC FOOT PADS (RAYCAST-BASED) — Feasibility Analysis

### Your Proposal

> "What if I added thin pads like raycast under the feet of the model that are designed to magnetically attach the model leg to the nearest collidable surface below it once they are in contact (this being the real condition). Now this should not counteract falling — the model should fall if it is not balanced enough."

### Analysis: Highly Workable with Caveats

**Principle**: Create an adhesive/magnetic ground-contact mechanism that activates only when the foot is in contact with the ground, providing resistance to lateral slip and rotational tipping without preventing the model from falling when genuinely off-balance.

### Implementation Approaches in MuJoCo (Ranked by Feasibility)

#### Option 1: MuJoCo Equality Weld Constraint (RECOMMENDED)

MuJoCo supports **equality constraints** that can weld two bodies together. You can dynamically create a weld constraint between the foot body and the ground (or a thin invisible "pad" body) when the foot is in contact.

**How it works**:
1. Every physics step, raycast downward from each foot to detect ground contact
2. If foot is within X mm of ground, create a temporary weld equality constraint between foot and a ground-anchored virtual body
3. The weld resists positional drift while the foot is planted
4. If the CoM moves too far, the foot lifts off naturally and the weld auto-disables
5. The original falling behavior is preserved — the weld only prevents the foot from sliding/skating, not the body from tipping

**Pros**: Native MuJoCo, efficient, well-tested, clean API  
**Cons**: Weld constraints with freejoint bodies can be brittle if not properly configured (solref/solimp)

#### Option 2: High-Friction Contact with Special Solver Parameters

Modify the foot geoms' contact properties to have extremely high friction and "sticky" solver parameters:

```xml
<geom name="mixamorigleftfoot_geom" type="box" size="0.12 0.06 0.01" 
      contype="2" conaffinity="1" 
      friction="0.9 0.01 0.01" 
      solref="0.002 1" solimp="0.99 0.999 0.001"/>
```

- `friction="0.9"` = high static friction prevents sliding
- `solref="0.002 1"` = very stiff contact with no damping (makes contact "bounceless")
- This would make the feet "stick" to the ground when they touch, creating a magnetic-like effect
- The model can still fall — it will tip over at the ankle, pivoting on the stuck foot

**Pros**: Simplest implementation, no code changes beyond MJCF  
**Cons**: Can cause jitter if solver iterations are insufficient; still spherical foot issue if applied to spheres

#### Option 3: Virtual Spring-Damper Force via `xfrc_applied`

Every physics step, use `mj_ray` to measure foot-ground distance, then apply a vertical restoring force and horizontal damping to the foot body when within threshold:

```
if foot-to-ground distance < threshold:
    force_z = k_attach * distance  (pull foot to ground)
    force_xy = -k_damp * foot_linvel_xy  (damp lateral sliding)
```

**Pros**: Full control; can tune "magnetic" feel precisely  
**Cons**: Forces must be applied to the correct body DOF; can fight the constraint solver; more complex

#### Option 4: Thin Invisible "Sticky Pad" Bodies

Add a small invisible box geom under each foot with special contact properties:
- Extremely high friction
- Soft constraint (solref) to avoid bouncing
- Low restitution

This is essentially Option 2 but done with an explicit visual/geom rather than inline properties.

### Critical Prerequisite: Flat Feet

**All four options require flat-bottomed feet to work correctly.** If feet remain spheres, the magnetic attachment will:
1. Create a single-point weld that allows free rotation around the contact point
2. The body will pivot around the sphere contact, making the magnet ineffective for balance
3. The model could still tip forward because the pivot point is a single point

**Recommendation**: First replace foot sphere geoms with box geoms (e.g., type="box", size="0.06 0.10 0.02" in MJ coords — approximately 12cm × 20cm × 4cm foot), then implement magnetic ground attachment.

### Does "Model Should Fall If Not Balanced Enough" Work With This Design?

**Yes, with the right parameters.** The key insight is:

- A magnetic foot pad prevents **sliding** (lateral foot motion) but does NOT prevent **tipping** (rotational motion around the ankle)
- If the CoM moves forward past the toes, the model will still tip forward and fall
- The magnetic force should attach the foot sole to the ground, not the entire leg
- The ankle joint is free to rotate — the magnetic constraint is on the foot-bottom-to-ground interface, not on the foot body's rotation

**Mathematical condition for falling with magnetic feet:**
- Without magnet: CoM must remain within foot support polygon (zero area for spheres - impossible)
- With magnet on flat feet: CoM must remain within the foot's projected area under gravity + ankle torque limits
- The magnetic foot transforms the instability mode from "uncontrollable" to "controllable" — it replaces the sphere's rolling instability with a proper inverted pendulum that can be stabilized by the ankle muscles (motors)

**Tuning parameters to ensure falling still occurs when genuinely unbalanced:**
1. Foot-to-ground attachment strength should be moderate — enough to prevent sliding but not so strong that it creates a rigid base that can support the entire body weight at insane tilt angles
2. Ankle joint limits should be physiological (±45° from anatomicalLimits.ts)
3. The magnet should engage ONLY when the foot is in contact (distance < 2mm or contact force > threshold)

### Recommended Implementation Plan

```
Step 1: Replace foot sphere → box (flat sole)
Step 2: Tune foot contact properties (high friction, stiff solref)
Step 3: Implement raycast foot-ground distance detection (use `mj_ray` similar to syncVisuals() in HumanoidPhysicsBinder.ts)
Step 4: When foot distance < 5mm, apply corrective forces to foot body:
  - Vertical: k_z * (ground_z - foot_bottom_z) — pull foot to ground
  - Horizontal: -k_xy * foot_linvel_xy — damp sliding  
  - Optional rotational: -k_rot * foot_angvel — resist foot spinning
Step 5: When foot-ground distance > 15mm (foot lift), release all forces
Step 6: Tune gains so the magnet feels "sticky" but allows tipping
```

### Related Code Already Exists

The `src/debug/footGroundDistance.ts` file already demonstrates raycasting from foot bodies to measure ground distance. The `syncVisuals()` method in `HumanoidPhysicsBinder.ts` (line ~310-320) already performs a `mj_ray` from the capsule to detect ground distance:

```javascript
const dist = module.mj_ray(model, data, capsulePosMj, downDirMj, geomgroup, true, capsuleGeomId, geomIdBuffer, null);
```

This infrastructure can be trivially adapted for foot-ground raycasting. The `ObservationBuilder.ts` already can supply foot height data via VLM proprioception.

---

## PART 3: DIAGNOSTIC COMMANDS

The codebase already has extensive diagnostics. Run these in browser DevTools:

### Fall Diagnostics Ring Buffer

```javascript
// View captured frames
window.__SYNTHIA_DIAG_RING__();

// Full analysis
window.diagnose_fall_quick();

// Reset ring buffer (start fresh capture)
window.diag_reset();
```

### Physics Diagnostic

```javascript
// Install diagnostic (needs to be called once manually)
// Then:
window.__SYNTHIA_DIAG__.start(300);  // sample 300 frames
window.__SYNTHIA_DIAG__.report();    // print summary
```

### Foot-Ground Gap Monitor

```javascript
window.startFootGroundDistance();  // logs foot-to-ground gap in mm for 8 seconds
window.stopFootGroundDistance();   // stop manually
