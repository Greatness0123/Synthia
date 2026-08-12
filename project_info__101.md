# Synthia 1.5.1 — Deep-Dive Exploration: Walking Pipeline, Balance Architecture & Small-Motion Primitives

## Summary

This is a **browser-only, client-side "digital life" simulation** where humanoid agents (Mixamo-rigged `x-bot.glb`) run a vision-language-model cognitive loop (Gemini/OpenAI-compatible via `AgentLoop`), perceive the world through a first-person head camera, write episodic memories, and control their bodies through **MuJoCo WASM** physics with 49 joint-space PD position actuators. The entire project is deliberately server-free so agents can "live" without GPU inference costs; the heavy lifting is a 500 Hz MuJoCo simulation inside the browser plus per-agent 2-second VLM inference cycles.

This report answers three questions exhaustively: (1) every reason running `walking2.md` through the pipeline will NOT reproduce the original Mixamo walk; (2) a fully-researched balance/movement plan (options, benefits, caveats, consequences) for jump/walk/run without an AI-controlled balance loop; (3) a set of small-motion joint primitives covering fingers→hips→spine for step-by-step motion authoring.

---

## 1. Why running `walking2.md` will NOT reproduce the original Mixamo animation

The file `walking2.md` is the raw Mixamo *retargeted stream* (SJSON line format, 32 frames @ 30 fps, 52 rotation nodes + Hips position). Running it through the existing pipeline (`src/utils/mixamoStreamConverter.ts` → `public/animations/mixamo-walking-synthia.json` → `playMixamoWalk.ts` → `synthia:action`/`synthia:rootMotion` events → `HumanoidPhysicsBinder`) will NOT produce the original animation **for seventeen concrete reasons**. The **currently deployed artifact is NOT the Mixamo conversion** — it is the authored walk (`scripts/authorSynthiaGait.mjs` output, `"name": "Synthia Authored Walk v3"`), so running the generator against `walking2.md` will **overwrite** that file with the Mixamo stream's 33-frame sequence (32 + 1 loop clone), changing absolutely everything about the current walking behavior.

### 1.1 Pipeline-stage reasons (converter → artifact → playback)

**R1 — The stream is only joint *deltas*, not world-space poses.** Mixamo `rot` channels are *local delta rotations in the T-pose frame* (`qRel = qParent⁻¹ · qChild`). The converter explicitly relies on this ("No bind-pose subtraction and no world-chain accumulation are needed"). The original Mixamo renderer accumulated these against the actual skeleton hierarchy with its exact bind-pose rest. The Synthia MJCF is baked from the same bind pose **in principle** — but the binder captures it at load time via `extractBonePositions()` (Three.js world quats at load), and any difference between that captured pose and the MJCF emitter's `bindPoseWorldQuaternions` snapshot (both exist; `HumanoidPhysicsBinder` keeps BOTH `bindPoseQuaternions` and `bindPoseWorldQuaternions`) flows straight into a rotation mismatch.

**R2 — The converter does a Y↔X Euler swap for the whole chain but only *head/neck* swap yaw↔roll, and the sign of most channels was never probe-verified.** `docs/joint_configuration_dossier.json` marks `mixamorig{side}arm`, `forearm`, `hand`, `foot` as **`"empirical": "PREDICTED: ??"`** — never measured on the live rig. Only uplegs, legs, shoulders were probed. The Mixamo converter silently assumes the Euler permutation, and `walking2.md`'s forearms at ~0.70–0.95 rad will land in a **positive-flexion-only** hinge with unknown sign semantics.

**R3 — The converter force-clamps everything into Synthia's rig ranges, which are NOT Mixamo's ranges.** `mixamoStreamConverter.ts` applies `SYNTHIA_RIG_CONSTRAINTS` per axis (e.g., spine pitch only `[-0.524, 0.785]`, shoulder `±0.7`, forearm `[0, 2.531]`, knee `[0.0, 2.618]`). Every stream value outside these bands — and real walk data hits them on elbows, ankles, and hips — is silently truncated. The original Mixamo clip moves joints through their *full* anatomical range; the converter destroys that.

**R4 — The converter treats elbows as positive-flexion only (`pitch = |pitch|`).** In `toZxyEuler` + `isElbow` the code does `pitch = Math.abs(pitch)` unconditionally. Real arm swing extends the elbow *past* straight; taking abs mirrors the elbow backward whenever the stream value is negative, producing the "arms folded at the back" artifact documented in `project_info__100.md`.

