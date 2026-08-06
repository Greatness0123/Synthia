# SYNTHIA V2 — Refined Architecture & Phase Implementation Plan

**Status**: Pre-development architecture refinement  
**Document Scope**: Consolidates all 7 V2 phase prompts into a single, detailed architecture plan — refined for production deployment on Google Cloud Platform (GCP) + Vercel.  
**Reads the V1 codebase at**: `coordinator/src/`, `src/`, `supabase_schema.sql`  
**Last updated**: 30 July 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [V1 Codebase: What Exists Today](#v1-codebase-what-exists-today)
3. [V2 Architecture: The Target System](#v2-architecture-the-target-system)
4. [Phase-by-Phase Refinement](#phase-by-phase-refinement)
   - [Phase 7: Headless Multi-Agent Core](#phase-7-headless-multi-agent-core)
   - [Phase 8: Auth & Agent Registry](#phase-8-auth--agent-registry)
   - [Phase 9: Camera & Personal Viewing](#phase-9-camera--personal-viewing)
   - [Phase 10: Visibility Tiers & Spectator Mode](#phase-10-visibility-tiers--spectator-mode)
   - [Phase 11: Audio — TTS / STT / Discussions](#phase-11-audio--tts--stt--discussions)
   - [Phase 12: Sleep System](#phase-12-sleep-system)
   - [Phase 13: Recording & BYO Supabase](#phase-13-recording--byo-supabase)
5. [Vercel + GCP Deployment Architecture](#vercel--gcp-deployment-architecture)
6. [Infrastructure & Data Flow Diagrams](#infrastructure--data-flow-diagrams)
7. [Critical Design Decisions & Non-Obvious Invariants](#critical-design-decisions--non-obvious-invariants)
8. [Development Order & Risk Mitigation](#development-order--risk-mitigation)

---

## Executive Summary

**What is SYNTHIA V2?**  
A hosted, multi-agent, browser-accessible platform where users create AI agents (humanoid bodies powered by VLM inference) that coexist in a shared MuJoCo physics world. Users view their agents through a Vercel-hosted React frontend. The physics simulation and inference coordination run on Google Cloud Platform. Each agent has its own independent VLM inference loop, memory namespace, and thought stream. Other users can spectate agents (with visibility-tier filtering), agents can speak (TTS), users can talk to agents (STT), and the platform manages capacity via a sleep system.

**Why V2 now?**  
V1 is a single-agent, single-user developer prototype — one coordinator server, one frontend, one physics world in-browser. V2 must serve multiple users, multiple agents, with server-authoritative physics, auth, and a broadcast pipeline. Every structural assumption from V1 changes.

**Deployment split:**
- **Vercel** (frontend): React app (Vite build), serves the viewport where users watch/interact with their agents. Handles camera/microphone access via browser APIs. Acts as the "exposing viewport."
- **GCP** (backend): The entire server stack — MuJoCo physics simulation, multi-agent coordinator, inference routing, TTS/STT services, broadcast pipeline, auth, database, and sleep management.

---

## V1 Codebase: What Exists Today

### Architecture Overview (V1)

```
┌─ Browser ─────────────────────────────────────────────────────────────┐
│  Three.js Scene (WorldEngine)                                         │
│  MuJoCo WASM Physics (PhysicsEngine) — physics runs IN BROWSER        │
│  Zustand stores (worldStore, agentStore, connectionStore, etc.)       │
│  React components (GodMode, BodyControls, Camera, etc.)               │
│  WebSocket client → coordinator                                        │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ WebSocket (port 3001)
┌─ Coordinator (Fastify) ───────────────────────────────────────────────┐
│  Single AgentLoop per connection                                       │
│  PayloadBuilder: assembles InferPayload from world state + memories    │
│  InferenceClient: delegates to provider (Kaggle/Gemini/OpenRouter)     │
│  MemoryManager: Supabase read/write with pgvector similarity search    │
│  InjectionQueue: user text injection FIFO                              │
│  MotorProgramStore: named motor program persistence                    │
│  DatasetExporter: session export to various formats                    │
│  EmbeddingEngine: Xenova all-MiniLM-L6-v2 for semantic search          │
└───────────────────────────┬───────────────────────────────────────────┘
                            │ HTTP
┌─ Supabase ────────────────────────────────────────────────────────────┐
│  Tables: sessions, memories (with pgvector), skills, motor_programs    │
│  Storage: frame WebP uploads (Synthia-frames bucket)                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Key V1 Files (What V2 Reuses or Refactors)

| File | Purpose | V2 Impact |
|------|---------|-----------|
| `coordinator/src/agentLoop.ts` | Single-agent inference loop — sense→think→act cycle | **Refactored**: becomes per-agent loop in shared server process |
| `coordinator/src/payloadBuilder.ts` | Assembles `InferPayload` from world state, memories, feedback | **Extended**: adds cross-agent visibility, per-viewer filtering fields |
| `coordinator/src/inferenceClient.ts` | Provider abstraction (Kaggle, Gemini, OpenRouter, NIM, Groq) | **Reused largely as-is** — same interface, same providers |
| `coordinator/src/memoryManager.ts` | Supabase memory read/write with pgvector | **Major refactor**: sharded storage routing, per-agent schemas |
| `coordinator/src/server.ts` | Fastify + WebSocket, single-connection-per-session | **Rewritten**: multi-agent world server, per-viewer broadcast |
| `coordinator/src/providers/geminiProvider.ts` | Gemini streaming adapter | **Reused** |
| `src/world/engine/MJCFHumanoidTemplate.ts` | MJCF XML template for humanoid body | **Reused** on server side, loaded once per world |
| `src/world/engine/PhysicsEngine.ts` | MuJoCo WASM physics (browser-side) | **Replaced**: physics moves server-side — same MuJoCo, different runtime |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Bridges Three.js meshes ↔ MuJoCo physics | **Replaced**: server-side has no Three.js — binds simulation body to output state |
| `src/world/engine/AudioEngine.ts` | Tone.js audio synthesis (V1 Phase 4) | **Foundation for Phase 11 TTS** on client side |
| `src/store/worldStore.ts` | Zustand world state (objects, gravity, camera) | **Massively refactored**: now per-user view into shared world |
| `src/components/godmode/GodModePanel.tsx` | Floating God Mode controls | **Refactored**: owner-only controls per agent |
| `supabase_schema.sql` | Single-project schema | **Extended**: sharding keys, user tables, visibility columns |

### What V1 Does NOT Have (V2 Must Add)

- **No user accounts or auth** — coordinator broadcasts to any WebSocket connection
- **No multi-agent physics** — one body per MuJoCo world, in-browser
- **No server-side physics authority** — physics runs in WASM in the browser
- **No per-viewer broadcast filtering** — single stream to single frontend
- **No visibility/permissions system** — no concept of agent ownership
- **No TTS/STT** — `AudioEngine.ts` is ambient sound only
- **No sleep/capacity management** — agent runs until disconnected
- **No session recording/playback** — export only
- **No sharded storage** — single Supabase project, single `agent_id` column

---

## V2 Architecture: The Target System

### High-Level System Diagram (Post-Phase 13)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          VERCEL (Frontend)                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │  React SPA (Vite)                                            │     │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐   │     │
│  │  │Camera    │  │Agent     │  │Spectator  │  │Admin     │   │     │
│  │  │Dropdown  │  │Panels    │  │Mode/List  │  │Panel     │   │     │
│  │  │(POV,etc) │  │(Thought, │  │(Browse,   │  │(Sleep    │   │     │
│  │  │          │  │ Memory,  │  │ Watch,    │  │ Controls)│   │     │
│  │  │          │  │ Status)  │  │ Filtered) │  │          │   │     │
│  │  └──────────┘  └──────────┘  └───────────┘  └──────────┘   │     │
│  │                                                              │     │
│  │  Browser APIs: getUserMedia (cam/mic), AudioContext, WebGL   │     │
│  └──────────────────────────┬───────────────────────────────────┘     │
│                             │ WebSocket + HTTP/2 (maybe SSE)          │
└─────────────────────────────┼─────────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────────┐
│  GCP (Backend)              │                                         │
│                             │                                         │
│  ┌──────────────────────────┴─────────────────────────────────────┐  │
│  │  Load Balancer / API Gateway (Cloud Run / GKE Ingress)          │  │
│  │  - Auth middleware (Supabase Auth / Firebase Auth)              │  │
│  │  - Route: /ws → World Server, /api → REST, /broadcast → SSE   │  │
│  └─┬──────────────────────┬──────────────────────┬────────────────┘  │
│    │                      │                      │                    │
│  ┌─┴─────────────┐  ┌─────┴──────────┐  ┌───────┴──────────────┐    │
│  │ World Server  │  │ Auth Service    │  │  TTS/STT Service    │    │
│  │ (Node.js)     │  │ (Supabase Auth  │  │  (Cloud Text-to-    │    │
│  │               │  │  or Firebase)   │  │   Speech / Speech-   │    │
│  │ MuJoCo WASM   │  │                 │  │   to-Text)           │    │
│  │ N AgentLoops  │  │ JWT validation  │  │                      │    │
│  │ Broadcast     │  │ User ↔ Agent    │  │ Audio encode/decode │    │
│  │ Pipeline      │  │ registry        │  │                      │    │
│  │ Sleep Manager │  │                 │  │                      │    │
│  └─┬─────────────┘  └──────┬─────────┘  └──────────────────────┘    │
│    │                        │                                         │
│  ┌─┴────────────────────────┴─────────────────────────────────────┐  │
│  │  Storage Layer                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │ Supabase #1  │  │ Supabase #2  │  │ Cloud Storage        │  │  │
│  │  │ (Shard A)    │  │ (Shard B)    │  │ (Recordings, Frames) │  │  │
│  │  │ agents 1-500 │  │ agents 501.. │  │                      │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │  │
│  │  Sharding Router (App-Layer)                                    │  │
│  │  BYO Supabase Support (Opt-Out)                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase-by-Phase Refinement

### Phase 7: Headless Multi-Agent Core

**This is the riskiest phase. If this doesn't work, nothing else matters.**

#### Refined Objective

Prove that N humanoid bodies can exist in one shared MuJoCo world on a server, each with an independent VLM inference loop producing actions that are applied correctly to that body — without interference, without blocking each other, and while maintaining the balance/stability guarantees from V1 Phase 3.

#### What the Phase Prompt Already Establishes (Good)

- Server-side physics: move MuJoCo from browser WASM to server-side WASM
- N-agent instantiation: each is a copy of the MJCF humanoid template at distinct positions
- Independent inference loops: each agent has its own `AgentLoop`, own memory, own prompt
- Cross-agent visibility: other agents appear as generic objects `{id, type: "humanoid_figure", position, moving, note}` — NOT as "another AI"
- Coordinator loop isolation: killing one agent's loop must not affect others

#### Refined Architecture Decisions

**1. Server-Side MuJoCo Runtime**

The V1 browser uses `@mujoco/mujoco` WASM loaded via Emscripten. For server-side, you have two options:

- **Option A (Recommended): Keep WASM on Node.js.** The same `@mujoco/mujoco` npm package works in Node.js via the Emscripten WASM runtime. Use `mj_simPool` or create the shared `MjModel` once and clone `MjData` per agent for stepping. This is the fastest path — reuse the existing MJCF template unchanged, same collision code, same `MotorController`. The `PhysicsEngine.ts` code is already written against the MuJoCo C API through Emscripten bindings — it ports to Node with minimal changes (remove Three.js dependencies, keep the WASM module loading).

- **Option B: Native MuJoCo C library via FFI.** Compile MuJoCo as a shared library, call via Node FFI (`ffi-napi`). More performant for many agents but adds build complexity. Not recommended for initial V2.

**Decision: Option A (WASM on Node.js).** The V1 already does this. The main difference is that `PhysicsEngine.ts` currently ties physics to Three.js rendering (it computes Three.js transforms). On the server, you strip out all Three.js rendering code and keep only the MuJoCo mj_step() loop, joint position queries, and contact force computation.

**2. Server Architecture for N Agents**

Do NOT use one MuJoCo world per agent. Use ONE shared `MjModel` + `MjData` where all agent bodies exist as separate body subtrees in the MJCF XML. This ensures genuine collisions. The MJCF template must be expanded at load time:

```xml
<mujoco model="synthia_v2_shared">
  <compiler angle="radian"/>
  <option timestep="0.002" gravity="0 0 -9.81"/>
  <worldbody>
    <geom name="floor" type="plane" size="100 100 0.1"/>

    <!-- Agent 1 -->
    <body name="agent_1_root" pos="0 0 0.85">
      <!-- Full humanoid body template, prefixed with agent_1_ -->
      <body name="agent_1_hips">...</body>
    </body>

    <!-- Agent 2 -->
    <body name="agent_2_root" pos="2 0 0.85">
      <body name="agent_2_hips">...</body>
    </body>

    <!-- Agent N... -->
  </worldbody>
</mujoco>
```

Joint names, geom names, body names are all prefixed with `agent_{N}_` to avoid ID collisions. The V1 `MJCFHumanoidTemplate.ts` must gain a `buildAgentSubtree(agentId: string, spawnPos: Vector3)` method that generates this prefixed subtree.

**3. AgentLoop Isolation — The Hard Part**

V1's `AgentLoop` is coupled to a single WebSocket connection and runs on a `setInterval`. For V2, each agent's loop must be independently schedulable:

```typescript
interface AgentLoopInstance {
  agentId: string;
  loop: AgentLoop;           // Reused from V1, decoupled from socket
  physicsBodyIndex: number;  // Index into MjData for this agent's body subtree
  cycleMs: number;
  timer: NodeJS.Timeout | null;
  isProcessing: boolean;
  sleepState: 'awake' | 'asleep' | 'sleeping';
  ownerId: string;           // Set in Phase 8
  visibilityTier: 'listed' | 'unlisted';  // Set in Phase 10
}
```

The **critical invariant**: `AgentLoop.cycle()` for Agent A must NEVER touch Agent B's data in `MjData`. This means:

- Joint override application must target ONLY the agent's prefixed joints
- Memory writes must be namespaced by `agent_id`
- Payload building must only include joints for that agent

The V1 `AgentLoop.parseAndValidateAction()` needs a filter: only accept joint overrides that match the agent's prefix. Discard any joints from other agents.

**4. Cross-Agent Visibility (Object Context Injection)**

When building the `InferPayload` for Agent A, the payload builder must scan the world for other agents and inject them as generic objects:

```typescript
// In PayloadBuilder.build() for V2:
const otherAgents = worldState.allAgentPositions
  .filter(a => a.agentId !== this.agentId)
  .filter(a => this.isVisibleToAgent(this.agentPosition, a.position, this.viewDistance))
  .map(a => ({
    id: a.agentId,
    type: "humanoid_figure",
    position: a.position,
    moving: a.isMoving,
    note: "Another figure is present in your visual field."
  }));

payload.objects_in_world = [...worldObjects, ...otherAgents];
```

The system prompt MUST NOT say "there are other AI agents." The prompt must describe them as ambiguous figures — the agent discovers their nature through perception, not explicit system-prompt disclosure.

**5. Coordinator Loop Management**

V1's `AgentLoop` uses `setInterval`. In V2, each agent gets its own `setInterval`. But `isProcessing` prevents overlapping cycles. One agent's slow inference (10s Gemini call) must not block the physics step for others.

Physics runs on a separate, dedicated timer — independent of any agent's inference. The physics step runs at the fixed timestep (0.002s) regardless of whether any agents are thinking. When an agent's action is ready, it's applied at the next physics step boundary.

**6. Memory Isolation at Logical Level (Pre-Phase 8)**

Even before Phase 8's auth, the V2 coordinator must ensure no cross-contamination between agents' memory writes. This means:

- `MemoryManager.write()` must include `agent_id` in every insert
- `MemoryManager.retrieveRelevant()` and `retrieveRecent()` must filter by `agent_id`
- The V1 `supabase_schema.sql` already has `agent_id` columns — this is already correct

#### Testing Checklist (Refined)

- [ ] 3+ agents spawned in one shared world, each standing upright independently
- [ ] Agents can physically collide (push each other) without NaN/instability
- [ ] Stalling one agent's provider call does not block other agents' cycles
- [ ] Stalling one agent's provider call does not block the physics step
- [ ] Memory writes from Agent A NEVER appear in Agent B's memory retrieval
- [ ] Joint override from Agent A's action only affects Agent A's body in physics
- [ ] 10-minute extended session with 3 agents — no memory leaks, no WASM OOM

#### V1 Assumptions That Break in V2

| V1 Assumption | Why It Breaks | Fix |
|---------------|---------------|-----|
| `AgentLoop` is created per WebSocket connection | In V2, many agents per server process, independent of connections | Create AgentLoop instances on agent registration, not on connection |
| `sendToFrontend()` is one socket | In V2, one agent broadcasts to many viewers (owner + spectators) | `sendToFrontend` becomes `broadcast(agentId, message, viewerFilter)` |
| `lastWorldState` is the only world | In V2, world state is shared but per-agent slices are different | Each AgentLoop has a `getAgentSlice(worldState)` method |
| One MuJoCo world = one body | In V2, one MuJoCo world = N bodies | MJCF template is expanded to include N prefixed body subtrees |
| Physics runs in browser | In V2, physics runs on server | Strip Three.js from PhysicsEngine, keep only MuJoCo calls |
| `MjData` is mutated by one thread | In V2, multiple "virtual threads" (async cycles) mutate different parts | Use a write lock per agent's joint range in MjData |

---

### Phase 8: Auth & Agent Registry

#### Refined Architecture

**Auth Provider**: Use **Supabase Auth** (since you already use Supabase for storage). It provides:
- Email/password, OAuth (Google, GitHub, etc.)
- JWT token validation
- Row-Level Security (RLS) for data isolation
- User metadata for profile

**Agent Registry**: A new Supabase table:

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  body_preset TEXT NOT NULL DEFAULT 'humanoid_v1',  -- preset model name
  spawn_position JSONB DEFAULT '{"x":0,"y":0.85,"z":0}',
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle','active','sleeping','offline')),
  visibility_tier TEXT DEFAULT 'unlisted' CHECK (visibility_tier IN ('listed','unlisted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ
);
```

**Agent Creation Flow**:
1. User logs in (Supabase Auth) → frontend gets JWT
2. User fills "Create Agent" modal: selects body preset (humanoid only for now), names the agent
3. Frontend sends `POST /api/agents` with JWT → World Server validates JWT, inserts into `agents` table
4. World Server spawns the agent's body into the shared MuJoCo world
5. World Server creates an `AgentLoopInstance` for the new agent
6. Agent starts its inference loop

**Ownership Enforcement**:
- All agent operations (control, reset, sleep, delete) check `agent.owner_id === requesting_user_id`
- The JWT user ID is extracted from the auth token on every request
- RLS on Supabase enforces that users can only read/write their own agents' data

**Critical Design Decision — Agent Processes vs. Agent Instances**:  
In V1, an agent's `AgentLoop` and its socket connection are the same thing — disconnect kills the agent. In V2, an agent is a **persistent process** in the World Server. WebSocket connections come and go. When a user connects:
1. They authenticate
2. The World Server maps them to their agent(s)
3. The broadcast pipeline starts sending them their agent's state
4. If they disconnect, the agent keeps running
5. If they reconnect, they resume receiving state

This means the V1 `AgentLoop` must be refactored to separate the loop from the transport. The loop writes to a **broadcast buffer**, and the transport reads from it per-viewer.

---

### Phase 9: Camera & Personal Viewing

#### Refined Camera System

The "camera dropdown" is a frontend-only UI concern — the server doesn't need to know which camera mode the user has selected. The server sends the raw world state; the frontend renders the appropriate view.

**Camera Modes (Frontend)**:
1. **World (orbiting third-person)**: camera orbits the full shared scene. The user sees all agents, objects, and the environment.
2. **Per-owned-agent POV**: camera attached to that agent's head bone. Renders from the agent's first-person perspective.
3. **Split-POV**: if user owns multiple agents, a split-screen showing multiple first-person views simultaneously.
4. **Model Input view**: the raw 448×448 frame that the AI actually receives (the offscreen render target from the server's perspective). This is **critical for debugging** — the user can see exactly what the AI sees, including any rendering artifacts or missing data.

**How Model Input View Works**:
In V1, the AI frame is captured on the frontend via an offscreen Three.js renderer at 448×448, encoded to WebP base64, and sent to the coordinator. In V2, since physics is server-side, the server must render the AI's first-person view.

**Decision**: The server does NOT run a full Three.js renderer. Instead:
- The server sends the agent's head position + orientation + a list of visible objects
- The **Vercel frontend** renders the AI frame locally using a headless Three.js scene
- The rendered frame is sent BACK to the coordinator as the `frame` field in the world_state WebSocket message (this is what V1 already does — the browser renders and sends)

**Wait — this means the physics is server-side but rendering is client-side?**  
Yes. This is the correct architecture:
1. Server computes physics (MuJoCo mj_step) → sends all body positions/orientations to the frontend
2. Frontend renders the visual scene using Three.js (the same Three.js code from V1)
3. Frontend captures the 448×448 offscreen render for the AI frame
4. Frontend sends the AI frame back to the server as part of the world_state message
5. Server sends the frame to the VLM provider in the inference payload

This means the V1 rendering code (WorldEngine, Three.js scene setup) moves to Vercel — NOT to the server. The server is purely physics + inference coordination.

**Per-Agent Panel Layout**:
The V1 GodMode panel is a floating window. For V2, each owned agent gets a **panel card** in a sidebar or grid layout. Each card shows:
- Thought stream (streaming tokens)
- Injection input (text box to send thoughts)
- Memory count
- Status indicator (awake, thinking, acting, sleeping)
- Quick actions (sleep, reset, directive)

This replaces the single GodMode panel. The number of panels dynamically scales with how many agents the user owns.

---

### Phase 10: Visibility Tiers & Spectator Mode

**This is called "the hardest backend piece in the whole platform" — and it is.**

#### The Core Problem

In a shared world with N agents and M viewers, every viewer must see the world state filtered according to their relationship to each agent:

- **Owner of Agent A** → sees Agent A's raw, unfiltered thoughts
- **Spectator of Agent A** → sees Agent A's filtered thoughts (safety filter applied), but full audio/visual
- **No relationship to Agent A** → sees Agent A only as a visual figure in the world (no thoughts, no audio)

This means the broadcast pipeline must produce **per-viewer output streams** — not a single global broadcast.

#### Refined Architecture: Per-Viewer Broadcast Pipeline

```
                        ┌─────────────────────────┐
                        │   World State (Raw)      │
                        │   - All agent positions  │
                        │   - All agent thoughts   │
                        │   - All agent audio      │
                        │   - Physics state        │
                        └────────────┬────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │  Broadcast Router        │
                        │  - Maps viewer_id →      │
                        │    { owned_agents: [],   │
                        │      spectated_agents:[]} │
                        └────────────┬────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
     ┌────────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐
     │ Viewer 1 Stream │   │ Viewer 2 Stream │   │ Viewer 3 Stream │
     │ (Owner of A, B) │   │ (Spectator of A)│   │ (Owner of C)    │
     │                  │   │                 │   │                 │
     │ Agent A: raw     │   │ Agent A: filter │   │ Agent A: visual │
     │ Agent B: raw     │   │ Agent B: visual │   │ Agent B: visual │
     │ Agent C: visual  │   │ Agent C: visual │   │ Agent C: raw    │
     └──────────────────┘   └─────────────────┘   └─────────────────┘
```

**Implementation: Event-Driven with Per-Viewer Queues**

Each viewer connection gets a **ViewerStream** object:

```typescript
interface ViewerStream {
  viewerId: string;
  userId: string;
  socket: WebSocket;
  subscriptions: Map<string, 'owner' | 'spectator' | 'none'>; // agentId → relationship
  messageQueue: FilteredMessage[];
  isDraining: boolean;
}

type FilteredMessage = {
  type: 'thought_token' | 'thought_complete' | 'action' | 'world_state' | 'audio' | 'speech';
  agentId: string;
  data: any;
  filterApplied: boolean; // whether safety filter was applied to thoughts
};
```

When the World Server has new data for an agent (new thought token, new action, new audio), it:

1. Looks up all ViewerStreams
2. For each ViewerStream, checks the viewer's relationship to that agent
3. Applies the appropriate filter:
   - `owner` → pass through raw (`filterApplied: false`)
   - `spectator` → apply safety filter to thought text, pass audio/visual raw
   - `none` → suppress thoughts entirely, suppress audio, send only visual position
4. Pushes the filtered message to that viewer's queue
5. Drains the queue to the WebSocket

**This is O(M × N) per event — M viewers × N agents.** For 100 viewers watching 100 agents, that's 10,000 filter operations per thought token. This is why this phase is hard.

**Optimization: Pre-compute viewer-agent relationship matrix, then filter incrementally.**

Instead of recomputing relationships every time, maintain a `Map<viewerId, Map<agentId, Relationship>>` that is updated only when:
- A new viewer connects
- An agent changes visibility tier
- An agent is created/deleted

Then filtering is just: `if (relationship === 'owner') send raw; else if (relationship === 'spectator') send filtered; else skip;`

**Safety Filter Implementation**:
The "light safety filter" is described as the same filter already applied to speech. This means:
- A text classification pass that detects harmful/toxic/NSFW content
- For now, this can be a simple keyword blocklist + a lightweight ML classifier
- The filter runs on thought tokens as they stream, not on the complete thought
- Filtered tokens are replaced with `[filtered]` or similar placeholder

**Listed / Unlisted Distinction**:
- `listed` → agent appears in the public browse/discover page
- `unlisted` → agent does NOT appear in public browse, but is accessible via direct link if the owner shares it
- BOTH tiers have the same rendering/hearing/thought filtering rules — the tier ONLY affects discoverability

**Spectator Mode UI**:
- A "Browse Agents" page shows a grid of Listed agents (name, owner, preview thumbnail, active status)
- Clicking an agent opens the spectator view: the shared world renders normally, the selected agent's visual feed is shown, filtered thoughts appear in a read-only panel
- Spectator has NO controls — no injection, no directive, no body controls

---

### Phase 11: Audio — TTS / STT / Discussions

#### Refined Audio Architecture

**TTS (Text-to-Speech)**:
Agent thought output → TTS engine → audio stream → broadcast through per-viewer pipeline.

**Decision: Use Google Cloud Text-to-Speech** (since you're on GCP):
- Low latency, natural voices
- Streaming synthesis (sends audio chunks as they're generated)
- Multiple voices (assign different voices to different agents)

**Flow**:
1. Agent's thought stream produces text tokens
2. Coordinator accumulates tokens into sentences (or uses punctuation-aware chunking)
3. Each completed sentence is sent to Cloud TTS
4. Cloud TTS returns PCM audio chunks
5. Audio chunks are encoded to Opus in WebM container (browser-compatible)
6. Encoded audio is pushed to the per-viewer broadcast pipeline
7. Frontend plays audio via Web Audio API

**Integration with Phase 10 broadcast**:
- Owner hears the agent's full audio (all sentences)
- Spectator hears the same audio (TTS output is not filtered — only the raw thought text is filtered before TTS)
- Non-subscribed viewers hear nothing

**STT (Speech-to-Text)**:
User speaks into browser microphone → audio captured → sent to server → transcribed → injected into agent's inference cycle.

**Flow**:
1. User clicks "Talk to Agent" button in their agent panel
2. Browser requests microphone access via `getUserMedia`
3. Audio is captured as Opus in WebM, streamed via WebSocket to server
4. Server sends audio chunks to **Google Cloud Speech-to-Text** (streaming recognition)
5. STT returns transcribed text in real-time
6. Transcribed text is injected into the agent's `InjectionQueue` — the EXACT SAME queue from V1 Phase 5
7. Agent's next inference cycle picks up the injection and processes it

**Why reuse the existing injection channel?** Because it already works — the injection queue, the `pending_injection` field in the payload, and the `🚨 USER OVERRIDE DIRECTIVE 🚨` prompt block. No new codepath needed.

**Discussions Log**:
Persistent record of spoken exchanges:
- Agent TTS output text + timestamp + agent_id + session_id
- User STT input text + timestamp + agent_id + session_id
- Stored in a new `discussions` table, respecting Phase 10 visibility rules (only owner sees full log, spectators see filtered log)

```sql
CREATE TABLE discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  session_id TEXT REFERENCES sessions(id),
  speaker TEXT NOT NULL CHECK (speaker IN ('agent','user')),
  text TEXT NOT NULL,
  is_filtered BOOLEAN DEFAULT false,
  audio_url TEXT,  -- Cloud Storage URL for audio recording
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Audio Mixing (Spatial Audio)**:
If multiple agents are speaking simultaneously in the shared world, the frontend should apply spatial audio:
- Each agent's TTS audio is positioned at their 3D location in the Web Audio API
- The listener (user's camera position) hears agents closer to them louder, farther agents quieter
- This uses the Web Audio API's `PannerNode` — purely frontend, no server changes needed

The phase prompt asks to confirm against `v2_hosted_platform_spec.md`'s actual audio requirements. Absent that reference document, the safe assumption is: **spatial audio by distance attenuation, not full HRTF, with an option to "focus" on one agent (mute others).**

---

### Phase 12: Sleep System

#### Refined Sleep Architecture

Two triggers confirmed:
1. **Admin "sleep all"**: suspends all agents' inference loops (primary mechanism)
2. **Owner per-agent sleep**: owner can sleep/wake their own agent (second mechanism)

Automatic idle-sleep is explicitly out of scope — manual triggers only.

**Sleep State Machine**:

```
         ┌──────────┐
         │  AWAKE   │ ← inference loop running
         └────┬─────┘
              │ sleep_all (admin) OR sleep(agentId) (owner)
              ▼
         ┌──────────┐
         │ SLEEPING │ ← inference loop STOPPED
         │          │    physics: frozen (position preserved)
         │          │    memory: preserved
         │          │    thought stream: paused
         └────┬─────┘
              │ wake_all (admin) OR wake(agentId) (owner)
              ▼
         ┌──────────┐
         │  AWAKE   │ ← inference loop RESUMED
         │          │    thought stream: continues from last context
         │          │    memory: intact
         └──────────┘
```

**Implementation**:

```typescript
interface SleepManager {
  // Admin controls
  sleepAll(): void;  // Iterates all agents, calls agent.sleep()
  wakeAll(): void;   // Iterates all agents, calls agent.wake()

  // Owner controls (validates ownership)
  sleepAgent(agentId: string, requestingUserId: string): void;
  wakeAgent(agentId: string, requestingUserId: string): void;

  // Query
  getSleepState(agentId: string): 'awake' | 'sleeping';
  getActiveAgentCount(): number;
  getSleepingAgentCount(): number;
}
```

When an agent is slept:
1. `clearInterval(agent.timer)` — stops the inference cycle
2. `agent.sleepState = 'sleeping'` — marks state
3. Physics: the agent's body remains in the world but is frozen. Either:
   - (a) Set all joint velocities to 0 and disable actuation, OR
   - (b) Remove the agent's body subtree from the MJCF and re-insert on wake
   - **Recommendation (a)**: simpler, less risky — freeze in place
4. Memory and state are preserved in-memory (not persisted to DB on sleep — they persist on wake if configured)

When an agent is woken:
1. `agent.interval = setInterval(() => agent.cycle(), agent.cycleMs)` — restarts inference
2. `agent.sleepState = 'awake'`
3. If using freeze-in-place: re-enable actuation, reset velocity clamps
4. The agent's next cycle builds a payload with its last known state — no memory loss

**Sleep Losslessness Guarantee**:
- Agent position: stored in MjData qpos — untouched during sleep
- Agent memory: stored in MemoryManager (in-memory + Supabase) — untouched
- Agent thought context: the VLM doesn't have persistent context across cycles (each cycle is stateless) — the "context" is in the memories and system prompt. So waking up is literally just resuming the cycle timer.

**No context loss possible** because the V1 architecture is stateless-per-cycle. Each cycle builds a fresh payload from world state + memories. Sleep just stops the timer; wake starts it again.

---

### Phase 13: Recording & BYO Supabase

#### Refined Recording Architecture

**Session Recording**: Capture a session for later playback. This extends the V1 `DatasetExporter` but adds a playback UI.

**What to record**:
- All world state snapshots (per physics frame, decimated to ~10fps for storage)
- All agent thoughts (full text)
- All agent actions (joint overrides)
- All outcomes (from physics — did the action succeed?)
- Audio (TTS output + STT input)
- Frame captures (448×448 WebP, stored in Cloud Storage)

**Storage**: Google Cloud Storage bucket with a structured path:
```
synthia-recordings/
  {agentId}/
    {sessionId}/
      metadata.json          # session info, agent info, timestamps
      world_state.jsonl      # one JSON object per recorded frame
      thoughts.jsonl         # one JSON object per thought token batch
      actions.jsonl          # one JSON object per action
      audio.opus             # mixed audio track
      frames/
        hb_000001.webp       # AI frame at heartbeat 1
        hb_000002.webp       # AI frame at heartbeat 2
        ...
```

**Playback UI** (Vercel frontend):
- A video-player-like interface
- Timeline scrubber showing heartbeats
- Syncs: world state rendering (Three.js replay) + thought stream panel + audio
- Play/pause, speed control (0.5x, 1x, 2x)

**Reuse from V1**: The `DatasetExporter` already exports sessions. The recording pipeline is essentially: instead of exporting to a file on request, continuously write to the recording storage during the session.

#### Refined App-Layer Sharding Architecture

**The Problem**: With many agents, a single Supabase project hits limits (DB size, connection pool, RLS complexity). The solution is to spread agents across multiple Supabase projects at the application layer.

**Sharding Strategy**:

```typescript
interface ShardRouter {
  // Maps agent_id → which Supabase project to use
  getShardForAgent(agentId: string): ShardConfig;

  // Creates a new agent and assigns it to the least-loaded shard
  assignShardForNewAgent(): ShardConfig;

  // For BYO: routes a specific agent to user's own Supabase
  assignBYOShard(agentId: string, userSupabaseConfig: SupabaseConfig): void;
}

interface ShardConfig {
  shardId: string;
  supabaseUrl: string;
  supabaseKey: string;
  isBYO: boolean;       // true if user supplied their own project
  ownerId?: string;     // for BYO, the user who supplied it
}
```

**Shard Assignment Table** (stored in a central "routing" Supabase project):

```sql
CREATE TABLE shard_assignments (
  agent_id TEXT PRIMARY KEY,
  shard_id TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  supabase_key_encrypted TEXT NOT NULL,  -- encrypted at rest
  is_byo BOOLEAN DEFAULT false,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shard_metadata (
  shard_id TEXT PRIMARY KEY,
  supabase_url TEXT NOT NULL,
  agent_count INT DEFAULT 0,
  max_agents INT DEFAULT 500,  -- per-shard limit
  is_active BOOLEAN DEFAULT true
);
```

**Agent Creation Flow with Sharding**:
1. User creates agent
2. `ShardRouter.assignShardForNewAgent()` queries `shard_metadata` for the shard with the lowest `agent_count` below `max_agents`
3. Returns that shard's Supabase credentials
4. `MemoryManager` and `MotorProgramStore` for that agent are initialized with that shard's credentials
5. Agent data (memories, motor programs, skills, sessions) is written to that shard

**BYO Supabase Flow**:
1. User provides their Supabase URL + service_role key in settings
2. Platform validates the connection (ping, schema check)
3. For that user's agents, `ShardRouter.assignBYOShard()` overrides the shard assignment to point to user's project
4. All future data for that agent goes to the user's Supabase
5. Existing data can be migrated (optional, user-initiated)

**FDW (Foreign Data Wrapper)**: Explicitly reserved for admin panel (Phase 14) to do cross-shard queries (e.g., "show all agents across all shards"). Not used for user-facing routing.

**Reuse from V1**: The V1 `MemoryManager` and `MotorProgramStore` already accept `supabaseUrl` and `supabaseKey` in their constructors. The sharding layer simply provides different credentials per agent — no schema changes needed. Each shard runs the same `supabase_schema.sql`.

---

## Vercel + GCP Deployment Architecture

### Rationale

- **Vercel**: Optimized for React SPA hosting. Handles SSL, CDN, edge caching, serverless functions. Your frontend is a static build (`vite build` output) plus a few API routes for auth callbacks. Vercel is the natural choice for "the viewport" — users visiting the site to watch/interact.
- **GCP**: The heavy lifting — persistent server process running MuJoCo physics (can't be serverless), WebSocket connections (long-lived), TTS/STT (needs Cloud TTS/STT APIs), Cloud Storage (recordings). GCP Cloud Run doesn't support WebSocket well for long-lived connections — consider **GKE (Kubernetes)** or **Compute Engine VMs** for the World Server.

### Recommended GCP Services

| Service | Purpose | Why |
|---------|---------|-----|
| **Cloud Run** | Auth service, REST API endpoints | Stateless, auto-scaling, pay-per-use |
| **GKE (Kubernetes)** | World Server (MuJoCo + AgentLoops) | Stateful, long-lived WebSocket connections, needs persistent memory |
| **Cloud SQL (PostgreSQL)** | Alternative to Supabase if you migrate off Supabase | Managed Postgres with pgvector extension |
| **Cloud Storage** | Frame storage, session recordings, TTS audio cache | Cheap, durable, S3-compatible |
| **Cloud Text-to-Speech** | TTS for agent speech | Streaming synthesis, multiple voices |
| **Cloud Speech-to-Text** | STT for user voice input | Streaming recognition, real-time |
| **Cloud Load Balancing** | Route traffic: `/ws` → GKE, `/api` → Cloud Run, `/` → Vercel | Single entry point |
| **Secret Manager** | Store API keys (Gemini, Supabase, etc.) | Encrypted at rest, audit logged |
| **Cloud Monitoring** | Logs, metrics, alerts | Agent health, inference latency, error rates |

### Vercel Configuration

```javascript
// vite.config.ts (V2)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
  define: {
    'import.meta.env.VITE_GCP_WS_URL': JSON.stringify(process.env.GCP_WS_URL),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
  }
});
```

The Vercel build outputs static files served from Vercel's CDN. The React app connects to GCP for all dynamic functionality.

### Camera/Microphone Access (Vercel Side)

Since the frontend runs on Vercel (HTTPS), `getUserMedia()` for camera and microphone is available (requires HTTPS, which Vercel provides). The video/audio is processed client-side:
- **AI Frame rendering**: Three.js offscreen renderer at 448×448, captures WebP → sends to GCP via WebSocket
- **STT audio**: captured via `getUserMedia` → encoded to Opus → streamed to GCP via WebSocket
- **TTS playback**: received from GCP as Opus WebM chunks → decoded via Web Audio API → played through speakers

### Networking: Vercel ↔ GCP

```
[User Browser]
    │
    │ HTTPS (WSS)
    ▼
[Vercel CDN] ── serves static React app
    │
    │ WebSocket connection (WSS) directly to GCP
    │ (browser connects to GCP's WebSocket endpoint, not through Vercel)
    ▼
[GCP Load Balancer]
    │
    ├── /ws → GKE (World Server) — WebSocket
    ├── /api → Cloud Run (Auth, REST) — HTTP
    └── other → Vercel (frontend)
```

The browser establishes a direct WebSocket connection to the GCP World Server. Vercel serves only the static HTML/JS/CSS. This avoids Vercel's serverless function timeout limits (10s on Pro, 60s on Enterprise — too short for persistent agent connections).

---

## Infrastructure & Data Flow Diagrams

### Phase 7–8 Data Flow (Multi-Agent Core + Auth)

```
1. Physics Loop (dedicated, independent of inference):
   ┌──────────────┐   mj_step() at 0.002s   ┌──────────────────────┐
   │ MuJoCo WASM  │ ◄────────────────────── │ Physics Timer        │
   │ (all agents) │                         │ (setInterval 2ms)    │
   └──────┬───────┘                         └──────────────────────┘
          │
          │ world state (all agent positions, velocities, contacts)
          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                   World State Buffer                          │
   │  { agents: { agent_A: { joints, pos, vel, contacts }, ... }, │
   │    objects: [...],                                           │
   │    lightState: 'day', heartbeat: 1234 }                      │
   └──────┬───────────────────────────────────────────────────────┘
          │
          │ each agent reads its own slice
          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  AgentLoop A          AgentLoop B          AgentLoop C       │
   │  cycleMs: 2000        cycleMs: 3000        cycleMs: 1500     │
   │  ┌───────────┐       ┌───────────┐        ┌───────────┐     │
   │  │ 1. Read   │       │ 1. Read   │        │ 1. Read   │     │
   │  │ world     │       │ world     │        │ world     │     │
   │  │ slice     │       │ slice     │        │ slice     │     │
   │  │ 2. Build  │       │ 2. Build  │        │ 2. Build  │     │
   │  │ payload   │       │ payload   │        │ payload   │     │
   │  │ 3. Call   │       │ 3. Call   │        │ 3. Call   │     │
   │  │ VLM       │       │ VLM       │        │ VLM       │     │
   │  │ 4. Parse  │       │ 4. Parse  │        │ 4. Parse  │     │
   │  │ action    │       │ action    │        │ action    │     │
   │  │ 5. Apply  │       │ 5. Apply  │        │ 5. Apply  │     │
   │  │ to MjData │       │ to MjData │        │ to MjData │     │
   │  │ 6. Write  │       │ 6. Write  │        │ 6. Write  │     │
   │  │ memory    │       │ memory    │        │ memory    │     │
   │  └───────────┘       └───────────┘        └───────────┘     │
   └──────────────────────────────────────────────────────────────┘
          │
          │ each agent's output → broadcast pipeline
          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │              Broadcast Pipeline (Phase 10)                    │
   │  Per-viewer filtering → WebSocket to Vercel frontend         │
   └──────────────────────────────────────────────────────────────┘
```

### Phase 10 Broadcast Pipeline (Detailed)

```
Agent A produces:
  thought_token: "I think I see..."
  action: { joint_overrides: {...} }
  speech_audio: <PCM buffer>

        │
        ▼
┌───────────────────────────────────────────────────┐
│              Broadcast Router                      │
│                                                     │
│ For each connected viewer:                          │
│                                                     │
│ Viewer 1 (owner of A):                              │
│   thought_token → PASS THROUGH RAW                  │
│   action → PASS THROUGH                             │
│   speech_audio → PASS THROUGH                       │
│                                                     │
│ Viewer 2 (spectator of A):                          │
│   thought_token → SAFETY FILTER → filtered text     │
│   action → PASS THROUGH                             │
│   speech_audio → PASS THROUGH                       │
│                                                     │
│ Viewer 3 (no relation to A):                        │
│   thought_token → SUPPRESS (don't send)             │
│   action → SUPPRESS                                 │
│   speech_audio → SUPPRESS                           │
│   (only position/visual data for world rendering)   │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│  Per-Viewer WebSocket Connection                   │
│                                                     │
│  Viewer 1 WS: { type:'thought_token', agentId:'A', │
│                 data:{ text:'I think...' },         │
│                 filterApplied: false }              │
│  Viewer 2 WS: { type:'thought_token', agentId:'A',  │
│                 data:{ text:'I think...' },          │
│                 filterApplied: true }               │
│  Viewer 3 WS: (no message sent for agent A)         │
└───────────────────────────────────────────────────┘
```

---

## Critical Design Decisions & Non-Obvious Invariants

### 1. Physics Authority Moves to Server — Rendering Stays on Client

**Decision**: The server computes physics (MuJoCo); the Vercel frontend renders the visual scene and captures the AI frame.

**Why**: Running a full Three.js rendering pipeline on the server for every agent's first-person view would be prohibitively expensive (GPU required, multiple render targets). Instead, the server sends raw body positions/orientations; the client renders the world, captures the 448×448 AI frame, and sends it back to the server for VLM inference. This is V1's existing architecture — just shifted from browser-physics to server-physics + client-rendering.

### 2. Agents Are Identified by Prefix in MuJoCo, Not Separate Worlds

**Decision**: All agents exist in ONE MuJoCo world with name prefixes (`agent_1_hips`, `agent_2_hips`), NOT in separate MuJoCo worlds.

**Why**: Genuine physical collisions between agents require them to be in the same `MjData`. MuJoCo does not support cross-world collision. Prefixed naming is the standard approach in multi-body MuJoCo simulations.

### 3. AgentLoop Is Transport-Agnostic

**Decision**: An `AgentLoop` does not know about WebSocket connections. It writes to a broadcast buffer. The broadcast pipeline reads from that buffer and fans out to connected viewers.

**Why**: In V1, one agent = one socket. In V2, one agent = many viewers. Decoupling the loop from the transport avoids a massive refactor when adding spectator mode (Phase 10). Build this decoupling into Phase 7 from the start.

### 4. Memory Isolation Is Schema-Level, Not Just Logical

**Decision**: Every database operation includes `agent_id` in the WHERE clause or as a column value. RLS policies should enforce `agent_id` ownership via `owner_id` on the `agents` table.

**Why**: In V1, `agent_id` defaults to `'agent_a'` — there's only one agent. In V2, cross-contamination of memories between agents would be catastrophic (Agent A's memories appearing in Agent B's context). Schema-level enforcement prevents this.

### 5. TTS/STT Audio Is NOT Filtered by Visibility Tier — Only Thought Text Is

**Decision**: Spoken audio (TTS output) is passed through raw to all viewers (owner and spectator). Only the raw thought text is filtered. If a spectator chooses to listen to an agent, they hear the unfiltered speech.

**Why**: The phase prompt states: "spoken audio should respect the same owner/spectator filtering already built." But the filtering described is a "light safety filter" on thoughts. TTS output is synthesized speech — filtering it would require real-time audio censorship, which is technically complex and introduces latency. The simpler interpretation: TTS output is the agent's "public speech" — spectators hear it; raw thoughts require filtering.

**Refinement**: Add a separate "speech" field to the agent's output. The agent can choose to "speak aloud" (TTS synthesized) or "think privately" (thought stream only). This gives the agent control over what's public vs. private. Spectators hear speech; only the owner sees thoughts. This aligns with the "light safety filter" metaphor — thoughts are filtered for safety, speech is intended for public consumption.

### 6. Sleep Is Non-Destructive — State Is In-Memory

**Decision**: Sleep pauses the inference timer and freezes the agent's physics body. No state is serialized to disk on sleep (state is already in Supabase via normal memory writes). Waking simply resumes the timer.

**Why**: Serializing full MuJoCo state (qpos, qvel, ctrl) to disk and restoring it is error-prone and unnecessary. The agent's context is in its memories (already persisted). The physics state is in the MjData (in-memory). Sleep is just "stop the clock."

### 7. The AI Frame Is Rendered Client-Side, NOT Server-Side

**Decision**: The 448×448 frame that the VLM sees is rendered by the Vercel frontend (Three.js offscreen), encoded to WebP, and sent to the GCP coordinator via WebSocket.

**Why**: This might seem "wrong" — the server has the physics, why doesn't it render? Because rendering requires a GPU context. On GCP, you'd need GPU-attached instances (expensive, complex). Instead, offload rendering to the client's browser GPU. This is the same pattern V1 uses.

**Caveat**: This introduces a dependency on the client for the inference pipeline. If no client is viewing the agent, who renders the AI frame? **Answer**: The agent's owner's browser MUST be connected for the agent to see. If the owner disconnects, the agent goes blind. This is a deliberate design choice — the agent's visual perception depends on a connected renderer. In a future phase, a server-side headless renderer (e.g., Puppeteer with WebGL, or a dedicated Cloud GPU instance) could be added, but for V2, the owner's browser is the renderer.

**Alternative**: If this is unacceptable, run a headless Chromium instance per agent on GCP with `--use-gl=swiftshader` for software rendering. This is feasible for a small number of agents but doesn't scale. Discuss with stakeholders.

### 8. The "Hardest Backend Piece" (Phase 10) Is Hard Because of Concurrency

**Why Phase 10 is hard**: For M concurrent viewers watching N agents, every world state update needs M × N filter checks. With 100 viewers and 100 agents, every thought token (potentially 50+ per agent per cycle) triggers 10,000 filter operations. This is manageable with pre-computed relationship matrices and efficient fan-out, but it must be designed correctly from the start. Use Node.js Worker Threads or a dedicated broadcast worker to avoid blocking the physics/inference loops.

---

## Development Order & Risk Mitigation

### Risk Matrix

| Risk | Severity | Phase | Mitigation |
|------|----------|-------|------------|
| MuJoCo WASM OOM with N agents | Critical | 7 | Start with N=3, scale up incrementally. Monitor WASM memory. |
| VLM provider rate limits at scale | High | 7 | Implement per-agent rate limiting, queue backing, provider rotation |
| Per-viewer broadcast O(M×N) bottleneck | High | 10 | Pre-compute relationship matrix, use worker threads, batch updates |
| Client-side AI frame rendering latency | Medium | 7, 9 | Minimize WebP encode time, use requestAnimationFrame timing |
| Supabase sharding complexity | Medium | 13 | Build app-layer routing early, test with 2 shards before scaling |
| Auth + RLS misconfiguration | Low | 8 | Use Supabase Auth (well-documented), test with integration tests |
| TTS latency for real-time speech | Medium | 11 | Use streaming TTS, pre-buffer sentences, cache common phrases |

### Recommended Build Order (With Dependencies)

```
Phase 7 (Multi-Agent Core) ← START HERE
  ↓ (prove shared physics + independent inference work)
Phase 8 (Auth & Registry)
  ↓ (add user accounts, agent ownership)
Phase 9 (Camera & Personal Viewing)
  ↓ (owner sees own agents, no spectator yet)
Phase 10 (Visibility & Spectator) ← HARDEST — budget extra time
  ↓ (per-viewer broadcast MUST work before audio)
Phase 11 (Audio TTS/STT)
  ↓ (audio sits on top of broadcast pipeline)
Phase 12 (Sleep System)
  ↓ (purely operational, any order after Phase 8)
Phase 13 (Recording & BYO Supabase)
  ↓ (storage features, last before admin)
Phase 14 (Admin Panel)
```

### Files to Create or Refactor (Per Phase)

**Phase 7**:
- NEW: `v2/server/src/worldServer.ts` — Main entry point, dedicated physics timer
- NEW: `v2/server/src/world/multiAgentWorld.ts` — MJCF expansion, shared MjModel/MjData management
- REFACTOR: `coordinator/src/agentLoop.ts` → `v2/server/src/agent/agentLoop.ts` — Decouple from socket, add agent slice, add prefix filtering
- NEW: `v2/server/src/agent/agentRegistry.ts` — In-memory registry of all AgentLoopInstances
- NEW: `v2/server/src/broadcast/broadcastPipeline.ts` — Stub for Phase 10 (single-viewer passthrough for now)
- REUSE: `coordinator/src/payloadBuilder.ts` — Add cross-agent visibility
- REUSE: `coordinator/src/inferenceClient.ts` — Unchanged
- REUSE: `coordinator/src/memoryManager.ts` — Add agent_id scoping
- REUSE: `coordinator/src/providers/*` — Unchanged
- REFACTOR: `src/world/engine/MJCFHumanoidTemplate.ts` → `v2/server/src/world/MJCFTemplate.ts` — Add `buildAgentSubtree(agentId, spawnPos)`
- REFACTOR: `src/world/engine/PhysicsEngine.ts` → `v2/server/src/world/physicsEngine.ts` — Strip Three.js, keep MuJoCo

**Phase 8**:
- NEW: `v2/server/src/auth/authMiddleware.ts` — JWT validation for WebSocket connections
- NEW: `v2/server/src/api/agentRoutes.ts` — REST endpoints for agent CRUD
- NEW: Supabase migration — `agents` table, `users` table extension
- REFACTOR: WebSocket message handlers — add auth check, extract userId from JWT

**Phase 9**:
- REFACTOR: `src/components/godmode/GodModePanel.tsx` → per-agent panel cards
- NEW: `src/components/viewer/CameraDropdown.tsx` — camera mode switching
- NEW: `src/components/viewer/ModelInputView.tsx` — raw 448×448 frame display
- REFACTOR: `src/store/worldStore.ts` → add agent-specific state slices
- NEW: `src/hooks/useAgentView.ts` — hook for per-agent view management

**Phase 10**:
- NEW: `v2/server/src/broadcast/viewerStream.ts` — Per-viewer message queue with filtering
- NEW: `v2/server/src/broadcast/relationshipMatrix.ts` — Pre-computed viewer-agent relationships
- NEW: `v2/server/src/broadcast/safetyFilter.ts` — Text safety filter
- NEW: `src/components/spectator/SpectatorBrowse.tsx` — Public agent browser
- NEW: `src/components/spectator/SpectatorView.tsx` — Read-only agent viewing

**Phase 11**:
- NEW: `v2/server/src/audio/ttsEngine.ts` — Google Cloud TTS integration
- NEW: `v2/server/src/audio/sttEngine.ts` — Google Cloud STT integration
- NEW: `src/hooks/useMicrophone.ts` — Browser mic capture hook
- NEW: `src/hooks/useAgentAudio.ts` — TTS playback hook
- REFACTOR: `src/world/engine/AudioEngine.ts` → spatial audio positioning
- NEW: Supabase migration — `discussions` table

**Phase 12**:
- NEW: `v2/server/src/sleep/sleepManager.ts` — Sleep state machine
- NEW: `src/components/admin/SleepControls.tsx` — Admin sleep all/wake all
- NEW: `src/components/agent/SleepToggle.tsx` — Per-agent sleep button for owners

**Phase 13**:
- NEW: `v2/server/src/recording/sessionRecorder.ts` — Continuous recording to Cloud Storage
- NEW: `src/components/playback/PlaybackViewer.tsx` — Session playback UI
- NEW: `v2/server/src/sharding/shardRouter.ts` — App-layer sharding logic
- NEW: `v2/server/src/sharding/byoValidator.ts` — BYO Supabase validation
- REFACTOR: `coordinator/src/datasetExporter.ts` → extend with playback export format

---

## Final Notes

1. **The V1 codebase is the foundation** — not a throwaway prototype. The `AgentLoop`, `PayloadBuilder`, `InferenceClient`, `MemoryManager`, and provider adapters are production-quality code that V2 should reuse with targeted refactors, not rewrites.

2. **The browser remains the renderer** — This is the most non-obvious architectural decision. The server does physics only. The browser does rendering. This has implications for agent "blindness" when the owner disconnects. Address this explicitly before Phase 7 begins.

3. **Phase 10 is the long pole** — Design the broadcast pipeline abstraction in Phase 7, even if it's a single-viewer passthrough initially. Adding the full per-viewer branching in Phase 10 will be much easier if the interface is already in place.

4. **Test Phase 7 with N=3 first** — Don't attempt N=10 or N=100 until 3 agents have run stably for an hour. The MuJoCo WASM memory profile with multiple bodies is the biggest unknown.

5. **Supabase sharding can be deferred** — The single shared Supabase from V1 can handle dozens of agents before sharding is necessary. Build the sharding abstraction (Phase 13) but don't rush to deploy it.

---

*This document supersedes the individual phase markdown files in `v2update/` as the authoritative implementation reference. All phase-specific completion checklists from the original prompts remain valid and should be completed sequentially.*
