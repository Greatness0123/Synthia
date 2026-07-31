# SYNTHIA Client Refactor — Phase 2: Client-Side Multi-Agent Architecture

**Read first:** `PHASE_1_COMPLETE.md`, and this project's earlier-established MuJoCo multi-agent
pattern — one shared `MjModel`/world with prefixed subtrees per agent (`agent_0_`, `agent_1_`,
etc.), avoiding cross-world physics synchronization entirely. That pattern was originally scoped
for a server-side world; it applies identically here, just running in the browser's own MuJoCo WASM
instance instead of a backend.

## Objective

Everything the old coordinator process did — prompt building, `InferPayload` assembly, action
parsing/normalization, memory read/write, per-agent inference cycling — moves into client-side
code, one independent loop per active agent, each calling Phase 1's proxy routes.

## Tasks

1. **Multi-agent MJCF composition.** Extend the existing single-humanoid MJCF generation to compose
   N humanoids into one model, each bone/body/actuator name prefixed per agent
   (`agent_0_mixamorigspine`, etc.). Reuse the existing `MJCFHumanoidTemplate.ts` generator per
   agent, concatenate into one compiled world — don't build a second, parallel MJCF-generation path.
2. **Per-agent `AgentLoop` (client-side, not a server process).** Port the coordinator's
   `agentLoop.ts`, `payloadBuilder.ts`, and action-parsing logic directly into client TypeScript
   modules. Each active agent gets its own independent loop instance — `setInterval`-driven (or a
   requestAnimationFrame-gated cycle), calling Phase 1's proxy route, running fully independent of
   other agents' loops. One agent's slow inference or a failed provider call must not stall or
   block another agent's cycle.
3. **Spawn positioning — replace hardcoded origin spawn.** The first spawned agent goes to world
   origin, exactly as today. Every subsequent agent spawns at a calculated offset from existing
   agents — enough spacing to avoid initial body-overlap explosions (reuse the same "no
   interpenetration at spawn" discipline established for the single-agent stance-pose work earlier
   in this project). A simple deterministic layout (e.g., agents arranged along a line or circle
   with fixed minimum spacing, recalculated as agents are added/removed) is sufficient — no need for
   collision-aware dynamic placement logic.
4. **Per-agent memory namespace.** If memory persistence (Supabase) is still in scope at this stage,
   each agent's memory writes/reads are scoped by a client-generated `agent_id`, fully isolated from
   other agents in the same session — same isolation principle as the earlier V2 hosted-platform
   design, just enforced client-side via query scoping rather than server-side sharding.
5. **Per-agent action application.** Each agent's parsed joint targets apply only to that agent's
   own prefixed actuators in the shared MuJoCo model — verify explicitly that no cross-agent bleed
   is possible (an agent's AI accidentally commanding another agent's joints due to a naming
   collision or unscoped lookup).

## What This Phase Does NOT Do

No camera/UI work (Phase 3), no God Mode restructuring (Phase 4), no TTS (Phase 6). This phase is
purely: N agents' minds and bodies coexisting correctly and independently in one client session.

## Test Before Calling This Phase Done

- Spawn 3 agents sequentially via whatever temporary trigger exists at this stage (real "+" button
  UI comes in Phase 4/5) — confirm no spawn-time overlap/explosion, confirm each stands
  independently using the already-established stance/balance system.
- Confirm each agent's inference loop runs on an independent cadence — stall one agent's provider
  call deliberately (point it at a bad endpoint) and confirm the other two continue unaffected.
- Confirm memory writes from one agent never appear under another agent's namespace.
- Confirm commanding one agent's joints has zero effect on any other agent's body.

## Completion Checklist

- [ ] Multi-agent MJCF composition working, prefix scheme confirmed collision-free between agents
- [ ] Independent per-agent AgentLoop instances confirmed non-blocking of each other
- [ ] Spawn offset logic replaces hardcoded origin spawn, tested with 3+ sequential spawns
- [ ] Memory and action-application isolation confirmed per agent

## Before Ending This Phase

Write `PHASE_2_COMPLETE.md`: the exact prefix/naming convention used, spawn offset algorithm and
spacing value chosen, and instructions for Phase 3 to begin with zero prior context.
