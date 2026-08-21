# SYNTHIA — Motion / Walking Pipeline Deep Dive (Task 1) + A→B Walk Design (Task 2)

**Mode note:** This session is in **Explore Mode** — it produced this analysis doc and a
standalone console script *as content*. The on-disk artifacts
(`docs/MOTION_AND_WALKING_GUIDE.md`, `src/world/walking/sampleWaddle.ts` and the `?walk=1`
hook) require **Act Mode** to be written. The design below is complete enough to land
verbatim in Act Mode.

---

## 1. Summary

SYNTHIA is a browser-based humanoid physics sandbox. A Three.js + React front end drives a
MuJoCo-compiled (WASM) humanoid at a **500 Hz fixed physics step** while rendering at 60 Hz.
The humanoid is a Mixamo-skeleton rig ("x-bot.glb") baked into an MJCF with a heavy
15 kg `root_capsule` free-body and PD position actuators per bone. A stack of five
per-step/per-frame control layers — pose flush, capsule-balance torque, root-velocity
servo, COM lean-reflex/capture-step, and the Road-5 RMBS reaction-mass balancer — combine
to keep it standing, and a `window` CustomEvent protocol (`synthia:action`,
`synthia:rootMotion`, …) lets the agent/experimenter command poses, sequences and
translation.

**Key verified facts (evidence this report):**
- `synthia:action` detail → `useWorld.handleAction` → `validateAndApplyTimeline` →
  `timelineQueue` + immediate `setMotorTargets(…0ms)` → `currentTargets` → 60 Hz `ctrl`
  flush. Sequence-entry overrides **are consumed**.
- The "jointOverrides=0 keys, sequence=1" log is a **read-the-wrong-field artifact**: the
  action carried its overrides inside `sequence[0].overrides`, not in a top-level
  `jointOverrides` field. The nested overrides are fully applied.
- Root translation is a **freejoint qvel velocity servo** (`setTargetRootVelocity` +
  `applyRootVelocityDrive` writing `data.qvel[dofAdr..+2]` at 500 Hz) — not xfrc. A legacy
  qpos-teleport path survives (`synthia:rootMotion` → `BodyProxy.setTranslation`).
- RMBS stability is the verified 60 s+ standing mechanism; Road-3 root drive is the
  verified 1.9 m forward mechanism. Combining them at low speed is the recommended A→B
  waddle (Section 11).

---

## 2. Architecture

**Pattern:** layered, event-driven game loop with a deterministic physics core and
polled/window-event control plane.

```
React UI ──► useWorld (hook) ──► WorldEngine.start(animate)
                                    │  requestAnimationFrame
                                    ├─ while accumulator ≥ 0.002 s: physicsEngine.step()
                                    │     └─ onStep (per 500 Hz step):
                                    │         binder.applyBalanceStep()        (Road-2)
                                    │         binder.applyRootVelocityDrive()  (Road-3)
                                    │         binder.applyComReflexStep()      (Road-4)
                                    │         binder.applyReactionMassStep()   (Road-5)
                                    └─ onFrame (per 60 Hz render):
                                          binder.updateMotorTargets()  (zero-pass + pose ctrl)
                                          binder.syncVisuals()         (timeline stepper + mesh sync)
```

**Entry point:** `src/main.tsx` → `App.tsx` → `WorldViewport` → `useWorld(containerRef)`.
`useWorld` constructs `PhysicsEngine` (MuJoCo WASM), `WorldEngine` (render loop),
`ObjectManager`, auto-spawns `agent_0` via `spawnAgent()`, which builds a
`HumanoidPhysicsBinder` per agent and registers it in `humanoidPhysicsBindersRef`, a
`Map<string, HumanoidPhysicsBinder>`.

**Control plane:** `window` CustomEvents, all handled in `useWorld`:
- `synthia:action` — pose overrides / timeline sequence / program sequence
- `synthia:rootMotion` — legacy teleport (dx,dz) and Road-3 `velocity` field
- `synthia:push`, `synthia:resetPose`, `synthia:setBodyMode`, `synthia:toggleMultiBodyPD`,
  `synthia:spawn`, `synthia:spawnCustom`, `synthia:rename/updatePhysics/deleteObject`
