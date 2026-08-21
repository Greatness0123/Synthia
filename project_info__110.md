`project_info__108.md` has been **overwritten in place** (v2, no new file created) with the coordinator items stripped out and the remaining content renumbered. Here is the corrected picture:

## What changed in `project_info__108.md` (v2)

**Removed entirely (void — coordinator path no longer exists):**
- ~~Section 2.1 "CRITICAL: hardcoded `agent_a` in coordinator auto-sync"~~ — described a bug in `CoordinatorContext.tsx`, dead code. Not a real bug.
- ~~Section 2.2's coordinator half "dual namespace `agent_a` server vs `agent_0..N` client"~~ — no server-side namespace exists anymore. Only `agent_0..N`.
- ~~Section 2.4 "`resolveAgentId` fallback"~~ — that file is gone.
- ~~Section 3.2 point 3 "coordinator-server parity"~~ — no second path needing parity.
- ~~Section 4's `coordinator/src/agentLoop.ts` + `coordinator/src/server.ts` modified-files line item~~ — nothing to mirror.
- ~~Section 5's reading-order item 7 ("legacy server-side path")~~ — nothing to read.
- ~~Section 1.1's "must be added to both or the coordinator path silently drops identity updates" warning~~ — there's exactly one copy of the parser now. Identity lands in client-side `AgentLoop.ts` only.

**Retained but escalated:**
- Old §2.6 → new **§2.3 "No destroy path for client loops"** — now *stronger* than before: the coordinator-disconnect trigger is gone too, so there is **zero call site invoking `AgentLoop.stop()` at all**. A sleep-all/despawn flow genuinely has nothing to hook into. Priority bumped.

**Retained as written (coordinator-independent):**
- §1.2–1.7 (schema, rate limiting, beliefs enforcement, caching, injection point, perception-tunnel write-path check)
- §2.1 outcomes misattribution → new §2.1
- §2.5 spawn index reuse → new §2.2
- §3.1/3.3/3.4 (existing pause/resume machinery, cost reasoning, sleep-then-spawn test recommendation)

**Added (your proactive-check suggestion):**
- New **§2.4 "Proactive check: orphaned `agent_a` references"** — grep `src/` for `'agent_a'` before starting identity work (the `FORWARD_BIAS`/duplicated-prompts/WebSocket-leftover pattern). Also flagged: `supabase_schema.sql` still has `DEFAULT 'agent_a'` on the existing tables — harmless (no runtime path produces it) but worth normalizing to `'agent_0'` while the identity migration is in flight.

**Corrected sequencing (replaces old §4 order):**
1. Fix client-side routing bugs (§2.1 outcome misattribution, §2.2 spawn index reuse)
2. Add a real teardown call site (§2.3) if sleep/despawn is in the same pass
3. Identity schema + `IdentityManager` + jest tests (client-only, mock store)
4. Wire `identity_update` into `parseAndValidateAction` (single copy) + prompt schema + injection
5. Sleep: `sleepAllAgents()` wrapper over existing `pause()`, no parity work

**Net effect:** implementation is meaningfully smaller — no dual-path dispatch, no coordinator sleep/wake message types, no parity testing burden.

To answer your closing question: **yes, the corrected summary is enough to hand off directly** — it's now reflected in the authoritative file. If you'd still like the full corrected Jules prompt written end-to-end with this reduced scope, I can produce it on request — but note I'm in Explore Mode, so that prompt itself would be delivered as a document/report for Act Mode to execute, not as a code change here.