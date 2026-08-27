# SYNTHIA: Architecture Guide

This document explains the architecture of SYNTHIA at a level that should be useful to developers and researchers. It describes the major subsystems, the data flow between them, and the key source files that implement each part.

---

## System Overview

SYNTHIA is a browser-based embodied AI platform. It runs a cognitive loop entirely client-side and drives an ~80-joint humanoid body in a MuJoCo physics simulation compiled to WebAssembly.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                            Browser Tab                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    React UI (src/components)                   │ │
│  │    AppShell, GodModePanel, AgentStatus, ExportModal, ...       │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                              │ Zustand stores                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │                      State (src/store)                          │  │
│  │   uiStore, agentStore, worldStore, memoryStore, ...            │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │                 World Orchestration (src/world)                │  │
│  │                                                               │  │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │  │
│  │  │  AgentLoop   │──▶│InferenceClient│──▶│  AI Provider     │  │  │
│  │  │ (cognitive)  │   │  (HTTP/SSE)  │   │ (Gemini/Kaggle)  │  │  │
│  │  └──────────────┘   └──────────────┘   └──────────────────┘  │  │
│  │           │                                                    │  │
│  │           ▼                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │               Physics Engine (src/world/engine)           │  │  │
│  │  │                                                          │  │  │
│  │  │  ├── WorldEngine (500Hz fixed-step MuJoCo loop)           │  │  │
│  │  │  ├── HumanoidPhysicsBinder (per-agent body)               │  │  │
│  │  │  ├── MotorController (joint PD control)                   │  │  │
│  │  │  ├── Balance Controllers (capsule/COM/RMBS)               │  │  │
│  │  │  └── CameraManager (perception + display)                 │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Supabase (optional)  │  Serverless Proxy (optional)           │  │
│  │  memories, skills,    │  api/infer/* (Vercel Edge)             │  │
│  │  motor programs       │  keeps provider keys server-side       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem 1: The Agent Cognitive Loop

**Location:** `src/world/agent/`

Each agent runs an independent cognitive loop driven by a `setInterval`. The loop is:

1. **Capture world state** — via a callback to `useWorld.ts`.
2. **Build payload** — `PayloadBuilder.ts` assembles perception summary, tactile context, memories, identity, and directives.
3. **Infer** — `InferenceClient.ts` streams tokens from the AI provider.
4. **Parse and validate** — `AgentLoop.ts` parses the returned JSON, clamps joint angles to +/- pi, and normalizes values.
5. **Dispatch action** — fires a `synthia:action` custom event.
6. **Write memory** — `MemoryManager.ts` persists the outcome to Supabase or local fallback.

### Key Files

| File | Responsibility |
|---|---|
| `AgentLoop.ts` | The per-agent loop. Schedules cycles, parses actions, writes memories. |
| `InferenceClient.ts` | Client-side HTTP client. Builds OpenAI-compatible requests, parses SSE streams, handles backoff. |
| `PayloadBuilder.ts` | Builds the inference payload: perception summary, tactile context, memory queries. |
| `MemoryManager.ts` | Reads/writes memories to Supabase with pgvector embeddings (or local fallback). |
| `PromptAssembler.ts` | Assembles the system prompt with body type, axis map, directives, output contract. |
| `IdentityManager.ts` | Manages agent identity (name, beliefs, traits) in Supabase. |

---

## Subsystem 2: The Physics Engine

**Location:** `src/world/engine/`

The physics layer runs MuJoCo compiled to WASM. It steps the simulation at 500Hz (fixed timestep 0.002s) and renders to Three.js at 60Hz.

### WorldEngine

`WorldEngine.ts` is the core simulation loop. It:

- Builds the MuJoCo model from MJCF templates.
- Steps the simulation at a fixed rate (implicitfast integrator, 200 solver iterations).
- Provides `onStep` and `onFrame` callbacks for the world hook.
- Handles world recompilation when agents are spawned or removed.

### HumanoidPhysicsBinder

`HumanoidPhysicsBinder.ts` represents one agent's physical body. Each binder:

- Owns a `MotorController` instance.
- Maps joint targets to MuJoCo actuators via an `actuatorMap`.
- Applies balance controllers each physics step.
- Syncs the Three.js skeleton to MuJoCo joint positions.
- Runs the action timeline (sequences of joint commands).

### MotorController

`MotorController.ts` handles joint-level PD control:

- Maps joint names to MuJoCo actuator IDs.
- Zeroes actuators by default, then applies pose targets.
- Applies a `simulationStepCount` ramp to ease the agent into full actuation on spawn.
- Applies capsule balance torque via `applyCapsuleBalance()`.

### Balance Controllers

SYNTHIA has several balance systems, each taking a different approach:

| Controller | File | Approach |
|---|---|---|
| Capsule Balance | `MotorController.ts` | Torque on the root capsule proportional to tilt angle (PD). |
| COM Reflex | `ComReflexController.ts` | Lean and step logic based on center of mass error. |
| Reaction Mass | `ReactionMassController.ts` | Moves a reaction mass (18kg sphere) to counter COM destabilization. |

### CameraManager

`CameraManager.ts` handles:

- Three camera modes: third person, first person, model input.
- The offscreen perception render (448x448) that captures what the agent sees.

---

## Subsystem 3: World Orchestration

**Location:** `src/world/hooks/useWorld.ts`

`useWorld.ts` is the root orchestrator hook. It:

- Instantiates all engine classes.
- Wires the render loop to `WorldEngine`.
- Maintains `humanoidPhysicsBindersRef: Map<string, HumanoidPhysicsBinder>` keyed by agent ID.
- Listens for custom events: `synthia:spawn`, `synthia:action`, `synthia:resetPose`, `synthia:agent_spoke`.
- Handles `spawnAgent()` which rebuilds the combined MJCF and rehydrates existing agents.
- Installs a 300-frame diagnostic ring buffer for fall analysis.

### Custom Events

| Event | Purpose |
|---|---|
| `synthia:action` | Dispatched by the AgentLoop with the parsed action JSON. `useWorld` applies it to the correct binder. |
| `synthia:spawn` | Spawns a new agent. |
| `synthia:resetPose` | Resets an agent to its bind pose. |
| `synthia:agent_spoke` | Emitted when an agent verbally speaks (for spatial audio). |

---

## Subsystem 4: State Management

**Location:** `src/store/`

SYNTHIA uses Zustand for all state. The stores are:

| Store | Responsibility |
|---|---|
| `uiStore` | Right panel, theme, modal toggles, camera mode. |
| `agentStore` | Per-agent state: thoughts, status, directive, current goal, pending injection. |
| `worldStore` | World state: physics config, camera mode, spawn settings. |
| `memoryStore` | Local memory cache. |
| `connectionStore` | WebSocket / provider connection state. |
| `identityStore` | Agent identity definitions. |
| `logStore` | Log viewer state. |
| `speechStore` | TTS state. |
| `trainingStore` | Training/directive session state. |
| `onboardingStore` | Onboarding flow state. |
| `agentRuntimeStore` | Per-agent runtime state (loop running, paused, not started). |

---

## Subsystem 5: Inference Proxies

**Location:** `api/infer/`

Optional Vercel Edge functions that keep provider API keys server-side.

| File | Route | Responsibility |
|---|---|---|
| `gemini.ts` | `/api/infer/gemini` | Proxies to Google Gemini's streaming endpoint. |
| `openai-compat.ts` | `/api/infer/openai-compat` | Proxies to any OpenAI-compatible provider (Groq, OpenRouter, NVIDIA NIM, etc.). |

Both functions:

- Validate an optional `x-synthia-secret` header.
- Read provider keys from server-side environment variables.
- Stream the response back to the client.

---

## Subsystem 6: Dataset Export

**Location:** `src/utils/`

| File | Responsibility |
|---|---|
| `clientDatasetExporter.ts` | Exports session data as JSONL, CSV, Parquet, LeRobot, or ZIP. |
| `parquetWriter.ts` | Pure-browser Apache Parquet v1 writer (hand-rolled Thrift footer). |

---

## The Complete Data Flow

Here is how a complete cycle flows through the system:

```text
1. WorldEngine renders a frame (60Hz).
   └─ useWorld.ts steps physics (500Hz) and syncs visuals.

2. AgentLoop fires on its cycle interval.
   └─ Calls captureWorldState() → gets vision frame, audio, joints.

3. PayloadBuilder builds the inference payload.
   └─ Queries memoryManager for relevant memories.
   └─ Builds perception summary, tactile context, identity.

4. InferenceClient sends payload to the AI provider.
   └─ Streams thought tokens + action JSON.

5. AgentLoop parses and validates the action.
   └─ Clamps joint angles, normalizes deg→rad.
   └─ Dispatches `synthia:action` event.

6. useWorld.handleAction receives the event.
   └─ Routes to the correct HumanoidPhysicsBinder.
   └─ Applies joint targets to MotorController.

7. MotorController writes to MuJoCo actuators.
   └─ WorldEngine steps the simulation.
   └─ Three.js skeleton syncs to joint positions.

8. MemoryManager writes the outcome.
   └─ Persists to Supabase (or local fallback).
   └─ Updates agentStore with the new memory.
```

---

## Multi-Agent Architecture

Multiple agents share a single MuJoCo world. Each agent is a prefixed MJCF subtree:

- Agent 0: joints named `agent_0_mixamorigspine`, actuators named `act_agent_0_mixamorigspine`, etc.
- Agent 1: joints named `agent_1_...`

This avoids name collisions in the combined model. At spawn, agents are placed 1.75 meters apart.

When an agent is spawned:

1. `useWorld.spawnAgent()` calls the MJCF generator to rebuild the combined model.
2. Existing agents are rehydrated from their saved state via `StateRehydrator.ts`.
3. The new agent gets its own `HumanoidPhysicsBinder` and `AgentLoop`.

---

## Performance Considerations

- **Physics at 500Hz** with 200 solver iterations is CPU-heavy. On mid-tier hardware, expect 30-60 FPS render with 1-2 agents.
- **Perception render** captures a 448x448 frame each cycle, which adds GPU load.
- **The inference loop** is the bottleneck. Cycle duration depends on provider latency.
- **Balance controllers** run per physics step, which adds computation but is necessary for stable standing.

---

## Further Reading

- [setup.md](setup.md): Full configuration walkthrough.
- [debugging.md](debugging.md): Console diagnostics and troubleshooting.
- [README.md](../README.md): Project overview and quick start.
