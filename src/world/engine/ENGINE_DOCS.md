# SYNTHIA — World Engine Reference Documentation

This document provides a comprehensive overview of the purpose, public API, key internal logic, applied corrections, and consumer files for every file rewritten during this targeted in-place engine migration to MuJoCo WebAssembly.

---

## 1. `PhysicsEngine.ts`

*   **Purpose**: Manages the life cycle of the `@mujoco/mujoco` compiler, WASM virtual filesystem mounting, stepping, coordinate system transforms, and event draining.
*   **Public API**:
    *   `worldToMuJoCo(v: {x,y,z}): [number, number, number]` — converts Three.js coords to MuJoCo local frame coordinates.
    *   `mujocoToWorld(p: [number,number,number]): {x,y,z}` — converts MuJoCo coords to Three.js world frame.
    *   `threeQuatToMuJoCo(q: {x,y,z,w}): [number, number, number, number]` — converts Three.js quaternion to MuJoCo scalar-first `(w,x,y,z)` conjugated by $+90^\circ$ about $X$.
    *   `mujocoQuatToThree(q: [number,number,number,number]): {x,y,z,w}` — reverses quaternion transformation.
    *   `loadMJCFModel(xml: string): void` — writes and compiles MJCF configurations to the virtual filesystem.
    *   `step(): void` — executes a physical step, clamps velocities, and drains contacts.
    *   `get qpos() / get qvel() / get ctrl()` — safe, live WASM heap address array views.
*   **Key Internal Logic**:
    *   Uses a single-threaded WASM compilation.
    *   Drains contacts safely via `mj_contactForce` C-API, writing into an Emscripten `DoubleBuffer(6)` and immediately calling `.delete()` to prevent heap memory leaks.
*   **Corrections Satisfied**:
    *   *Correction #4*: Transforms quaternions cleanly via proper rotation conjugation (`Q_align = +90 deg` about X) and accounts for component order.
    *   *Correction #5*: Handles coordinate translations through a proper rotation matrix with determinant $+1$.
    *   *Correction #9*: Returns `this.data.qpos` (and other views) directly in live getters to prevent stale memory access across model reloads.

---

## 2. `CollisionAdapter.ts`

*   **Purpose**: Maps user presets and object configurations to standard MuJoCo geometries, and extracts active contact arrays from WASM memory.
*   **Public API**:
    *   `objectPresetToMJCFGeom(preset: ObjectPreset): { geomType: string; size: string }`
    *   `getCollisionPairs(module, model, data): ContactPair[]` — returns list of active geom contacts with normal forces and friction magnitudes.
    *   `isGeomInContact(data, geomId): boolean` — utility check for specific geoms.
*   **Key Internal Logic**:
    *   Queries active contact array structures via `mj_contactForce` and maps geom identifiers to human-readable joint/bone names using `mj_id2name`.
*   **Corrections Satisfied**:
    *   *Correction #17*: Maps geom interaction masks safely. Utilizes C-API pointers safely with `DoubleBuffer(6)`.

---

## 3. `MJCFHumanoidTemplate.ts`

*   **Purpose**: Procedurally generates the core XML model file for the biped simulation, matching Mixamo rig structures to biomechanical target properties.
*   **Public API**:
    *   `generateHumanoidMJCF(...)` — procedural generator compiling visual skeleton coordinates and joint limits into an XML string.
    *   `normalizeBoneName(name: string): string` — strips colons and converts names to standard camelCase.
*   **Key Internal Logic**:
    *   Computes segment masses dynamically based on standard anthropometric fractions.
    *   Derives principal moment of inertia tensors ($I_{xx}, I_{yy}, I_{zz}$) directly from geometry dimensions (capsule lengths/radii and sole box sizes) using standard formulas.
    *   Decomposes multi-DOF spherical joints into separate nested hinge elements inside a single body (e.g. `mixamorigSpine_yaw`, `_pitch`, `_roll`).
*   **Corrections Satisfied**:
    *   *Correction #1*: Assigns explicit masses and inertia tensors via `<inertial>` elements instead of geom density.
    *   *Correction #2*: Limits position actuator limits using `forcerange` limits instead of `gear`.
    *   *Correction #6*: Disables collision participation on root capsule (`contype="0" conaffinity="0"`).
    *   *Correction #7*: Designs foot geoms as flat rectangular box soles placed directly below the sole (`pos="0 0 -0.02"`).
    *   *Correction #8*: Declares separate collision capsule geoms for all limb segments.
    *   *Correction #14*: Scales total character mass to exactly 70kg using de Leva's (1996) segment mass ratios.
    *   *Correction #15*: Strips colons and normalizes bone names to camelCase.

---

## 4. `MotorController.ts`

