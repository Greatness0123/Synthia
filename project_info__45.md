# ik_demo.py & balance.py — Utility Analysis for Synthia Project Stack

## Summary

`ik_demo.py` and `balance.py` are standalone Python MuJoCo prototyping scripts — effectively **development notebooks in code form**. They are **not part of the deployable Synthia stack** (which is TypeScript/browser-based), but they serve as valuable design references that document intended physics behavior before it was coded into TypeScript. This report explains what each does, how it relates to the existing TypeScript codebase, and whether it fills a gap or is already covered.

---

## 1. What each file does

### balance.py (Phase 3)

- **Purpose**: A passive stability characterisation script. Loads `robot/scene.xml`, holds the stock standing keyframe via MuJoCo's built-in `<position>` actuator PD, then applies periodic 30N horizontal pushes (random direction) to the torso.
- **Key behavior**: Measures pelvis horizontal deviation and recovery time after each push. Falls (and prints `*** FELL`) if the pelvis Z drops below 0.55m.
- **What it reveals**: The stock standing keyframe alone can recover from moderate pushes — the "passive stability region." This establishes a baseline for how much balance performance must exceed.
- **Problems it exposes in the project context**: The script loads `robot/scene.xml` (a static file that doesn't exist in this project). The Synthia project generates its MJCF dynamically from Three.js bone positions — there is no `robot/` directory. The script is designed for a different model pipeline.

### ik_demo.py (Phase 4)

- **Purpose**: An inverse kinematics demo for the right arm. Uses Damped Least Squares (DLS) Jacobian IK to make the right arm tool-tip follow a small 4cm vertical circle. Conservative gains keep arm motion gentle enough not to disturb balance.
- **Key behavior**: DLS IK solver (`solve_ik_step`), safety cutoff if pelvis drifts > 5cm, visualises the target with a green sphere in the MuJoCo viewer.
- **What it reveals**: How to do end-effector tracking with MuJoCo's `mj_jacSite` (Jacobian computation) and custom DLS with adjustable damping + gain.
- **Problems it exposes in the project context**: The Synthia TypeScript codebase has **no IK system at all**. All joint control is direct angle setting via `MotorController.setTargets()`. The AI agent can only specify joint angles, not end-effector positions.

---

## 2. Technology mismatch: Python vs TypeScript/WASM

| Dimension | Python scripts | Synthia production stack |
|-----------|---------------|--------------------------|
| Language | Python 3 | TypeScript (browser) |
| MuJoCo binding | `import mujoco` (native CPython) | `@mujoco/mujoco` v3.10.0 (WASM/Emscripten) |
| Viewer | `mujoco.viewer.launch_passive` | Three.js WebGL renderer |
| Rendering | Built-in MuJoCo GLFW viewer | Custom Three.js scene + PiP camera |
| AI integration | None | Full WebSocket agent loop + 6 providers |
| Model loading | `from_xml_path("robot/scene.xml")` | Dynamic MJCF generation from Three.js skeleton via `BodyManager` + `MJCFHumanoidTemplate` |
| File dependency | Requires `robot/scene.xml` on disk | Self-contained in JS bundle |

**Verdict**: Neither file can be dropped into the Synthia project and run. They would require a full rewrite from Python to TypeScript/WASM to be integrated.

---

## 3. What the TypeScript codebase already does

The Synthia TypeScript production code already implements **equivalent or superior versions** of the core features demonstrated in these Python scripts:

### Already covered (balance.py)

| balance.py feature | TypeScript equivalent | Where |
|---|---|---|
| Standing pose via PD | `MotorController.setIdleMode(true)` + `getIdleTargets()` holding standing stance | `MotorController.ts` lines 107-130, 143-164 |
| Push perturbation | `humanoid.push()` or `data.xfrc_applied[torso_id]` mapped through `BodyProxy` | `HumanoidPhysicsBinder.ts` `push()` method |
| Fall detection (pelvis Z < threshold) | `isOutOfWorldBounds()` + ground contact registry monitoring | `HumanoidPhysicsBinder.ts`, `PhysicsEngine.ts` |
| Pelvis drift logging | `footGroundDistance.ts` console logging | `src/debug/footGroundDistance.ts` |
| Recovery time measurement | Not explicitly implemented, but posture can be reset via `resetToBindPose()` | `HumanoidPhysicsBinder.ts` |
| Passive stability characterisation | Not explicitly implemented as a test suite | — |

### Already covered (ik_demo.py)

| ik_demo.py feature | TypeScript equivalent | Where |
|---|---|---|
| Direct joint control (PD position targets) | `MotorController.setTargets()` + `MotorController.setTargetAngle()` — full PD position control | `MotorController.ts` |
| Safety cutoff on pelvis drift | `isOutOfWorldBounds()` prevents catastrophic drift | `HumanoidPhysicsBinder.ts` |
| Applying force to a body | `xfrc_applied` via MuJoCo `model.body_dofadr` + `qvel` | `HumanoidPhysicsBinder.push()` and `applyKinematicGroundReactionForces()` |
| Visualising a target point | Three.js scene objects (spawned via ObjectManager) | `ObjectManager.ts` |

---

## 4. What's NOT in the TypeScript codebase (gaps these files reveal)

### Gap 1: No Inverse Kinematics system (major)

This is the biggest gap. The entire Synthia AI pipeline works in **joint angle space**:
- AI outputs joint angles → `setMotorTargets()` → PD actuator → MuJoCo simulation
- There is no way for the AI to specify "move your right hand to position (x, y, z)"
- The IK demo shows exactly how to solve this with MuJoCo: compute the Jacobian via `mj_jacSite`, then apply DLS

**Why this matters**:
- The AI model (Qwen2.5-VL, Gemini, etc.) is fundamentally a spatial reasoning system. It thinks in terms of positions, objects, and goals — not joint angles. Forcing it to output radians is an unnatural interface.
- An IK layer would let the AI output end-effector targets, which get converted to joint angles internally. This would dramatically improve manipulation tasks (piano playing, object interaction).
- `MJCFHumanoidTemplate.ts` already defines the `tool_tip_site` concept — but there's no `mj_jacSite` equivalent in the TypeScript code.

**What would need to be written**:
```typescript
// Pseudocode for what's missing
function solveIK(
  model: MjModel,
  data: MjData,
  toolSiteId: number,
  targetPos: [number, number, number],
  armDofIds: number[]
): Float64Array {
  const J = computeJacobian(model, data, toolSiteId);  // mj_jacSite equivalent
  const error = targetPos - currentPos;
  const JJt = J @ J.T;
  const dampedInv = inv(JJt + damping^2 * eye(3));
  const dq = J.T @ dampedInv @ (gain * error);
  return dq;
}
```

The `@mujoco/mujoco` WASM module **does** expose `mj_jacSite` — it's available through `module.mj_jacSite(model, data, jacp, jacr, siteId)`. The codebase just doesn't use it.

### Gap 2: No automated stability stress-testing

`balance.py` runs a push-test protocol automatically (every 6 seconds, logs recovery). The TypeScript codebase has no equivalent automated test. The `footGroundDistance.ts` debug script is close — but it's purely observational (logs distances), not a structured perturbation test.

### Gap 3: No standing baseline characterisation

`balance.py` measures the "passive stability region" — how far the pelvis deviates under push before the keyframe PD alone can't recover. This is useful for tuning `MotorController.applyCapsuleBalance()` gains. The TypeScript balance controller gains (Kp=100, Kd=40) were chosen without this baseline data.

---

## 5. Assessment: Useless or useful?

### Directly to the production build: ❌ Useless (as-is)

Cannot be dropped into the project. No `robot/scene.xml` exists. Python ≠ TypeScript. Different MuJoCo binding APIs. Different rendering pipeline. They are not importable, callable, or integrable.

### As design reference / prototyping seed: ✅ Very useful

**balance.py**:
- Documents the **exact perturbation protocol** (30N, 0.15s duration, random direction, 6s interval)
- Shows the **metrics that matter**: peak deviation, recovery time, fall threshold
- These are the metrics the TypeScript balance controller should be evaluated against

**ik_demo.py**:
- Documents the **complete DLS IK algorithm** parameterised for gentle arm motion
- Shows which actuator IDs correspond to which joints for the right arm
- Demonstrates the `mj_jacSite` → `mj_forward` → DLS loop pattern that should be replicated in TypeScript
- The safety cutoff pattern (freeze IK if pelvis drifts) is directly applicable to TypeScript

### As documentation of project history: ✅ Very useful

These files were clearly written during a prototyping phase ("Phase 3" and "Phase 4") that preceded the TypeScript implementation. They document:
- The natural evolution of the humanoid physics development
- Design decisions that were carried into TypeScript (capsule-based balance, arm-too-fast-disrupts-balance)
- Parameter values that can serve as starting points for TypeScript tuning

---

## 6. Recommended actions

1. **Keep both files in the repository** as design references. They document the prototyping process and parameters.

2. **Implement IK in TypeScript** as a high-priority feature. The AI's ability to manipulate objects and interact with the world is fundamentally limited without end-effector control. Use `ik_demo.py` as the algorithm reference — the DLS Jacobian pattern translates directly to TypeScript via `module.mj_jacSite()`.

3. **Create an automated stability test** in TypeScript (analogous to `balance.py`). A simple script that repeatedly pushes the capsule and logs recovery metrics. This would catch regressions in the balance controller and provide tuning data for `MotorController.applyCapsuleBalance()` gains.

4. **Delete neither file**, but add a comment at the top of each:
   ```
   # DEPRECATED: Python prototyping script. The TypeScript production implementation
   # lives in src/world/engine/MotorController.ts / HumanoidPhysicsBinder.ts.
   # Kept for algorithm reference and parameter history.
   ```

---

## 7. Technical detail: How to port IK to TypeScript

The `@mujoco/mujoco` v3.10.0 WASM module exposes `mj_jacSite` as:

```typescript
const jacp = new module.DoubleArray(3 * model.nv);
const jacr = new module.DoubleArray(3 * model.nv);
module.mj_jacSite(model, data, jacp, jacr, toolSiteId);

// 3xN Jacobian for position: jacp[3*i + row] for dof i
// 3xN Jacobian for rotation: jacr[3*i + row] for dof i
```

This is the same API that `ik_demo.py`'s `mujoco.mj_jacSite(model, data, jacp, jacr, tool_site_id)` calls — just through the WASM Embind wrapper. The `solve_ik_step` function can be ported almost line-for-line:

| Python code | TypeScript equivalent |
|---|---|
| `jacp = np.zeros((3, model.nv))` | `const jacp = new module.DoubleArray(3 * model.nv);` |
| `J = jacp[:, right_arm_dof_ids]` | Manual column extraction (no NumPy slicing) |
| `np.linalg.inv(JJt + damping² * I)` | Manual 3×3 matrix inversion (3×3 is trivial) |
| `np.clip(dq, -maxStep, maxStep)` | `Math.min(maxStep, Math.max(-maxStep, dq[i]))` |

The `tool_tip_site` is already defined in `MJCFHumanoidTemplate.ts`? — Actually, checking, the generated MJCF does NOT define a site. The Python demo uses `mj_name2id(..., mjOBJ_SITE, "tool_tip_site")` which means there's a `<site>` element in the source XML that's missing from the generated MJCF. Adding a site to the dynamically-generated MJCF would be trivial.
