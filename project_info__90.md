# Synthia — Euler vs Quaternion Analysis of the Mixamo Walk Pipeline

## Summary

This report answers three questions about the walking-animation pipeline:
1. Where do Euler angles appear across the application, and does console playback convert them back to quaternions before execution?
2. If you convert `public/animations/mixamo-walking-synthia.json` to quaternions, do you get exactly `walking2.md`?
3. Is the whole project too tied to Euler angles than quaternions?

**The short answers:** (1) No — the 3-element overrides in the JSON are Euler triplets all the way down; they are parsed as `isQuaternion: false` and fed directly to MuJoCo's per-axis hinge actuators. No quaternion conversion happens at runtime. (2) No — `walking2.md` is the *source* stream (same data as the root `walking` file) containing unclamped per-joint quaternions; the JSON has already applied lossy transforms (clamping, axis swaps, elbow-abs, knee-negation, limb-DOF truncation) so a reverse conversion cannot reproduce it. (3) The project is deliberately Euler-first in its *control* plane (VLM contract, artifact format, timeline interpolation, MuJoCo yaw/pitch/roll hinges) and quaternion-first in its *state* plane (bone bind poses, physics read-back, avatar slerp sync). The failure is not "eulers are bad" — it's that the converter's ZXY extraction aliases small real rotations onto clamp rails for spine/hips, producing the ±0.524 / ±2.094 sign flips you observed.

---

## 1. The Euler pipeline — every place rotations are Euler vs quaternion

### 1a. The source stream (`walking` / `walking2.md`) — QUATERNIONS

The SJSON "walking" stream stores **per-joint quaternions** in scalar-first `(w, x, y, z)` order:

