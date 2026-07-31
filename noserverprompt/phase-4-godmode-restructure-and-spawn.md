# SYNTHIA Client Refactor — Phase 4: God Mode Panel Restructure & Agent Spawning UI

**Read first:** `PHASE_3_COMPLETE.md`.

## Objective

Split God Mode into world-level (global) controls and agent-specific controls, the latter organized
as minimizable per-agent tabs. Add the real "+" spawn button, wired to Phase 2's spawn-offset logic.
Relocate the light/dark theme toggle out of God Mode.

## Tasks

1. **Audit current God Mode contents and classify each control.** Go through everything currently in
   the panel (physics/gravity controls, object spawner, body controls, training mode, goal-setting,
   world reset, theme toggle, etc.) and sort into exactly two categories:
   - **World-level** (applies to the whole shared scene regardless of agent count): gravity, object
     spawner, terrain, world save/load, world reset.
   - **Agent-specific** (only meaningful per-agent): body reset/position, training mode, goal,
     per-agent training/behavior toggles, per-agent balance/gain tuning if exposed to the UI.
   Report this classification before restructuring — don't guess at the split without confirming
   against what's actually in the panel today.
2. **World-level controls stay as one panel section**, unchanged in behavior, just no longer mixed
   with agent-specific controls in the same view.
3. **Agent-specific controls become per-agent tabs**, minimizable/collapsible — one tab per
   currently spawned agent, labeled clearly (agent name/number). Only the currently selected tab's
   controls are visible at once; others collapse to a minimal tab strip, not stacked full panels.
4. **"+" spawn button.** Add a clearly visible spawn control (God Mode panel or main UI chrome —
   pick whichever fits the existing layout better, report the choice). On click, spawns a new agent
   using Phase 2's offset-spawn logic — confirm this button is the *only* path that triggers a new
   agent spawn now; remove/detach any old automatic "spawn at origin on load" behavior that would
   conflict with sequential offset spawning.
5. **Relocate light/dark theme toggle** out of God Mode into persistent top-level UI chrome (e.g.
   the same header area as the agent-selection dropdown from Phase 3) — it's a global app preference,
   not a world or agent-specific setting, and doesn't belong inside a panel that's now being split
   by agent.

## Test Before Calling This Phase Done

- Confirm world-level controls (gravity, object spawn) affect the shared scene correctly regardless
  of which agent tab is active.
- Confirm each agent's tab controls only that agent — verify no cross-agent bleed the same way
  Phase 2 verified action isolation, but now through the actual UI.
- Spawn 4+ agents via the "+" button sequentially, confirm each lands at a correct offset with no
  overlap, and confirm a tab appears for each.
- Confirm theme toggle works correctly from its new location and no longer appears in God Mode.

## Completion Checklist

- [ ] World vs. agent-specific control classification reported and confirmed
- [ ] Per-agent tabs implemented, minimizable, correctly isolated
- [ ] "+" button is the sole agent-spawn trigger, old auto-spawn-at-origin behavior removed
- [ ] Theme toggle relocated and confirmed working

## Before Ending This Phase

Write `PHASE_4_COMPLETE.md`: the final world/agent-specific control classification, where the "+"
button and theme toggle ended up, and instructions for Phase 5 to begin with zero prior context.
