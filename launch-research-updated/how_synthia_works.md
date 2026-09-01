# SYNTHIA — How the `src` Folder Actually Works

## Summary (The Pitch)

SYNTHIA is a **browser-based artificial mind wearing a robot body**. It's a React app that loads a 3D humanoid model (an "x-bot" glTF), generates a physics model for it on the fly, and then gives one or more AI "agents" the ability to *see*, *think*, *act*, *remember*, *speak*, and *change their own personality*. 

Imagine a Tamagotchi that's a full humanoid robot, running entirely in your browser, powered by a vision-language model (like Qwen-VL) via an OpenAI-compatible endpoint, with MuJoCo (a physics engine compiled to WebAssembly) doing the actual "being a body" part.

---

## The Big Picture: What Talks to What

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (App.tsx → components/)                          │
│   - 3D viewport (WorldViewport)                            │
│   - Agent inspector (Thoughts, Memories, Body, Logs)       │
│   - God Mode panel (physics controls, spawn objects)       │
│   - Task input, status bar, modals                         │
└───────────────┬─────────────────────────────────────────────┘
                │ (Zustand stores act as the shared brain)
┌───────────────▼─────────────────────────────────────────────┐
│  useWorld() hook — the CONDUCTOR                            │
│  - Boots MuJoCo WASM + Three.js scene                      │
│  - Spawns agents (HumanoidPhysicsBinder instances)         │
│  - Runs the render/physics loop (500 Hz physics, 60 Hz UI) │
│  - Listens for "synthia:action" custom events              │
└───────┬──────────────────────────────┬──────────────────────┘
        │                              │
