# Synthia 1.5.1 — Evaluation: Tilt-Based Balance Corrector ("Gyro Balancer") for Multi-Agent

## Task
The user proposed a "gyro balancer" that corrects humanoid tilt via a corrective torque proportional to orientation deviation, with (a) context-aware scaling that backs off during large AI-commanded motion, and (b) a per-agent on/off toggle. They asked for verification that `applyCapsuleBalance()` already exists and runs unconditionally, plus critical benefit/consequences and a go/no-go recommendation.

## Verdict (TL;DR)
**Yes, implement it — but in a specific order.** The core mechanism already exists and is running full-strength at all times (including during AI motion), and the single most likely cause of both "falls during movement" and "stiff/robotic motion" is already half-visible in the code as dead functionality: a binary gait back-off (`GAIT_BALANCE_SCALE = 0.15`) that nothing ever activates. The cheapest first move is to *wire the existing switch*; the continuous deviation-proportional scaling is a genuine improvement over it, and the per-agent toggle is cheap and fits the established multi-agent state pattern.

---

## 1. Claim-by-Claim Verification (against actual code)

### ✅ True — `applyCapsuleBalance()` exists and is already running
- **Defined**: `src/world/engine/MotorController.ts` → `public applyCapsuleBalance(capsuleBodyId: number)`.
- **Mechanism** (exactly as described): reads `xquat` for the capsule body → converts MuJoCo quat to Three.js coordinates → computes `tiltAngle = acos(capsuleUp.y)` → computes tilt axis → reads angular velocity from `qvel` → builds torque `BALANCE_KP * tiltAxis * tiltAngle − BALANCE_KD * angVel` → clamps magnitude at **60.0 N·m** → writes into `xfrc_applied` torque slots (indices 3–5) of the capsule body.
- **Gains**: `BALANCE_KP = 100 * globalStiffnessScale * balanceScale`, `BALANCE_KD = 40 * globalDampingScale * balanceScale`.
- **Called from**: `HumanoidPhysicsBinder.updateMotorTargets()`, which runs in `useWorld.ts`'s per-frame (60Hz) loop for **every binder** in `humanoidPhysicsBindersRef` — i.e., every agent, unconditionally, whenever the binder's build step is `'D'` (motors active).

### ⚠️ Partially True — "applies a corrective torque, caps it, scales with tilt" — but it runs at 60Hz, not per physics step
The physics engine steps at **500Hz** (`FIXED_TIMESTEP = 0.002` in `WorldEngine.ts`), but `applyCapsuleBalance` is sampled at **60Hz** (one call per render frame inside `updateMotorTargets`). MuJoCo does not auto-clear `xfrc_applied` between steps, so the same torque value is held for ~8 physics steps. This creates a feedback delay and is a hidden source of oscillation risk at high KP — any re-tuning must account for it. (Note this also means "does it run every single physics step?" is technically *no* — it runs every render frame and the result is *held* across the intervening steps.)

### ✅ True — it runs during AI-commanded movement, with NO motion awareness
There is zero check in `updateMotorTargets()` for whether the AI is actively commanding motion. It fires full-strength every frame regardless of `currentTargets` contents, timeline activity, or sequence execution.

### ❌ False (most important finding) — the "back off during movement" scaling already exists but is **dead code at runtime**
In `applyCapsuleBalance`:
```ts
const GAIT_BALANCE_SCALE = 0.15;
const balanceScale = this.gaitActive ? GAIT_BALANCE_SCALE : 1.0;
```
A binary gait back-off already exists — but I found **no caller that ever sets `gaitActive = true`**:
- `HumanoidPhysicsBinder.setGaitActive(true)` is only referenced in `resetPose()` and `resetToBindPose()`, both of which pass **`false`**.
- The `synthia:action` handler in `useWorld.ts` receives `activeGaitPhase` and passes it to `validateAndApplyTimeline({ activeGaitPhase })` — which uses it **only for joint-limit clamping** (`locomotionCap`) — but **never calls `binder.setGaitActive(activeGaitPhase)`**.
- Therefore `gaitActive` stays `false` at all times during normal operation → the balance runs at **KP=100 / KD=40 / cap=60 N·m, always, including mid-motion**. This is the exact failure mode the user hypothesized: a strength tuned for idle standing, applied uniformly while real movement happens.

This also means the user's step 2 ("add the deviation-magnitude scaling") is *almost* present — it's just binary instead of continuous, and unconnected.

