# SYNTHIA Client Refactor — Phase 3: Camera & Agent-Selection System

**Read first:** `PHASE_2_COMPLETE.md`.

## Objective

A top-center dropdown selecting "which agent you're currently viewing through," driving every
camera mode and the AI-input PiP as a function of that single selection — no independent, separately
-tracked camera state per mode.

## Tasks

1. **Top-center agent selector dropdown.** Lists all currently spawned agents. Selecting one sets a
   single `activeViewAgentId` in app state — this becomes the one source of truth every camera mode
   and the settings modal (Phase 5) reads from.
2. **First person.** Renders from the selected agent's own POV camera (the existing 448×448
   offscreen render target used for the AI's own vision) — switches instantly when the dropdown
   selection changes, no re-initialization delay.
3. **Second person — follow/tracking third-person.** Camera trails behind and above the selected
   agent, tracking its position and (optionally) facing direction as it moves. This is distinct
   from third person below — it's locked to following one specific agent, not freely orbitable.
4. **Third person — general orbital, needs actual implementation.** Free-roaming camera with full
   orbital (rotate around a point) and axial (pan/zoom along camera axes) control, not locked to
   following any single agent — a general scene view. Confirm what currently exists for this mode
   (`CameraManager.ts` per this project's file manifest) and extend/complete it rather than
   assuming it's already fully built — earlier phases only guaranteed a basic orbital camera for
   single-agent viewing; multi-agent scenes may need this reworked so it isn't implicitly centered
   on one agent by default.
5. **AI-input PiP** (the picture-in-picture showing exactly what the AI model itself receives as
   visual input) is a function of `activeViewAgentId` — always shows the selected agent's actual
   inference payload frame, never a separate/independent selection.
6. **Camera mode switch UI.** Whatever control lets the user pick 1st/2nd/3rd person should be
   clearly separate from the agent-selection dropdown — dropdown picks *which agent*, a separate
   toggle picks *which camera mode* for that agent. Don't conflate the two into one control.

## Test Before Calling This Phase Done

- With 3 agents spawned, switch the dropdown selection and confirm first-person, second-person, and
  the AI PiP all instantly reflect the newly selected agent — no stale frame from the previously
  selected agent lingering even briefly.
- Confirm third-person mode is genuinely free (not locked to any agent) — orbit and pan/zoom
  function correctly regardless of which agent is selected in the dropdown.
- Confirm second-person mode actually tracks the selected agent's movement smoothly, not just
  snapping to a fixed offset that drifts out of sync during fast movement.

## Completion Checklist

- [ ] Dropdown drives all camera modes and AI PiP from one shared selection state
- [ ] First, second, third person all functioning and switchable independently of agent selection
- [ ] Third-person orbital+axial control confirmed genuinely implemented, not assumed pre-existing

## Before Ending This Phase

Write `PHASE_3_COMPLETE.md`: what existed vs. what had to be built for third-person mode, and
instructions for Phase 4 to begin with zero prior context.