- Dev hooks: `?rmbs=1` pre-enables RMBS on spawn; `?t2=1` dispatches a 0.4 rad
  forward-leg perturbation after 6 s (`useWorld.spawnAgent`, ~L715-735).

**Stack:** TypeScript, Vite, React 18, @mujoco/mujoco 3.10, three 0.184, Zustand.

---

## 3. Key Files / Directory Map

```
src/
├── main.tsx                       — React bootstrap
├── App.tsx                        — layout + modals
├── world/
│   ├── hooks/useWorld.ts          — THE orchestrator: engine wiring, event handlers,
│   │                                500 Hz onStep + 60 Hz onFrame control calls
│   ├── engine/
│   │   ├── WorldEngine.ts         — rAF loop, fixed-timestep accumulator (0.002 s)
│   │   ├── PhysicsEngine.ts       — MuJoCo WASM wrapper, world<->Three transforms,
│   │   │                            contact-force registry, velocity clamps
│   │   ├── HumanoidPhysicsBinder.ts — per-agent facade + all 500 Hz controllers
│   │   ├── MotorController.ts     — 60 Hz ctrl flush, pose targets, capsule torque,
│   │   │                            per-step additive joint deltas
│   │   ├── ReactionMassController.ts — pure RMBS law (500 Hz, pelvis-local)
│   │   ├── ComReflexController.ts — pure COM lean + capture-step + leg FSM
│   │   ├── ReflexLeanA.ts         — lean → spine2 pitch delta allocator
│   │   ├── gaitPhaseMap.ts        — empirical swing windows, GAIT_CYCLE, V4 shape
│   │   ├── MJCFHumanoidTemplate.ts — MJCF generation (bodies/actuators/reaction mass)
│   │   ├── BodyManager.ts         — body/geom/actuator id maps, MJCF load+bind
│   │   └── AvatarSynchronizer.ts / ObservationBuilder.ts — visual + proprioception
│   ├── utils/
│   │   ├── mixamoStreamConverter.ts — Mixamo stream → SynthiaWalkArtifact timeline
│   │   └── playMixamoWalk.ts        — artifact playback via synthia:action/rootMotion
│   └── engine/__tests__/           — 15 suites (road2, road3, road4, RMBS, …)
├── constants/
│   ├── rigConstraints.ts          — SYNTHIA_RIG_CONSTRAINTS (per-bone dof/ranges)
│   └── anatomicalLimits.ts        — anatomical clamp table
└── types/joint.ts                 — TimelineSequence, ActionFrame, ValidateResult
```

---

## 4. Verified Motion Chain: `synthia:action` → `data.ctrl`

1. **Dispatch.** Caller fires
   `window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId,
   jointOverrides?, sequence?, programSequence?, activeGaitPhase? } }))`.
   `src/utils/playMixamoWalk.ts` `dispatchAction()` is the canonical sequence source.
2. **Handler.** `useWorld.ts` `handleAction` (window listener, registered ~L997):
   - Reads `{jointOverrides, programSequence, sequence, activeGaitPhase, agentId}`.
   - Clears stale `binder.timelineQueue = []`, `binder.timelineSequenceStart = null`.
   - Logs `[ACTION_PIPELINE] … jointOverrides=N keys, sequence=M`.
   - If `sequence` is a non-empty array → `binder.validateAndApplyTimeline(skeleton,
     sequence, {activeGaitPhase})`; for every applied frame with `timeOffsetMs === 0`,
     calls `binder.setMotorTargets(frame.overrides)` **immediately**.
   - Else → wraps `jointOverrides` as one `[{timeOffsetMs:0, overrides: jointOverrides}]`
     and runs the same path.
   - Rejections are routed to the agent loop as feedback (`recordActionFeedback`).
