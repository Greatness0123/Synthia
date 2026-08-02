# SYNTHIA 1.5.1 — Multi-Agent Isolation Audit & Architecture Report

## Summary

SYNTHIA is a browser-based "digital being" simulator: a humanoid body driven by MuJoCo physics in a Three.js scene, with the body controlled by a vision-language model that streams thoughts and joint-angle actions. This audit answers one question: **does the current codebase support spawning 10+ independently-thinking agents in one shared world, each with its own joints, API key, storage, and thought stream, without motor cross-talk?**

**Verdict:** The physics layer is **already correctly multi-agent isolated** (per-agent prefixed MJCF names → unique MuJoCo IDs → isolated actuators, proven by an automated test). The per-agent *cognition* layer (client-side `AgentLoop` per agent) is **also already per-agent**. What is **NOT** supported today: per-agent API keys/providers (one global key for everyone), per-agent camera vision (all agents see the active agent's view), and per-agent UI controls (panels hardcode `agent_a`). A legacy coordinator server path is effectively single-agent and conflicts with the client-side path. Scaling to 10+ is structurally possible but each spawn forces a full world rebuild.

**Achieving the goal is possible, with the targeted changes listed in §6.**

---

## 1. Architecture

### Dual execution paths (this is critical to understand)

There are **two parallel agent-cognition pipelines** in this codebase:

1. **Server-side coordinator path (older, Phase 1)** — `coordinator/src/server.ts` (Fastify + WebSocket on port 3001). The browser sends `world_state` frames to the server; the server's `AgentLoop` (one per `agentId`) runs inference and streams `thought_token`, `action`, `heartbeat_sync` messages back over WebSocket. **The frontend only ever sends `agentId: 'agent_a'` here, and `CoordinatorContext.tsx` ignores `data.agentId` in every incoming message — so this path is de-facto single-agent.**

2. **Client-side agent path (newer, Phase 2)** — `src/world/agent/AgentLoop.ts`. Each spawned agent gets its **own** `AgentLoop` instance running in the browser, with its own `setInterval` cadence, its own `InferenceClient` (HTTP streaming), its own `MemoryManager`, and its own `PayloadBuilder`. Actions are dispatched as `synthia:action` CustomEvents carrying `agentId`; `useWorld`'s action handler looks up the binder for that exact `agentId` and applies targets only to it. **This is the real multi-agent path.**

### The two paths conflict

- `WorldViewport.tsx` still sends `world_state` to the server with hardcoded `agentId: 'agent_a'` on an interval, **in addition to** the per-agent client loops. So for `agent_0` you can end up with **two** inference loops (one client-side, one server-side) both driving actions.
- The server kills **ALL** agent loops on any client disconnect (`server.ts` socket close handler: `agents.forEach(agent => agent.stop())`).
- The server's `set_provider`/`set_supabase`/`set_cycle_ms` are **global** — one provider config applied to all server agents.

### Physics engine architecture

- **One** `PhysicsEngine` (single MuJoCo `MjModel`/`MjData`) for the **entire world**. All agents share one physics step, one collision space, one floor/piano/env-slot object pool.
- Each agent = one `HumanoidPhysicsBinder` → owns one `BodyManager` (name↔ID maps), one `MotorController` (own actuator IDs), one `ObservationBuilder`, one `AvatarSynchronizer`. All are per-agent instances.
- Every MuJoCo entity is **name-prefixed** by `agentId`: `BodyManager` sets `this.prefix = agentId ? \`${agentId}_\` : ''`, and `MJCFHumanoidTemplate.generateAgentSubtreeMJCF(prefix)` prefixes bodies (`agent_0_root_capsule`), joints (`agent_0_mixamorigspine_pitch`), geoms (`agent_0_mixamorigleftfoot_geom`), and actuators (`act_agent_0_mixamorigrightarm_yaw`).

### Tech stack

- **Frontend**: React 18 + Vite 8 + TypeScript 6, Three.js r184, `@mujoco/mujoco` WASM, Zustand (global stores), Tailwind.
- **Backend (optional)**: Fastify + `@fastify/websocket`, node `AgentLoop`, Supabase for memory.
- **Client-side loops** hit either the Vite proxy (`/api/infer/gemini`, `/api/infer/openai-compat`) or a direct Kaggle/OpenAI-compatible endpoint.

---

## 2. Directory Structure (significant parts)

```
├── src/
│   ├── App.tsx                     — Root: spawn button, agent selector dropdown, right panel, camera modes
│   ├── store/
│   │   ├── agentStore.ts           — PER-AGENT `agents: Record<agentId, SingleAgentState>` + flat mirror of active agent
│   │   ├── connectionStore.ts      — GLOBAL provider/endpoint/apiKey/model/cycleMs/supabase (persisted)
│   │   ├── worldStore.ts           — GLOBAL world physics settings (gravity, bodyType, camera…)
│   │   └── uiStore.ts              — UI state
│   ├── world/
│   │   ├── agent/
│   │   │   ├── AgentLoop.ts        — PER-AGENT client-side cognitive loop (interval, inference, memory write, action dispatch)
│   │   │   ├── InferenceClient.ts  — PER-LOOP HTTP/SSE streaming client (builds Gemini/OpenAI prompts)
│   │   │   ├── payloadBuilder.ts   — PER-LOOP payload assembly (memories, tactile, perception)
│   │   │   └── memoryManager.ts    — PER-LOOP Supabase client (writes keyed by agent_id)
│   │   ├── engine/
│   │   │   ├── PhysicsEngine.ts    — ONE global MuJoCo wrapper (model/data/step/contacts)
│   │   │   ├── WorldEngine.ts      — ONE render loop, ONE scene, ONE camera manager
│   │   │   ├── HumanoidPhysicsBinder.ts — PER-AGENT facade: load glb, activate BodyManager, motor targets, sync visuals
│   │   │   ├── BodyManager.ts      — PER-AGENT name→ID maps (body/geom/actuator) with prefix
│   │   │   ├── MotorController.ts  — PER-AGENT writes ctrl[ownActuatorIds] ONLY
│   │   │   ├── MJCFHumanoidTemplate.ts — per-agent MJCF subtree generator (prefix) + combined multi-agent MJCF
│   │   │   ├── StateRehydrator.ts  — per-agent capture/restore of qpos/qvel/ctrl across world reloads
│   │   │   ├── ObservationBuilder.ts, AvatarSynchronizer.ts, CameraManager.ts
│   │   ├── contexts/CoordinatorContext.tsx — WebSocket to coordinator; IGNORES data.agentId
│   │   └── hooks/useWorld.ts       — OWNS the world lifecycle: spawnAgent(), per-agent loops map, per-frame updates
│   └── components/
│       ├── godmode/ConnectionPanel.tsx, DirectivePanel.tsx — send hardcoded agentId 'agent_a'
│       ├── agent/InjectionInput.tsx — sends hardcoded agentId 'agent_a'
│       └── world/WorldViewport.tsx — sends world_state with hardcoded 'agent_a'
├── coordinator/                     — optional legacy server (single-provider global config, all-loops-stop-on-disconnect)
├── public/models/x-bot.glb         — the (one) humanoid model each agent loads
└── v2update/                       — future plans: Phase 7 headless multi-agent core (server-side world), Phase 8 auth/registry
```

---

## 3. Key Abstractions

### HumanoidPhysicsBinder  (`src/world/engine/HumanoidPhysicsBinder.ts`)
- **Responsibility**: Per-agent facade that loads the GLB, builds the MJCF via `BodyManager.activate()`, owns `MotorController`, applies motor targets, syncs MuJoCo state back to the Three.js skeleton every frame.
- **Agent scoping**: `constructor(physicsEngine, scene, agentId)` → `prefix = agentId + '_'`. Everything downstream is prefixed.
- **Isolation-critical methods**: `setMotorTargets(targets)` writes into its own `currentTargets` map; `updateMotorTargets()` → `MotorController.setTargets()` (own actuators only) + `applyCapsuleBalance(capsuleBodyId)` (own capsule).
- **Known gap for multi-agent**: `syncVisuals()` → `applyKinematicGroundReactionForces()` is per-agent and uses per-agent geom IDs. Fine.

### BodyManager  (`src/world/engine/BodyManager.ts`)
- **Responsibility**: Holds `bodyMap`/`geomMap`/`actuatorMap` keyed by bone name → MuJoCo IDs, all resolved with `prefix`.
- **Proves isolation**: `remapIdsAgainstLoadedWorld()` re-resolves every name with prefix after a combined-world reload.
- **Why it matters**: `getBoneColliderHandle('mixamorigleftfoot')` returns a **different geom ID per agent** because the names differ (`agent_0_...` vs `agent_1_...`).

### MotorController  (`src/world/engine/MotorController.ts`)
- **Responsibility**: Writes position-servo `ctrl` values only for actuators in its own map.
- **Explicit isolation**: `init()` collects `ourActuators` = only actuator IDs in this agent's map; `setTargets()` **zeros only its own ctrl slots first**, then writes own targets; `setLimpMode()`/`applyGainsToModel()` only touch own actuator IDs. Comments literally say "Reset ONLY our own agent's controls to 0 by default to prevent overwriting other agents."

### PhysicsEngine  (`src/world/engine/PhysicsEngine.ts`)
- **Responsibility**: The single MuJoCo WASM world: `loadMJCFModel(xml)` (destroys & reloads the whole world), `step()`, contact-force registry (keyed by **geom ID**, so per-agent by construction).
- **Global mutable state**: one model/data; `setMutating(true)` + `setReady(false)` pauses the ENTIRE world during spawn/rebuild.

### AgentLoop (client)  (`src/world/agent/AgentLoop.ts`)
- **Responsibility**: Per-agent cognitive cycle at its own interval: capture world state → build payload → stream inference → dispatch `synthia:action` with `agentId` → write memory with `agentId`.
- **Isolation**: own `InferenceClient`, own `MemoryManager`, own `payloadBuilder`, own `pendingCycles` map. Reads `store.agents[agentId]` for injections. **This is already a fully independent thinking/processing stream per agent.**

### InferenceClient  (`src/world/agent/InferenceClient.ts`)
- **Responsibility**: Builds system prompts and streams SSE. Per-loop instance — so concurrent streams don't interleave.
- **Gap**: configured from the **global** connectionStore values; no per-agent key.

### MemoryManager  (`src/world/agent/memoryManager.ts`)
- **Responsibility**: Writes/reads Supabase rows `memories`/`sessions`/`skills`, always `.eq('agent_id', agentId)` — **logical per-agent isolation exists** even with a shared Supabase project.
- **Gap**: constructed with the **global** supabaseUrl/key from connectionStore; no per-agent DB config.

### agentStore  (`src/store/agentStore.ts`)
- **Responsibility**: `agents: Record<agentId, SingleAgentState>` plus `setXForAgent(id, …)` actions, and **flat mirrored fields** that always reflect the *active* agent for backward-compatible UI.
- **Gap**: many legacy UI components read the flat fields only → they show the active agent and can't show per-agent state simultaneously (UI limitation, not motor interference).

### useWorld (hook)  (`src/world/hooks/useWorld.ts`)
- **Responsibility**: Owns the world: `humanoidPhysicsBindersRef` (Map<agentId, binder>), `activeAgentLoopsRef` (Map<agentId, AgentLoop>), `spawnAgent()` (world rebuild + agent loop start), per-frame onFrame loop that updates every binder's motors then syncs visuals.
- **Isolation-correct parts**: per-frame it calls `binder.updateMotorTargets()` + `binder.syncVisuals()` for **every** binder; applies `synthia:action` only to the binder whose `agentId` matches the event; resets out-of-bounds agents to their own spawn offsets; only **new** agents get `resetToBindPose` on spawn (old agents' `currentTargets` are preserved).
- **Critical gap — shared vision frame**: `captureWorldStateForAgent(agentId)` uses `worldEngine.getLastAIFrame()` — the single frame captured by `CameraManager.captureAIFrame()` from the `aiPerceptionCamera`, which is positioned by the **active** agent's head only. **Every agent therefore receives the active agent's first-person view.**

### MJCFHumanoidTemplate  (`src/world/engine/MJCFHumanoidTemplate.ts`)
- **Responsibility**: Generates a per-agent MJCF subtree (all names prefixed) and `generateCombinedMultiAgentMJCF(agents[])` for N agents in one world, plus env slots and the 88-key piano.
- **Proves uniqueness**: every `<body name="agent_N_...">`, `<joint name="agent_N_...">`, `<geom name="agent_N_..._geom">`, `act_agent_N_...` is unique per agent → MuJoCo assigns distinct IDs.

### StateRehydrator  (`src/world/engine/StateRehydrator.ts`)
- **Responsibility**: Captures per-agent root pose/vel, joint angles/vels, and **ctrl values** keyed by actuator name before a world reload; restores them after. Names are prefix-matched so each agent gets back exactly its own state.
- **Why it exists**: `spawnAgent()` rebuilds the whole world (destroy/reload MJCF). Without this, every new spawn would zero out all other agents' servo targets.

---

## 4. Data Flow: Spawning Agent N

1. **UI**: `App.tsx` "+ Spawn Agent" → `window.synthia.spawnAgent()` → `useWorld.spawnAgent()`.
2. `spawnAgent()`: computes `agentId = \`agent_${humanoidPhysicsBindersRef.current.size}\`` (so agent_1, agent_2…), spawn X offset by index (0, ±1.75, ±3.5…).
3. Creates a new `HumanoidPhysicsBinder(physicsEngine, scene, agentId)`; loads `x-bot.glb`, calls `ensureCapsuleGeometry()`, `repositionModel(spawnX,0,0)`; registers in `humanoidPhysicsBindersRef`.
4. **Full world rebuild**: `physicsEngine.setMutating(true)`; `StateRehydrator.capture(engine, existingAgentIds, objects)`; `generateCombinedMCF()` → `physicsEngine.loadMJCFModel(combinedXml)`; `setReady(true)`.
5. For **every** binder: `bm.remapIdsAgainstLoadedWorld(...)` + `initMotorController()`. New agent gets full pose reset + `setMode`; old agents only re-activate multi-body PD (their targets/ramp/ctrl are **not** touched).
6. `StateRehydrator.restore(...)` puts everyone's qpos/qvel/ctrl back.
7. `addAgent(agentId)` to agentStore; `startAgentClientLoop(agentId)` — a fresh `AgentLoop` with its own interval starts thinking.

**Action flow (client path)**: AgentLoop.cycle → inference stream → `parseAndValidateAction` → `window.dispatchEvent(new CustomEvent('synthia:action', { detail: { ..., agentId } }))` → `useWorld` `handleAction` looks up binder by `agentId` → `validateAndApplyTimeline` → `setMotorTargets` → per-frame `updateMotorTargets()` writes only own ctrl.

**Isolation is proven by test**: `src/world/engine/__tests__/multiAgentComposition.test.ts` asserts `spineId0 ≠ spineId1`, `capId0 ≠ capId1`, combined MJCF contains both `agent_0_root_capsule` and `agent_1_root_capsule`, and 5 physics steps with both MotorControllers active stay stable.

---

## 5. Non-Obvious Behaviors, Gaps & Risks

### Already isolated (confirmed)
- **Joint definitions** — unique per agent via name prefix → unique MuJoCo IDs → no motor cross-wiring. ✔
- **Motor ctrl writes** — MotorController touches only its own `actuatorIds`. ✔
- **qpos/qvel/ctrl restore** — StateRehydrator per-agent. ✔
- **Thought/memory payloads** — per-loop instances; memory rows keyed by `agent_id`. ✔
- **Per-agent status/thoughts in the store** — `agents[agentId]` records. ✔
- **Action application** — `synthia:action` dispatches to the matching binder only. ✔

### NOT isolated / missing (the real work)

| Gap | Where | Impact |
|---|---|---|
| **Per-agent API key & provider** | `connectionStore` is a single global `{provider, apiKey, model, endpoint}`; `useWorld` pushes the same config into every loop; server `set_provider` is global too | All agents share one provider/one key. Required change: per-agent runtime config record. |
| **Per-agent vision frame** | `captureWorldStateForAgent` uses the single `lastAIFrame` from the active agent's head camera | Agent 1 sees Agent 0's view — perception is not agent-specific. |
| **UI panels hardcode `agent_a`** | `InjectionInput`, `DirectivePanel`, `ConnectionPanel`, `WorldViewport` | Injections/goals/providers never reach client-side agent loops; server-side loop `agent_a` does double-duty. |
| **CoordinatorContext ignores `data.agentId`** | `thought_token`, `thought_complete`, `memory_saved`, `skill_mastered`, `heartbeat_sync` all write to flat active-agent fields | Multi-agent server-side streams would all render onto the active agent. |
| **Server kills all agents on disconnect** | `server.ts` socket `close` handler | One client disconnect stops every server-side loop. |
| **World rebuild per spawn** | `spawnAgent()` destroys/reloads the entire MuJoCo model for every new agent | O(N) rebuild per spawn; whole world physics pauses mid-spawn; 10+ spawns = 10 full rebuilds. Risk of drift despite rehydrator. |
| **Global coordinator provider/supabase** | `server.ts` `storedProviderConfig`, `set_supabase` apply to all agents | No per-agent storage config on the server. |
| **No pre-allocated agent slots** | env slots exist for objects/piano only | To make 10+ spawns smooth, pre-allocate N agent bodies in the initial MJCF and activate binders by remap, skipping the rebuild. |

### What would surprise a dev joining
1. **Two inference systems run simultaneously** — `WorldViewport` keeps streaming `world_state → agent_a` to the coordinator even though per-agent client loops exist. You can have 2 loops for agent_0 plus N client loops.
2. **Spawn = world reload.** Pressing "+ Spawn Agent" destroys and recreates the *entire MuJoCo model* — not an incremental add. This is why StateRehydrator and the `agent_` prefix system exist.
3. **The `prefix` is the entire isolation story.** There is no per-agent physics world; there is one world with namespaced names. If anyone ever writes a raw name without `prefix` (e.g., `mj_name2id(model, mjOBJ_BODY, 'mixamorigspine')` without prefix), it silently returns the first agent's body.
4. **Flat mirrored fields** in agentStore look like single-agent state; any new component should use `agents[agentId]` + `*ForAgent` actions.
5. **Agents are spaced ±1.75m apart** at spawn (0, ±1.75, ±3.5…); bound-resets re-derive the same offsets from the agentId index — so agents can collide if they wander (intended for V2).

---

## 6. Required Changes to Achieve "10+ Independent Agents"

**Verdict: achievable.** The physics and per-agent drive loops already support it. The changes are:

### A. Per-agent inference configuration (API key / provider / model / cycle)
- Add a per-agent runtime config record (e.g., extend `agentStore` or new `agentRuntimeStore`): `Record<agentId, { provider, endpoint, apiKey, model, cycleMs, supabaseUrl, supabaseKey }>`.
- `useWorld`'s connection-sync effect should stop pushing the global config into every loop; instead each loop reads its own config. Keep global as the default for newly spawned agents.
- `AgentLoop.setProvider`/`updateSupabase` already accept per-instance values — no loop changes needed beyond wiring.
- Optionally persist per-agent keys in `sessionStorage` keyed by agentId (never zustand persist — same pattern as ConnectionPanel).

### B. Per-agent vision
- In `captureWorldStateForAgent(agentId)`, before grabbing the frame, temporarily position the `aiPerceptionCamera` to *that* binder's `getHeadTransform()` (or create/own a per-agent `WebGLRenderTarget` and camera in `CameraManager`), render the scene 448×448, read pixels, then restore. This makes each agent's perception genuinely first-person.
- Alternative if perf matters: render one shared frame but stamp `agentId` + agent position into the payload so prompts can disambiguate — poor fix; prefer per-agent render.

### C. Kill the hardcoded `agent_a`
- `InjectionInput`, `DirectivePanel`, `ConnectionPanel` should target `useAgentStore.getState().activeAgentId` (client loops read `pendingInjection` from `store.agents[agentId]`, so client-path injection = `setPendingInjectionForAgent(activeAgentId, text)`).
- `WorldViewport` should either stop sending duplicate `agent_a` world_state when client loops are active, or send the active agent's id and let the server maintain a per-agent loop for that id.

### D. CoordinatorContext per-agent routing
- Every message handler should read `data.agentId` and call the `*ForAgent` store actions; only fall back to the flat mirror when `agentId === activeAgentId`. This makes the server path genuinely multi-agent too.

### E. Server-side fixes (if server path is retained)
- `set_provider`/`set_supabase`/`set_cycle_ms` must become per-agent (they already accept `data.agentId` — the server applies them globally with `.forEach`; change to target the agent map entry).
- Disconnect handler: stop only loops for the disconnected client's agents (or keep server loops alive via a per-socket agent association).

### F. Scaling: pre-allocated agent slots (the big one for 10+)
- Generate the initial combined MJCF with **N pre-spawned agent bodies** (e.g., 12 slots, `agent_0_...` through `agent_11_...`), each at its spawn offset, exactly like `env_slot_0..19` today.
- Spawning a new agent then = remap IDs on an already-loaded body (`BodyManager.remapIdsAgainstLoadedWorld`) + instantiate binder + start its AgentLoop — **no world reload**. Add/remove by enabling/disabling agent body subtrees.
- This removes the per-spawn O(N) rebuild and the physics pause, making 10+ spawns smooth and eliminating the rehydrator fragility (keep StateRehydrator as a safety net).

### G. Per-agent storage isolation (optional strictness)
- Logical isolation via `agent_id` already exists. If "separate storage functions" means separate Supabase projects per agent, the per-agent runtime config in (A) feeds each `MemoryManager` its own url/key — no structural change needed beyond wiring.

### H. UI: per-agent right panel
- Right panel tabs (`ThoughtBank`, `AgentStatus`, `MemoryViewer`) read flat mirrored fields. To show the *selected* agent's stream, switch components to `agents[activeAgentId]`. Purely presentational; no motor impact.

---

## 7. Module Reference

| File | Purpose |
|---|---|
| `src/world/hooks/useWorld.ts` | World lifecycle owner: spawnAgent (world rebuild + loop start), per-frame motor/visual updates per binder, event handlers |
| `src/world/engine/PhysicsEngine.ts` | Single MuJoCo world wrapper (model/data/step/contacts); global mutate/ready locks |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Per-agent facade: GLB load, motor targets, capsule control, visual sync, GRF |
| `src/world/engine/BodyManager.ts` | Per-agent name→ID maps, all prefixed; remap after combined-world load |
| `src/world/engine/MotorController.ts` | Per-agent ctrl writes (own actuator IDs only), balance torque, limp/rigid |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Per-agent prefixed MJCF subtree + combined N-agent MJCF + env slots + piano |
| `src/world/engine/StateRehydrator.ts` | Per-agent capture/restore of qpos/qvel/ctrl across world reloads |
| `src/world/agent/AgentLoop.ts` | Per-agent client-side cognitive loop (interval, inference, memory, action dispatch) |
| `src/world/agent/InferenceClient.ts` | Per-loop HTTP/SSE streaming client; builds Gemini/OpenAI prompts |
| `src/world/agent/payloadBuilder.ts` | Per-loop payload assembly (memories, perception summary, tactile context) |
| `src/world/agent/memoryManager.ts` | Per-loop Supabase client; memory rows keyed by agent_id |
| `src/store/agentStore.ts` | Per-agent state records + per-agent actions + flat mirror of active agent |
| `src/store/connectionStore.ts` | **Global** provider/key/model/endpoint/cycle/supabase (the per-agent gap) |
| `src/world/contexts/CoordinatorContext.tsx` | Coordinator WS client; ignores data.agentId (gap) |
| `src/components/world/WorldViewport.tsx` | Viewport + sends world_state with hardcoded 'agent_a' (gap) |
| `src/components/agent/InjectionInput.tsx` | Injection UI, hardcoded 'agent_a' (gap) |
| `src/components/godmode/ConnectionPanel.tsx` | Provider/key/endpoint UI, sends 'agent_a' (gap) |
| `src/components/godmode/DirectivePanel.tsx` | Directive UI, sends 'agent_a' (gap) |
| `src/App.tsx` | Spawn button, active-agent selector dropdown, camera modes |
| `coordinator/src/server.ts` | Legacy WS server; global provider config; kills all loops on disconnect |
| `coordinator/src/agentLoop.ts` | Legacy server-side per-agent loop (works if front-end sent real ids) |
| `src/world/engine/__tests__/multiAgentComposition.test.ts` | **Proof** that per-agent ID isolation works in a combined world |

---

## 8. Suggested Reading Order

1. `src/world/engine/__tests__/multiAgentComposition.test.ts` — see the isolation guarantee first (spineId0 ≠ spineId1).
2. `src/world/engine/MJCFHumanoidTemplate.ts` — understand the `prefix` mechanism that makes every agent's joints unique.
3. `src/world/engine/MotorController.ts` — see "Reset ONLY our own agent's controls" — the heart of no cross-talk.
4. `src/world/hooks/useWorld.ts` — the orchestrator: how agents spawn, how the world rebuilds, how actions route per agent, and where the shared-frame bug lives.
5. `src/world/agent/AgentLoop.ts` — the per-agent cognitive loop and its isolation boundaries.
6. `src/store/agentStore.ts` — per-agent state vs flat mirror; explains why UI components look "single-agent".
7. `src/world/contexts/CoordinatorContext.tsx` + `src/components/world/WorldViewport.tsx` — the legacy single-agent server path that needs routing fixes.
