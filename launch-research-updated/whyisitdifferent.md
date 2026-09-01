# SYNTHIA — Why It's Different & Why You'd Use It for Datasets

**A grounded-in-the-`src` argument for what makes Synthia genuinely novel, who should use it, and when.**

---

## The One-Sentence Thesis

Synthia is not a chatbot wearing a puppet — it's a **fully embodied, self-modifying, multi-agent, real-Physics mind running entirely in your browser**, and the things it *learns* are already formatted as **complete, labeled, reward-bearing training episodes**.

Most "AI robot" demos end at "look, a character moves." Synthia's `src` shows a system built to **generate the data that trains real policies** — joint states, decision traces, outcomes, rewards, memories, and identity changes, all recorded per episode.

---

## The Concrete Edges (Grounded in `src`)

### 1. It's a Real `AgentLoop`, Not a One-Shot Chat

The heart is `AgentLoop.ts` — a `setInterval`-driven *heartbeat* that repeatedly:
- captures the world state
- builds a multimodal payload (`PayloadBuilder`)
- streams to an LLM (`InferenceClient`)
- parses an action JSON
- dispatches a `synthia:action` event
- writes a memory
- routes an outcome (reward) back into the loop

This is a **closed-loop, continuous agent** — not a prompt-and-done. It *lives* in the simulation.

### 2. It Has a Full "Sensory Channel" — Not Just a JPG

Every cycle `captureWorldStateForAgent()` in `useWorld.ts` assembles **seven distinct senses**:
- **Vision** — a first-person 448×448 webp from a camera mounted on the head bone
- **Proprioception** — full joint positions/velocities via `getJointState()` / `ObservationBuilder.buildVLMProprioception()`
- **Tactile** — real MuJoCo contact forces per body part, converted to natural language in `PayloadBuilder.buildTactileContext()`
- **Vestibular** — a live balance summary ("LEANING FORWARD 14°", "CRITICAL TILT 22°") computed in `buildPerceptionSummary()`
- **Audio** — ambient audio PCM buffer from `AudioEngine`
- **Overheard speech** — other agents' utterances, with **distance-based and occlusion-based degradation** (a wall genuinely blocks sound — there's a `THREE.Raycaster` for it)
- **User injection** — a forced user directive that overrides free will

That's a genuinely *rich* embodied sensing stack — much more than "here's an image, tell me what to do."

### 3. It Has Real Physics With a *Layered Control Stack* — Not Scripted Animation

The body isn't a canned animation. `HumanoidPhysicsBinder` + `MotorController` hand actual joint angles to **MuJoCo WASM at 500 Hz**, and MuJoCo resolves real contact, friction, mass, and inertia.

Then there's the *secret sauce* — an **additive balance/reflex stack** applied per-step:
- **Road-2:** capsule PD balance torque (keeps the pelvis upright)
- **Road-3:** critically-damped root velocity servo (≤0.15 m/s)
- **Road-4:** mass-weighted **center-of-mass lean reflex** with capture-steps on the swing leg — the "walking as controlled falling" layer
- **Road-5 / RMBS:** a real 18 kg **reaction-mass** sliding weight inside the pelvis ("human pendulum" balance)

This is biomechanics-grade control, layered. The agent is *fighting* for the ability to walk — exactly the kind of data you want to capture.

### 4. It's Multi-Agent AND Social

You can spawn `agent_0`, `agent_1`, ... — each with its own `HumanoidPhysicsBinder`, its own `AgentLoop`, its own identity, and its own memories. They share a world.

Because of the `synthia:agent_spoke` event + `speechStore` + `overheard_speech` pipeline, **agents hear each other** — with realistic degradation. They can *converse*. This is emergent multi-agent social dynamics, not a single puppet.

### 5. Agents Can Rewrite Their Own Identity

`identityManager.ts` lets an agent output an `identity_update` to:
- change its **name**
- **append/modify/replace its beliefs** (with `{ op: 'append', entry: ... }`-style ops)
- replace its **traits** (e.g. `{ curiosity: 0.9 }`)

And there's a **rate limit (1 edit / 5 min) + required reasoning + audit log** (`agent_identity_log`). The agent *creates its own personality* — and every change is logged. That's a dataset object in itself.

### 6. It's Built to *Generate Datasets*

This is the killer feature for your use case. Look at `MemoryEntry` in `memoryManager.ts`:

```
{
  memory_id, heartbeat, day_cycle, light_state, tier,
  visual_description,       // what the agent SAW
  audio_state,              // what it HEARD
  joint_state_summary,      // its full BODY state (JSON)
  self_questions,           // its internal questioning
  thought,                  // its REASONING (stripped of speech tags)
  action_taken,             // the FULL action JSON it chose
  outcome,                  // the RESULT (e.g. "Agent fell")
  reward_signal,            // the REWARD it got
  goal_at_time,             // what it was TRYING to do
  injected,                 // was this user-driven?
  session_id,               // which episode it belongs to
  frame_buffer              // optional vision frame
}
```

That is a **complete RL/reasoning training episode** — observation → reasoning → action → outcome → reward → goal. Every single heartbeat produces one.

And the dataset-export tooling exists too: `src/utils/clientDatasetExporter.ts`, `src/utils/hdf5Writer.ts`, `src/utils/parquetWriter.ts`, and `src/components/export/ExportModal.tsx`. You're not just running a demo — you're **harvesting supervised/RL data**.

### 7. There's RL-Episode Scaffolding Built In

`useWorld.ts` has `maybeEmitEpisodeTermination()` and `trainingStore.ts` has `episodeStartTime`, `maxEpisodeSeconds`, `healthyHeightMin/Max`, `etEnabled`, `startNewEpisode()`. 

If you enable training mode + ET, the system will:
- detect falls (unhealthy height), out-of-bounds, and timeouts
- emit `{ success: false, reward: -1.0, description: 'Episode terminated (out_of_bounds)' }`
- start a fresh episode automatically

That's a native **episode/termination/reward cycle** — the seed of a real RL training pipeline. The agent can also get positive rewards from object interactions (`button_press` → `+0.5`) via `ObjectManager` event callbacks.

### 8. It's Provider-Agnostic (Bring Your Own Brain)

`InferenceClient` builds OpenAI-compatible requests and streams SSE. `connectionStore` supports **24+ providers** (Kaggle, Gemini, OpenRouter, Groq, Ollama, LM Studio, Anthropic, OpenAI, DeepSeek, etc.). `agentRuntimeStore` allows **per-agent overrides** — agent_0 can run on Qwen, agent_1 on GPT-4o, simultaneously. You are never locked to one model.

### 9. It Has a "Motor Codex" — A Learnable Motor Memory

`motorCodexService.ts` statically queries a curated recipe library (`constants/motorCodex.ts`), scores recipes against the current goal/context, and injects the best ones into the prompt as a **"Motion Guide Manual"**. This is a *prior motor knowledge* system — the agent is bootstrapped with known-good motor programs, then can learn to improve on them.

### 10. Everything Is Debuggable & Instrumentable

Every major subsystem exposes itself on `window`:
- `__SYNTHIA_PHYSICS_ENGINE__`
- `__SYNTHIA_HUMANOID_BINDERS__`
- `__SYNTHIA_RMBS_TELEM__` (reaction-mass telemetry ring)
- `__SYNTHIA_DIAG_RING__` (a 300-frame physics snapshot ring, `diagnose_fall_quick()` for post-mortem fall analysis)
- `__SYNTHIA_GENERATE_COMBINED_MJCF__`

For a *researcher* building datasets, this is gold: you can drive the system programmatically from the console, inspect exact physics state, and capture reproducible trajectories.

---

## Why *Should* People Use Synthia for Datasets?

**Because the data it produces is already structured for learning.**

Most embodied-AI setups require you to *write* a logging layer, synchronize timestamps, join observations with actions, and manually attach rewards. Synthia already does all of that inside `AgentLoop.finalizeCycle()`:

- The **`thought`** is the agent's raw reasoning stream.
- The **`action_taken`** is the exact action JSON it executed.
- The **`outcome`** and **`reward_signal`** are captured from the physics/object callbacks.
- The **`joint_state_summary`** is the full body pose at decision time.
- The **`visual_description`** is what it saw (and `frame_buffer` can store the actual image).
- The **`injected`** flag tells you whether a human forced the decision.
- The **`session_id`** groups everything into episodes.

