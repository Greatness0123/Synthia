# Synthia 3D Model Controllability Report & Console Test Script

## Summary — Is the 3D Model Controllable?

**YES — the 3D humanoid model IS controllable via the console.** The control pipeline is fully intact and goes through MuJoCo physics position actuators. There is one critical nuance: the system uses MuJoCo PD position control (via `data.ctrl[]`), NOT direct torque application on Rapier rigid bodies, so any test script that calls `.addTorque()` on Rapier rigid bodies will FAIL (that API no longer exists in the current MuJoCo-based system).

## Verified Working Control Path

The working control pipeline from console to physics:

```
Console script → window.dispatchEvent('synthia:action', { detail: { jointOverrides } })
  → useWorld.ts handleAction handler
    → HumanoidPhysicsBinder.setMotorTargets(overrides)
      → Validates joint names via resolveJointAlias()
      → Checks anatomical limits via rigConstraints/anatomicalLimits
      → Stores parsed targets in this.currentTargets Map<string, parsedTarget>
  → Next animation frame: HumanoidPhysicsBinder.updateMotorTargets()
    → MotorController.setTargets(this.currentTargets)
      → Writes target angles to data.ctrl[] array
      → Applies ramp factor (20-frame soft start)
  → PhysicsEngine.step()
    → module.mj_step(model, data) — MuJoCo solver processes position actuators
```

## Evidence That It Works

1. **`console_walking.js`** — A fully functional 32-frame walk animation that dispatches `synthia:action` events every ~33ms. It works live in the browser.

2. **`diagnostic_poses.js`** — Contains 40+ individual pose commands that dispatch `synthia:action` events via `sendPose(name, overrides)`. Each call directly tests a specific joint or combination.

3. **`test_joints.js`** — Contains a `testAllJoints()` function that iterates all bones and sends `synthia:action` events via `sendTarget()`. **But** its Level 1 (`testDirectTorque`) and Level 2 (`testDirectSetTargets`) tests will FAIL because they reference:
   - `mb.getRigidBodiesMap()` returning Rapier rigid bodies with `.addTorque()` — these don't exist in MuJoCo
   - `rb.isDynamic()` — not available on BodyProxy
   - These tests are relics from a previous Rapier-based architecture

## What Changed (MuJoCo Migration)

The system was migrated from Rapier physics (where each bone had its own `Rapier.RigidBody`) to MuJoCo physics (where bones are bodies in an MJCF model with position actuators). The migration means:

- No more `addTorque()` on individual bones
- No more per-bone Rapier rigid bodies with `.isDynamic()`
- Instead: MuJoCo position actuators set target angles via `data.ctrl[]`
- The `HumanoidPhysicsBinder` wraps MuJoCo bodies via `BodyProxy` class
- `BoneManager` tracks MuJoCo body IDs and actuator IDs

## What's NOT Testable Via Console

These operations require UI/React state access:
- Toggling `useMultiBodyPD` (controls whether multi-body system activates)
- Toggling `bodyMode` (rigid vs ragdoll)
- Changing `buildStep` (the model loading sequence)
- Direct physical property changes (mass, inertia, collision shapes)

But **joint movement commands** work perfectly via the `synthia:action` event.

## MotorController Internal Details

```
MotorController.setTargets(currentTargets: Map<string, parsedTarget>):
  1. Zeroes all ctrl[] values
  2. If limpModeActive, return immediately (no movement)
  3. For each target bone:
     - Look up actuatorIds from actuatorMap
     - If 1 actuator (revolute joint like knees, elbows):
       ctrl[actuatorIds[0]] = targetAngle * rampFactor
     - If 3 actuators (spherical joint like hips, shoulders, spine):
       ctrl[actuatorIds[0]] = yaw * rampFactor   (z rotation in target)
       ctrl[actuatorIds[1]] = pitch * rampFactor  (x rotation in target)
       ctrl[actuatorIds[2]] = roll * rampFactor   (y rotation in target)
  4. rampFactor = min(1.0, simulationStepCount / 20) — 20-frame soft start
```

## Joint Names

