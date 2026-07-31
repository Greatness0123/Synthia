# SYNTHIA 1.5.1 — Feasibility Analysis of `noserverprompt` 7-Phase Refactor + Safe Migration Plan

**Date:** 2026-08-01
**Mode:** Explore (read-only analysis — no code was modified)
**Scope:** Validate the 7 phase documents in `noserverprompt/` against the real codebase, identify why prior multi-agent attempts destabilized the model, produce a safe migration plan, and incorporate the user requirement of **user-selectable Edge TTS voice**.

---

## Summary

SYNTHIA is a browser-based embodied-AI research platform: a Mixamo humanoid (`x-bot.glb`) runs in a browser-hosted **MuJoCo WASM** physics world, while a separate Node.js **coordinator** process (`coordinator/`, port 3001, WebSocket) runs the cognitive loop — senses the world (448×448 WebP frame + joint proprioception + contact forces), calls an LLM provider (Kaggle/Gemini/OpenRouter/Groq/NIM), streams the "thought", parses an action JSON, and sends joint targets back to the browser. Memories persist to Supabase with pgvector embeddings.

The `noserverprompt/` plan wants to (1) delete the coordinator server, replacing it with Vercel serverless proxy routes, (2) move the cognitive loop and a **multi-agent world** entirely into the browser, (3–5) add multi-agent camera/UI/export, (6) add TTS, (7) remove the coordinator + video export and add a client-side Supabase keepalive.

**Verdict: Phases 1, 3, 4, 5, 6, 7 are feasible with moderate rework. Phase 2 (client-side multi-agent) is the single high-risk phase and is almost certainly what destabilized the model in previous attempts.** The codebase is at this moment strictly single-agent in every layer: one `PhysicsEngine`/`MjModel`, one `HumanoidPhysicsBinder`, one `BodyManager`, one `CameraManager` AI frame, one flat `agentStore`, hardcoded `agentId: 'agent_a'` in 6+ places, and a global `window.__SYNTHIA_HUMANOID_BINDER__` that `ObjectManager`'s MJCF-reload path depends on. Nothing in current code implements the "prefixed subtree per agent" pattern the prompts assume exists — it exists only as a v2 paper doc (`v2update/phase-7-headless-multi-agent-core.md`), never implemented.

---

## Current Architecture (what actually exists today)

```
Browser (Vite/React/Three.js/MuJoCo WASM)
├─ useWorld hook (src/world/hooks/useWorld.ts)         — creates ALL engines, 1 humanoid
│   ├─ PhysicsEngine        (@mujoco/mujoco WASM, 1 MjModel/MjData, 500Hz fixed step)
│   ├─ WorldEngine          (Three.js scene + rAF loop, 60fps)
│   ├─ CameraManager        (3 cams: aiPerception=1st, chaseCam=2nd, OrbitControls=3rd)
│   │    └─ captureAIFrame() → 448×448 WebP base64 (ONE frame, ONE head cam)
│   ├─ HumanoidPhysicsBinder(ONE instance; loads x-bot.glb, build steps A→D)
│   │    ├─ BodyManager     (generateHumanoidMJCF → loadMJCFModel → name→id maps)
│   │    ├─ MotorController (position actuators: yaw/pitch/roll per bone)
│   │    ├─ ObservationBuilder / AvatarSynchronizer
│   │    └─ K-GRF, raycast grounding, balance torque
│   └─ ObjectManager        (spawn objects via pre-allocated env_slot_0..19 + piano_body)
│        └─ reloadStateAndRehydrate()  — FULL MJCF reload + state rehydration
│
├─ CoordinatorContext (WebSocket client → ws://localhost:3001/ws)
├─ Zustand stores: worldStore(localStorage), agentStore(flat, single agent),
│                  connectionStore(localStorage), uiStore, logStore
└─ UI: App.tsx, GodModePanel, RightPanel, ExportModal, ModelInputPiP, WorldViewport
        (world_state sent every cycleMs — hardcoded agentId: 'agent_a')

Coordinator (coordinator/ — Node/Fastify/ts-node, port 3001)
├─ server.ts          — WebSocket route /ws, per-agentId AgentLoop map
├─ agentLoop.ts       — 2s cycle: payload→infer→parse action→send→memory write
├─ payloadBuilder.ts  — 22-field InferPayload + perception_summary + tactile_context
├─ providers/         — geminiProvider / openaiCompatProvider / kaggleProvider
│                       (system prompt built HERE via buildContents/buildMessages)
├─ memoryManager.ts   — Supabase CRUD + match_memories pgvector RPC + frame upload
├─ datasetExporter.ts — LeRobot(ffmpeg video stitch)/JSONL/CSV/frames_zip/session_full
└─ supabasePing.ts    — server cron keepalive (3-day interval)
```