**R5 — Root-motion forward vector is assumed, not measured.** The converter maps Mixamo `posZ` to `dz = ΔposZ × 0.01 × (−1)`. The real clip's forward axis (Mixamo +Z forward) is hard-coded; if the source clip turns or is authored in a different convention (e.g., a right-turn clip), the agent walks backward or sideslips.

**R6 — The timeline uses `timeOffsetMs` with real wall-clock interpolation, not frame-locked steps.** `HumanoidPhysicsBinder.syncVisuals()` runs the timeline against `performance.now()` (60 Hz render vs. 30 fps clip). At 60 fps render, the 33.33 ms clip frames are *not* evenly divisible — leading to jitter, dropped/interpolated poses, and the **20-physics-step ctrl ramp** (`simulationStepCount/20` in `MotorController.setTargets`) fighting the pose every time the sequence is re-dispatched. The original Mixamo playback was frame-exact in a DCC tool.

**R7 — The loop seam re-dispatches the whole sequence every cycle (`playMixamoWalk` line ~90), which re-invokes `validateAndApplyTimeline` and re-triggers the L2 clamp/injection pipeline.** The scapulohumeral injection (`arm |x|>0.523 → shoulder.x += (|x|−0.523)/2`) fires on the walk's arm values every cycle, injecting an extra shoulder pitch the original animation never had.

**R8 — `synthia:rootMotion` handler teleports the capsule (`capsuleBody.setTranslation`) instead of applying a velocity.** Each tick adds `dx/dz` to the capsule position directly. The original Mixamo clip had continuous root translation; the Synthia path teleports 32 discrete jumps per second *while the feet remain planted by the PD controllers*, shearing the legs through the floor and exciting hip yaw/roll — this is the documented cause of the "bowed knees" (project_info__100 §1.2, driver A).

### 1.2 Physics / actuator reasons (the MJCF is not the Mixamo skeleton)

**R9 — The MJCF is NOT the Mixamo skeletal model.** `MJCFHumanoidTemplate.ts` builds a *simplified* MuJoCo body tree: every bone is a **sphere collider (r=0.04)** except feet (box 0.05×0.13×0.015), the root is a massless 0.001 kg capsule (`mass="0.001"`, `diaginertia="5.0 3.0 5.0"`) with `contype="0"` (collision-off), and a `torso_collider` sphere. The real Mixamo character has a full skinned mesh with proper surface contacts. A humanoid standing on 1.1 kg feet boxes with the entire trunk hanging from a massless capsule is a *different dynamic system* — it will not track the original gracefully.

**R10 — `toebase` is *inert*** in the MJCF (no `BONE_JOINT_TYPE` entry → no body, no joint, no actuator). The stream's `LeftToeBase`/`RightToeBase` channels are silently dropped (`MotorController` skips bones with no actuator). The original Mixamo walk's toe roll/plantar-flexion phase is completely lost, which affects push-off and gait dynamics.

**R11 — Joint type mismatch multiplies the delta error.** The converter emits [pitch, yaw, roll] triples based on a `dof` read from `SYNTHIA_RIG_CONSTRAINTS`. But the actual MJCF joint decomposition is: 1-DOF = hinge pitch only; 2-DOF = pitch+roll; 3-DOF = yaw→pitch→roll **with head/neck yaw↔roll axes swapped** (MJCF lines `yawAxis = isHeadNeck ? '0 1 0' : '0 0 1'`, `rollAxis = isHeadNeck ? '0 0 1' : '0 1 0'`). The converter's head/neck swap (`if isHeadNeck(bone) { tmp = yaw; yaw = roll; roll = tmp; }`) must exactly invert this — and the dossier flags that only shoulders/uplegs/legs were ever world-delta verified, so a single wrong sign anywhere shifts the whole joint tree.

**R12 — The 3-actuator channel-order is `[yaw←y, pitch←x, roll←z]` in `MotorController.setTargets`.** The walk converter emits `[pitch, yaw, roll]` as `[v0, v1, v2]` and the motor controller maps `yaw = parsedTarget.y; pitch = parsedTarget.x; roll = parsedTarget.z`. This is internally consistent **only if the MJCF emitted `_yaw` as axis `0 0 1`** — true for most 3-DOF joints but *false for head/neck* (`axis="0 1 0"`). Head yaw in the stream will drive the wrong world axis after the double swap (stream swap + MJCF swap + controller map). The head in `walking2.md` rotates far less than the spine, but any residual head movement is going the wrong way.

**R13 — 500 Hz fixed timestep = 16,666× simulation steps per 30 fps frame.** Each 33 ms clip frame is held for ~16.7 physics steps. PD gains are stiff (knees kp=1000, kv=180; hips kp=900; ankles kp=600; spine kp=700) — a stiff, high-rate physics integrator will **fight the pose targets** between dispatches, generating contact-induced oscillation that a keyframed DCC render never had. The `implicitfast` integrator + `iterations=200` in the MJCF option block will make the foot-ground contact solver *very* stiff, so the teleported root + planted feet will ring.