3. **Validation.** `HumanoidPhysicsBinder.validateAndApplyTimeline` (binder L~325):
   - Sorts frames by `timeOffsetMs`.
   - Per key: `normalizeBoneKey(rawKey)` (lowercase, strip `:`/space); resolves the bone
     against the skeleton; requires `SYNTHIA_RIG_CONSTRAINTS[key]`; parses scalar vs
     `[x,y,z]`; clamps to rig ranges (scaled by `locomotionCap` when `activeGaitPhase`);
     injects scapulohumeral shoulder coupling, cervical counter-tilt, and tendon-synergy
     checks; pushes the sanitized frame into `appliedTimeline`.
   - **Consumption step:** `this.timelineQueue = appliedTimeline`.
4. **Immediate apply.** `useWorld` calls `setMotorTargets(f.overrides)` for
   `timeOffsetMs === 0` frames. `setMotorTargets` (binder L~1120) resolves aliases
   (e.g. `right_knee` → `mixamorigrightleg`), clamps to anatomical limits, and writes the
   parsed target into **`this.currentTargets`** (a persistent Map).
5. **60 Hz drive.** `useWorld` onFrame calls `binder.updateMotorTargets()` →
   `motorController.setTargets(this.currentTargets)` which (a) zeroes every actuator in
   this agent's `actuatorMap`, then (b) writes pose targets into `data.ctrl` —
   spherical `[yaw,pitch,roll]` → ctrl[0,1,2]; 2-DOF ankle/hand → ctrl[0]=pitch,
   ctrl[1]=roll; 1-DOF → ctrl[0]=angle — each scaled by a 20-step ramp.
6. **Timeline stepper (also 60 Hz).** `syncVisuals()` (binder L~535) runs the wall-clock
   interpolator when `timelineQueue.length > 0`: picks `activeIdx` by elapsed time vs
   `timeOffsetMs`, linearly interpolates scalar frames and **quaternion-slerps
   `[x,y,z]` triples** between consecutive frames, then calls `setMotorTargets(...)`
   again (updating `currentTargets`). Frames older than `elapsed − GRACE_MS (50 ms)` are
   pruned; at empty, `timelineSequenceStart = null`.
7. **500 Hz physics consumes ctrl.** `WorldEngine.start` steps `mj_step` at 0.002 s;
   position actuators convert `ctrl` → joint torque with the MJCF per-bone gains.

**Anomaly resolution (jointOverrides=0 keys, sequence=1).**
The log line reads the *top-level* `jointOverrides` field only. `playMixamoWalk`/walk
artifacts dispatch `detail: { agentId, sequence, activeGaitPhase: true }` with **no
top-level `jointOverrides`** — all overrides live inside `sequence[0].overrides`.
Hence `Object.keys(jointOverrides || {}).length === 0` while
`Array.isArray(sequence) ? sequence.length === 1` is expected and correct. The nested
overrides **are** consumed through the `validateAndApplyTimeline` branch (steps 3–6):
sanitized into `timelineQueue`, applied instantly at `timeOffsetMs===0`, and re-applied by
the `syncVisuals` stepper. No data is dropped. The one real failure mode is a key that is
not a skeleton bone or not in `SYNTHIA_RIG_CONSTRAINTS` — that frame key is rejected
(`unknown_bone` / `unknown_constraint`) and reported; the remaining keys still apply.

---

## 5. 60 Hz Zero-Pass vs 500 Hz Injectors — Ordering & Override Lifetime

Execution order inside one 60 Hz frame window (8 physics steps):

```
mj_step ×8 (each followed by 500 Hz injectors in onStep)
        │
        ▼
onFrame (60 Hz):
  1. binder.updateMotorTargets()  ← MotorController.setTargets:
        a. ctrl[id] = 0 for EVERY actuator in this agent's actuatorMap   ← ZERO-PASS
        b. ctrl[id] = poseTarget × rampFactor from currentTargets        ← POSE RESTORE
  2. binder.syncVisuals()         ← timeline stepper may setMotorTargets() again
        └─ writes currentTargets (persistent map, not ctrl)
        └─ then the NEXT 8 mj_step consume ctrl
```

**Lifetime consequences:**
- `currentTargets` (the pose) survives the zero-pass: step 1b re-applies it from the map.
  An override applied via `setMotorTargets` persists **until replaced by a later action,
  a `resetToBindPose()`, or a `synthia:resetPose`** — not until the next frame.