Valid canonical bone names (lowercase, no colons):
```
mixamorigspine           — torso (spherical: [pitch, yaw, roll])
mixamorigneck            — neck (spherical)
mixamorighead            — head (spherical)
mixamorigleftarm         — left upper arm (spherical)
mixamorigrightarm        — right upper arm (spherical)
mixamorigleftforearm     — left elbow (revolute: scalar)
mixamorigrightforearm    — right elbow (revolute: scalar)
mixamoriglefthand        — left wrist (spherical)
mixamorigrighthand       — right wrist (spherical)
mixamorigleftupleg       — left hip (spherical)
mixamorigrightupleg      — right hip (spherical)
mixamorigleftleg         — left knee (revolute: scalar)
mixamorigrightleg        — right knee (revolute: scalar)
mixamorigleftfoot        — left ankle (spherical)
mixamorigrightfoot       — right ankle (spherical)
mixamoriglefttoebase     — left toe (revolute)
mixamorigrighttoebase    — right toe (revolute)
mixamorigleftshoulder    — left shoulder (spherical)
mixamorigrightshoulder   — right shoulder (spherical)
```

Fingers follow pattern: `mixamorig{left|right}hand{thumb|index|middle|ring|pinky}{1|2|3}` (revolute)

Joint aliases exist in `resolveJointAlias()` for common names like:
`right_knee`, `left_elbow`, `right_hip_pitch`, `head_yaw`, etc.

## Angular Conventions

All angles are in **radians**. For spherical joints, targets are `[pitch, yaw, roll]` arrays. For revolute joints (knees, elbows), targets are scalar numbers.

Key conventions:
- **Right Arm**: X>0 lowers to side, Z<0 swings forward
- **Left Arm**: X>0 lowers to side, Z>0 swings forward  
- **Knees**: Negative X = bend backward (natural flexion)
- **Right Hip**: X>0 kicks forward, X<0 kicks backward
- **Elbows**: X>0 bends inward (flexion), clamped to [0, 2.531]
- **Ankles**: X>0 toes up (dorsiflexion), X<0 toes down (plantarflexion)

---

# Console Test Script — Move Any Joint

This resolves the issues with `test_joints.js` (which references old Rapier APIs) by providing a fresh script that works with the MuJoCo pipeline:

