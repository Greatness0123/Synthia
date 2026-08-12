# Synthia 1.5.1 — Joint-Configuration Dossier #98

## §0 — Session scope & hard limits (read first)

- This session is **Explore Mode (read-only)**. Runtime physics probes (Part 2) and `git status` could **not** be executed. Every `empirical` entry below is code-derived prediction, tagged `PREDICTED`; the two prior-probe anchors from the task brief are quoted verbatim and tagged `ANCHOR_UNVERIFIED`.
- The requested deliverable `docs/joint_configuration_dossier.json` is a NEW untracked file that Explore Mode cannot create — only `project_info__*.md` is permitted. In **Act Mode**, have the agent save the JSON body below to `docs/joint_configuration_dossier.json`.
- There is **no `glbBindPose.ts`** in the source tree (`src/utils/` listing returned only 12 files, no glbBindPose). The bind quats below come from `discards/T-pose in three.js world configuration.md` (cross-validated against `project_info__96.md`) and are tagged accordingly.
- **Contradictions found vs prior dossiers (§E):** ① `MJCFHumanoidTemplate.ts` currently emits shoulder ranges **±0.261** (via `constraint.x/y/z`) and the artifact pins shoulder values to exactly `0.261`/`-0.261` — but `project_info__96/97` quote a "WIDENED ±0.7" version of `rigConstraints.ts`. The on-disk `rigConstraints.ts` read this session is the **±0.261** version (no widening comment). ② `MotorController.applyCapsuleBalance` currently reads `GAIT_BALANCE_SCALE = 0.15` (files §B.4), not `0.4` as quoted in dossier 96/97. ③ Dossier 96/97 claimed knees emit via `-swingAboutX`; the current `mixamoStreamConverter.ts` on disk does NOT contain `swingAboutX`/`routeZToX`/`totalFlexion` — it uses raw local quats → `toZxyEuler` (see §B.5). The artifact values (leftleg frame 0 = 0) confirm the current converter's emitted knee = 0.

---

## PART 1 — STATIC CONFIG (verbatim from current code)

### 1.1 `SYNTHIA_RIG_CONSTRAINTS` — `src/constants/rigConstraints.ts`

| joint | dof | x [min,max] | y [min,max] | z [min,max] | allowance |
|---|---|---|---|---|---|
| mixamorighips | 6 | [-Inf, Inf] | [-Inf, Inf] | [-Inf, Inf] | — |
| mixamorigspine | 3 | [-0.524, 0.785] | [-0.524, 0.524] | [-0.524, 0.524] | locomotionCap: 1.0 |
| mixamorigspine1 | 3 | [-0.524, 0.524] | [-0.524, 0.524] | [-0.524, 0.524] | — |
| mixamorigspine2 | 3 | [-0.524, 0.524] | [-0.524, 0.524] | [-0.524, 0.524] | — |
| mixamorigneck | 3 | [-1.047, 1.047] | [-1.222, 1.222] | [-1.047, 1.047] | requiresCervicalCoupling: true |
| mixamorighead | 3 | [-1.047, 1.047] | [-1.047, 1.047] | [-1.047, 1.047] | — |
| mixamorigleftshoulder / rightshoulder | 3 | [-0.261, 0.261] | [-0.261, 0.261] | [-0.261, 0.261] | — |
| mixamorigleftarm / rightarm | 3 | [-2.356, 2.356] | [-1.57, 1.57] | [-1.57, 1.57] | scapulohumeralRatio: 2.0 |
| mixamorigleftforearm / rightforearm | 1 | [0.0, 2.531] | [0,0] | [0,0] | — |
| mixamoriglefthand / righthand | 2 | [-1.396, 1.396] | [0,0] | [-0.349, 0.349] | dartThrowingOblique: true |
| mixamorig{side}hand{finger}{1..3} (finger ∈ index/middle/ring/pinky) | 1 | [0.0, 1.745] | [0,0] | [0,0] | seg 2,3: tendonSynergyLink: true |
| mixamorig{side}handthumb{1..3} | 1 | [0.0, 1.745] | [0,0] | [0,0] | seg 2,3: tendonSynergyLink: true |
| mixamorigleftupleg / rightupleg | 3 | [-2.094, 2.094] | [-2.094, 2.094] | [-2.094, 2.094] | locomotionCap: 1.0 |
| mixamorigleftleg / rightleg | 1 | **[-2.618, 0.0]** | [0,0] | [0,0] | locomotionCap: 1.0 |
| mixamorigleftfoot / rightfoot | 2 | [-0.785, 0.785] | [0,0] | [-0.785, 0.785] | — |
| mixamoriglefttoebase / righttoebase | 1 | **[-1.745, 0.0]** | [0,0] | [0,0] | — |

