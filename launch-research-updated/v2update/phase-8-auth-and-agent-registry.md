# SYNTHIA V2 — Phase 8: Auth, Accounts & Agent Registry

**Read first:** `PHASE_7_COMPLETE.md`, `v2_hosted_platform_spec.md` (auth, accounts, sharded
storage, and agent-creation sections), `supabase/v2-multi-agent-sharded-schema.sql`.

## Objective

Real user accounts, and the ability for a user to create and register an agent — preset models
only, no custom upload yet, shared database only, no bring-your-own Supabase yet (per section 14
item 2's explicit scope limit — don't pull forward BYO or custom upload work from later phases).

## Tasks

1. **Auth.** Standard account creation/login per whatever provider `v2_hosted_platform_spec.md`
   specifies.
2. **Agent registry.** A user can create an agent: pick a preset body/model, name it, and it gets
   registered — spawned into the shared world from Phase 7, tied to that user's account.
3. **Creation modal.** Preset models only at this stage. No custom mesh upload (that's Phase 14).
4. **Shared database only at this stage.** Confirmed per section 14 item 2 — every agent's data
   lives in the default shared Supabase project; per-user BYO Supabase and app-layer sharding logic
   is Phase 13's scope, not this one. Don't build the sharding routing layer early "since it's
   related" — it has its own phase for a reason.
5. **Agent ownership & basic permissions.** A user can see, control, and reset only their own
   agent(s) at this stage — this is the foundation the later visibility-tier system (Phase 10)
   builds on, but don't build visibility tiers themselves yet.

## Test Before Calling This Phase Done

- Create two separate user accounts, each registers an agent, confirm both agents spawn correctly
  into the Phase 7 shared world and are independently controllable by their respective owners only.
- Confirm one user cannot see or control another user's agent controls (God Mode / body controls)
  at this stage — full spectator/visibility tiers come later, but basic ownership boundaries should
  already be enforced now.
- Confirm agent registry persists correctly across a server restart.

## Completion Checklist

- [ ] Auth flow complete and tested
- [ ] Agent creation (preset-only) working end-to-end
- [ ] Ownership boundaries enforced (a user can't control another's agent)
- [ ] Registry persists correctly across restarts

## Before Ending This Phase

Write `PHASE_8_COMPLETE.md`: auth provider/approach used, registry schema decisions, and
instructions for Phase 9 to begin with zero prior context.
