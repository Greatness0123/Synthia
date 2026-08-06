# Synthia 1.5.1 — Euler → Quaternion Migration: Feasibility & Impact Evaluation

## Summary

Synthia is a browser-based MuJoCo-physics humanoid simulator where LLM-driven agents (SYNTHIA agents) control a Mixamo `x-bot.glb` skeleton. Your plan — "migrate model control from Eulers to quaternions" — is **mostly already true at the physics layer**, and `walking2.md` is **already quaternion-native end-to-end except for one internal adapter hop**. The real work is not "converting to quaternions"; it's deciding whether to remove the last Euler stage (the per-bone ZXY hinge decomposition), which carries a narrow but real gimbal-lock risk at joint pitch ≈ ±90°, and an interpolation artifact risk when mixing Euler triples between timeline keyframes.

Direct answers to your four questions:

1. **Is the conversion possible?** Yes — and ~80% of the pipeline already runs on quaternions. The remaining Euler surfaces are 6 well-isolated files.
2. **Will it break current stability?** Only if you go all the way to MuJoCo ball joints. The "keep hinges, slerp quats" path is low-risk; the "native ball-joint" path is high-risk and would invalidate months of hard-won stability fixes.
3. **How long?** Light path 1–2 days. Internal-quaternion path 3–5 days. Native ball-joint path 2–3 weeks.
4. **Will `walking2.md` run properly?** **Yes, it already does.** `walking2.md` is in the exact same line-SJSON quaternion format as the `walking` file the project already ships and tests (same 52 rot nodes, same 211 floats/frame, same 30 fps, seamless loop where frame 31 == frame 0). Running it is a one-line change to `scripts/generateMixamoWalkArtifacts.ts` — no quaternion migration required.

---

## Architecture: where quaternions really live

Here is the actual data flow, with the *true* orientation representation at each hop:

| # | Stage | File | Orientation form |
|---|-------|------|------------------|
| 1 | Source animation | `walking2.md` / `walking` | **Quaternions** `[w,x,y,z]` per bone (4 floats per `rot` channel) |
| 2 | Parse | `src/utils/mixamoStreamConverter.ts` `quatFromData()` | **Quaternions** → THREE.Quaternion |
| 3 | Convert | `mixamoStreamConverter.ts` `toZxyEuler()` | **← THE EULER HOP →** quat → MuJoCo frame → ZXY Euler `{yaw, pitch, roll}` |
| 4 | Validate/clamp | `HumanoidPhysicsBinder.validateAndApplyTimeline()` | Euler triples (per-axis clamp vs `rigConstraints`) |
| 5 | Store targets | `HumanoidPhysicsBinder.setMotorTargets()` | Euler triples; **supports `isQuaternion` parse but ignores `w`** |
| 6 | Actuate | `MotorController.setTargets()` | per-axis scalars → MuJoCo `data.ctrl[]` for 1/2/3 hinge actuators |
| 7 | Physics integrate | MuJoCo (WASM) | **Quaternions natively** — free joint stores `[qw,qx,qy,qz]`; integrator is quaternion-based |
| 8 | Read back | `BodyProxy.rotation()` / `xquat` | **Quaternions** |
| 9 | Visual sync | `AvatarSynchronizer.synchronize()` | **Quaternions with slerp smoothing** (already quat-native) |

Key insight: **MuJoCo never uses Euler angles for anything.** The root capsule is a 7-DOF free joint (position + quaternion). There is no physical gimbal lock in this system. The chain is quat → Euler → hinge-angle scalars → MuJoCo re-composes them as three sequential hinge joints (yaw about `0 0 1`, pitch about `1 0 0`, roll about `0 1 0` — an intrinsic ZXY composition).

## The real Euler problems (what you're actually fighting)

1. **ZXY extraction** (`toZxyEuler`, `BodyManager.syncRigidBodiesFromBones`): every clip must be re-validated against the converter's hand-derived conventions — elbows `|pitch|` (positive-flexion), knees negative-only, head/neck yaw↔roll swap, hands 2-DOF drop of yaw. These were tuned for *this one* walking clip. A bank of new clips means re-deriving per-bone sign/axis rules each time. **This is the friction you're describing.**
2. **Per-axis linear interpolation** (`HumanoidPhysicsBinder.syncVisuals` timeline stepper): between timeline keyframes it lerps `[pitch,yaw,roll]` component-wise. For large rotations (arm overhead, spins), component-wise Euler lerp traverses wild intermediate orientations — the classic "gimbal-lock artifact." *This is fixable today with slerp, without touching the motor contract.*
3. **The decomposition singularity**: three ZXY hinges are mathematically identical to an Euler triple, so when any joint's pitch reaches ±90° (a raised arm pointing straight out — shoulder range is ±135°!), yaw and roll become degenerate and the extracted triple can flip/discontinuity. For the walking clip this never triggers. For an expressive "bank of motion" it could.
4. **Two landmines** for anyone feeding quats today:
   - `validateAndApplyTimeline` rejects `rawVal.length === 4` as `invalid_payload` — quaternion arrays cannot pass validation.
   - `MotorController.setTargets` parses length-4 as `{isQuaternion: true}` but then **ignores `w`** and writes `x/y/z` straight into the yaw/pitch/roll ctrl slots — silently wrong if any code path ever passes a quat.

