# SYNTHIA V2 — Phase 11: Audio — TTS / STT / Discussions Log

**Read first:** `PHASE_10_COMPLETE.md`, `v2_hosted_platform_spec.md` (audio/voice section).

## Objective

Per section 14 item 5: give agents a voice (TTS for thought/speech output), give users a voice
input path (STT), and a persistent discussions log capturing spoken exchanges — building on the
Phase 4 `AudioEngine.ts` foundation and the Phase 10 broadcast/visibility system (spoken audio
should respect the same owner/spectator filtering already built).

## Tasks

1. **TTS.** Agent thought-stream output (or a designated "speech" subset of it) gets synthesized to
   audio, broadcast through the same per-viewer pipeline from Phase 10.
2. **STT.** User voice input transcribed and injected through the same user-override channel from
   V1 Phase 5 — no new injection path, reuse the existing one.
3. **Discussions log.** Persistent record of spoken exchanges (agent TTS output + user STT input),
   stored per-agent, respecting the same visibility rules as everything else from Phase 10.
4. **Audio mixing in the shared world.** Multiple agents' voices in the same shared scene need
   correct spatial/volume handling — don't let every agent's TTS play at full volume regardless of
   in-world distance if the spec calls for spatial audio; confirm against
   `v2_hosted_platform_spec.md`'s actual audio requirements rather than assuming.

## Test Before Calling This Phase Done

- Agent speech synthesizes and broadcasts correctly to both owner and spectator viewers, respecting
  Phase 10's filtering.
- User STT input correctly reaches the agent's next inference cycle via the existing override
  channel.
- Discussions log persists and is retrievable, correctly scoped per-agent and per-visibility-rule.
- Multiple simultaneous agent voices in the shared world don't produce an unusable audio mess —
  confirmed against whatever mixing/spatial approach the spec calls for.

## Completion Checklist

- [ ] TTS working, broadcast-filtered correctly
- [ ] STT working through the existing override channel
- [ ] Discussions log persists and respects visibility rules
- [ ] Multi-agent simultaneous audio confirmed usable

## Before Ending This Phase

Write `PHASE_11_COMPLETE.md` and instructions for Phase 12 to begin with zero prior context.
