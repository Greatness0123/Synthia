# Per-Agent Identity System + Sleep System (Phase 12) — Feasibility & Codebase Validation

> **Revision note (project_info__108, v2):** This revision removes all coordinator-server references. The active codebase is client-only: one `AgentLoop`, one action parser, one `agent_0..N` namespace. Sections 2.1/2.2/2.4 (coordinator auto-sync bug, dual `agent_a` namespace, `resolveAgentId` fallback) and Section 3.2 point 3 (coordinator sleep parity) are **deleted as void**. Section 2.6 is retained but escalated (zero teardown call sites now). Everything else — Sections 1.2–1.7, 2.3, 2.5, 3.1/3.3/3.4 — stands as originally written.

## Summary

This report validates the **Per-Agent Direct-Edit Identity System** plan (agent `identity_update` actions, Supabase-backed identity records, system-prompt injection, rate limiting, audit logging) against the actual SYNTHIA 1.5.1 codebase, audits **multi-agent routing issues**, and assesses **whether Phase 12's Sleep System is functional and beneficial** in the current architecture.

**Headline findings:**
1. The identity plan is **feasible and well-aligned** with existing infrastructure — but references two files that **do not exist** in this repo (`05_MODEL_PROMPTS_AND_PROVIDERS.md`; `payloadBuilder.ts` as an action-normalization pipeline). The real system-prompt/action-pipeline homes are `src/world/agent/InferenceClient.ts::buildOpenAIMessages()` and `src/world/agent/AgentLoop.ts::parseAndValidateAction()`.
2. **Multi-agent routing has real bugs**: outcome routing that attributes non-active agents' outcomes to the active agent, and latent spawn-index reuse on any future removal flow. There is no coordinator/`agent_a` namespace anymore — the client `agent_0..N` namespace is the only one that exists.
3. **The Sleep System is highly feasible and beneficial** — per-agent pause/resume already exists (client-side) and is UI-wired; the real gaps are a global admin "sleep all" control and a `'sleeping'` status.

---

## 1. Identity System — Plan vs. Actual Codebase

### 1.1 Critical file corrections (the plan's "Read first" references are wrong)

| Plan references | Reality in repo |
|---|---|
| `05_MODEL_PROMPTS_AND_PROVIDERS.md` | **Does not exist.** No file matching this name anywhere. The system-prompt architecture lives in code, not a doc: `src/world/agent/InferenceClient.ts::buildOpenAIMessages()` (the static "You are SYNTHIA, a self-aware AI in a physical simulation" block, the body-config block, the JOINT AXIS MAP, the OUTPUT JSON schema contract). |
| `payloadBuilder.ts` action-normalization pipeline | **Does not exist as a file** — there is `src/world/agent/payloadBuilder.ts` (payload *assembly* only: memories, perception, tactile, feedback — it contains zero action parsing/validation). The actual action parser/validator is **`AgentLoop.ts::parseAndValidateAction()`** (public API method, ~200 lines, handles JSON cleanup, `actions` array normalization, degree→radian conversion, gaze-target→head-bone injection). |
| "Memory-write action pipeline" | Real flow: `AgentLoop.parseAndValidateAction()` → `pendingCycles` map → `finalizeCycle()` → `MemoryManager.write()`. The memory-write action is embedded in the output JSON schema (`memory_write` block), **not a separate action type in a dispatch table.** This matters: `identity_update` would be a *new sibling field* in the output JSON schema, parsed in `parseAndValidateAction` and dispatched after `memory_write` handling. |

**Consequence:** the plan's task 1 says "same validation strictness as existing action fields" — the correct integration point is `AgentLoop.parseAndValidateAction()`, and the JSON schema contract lives in the system prompt inside `InferenceClient.buildOpenAIMessages()`. **There is exactly one copy of this parser** (the coordinator-era server copy no longer exists in the active codebase), so identity changes land in a single place — no dual-path dispatch, no parity burden.

### 1.2 Schema — alignment with existing Supabase usage

