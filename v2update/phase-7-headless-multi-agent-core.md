# SYNTHIA V2 — Phase 7: Headless Multi-Agent Core

**Read first:** `PHASE_6_COMPLETE.md` (V1 must show a clean stability sign-off before this phase
starts), `v2_hosted_platform_spec.md` in full — this is the primary reference for all of Phases
7–14. Section 14, item 1, is this phase's exact scope: prove the hardest, riskiest part works
before building any user-facing layer on top of it.

## Objective

A real server process running N agent bodies in one shared MuJoCo world, each with its own
independent inference loop, memory, and thought stream — **no auth, no frontend multi-tenancy, no
visibility system yet.** This phase is purely: does shared-world multi-agent physics + concurrent
independent inference actually work at all.

## Tasks

1. **Server-side physics world.** Move the Phase 2–4 MuJoCo world (humanoid template, object pool,
   collision scheme) to run server-side rather than in-browser. This is the biggest structural
   change from V1 — the physics authority moves off the client.
2. **N-agent instantiation.** Each agent is a full copy of the V1 humanoid body (Phase 2's MJCF
   template, spawned at a distinct position) sharing one MuJoCo world/scene — same physics step,
   same collision space, so agents can genuinely see and collide with each other.
3. **Independent inference loops.** Each agent runs its own Phase 5 sense→think→act loop, own
   memory namespace, own thought stream, own system prompt — completely isolated from each other
   except through physical/visual interaction in the shared world. One agent's provider failure or
   slow inference must not block or slow another agent's loop.
4. **Cross-agent visibility (object-context injection).** Per `v2_spec.md`'s original design (still
   valid under the hosted platform): each agent's sensory payload includes other visible agents as
   generic object entries (`{id, type: "humanoid_figure", position, moving, note}`) — no explicit
   "another AI exists" framing unless/until an explicit awareness upgrade is deliberately added
   later. This should emerge from visual perception, not be hand-fed as a fact.
5. **Coordinator loop management.** Each agent's loop runs on its own interval/cadence, fully
   independent — confirm explicitly that killing or stalling one agent's inference does not affect
   others' timing.

## Test Before Calling This Phase Done

- Run at least 3 concurrent agents in the shared world for an extended session. Confirm each
  maintains its own stable standing/balance independent of the others (Phase 3's balance system
  should require zero changes to work per-agent — if it doesn't, that's a signal something in the
  physics-authority move broke an assumption from V1).
- Confirm agents can physically collide with each other without destabilizing the shared world step.
- Deliberately stall one agent's provider call (e.g. point it at a dead endpoint) and confirm the
  other agents' loops continue unaffected.
- Confirm each agent's memory writes are correctly isolated — no cross-contamination between
  agents' namespaces at this stage (full schema separation comes in Phase 8, but logical isolation
  should already hold here).

## Completion Checklist

- [ ] 3+ agents run concurrently and stably in one shared world
- [ ] Physical inter-agent collision confirmed working
- [ ] Inference loop isolation confirmed (one agent's failure doesn't affect others)
- [ ] Cross-agent visual object-context injection confirmed working
- [ ] Memory isolation confirmed at the logical level

## Before Ending This Phase

Write `PHASE_7_COMPLETE.md`: server architecture decisions made, how many agents were tested
concurrently and at what stability, any V1 assumptions that broke moving physics server-side and
how they were resolved, and instructions for Phase 8 to begin with zero prior context.
