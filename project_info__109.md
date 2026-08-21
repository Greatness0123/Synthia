# Per-Agent Identity System + Sleep System (Phase 12) — Feasibility & Codebase Validation

Report saved to `project_info__108.md` in the project root.

## Summary

This report validates the **Per-Agent Direct-Edit Identity System** plan against the actual SYNTHIA 1.5.1 codebase, audits **multi-agent routing issues**, and assesses **whether Phase 12's Sleep System is functional and beneficial**.

**Headline findings:**
1. The identity plan is **feasible and well-aligned** with existing infrastructure — but it references two files that **do not exist** in this repo (`05_MODEL_PROMPTS_AND_PROVIDERS.md`; `payloadBuilder.ts` as an action-normalization pipeline). The real system-prompt/action-pipeline homes are `src/world/agent/InferenceClient.ts::buildOpenAIMessages()` and `src/world/agent/AgentLoop.ts::parseAndValidateAction()`.
2. **Multi-agent routing has real bugs**: a hardcoded `agent_a` in the coordinator auto-sync, a dual ID namespace (`agent_a` server vs `agent_0..N` client), and outcome routing that attributes non-active agents' outcomes to the active agent.
3. **The Sleep System is highly feasible and beneficial** — per-agent pause/resume already exists client-side and is UI-wired; the real gaps are a global admin "sleep all" control, a `'sleeping'` status, and coordinator-server parity.

---

## 1. Identity System — Plan vs. Actual Codebase

### 1.1 Critical file corrections (the plan's "Read first" references are wrong)

| Plan references | Reality in repo |
|---|---|
| `05_MODEL_PROMPTS_AND_PROVIDERS.md` | **Does not exist anywhere in the repo.** The system-prompt architecture lives in code: `src/world/agent/InferenceClient.ts::buildOpenAIMessages()` — the static "You are SYNTHIA, a self-aware AI in a physical simulation" self-awareness block, body-config block, JOINT AXIS MAP, and the OUTPUT JSON schema contract. |
| `payloadBuilder.ts` action-normalization pipeline | `src/world/agent/payloadBuilder.ts` exists but is payload **assembly only** (memories, perception, tactile, feedback). It contains **zero action parsing/validation**. The actual action parser/validator is **`AgentLoop.ts::parseAndValidateAction()`** (~200 lines: JSON cleanup, `actions` array normalization, degree→radian conversion, gaze-target→head-bone injection). |
| "Memory-write action pipeline" | Real flow: `parseAndValidateAction()` → `pendingCycles` map → `finalizeCycle()` → `MemoryManager.write()`. `memory_write` is a **field embedded in the output JSON schema**, not a separate dispatch-table action type. `identity_update` must be a new **sibling field** in that schema, parsed in `parseAndValidateAction` and dispatched alongside `memory_write`. |

**Critical consequence:** The client (`src/world/agent/AgentLoop.ts`) and server (`coordinator/src/agentLoop.ts`) have **duplicate copies** of `parseAndValidateAction`. Any identity feature must be added to **both**, or the coordinator path silently drops identity updates.

### 1.2 Schema alignment

- `supabase_schema.sql` at project root is canonical. The plan's two new tables fit; they need the same RLS policy block as existing tables ("Service role full access" + "Public full access") to work with the current anon-key client pattern.
- **No cross-table transactions over Supabase REST.** `MemoryManager.write()` does single insert + `.select().single()`. The plan's "both writes in one transaction" maps to **best-effort sequential**: (1) update `agent_identity`, (2) insert `agent_identity_log`, (3) if log insert fails, surface an error — never swallow it.
- **Mock-store dev pattern**: `MemoryManager` falls back to an in-memory mock store without Supabase creds. `IdentityManager` (new file, natural sibling of `memoryManager.ts`) should mirror this — it makes the plan's test #1 (default seed on fresh spawn) testable headlessly.

### 1.3 Rate limiting — recommendation

