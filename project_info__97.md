# Synthia 1.5.1 — Mixamo Walk-Pipeline Dossier #96

## §0 — Session scope and limits (read this first)

- This session was **read-only** (`EXPLORE` mode). No command, test, or probe was executed. There is therefore **no [RAN] evidence** in this dossier; all anchors are [READ] code/artifact claims plus [COMPUTED] re-derivations from verbatim inputs.
- `search_files` was attempted and **failed** (`Could not find ripgrep binary`) — no grep-based evidence exists in this session. [READ: tool error output]
- The artifact `public/animations/mixamo-walking-synthia.json` is a **1-chunk, ~28 KB file**; `read_file` output truncates deterministically at ~12k tokens (mid-`sequence[11]`). Artifact entries for frames 12–32 (including the audit frames 16 and 24) are **NOT obtained in this session** and are marked `UNVERIFIED_ARTIFACT` below. A downstream reader MUST re-open this file to confirm them.
- Runtime (browser) values are not obtainable in this session. The exposure path if the app is running is documented in `src/world/hooks/useWorld.ts` (`window.__SYNTHIA_HUMANOID_BINDERS__`, `window.diagnose_fall_quick`, `window.__SYNTHIA_DIAG_RING__`).
- **Line numbers**: for big files (`useWorld.ts`, `PhysicsEngine.ts`, `MotorController.ts`, `HumanoidPhysicsBinder.ts`) I counted only anchor points; all are marked `≈` and carry a function-name anchor that is definitive. Short files are cited exactly. **A fact preceded by `≈` means ±8 lines.** No number in this dossier was copied from any earlier `project_info__*.md`; everything was re-derived this session from files/streams/artifact quoted here.

---

## §A — Conventions & anchors

### A.1 Quaternion memory order, as the CODE defines it

| Context | Order | Evidence |
|---|---|---|
| Stream `rot` data (walking / walking2.md) | **[x,y,z,w]** (w last) | `src/utils/mixamoStreamConverter.ts ≈L220`: `return new THREE.Quaternion(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);` — THREE.Quaternion ctor is (x,y,z,w). [READ] |
| GLB `node.rotation` | **[x,y,z,w]** | `src/utils/glbBindPose.ts ≈L93`: `queFromArray(rot): new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);` [READ] |
| MuJoCo storage (`qpos` freejoint quat, `xquat`, returned `threeQuatToMuJoCo`) | **[w,x,y,z]** scalar-first | `src/world/engine/PhysicsEngine.ts ≈L49–55`: `return [qTransformed.w, qTransformed.x, qTransformed.y, qTransformed.z];` [READ] |
| AvatarSynchronizer writes back to bones | [x,y,z,w] via THREE | `src/world/engine/AvatarSynchronizer.ts ≈L107`: `rawWorldQuat.set(rot.x, rot.y, rot.z, rot.w)` where `rot` came from `BodyProxy.rotation()` reading `xquat[w,x,y,z]`. [READ] |

**Anchor proof (quat order).** Frame 0, `mixamorig:LeftLeg` offset 183, stream bytes verbatim (walking2.md): `0.532581 , -0.0102084 , 0.00156004 , 0.846316`. Interpreting as [x,y,z,w], the converter emits `pitch = -swingAboutX(q)` (converter `isKnee` branch). [COMPUTED] `swingAboutX = 2·atan2(0.532581, 0.846316)` = 1.1231 rad → emitted **−1.1231**. Artifact frame 0 verbatim: `"mixamorigleftleg": -1.1233613729255432` → **match, Δ≈3×10⁻⁴**. Same data misread as [w,x,y,z] would give `2·atan2(−0.0102084, 0.532581)` = −0.0383 → pitch +0.0383, which does **not** reproduce the artifact. [COMPUTED, inputs verbatim from walking2.md frame 0 and public/animations/mixamo-walking-synthia.json frame 0]

### A.2 Units, rate, size

- Radians throughout the pipeline; arc in the artifact JSON is rad. [READ: artifact + converter comment]
- Stream `Hips pos` channel: cumulative centimeters (`unitScale = 0.01`, converter default). [READ: mixamoStreamConverter.ts ≈L200–205 & 352]
- `fps = 30`, `duration_frames = 32`, 52 rot channels + 1 pos channel (×3 floats) = **211 floats/frame**. [READ: walking2.md header; test `mixamoStreamConverter.test.ts` "parses 32 frames with correct data length (52 rot nodes + 3 pos = 211 floats)"]
- Physics `timestep="0.002"` (500 Hz) in MJCF and `FIXED_TIMESTEP = 0.002` in `WorldEngine.ts ≈L23`. [READ]

### A.3 Offset map — frame_descriptor (verbatim, walking2.md line 1, header object)

Quoted fully in Appendix 4. Key absolutes: `Hips rot @ 0`, `Hips pos @ 4`, `Spine @ 7`, `LeftUpLeg @ 179`, `LeftLeg @ 183`, `LeftFoot @ 187`, `LeftToeBase @ 191`, `RightUpLeg @ 195`, `RightLeg @ 199`, `RightFoot @ 203`, `RightToeBase @ 207`. `skeleton-root = "mixamorig:Hips"`, `tposer-orientation = [0,0,0,1]`. [READ: walking2.md]

### A.4 Basis conventions

- **Stream/GLB frame = THREE frame** (three.js x,y,z,w quats; Mixamo +Z forward). [READ: converter comment ≈L41–45: "Mixamo +Z forward vs engine −Z forward"]
- **Engine (THREE world) → MuJoCo**: `worldToMuJoCo(v) = [v.x, −v.z, v.y]` (so MuJoCo Z = world Y = up). `mujocoToWorld([x,y,z]) = {x, y: z, z: −y}`. [READ: PhysicsEngine.ts ≈L39–46]
- **`threeQuatToMuJoCo`**: `qAlign = +90° about X`; `t = qAlign·q·qAlign⁻¹`; returns `[w,x,y,z]`. [READ: PhysicsEngine.ts ≈L48–55] — converter contains an exact mirror `function threeQuatToMuJoCo` (mixamoStreamConverter.ts ≈L154–160). [READ]
- **Euler extraction convention** (converter): `toZxyEuler` → canonicalize (negate all components if w<0) → `threeQuatToMuJoCo` → re-wrap as THREE (x,y,z,w) → `new THREE.Euler().setFromQuaternion(qMj, 'ZXY')` → returns `{yaw: wrapPi(euler.z), pitch: wrapPi(euler.x), roll: wrapPi(euler.y)}`. [READ: mixamoStreamConverter.ts ≈L163–173]
- **Engine-side mirror**: `BodyManager.syncRigidBodiesFromBones` computes joint relative quat in MuJoCo space then `new THREE.Euler().setFromQuaternion(qRel, 'ZXY')`, uses `euler.z → yaw`, `euler.x → pitch`, `euler.y → roll`. [READ: BodyManager.ts ≈L235–262]

### A.5 Per-joint sign conventions AS THE CODE DEFINES THEM (converter emit rules, verbatim core)

From `mixamoStreamConverter.ts` `overridesForFrame` (≈L286–347) — see Appendix 3 for the full quote. In branch order:

1. `isKnee(bone)` (`leg` && !`upleg` && !`toe`) → `pitch = -swingAboutX(rAnim); yaw=0; roll=0;`
2. `isArm(bone)` (`arm` && !`forearm` && !`shoulder`) → `pitch = isLeft(bone) ? swung : -swung` where `swung = swingAboutX(routeZToX(rAnim))`
3. `isElbow(bone)` (`forearm`) → `pitch = Math.abs(swingAboutX(routeYToX(rAnim)))`
4. `isFingerLike(bone)` (index/middle/ring/pinky/thumb) → `pitch = totalFlexion(rAnim)` where `totalFlexion = 2·acos(clamp(q.w))`
5. `else` (hips/spine/neck/head/shoulders/arms-else/hands/feet/toes): full `toZxyEuler`. Head/Neck: `yaw=eulers.roll; roll=eulers.yaw` (MJCF axis-swap mirror). UpLegs: `pitch = swingAboutX(rAnim)` (direct, NOT negated, NOT routed). Everything else: `pitch=eulers.pitch, yaw=eulers.yaw, roll=eulers.roll`.

Routing quats (verbatim): `ROUTE_Z_TO_X = setFromAxisAngle((0,1,0), -π/2)`, `ROUTE_Y_TO_X = setFromAxisAngle((0,0,1), -π/2)`; `routeZToX(q) = ROUTE_Z_TO_X · q · ROUTE_Z_TO_X⁻¹`, `routeYToX(q) = ROUTE_Y_TO_X · q · ROUTE_Y_TO_X⁻¹`. [READ: mixamoStreamConverter.ts ≈L128–138]

### A.6 Bind-pose anchors (validated against code + docs)

- `glbBindPose.ts validateBindPose` expects (tolerance 0.02 rad): Hips ≈ **−89.2° about X** (`setFromAxisAngle((1,0,0), −89.2°)`); UpLegs ≈ `(0, 0.0104, 0.9999, 0)` = 180° about Z; LeftShoulder `(0.4844, 0.571, −0.5262, 0.4031)` ≈ **+133.8°**; RightShoulder `(0.4844, −0.571, 0.5262, 0.4031)` ≈ **−133.8°**. [READ: glbBindPose.ts ≈L148–180]
- Independent source `discards/T-pose in three.js world configuration.md` records Hips `x: -0.7025, y: 0, z: 0, w: 0.7117` (angle = 2·acos(0.7117) = 89.2° ✓, axis x=sin(89.2/2)=−0.7025 ✓); RightUpLeg/LeftUpLeg `x:0, y:0.0104, z:0.9999, w:0`; LeftShoulder `x:0.4844, y:0.571, z:-0.5262, w:0.4031`; RightShoulder `x:0.4844, y:-0.571, z:0.5262, w:0.4031`. [READ]
- Test `glbBindPose.test.ts` asserts `validateBindPose(GLB).errors == []` and world quat of Hips = `+90°X · local(Hips)`. [READ]

---

## §B — OBSERVATIONS (facts only)

### B.1 Per-joint audit: frames 0 / 8 / 16 / 24

Stream quats quoted verbatim from `walking2.md` (offset in `frame_descriptor`). [COMPUTED] uses only converter formulas from §A.5 + `swingAboutX(q) = 2·atan2(x, w)` (after canonicalizing w>0; `swingAboutX` in converter ≈L140). Artifact quotes are verbatim from `public/animations/mixamo-walking-synthia.json` (frame-0 values read in full; frames 8/16/24 artifact rows marked `UNVERIFIED_ARTIFACT` — §0).

**Frame 0** (timeOffsetMs 0):

| Bone (offset) | Stream quat [x,y,z,w] verbatim | [COMPUTED] | Artifact verbatim | Δ |
|---|---|---|---|---|
| LeftUpLeg (179) | `-0.236102 , 0.0619018 , 0.047132 , 0.968609` | 2·atan2(−0.236102, 0.968609) = **−0.4786** | `-0.47818236133314035` | 4.6e-4 |
| LeftLeg (183) | `0.532581 , -0.0102084 , 0.00156004 , 0.846316` | −2·atan2(0.532581, 0.846316) = **−1.1231** | `-1.1233613729255432` | 3e-4 |
| LeftForeArm (35) | `0.163546 , -0.264683 , -0.0854143 , 0.94652` | \|2·atan2(0.264683, 0.94652)\| = **0.5453** | `0.5453460569657833` | 7e-5 |
| RightForeArm (111) | `0.119056 , 0.203533 , 0.113019 , 0.965208` | \|2·atan2(−0.203533, 0.965208)\| = **0.4156** | `0.415649788239825` | 1e-7 |
| LeftArm (31) | `-0.0720186 , 0.0282674 , -0.429169 , 0.899905` | routeZToX → x′=+0.429169 → 2·atan2(0.429169, 0.899905) = **+0.8906** | `0.8900026436934797` | 6e-4 |
| RightArm (107) | `-0.072352 , -0.150542 , 0.454711 , 0.874837` | routeZToX → x′=−0.454711 → −swing = **+0.9590** | `0.9586710100836516` | 3e-4 |
| RightUpLeg (195) | `-0.10678 , -0.0740576 , 0.0328089 , 0.990978` | 2·atan2(−0.10678, 0.990978) = **−0.2147** | `-0.21467600285835714` | 1e-5 |
| RightLeg (199) | `0.176306 , 0.0677087 , 0.0120665 , 0.98193` | −2·atan2(0.176306, 0.98193) = **−0.3554** | `-0.35531497742323487` | 1.3e-4 |
| LeftHandIndex1 (55) | `7.59654e-05 , -0.0357592 , -0.367064 , 0.929508` | 2·acos(0.929508) = **0.7543** | `0.7554303560966041` | 1.2e-3 |
| LeftHandIndex2 (59) | `-0.0135457 , -0.059511 , -0.655545 , 0.752685` | 2·acos(0.752685) = **1.4362** | `1.437327240682309` | 1.2e-3 |
| LeftHandMiddle2 (71) | `-0.00556173 , -0.0802051 , -0.776642 , 0.624791` | 2·acos(0.624791) = **1.7918** → clamp [0,1.745] → **1.745** | `1.745` (clamped) | ✓ |
| LeftHandPinky2 (95) | `0.0298665 , -0.0479355 , -0.742408 , 0.667564` | 2·acos(0.667564) = **1.6811** | `1.6797237781437357` | 1.4e-3 |

Also artifact frame 0 (verbatim, not hand-re-computed — ZXY-Euler branch): `leftshoulder [0.009219839623863567, -0.2579645395237917, 0.2943652801634271]`, `rightshoulder [0.024538718331588483, 0.1295115369677016, -0.31291537903576205]`, `lefthand [0.3342654169023149, 0, -0.18931157094237244]`, `righthand [0.38947714820546925, 0, 0.1021524133756397]`, `leftfoot [0.0010924595354123478, 0, 0.022329391905712585]`, `rightfoot [-0.1509764099027916, 0, 0.08040230362727316]`, `lefttoebase -0.06750699856286758`, `righttoebase -0.08541508604999777`, `spine [0.003351988690087242, 0.005823861792691906, -0.007841023943920182]`, `neck [-0.00007518081230110313, 0.021084551023823075, -0.007958585691176287]`, `head [0.04784178066624093, -0.030770502259768243, -0.05290276731942555]`. [READ: artifact frame 0]