So `MemoryEntry` is literally a **(s, a, r, s', goal, reason, vision, proprioception)** tuple. You can export it to HDF5/Parquet (`hdf5Writer.ts`, `parquetWriter.ts`) and feed it straight into a learning pipeline.

**Best use cases:**
- **RL / imitation data generation** — let a VLM agent fumble, correct, and learn, and capture the full (observation, action, reward) trajectory.
- **Embodied "chain-of-thought" datasets** — the `thought` channel gives you natural-language reasoning *aligned with physical action*, which is rare.
- **Multi-agent social-behavior datasets** — capture how agents converse, form memories, and modify their identities over time.
- **Failure-mode / fall-recovery datasets** — the fall diagnostics ring + ET system make it easy to collect rich "how it fell and how it recovered" data.
- **Baseline generation for humanoid control** — a large corpus of "what does a 90 kg humanoid with 80+ joints actually do when asked to walk/wave/jump."

---

## When Should You Use It (and When NOT To)

### ✅ Use it when:
- You want **real physics** and **real feedback loops**, not scripted animation.
- You want **per-episode labeled data** with reasoning, action, outcome, and reward.
- You want **multi-agent emergent behavior**.
- You want to **test different LLM models** on the same embodiment (provider-agnostic).
- You want **client-side, low-friction** — no server needed for the core (Supabase is optional; there's a mock store).
- You want a **debuggable, instrumentable** research platform.

### ❌ Don't use it when:
- You need **production-grade safety** — it's a research sandbox, not a safety-certified robot controller.
- You need **deterministic, reproducible sim-to-real transfer on a specific commercial robot** — while the physics is real, the rig is a Mixamo humanoid, not a specific robot arm/quadruped with calibrated motor specs.
- You need **very high throughput RL** (e.g. thousands of parallel envs) — this is a single-browser simulation (though the React/Three/MuJoCo stack is fast, it's not an RL-gym-scale vectorer).
- You expect **out-of-the-box non-humanoid bodies** — see the next section.

---

## Does Being Limited to One Robotic Type Limit It?

**Honest answer: Today — yes, it's humanoid-only. Architecturally — no, it's body-type-agnostic.**

Let me explain with the `src` evidence:

- The type system (`src/types/world.ts`) declares `BodyType = 'humanoid' | 'quadruped' | 'robotic_arm' | 'custom'` — so the *intent* is multi-body.
- But `worldStore.setBodyType()` explicitly warns: `Body type ${bodyType} is currently disabled. Coming in a future update.` — and even does a `return` early if it's not `'humanoid'`.
- `MJCFHumanoidTemplate.ts` and `BONE_JOINT_TYPE` are hard-coded to the **Mixamo humanoid** skeleton (`mixamorigleftarm`, `mixamoriginth`, etc.), and the `PromptAssembler.P02_BodySchema` says "You inhabit a humanoid body with approximately 80 joints and 120 degrees of freedom."
- The `PayloadBuilder` passes `body_type` and `valid_joints` in the payload, and `PromptAssembler.buildP20BodyTypeOverride()` has a segment that reads: "You are currently inhabiting a `${payload.body_type}` body. Refer to your valid_joints list..." — this means **the prompt architecture is already prepared to handle other body types**; it just needs the MJCF generator + a valid-joints map for the new rig.

So the *real* limitation is:
1. The **`MJCFHumanoidTemplate`** needs a new function to generate a non-humanoid skeleton (it only knows how to emit Mixamo-style bodies)
2. The **`HumanoidPhysicsBinder`** assumes a humanoid bone hierarchy (head, hips, feet)
3. The **`PromptAssembler`** segments heavily reference humanoid body parts (arms, hips, arms-down preset)
4. The **`CameraManager`** head-mount logic assumes a "head bone"

**But** because the whole pipeline is driven by a *bone-info map* (names + positions → MJCF), swapping in a quadruped or arm *is possible* with targeted work on `MJCFHumanoidTemplate.ts` + `BodyManager` + the prompt segments. It's not a fundamental architecture constraint — it's a porting effort.

**Bottom line:** If you need quadruped/robot-arm datasets *today*, Synthia needs extension work. If you're fine with humanoid locomotion/manipulation (that's where most embodied-AI training data lives anyway), Synthia already has the full pipeline.

---

## The Verdict

Synthia is a **rare combination**:

> **A real-Physics, real-Embodied, real-Memory, Multi-Agent, Reward-Bearing AI sandbox that runs in a browser and emits structured training episodes.**

Most systems do one or two of these. Synthia does all of them *in one integrated loop*. Its biggest differentiator is not any single feature — it's that the **entire embodied cognition stack** (senses → reasoning → action → outcome → memory → identity) is **tightly coupled and already emitting dataset-ready records** on every heartbeat.

For anyone building **datasets for embodied AI / humanoid control / multi-agent social interaction / self-modifying agents**, Synthia's `src` is a ready-made *data factory* — the dataset format is literally the memory schema. That's the edge.

---

**Focus note:** This report is grounded entirely in `src/` (the `world/agent`, `world/engine`, `store`, and `utils` layers). I deliberately omitted the Python scripts, `actions/` js files, and docs — the differentiation is all in the `src` architecture.
