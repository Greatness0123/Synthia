# Synthia — Exhaustive Audit: Every Piece of "Arms Down" Code (Leftover & Live)

## Summary

Checked **every source file** (client TS, coordinator/server TS, Python brain server, providers, stores, engine, test scripts) — excluding markdown/docs/diagnostics JSON. There **is** leftover arms-down logic, and it exists in **three independent layers** that all converge on the same 75° number. Critically, the **Python brain server (`kaggle_server.py`) still contains an explicit leftover instruction to the AI** to "move your arms down to your sides" every new session — the closest match to "code designed to push the arms downwards." Below is the complete inventory, ordered by how directly each pushes arms down.

---

## LAYER 1 — Mechanical arms-down commands (the actual motor commands)

### 1. `src/world/engine/HumanoidPhysicsBinder.ts` — the core leftover
| Location | Code | Effect |
|---|---|---|
| Field | `public restArmAngleDeg: number = 75;` | The single source of the 75 |
| `resetToBindPose()` | `const armsDownAngle = this.restArmAngleDeg * (Math.PI/180);` → **1.308996939 rad** | |
| `resetToBindPose()` (qpos pre-seed "Fix 5") | `qpos[jnt_qposadr] = isArmPitch ? armsDownAngle : 0;` for `mixamorigleftarm`/`mixamorigrightarm` | **Directly writes arm-pitch qpos to +1.309** |
| `resetToBindPose()` (targets) | `currentTargets.set('mixamorigleftarm'/'mixamorigrightarm', { x: armsDownAngle, y: 0, z: 0 })` | **Reseeds both arms' motor targets to +1.309** |
| `getUprightPreset()` | `preset = { arms_down_angle_deg: this.restArmAngleDeg }` | Advertises 75 to every LLM payload |

**When `resetToBindPose()` runs:** (a) agent_0 init via `setMode('rigid')`, (b) new-agent spawn via `resetPose()`, (c) **Reset Pose button → all agents** (`useWorld.handleResetPose` → `forEach` — the surviving ALL-agents fan-out), (d) `executeProgramSequence(["stand"|"upright"|"recover"|"reorient"])`.

**The critical subtlety validated by measurement (`project_info__76.md`):** `+75°` pitch on the upper arm **visually raises the arm to ~86° (arms OUT), not down**. The code *thinks* it's commanding arms-down; it's actually commanding arms-out. So every time this runs on an old agent, its arms visibly move by ~75°.

### 2. `src/world/engine/MotorController.ts` — holds the command
```ts
// setTargets() — spherical [yaw,pitch,roll]:
ctrl[actuatorIds[1]] = pitch * rampFactor;   // pitch = target.x = 1.309
```
Absolute write, held every frame. No leftover accumulation, but this is what physically pins arms at +1.309.

### 3. `src/world/hooks/useWorld.ts` — the fan-out that repeats it on ALL old agents
```ts
// handleResetPose (Reset Pose button):
humanoidPhysicsBindersRef.current.forEach((binder, id) => { ... binder.resetPose(...) });  // ALL binders → arms→1.309 on every agent

// spawnAgent():
newBinder.resetPose(spawnPoint);   // new agent only → arms→1.309 on new agent
```

---

## LAYER 2 — The BRAIN prompt leftovers instructing the AI to move arms down

### 4. `kaggle_server.py` — **LEFTOVER ARMS-DOWN DIRECTIVE (the smoking gun the user suspected)**
Inside `build_prompt()`, **ENVIRONMENTAL AWARENESS block** (still live in the brain server):

```python
"When you first begin a session, your starting pose is a T-pose (arms extended horizontally to your sides) — this is NOT your natural standing position, it is a default reference pose. Your first priority in a new session should be to move your arms down to your sides and settle into your upright_preset stance."
```

This is **explicit leftover code whose entire purpose is to push the arms down**. It tells the Qwen model to prioritize moving arms down at session start. If the model echoes any arm joint override to do so — e.g. lowering to "75° from T-pose" as instructed by the upright preset text — it issues an arm command that the engine's sign-convention then renders as a ~75° arms-out motion. **This is the strongest candidate for "duplicate/leftover code pushing arms downwards."** It is also **contradictory with the other prompts** (client providers say "starting pose is standing with arms hanging at your sides" — a different story).

Also in `kaggle_server.py`: the MOCK_MODE branch returns `"program_sequence": ["stand_upright"]` every cycle → triggers `executeProgramSequence` → `resetToBindPose` → arms commanded to 75° on the target binder.

### 5. Client `src/world/agent/InferenceClient.ts` — arms-down prompt, both provider builders
```ts
const armsDownAngle = (uprightPreset as any).arms_down_angle_deg ?? 75;
// "Upright preset: arms down angle = 75° from T-pose. This is your rest/default arm position."
// "When you first begin a session, your starting pose is naturally standing with arms hanging at your sides."
```
These are the **current** prompts. They make the LLM treat "75° from T-pose" as the rest pose. Duplicated in `buildOpenAIMessages()` and `buildGeminiContents()`.

