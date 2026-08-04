# Phase 6.1 Complete — Agent-to-Agent Communication (Text Tunnel)

This document confirms the successful completion of **Phase 6.1: Agent-to-Agent Communication (Text Tunnel)** for the SYNTHIA Client Refactor.

---

## 1. Accomplishments & Architectural Decisions

- **Client-Side Text Tunnel Perception:**
  - Designed and built a fully client-side agent-to-agent overhearing/text perception tunnel, bypassing audio/STT completely.
  - Retained full independence of the human-facing TTS (which speaks full, undegraded audio regardless of agent distances).
- **Transient Utterance Registry (`useSpeechStore`):**
  - Extended `useSpeechStore` with an in-memory `utterances` registry tracking:
    - Unique ID
    - Speaker ID
    - Spoken text
    - Speaker's head/position at the exact *moment of speech*
    - Timestamp
    - `deliveredTo` list (to prevent duplicate-delivery bugs across asynchronous independent agent loops).
  - Explicitly excluded the dynamic `utterances` state from local storage persistence to prevent memory state bloat.
- **Physical Occlusion Check & Raycasting:**
  - Implemented 3D line-of-sight checks using `THREE.Raycaster` on the main loop inside `captureWorldStateForAgent` in `useWorld.ts`.
  - Excluded the speaker's own mesh, the listener's own mesh, and the floor mesh to prevent false positives and self-collisions.
  - Allowed other active agents' bodies to naturally act as realistic physical occluding obstacles.
- **Euclidean Distance & Additive Degradation Math:**
  - Defined a default max hearing distance constant of **15 meters**.
  - Computed sound propagation loss as a baseline percentage: `lossPercentage = distance / maxHearingRange`.
  - Implemented a **+0.4 flat additive occlusion penalty** (clamped to `1.0`) when line-of-sight is obstructed, which correctly enforces a meaningful degradation floor regardless of distance.
  - Degraded text at the **word-level** (replacing random words with `[inaudible]` based on `lossPercentage * 0.6` probability), producing legible partial sentences at moderate distance and complete redaction only near the max range boundary.
- **Structured Schema & Dataset Export Integration:**
  - Declared `overheard_speech?: any[]` inside the `InferPayload` interfaces (`src/types/payload.ts` and `coordinator/src/types/payload.ts`).
  - Formatted the overheard list inside `payloadBuilder.ts` and appended it cleanly to `perception_summary` to give LLMs situational awareness.
  - Serialized the structured `overheard_speech` array inside the written memory entry's `audio_state` column to include the text, distance, and occlusion state cleanly in dataset exports and model training sets.

---

## 2. Verification and Quality Checks

- **Hearing range constant:** Set to `15` meters.
- **Tuning parameters used:**
  - Baseline loss: `distance / 15`
  - Occlusion penalty: `+0.4` flat additive, clamped to a maximum of `1.0`.
  - Word loss probability: `lossPercentage * 0.6`
- **Confirmation of Human-TTS-Unaffected test:**
  - Humans hear undegraded, full clarity speech from every agent regardless of distance/occlusion. The text tunnel remains purely an *agent-perception* channel.
- **Type Checking & Testing:**
  - Both front-end and coordinator compile perfectly with absolutely ZERO type/compilation errors.
  - All fastify, websocket, and memory-saving tests passed cleanly.
