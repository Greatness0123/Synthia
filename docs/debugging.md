# SYNTHIA: Debugging Guide

This guide covers the built-in diagnostic tools for investigating agent behavior, physics issues, and inference problems. Most of these tools are browser console scripts that you can paste into the DevTools console while the app is running.

---

## Table of Contents

1. [Built-in Console Diagnostics](#built-in-console-diagnostics)
2. [Fall Diagnosis](#fall-diagnosis)
3. [Arm Motion Ghost Diagnosis](#arm-motion-ghost-diagnosis)
4. [COM and Inverted Pendulum Recorder](#com-and-inverted-pendulum-recorder)
5. [Inference Debugging](#inference-debugging)
6. [Physics Tuning](#physics-tuning)
7. [Common Issues](#common-issues)

---

## Built-in Console Diagnostics

The app exposes several diagnostic utilities on the `window` object. To access them:

1. Run the app (`npm run dev`).
2. Open the browser DevTools console (F12).
3. Type the command and press Enter.

### `window.diagnose_fall_quick()`

Downloads a `fall_diagnosis.json` file containing a 300-frame ring buffer of physics telemetry, including:

- Tilt angle and root height
- Foot heights and contacts
- Center of mass position
- Applied `xfrc` torques
- Per-joint qpos/qvel
- Body positions

This is the primary tool for investigating falls.

---

## Fall Diagnosis

### How to capture a fall

1. Reproduce the fall in the app.
2. In the console, run:
   ```js
   window.diagnose_fall_quick()
   ```
3. A JSON file downloads with the last 300 frames before the command was run.

### What to look for

The ring buffer captures the moment before, during, and after a fall. Key signals:

| Signal | What it indicates |
|---|---|
| Steadily increasing tilt angle | Insufficient balance torque or gain |
| Sudden spike in xfrc torque | Possible gain oscillation or instability |
| Foot losing contact early | Spawn alignment or gait phase issue |
| COM drifting behind support polygon | Balance controller not responding to drift |

---

## Arm Motion Ghost Diagnosis

### Symptom

All pre-existing agents show arm movement with no visible cause, while a freshly spawned agent appears with arms at their side (correct).

### Diagnostic Tool

The `console_diagnose_arm_motion.js` script in the repo root provides a suite of commands:

| Command | Description |
|---|---|
| `synthiaArmDiag.snapshot()` | One-time state dump for all agents (arm raise angle, targets, world state) |
| `synthiaArmDiag.scan()` | Static check for every known ghost source |
| `synthiaArmDiag.observe(6)` | Watch for 6 seconds, then auto-print verdicts |
| `synthiaArmDiag.observe(6, true)` | Same, plus downloads raw samples as JSON |
| `synthiaArmDiag.report()` | Re-print the last observation verdicts |
| `synthiaArmDiag.reset()` | Clear listeners and buffers |

### Verdict categories

- `LLM_COMMAND` — an arm bone was commanded by the LLM/AgentLoop
- `STALE_TIMELINE` — an old animation timeline is still playing
- `CTRL_RAMP` — motor ctrl ramp still active at onset
- `SPAWN_WORLD_RELOAD_RACE` — a world reload caused by a spawn
- `UNEXPLAINED_GHOST` — no known source found

### Usage

Paste the entire `console_diagnose_arm_motion.js` script into the DevTools console, then run one of the commands above.

---

## COM and Inverted Pendulum Recorder

The `com_pendulum_recorder.js` script records real-time Center of Mass telemetry.

### Usage

1. Paste the entire script into the DevTools console and press Enter. Recording starts immediately.
2. Real-time telemetry prints to the console every 0.5 seconds.
3. Type `stopcom` (or `stopcom()`) to stop and download the JSON.

### What it records

| Metric | Description |
|---|---|
| COM position (world + MuJoCo frames) | Center of mass in both coordinate systems |
| COM velocity | Frame-to-frame velocity |
| Linear acceleration | Derived from velocity deltas |
| Inverted pendulum height | COM height above ground |
| Time constant (tau) | `sqrt(height / gravity)` |
| Capture point | COM + velocity * tau (balance stability indicator) |
| Tilt angle | Angle from vertical |
| Root position and orientation | Capsule pose data |

---

## Inference Debugging

### Testing the provider connection

1. Open the Agent Settings modal (gear icon).
2. Click **Test Connection**.
3. The app sends a minimal request and reports latency + success/failure.

### Checking the browser network tab

Open DevTools > Network tab and filter by `chat/completions` or `infer`. Look for:

- **401/403** — Invalid API key or missing shared secret
- **429** — Rate limited. The provider may be throttling.
- **500** — Provider server error or misconfigured endpoint
- **502** — Proxy fetch error

### Checking the console

The AgentLoop logs each cycle:

```
[AgentLoop (agent_0)] Sending inference request...
[AgentLoop (agent_0)] Inference completed. Parsing action JSON.
[AgentLoop (agent_0)] Client-side memory saved successfully: mem_...
```

If you see `[AgentLoop ...] Skipping cycle: previous inference is still in-flight.`, the provider is too slow or the cycle interval is too short.

If you see `[InferenceClient] Connection failed, backing off 10000ms`, the endpoint is unreachable.

---

## Physics Tuning

### Exposed globals

The app exposes several diagnostic globals:

| Global | Description |
|---|---|
| `window.__SYNTHIA_HUMANOID_BINDERS__` | Map of agent ID to `HumanoidPhysicsBinder` |
| `window.__SYNTHIA_PHYSICS_ENGINE__` | The `PhysicsEngine` instance |
| `window.__SYNTHIA_MUJOCO_MODULE__` | The MuJoCo WASM module |

### Balance gain access

Each binder exposes its `MotorController`:

```js
const binder = window.__SYNTHIA_HUMANOID_BINDERS__.get('agent_0');
const mc = binder.motorController;
console.log(mc.BALANCE_KP, mc.BALANCE_KD, mc.MAX_BALANCE_TORQUE);
```

### Important note on `gaitActive`

There is a known issue: `MotorController.GAIT_BALANCE_SCALE` and the `gaitActive` flag exist but are never activated by any caller. This means the balance controller runs at full strength even during AI-commanded motion, which can cause stiff or robotic movement. This is a documented area for future work; see `PATH` in the physics reports for detailed analysis.

---

## Common Issues

### Blank screen or "World is not ready"

- Ensure WebGL 2.0 is enabled.
- Check for errors in the console like `WebGL context lost`.
- Try a different browser (Chrome or Edge on desktop works best).
- Verify `@mujoco/mujoco` loaded correctly (it is excluded from Vite's dep optimization).

### Agent does not think or act

- Check the console for `[AgentLoop] Skipping cycle: world state not available yet.` — the physics engine may not have finished initializing.
- Verify the provider is configured in the settings modal.
- Check for backoff messages indicating connection failures.

### Multi-agent spawn fails

- Check the console for MJCF generation errors.
- Verify the MuJoCo model compiled successfully (`[WorldEngine] Model compiled`).
- Spawning multiple agents increases memory and CPU load significantly.

### Agent memory not persisting

- Verify the Supabase vector extension is enabled.
- Confirm the URL and anon key are correct.
- Check for Supabase network errors in the console.

### Audio not working

- The browser requires a user gesture to start audio. Click anywhere in the page.
- Verify `Tone.start()` was called (it fires on first click).
- Check the browser's autoplay/audio permission settings.

---

## Further Reading

- [setup.md](setup.md): Full configuration walkthrough
- [architecture.md](architecture.md): System architecture and data flow
- [README.md](../README.md): Project overview and quick start