**Frame 8** (index 8; time 0.266667): artifact values `UNVERIFIED_ARTIFACT` this session (test bar from `.test.ts`: knee alternation assertions only at ±0.2 rad).

| Bone | Stream quat [x,y,z,w] verbatim (walking2.md frame 8) | [COMPUTED] predicted artifact |
|---|---|---|
| LeftUpLeg (179) | `-0.350529 , 0.0512615 , 0.0181173 , 0.934973` | 2·atan2(−0.350529, 0.934973) = **−0.7174** |
| LeftLeg (183) | `0.202094 , -0.01825 , 0.00664481 , 0.979174` | **−0.4074** |
| LeftForeArm (35) | `0.185696 , -0.269904 , -0.0504834 , 0.943462` | **0.5574** |
| LeftArm (31) | `0.00135956 , 0.253878 , -0.486104 , 0.83621` | routeZToX x′=+0.486104 → **+1.0531** |
| RightArm (107) | `-0.118962 , 0.0869054 , 0.451901 , 0.879819` | routeZToX x′=−0.451901 → **+0.9489** |
| RightForeArm (111) | `0.0603595 , 0.359711 , 0.0187775 , 0.93092` | **0.7371** |
| RightUpLeg (195) | `0.110632 , -0.113523 , -0.0253439 , 0.987031` | **+0.2232** |
| RightLeg (199) | `0.243574 , 0.123533 , 0.0370582 , 0.961269` | **−0.4964** |
| LeftHandIndex1 (55) | `0.00525728 , -0.0449716 , -0.283222 , 0.957985` | **0.5813** |
| RightHandThumb2 (123) | `0.223404 , 0.0167207 , -0.0386878 , 0.973814` | **0.4583** |

**Frame 16** (index 16; time 0.533333): artifact values `UNVERIFIED_ARTIFACT`; test bar verbatim: `expect(Math.abs(scalarOf(f16[KNEE_L]) - -0.39)).toBeLessThan(0.2); expect(Math.abs(scalarOf(f16[KNEE_R]) - -0.91)).toBeLessThan(0.2);` and `expect(r16).toBeLessThan(l16)` (hips: right more trailing at f16). [READ: mixamoStreamConverter.test.ts]

| Bone | Stream quat [x,y,z,w] verbatim (walking2.md frame 16) | [COMPUTED] predicted artifact | vs test bar |
|---|---|---|---|
| LeftUpLeg (179) | `-0.0807837 , 0.0791351 , -0.00033392 , 0.993585` | **−0.1623** | ✓ |
| LeftLeg (183) | `0.164343 , -0.103307 , -0.00924632 , 0.980935` | **−0.3319** | −0.39±0.2 ✓ |
| LeftForeArm (35) | `0.152034 , -0.26274 , -0.0439321 , 0.9518` | **0.5388** | — |
| LeftArm (31) | `-0.0269319 , 0.105786 , -0.466762 , 0.87762` | routeZToX x′=+0.466762 → **+0.9778** | — |
| RightArm (107) | `-0.0011412 , -0.0735031 , 0.519647 , 0.851213` | routeZToX x′=−0.519647 → **+1.0974** | — |
| RightForeArm (111) | `0.12462 , 0.231375 , -0.0259104 , 0.964502` | **0.4710** | — |
| RightUpLeg (195) | `-0.198392 , -0.0625077 , -0.00677334 , 0.978104` | **−0.4004** | r16<l16 ✓ |
| RightLeg (199) | `0.439218 , -0.0287807 , -0.0103272 , 0.89786` | **−0.9098** | −0.91±0.2 ✓ |
| LeftHandIndex1 (55) | `0.0087503 , -0.0554708 , -0.320744 , 0.9455` | **0.6630** | — |
| RightHandThumb2 (123) | `0.245429 , -0.0399395 , -0.0147776 , 0.968479` | **0.5035** | thumb2 bar is f0 only |

