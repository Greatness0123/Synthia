# Synthia — Diagnosis: Authored Walk Shows Bowed Knees & Arms Folded at the Back

## TL;DR

The walk artifact (`public/animations/mixamo-walking-synthia.json`) is invalid **not because of joint-value clamp violations** (all values pass the rig/anatomical gates) but because the author script **blindly trusted channel signs that were only ever probe-verified for the hips and knees**. The three channels that visibly break — the **forearm (elbow)**, the **foot (ankle)**, and the **continuous knee-flexion profile** — were all marked **"PREDICTED: ??" / unverified** in `docs/joint_configuration_dossier.json`. On top of that, a **3.5× root-motion / step-length mismatch** (root moves 1.77 m per cycle while the legs only step ≈0.25 m) drags the planted feet through the ground and wrings sideways shear into the hip yaw/roll joints — which is what *looks like* the knee dislocating inward.

The knee **cannot** physically bend inward: `mixamorig{side}leg` is a single MuJoCo hinge (`axis="1 0 0"`) clamped `[0, 2.618]` at L1/L2 and `{0, 150°}` at L3. What you are seeing is the **whole thigh rotating about the hip's uncommanded yaw/roll axes**, carrying the shin with it, so the knee flexion that *is* legal (shin folds up/back) appears to happen sideways.

---

## 1. The symptoms, traced to concrete file lines

### 1.1 "Arms fold at the back" — root cause: the elbow override

`scripts/authorSynthiaGait.mjs` emits (lines ~20–23):

```js
o['mixamorig'+S+'arm']      = [r6(cl(1.25+0.05*c(aa),-2.356,2.356)), 0, 0];
o['mixamorig'+S+'forearm']  = r6(cl(0.70+0.25*bump(mod(aa-0.1)),0,2.356));
```

Every frame in the artifact therefore contains:

| Bone | Authored value | Meaning |
|---|---|---|
| `mixamorig{S}arm` (upper arm) | x = **1.20–1.30 rad (69–74.5°)** | ≈ the engine's verified "arm down by side" rest (`resetToBindPose` uses x = +75° = 1.309 rad) — **this channel is actually correct** |
| `mixamorig{S}shoulder` | x = ±0.05, then **+0.2618 injected** by the scapulohumeral rule (`arm|x|>0.523 → shoulder.x += clamp((|x|−0.523)/2, ±0.2618)`) | shoulder pitched ~15° forward — secondary, minor |
| `mixamorig{S}forearm` | **0.70–0.95 rad (40–54°)** | **THE BUG — this is not anatomical elbow flexion for a down-hanging arm** |

