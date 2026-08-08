# Verdict: Will the "Fix Walk Collapse & Rotation Pipeline" Plan Fix It?

## Direct Answer

**Yes — Phase 0 fixes the actual collapse. The plan is correctly root-caused, correctly ordered, and the one genuinely surprising risk (full-strength balance during gait) is covered by existing evidence the plan should explicitly wire in.**

I verified the collapse mechanism against the current artifact (`public/animations/mixamo-walking-synthia.json`) and the raw stream quats in `walking2.md`. The gimbal-alias diagnosis in project_info__90.md is not just plausible — it is **provably correct**, and the rail-pinning is far more pervasive than the two cited examples (Spine, RightUpLeg) suggest. Details below.

---

## 1. Evidence the plan's diagnosis is correct (verified from the files)

### 1a. The extraction is mathematically self-inconsistent — it cannot be legitimate

For any correct Euler extraction, an Euler component cannot exceed the rotation's total angle in the way observed:

| Joint | Source quat (frame 0) | True rotation | Artifact emits | Contradiction |
|---|---|---|---|---|
| mixamorig:Spine | `[0.00169, 0.00291, 0.00392, 0.99999]` | ≈ **0.5°** | `z = -0.524` (**30°**, clamp rail) | A 0.5° rotation cannot contain a 30° Euler component |
| mixamorig:RightUpLeg | `[-0.236, 0.0619, 0.0471, 0.9686]` | ≈ **28.8°** | `z = +2.094` (**120°**, clamp rail) | A 28.8° rotation cannot contain a 120° Euler component |

A quaternion with total rotation θ decomposes into Euler components whose composed rotation is ≤ θ. A 120° roll component would produce a quat with rotation angle ≥ ~104°, not 28.8°. **No correct extraction can output these values from those quats.** The bug is real, regardless of which specific remedy (different extraction order, bind-subtraction, or bind-local sandwich) the implementer lands on — the current pipeline is broken.

### 1b. The rail-pinning is continuous and pervasive — not just two bones

Scanning the entire artifact, the following joints are pinned **exactly on a SYNTHIA_RIG_CONSTRAINTS rail in nearly every one of the 33 frames**:

- `mixamorigspine`, `mixamorigspine1`, `mixamorigspine2`: z = **±0.524** in **all 33 frames**, sign-flipping 4+ times across the cycle
- `mixamorigleftupleg` / `mixamorigrightupleg`: z = **±2.094** in **all 33 frames**, flip at frames 3, 13, 18
- `mixamorigleftarm` / `mixamorigrightarm`: z = **±1.57** in **all 33 frames**
- `mixamorigleftfoot` / `mixamorigrightfoot`: z = **±0.785** in **all 33 frames**
- `mixamoriglefthand` / `mixamorigrighthand`: z = **±0.349** in **all 33 frames**
- `mixamorigleftshoulder` / `mixamorigrightshoulder`: **±0.261 on 2–3 axes** in most frames
- `mixamorigneck`: y = **±1.222** in **all 33 frames** (70° yaw pinned)
- `mixamorighead`: y = **±1.047** in **all 33 frames** (60° yaw pinned)

Consequence: MuJoCo is being commanded to hold **±120° hip roll and ±30° spine roll for 100% of the gait cycle**, plus continuous sign-flip traversals through zero. A model constantly commanded to splay its thighs horizontally and twist its spine ±30° cannot walk — it will collapse. **The plan's 4b completeness scan (every bone × every frame) is therefore not a formality: the rail bug is systemic, and the fix must be validated against the whole skeleton, not just the two named joints.**

### 1c. The bad values reach physics

`useWorld.handleAction` immediately applies `timeOffsetMs === 0` frames via `setMotorTargets`, and the `syncVisuals` timeline stepper applies all subsequent frames through per-axis lerp. The bogus clamp-rail values flow directly into `currentTargets` → `MotorController.setTargets` → `data.ctrl[]`. Confirmed: the corrupted artifact drives the servos.

### 1d. Probe work is already underway — matches the plan's Phase 0 instruction

`/tmp/mixamo_probe.mjs`, `mixamo_probe2.mjs`, `mixamo_probe3.mjs`, and `glb_inspect.mjs` exist and already scaffold the exact investigation Phase 0 calls for:
- **probe1**: world-chain accumulation (`qParent·qLocal`) then parent-relative ZXY — labeled "should be ~0 everywhere if pipeline is correct"
- **probe2**: adds **bind-pose subtraction** (`qRel = rBind⁻¹ · rAnim`) — labeled "should be small angles near neutral"
- **probe3**: parses raw GLB bind-local quats from the binary and tests two conventions head-to-head: **A** = `R_j = bindLocal · s · bindLocal⁻¹` vs **B** = `s` raw delta (what the converter currently uses)
- **glb_inspect**: GLB node tree + bind rotations

These probes are the right experiment matrix. Whichever convention makes frame-0 spine ≈ 0 and rightupleg ≈ 28.8° (and keeps the whole 4b scan off the rails) is the correction. Do not re-derive this from scratch — the scaffolding exists.

---

## 2. What the plan gets right

