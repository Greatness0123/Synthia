# SYNTHIA V2 — Phase 10: Visibility Tiers & Spectator Mode

**Read first:** `PHASE_9_COMPLETE.md`, `v2_hosted_platform_spec.md` section 13 items 3–4 (already
resolved decisions — two-tier Listed/Unlisted visibility, owner sees raw thoughts always, non-owner
sees the same light safety filter speech already has, tier controls public-list discoverability
only, no difference in rendering/hearing/thought access by tier).

## Objective

Per section 14 item 4: **the hardest backend piece in the whole platform** — per-viewer filtered
broadcast, plus spectator mode. Budget real time for this phase; don't compress it.

## Tasks

1. **Visibility tiers.** Listed / Unlisted per-agent setting, owner-controlled. Per the already-
   resolved decision: this controls *only* whether the agent appears in a public discoverable list —
   it does not change what a viewer who does find/access it can see, hear, or read.
2. **Per-viewer filtered broadcast.** A spectator viewing any agent (Listed or Unlisted, if they
   have the link/access) sees: the shared-world physics normally, that agent's raw audio/visual
   feed, and that agent's thoughts through the same light safety filter already applied elsewhere —
   never raw unfiltered thoughts unless they're the owner. This is the core hard part: the broadcast
   pipeline needs to correctly branch per-viewer (owner vs. non-owner) for every agent simultaneously
   in a shared, potentially many-agent world — not a single global filter switch.
3. **Spectator mode.** A non-owning user can browse Listed agents and watch, read filtered thoughts,
   hear audio — without any control access. Public list view of Listed agents.
4. **Access without listing.** An Unlisted agent should still be viewable by someone with direct
   access (owner explicitly shares it) even though it doesn't appear in public discovery — confirm
   this distinction is implemented correctly, not conflated with "Unlisted = private."

## Test Before Calling This Phase Done

- Owner views their own agent: raw, unfiltered thoughts.
- A different logged-in user spectates the same agent (Listed): filtered thoughts, correct safety
  filter applied, full audio/visual otherwise unrestricted.
- Confirm an Unlisted agent doesn't appear in the public list but is still viewable via direct
  link/access.
- Confirm this holds correctly with multiple simultaneous spectators watching different agents in
  the same shared world at once — this is specifically what makes the broadcast piece hard; test
  concurrency, not just a single viewer at a time.

## Completion Checklist

- [ ] Owner vs. non-owner thought filtering confirmed correct
- [ ] Listed/Unlisted discoverability behaves exactly as scoped (list-only distinction)
- [ ] Multi-spectator concurrent viewing confirmed working, correctly isolated per viewer
- [ ] Direct-access-without-listing confirmed working for Unlisted agents

## Before Ending This Phase

Write `PHASE_10_COMPLETE.md`: broadcast architecture decisions (this is the piece worth documenting
in the most detail, given it's the hardest part of the whole platform), and instructions for
Phase 11 to begin with zero prior context.