- Default cycle is **2000 ms**; 5 min ≈ **150 inference cycles between edits**. The plan's "1 per 5 minutes" is a sane friction value. **Final recommended value: 1 accepted edit per 300 s session time per agent**, using `window_started_at` (timestamp of window's first edit) + `edit_count_window` (cap 1). If `now - window_started_at < 300s && edit_count_window >= 1` → reject with visible feedback.
- **Rejection-feedback reuse**: physical-limit rejections flow `useWorld::handleAction` → `validation.rejections` → `loop.recordActionFeedback()` → `PayloadBuilder.build()` → `payload.physical_feedback` → back to the model next cycle. For identity, add a parallel `identity_feedback` payload field (structurally separate). `RejectedAction` in `src/types/agent.ts` needs new `reason` members (`'missing_reason' | 'rate_limited'`).

### 1.4 Incremental beliefs — enforcement location

Plan task 3's "enforce in the handler" = `IdentityManager.applyIdentityUpdate()`:
- `field === 'beliefs'` → `new_value` must be `{ op: 'append' | 'modify', index?: number, entry: string }`. Raw array replacement → reject with feedback.
- `field === 'name' | 'traits'` → direct replacement.
- Audit log stores **incremental** old/new (single changed entry), not full-array diff — matching test #5.

### 1.5 Caching / fetch path — straightforward

`AgentLoop` is a long-lived instance. Add `identity` field, fetch in `start()`, update on successful `identity_update`. `PayloadBuilder.build()` reads the cached identity and carries it in the payload — **no per-cycle network round trip**. Loop-local caching suffices since only the system prompt consumes it.

### 1.6 System-prompt injection point

- Self-awareness block lives in `InferenceClient.buildOpenAIMessages()`: `You are SYNTHIA, a self-aware AI in a physical simulation. ... Body type: ${payload.body_type}...`
- Design: `PayloadBuilder.build()` adds `identity` to payload (like `known_skills`/`physical_feedback`); `buildOpenAIMessages()` renders `payload.identity` into the opening block, falling back to defaults when null. All model-context data flows through the payload — `InferenceClient` stays a pure renderer.
- **Seeding defaults on spawn**: hook in `useWorld.ts::spawnAgent()` → `addAgent(agentId)` → `startAgentClientLoop()` → `AgentLoop.start()` → `ensureIdentity(agentId)`.

### 1.7 Constraint 7 (no perception-triggered implicit updates) — verified compatible

The overheard-speech tunnel is a **one-way perception pipe** today (`captureWorldStateForAgent` reads `useSpeechStore.utterances` → `overheard_speech` → `perception_summary`). The only writes in the client cognitive loop are: (1) `memoryManager.write` (explicit action), (2) `addMemoryForAgent` (UI mirror), (3) `addSkillForAgent` (skill_mastered). The constraint is satisfied by simply **not adding any write in `captureWorldStateForAgent`** — the only new write path is the `identity_update` action handler.

---

## 2. Multi-Agent Routing Issues — Audit Results