- Anything written directly to `data.ctrl` *outside* `currentTargets` (the 500 Hz RMBS
  writer and the reflex additive deltas) survives only until the next 60 Hz zero-pass
  (≤ 16.7 ms later). That is fine because:
  - **Road-4 reflex / motor per-step deltas:** `applyComReflexStep` runs *after* every
    `mj_step`; it reads the freshly flushed pose via `readBoneCtrl` and **adds** deltas
    (`addPerStepJointDeltas`), so it re-seeds from the flush each step. Never compounds
    across frame boundaries; never fights the pose.
  - **RMBS:** the two slide actuators (`act_…rm_slide_lr/fa`) are **deliberately not in
    `BodyManager.actuatorMap`** (MJCF template comment "CRITICAL RULE 1"), so the zero-pass
    cannot touch them. `applyReactionMassStep` writes `data.ctrl[actLrId/actFaId]` directly
    every 500 Hz step. This is the invariant that keeps RMBS authority intact.
- Road-2 capsule torque is applied through `data.xfrc_applied` (not ctrl), so it is
  unaffected by the zero-pass entirely; it is reset per-step inside `applyCapsuleBalance`
  (writes 0 force + torque each call).

---

## 6. Joint-Name → Actuator Map

**Build site:** `BodyManager.activate`/`remapIdsAgainstLoadedWorld` — for every
`boneInfoMap` key, looks up `act_{prefix}{bone}_yaw|_pitch|_roll` in the MJCF and stores
`actuatorMap.set(boneName, ids[])`.

**MJCF emission (`MJCFHumanoidTemplate.generateAgentSubtreeMJCF`):**
- `mixamorighips`: `fixed` (welded to root capsule; no joint, no actuator).
- 1-DOF revolute (knees `mixamorigleftleg/rightleg`, forearms): one `_pitch` hinge
  (axis 1 0 0) → actuatorMap `[pitch]`.
- 2-DOF (foot/ankle `mixamorigleftfoot/rightfoot`, hands): `_pitch` (axis 1 0 0) +
  `_roll` (axis 0 1 0) → `[pitch, roll]`. LLM convention `[x=pitch, ?, z=roll]`.
- 3-DOF spherical (spine, spine1, spine2, neck, head, shoulders, arms, upper legs,
  fingers/thumb segments): `_yaw` (axis 0 0 1; **neck/head swapped to 0 1 0**),
  `_pitch` (axis 1 0 0), `_roll` (axis 0 1 0; neck/head 0 0 1) → `[yaw, pitch, roll]`.
  LLM convention `[x=pitch, y=yaw, z=roll]`. **Mirrored in `MotorController.setTargets`:
  ctrl[0]=yaw, ctrl[1]=pitch, ctrl[2]=roll** and in `applyPerStepJointTargets` /
  `addPerStepJointDeltas` (pitch → index 1, roll → index 2, yaw never touched additively).

**Freejoint root:** `root_freejoint` on `root_capsule` (7 qpos = pos + quat, 6 qvel) is
NOT in `actuatorMap`. It is driven by Road-2 xfrc torque, Road-3 qvel velocity drive,
`BodyProxy.setTranslation/setLinearVelocity`, `setCapsulePosition`, `push`, and
`executeJump`.

**Mapped vs unmapped summary:** all BONE_JOINT_TYPE bones + finger/thumb segments are
mapped. `root_capsule`, `reaction_mass` (RM slides), and `env_slot_*`/`piano_body` are
unmapped — the latter purposely.

---

## 7. Root Translation — Exact API

**Primary (Road-3 velocity servo, recommended):**
- `binder.setTargetRootVelocity(vx: number, vz: number, holdMs: number)` — stores target
  (THREE world X/Z, m/s) + expiry timestamp. `HumanoidPhysicsBinder` L~980.