*   **Purpose**: Translates joint setpoints (DEFAULT_STANCE_POSE + deviations) to `ctrl` memory, handles joint transitions, and applies root stabilization torques.
*   **Public API**:
    *   `init(actuatorMap, model, data): void` — registers WASM pointers.
    *   `setTargets(currentTargets): void` — applies joint controls to `ctrl` array.
    *   `applyCapsuleBalance(capsuleBodyId): void` — corrective feedback torque for stabilization.
    *   `setLimpMode(active): void` — zero gains for ragdoll.
*   **Key Internal Logic**:
    *   Implements additive control: `ctrl[joint] = DEFAULT_STANCE_POSE[joint] + deviation[joint]`.
    *   Calculates a 20-frame linear transition ramp for joint movements (does not apply to frame-0).
    *   Stabilizes the root capsule in `applyCapsuleBalance()` using current body orientation (`xquat`) and angular velocity relative to vertical world Z, writing corrective torques directly to `xfrc_applied`.
*   **Corrections Satisfied**:
    *   *Correction #3*: Ensures exact control outputs are synchronized on Frame-0.
    *   *Correction #10*: Applies root capsule balancing torque with zero contact dependency, capped at 100.0 Nm.
    *   *Correction #11*: Implements Leg (400/80), Arm (200/40), Spine (300/60) PD gains with a 20-frame linear ramp.
    *   *Correction #13*: Sets `DEFAULT_STANCE_POSE` to a slightly crouched stance (hip -0.10, knee -0.12, ankle +0.10, arm 1.309 rad).

---

## 5. `BodyManager.ts`

*   **Purpose**: Manages mapping from Three.js bone entities to compiled MuJoCo bodies, geoms, and joint coordinates in the active WASM heap.
*   **Public API**:
    *   `activate(...)` — procedural setup, indexes joint names, and loads compiled models.
    *   `syncRigidBodiesFromBones(...)` — positions joint angles and freejoints based on skeleton orientations.
*   **Key Internal Logic**:
    *   Aligns and writes `qpos` joint coordinates by converting relative quaternions to ZXY Euler angles.
    *   Positions and centers the root capsule relative to pelvis offsets.
*   **Corrections Satisfied**:
    *   *Correction #15*: Normalizes all name mapping.

---

## 6. `HumanoidPhysicsBinder.ts`

*   **Purpose**: Bridges high-level application lifecycle, reset hooks, push impulses, and rigid/ragdoll state transitions.
*   **Public API**:
    *   `resetPose(spawnPoint)` — repositions character and triggers joint sync.
    *   `resetToBindPose()` — resets all joints to `DEFAULT_STANCE_POSE` and zeroes out velocities.
    *   `setCapsulePosition(x,y,z)` — sets freejoint position.
*   **Key Internal Logic**:
    *   Guarantees that on Frame-0, both `qpos` and `ctrl` are synchronized perfectly inside the stable `DEFAULT_STANCE_POSE` angles before any physics step occurs.
    *   Explicitly zeroes out freejoint and joint velocities (`qvel`) and applied external force registers (`xfrc_applied`) upon resetting.
    *   Calculates forward dynamics via `mj_forward` immediately on reset to update world-coordinate arrays.
*   **Corrections Satisfied**:
    *   *Correction #3*: Perfect Frame-0 `ctrl`/`qpos` sync with zero start snap. Sets freejoint orientation quaternion to vertical identity `(1,0,0,0)` to prevent legacy tilt drift.

---

## 7. `ObjectManager.ts`

*   **Purpose**: Manages spawned interactive objects and the 88-key piano, claiming pre-allocated environment slots.
*   **Public API**:
    *   `spawnObject(...) / deleteObject(...)`
    *   `spawnPiano(...)`
*   **Key Internal Logic**:
    *   Swaps environment slot geoms on and off in active simulation using size settings and collision bitmasks, avoiding live XML re-compilations.
    *   Recompilation reserved only for custom dynamic meshes, preserving active joint velocities/coordinates via state-hydration.
*   **Corrections Satisfied**:
    *   *Correction #12*: Implements pre-allocated slot pools (20 slots).
    *   *Correction #17*: Disables deactivated slots by setting `contype="0" conaffinity="0"`, and activates interactive objects with `contype="2" conaffinity="3"`.

---

## 8. `src/debug/footGroundDistance.ts`

*   **Purpose**: Calculates real-time foot-ground gap distances for verification.
*   **Public API**:
    *   `startFootGroundDistance() / stopFootGroundDistance()`
*   **Key Internal Logic**:
    *   Queries foot geom size from `geom_size` and world position/rotation from `geom_xpos` and `geom_xmat`.
    *   Projects all 8 box corners to world space, taking the minimum world-Z value (representing the true lowest point of the sole relative to the floor).
*   **Corrections Satisfied**:
    *   *Correction #7*: Measures sole gap accurately without hardcoded origin-offset approximations.
