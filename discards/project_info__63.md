# Coordinator → `src/` Refactoring: Feasibility Analysis & Impact Assessment

## Summary

The SYNTHIA project is a **split architecture**: a Vite+React frontend (`src/`) renders a 3D physics simulation (Three.js + MuJoCo), while a standalone Fastify WebSocket server (`coordinator/`) acts as the AI inference coordinator — receiving world states, calling LLM APIs, parsing actions, and persisting memories to Supabase. The two communicate solely over a single WebSocket on port 3001. They have **separate** `package.json` files, **separate** `node_modules` directories, **separate** `tsconfig.json` configurations, and **duplicated** type definitions in four files. This document analyzes the consequences, benefits, and technical feasibility of merging the `coordinator/` codebase into the general `src/` directory.

---

## Current Architecture

### Separation (what exists today)

```
synthiav1.5/
├── coordinator/                  ← Standalone Node.js server (Fastify + WebSocket)
│   ├── package.json              ← npm name: "synthia-coordinator" v1.0.0
│   ├── tsconfig.json             ← ES2022, NodeNext moduleResolution, outDir: ./dist
│   ├── jest.config.js             ← ts-jest with ESM
│   ├── node_modules/              ← ~500MB of server-side deps
│   ├── models/                    ← Xenova/all-MiniLM-L6-v2 (~80MB on-disk model)
│   ├── programs/primitives/       ← stand_upright.json motor program
│   └── src/
│       ├── server.ts              ← Fastify server on port 3001, WebSocket handler
│       ├── agentLoop.ts           ← Per-agent cycle: build payload → infer → parse action → write memory
│       ├── payloadBuilder.ts      ← Assembles InferPayload from world state + memories
│       ├── inferenceClient.ts     ← Router that delegates to provider adapters
│       ├── memoryManager.ts       ← Supabase read/write with vector similarity search
│       ├── embeddingEngine.ts     ← Local all-MiniLM-L6-v2 embeddings via @xenova/transformers
│       ├── injectionQueue.ts      ← FIFO queue for user-injected thoughts
│       ├── motorProgramStore.ts   ← Supabase read/write for motor programs + primitives loader
│       ├── datasetExporter.ts     ← LeRobot/JSONL/CSV/Frames/Thoughts/Session export engine
│       ├── reconnectionManager.ts ← Exponential backoff reconnection logic
│       ├── supabasePing.ts        ← 3-day keepalive ping for free-tier Supabase
│       ├── providers/             ← LLM provider adapters
│       │   ├── kaggleProvider.ts, geminiProvider.ts, openaiCompatProvider.ts
│       │   ├── providerFactory.ts, types.ts
│       ├── types/                 ← DUPLICATED with frontend
│       │   ├── agent.ts, payload.ts, world.ts, export.ts
│       └── tests/
│           └── coordinator.test.ts
│
├── src/                           ← Vite + React frontend (Three.js, MuJoCo, Zustand)
│   ├── main.tsx                   ← React DOM entry point
│   ├── App.tsx                    ← Root component
│   ├── components/                ← UI layer (React components)
│   ├── store/                     ← Zustand stores (worldStore, agentStore, connectionStore, uiStore, logStore)
│   ├── world/
│   │   ├── contexts/
│   │   │   └── CoordinatorContext.tsx  ← WebSocket client connecting to coordinator:3001
│   │   ├── hooks/
│   │   │   └── useWorld.ts            ← WorldEngine init, physics loop, state capture
│   │   ├── engine/                     ← Three.js + MuJoCo engine classes
│   │   └── programs/                   ← Motor program definitions
│   ├── types/                     ← DUPLICATED with coordinator
│   │   ├── agent.ts, payload.ts, world.ts, export.ts
│   ├── constants/                 ← Anatomical limits, body types, physics constants
│   ├── utils/                     ← Logger, toast utilities
│   └── styles/                    ← Tailwind CSS
│
└── package.json                   ← Vite frontend (npm name: "synthia", dev + build scripts)
```

### Communication Protocol