### 1.3 Existing-code contradictions (tools disagree with the rig)

**R14 — `scripts/walkAnalyzer.js` LIMITS table is stale.** Its `LIMITS` uses knee `[-2.618, 0]` (the old negative-flexion convention), shoulder `±0.261` (the old clamp), forearm `[0, 2.531]`. The *current* `rigConstraints.ts` uses knee `[0.0, 2.618]` and shoulder `±0.7`. Any analyzer run against `walking2.md` output will report false clamp violations and false knee "validity".

**R15 — `diagnostic_poses_v2.js` sends negative knee values (`−90°`, `−130°`, `−120°`)**, which the current positive-flexion anatomical clamp `{min:0, max:150°}` zeroes. Anyone cross-checking the walk with these poses gets contradictory knee readings.

**R16 — `scripts/generateMixamoWalkArtifacts.ts` reads `walking2.md` (NOT `walking`).** The source file lives at repo root; both `walking` and `walking2.md` exist and are byte-identical in the header/frame data. But if a developer runs the analyzer script (`scripts/walkAnalyzer.js` via browser console) it fetches `/animations/mixamo-walking-synthia.json`, which is currently the *authored* walk, not the Mixamo conversion — so analysis of "the Mixamo walk" actually analyzes the authored one.

**R17 — The `GAIT_BALANCE_SCALE` dead-switch.** `MotorController.applyCapsuleBalance()` has `const GAIT_BALANCE_SCALE = 0.15; const balanceScale = this.gaitActive ? GAIT_BALANCE_SCALE : 1.0;` but **nothing ever sets `gaitActive = true`** — `HumanoidPhysicsBinder.setGaitActive(true)` is only called with `false` from `resetPose()`/`resetToBindPose()`, and the `synthia:action` handler in `useWorld.ts` never calls it. So during the Mixamo walk the capsule balance corrector runs at **full strength (KP=100, KD=40, cap 60 N·m)** every render frame — actively resisting the forward lean the walk's spine pitch creates, and the 3.5× root-motion mismatch turns that balance torque into a **wobble/tipping input**. This is the single biggest *operational* difference between the original clip and what the physics loop produces.

### 1.4 The definitive proof that "script replay" cannot equal the original

The original Mixamo output is a *kinematic keyframe reproduction*: the character moves because the FK chain is explicitly posed each frame; the ground is contacted only visually. Synthia's output is a *physics prediction*: PD actuators chase targets while a 500 Hz contact solver, gravity, a 0.001 kg inertialess root, capsule/box collision geometry, the foot-drag shear, and an un-gated balance torque all act on the body. **Two different systems, two different outputs.** Even a perfect converted artifact will not reproduce the original; the goal of the pipeline is a *synthesized* walk that *approaches* the clip's kinematics while remaining physically stable — and that stability is currently impossible for the reasons in §2.

---

## 2. Balance / Locomotion Plan: jump, walk, run, without AI-controlled balance

### 2.1 Ground truth from the fall diagnosis

`fall_diagnosis (1).json` (300-frame ring at ~60 fps) shows the failure mode precisely:

- **Frame 0**: `rootH=0.874`, `tilt=0.004°`, `comZ=1.060`, feet at `0.087`, grounded, 8 contacts. **Upright.**
- **Frame 296 (end, ≈5 s later)**: `rootH=0.120`, **`tilt=102.2°`** (lying flat), root has translated `Y≈−1.05` (horizontal drift in MuJoCo), left foot at `0.248` (above body mid-line), contacts = torso_collider + head + arm + thumb + right foot. **Fully toppled.**
- The `xfrc` (balance torque) at the end is `[−58.1, 15.1, −0.5] N·m` — the balance controller **saturating at its 60 N·m cap while the agent is already on the floor**, i.e., it pushes at full strength in a direction that cannot recover because the CoM is outside the support polygon.
- Root mass in the body table: **0.001 kg** (massless root) while hips=12, spine=6, spine1=5, spine2=4, neck=1.2, head=4.3 → **the entire 75 kg "body" hangs from a 0.001 kg, 0.2-radius, no-collision capsule with diaginertia 5.0/3.0/5.0** (a hollow-shell inertia). This is the structural cause: the root has effectively zero inertia to resist the leg/trunk reaction torques, so the PD servos (kp 900–1000) communicate every contact impulse straight into the capsule with nothing to "hold" it.

