# Vercel/Serverless Deployment Analysis — Critical Architectural Findings

## The Real Requirement: No Port 3001, Serverless Hosting

The user's goal is not just file reorganization — it's complete removal of the long-running coordinator server so the entire application can deploy to **Vercel** (serverless). This changes the analysis from "should I move files?" to "is this even architecturally possible?"

## Short Answer

**The coordinator as currently designed cannot run on Vercel.** It uses four patterns that are fundamentally incompatible with serverless platforms:

| Pattern | Where | Serverless Problem |
|---------|-------|--------------------|
| `setInterval` loop | `agentLoop.ts` line ~150: `setInterval(() => this.cycle(), this.config.cycleMs)` | Serverless functions have no persistent process — they execute once and terminate. No interval loops possible. |
| WebSocket server | `server.ts`: Fastify listening on port 3001 | Vercel handles HTTP routing. You cannot bind to a port. WebSocket connections are duration-limited (typically dropped after function timeout). |
| In-memory state | `server.ts`: `const agents = new Map<string, AgentLoop>()`, `storedProviderConfig`, `storedCycleMs` | Serverless functions are stateless. Each invocation gets a clean slate. State must be externalized (database, Redis, etc.). |
| Local model loading | `embeddingEngine.ts`: `@xenova/transformers` loads an 80MB model from disk | Cold start time to load a model from disk + memory limits (Vercel caps at 1024MB but 80MB model + runtime is heavy). Model must be stored in a CDN or external service. |
| Background keepalive | `supabasePing.ts`: `setInterval(ping, 259200000)` (3-day interval) | Serverless functions are ephemeral — no background processes. |
| Filesystem writes | `datasetExporter.ts`: writes to `./exports/`, uses FFmpeg for video stitching | Vercel filesystem is read-only except `/tmp` which is ephemeral and per-invocation. FFmpeg binary may not be available. |
| WebSocket reconnection | `reconnectionManager.ts`: exponential backoff with retry timers | No persistent connection to manage. Each HTTP request is independent. |

## What CAN Run on Vercel

Vercel supports:

1. **Edge Functions** (fast, global, limited runtime APIs — no Node.js `fs`, `child_process`, native addons)
2. **Serverless Functions** (Node.js runtime, 10s default / 60s max with Pro, 1024MB memory)
3. **Edge Middleware** (runs before requests)

For SYNTHIA, **Serverless Functions** would be needed (because the coordinator uses Node.js native features like `fs` for the model cache, `child_process` for FFmpeg).

## What a Vercel-Compatible Architecture Looks Like

### Option A: API Routes (Most Pragmatic)

The coordinator becomes a set of Vercel API routes (`api/` directory). Each route handles one responsibility:

```
/api/
├── infer.ts           ← POST handler: receives world state, calls LLM, returns action
├── export.ts          ← POST handler: triggers export job, returns download URL
├── sessions.ts        ← GET handler: fetches session list from Supabase
└── memory.ts          ← POST handler: writes memory (called by infer.ts, not directly by frontend)
```

**How the agent loop changes:**

Currently:
1. Frontend sends `world_state` → WebSocket
2. Coordinator grabs latest state from in-memory Map
3. `setInterval` fires `agentLoop.cycle()` independently
4. Results streamed back via WebSocket

After (Vercel):
1. Frontend (`useWorld.ts`) captures world state
2. Frontend makes `POST /api/infer` with the world state as JSON body
3. Vercel function:
   a. Receives the world state in the request
   b. Builds payload (same PayloadBuilder logic)
   c. Calls LLM API (streaming supported via Vercel — responses can use ReadableStream)
   d. Returns response: `{ actions, thought, memory_write, ... }`
   e. Writes memory to Supabase
4. Frontend receives the response and applies actions

**Key insight:** The agent's "loop" moves to the frontend. Instead of the coordinator polling, the frontend decides when to call inference. `useWorld.ts` already has a game loop at 60fps — it can decide when to trigger inference (every N frames, or when enough new state is available).

### Option B: Vercel + External Worker (Keep Separation)

