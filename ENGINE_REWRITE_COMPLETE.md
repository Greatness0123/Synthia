# SYNTHIA — Engine Rewrite Completion Report

This document reports on the successful targeted in-place rewrite of SYNTHIA's physics engine layer (`/src/world/engine`). All 19 corrections are fully implemented, and all Jest unit and integration tests are perfectly passing.

---

## 1. Step 0 Boundary and Compatibility Confirmed

*   **File Boundary**: The audited files within `/src/world/engine` are:
    *   `PhysicsEngine.ts` (Rewritten)
    *   `CollisionAdapter.ts` (Rewritten)
    *   `MJCFHumanoidTemplate.ts` (Rewritten)
    *   `MotorController.ts` (Rewritten)
    *   `BodyManager.ts` (Rewritten)
    *   `HumanoidPhysicsBinder.ts` (Rewritten)
    *   `ObjectManager.ts` (Rewritten and Corrected)
    *   `WorldEngine.ts` (Audited and Verified)
    *   `PhysicsDiagnostic.ts` (Audited and Verified)
*   **External Consumer Files**:
    *   `src/debug/footGroundDistance.ts` (Patched & Corrected)
        *   *Changes*: Rewritten to dynamically query geom sizes, positions (`geom_xpos`), and row-major rotations (`geom_xmat`) from MuJoCo, projecting all 8 corners of the sole box to compute precise real-time sole-ground gap distance.
    *   `src/world/hooks/useWorld.ts` (Confirmed compatible)

---

## 2. Final Tuned Actuator Gains & Balancing Parameters

The biped uses native-tuned PD gains and torque limits, scaling corrective forces to the 70kg target character weight under gravity:

| Joint Group | Proportional Gain ($k_p$) | Derivative Gain ($k_v$) | Torque Limit Range (`forcerange`) |
|---|---|---|---|
| **Legs** (Thighs, Shanks, Feet) | `400` | `80` | `[-150, 150]` Nm |
| **Spine Torso** | `300` | `60` | `[-120, 120]` Nm |
| **Arms & Forearms** | `200` | `40` | `[-80, 80]` Nm |
| **Neck & Head** | `150` | `30` | `[-40, 40]` Nm |
| **Fingers & Thumbs** | `5` | `1` | `[-3, 3]` Nm |

### Capsule Balancing Parameters (`applyCapsuleBalance`)
*   **Proportional Gain ($k_p$)**: `250.0`
*   **Derivative Gain ($k_d$)**: `60.0`
*   **Balancing Torque Clamp**: `100.0` Nm (max corrective torque applied directly to `xfrc_applied` of the root capsule).
*   **Contact Dependency**: None. Operates directly in world-space orientation coordinates relative to the MuJoCo vertical Z axis.

---

## 3. Explicit Confirmations

*   **`ENGINE_DOCS.md` Coverage**: Confirmed that `ENGINE_DOCS.md` is complete and covers every file rewritten or touched during this targeted migration pass.
*   **Deferred Balance Layer**: Explicitly confirmed that the layered convex-hull balance system described in `project_info__43.md` (and `project_info__39.md`) remains fully deferred and unimplemented, in accordance with scope specifications.
*   **Single-Threaded Build Check**: Explicitly confirmed that `@mujoco/mujoco` is the single primary physics engine package in the project. `/public/mujoco/mujoco.wasm` (size ~10.1MB) is present and fully integrated.