- `binder.applyRootVelocityDrive(nowMs?)` — called in `useWorld` onStep at 500 Hz, right
  after `applyBalanceStep()`. Guards: buildStep `'D'`, `rootVelocityDriveEnabled`.
  - Reads freejoint linear velocity `data.qvel[dofAdr+0..2]` (MuJoCo frame →
    THREE via `mujocoToWorld`).
  - Critically-damped correction `ax = ω²(target−current)·dt`, ω = `ROOT_VELOCITY_DAMP_W`
    = 6 s⁻¹, dt = `PHYSICS_DT` = 0.002.
  - Hard-clamps horizontal speed to `ROOT_VELOCITY_MAX_MPS` = 0.15 m/s.
  - **Suspends when airborne** (`!_isGrounded` → no drive).
  - Writes the result back to `qvel[dofAdr..+1]`; vertical DOF untouched.
- Toggle: `binder.setRootVelocityDriveEnabled(bool)`.

**Legacy (qpos teleport):**
- `synthia:rootMotion` event → `useWorld.handleRootMotion` → `capsuleBody.setTranslation()`
  → `BodyProxy.setTranslation` writes freejoint `qpos[qposadr..+2]` (worldToMuJoCo) and
  zeroes the 6 qvel. `playMixamoWalk` emits `{dx, dz, velocity}` — the handler currently
  only uses dx/dz (teleport). Note `ROAD3_GATES_REPORT.md` and the binder doc-comment claim
  the handler "no longer teleports"; **the current source still teleports** — the gate
  test and the binder bypass it by calling `setTargetRootVelocity` directly.
- `binder.setCapsulePosition(x, y, z)` — qpos write + identity quat + zero qvel; used for
  spawn/reset.
- `BodyProxy.setLinearVelocity` — direct qvel write (used by `push` impulses).

**Use for A→B:** call `setTargetRootVelocity(0, −0.08, holdMs)` (forward is −Z) and let the
servo carry the body. Verified mechanism: the Road-3 gate reproduced **−1.908 m** forward
translation over 8 s with this API (it fell because balance was absent; RMBS fixes that).

---

## 8. Balance Subsystems — Effect, Setter, Interference

| Subsystem | File / effect | Setter | Runs at | Interference rules |
|---|---|---|---|---|
| Road-2 capsule-balance torque | `MotorController.applyCapsuleBalance` — PD upright torque on root via `xfrc_applied[cap*6+3..5]`; KP 800 / KD 320, cap 120 N·m; scale 0.5 while gait active | `binder.setCapsuleBalanceEnabled(bool)`; `binder.setCapsuleBalanceGains(kp,kd)` | 500 Hz (`applyBalanceStep`) | xfrc, independent of ctrl zero-pass; RMBS-on auto-sets gains to (200,40); off restores null |
| Road-3 root velocity drive | `applyRootVelocityDrive` — critically-damped freejoint qvel servo, 0.15 m/s clamp, airborne-suspended | `setTargetRootVelocity(vx,vz,holdMs)`; `setRootVelocityDriveEnabled(bool)` | 500 Hz | qvel linear only; does not fight the torque; suspends airborne so aerial impulses aren't fought |
| Road-4 COM reflex | `ComReflexController` + `applyComReflexStep` — lean→spine2 pitch (Option A, `allocateLeanA`), swing-hip capture + knee-lift + ankle dorsiflex, forced step when \|e\|>forceStepM, per-leg FSM (swing→planted→refractory) | `setComReflexEnabled(bool, startStanceSide)`; `setComReflexGains(partial)` | 500 Hz | ADDITIVE via `addPerStepJointDeltas` on the flushed ctrl (never overwrites pose yaw/roll); body cache excludes `reaction_mass` so RMBS can't corrupt COM; knee/ankle injection caps 0.8/0.3 rad |
| Road-5 RMBS | `ReactionMassController` + `applyReactionMassStep` — closed-form COM tracking with fractional pursuit (0.8) + slew cap (0.005 m/step) on the 18 kg slide mass; modes grounded/airball/acrobatic/saturated; trim integral | `setReactionMassEnabled(bool)`; `setRmbsParams(partial)`; `setReactionMassAcrobatic(bool)` | 500 Hz | Writes `data.ctrl[rm_slide_lr/fa]` directly — outside the 60 Hz zero-pass (CRITICAL RULE 1); on-enable auto-pairs capsule gains (200,40); trim integrator pauses during gait/action (actionGuard) |