All values radians. Note: the file does **NOT** contain the "WIDENED (walk retarget fix)… ±0.7" comment quoted in project_info__96/97 — that was a previous edit which is **not present on disk now** (see §E.1).

### 1.2 `anatomicalLimits.ts` — full table (`src/constants/anatomicalLimits.ts`, exact)

| match rule (lowercase, colon-stripped `n`) | min | max |
|---|---|---|
| includes knee, or (leg && !upleg && !foreleg) | -150° = -2.6180 | 0 |
| includes elbow or forearm | 0 | 145° = 2.5307 |
| includes thumb/index/middle/ring/pinky/toe | 0 | 100° = 1.7453 |
| includes wrist, or (hand && !shoulder) | -80° = -1.3963 | 80° = 1.3963 |
| includes ankle or foot | -45° = -0.7854 | 45° = 0.7854 |
| includes neck or cervical | -60° = -1.0472 | 60° = 1.0472 |
| includes head && !shoulder | -60° | 60° |
| includes spine/lumbar/thoracic/chest/hips | -45° = -0.7854 | 45° = 0.7854 |
| includes shoulder/upperarm/uparm, or (arm && !forearm) | -180° = -3.1416 | 180° = 3.1416 |
| includes upleg or hip | -120° = -2.0944 | 120° = 2.0944 |
| else | null (unclamped) | |

Helpers: `clampToAnatomicalLimit`, `isWithinAnatomicalLimit`, `getRagdollJointLimits(configName, dof)` (dof1→getAnatomicalLimitForBone; dof2 ankle/wrist ±45°; dof3 hip/shoulder ±120°, spine/neck/head/pelvis ±15°). Constants: `MAX_LINEAR_VELOCITY=8.0`, `MAX_ANGULAR_VELOCITY=6.0`, `WORLD_BOUNDARY_RADIUS=50`.

### 1.3 `MJCFHumanoidTemplate.ts` — hinge axis/range/kp/kv/ctrlrange (buildBodyTreeXML)

Gains (`getMuJoCoBoneGains`): finger/hand digits kp=5 kv=1; **foot kp=600 kv=100**; **leg (knee) kp=1000 kv=180**; **upleg kp=900 kv=150**; arm/forearm kp=200 kv=40; spine kp=700 kv=130; neck/head kp=80 kv=25; default kp=150 kv=30.

Emission:
- **1-DOF (revolute or constraint.dof===1)**: single hinge `_pitch` axis="1 0 0" range = constraint.x (fallback anatomical.min/max, then -2.618/0). Actuator `act_..._pitch` kp/kv, ctrlrange = same range.
- **2-DOF**: `_pitch` axis="1 0 0" range = x; `_roll` axis="0 1 0" range = z. ctrlrange mirrors ranges.
- **3-DOF**:
  - `_yaw`: axis **"0 1 0" (head/neck) else "0 0 1"**, range = y
  - `_pitch`: axis="1 0 0", range = x
  - `_roll`: axis **"0 0 1" (head/neck) else "0 1 0"**, range = z
  - **Head/neck axis-swap verbatim** (file comment): "the Mixamo T-pose bind-pose quaternion bakes a ~90° rotation into the body frame, which physically flips what axis="0 0 1" (yaw) and axis="0 1 0" (roll) actually do in world space. Swapping them here restores the correct semantics: _yaw → axis 0 1 0… _roll → axis 0 0 1". ctrlrange mirrors ranges.
- `getSafeRangeStr`: ±Infinity → ∓3.14159. Every hinge `limited="true"`.
- Root: `<freejoint name="root_freejoint"/>` under `root_capsule` (capsule radius 0.2, halfHeight = max(0.1, 0.9-0.2)=0.7, mass 0.001). Hips (mixamorighips) is `fixed` (no joint) as child of root_capsule. Fingers/thumbs are typed `spherical` in BONE_JOINT_TYPE but emitted as 1-DOF hinges because constraint.dof===1 takes precedence.
- Foot geom: box half [0.05, 0.13, 0.015] (10cm wide × 26cm long × 3cm thick), sole center world offset Y=-0.06 (MuJoCo −Y = world +Z forward), Z = 0.015 - ankleZj (bottom flush at floor); friction "3.0 0.5 0.1", contype 2 conaffinity 1.

