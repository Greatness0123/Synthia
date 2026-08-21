# Synthia 1.5.1 — What Constitutes "Balance" in the Model

## Summary

Synthia is a browser-based multi-agent AI humanoid platform (React + Three.js + MuJoCo WASM) where autonomous agents perceive a 3D world, reason via LLM inference, and act through joint-angle commands that are executed by a physics-simulated humanoid. "Balance" is not a single controller — it is a **layered stack of eight cooperating mechanisms** running at two distinct rates (500 Hz physics-control loop and 60 Hz render/pose loop), plus a carefully dimensioned mass/inertia substrate that makes the whole thing stable. This report documents every component that contributes to the model's balance, how they interact, what invariants hold, and what currently fails.

---

## Architecture

**Primary pattern**: Layered real-time control atop a fixed-timestep rigid-body simulator.

- **Physics**: MuJoCo (WASM, `@mujoco/mujoco`), `timestep=0.002` (500 Hz), `implicitfast` integrator, 200 solver iterations.
- **Rendering**: Three.js at 60 Hz (render loop), with a heavy "root capsule" rigid body bridging the two.
- **Loop structure** (`WorldEngine.start` → `useWorld.ts`): at each 500 Hz step, `PhysicsEngine.step()` runs `mj_step`, then a per-agent control chain executes; at each 60 Hz frame, `updateMotorTargets()` + `syncVisuals()` flush the pose and sync the skinned mesh.
- **Multi-agent**: each agent (`agent_0…N`) owns a `HumanoidPhysicsBinder` with its own `MotorController`, `ComReflexController`, `BodyManager`, and `AvatarSynchronizer`. A combined MJCF is generated per world reload (`generateCombinedMultiAgentMJCF`) and agent state is preserved across reloads by `StateRehydrator`.

### The balance-relevant files at a glance

| File | Role in balance |
|---|---|
| `src/world/hooks/useWorld.ts` | The 500 Hz per-step control chain: `applyBalanceStep()` → `applyRootVelocityDrive()` → `applyComReflexStep()`; 300-frame fall-diagnostic ring buffer; `synthia:action` dispatch |
| `src/world/engine/MotorController.ts` | `applyCapsuleBalance()` — the torso-upright PD torque; joint PD target writing; per-step additive joint injection |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Orchestrator: drives motor targets, GRF injection, micro-drift damping, grounding detection, root velocity servo, COM reflex input assembly |
| `src/world/engine/ComReflexController.ts` | Pure COM lean-reflex + capture-step controller (three laws) |
| `src/world/engine/ReflexLeanA.ts` | Maps reflex lean to spine2 pitch delta (anatomically clamped) |
| `src/world/engine/gaitPhaseMap.ts` | Empirical swing windows / phase envelope for capture-step timing |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Builds MJCF: 15 kg root capsule + ~90 kg body, per-bone PD gains, foot-friction geoms |
| `src/constants/physics.ts` | Complete anthropomorphic mass/inertia matrix (~75 kg body + capsule) |
| `src/constants/rigConstraints.ts`, `src/constants/anatomicalLimits.ts` | Joint range enforcement that keeps the body inside anatomically stable envelopes |
| `src/world/engine/WorldEngine.ts` | Fixed 500 Hz stepped `animate()` loop with `onStep`/`onFrame` hooks |
| `src/world/engine/PhysicsEngine.ts` | `mj_step` execution, contact force registry (feeds GRF), velocity clamps |

---

## The Eight Mechanisms of Balance

### 1. The mass/inertia substrate (static, but decisive)

**File**: `src/constants/physics.ts`, `src/world/engine/MJCFHumanoidTemplate.ts`

Balance fails or succeeds before the first controller runs, because the simulated body's mass distribution defines the plant. The significant numbers:

- **Root capsule**: mass **15 kg**, `diaginertia="2.5 1.2 2.5"` — the "heavy root" (Option A). This was raised from ~0.001 kg because a near-massless root made the capsule-balance torque physically meaningless. The root carries the pelvis and torso collider (the hips body, `mixamorighips` = 12 kg, is welded to it as the skeletal root).
- **Body mass matrix** (~75 kg total, ~90 kg with capsule): hips 12 kg → spine 6/5/4 kg → thighs 8.5 kg each → shins 4.2 kg each → feet 1.1 kg each; arms 2.2/1.4/0.4 kg; head 4.3 kg; neck 1.2 kg; fingers 0.008–0.02 kg. Total ≈ 90 kg (used by GRF/root-drive deltaV: `HUMANOID_MASS_KG = 90`).
- Inertia philosophy: `Iyy ≈ Ixx/3` for long bones (natural twist freedom), proximal-to-distal mass stepping ~50–60% per segment (kills "jackhammer" PD feedback loops).
- Per-bone **PD gains baked into the MJCF** (`getMuJoCoBoneGains`): ankles kp=600/kv=100 (push toes down), knees kp=1000/kv=180 (resist squat), hips kp=900/kv=150 (upright trunk), spine kp=700/kv=130 (resist torso sag), head/neck kp=80/kv=25 (avoid bobblehead), arms 200/40, fingers 5/1.
- Foot geoms are `friction="3.0 0.5 0.1"` (vs floor `2.0 0.5 0.1`) — high sole friction to prevent "ice-cube drift", with box geoms oriented flat via inverse body quaternion.

**Invariant**: the mass distribution + baked PD servo gains must be able to hold the body upright *passively* at zero commanded deviation. The active controllers are perturbations on this substrate.

### 2. The capsule upright-balance torque (the "gyro balancer")

**File**: `MotorController.applyCapsuleBalance(capsuleBodyId)` — called at **500 Hz** via `HumanoidPhysicsBinder.applyBalanceStep()`.

- Reads the root capsule's orientation quaternion (`xquat`), converts MuJoCo→Three, computes `tiltAngle = acos(capsuleUp.y)` and the horizontal tilt axis.
- Computes torque: `torque = KP·(tiltAxis·tiltAngle) − KD·(angularVelocity)` in world frame, then converts back to MuJoCo and writes into `xfrc_applied[capsuleId*6 + 3..5]` (torque slots). The force slots (0..2) are zeroed every call.
- **Gains** (current): `BALANCE_KP = 800`, `BALANCE_KD = 320` — scaled ~8× from the original 100/40 to match the 15 kg root. `MAX_BALANCE_TORQUE = 120 N·m` (raised from 60 for the heavy root).
- `balanceScale = gaitActive ? GAIT_BALANCE_SCALE(0.5) : 1.0` — **WARNING: this back-off flag is dead at runtime** (see Non-Obvious Behaviors). So balance currently runs at full strength 800/320/120 N·m even during AI-commanded motion.
- Diagnostics: `lastBalanceTorqueMag`, `lastBalanceTiltRad` public fields.

### 3. Joint PD position servos (the "pose flush")

**File**: `MotorController.setTargets()` — called at **60 Hz** from `useWorld.ts` `onFrame` → `binder.updateMotorTargets()`.

- Writes `data.ctrl` for every tracked joint from `currentTargets` (the AI-commanded pose, clamped and sanitized). Spherical joints = [yaw,pitch,roll] → actuator order [yaw(0 0 1), pitch(1 0 0), roll(0 1 0)]; 2-DOF ankle/foot = [pitch,roll].
- Includes a **20-step ctrl ramp** (`rampFactor = min(1, simStep/20)`) so fresh agents fade from bind pose rather than snapping.
- The underlying MuJoCo `<position>` actuators are joint-space PD servos holding commanded angles. This is the *stance substrate* — the legs' resistance to collapse. It is physically what keeps the kinematic chain from folding; the active torque (mechanism 2) and COM reflex (mechanism 5) act as corrections on top.
- **Important**: this runs at 60 Hz, while physics is 500 Hz — the same ctrl values are held across ~8 steps (a known feedback delay that matters when tuning gains).

### 4. Ground-contact stabilization (GRF injection + micro-drift kill + root velocity drive)