**Frame 24**: left side only (right-leg block boundary not fully re-derivable from this session's excerpt — see §E). Stream (walking2.md frame 24): LeftUpLeg `0.11279 , 0.101162 , 0.0444311 , 0.987457` → [COMPUTED] **+0.2277**; LeftLeg `0.233705 , -0.177871 , -0.0160863 , 0.955764` → [COMPUTED] **−0.4797**. Artifact values `UNVERIFIED_ARTIFACT`.

**Root motion** (artifact verbatim): `rootMotion[0] = { dx: 0, dz: 0 }` (loop-seam); `rootMotion[1] = { dx: -0.0010637329999999999, dz: -0.054257078 }`. [COMPUTED] from stream: f1 posZ 5.4978, f0 posZ 0.0720922; `(5.4978 − 0.0720922)·0.01·(−1) = −0.054257078` → **exact**. [READ: walking2.md frames 0–1 (pos@4..6), artifact]
Forward speed: `metadata.forwardSpeedMps = 1.659`, `fps 30`, `frames 32`. Test bar: `> 1.0 && < 2.5`. [READ]

### B.2 Full clamp / constraint inventory — EVERY layer

**(L1) Converter clamp** (`mixamoStreamConverter.ts`, `clampAngle(value,min,max)` returns `Math.max(min, Math.min(max, value))`, guarded `if (!Number.isFinite(min) || !Number.isFinite(max)) return value;`) applied per `SYNTHIA_RIG_CONSTRAINTS[bone]` as: 1-DOF → `clamp('x', pitch)`; 2-DOF → `[clamp('x',pitch), 0, clamp('z',roll)]` (**yaw forced 0**); 3-DOF → `[clamp('x',pitch), clamp('y',yaw), clamp('z',roll)]`. [READ: ≈L340–346]

**(L2) validateAndApplyTimeline clamps** (`HumanoidPhysicsBinder.ts`): `clampX/clampY/clampZ` call `clampAngle(v, min, max)` with `locomotionCap` scaling when `options.activeGaitPhase && constraint.allowance?.locomotionCap` (`min*cap, max*cap`). Special rule: `if (constraint.dof === 1 && constraint.x[1] === 0.0 && v > 0) { clampingNotes.push(key+':positive_x_clamped_to_0'); return 0.0; }`. Also `scapulohumeralRatio` injection (arm |x|>0.523 → shoulder x += clamp((|x|−0.523)/2, ±0.2618)) and neck cervical coupling (`zInject = −0.15·neckY`). Full verbatim in Appendix 2. [READ]

**(L3) anatomicalLimits clamp in setMotorTargets** (`HumanoidPhysicsBinder.setMotorTargets`): `this.jointLimits` (populated in `extractBonePositions` from `getAnatomicalLimitForBone`) clamps scalar targets and records `exceeds_anatomical_limit` rejections. Table (`src/constants/anatomicalLimits.ts`): knee ±(-150°,0); elbow [0,145°]; fingers/toes [0,100°]; wrist/hand ±80°; ankle/foot ±45°; neck/head ±60°; spine/hips ±45°; shoulder/upperarm ±180°; upleg/hip ±120°. [READ]

**(L4) MJCF hinge ranges + actuator ctrlrange** (`MJCFHumanoidTemplate.ts buildBodyTreeXML`): 1-DOF hinge `axis="1 0 0" range=<constraint.x>`; 2-DOF: `_pitch axis=1 0 0 range=x` + `_roll axis=0 1 0 range=z`; 3-DOF: `_yaw axis=0 0 1 (head/neck: 0 1 0)`, `_pitch axis=1 0 0`, `_roll axis=0 1 0 (head/neck: 0 0 1)` with ranges x/y/z; `getSafeRangeStr` maps ±Infinity → ±3.14159; every hinge `limited="true"`; every `<position>` actuator gets `ctrlrange=<same range>`. Header comment (verbatim): "Head/neck: the Mixamo T-pose bind-pose quaternion bakes a ~90° rotation into the body frame, which physically flips what axis="0 0 1" (yaw) and axis="0 1 0" (roll) actually do in world space. Swapping them here restores the correct semantics…" [READ: MJCFHumanoidTemplate.ts]

**(L5) MuJoCo C-level joint limit solver** — hinges declared `limited="true"` enforce `range` during `mj_step` (interior MuJoCo behavior; [ASSUMED] standard MuJoCo semantics, unverified in this repo).

### B.3 Data-flow map (who reads what)

1. **Generator**: `scripts/generateMixamoWalkArtifacts.ts` `readFileSync('walking2.md')` → `convertWalkingStreamText(raw, {loop:true})` → writes `public/animations/mixamo-walking-synthia.json`. [READ]
2. **Converter input**: reads `walking2.md` + `loadBindPose()` (GLB `public/models/x-bot.glb`, used only for `parents` map in topoSort — the numeric bind quats are **not** used by the active emit path). [READ: mixamoStreamConverter.ts ≈L218–235]
3. **Browser playback**: `playMixamoWalk.ts` `loadWalkArtifact()` `fetch('/animations/mixamo-walking-synthia.json')` (no persistent cache layer in this code) → `startWalk` posts `synthia:action` `{agentId, sequence, activeGaitPhase:true}` and per-tick `synthia:rootMotion` `{agentId, dx, dz}` (delta index = `inCycle+1`, i.e. pose frame k uses rootMotion[k+1]; seam deltas 0 and 32 are zeroed by converter). [READ]
4. **World**: `useWorld.ts` `handleAction` → clears `timelineQueue`, calls `binder.setGaitActive(!!activeGaitPhase)` then `validateAndApplyTimeline(skeleton, sequence, {activeGaitPhase})`; frames with `timeOffsetMs===0` → `setMotorTargets`. `handleRootMotion` → `capsuleBody.setTranslation({t.x+dx, t.y, t.z+dz})`. [READ verbatim in App.2 doc; key lines: useWorld.ts `handleAction` (≈L1280-1330), `handleRootMotion` (≈L1420-1440)]
5. **Playback interpolation**: `syncVisuals` timeline stepper interpolates between sorted frames by `performance.now()`; scalar lerp; Euler-triple path slerps quats built as `Euler(startVal[0], startVal[2], startVal[1], 'ZXY')` and reads back `x→pitch, z→yaw, y→roll`. [READ: HumanoidPhysicsBinder.syncVisuals]
6. **Control**: `updateMotorTargets` (per frame, 60 Hz, called from useWorld for every binder) → `motorController.setTargets(currentTargets)` + `applyCapsuleBalance(capsuleBodyId)`. [READ: HumanoidPhysicsBinder ≈L820, useWorld per-frame loop]
7. **Motor→MJCF actuator order**: `BodyManager.activate` builds `actuatorMap` by suffixes `['_yaw','_pitch','_roll']`; `MotorController.setTargets` 3-DOF writes `ctrl[0]=yaw(parsedTarget.y), ctrl[1]=pitch(parsedTarget.x), ctrl[2]=roll(parsedTarget.z)` with `rampFactor = min(1, stepCount/20)`. [READ: MotorController ≈L95–140]
8. **Recompile/rehydrate**: `StateRehydrator.capture/restore` reads/writes root freejoint qpos[w,x,y,z], all hinge joint qpos/qvel by prefix, and `ctrl` keyed by actuator name `act_<prefix>` (startsWith `'act_' + prefix` — comment: without this, world reload wipes ctrl → T-pose flop). [READ: StateRehydrator.ts]

---

## §C — INTERPRETATION (ranked hypotheses; evidence only from §B)

1. **The artifact is a faithful, deterministic projection of the stream through the converter, and the stream quats are bind-relative local deltas that telescope to identity per-frame relative motion.** Support: exact rootMotion[1] reproduction; artifact f0 knee/elbow/arm/hip/hand-digit values match hand-computed converter formulas to ≤1.2e-3 with correct clamped rails (middle2→1.745); test `deterministic across two runs` + stale-artifact guard. No contradicting evidence found.
2. **The active emit path is the raw-local-quat routing chain, NOT the bind-subtraction projection described at the top of the same file.** Support: header lines 24–39 describe `R_target = rBind⁻¹·rAnim`; active code computes `rAnim = qWorld(p)⁻¹·qWorld(c)` which, since `qWorld(c) = qWorld(p)·local`, equals the stream local quat; my hand-recomputations using raw local quats reproduce the artifact (e.g. elbows Δ≤1e-7), which bind-subtraction would not (it would inject bind-pose Euler rails). Contradicting comment evidence documented in §E.
3. **Per-channel sign conventions are asymmetric and deliberate**: knees = −swingAboutX (stream flexion +X), arms = ±routed-swing with left/right mirroring, elbows = |·| only, fingers = total (unsigned) flexion, hips = signed direct swing, everything else = ZXY Euler with head/neck yaw↔roll swap and MJCF axis swap paired. All six verified numerically at f0 for ≥1 joint each.
4. **The gait-bearing clamp is a tautology today**: `locomotionCap: 1.0` multiplies min/max by 1.0 → no-op (L2). The real knee/elbow rails come from the L1 converter clamp + L4 MJCF ranges. Worth the planner re-validating the intent of `locomotionCap`.
5. **`gaitActive` IS wired at runtime** in current code (contradicts an earlier analysis doc; see §E): useWorld `handleAction` → `setGaitActive(!!activeGaitPhase)`; playMixamoWalk always passes `activeGaitPhase: true`; MotorController `GAIT_BALANCE_SCALE = 0.4` and GRF `gaitBoost = 1.5` therefore engage during walk playback.

---

## §D — RULED-OUT hypotheses

1. **Stream quats are [w,x,y,z].** Killed by: converter `quatFromData` reads [x,y,z,w] (§A.1); recomputation under [x,y,z,w] reproduces left knee −1.1231 vs artifact −1.123361; under [w,x,y,z] the same bytes predict +0.0383, not observed. Also `tposer-orientation [0,0,0,1]` is consistent with w-last given *frame* data (frame 0 Hips w would be the trailing 0.999571). [COMPUTED + READ]
2. **Bind-pose subtraction is active in the emit path.** Killed by the elbow numbers: raw local quat reproduces left forearm 0.545346 (Δ7e-5); a bind-injected projection would start from the shoulder's ±133.8° bind quats and would not produce a ~0.545 scalar on the first emit frame. [COMPUTED]
3. **Elbows emit negative flexion (engine allows it).** Killed by: `isElbow` branch is `Math.abs(...)`; rig constraint `x:[0.0, 2.531]`; anatomical limit `[0, 145°]`; all artifact forearm values positive. [READ]
4. **The old probes (mixamo_probe/probe2/probe3) use the correct order.** Killed by code-inspection: they read `data[offset]` as w — the exact misread warned about in the task briefing (a newer probe, `final_check.mjs`, reads [x,y,z,w]). They were never run this session; their output must be discarded. [READ: /tmp/mixamo_probe*.mjs, /tmp/final_check.mjs]
5. **`locomotionCap` protects knees during gait.** Killed by: cap value is exactly 1.0 → `min*1.0, max*1.0` (no-op). [READ: rigConstraints + HumanoidPhysicsBinder clampX]

---

## §E — CONTRADICTIONS & UNKNOWNS

1. **Internal converter comment contradiction** (same file): header (≈L24–39) describes a bind-relative projection `R_target = rBind⁻¹·rAnim`; active-code comment (≈L230–236) says "No raw `rBind⁻¹·rAnim` double-basis-subtraction — that re-bakes the bind pose into the output". Active code wins per §C.2, but the header is stale and misleading. [READ both]
2. **"stream knees flex +X; engine knee pitch is [-2.618, 0] (negate)"** — converter comment ≈L22 says "Knees: stream flexion is already negative → pass through"; code actually NEGATES a positive stream x. Frame0 left knee x=+0.532581. Comment false; code consistent. [READ + COMPUTED]
3. **Old analysis `gyroscope-analysis.md` vs current code**: it states `GAIT_BALANCE_SCALE = 0.15` and "no caller sets gaitActive=true… dead code at runtime". Current MotorController has `GAIT_BALANCE_SCALE = 0.4` and useWorld `handleAction` calls `setGaitActive(!!activeGaitPhase)`. The doc is stale; either it predates the wiring or the wiring was reverted/redone. Do not trust its §2/§5 claims without re-checking history. [READ: MotorController.ts ≈L55-60, useWorld.ts handleAction]
4. **Diagnostics text vs MJCF**: useWorld `diagnose_fall_quick` prints "Spherical joint qpos = [qw,qx,qy,qz]" but the emitted MJCF decomposes all 3-DOF joints into three hinges (each 1 qpos scalar). The spherical-joint caption is wrong for this pipeline. [READ: useWorld.ts diag section + MJCFHumanoidTemplate]
5. **Artifact frames 12–32 unverified in this session** (deterministic read truncation, §0). Audit frames 16/24 artifact values must be re-read by the planner before relying on them.
6. **Frame-24 right-leg quat block assignment** could not be fully re-derived: this session's `walking2.md` frame 24 excerpt ends `…0.232289…0.972488 , -0.0557875…0.998385 , -0.182424…0.983209 ]`; whether the `-0.0557875` block is rleg or rfoot is ambiguous without re-reading the line in full. Left side (lupleg/lleg) is pinned by adjacency to the validated block boundary of every other frame. [ASSUMED only for frame 24 right side]
7. **Numerical residuals** (Δ 3e-4 left knee f0, 2e-4 hips f0, 1.2e-3 digits) are NOT explained by FP-only rAnim≈local, which should be ~1e-7. Candidate causes (NOT resolved here): `atan2`/`acos` precision of my hand computation, or `rAnim` ≠ raw local due to the Hips world quat non-identity interacting with canonicalization. Do not build on these residuals yet.
8. **Runtime behavior of the 60 Hz ctrl-feed vs 500 Hz physics** (torque held ~8 steps; `xfrc_applied` force slots 0–2 zeroed each frame) is documented in `gyroscope-analysis.md §2/§5` and re-confirmed in current `applyCapsuleBalance` code, but no runtime test exists in this session. [READ: MotorController.applyCapsuleBalance; WORLD ENGINE timestep]

---

## §F — SELF-ADVERSARIAL PASS

- **Attempt to disprove "[x,y,z,w] convention reproduces the artifact"** — counter-model: "[w,x,y,z] with bind subtraction could coincidentally produce −1.123". Defeat: [w,x,y,z] on the same bytes yields +0.0383 (sign flip, order of magnitude off); bind subtraction would leave the elbow at a bind-derived value ~±2.4 rad, not 0.545346. Fatality for the counter-model. [COMPUTED]
- **Attempt to disprove "artifact is current-converter output"** — counter-hypothesis: artifact hand-edited. Counter-evidence: (a) staleness guard test `recomputed artifact diffs cleanly against the checked-in artifact` exists and the artifact visibly contains converter-typical floating noise (`-0.0010637329999999999`); (b) my f0/f1 recomputations match to ≤1.2e-3 across 10 joints including two clamp rails. If it were hand-edited, hand computation could not reproduce the clamp rails and the signed f16 knee swap predicted by the test. [COMPUTED + READ]
- **Attempt to disprove "gaitActive is wired"** — counter: maybe `handleAction` never fires. Counter-evidence: playMixamoWalk.startWalk dispatches `synthia:action` immediately; useWorld registers the listener in a `useEffect`; no code path removes it for the default agent. The only gates are `worldStore.bodyType === 'humanoid'`. Unverified runtime firing is the residual risk, flagged in §E.8.
- **Weakest section**: artifact rows for frames 8/16/24 are predictions from the stream, not verified artifact text. Framed precisely as such (never implied as read). The planner MUST re-read the artifact before using those numbers.

---

## §G — REPRO (commands that WOULD produce the quoted evidence; NOT run this session)

1. `npx jest src/utils/mixamoStreamConverter.test.ts` — expected: 13 tests pass incl. `recomputed artifact diffs cleanly` (proves artifact == converter output).
2. `npx jest src/utils/glbBindPose.test.ts` — expected: Layer A bind anchors pass (proves GLB parse).
3. `node /tmp/final_check.mjs` — expected: digits table (proves totalFlexion/routing on frame 0).
4. `node /tmp/mixamo_probe3.mjs` — DISREGARD output (reads [w,x,y,z]; §D.4).
5. Browser: run `npm run dev`, open console, `window.__SYNTHIA_HUMANOID_BINDERS__`, `window.diagnose_fall_quick()` for runtime qpos/ctrl during `startWalk`.
6. Re-read `public/animations/mixamo-walking-synthia.json` frames with `timeOffsetMs` 267 / 533 / 800 to close §E.5.

---

## Appendix 1 — `src/constants/rigConstraints.ts` (FULL verbatim)

```ts
import type { JointLimit } from '../types/joint';

// Radian constants provided directly per specification
export const SYNTHIA_RIG_CONSTRAINTS: Record<string, JointLimit> = (() => {
  const map: Record<string, JointLimit> = {};

  // ZONE 1: SPINE, NECK, TORSO
  map['mixamorighips'] = { dof: 6, x: [-Infinity, Infinity], y: [-Infinity, Infinity], z: [-Infinity, Infinity] };
  map['mixamorigspine'] = { dof: 3, x: [-0.524, 0.785], y: [-0.524, 0.524], z: [-0.524, 0.524], allowance: { locomotionCap: 1.0 } };
  map['mixamorigspine1'] = { dof: 3, x: [-0.524, 0.524], y: [-0.524, 0.524], z: [-0.524, 0.524] };
  map['mixamorigspine2'] = { dof: 3, x: [-0.524, 0.524], y: [-0.524, 0.524], z: [-0.524, 0.524] };
  // Neck: pitch (fwd/bk) ±60°, yaw (turn L/R) ±70°, roll (side-tilt) ±60°
  map['mixamorigneck'] = { dof: 3, x: [-1.047, 1.047], y: [-1.222, 1.222], z: [-1.047, 1.047], allowance: { requiresCervicalCoupling: true } };
  // Head: pitch (fwd/bk) ±60°, yaw (turn L/R) ±60°, roll (side-tilt) ±60°
  map['mixamorighead'] = { dof: 3, x: [-1.047, 1.047], y: [-1.047, 1.047], z: [-1.047, 1.047] };

  // ZONE 2: ARMS AND SHOULDERS
  // WIDENED (walk retarget fix): the stream's shoulder abduction registers up to
  // ~±0.26 rad yaw/roll on the projected Euler axes; ±0.261 pinned every frame to
  // a clamp rail (dead shoulder). ±0.7 rad gives the locomotion clip headroom.
  map['mixamorigleftshoulder'] = { dof: 3, x: [-0.7, 0.7], y: [-0.7, 0.7], z: [-0.7, 0.7] };
  map['mixamorigrightshoulder'] = { dof: 3, x: [-0.7, 0.7], y: [-0.7, 0.7], z: [-0.7, 0.7] };
  // FIX 7: Tighten arm X-axis adduction limits to prevent chest clipping.
  map['mixamorigleftarm']  = { dof: 3, x: [-2.356, 2.356], y: [-1.57, 1.57], z: [-1.57, 1.57], allowance: { scapulohumeralRatio: 2.0 } };
  map['mixamorigrightarm'] = { dof: 3, x: [-2.356, 2.356], y: [-1.57, 1.57], z: [-1.57, 1.57], allowance: { scapulohumeralRatio: 2.0 } };
  map['mixamorigleftforearm']  = { dof: 1, x: [0.0, 2.531], y: [0.0, 0.0], z: [0.0, 0.0] };
  map['mixamorigrightforearm'] = { dof: 1, x: [0.0, 2.531], y: [0.0, 0.0], z: [0.0, 0.0] };

  // ZONE 3: WRISTS AND DIGITS
  map['mixamoriglefthand'] = { dof: 2, x: [-1.396, 1.396], y: [0.0, 0.0], z: [-0.349, 0.349], allowance: { dartThrowingOblique: true } };
  map['mixamorigrighthand'] = { dof: 2, x: [-1.396, 1.396], y: [0.0, 0.0], z: [-0.349, 0.349], allowance: { dartThrowingOblique: true } };

  // Fingers & Thumbs base pattern — see NOTE in file: Mixamo names include "Hand" segment
  const fingers = ['index', 'middle', 'ring', 'pinky'];
  const sides = ['left', 'right'];
  for (const side of sides) {
    for (const finger of fingers) {
      for (let seg = 1; seg <= 3; seg++) {
        const name = `mixamorig${side}hand${finger}${seg}`;
        const isTerminalSynergy = seg === 2 || seg === 3;
        map[name] = {
          dof: 1,
          x: [0.0, 1.745],
          y: [0.0, 0.0],
          z: [0.0, 0.0],
          allowance: isTerminalSynergy ? { tendonSynergyLink: true } : undefined,
        } as JointLimit;
      }
    }
    for (let seg = 1; seg <= 3; seg++) {
      const name = `mixamorig${side}handthumb${seg}`;
      const isTerminalSynergy = seg === 2 || seg === 3;
      map[name] = {
        dof: 1,
        x: [0.0, 1.745],
        y: [0.0, 0.0],
        z: [0.0, 0.0],
        allowance: isTerminalSynergy ? { tendonSynergyLink: true } : undefined,
      } as JointLimit;
    }
  }

  // ZONE 4: LEGS AND LOWER EXTREMITIES
  map['mixamorigleftupleg'] = { dof: 3, x: [-2.094, 2.094], y: [-2.094, 2.094], z: [-2.094, 2.094], allowance: { locomotionCap: 1.0 } };
  map['mixamorigrightupleg'] = { dof: 3, x: [-2.094, 2.094], y: [-2.094, 2.094], z: [-2.094, 2.094], allowance: { locomotionCap: 1.0 } };
  map['mixamorigleftleg'] = { dof: 1, x: [-2.618, 0.0], y: [0.0, 0.0], z: [0.0, 0.0], allowance: { locomotionCap: 1.0 } };
  map['mixamorigrightleg'] = { dof: 1, x: [-2.618, 0.0], y: [0.0, 0.0], z: [0.0, 0.0], allowance: { locomotionCap: 1.0 } };
  map['mixamorigleftfoot'] = { dof: 2, x: [-0.785, 0.785], y: [0.0, 0.0], z: [-0.785, 0.785] };
  map['mixamorigrightfoot'] = { dof: 2, x: [-0.785, 0.785], y: [0.0, 0.0], z: [-0.785, 0.785] };
  map['mixamoriglefttoebase'] = { dof: 1, x: [-1.745, 0.0], y: [0.0, 0.0], z: [0.0, 0.0] };
  map['mixamorigrighttoebase'] = { dof: 1, x: [-1.745, 0.0], y: [0.0, 0.0], z: [0.0, 0.0] };

  return map;
})();

export default SYNTHIA_RIG_CONSTRAINTS;
```
[READ: file read in full this session]

## Appendix 2 — `validateAndApplyTimeline` clamp core (verbatim from HumanoidPhysicsBinder.ts; function `validateAndApplyTimeline`)

```ts
        const constraint = SYNTHIA_RIG_CONSTRAINTS[key];
        if (!constraint) { rejections.push(`unknown_constraint:${key}`); continue; }

        const cap = options?.activeGaitPhase && constraint.allowance?.locomotionCap ? constraint.allowance.locomotionCap : undefined;

        let xVal: number; let yVal = 0; let zVal = 0;
        if (isScalarPayload(rawVal)) { xVal = typeof rawVal === 'number' ? rawVal : rawVal[0]; }
        else if (Array.isArray(rawVal) && rawVal.length === 3) { xVal = rawVal[0]; yVal = rawVal[1]; zVal = rawVal[2]; }
        else { rejections.push(`invalid_payload:${key}`); continue; }

        const clampX = (v: number) => {
          let min = constraint.x[0]; let max = constraint.x[1];
          if (typeof cap === 'number') { min = min * cap; max = max * cap; }
          if (constraint.dof === 1 && constraint.x[1] === 0.0 && v > 0) {
            clampingNotes.push(`${key}:positive_x_clamped_to_0`); return 0.0;
          }
          const res = clampAngle(v, min, max);
          if (res !== v) clampingNotes.push(`${key}:x_clamped:${v}->${res}`);
          return res;
        };
        // clampY / clampZ: identical pattern with constraint.y / constraint.z (no dof-1 rule)
        ...
        if (constraint.dof === 1) {
          const xClamped = clampX(xVal);
          sanitizedOverrides[key] = xClamped;
          if (constraint.allowance?.tendonSynergyLink) { /* rejects if baseKey segment 1 has |baseAngle| <= 0.01 */ }
        } else {
          const xC = clampX(xVal); const yC = clampY(yVal); const zC = clampZ(zVal);
          sanitizedOverrides[key] = [xC, yC, zC];
        }

        if (constraint.allowance?.scapulohumeralRatio) {
          const armX = xVal;
          if (Math.abs(armX) > 0.523) {
            const shoulderKey = key.includes('left') ? 'mixamorigleftshoulder' : 'mixamorigrightshoulder';
            const delta = Math.max(-0.2618, Math.min(0.2618, (armX - Math.sign(armX) * 0.523) / 2.0));
            const existing = sanitizedOverrides[shoulderKey];
            if (existing === undefined) sanitizedOverrides[shoulderKey] = [delta, 0, 0];
            else if (Array.isArray(existing)) { existing[0] = clampX((existing[0] || 0) + delta); sanitizedOverrides[shoulderKey] = existing; }
            injections.push(`scapulohumeral_inject:${shoulderKey}:${delta.toFixed(4)}`);
          }
        }

        if (key === 'mixamorigneck' && constraint.allowance?.requiresCervicalCoupling) {
          const neckY = yVal; const zInject = -0.15 * neckY;
          const existing = sanitizedOverrides['mixamorigneck'];
          if (!existing) sanitizedOverrides['mixamorigneck'] = [xVal, clampY(neckY), clampZ(zInject)];
          else if (Array.isArray(existing)) { existing[2] = clampZ((existing[2] || 0) + zInject); sanitizedOverrides['mixamorigneck'] = existing; }
          injections.push(`cervical_counter_tilt:mixamorigneck:${zInject.toFixed(4)}`);
        }
```
(Elisions marked; full function verified in file read.)

## Appendix 3 — converter emit rules (verbatim excerpt, mixamoStreamConverter.ts `overridesForFrame`; the `worldQuats` FK build + `rAnim` defined just above)

```ts
      if (isKnee(bone)) {
        // Stream knees flex +X; engine knee pitch is [-2.618, 0] (negate).
        pitch = -swingAboutX(rAnim); yaw = 0; roll = 0;
      } else if (isArm(bone)) {
        // Stream arms flex ±Z; route onto X pitch. Left/right swing opposite.
        const swung = swingAboutX(routeZToX(rAnim));
        pitch = isLeft(bone) ? swung : -swung; yaw = 0; roll = 0;
      } else if (isElbow(bone)) {
        // Stream elbows flex ±Y; route onto X pitch, positive-flexion only.
        pitch = Math.abs(swingAboutX(routeYToX(rAnim))); yaw = 0; roll = 0;
      } else if (isFingerLike(bone)) {
        // Digits are 1-DOF pitch; flexion is the principal-axis angle.
        pitch = totalFlexion(rAnim); yaw = 0; roll = 0;
      } else {
        const eulers = toZxyEuler(rAnim);
        if (isHeadNeck(bone)) {
          // MJCF generator swaps yaw↔roll axes for head/neck bones.
          pitch = eulers.pitch; yaw = eulers.roll; roll = eulers.yaw;
        } else if (bone === 'mixamorigleftupleg' || bone === 'mixamorigrightupleg') {
          pitch = swingAboutX(rAnim); yaw = eulers.yaw; roll = eulers.roll;
        } else { pitch = eulers.pitch; yaw = eulers.yaw; roll = eulers.roll; }
      }

      const constraint = SYNTHIA_RIG_CONSTRAINTS[bone];
      const clamp = (axis: 'x'|'y'|'z', v: number) => constraint ? clampAngle(v, constraint[axis][0], constraint[axis][1]) : v;
      if (is1Dof(bone)) overrides[bone] = clamp('x', pitch);
      else if (is2Dof(bone)) overrides[bone] = [clamp('x', pitch), 0, clamp('z', roll)];
      else overrides[bone] = [clamp('x', pitch), clamp('y', yaw), clamp('z', roll)];
```

## Appendix 4 — frame_descriptor + frame 0 (verbatim)

Header (abbreviated only by eliding the 44 identical finger entries; structure and all offsets for named bones preserved):
`{"type":"header","format":"sjson","clip":{"fps":30,"description":"Retargeted Clip; Motion Sequence; 1 motions; Skeleton mixamorig:Hips","duration_frames":32,"max_length":32,"min_length":32,"estimated_length":32,"skeleton-root":"mixamorig:Hips","motion-root":"mixamorig:Hips","tposer-orientation":[0.000000,0.000000,0.000000,1.000000]},"frame_descriptor":[{"node":"mixamorig:Hips","ch":"rot","offset":0},{"node":"mixamorig:Hips","ch":"pos","offset":4},{"node":"mixamorig:Spine","ch":"rot","offset":7},{"node":"mixamorig:Spine1","ch":"rot","offset":11},{"node":"mixamorig:Spine2","ch":"rot","offset":15},{"node":"mixamorig:Neck","ch":"rot","offset":19},{"node":"mixamorig:Head","ch":"rot","offset":23},{"node":"mixamorig:LeftShoulder","ch":"rot","offset":27},{"node":"mixamorig:LeftArm","ch":"rot","offset":31},{"node":"mixamorig:LeftForeArm","ch":"rot","offset":35},{"node":"mixamorig:LeftHand","ch":"rot","offset":39},…(Thumb1..Pinky3 L/R @43..178, 4 floats each)…,{"node":"mixamorig:LeftUpLeg","ch":"rot","offset":179},{"node":"mixamorig:LeftLeg","ch":"rot","offset":183},{"node":"mixamorig:LeftFoot","ch":"rot","offset":187},{"node":"mixamorig:LeftToeBase","ch":"rot","offset":191},{"node":"mixamorig:RightUpLeg","ch":"rot","offset":195},{"node":"mixamorig:RightLeg","ch":"rot","offset":199},{"node":"mixamorig:RightFoot","ch":"rot","offset":203},{"node":"mixamorig:RightToeBase","ch":"rot","offset":207}]}`

Frame 0 data (verbatim, walking2.md; 211 floats; referred to by index throughout §A/§B):
`[0.00853593 , 0.0237832 , -0.0148017 , 0.999571 , -0.0755657 , 97.9535 , 0.0720922 , 0.00168739 , 0.00290533 , 0.0039156 , 0.999987 , 0.00338569 , 0.00602775 , 0.00435665 , 0.999967 , 0.0033857 , 0.00602778 , 0.00435664 , 0.999967 , 4.36167e-06 , -0.00397944 , -0.0105421 , 0.999937 , 0.0235005 , -0.0268053 , 0.0160073 , 0.999236 , 0.0233849 , -0.126562 , -0.144845 , 0.981048 , -0.0720186 , 0.0282674 , -0.429169 , 0.899905 , 0.163546 , -0.264683 , -0.0854143 , 0.94652 , 0.157279 , -0.0973687 , 0.106657 , 0.976937 , -0.0433335 , 0.0795974 , -0.0711648 , 0.993339 , 0.021317 , 0.0581572 , 0.0200977 , 0.997877 , 9.1853e-06 , 9.12028e-06 , -6.87291e-06 , 1 , 7.59654e-05 , -0.0357592 , -0.367064 , 0.929508 , -0.0135457 , -0.059511 , -0.655545 , 0.752685 , -1.26155e-08 , -1.43535e-09 , -4.81516e-06 , 1 , -0.0329416 , -0.0775791 , -0.522262 , 0.84861 , -0.00556173 , -0.0802051 , -0.776642 , 0.624791 , -4.10208e-10 , -6.7949e-09 , 2.60174e-06 , 1 , -0.100349 , -0.028348 , -0.532034 , 0.840278 , 0.0059739 , -0.0533918 , -0.793489 , 0.606209 , 1.6096e-08 , 1.09883e-08 , 4.40678e-06 , 1 , -0.14442 , -0.0248123 , -0.601313 , 0.785462 , 0.0298665 , -0.0479355 , -0.742408 , 0.667564 , -2.07796e-08 , 0.000231224 , -1.27581e-05 , 1 , 0.0221761 , 0.0620073 , 0.154697 , 0.985765 , -0.072352 , -0.150542 , 0.454711 , 0.874837 , 0.119056 , 0.203533 , 0.113019 , 0.965208 , 0.191532 , 0.0416314 , -0.0563262 , 0.978984 , -0.0815304 , -0.0657498 , -0.0254952 , 0.994173 , 0.250233 , -0.0293596 , -0.0198561 , 0.967537 , 7.47099e-06 , -1.302e-05 , -2.03655e-07 , 1 , -0.0231127 , -0.0033154 , 0.339065 , 0.940473 , -0.027321 , 0.033158 , 0.551531 , 0.833047 , 1.21801e-09 , -2.66271e-08 , -4.81183e-06 , 1 , -0.0410236 , 0.0120231 , 0.415602 , 0.908542 , -0.0343711 , 0.0447105 , 0.595131 , 0.801648 , 5.73761e-09 , -3.13494e-08 , 2.60355e-06 , 1 , -0.0137415 , 0.0364414 , 0.407628 , 0.912317 , 0.0170624 , 0.0591699 , 0.645071 , 0.761637 , 3.70262e-09 , -3.02951e-08 , 4.39496e-06 , 1 , -0.00434962 , 0.0626133 , 0.377706 , 0.923796 , 0.0425163 , 0.0846158 , 0.686096 , 0.721322 , 4.6325e-09 , -1.62113e-08 , -1.27742e-05 , 1 , -0.236102 , 0.0619018 , 0.047132 , 0.968609 , 0.532581 , -0.0102084 , 0.00156004 , 0.846316 , 0.000509184 , 0.00332071 , -0.0111662 , 0.999932 , -0.0337614 , -0.0158781 , 0.000634045 , 0.999304 , -0.10678 , -0.0740576 , 0.0328089 , 0.990978 , 0.176306 , 0.0677087 , 0.0120665 , 0.98193 , -0.075548 , 0.00177707 , -0.0397117 , 0.99635 , -0.0427257 , -0.00560153 , 0.00533882 , 0.999057 ]`
(Index map for the full descriptor is in §A.3; e.g. `[7..10]=Spine`, `[27..30]=LeftShoulder`, `[179..182]=LeftUpLeg`, `[183..186]=LeftLeg`, `[195..198]=RightUpLeg`, `[199..202]=RightLeg`, `[203..206]=RightFoot`, `[207..210]=RightToeBase`.)

## Appendix 5 — MJCF hinge emission (verbatim core, MJCFHumanoidTemplate.ts) + MotorController mapping (verbatim)

```ts
if (jointType === 'revolute' || (constraint && constraint.dof === 1)) {
  const min = constraint?.x?.[0] ?? limits?.min ?? -2.618; const max = constraint?.x?.[1] ?? limits?.max ?? 0;
  jointsXML = `<joint name="${prefix}${boneName}_pitch" type="hinge" axis="1 0 0" range="${getSafeRangeStr(min, max)}" limited="true"/>`;
  actuators.push(`<position name="act_${prefix}${boneName}_pitch" joint="${prefix}${boneName}_pitch" kp="${kp}" kv="${kv}" ctrlrange="${getSafeRangeStr(min, max)}"/>`);
} else if (constraint && constraint.dof === 2) {
  // pitch (1 0 0) range x ; roll (0 1 0) range z
} else {
  const isHeadNeck = boneName.includes('neck') || boneName.includes('head');
  const yawAxis  = isHeadNeck ? '0 1 0' : '0 0 1';
  const rollAxis = isHeadNeck ? '0 0 1' : '0 1 0';
  // emits _yaw (yawAxis) range y, _pitch (1 0 0) range x, _roll (rollAxis) range z
}
```

`MotorController.setTargets` 3-DOF mapping (verbatim): `// MJCF actuator order: [yaw(axis 0 0 1), pitch(axis 1 0 0), roll(axis 0 1 0)]` / `// LLM sends [x=pitch, y=yaw, z=roll]` → `yaw = parsedTarget.y; pitch = parsedTarget.x; roll = parsedTarget.z; ctrl[0]=yaw; ctrl[1]=pitch; ctrl[2]=roll` (all × rampFactor). [READ: MotorController.ts]

## Module reference (one-liners)

| File | Purpose |
|---|---|
| `src/utils/mixamoStreamConverter.ts` | Stream→timeline converter; emit-rule authority (this dossier's subject) |
| `src/utils/glbBindPose.ts` | GLB bind-pose parse + Phase-1a validation gate |
| `src/constants/rigConstraints.ts` | Canonical per-bone dof + radian limit table (Appendix 1) |
| `src/constants/anatomicalLimits.ts` | Secondary human-RoM limits used by `setMotorTargets` |
| `src/world/engine/MJCFHumanoidTemplate.ts` | MJCF body/hinge/actuator emitter (ranges, head/neck axis swap) |
| `src/world/engine/BodyManager.ts` | MJCF load, body/actuator ID maps, `syncRigidBodiesFromBones` (engine-side ZXY mirror) |
| `src/world/engine/MotorController.ts` | Per-agent ctrl write + `applyCapsuleBalance` (gait-aware 0.4 scale) |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `validateAndApplyTimeline` clamps, timeline interpolation, motor+balance loop |
| `src/world/engine/WorldEngine.ts` | 500 Hz fixed-step accumulator, 60 Hz render/frame callbacks |
| `src/world/hooks/useWorld.ts` | Event handlers (`synthia:action`, `synthia:rootMotion`), per-agent spawn/rehydrate, diag ring |
| `src/utils/playMixamoWalk.ts` | Artifact fetch + `synthia:action` / `synthia:rootMotion` dispatch loop |
| `scripts/generateMixamoWalkArtifacts.ts` | One-shot artifact regeneration from `walking2.md` |
| `walking2.md` / `walking` | Raw Mixamo SJSON streams (identical rot data; converter source = `walking2.md`) |
| `public/animations/mixamo-walking-synthia.json` | Checked-in artifact (frames 12–32 unverified this session) |