**Why a bow topples it:** the diagnostic `diagnostic_poses_v2.js` `sendPose('Spine: Forward Lean', {spine: 14°, spine1: 14°, spine2: 10°})` — 38° of trunk pitch — moves the CoM (1.06 m) forward ~0.35 m while the feet only extend ~0.13 m forward of the ankle. CoM falls outside the support polygon → tip-over. A human counters with hip/ankle strategy (plantar-flex the stance ankle, extend hips, step). The model has **no ankle strategy** because ankle kp=600 but the foot is a tiny 0.13 m box and the *ankle roll axis is a hinge with only ±0.785 rad* — and **no stepping strategy** because the gait pipeline teleports the root (`setTranslation`) instead of using leg stance forces.

### 2.2 Assessment of what the user ruled out

- **IK**: Rejected, justified. IK is kinematic foot placement; it does not generate the ground-reaction forces needed to *hold* a 75 kg trunk upright under gravity. It also costs per-agent math every frame.
- **RL**: Rejected, justified for this project. RL needs a reward model, episodes, and a policy network — either expensive inference or a large client-side bundle; it is fragile at 500 Hz in WASM; and it duplicates the very GPU/CPU cost the project is trying to eliminate.

The user's instinct — **"create a simulated natural balancing system like the one in the human body"** — is the correct architecture. Below are the options, benefits, caveats, and consequences for each, ranked by cost/benefit for a browser-only VLM-agent sim.

### 2.3 Option A — Fix the root-capsule physics (MUST-DO, prerequisite for everything)

**What:** Give the root capsule real mass + inertia (≥ 55 kg, realistic diaginertia 2.5/1.2/2.5 for a 1.8 m, 0.2-radius capsule), enable contact fallback if needed, and re-tune PD gains so the trunk hangs *through* the root rather than *off* an inertialess point. Also give the feet proper foot geometry with a friction mat and toe contact.

**Benefits:** Removes the single largest structural cause of the topple (0.001 kg root = zero rotational resistance). The capsule becomes the body's "pelvis mass," so reaction torques from spine/hip PD are absorbed instead of free-rotating the root. Achievable in `MJCFHumanoidTemplate.ts` `generateAgentSubtreeMJCF()` (root `<inertial>` block) — a few-line change.

**Caveats:** The 0.001 kg mass may be deliberate to prevent the root capsule from commanding contacts (its `contype="0"`). Increasing mass without adjusting `applyCapsuleBalance` torque gains means balance torque now acts on a heavy body and must be re-tuned (KP up proportionally, e.g. 100→800, and move the call to per-physics-step, not per-render-frame — see §2.4).

**Consequence if skipped:** Every other option below is fighting gravity with an inertialess root — physically unsound and architecturally fragile.

### 2.4 Option B — Vestibular "inner-ear" balance reflex (the natural system the user asked for)

**What:** A closed-loop, purely mechanical balance controller running at 500 Hz (per physics step, not per render frame) that acts like the human vestibular-otolith + muscle reflex:

1. Read the capsule's world quaternion and compute upright error `θ` (already exists in `applyCapsuleBalance`).
2. Compute the **projected CoM** from `xpos` of every body (there is already a CoM computation in `useWorld.ts` diagnostics) and keep it inside the support polygon (between the feet's ground contacts) — the *stability margin*.
3. Apply **hip-strategy correction**: when CoM pitches forward, command ankle plantar-flexion + hip extension on the stance leg proportional to `θ` and `dθ/dt` (i.e., control the *joint targets* of the stance ankle/hip, not just a root torque).
4. Apply **step-strategy fallback**: if |CoM offset| exceeds a threshold (e.g., 0.18 m beyond the ankle), trigger a single step command (one stance leg swings forward ~0.3 m) — this is what humans actually do in a bow.
5. Keep the existing `xfrc` root torque as a *secondary* damping term, not the primary mechanism.

Implementation surface: `MotorController` (joint-level correction targets) + `HumanoidPhysicsBinder.updateMotorTargets()` (run per `onStep` in `WorldEngine.start`, which already has the 500 Hz `onStep` hook), plus foot-contact state from `PhysicsEngine.getContactForceRegistry()` for stance detection.

**Benefits:** Exactly the requested "human inner-ear" behavior — no AI inference, no RL, ~1–2 kB of math, per-agent, deterministic, cheap at 500 Hz (a few quaternion rotations + a dot product + a P-controller per step). Handles jumps (support-polygon CoM tracking with airborne phase = zero stance → no correction), walks (hip strategy during single support, ankle strategy during double support), runs (step strategy + airborne), and the bow (step strategy catches the CoM).

**Caveats:** Needs the foot contact solver to actually report stance (the registry works but `ncon` is capped at 200 and `drainContactForceEventsInternal` silently returns if `ncon > 200` — verify under multi-agent). Needs per-step (500 Hz) invocation because 60 Hz sampling of a 500 Hz plant causes aliasing (documented in `gyroscope-analysis.md` §2.1). Requires tuning the three gains (ankle Kp, hip Kp, step threshold) against the diagnostic ring.

**Consequence:** This is the *natural* system. It is the cheapest correct answer to "walk, run, jump, bow without falling" and directly serves the VLM goal (agents act; the body balances itself).

### 2.5 Option C — Move `applyCapsuleBalance` to per-physics-step and wire the dead `gaitActive` switch (1-hour first experiment)

**What:** (1) In `useWorld.ts`'s `synthia:action` handler, call `binder.setGaitActive(!!activeGaitPhase)` when a sequence is applied; (2) call `applyCapsuleBalance` from the 500 Hz `onStep` callback in `WorldEngine.start` instead of the 60 Hz render loop; (3) optionally implement the *continuous* commanded-deviation scaling from `gyroscope-analysis.md` (balance = full at zero commanded joint motion, monotonic back-off as the AI's commanded motion grows — using `currentTargets`, not measured tilt, so intentional lean vs. stumble remain distinguishable).