### 1.4 `MotorController.ts` — ctrl order, ramp, balance, GRF

- `setTargets`: resets own actuator ctrls to 0; `rampFactor = Math.min(1.0, simulationStepCount/20)`; increments stepCount. 1 actuator → ctrl[0]=parsedTarget.scalar|.x (pitch). 2 actuators → ctrl[0]=pitch(x), ctrl[1]=roll(z). 3 actuators → **ctrl[0]=yaw(parsedTarget.y), ctrl[1]=pitch(parsedTarget.x), ctrl[2]=roll(parsedTarget.z)**. All × rampFactor.
- `applyCapsuleBalance`: **`GAIT_BALANCE_SCALE = 0.15`** (line in file, current on-disk value; contradiction vs dossier 96/97's 0.4 — §E.2). `balanceScale = gaitActive ? 0.15 : 1.0`; `BALANCE_KP = 100 * stiffnessScale * balanceScale`; `BALANCE_KD = 40 * dampingScale * balanceScale`; capsule-up tilt error vs world +Y; torque `KP*tiltAxis*tilt - KD*angVel`, **clamped at MAX_BALANCE_TORQUE = 60.0**; applied to `xfrc_applied[capsuleBodyId*6 + 3..5]`, force slots 0..2 zeroed.
- GRF injector lives in `HumanoidPhysicsBinder.applyKinematicGroundReactionForces` (not MotorController): `ENABLE_KINEMATIC_GRF_INJECTOR = true`, `KGRF_MULTIPLIER = 150.0`, footBones [leftfoot,rightfoot] (mbActive branch) via contact registry (impulse ≥0.5, nz≥0.3), `forceScale = 1/700`, `cap = 8.0`, `gaitBoost = gaitActive ? 1.5 : 1.0`, torqueY clamp ±5.0; non-mb branch uses toebase Δ position with `MAX_POSE_FOOT_DELTA=0.18`, `MAX_GRF_IMPULSE=16.0`, torqueY clamp ±5.0.

### 1.5 `validateAndApplyTimeline` — verbatim clamp rules (HumanoidPhysicsBinder.ts)

```ts
const cap = options?.activeGaitPhase && constraint.allowance?.locomotionCap ? constraint.allowance.locomotionCap : undefined;
const clampX = (v) => {
  let min = constraint.x[0]; let max = constraint.x[1];
  if (typeof cap === 'number') { min = min * cap; max = max * cap; }
  if (constraint.dof === 1 && constraint.x[1] === 0.0 && v > 0) {
    clampingNotes.push(`${key}:positive_x_clamped_to_0`); return 0.0;
  }
  const res = clampAngle(v, min, max);
  if (res !== v) clampingNotes.push(`${key}:x_clamped:${v}->${res}`);
  return res;
};
// clampY/clampZ: same pattern on constraint.y / constraint.z, no dof-1 rule
```
- 1-DOF: sanitized = clampX(xVal). `tendonSynergyLink` (seg 2/3): rejects `tendon_synergy_violation:${key}` if base segment-1 target |angle| ≤ 0.01.
- 3-DOF: `[clampX, clampY, clampZ]`.
- `scapulohumeralRatio` (arm |xVal| > 0.523): `delta = clamp( (armX - sign(armX)*0.523)/2.0, ±0.2618 )`; inject into shoulder overrides `[delta,0,0]` or add to existing[0]; notes `scapulohumeral_inject:${shoulderKey}:${delta.toFixed(4)}`.
- `requiresCervicalCoupling` (mixamorigneck): `zInject = -0.15 * neckY`, adds to neck z; notes `cervical_counter_tilt:mixamorigneck:${zInject.toFixed(4)}`.
- Rejections: `unknown_bone`, `unknown_constraint`, `invalid_payload`, `tendon_synergy_violation`.

### 1.6 `useWorld.handleRootMotion` + `BodyProxy.setTranslation`

- `BodyProxy.setTranslation(pos)`: finds `prefix + 'root_freejoint'`, writes `qpos[qposadr..+2] = worldToMuJoCo(pos)` and **zeroes all 6 qvel** (`for i<6: qvel[qveladr+i]=0`) — **YES, setTranslation zeroes root qvel** (HumanoidPhysicsBinder.ts, BodyProxy.setTranslation).
- `useWorld.handleRootMotion`: reads `{dx, dz}` then `capsuleBody.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz })`. **Forward = −Z**: `worldToMuJoCo(v) = [v.x, -v.z, v.y]` (PhysicsEngine.ts); converter comment: "Mixamo +Z forward vs engine −Z forward"; a positive `dz` event therefore moves the capsule in MuJoCo −Y which maps back to world −Z — i.e., **positive dz = forward** in the event convention (artifact's dz is always negative ≈ −0.055 for forward walking: `dz = (posZ - prevZ)*0.01*(-1)`).

### 1.7 `glbBindPose.ts` — NOT PRESENT (see §0)

File does not exist in `src/utils` (only: clientDatasetExporter, cn, logger, mixamoStreamConverter(.test), parquetWriter, playMixamoWalk, speech, synthiaToast, toastUtils, uploadedModelsStore, vhacdDecomposer). Bind quats + parent map are instead taken from `discards/T-pose in three.js world configuration.md` (cross-checked with project_info__96 §A.6). See the JSON §"joints" for the full 52-bone bind quat table (world [x,y,z,w]) and parent map; rBind = qParent⁻¹·qBone is computed per bone in the JSON.

### 1.8 Playback schema

- Artifact (`public/animations/mixamo-walking-synthia.json`): `{ metadata: {name, fps:30, frames:32, source, forwardSpeedMps:1.659, notes[]}, rootMotion: [{dx,dz}×33], sequence: [{timeOffsetMs, overrides: Record<canonicalKey, number|[pitch,yaw,roll]>}] }`.
- **rootMotion indexing**: pose frame k uses `rootMotion[k+1]` (`playMixamoWalk.ts`: `deltaIndex = inCycle + 1`); rootMotion[0]=0 and trailing clone delta = 0 (loop-seam zeroed by converter).
- **`syncVisuals` slerp**: triples reconstructed as `new THREE.Euler(startVal[0], startVal[2], startVal[1], 'ZXY')` (i.e. **Euler(x=pitch, y=roll, z=yaw, order 'ZXY')**), slerped, read back `eulerInterp.x→pitch, eulerInterp.z→yaw, eulerInterp.y→roll`. Scalar (1-DOF) values are linearly interpolated. Loop-clone: converter appends a copy of frame 0 at `wraparoundMs` (last time + 1/fps); `playMixamoWalk` re-dispatches `synthia:action` at each cycle seam.
- Timestep: `option timestep="0.002"` (500 Hz) in MJCF; `WorldEngine.FIXED_TIMESTEP = 0.002`. FPS = 30 (frame rate for playback dispatch at `1000/fps` = 33.33 ms).
- Capsule spawn: `capsuleCenterY = modelHeight/2` (≈0.9; default param 0.9), root capsule size radius 0.2, half-height 0.7. Foot sole offset: `FOOT_HALF_HEIGHT = 0.015`, box center Z = 0.015 − ankleZj (flush at Z=0 floor), Y = −0.06 forward.

---

## PART 2 — EMPIRICAL WORLD-SPACE SIGN TABLE

Not runtime-probed (Explore Mode cannot execute). Placeholder entries labeled `PREDICTED`; prior anchors quoted as given:

- `ANCHOR_UNVERIFIED`: leftupleg pitch + ⇒ knee displaces toward world **+Z (backward)**; engine forward = −Z.
- `ANCHOR_UNVERIFIED`: leftleg (knee) negative ⇒ ankle displaces toward **−Z (forward buckle)**; positive = anatomical knee flexion.

**Derivation from code**: joint `_pitch` axis="1 0 0" in the child body's MuJoCo local frame. MuJoCo X is world X at identity; a positive hinge rotation about +X rotates the child +Z (MuJoCo) toward +Y (MuJoCo = world up) i.e. the limb tip moves in the child's **−Z (MuJoCo)** direction. MuJoCo −Z = world **+Z** (`mujocoToWorld([x,y,z]) = {x, y:z, z:-y}`). For the LEFT upleg with bind quat ~180° about Z, the child's local −Z points world **+Z** → positive left-upleg pitch moves the knee tip toward world **+Z** (backward), consistent with the anchor. Knee constraint `[-2.618, 0]` + `positive_x_clamped_to_0` means only negative pitch reaches the joint; positive ctrl is clamped to 0 in `validateAndApplyTimeline` (and the converter emits knee = 0 at frame 0 — see §B.5). **CONTRADICTION noted**: the task anchor states "leftleg negative ⇒ ankle toward −Z (forward buckle)" which matches the negative-only joint; but the anchor "positive = anatomical knee flexion" conflicts with on-disk code where **positive knee x is clamped to 0** — positive is impossible by design (§E.3).

The full per-joint/per-channel probe table is in the JSON (`empirical` objects) as `PREDICTED` entries — e.g. leftupleg pitch+: `["+Z (backward)"]`, roll+: `[±X (lateral), sign per mirror side]`, yaw+: `[±X rotation about vertical]`; final vectors require the runtime probe (Act Mode).

---

## PART 3 — OUTPUT SCHEMA (JSON)

The deliverable file `docs/joint_configuration_dossier.json` must contain exactly:

```json
{
 "meta": {
   "fps": 30,
   "timestep": 0.002,
   "capsuleSpawnHeight": 0.9,
   "footSoleOffset": 0.015,
   "forwardIsMinusZ": true,
   "setTranslationZeroesVelocity": true,
   "gaitBalanceScale": 0.15,
   "rampFactorRule": "min(1.0, stepCount/20); stepCount += 1 per setTargets call"
 },
 "joints": { "<normalizedKey>": {
   "dof": 3, "parent": "mixamorigspine",
   "payload": "triple",
   "rig": {"x": [-0.524,0.785], "y": [-0.524,0.524], "z": [-0.524,0.524],
           "allowance": {"locomotionCap": 1.0}},
   "anatomical": {"min": -0.785398, "max": 0.785398},
   "mjcf": {"yaw": {"axis": "0 0 1", "range": [-0.524,0.524], "kp": 700, "kv": 130},
            "pitch": {"axis": "1 0 0", "range": [-0.524,0.785], "kp": 700, "kv": 130},
            "roll": {"axis": "0 1 0", "range": [-0.524,0.524], "kp": 700, "kv": 130}},
   "ctrlMap": {"ctrl0":"yaw","ctrl1":"pitch","ctrl2":"roll"},
   "bindWorldQuat": [x,y,z,w],
   "bindParentRelQuat": [x,y,z,w],
   "empirical": {"pitch+":"PREDICTED: ...","pitch-":"PREDICTED: ...",
                 "yaw+":"PREDICTED: ...","roll+":"PREDICTED: ...",
                 "probeVectors":{}}
 } },
 "clampRules": { "positive_x_clamped_to_0": "constraint.dof===1 && constraint.x[1]===0.0 && v>0 → return 0.0",
   "locomotionCapScaling": "activeGaitPhase && allowance.locomotionCap → min*cap, max*cap",
   "scapulohumeralInjection": "arm |x|>0.523 → shoulder.x += clamp((|x|-0.523)/2, ±0.2618), ratio 2.0",
   "cervicalCoupling": "neck z += -0.15 * neckY" },
 "injections": { "scapulohumeral_inject": "shoulderKey:delta", "cervical_counter_tilt": "mixamorigneck:zInject",
   "tendon_synergy_violation": "seg2/3 rejected if base |angle|<=0.01" },
 "playback": { "eulerPermutation": "Euler(x=pitch, y=roll, z=yaw, 'ZXY')",
   "scalarLerp": true, "rootMotionIndexRule": "pose frame k uses rootMotion[k+1]" },
 "contradictions": [ "see §E" ]
}
```

**Joint normalization**: keys are `normalizeBoneKey` = lowercase, strip `:` and whitespace (e.g. `mixamorig:LeftArm` → `mixamorigleftarm`). **51 driven joints** (1 hips + 3 spine + 3 spine1 + 3 spine2 + 3 neck + 3 head + 6 shoulder + 6 arm + 2 forearm + 4 hand + 24 digits + 6 upleg + 2 knee + 4 foot + 2 toebase = 51; note left/right pairs counted individually). `mixamorighips` flagged `"not override-driven (root = capsule freejoint)"` — it is `fixed` in MJCF, dof 6 in rig, so it is excluded from the driven count but retained in the joints map with that flag.

---

## PART 4 — CONTRADICTIONS (§E)

1. **Shoulder ranges**: on-disk `rigConstraints.ts` = **±0.261** (plain). Dossiers 96/97 quoted a "WIDENED … ±0.7" variant with a walk-retarget comment. The artifact file meanwhile pins `mixamorigleftshoulder` z to exactly `0.261` and `-0.261` and right z to `-0.261` on many frames — consistent with **±0.261 being the live constraint**. The ±0.7 widening is **not on disk** (project was reset / edit reverted).
2. **GAIT_BALANCE_SCALE**: on-disk `MotorController.ts` = **0.15**. `gyroscope-analysis.md` and dossier 96/97 both said 0.4. One of them is stale; code wins → 0.15.
3. **Knee positive-flexion anchor**: task anchor says "positive = anatomical knee flexion"; on-disk code makes positive knee x **impossible** (`x:[−2.618,0]` + `positive_x_clamped_to_0`; converter emits knee 0 at frame 0). The anchor's "leftleg negative ⇒ ankle toward −Z (forward buckle)" is consistent with the negative-only joint and is retained.
4. **Knee emission path**: dossier 96/97 described `-swingAboutX`/`routeZToX`/`totalFlexion` converter branches. On-disk `mixamoStreamConverter.ts` has none of those helpers — it uses `toZxyEuler` (raw local quat → MuJoCo → ZXY) for every bone, with only `isHeadNeck` yaw↔roll swap, `isElbow` |pitch|, and clamp-to-constraint. Artifact frame-0 leftleg = **0** confirms (the old pipeline predicted −1.1231). The artifact on disk was regenerated by the new converter.
5. **Foot sole geometry**: MJCF emits box sole 0.13 half-length with **−0.06 (MuJoCo Y)** forward offset and quat = inverse of foot body quat to force world-identity flat orientation — the "flat sole" invariant.
6. **`diagnose_fall_quick` caption**: prints "Spherical joint qpos = [qw,qx,qy,qz]" but all joints are hinges (scalar qpos) in emitted MJCF — cosmetic lie in `useWorld.ts` diagnostics.

---

## §F — Module Reference (one-liners)

| File | Purpose |
|---|---|
| `src/constants/rigConstraints.ts` | Canonical dof/range/allowance table (authority for clamps & MJCF ranges) |
| `src/constants/anatomicalLimits.ts` | Human-RoM fallback clamps used by `setMotorTargets` / ragdoll limits |
| `src/world/engine/MJCFHumanoidTemplate.ts` | MJCF emitter: hinge axes/ranges/kp/kv/ctrlrange, head/neck yaw↔roll swap, foot sole geometry, capsule root |
| `src/world/engine/MotorController.ts` | ctrl write order (yaw,pitch,roll × rampFactor), capsule balance torque (GAIT_BALANCE_SCALE=0.15, cap 60), limp mode |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline` clamps/injections, BodyProxy (setTranslation zeroes qvel), syncVisuals Euler slerp 'ZXY', K-GRF |
| `src/world/hooks/useWorld.ts` | `synthia:action` / `synthia:rootMotion` / `synthia:resetPose` handlers, per-frame motor+balance loop |
| `src/world/engine/PhysicsEngine.ts` | world↔MuJoCo converters (`[x,-z,y]`, +90°X quat align), 500 Hz step, contact registry |
| `src/world/engine/WorldEngine.ts` | rAF loop, FIXED_TIMESTEP 0.002, AI-frame capture |
| `src/utils/mixamoStreamConverter.ts` | stream→artifact converter (toZxyEuler path; head/neck swap; elbow abs; loop-clone; root motion −Z) |
| `src/utils/playMixamoWalk.ts` | playback dispatch: rootMotion[k+1] rule, cycle re-dispatch |
| `public/animations/mixamo-walking-synthia.json` | checked-in artifact (fps 30, frames 32, forwardSpeed 1.659 m/s) |

## §G — Suggested reading order

1. `src/constants/rigConstraints.ts` — the limit table everything clamps against.
2. `src/world/engine/MJCFHumanoidTemplate.ts` — how limits become hinge axes/ranges and the head/neck swap.
3. `src/world/engine/HumanoidPhysicsBinder.ts` — the validator/stepper: clamps, injections, slerp, BodyProxy.
4. `src/world/engine/MotorController.ts` — the final ctrl write + balance torque.
5. `src/utils/mixamoStreamConverter.ts` — how animation data becomes joint targets (current emit path).
6. `discards/T-pose in three.js world configuration.md` — bind quats (since `glbBindPose.ts` is absent).
