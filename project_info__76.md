# Synthia — Arm Motion "Ghost" Diagnosis (Evidence Report)

## Summary

The capture the user ran (`arm_motion_diag_1785693768514.json`, 6s window, 65 samples) **proves there is no ghost input**. No `synthia:action` events fired, no timeline was queued, the motor ramp was long finished, and no spawn occurred during the window. Yet both arms sit at a **visual raise of 86.04°** — essentially a T-pose — held there by the *arms-down rest command itself*. The perceived "unsolicited arm movement" is the servo sweep that happens right after every spawn / world reload: the visual skeleton briefly shows the GLB bind pose (arms by side — what the user sees on the freshly spawned model), then the motor controller drives the arm-pitch joints to the `restArmAngleDeg = 75°` target, which **visually maps to ~86° raised, not arms at the side**. Every agent converges to the same near-horizontal pose within a fraction of a second and locks there.

## Evidence from `arm_motion_diag_1785693768514.json`

| Signal | Value in capture | Interpretation |
|---|---|---|
| `actions` | `[]` (empty) | Zero `synthia:action` events in the whole window → no LLM/AgentLoop arm command occurred |
| `spawnEvents` | `[]` | No world reload / spawn during the window |
| `tlq` (timelineQueue) | `0` for all 65 samples | No stale animation timeline playing |
| `ramp` (ctrlRampStep) | `546` (≫ 20) | Motor ramp fully elapsed; ctrl at full strength — not a ramp artifact |
| `cL` / `cR` | `1.3089969389957472` | **Exactly** 75° in radians = `restArmAngleDeg * π/180`. The motor is being commanded to the rest pose and is holding it |
| `qL` / `qR` (arm pitch qpos) | `≈ 1.3168` | Joint settled at the commanded angle (steady-state servo error ≈ 0.45°) → arms are **not actively moving** during the capture |
| `l` / `r` (visual raise) | `86.04211785027306` / `86.04093593453452` | Constant to 8 decimal places for 65 samples → the "rest" pose visually holds the arms out near-horizontal |

## What this rules out

All four categories the diagnostic was built to detect are eliminated by the data:

1. **LLM_COMMAND** — ruled out: zero `synthia:action` events.
2. **STALE_TIMELINE** — ruled out: `tlq = 0` throughout.
3. **CTRL_RAMP** — ruled out: `ramp = 546`, and the ctrl value is the exact rest target, not a ramp-scaled mid-swing value.
4. **SPAWN_WORLD_RELOAD_RACE** — no spawn in-window (though see caveat below — the *aftermath* of a prior reload is exactly what the capture shows).

## Root cause: the "arms down" rest pose is mapped to arms-out

The stable state in the capture is the smoking gun: **the motor is at rest, and rest = arms at ~86° raise.** The chain is:

1. `HumanoidPhysicsBinder.restArmAngleDeg = 75` and `resetToBindPose()` computes `armsDownAngle = restArmAngleDeg * π/180 = 1.308996939 rad` and sets, for both arms:
   - `currentTargets.set('mixamorigleftarm' / 'mixamorigrightarm', { x: armsDownAngle, y: 0, z: 0 })`
   - and pre-seeds the arm-pitch `qpos` to `armsDownAngle` (the "Fix 5" in `resetToBindPose`).
2. `MotorController.setTargets()` maps the `{x, y, z}` target to actuators `[yaw, pitch, roll]` → `ctrl[pitch] = +1.309 rad` (exactly the captured `cL`/`cR`).
3. `AvatarSynchronizer.synchronize()` slerps the visual bone quaternion 85% per frame toward the MuJoCo result — so the sweep from bind pose to the target pose is rendered as a **smooth, visible arm motion over roughly half a second** with no LLM input.
4. The measured result: `qpos = 1.317 rad` ↔ visual raise `86°`. A **positive 75° upper-arm pitch in this rig rotates the arm up and out — not down at the side.**

So every time a binder's pose is reset — on world load, on `setMode('rigid')` (active agent, `resetPose` defaults true), and on every new spawn via `spawnAgent` → `setMode(worldStore.bodyMode)` → `resetToBindPose()` — the arms sweep from wherever they are to the near-T-pose and stay there. That is the "arm movement with no cause."

## Why the freshly spawned model appears to have arms by side

At spawn, `loadAndVisualizeBindPose()` puts the *visual* skeleton at the GLB bind pose (arms down) before any physics step. Then `resetToBindPose()` immediately rewrites the arm-pitch `qpos` and `currentTargets` to +1.309 rad, and within a few frames (`syncVisuals` + the 0.85 slider interpolation) the arms sweep to ~86°. The user sees the initial arms-by-side frame and then the unsolicited sweep on every model — the original agent included, because it *also* went through `setMode('rigid')` → `resetToBindPose()` during initialization and converges to the same wrong rest pose.

## Fix directions (for Act Mode — not performed here)

1. **Correct the rest angle mapping** — determine the joint command that actually yields arms vertical from the measured frame. The capture tells us `+1.309 rad → ~86° raise`. Try `-restArmAngleDeg` and/or small/zero angles:
   - If `target ≈ 0` visually gives arms-by-side (pure bind = arms down), then simply dropping the arm-pitch rest to `0` fixes it and `resetToBindPose` should stop pre-seeding `qpos` with `armsDownAngle`.
   - If a *negative* angle gives arms-by-side, the sign convention of `restArmAngleDeg` is inverted relative to the rig's pitch axis (`axis="1 0 0"` in the MJCF arm joints).
2. **Recheck the axis/frame convention** — the Mixamo bind quaternion bakes a large rotation into the arm body frame; the commented-out head/neck axis swap in `MJCFHumanoidTemplate.ts` shows this class of bug is known for other bones. The arm pitch axis and/or the bind-pose-relative rest angle need to be validated empirically the same way.
3. **Avoid the visual flash/sweep** — even with a correct rest target, consider not pre-seeding arm `qpos` on old binders during spawn (they currently aren't reset, which is correct), and verifying the new binder's first frames match the bind pose.

## 30-second confirmation experiment (browser console)

Paste while the world is running; arms should drop if the rest-target theory is right:

```js
const map = window.__SYNTHIA_HUMANOID_BINDERS__;
for (const [id, b] of map) {
  b.setMotorTargets({ mixamorigleftarm: 0, mixamorigrightarm: 0 });
}
```

Arm drop → the +1.309 rest target is what held them out. Then try `-1.309` — if arms go truly down at the side, the rest-angle sign is simply inverted.

## Caveat / next capture suggestion

The current capture contains only `agent_0` and no spawn mid-window. To fully close the loop, re-run `synthiaArmDiag.observe(10, true)` while pressing the spawn button ~3 s in, with ≥2 agents present. Expected result per this diagnosis: a `SPAWN DETECTED` entry, and the freshly spawned agent's raise rising from ~0° to ~86° over ~0.5 s with no matching `synthia:action` — definitively tying the visual motion to the rest-pose servo sweep rather than any input source.
