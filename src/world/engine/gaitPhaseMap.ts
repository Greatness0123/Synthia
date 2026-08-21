/**
 * Road-4 — gait phase map for the walk artifact that the harness actually plays.
 *
 * IMPORTANT FINDING (verified by probing the JSON on disk): the artifact at
 * `public/animations/mixamo-walking-synthia.json` is NOT the authored v4 gait
 * from `scripts/authorSynthiaGait.mjs` — its metadata reads
 *   name: "Mixamo Walking (converted)"  source: "mixamo stream → synthia timeline"
 * so it is the REAL Mixamo walk clip converted by `mixamoStreamConverter.ts`
 * (root deltas ≈ -0.055 m/frame → 1.7 m/s, clamped to 0.3 m/s by the Road-3
 * root servo). The phase map below is therefore derived EMPIRICALLY from the
 * actual per-frame joint overrides.
 *
 * Empirical swing windows (hip-pitch flexion defines the swing-authority band;
 * `analyzeArtifactSwing` re-derives exactly this from the JSON):
 *   - RIGHT leg swings  frames  4..12  (u ∈ [0.125, 0.406)), hip peaks frame 9 (≈0.23 rad)
 *   - LEFT  leg swings  frames 19..25  (u ∈ [0.594, 0.812)), hip peaks frame 24 (≈0.22 rad)
 *   - All other frames are DOUBLE_SUPPORT (long stance phase typical of a walk).
 *
 * The `V4_SWING_SHAPE` constants below are the injection amplitudes from the
 * Road-3 authored-gait spec (hip 0.5·env / knee 1.0·bump / ankle dorsiflex 0.3)
 * that the COM capture-step uses to SHAPE the injected swing-hip offset — they
 * are the same shape the task calls "the v4 swing shape", independent of the
 * on-disk artifact's absolute amplitudes.
 *
 * Sole/gap constants are reused verbatim from the road3 gate so the phase map,
 * the reflex, and the gate all measure the same geometry.
 */

import type { SynthiaWalkArtifact } from '../../utils/mixamoStreamConverter';

/** 0→1→0 bump used for the swing trajectory shape. */
function bump(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * x);
}

/** Wrap any fraction into [0, 1). */
function mod(x: number): number {
  return (((x % 1) + 1) % 1);
}

/** Clamp helper. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Cycle + sole constants (exact road3 values) ────────────────────────
export const GAIT_CYCLE = {
  frames: 32,
  fps: 30,
  durationS: 32 / 30, // 1.0667 s per cycle
} as const;

/** Sole-offset constants reused from the road3 gate (ground-gap measurement). */
export const SOLE = {
  FOOT_OFFSET_Z: 0.02, // sole below foot bone joint (m)
  FOOT_HALF_HEIGHT: 0.01, // foot box half-thickness (m)
} as const;

/** Two-segment leg lengths used by the kinematic leg-shortening proxy. */
export const LEG_LENGTHS = {
  thighM: 0.45,
  shinM: 0.42,
} as const;

/**
 * The v4 swing-shape injection amplitudes (from the Road-3 authored gait spec).
 * Used by the COM capture-step to shape the swing-hip offset it injects.
 */
export const V4_SWING_SHAPE = {
  hipEnvAmp: 0.5, // swing hip = +0.50 · env
  kneeBumpAmp: 1.0, // swing knee = +1.00 · bump(legPhase − 0.02)
  ankleDorsiflexAmp: 0.3, // swing ankle = +0.30 · bump(legPhase − 0.02 − ankleLag)
  ankleLagPhase: 0.05, // ankle kick lags the hip by 5% of the cycle
  stanceHipHold: -0.1, // stance hip extension hold (rad)
  stanceKneeFlex: 0.05, // stance knee near-straight (rad)
} as const;

// ── Types ──────────────────────────────────────────────────────────────
export type Side = 'left' | 'right';
export type SwingPhase = 'left_swing' | 'right_swing' | 'double_support';