### ✅ True — multi-agent architecture is fully present in this codebase (this is the multi-agent version)
- `useWorld.ts` maintains `humanoidPhysicsBindersRef: Map<string, HumanoidPhysicsBinder>` keyed by `agent_0..N`.
- Each `HumanoidPhysicsBinder` constructs its **own** `MotorController` instance → balance is already per-agent at the object level.
- `spawnAgent()` rebuilds the combined MJCF (`generateCombinedMultiAgentMJCF`), rehydrates existing agents via `StateRehydrator`, and gives new agents offset spawn points (±1.75m).
- Per-agent state already exists: `useAgentStore.agents[agentId]` (`SingleAgentState`) with per-agent setters (`setStatusForAgent`, `setDirectiveModeForAgent`, etc.), plus flat mirroring for the active agent. A `balanceCorrectionEnabled` boolean would follow this exact pattern.
- UI for per-agent settings exists: God Mode panel tabs (`BodyControls`, `PhysicsControls`, `DirectivePanel`) + agent modal — the toggle would slot into either.

### ✅ True — the fall-diagnosis tooling needed for movement-based re-tuning already exists
`useWorld.ts` installs a **300-frame diagnostics ring buffer** capturing tilt, root height, foot heights, CoM, `xfrc` torque, per-joint qpos/qvel, body positions, contacts — throttled to 1/frame, exposed as `window.diagnose_fall_quick()` (auto-downloads `fall_diagnosis.json`). This is exactly the measurement harness needed for step 4 (movement testing). It also already logs `lastBalanceTorqueMag` / `lastBalanceTiltRad` (public fields on `MotorController`) via the `[DIAG]` tap if wired to `getDiagnostics()` — currently they're exposed as class fields but I saw no reader; the ring buffer reads `d.xfrc_applied` directly instead.

---

## 2. The Real Mechanism Behind the Gap
Two torque-authority systems act on the same capsule root during AI motion:
1. **`applyCapsuleBalance`** → direct `xfrc_applied` torque opposing *measured* tilt (KP=100, KD=40, cap=60).
2. **`applyKinematicGroundReactionForces`** → velocity impulses into `qvel[0..2]` and `qvel[3..5]` (linear + yaw), with `gaitBoost = 1.5` when `gaitActive` (also never activated).

The balance loop treats *all* tilt as error. A deliberate lunge/lean/reach produces the same `tiltAngle` as a stumble, so the corrector pushes back against intentional motion at full authority. Because `gaitActive` gating is dead, there is currently **no mechanism whatsoever** that distinguishes "intentional large deviation" from "accidental tilt." The user's diagnosis in the prompt is precisely right: a constant tuned for idle will either be too weak for movement disturbances or fight every intentional motion.

**Signal-choice caveat for the scaling fix**: scaling by *measured* tilt cannot distinguish intentional lean from stumble (they look identical to `acos(capsuleUp.y)`). The cleaner signal is the **commanded** deviation — the magnitude of the AI's current joint targets in `currentTargets` / the active timeline — which is exactly the additive-authority principle: full balance strength at zero commanded deviation, monotonic back-off as commanded deviation grows.

## 3. Critical Benefit
1. **Targets the correct quantity.** Orientation error is the actual failure variable for tip-overs; unlike the magnetic-foot-pull idea, this doesn't anchor position and leave rotation uncontrolled.
2. **Incremental, not greenfield.** The torque pipeline (quat → tilt → axis → KD damping → clamp → `xfrc_applied`) is built, tested at idle, and running. The work is refinement, not construction.
3. **One change plausibly fixes two symptoms.** If the diagnosis is right, the scaling fix simultaneously reduces falls-during-movement AND removes the stiff/robotic resistance to intentional motion.
4. **Cheap first experiment exists.** Wiring `binder.setGaitActive(activeGaitPhase)` from the action handler is a ~3-line change that tests the entire hypothesis before any real engineering.
5. **Per-agent toggle is nearly free** and fits an established pattern (`SingleAgentState` + God Mode tab), giving users an escape hatch if balance misbehaves for a specific body type or motion style.

