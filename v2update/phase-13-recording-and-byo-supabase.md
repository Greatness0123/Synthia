# SYNTHIA V2 — Phase 13: Recording & BYO Supabase

**Read first:** `PHASE_12_COMPLETE.md`, `v2_hosted_platform_spec.md` (recording section, and the
BYO/sharding architecture section), `v2_hosted_platform_spec.md` section 13 item 2 (already
resolved: app-layer routing across your own sharded Supabase projects as the default, with optional
user-supplied opt-out — FDW is reserved only for optional admin cross-cutting convenience, not the
default path), `supabase/v2-multi-agent-sharded-schema.sql`.

## Objective

Per section 14 items 7–8: session recording/playback, and letting users optionally supply their own
Supabase project instead of the platform's default sharded storage.

## Tasks

1. **Recording.** Capture a session (or session segment) for later playback — likely reusing the
   V1 dataset export mechanism's underlying data capture, extended with a playback UI rather than
   only flat-file export.
2. **App-layer sharding (the default path, build this first).** The routing layer that spreads
   agent data across multiple owned Supabase projects at the application layer — this is the
   *default* storage mechanism per the resolved decision, not an edge case. Get this solid before
   BYO.
3. **BYO Supabase (opt-out to the default).** A user can supply their own Supabase project
   credentials instead of using the platform's sharded default. This is explicitly the *second*
   priority within this phase per item 8's "app-layer first" framing — build and stabilize the
   default sharded path, then layer BYO as an alternative route through the same app-layer routing
   logic, not a parallel system.
4. **FDW note.** Per the resolved decision, Postgres FDW (foreign data wrapper) is reserved only for
   *optional admin* cross-cutting queries later (Phase 14's admin panel) — do not build FDW-based
   routing as part of this phase's core user-facing path.

## Test Before Calling This Phase Done

- Record a session, play it back, confirm fidelity against the live session.
- Confirm the default sharded app-layer routing correctly distributes and retrieves a new agent's
  data without the user doing anything.
- Confirm a user who opts into BYO Supabase has their agent's data correctly routed to their own
  project instead of the shard, and that switching doesn't corrupt or strand existing data.

## Completion Checklist

- [ ] Recording/playback working with confirmed fidelity
- [ ] Default app-layer sharded routing confirmed working as the automatic default
- [ ] BYO Supabase opt-out confirmed working, correctly routed through the same app-layer logic

## Before Ending This Phase

Write `PHASE_13_COMPLETE.md` and instructions for Phase 14 to begin with zero prior context.