**Ordering inside `useWorld` onStep (verified):**
`applyBalanceStep()` → `applyRootVelocityDrive(now)` → `applyComReflexStep(0.002)` →
`applyReactionMassStep(0.002)` per agent, wrapped in try/catch.

---

## 9. Console Observability

- `window.__SYNTHIA_HUMANOID_BINDER__` — the active (last-spawned) binder.
- `window.__SYNTHIA_HUMANOID_BINDERS__` — `Map<agentId, binder>`.
- `window.__SYNTHIA_PHYSICS_ENGINE__` / `__SYNTHIA_MUJOCO_MODULE__` — `.getWorld().data`
  / `.model` are live (Emscripten views). Also `__SYNTHIA_WORLD_ENGINE__`,
  `__SYNTHIA_CAMERA__/_RENDERER__/_SCENE__/_FLOOR_MESH__`, `THREE`.
- `[RMBS_STATS {agentId}]` console row every 50 successful RMBS frames (~10 Hz) from
  `applyReactionMassStep` — includes stats JSON (frames, saturationCount,
  maxAbsCaptureLead, maxAbsComVel, maxAbsResidual, maxAbsCtrl), `mode`, `supportNull`.
- `window.__SYNTHIA_RMBS_TELEM__` — ring (cap 200) of decimated samples
  `{t, mode, supportNull, eFa, eLr, ctrlFa, ctrlLr}`.
- `window.__SYNTHIA_RM_IDS__` — `{rm: rmBodyId, cap: capsuleBodyId}`.
- `[FOOT_SOLE_DIAG]` — every 500 grounded steps: called foot body id, bodyMap ids,
  `mj_name2id` body/geom ids, raw MuJoCo z, computed gap.
- `binder.getReactionMassController().getStats()`, `binder.rmbsMode()`,
  `binder.getRmbsTrimState()`, `binder.getRmbsParams()`, `binder.getReflexStats()`,
  `binder.getDiagnostics()`, `binder.getJointState()`, `binder.rootVelocityTargetActive()`,
  `binder.getRootVelocity()`.
- `window.diagnose_fall_quick()` / `__SYNTHIA_DIAG_RING__` / `diag_reset()` — 300-frame
  fall ring: rootH/tilt/COM/feet/contacts/xfrc/joint state per frame, auto-download JSON.
- `window.synthia.spawnAgent()/getActiveAgentId()/setActiveAgentId(id)`;
  `__SYNTHIA_GENERATE_COMBINED_MJCF__()`.
- Dev hooks: `?rmbs=1` (RMBS pre-enabled on spawn), `?t2=1` (0.4 rad leg perturbation at
  +6 s), `?walk=1` (proposed, Section 11).

---

## 10. Test / Typecheck Status (from existing artifacts; no commands run — Explore Mode)

- `jest_rmbs_output.txt` (most recent targeted run): **reactionMassController.test.ts —
  12/12 passed**, 1 suite.
- `jest.config.js` lists 15 suites (converter, PhysicsEngine, MJCF template, Collision,
  ObjectManager, Tuning, PhysicsIntegration, multiAgent, road2Gates, road3WalkGate,
  gaitPhaseMap, comReflex, reflexLeanA, motorControllerPerStep, road4ComReflex, RMBS).
- `typecheck_output.txt`: **5 pre-existing TS6133 unused-symbol errors** (not failures of
  logic): `road3WalkGate.test.ts(135,21)` unused `engine`; `road4ComReflex.test.ts(169,21)`
  unused `engine`; `zProbe2.test.ts(4,8)` unused `ReflexFrameInput`;
  `ComReflexController.ts(266,11)` unused `swingRequest`; `ComReflexController.ts(305,18)`
  unused `footF`. `npm run typecheck` will report these until cleaned.
- Road gate reports on disk: ROAD2 PASS (stand 10 s, 3 pushes); ROAD3 FALL-forward
  (ΔZ −1.908 m, drive works, no balance); ROAD4 + Road-5.1 reports as committed.

---

## 11. Task 2 — A→B Waddle Design (Act-Mode deliverable spec)

**Chosen mechanism:** RMBS-on stability + Road-3 low-speed root velocity drive + a
phased alternating hip/knee/ankle sequence (quasi-static waddle).