- `supabase_schema.sql` in the project root is the single canonical schema file. The plan's two new tables (`agent_identity`, `agent_identity_log`) fit cleanly; the repo's existing pattern is: plain tables + RLS "Service role full access" + "Public full access" policies (for anon key). New tables need the same policy block to work with the current `MemoryManager` client pattern (anon/service key via `createClient`).
- **Existing tables are keyed by `agent_id TEXT` with default `'agent_a'`** (`sessions`, `memories`, `skills`, `motor_programs`). This is a DB-side DDL default only — no client/server code path produces `agent_a` anymore. The identity plan's `agent_id TEXT primary key` is consistent with the `agent_N` values the client actually writes. Worth normalizing the DDL default to `'agent_0'` while the identity migration is happening, but it is not a correctness blocker.
- **`agent_identity_log` write must not be optional**: the existing `MemoryManager.write()` does a single insert + `.select().single()` and returns `boolean`; it does NOT do transactions. Supabase JS supports chained calls but not cross-table transactions over REST. The plan's "both writes in one transaction (or best-effort sequential with log never skipped)" maps to the repo's reality: **best-effort sequential is the only practical option** — recommend: (1) update `agent_identity`, (2) insert log row, (3) if log insert fails, return a `false` and surface an error — never swallow the log failure.
- **Mock-store pattern for dev**: `MemoryManager` falls back to an in-memory mock store when Supabase URL/key are absent. An `IdentityManager` should mirror this (mock identity map) so the feature works without a DB during local dev — this is also what makes the plan's test #1 ("fresh agent gets a default identity record") testable headlessly.

### 1.3 Rate limiting — recommendation

