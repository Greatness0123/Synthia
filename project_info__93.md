# Synthia 1.5.1 — 180° Pitch Sign Inversion After Removing Spine/Uplegs from CAPSULE_ATTACH_BONES

## Verdict Up Front

**Gemini's "Path A vs Path B matrix-order mismatch" hypothesis is mathematically false** — the two paths are provably identical because `threeQuatToMuJoCo` is a group conjugation. The sign inversion is real, but it comes from a different mechanism: after Phase 0 re-parented `mixamorigspine` / `mixamorigleftupleg` / `mixamorigrightupleg` under the baked hips chain, the **baked body frames of those joints carry ~180° bind rotations, and the converter's stream-frame delta sign is never re-calibrated against the baked hinge sign**. A +pitch emitted by the converter therefore drives these bones anatomically backward in the new parent-relative MJCF.

The fix is a per-bone sign calibration (flip the upleg (and likely spine) pitch sign in **one** place — the MJCF hinge axis or the converter emit rules) plus a strengthened regression test that asserts pitch SIGN, not `Math.abs()` (the current test masks the inversion).

---

## 1. What I verified from the code (the decisive findings)

### 1a. Gemini's Path A vs Path B — mathematically identical (the premise is wrong)

Gemini's blueprint asked you to compare:

- **Path A**: `q_rel_MJ = threeQuatToMuJoCo(q_parent⁻¹ · q_child)`
- **Path B**: `q_rel_MJ = threeQuatToMuJoCo(q_parent)⁻¹ · threeQuatToMuJoCo(q_child)`

`PhysicsEngine.threeQuatToMuJoCo` (`src/world/engine/PhysicsEngine.ts`) is:

```ts
qTransformed = qAlign * qThree * qAlign⁻¹   // qAlign = +90° about X
```

This is a **conjugation** by a unit quaternion `T(q) = Q·q·Q⁻¹`. Conjugation is a group homomorphism:

```
T(p⁻¹ · c) = Q·p⁻¹·c·Q⁻¹ = (Q·p⁻¹·Q⁻¹)·(Q·c·Q⁻¹) = T(p)⁻¹ · T(c)
```

**Path A ≡ Path B, exactly.** `BodyManager.syncRigidBodiesFromBones` uses Path B (converts each world quat, then inverts the parent); the order makes zero difference. The 180° inversion is **not** caused by transform ordering. (One small real difference: `BodyManager` does NOT sign-canonicalize the quat before `Euler.setFromQuaternion`, whereas the converter does; that matters only for ±180°-ish artifacts, not for a stable 180° offset.)

### 1b. The actual mechanism — baked-frame hinge-sign ambiguity after the Phase 0 re-parent

**Before Phase 0** (`CAPSULE_ATTACH_BONES` contained hips + spine + uplegs): spine/upleg bodies were children of `root_capsule`. Their joint angles were absolute world orientations (captured via `getWorldQuaternion`), which is why every bone read "splayed" — each thigh's absolute world roll showed ~120°.

**After Phase 0** (current `MJCFHumanoidTemplate.ts`):

```ts
const CAPSULE_ATTACH_BONES = new Set(['mixamorighips']);   // hips only
```

`buildBodyTreeXML` now bakes each child body's frame as the **parent-relative** bind transform:

```ts
qRel = qParent_bind⁻¹ · qChild_bind   // in MuJoCo space
```

That `qRel` is the body's rest frame, and the hinge axes (`pitch axis="1 0 0"`) rotate the body about its **body-local** axes. The Mixamo skeleton's bind chain contains large baked rotations — from the T-pose audit (discards/T-pose in three.js world configuration.md): **Hips bind ≈ −89° about X; Left/RightUpLeg bind ≈ 180° about Z**. Those 180° flips make the body-local `+X` hinge axis point along the *opposite anatomical direction* relative to the parent, so MuJoCo's right-hand-rule `+qpos` about `axis="1 0 0"` produces an **anatomical −pitch** (backward swing) for the value the converter believes is +pitch (forward swing).