┌───────▼───────────────┐   ┌──────────▼──────────────────────┐
│  PHYSICS LAYER        │   │  COGNITIVE LAYER                │
│  (world/engine/)      │   │  (world/agent/)                 │
│  PhysicsEngine        │   │  AgentLoop — the "heartbeat"    │
│  HumanoidPhysicsBinder│   │  PayloadBuilder — packs senses   │
│  BodyManager          │   │  InferenceClient — talks to LLM │
│  MotorController      │   │  PromptAssembler — the "mind"   │
│  MJCFHumanoidTemplate │   │  MemoryManager — long-term      │
│  CameraManager        │   │  IdentityManager — personality  │
└───────────────────────┘   └─────────────────────────────────┘
```

---

## The Story, Step by Step

### 1. The app boots
`src/main.tsx` mounts `App()`. `App.tsx` renders the 3D viewport, the agent inspector panel, God Mode controls, task input, and a bunch of modals. It also sets up **Tone.js** for audio and initializes the speech engine.

The actual magic happens in `useWorld()` — a React hook that lives inside the `WorldViewport` component. This hook:
- Creates the `PhysicsEngine` (MuJoCo WASM)
- Creates the `WorldEngine` (Three.js scene + renderer)
- Starts the physics loop
- **Auto-spawns your first agent** (`agent_0`) once the world is ready

### 2. An agent is born
When `spawnAgent()` runs (either automatically on load or via the "+ Spawn Agent" button):
1. The `HumanoidPhysicsBinder` loads the 3D model (`x-bot.glb`) and extracts its **bone skeleton**.
2. `BodyManager` converts that skeleton into a **MuJoCo MJCF** — a physically accurate humanoid with ~80 joints, a 15 kg pelvis capsule, and even **fingers**.
3. The MJCF is loaded into MuJoCo, and the `MotorController` turns on the position-servo motors for every joint.
4. An `AgentLoop` is started — this is the agent's "cognitive heartbeat" that fires every ~2 seconds.

### 3. The agent SEES and THINKS
Every cycle, `AgentLoop` asks `captureWorldStateForAgent()` to gather the agent's senses:
- **A first-person image** from a camera mounted on its head (448×448 webp)
- **Joint positions/velocities** (proprioception — "where am I in space?")
- **Tactile contact forces** (what am I touching?)
- **Audio** from the audio engine
- **Balance state** (vestibular sense — "am I leaning?")

These get packed into a **payload** by `PayloadBuilder`, which also:
- Queries its **memories** (via embedding + Supabase vector search)
- Adds **overheard speech** from other agents (so agents can talk to each other)
- Injects any **user override directive** (the "Injection" panel)

The payload is sent to the AI model through `InferenceClient`. The model streams back two things separated by `---ACTION---`:
- A **thought stream** (the agent's internal reasoning, streamed token-by-token into the UI)
- A **JSON action block** (what it wants to do with its body)

### 4. The agent ACTS
The action JSON is dispatched as a `synthia:action` window event. `useWorld()` hears it and hands it to the right `HumanoidPhysicsBinder`. The binder:
1. **Validates** every joint command against anatomical limits (e.g. "you can't bend a knee 200°")
2. **Clamps** anything illegal and records the rejection as *physical feedback* for the next cycle
3. Sets the motor targets → MuJoCo's position servos move the skeleton
4. Runs the **timeline** (if the agent sent a sequence of poses) with smooth interpolation between frames

**The secret sauce:** The root body is balanced by a **capsule PD controller** — a virtual "invisible robot" that keeps the agent upright so it doesn't constantly fall over. This is why the agent can think about complex movements without spending every cycle just trying not to tip. When it *does* fall, it can output `reset_pose` to instantly pop back up.

### 5. The agent LEARNS
Each cycle, the agent writes a **memory** — a structured record of what it thought, what it did, and what happened (including whether it got a reward). Memories go to:
- **Supabase** (if configured), with an embedding for semantic recall
- Or a **client-side mock store** if no database is set

The agent also has an **identity** (name, beliefs, traits) stored in Supabase. It can *rewrite its own personality* by outputting an `identity_update` in its action JSON — with a rate limit of one edit every 5 minutes and a required reasoning field.

### 6. The agent SPEAKS
Any text wrapped in `<speak>...</speak>` tags in the thought stream is:
- Spoken aloud via the browser's Web Speech API
- Broadcast as an **utterance** to a shared speech store
- Other agents "hear" it (with realistic degradation based on distance and occlusion — a wall blocks sound!)

### 7. The agent MULTIPLIES
You're not limited to one agent. The "+ Spawn Agent" button creates another `HumanoidPhysicsBinder`. Because MuJoCo builds physics models from XML, `useWorld` **rebuilds the entire physics world** each time an agent spawns, stitching multiple humanoids into one combined MJCF and **rehydrating** all the existing agents' exact positions/velocities. That's what `StateRehydrator` does — it's the "save state" system that prevents your existing agents from teleporting to the floor when a new one joins.

---

## Key Abstractions (The "Who's Who")

### `PhysicsEngine` (world/engine/PhysicsEngine.ts)
- **The body's physics.** Wraps MuJoCo WASM. Loads MJCF XML models, steps the simulation forward at 500 Hz, handles contacts, applies forces.
- **Big gotcha:** It never touches Emscripten's `HEAP8/HEAPU8` directly — doing so permanently kills the WASM instance. It has a circuit breaker that stops the loop if memory gets critical.

### `HumanoidPhysicsBinder` (world/engine/HumanoidPhysicsBinder.ts)
- **The bridge between mind and body.** Owns the skeleton, the physics body, and the motor controller. It's the class that gets *driven* by the action pipeline and reads back the joint state for the agent's senses.
- Also runs **balance assistance layers**: a resting capsule-balance torque, a root velocity drive, a COM lean-reflex (Road-4), and even a **reaction-mass balance system** (RMBS) — a sliding 18 kg internal weight that shifts to keep the body stable, like a human's sway.

### `MotorController` (world/engine/MotorController.ts)
- **The joint servo controller.** Converts "pitch this arm 45°" into MuJoCo actuator control values. Has a 20-step ramp on startup so joints glide rather than snap. Supports "ragdoll mode" (zeroing gains so the body goes limp).

### `AgentLoop` (world/agent/AgentLoop.ts)
- **The cognitive heartbeat.** A `setInterval` that fires every `cycleMs` (default 2000 ms). It gathers world state, builds the payload, calls the LLM, parses the action JSON, and writes memories. It's the *only* place the agent's status badge gets updated.

### `AgentLoop`'s "InferenceClient" (world/agent/InferenceClient.ts)
- **The mouth to the brain.** Sends the payload to any OpenAI-compatible endpoint (Kaggle, Ollama, LM Studio, etc.) and streams the response. Has exponential backoff for connection failures.

### `PromptAssembler` (world/agent/PromptAssembler.ts)
- **The mind's identity.** Builds the massive system prompt from ~20 modular segments (identity, physics rules, motor control contract, output schema, etc.). Uses a **cache boundary** strategy — static segments first, dynamic context last — so your LLM provider's prompt cache actually gets hits.

### `PayloadBuilder` (world/agent/payloadBuilder.ts)
- **The senses packer.** Turns world state into the JSON payload. Builds rich natural-language *tactile* and *vestibular* descriptions, so even a text-only model understands "your left foot is pressing against the floor with 12 N·s."

### `MJCFHumanoidTemplate` (world/engine/MJCFHumanoidTemplate.ts)
- **The body builder.** Takes the 3D skeleton and emits a MuJoCo XML model: joint definitions (spherical/revolute), anatomical ranges, masses, friction, and 20 pre-allocated "environment slot" bodies buried underground for dynamic object spawning.

### `StateRehydrator` (world/engine/StateRehydrator.ts)
- **The save/load system.** Captures joint angles, velocities, and actuator states *before* a world rebuild, then restores them *afterward*. Critical for multi-agent worlds — without it, spawning a second agent would reset the first to a T-pose.

### `CameraManager` (world/engine/CameraManager.ts)
- **The eyes and the audience.** Manages the third-person orbit camera, the first-person chase cam, and the AI perception camera. It's the one that renders 448×448 frames from the agent's head for vision.

---

## The Main Data Loop (in one diagram)

```
                    ┌───────────────────────────────────────────┐
                    │             "Mind" (AgentLoop)            │
                    │  1. Capture senses (frame, joints, audio) │
                    │  2. Build payload (memories, codex hints) │
                    │  3. Stream to LLM → thought + action JSON │
                    └───────────────┬───────────────────────────┘
                                    │ (dispatch)
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │        "Body" (useWorld → binder)         │
                    │  4. Validate/Clamp joint overrides        │
                    │  5. Set motor targets (position servos)   │
                    │  6. Timeline interpolation (smooth pose)  │
                    │  7. Balance controllers (per 500Hz step)  │
                    └───────────────┬───────────────────────────┘
                                    │ (MuJoCo steps)
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │      "World" (PhysicsEngine)              │
                    │  8. Integrate physics at 500 Hz           │
                    │  9. Contact forces → collision events     │
                    └───────────────┬───────────────────────────┘
                                    │ (next cycle reads this)
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │      "Senses again" — loop back to #1     │
                    └───────────────────────────────────────────┘