```
Browser (React + Three.js/MuJoCo)
  │
  │  useWorld.ts captures world state every N cycles:
  │   - frame: raw WebP base64 (448×448 offscreen AI camera)
  │   - joints: per-joint qpos/qvel/rotation data
  │   - audio_pcm: base64 PCM audio buffer
  │   - contact_forces, objects, uprightPreset, isGrounded, heartbeat, etc.
  │
  │  CoordinatorContext.tsx sends via WebSocket:
  │    { type: 'world_state', data: { agentId, ...worldState } }
  │
  ▼
Fastify WebSocket Server (port 3001)
  │
  │  agentLoop.ts runs on setInterval (default 2000ms):
  │    1. Dequeue any pending injected thoughts from injectionQueue
  │    2. payloadBuilder.build() assembles InferPayload:
  │       - Adds embeddings from local all-MiniLM-L6-v2
  │       - Fetches relevant memories from Supabase (vector similarity)
  │       - Fetches recent working memories
  │       - Builds tactile context, perception summary, physical feedback
  │    3. inferenceClient.infer() → provider adapter → LLM API
  │    4. Streams thought tokens back to frontend (type: 'thought_token')
  │    5. Parses action JSON (parseAndValidateAction)
  │    6. Sends action to frontend (type: 'action')
  │    7. Waits for outcome from frontend (type: 'outcome')
  │    8. Writes memory with embedding to Supabase
  │    9. Uploads frame to Supabase Storage
  │
  │  Also handles: set_provider, set_supabase, set_directive, set_endpoint,
  │                inject_thought, export_request, fetch_sessions, action_feedback
  │
  ▼
LLM APIs (Kaggle, Gemini, OpenRouter, NVIDIA NIM, Groq, custom)
Supabase (memories, sessions, skills, motor_programs, frame storage)
Local disk (Xenova model, coordinator.log, exports/)
```

---

## What Would Need to Change (Technical Steps)

### 1. Dependency Merge
The coordinator has 12 runtime + 10 dev dependencies that are **not** in the main `package.json`:
- **Runtime**: `@fastify/static`, `@fastify/websocket`, `@supabase/supabase-js`, `@xenova/transformers`, `apache-arrow`, `dotenv`, `fastify`, `ffmpeg-static`, `fluent-ffmpeg`, `jszip`, `node-abort-controller`, `node-fetch`, `uuid`, `zod`
- **Dev**: `@types/fluent-ffmpeg`, `@types/jest` (29.x vs 30.x in main), `@types/uuid`, `@types/ws`, `jest`, `ts-jest`, `ts-node`, `typescript` (5.x vs 6.x in main), `ws`

All coordinator dependencies would need to be added to the root `package.json`. This creates:
- **TypeScript version conflict**: coordinator uses TS 5.x, frontend uses TS 6.x
- **@types/jest conflict**: coordinator uses 29.x, frontend uses 30.x
- **Potential security/vulnerability surface increase** for the frontend build (though coordinator code runs server-side, it would now be in the same codebase)

### 2. Build System Unification
The coordinator currently runs as a **separate process** (`ts-node src/server.ts` or compiled with `tsc` to `dist/server.js`). Merging into `src/` means the coordinator code would need to:

- **Not be bundled by Vite**: Vite is a frontend bundler. Server-side Node.js code with `fs`, `path`, `fastify`, `@xenova/transformers` (native addons), `ffmpeg-static` (binary), etc. cannot be bundled by Vite. It would need to be compiled separately with `tsc` or run with `ts-node`.
- **Have its own tsconfig.json** or use project references: The coordinator needs `module: "NodeNext"` and `moduleResolution: "NodeNext"`, while the frontend uses Vite's ESM resolution. These are fundamentally incompatible compilation targets.
- **Keep a separate build step**: `npm run build` would need to compile both the Vite bundle AND the coordinator TypeScript.

### 3. Type Deduplication (Major Win)
Four type files are currently duplicated with "Kept in sync" comments:
- `coordinator/src/types/payload.ts` ↔ `src/types/payload.ts`
- `coordinator/src/types/agent.ts` ↔ `src/types/agent.ts`
- `coordinator/src/types/world.ts` ↔ `src/types/world.ts`
- `coordinator/src/types/export.ts` ↔ `src/types/export.ts`

If merged, these become single source of truth. However, the frontend types are checked by `tsc --noEmit` with Vite's module system, while the coordinator types use NodeNext. A **shared types package** or a carefully configured path alias would be needed.

### 4. Runtime Architecture Change
Currently, the coordinator runs as a **separate process** (`node dist/server.js` or `ts-node src/server.ts`). If its code moves into `src/`:
- It could still be run as a separate process (compiled separately from the same source tree)
- OR it could be integrated into a **Vite plugin** that starts the Fastify server as a sidecar during `vite dev`
- OR it could run as a **child process** spawned by Vite's dev server

The simplest approach: coordinator code lives at `src/coordinator/` with its own `tsconfig.json` extending the root, compiled separately, run as before. This is the **least risky** approach.

### 5. File Structure After Merge (Recommended Layout)