1. **Phase 0 ordering**: fix the extraction before anything else. Correct — the artifact is the input to physics; regenerating it with sane values is the actual fix.
2. **Mechanism-agnostic remedy**: "fix the extraction (or the axis convention feeding it)" correctly leaves the implementer free to discover whether the answer is bind-subtraction, bind-local sandwich, or a different Euler order — while the regression tests adjudicate the outcome objectively.
3. **Falsifiable regression tests**: spine frame-0 < 0.1 rad; rightupleg frame-0 in a realistic band, not pinned at ±2.094. These directly encode the impossibility argument above.
4. **Phase 1 is correctly labeled** as "cheap, do regardless" — NOT as the collapse fix. The slerp improvement removes through-zero traversal for real large rotations after the rails are gone; it cannot fix the collapse by itself.
5. **Phase 1's fail-loud quat branch**: verified real — `setMotorTargets` parses length-4 arrays as `isQuaternion: true` and `MotorController.setTargets` then ignores `w` (joint goes limp silently). A loud error is the right minimum fix.
6. **Phase 2 is correctly scoped as optional**, ordered after Phase 0, and keeps the VLM degree contract intact (both prior reports agree this is correct).
7. **walking2.md compatibility claim**: correct per project_info__91 — it is byte-identical to `walking`; pointing the generator at it is a one-line change.

---

## 3. Three things the plan should add or clarify (will materially improve the outcome)

### 3a. Wire the dead `gaitActive` switch — the single highest-value cheap addition

Per `gyroscope-analysis.md`, the balance controller runs at **full strength (KP=100, KD=40, 60 N·m cap, sampled at 60Hz against 500Hz physics) during ALL motion, including walking** — because `setGaitActive(true)` is **never called** at runtime:

- `useWorld.ts`'s `synthia:action` handler passes `activeGaitPhase` only to `validateAndApplyTimeline` (for `locomotionCap` clamping) and **never calls `binder.setGaitActive(activeGaitPhase)`**
- `resetPose()`/`resetToBindPose()` always call `setGaitActive(false)`
- `GAIT_BALANCE_SCALE = 0.15` is dead code at runtime

After Phase 0 removes the absurd commanded poses, the walk will command *sane* poses — and then **full-strength balance will fight normal walking sway** (treating every lunge as an error), recreating instability in a milder form. Wiring `binder.setGaitActive(!!activeGaitPhase)` in `handleAction` is a ~3-line change that the plan omits. Add it to Phase 1.

### 3b. Make 4b's expectation explicit: the rails are everywhere, not just spine/hips

The 4b scan is correct, but set the bar explicitly: verify that **no bone's extracted value lands exactly on any rail in any of the 33 frames** after the fix, not just spine/rightupleg at frame 0. From the artifact I can state that neck/head yaw (±1.222, ±1.047), arms z (±1.57), feet z (±0.785), hands z (±0.349), and shoulders (±0.261 multi-axis) are all affected today. If the fix is a genuine convention correction it will clear all of them automatically — that's the test.

### 3c. Clarify bare `walking2.md` enablement ordering

Step "Enable walking2.md directly" is listed as "do regardless of Phase 0/1/2" — but since `walking2.md` == `walking` (byte-identical), pointing the generator at it *before* Phase 0's extraction fix regenerates the **same corrupted artifact**. The ordering is only meaningful as: (1) fix Phase 0, (2) repoint the generator, (3) regenerate, (4) validate the walk holds. Make that dependency explicit so nobody ships an unchanged corrupted artifact.

---

## 4. Phase-by-phase verdict

| Phase | Verdict | Notes |
|---|---|---|
| 0 — ZXY extraction fix | **This is the actual fix.** | Verified provable inconsistency (28.8° → 120°, 0.5° → 30°) + pervasive rails + sign flips. Probes already scaffold the experiment matrix. Success criterion is objective (regression tests + 4b full-scan + walk holds) |
| 1 — slerp + fail-loud quat + walking2.md | **Correct, do regardless.** | Slerp is an improvement, not the fix. Fail-loud quat branch is verified-real dead code. **Add the gaitActive wiring (3a) — the plan's single biggest omission** |
| 2 — quaternion-native motion bank | **Correctly optional.** | Only for authoring many new clips without per-clip axis-convention hunting. Not required for the collapse. Keep VLM degree contract |

---

## 5. Effort sanity check

- **Phase 0**: 1–3 days (probes exist; the experiment matrix is already written; the implementer must run them, pick the convention, patch the converter, add the regression tests to `mixamoStreamConverter.test.ts`, regenerate, and validate playback)
- **Phase 1**: ~1 day including the gaitActive wiring
- **Phase 2**: 3–5 days if pursued (consistent with project_info__91)

Total to resolve the collapse: **Phase 0 + the gaitActive line ≈ 1–3 days.** Phase 2 is separable and skippable.

---

## 6. One honest caveat

The plan's Phase 0 fix makes the walk command physiologically sane poses. Whether the walk then *holds* depends on the balance/GKF system under normal gait — which is why 3a (gaitActive wiring) matters so much, and why the plan's own 4d ("regenerate and re-test: does the walk hold together?" ) is the correct empirical gate. If after Phase 0 + gaitActive the walk still collapses, the remaining suspects (in order) are the 60Hz balance sampling against 500Hz physics and the kinematic GRF injector racing the root-motion teleport — both documented in `gyroscope-analysis.md`, neither in the plan's current scope. The plan as written fixes the demonstrated cause; the wiring closes the most probable secondary cause.
