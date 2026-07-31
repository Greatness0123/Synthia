# SYNTHIA Client Refactor — Phase 5: Agent Settings Modal & Per-Agent Dataset Export

**Read first:** `PHASE_4_COMPLETE.md`.

## Objective

An agent settings modal whose content is entirely driven by Phase 3's `activeViewAgentId` selection
— open the modal, see the currently-selected agent's settings, nothing else. Dataset export becomes
per-agent, not a single global export.

## Tasks

1. **Agent settings modal.** Opened via whatever trigger fits the existing UI pattern (a settings
   icon near the agent dropdown, or from within the God Mode agent tab from Phase 4 — pick
   whichever avoids duplicating the same controls in two places, report the choice). Content is
   read from `activeViewAgentId` — changing the top dropdown selection while the modal is open
   should update its contents to match, not require closing and reopening.
2. **Scope of modal contents vs. God Mode agent tabs.** Decide and document a clear boundary: if
   God Mode's per-agent tab (Phase 4) already covers body/training/goal controls, the modal should
   cover a distinct set (e.g. connection/provider settings, memory viewer, skill/rung display,
   per-agent export trigger) — avoid building the same controls twice in two different UI surfaces.
3. **Per-agent dataset export.** Extend the existing `datasetExporter.ts` to scope by agent — each
   agent's session data (joint states, actions, thoughts, memory writes) exports as its own
   CSV/JSONL output, not merged across all active agents into one file. Trigger point: the export
   button, scoped to whichever agent is selected when it's clicked (either from the modal or God
   Mode tab, per whatever placement was decided in task 1).
4. **Multi-agent export edge case.** If a user wants all agents' data at once, that's a deliberate
   "export all" action producing separate per-agent files (or a combined file with a clear agent-id
   column) — not the default behavior of a single export button. Confirm which of these two the
   default single-agent export button produces, and add an explicit "export all" as a separate,
   clearly distinct control if needed.

## Test Before Calling This Phase Done

- With 3 agents active, open the settings modal for agent 1, confirm correct contents, switch the
  top dropdown to agent 2 without closing the modal, confirm contents update to agent 2's data.
- Export agent 1's dataset, confirm the output contains only agent 1's data — no bleed from agents
  2 or 3.
- Confirm no control is genuinely duplicated between the God Mode agent tab and the settings modal
  in a way that could let them silently disagree (e.g., both showing a training-mode toggle that
  isn't actually synced to the same underlying state).

## Completion Checklist

- [ ] Modal content correctly driven by `activeViewAgentId`, live-updates without reopening
- [ ] Modal vs. God Mode tab content boundary decided and documented, no duplicated controls
- [ ] Per-agent export confirmed correctly scoped, no cross-agent data bleed
- [ ] "Export all" (if built) clearly distinct from single-agent export

## Before Ending This Phase

Write `PHASE_5_COMPLETE.md`: the final modal-vs-God-Mode-tab content split, and instructions for
Phase 6 to begin with zero prior context.
