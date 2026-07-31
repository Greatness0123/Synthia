# SYNTHIA Client Refactor — Phase 6: Text-to-Speech Integration

**Read first:** `PHASE_5_COMPLETE.md`.

**Decision to make before implementation, not during:** this phase implements the browser-native
**Web Speech API** (`speechSynthesis`) as the primary TTS path — zero network calls, zero external
dependency, officially supported, genuinely free forever, and consistent with this whole refactor's
"fully client-side, minimal fragile dependencies" direction. **Edge TTS** (the free but unofficial,
reverse-engineered Microsoft Edge Read Aloud API) is built as an optional, swappable secondary
voice provider — better voice quality, but depends on an undocumented endpoint that can break
without warning or support recourse. Implement Web Speech API first, working end-to-end, before
touching Edge TTS at all. Only add Edge TTS if, after hearing both, the voice quality difference is
worth the added fragility — that's a judgment call to make with working audio in hand, not a
default to build toward blindly.

## Objective

Give each agent a synthesized voice for its thought/speech output, using a pluggable voice-provider
interface so the Web Speech API and (optional) Edge TTS can be swapped without touching calling
code.

## Tasks

1. **Voice provider interface.** Define a small abstraction (`speak(text, voiceOptions) => Promise`)
   that both implementations satisfy — calling code (wherever agent speech output triggers TTS)
   never needs to know which provider is active.
2. **Web Speech API implementation.** `window.speechSynthesis` + `SpeechSynthesisUtterance`. Handle
   the well-known quirk where available voices load asynchronously (`voiceschanged` event) — don't
   assume voices are immediately available on first call. Per-agent voice assignment: if multiple
   agents are speaking, assign each a distinct available system voice where possible, so agents are
   audibly distinguishable in a multi-agent session — this matters more here than it would for a
   single-agent build.
3. **Multi-agent audio handling.** Multiple agents' speech in the same session needs sane behavior —
   decide and implement whether concurrent speech overlaps, queues, or ducks based on which agent is
   currently selected in the Phase 3 dropdown (e.g., only the actively-viewed agent's speech plays
   at full volume, others attenuated or muted) — don't let 3+ agents talking simultaneously produce
   an unusable audio mess by default.
4. **(Optional) Edge TTS implementation**, only after step 2 is confirmed working: a thin wrapper
   calling the unofficial endpoint, satisfying the same provider interface from task 1. Since this
   is an external, undocumented dependency, wrap calls in a fallback — if an Edge TTS call fails,
   fall back to Web Speech API automatically rather than agent speech silently failing.
5. **Speech-to-text (STT) for user voice input**, if in scope for this phase — reuse the browser's
   native `SpeechRecognition` API (also free, also zero-dependency) feeding into the existing
   user-injection channel from earlier phases, same reuse principle as everything else in this
   refactor.

## Test Before Calling This Phase Done

- Confirm Web Speech API TTS works reliably across a full session, including the voices-load-async
  quirk (test on a fresh page load, not just after voices have already warmed up once).
- With 3 agents active and speaking, confirm the audio behavior (overlap/queue/duck) is intentional
  and usable, not chaotic by accident.
- If Edge TTS was added: deliberately break/block the endpoint and confirm graceful fallback to Web
  Speech API rather than silent failure.

## Completion Checklist

- [ ] Voice provider interface implemented, Web Speech API working end-to-end
- [ ] Multi-agent concurrent speech behavior deliberately decided and implemented
- [ ] Edge TTS added only if explicitly chosen after comparing quality, with confirmed fallback
- [ ] STT wired into existing injection channel, if in scope

## Before Ending This Phase

Write `PHASE_6_COMPLETE.md`: which voice provider(s) ended up in use and why, and instructions for
Phase 7 to begin with zero prior context.