**Benefits:** ~3–10 lines of change, tests the whole hypothesis (the 0.15 backing-off switch is already implemented), and fixes the aliasing at 60 Hz. Measurable with `diagnose_fall_quick()` which already captures `xfrc` torque, tilt, CoM, foot heights.

**Caveats:** This alone does NOT prevent the bow topple (CoM outside support polygon; a root torque on a massless root cannot save it) and does NOT create walking — it only stops the balance loop from actively fighting locomotion. It is a *prerequisite stepping stone*, not the solution.

**Consequence:** Do this first to get a stable baseline before any more invasive work.

### 2.6 Option D — Proper locomotion: root velocity, not root teleportation

**What:** Replace the `synthia:rootMotion` `setTranslation` teleport with a **root velocity** applied through the free joint (`qvel[dofAdr+0..2] += Δp/Δt`), or better: compute root displacement from the *legs'* stance forces as humans actually do. Concretely: (1) remove `capsuleBody.setTranslation` from the `synthia:rootMotion` handler; (2) instead add `Δp/Δt` to `qvel` so the contact solver and PD servos can generate reactive forces; (3) match the authored gait's root motion to the leg step length (project_info__100 §5.4: reduce `dz` from −1.77 m/cycle to ≈ −0.5 m/cycle, or increase hip amplitude to ±0.55 rad). This kills the foot-shear/bowed-knee artifact and gives the balance system real forces to work with.

**Benefits:** Eliminates the single biggest physics-violating behavior in the pipeline; makes walking physically consistent; makes running/jumping (which need real impulses, not teleports) even possible at all.

**Caveats:** For jump/run, `executeJump()` currently zeroes *all six* qvel DOFs then adds a vertical impulse — that wipes horizontal momentum. It needs to preserve horizontal velocity. Also root-velocity approaches can let the body "skate" without leg motion if the balance controller isn't rejecting forward slip — hence A+B are prerequisites.

**Consequence:** No teleport = no foot-drag = no sideways knee shear = the articulated leg motion actually reads as walking.

### 2.7 Option E — Contact-tuned stance controller (the "feet as feet" option)

**What:** Give each foot a proper sole with high friction and a **stance-phase controller**: when the foot's contact registry says "in contact and impulse > threshold," the ankle/hip targets are computed to hold the CoM over that foot (stance ankle = small dorsiflexion hold; swing ankle = dorsiflexion to clear the ground). Combine with Option B's step-strategy. This is what makes a bow recoverable (the step leg moves to catch the CoM) and what makes running possible (the airborne phase = no stance → no ankle hold, so the body can pitch freely and land with flexed knees).

**Benefits:** Natural, deterministic, no AI. The foot is the only body part that ever touches the ground; modeling the stance phase explicitly is the only physically-sound way to keep 75 kg upright on two 0.13 m boxes.

**Caveats:** Requires the contact registry to be reliable under multi-agent composition (verified by `multiAgentComposition.test.ts` but `ncon>200` early-return is a risk with 4+ agents). Requires tuning foot friction (currently `friction="3.0 0.5 0.1"` on foot, `2.0 0.5 0.1` floor default).

**Consequence:** This is the difference between "standing with balance torque" and "standing on feet." It is the correct long-term target alongside B.