The converter (`src/utils/mixamoStreamConverter.ts`) has **no per-bone sign table** for this — it only swaps head/neck yaw↔roll and does elbow `|pitch|`. Its sign convention was tuned against the *old* capsule-attached MJCF. When Phase 0 changed the parenting/bake, the effective hinge sign flipped for exactly the re-parented bones (spine, uplegs) — and the video shows exactly the spine + upper legs driven backward.

### 1c. The on-disk artifact is consistent with an inverted-but-not-pinned pose (before/after)

Frame 0, from `public/animations/mixamo-walking-synthia.json` (current, post-Phase-0):

| Bone | Pre-Phase-0 (rail-pinned, per project_info__92) | Post-Phase-0 (file I read) |
|---|---|---|
| `mixamorigspine` | z = ±0.524 (30° clamp rail) | `[0.0034, 0.0058, −0.0078]` — small ✓ (rail fixed) |
| `mixamorigleftupleg` | z = ±2.094 rail | `[−0.4816, 0.1104, −0.0701]` — pitch −27.6° |
| `mixamorigrightupleg` | z = ±2.094 rail | `[−0.2083, −0.1578, −0.0827]` — pitch −12° |

The rail-pinning is genuinely gone (Phase 0 succeeded for that). But now **both** hip pitches are NEGATIVE at frame 0. Engine convention (from `diagnostic_poses_v2.js`, which documents the LLM/hinge contract): "Right Hip: **Forward** Kick (X=+45°)" / "Backward Kick (X=−30°)" — i.e., **+pitch = forward, −pitch = backward**. A real walking pose has one leg trailing (negative) and one leg forward (positive) at any instant. Emitting −27.6° on the left AND −12° on the right drives the pelvis backward, the torso arches back, arms trail behind — the exact 00:04→00:06 video. The spine frame-0 values being tiny is consistent: the torso collapse is *caused by* the hip drive, not by the spine values themselves.

### 1d. The regression test masks the bug

`src/utils/mixamoStreamConverter.test.ts`:

```ts
const leftUpLegPitch = (leftUpLegVal as [number, number, number])[0];
expect(Math.abs(leftUpLegPitch)).toBeGreaterThanOrEqual(0.4);   // ABS!
expect(Math.abs(leftUpLegPitch)).toBeLessThanOrEqual(0.55);
```

`Math.abs` accepts **either sign** — so a 28.8° value that flips to −28.8° still passes. The Phase 0 regression suite cannot catch a sign inversion by construction. It must be strengthened to assert the anatomical direction (see §3).

### 1e. Balance is softened exactly when it's needed — but that is not the root cause