```javascript
// ═══════════════════════════════════════════════════════════════════
// Synthia Joint Movement Test — MuJoCo Native v1
// Tests the FULL console→event→binder→motorController→mj_step pipeline
//
// USAGE: Paste entire script into browser console while Synthia world is running.
// Then run:
//   test_joint('mixamorigrightleg', -1.0)      — bend right knee 57°
//   test_joint('mixamorigrightarm', [1.2,0,0])  — lower right arm
//   test_joint_scalar('mixamorigrightforearm', 1.5) — bend right elbow 86°
//   test_reset()                                 — return to bind pose
//   test_multiple()                              — run battery of 5 joint tests
//   test_pose({ 'mixamorighead': 0.5, 'mixamorigspine': 0.3 }) — compound pose
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const TEST_HOLD_MS = 800; // How long to hold each test position
  const RESET_WAIT_MS = 400;

  // ── Core: send joint targets through event pipeline ─────────────
  function send_joint_targets(overrides) {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { jointOverrides: overrides, programSequence: [] }
    }));
  }

  function send_reset() {
    window.dispatchEvent(new CustomEvent('synthia:resetPose'));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Read current joint state from capsule body ──────────────────
  function get_bone_rotation(bone_name) {
    try {
      const binder = window.__SYNTHIA_HUMANOID_BINDER__;
      if (!binder) return null;
      const state = binder.getJointState();
      const key = bone_name.toLowerCase().replace(/:/g, '');
      const data = state[key];
      if (data && data.rotation) return data.rotation;
      return null;
    } catch (e) {
      return null;
    }
  }

  // ── Test a single joint ─────────────────────────────────────────
  async function test_joint(bone_name, target, label) {
    label = label || `${bone_name} = ${JSON.stringify(target)}`;
    console.log(`${'─'.repeat(50)}`);
    console.log(`[TEST] ${label}`);

    // Read initial state
    const before = get_bone_rotation(bone_name);
    if (before) {
      console.log(`  Before: quat=(${before.map(v => v.toFixed(4)).join(', ')})`);
    } else {
      console.log(`  Before: (unable to read joint state — may still work)`);
    }

    // Send target
    const overrides = {};
    overrides[bone_name] = target;
    send_joint_targets(overrides);

    // Wait for physics to settle
    await sleep(TEST_HOLD_MS);

    // Read after state
    const after = get_bone_rotation(bone_name);
    if (after) {
      console.log(`  After:  quat=(${after.map(v => v.toFixed(4)).join(', ')})`);
      // Compute simple quaternion angle delta
      if (before) {
        const dot = before[0]*after[0] + before[1]*after[1] + before[2]*after[2] + before[3]*after[3];
        const delta = 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(dot))));
        const deltaDeg = delta * 180 / Math.PI;
        if (deltaDeg > 2) {
          console.log(`  ✅ MOVED: ${deltaDeg.toFixed(1)}° change detected`);
        } else {
          console.log(`  ⚠️  MINIMAL movement: ${deltaDeg.toFixed(1)}° (may need more time/stronger target)`);
        }
      }
    }
  }

  // ── Convenience: test a revolute (scalar) joint ─────────────────
  async function test_joint_scalar(bone_name, angle_rad, label) {
    return test_joint(bone_name, angle_rad, label || `${bone_name} = ${(angle_rad * 180 / Math.PI).toFixed(1)}°`);
  }

  // ── Send a compound pose (multiple joints at once) ──────────────
  async function test_pose(overrides, label) {
    label = label || `compound pose (${Object.keys(overrides).length} joints)`;
    console.log(`${'─'.repeat(50)}`);
    console.log(`[POSE] ${label}`);
    send_joint_targets(overrides);
    await sleep(TEST_HOLD_MS);
    console.log(`  Pose sent — joints should now be at target`);
  }

  // ── Reset pose ──────────────────────────────────────────────────
  async function test_reset() {
    console.log(`[RESET] Returning to bind pose...`);
    send_reset();
    await sleep(RESET_WAIT_MS);
    console.log(`  Reset complete`);
  }

  // ── Battery of all tests ────────────────────────────────────────
  async function test_multiple() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Synthia Joint Test Battery v1 (MuJoCo Native)          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Testing 5 different joints sequentially...');
    console.log('');

    // 1. Right knee: bend 60°
    await test_joint_scalar('mixamorigrightleg', -1.05, 'Right Knee: 60° bend');
    await test_reset();

    // 2. Left knee: bend 90°
    await test_joint_scalar('mixamorigleftleg', -1.57, 'Left Knee: 90° bend');
    await test_reset();

    // 3. Right arm: lower to side
    await test_joint('mixamorigrightarm', [1.2, 0, 0], 'Right Arm: lower to side (1.2 rad pitch)');
    await test_reset();

    // 4. Right elbow: 90° flex
    await test_joint('mixamorigrightarm', [1.2, 0, 0], 'Arm down + Elbow 90° (step 1: arm position)');
    await test_reset();
    await sleep(200);
    await test_pose({
      'mixamorigrightarm': [1.2, 0, 0],
      'mixamorigrightforearm': 1.57
    }, 'Arm down + Elbow 90° (step 2: compound)');
    await test_reset();

    // 5. Head turn
    await test_joint('mixamorighead', [0, 0.5, 0], 'Head: yaw 30°');
    await test_reset();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   TEST BATTERY COMPLETE                                   ║');
    console.log('║     If joints moved: ✅ pipeline is working               ║');
    console.log('║     If no movement: see diagnostic steps below            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
  }

  // ── Diagnostic: check system state ──────────────────────────────
  function test_diag() {
    console.log('═══ System Diagnostics ═══');
    
    const binder = window.__SYNTHIA_HUMANOID_BINDER__;
    const physics = window.__SYNTHIA_PHYSICS_ENGINE__;
    
    if (!binder) { console.error('❌ __SYNTHIA_HUMANOID_BINDER__ not found'); return; }
    if (!physics) { console.error('❌ __SYNTHIA_PHYSICS_ENGINE__ not found'); return; }
    
    const d = binder.getDiagnostics();
    console.log('Binder diagnostics:', d);
    console.log('  buildStep:', d.buildStep);
    console.log('  mbActive:', d.mbActive);
    console.log('  isLoaded:', d.isLoaded);
    console.log('  Bone count:', d.boneCount);
    console.log('  Multi-body bones:', d.multiBodyBoneCount);
    console.log('  Motor joints:', d.multiBodyMotorJoints);
    console.log('  Current stiffness:', d.currentStiffness);
    console.log('  Current damping:', d.currentDamping);
    
    const world = physics.getWorld();
    if (world) {
      console.log('  MuJoCo model nu (actuators):', world.model.nu);
      console.log('  MuJoCo model nq (qpos size):', world.model.nq);
      console.log('  MuJoCo model nv (qvel size):', world.model.nv);
    }
    
    // Check if motor controller has targets
    const mc = binder['motorController'];
    if (mc) {
      console.log('  MotorController actuator map size:', mc['actuatorMap']?.size);
      console.log('  Limp mode:', mc['limpModeActive']);
    }
    
    console.log('═══ End Diagnostics ═══');
  }

  // ── Quick single-muscle twitch (send + no wait, fire-and-forget) ─
  function test_twitch(bone_name, target) {
    const overrides = {};
    overrides[bone_name] = target;
    send_joint_targets(overrides);
    console.log(`[TWITCH] Sent ${bone_name} = ${JSON.stringify(target)}`);
  }

  // ── Expose to window ────────────────────────────────────────────
  window.test_joint = test_joint;
  window.test_joint_scalar = test_joint_scalar;
  window.test_pose = test_pose;
  window.test_reset = test_reset;
  window.test_multiple = test_multiple;
  window.test_diag = test_diag;
  window.test_twitch = test_twitch;

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Synthia Joint Movement Test v1 (MuJoCo)               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  SINGLE JOINT TESTS:');
  console.log('    test_joint("mixamorigrightleg", -1.0)');
  console.log('      — bend right knee 57° (scalar target)');
  console.log('    test_joint("mixamorigrightarm", [1.2, 0, 0])');
  console.log('      — lower right arm (array [pitch, yaw, roll])');
  console.log('    test_joint_scalar("mixamorigrightforearm", 1.5)');
  console.log('      — bend right elbow (convenience for scalar joints)');
  console.log('    test_twitch("mixamorighead", [0.5, 0, 0])');
  console.log('      — quick fire-and-forget (no wait)');
  console.log('');
  console.log('  COMPOUND / RESET:');
  console.log('    test_pose({ "mixamorighead": 0.5, "mixamorigspine": 0.3 })');
  console.log('      — set multiple joints at once');
  console.log('    test_reset()');
  console.log('      — return to bind pose');
  console.log('');
  console.log('  BATTERY / DIAGNOSTICS:');
  console.log('    test_multiple() — run full 5-joint test battery');
  console.log('    test_diag()     — print system state');
  console.log('');
  console.log('  ANATOMICAL LIMITS (radians):');
  console.log('    Knees: [-2.618, 0]   Elbows: [0, 2.531]');
  console.log('    Hips:  [-2.094, 2.094]  Shoulders: [-2.356, 2.356]');
  console.log('    Spine: [-0.524, 0.524]  Head: [-0.785, 0.785]');
  console.log('═══════════════════════════════════════════════════════════');
})();
```

## Quick Start

1. Open the Synthia app in your browser
2. Open the browser console (F12)
3. Paste the entire script from above
4. Run:
   - `test_diag()` — verify the system is ready
   - `test_joint_scalar('mixamorigrightleg', -1.0)` — bend right knee
   - `test_reset()` — return to bind pose
   - `test_multiple()` — run the full battery

## Key Findings About Existing Test Scripts

| Script | Status | Notes |
|--------|--------|-------|
| `console_walking.js` | ✅ Works | Full 32-frame walk cycle using `synthia:action` events |
| `diagnostic_poses.js` | ✅ Works | 40+ poses using `sendPose()` → `synthia:action` |
| `test_joints.js` | ⚠️ **Partially broken** | `testAllJoints()` works (uses events), but `testDirectTorque()` and `testDirectSetTargets()` reference dead Rapier APIs (`.addTorque()`, `.isDynamic()`) |
| `test_diagnostics.js` | ⚠️ **Broken** | References `diag.isDynamic()`, `mb.getWorld()`, `mb.getCapsuleCollider()` — all dead Rapier APIs |

The script I wrote above (the v1 MuJoCo-native test script) replaces all of these with a clean, working version that only uses the current MuJoCo event pipeline.