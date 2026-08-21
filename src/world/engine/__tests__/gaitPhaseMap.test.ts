/// <reference types="jest" />

import * as fs from 'fs';
import * as path from 'path';
import type { SynthiaWalkArtifact } from '../../../utils/mixamoStreamConverter';
import {
  GAIT_CYCLE,
  SOLE,
  V4_SWING_SHAPE,
  SWING_WINDOWS,
  cycleFractionOfFrame,
  phaseAtSeconds,
  isSideSwinging,
  swingEnvAt,
  classifyFrame,
  estimateSoleLiftM,
  analyzeArtifactSwing,
} from '../gaitPhaseMap';

declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeLessThan(expected: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
  toContain(expected: unknown): void;
};

const ARTIFACT_PATH = path.resolve(process.cwd(), 'public/animations/mixamo-walking-synthia.json');
const artifact: SynthiaWalkArtifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

describe('Road-4 — gaitPhaseMap: empirical phase windows of the played artifact', () => {
  test('artifact metadata + GAIT_CYCLE: 32 frames @ 30 fps, Mixamo-converted source', () => {
    expect(artifact.metadata.frames).toBe(32);
    expect(artifact.metadata.source).toContain('mixamo stream');
    expect(GAIT_CYCLE.frames).toBe(artifact.metadata.frames);
    expect(GAIT_CYCLE.fps).toBe(artifact.metadata.fps || 30);
    // Loop clone: 33 sequence entries (32 real + frame-0 clone at wrap).
    expect(artifact.sequence.length).toBe(33);
  });

  test('empirical SWING_WINDOWS match the probed hip-flexion bands', () => {
    // Probe ground truth (per-frame hip pitch):
    //   right > 0.05 rad   frames  4..12, peak 0.230 @ frame  9
    //   left  > 0.05 rad   frames 19..25, peak 0.215 @ frame 24
    const right = SWING_WINDOWS.right;
    const left = SWING_WINDOWS.left;
    expect(right.startU).toBeCloseTo(4 / 32, 6);
    expect(right.midU).toBeCloseTo(9 / 32, 6);
    expect(right.endU).toBeCloseTo(13 / 32, 6);
    expect(left.startU).toBeCloseTo(19 / 32, 6);
    expect(left.midU).toBeCloseTo(24 / 32, 6);
    expect(left.endU).toBeCloseTo(26 / 32, 6);
    // Anti-phase: right swing ≈ centered half a cycle from the left swing band
    expect(Math.abs(left.midU - right.midU)).toBeCloseTo(15 / 32, 6); // ≈ 0.469
  });

  test('phase helpers wrap and classifyFrames match the probed bands exactly', () => {
    expect(cycleFractionOfFrame(16)).toBeCloseTo(0.5, 6);
    // isSideSwinging
    expect(isSideSwinging(cycleFractionOfFrame(9), 'right')).toBe(true);
    expect(isSideSwinging(cycleFractionOfFrame(24), 'left')).toBe(true);
    expect(isSideSwinging(cycleFractionOfFrame(2), 'right')).toBe(false);
    expect(isSideSwinging(cycleFractionOfFrame(16), 'right')).toBe(false);
    // phaseAtSeconds wraps 32-frame cycle at 30 fps (1.0667 s per cycle)
    expect(phaseAtSeconds(GAIT_CYCLE.durationS)).toBeCloseTo(0, 2);
    // Frame-by-frame classification
    for (let f = 0; f < 32; f++) {
      const cls = classifyFrame(f);
      if (f >= 4 && f <= 12) expect(cls).toBe('right_swing');
      else if (f >= 19 && f <= 25) expect(cls).toBe('left_swing');
      else expect(cls).toBe('double_support');
    }
  });

  test('swingEnvAt is a bump peaking at midU and zero at the band edges (and outside)', () => {
    const midU = 9 / 32; // frame 9 peak
    const startU = 4 / 32; // frame 4 = band start (inclusive)
    const endU = 13 / 32; // exclusive band end (u < endU is inside)
    expect(swingEnvAt(midU, 'right')).toBeCloseTo(1.0, 6);
    // The envelope is 0 AT the boundaries and rises only inside the open band.
    expect(swingEnvAt(startU, 'right')).toBeCloseTo(0.0, 3);
    expect(swingEnvAt(endU, 'right')).toBeCloseTo(0.0, 3);
    // Frame 12 is the last frame INSIDE the band → small but non-zero.
    expect(swingEnvAt(cycleFractionOfFrame(12), 'right')).toBeGreaterThan(0);
    // Frame 16 is fully outside → hard zero.
    expect(swingEnvAt(cycleFractionOfFrame(16), 'right')).toBe(0);
  });

  test('v4 swing-shape injection constants are present for the capture step', () => {
    expect(V4_SWING_SHAPE.hipEnvAmp).toBe(0.5);
    expect(V4_SWING_SHAPE.kneeBumpAmp).toBe(1.0);
    expect(V4_SWING_SHAPE.ankleDorsiflexAmp).toBe(0.3);
    expect(V4_SWING_SHAPE.stanceHipHold).toBe(-0.1);
  });

  test('sole-lift proxy: no leg shortening when straight; strong shortening at max swing', () => {
    const stance = estimateSoleLiftM(0, 0, 0);
    expect(stance).toBeLessThan(0.001);
    const swing = estimateSoleLiftM(0.5, 1.0, 0.3);
    expect(swing).toBeGreaterThan(0.02);
    expect(SOLE.FOOT_OFFSET_Z).toBe(0.02);
    expect(SOLE.FOOT_HALF_HEIGHT).toBe(0.01);
  });

  test('analyzeArtifactSwing re-derives the windows from the JSON overrides', () => {
    const analysis = analyzeArtifactSwing(artifact);
    expect(analysis.frames.length).toBe(32);

    // Right: one detected band, frames 4..13 (exclusive), hip peak at frame 9.
    expect(analysis.windows.right.length).toBe(1);
    expect(analysis.windows.right[0].startFrame).toBe(4);
    expect(analysis.windows.right[0].endFrame).toBe(13);
    expect(analysis.windows.right[0].midFrame).toBe(9);

    // Left: one detected band, frames 19..26 (exclusive), hip peak at frame 24.
    expect(analysis.windows.left.length).toBe(1);
    expect(analysis.windows.left[0].startFrame).toBe(19);
    expect(analysis.windows.left[0].endFrame).toBe(26);
    expect(analysis.windows.left[0].midFrame).toBe(24);

    // Per-frame classification agrees with the probe's hip thresholds.
    for (const frame of analysis.frames) {
      const f = frame.frame;
      if (f >= 4 && f <= 12) {
        expect(frame.classification).toBe('right_swing');
        expect(frame.rightHipPitch).toBeGreaterThan(0.05);
      } else if (f >= 19 && f <= 25) {
        expect(frame.classification).toBe('left_swing');
        expect(frame.leftHipPitch).toBeGreaterThan(0.05);
      } else {
        expect(frame.classification).toBe('double_support');
      }
    }

    // Mid-swing leg shortening is meaningful inside each band (relative drive).
    const rightShort = analysis.frames[9].rightShorteningMm;
    const leftShort = analysis.frames[24].leftShorteningMm;
    expect(rightShort).toBeGreaterThan(20);
    expect(leftShort).toBeGreaterThan(20);
  });
});
