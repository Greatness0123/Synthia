/**
 * Road-4 — Option A lean allocation: spine2-only pitch.
 *
 * The COM reflex produces `leanOffsetRad` with the convention:
 *   POSITIVE = lean BACK (counter a forward COM).
 *
 * This module maps that to a DELTA on the trunk joint `mixamorigspine2`
 * pitch. Rig/engine convention for spine bones: positive x-pitch = FORWARD
 * lean (torso tips forward). Therefore:
 *   spine2PitchDelta = −leanOffsetRad       (positive reflex → negative pitch)
 *
 * The reflex value is already clamped to ±0.25 by ComReflexController; this
 * allocator additionally clamps against the anatomical spine2 pitch range so
 * the injected ctrl never exceeds what the rig/MJCF allows.
 *
 * The delta is ADDITIVE on top of the 30/60 fps pose flush: the binder reads
 * the current flushed spine2 pitch and adds this delta each 500 Hz step.
 */

/** Spine2 pitch anatomical range (rad), from getAnatomicalLimitForBone. */
export const SPINE2_PITCH_RANGE = { min: -0.524, max: 0.524 } as const;

export interface LeanAllocationA {
  bone: 'mixamorigspine2';
  /** Additive pitch delta (rad) to apply to spine2. */
  pitchDeltaRad: number;
  /** Pre-clamp input retained for telemetry. */
  rawLeanOffsetRad: number;
  /** True when the input was clamped to the spine2 anatomical range. */
  clampedToRig: boolean;
}

/**
 * Allocate the reflex lean correction to spine2 pitch only (Option A).
 *
 * @param leanOffsetRad Reflex output: >0 leans the torso BACK.
 * @param basePitchRad  Current flushed spine2 pitch (rad) — used only to clamp
 *                      the SUM against the rig range, not to change the delta.
 */
export function allocateLeanA(leanOffsetRad: number, basePitchRad = 0): LeanAllocationA {
  // Reflex convention: positive = lean back → negative forward-lean pitch.
  const pitchDeltaRad = -leanOffsetRad;

  const sum = basePitchRad + pitchDeltaRad;
  const clamped = sum < SPINE2_PITCH_RANGE.min || sum > SPINE2_PITCH_RANGE.max;
  let finalDelta = pitchDeltaRad;
  if (sum > SPINE2_PITCH_RANGE.max) {
    finalDelta = SPINE2_PITCH_RANGE.max - basePitchRad;
  } else if (sum < SPINE2_PITCH_RANGE.min) {
    finalDelta = SPINE2_PITCH_RANGE.min - basePitchRad;
  }

  return {
    bone: 'mixamorigspine2',
    pitchDeltaRad: finalDelta,
    rawLeanOffsetRad: leanOffsetRad,
    clampedToRig: clamped,
  };
}