- `frame_descriptor` lists 52 `rot` channels (4 floats each) + 1 `pos` channel for `mixamorig:Hips` (3 floats: cumulative X, Y, Z in Mixamo units, 1 unit = 1 cm).
- Each frame's quat is a **local delta rotation in the joint's own T-pose frame** (per the converter's top-of-file comment — no bind-pose subtraction or world-chain accumulation is needed).

*File layout (2-node example):*

| Node | Channel | Offset | Floats |
|------|---------|--------|--------|
| mixamorig:Hips | rot | 0 | `[w, x, y, z]` |
| mixamorig:Hips | pos | 4 | `[x, y, z]` (cumulative cm) |
| mixamorig:Spine | rot | 7 | `[w, x, y, z]` |
| ... | | | |

Total 211 floats/frame. Hips pos at frame 31 ≈ 177.0 units → 1.77 m walk cycle.

`walking2.md` is byte-for-byte the same stream as the root file `walking` (same header, same frame 0 quats/numbers). It is the **input**, not an alternative representation of the JSON.

### 1b. Build-time conversion (`src/utils/mixamoStreamConverter.ts`) — QUAT → EULER, lossily

`convertMixamoStreamToTimeline()` is the **only place** quaternions become Eulers:

1. `quatFromData()` — reads `(w,x,y,z)` → `THREE.Quaternion`.
2. `toZxyEuler()` —
   - canonicalizes sign (negate if `w < 0`),
   - converts to the MuJoCo frame via `threeQuatToMuJoCo` (90° X-axis alignment: `qAlign = qX(π/2)`),
   - extracts **`Euler.setFromQuaternion(qMj, 'ZXY')`**,
   - wraps each axis to `(-π, π]`.
3. Per-bone emit rules (all lossy):
   - 1-DOF joints (forearm, leg, finger, toe) → **scalar = pitch only** (y/z dropped).
   - 2-DOF joints (hand, foot) → `[pitch, 0, roll]` (y forced 0).
   - Head/Neck → **yaw↔roll swapped**.
   - Elbows → `pitch = |pitch|` (information destroyed).
   - Knees → pass-through clamped to `[-2.618, 0]` (positive flexion truncated).
   - Everything → clamped to `SYNTHIA_RIG_CONSTRAINTS` ranges.
4. Hips `rot` is **discarded entirely** (replaced by `rootMotion` deltas from the pos channel; loop-seam delta zeroed).

Result: `sequence[].overrides` are `number | [number, number, number]` — **Euler triplets in the LLM convention `[pitch(x), yaw(y), roll(z)]`**, in **radians**, already clamped.

### 1c. The artifact file (`public/animations/mixamo-walking-synthia.json`) — EULER

The JSON that `playWalk()`/`startWalk()` fetch contains:
- `sequence[]` — Euler overrides per frame (33 frames = 32 + loop clone of frame 0).
- `rootMotion[]` — per-tick `{dx, dz}` in THREE world meters (the only place the hips' translation survives).
- `metadata.forwardSpeedMps` ≈ 1.659 (computed from the *sum of absolute dz* per frame, not net displacement).

### 1d. Playback (`playMixamoWalk.ts` + console `scripts/walkAnalyzer.js`) — EULER END-TO-END

`startWalk()` (and the console `playWalk()`) do exactly this dispatch loop:

1. **Dispatch once**: `window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId, sequence, activeGaitPhase: true } }))`.
2. **Every tick (1000/fps ms)**: dispatch `synthia:rootMotion` with `rootMotion[min(inCycle+1, len-1)]`.

**No conversion back to quaternions anywhere.** The console toolkit (`walkAnalyzer.js`) contains zero quaternion math — it re-dispatches the same Euler `sequence` array. The binder's timeline stepper consumes the Euler array directly.

### 1e. `useWorld.handleAction` (`src/world/hooks/useWorld.ts`) — EULER VALIDATION

- Fires `binder.validateAndApplyTimeline(skeleton, sequence, { activeGaitPhase })`.
- `validateAndApplyTimeline` (in `HumanoidPhysicsBinder.ts`) re-clamps each axis to `SYNTHIA_RIG_CONSTRAINTS`, applies scapulohumeral/cervical-coupling injections, and writes the sanitized Euler triplet back to `timelineQueue`.
- Any frame with `timeOffsetMs === 0` is also pushed immediately through `setMotorTargets`.

### 1f. `setMotorTargets` (`HumanoidPhysicsBinder.ts`) — THE 4-ELEMENT QUAT GAP

This is the *one* place a quaternion *could* enter the runtime — and it silently doesn't work:

```ts
if (target.length === 4) {
  parsedTarget = { x: t[0], y: t[1], z: t[2], w: t[3], isQuaternion: true };
} else if (target.length === 3) {
  parsedTarget = { x: t[0], y: t[1], z: t[2], isQuaternion: false }; // ← the walk JSON path
}
```

- 3-element arrays (the JSON's format) → `isQuaternion: false` → interpreted as `[pitch, yaw, roll]`.
- 4-element arrays would be parsed as `isQuaternion: true`, stored in `currentTargets`, and then **ignored by `MotorController.setTargets`, which only reads `.isScalar/.scalar` and `.x/.y/.z`** — a 4-element quaternion target degrades to `ctrl = 0` (joint goes limp). So even if you hand-converted the JSON to `[x,y,z,w]` and dispatched it, the motor controller would drop it. The project has no working runtime quaternion control path.

### 1g. `MotorController.setTargets` (`src/world/engine/MotorController.ts`) — EULER → HINGE CTRL

The final hand-off is pure scalar-per-hinge:
- 1 actuator → `ctrl[i] = pitch` (radians).
- 2 actuators → `ctrl[pitch], ctrl[roll]` (y unused).
- 3 actuators → `ctrl[yaw], ctrl[pitch], ctrl[roll]` — comment: *"MJCF actuator order: [yaw(axis 0 0 1), pitch(axis 1 0 0), roll(axis 0 1 0)]"*.

MuJoCo's position servos then hold each hinge at that radian value. **The Euler numbers in the JSON are the literal physics targets.** Any distortion the converter introduces is faithfully reproduced by physics.

### 1h. The interpolation path — PER-AXIS EULER LERP (not slerp)

`HumanoidPhysicsBinder.syncVisuals()` timeline stepper:

```ts
interpolatedOverrides[key] = [
  startVal[0] + (endVal[0] - startVal[0]) * t,
  startVal[1] + (endVal[1] - startVal[1]) * t,
  startVal[2] + (endVal[2] - startVal[2]) * t,
];
```

Component-wise linear interpolation. For the spine z toggling between `-0.524` and `+0.524`, the lerp passes **through 0** each frame rather than taking the short rotation — this is the "1-frame snap" you'd see, even when the *angles themselves* were fine.

### 1i. Where quaternions ARE used at runtime (state plane)

- `AvatarSynchronizer.synchronize()` — reads physics body quats (`xquat` via `BodyProxy.rotation()`), **slerps** (`prevWorldQuat.slerp(rawWorldQuat, 0.85)`), then writes parent-relative quats into `bone.quaternion`. This is the only true quat-interpolation in the loop.
- `BodyManager.syncRigidBodiesFromBones()` — quats → `qRel = qParent⁻¹ · qChild` → `Euler.setFromQuaternion(qRel, 'ZXY')` → **writes qpos hinge angles**. A second quat→Euler extraction with the identical `'ZXY'` order, which is why the converter mirrors it.
- `PhysicsEngine.threeQuatToMuJoCo / mujocoQuatToThree` — pure quat axis-alignment helpers.
- `getJointState()` — reports world quats to the VLM (for *observation* only).
- Bind-pose storage — `bindPoseQuaternions`, `bindPoseWorldQuaternions` captured at model load; deliberately immutable T-pose quats.

### 1j. The VLM contract (`src/world/agent/InferenceClient.ts`) — DEGREES, EXPLICITLY NOT QUATS

The system prompt pinned in `buildOpenAIMessages`:

> "DO NOT use radians. DO NOT use objects. DO NOT use quaternions."
> "RIGHT (3D Array): `"mixamorigrightupleg": [45, 0, 15]`" — degrees, [pitch, yaw, roll].
> "OPTIONAL timeline schema… ALL joint rotation values are in DEGREES regardless of output format."

An angle heuristic (`AgentLoop.parseAndValidateAction`) auto-converts deg→rad when `|v| > π + 0.1` and clamps to ±π. This is the reason your team chose Eulers in the first place: the VLM cannot reason about `[x,y,z,w]`. That decision is baked into the prompt and the JSON schema — switching the LLM contract to quats would require retraining/major prompt surgery for zero *control* gain, because the rig itself is Euler hinges.

---

## 2. Would converting the JSON to quaternions give exactly `walking2.md`?

**No — and it's mathematically impossible, for five concrete reasons:**

| JSON transform | Information destroyed | Consequence for reverse-conversion |
|---|---|---|
| Clamp to `SYNTHIA_RIG_CONSTRAINTS` | Values outside ±0.524/±2.094 etc. are pinned to the rail | Original angles > rail are unrecoverable |
| `|pitch|` for elbows | Hyperextension sign gone | `-0.3` and `+0.3` both emitted as `0.3` |
| Knee clamp `[-2.618, 0]` + pass-through | Any positive flexion truncated to 0 | Original knee quats unrecoverable |
| 2-DOF emit forces `y = 0` | Yaw component of hand/foot dropped | 3-DOF original collapsed to 2-DOF |
| Head/Neck yaw↔roll swap | The two axes are deliberately permuted | Reversing requires knowing the swap happened |
| Hips `rot` dropped | The root quat never appears in the JSON at all | `walking2.md`'s hips quat can never be reconstructed |
| Pos channel → per-frame deltas | Cumulative 177-unit travel replaced by 32 × ~0.055 deltas | Sum-of-deltas ≠ raw path (loop-seam zeroed, forward sign flipped) |

Additionally, the 3-element arrays are **radians** in `[pitch, yaw, roll]` with an implicit ZXY order plus the MuJoCo 90°-X alignment; reconstructing a quat from them would produce a *different* quat than the source stream's own `(w,x,y,z)` if the extraction did not perfectly invert the (already lossy) transform. `walking2.md` contains the **original, unclamped, unswapped, full-DOF quaternions** — byte-identical to the root `walking` file that the converter consumed as input.

**Bottom line:** `walking2.md` is the *input*; the JSON is the *output*. The relationship is the lossy conversion in `mixamoStreamConverter.ts`. You cannot round-trip.

---

## 3. Why the animation collapses — what the "Euler discontinuities" actually are

I verified your Gem interpretation against both the raw stream and the converter math. The sign-flip story is real but the *mechanism* is different from "Euler angle wrapping":

### Direct evidence from the raw stream

Raw quaternion for `RightUpLeg`, frame 0 (offsets 195–198):
```
[-0.236102, 0.0619018, 0.047132, 0.968609]
```
Angle = `2·acos(0.968609)` ≈ **28.8°**. Yet the JSON override for `mixamorigrightupleg` at frame 0 is `[-0.049, -0.155, 2.094]` — z = **120°, exactly at the clamp rail** (`[-2.094, 2.094]`).

Raw quaternion for `Spine`, frame 0 (offsets 7–10):
```
[0.00168739, 0.00290533, 0.0039156, 0.999987]
```
Angle ≈ **0.5°**. Yet the JSON override is `[-0.0078, 0.0058, -0.524]` — z = **30°, exactly at the clamp rail** (`[-0.524, 0.524]`).

A 0.5° source rotation cannot produce a 30° Euler **unless the extraction is producing a large Z-component where none exists in the source**. The culprits:

1. **`'ZXY'` extraction order hits gimbal-alias on these bones.** In ZXY order, when the middle (Y) Euler approaches ±90°, the X and Z axes become degenerate and tiny numeric wobble in X aliases onto Z. The Mixamo local frame for spine/hip bones sits near this degeneracy for the chosen order.
2. Because of that alias, the *recovered* z is driven past the constraint rail. The clamp then **pins it at ±0.524 / ±2.094**.
3. As the small real rotation wobbles across zero frame-to-frame, the *alias* flips sign independent of the true motion → you see the ±rail flipping you identified (spine 300→333→500→833→967 ms, right hip 0→100→433 ms).
4. `wrapPi`/sign-canonicalization can only fix ±180° wraps; they cannot fix a gimbal-alias, because the alias happens *inside* the Euler construction.

### The "on the floor" effect

- Hips pinned at ±120° roll is **physically beyond vertical** — the thigh is driven almost horizontal. For a walking cycle the real hip roll should be ~±5°. These bogus 120° targets are what the MuJoCo servos chase, and they drag the pelvis/feet into a configuration the balance controller can't hold.
- The balance controller weakens **6.7×** during gait (`GAIT_BALANCE_SCALE = 0.15` in `MotorController.applyCapsuleBalance`) precisely when the agent is being fed these absurd poses → collapse.
- The per-axis Euler lerp through 0 for the flipping spine/hip rails adds visible snapping on top.
- The zeroed final root-motion delta (`rootMotion[32] = {0,0}`) is harmless (1-frame pause at most) — it is *not* the cause of the floor collapse. Same for the 30 vs 30.03 fps rounding. Gem's other two points are correct but secondary.

**The real fix is not quats-vs-eulers — it's the axis mapping.** Either:
- **Debug the ZXY extraction** for spine/hips: compute the same `toZxyEuler` in a probe for those bones and verify `z` ≈ 0 for the T-pose and small for walking (the source quats say it should be), or
- **Feed quats directly to the hinges**: for each bone, convert the source delta quat → the engine's `Euler.setFromQuaternion(qRel, 'ZXY')` (the *exact* same code path `BodyManager.syncRigidBodiesFromBones` uses when baking the MJCF). If the converter's output disagrees with the engine's own bake math, that's the bug to hunt. The `mixamo_probe*.mjs` files in `/tmp` suggest this probe work has already begun.

---

## 4. Is the project too Euler-tied?

**Not "too tied" — it's deliberately split, and the split is coherent:**

| Plane | Representation | Where |
|---|---|---|
| **LLM contract** | Euler **degrees** `[pitch, yaw, roll]` (radians at the boundary) | `InferenceClient.buildOpenAIMessages`, `AgentLoop.parseAndValidateAction` |
| **Artifact format** | Euler **radians** `number | [x,y,z]` | `SynthiaWalkArtifact.sequence[].overrides` |
| **Timeline interpolation** | Per-axis **Euler lerp** | `HumanoidPhysicsBinder.syncVisuals` stepper |
| **Physics actuation** | 1–3 **hinges per joint**, ctrl = scalar radians | `MotorController.setTargets`, MuJoCo `data.ctrl` |
| **State read-back** | **Quaternions** (xquat) | `BodyProxy.rotation()`, `getJointState()`, `ObservationBuilder` |
| **Visual sync** | **Quat slerp** → bone.quaternion | `AvatarSynchronizer.synchronize` |
| **Bind pose** | Immutable **quats** | `bindPoseQuaternions`, `bindPoseWorldQuaternions` |
| **Observation → VLM** | Quats in `joints` payload (VLM is told to ignore them) | `captureWorldStateForAgent` |

The control path is Euler-first because:
1. MuJoCo's model for these joints **is** Euler hinges (yaw/pitch/roll axes per body, emitted by `MJCFHumanoidTemplate`). There is no quaternion target type in the physics rig — a ball joint would be the quat path, but Synthia deliberately decomposes to hinges for per-axis PD gains and anatomical limits.
2. The VLM contract demands degrees (your original design decision — and it's the *right* call for the LLM).
3. The converter mirrors the engine's own `qRel → Euler('ZXY')` bake math so the artifact and the MJCF share a convention.

The genuinely weak spots, all Euler-caused, are:
- **The gimbal-alias extraction** (Section 3) — the one bug that actually explains the floor collapse.
- **`setMotorTargets`'s dead quaternion branch** — length-4 arrays are parsed then silently ignored by `MotorController`; if you ever dispatch `[x,y,z,w]`, the joint goes limp (ctrl=0).
- **Euler lerp instead of slerp** in the timeline stepper — produces through-zero snaps on sign-flipped rails.

What would *not* help: storing the artifact as quats and slerping, unless you also fix the extraction. Slerping a wrong-but-smooth Euler-over-time is cosmetic; fixing the axis mapping is structural. If you do switch the artifact to quats, you must also (a) add quat handling to `MotorController.setTargets` (currently missing), (b) change the VLM prompt contract, and (c) replace the Euler lerp in `syncVisuals` with slerp — a three-front change.

---

## Module Reference (Euler/quat pipeline)

| File | Role in the rotation pipeline |
|---|---|
| `walking` (root, = `walking2.md`) | Source SJSON: 52 quat channels + hips pos channel |
| `src/utils/mixamoStreamConverter.ts` | The ONLY quat→Euler conversion; all emit rules & clamping; root-motion conversion |
| `scripts/generateMixamoWalkArtifacts.ts` | CLI that regenerates the JSON from `walking` |
| `public/animations/mixamo-walking-synthia.json` | Euler artifact consumed by playback |
| `src/utils/playMixamoWalk.ts` | Dispatch loop: `synthia:action` (Euler sequence) + `synthia:rootMotion` |
| `scripts/walkAnalyzer.js` | Console read-only analyzer + same-dispatch playback (no quat math) |
| `src/world/hooks/useWorld.ts` | Event handlers: `synthia:action` → validate/clamp; `synthia:rootMotion` → capsule teleport |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline` (clamp+inject), `setMotorTargets` (parse arrays; 4-elem dead branch), `syncVisuals` (per-axis Euler lerp) |
| `src/world/engine/MotorController.ts` | Final ctrl mapping: 1/2/3 hinges, radian scalars; gait balance scale 0.15 |
| `src/world/engine/BodyManager.ts` | `syncRigidBodiesFromBones`: quats → `Euler('ZXY')` → qpos (the convention the converter mirrors) |
| `src/world/engine/AvatarSynchronizer.ts` | Quat slerp sync (physics quat → bone quat) — the only runtime slerp |
| `src/world/engine/PhysicsEngine.ts` | `threeQuatToMuJoCo` / `mujocoQuatToThree` axis-alignment helpers |
| `src/world/agent/InferenceClient.ts` | VLM system prompt: "DO NOT use quaternions", degrees `[pitch,yaw,roll]` |
| `src/world/agent/AgentLoop.ts` | `parseAndValidateAction`: deg→rad heuristic (±π clamp) |
| `src/constants/rigConstraints.ts` | Anatomical Euler axis limits per bone — the clamp rails |
| `src/types/joint.ts` | `TimelineSequence`, `ActionFrame.overrides` type = `number | [number, number, number]` (Euler, not quats) |

## Suggested Reading Order

1. `src/utils/mixamoStreamConverter.ts` — the entire quat→Euler decision lives here; read the header comment + `toZxyEuler` + emit rules.
2. `src/world/engine/BodyManager.ts` → `syncRigidBodiesFromBones` — the engine's own quat→`Euler('ZXY')` bake; compare against the converter to find the axis-mapping discrepancy.
3. `src/world/engine/HumanoidPhysicsBinder.ts` → `validateAndApplyTimeline`, `setMotorTargets`, `syncVisuals` — the runtime Euler path (validation, parsing, lerp).
4. `src/world/engine/MotorController.ts` → `setTargets` — where Euler triplets become hinge ctrl; note the missing quaternion branch.
5. `src/world/agent/InferenceClient.ts` — the VLM degree contract that justified the whole Euler design.
6. `scripts/walkAnalyzer.js` — the console tool you ran; confirms playback re-dispatches the Euler JSON unmodified.