- `MotorController.applyCapsuleBalance` uses `GAIT_BALANCE_SCALE = 0.15` (torque KP×0.15, KD×0.15, 60 N·m cap) whenever `gaitActive` is true.
- `useWorld.handleAction` **does** call `binder.setGaitActive(!!activeGaitPhase)` before applying the timeline (this contradicts project_info__92 §3a's "never called at runtime" claim — that finding is stale; the wiring already exists). So the balance controller *is* deliberately weakened during the walk. That is a *contributor* (it cannot arrest the backward drive), not the cause.
- The kinematic GRF injector and the kinematic root-motion teleport (`synthia:rootMotion` → `BodyProxy.setTranslation`) are also active and cannot counteract a wrong-sign hip target.

### 1f. Axis definitions — verified correct, no sign error in the MJCF axes themselves

`MJCFHumanoidTemplate.buildBodyTreeXML` for 3-DOF joints:

```ts
const yawAxis   = isHeadNeck ? '0 1 0' : '0 0 1';
const rollAxis  = isHeadNeck ? '0 0 1' : '0 1 0';
// pitch is always axis="1 0 0"
```

No `axis="-1 0 0"` anywhere. So the inversion is not a hardcoded negative axis; it's the baked body frames (`qRel`) flipping the effective sign of `axis="1 0 0"` for the re-parented bones. That is the place to fix (see §3).

### 1g. Latent inconsistency worth knowing about

`BodyManager.syncRigidBodiesFromBones` defines **its own empty** `CAPSULE_ATTACH_BONES = new Set<string>()` — it does *not* import the one from `MJCFHumanoidTemplate`. It therefore treats *every* bone as parent-relative (including hips, whose parent is the GLB model root Group — not a `THREE.Bone` — so hips falls into the `else { qRel = bone.quaternion.clone() }` local-quat fallback). This method is not called by `HumanoidPhysicsBinder`'s runtime loop, but any debug/console path that calls it gets different semantics than the MJCF bake. Keep it in mind if you add skeletal-bake diagnostics.

---

## 2. The decisive experiment (run in Act mode — 5 minutes)

Because the raw frame arrays are 211 floats and easy to mis-read by eye, the sign conclusion must be confirmed empirically with two tiny probes before patching:

**Probe 1 — hinge direction sanity.**
Dispatch a single static pose (no timeline): `synthia:action { jointOverrides: { mixamorigrightupleg: [0.5, 0, 0] } }` (≈ +28.6° pitch). Watch which way the right knee moves:
- If the knee swings **forward** → the hinge sign for right-upleg is correct; the inversion is elsewhere (check left-upleg and spine the same way).
- If the knee swings **backward** → confirmed: baked-frame flip; fix applies to that bone.

Repeat for `mixamorigleftupleg` and `mixamorigspine` ([0.5, 0, 0]). This gives the exact per-bone flip list.

**Probe 2 — converter vs BodyManager frame-0 cross-check.**
Use the existing scaffolding (`/tmp/mixamo_probe.mjs`, `probe2`, `probe3`) but add one output: for frame 0, compute `BodyManager`-style `T(parentWorld)⁻¹·T(childWorld)` per bone in `Euler('ZXY')` and print — then compare sign with the converter's artifact value. (They are mathematically expected to differ from the converter's raw-delta by the bind-relative — which is precisely the ~180° offset on uplegs.)

---

## 3. The fix

### Primary fix (recommended — one place, fixes all current and future clips)

Negate the pitch hinge axis in the MJCF for the bones whose baked frame flips anatomical forward, i.e. in `src/world/engine/MJCFHumanoidTemplate.ts` where `jointsXML` is emitted:

```ts
// Per-bone sign calibration: these bones' baked parent-relative frames carry a
// ~180° bind rotation, which inverts the effective sign of the local X axis.
// Negating the pitch axis restores "+pitch = anatomical forward".
const PITCH_AXIS_FLIP: Record<string, string> = {
  'mixamorigleftupleg': '-1 0 0',
  'mixamorigrightupleg': '-1 0 0',
  // Add mixamorigspine/spine1/spine2 here IF Probe 1 shows backward motion.
};
const pitchAxis = (PITCH_AXIS_FLIP[boneName] as string) || '1 0 0';
```

and use `axis="${pitchAxis}"` for the pitch joint and actuator (in all three joint-arm paths: 1-DOF, 2-DOF, and 3-DOF). This keeps the converter generic and the artifact unchanged; the physics then interprets the converter's +pitch as forward. **Rebuild the world (spawn path already regenerates MJCF via `generateAgentSubtreeMJCF`); no artifact regeneration needed for the hinge-axis variant.**

### Alternative fix (if you prefer to leave MJCF untouched)

In `src/utils/mixamoStreamConverter.ts`, `overridesForFrame`, apply a per-bone sign map to the extracted `pitch` (and verify roll) for the same bones:

```ts
const PITCH_SIGN_FLIP = new Set(['mixamorigleftupleg', 'mixamorigrightupleg']); // + spine if probe says so
...
if (PITCH_SIGN_FLIP.has(bone)) pitch = -pitch;
```

Then regenerate the artifact (`npx ts-node --esm scripts/generateMixamoWalkArtifacts.ts`).

**Do both only if you want belt-and-braces — but pick ONE as the source of truth and document it, or future clips will get double-flipped.**

### Regression test (mandatory)

Replace the `Math.abs` assertions in `mixamoStreamConverter.test.ts` with sign-aware ones:

```ts
// Frame 0 gait phase: right leg is the stance/trailing leg → pitch must be
// NEGATIVE (backward); the swing leg must be POSITIVE.
expect(leftUpLegPitch).toBeLessThan(-0.4);    // trailing leg
expect(leftUpLegPitch).toBeGreaterThanOrEqual(-0.55);
expect(rightUpLegPitch).toBeLessThan(0);      // must not be backward too
```

(Values to be finalized after Probe 1 confirms which leg is in which phase; the key point is **assert the sign**, not the magnitude. Also add a sign assertion for the classic "Forward Kick" test pose: right-upleg +0.785 must move the knee forward — ideally as an integration check in `src/world/engine/__tests__/multiAgentComposition.test.ts` or a new `walkSign.test.ts`.)

### Follow-up (cheap, from the stale findings in project_info__92 §3a)

`setGaitActive` **is** already wired in `useWorld.ts` (`binder.setGaitActive(!!activeGaitPhase)`), so §3a of project_info__92 is already done — do not re-add it. If after the sign fix the walk still drifts, the remaining suspects (in order) remain: 60 Hz balance sampling vs 500 Hz physics, and the kinematics GRF injector racing the root-motion teleport — both documented in `gyroscope-analysis.md`.

---

## 4. Answers to the Gemini blueprint items

1. **Path A vs Path B**: Identical (conjugation homomorphism) — not the bug, do not chase it. The real discrepancy is converter *stream-frame delta* vs *baked-frame hinge sign* for bones with ±180° bind rotations.
2. **Frame-0 target probe**: The current artifact frame-0 upleg pitches are −0.4816 (left) and −0.2083 (right) — both negative (backward). The magnitude on the left (−27.6°) is anatomically plausible for a mid-stride trailing leg; the **sign on the right leg is wrong** (a walk cannot have both hips in backward extension at frame 0). The T-pose bind offsets ARE the story: they are not "accounted for" by the converter, and for uplegs that omission is a 180° flip, not a small error.
3. **MJCF axis definitions**: No `axis="-1 0 0"` exists; all pitch hinges are `axis="1 0 0"`. The flip comes from the baked per-body `qRel` frames (bind-relative), which is where the fix belongs.
4. **Deliverables**: Before/after frame-0 values in §1c; fix in §3; playback validation = Probe 1 + regenerate + `playWalk()` from `scripts/walkAnalyzer.js`.

---

## 5. Files read for this report

| File | Relevance |
|---|---|
| `src/utils/mixamoStreamConverter.ts` | Converter: `toZxyEuler`, emit rules, no per-bone sign map |
| `src/world/engine/BodyManager.ts` | `syncRigidBodiesFromBones` Path B (≡ Path A); local empty `CAPSULE_ATTACH_BONES` |
| `src/world/engine/MJCFHumanoidTemplate.ts` | `CAPSULE_ATTACH_BONES={'mixamorighips'}`; `buildBodyTreeXML` bake `qRel=qParent_bind⁻¹·qChild_bind`; hinge axes |
| `src/world/engine/PhysicsEngine.ts` | `threeQuatToMuJoCo` — conjugation by +90° X; the homomorphism proof |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline`, `setMotorTargets` (parses [x,y,z]), timeline lerp |
| `src/world/engine/MotorController.ts` | `setTargets` [yaw,pitch,roll] ctrl mapping; `applyCapsuleBalance` GAIT_BALANCE_SCALE 0.15 |
| `src/world/hooks/useWorld.ts` | `synthia:action` handler — `setGaitActive` IS called; frame-0 immediate apply |
| `src/utils/mixamoStreamConverter.test.ts` | `Math.abs` assertions masking the sign inversion |
| `public/animations/mixamo-walking-synthia.json` | Before/after frame-0 values (§1c) |
| `walking` | Raw stream (211 floats/frame, 52 rot nodes) |
| `discards/T-pose in three.js world configuration.md` | Bind rotations: Hips ≈ −89° X; UpLegs ≈ 180° Z — the ±180° hinge-flip evidence |
| `/tmp/mixamo_probe*.mjs` | Existing scaffolding for the discrimination experiments |
| `project_info__90/91/92.md` | Prior analysis (rail bug, Euler pipeline, Phase 0 verdict) — §3a gaitActive claim is now stale |

## 6. Suggested reading order for a developer fixing this

1. `src/world/engine/MJCFHumanoidTemplate.ts` → `CAPSULE_ATTACH_BONES` + `buildBodyTreeXML` — where the bake and hinge frames live
2. `src/utils/mixamoStreamConverter.ts` → `toZxyEuler` + emit rules — where the sign map goes if you choose the converter route
3. `src/world/engine/PhysicsEngine.ts` → `threeQuatToMuJoCo` — the conjugation (why Path A ≡ Path B)
4. `src/utils/mixamoStreamConverter.test.ts` — the regression test that needs sign-aware assertions
5. `src/world/engine/BodyManager.ts` → `syncRigidBodiesFromBones` — the engine's own quat→Euler path (latent inconsistency noted in §1g)



The console log you provided reveals a major anomaly that explains why the character keeps falling backward.

---

## 1. Primary Diagnosis: The Knee Phase Collapse

Look directly at line 292 of your `analyzeWalk()` console output:

```text
PHASE SYMMETRY:
  leftupleg/rightupleg        18 frames offset (expect ~16) ✓
  leftleg/rightleg             0 frames offset (expect ~16) ⚠
  leftfoot/rightfoot          17 frames offset (expect ~16) ✓