## What a real quaternion migration touches

If you keep the hinge-decomposed MJCF (recommended), the migration is "store + interpolate quats, convert to per-hinge angles only at the last hop":

| File | Change |
|------|--------|
| `src/types/joint.ts` | Extend `overrides` value type with `[n,n,n,n]` (quat) |
| `src/utils/mixamoStreamConverter.ts` | Emit per-bone quats instead of ZXY triples (drop elbow/knee/head-neck hacks); keep root-motion + loop-seam logic |
| `src/utils/mixamoStreamConverter.test.ts` | Rewrite invariants: quat norm ≈ 1, canonical w≥0, determinism, loop seam; drop degree-range assertions |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline`: quat→Euler→clamp→quat pass (preserves the safety clamps); `syncVisuals` interpolator: **slerp** quats; `setMotorTargets` already parses length-4 |
| `src/world/engine/MotorController.ts` | In `setTargets`, add a `isQuaternion` branch that converts quat → per-hinge angles (this stays Euler for the physics joint) |
| `src/world/agent/AgentLoop.ts` | `normalizeRaw`: don't degree-convert quats; validate unit norm |
| `src/world/agent/InferenceClient.ts` | **Recommendation: keep the LLM contract in degrees.** LLMs are dramatically better at emitting "45 degrees pitch" than unit quaternions; switching would degrade "at top speed" motor control |
| `src/world/engine/ObservationBuilder.ts` | Proprioception currently reports `Euler.x` only per joint (loses yaw/roll). A quat-based bank should expose relative quats per joint so the model can "study" motion |
| `src/world/agent/payloadBuilder.ts` | Perception summary reads head quat Y-component for yaw — should use full quat→yaw |

## Will it break current stability?

**Stability-critical code that encodes per-axis Euler assumptions** (this is your risk surface):

- `resetToBindPose()` — zeros hinge qpos per `_yaw/_pitch/_roll`; has a dedicated hip-roll safety net ("a lingering non-zero roll manifests as a leg drifting backward right after spawn")
- `MotorController.setTargets` — actuator-count-based axis mapping (1/2/3) with explicit x=pitch/y=yaw/z=roll LLM convention
- `generateAgentSubtreeMJCF` (`MJCFHumanoidTemplate.ts`) — per-bone PD gain table (knee kp=1000, ankle kp=600, head kp=80 to prevent bobblehead), per-axis `range` limits, foot flat-ground quaternion baking
- `validateAndApplyTimeline` — per-axis clamping + all the behavioral injections: `scapulohumeralRatio`, `requiresCervicalCoupling`, `tendonSynergyLink`, `locomotionCap`
- `applyCapsuleBalance` — quaternion tilt error → torque (already quat-based, fine)
- Multi-agent spawn flow in `useWorld.ts` — ctrl-ramp continuation, `targetSpawnGrounded` re-arm rules, StateRehydrator

**Risk by option:**

- **Option A (slerp quats in timeline only, keep everything else):** low risk. ~200 lines. Fixes the interpolation artifacts without touching physics or the LLM contract.
- **Option B (quats through artifact + targets, hinge physics retained):** medium risk. The clamps survive because you re-extract before `MotorController`. The danger is subtle regressions in the per-bone conventions (elbow/knee/head-neck) — you must port them into the quat→angle adapter and re-run `npx jest` on `mixamoStreamConverter.test.ts`.
- **Option C (MuJoCo ball joints + position actuators on ball joints):** high risk. You lose per-axis `range` limits (they done the job of preventing chest-clipping, tendon synergy, etc.), must retune all PD gains for ball-joint servos, rewrite `resetToBindPose`, `resetPose` stiffness boost, `applyCapsuleBalance` interplay, and re-validate multi-agent spawn. This is a 2–3 week project with real regression risk to the stability you already have.

## Effort estimates

- **Option A — Slerp interpolation fix:** 1–2 days (incl. regenerating the artifact and re-running tests).
- **Option B — Quaternion-native motion bank (recommended if you proceed):** 3–5 days for a dev who knows this codebase; includes converter rewrite, type changes, clamp pass, AgentLoop normalize, jest updates, and regression-testing the walk + a second clip.
- **Option C — Native ball joints:** 2–3 weeks; only justified if you actually hit the shoulder-vertical singularity, which the walking clip never does.

## Will walking2.md run "properly" today? Yes — here's the exact trace

1. `walking2.md` parses via `parseMixamoStream` (line-SJSON; `"header"` + 32 `"frame"` rows; 30 fps; 52 rot nodes; 211 floats/frame — identical shape to the shipped `walking` fixture).
2. Converter emits 32 frames + 1 loop clone; root motion ≈ 177 cm/cycle → ~1.66 m/s (the test suite asserts 1.5–2.0 m).
3. `synthia:action` → `validateAndApplyTimeline(sequence, { activeGaitPhase: true })` → `setMotorTargets` → `MotorController` drives hips/knees/ankles/spine/arms.
4. `synthia:rootMotion` teleports the capsule ~5.5 cm per 33 ms tick via `BodyProxy.setTranslation` (kinematic — this fights the GRF injector slightly and zeroes root velocity every tick; existing behavior, produces the walk).
5. Gait balance softens to 15% scale (`GAIT_BALANCE_SCALE = 0.15`) while walking.

**Exact caveats when running walking2.md today:**
- **Hips rotation is deliberately dropped** ("root handled via rootMotion"). walking2.md's Hips quat is near-identity per frame (tens of mill radians), so no visible loss.
- **Toes are silently zeroed**: `mixamoriglefttoebase/righttoebase` have real ~40° rotations in the clip, but `getAnatomicalLimitForBone` clamps them to `[0, 100°]` → toe lift ~1.3° clamps to 0. No actuators exist for them anyway.
- **Fingers barely move** (micro-radian noise) — no visual difference.
- **Elbow** positive-flexion `|pitch|` and **knee** negative-flexion are applied by the converter — these were tuned for this skeleton and work with this clip.
- **Head/neck axis swap** is consistent between converter and MJCF — head rotation plays back correctly.
- The result is a **convincingly proper walk** referenced by the existing tests, with per-bone limits and servo gains faithfully followed. The motion bank you add later is where the quaternion work pays off — new clips would otherwise need the same hand-tuning of elbow/knee/head-neck conventions that this clip already has baked in.

## Recommended path if you proceed

1. **Do Option A now** (slerp timeline interpolation) — removes the per-frame Euler interpolation artifacts that are the likeliest source of "Euler problems" you'd see in arbitrary new clips. Small, low-risk, testable.
2. **Target Option B** for the motion bank: store clips as per-bone quats in the artifact JSON, slerp in the timeline stepper, convert to per-hinge angles at `MotorController` — keep the LLM contract in degrees.
3. **Skip Option C** unless you hit a genuine ±90°-pitch singularity in a clip you care about.
4. **To run walking2.md today:** point `scripts/generateMixamoWalkArtifacts.ts` at `walking2.md` (or replace `walking`), regenerate `public/animations/mixamo-walking-synthia.json`, and play it via `loadWalkArtifact` / `startWalk` from `src/utils/playMixamoWalk.ts`.

## Module reference

| File | Purpose |
|------|---------|
| `src/utils/mixamoStreamConverter.ts` | The only real "quat→Euler" conversion; per-bone axis conventions (elbow/knee/head-neck) live here |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Validate/clamp timelines, `setMotorTargets` parsing, per-axis timeline lerp, reset/pose logic |
| `src/world/engine/MotorController.ts` | Writes per-axis targets into MuJoCo `ctrl`; balance torque via quaternion tilt error |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Generates hinge-decomposed MJCF + PD gains + per-axis ranges |
| `src/world/engine/BodyManager.ts` | Bone↔MuJoCo ID mapping; `syncRigidBodiesFromBones` (also ZXY) |
| `src/world/engine/PhysicsEngine.ts` | MuJoCo WASM wrapper; coordinate/quat frame conversions (`threeQuatToMuJoCo`) |
| `src/utils/playMixamoWalk.ts` | Walk playback loop + root-motion dispatch |
| `src/world/agent/AgentLoop.ts` | `normalizeRaw` degree→radian normalization; dispatch `synthia:action` |
| `src/world/agent/InferenceClient.ts` | LLM prompt — currently *forbids* quaternions and requires degrees |
| `src/utils/mixamoStreamConverter.test.ts` | Golden tests tying converter output to rig constraints |
| `src/constants/rigConstraints.ts` | Per-axis joint ranges + behavioral allowances (the clamp source of truth) |

## Suggested reading order

1. `src/utils/mixamoStreamConverter.ts` — where the "Euler problem" actually starts
2. `src/world/engine/MotorController.ts` — what targets the motors actually consume
3. `src/world/engine/HumanoidPhysicsBinder.ts` — validation, clamping, timeline interpolation, reset logic
4. `src/world/engine/MJCFHumanoidTemplate.ts` — the hinge decomposition + gains that stability depends on
5. `src/world/agent/AgentLoop.ts` + `src/world/agent/InferenceClient.ts` — the LLM-facing degree contract
6. `src/utils/mixamoStreamConverter.test.ts` — the invariants any migration must preserve
