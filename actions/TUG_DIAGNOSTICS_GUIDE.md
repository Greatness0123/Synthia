# TUG / BACKWARD-DRIFT DIAGNOSTICS GUIDE

The three scripts in `actions/` — `06_prewalk_control.js`, `07_tug_tracer.js`,
`08_walktime_sentinel.js` — are a console diagnostic suite for the failure where
the model's torso/upper body (from the hips up) gets dragged **down and backward**
mid-walk, the model takes a step back, and then falls.

> ⚠️ **Read the diagnosis section first.** The suite is built to *prove* why the
> walk is broken, and in this build the single biggest cause is **not** a physics
> tug at all — it is that `02_walking_and_locomotion.js` cannot talk to the engine.

---

## 1. THE DIAGNOSIS (why "what is executing is not 02 locomotion")

Confirmed against the build source (`src/world/hooks/useWorld.ts`,
`src/world/engine/HumanoidPhysicsBinder.ts`):

- `02_walking_and_locomotion.js` resolves its context via
  `window.synthiaGetContext(agentId)` or `window.__SYNTHIA_AGENTS__` /
  `window.__synthiaAgents`.
- **None of those exist in this build.** The real binders live in
  `window.__SYNTHIA_HUMANOID_BINDERS__` (a `Map`, populated by `useWorld.ts`).
- So when you paste 02 and call `synthiaWalk(...)`, `getContext()` returns
  `null`, and the script runs **pose-only**:
  - `setReactionMassEnabled(true)` → **skipped** (RMBS never engages)
  - `setCapsuleBalanceEnabled(true)` → **skipped** (balance torque never engages)
  - `setGaitActive(true)` → **skipped**
  - `binder.setTargetRootVelocity(0, +speed, ...)` → **skipped** (no root drive)
  - position telemetry + the `z < 0.45` fall-stop → **skipped** (walk stops only
    on the blind 15 s timer)
- Net effect: the legs animate exactly as 02 commands, but *none* of 02's
  physics assist runs. That is why it looks like "something other than 02 is
  executing."

### Second confirmed bug: the root-velocity sign

- Engine forward = Three.js `-Z` = MuJoCo `+Y` (verified
  `PhysicsEngine.worldToMuJoCo`: `[v.x, -v.z, v.y]`).
- `setTargetRootVelocity(vx, vz, holdMs)` takes **Three.js X/Z**.
- A forward walk must therefore command `setTargetRootVelocity(0, -speed, ...)`.
- `02_walking_and_locomotion.js` (forward branch) commands
  `setTargetRootVelocity(0, +speedMps, 1000)` → **+Z = backward**.

Even after the glue is fixed, 02's root servo will actively push the agent
**backward**, exactly the observed "tugging backwards → step back → fall".

### Third bug: forward-travel completion never fires

- 02 stops when `forwardTravel = startPos.y - cur.y >= distanceM`.
- Forward is MuJoCo **+Y**, so during a forward walk `cur.y` *rises* and
  `startPos.y - cur.y` goes **negative** — the "walk complete" stop never fires;
  the walk only ends on the blind timeout (15 s).

### Minor bug: `mjtObj.X.value`

The diagnostics originally used `mj.mjtObj.mjOBJ_ACTUATOR.value`. In
`@mujoco/mujoco`, `mjtObj` members are **plain numbers**, so `.value` is
`undefined` and RMBS actuator lookups silently fail. All three scripts now use
an `mjObjType()` helper that handles both shapes.

---

## 2. FIXING THE GLUE (required before any useful trace)

In the browser console, once the world is loaded:

```js
window.synthiaGetContext = (id) => ({
  binder: window.__SYNTHIA_HUMANOID_BINDERS__.get(id || 'agent_0'),
  pe: window.__SYNTHIA_PHYSICS_ENGINE__,
});
```

Then **re-paste** `actions/02_walking_and_locomotion.js` so its closure picks
up the new function on the next `synthiaWalk` call. (Patching 02 itself is
allowed: replace its `getContext()` with the same body and re-paste.)

> The precheck and tracer both *probe* this glue and report
> `walk02Glue.resolvesFor02` — with broken glue every other result is a
> pose-only baseline.

---

## 3. RUNNING THE DIAGNOSTICS

Order matters: `06` → `07` → `08`. Each file registers functions on the shared
`window.synthiaTugDiag` namespace. Pasting a later file does **not** overwrite
earlier functions.

### Step 0 — prerequisites

1. `npm run dev` (or open the deployed app).
2. Wait for the humanoid to spawn and settle (build step `D`, grounded).
3. Apply the glue fix from §2, then **re-paste** `02_walking_and_locomotion.js`.

### Step 1 — pre-walk checks

```
# paste actions/06_prewalk_control.js
synthiaTugDiag.precheck()          # agent_0
synthiaTugDiag.precheck('agent_1')
```

- `walk02_glue` — **PASS/FAIL**: does 02's own context resolver work?
- `root_drive_sign_convention` — informational: what sign a forward drive must use.
- `rmbs_rail_pin` — WARN when `rm_slide_fa` is pinned rearward (> +0.10 m),
  which tugs the torso backward during a forward walk (calibrated -0.060 m
  support-center offset note included).