Why (from Task-1 findings):
1. Translation is verifiable only via `setTargetRootVelocity` (gate: −1.908 m / 8 s).
2. Standing is verifiable only with RMBS (task states 60 s+ stable).
3. Sequence overrides are verifiably consumed (Section 4), so a small alternating-leg
   sequence is the simplest compliant "not falling during the walk" assist — it keeps the
   COM over the support polygon by micro-stepping feet, staying inside rig constraints.
4. Speed 0.08 m/s ⇒ 1.5 m in ~19 s, comfortably inside RMBS's stable window; far below
   the 0.15 m/s clamp and the reflex forced-step threshold (0.18 m).

**Files to create in Act Mode:**

(a) `src/world/walking/sampleWaddle.ts`:
```ts
export function startWaddle(opts?: { agentId?: string; targetM?: number; speedMps?: number })
export function stopWaddle(agentId?: string): void
```
Implementation: resolve binder from `window.__SYNTHIA_HUMANOID_BINDERS__` (fallback
`__SYNTHIA_HUMANOID_BINDER__`); enable RMBS (`setReactionMassEnabled(true)`), keep
capsule balance on; `setTargetRootVelocity(0, -speedMps, holdMs)` with a long hold,
re-issued each cycle; every 1.4 s alternate a `synthia:action` dispatch with
`sequence:[{timeOffsetMs:0, overrides:{mixamorigleftupleg:[0.35,0,0], mixamorigleftleg:0.45,
mixamorigleftfoot:[0.15,0,0], mixamorigrightupleg:[-0.05,0,0], mixamorigrightleg:0.05}}]`
/ mirrored right-side; poll every 500 ms logging root XY (MuJoCo `xpos[cap*3]` →
`mujocoToWorld`), `rmbsMode()`, `saturationCount`; stop + `synthia:resetPose` at target
displacement or 25 s; print final displacement + tilts + fell/did-not-fell verdict
(fell = maxTilt ≥ 30° or minRootH < 0.45). Wire `?walk=1` in `useWorld.spawnAgent`'s
dev-hook block following the `?rmbs=1` pattern (import { startWaddle } …; on flag,
`startWaddle({ agentId })`).

(b) Standalone console script (paste into browser devtools after the app loads) — full
script below.