**File**: `HumanoidPhysicsBinder.applyKinematicGroundReactionForces()`, `syncVisuals()` micro-drift section, `applyRootVelocityDrive()`.

- **GRF injector** (first branch, when `mbActive`): reads the contact-force registry for the two foot colliders; if a foot is in contact with `impulse ≥ 0.5` and normal `nz ≥ 0.3`, it projects the contact force onto the model-forward axis and injects `deltaV = impulse/90kg` **directly into `qvel[0..2]`** (linear DOFs of the root freejoint) — effectively adding a walking push from the ground contact. `gaitBoost = 1.5` when `gaitActive` (also dead-gated). Yaw torque from foot-offset is injected into `qvel[3..5]` with `inertia = 10`.
- **Second branch** (non-multibody / kinematic fallback): tracks `previousFootPositions` of the toe bases; when a foot is near the ground, any horizontal pose delta produces an opposite impulse (`KGRF_MULTIPLIER = 150`, cap 16) into the root — a ground-reaction approximation that stops the model's feet from skating through the floor during animation playback.
- **Micro-drift damping** (in `syncVisuals`): when `_isGrounded`, horizontal root speed < 0.08 m/s is multiplied by 0.85 (near-stationary drift kill), < 0.25 by 0.94 (slow-creep), and yaw rate < 0.05 by 0.80. This is a soft "static friction" enforcement because MuJoCo soft contacts leave residual glide.
- **Root velocity drive** (Road-3 replacement for root teleportation): `applyRootVelocityDrive()` at 500 Hz applies a critically-damped servo `accel = ω²·(target − current)` with `ω = 6 s⁻¹`, clamped to `ROOT_VELOCITY_MAX_MPS = 0.15 m/s`, and **suspends while airborne** (`_isGrounded`). This is deliberately a *gentle* assist so it can't fight a fall.

### 5. The COM lean-reflex + capture-step (Road-4, the newest balance layer)

**File**: `ComReflexController.computeFrame()` + `HumanoidPhysicsBinder.applyComReflexStep()` at 500 Hz.

Three laws:

1. **COM lean correction** (always): `e = COM_foreAft − stanceFoot_foreAft`, `v = COM_foreAft_velocity`; `leanOffsetRad = clamp(kH·e + kD·v, ±0.25 rad)`. Mapped by `ReflexLeanA.allocateLeanA` to an **additive spine2 pitch delta** (positive = lean back = **negative** pitch, because positive x-pitch is forward lean). Sum is clamped to the spine2 rig range ±0.524 rad. Injected via `addPerStepJointDeltas` so it stacks on the flush ctrl without touching `currentTargets`.
2. **Capture step** (during the gait's empirical swing window): `captureM = e + v·√(h/g)`, and the swing hip is steered so the foot lands at the capture point: `swingHipOffsetRad = clamp(kCapture·(captureM − swingFootF), ±0.5) · envelope`. The knee (`REFLEX_SWING_KNEE_MAX_RAD = 0.8`) and ankle dorsiflex (`REFLEX_SWING_ANKLE_MAX_RAD = 0.3`) ride the same `swingEnvAt` 0→1→0 envelope.
3. **Forced step** (when |e| > `forceStepM = 0.18 m` outside any swing window): the free (non-stance) foot is dispatched via a per-leg FSM (`stance → swing → planted → refractory → stance`) at full gain, following a `shoulderEnv` bump. One-swinger-max, mandatory-plant exit at sole gap ≤ 5 mm, refractory dwell blocks re-swing.

**Inputs** (all computed in the binder at 500 Hz): mass-weighted COM position+velocity (skipping env/floor/piano bodies), yaw-only forward axis (drops pitch/roll so the reflex doesn't act downhill), foot sole gaps (µ 20 mm below foot joint ± 10 mm half-thickness), cycle phase from the currently playing timeline (`GAIT_CYCLE = 32 frames @ 30 fps = 1.0667 s`), COM height for the pendulum length, `dt = 0.002`.

**Telemetry**: `lastReflexStats` (e, v, leanOffset, captureM, stanceSide, forcedStepCount, swingSteps, stanceReplantCycles, swingAborts, plantedTouchdowns) and `ComReflexController.diagnose()` — sub-law attribution (`lean` vs `step` vs `none`) for failures.

### 6. Gait phasing (the temporal map of when legs swing)

**File**: `gaitPhaseMap.ts`

- Empirically derived from the on-disk walk artifact (`mixamo-walking-synthia.json`): RIGHT swings frames 4–12 (peak 9), LEFT swings frames 19–25 (peak 24); all others DOUBLE_SUPPORT.
- `swingEnvAt` gives a bump envelope peaking exactly at the hip-pitch peak. `classifyPhase`/`classifyFrame` give the phase label. `estimateSoleLiftM` (2-segment leg model) cross-validates that a swing band really lifts the foot.
- This is the single source of truth that the COM capture-step uses to time its hip/knee/ankle injections — *not* actual contact state. It is derived from the real artifact played by the harness, not the authored v4 gait.

### 7. Joint limit enforcement (the safety envelope)

**File**: `rigConstraints.ts` (MJCF range + AI-sanitization), `anatomicalLimits.ts` (motor-target clamp), `MotorController` ctrlrange.

- During AI timeline sanitization (`validateAndApplyTimeline`), every override is clamped to `SYNTHIA_RIG_CONSTRAINTS` per-joint ranges; with `activeGaitPhase` it is multiplied by `locomotionCap` (1.0 currently for spine/hips/knees). Scapulohumeral ratio injects shoulder counter-rotation when the arm exceeds ±0.523 rad; cervical coupling injects a neck counter-roll when the neck yaws.
- In `setMotorTargets`, every target is additionally clamped to `getAnatomicalLimitForBone` (knee [0, +150°], ankle ±45°, hip ±120°, spine ±45°, etc.). Rejected targets become feedback to the LLM (`recordActionFeedback`).
- This keeps the commanded posture inside envelopes the ground-reaction physics can actually support — an out-of-range knee (hyperextension) is a fall-in-waiting.

### 8. State preservation & recovery (resilience machinery)

**File**: `StateRehydrator.ts`, `HumanoidPhysicsBinder.resetPose()/resetToBindPose()/setStiffnessScale()`

- On multi-agent world reload, `capture()` snapshots root pos/quat/vel, every joint angle/velocity, and **`data.ctrl` for every actuator**; `restore()` writes them back into the new world before `mj_forward`. Without the ctrl restore, all joints flop to T-pose and the 20-step ramp destabilizes every standing agent.
- `resetPose()` = `setGaitActive(false)` + capsule reset to spawn + `resetToBindPose()` + a **3× stiffness boost decaying over 1 s** (`setStiffnessScale(3.0) → 1.0`) — a temporary gain lock so contacts don't kick a leg loose before PD converges.
- `setMode('ragdoll')` zeroes all gains (passive); `'rigid'` restores them.
- `executeJump`/`push` are impulse helpers used by tests/UI to probe stability.

---

## The Control-Loop Data Flow

1. **User/AI command** → `AgentLoop.cycle()` parses the LLM JSON action → dispatches `window` CustomEvent `synthia:action` (with `jointOverrides`, `sequence`, `activeGaitPhase`, `gazeTarget`, `agentId`).
2. **`useWorld.ts` `synthia:action` handler** → for the target binder: sanitize/clamp the timeline (`validateAndApplyTimeline`) and set motor targets (`setMotorTargets`). `activeGaitPhase` is currently used **only** for the `locomotionCap` clamp — it is never forwarded to `binder.setGaitActive(true)`.
3. **60 Hz frame** → `binder.updateMotorTargets()` → `MotorController.setTargets(currentTargets)` → `data.ctrl` for all joints (held ~8 physics steps). Then `binder.syncVisuals()`:
   - capsule proxy translation/quaternion → place the Three.js modelRoot;
   - `mj_ray` down to find the floor → `groundSurfaceY` → `_isGrounded` determination;
   - micro-drift damping (mechanism 4);
   - `applyKinematicGroundReactionForces()` (mechanism 4);
   - `AvatarSynchronizer.synchronize()` to pose the skinned bones from body proxies;
   - timeline stepper interpolation → `setMotorTargets` for the current interpolated frame.
4. **500 Hz step** (per agent, inside `WorldEngine.start`'s `onStep`):
   - `binder.applyBalanceStep()` → `MotorController.applyCapsuleBalance()` → upright torque into `xfrc_applied` (mechanism 2);
   - `binder.applyRootVelocityDrive(performance.now())` (mechanism 4);
   - `binder.applyComReflexStep(0.002)` → COM lean + capture step, additive joint deltas (mechanism 5).
5. **`PhysicsEngine.step()`** then clamps registered body velocities (10 m/s lin / 10 rad/s ang) and drains the contact-force registry (feeds the GRF injector next frame).
6. Every 8th step, the **300-frame diagnostic ring** snapshots qpos/qvel/xpos/xquat/xfrc/contacts/cfrc — exposed as `diagnose_fall_quick()` and `__SYNTHIA_DIAG_RING__()`.

---

## Non-Obvious Behaviors & Design Decisions

1. **The `gaitActive` flag is dead code at runtime — the single most important balance fact.** `GAIT_BALANCE_SCALE = 0.5γ` (MotorController) backs the capsule-balance torque off to 15% or 50% while a gait timeline is active, and `gaitBoost = 1.5` (GRF injector) boosts ground impulse during gait — but **no caller ever sets `binder.setGaitActive(true)`**. The `synthia:action` handler receives `activeGaitPhase` and passes it only into `validateAndApplyTimeline({ activeGaitPhase })` for `locomotionCap` clamping. `setGaitActive(false)` is only called from `resetPose()`/`resetToBindPose()`. Result: the 800/320/120 N·m capsule balance runs at **full authority always** — including during intentional lean/reach/walk, where it fights the commanded motion (stiff/robotic feel) and is simultaneously unable to distinguish a stumble from a deliberate lunge. The architecture for motion-aware scaling exists; the wire is missing. The `gyroscope-analysis.md` document reaches the same verdict (that earlier doc describes KP=100/KD=40/cap=60 and GAIT=0.15; current code is KP=800/KD=320/cap=120 and GAIT=0.5 — the mechanism and dead-gate finding are unchanged).

2. **The balance torque is sampled at 500 Hz but the pose flush is only 60 Hz.** `applyCapsuleBalance` is rewritten every physics step (fresh in current code — the old gyroscope-analysis noted a 60 Hz sampling issue, which has since been fixed by moving to the `onStep` hook), but `setTargets()` ctrl is held for ~8 steps. Any gain tuning must account for this quantization on the joint-PD path.

3. **`xfrc_applied` clobbering contract.** `applyCapsuleBalance` zeroes the capsule's force slots (0–2) and writes only torque (3–5) every step. Any *force* injection on the capsule body via `xfrc_applied` will be silently wiped. Currently no conflict — the GRF injector writes `qvel`, not forces — but this is a foot-gun for future features.

4. **Coordinate-system churn is everywhere and easy to break.** Three.js Y-up ↔ MuJoCo Z-up: `worldToMuJoCo = [x, -z, y]`, quaternions aligned via +90° about X. The capsule-balance pipeline converts quat→Three, computes torque in Three space, converts back. The COM reflex uses a yaw-only forward vector (drops pitch/roll) so the lean law doesn't fire on slopes/tilts. The diag ring labels MuJoCo "X-forward, Y-left, Z-up". Any new controller must go through `PhysicsEngine.mujocoQuatToThree`/`mujocoToWorld` or it will silently invert an axis.

5. **`data.ctrl` is per-agent partitioned by actuator name, and the ramp must never restart on a re-init.** `MotorController.init` deliberately does NOT reset `simulationStepCount` on re-init (the comment explains why: a fresh ramp would collapse old agents' ctrl to 0 and drive them to T-pose for ~20 frames). Legitimate resets go through `resetRamp()`. The ctrl ramp is a hidden state with a careful lifecycle.

6. **Stance detection uses sole-gap hysteresis, not contact forces.** `resolveStanceSide` uses geometric sole gaps (≤5 mm = planted); when *both* feet are airborne, the previous stance side is latched. The GRF injector separately uses the contact registry. These are two unrelated notions of "standing" that must not be conflated when reading the code.

7. **The capture-step has a known structural failure (as of ROAD4 report).** All three tuning rounds failed with the same signature: lean corrector saturates at ±0.25 rad, COM runs ~0.6 m ahead, torso tips past 48°, **~3400 forced steps fire but zero land** — the swing-leg drive (0.8 rad knee cap) is insufficient to lift the foot against the 90 kg body while the capsule pitches forward; stance foot never re-plants. Diagnosis: `step` sub-law. This is the *documented current ceiling* of the balance stack — the next step is raising swing-knee toward 2.618 rad and/or stronger hip throw, then re-tuning kH≈3–5, kD≈0.6–0.8.

8. **The walking artifact is not the authored gait.** The phase map is derived empirically from the on-disk `mixamo-walking-synthia.json` (Mixamo stream converted, root delta ≈1.7 m/s clamped to 0.15–0.3 m/s by the root servo), *not* from `scripts/authorSynthiaGait.mjs`. The V4 swing *shape* constants are used only to shape injected offsets.

9. **Multi-agent balance is per-binder but shares one world.** All binders' actuators coexist in a single MJCF; `setTargets` explicitly zeroes only its own actuators' ctrl before writing, and `remapIdsAgainstLoadedWorld` is required after every world compile. The 15 kg heavy root is per-agent. Adding agents changes the world body count, so all COM calculations rebuild their mass body cache on enable (`refreshReflexBodyCache`).

---

## Key Invariants

1. **The heavy root (15 kg) + baked joint PD gains must passively hold the bind pose** — every active controller is a perturbation on this.
2. **The capsule-balance torque must never be sampled slower than the physics loop** (it is now per-step at 500 Hz).
3. **`qvel` linear DOFs (root freejoint) are the only legal ground-interaction channel** for forces (GRF injector / root drive / push / jump). `xfrc_applied` on the capsule is torque-only.
4. **Joint targets must always pass both clamps** (rig constraints → anatomical limits) or be rejected with feedback to the LLM.
5. **`data.ctrl` ramp must not restart on re-init;** ctrl values are captured/restored across world reloads.
6. **Sole-gap ≤ 5 mm = planted; both airborne = latch last stance** — the reflex's stance model.
7. **The balance corrector and the AI-commanded pose fight each other whenever the commanded pose deviates from vertical** — because `gaitActive` is never set true (the dead gate), there is currently no mechanism distinguishing "intentional lean" from "stumble".

---

## Error Propagation & Failure Modes

- **Falling** is currently *not an error* — the system detects it (`isOutOfWorldBounds`, ring buffer `tilt`/`rootH` drop, `getIsGrounded`) and respawns via `resetPose` (with the 3× stiffness lock). There is no "recovery from lying" controller.
- **Physics breakage**: any WASM stepping fault sets `isPhysicsBroken = true`, which stops the entire per-step chain (guards in `useWorld.ts` onStep and `PhysicsEngine.step`).
- **Controller exceptions** are caught per-binder in the onStep loop (`Logger.warn("per-step control failed")`) — a failing reflex does not kill the sim loop.
- **The diag ring is the post-mortem tool**: `diagnose_fall_quick()` prints root-height drop, tilt increase, CoM-vs-foot offset, joint qpos/qvel transitions, body velocities, contact forces, xfrc torque history, and downloads `fall_diagnosis.json`. `ComReflexController.diagnose()` attributes reflex failure to the *lean* law (corrector under-powered) vs *step* law (capture-step machinery deficient).

---

## Module Reference (balance-relevant)

| File | Purpose |
|---|---|
| `src/world/hooks/useWorld.ts` | Wires the whole loop; 500 Hz order `applyBalanceStep → applyRootVelocityDrive → applyComReflexStep`; 300-frame diag ring; action dispatch; multi-agent spawn/rehydrate |
| `src/world/engine/MotorController.ts` | Capsule balance torque (KP=800/KD=320/cap=120), joint ctrl writer with 20-step ramp, per-step additive injection |
| `src/world/engine/HumanoidPhysicsBinder.ts` | The orchestrator: GRF injector, micro-drift kill, grounding raycast, root velocity servo, COM reflex input assembly, reset/stiffness-lock, `setGaitActive` (dead-gated) |
| `src/world/engine/ComReflexController.ts` | Pure COM lean + capture-step laws, per-leg step FSM, stats + sub-law diagnosis |
| `src/world/engine/ReflexLeanA.ts` | Spine2 pitch delta allocation for the lean correction |
| `src/world/engine/gaitPhaseMap.ts` | Empirical swing windows/envelope, cycle constants, sole constants, leg-shortening proxy |
| `src/world/engine/MJCFHumanoidTemplate.ts` | MJCF codegen: 15 kg root capsule, per-bone gains, foot geoms, joints/actuators, multi-agent combine |
| `src/constants/physics.ts` | Anthropomorphic mass/inertia matrix + defaults |
| `src/constants/rigConstraints.ts` | Per-joint rig ranges + locomotionCap/scapulohumeral/cervical allowances |
| `src/constants/anatomicalLimits.ts` | Anatomical clamp used by motor targets; world boundary |
| `src/world/engine/WorldEngine.ts` | Fixed-step 500 Hz loop with onStep/onFrame hooks |
| `src/world/engine/PhysicsEngine.ts` | `mj_step`, velocity clamps, contact force registry (GRF input), mutation lock |
| `src/world/engine/StateRehydrator.ts` | Captures/restores root+joints+**ctrl** across world reloads |
| `src/world/engine/BodyManager.ts` | MJCF load + body/geom/actuator ID mapping per agent |
| `src/world/agent/AgentLoop.ts` | LLM action parsing → `synthia:action` event (source of commanded motion) |
| `src/debug/playWalkGate.ts` | Browser gate harness: `playWalk()`, `playWalkReflex()`, telemetry tables |
| `src/world/engine/__tests__/road4ComReflex.test.ts` | Deterministic 500 Hz gate: ΔZ, maxTilt, step-landing KPIs, sub-law verdict |
| `ROAD4_GATES_REPORT.md` | Round-by-round tuning history + documented current failure (step sub-law) |
| `balance.py` (root) | **Not part of the runtime** — standalone Python MuJoCo experiment holding a stock keyframe with push-perturbations; predecessor exploration |
| `com_pendulum_recorder.js` (root) | **Diagnostic tool, not runtime** — browser console recorder of COM/inverted-pendulum telemetry, exports `synthia_com_pendulum_data_*.json` |
| `gyroscope-analysis.md` (root) | Earlier audit of the capsule balancer (describes the pre-refactor 60 Hz sampling; KP/KD/cap values now superseded but mechanism analysis still accurate) |

---

## Suggested Reading Order

1. `src/world/engine/MotorController.ts` — the balance torque pipeline (start with `applyCapsuleBalance`, then `setTargets`/`addPerStepJointDeltas`); the "what physically keeps it upright" layer.
2. `src/world/engine/HumanoidPhysicsBinder.ts` — the orchestrator; understand `applyKinematicGroundReactionForces`, `applyRootVelocityDrive`, `applyComReflexStep`, `setGaitActive` (and its dead wire).
3. `src/world/hooks/useWorld.ts` — the loop wiring; the 500 Hz onStep order and the diag ring (read the onStep section, not the whole 0.1 MB file at once).
4. `src/world/engine/ComReflexController.ts` — the newest balance law (three laws + per-leg FSM + diagnosis).
5. `src/world/engine/MJCFHumanoidTemplate.ts` + `src/constants/physics.ts` — the mass/inertia/PD substrate that makes everything above physically possible.
6. `ROAD4_GATES_REPORT.md` — the empirical state of balance today: what passes, what fails, and the documented next step.