**Why the forearm breaks the pose:** The elbow hinge axis is the forearm's **local X axis in the T-pose bind frame** (`<joint ... pitch axis="1 0 0">`, forearm body baked at T-pose). In a T-pose the forearm points sideways, so a +X rotation *is* an elbow-like bend — that is why `diagnostic_poses_v2.js` and the rest-pose work. But the authored walk keeps the upper arm at the **down-by-the-side** pose; once the upper arm is rotated down, the forearm's local X (the bone's long axis) points **nearly vertically**. Rotating about a vertical axis is **forearm axial twist, not elbow flexion** — the right-hand rule sends the forearm/hand **behind the torso**. Result: "arms fold at the back."

The value is also far too large for walking: real gait uses ~5–15° of elbow bend; this script forces 40–54° in every frame.

**The sign was never verified.** The dossier's `joints` table for `mixamorigleftforearm`/`rightforearm` (and `leftarm`/`rightarm`) shows **`"empirical": { "pitch+": "PREDICTED: ??", "pitch-": "PREDICTED: ??" }`** — the runtime probe (`src/world/engine/__tests__/jointConfigurationProbe.test.ts`) verified deltas for uplegs/legs/shoulders only; arms, forearms, hands, and feet were never probed. `scripts/authorSynthiaGait.mjs`'s one-line comment says *"ONE-LINE FLIPS if the walk mirrors"* — but it declares signs **only for hip and knee** (`HIP_SIGN`, `KNEE_SIGN`), trusting every other channel unverified.

### 1.2 "Knees bend inward like a bow" — root cause: whole-limb hip shear, not knee hinge failure

The knee hinge physically cannot bow. Verified chain:

1. `rigConstraints.ts`: `map['mixamorigleftleg'] = { dof: 1, x: [0.0, 2.618], ... }` — single positive-flexion hinge. The `positive_x_clamped_to_0` rule in `validateAndApplyTimeline` only fires when `x[1] === 0` — it does **not** apply here.
2. `MJCFHumanoidTemplate.ts`: knee emitted as `<joint ... axis="1 0 0" range="0 2.618" limited="true"/>` — MuJoCo literally cannot rotate that body about any other axis.
3. `anatomicalLimits.ts`: knee anatomical `{min: 0, max: 150°}` — L3 clamps to the same positive band.
4. `jointConfigurationProbe.test.ts` verified: knee `pitch+` → qpos +0.0366, ankle dWorld (−0.0054, +0.0173, −0.0014) — flexion is anatomic (shin up/back), and `pitch−` is hard-clamped to 0.

So the *shin* can only fold **back/up** relative to the thigh. The bowed silhouette is therefore produced by the **thigh rotating sideways about the hip**. The hip is a 3-hinge spherical decomposition (`yaw` axis 0 0 1 → `pitch` axis 1 0 0 → `roll` axis 0 1 0, kp=900). The author sets `upleg = [pitch, 0, 0]` — but three drivers force the uncommanded yaw/roll channels away from 0 during playback:

**Driver A — root-motion / step-length mismatch (quantifiable, dominant):**
- Root motion: `dz = −1.770/32 = −0.055312 m/tick`, 32 ticks → **−1.77 m per 1.067 s cycle ⇒ ≈1.65 m/s** (a jog, not a walk).
- Leg step: hip ±0.3 rad × thigh ≈ 0.42 m ⇒ stride ≈ **2·0.42·sin(17.2°) ≈ 0.25 m per leg** = 0.50 m per two-step cycle.
- Ratio: the root advances **≈3.5× farther per cycle than the legs** actually move. The feet, which the artifact keeps planted (`foot` ≈ −0.19…+0.10 rad, zero roll), are dragged through the floor. The MuJoCo contact solver responds with lateral/rotational reactions that shear the lower limb about the only compliant DOFs — the hip yaw/roll servos (target 0, kp 900) lose the fight each step, and the whole leg visibly pivots inward → "bowed/dislocated knee" look.

**Driver B — permanent, excessive knee flexion:** the author's knee profile is `0.22 + 0.28·bump(u−0.08) + 0.60·bump(u−0.42)` = **0.22…0.91 rad (13…52°) and never reaches 0** (artifact min ≈ 0.4059 rad ≈ 23.2° at frames 11–12, peak ≈ 0.914 rad ≈ 52.4°). A healthy walk cycle straightens the stance leg to ≈0° at midstance. A permanently-bent, never-straightened pair of legs with hip-width stance and ±17° hip pitch reads as an inverted-V leg silhouette from any angle — the exact "bow" in the screenshot.

**Driver C — the ankle/foot channel sign is UNVERIFIED.** The dossier lists `mixamorig{left,right}foot` empirical as `"PREDICTED: ??"` — the probe never exercised the ankle. If the foot pitch sign is inverted (the author signs only hip/knee), the stance foot digs its toes into the floor exactly while the knee is flexing, converting the knee's vertical ankle travel into horizontal torque at the shin → sideways knee motion on screen. This is the same class of bug as the forearm, on the other leg segment.

**Driver D — stale negative-knee convention elsewhere in the repo** (context for confusion): `scripts/walkAnalyzer.js`'s `LIMITS` table still declares knees `[-2.618, 0]` and shoulders `±0.261`, and `diagnostic_poses_v2.js` still sends knee values like `−90°`, `−130°`. Under the current positive-flexion rig those are clamped/zeroed, so any developer cross-checking the walk with those tools gets contradictory knee readings. The dossier's `contradictions` section confirms the knee convention was flipped during this work ("kneePositiveFlexion RESOLVED"), but the console tools were not updated.

---

## 2. Key abstractions involved (for a developer fixing this)

### `HumanoidPhysicsBinder.validateAndApplyTimeline` (L2 gate)
- **File**: `src/world/engine/HumanoidPhysicsBinder.ts`
- Sanitizes every timeline frame against `SYNTHIA_RIG_CONSTRAINTS`, applies `locomotionCap` scaling (knees/hips ×1.0), the `positive_x_clamped_to_0` rule, the **scapulohumeral injection** (arm |x| > 0.523 ⇒ shoulder.x += up to ±0.2618), and the cervical counter-tilt.
- Produces `appliedTimeline`, `rejections`, `clampingNotes`, `injections`. Nothing in the authored walk is rejected here — that is why the bad values reach the actuators silently.

### `HumanoidPhysicsBinder.setMotorTargets` (L3 gate)
- Clamps scalar/array targets into `anatomicalLimits`; knee `{0, 2.618}`, forearm `{0, 145°}` — the authored values all pass. **No rejection feedback is surfaced** to the AgentLoop for the walk (the `synthia:action` handler only forwards rejections when present).

### `MotorController.setTargets`
- Maps, per bone, actuator count → channel order: 3-actuator joints are `[yaw←y, pitch←x, roll←z]`; 2-actuator `[pitch←x, roll←z]`; 1-actuator `pitch←scalar/x`.
- Applies the 20-step ctrl ramp. Because the walk re-dispatches `synthia:action` every cycle, the ramp never fully settles for the big joints if the cycle is faster than ~20 physics steps — a secondary source of "legs never snap to commanded angles."

### `syncVisuals` timeline stepper
- Interpolates triples with quaternion **slerp constructed via `Euler(x=pitch, y=roll, z=yaw, 'ZXY')`**, scalars linearly. The final visual pose comes from `AvatarSynchronizer`, which copies MuJoCo body world-quats and parents them back — so the on-screen knee is the true physical knee, and the bow you see is genuine hip yaw/roll, not a rendering artifact.

### `scripts/authorSynthiaGait.mjs`
- Deterministic generator: 32 frames @30 fps, per-tick root dz = −1.770/32, hard-coded bone names, `FING` relaxation constants, and one-line sign constants for hip/knee only. It clamps everything into rig ranges (so the artifact is "valid" to analyzers) but it cannot know channel semantics it was never probed on.

### `scripts/walkAnalyzer.js`
- Browser-console analyzer; its `LIMITS` table is **stale** (old knee/negative convention, old shoulder ±0.261). Safe only for arm/leg *phase* checks, not knee-clamp checks.

---

## 3. Verified vs unverified channel semantics (from `docs/joint_configuration_dossier.json`)

| Bone | Status | Empirical finding |
|---|---|---|
| `mixamorig{side}upleg` (hip) | **VERIFIED** | pitch+ → knee tip dZ −0.00199 (**forward**); roll+ → dX −0.0156; yaw+ → small twist |
| `mixamorig{side}leg` (knee) | **VERIFIED** | pitch+ → ankle up/back (**flexion LIVE**); pitch− clamped at 0 (pre-fix forward-buckle unreachable) |
| `mixamorig{side}shoulder` | **VERIFIED** | pitch+ → arm toward −Z (forward) |
| `mixamorig{side}arm` | **PREDICTED ??** | never probed |
| `mixamorig{side}forearm` | **PREDICTED ??** | never probed → **the folded-arms bug** |
| `mixamorig{side}hand` | **PREDICTED ??** | never probed |
| `mixamorig{side}foot` | **PREDICTED ??** | never probed → **contributes to the knee bow** |
| `mixamorig{side}toebase` | INERT | no MJCF body/actuator; overrides silently no-op |

`jointConfigurationProbe.test.ts` only prints verified deltas for bones it can resolve a child tip for AND that exist in `SYNTHIA_RIG_CONSTRAINTS`; the missing rows in the probe output correspond exactly to the missing empirical entries above — nobody has ever measured arm/forearm/foot sign on the live MuJoCo rig.

---

## 4. Data-flow path of the broken walk (numbered)

1. `scripts/authorSynthiaGait.mjs` writes `public/animations/mixamo-walking-synthia.json` (32 poses, 32 root deltas + loop clone).
2. `src/utils/playMixamoWalk.ts` `startWalk()` → fetches artifact → dispatches `synthia:action` (full `sequence`) + `synthia:rootMotion` per tick.
3. `useWorld` `synthia:action` handler (`src/world/hooks/useWorld.ts`) → clears `timelineQueue` → `binder.validateAndApplyTimeline(skeleton, seq, { activeGaitPhase: true })` → **L2 sanitize + scapulohumeral injection** → frame-0 overrides passed to `setMotorTargets` → **L3 anatomical clamp**.
4. `useWorld` `synthia:rootMotion` handler → `capsuleBody.setTranslation({x: t.x+dx, z: t.z+dz})` → capsule teleported −0.055 m/tick regardless of what the legs are doing.
5. Per animation frame, `binder.updateMotorTargets()` → `MotorController.setTargets` → `data.ctrl` for the agent's 49 actuators; `syncVisuals()` timeline stepper slerps the pose and hands to `AvatarSynchronizer`.
6. MuJoCo 500 Hz steps resolve contacts; planted/dragged feet produce lateral reactions that the hip yaw/roll servos (target 0) only partially reject → visible inward leg shear.
7. `playMixamoWalk` re-dispatches the pose sequence every 32 ticks; the binder's 20-step ctrl ramp restarts per dispatch, so large targets (knee 0.9, forearm 0.95) never fully settle before the next cycle starts.

---

## 5. What to do (fix directions — requires Act Mode)

1. **Extend the probe** (`jointConfigurationProbe`) to actually measure `arm`, `forearm`, `hand`, `foot` pitch/roll deltas (the dossier already has the harness; just include the missing bones). This gives ground-truth signs.
2. **Remove/diminish the elbow** in `authorSynthiaGait.mjs`: while the upper arm sits near rest (1.2–1.3 rad), set `forearm` to `0.05–0.2 rad` or 0 — arm swing belongs in **shoulder pitch** (contralateral ±0.25–0.4 rad), not elbow. Optionally mirror to a `FOREARM_SIGN`/`ELBOW_SIGN` constant like the hip/knee ones.
3. **Fix the gait profile**: knee base ≈ 0.05–0.1 rad, stance leg straightens to ~0 at midstance, swing flexion ≤ 0.6 rad; verify the ankle sign and use small positive (toes-up) during stance to avoid toe-digging.
4. **Match root motion to leg travel**: either reduce `dz` to ≈ −0.45…−0.6 m/cycle (~0.5–0.6 m/s) or increase hip amplitude to ≈ ±0.55 rad so the feet track the root. The 3.5× mismatch is the single biggest contributor to contact shear.
5. **Update stale tooling**: `scripts/walkAnalyzer.js` LIMITS (knee `[0, 2.618]`, shoulder ±0.7) and `diagnostic_poses_v2.js` knee signs so future verification isn't misleading.

---

## 6. Suggested reading order for the fixer

1. `docs/joint_configuration_dossier.json` — the sign/verification ground truth; note the "PREDICTED" rows.
2. `scripts/authorSynthiaGait.mjs` — the artifact generator; where all fixes land.
3. `src/world/engine/__tests__/jointConfigurationProbe.test.ts` — the harness to extend for foot/arm/forearm verification.
4. `src/world/engine/HumanoidPhysicsBinder.ts` (validateAndApplyTimeline + setMotorTargets + syncVisuals) — the gates the artifact flows through.
5. `src/world/engine/MotorController.ts` — channel order (y→yaw, x→pitch, z→roll) and the 20-step ramp.
6. `docs/joint_configuration_dossier.json` → `contradictions` — knee/foot conventions that have flipped during this project; the source of most cross-tool confusion.

---

*Full report saved to `project_info__99.md` in the project root.*