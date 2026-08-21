/// <reference types="jest" />

import { allocateLeanA, SPINE2_PITCH_RANGE } from '../ReflexLeanA';

declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
};

describe('Road-4 — ReflexLeanA (spine2-only allocation)', () => {
  test('positive leanOffset (lean BACK) maps to a NEGATIVE spine2 pitch delta', () => {
    const a = allocateLeanA(0.2);
    expect(a.pitchDeltaRad).toBeCloseTo(-0.2, 6); // positive reflex → negative pitch
    expect(a.bone).toBe('mixamorigspine2');
    expect(a.clampedToRig).toBe(false);
  });

  test('negative leanOffset (lean FORWARD) maps to a POSITIVE spine2 pitch delta', () => {
    const a = allocateLeanA(-0.1);
    expect(a.pitchDeltaRad).toBeCloseTo(0.1, 6);
    expect(a.clampedToRig).toBe(false);
  });

  test('the SUM basePitch + delta stays inside the rig spine2 pitch range', () => {
    // Base already pitched forward 0.5; a forward-lean reflex (negative lean)
    // pushes the sum to 0.75 > max 0.524 → must clamp at the upper bound.
    const a = allocateLeanA(-0.25, 0.5);
    expect(a.clampedToRig).toBe(true);
    expect(0.5 + a.pitchDeltaRad).toBeCloseTo(SPINE2_PITCH_RANGE.max, 6);

    // Base already pitched back −0.5; a lean-back reflex (positive lean) pushes
    // the sum to −0.75 < min −0.524 → must clamp at the lower bound.
    const b = allocateLeanA(0.25, -0.5);
    expect(b.clampedToRig).toBe(true);
    expect(-0.5 + b.pitchDeltaRad).toBeCloseTo(SPINE2_PITCH_RANGE.min, 6);

    // Inside the range → no clamp, delta passes through unchanged.
    const c = allocateLeanA(0.2, 0.1);
    expect(c.clampedToRig).toBe(false);
    expect(0.1 + c.pitchDeltaRad).toBeCloseTo(-0.1, 6);
  });
});