```

---

## Non-Obvious Behaviors & Design Decisions

- **The "invisible balance robot" is the real star.** The agent is *told* it doesn't need to balance ("Your root balance is artificially maintained by an invisible physics capsule"). This is a deliberate design choice — the creators wanted the AI to focus on *tasking* and *exploring*, not wallowing in a constant fight against gravity. Still, the whole "Road" series (Road-2 capsule balance, Road-3 root drive, Road-4 COM reflex, Road-5 RMBS) shows they kept adding real-physics layers anyway, so the balance isn't cheating — it's just assisted.

- **The system prompt is *huge* and has a "cache boundary."** Static segments (identity, physics rules, motor contract) come first; dynamic context (current identity, environment, memories) comes last. This is a performance optimization for LLM prefix caching — you don't re-send the same 8,000 tokens of static rules every cycle; your provider caches them and only processes the changing tail.

- **Every joint value is in DEGREES in the prompt, but RADIANS in physics.** The prompt carefully instructs the model to output degrees; `AgentLoop` auto-normalizes (if a value looks like radians — `> π` — it converts). This dual convention is a constant source of subtle bugs for anyone touching the code.

- **Fingers have "tendon synergy" enforcement.** You can't curl a finger's second segment unless the base segment is already flexed. This is a biomechanics constraint the model *doesn't know about* — it gets a rejection feedback if it tries, and must learn to respect it.

- **The "environment slots" exist to fight WASM memory fragmentation.** MJCF can't dynamically add bodies at runtime, so 20 dummy bodies are pre-allocation slots that the `ObjectManager` reuses for spawned objects. They sit 10m underground so they don't interfere until claimed.

- **World recompiles are scary and guarded.** Every time an agent spawns, the whole MuJoCo model gets *rebuilt*. The `StateRehydrator` captures the exact state of every body before the swap, then restores it after. This prevents catastrophes like existing agents getting teleported to the floor or snapped to T-pose.

- **The "agent hears you through walls" logic is implemented in `useWorld`.** It does a `THREE.Raycaster` from the speaker's head to the listener's head, ignoring the speaker/self/floor meshes. Any other object in the path means the speech is "occluded" and gets degraded with `[inaudible]` words.

- **The visual debug surface is huge.** Every major piece exposes itself on `window` (`__SYNTHIA_PHYSICS_ENGINE__`, `__SYNTHIA_HUMANOID_BINDERS__`, `__SYNTHIA_RMBS_TELEM__`, etc.) so you can poke at it from the browser console. There's even a built-in **fall diagnostics ring buffer** that records 300 frames of physics state before any event, so you can diagnose a fall after the fact.

---

## The Secret "Reflex" Stack (the "Roads")

The engine has an **additive, layered balance system**, all applied *per 500 Hz physics step* (not per frame) in `WorldEngine.start()`:

1. **Road-2 — Capsule Balance:** A PD torque on the root pelvis that keeps the body upright. Backs off to 50% during gait.
2. **Road-3 — Root Velocity Drive:** A critically-damped servo that moves the root horizontally at ≤0.15 m/s. Suspends when airborne.
3. **Road-4 — COM Reflex:** Reads the mass-weighted center of mass, detects lean, and injects *additive* joint deltas — a lean-back on the spine + a capture-step on the swinging leg. This is "walking as controlled falling."
4. **Road-5 / RMBS — Reaction-Mass Balance:** An actual 18 kg sliding weight inside the pelvis that shifts left/right and forward/back to keep the center of mass over the supporting foot. This is what happens when you attach a "human pendulum" to the robot.

All of these are **gated** (individual enable flags), so researchers can isolate which assist is responsible for a particular behavior. They read directly from `data.ctrl` at 500 Hz on top of the 60 Hz pose flush — the comment "CRITICAL RULE 1" (never let the pose flush zero the RM actuators) is a hard invariant.

---

## Module Reference (the Files That Matter)

| File | Purpose |
|------|---------|
| `src/main.tsx` | React entry point. Mounts App. |
| `src/App.tsx` | Renders all UI shells (viewport, panels, modals). |
| `src/world/hooks/useWorld.ts` | **The conductor.** Boots physics, spawns agents, runs loops, listens for actions. |
| `src/world/engine/PhysicsEngine.ts` | MuJoCo WASM wrapper. Loads models, steps simulation, handles contacts. |
| `src/world/engine/WorldEngine.ts` | Three.js scene + render loop. Renders the 3D world, handles camera. |
| `src/world/engine/HumanoidPhysicsBinder.ts` | **The bridge.** Loads glTF model, builds MJCF, drives motors, reads joint state. |
| `src/world/engine/MotorController.ts` | Joint servo controller. Converts angle targets → MuJoCo ctrl. |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Generates the full MuJoCo XML from the skeleton. |
| `src/world/engine/BodyManager.ts` | Maps bone names → MuJoCo body/geom/actuator IDs. |
| `src/world/engine/StateRehydrator.ts` | Save/restore state across world recompiles. |
| `src/world/engine/CameraManager.ts` | Manages orbit/chase/AI cameras, captures vision frames. |
| `src/world/agent/AgentLoop.ts` | The cognitive heartbeat. Gathers senses, calls LLM, parses actions. |
| `src/world/agent/PayloadBuilder.ts` | Packs world state into the inference payload. |
| `src/world/agent/PromptAssembler.ts` | Builds the modular system prompt with cache boundary. |
| `src/world/agent/InferenceClient.ts` | Streams to any OpenAI-compatible LLM endpoint. |
| `src/world/agent/memoryManager.ts` | Long-term memory (Supabase vector search or mock store). |
| `src/world/agent/identityManager.ts` | The agent's identity/personality record. |
| `src/store/worldStore.ts` | Zustand store for world settings (gravity, camera, objects). |
| `src/store/agentStore.ts` | Zustand store for agent state (thoughts, memories, status). |
| `src/store/agentRuntimeStore.ts` | Per-agent inference overrides (provider, model, API key). |
| `src/store/connectionStore.ts` | Global connection settings (provider, endpoint, Supabase). |
| `src/types/joint.ts` | Joint limit types + clamping helpers. |
| `src/constants/rigConstraints.ts` | Per-bone DOF/limit definitions. |
| `src/constants/anatomicalLimits.ts` | World boundary + anatomical joint ranges. |

---

## Suggested Reading Order (If You're a New Developer)

1. **`src/world/agent/AgentLoop.ts`** — Start at the "heartbeat." This is the core problem the whole app solves: *an AI that runs on a loop, senses the world, thinks, acts, and learns.*
2. **`src/world/hooks/useWorld.ts`** — Then see how the loop gets *wired* into the physics. This file is huge but it's the conductor.
3. **`src/world/engine/PhysicsEngine.ts`** — Understand what "physics" actually means here (MuJoCo WASM, 500 Hz step, contact registry).
4. **`src/world/engine/HumanoidPhysicsBinder.ts`** — The bridge class. This is where the "body" becomes real — motor targets, balance controllers, validation.
5. **`src/world/engine/MJCFHumanoidTemplate.ts`** — See how a skeleton becomes a physically-simulated body.
6. **`src/world/agent/PromptAssembler.ts`** — Finally understand what the AI actually "reads" every cycle. This is the "mind."

---

## The "Gotcha" List (What Will Surprise You)

- **You can break the app by touching the wrong WASM memory.** `PhysicsEngine.isWasmMemoryCritical()` explicitly *never* touches `HEAP8`/`HEAPF64` on the MuJoCo module — doing so is fatal. You must *not* either.
- **The "env slots" are the object spawner's memory pool.** There are only 20. If you spawn 20 objects, the 21st fails with "Pre-allocated slots exhausted."
- **Pre-allocated environment slots are baked into the MJCF.** To prevent runtime memory reallocation in WASM, primitive slots exist directly in the base model at compile-time.
- **"activeGaitPhase" vs "gaitActive" are the same concept in two different naming conventions.** One lives in the action JSON, the other inside the binder/motor controller. Confusing but harmless.
- **The "rootVelocity" in a timeline frame is silently capped at 0.15 m/s.** If you ask it to go faster, you'll get it anyway — the servo clamps.
- **`StateRehydrator` is all-or-nothing.** Every agent's state gets captured and restored together. If you're debugging multi-agent behavior, this is where to look when something teleports incorrectly.
- **Everything is degrees for the model, radians for physics.** The prompt says "degrees." The physics says "radians." The normalization logic lives in `AgentLoop.parseAndValidateAction()`. If you see a joint suddenly flopping 57× too far, this is why.

---

*This report focuses exclusively on `src/` as requested. The broader repo (python scripts for balance, actions/ directory, docs/) is intentionally omitted.*