export interface SwingWindow {
  /** Cycle fraction where the leg's swing band starts (inclusive). */
  startU: number;
  /** Cycle fraction of the hip-pitch peak inside the band. */
  midU: number;
  /** Cycle fraction where the leg's swing band ends (exclusive). */
  endU: number;
}

// ── Empirical swing windows (derived from the on-disk artifact) ────────
export const SWING_WINDOWS: Record<Side, SwingWindow> = {
  // Right: hip pitch > 0.05 rad over frames 4..12; peak 0.230 rad at frame 9.
  right: { startU: 4 / GAIT_CYCLE.frames, midU: 9 / GAIT_CYCLE.frames, endU: 13 / GAIT_CYCLE.frames },
  // Left: hip pitch > 0.05 rad over frames 19..25; peak 0.215 rad at frame 24.
  left: { startU: 19 / GAIT_CYCLE.frames, midU: 24 / GAIT_CYCLE.frames, endU: 26 / GAIT_CYCLE.frames },
};

// ── Phase helpers ──────────────────────────────────────────────────────
export function cycleFractionOfFrame(frameIdx: number): number {
  return mod(frameIdx / GAIT_CYCLE.frames);
}

/** Seconds → cycle fraction in [0, 1). */
export function phaseAtSeconds(tS: number): number {
  return mod(tS / GAIT_CYCLE.durationS);
}

/** True while the global cycle fraction u is inside the side's swing band. */
export function isSideSwinging(u: number, side: Side): boolean {
  const w = SWING_WINDOWS[side];
  if (w.startU <= w.endU) return u >= w.startU && u < w.endU;
  // Wrapped window (should not occur in the current empirical map).
  return u >= w.startU || u < w.endU;
}

/**
 * Bump-shaped swing envelope for a side: 0 outside the band, 0 at band edges,
 * 1.0 at the hip-pitch peak (midU). This is the trajectory shape the capture
 * step scales into the injected swing-hip offset.
 */
export function swingEnvAt(u: number, side: Side): number {
  const w = SWING_WINDOWS[side];
  if (!isSideSwinging(u, side)) return 0;
  const denomA = Math.max(1e-6, w.midU - w.startU);
  const denomB = Math.max(1e-6, w.endU - w.midU);
  // Two half bumps so the envelope peaks EXACTLY at midU: half-bump 0→1 over
  // [startU, midU], half-bump 1→0 over [midU, endU]. bump(0.5)=1, bump(1)=0.
  if (u <= w.midU) return bump(0.5 * ((u - w.startU) / denomA));
  return bump(0.5 + 0.5 * ((u - w.midU) / denomB));
}

/**
 * Frame classification: a frame belongs to a side's swing band when that leg's
 * hip is actively driving the step forward; otherwise DOUBLE_SUPPORT (including
 * the brief seams around liftoff/touchdown).
 */
export function classifyPhase(u: number): SwingPhase {
  if (isSideSwinging(u, 'right') && !isSideSwinging(u, 'left')) return 'right_swing';
  if (isSideSwinging(u, 'left') && !isSideSwinging(u, 'right')) return 'left_swing';
  return 'double_support';
}

export function classifyFrame(frameIdx: number): SwingPhase {
  return classifyPhase(cycleFractionOfFrame(frameIdx));
}

// ── Kinematic leg-shortening proxy (artifact cross-validation) ─────────
/**
 * Estimate how much the leg shortens below the hip given hip pitch and knee
 * flexion (2-segment model). This is a RELATIVE measure of swing authority at a
 * looped frame — NOT absolute ground clearance (the whole body falls between
 * steps). Used to cross-check that the swing bands truly show meaningful leg
 * drive, and by the capture-step to inject swing-knee shape.
 */
export function estimateSoleLiftM(
  hipPitchRad: number,
  kneeFlexRad: number,
  _anklePitchRad: number,
  lens: { thighM: number; shinM: number } = LEG_LENGTHS
): number {
  const { thighM, shinM } = lens;
  const hip = clamp(hipPitchRad, -2.094, 2.094);
  const knee = clamp(kneeFlexRad, -2.618, 2.618);
  const drop = thighM * Math.cos(hip) + shinM * Math.cos(hip + knee);
  return Math.max(0, thighM + shinM - drop);
}

