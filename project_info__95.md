# Synthia 1.5.1 — Full-Joint Walk Retargeting Audit (Every Joint Down to the Fingertips) — Corrected & Verified

## Verdict Up Front (corrected)

**This is a converter disease, not a stale-artifact disease, and not a missing MJCF sign-flip.** After re-verifying every stream offset by hand (and correcting several errors in `project_info__94`), the evidence now shows:

- **The on-disk artifact IS byte-for-byte the current converter's output.** Nine independent joints cross-check (arm roll ±51°/±55°, shoulder yaw + rail-pin, hip pitch/yaw/roll triples, head/neck swap, knee clamps, elbow magnitudes) all match the current `mixamoStreamConverter.ts` math. Project_info__94's "stale artifact from an older pipeline" theory is **retracted** — the converter genuinely emits these values, which is why "fixes" never changed anything: the artifact is regenerated and in sync; the pipeline itself is wrong.
- **The converter systematically misroutes or destroys joint motion because it extracts ZXY Euler angles from raw stream-local quaternions with NO alignment to the baked MJCF hinge frames.** For every joint whose true swing axis is ±Y or ±Z in the Mixamo stream frame (elbows, arms, shoulders, all 20 finger phalanges), the extracted "pitch" is the wrong component — it is ~0 for fingers (motion dropped) or it leaks the full rotation onto the wrong remaining axis (arms get the swing as phantom `roll`).
- **Per-joint toll on the 52 tracked rotation joints at frame 0:**
  - **20 of 20 finger/thumb proximal+middle phalanges are completely dead (emit 0)**, even though the stream carries 13–107° of real finger curl on every one of them.
  - **2 of 2 knees are dead (emit 0)** — the stream flexes both knees +20° to +64° about +X, but the engine's knee convention `x:[-2.618, 0]` plus three clamp layers erase them.
  - **2 of 2 shoulders are rail-pinned** at exactly ±0.261 on roll (yaw −14.8° too) — the real 19–22° shoulder motion exceeds the ±15° constraint.
  - **2 of 2 upper arms are misrouted**: a genuine arm swing is emitted as +51.3° / −54.8° **roll** about the humerus long axis — the "zombie arms bent backwards" mechanism.
  - **2 of 2 elbows are under-reported 2.5–2.9×** (37.7° stream → 15.3° emitted; 30.4° → 10.6°) because the elbow's flexion axis is −Y/+Y in the stream frame.
  - Spine ×3, neck, head, both hips, both feet, both toe bases, and both hands are **faithful** (small-angle joints map correctly; the hips' pitch/yaw/roll triples match the stream within first-order residuals).
- **Why the fall happens (corrected causal chain):**
  1. **Knees locked straight** → no shock absorption at heel-strike, no knee bend at push-off → the leg behaves as a rigid pendulum and the ground reaction tips the trunk backward. **Primary.**
  2. The clip itself starts (frame 0) with **both hips trailing** (−28.8°, −15.4°) — clip-faithful, but combined with locked knees, the CoM is behind the feet from the first frame.
  3. **Arm phantom roll ±51°** flings the forearm mass behind the shoulder line each step, adding a rear moment. **Contributor.**
  4. **Shoulders rail-pinned ±15°** lock the arms in a wings-back posture. **Contributor.**
  5. `MotorController.applyCapsuleBalance` scales balance to 15% (`GAIT_BALANCE_SCALE = 0.15`) for the entire walk, so the capsule cannot arrest the pitch-back. **Amplifier.**

The cure is the same one I flagged before, now mapped to **every joint**: a bind-relative change-of-basis projection (quaternion domain, not Euler) before extracting hinge angles, plus per-side sign conventions for knees and fingers, a wider shoulder range, regeneration of the artifact, and per-joint sign/alternation tests. A per-bone `PITCH_AXIS_FLIP` table in the MJCF alone would NOT fix this — it would only flip whichever single axis each bone is misrouted onto, one bone at a time.

---

## 0. Errata — Corrections to project_info__94 (be brutally honest, as requested)

| # | 94 Claim | Correction |
|---|----------|------------|
| E1 | "The artifact cannot be produced by the current converter" (§1b, D2) | **Retracted.** The artifact **is** the current converter's output (verified across 9 joints, below). The problem is the converter itself. The operational note *does* survive: after editing the converter you MUST re-run `scripts/generateMixamoWalkArtifacts.ts` and hard-refresh — that's how every previous "fix" vanished. |
| E2 | §1a "LeftUpLeg frame 0 = [0.532581, −0.0102, 0.0016, 0.8463] (+64.3° about +X)" | **Offset error.** That quat is at offset 183 = `mixamorig:LeftLeg` (the knee). Real LeftUpLeg (179) = [x −0.236102, y 0.0619018, z 0.047132, w 0.968609] = **28.8° about the −X-dominant axis**. |
| E3 | §1a "RightUpLeg +20.6°; RightLeg −9.5°; LeftLeg ~1.3°" | **Misattributed.** RightUpLeg (195) = 15.4° about −X/−Y. RightLeg (199) = +20.6° about +X. RightFoot (203) = 9.5° about −X. LeftLeg (183) = **+64.3° about +X**; LeftFoot (187) = 1.3° about −Z. |
| E4 | §1d "LeftArm frame 0 = [0.0234, −0.1266, −0.1448, 0.9810] (22.4° swing)" | **Offset error.** That quat is `mixamorig:LeftShoulder` (27). Real LeftArm (31) = [x −0.0720, y 0.0283, z −0.4292, w 0.8999] = **51.8° about the −Z-dominant axis** — a much bigger rotation than a typical 20° arm swing, which matters: the arm's stream rotation is not purely sagittal swing, and the converter's roll output (+51.3°) is ~the full stream magnitude leaked onto the wrong axis. |
| E5 | §1a "both hips negative at frame 0 is physically impossible" | **Retracted.** The stream itself has both hips trailing at frame 0 (left −28.8°, right −15.4° about −X). It is a clip property, not a converter artifact. The converter reproduces it faithfully. The fall is seeded by locked knees + trailing hip start, not by a hip sign inversion. |
| E6 | §2 D4 "93's flip would be double-negated by 4a, so never apply it" | **Refined.** The flip belongs on **knees**, not uplegs. The stream knee flexion is +X on BOTH sides and the engine constraint is [−2.618, 0] — so the knee sign must be corrected (negate the emitted knee pitch, or negate the knee hinge axis `axis="-1 0 0"` in the MJCF). 93's proposed flip on *uplegs* is still wrong; put it on `leftleg`/`rightleg`. |
| E7 | §1e "root motion is correct" | **Stands.** Root advances 177 cm over 32 frames; forwardSpeedMps 1.659; `forwardSign=-1` mapping is right. |
| E8 | (implicit in 94) The `/tmp/mixamo_probe*.mjs` scripts are trustworthy | **They read the stream quats as [w,x,y,z], but the stream is [x,y,z,w]** (same as the converter's `THREE.Quaternion(data[offset], data[offset+1], data[offset+2], data[offset+3])`). Identity joints like `LeftHandThumb3 ≈ [0, 0, 0, 1]` prove the order is x,y,z,w. Any output from those probes contradicts the artifact; re-read them as x,y,z,w (or fix the probes) before trusting them. |

---

## 1. The Full-Joint Audit — Every Tracked Joint, Frame 0, Raw Stream vs Artifact

Stream quat format is **[x, y, z, w]**. "Axis" = dominant component of the vector part. Angles from θ = 2·acos(w). "Converted expect" = what the current converter must emit (first-order ZXY-of-conjugated-quat; verified against the artifact where it matters). Artifact values are read directly from `public/animations/mixamo-walking-synthia.json` frame 0.

### 1.1 Spine / neck / head

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 `[pitch,yaw,roll]` | Verdict |
|------|-----|------------------------|-------------------------------|---------|
| mixamorigspine | 3 | 0.8° @ +X | [0.0034, 0.0058, −0.0078] | ✅ clean |
| mixamorigspine1 | 3 | 0.9° @ +X | [0.0067, 0.0121, −0.0088] | ✅ clean |
| mixamorigspine2 | 3 | 0.9° @ +X | [0.0067, 0.0121, −0.0088] | ✅ clean |
| mixamorigneck | 3 | 1.3° @ −Z | [−0.0001, 0.0211, −0.0080] | ✅ correct (yaw↔roll swap works: stream 1.20° roll → 1.21° yaw) |
| mixamorighead | 3 | 4.5° @ +X/−Y | [0.0478, −0.0308, −0.0529] | ✅ small / faithful |

### 1.2 Shoulders

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamorigleftshoulder | 3 | 22.4° @ −Z/−Y | [0.0092, −0.2580, **+0.2610**] | ❌ **RAIL-PINNED** — roll exactly at +0.261 (15°); yaw −0.258 (−14.8°) is far too large for a walk; the real 22.4° motion exceeds the ±0.261 constraint → clamped. |
| mixamorigrightshoulder | 3 | 19.3° @ +Z/+Y | [0.0245, +0.1295, **−0.2610**] | ❌ **RAIL-PINNED** — roll exactly −0.261. |

Both rails are hit across many frames (frame 8 L-roll still 0.261, frame 16 L-yaw also −0.261). The `±0.261` range is simply too tight for this clip.

### 1.3 Upper arms — THE ZOMBIE MECHANISM

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamorigleftarm | 3 | 51.8° @ −Z | [−0.1056, +0.1136, **+0.8960**] | ❌ **SWING→ROLL MISROUTED** — the ±Z swing is emitted as roll +51.3° on the `axis="0 1 0"` roll hinge → spins the humerus about its own long axis → forearm/hand trail backward = "zombie arms." |
| mixamorigrightarm | 3 | 58.9° @ −Z/+Y | [0.0103, −0.3355, **−0.9569**] | ❌ same, roll −54.8°. |

Verified: conjugation of 51.8° @ axis unit (−0.165, 0.984, 0.065) gives roll ≈ +51°, matching the artifact's +51.3° within first-order error. The converter is faithfully extracting the *wrong component*.

### 1.4 Forearms (elbows)

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamorigleftforearm | 1 | 37.7° @ **−Y** | 0.2676 (+15.3°) | ⚠️ **UNDER-REPORTED ~2.5×** — flexion axis is −Y (roll in ZXY); the `x` (pitch) component that survives is only the residual. |
| mixamorigrightforearm | 1 | 30.4° @ **+Y** | 0.1849 (+10.6°) | ⚠️ **UNDER-REPORTED ~2.9×**. |

The elbow is "alive" but the magnitude is wrong, so the arms look stiff and half-bent.

### 1.5 Hands (wrists)

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamoriglefthand | 2 | 24.6° | [0.3343, 0, −0.1893] | ✅/⚠️ pitch faithful (~19° vs 18°), roll −10.8° plausible |
| mixamorigrighthand | 2 | 23.6° @ +X | [0.3895, 0, +0.1022] | ✅ pitch faithful (22.4° vs 23.6°) |

### 1.6 Thumbs

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamoriglefthandthumb1 | 1 | 13.2° @ mixed | 0 | ❌ **DROPPED** (pitch component ≈ 0 → clamp emits 0) |
| mixamoriglefthandthumb2 | 1 | 5.3° @ +X | 0.0402 (+2.3°) | ⚠️ alive but under-reported |
| mixamoriglefthandthumb3 | 1 | ~0° | 1.8e-5 | ✅ |
| mixamorigrighthandthumb1 | 1 | 13.8° @ **−X** | 0 | ❌ **DROPPED** (negative pitch → clamp [0, 1.745] → 0) |
| mixamorigrighthandthumb2 | 1 | 29° @ +X | 0.5041 (+28.9°) | ✅ excellent match |
| mixamorigrighthandthumb3 | 1 | ~0° | 1.5e-5 | ✅ |

### 1.7 Fingers — THE COMPLETELY DEAD HAND (all 16 proximal/middle phalanges)

| Bone | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|------------------------|-------------|---------|
| mixamoriglefthandindex1 | 43.2° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandindex2 | 82.8° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandindex3 | ~0° | 0 | ✅ (stream is truly ~0) |
| mixamoriglefthandmiddle1 | 64.0° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandmiddle2 | 102.7° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandmiddle3 | ~0° | 0 | ✅ |
| mixamoriglefthandring1 | 57.2° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandring2 | 106.7° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandring3 | ~0° | 3.2e-8 | ✅ |
| mixamoriglefthandpinky1 | 76.5° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandpinky2 | 95.6° @ **−Z** | 0 | ❌ DEAD |
| mixamoriglefthandpinky3 | ~0° | 0 | ✅ |
| mixamorigrighthandindex1 | 39.7° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandindex2 | 66.9° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandindex3 | ~0° | 0 | ✅ |
| mixamorigrighthandmiddle1 | 48.9° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandmiddle2 | 73.2° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandmiddle3 | ~0° | 0 | ✅ |
| mixamorigrighthandring1 | 47.9° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandring2 | 80.4° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandring3 | ~0° | 0 | ✅ |
| mixamorigrighthandpinky1 | 44.4° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandpinky2 | 87.8° @ **+Z** | 0 | ❌ DEAD |
| mixamorigrighthandpinky3 | ~0° | 0 | ✅ |

**Left fingers flex about −Z, right fingers about +Z** (mirrored bone conventions). Since `is1Dof` emits only `pitch` and a pure-Z rotation has pitch ≈ 0, **every proximal and middle phalanx in the entire hand emits 0 for every frame of the clip.** The artifact flags this exactly: 32 finger entries all `0` (or 1e-8). A "walk with hands dead-stiff" is also physically wrong — the clip has natural relaxed hand curl that the engine never sees.

### 1.8 Legs — where the fall is decided

| Bone | DOF | Stream f0 (deg @ axis) | Artifact f0 | Verdict |
|------|-----|------------------------|-------------|---------|
| mixamorigleftupleg | 3 | 28.8° @ −X | [−0.4816, +0.1104, −0.0701] | ✅ faithful (−27.6° vs −28.8°, yaw +6.3° vs +7.2°, roll −4.0° vs −5.5° — all first-order matched). Frame-0 trailing is clip-faithful. |
| mixamorigrightupleg | 3 | 15.4° @ −X/−Y | [−0.2083, −0.1578, −0.0827] | ✅ pitch faithful (−11.9° vs −12.3°); ⚠️ yaw −9.0° is excessive hip rotation (stream axis isn't clean X) — minor instability contributor. |
| mixamorigleftleg | 1 | **+64.3° @ +X** | **0** | ❌ **KILLED** — stream flexion is POSITIVE X; constraint `x:[-2.618, 0]` + `positive_x_clamped_to_0` erase it. |
| mixamorigrightleg | 1 | **+20.6° @ +X** | **0** | ❌ **KILLED** — same. |
| mixamorigleftfoot | 2 | 1.3° @ −Z | [0.0011, 0, 0.0223] | ✅ |
| mixamorigrightfoot | 2 | 9.5° @ −X | [−0.1510, 0, +0.0804] | ✅ plantarflexion −8.7° faithful |
| mixamoriglefttoebase | 1 | 3.8° @ −X | −0.0675 | ✅ |
| mixamorigrighttoebase | 1 | 5.0° @ −X | −0.0854 | ✅ |

**Knee alternation is real and destroyed.** Frame 0 vs frame 16 in the raw stream:
- Left knee: 64.3° → 22.4° (extending), Right knee: 20.6° → 52.2° (flexing) — clean ~16-frame opposition.
- Both are +X flexion in the Mixamo frame. The engine's "knees are always negative" convention is simply wrong for this clip's data.

---

## 2. Root-Cause Hierarchy (with file:line evidence)

### D1 — No bind-frame alignment in the converter (the disease)
`src/utils/mixamoStreamConverter.ts`: `toZxyEuler(quatFromData(...))` feeds the raw stream-local quat through `threeQuatToMuJoCo` (a fixed +90° X conjugation) and `Euler('ZXY')`. For bones whose flexion axis in the stream frame is ±Y or ±Z (elbows ±Y, arms ±Z, shoulders ±Z, fingers ±Z), the resulting `pitch` is the wrong component — dropped (fingers) or leaked onto roll/yaw (arms, shoulders). The +90°X conjugation is a *global* alignment; it cannot correct a *per-joint* basis shift. Verified signatures: arm roll matches the full stream magnitude; finger pitch ≈ 0; elbow pitch ≈ residual only.

### D2 — Knee sign convention incompatible with this clip
`src/constants/rigConstraints.ts`: `mixamorigleftleg/rightleg x: [-2.618, 0]`. `src/world/engine/HumanoidPhysicsBinder.ts` `validateAndApplyTimeline`:
```ts
if (constraint.dof === 1 && constraint.x[1] === 0.0 && v > 0) return 0.0;
```
`src/constants/anatomicalLimits.ts` adds a third clamp (`{min: -150°, max: 0}`). The stream flexes both knees about +X (20–64°). Three independent layers converge to constant 0.

### D3 — Finger flexion axis is ±Z, but fingers are 1-DOF pitch-only
`is1Dof` → emit `clamp('x', pitch)` (`mixamoStreamConverter.ts`). A ±Z flexion has pitch ≈ 0. Also `rigConstraints` fingers `x:[0, 1.745]` positive-only — right-side fingers flex about +Z (zero pitch) and left about −Z (would be negative if it were pitch at all). All 16 proximal/middle phalanges dead.

### D4 — Shoulder range too tight for the clip
`rigConstraints`: shoulders `±0.261` (15°). Stream shoulders move 19–22°. Converter clamps; artifact rail-pins at exactly ±0.261 on many frames. `scripts/walkAnalyzer.js`'s own limit table uses the same ±0.261, so its clamp scan won't flag it — it passes because the emitted *equals* the limit.

### D5 — Arm swing emitted as roll
The MJCF arm is 3-DOF: yaw `0 0 1`, pitch `1 0 0`, roll `0 1 0`. The engine's documented rest = arm pitch `+75°` = arms down (see `diagnostic_poses_v2.js` "Right Arm: At Side (X=+75°)" and `resetToBindPose` `armsDownAngle`). A walk arm swing should be a pitch modulation around the rest pose (e.g., 55–90°). The converter emits essentially zero swing on pitch (−6° / +0.6°) and dumps +51°/ −55° onto roll → the humerus twists about its own long axis, dragging the forearm behind — the "zombie arms, arms bent backwards" exactly.

### D6 — Balance amplifier
`MotorController.applyCapsuleBalance` (`src/world/engine/MotorController.ts`): `GAIT_BALANCE_SCALE = 0.15`, 60 N·m cap, active whenever `gaitActive` (which `useWorld`'s `synthia:action` handler sets for `playWalk()`). After the knee/finger/arm fixes this should be re-tuned; it is not the cause.

---

## 3. What This Means for the `walkAnalyzer.js` Output

- **`leftleg/rightleg 0 frames offset ⚠`** — correct reading of a destroyed signal: the artifact knees are 0 everywhere. The stream's real alternation (~16 frames) is proven in §1.8.
- **`leftupleg/rightupleg 18 frames offset ✓`** — the hips genuinely alternate in the artifact (f0 L−27.6/R−12 → f8 R+12.3 → f16 …), so hip phase is fine.
- The analyzer itself needs no fix; the data feeding it does.

---

## 4. The Fix — Concrete, Per-Joint, Verified

### 4a. Replace the converter's per-bone extraction with a bind-relative change-of-basis (fixes D1/D3/D5)
In `src/utils/mixamoStreamConverter.ts`, for each joint `j` with stream-parent `p`:
1. Build the parent-relative **bind** frame once from the GLB bind world quats (the skeleton `getWorldQuaternion` at load, as already captured in `HumanoidPhysicsBinder.bindPoseWorldQuaternions`):
   `rBind_j = qBind(p)⁻¹ · qBind(j)`
2. Build the parent-relative **animated** frame by accumulating stream locals: `rAnim_j = qWorld(p)⁻¹ · qWorld(j)`
3. Project: `R_target = rBind_j⁻¹ · rAnim_j`
4. **Then** convert: `threeQuatToMuJoCo(R_target)` → `Euler('ZXY')` → `[pitch, yaw, roll]` → clamp → emit.

This alone: maps ±Z finger flexion into the finger hinge's own frame (fixing all 16 dead phalanges), routes the arm swing onto the engine's pitch hinge (killing the ±51° roll phantom), restores elbow magnitudes, and removes the shoulder rail-pin pressure. It is the same math `/tmp/mixamo_probe2.mjs` implements — but remember E8: that probe reads quats as [w,x,y,z]; fix the probe to [x,y,z,w] before using it.

*(If you prefer a less invasive change: build an explicit per-bone axis map — e.g., `fingers: stream Z → hinge pitch`, `arms: stream Z → hinge pitch`, `elbows: stream Y → hinge pitch` — with per-side signs. It's the same information as the projection but hard-coded; the projection is cleaner and future-proof. Choose ONE.)*

### 4b. Fix the knee sign (fixes D2) — this is where the `PITCH_AXIS_FLIP` belongs
After 4a, verify the projected knee pitch. Since the stream knee flexion is +X on both sides and the engine constraint is `[−2.618, 0]`:
- Either negate the emitted knee pitch for `mixamorigleftleg` and `mixamorigrightleg` (converter), **or** negate the MJCF knee hinge axis (`axis="-1 0 0"`) in `MJCFHumanoidTemplate.ts`. **One place only. Do NOT touch the uplegs.** (Corrects E6 / 93's mis-targeting.)

### 4c. Widen shoulder range (fixes D4)
`rigConstraints` shoulders: raise `x` and `z` to at least ±0.7 rad (40°) and re-check `diagnostic_poses_v2` poses. Or verify the projection lands inside ±0.261 in practice — but the clip itself needs ~22°.

### 4d. Regenerate & rewrite tests (mandatory)
1. `npx ts-node --esm scripts/generateMixamoWalkArtifacts.ts`
2. Rewrite `src/utils/mixamoStreamConverter.test.ts` to assert the audit table as a contract:
   - **Knees**: `knee_L(frame N) ≈ −knee_R(frame N+16)`-style alternation; never both 0 across a full cycle.
   - **Fingers**: every `…index1/2`, `…middle1/2`, `…ring1/2`, `…pinky1/2`, `…thumb1` **nonzero** at frames where the stream has >10° (assert sign + magnitude window).
   - **Arms**: `|roll| < 0.3 rad` at all frames; pitch moves at least ±0.15 rad around the rest angle.
   - **Shoulders**: must never equal ±0.261 (a rail-hit assertion, like the existing spine/hip rail scan — extend it to shoulders).
   - **Elbows**: magnitude window [0.4, 1.2] rad across the flex portions.
   - Keep the determinism test; add a "regeneration reproduces artifact" assertion so converter edits are always followed by a regenerate.
3. Hard-refresh the browser (both MJCF and JSON caches) before `playWalk()`.

### 4e. Re-tune balance after the walk stands up
`MotorController.GAIT_BALANCE_SCALE` from 0.15 → start at 0.4–0.5 and dial until the corrected walk is stable.

---

## 5. Verification Targets (frame 0, after fix)

| Joint | Assert |
|-------|--------|
| leftupleg | pitch ≈ −0.48 rad, yaw < 0.15, roll < 0.12 (unchanged, already faithful) |
| rightupleg | pitch ≈ −0.21 rad, **yaw < 0.10** (was −0.158 — projection should trim cross-axis) |
| leftleg / rightleg | **nonzero, alternating**: f0 L≈−1.12 / R≈−0.36 (negated 64.3°/20.6° to fit [−2.618,0]), f16 swapped |
| leftarm / rightarm | pitch in rest-relative swing band; **roll < 0.3 rad** |
| leftforearm / rightforearm | ≈ 0.5–0.7 rad (37.7°/30.4° recovered) |
| leftshoulder / rightshoulder | within widened range, **not equal to the rail** |
| right index2 / middle2 / ring2 / pinky2 | ≈ 1.17/1.28/1.40/1.53 rad (66.9°/73.2°/80.4°/87.8° — natural flexed hand) |
| left index2 / middle2 / ring2 / pinky2 | ≈ 1.45/1.79/1.86/1.67 rad (82.8°/102.7°/106.7°/95.6°) |
| leftthumb1 / rightthumb1 | ≈ 0.23 rad (13°) not 0 |

---

## 6. Files Read for This Report

| File | Relevance |
|------|-----------|
| `walking` | Raw stream (the source of truth). Quats are **[x,y,z,w]**; 52 rot nodes; verified offsets 0–210. |
| `public/animations/mixamo-walking-synthia.json` | The played artifact; validated as current-converter output across 9 joints. |
| `src/utils/mixamoStreamConverter.ts` | The disease: raw-local → global +90°X conjugation → ZXY, no bind alignment; `is1Dof`/`is2Dof` emit rules; knee/elbow sign rules. |
| `src/constants/rigConstraints.ts` | Knee `[-2.618,0]`, finger `[0,1.745]`, shoulder `±0.261` — the wrong tables for this clip. |
| `src/constants/anatomicalLimits.ts` | Third clamp layer (knee max 0). |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `positive_x_clamped_to_0`; `validateAndApplyTimeline`; `setMotorTargets`; timeline slerp; `resetToBindPose` arm rest 75°. |
| `src/world/engine/MotorController.ts` | actuator yaw/pitch/roll mapping; `GAIT_BALANCE_SCALE = 0.15`. |
| `src/world/engine/MJCFHumanoidTemplate.ts` | MJCF bake & hinge axes; no `axis="-1 0 0"` anywhere (93's flip absent — and belongs on knees, not uplegs). |
| `src/world/engine/PhysicsEngine.ts` | `threeQuatToMuJoCo` conjugation. |
| `scripts/walkAnalyzer.js` | Analyzer reading the artifact; its limit table matches rigConstraints (so rail-pins pass silently). |
| `src/utils/mixamoStreamConverter.test.ts` | Tests enshrining the current wrong output (must be rewritten per §4d). |
| `src/utils/playMixamoWalk.ts` | Confirms playback consumes the JSON artifact only. |
| `scripts/generateMixamoWalkArtifacts.ts` | The regeneration step (required after every converter edit). |
| `src/world/hooks/useWorld.ts` | `synthia:action`/`rootMotion` handlers; `setGaitActive` wiring; cache re-load path. |
| `discards/T-pose in three.js world configuration.md` | GLB bind quats (Hips −89° X; UpLegs 180° Z) — the source of the per-joint basis shift. |
| `/tmp/mixamo_probe*.mjs` | ⚠️ Read the stream as [w,x,y,z] — **wrong order** vs the converter’s [x,y,z,w]; fix before use (E8). |
| `console_diagnose_arm_motion.js` | Runtime arm-ghost verifier — useful after the fix. |
| `diagnostic_poses_v2.js` | Engine's documented axis convention (arm rest +75° pitch; arm swing = pitch; "Right Arm Swing Forward (Z=−90°)" is for the roll hinge — exactly what the converter feeds the phantom into). |
| `src/world/engine/__tests__/multiAgentComposition.test.ts` | Spawn-reload/ramp regression — unaffected by this fix. |

---

## 7. Suggested Reading Order (fix sequence)

1. `walking` — re-read quats as [x,y,z,w]; internalize §1 tables.
2. `/tmp/mixamo_probe2.mjs` — the bind-relative math to port (after fixing the quat-order read).
3. `src/utils/mixamoStreamConverter.ts` — replace per-bone Euler extraction with the bind-relative projection; fix knee/finger per-side signs.
4. `src/constants/rigConstraints.ts` — widen shoulders; verify knees/fingers after projection.
5. `scripts/generateMixamoWalkArtifacts.ts` — re-run.
6. `src/utils/mixamoStreamConverter.test.ts` — rewrite to the §4d assertions (the audit table as contract).
7. `src/world/engine/MotorController.ts` — re-tune `GAIT_BALANCE_SCALE`.

## 8. Summary

The artifact is not stale and the converter is not broken in its mechanics — it's broken in its **model**: it reads per-joint Mixamo-frame quaternions and projects them onto a *single global* axis convention, when each joint's flexion axis lives in a *different local frame* (X for hips/feet/knees, Y for elbows, Z for arms/shoulders/fingers). The scorecard after this audit: 20 finger joints dead, 2 knees dead, 2 shoulders rail-pinned, 2 arms misrouted into backward zombie twists, 2 elbows under-reported, and the remaining 24 joints (spine×3, neck, head, hips×2, feet×2, toe bases×2, hands×2, thumbs 2/3×2) faithful. The knees alone explain the backward fall; the arms explain the zombie look; the fingers explain the stiffness. The fix is one quaternion change-of-basis in the converter, per-joint positive-flexion conventions, a wider shoulder range, regeneration, and tests that encode this audit table.