**Stack:** TypeScript 6 strict, React 18.3, Three.js 0.184, `@mujoco/mujoco` 3.10 (WASM), Zustand 5, Vite 8, Fastify 4 + `@fastify/websocket`, Supabase JS, Tone.js 15 (piano only — **no TTS anywhere**).

> ⚠️ `exploration.md` in the repo root is **stale** — it documents the old Rapier-era architecture (`RapierJointMotorController`, `HumanoidMultiBodyManager`, `RagdollBuilder`, `StablePhysicsEngine`). Those files no longer exist. Current physics is MuJoCo (`BodyManager`, `MotorController`, `AvatarSynchronizer`). Do not use `exploration.md` as a reference for new work.

---

## Phase-by-Phase Feasibility Verdict

### Phase 1 — Serverless AI Proxy ✅ FEASIBLE (moderate rework)

**What exists to reuse:** The prompt-building intelligence lives in `coordinator/src/payloadBuilder.ts` (context assembly: perception summary, tactile context, gaze context, physical feedback) and inside each provider's `buildContents`/`buildMessages` (`geminiProvider.ts`, `openaiCompatProvider.ts` — the giant SYNTHIA system prompt is there). The streaming "thought → `---ACTION---` → JSON" separator logic is in `agentLoop.ts` and each provider.

**Gaps / risks:**
- A pure "attach key + forward" Vercel route receives nothing from the client today — the client never builds the message payload. To make the proxy thin, `payloadBuilder.build()` + the system-prompt builders + action parsing must be **ported to client TypeScript** (~600 lines of prompt/context logic). This is the real work of Phase 1; it is not "just a route".
- **Vercel Hobby 10s timeout is a hard constraint** for vision LLM calls with 448×448 image + ~4KB memory context + streaming. Gemini/OpenRouter frequently exceed 10s. Realistic options: (a) accept Hobby limits and surface errors, (b) move to Pro/Blob streaming, or (c) keep the Kaggle direct-HTTP path client-side (Kaggle has no secret key — it already works browser-side today via the `kaggle` provider).
- Shared-secret auth: a client-bundle secret is extractable; the prompt already acknowledges this ("enough friction"). Fine.
- CORS is trivial on Vercel routes.
- The `connectionStore` UI (ConnectionPanel with provider dropdown + API key) can stay and simply target the proxy.

**Recommendation:** Do this **last**, not first — the coordinator works today. Freeze feature work, add the Vercel routes alongside, then cut over. Phase 1 becoming "phase 0 of the migration" is a trap: it complicates every later phase's local testing (no more local inference without a deployed proxy).

---

### Phase 2 — Client-Side Multi-Agent ⚠️ HIGH RISK — root cause of previous instability

**What the phase assumes vs. what exists:**