// ── Artifact cross-validation (reads the real JSON overrides) ──────────
export interface ArtifactFootLift {
  frame: number;
  cycleU: number;
  leftHipPitch: number;
  rightHipPitch: number;
  leftShorteningMm: number;
  rightShorteningMm: number;
  classification: SwingPhase;
}

export interface DetectedWindow {
  startFrame: number;
  endFrame: number; // exclusive
  midFrame: number; // frame with max hip pitch inside the window
}

export interface ArtifactSwingAnalysis {
  frames: ArtifactFootLift[];
  windows: { left: DetectedWindow[]; right: DetectedWindow[] };
}

function readPitch(v: number | number[] | undefined): number {
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && v.length > 0) return v[0] ?? 0;
  return 0;
}

/** Hip-pitch threshold that defines a swing-authority band (rad). */
const SWING_HIP_THRESHOLD = 0.05;

/**
 * Re-derive the swing windows directly from the artifact's per-frame joint
 * overrides using the hip-pitch flexion bands. Frame 32 (the loop clone of
 * frame 0) is dropped. Mid-frame = max hip pitch inside each window.
 */
export function analyzeArtifactSwing(artifact: SynthiaWalkArtifact): ArtifactSwingAnalysis {
  const sorted = artifact.sequence.slice().sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
  const cycleFrames = Math.min(GAIT_CYCLE.frames, sorted.length);

  const frameData = new Array(cycleFrames).fill(0).map(() => ({
    leftHip: 0,
    rightHip: 0,
    leftShort: 0,
    rightShort: 0,
  }));

  for (let f = 0; f < cycleFrames; f++) {
    const ov = sorted[f]?.overrides ?? {};
    const leftHip = readPitch(ov['mixamorigleftupleg']);
    const rightHip = readPitch(ov['mixamorigrightupleg']);
    const leftKnee = readPitch(ov['mixamorigleftleg']);
    const rightKnee = readPitch(ov['mixamorigrightleg']);
    const leftAnkle = readPitch(ov['mixamorigleftfoot']);
    const rightAnkle = readPitch(ov['mixamorigrightfoot']);
    frameData[f] = {
      leftHip,
      rightHip,
      leftShort: estimateSoleLiftM(leftHip, leftKnee, leftAnkle) * 1000,
      rightShort: estimateSoleLiftM(rightHip, rightKnee, rightAnkle) * 1000,
    };
  }

  const detect = (side: 'left' | 'right'): DetectedWindow[] => {
    const key = side === 'left' ? 'leftHip' : 'rightHip';
    const runs: DetectedWindow[] = [];
    let start: number | null = null;
    for (let f = 0; f <= cycleFrames; f++) {
      const active = f < cycleFrames && frameData[f][key] > SWING_HIP_THRESHOLD;
      if (active && start === null) start = f;
      if (!active && start !== null) {
        let mid = start;
        let max = -Infinity;
        for (let i = start; i < f; i++) {
          if (frameData[i][key] > max) {
            max = frameData[i][key];
            mid = i;
          }
        }
        runs.push({ startFrame: start, endFrame: f, midFrame: mid });
        start = null;
      }
    }
    return runs;
  };

  const windows = { left: detect('left'), right: detect('right') };

  const frames: ArtifactFootLift[] = [];
  for (let f = 0; f < cycleFrames; f++) {
    frames.push({
      frame: f,
      cycleU: cycleFractionOfFrame(f),
      leftHipPitch: Math.round(frameData[f].leftHip * 1000) / 1000,
      rightHipPitch: Math.round(frameData[f].rightHip * 1000) / 1000,
      leftShorteningMm: Math.round(frameData[f].leftShort * 10) / 10,
      rightShorteningMm: Math.round(frameData[f].rightShort * 10) / 10,
      classification: classifyFrame(f),
    });
  }

  return { frames, windows };
}