### 2.8 Option F — Mass re-balancing (helpful but not sufficient)

**What:** The `COMPLETE_MIXAMO_PHYSICS_MATRIX` gives hips 12 kg, thighs 8.5 kg × 2, spine 6+5+4, head 4.3, arms 2.2×2, forearms 1.4×2 — a reasonable ~75 kg total **with the caveat that the root is 0.001**. Re-balance trunk/legs so thigh mass is closer to real proportions (thigh ~9.5 kg) and ankle/foot slightly heavier (1.2 kg) to give the ankle servos more authority. The `body_mass` values are baked into the MJCF `<inertial>` and read by the CoM computation.

**Benefits:** Better CoM placement (currently `comZ=1.06` at rest with feet at 0.087 → CoM ≈ 0.97 m above ground, fine, but during lean the heavy trunk (27 kg) dominates and the tiny feet can't resist). More realistic ankle authority.

**Caveats:** Re-tuning PD gains after any mass change; iterative.

**Consequence:** Improves all other options; alone it does not fix the 0.001 kg root contradiction (see A).

### 2.9 Decision matrix (all costed for client-side, VLM-friendly)

| Option | Cost | Prevents falls? | Enables walk/run/jump? | Fragile? | Verdict |
|---|---|---|---|---|---|
| **C** — wire gaitActive + per-step balance sampling | ~3–10 LOC | Partially (stops fighting motion) | Baseline only | No | **Do now** |
| **A** — real root mass/inertia | ~5 LOC + gain retune | Structurally necessary | Enables all | No | **Must-do prerequisite** |
| **B** — vestibular/step-strategy reflex | ~200–400 LOC | **Yes (handles bow)** | **Yes (all three)** | Low (pure P-control on joints) | **Primary recommendation** |
| **D** — root velocity locomotion | ~20 LOC + gait re-author | Indirect (removes shear) | **Yes** | No | **Do with B** |
| **E** — stance-phase foot controller | ~150–300 LOC | **Yes** | **Yes** | Medium (contact reliability) | **Long-term pairing with B** |
| **F** — mass re-balance | ~40 constant edits | Indirect | Helps | No | **Do after A** |
| IK | — (ruled out) | — | — | — | Rejected (correctly) |
| RL | — (ruled out) | — | — | — | Rejected (correctly) |

**Bottom line:** There is no "none." The cheapest correct path is **C → A → B(+D) → E → F**, in that order. B is the natural human-like system the user asked for and it *does* exist as a buildable option — it is neither IK nor RL and costs no inference.

---

## 3. Step-by-step small-motion primitives (finger → hip/spine)

The user's insight is correct: humans move one joint at a time, and a physics world needs *governed micro-movements*, not full-script replays. The codebase already proves per-joint control works (the probe test commands one joint at a time and reads world deltas). Below are **parameter tables** (radians, following the Synthia convention `[x=pitch, y=yaw, z=roll]`, scalar for 1-DOF) for safe, incremental primitives. These are designed to be dispatched as `window.dispatchEvent(new CustomEvent('synthia:action', { detail: { jointOverrides } }))` or composed into `sequence` timelines.

**Critical convention reminders** (from `joint_configuration_dossier.json` — do NOT trust guessed signs for arm/forearm/hand/foot until probed):
- `upleg pitch+` → knee tip moves **world −Z (FORWARD)** — verified.
- `upleg roll+` → dX −0.0156 (adducts); `roll−` → dX +0.024 (abducts) — verified.
- `leg pitch+` → ankle **up/back (flexion)** — verified; `pitch−` is hard-clamped to 0.
- `shoulder pitch+` → arm toward −Z (forward) — verified.
- `arm`, `forearm`, `hand`, `foot` = **UNVERIFIED** — probe first before authoring significant motion.

### 3.1 Finger primitives (3 segments × 5 digits × 2 sides — all 1-DOF pitch, range [0, 1.745])

| Bone | Motion | Value (rad) |
|---|---|---|
| `mixamorig{side}handthumb{1,2,3}` | progressive curl | 0.25 / 0.45 / 0.30 |
| `mixamorig{side}handindex{1,2,3}` | index curl | 0.30 / 0.50 / 0.35 |
| `mixamorig{side}handmiddle{1,2,3}` | middle curl | 0.30 / 0.50 / 0.35 |
| `mixamorig{side}handring{1,2,3}` | ring curl | 0.30 / 0.45 / 0.30 |
| `mixamorig{side}handpinky{1,2,3}` | pinky curl | 0.25 / 0.40 / 0.25 |
| `mixamorig{side}hand` | wrist pitch/roll — 2-DOF: `[±0.35, 0, ±0.20]` | wrist flex/ext + dev |

**Sequence pattern (wiggle):** `t=0 all 0 → t=200 thumb 0.6 → t=380 thumb 0, index 0.6 → t=560 index 0, middle 0.6 → ...` exactly as `diagnostic_poses_v2.js` does, but with verified values.

### 3.2 Spine / trunk primitives (3-DOF `[x=pitch, y=yaw, z=roll]`, all ±0.524, spine x up to +0.785)

| Bone | Forward lean | Backward | Lateral | Twist |
|---|---|---|---|---|
| `mixamorigspine` | `[0.14, 0, 0]` | `[-0.10, 0, 0]` | `[0, 0, ±0.15]` | `[0, ±0.20, 0]` |
| `mixamorigspine1` | `[0.10, 0, 0]` | `[-0.08, 0, 0]` | `[0, 0, ±0.10]` | `[0, ±0.15, 0]` |
| `mixamorigspine2` | `[0.08, 0, 0]` | `[-0.06, 0, 0]` | `[0, 0, ±0.08]` | `[0, ±0.12, 0]` |
| `mixamorigneck` | `[±0.30, 0, 0]` | — | `[0, 0, ±0.25]` | `[0, ±0.35, 0]` (yaw range ±1.222) |
| `mixamorighead` | `[±0.30, 0, 0]` | — | `[0, 0, ±0.25]` | `[0, ±0.35, 0]` |

**Cervical coupling note:** `validateAndApplyTimeline` auto-injects `neck z += −0.15 · neckY` — deliberate neck counter-tilt. Don't fight it.

### 3.3 Shoulder / arm / elbow primitives (NOT YET PROBED — expect sign uncertainty)

| Bone | Intended motion | Value |
|---|---|---|
| `mixamorig{side}shoulder` | shrug/scapular | `[±0.15, 0, ±0.10]` |
| `mixamorig{side}arm` | raise-to-side (pitch) | `[−0.5…−1.3, 0, 0]` or `[0.5…1.3, 0, 0]` depending on probe |
| `mixamorig{side}forearm` | elbow flex (scalar, [0, 2.531]) | 0.3 (light), 0.9 (90°), 1.6 (bent deep) |
| `mixamorig{side}hand` | wrist — 2-DOF | `[±0.35, 0, ±0.20]` |

**Forearm bug warning:** when the upper arm is down-by-side (arm x ≈ 1.25), forearm rotation is around a near-vertical axis → appears as *axial twist / arms at back*, not elbow bend (project_info__100 §1.1). With the arms at side, keep forearm ≤ 0.2 rad; put swing into the shoulder channel instead.

### 3.4 Hip / knee / ankle / toe primitives (bottom half — verified signs)

| Bone | Motion | Value (rad) |
|---|---|---|
| `mixamorig{side}upleg` | hip flex (pitch+) → knee forward | `[+0.35, 0, 0]` |
| | hip extend (pitch−) | `[−0.25, 0, 0]` |
| | hip abduct (roll−) / adduct (roll+) | `[0, 0, ∓0.25]` |
| | hip twist | `[0, ±0.20, 0]` |
| `mixamorig{side}leg` | knee flex (scalar, [0, 2.618]) | 0.35 light / 0.9 mid / 1.6 deep |
| | *knee can never go negative* (hinge [0, 2.618]) | |
| `mixamorig{side}foot` | ankle — 2-DOF `[x=pitch, z=roll]` | dorsiflex `[+0.30, 0, 0]` (toes up), plantarflex `[−0.30, 0, 0]` (toes down), roll `[0, 0, ±0.20]` |
| `mixamorig{side}toebase` | **INERT — no actuator. Do not author.** | — |

**Walk-cycle micro-sequence** (start here — matches the user's "right leg bends up and stretches forward, left catches up, body balances, repeat" mental model):
```
t=0ms:   leftupleg [0,0,0] leftleg 0.05 leftfoot [0,0,0] rightupleg [0,0,0] rightleg 0.05 rightfoot [0,0,0]
t=250ms: leftupleg [+0.30,0,0] leftleg 0.30 leftfoot [-0.10,0,0]   (left swing, right stance)
t=500ms: leftupleg [0,0,0] leftleg 0.05 leftfoot [0,0,0] rightupleg [+0.30,0,0] rightleg 0.30 rightfoot [-0.10,0,0]
t=750ms: leftupleg [-0.20,0,0] leftleg 0.15 leftfoot [0,0,0] rightupleg [0,0,0] rightleg 0.05 rightfoot [0,0,0]  (left stance push-off)
t=1000ms: back to t=0 frame.
```
Hook `activeGaitPhase: true` so locomotionCap is applied and (once Option C lands) `setGaitActive(true)` backs off the balance torque during the stride.

**Jump primitive:** `programSequence: ['jump']` calls `executeJump(6.0)` — vertical impulse `6.0/70 = 0.086 m/s` on `qvel[dofAdr+2]`. This is tiny (≈0.4 mm rise); to actually jump, the impulse must be ~15–25 (0.21–0.36 m/s → 0.2–0.65 m rise) AND horizontal qvel must be preserved (§2.6 caveat).

---

## 4. Architecture map (files that matter)

```
src/world/engine/
├── PhysicsEngine.ts           — 500 Hz MuJoCo WASM loop, contact registry, quat conversion (worldToMuJoCo p=(x,−z,y))
├── WorldEngine.ts             — 500 Hz fixed-step + 60 Hz render loop; onStep/onFrame hooks (onStep is where per-step balance must go)
├── MJCFHumanoidTemplate.ts    — generates entire MJCF: root capsule (mass 0.001!), 49 actuators, body tree, feet boxes, slots, piano
├── HumanoidPhysicsBinder.ts   — the orchestrator: bind-pose extraction, timeline stepper, motor targets, GRF injector, jump, reset
├── MotorController.ts         — per-agent PD actuator maps, 20-step ctrl ramp, applyCapsuleBalance (60 N·m cap, gaitActive dead switch)
├── BodyManager.ts             — maps bone names→MuJoCo body/geom/actuator IDs; remap on world rebuild
├── AvatarSynchronizer.ts      — copies MuJoCo world quats back to Three.js bones (slerp-smoothing)
├── ObservationBuilder.ts      — builds VLM proprioception vector (root height, projected gravity, local ang/lin vel, joint angles)
├── StateRehydrator.ts         — captures/restores agents+ctrl across world reloads (multi-agent spawn)
├── CameraManager.ts           — head-camera AI perception (448×448, FOV 110, configurable per implementation_plan item 14)
└── __tests__/jointConfigurationProbe.test.ts — the runtime probe: per-joint world-delta verification (extend to forearm/hand/foot!)

src/world/hooks/useWorld.ts    — main wiring: spawnAgent, per-frame updateMotorTargets+syncVisuals, synthia:action/rootMotion/resetPose handlers, fall-diagnostic ring (window.diagnose_fall_quick)
src/world/agent/AgentLoop.ts   — 2s-cycle VLM loop: capture → infer → parse → dispatch synthia:action
src/constants/rigConstraints.ts        — L1/L2 joint ranges (knee [0,2.618], shoulder ±0.7)
src/constants/anatomicalLimits.ts      — L3 anatomical clamps
src/constants/physics.ts               — COMPLETE_MIXAMO_PHYSICS_MATRIX (~75 kg totals)
src/utils/mixamoStreamConverter.ts     — Mixamo SJSON → Synthia timeline (16+ sign/heuristic assumptions)
src/utils/playMixamoWalk.ts            — interval-driven walk loop (sequence + rootMotion teleport)
scripts/authorSynthiaGait.mjs          — deterministic authored walk generator (currently live artifact source)
scripts/walkAnalyzer.js                — browser-analyzer (STALE LIMITS table)
diagnostic_poses_v2.js                 — console pose library (STALE knee signs)
docs/joint_configuration_dossier.json  — verified/unverified channel signs, contradictions
gyroscope-analysis.md                  — full balance-audit of applyCapsuleBalance (dead switch, 60 Hz aliasing)
```

---

## 5. Suggested reading order for a developer

1. `docs/joint_configuration_dossier.json` — the sign/verification ground truth (what's PREDICTED vs VERIFIED).
2. `gyroscope-analysis.md` — the balance audit; explains the dead `GAIT_BALANCE_SCALE`, 60 Hz-vs-500 Hz problem, and why measured-tilt scaling is wrong (use commanded deviation).
3. `project_info__100.md` — the previous walk diagnosis (foot shear, forearm bug, 3.5× root-motion mismatch, stale tools).
4. `src/world/engine/MJCFHumanoidTemplate.ts` — the root capsule `mass="0.001"` structural flaw and where to fix it (Option A).
5. `src/world/engine/HumanoidPhysicsBinder.ts` + `MotorController.ts` — where balance runs today and where it should run (Option B/C).
6. `src/utils/mixamoStreamConverter.ts` + `scripts/authorSynthiaGait.mjs` — the two artifact sources and their tenuous sign assumptions.

---

*Full report saved to `project_info__101.md` in the project root.*