```
src/
├── coordinator/                    ← Moved from root/coordinator/src/
│   ├── server.ts
│   ├── agentLoop.ts
│   ├── payloadBuilder.ts
│   ├── inferenceClient.ts
│   ├── memoryManager.ts
│   ├── embeddingEngine.ts
│   ├── injectionQueue.ts
│   ├── motorProgramStore.ts
│   ├── datasetExporter.ts
│   ├── reconnectionManager.ts
│   ├── supabasePing.ts
│   ├── providers/
│   │   ├── kaggleProvider.ts, geminiProvider.ts, openaiCompatProvider.ts
│   │   ├── providerFactory.ts, types.ts
│   └── tests/
│       └── coordinator.test.ts
├── shared/                        ← NEW: Deduplicated types
│   ├── types/
│   │   ├── agent.ts               ← Was coordinator/src/types/agent.ts
│   │   ├── payload.ts             ← Was coordinator/src/types/payload.ts
│   │   ├── world.ts               ← Was coordinator/src/types/world.ts
│   │   └── export.ts              ← Was coordinator/src/types/export.ts
├── components/                    ← (unchanged)
├── store/                         ← (unchanged)
├── world/                         ← (unchanged — contains hooks, engine, contexts)
├── App.tsx                        ← (unchanged)
└── main.tsx                       ← (unchanged)
```

Coordinator config files move to root: `tsconfig.coordinator.json`, and the coordinator test config merges with root `jest.config.js` (or gets its own `jest.coordinator.config.js`).

---

## Benefits (Why Do This)

### 1. **Type Safety & Single Source of Truth (★★★★★ — Major Win)**
The four duplicated type files are the single biggest source of potential bugs in this codebase. Manual sync comments ("update both if schema changes") are a known anti-pattern. Multiple prior issues have arisen from desyncs between the two `InferPayload` interfaces (e.g., `contact_forces` was only in the coordinator version for some time). Merging eliminates this class of bugs permanently.

### 2. **Simplified Developer Workflow (★★★★)**
- One `package.json` to install (`npm install` instead of `npm install && cd coordinator && npm install`)
- One TypeScript project to understand (or project references, but a single mental model)
- Changes that affect both sides (e.g., adding a new WebSocket message type) require editing files in one directory tree, not two
- No switching between two separate `node_modules` contexts

### 3. **Shared Utilities & Constants (★★★)**
- Logger utility: coordinator wraps `console.log` manually; could share the `src/utils/logger.ts`
- Constants like `SKILL_RUNGS` are duplicated in `src/constants/progressionLadder.ts` and referenced only from the frontend; the coordinator has no access to them
- Anatomical joint limits in `src/constants/anatomicalLimits.ts` could inform server-side validation

### 4. **Easier Testing & CI (★★★)**
- One test runner configuration
- One lint configuration
- One CI pipeline for the entire project
- Can run integration tests that span frontend ↔ coordinator without complex orchestration

### 5. **Code Discoverability (★★)**
New developers won't need to discover that there's a hidden `coordinator/` directory that runs a critical server component. The `npm run coordinator` script is easy to miss.

---

## Consequences & Risks (Why You Might NOT Want To)

### 1. **Dependency Bloat for Frontend (★★★ — Risk)**
The frontend `package.json` would gain ~20 dependencies, ~15 of which are **server-only** (fastify, supabase, transformers, ffmpeg, fluent-ffmpeg, etc.). While `npm install` would download them, Vite's tree-shaking won't include them in the browser bundle. However:
- `npm install` time increases significantly (~500MB of coordinator node_modules)
- Security audit surface expands (more packages to scan, more CVEs to monitor)
- `@xenova/transformers` includes native addons (`onnxruntime-node`) that may cause platform-specific install failures

### 2. **Build Complexity (★★★ — Risk)**
- Vite cannot bundle Node.js server code. The coordinator must be compiled separately with `tsc` or run with `ts-node`.
- Two TypeScript configurations needed (or project references): one for the browser (Vite, ESM, React JSX) and one for the server (NodeNext, CommonJS-adjacent).
- The `npm run build` script becomes a multi-step process: `tsc -p tsconfig.coordinator.json && vite build`
- This introduces complexity that the current two-directory separation actually simplifies — each has its own clean build pipeline.

### 3. **Runtime Separation Was Intentional (★★★ — Risk)**
The coordinator runs on **port 3001** as a standalone process. This wasn't an accident — it enables:
- Independent scaling: coordinator can run on a different machine (e.g., a GPU server for inference)
- Independent restart: coordinator can crash/restart without affecting the frontend dev server
- Independent monitoring: separate logs, separate health checks
- Zero browser impact: heavy coordinator operations (FFmpeg video export, Supabase bulk queries, embedding computation) never block the Vite dev server

Merging the source code **does not require merging the runtime**. But moving the code into `src/` might create a false impression that they're part of the same runtime, leading to architectural mistakes (e.g., someone trying to `import` Fastify from a React component).