- Safe correction: cancels a stale root-velocity target
  (`setTargetRootVelocity(0, 0, 500)`).
- Exports `synthia_prewalk_<ISO>.json`.

### Step 2 — live trace (the workhorse)

```
# paste actions/07_tug_tracer.js
await synthiaTugDiag.trace()                                   # 2.0 m fwd @ 0.12 m/s + auto-verify rewalk
await synthiaTugDiag.trace({ distanceM: 1.5, autoVerify: false })
await synthiaTugDiag.trace({ dir: -1 })                        # backward walk
```

- Runs your **real** `window.synthiaWalk`.
- Samples ~30 Hz across the five tug sources:
  `rootDriveSignError | rmbsRailPull | comReflexLeanBack | capsuleBalanceTorque | grfInjector`.
- **`rootCmdLog`** — hooks `binder.setTargetRootVelocity` and logs every command;
  `wrongSignForForward` marks a forward walk that commands `+Z` (backward).
- Exports `synthia_tug_trace_<ISO>.json`.

### Step 3 — cause isolation (A/B)

```
await synthiaTugDiag.isolation({ rmbs: false })               # single mask, one walk
await synthiaTugDiag.isolation({ rmbs: true, balance: false, reflex: true, root: true })
await synthiaTugDiag.abTests()                                # all 5 canonical masks
```

Masks toggle the four console-controllable subsystems:
`rmbs`, `balance` (Road-2 capsule torque), `reflex` (COM reflex), `root`
(root-velocity servo). `grfInjector` has **no** runtime toggle
(`ENABLE_KINEMATIC_GRF_INJECTOR` is a compile-time const) — it is attributed
**by elimination**: if `all_off` still drifts backward, the tug survives all
four masks ⇒ the injector (or the pose/gait stack) is the culprit.

- Exports: `synthia_tug_isolation_<ISO>.json` per mask,
  `synthia_tug_ab_<ISO>.json` for the full table.

### Step 4 — live watchdog during a walk

```
# paste actions/08_walktime_sentinel.js
const guard = synthiaTugDiag.guard({ sampleMs: 100 }).start()
synthiaWalk(1.5, 0.12)
guard.stop()                                                  # exports synthia_walk_sentinel_<ISO>.json

# or auto-wire to walk/stop:
synthiaTugDiag.guard().attachToWalk()
synthiaWalk(1.5, 0.12)                                        # auto-start + auto-stop + auto-export
```

Alarms every ~100 ms on: backward drift while the walk is active
(`rootDriveSignError`), rail pin (`rmbsRailPull`), counter-lean torque while
pitched forward (`capsuleBalanceTorque`), lean-back reflex (`comReflexLeanBack`),
planted-foot forward slip (`grfInjector`), plus an informational fall cross-check.

---

## 4. READING THE RESULTS

| Signal | What it means | Fix direction |
|---|---|---|
| `walk02Glue.resolvesFor02 == false` | 02 runs pose-only; NO physics assist | Bind `window.synthiaGetContext`, re-paste 02 |
| `rootCmdLog[].wrongSignForForward` | Forward walk commanding `+Z` = backward | `setTargetRootVelocity(0, -speed)` for fwd |
| `rmbsRailPull` events | `rm_slide_fa` pinned rearward; 18 kg mass bias tugs torso back | Support-center -0.060 offset / trim / railRange |
| `capsuleBalanceTorque` events | Pitched forward while receiving rearward corrector torque | Balance gains / gait lean conflict |
| `comReflexLeanBack` events | Reflex leaning spine2 back | kH/kD lean gains, capture-step tuning |
| `grfInjector` events (or `all_off` still drifts back) | Kinematic GRF negating forward motion | Toggleless — eliminate the others, then patch injector/gait |

A **pose-only** run makes `rmbsRailPull`, `capsuleBalanceTorque`,
`comReflexLeanBack` attribution empty by construction — only `rootDriveSignError`
(and backward drift) mean anything until the glue is fixed.

---

## 5. WHY DOES THE TRACER EXPORT **THREE** FILES?

`07_tug_tracer.js` is one script but has **three public entry points**, and each
writes its own report:

| Entry point | Calls a full walk | Exports |
|---|---|---|
| `synthiaTugDiag.trace(...)` | 1 run (+ optional auto-verify re-walk) | `synthia_tug_trace_<ISO>.json` |
| `synthiaTugDiag.isolation(...)` | 1 run per mask | `synthia_tug_isolation_<ISO>.json` |
| `synthiaTugDiag.abTests(...)` | 5 runs (one per canonical mask) | `synthia_tug_ab_<ISO>.json` |

Each export is complete JSON (samples + attribution + verdict), so every
isolation run is independently shareable/inspectable — you get a trace report,
one isolation report per manual mask, and one consolidated table from
`abTests()`. That's the "3 exports" — not a spawn bug, deliberate per-run
reporting. Paste the file once; whichever function you call afterwards produces
its own file.