## 4. Critical Consequences / Risks
1. **60Hz control at 500Hz physics.** The balance torque is sampled per render frame and held for ~8 steps. At KP=100 this is already near an aliasing/oscillation boundary; raising gains for movement robustness without addressing sample rate will make it worse. If movement tuning demands stronger correction, consider calling `applyCapsuleBalance` per physics-step instead (from the `onStep` callback in `WorldEngine.start`, which already exists) — but that changes the CPU cost profile.
2. **Dead-gait trap.** If you "add" scaling without noticing the existing binary switch, you'll end up with duplicated/conflicting scaling logic. First action must be to either wire `setGaitActive` or remove/replace the dead branch.
3. **`xfrc_applied` clobbering.** `applyCapsuleBalance` zeroes the capsule's force slots (0–2) every frame while writing torques (3–5). Any future force injection on the capsule via `xfrc_applied` will be silently wiped. Currently no conflict (GRF injector writes `qvel`, not `xfrc`), but document this.
4. **Deviation-scaling must use commanded, not measured, deviation** — otherwise the fix regresses to the original blindness (stumble vs lean ambiguity) and you're just softening balance during the exact moments you need it most.
5. **Per-agent toggle adds state surface area.** It must be mirrored through `SingleAgentState`, the agents map, and the UI; the store already shows the mirror-pattern to follow (`AgentStoreState` flat fields vs `agents[].field`). Failure to mirror breaks the active-agent UI.
6. **Movement testing is a genuinely harder bar.** The existing verification (idle standing) does not exercise the scaling path; the 300-frame diagnostic ring exists, so the test is *possible* — but falls during walk/reach/lean are stochastic and need repeated runs, not single trials.

## 5. Recommended Implementation Order
1. **Wire the existing switch (1 hour).** In `useWorld.ts` `handleAction`, call `binder.setGaitActive(!!activeGaitPhase)` when a sequence is applied (and `setGaitActive(false)` on completion / `resetPose` — reset paths already do false). Test: does the 0.15 back-off alone stop movement-time falls? This validates the whole hypothesis at near-zero cost.
2. **Replace binary with continuous commanded-deviation scaling.** Compute `commandedDeviation` from the current `currentTargets` (e.g., weighted sum of |target| across joints, normalized 0..1) and set `balanceScale = lerp(1.0, 0.15, clamp(commandedDeviation))`. Keep the 60 N·m cap.
3. **Add per-agent toggle.** `balanceCorrectionEnabled: boolean` on `SingleAgentState` (default true), mirrored setters, gate in `updateMotorTargets()` per binder, UI switch in the God Mode body/physics tab.
4. **Re-tune against movement tests** using `diagnose_fall_quick()` / the 300-frame ring: walk/reach/lean while active, measure tilt trajectory, `xfrc` torque, and `lastBalanceTorqueMag` over frames. Do NOT tune against idle standing only.
5. **Optional follow-up:** move `applyCapsuleBalance` sampling to per-step (inside the `onStep` callback) if step 4 exposes 60Hz aliasing as the limiting factor.

## 6. Key Files (balance-relevant map)

| File | Role |
|------|------|
| `src/world/engine/MotorController.ts` | `applyCapsuleBalance()` — the entire balance torque pipeline; `gaitActive` flag + `GAIT_BALANCE_SCALE = 0.15` (dead at runtime); `lastBalanceTorqueMag` / `lastBalanceTiltRad` diagnostics |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `updateMotorTargets()` calls balance every frame for its agent; `setGaitActive()` forwards to MotorController; `applyKinematicGroundReactionForces()` (GRF injector, `gaitBoost = 1.5` also gated on the dead flag); per-agent instance owns its MotorController |
| `src/world/hooks/useWorld.ts` | Main loop wiring: per-frame → `updateMotorTargets()` + `syncVisuals()` for all binders; `synthia:action` handler (never calls `setGaitActive(true)`) ; `spawnAgent()` multi-agent rebuild; 300-frame fall diagnostic ring + `diagnose_fall_quick` |
| `src/world/engine/WorldEngine.ts` | 500Hz fixed-step loop (`FIXED_TIMESTEP = 0.002`), `onStep` / `onFrame` callbacks, 60Hz render loop |
| `src/store/agentStore.ts` | `SingleAgentState` + `AgentStoreState` — pattern for the per-agent balance toggle |
| `src/App.tsx` | God Mode / agent modal UI shell where the toggle lives |
| `src/types/agent.ts` | `SingleAgentState` types (add `balanceCorrectionEnabled` here) |
| `root/balance.py` | Standalone Python experiment (foot-pull idea predecessor) — not part of the runtime path |