### 4. **TypeScript Version Conflict (★★ — Risk)**
- Coordinator: TypeScript 5.x (`"typescript": "^5.6.2"`)
- Frontend: TypeScript 6.x (`"typescript": "~6.0.2"`)

TypeScript 6 introduced breaking changes. The coordinator code has not been tested against TS 6. Downgrading the frontend or upgrading the coordinator both carry risk.

### 5. **Test Configuration Divergence (★★)**
- Coordinator uses `jest` with `ts-jest` and ESM (`useESM: true`)
- Frontend has `jest.config.js` at root but uses `@types/jest` v30 (coordinator uses v29)

Merging test configurations requires careful migration of one or the other.

### 6. **`node_modules` in `coordinator/` is ~500MB (★★)**
If merged, this weight shifts to the root `node_modules`. This is not a runtime problem but makes `rm -rf node_modules && npm install` slower and heavier.

---

## Feasibility Assessment

### ✅ **Technically Feasible: YES**
The code can be moved and made to work. The architecture does not prevent it.

### ⚠️ **Effort: MODERATE (2–4 days of careful work)**

The work breaks down as:

| Task | Effort | Risk |
|------|--------|------|
| Move coordinator source files to `src/coordinator/` | 1 hour | Low |
| Deduplicate shared types to `src/shared/types/` | 2 hours | Low |
| Update import paths in all coordinator files | 2 hours | Low |
| Create `tsconfig.coordinator.json` at root | 1 hour | Medium |
| Merge dependencies into root `package.json` | 1 hour | Medium |
| Resolve TypeScript version conflict (test coordinator on TS 6) | 4 hours | High |
| Update root jest config (or create `jest.coordinator.config.js`) | 2 hours | Low |
| Update npm scripts (`dev`, `build`, `test`) | 1 hour | Low |
| Update `CoordinatorContext.tsx` import paths | 30 min | Low |
| Test end-to-end (frontend ↔ coordinator ↔ LLM) | 4 hours | High |
| Update `models/` path (embedding models) | 30 min | Low |
| Update `programs/primitives/` path (motor programs) | 30 min | Low |
| Clean up old `coordinator/` directory | 30 min | Low |

### 🟡 **Recommended Approach: Phased Migration**

**Phase 1 — Type Unification First (Safest, Highest ROI)**
Don't move the coordinator code yet. Instead:
1. Extract the four shared type files to a shared location (e.g., `shared/types/` at the project root)
2. Have both `src/` and `coordinator/src/` import from `shared/types/`
3. This eliminates the type duplication problem with **zero runtime risk**
4. Test that both sides compile and the app works

**Phase 2 — Dependency Audit**
1. Audit all coordinator dependencies — determine which are truly needed
2. Check if `@xenova/transformers` (80MB model) can be optional or lazy-loaded
3. Test coordinator code against TypeScript 6

**Phase 3 — Source Code Move**
1. Move coordinator source files into `src/coordinator/`
2. Merge `package.json` dependencies
3. Update build scripts
4. Comprehensive end-to-end testing

---

## Type Desync Risks (What Exists Today)

The following actual differences between the duplicated type files represent **existing bugs**:

| Field | `coordinator/src/types/payload.ts` | `src/types/payload.ts` | Impact |
|-------|-----------------------------------|------------------------|--------|
| `InferPayload.contact_forces` | Present (`contact_forces?: Record<string, any>`) | **Missing** | Frontend sends contact_forces but its type definition doesn't declare it — will not cause a TS error if frontend code misuses it |
| `Memory.sessionId` | **Missing** | Present (`sessionId?: string`) | Coordinator `MemoryEntry` interface (in memoryManager.ts, not types/agent.ts) has `session_id` but frontend `Memory` type has `sessionId` — naming inconsistency |

While these haven't caused runtime failures (because the data flows through JSON serialization), they mean TypeScript is providing **false confidence** — it can't catch mismatches between what the frontend sends and what the coordinator expects.

---

## Recommendation

**Short term (do immediately):** Extract shared types to a common directory. This is low-risk, high-value, and takes ~2 hours. It eliminates the type duplication anti-pattern without changing any runtime behavior.

**Medium term (do after type unification proves stable):** Move the coordinator source code into `src/coordinator/`. Keep the runtime separate (still port 3001, still a separate process). The benefit is primarily organizational — single codebase, single `package.json`, single mental model.

**Do NOT merge runtimes.** The coordinator should remain a separate Node.js process from the Vite dev server. The current separation of concerns (frontend serves UI + physics, coordinator handles AI inference) is architecturally sound. Merging the source directories is about **code organization**, not runtime architecture.

**If you skip this entirely:** The system works today. The duplicated types are a maintenance annoyance but not a critical bug. The `npm run coordinator` script works. A developer joining the project can understand the split architecture. The current separation is functional, just not elegant.
