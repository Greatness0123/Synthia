# SYNTHIA Client Refactor — Phase 7: Cleanup, Client-Side Keepalive & Final Removal

**Read first:** `PHASE_6_COMPLETE.md`.

## Objective

Remove everything the old always-on coordinator process needed that no longer applies, replace the
server-side Supabase keepalive with a client-side equivalent, and confirm the whole refactor holds
together as one coherent client-side app.

## Tasks

1. **Remove video export entirely.** Delete the feature, its UI entry points, and any
   FFmpeg/server-rendering-dependent code paths — this was explicitly dropped from scope at the
   start of this refactor, not deferred. Confirm no dangling references remain (dead imports, unused
   UI buttons pointing at removed functionality).
2. **Remove the old coordinator process entirely.** No leftover `server.ts`, no port 3001
   references, no WebSocket server code — everything it did now lives in Phase 1's stateless proxy
   and Phase 2's client-side `AgentLoop`. Grep the codebase for any remaining references to the old
   architecture before considering this done.
3. **Client-side Supabase keepalive.** Free-tier Supabase projects pause after a period of
   inactivity. Replace the old server-cron-based keepalive with a simple client-side interval
   (e.g., a trivial query fired every N minutes while the app tab is open). **Be honest about the
   real limitation this introduces:** this only works while someone actually has the app open
   periodically — if genuinely nobody opens it for the full inactivity window, the project can
   still pause. That's an accepted, reasonable tradeoff for a single-user bootstrapped app, not a
   silent gap — document it as a known limitation rather than presenting it as equivalent to a real
   guaranteed cron.
4. **Full-session smoke test.** Spawn 3+ agents from a cold start, run a full realistic session
   (inference, movement, TTS, camera switching, God Mode tab switching, per-agent export) and
   confirm nothing from the old architecture is silently still required or expected to be present.

## Test Before Calling This Phase Done

- Full grep confirms zero references to the removed video export feature or the old coordinator
  process anywhere in the codebase.
- Client-side Supabase keepalive confirmed actually firing on the expected interval during a real
  session.
- End-to-end multi-agent session (spawn, inference, movement, TTS, camera, export) runs cleanly
  from a cold start with no console errors referencing removed/relocated functionality.

## Completion Checklist

- [ ] Video export fully removed, no dangling references
- [ ] Old coordinator process fully removed, no dangling references
- [ ] Client-side keepalive implemented and confirmed firing, limitation documented
- [ ] Full multi-agent session smoke test passed cleanly

## Before Ending This Phase

Write `PHASE_7_COMPLETE.md` — this doubles as the completion record for the entire refactor: confirm
all 7 phases' completion docs are present, note any deviations across the whole effort, and record
the final, current architecture description for whoever picks this project up next.
