# SYNTHIA V2 — Phase 12: Sleep System

**Read first:** `PHASE_11_COMPLETE.md`, `v2_hosted_platform_spec.md` section 13 item 5 (already
resolved: capacity management is primarily manual via an admin "sleep all" control, watching
free-tier limits directly; automatic idle-sleep is an explicitly optional future addition, not a
blocker for this phase) and section 14 item 6 ("both triggers").

## Objective

A way to pause/suspend agents to manage inference cost and free-tier capacity — both the manual
admin trigger (the primary, required mechanism per the resolved decision) and whatever the second
trigger is per section 14's "both triggers" phrasing (check `v2_hosted_platform_spec.md`'s sleep
section for the second mechanism — likely per-agent manual sleep by the owner, in addition to the
admin's global "sleep all").

## Tasks

1. **Manual admin "sleep all."** A control (likely part of the admin panel groundwork, even though
   the full admin panel is Phase 14) that suspends all agents' inference loops — physics can
   continue or pause per spec, but inference calls stop, halting provider cost.
2. **Second trigger** — confirm the exact mechanism from `v2_hosted_platform_spec.md` (likely
   owner-initiated per-agent sleep) and implement it.
3. **Sleep state persistence.** A slept agent's state (position, memory, everything) must be
   correctly preserved and resumable — sleeping should never be lossy.
4. **Automatic idle-sleep is explicitly NOT required this phase** — confirmed optional future work
   per the resolved decision. Don't build it now.

## Test Before Calling This Phase Done

- Trigger "sleep all," confirm every agent's inference halts, confirm physics/world state is
  preserved correctly.
- Trigger the second (per-agent) sleep mechanism on a single agent, confirm only that agent is
  affected, others continue normally.
- Wake a slept agent, confirm it resumes with correct prior state — no memory loss, no position
  reset, no broken continuity in its thought stream/context.

## Completion Checklist

- [ ] Admin "sleep all" working and confirmed to halt inference cost
- [ ] Second (per-agent) trigger identified from spec and implemented
- [ ] Sleep/wake cycle confirmed lossless

## Before Ending This Phase

Write `PHASE_12_COMPLETE.md` and instructions for Phase 13 to begin with zero prior context.