If Option A is too disruptive:
- Vercel hosts the static frontend (Vite build output)
- The coordinator runs on a separate always-on service (Railway, Fly.io, a $5 VPS) as a single `node dist/server.js` process
- Frontend connects to the coordinator via WebSocket at the worker's URL

This is simplest but doesn't eliminate the port 3001 dependency — it just moves it to a different host.

## Detailed Analysis: What Must Change

### 1. The Agent Loop — From Timer-Based to Request-Triggered

**Current (`agentLoop.ts`):**
```
setInterval → cycle() → build payload → infer → parse → send action → wait for outcome → write memory
```

**Vercel-compatible (`api/infer.ts`):**
```
HTTP POST → build payload → infer → return actions + thought → (optionally) write memory
```

The "outcome" step (waiting for the frontend to report what happened) needs rethinking:
- **Synchronous approach:** The function returns the action. The frontend applies it and in the next request, includes the outcome from the previous action.
- **Delayed write:** Memory is written in the *subsequent* inference call, using the outcome from the previous cycle. The very first call has no outcome yet.

**New data flow:**
```
Request N:
  Frontend sends: { worldState, outcome_from_cycle_N-1, reward_from_cycle_N-1 }
  Server returns: { actions, thought }
  Server writes: memory for cycle N-1 (now has outcome)
  Server does NOT write: memory for cycle N (no outcome yet)

Request N+1:
  Frontend sends: { worldState, outcome_from_cycle_N, reward_from_cycle_N }
  Server returns: { actions, thought }
  Server writes: memory for cycle N (now has outcome)
```

This is a clean pattern. There's always one "pending" memory waiting for an outcome, but the system stays stateless — the outcome is carried forward by the client.

### 2. The WebSocket Server → HTTP API Routes

**Current (`server.ts`):** Fastify with WebSocket on port 3001, 12 message types

**Vercel API routes:**

| Current Message | Becomes |
|----------------|---------| 
| `world_state` → `action` | `POST /api/infer` (primary flow) |
| `inject_thought` | Included in `POST /api/infer` body as `pending_injection` |
| `outcome` | Included in `POST /api/infer` body as `prev_outcome` |
| `action_feedback` | Included in `POST /api/infer` body as `physical_feedback` |
| `set_provider` | `POST /api/config` (or stored in Supabase/cookies, fetched on each infer) |
| `set_supabase` | Environment variables only (server-side config, not settable from client) |
| `set_directive` | Included in `POST /api/infer` body as `directive_mode` / `goal` |
| `set_cycle_ms` | Becomes frontend logic (how often `useWorld` calls infer) |
| `export_request` | `POST /api/export` |
| `fetch_sessions` | `GET /api/sessions?agentId=agent_a` |
| `thought_token` (streaming) | `POST /api/infer` returns as SSE stream or ReadableStream |
| `connection_status` / `rehydration_token` | Removed — no persistent connection to track |

### 3. Streaming Response — Critical for UX

**Problem:** The current UX streams thought tokens one-by-one to the frontend, creating a "thinking" animation. If inference takes 5-10 seconds, the user sees tokens arriving gradually. Without streaming, the user waits 10 seconds with no feedback.

**Solution:** Vercel supports streaming responses via the Web Streams API:

```typescript
// api/infer.ts
export async function POST(request: Request) {
  const payload = await request.json();
  
  // Stream the response back
  const stream = new ReadableStream({
    async start(controller) {
      // As tokens arrive from LLM, enqueue them
      const llmResponse = await fetch('https://api.openai.com/...', {
        method: 'POST',
        body: JSON.stringify({ stream: true, ... }),
      });
      
      const reader = llmResponse.body.getReader();
      let thoughtBuffer = '';
      let actionJson = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        // Parse SSE lines, extract tokens
        // ...
        
        // Send thought token to frontend
        controller.enqueue(new TextEncoder().encode(
          JSON.stringify({ type: 'thought_token', token: currentToken }) + '\n'
        ));
      }
      
      // Send final action
      controller.enqueue(new TextEncoder().encode(
        JSON.stringify({ type: 'action', data: { ... } }) + '\n'
      ));
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

The frontend reads this as an SSE stream:

```typescript
// CoordinatorContext.tsx (replaced)
const response = await fetch('/api/infer', {
  method: 'POST',
  body: JSON.stringify(worldState),
  headers: { 'Content-Type': 'application/json' }
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('{')) {
      const msg = JSON.parse(line);
      // Dispatch to same handlers that currently process WebSocket messages
      handleCoordinatorMessage(msg);
    }
  }
}
```

### 4. Configuration & Secrets

**Problem:** Currently, the user sets provider config (API keys, Supabase URL/key) via the WebSocket at runtime. This means API keys travel from the browser to the coordinator. On Vercel, API keys must be server-side environment variables — they cannot travel through the client.

**Solution:**
- **Supabase URL/Key, provider API keys:** Set as Vercel Environment Variables. The `api/infer.ts` function reads them from `process.env`.
- **Provider selection (which LLM to use):** Can be:
  - Stored in Supabase (user settings table)
  - Passed in the request as a non-secret field (type, model — but NOT the API key)
  - Hardcoded in environment
- **Supabase URL/Key:** These are server-only credentials. The frontend's Supabase client uses the anon key for public operations. The service role key (for memory writes) never leaves the server.

**Vercel env vars:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PROVIDER_TYPE=gemini
PROVIDER_ENDPOINT=https://generativelanguage.googleapis.com
PROVIDER_API_KEY=AIza...
PROVIDER_MODEL=gemini-2.0-flash
```

### 5. What Cannot Be on Vercel

| Component | Fate | Alternative |
|-----------|------|-------------|
| `ffmpeg-static` + `fluent-ffmpeg` (video export) | ❌ Cannot run on Vercel | Use a cloud video processing API, or export frames only (WebP zip, no MP4 stitching) |
| `@xenova/transformers` (local embeddings) | ❌ 80MB model + cold start + memory | Use Supabase Edge Function for embeddings, or OpenAI/Gemini embedding API, or remove vector search entirely |
| `DatasetExporter` (filesystem writes, FFmpeg) | ❌ Cannot write to persistent disk | Use Supabase as the export source, generate export on client-side, or use an external worker |
| `supabasePing` (3-day keepalive) | ❌ No persistent process | Use Vercel Cron Jobs (free tier: 1 cron job, can hit `/api/ping` daily) |
| `reconnectionManager` | ❌ No persistent connection | HTTP retry logic at the request level — simpler, no state machine needed |
| File logging (`coordinator.log`) | ❌ No persistent filesystem | Use Vercel Logs or a logging service, or just `console.log` (appears in Vercel dashboard) |

### 6. Timeout Handling

Vercel functions have execution time limits:
- **Hobby plan:** 10 seconds
- **Pro plan:** 60 seconds

LLM inference (especially with streaming) frequently takes 5-30 seconds. The 10-second hobby limit would be a problem; the Pro limit is more workable.

**Mitigation:** The function streams tokens as they arrive, keeping the connection alive. As long as bytes are flowing, Vercel considers the function "active." The key is to start streaming immediately (send a `{"type": "processing"}` or the first thought token right away) rather than buffering the entire response.

## Recommended Architecture for Vercel

```
Frontend (Static HTML/JS/CSS on Vercel)
  │
  │  POST /api/infer  (streams thought tokens + returns action)
  │  POST /api/export (triggers export, returns download URL)
  │  GET  /api/sessions (fetches session list)
  │
  ▼
Vercel Serverless Functions (api/ directory)
  │
  │  - Builds prompt from world state + memories
  │  - Calls cloud LLM API (Gemini, OpenRouter, etc.)
  │  - Streams tokens back to client
  │  - Parses action from LLM response
  │  - Writes memory to Supabase
  │  - Returns action to client
  │
  ▼
External APIs
  - LLM API (Gemini, OpenRouter, NVIDIA NIM, Groq)
  - Supabase (memories, sessions, skills, motor_programs)
  - (Optional) Embedding API for vector search
```

**No more:**
- WebSocket server
- Port 3001
- `setInterval` loop
- In-memory agent state
- Process separation
- `coordinator/` directory

## What This Means for the Refactoring

The refactoring is actually **bigger** than moving files. It's:

1. **Rewrite `agentLoop.ts` as `api/infer.ts`** — from timer-based to HTTP request handler
2. **Rewrite `server.ts` as three API routes** — `api/infer.ts`, `api/export.ts`, `api/sessions.ts`
3. **Move configuration to environment variables** — remove runtime `set_provider`/`set_supabase` WebSocket messages
4. **Move the agent "when to think" decision to the frontend** — `useWorld.ts` decides when to call `/api/infer`
5. **Eliminate**: `reconnectionManager.ts`, `supabasePing.ts`, `embeddingEngine.ts` (or replace with cloud API)
6. **Simplify**: `datasetExporter.ts` (remove FFmpeg, make it a client-side download or use cloud processing)
7. **Delete**: `kaggleProvider.ts`, `set_endpoint` handler, `models/Xenova/`, `coordinator/` directory entirely

## Feasibility Assessment

| Component | Serverless Feasibility | Effort |
|-----------|----------------------|--------|
| Prompt building (PayloadBuilder) | ✅ Trivial — pure logic, no state | None (reuse as-is) |
| LLM inference (InferenceClient + providers) | ✅ HTTP call — core of what serverless is good at | Minor (read env vars instead of stored config) |
| Streaming tokens to frontend | ✅ Vercel supports ReadableStream | Medium (rewrite CoordinatorContext.tsx from WebSocket reader to fetch reader) |
| Memory write (MemoryManager) | ✅ Supabase call | None (reuse as-is) |
| Motor program store | ✅ Supabase call | None (reuse as-is) |
| Dataset export (LeRobot/JSONL/CSV) | 🟡 Possible — write to /tmp, stream download | Medium (remove FFmpeg, stream zip to client) |
| Frames/Video export | ❌ FFmpeg on serverless → remove or replace | High (use client-side or cloud processing) |
| Local embeddings | ❌ 80MB model → use cloud API | Medium (swap @xenova for fetch to embedding API) |
| Supabase keepalive | ✅ Vercel Cron Jobs | Trivial (single cron endpoint) |

## Phase 1: What You Can Do Today (Zero Serverless)

Before tackling Vercel deployment, these cleanup steps are immediately valuable and don't depend on the serverless migration:

1. **Delete `kaggleProvider.ts`** — dead code
2. **Remove `set_endpoint` handler and `kaggleEndpoint`** from server.ts/agentLoop.ts
3. **Extract shared types** to a shared location
4. **Remove `supabasePing.ts`** (you can re-add as a Vercel cron later)

## Phase 2: The Serverless Migration (Core Work)

1. Create `api/` directory at project root (Vercel convention)
2. Write `api/infer.ts` — replaces agentLoop.ts + server.ts WebSocket handling
3. Write `api/export.ts` — replaces export_request handler
4. Write `api/sessions.ts` — replaces fetch_sessions handler
5. Write `api/ping.ts` — Vercel cron endpoint replacing supabasePing
6. Rewrite `CoordinatorContext.tsx` → `useInference.ts` hook — replaces WebSocket with fetch+streaming
7. Move all coordinator logic (PayloadBuilder, MemoryManager, providers, etc.) into `src/coordinator/` (now server-side code that gets imported by API routes)
8. Add `tsx` or `ts-node` for local dev of API routes (`vercel dev` also works)
9. Delete `coordinator/` directory entirely

## Answer to "Will It Work on Vercel?"

**Yes**, with the following caveats:

- ✅ Core inference loop (receive state → call LLM → return action) — fully compatible
- ✅ Thought token streaming — compatible with streaming responses
- ✅ Memory persistence (Supabase) — fully compatible
- 🟡 Dataset export (remove FFmpeg, do client-side or cloud processing)
- 🟡 Local embeddings (swap for cloud API or remove)
- 🟡 Vercel Hobby plan 10s timeout — may need Pro plan for reliable LLM calls
- ❌ Video export from frames (FFmpeg) — needs alternative approach
- ❌ Local inference (Kaggle/Ollama) — was already abandoned

The biggest change is operational: instead of a persistent connection where the server "pushes" thoughts to the client, the client polls/pushes. The frontend becomes the orchestrator of the cycle, which actually simplifies the architecture — the frontend already knows when it needs new actions (it's rendering frames and capturing state), so having it explicitly request inference at the right time is more natural than a blind timer.