### 2.1 CRITICAL — Hardcoded `agent_a` in coordinator auto-sync
`src/world/contexts/CoordinatorContext.tsx` (onopen): `data: { agentId: 'agent_a', ... }`. Client spawns `agent_0..N` — **`agent_a` never exists client-side**. On every WS reconnect, per-agent provider overrides are silently lost (only the server's `storedProviderConfig` global fallback gets set). **Fix: send `agentId: useAgentStore.getState().activeAgentId` or omit it to force global apply.**

### 2.2 Dual identity namespaces: `agent_a` (server) vs `agent_0..N` (client)
`coordinator/src/server.ts` defaults to `'agent_a'` (sessions fetch); client loops/binders use `agent_N`. Memory isolation holds within a path but would collide across paths. The identity feature must key on the running loop's namespace (`agent_N` today). **Recommendation: normalize on `agent_N` everywhere; remove the `agent_a` fallback in `server.ts::fetch_sessions`.**

### 2.3 Outcome routing attributes non-active agents' outcomes to the active agent
`useWorld.ts::detectOutcomes`: `pendingOutcomesRef` collects `piano_note`/`button_press` outcomes **without agentId**, then routes all to `activeAgentId`'s loop. If agent_1 touches the piano while agent_0 is active, agent_0's pending memory cycle gets the reward. **Fix: stamp `agentId` on outcomes at collection time** (`objectManager.setEventCallback`).

### 2.4 `resolveAgentId` fallback is a misroute landmine
`coordinatorContextCore.ts`: `data?.agentId || activeAgentId || 'agent_0'`. If the user switches active agent mid-thought-stream and the server omits `agentId`, `thought_complete` lands on the wrong agent. Server always sends it today, but the identity feature must not rely on a fallback. **Recommendation: drop + warn when `agentId` is missing for agent-scoped message types.**

### 2.5 Spawn index collisions (latent)
`spawnAgent` uses `binderMap.size` as the next index. No removal path exists today, but a Phase 12 sleep/remove flow that ever deletes an agent would cause `agent_N` index reuse → identity record collisions. **Recommendation: monotonic spawn counter in `useWorld.ts`, never reuse indices.**

### 2.6 No destroy path for client loops
`pause`/`resume` exist and are window-exposed, but nothing calls `AgentLoop.stop()` client-side. A sleep-all / despawn flow needs real teardown to flush pending state. Identity caches live on the loop — prefer **pause over destroy** on sleep so caches survive.

---

## 3. Sleep System (Phase 12) — Feasibility & Benefit

### 3.1 What already exists (more than the plan assumes)

| Plan requirement | Existing implementation |
|---|---|
| **Per-agent manual sleep (the "second trigger")** | **Already fully implemented.** `AgentLoop.pause()/resume()`, `pauseAgentClientLoop`/`resumeAgentClientLoop` in `useWorld.ts`, UI button in `AgentSettingsModal` ("Pause / Resume" via `window.__synthia`), live status chip. `pause()` clears the interval → inference halts → provider cost stops; physics continues. Exactly matches the resolved spec. |
| **Lossless state preservation** | `StateRehydrator.capture()/restore()` already does root pos/quat/vel, all joint angles/velocities, and per-actuator `ctrl` values. `restore()` re-applies `data.ctrl` — a woken agent resumes its exact commanded servo state with no T-pose flop. |
| **Session semantics** | `pause()` does NOT null `currentSessionId` or call `endSession` — the session stays open. Arguably correct for sleep (continue on wake); needs an explicit Phase 12 decision. |

### 3.2 What's missing (the actual work)

1. **Admin "sleep all"** — nothing iterates all loops. ~10-line `sleepAllAgents()` in `useWorld.ts` calling `pause()` on every loop in `activeAgentLoopsRef.current`, plus a stopgap UI button.
2. **`'sleeping'` status** — `AgentLoopState` has `'not_started' | 'running' | 'stopped' | 'paused' | 'error'`. "Paused" already renders as `Paused`; add `'sleeping'` only if first-class product naming matters.
3. **Coordinator-server parity** — `coordinator/src/agentLoop.ts` has `stop()` but **no `pause()`/`resume()`**. If any agent runs via the coordinator, sleep means `stop()` (ends session, destroys agent on disconnect). Need `sleep_agent`/`wake_agent`/`sleep_all` WS message types in `coordinator/src/server.ts`, or declare Phase 12 client-side-only.
4. **Status plumbing** — per-agent chips already exist (`agentRuntimeStore.loopStates[agentId]`); "sleep all" drives them with zero new state shape.

### 3.3 Is it beneficial? **Yes — and cheaper than the plan implies**

- Cost control is real: each running loop fires ~1 inference/2s at max_tokens 4096 — the dominant cost. `pause()` stops it with zero new code paths.
- The hard 40% (per-agent trigger + lossless resume machinery) is already built. Remaining = global control + status naming + coordinator parity + session decision.
- **Risk**: "sleep/wake confirmed lossless" should be tested against a **world reload** (spawn second agent → `generateCombinedMCF` world recompile → `StateRehydrator` is the only preservation path). A "sleep all then spawn" sequence has **no existing test** — extend `src/world/engine/__tests__/multiAgentComposition.test.ts`.
- **Identity interaction**: slept agents keep their identity cache in memory (loop persists) — no re-fetch on wake. If sleep-all *destroyed* loops, caches would be lost; prefer pause-over-destroy.

---

## 4. Implementation Plan (revised, codebase-accurate)

**New files**
- `src/world/agent/IdentityManager.ts` — mirrors `MemoryManager`: Supabase client + in-memory mock fallback; `ensureIdentity(agentId)`; `applyIdentityUpdate(agentId, action)` (rate-limit → beliefs incremental enforcement → update row → mandatory log insert).
- `src/world/agent/__tests__/identityManager.test.ts` — the plan's 5 test criteria.

**Modified files**
- `supabase_schema.sql` — add both tables + RLS policies (copy existing pattern).
- `src/world/agent/AgentLoop.ts` — `ensureIdentity` in `start()`; cache identity; parse `identity_update` in `parseAndValidateAction()`; dispatch; `lastIdentityFeedback` for next-cycle rejection visibility.
- `src/world/agent/payloadBuilder.ts` — carry `identity` + `identity_feedback`.
- `src/world/agent/InferenceClient.ts` — render `payload.identity` in the self-awareness block; add `identity_update` to the OUTPUT JSON schema in the prompt.
- `coordinator/src/agentLoop.ts` + `coordinator/src/server.ts` — **mirror identity parser/dispatch**; add `sleep_agent`/`wake_agent`/`sleep_all` WS message types.
- `src/world/hooks/useWorld.ts` — `sleepAllAgents()`; stamp `agentId` on outcomes (fix §2.3); monotonic spawn counter (fix §2.5).
- `src/world/contexts/CoordinatorContext.tsx` — fix `agent_a` auto-sync (fix §2.1).
- `src/store/agentRuntimeStore.ts` — optional `'sleeping'` state.
- `src/components/agent/AgentSettingsModal.tsx` — identity viewer/editor (manual edit with reason) for debugging; "Sleep All" stopgap button.

**Sequencing**
1. Fix routing bugs (§2.1, §2.3, §2.4) first — they corrupt any per-agent feature built on top.
2. Identity schema + `IdentityManager` + jest tests (mock mode) — fully headless-testable.
3. Wire into both `parseAndValidateAction` copies + prompt schema + injection.
4. Sleep: `sleepAllAgents()` + coordinator parity last (cheap, reuses pause).

---

## 5. Suggested Reading Order

1. `src/world/agent/AgentLoop.ts` — the cognitive loop: cycle, action parsing, pendingCycles/finalize, feedback. Heart of both features.
2. `src/world/agent/InferenceClient.ts` — system prompt (identity host) + action JSON schema contract.
3. `src/world/agent/payloadBuilder.ts` — how world state + memories + feedback become a payload; template for carrying `identity`.
4. `src/world/agent/memoryManager.ts` — the Supabase/mock pattern `IdentityManager` should clone.
5. `src/world/hooks/useWorld.ts` — multi-agent orchestration: spawn, binders/loops, captureWorldStateForAgent (overheard speech), outcome routing, pause/resume.
6. `src/store/agentStore.ts` + `agentRuntimeStore.ts` — per-agent state map vs flat mirrors; runtime overrides and loop states.
7. `coordinator/src/server.ts` + `coordinator/src/agentLoop.ts` — legacy server path that must stay in parity.
8. `src/world/engine/StateRehydrator.ts` — the lossless capture/restore machinery Sleep depends on.

---

## 6. Final Answers to the "Before Ending" Items

- **Final rate-limit value**: **1 accepted edit per 300 s (5 min)** session time per agent, tracked via `window_started_at`/`edit_count_window` (cap 1, window resets on first edit after expiry). The model can still *attempt* edits every cycle and receive visible rejections — that's the intended friction.
- **Log correctness**: Yes — `agent_identity_log` insert is mandatory and non-skippable; a failed log insert after a successful row update surfaces an error, never swallowed. Every accepted edit carries the model-provided `reason`.
- **System-prompt injection**: reads from the live fetched/cached `agent_identity` record carried through the payload; a hardcoded default is only the null-fallback for unseeded agents, never the primary content.
- **Sleep system**: **Functional and beneficial.** Per-agent pause/resume is already built and UI-wired; remaining work is admin sleep-all, status naming, session-semantics decision, and coordinator parity. Automatic idle-sleep correctly stays out of scope.