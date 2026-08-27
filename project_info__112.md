<div align="center">

<img src="public/logo_bg_removed.png" alt="SYNTHIA" width="180" height="180" />

# SYNTHIA

**A browser-based embodied AI platform.**

Give an AI a body, a world, a memory, and a voice, and watch it learn to live.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-browser-brightgreen.svg)](https://github.com/Greatness0123/synthia)
[![Status](https://img.shields.io/badge/status-active-brightgreen.svg)](https://github.com/Greatness0123/synthia)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://react.dev/)

</div>

---

## Table of Contents

1. [What is SYNTHIA?](#what-is-synthia)
2. [Why SYNTHIA?](#why-synthia)
3. [Core Capabilities](#core-capabilities)
4. [How It Works](#how-it-works)
5. [Architecture](#architecture)
6. [Getting Started](#getting-started)
7. [Configuration](#configuration)
8. [Development](#development)
9. [Project Structure](#project-structure)
10. [Dataset Export](#dataset-export)
11. [Inference Providers](#inference-providers)
12. [Security and Privacy](#security-and-privacy)
13. [Contributing](#contributing)
14. [Roadmap](#roadmap)
15. [License](#license)
16. [Acknowledgments](#acknowledgments)

---

## What is SYNTHIA?

SYNTHIA is a browser-based **embodied AI** platform. It runs a continuous cognitive loop (perceive, think, act, remember) entirely client-side, driving an ~80-joint humanoid body inside a real physics simulation using MuJoCo compiled to WebAssembly.

Unlike a chatbot that only produces text, SYNTHIA gives an AI model a physical body, a 3D world to live in, and a persistent memory that spans sessions. The agent can:

- **See**: captures frames from the same 3D render the user sees
- **Hear**: classifies audio in its environment
- **Move**: controls an ~80-joint humanoid in real physics
- **Think**: runs a `setInterval`-driven cognitive loop
- **Remember**: persists memories, skills, and identity across sessions
- **Speak**: uses browser-native TTS with per-agent voices
- **Interact**: with other agents, objects, and terrain

Everything runs in the browser. There is no separate coordinator server. The only server-side pieces are an optional inference proxy and a user-hosted GPU endpoint.

---

## Why SYNTHIA?

Most AI systems exist only as text. SYNTHIA closes the gap between **thinking** and **doing**, providing a real-time, physical environment for embodied intelligence. Here is what makes it distinct:

| Aspect | SYNTHIA | Typical alternatives |
|---|---|---|
| **Body** | ~80-joint humanoid with real physics (MuJoCo WASM) | Text box, or requires a GPU farm |
| **Thought stream** | Live, inspectable inner monologue | Hidden black box |
| **Thought steering** | Inject thoughts mid-action | Static system prompts |
| **World** | Interactive 3D scene in browser | Desktop plus local GPU build |
| **Memory** | 3-tier persistent memory (working, episodic, long-term) | Chat history buffer |
| **Skill growth** | Progressive physical milestones, persisted | Custom RL setup |
| **Voice and speech** | Per-agent TTS + STT with spatial acoustics | TTS only |
| **Data export** | One-click JSONL, CSV, Parquet, LeRobot | Text transcript, or custom exporter |
| **Setup** | Free in browser, zero GPU required | Requires GPU, CUDA, or weeks of learning |

---

## Core Capabilities

### Client-Side Cognitive Loop

Each agent runs an independent cognitive loop entirely in the browser (`src/world/agent/AgentLoop.ts`):

1. **Capture**: world state (vision frame, audio, proprioception)
2. **Build payload**: perception summary, tactile context, memories, identity
3. **Infer**: stream tokens from an AI provider
4. **Parse action**: validate joint commands, clamp to +/- pi
5. **Execute**: dispatch the action to the physics body
6. **Remember**: write the outcome to memory

### Real Physics Body

The humanoid is an ~80-joint model in a MuJoCo WASM simulation:

- **Actuator mapping**: `MotorController.ts` maps joint commands to MuJoCo actuators
- **PD control**: base gains (kp/kv) with a `globalStiffnessScale` multiplier
- **Spawn ramp**: `simulationStepCount` eases the agent into full actuation
- **Balance controllers**: separate systems for capsule torque, COM reflex, and reaction mass

### Persistent Memory

Memories persist in Supabase (or local fallback) with pgvector embeddings, organized in three tiers:

| Tier | Scope | Behavior |
|---|---|---|
| **Tier 1: Working** | Present moment | Cleared and refreshed each loop |
| **Tier 2: Episodic** | Recent sessions | Pruned after 20 most recent sessions |
| **Tier 3: Long-term** | Big things learned | Persists across sessions, pruned first |

> **Note:** The storage and pruning machinery is real and working. The embeddings that rank memory relevance currently use a deterministic hash placeholder (`embeddingEngine.ts`). The architecture is built to accept a real client-side embedding model (`@xenova/transformers` is already a dependency).

### Multi-Agent World

Multiple agents share a single MuJoCo world, each as a prefixed MJCF subtree (for example `agent_0_`, `agent_1_`) so bodies, joints, and actuators coexist without name collisions. Agents can:

- See and hear each other
- Talk to each other with real acoustic physics (15m range, occlusion degradation)
- Interact with shared objects and terrain

---

## How It Works

SYNTHIA runs a simple loop on each agent:

```text
PERCEIVE -> THINK -> ACT -> REMEMBER -> repeat
```

1. **Perceive.** The agent captures a snapshot of its world: a camera frame, audio, and its own joint positions. It receives a plain-language perception summary (which way it is facing, whether it is standing, what is nearby, what it is touching).

2. **Think.** That snapshot is sent to an AI model, which returns a thought stream plus a structured action plan (joint overrides, motor programs, memory writes, gaze targets).

3. **Act.** The action plan is translated into joint movements in the physics body. The agent physically moves, and can fall, recover, and try again.

4. **Remember.** The outcome is written to memory (working, episodic, or long-term) with semantic embeddings. Memories influence future decisions.

The AI mind runs on the user's machine. The server only holds provider API keys (via the optional edge proxy), or nothing at all if a user brings their own key.

---

## Architecture

The codebase is organized into several core layers:

| Layer | Location | Responsibility |
|---|---|---|
| **React UI** | `src/components/` | Dashboard, panels, modals, controls |
| **State** | `src/store/` | Zustand stores for UI, agents, world, memory |
| **Agent Loop** | `src/world/agent/` | The cognitive cycle: payload build, infer, action parse, memory |
| **Physics Engine** | `src/world/engine/` | MuJoCo WASM + Three.js: humanoid, balance, cameras, objects |
| **World Orchestration** | `src/world/hooks/` | `useWorld`: the main loop wiring, spawn logic, diagnostics |
| **Inference Proxies** | `api/infer/` | Serverless Vercel Edge functions (secure provider keys) |
| **Inference Server** | `server/kaggle_server.py` | Optional high-performance GPU endpoint for VLMs |
| **Schema** | `supabase/` | Database schema and migrations with RLS policies |

### High-Level Data Flow

```text
[WorldEngine RAF Loop]
    |
    v (60Hz render frame)
[useWorld.ts]: steps physics, syncs visuals
    |
    v (capture world state)
[AgentLoop.ts]: builds payload, queries memory, calls provider
    |
    v (inference stream)
[InferenceClient.ts]: parses thought and action JSON
    |
    v (dispatch action)
[synthia:action] custom event -> [useWorld.handleAction]
    |
    v (execute)
[HumanoidPhysicsBinder]: applies joint commands, writes memory
```

### Key Modules

| File | Purpose |
|---|---|
| `src/world/agent/AgentLoop.ts` | Per-agent cognitive loop, cycle scheduling, action parsing |
| `src/world/agent/InferenceClient.ts` | Client-side HTTP client for AI providers, streaming parser |
| `src/world/agent/PayloadBuilder.ts` | Builds perception summary, tactile context, memory queries |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Physical humanoid: actuator mapping, balance, gait, visuals |
| `src/world/engine/MotorController.ts` | PD control, joint clamping, capsule balance torque |
| `src/world/engine/ReactionMassController.ts` | Reaction-mass balance system |
| `src/world/engine/ComReflexController.ts` | COM lean reflex plus capture step logic |
| `src/world/engine/WorldEngine.ts` | Full MuJoCo simulation loop (500Hz fixed-step) |
| `src/world/hooks/useWorld.ts` | Root orchestration: loop wiring, spawn, diagnostics |
| `src/utils/clientDatasetExporter.ts` | JSONL / CSV / Parquet / LeRobot export |
| `api/infer/gemini.ts` | Vercel Edge proxy for Gemini |
| `api/infer/openai-compat.ts` | Vercel Edge proxy for OpenAI-compatible providers |

---

## Getting Started

### System Requirements

- **Node.js** 20 or newer
- A modern browser with **WebGL 2.0** support (Chrome, Edge, Firefox, Safari)
- **4GB+ RAM** recommended
- An AI provider (API key or endpoint): see [Inference Providers](#inference-providers)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Greatness0123/synthia.git
cd synthia

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### First Run

1. Click the **gear icon** in the top-center pill.
2. Choose your AI provider (Gemini, Groq, OpenRouter, or a custom endpoint).
3. Enter your API key and/or endpoint URL.
4. **Optional:** Enter your Supabase URL + anon key to enable persistent memory.
5. Click **Deploy Cognition Config**.
6. The agent will wake up, look around, and start acting.

### Full Setup Guide

For the complete walkthrough, including Supabase database initialization, Kaggle GPU server setup, and troubleshooting, see the setup guide.

---

## Configuration

The application is fully client-side and configurable at runtime. There are no required environment variables to run locally. For the optional serverless proxies (`api/infer/`), you will need:

| Variable | Description |
|---|---|
| `SYNTHIA_SHARED_SECRET` | Shared secret checked on incoming proxy requests |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key |

See [`.env.example`](.env.example) for a template.

---

## Development

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |
| `npm test` | Run Jest unit tests |
| `npm run verify-proxy` | Run integration tests against deployed edge proxies |

### Testing

Unit tests live alongside the source in `__tests__/` directories and cover the physics controllers, balance systems, and action parsing. To run:

```bash
npm test
```

### Type System

The project is written in modern TypeScript 6.0 with strict mode enabled. Core types live in:

- `src/types/agent.ts`: Agent state, directive modes, identity
- `src/types/world.ts`: World state, camera modes, physics config
- `src/types/payload.ts`: Inference payloads and perception summaries
- `src/types/export.ts`: Dataset export configuration

---

## Project Structure

```text
.
├── src/                        # Application source
│   ├── components/             # React UI components
│   │   ├── agent/              # Agent inspector, settings, thought bank
│   │   ├── godmode/            # God Mode panel, physics controls
│   │   ├── export/             # Dataset export modal
│   │   ├── layout/             # App shell, status bar, task input
│   │   └── ui/                 # Reusable UI primitives
│   ├── constants/              # Body types, object presets, physics constants
│   ├── store/                  # Zustand state stores (11 stores)
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Dataset export, speech, Parquet writer, helpers
│   ├── workers/                # Web Workers (if any)
│   └── world/
│       ├── agent/              # Agent cognitive loop, inference, memory
│       ├── engine/             # Physics, humanoid binder, balance controllers
│       ├── hooks/              # useWorld, useCoordinator orchestration
│       └── programs/           # Core motor programs
├── api/
│   └── infer/                  # Serverless Vercel Edge inference proxies
├── server/                     # Optional Kaggle GPU inference server (Python)
├── supabase/                   # Database schema and migrations
├── scripts/                    # Build/sync tooling
├── actions/                    # Browser console motion presets
├── public/                     # Static assets, logos, animations, WASM
└── tests/                      # Integration tests (verify-proxy)
```

---

## Dataset Export

Every agent session generates clean, structured records. One click exports them in multiple formats:

| Format | Use case |
|---|---|
| **JSONL** | Line-delimited JSON, easy to parse and stream |
| **CSV** | Spreadsheet / pandas compatible |
| **Parquet** | Columnar, compressed, research-grade |
| **LeRobot** | Hugging Face dataset format for robotics |
| **ZIP (multi-agent)** | Per-agent folder isolation for multi-agent sessions |

Built entirely client-side. See `src/utils/clientDatasetExporter.ts` and `src/utils/parquetWriter.ts` (a hand-rolled pure-browser Apache Parquet v1 writer).

---

## Inference Providers

SYNTHIA supports any OpenAI-compatible endpoint, plus provider-specific proxies:

- **Direct (client-side):** the user's API key is stored in the browser and sent directly to the provider.
- **Vercel Edge Proxy:** `api/infer/openai-compat.ts` routes to Groq, OpenRouter, NVIDIA NIM, Cerebras, Mistral, and more, with the key kept server-side.
- **Gemini Proxy:** `api/infer/gemini.ts` routes to Google Gemini.
- **Custom GPU Server:** `server/kaggle_server.py` runs Qwen2.5-VL in 4-bit quantization on a Kaggle T4x2, with LAION-CLAP for audio classification.

The proxy maps provider identifiers to canonical endpoints, so the server can never be used as an open relay.

---

## Security and Privacy

SYNTHIA follows a **Bring Your Own Credentials** model:

- **API keys** are stored in the user's browser (localStorage) and sent only to the configured provider. The optional edge proxy keeps them server-side.
- **Supabase credentials** are the user's own. Anyone with the URL + anon key can read/write the agent's memories. Treat them like passwords. The schema uses permissive RLS policies by design for the BYO-DB model.
- **The Kaggle GPU server** should be protected with a shared token, mirroring the `x-synthia-secret` pattern from the edge proxies (see the setup guide).

See [SECURITY.md](SECURITY.md) for the full policy.

---

## Contributing

We welcome contributions. Whether it is fixing a bug, adding a new balance controller, improving the dataset exporter, or writing docs, every bit helps.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines.
- Read the [Architecture Guide](docs/architecture.md) before diving in.
- Check open issues for good first tasks.

---

## Roadmap

**V1 (current):** Client-side, personal, open source. The agent lives in the user's browser, sleeps when they leave, and resumes with everything saved. Full embodied-agent engine: physics, vision, memory, speech, multi-agent, dataset export.

**V2 (planned, not built):** A persistent, hosted, server-side world where agents keep living when the user is away, meet other people's agents, and form emergent societies. User accounts, shared worlds, spectator mode, sleep systems, recording. This is the destination; V1 is the proof it is buildable.

---

## License

This project is released under the **MIT License**. See [LICENSE](LICENSE) for details.

> **Note on assets:** Some 3D models and motion-capture animations (for example Mixamo-authored humanoid rigs and gait data) are provided by third parties and may carry their own license terms. See the source files and docs for per-asset notes.

---

## Acknowledgments

Built with:

- [MuJoCo](https://mujoco.org/) for physics simulation (WebAssembly)
- [Three.js](https://threejs.org/) for 3D rendering
- [React](https://react.dev/) for the UI framework
- [Vite](https://vite.dev/) for build tooling
- [Supabase](https://supabase.com/) for persistent memory and data
- [Zustand](https://zustand.docs.pmnd.rs/) for state management
- [Tailwind CSS](https://tailwindcss.com/) for styling

---

<div align="center">

**Built by [Greatness Okorie](https://greatnessokorie.vercel.app).**

<!-- TODO: Demo videos will be added here when available. -->

</div>