| Assumption in phase doc | Reality in code |
|---|---|
| "Reuse existing single-humanoid MJCF generation per agent, concatenate into one compiled world" | `generateHumanoidMJCF()` (`MJCFHumanoidTemplate.ts`) hardcodes `root_capsule`, `root_freejoint`, `mixamorig*`, `env_slot_0..19`, `piano_body`, `torso_collider`. Every name is global. Composing N humanoids requires **prefixing every body/joint/geom/actuator name** (`agent_0_…`, `agent_1_…`) — a full template refactor, not a concatenation. |
| "One shared MjModel/world with prefixed subtrees" | `PhysicsEngine` supports exactly **one** model/data pair — that part is compatible (1 model, N subtrees). But `BodyManager` maps IDs via `mj_name2id(model, …, 'root_capsule')` and `'root_freejoint'` — hardcoded single names. All lookups must become per-agent. |
| "Port agentLoop/payloadBuilder/action-parsing into client modules" | Straightforward port (they're dependency-light). But the port must also carry `InferenceClient` retry/timeouts and `ReconnectionManager` backoff. |
| "Per-agent memory namespace via agent_id" | Frontend `agentStore` is a **flat single-agent store** (not keyed by agent). Supabase side already has `agent_id` columns and `match_memories(match_agent_id)` — server side is ready; the frontend `agentStore` needs `Record<agentId, AgentState>`. |
| "Spawn offset logic" | `useWorld.findSpawnPosition()` exists but only for **objects**; the humanoid spawns at `worldStore.spawnPoint` via the build effect. No multi-humanoid spawn path exists. |
| "Per-agent action application, no cross-agent bleed" | `useWorld`'s `synthia:action` handler routes to the **single** `humanoidPhysicsBinderRef.current`. The `action` WebSocket message already carries `agentId` (coordinator sends it), but the frontend ignores it. |

**Why previous attempts "made the model unstable by Phase 2":**
1. **`ObjectManager.reloadStateAndRehydrate()`** — the most dangerous function in the codebase. On every custom-model spawn/delete it: captures the entire qpos/qvel, reads `window.__SYNTHIA_HUMANOID_BINDER__` (the single global), rebuilds the full MJCF XML, calls `loadMJCFModel()` (which `delete()`s the old model/data — **destroying all WASM heap views mid-flight**), then rehydrates qpos. Any attempt to add a second humanoid without a complete rewrite of this path corrupts the WASM state → falls/explosions. This is almost certainly where the "unstable by phase 2" breakage came from.
2. **WASM memory aliasing.** `PhysicsEngine.step()` already guards with `isStepping`/`isMutatingWorld`/`isPhysicsBroken` — but `loadMJCFModel` mutating while other systems hold cached `Float64Array` views (`qpos`, `qvel`, `ctrl` getters re-acquire fresh views; but `BodyProxy`, `MotorController.model/data` hold stale references after a reload). Two humanoids ⇒ two `BodyManager`s with separate actuator maps against the *same* re-allocated model ⇒ stale `MjModel` pointers if reload happens between agent A and agent B activation.
3. **`synthia:action` / `action_feedback` channel is global** — one event bus. Phase 2 needs per-agent action routing or agent A's accepted joints can land on agent B (bleed).
4. **`agentStore` flatness** — thoughts/memories/heartbeat/currentGoal are per-session singletons; the UI (ThoughtBank, MemoryViewer, StatusBar) reads the flat store. Multi-agent requires an agents map + selection, which touches every component.

**Verdict:** Feasible in principle (the v2update docs prove the pattern was designed), but it is a **multi-week, must-be-sequenced effort**, not a single phase bolt-on. The prompt's own precondition ("V1 must show a clean stability sign-off before this phase starts" — from `v2update/phase-7`) was violated in prior attempts.

**Safe path if this phase is pursued:**
1. First, extract the rigid naming into a `prefix` parameter in `generateHumanoidMJCF()` with a **regression test** that the single-agent output is byte-identical when prefix = `''`. (There is a Jest setup: `jest.config.js` + `src/world/engine/__tests__`.)
2. Then introduce an **`AgentRegistry` / `HumanoidAgent` class** that owns: one GLTF load (cached), one `BodyManager`-equivalent with prefixed names, one `AgentLoop`-like client loop, one head-transform/AI-frame path. Do **not** wire it into the live scene until the registry can instantiate agent 2 in an isolated debug mode.
3. Keep `ObjectManager`'s reload path single-agent until registry stabilizes; short-circuit custom-model spawning during multi-agent QA.
4. Add per-agent routing to `synthia:action` (the coordinator already includes `agentId` in the message payload — the frontend just needs to use it).

---

### Phase 3 — Camera & Agent Selection ✅ FEASIBLE (mostly exists)

- `CameraManager` already implements all three modes: `aiPerceptionCamera` (first person), `chaseCam` (second person — currently a fixed spectator at `(0,5,-6)` that looks at the capsule), `thirdPersonCamera` + `OrbitControls` (genuinely free orbit/pan/zoom — **this already qualifies as Phase 3's "third person orbital"**).
- Phase 3 task 3 says second-person "trails behind and above the selected agent… not freely orbitable" — the current `chaseCam` is a fixed-offset camera, not a smooth tracker; needs a small follow-lerp against the selected agent's head/capsule transform.
- The gap is **per-agent**: `CameraManager.update(headMatrix, targetPos, capsuleQuat, capsulePos)` receives ONE agent's matrices from the single binder. Multi-agent needs an `activeViewAgentId` plus per-agent head matrices. The PiP (`ModelInputPiP`) already reads `worldStore.lastAIFrameForDisplay` — that becomes per-agent too (per-agent `captureAIFrame` is a 448×448 render + `readRenderTargetPixels` per agent per frame — a real performance cost at 3+ agents; consider throttling per-agent capture to the active agent only).
- UI: the camera mode pill exists in `App.tsx` top-right (`3RD`/`1ST`/`2ND`). The agent dropdown is new UI but trivial.

**Verdict:** Safe, independent of Phase 2 only if built against a `HumanoidAgent` interface with a stub single-agent implementation first.

---

### Phase 4 — God Mode Restructure ✅ FEASIBLE (low risk)

- Task 5 (**relocate theme toggle out of God Mode**) is **already done** — the toggle is a fixed button at `top-[112px] left-4` in `App.tsx`, independent of GodModePanel. Phase doc's assumption is outdated; only verification is needed.
- Current GodMode contents: `PhysicsControls` (gravity, friction, sky, floor, grid — world-level), `BodyControls` (body type/mode, skeleton, debug, cameras, PiP, procedural, multi-body PD, smoothing, reset — **agent-specific**), `DirectivePanel` (training mode/goal — agent-specific), `ConnectionPanel` (provider/Supabase/cycle — **app-level, does not fit either bucket cleanly**; recommend it moves to top-level chrome or the Phase 5 modal).
- No "+" agent spawn button exists today; the humanoid auto-spawns at `spawnPoint` in the `useWorld` build effect. Task 4's "make '+' the only spawn trigger" = wrap that build effect behind an explicit action.
- Per-agent tabs require the Phase 2 agent registry to exist — **Phase 4 depends on Phase 2**.

---

### Phase 5 — Agent Settings Modal & Per-Agent Export ✅ FEASIBLE (low risk, mostly UI)

- `ExportConfig` already has `agentIds: string[]`; `datasetExporter.ts` already filters `.in('agent_id', config.agentIds)`. The frontend hardcodes `agentIds: ['agent_a']` — adding an agent selector is small.
- `agentStore` memories already carry `agentId` and `sessionId` — display-side per-agent filtering is ready.
- Modal live-updating from `activeViewAgentId`: pure React/Zustand work.
- Boundary decision (modal vs GodMode tab content) is a design call; current `ConnectionPanel` is the natural candidate for the modal (provider/API key/session/export trigger), leaving GodMode tabs for body/training/goal.

---

### Phase 6 — TTS/STT ✅ FEASIBLE (greenfield, LOW RISK — and the user-added Edge TTS requirement)

**Findings:**
- **No TTS code exists anywhere.** There is zero `speechSynthesis`/`SpeechSynthesisUtterance`/edge-tts usage in the codebase. `AudioEngine.ts` is Tone.js piano synthesis + PCM capture only — it is unaffected by TTS work but its `getBuffer()` PCM capture feeds the agent's `audio_pcm` inference field; TTS output should be routed to **output only** (Tone's destination is already wired to `MediaStreamDestination`, so TTS via `speechSynthesis` completely bypasses it — no conflict, but also no capture of TTS into inference audio, which is correct).
- Web Speech API (`window.speechSynthesis`) is the sensible primary: zero dependencies, works offline, free forever. Must handle the async `voiceschanged` event (voices list is empty until it fires) and the Chrome 800-char utterance limit (split long thoughts).
- **User requirement — Edge TTS voice selectable:** The user wants the ability to pick the Edge TTS voice. Note the phase doc makes Edge TTS "optional secondary"; the user overrides this and wants it selectable. Edge TTS can be called directly from the browser: the `speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` WebSocket endpoint with a `Sec-MS-GEC`/`Sec-MS-GEC-Version` token (client-side libs like `msedge-tts` implement this). This is **client-side and serverless-compatible** (no proxy needed), but it is an undocumented Microsoft endpoint that can break without warning. Required implementation for this ask:
  1. `VoiceProvider` interface: `speak(text, voiceOptions) => Promise<void>`
  2. `WebSpeechProvider` (primary) + `EdgeTTSProvider` (secondary, auto-fallback to Web Speech on failure)
  3. **Voice selector UI** (per the user's requirement): a dropdown listing available voices, persisted in `connectionStore`/`uiStore` (e.g. `uiStore.ttsVoice` + `ttsProvider`), applied at speak-time via `voiceOptions`.
  4. Multi-agent prioritization: only the `activeViewAgentId`'s voice plays at full volume; others duck/queue (per phase doc and v2update/phase-11).
  5. STT via `webkitSpeechRecognition` into the existing `inject_thought` channel (`InjectionInput` → `sendMessage('inject_thought')`) — the injection pipeline already exists end-to-end.
- The phrase "in case it was not mentioned" → add `ttsVoice` + `ttsProvider` fields to `uiStore` (or `connectionStore`), default to a Web Speech voice, and surface Edge TTS voices only if the provider is selected (Edge voice lists also load async).

---

### Phase 7 — Cleanup & Keepalive ✅ FEASIBLE with one clarification

- **Video export clarification:** There is **no standalone "video export" feature** in the UI. The export types are: `dataset` (LeRobot/JSONL/CSV), `frames_zip`, `thoughts_report`, `session_full`. However, **LeRobot dataset export stitches frames into `observation.mp4` using `ffmpeg-static` + `fluent-ffmpeg`** inside `datasetExporter.ts`. If Phase 7 removes "FFmpeg/server-rendering-dependent code paths" blindly, **LeRobot export breaks**. Must either (a) scope the change to "remove the ffmpeg video-stitching from LeRobot export, keep everything else" (LeRobot can consume WebP frames + parquet) or (b) explicitly keep the ffmpeg dependency for LeRobot. The `recording*.mp4` files in the repo root are screen recordings, not a feature.
- **Coordinator removal:** Everything phase 7 removes exists exactly as described (`server.ts`, port 3001, `@fastify/websocket`, `supabasePing.ts`). The WebSocket **client-side** is `CoordinatorContext.tsx` — removal means replacing it with fetch-to-Vercel + the Phase 2 client loops. Grep-ability is good: `ws://localhost:3001` in `connectionStore`, `endpoint` field, `normalizeWebSocketUrl`.
- **Client-side keepalive:** trivial interval query fired while tab open (e.g. every 5 min, only when `document.visibilityState === 'visible'`). The phase doc's honesty about "only works while app is open" is accurate and should be preserved in the `PHASE_7_COMPLETE.md`.

---

## Safe Migration Strategy (avoiding the previous "unstable by Phase 2" failure)

The phase documents are written in a 1→7 linear order, but that is **not the safe execution order**. Execute in this order instead:

1. **Baseline stabilization first (prerequisite, ~1 week):** Run a full single-agent session (spawn, infer via each provider, move, memory write, export, God Mode) and record pass/fail in writing. Freeze the `ObjectManager.reloadStateAndRehydrate()` path. Tag a release commit (`v1-stable-single-agent`). Any work that destabilizes it is a regression, not progress.
2. **Phase 6 (TTS) first — it is fully independent, greenfield, low-risk, and user-requested.** Nothing in the physics/loop touches it. Deliver with the voice-selector UI.
3. **Phase 3 (camera) against the single agent** — all three camera modes + dropdown architecture can be built with one agent (dropdown lists one entry). This de-risks the per-agent abstractions before multi-agent exists.
4. **Phase 4 + 5 (UI restructure/export)** — safe against the current architecture; per-agent tabs/modal become meaningful only after Phase 2, but the world/agent control classification and per-agent export plumbing can be built on the existing `agentIds` field now.
5. **Phase 2 ONLY after 1–4, and in the staged sub-sequence described above** (prefix parameter → isolated `HumanoidAgent` class → registry → per-agent action routing → **only then** compose N into one world). Keep `useMultiBodyPD` default **off** for multi-agent until per-agent balance is verified — the current balance system (capsule PD + K-GRF) is the hard-won stability core; do not re-tune it while adding agents. Set `dayNightCycleMs`/gravity session-persistence aside during multi-agent QA (both trigger full-world `saveSession`/reload paths).
6. **Phase 7 before Phase 1:** Remove video-stitch + coordinator + keepalive while the coordinator still exists as a reference, then **Phase 1 (serverless proxy) cutover last**, because it changes the inference path every other phase depends on. Keep the coordinator code on a branch as a reference implementation during the proxy cutover.
7. **Rollback contract:** every phase ends with `PHASE_N_COMPLETE.md` **plus** a `tag/commit` and a one-command restore (the coordinator still runs until Phase 1 lands). Do not delete coordinator until Phase 7 smoke test passes.

---

## Edge TTS Voice Selection — Required Additions (user requirement)

Because the user explicitly asked that the Edge TTS voice be selectable even if a specific voice "has not been mentioned" in the phase docs:

- **New state:** `uiStore.ttsProvider: 'web_speech' | 'edge_tts'`, `uiStore.ttsVoice: string` (voice name/identifier), persisted (localStorage or zustand persist).
- **New UI:** a "Voice" dropdown in the Phase 5 agent settings modal (or top-level chrome). Populate from `speechSynthesis.getVoices()` for Web Speech; from the Edge TTS voice list endpoint for Edge. Must re-populate on `voiceschanged`.
- **Provider contract:** `speak(text, { voice, rate, pitch }) => Promise<void>`; Edge provider falls back to Web Speech on fetch/WS failure (per phase doc).
- **Default behavior:** if both providers are available, default to Web Speech (stable/supported); Edge selectable for higher quality. If the user selects Edge and no voice is picked, use a sensible default (e.g. `en-US-GuyNeural` / `Microsoft Guy Online (Natural) — English (United States)`).
- **Agent voice distinctness:** in multi-agent sessions, assign each agent a distinct voice from the selected provider's voice list (walk the list, cycle), while honoring the user's explicit global voice choice for the active agent.

---

## Key Abstractions Reference

| File | Responsibility / Role in refactor |
|---|---|
| `src/world/engine/PhysicsEngine.ts` | Single `MjModel/MjData` owner; `loadMJCFModel()` deletes old model (the main re-entrancy hazard); guards: `isStepping`, `isMutatingWorld`, `isPhysicsBroken`; coordinate + quaternion converters (world↔MuJoCo). Multi-agent = 1 model, N prefixed subtrees. |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Generates the humanoid MJCF from a GLB bone map. **Hardcodes every name.** Phase 2's first work item: add `prefix` param, prove byte-identical output for `''`. |
| `src/world/engine/BodyManager.ts` | `activate()` → generate MJCF → load → `mj_name2id` maps (body/geom/actuator). Maps are per-instance but lookups are hardcoded names (`root_capsule`, `root_freejoint`). |
| `src/world/engine/HumanoidPhysicsBinder.ts` | ~2300-line single-humanoid controller: build steps A–D, `setMotorTargets` (with `resolveJointAlias`), `validateAndApplyTimeline`, `syncVisuals` (K-GRF + raycast grounding + balance), `resetPose`. One instance today. |
| `src/world/engine/CameraManager.ts` | 3 cameras + OrbitControls + TransformControls + 448×448 `captureAIFrame()`. Already has 1st/2nd/3rd modes; needs per-agent input and a true 2nd-person follow-lerp. |
| `src/world/engine/ObjectManager.ts` | Pre-allocated `env_slot_*`/`piano_body` object system. `reloadStateAndRehydrate()` rebuilds the whole MJCF on custom-model spawn/delete — the top destabilization risk in a multi-agent world. |
| `src/world/engine/MotorController.ts` | Position-actuator PD controller; ramps targets; limp/ragdoll; capsule balance torque via `xfrc_applied`. Per-instance, safe to multiply, but reads `this.model/data` (must refresh after any `loadMJCFModel`). |
| `src/world/engine/ObservationBuilder.ts` | VLM proprioception vectors + rolling history. Per-agent instances needed. |
| `src/world/engine/AudioEngine.ts` | Tone.js piano + PCM capture for `audio_pcm`. Unaffected by TTS; no TTS exists today. |
| `src/world/contexts/CoordinatorContext.tsx` | WebSocket client hub; 13 message handlers; auto-syncs provider config; **hardcodes `agentId: 'agent_a'`** in auto-sync; dispatches global `synthia:action` event. Replaced by Phase 1's fetch + Phase 2's client loops. |
| `src/world/hooks/useWorld.ts` | ~1100-line init/lifecycle hook; creates single binder; holds the diag ring buffer; `captureWorldState()` (frame/joints/audio/contacts); `synthia:action` handler routes to single binder. |
| `src/store/agentStore.ts` | **Flat single-agent store.** Phase 2 requires `Record<agentId, AgentState>` or per-agent stores. |
| `src/store/connectionStore.ts` | Persisted provider/Supabase/cycle config; `ProviderType` enum; API key in sessionStorage only. Phase 1 target for proxy integration. |
| `src/store/worldStore.ts` | Persisted physics/body/camera/object state; `saveSession()`/`loadSession()` touch localStorage on every world mutation. |
| `src/components/godmode/ConnectionPanel.tsx` | Provider dropdown + API key + Supabase + cycle slider. Content boundary for Phase 5 modal. |
| `coordinator/src/agentLoop.ts` | The cycle to port client-side; owns `parseAndValidateAction` (3+ JSON schemas, deg→rad, gaze→head conversion) — **port this file verbatim-ish**; it already carries `agentId` through messages. |
| `coordinator/src/payloadBuilder.ts` | `build()` + `buildPerceptionSummary()` + `buildTactileContext()` — the prompt context engine to port to the client (or into the Vercel route). |
| `coordinator/src/providers/geminiProvider.ts` / `openaiCompatProvider.ts` | Build the actual SYNTHIA system prompt + stream parsing (`thought → ---ACTION--- → JSON`). Phase 1 route bodies can reuse this logic; client builds the payload, route attaches key + forwards. |
| `coordinator/src/memoryManager.ts` | Supabase CRUD + pgvector `match_memories(match_agent_id)` + frame upload to `Synthia-frames` bucket. Already agent-scoped server-side. |
| `coordinator/src/datasetExporter.ts` | Export pipeline: LeRobot (ffmpeg video stitch), JSONL, CSV, frames_zip, session_full. Phase 7 touches the ffmpeg part. |

---

## Data Flow — Complete Cognitive Cycle (today)

1. `WorldViewport` interval (default `cycleMs` 2000ms) calls `captureWorldState()` + `detectOutcomes()`.
2. `captureWorldState()` reads the latest 448×448 WebP AI frame from `WorldEngine.getLastAIFrame()`, builds joint state from the single binder, gathers audio PCM, contact forces, object list, and VLM proprioception.
3. Frontend sends `world_state` (with `agentId: 'agent_a'`) over WebSocket to the coordinator.
4. `server.ts` routes to the `AgentLoop` for that agentId (creates it on first message).
5. `AgentLoop.cycle()` dequeues any injection, then `PayloadBuilder.build()` assembles the 22-field `InferPayload` (frame, joints, memories, contact forces, perception summary, etc.).
6. `InferenceClient.infer()` → provider adapter (Kaggle/Gemini/OpenAI-compat) streams `thought tokens` then `---ACTION---` then JSON.
7. Coordinator forwards `thought_token` messages to the frontend as they stream; `CoordinatorContext` appends them to `agentStore.currentThought`.
8. `AgentLoop.parseAndValidateAction()` normalizes the JSON (deg→rad, timeline frames, gaze→head override) and sends an `action` message.
9. `CoordinatorContext` dispatches global `CustomEvent('synthia:action')`.
10. `useWorld`'s handler calls `humanoidPhysicsBinder.validateAndApplyTimeline()` → `setMotorTargets()`.
11. Each animation frame (60fps): `updateMotorTargets()` + `syncVisuals()` move the humanoid; `MotorController` applies PD targets and capsule balance torque.
12. Next cycle: frontend sends `outcome` (success/fail/reward from fall detection / piano / buttons); `AgentLoop.finalizeCycle()` writes memory to Supabase, broadcasts `memory_saved` / `skill_mastered`.

**In the target architecture (after the refactor):** steps 3–8 move client-side — `captureWorldState()` feeds a client `AgentLoop` per agent, which calls the Phase 1 Vercel proxy (or Kaggle directly); action JSON goes straight to the per-agent binder, no WebSocket hop. `CoordinatorContext` disappears; `agentStore` becomes per-agent.

---

## Module Reference (frontend + coordinator, significant files)

| File | Purpose |
|------|---------|
| `src/main.tsx` | React root; wraps app in `CoordinatorProvider` |
| `src/App.tsx` | Root layout: viewport, camera pill, theme toggle, GodMode panel, right agent panel, modals |
| `src/world/hooks/useWorld.ts` | Initializes all engines; event bus handlers; `captureWorldState`/`detectOutcomes`; diag ring buffer |
| `src/world/contexts/CoordinatorContext.tsx` | WebSocket hub; reconnection; 13 message handlers; provider auto-sync |
| `src/world/engine/WorldEngine.ts` | Three.js scene + rAF loop; fixed-timestep accumulator; AI frame capture; floor/grid/lighting |
| `src/world/engine/PhysicsEngine.ts` | MuJoCo WASM wrapper; MJCF load; step guards; contact force registry; coord/quat converters |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Humanoid MJCF generator (bones, joints, actuators, slots, piano) |
| `src/world/engine/BodyManager.ts` | Activates humanoid into MuJoCo; name→body/geom/actuator ID maps |
| `src/world/engine/HumanoidPhysicsBinder.ts` | Humanoid controller: build steps, motor targets, timeline validation, syncVisuals, K-GRF, reset |
| `src/world/engine/MotorController.ts` | PD position actuators; limp mode; capsule balance torque |
| `src/world/engine/CameraManager.ts` | 1st/2nd/3rd cameras; OrbitControls; TransformControls; 448×448 AI render target |
| `src/world/engine/ObjectManager.ts` | Object spawning (env slots / piano / custom meshes); MJCF reload+rehydrate; collision events |
| `src/world/engine/CollisionAdapter.ts` | Object preset→MJCF geom mapping; contact-pair reading |
| `src/world/engine/AudioEngine.ts` | Tone.js piano sampler; PCM buffer for inference audio |
| `src/world/engine/ObservationBuilder.ts` | Proprioception vectors (root height, gravity, velocities, joint angles) |
| `src/world/engine/AvatarSynchronizer.ts` | Copies physics body rotations onto skeleton bones with smoothing |
| `src/world/engine/BodyProxy.ts` (in HumanoidPhysicsBinder.ts) | RAPIER-compatible proxy over MuJoCo bodies for ObservationBuilder/AvatarSynchronizer |
| `src/store/{worldStore,agentStore,connectionStore,uiStore,logStore}.ts` | Zustand state (see Key Abstractions) |
| `src/components/world/WorldViewport.tsx` | 3D container; cycle interval sending world_state; PiP overlay |
| `src/components/world/ModelInputPiP.tsx` | Picture-in-picture of the AI frame |
| `src/components/godmode/GodModePanel.tsx` | God Mode modal shell + spawn/export quick actions |
| `src/components/godmode/{PhysicsControls,BodyControls,DirectivePanel,ConnectionPanel,ObjectSpawner}.tsx` | God Mode control sections (see Phase 4 classification) |
| `src/components/export/ExportModal.tsx` | Export config + progress UI (4 export types, scopes, filters) |
| `src/components/agent/*.tsx` | Right-panel tabs: Thoughts, Memories, Structure, Logs + injection input |
| `coordinator/src/server.ts` | Fastify + WebSocket on 3001; agent map; message router; export/session endpoints |
| `coordinator/src/agentLoop.ts` | Cognitive cycle + action parser (to port client-side) |
| `coordinator/src/payloadBuilder.ts` | 22-field payload assembly + perception/tactile/gaze context (to port client-side) |
| `coordinator/src/inferenceClient.ts` | Provider-agnostic inference client with timeouts |
| `coordinator/src/providers/*.ts` | Kaggle/Gemini/OpenAI-compat adapters + factory (system prompts live here) |
| `coordinator/src/memoryManager.ts` | Supabase memories/sessions/embeddings/frame upload |
| `coordinator/src/embeddingEngine.ts` | all-MiniLM-L6-v2 embeddings (server-side; needs client alternative or proxy reuse) |
| `coordinator/src/datasetExporter.ts` | LeRobot/JSONL/CSV/frames/session exports (ffmpeg video stitch) |
| `coordinator/src/{injectionQueue,motorProgramStore,reconnectionManager,supabasePing}.ts` | Supporting services (some become client-side or vanish) |
| `kaggle_server.py` | Python inference server for Qwen2.5-VL (Kaggle; no secret key — can stay direct) |
| `supabase_schema.sql` | DB schema: memories, sessions, skills, motor_programs + `match_memories` RPC |

---

## Suggested Reading Order (for whoever implements this)

1. `src/world/hooks/useWorld.ts` — The single most important file: everything (physics, binder, camera, events, world capture) is wired here. Understand this before touching anything.
2. `src/world/engine/PhysicsEngine.ts` + `src/world/engine/MJCFHumanoidTemplate.ts` — How the MuJoCo world is built, and why every name is global today (Phase 2's core problem).
3. `src/world/engine/HumanoidPhysicsBinder.ts` — The hard-won stability core (build steps A–D, K-GRF, raycast grounding, timeline validation). Nothing in Phase 2 may break this.
4. `coordinator/src/agentLoop.ts` + `coordinator/src/payloadBuilder.ts` — The cognitive loop to port client-side; note `parseAndValidateAction` and `buildPerceptionSummary` are the crown jewels.
5. `src/world/contexts/CoordinatorContext.tsx` — The WebSocket bridge that Phase 1/2/7 replaces.
6. `src/world/engine/ObjectManager.ts` — Read `reloadStateAndRehydrate()` carefully. This function is the #1 reason previous multi-agent attempts destabilized the model.
7. `v2update/phase-7-headless-multi-agent-core.md` + `v2update/phase-11-audio-tts-stt-discussions.md` — The prior design docs the new prompts reference; they define the prefixed-subtree pattern and TTS/stt expectations.

---

## Known Gaps / Documentation Warnings

- `exploration.md` and `SYNTHIA_README.md` describe the **old Rapier architecture** — stale. Trust the code, not those docs.
- `src/world/logs.md` is a captured debug session showing healthy single-agent boot (75 actuators, 50 bodies) — useful as a "healthy state" baseline for regression testing during the refactor.
- `BUGFIXES.md` documents the history of physics stability fixes (velocity clamp, action rejection feedback, TransformControls drag, etc.) — read it before re-touching physics code.
- The `coordinator` has scripts `sync-types` (`scripts/sync-types.mjs`) keeping `src/types` and `coordinator/src/types` in sync — any schema change must run this.
- Existing `project_info__*.md` files (61, 63, 65–69) are prior exploration reports; this one is `project_info__70.md`.
