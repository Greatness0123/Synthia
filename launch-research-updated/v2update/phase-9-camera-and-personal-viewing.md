# SYNTHIA V2 — Phase 9: Camera & Personal Viewing

**Read first:** `PHASE_8_COMPLETE.md`, `v2_hosted_platform_spec.md` (camera system section),
`v2_spec.md`'s dual-panel UI mockup for visual reference on layout patterns (still useful as UI
reference even though that document's overall architecture is superseded).

## Objective

A user can view and interact with their own agent(s) in the shared world — camera dropdown, POV
switching, per-agent thought/status panels. **No public/spectator system yet** (section 14 item 3's
explicit scope limit — that's Phase 10).

## Tasks

1. **Camera dropdown.** World (orbiting third-person of the full shared scene), per-owned-agent POV,
   split-POV if the user owns multiple agents, Model Input view (the raw 448×448 frame the AI
   actually sees).
2. **Per-agent panel layout.** Adapt `v2_spec.md`'s dual-panel mockup pattern (thought stream,
   injection input, memory count, skill/rung indicator, status) to however many agents the viewing
   user owns — one panel per owned agent, not fixed at two.
3. **Scoping.** A user can select and view only their own agent(s) at this phase — viewing other
   users' agents (even read-only) is explicitly Phase 10's spectator system, not this phase's.

## Test Before Calling This Phase Done

- User with 2 owned agents can switch between World view, each agent's POV, and split-POV cleanly.
- Confirm a user cannot select another user's agent in the camera dropdown at this stage.
- Confirm the Model Input view genuinely matches what the Phase 5/7 inference payload actually sent
  — not a separately-rendered approximation.

## Completion Checklist

- [ ] Full camera dropdown working for all owned-agent view modes
- [ ] Per-agent panels scale correctly to however many agents a user owns
- [ ] Cross-user agent selection correctly blocked at this stage

## Before Ending This Phase

Write `PHASE_9_COMPLETE.md` and instructions for Phase 10 to begin with zero prior context.