### 6. `coordinator/src/providers/*.ts` — the SERVER-side duplicates of the same prompt
| File | Same `arms_down_angle_deg ?? 75` | Same "arms hanging at your sides" line |
|---|---|---|
| `openaiCompatProvider.ts` | ✅ `buildMessages()` | ✅ |
| `geminiProvider.ts` | ✅ `buildContents()` | ✅ |
| `kaggleProvider.ts` | ❌ (passes raw payload to Python; Python adds its own arms-down block) | — |

**3–6 = five separate copies of arms-down prompt/logic across the codebase.** This is the "duplicate code" — the 75° arms-down concept is independently re-implemented in: `HumanoidPhysicsBinder` (mechanical), `InferenceClient` (×2), `openaiCompatProvider`, `geminiProvider`, `kaggle_server.py`. Any one of them can drive arms.

---

## LAYER 3 — Leftover diagnostic/legacy scripts that push arms (stale but real)

### 7. `test_joints.js` + `test_stability.js` — legacy Rapier-era console tests
Both call `window.dispatchEvent(new CustomEvent('synthia:resetPose'))` via `sendReset()` — which fans out `resetToBindPose()` **to all agents** (arms→75°) — and both drive `mixamorigleftarm`/`mixamorigrightarm` overrides. If these are ever pasted/left running in the browser console, they are literal leftover code moving arms. `test_stability.js` even has `stabilityStop()` → `sendReset()` → **all agents' arms go to 75°**. `console_walking.js`, `console_diagnose_arm_motion.js`, `console_diagnose_fall.js` also dispatch `synthia:resetPose`-style resets (diagnostics — flagged stale per your instruction, noted for completeness).

### 8. `coordinator/programs/primitives/stand_upright.json` — benign but triggers the reset path
Contains only pelvis/spine/hip targets (no arms), but its *use* via `program_sequence` → `executeProgramSequence` → `resetToBindPose()` arms the 75° command on the target binder. The `motorProgramStore` in mock mode loads it as a primitive; the client AgentLoop passes `motorPrograms: []` so it never reaches the client path.

### 9. `src/world/agent/AgentLoop.ts` (client) — the **only** path where motor programs are intentionally suppressed
```ts
payloadBuilder.build(worldState, agentId, { motorPrograms: [], ... })
```
So on the client path, program-library arms logic cannot reach the LLM — but the upright preset (75°) still does.

---

## The complete "75" trail — 9 code locations, 1 number

| # | File | What pushes/carries arms-down |
|---|---|---|
| 1 | `src/world/engine/HumanoidPhysicsBinder.ts` | `restArmAngleDeg = 75`; qpos pre-seed `+1.309`; `currentTargets` reseed `{x:1.309}` |
| 2 | `src/world/engine/MotorController.ts` | `ctrl[pitch] = target.x` holds 1.309 every frame |
| 3 | `src/world/hooks/useWorld.ts` | Reset-Pose fan-out + `resetPose` on spawn |
| 4 | `kaggle_server.py` | **Leftover explicit instruction: "move your arms down to your sides"** |
| 5 | `src/world/agent/InferenceClient.ts` | `arms_down_angle_deg ?? 75` in 2 prompt builders |
| 6 | `coordinator/src/providers/openaiCompatProvider.ts` | `?? 75` in server prompt |
| 7 | `coordinator/src/providers/geminiProvider.ts` | `?? 75` in server prompt |
| 8 | `test_joints.js` / `test_stability.js` | Stale scripts dispatching `synthia:resetPose` → all-agent arms→75° |
| 9 | `src/world/agent/AgentLoop.ts` | Passes `motorPrograms: []` (suppression) — but upright preset 75 still sent |

---

## What this means for the observed symptom ("75° added with every spawn")

The motor system writes **absolute** targets — nothing adds +1.309 per spawn. What repeats is: every spawn (and the Reset-Pose fan-out) re-runs `resetToBindPose()`, which momentarily writes arm-pitch qpos = 0 (bind) via the fresh MJCF and then re-asserts 1.309 via the interleave/restore/synchronizer-clear path (see `project_info__79.md`). The LLM additionally *believes* arms-down is "75° from T-pose" and is *actively instructed* by `kaggle_server.py` to move arms down — so the model may re-emit arm commands each cycle, producing the same ~75° arm movement repeatedly on all old agents.

## Priority fixes (Act Mode)

1. **Delete/replace the `kaggle_server.py` environmental block** — remove "move your arms down to your sides" / T-pose-vs-natural language. This is pure leftover.
2. **Unify the arms-down prompt in all 5 files** (InferenceClient ×2, openaiCompatProvider, geminiProvider, kaggle_server) to describe arms-down by the correct joint semantics, or omit the specific "75° from T-pose" number.
3. **Gate `synthia:resetPose` per-agent** (add `agentId` to the CustomEvent detail in `BodyControls.tsx` + read it in `useWorld`).
4. **Correct/remove the `restArmAngleDeg` mechanical command** — empirically find the pitch that yields arms truly down (likely 0 from bind) and stop pre-seeding qpos.
5. **Stop clearing `AvatarSynchronizer` on old binders during spawn** so the interleave frame doesn't hard-snap arms.