```[cite: 6]

### What This Means:
* **Hips (`upleg`)** are alternating properly (18 frames apart, near the expected 16-frame half-cycle)[cite: 6].
* **Knees (`leftleg/rightleg`)** have an offset of **0 frames**[cite: 6]. **Both knees are flexing and extending in exact synchrony at the same time**[cite: 6].

When alternating hip strides are paired with knees that bend together in phase, the character cannot perform a walking step. Instead, both lower legs collapse backward simultaneously, causing the hips to drop and sending the torso arching backward flat onto the floor[cite: 5].

---

## 2. Why the Previous Fix Produced "No Changes"

If your agent updated `MJCFHumanoidTemplate.ts` or `mixamoStreamConverter.ts`, but you saw zero visual difference, one of two things occurred:

1. **Artifact Stale / Not Regenerated**: `playWalk()` fetches `/animations/mixamo-walking-synthia.json` directly[cite: 6]. If the generator script (`scripts/generateMixamoWalkArtifacts.ts`) was not re-run, the engine is still playing back the old corrupted JSON[cite: 5, 6].
2. **Knee Channel Mirror Bug**: `mixamoStreamConverter.ts` is extracting or mapping `mixamorigleftleg` and `mixamorigrightleg` from the same track index or applying an identical sign operation that collapses the 16-frame phase offset down to 0[cite: 6].

---

## 3. Agent Prompt for Jules

Copy and paste this prompt to Jules to fix the knee channel phase collapse and force a clean runtime reload:

***

```markdown
Jules, the `analyzeWalk()` console report exposed the exact reason the character is still falling backward:

`leftleg/rightleg  0 frames offset (expect ~16) ⚠`

Both knees are bending together in phase (0 frame offset) instead of alternating by 16 frames. This causes both lower legs to buckle simultaneously, driving the body flat onto its back.

Run this targeted fix:

### 1. Fix Knee Track Extraction in `mixamoStreamConverter.ts`
- Inspect `convertMixamoStreamToTimeline()` for `mixamorigleftleg` and `mixamorigrightleg`.
- Verify that the right leg and left leg streams are reading from their distinct track channels and not defaulting to a shared track or mirrored value.
- Confirm that `leftleg` and `rightleg` pitch values show a ~16-frame phase offset in the generated timeline.

### 2. Regenerate & Hard Reload
- Run `npx ts-node --esm scripts/generateMixamoWalkArtifacts.ts` to update `public/animations/mixamo-walking-synthia.json`.
- Run `analyzeWalk()` in the browser console and verify that `leftleg/rightleg` reports an offset near 16 frames (`✓`).

### 3. Verify Playback
- Hard-refresh the browser page (to clear cached MJCF / JSON assets) and run `playWalk()`. Confirm the character stays upright with alternating leg strides.

```

---