```js
(() => {
  const AGENT = 'agent_0';
  const SPEED = 0.08;          // m/s (forward = -Z)
  const TARGET_DIST = 1.5;     // m
  const MAX_S = 25;
  const tickLog = [];

  const binders = window.__SYNTHIA_HUMANOID_BINDERS__;
  const binder = (binders && binders.get(AGENT)) || window.__SYNTHIA_HUMANOID_BINDER__;
  const pe = window.__SYNTHIA_PHYSICS_ENGINE__;
  if (!binder || !pe) { console.error('[WADDLE] binder/physics not found'); return; }
  const capId = binder.getMultiBodyManager().getCapsuleBody();
  if (capId === null || capId < 0) { console.error('[WADDLE] no capsule'); return; }

  binder.setReactionMassEnabled(true);         // RMBS stability
  binder.setCapsuleBalanceEnabled(true);       // Road-2 (default on)
  const start = { x: pe.getWorld().data.xpos[capId*3], y: pe.getWorld().data.xpos[capId*3+1] };
  const t0 = performance.now();
  let maxTilt = 0, minRootH = Infinity, waddleIdx = 0, pole, waddleTimer;

  const pose = (side) => side === 'left'
    ? { mixamorigleftupleg: [0.35,0,0], mixamorigleftleg: 0.45, mixamorigleftfoot: [0.15,0,0],
        mixamorigrightupleg: [-0.05,0,0], mixamorigrightleg: 0.05, mixamorigrightfoot: [0,0,0] }
    : { mixamorigrightupleg: [0.35,0,0], mixamorigrightleg: 0.45, mixamorigrightfoot: [0.15,0,0],
        mixamorigleftupleg: [-0.05,0,0], mixamorigleftleg: 0.05, mixamorigleftfoot: [0,0,0] };

  const dispatch = (side) => window.dispatchEvent(new CustomEvent('synthia:action', {
    detail: { agentId: AGENT, activeGaitPhase: true,
              sequence: [{ timeOffsetMs: 0, overrides: pose(side) }] }
  }));

  const rpos = () => {
    const d = pe.getWorld().data.xpos;
    const t = window.THREE ? (() => { const v = window.__SYNTHIA_MUJOCO_MODULE__;
      return { x: d[capId*3], y: d[capId*3+2], z: -d[capId*3+1] }; })()
      : { x: d[capId*3], y: d[capId*3+2], z: -d[capId*3+1] }; // Three: y=up, z=-Mj y
    return t;
  };
  const tiltDeg = () => { const d = pe.getWorld().data;
    const qx = d.xquat[capId*4+1], qy = d.xquat[capId*4+2];
    const upZ = 1 - 2*(qx*qx + qy*qy);
    return Math.acos(Math.max(-1, Math.min(1, upZ))) * 180/Math.PI; };

  let lastX = start.x, lastZ = 0;
  pole = setInterval(() => {
    const p = rpos();
    const dist = Math.hypot(p.x - start.x, p.z);           // p.z already -MjY
    const s = pe.getWorld().data;
    const rootH = s.xpos[capId*3+2];
    const stats = binder.getReactionMassController().getStats();
    maxTilt = Math.max(maxTilt, tiltDeg()); minRootH = Math.min(minRootH, rootH);
    tickLog.push({ t: ((performance.now()-t0)/1000).toFixed(2),
                   x: p.x.toFixed(3), z: p.z.toFixed(3),
                   mode: binder.rmbsMode(), sat: stats.saturationCount,
                   tilt: tiltDeg().toFixed(1), h: rootH.toFixed(3) });
    console.log('[WADDLE]', JSON.stringify(tickLog[tickLog.length-1]),
                'dist=' + dist.toFixed(3) + 'm');
    if (dist >= TARGET_DIST || (performance.now()-t0)/1000 >= MAX_S) finish(dist);
  }, 500);

  waddleTimer = setInterval(() => { dispatch(waddleIdx % 2 === 0 ? 'left' : 'right'); waddleIdx++; },
                            1400);
  binder.setTargetRootVelocity(0, -SPEED, 30000);

  function finish(dist) {
    clearInterval(pole); clearInterval(waddleTimer);
    binder.setTargetRootVelocity(0, 0, 100);
    window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: AGENT } }));
    const fell = maxTilt >= 30 || minRootH < 0.45;
    console.log(`[WADDLE] FINAL displacement=${dist.toFixed(3)} m (target ${TARGET_DIST}) ` +
                `maxTilt=${maxTilt.toFixed(2)}° minRootH=${minRootH.toFixed(3)} ` +
                `saturationCount=${binder.getReactionMassController().getStats().saturationCount} ` +
                `VERDICT: ${fell ? 'FELL' : 'DID NOT FELL'}`);
  }
})();
```

**Expected outcome (design targets):** ≥ 1.5 m forward at ~0.08 m/s over ≤ 25 s, max tilt
< 15°, RMBS mode grounded, saturationCount stable, verdict DID NOT FELL. If A→B is
attempted in Act Mode and the RMBS support fix (Road-5.1, EMA support-center) is in the
working tree, displacement should be achievable without rate-limiting the droop.

---

## 12. Suggested Reading Order (for a developer)

1. `src/world/hooks/useWorld.ts` — event → controller wiring, 500/60 Hz call graph, dev hooks
2. `src/world/engine/HumanoidPhysicsBinder.ts` — the facade: targets, timeline, 4 controllers
3. `src/world/engine/MotorController.ts` — ctrl semantics, zero-pass, indexing, capsule torque
4. `src/world/engine/MJCFHumanoidTemplate.ts` — the actual model: masses, joints, RM body
5. `src/world/engine/ReactionMassController.ts` — RMBS law + params (pure, testable)
6. `src/world/engine/ComReflexController.ts` + `gaitPhaseMap.ts` — reflex/phase laws
7. `src/utils/playMixamoWalk.ts` + `mixamoStreamConverter.ts` — artifact shape that
   `synthia:action` consumes