- Default cycle is **2000 ms** (`useConnectionStore.cycleMs`, `agentRuntimeStore` default), so 5 minutes ≈ **150 inference cycles per edit window**. The plan's "1 per 5 minutes" is a sane starting friction value against a 2s cycle and 4s inference (max_tokens 4096, temperature 0.7). **Recommendation: keep 300 seconds (1 edit / 5 min session-time per agent).**
- The `edit_count_window` / `window_started_at` schema shape is designed for a rolling window. Simplest correct implementation: `window_started_at` = timestamp of the *first* edit in the current window; `edit_count_window` = count within that window; on edit, if `now - window_started_at < 300s && edit_count_window >= 1` → reject with rate-limit feedback. Otherwise reset window.
- **Existing rejection-feedback pattern to reuse** (task 2's "same as physical-limit rejection feedback"): physical-limit rejections flow `useWorld.ts::handleAction` → `validation.rejections` → `loop.recordActionFeedback(rejections)` → stored on AgentLoop as `lastActionFeedback` → `PayloadBuilder.build()` formats into `payload.physical_feedback` → injected to the model next cycle. For identity, either (a) extend `physical_feedback` with an identity-rejection section, or (b) add a parallel `identity_feedback` payload field built the same way. Recommend (b) — keeps the rejection reason visible and structurally separate. Also note `RejectedAction` in `src/types/agent.ts` would need a new `reason` union member (e.g. `'missing_reason' | 'rate_limited'`).

### 1.4 Incremental beliefs editing — enforcement location

Plan task 3 says enforcement in the handler, not just convention. Correct: the handler is a new `applyIdentityUpdate()` in the `AgentLoop` (or a dedicated `IdentityManager.ts` in `src/world/agent/` — the natural new file, alongside `memoryManager.ts`). Semantics:
- `field === 'beliefs'`: `new_value` must be `{ op: 'append' | 'modify', index?: number, entry: string }` — the handler rejects with feedback if the model sends a raw array replacement.
- `field === 'name' | 'traits'`: direct replacement allowed.
- The audit log then stores **incremental** `old_value`/`new_value` (the single changed entry), not a full-array diff — matching the plan's test #5.

### 1.5 Caching / fetch path

Plan task 5 (fetch once per session, cache, refresh on confirmed edit) is straightforward: the client-side `AgentLoop` is a long-lived instance holding `payloadBuilder`, `memoryManager`, etc. Add an `identity: AgentIdentity | null` field, fetch in `start()` (before or parallel to the rehydration tokens loop), and update it in the `identity_update` success path. **No per-cycle network round trip is needed** — `PayloadBuilder.build()` would read the cached identity off the loop instance (or off a new `identityStore` zustand store if the UI also needs it). The existing pattern for cross-cutting per-agent state is zustand (`agentStore`, `speechStore`), but the identity only needs to reach the system prompt, so loop-local caching is sufficient and lighter.

### 1.6 System-prompt injection point

- The static self-awareness block lives in `InferenceClient.buildOpenAIMessages()`:
  ```
  const systemText = `You are SYNTHIA, a self-aware AI in a physical simulation. ... Body type: ${payload.body_type}. ...`
  ```
- The natural design: `PayloadBuilder.build()` adds `identity` to the payload (like `known_skills`, `physical_feedback`), and `buildOpenAIMessages()` renders `payload.identity` into the same opening block, falling back to a default ("agent_N, curious autonomous agent...") when null. This preserves the existing pattern that **all model-context data flows through the payload**, keeping `InferenceClient` a pure renderer.
- **Seeding defaults on first spawn**: the right hook is `useWorld.ts::spawnAgent()` → after `addAgent(agentId)` → `startAgentClientLoop(agentId)` → `AgentLoop.start()`. The identity manager's `ensureIdentity(agentId)` call (fetch, or upsert defaults `name='agent_N'`, `beliefs=[]`, `traits={}`) slots naturally into `start()`.

### 1.7 Constraint 7 (no perception-triggered implicit updates) — verified compatible

The overheard-speech tunnel is a **one-way perception pipe** today: `useWorld.ts::captureWorldStateForAgent` reads `useSpeechStore.utterances` → builds `overheard_speech` → `PayloadBuilder` puts it in `payload.perception_summary`. Nothing in that path writes state. The only writes in the whole client cognitive loop are (1) `memoryManager.write` (explicit action), (2) `addMemoryForAgent` (UI mirror), (3) `addSkillForAgent` (skill_mastered message). So the "no automatic identity update on perception" constraint is trivially satisfied by not adding any write in `captureWorldStateForAgent`. Worth stating in code review: the only new write path for identity must be the `identity_update` action handler.

---

## 2. Multi-Agent Routing Issues — Audit Results

These are the remaining live issues in the client-side code that the identity/sleep work will collide with. (Coordinator-era concerns — the `agent_a` auto-sync bug, the dual `agent_a`/`agent_N` namespace, and the `resolveAgentId` mid-stream fallback — are void; no coordinator path exists in the active codebase.)

### 2.1 **Outcome routing attributes non-active agents' outcomes to the active agent** — `useWorld.ts::detectOutcomes`
```js
const activeId = useAgentStore.getState().activeAgentId || 'agent_0';
const loop = activeAgentLoopsRef.current.get(activeId);
for (const outcome of outcomes) loop.handleOutcome(outcome);
```
`pendingOutcomesRef` collects object-triggered outcomes (`piano_note`, `button_press`) **without an agentId**. If agent_1 touches the piano while agent_0 is active, agent_0's pending memory cycle gets the reward. **Fix: stamp `agentId` on the outcome at collection time (in `objectManager.setEventCallback`) by looking up the nearest binder to the interaction, or track per-agent outcome queues.**

### 2.2 **Spawn index collisions after any hypothetical agent removal**
`spawnAgent` uses `humanoidPhysicsBindersRef.current.size` as the next index. No agent removal path exists today, so this is latent, not live — but the identity plan should not assume indices are stable across a session if an admin "sleep/remove" flow (Phase 12) ever deletes an agent. Identity records keyed by `agent_N` will collide if indices are ever reused. **Recommendation: keep a monotonic counter in `useWorld.ts` for spawn IDs, never reuse.**

### 2.3 **No destroy path for client loops** — `useWorld.ts`
`pauseAgentClientLoop`/`resumeAgentClientLoop` exist and are window-exposed (`window.__synthia.pauseAgent/resumeAgent`). But there is no `stopAgentClientLoop`/destroy — `AgentLoop.stop()` exists (clears interval, ends session), yet there is **currently zero call site invoking teardown at all** (the coordinator-era disconnect trigger is gone too). This elevates the item's priority: a sleep-all/despawn flow genuinely has nothing to hook into right now. The identity cache (task 5) will live on the loop, so teardown must flush any pending identity write and close sessions before the loop is dropped.

### 2.4 **Proactive check: orphaned `agent_a` references**
"Coordinator fully removed" doesn't automatically guarantee zero leftover `'agent_a'` strings elsewhere in the client code that were only meaningful in a coordinator-aware world. Given this project's track record (the `FORWARD_BIAS` leftover, the five duplicated arms-down prompts, the WebSocket-still-connecting bug after a cleanup phase), run a fast grep for `'agent_a'` across `src/` before starting the identity work to confirm nothing orphaned survived the coordinator removal. (Separately, `supabase_schema.sql`'s `DEFAULT 'agent_a'` is a DB-side DDL default — harmless since no runtime path produces it, but normalize to `'agent_0'` while the identity migration is in flight.)

---

## 3. Sleep System (Phase 12) — Feasibility & Benefit Assessment

### 3.1 What already exists (more than the plan assumes)

| Plan requirement | Existing implementation |
|---|---|
| **Per-agent manual sleep (likely the "second trigger")** | **Already fully implemented.** `AgentLoop.pause()` / `resume()` (client-side), `pauseAgentClientLoop` / `resumeAgentClientLoop` in `useWorld.ts`, surfaced in the UI: `AgentSettingsModal` "Pause / Resume" button wired through `window.__synthia.pauseAgent/resumeAgent`, with a live status chip (`Agent Loop Active` / `Paused`). `pause()` clears the interval (inference halts → provider cost stops); physics continues — matching the spec's "physics can continue or pause per spec, but inference calls stop." |
| **Lossless state preservation** | `StateRehydrator.capture()/restore()` (`src/world/engine/StateRehydrator.ts`) already implements exactly this: root pos/quat/vel, all joint angles + velocities, and (Fix 2) per-actuator `ctrl` values. This is the "sleeping should never be lossy" machinery — restore() even re-applies `data.ctrl` so a woken agent resumes its exact commanded servo state with no T-pose flop. |
| **AgentLoop pause semantics** | `pause()` does NOT null `currentSessionId` and does NOT call `endSession` — the Supabase session stays open with `ended_at` null. That is arguably correct for sleep (session continues on wake) and arguable for long sleeps (row stays "active"). This needs an explicit decision in Phase 12; the plan doesn't mention session semantics. |

### 3.2 What's missing (the actual work)

1. **Admin "sleep all" control.** Nothing iterates all loops. Needs a small function in `useWorld.ts` (e.g. `sleepAllAgents()`) that calls `pause()` on every loop in `activeAgentLoopsRef.current` — trivially ~10 lines + a UI button (admin panel is Phase 14, so this is a stopgap control). Physics keeps stepping (cost-free: no inference), matching the resolved "physics can continue, inference stops" decision.
2. **A `'sleeping'` status.** `AgentLoopState` (`agentRuntimeStore.ts`) has `'not_started' | 'running' | 'stopped' | 'paused' | 'error'` — "paused" is the loop truth and the UI already renders it as `Paused`. If the product wants "Sleeping" as a first-class concept, add `'sleeping'` to `AgentLoopState` and a `sleep()`/`wake()` alias over `pause()`/`resume()`. Cosmetic, but the plan's test criteria ("Trigger sleep all … confirm every agent's inference halts") only needs pause semantics.
3. **Per-agent status plumbing for "sleep all":** the UI status chip is per-agent already (`agentRuntimeStore.loopStates[agentId]`), so a global "sleep all" button can drive per-agent chip updates with zero new state shape.

### 3.3 Is it beneficial? **Yes — and cheaper than the plan implies**

- **Cost control is real**: each running loop fires an inference call every ~2s; at max_tokens 4096 that is the dominant cost. `pause()` stops it with zero new code paths.
- **The hard 40% of the phase is already done** (per-agent trigger, lossless resume machinery). Remaining work = global control + status naming + session-semantics decision.
- **Risk**: the plan's requirement "sleep/wake cycle confirmed lossless" should be tested against a **world reload** (spawn a second agent → world recompiles via `generateCombinedMCF` → `StateRehydrator` is the only thing preserving state). A "sleep all then spawn a new agent" sequence is the sharpest edge; the existing `StateRehydrator` is proven in the spawn path but has **no test covering a paused-then-spawn sequence**. Suggest a jest test extending `src/world/engine/__tests__/multiAgentComposition.test.ts`.
- **Interaction with identity feature**: slept agents keep their identity cache in memory (loop still exists) — no re-fetch needed on wake, consistent with task 5's caching. If sleep-all also *stops* loops entirely (clear map), identity caches would be lost and a re-fetch on wake would be required — prefer pause-over-destroy.

### 3.4 Recommended final rate-limit + completion answer

- **Final rate-limit value recommended: 1 acceptable edit per 300 s (5 min) of session time per agent**, window tracked via `window_started_at`/`edit_count_window` with cap = 1. Rationale: ~150 cycles between edits at the 2s default cycle gives ample deliberation room; the model can still *try* every cycle and get a visible rejection, which is the intended friction.
- **Log**: yes — implement log-insert as non-skippable: if the `agent_identity_log` insert fails after a successful `agent_identity` update, return an error to the loop and surface it; never `catch` + ignore.
- **System-prompt injection**: reads from the live fetched/cached record (payload-carried `identity` object rendered by `InferenceClient.buildOpenAIMessages`), with the hardcoded default only as the null-fallback for unseeded agents — never as the primary content.

---

## 4. Implementation Plan (revised, codebase-accurate)

**New files**
- `src/world/agent/IdentityManager.ts` — mirrors `MemoryManager`: Supabase client + in-memory mock fallback; `ensureIdentity(agentId)` (fetch or seed defaults), `applyIdentityUpdate(agentId, action)` (rate-limit check → beliefs incremental enforcement → update row → mandatory log insert → returns `{ ok, rejection? }`).
- `src/world/agent/__tests__/identityManager.test.ts` — coverage for the plan's 5 test criteria (default seed, valid edit + log, missing-reason rejection, rate-limit rejection, incremental beliefs diff).

**Modified files**
- `supabase_schema.sql` — add `agent_identity`, `agent_identity_log` + RLS policies (copy existing policy block). Optionally normalize the legacy `DEFAULT 'agent_a'` to `'agent_0'` in the same migration.
- `src/world/agent/AgentLoop.ts` — call `ensureIdentity` in `start()`; hold cached identity; in `parseAndValidateAction()`, extract top-level `identity_update` alongside `memory_write`; dispatch to a new `applyIdentityUpdate(actionData.identity_update, agentId)`; append identity rejections to a new `lastIdentityFeedback` consumed next cycle.
- `src/world/agent/payloadBuilder.ts` — carry `identity` + `identity_feedback` into payload (mirrors `physical_feedback`).
- `src/world/agent/InferenceClient.ts` — render `payload.identity` into the self-awareness block of `buildOpenAIMessages()`; add `identity_update` to the OUTPUT JSON schema contract in the prompt.
- `src/world/hooks/useWorld.ts` — `sleepAllAgents()`; stamp `agentId` on `pendingOutcomesRef` entries (fix §2.1); monotonic spawn counter (fix §2.2); add a real teardown call site for sleep-all/despawn (fix §2.3).
- `src/store/agentRuntimeStore.ts` — (optional) add `'sleeping'` to `AgentLoopState`.
- `src/components/agent/AgentSettingsModal.tsx` — surface identity viewer/editor (read + manual edit with reason) for debugging; "Sleep All" admin stopgap button.

**No coordinator mirroring is required** — the action parser and the sleep primitives exist in exactly one copy (client-side). No dual-path identity dispatch, no coordinator sleep/wake message types, no parity testing burden.

**Sequencing recommendation**
1. Fix the two real client-side routing bugs first (§2.1 outcome misattribution, §2.2 spawn index reuse) — they'd corrupt any per-agent feature built on top.
2. Add a real teardown call site (§2.3) if sleep/despawn work is happening in the same pass.
3. Add identity schema + `IdentityManager` + jest tests (mock store mode) — fully testable headless before touching prompts; client-only now, no dual-path concern.
4. Wire `identity_update` into `parseAndValidateAction` (single copy) + prompt schema + injection.
5. Sleep: implement `sleepAllAgents()` as a wrapper over the existing `pause()`, no parity work needed.

---

## 5. Suggested Reading Order (for a developer new to this repo)

1. `src/world/agent/AgentLoop.ts` — the per-agent cognitive loop: cycle cadence, action parsing, pendingCycles/finalizeCycle, feedback recording. This is the heart of both features.
2. `src/world/agent/InferenceClient.ts` — where the system prompt (identity host) and action JSON schema contract live.
3. `src/world/agent/payloadBuilder.ts` — how world state + memories + feedback become a model payload; the template for carrying `identity`.
4. `src/world/agent/memoryManager.ts` — the Supabase/mock-store pattern `IdentityManager` should clone.
5. `src/world/hooks/useWorld.ts` — multi-agent orchestration: spawning, per-agent binders/loops, captureWorldStateForAgent (overheard speech), outcome routing, pause/resume plumbing.
6. `src/store/agentStore.ts` + `src/store/agentRuntimeStore.ts` — per-agent state map vs. flat mirrors; runtime overrides and loop states.
7. `src/world/engine/StateRehydrator.ts` — the lossless state capture/restore machinery Sleep depends on.

---

## 6. Final Answers to the "Before Ending" Items

- **Final rate-limit value**: **1 edit per 300 s (5 min)** of session time per agent, tracked via `window_started_at`/`edit_count_window` (cap 1, window resets on the first edit after expiry).
- **Log correctness**: Yes — `agent_identity_log` insert is mandatory and non-skippable; a failed log insert after a successful row update surfaces an error rather than being swallowed. Every accepted edit carries the model-provided `reason`.
- **System-prompt injection**: reads from the live fetched/cached `agent_identity` record carried through the payload; a hardcoded default is only the null-fallback for unseeded agents, never the primary content.
- **Sleep system**: **Functional and beneficial** — per-agent pause/resume is already implemented and UI-wired; remaining work is an admin sleep-all control, status naming, and a session-semantics decision. Automatic idle-sleep correctly remains out of scope.
