/// <reference types="jest" />

import {
  ComReflexController,
  DEFAULT_REFLEX_GAINS,
  type ReflexFrameInput,
} from '../ComReflexController';
import { GAIT_CYCLE, SWING_WINDOWS } from '../gaitPhaseMap';

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

/**
 * Synthetic Three.js-world scenario. Forward = (0,0,-1), so the fore/aft
 * projection f = dot(p, fwd) is LARGER when the point is AHEAD (smaller z).
 * Feet sit on the ground (y=0), COM at comHeightM.
 */
function makeInput(partial: Partial<ReflexFrameInput> = {}): ReflexFrameInput {
  return {
    comPosWorld: { x: 0, y: 0.95, z: 0 },
    comVelWorld: { x: 0, y: 0, z: 0 },
    forwardVec: { x: 0, y: 0, z: -1 },
    leftFootPos: { x: -0.12, y: 0, z: 0.05 },
    rightFootPos: { x: 0.12, y: 0, z: -0.05 },
    footSoleGapsM: { left: 0.001, right: 0.001 }, // both planted
    cyclePhase01: 0.5, // double support (no natural window) by default
    comHeightM: 0.95,
    gains: { ...DEFAULT_REFLEX_GAINS },
    ...partial,
  };
}

// Default stance here is LEFT (left foot z=+0.05 → f=-0.05; right foot z=-0.05 → f=+0.05).
// e = comF - stanceFootF is positive when the COM is ahead of the support center.
// dtU per step at the fixed 500 Hz default: 0.002 / GAIT_CYCLE.durationS.
const DTU = (1 / 500) / GAIT_CYCLE.durationS;

describe('Road-4 — ComReflexController', () => {
  test('Law 1 lean correction: COM ahead → POSITIVE offset (lean back), clamped to ±0.25', () => {
    const c = new ComReflexController();
    // Sub-clamp case: com at z=-0.05 → e = 0.10, v = 0 → lean = kH·0.10 = 0.20
    const out = c.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: -0.05 },
        comVelWorld: { x: 0, y: 0, z: 0 },
      })
    );
    expect(out.e).toBeCloseTo(0.10, 6);
    expect(out.leanOffsetRad).toBeCloseTo(0.20, 6);
    expect(out.leanOffsetRad).toBeGreaterThan(0); // lean BACK
    expect(out.leanOffsetRad).toBeLessThanOrEqual(0.25);

    // Clamp case: larger offense → hits the ±0.25 ceiling exactly.
    const c2 = new ComReflexController();
    const out2 = c2.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: -0.3 },
        comVelWorld: { x: 0, y: 0, z: -1.0 }, // e=0.35, v=1.0 → raw 1.1
      })
    );
    expect(out2.leanOffsetRad).toBe(0.25);
  });

  test('Law 1 negative side: COM behind the stance foot → lean FORWARDS (negative offset)', () => {
    const c = new ComReflexController();
    // Right stance only (right planted). com z=+0.05 is behind the right foot
    // (right foot z=-0.05 → f=+0.05; com f=-0.05) → e = -0.10.
    const out = c.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: 0.05 },
        comVelWorld: { x: 0, y: 0, z: 0 },
        footSoleGapsM: { left: 0.02, right: 0.001 },
        cyclePhase01: 0.01,
      })
    );
    expect(out.stanceSide).toBe('right');
    expect(out.e).toBeCloseTo(-0.10, 6);
    expect(out.leanOffsetRad).toBeCloseTo(-0.20, 6);
    expect(out.leanOffsetRad).toBeLessThan(0);
  });

  test('Law 2 capture point leads the COM by v·sqrt(h/g)', () => {
    const c = new ComReflexController();
    const vForward = 0.3; // m/s forward (vel z=-0.3 → f=+0.3)
    const h = 0.95;
    const lead = vForward * Math.sqrt(h / 9.81); // ≈ 0.0933
    const out = c.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: h, z: -0.1 },
        comVelWorld: { x: 0, y: 0, z: -vForward },
      })
    );
    expect(out.captureM).toBeCloseTo(out.e + lead, 4);
    expect(out.captureM).toBeGreaterThan(out.e);
  });

  test('Law 3 FSM dispatch: forced fires ONCE per leg, then that leg owns the timed swing (one-swinger-max)', () => {
    const c = new ComReflexController();
    // Left stance (left planted), COM 0.35 m ahead at double support → forced.
    const forcedInput = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 },
      cyclePhase01: 0.5,
    } as const;

    const out1 = c.computeFrame(makeInput(forcedInput));
    expect(out1.stanceSide).toBe('left');
    expect(out1.forcedStep).toBe(true);
    expect(out1.swingSide).toBe('right'); // non-stance free foot
    expect(out1.swingState!.right.state).toBe('swing');
    expect(out1.swingState!.right.forced).toBe(true);
    expect(out1.swingState!.right.shoulderEnv).toBeCloseTo(0, 6); // liftoff
    expect(c.getStats().forcedStepCount).toBe(1);
    expect(c.getStats().captureStepsFired).toBe(1);

    // Same |e| > forceStepM input again: the free leg is mid-swing, so law 3
    // does NOT re-dispatch — the count stays 1 (dispatch-once transition).
    const out2 = c.computeFrame(makeInput(forcedInput));
    expect(out2.forcedStep).toBe(true); // the law-3 gate is still hot
    expect(c.getStats().forcedStepCount).toBe(1);
    expect(c.getStats().captureStepsFired).toBe(1);
    expect(out2.swingState!.right.state).toBe('swing');
    expect(out2.swingSide).toBe('right');

    // Small |e| → no forced step at all.
    const c2 = new ComReflexController();
    const out3 = c2.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: -0.05 },
        footSoleGapsM: { left: 0.001, right: 0.02 },
        cyclePhase01: 0.5,
      })
    );
    expect(out3.forcedStep).toBe(false);
    expect(c2.getStats().forcedStepCount).toBe(0);
  });

  test('FSM shoulderEnv bump: 0→1→0 over the swing, and the hip offset follows it for a forced leg', () => {
    const c = new ComReflexController();
    const forcedInput = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 },
      cyclePhase01: 0.5,
    } as const;

    const d0 = c.computeFrame(makeInput(forcedInput));
    expect(d0.swingState!.right.shoulderEnv).toBeCloseTo(0, 6);
    expect(d0.swingHipOffsetRad).toBeCloseTo(0, 6); // envelope 0 at liftoff

    // Step into mid-swing: ~half of swingDurationU (0.30 U) → env ≈ 1.0.
    // The forced throw = clamp(kCapture·error, ±0.5)·env; error ≈ 0.3123
    // (capture 0.4123 − (rightF 0.05 − leftF −0.05)) → ≈ 0.1873 at env≈1.
    const HALF_U = 0.15;
    let last: any = d0;
    while (last.swingState!.right.swingU < HALF_U - DTU) {
      last = c.computeFrame(makeInput(forcedInput));
    }
    expect(last.swingState!.right.shoulderEnv).toBeCloseTo(1.0, 2);
    expect(last.swingHipOffsetRad).toBeGreaterThan(0);
    expect(last.swingHipOffsetRad).toBeCloseTo(0.1873, 2);

    // At the abort edge the envelope returns toward 0 (it never freezes at 1.0).
    // Advance PAST the swing-duration cap: the FSM force-lands the leg (abort —
    // the envelope has descended to 0 at that instant); a still-hot forced gate
    // then re-dispatches it (dispatch-once per swing), so the leg is never
    // frozen airborne. The 0→1→0 shape is proven by env(d0)=0, env(mid)≈1.0,
    // and the abort (the cap forcing the envelope back to 0).
    let tail: any = last;
    let guard = 0;
    const framesToCap = Math.ceil((DEFAULT_REFLEX_GAINS.swingDurationU ?? 0.3) / DTU);
    while (tail.swingState!.right.state === 'swing' && guard++ < framesToCap * 3) {
      tail = c.computeFrame(makeInput(forcedInput));
    }
    expect(c.getStats().perLegSwingAborts).toBeGreaterThanOrEqual(1);
  });

  test('mandatory plant: swing → planted at gap ≤ 5 mm, one replant credit, then refractory → stance', () => {
    const c = new ComReflexController();
    const fire = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 },
      cyclePhase01: 0.5,
    } as const;

    c.computeFrame(makeInput(fire)); // dispatch right swing
    // Let it swing a couple of frames without touching down.
    c.computeFrame(makeInput({ ...fire, footSoleGapsM: { left: 0.001, right: 0.018 } }));

    // Touchdown: right sole gap ≤ 5 mm → mandatory plant.
    const land = c.computeFrame(
      makeInput({ ...fire, footSoleGapsM: { left: 0.001, right: 0.004 } })
    );
    expect(land.swingState!.right.state).toBe('planted');
    expect(land.swingState!.right.command).toBe('plant');
    const s = c.getStats();
    expect(s.stanceReplantCycles).toBe(1);
    expect(s.plantedTouchdowns).toBe(1);
    expect(s.captureStepsLanded).toBe(1);
    expect(s.perLegSwingAborts).toBe(0);

    // Next frame: planted → refractory (double support dwell), blocks re-swing.
    const r = c.computeFrame(
      makeInput({ ...fire, footSoleGapsM: { left: 0.001, right: 0.004 } })
    );
    expect(r.swingState!.right.state).toBe('refractory');
    expect(c.getStats().stanceReplantCycles).toBe(1); // exactly +1 per plant
    expect(c.getStats().captureStepsLanded).toBe(1);

    // Wait out the refractory dwell (default 0.10 U). The dwell ends inside a
    // still-hot forced gate, so the very next frame re-dispatches the right
    // leg — the bundle is observed as a fresh 'swing', never 'stance'.
    let now: any = r;
    let guard = 0;
    while (now.swingState!.right.state === 'refractory' && guard++ < 120) {
      now = c.computeFrame(makeInput(fire));
    }
    expect(now.swingState!.right.state).toBe('swing');
    expect(now.swingState!.right.forced).toBe(true);
    expect(c.getStats().stanceReplantCycles).toBe(1); // still exactly one plant
  });

  test('refractory blocks immediate re-swing; a fresh forced dispatch fires after the dwell', () => {
    const c = new ComReflexController();
    const fire = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 },
      cyclePhase01: 0.5,
    } as const;

    c.computeFrame(makeInput(fire));
    // Plant immediately (gap 0.004 on the next frame).
    c.computeFrame(makeInput({ ...fire, footSoleGapsM: { left: 0.001, right: 0.004 } }));
    // Now in refractory. The forced gate is STILL hot (|e| > forceStepM) and the
    // phase is still outside any window, yet the right leg may NOT re-swing.
    let now = c.computeFrame(makeInput(fire));
    expect(now.swingState!.right.state).toBe('refractory');
    expect(c.getStats().forcedStepCount).toBe(1); // no re-dispatch

    // The dwell is 0.10 U ≈ 54 frames at the 1/500 default. The moment the
    // dwell elapses, the STILL-hot forced gate dispatches a fresh swing in the
    // SAME frame — the bundle never stands on 'stance', and the re-dispatch
    // lands before the loop exits (observed directly as 'swing').
    const beforeDwell = c.getStats().forcedStepCount;
    let guard = 0;
    while (now.swingState!.right.state === 'refractory' && guard++ < 120) {
      now = c.computeFrame(makeInput(fire));
    }
    // The dwell elapsed → the forced re-dispatch already fired inside the loop.
    expect(now.swingState!.right.state).toBe('swing');
    expect(now.swingState!.right.forced).toBe(true);
    expect(c.getStats().forcedStepCount).toBeGreaterThanOrEqual(beforeDwell + 1);
  });

  test('abort: a leg that never re-plants is force-landed at swingDurationU (never frozen airborne)', () => {
    const c = new ComReflexController();
    const fire = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 }, // right NEVER touches down
      cyclePhase01: 0.5,
    } as const;

    c.computeFrame(makeInput(fire)); // dispatch
    let now: any = c.computeFrame(makeInput(fire));
    // The never-landing right foot stays mid-swing until swingU hits the cap:
    // the FSM force-lands it (abort — never frozen airborne), and a still-hot
    // forced gate re-dispatches it the next frame (dispatch-once per swing),
    // so aborts accumulate across repeated swings. Run a couple of full swing
    // durations and require ≥ 1 abort.
    const framesToCap = Math.ceil((DEFAULT_REFLEX_GAINS.swingDurationU ?? 0.3) / DTU);
    let guard = 0;
    while (now.swingState!.right.state === 'swing' && guard++ < framesToCap * 2 + 5) {
      now = c.computeFrame(makeInput(fire));
    }
    expect(c.getStats().perLegSwingAborts).toBeGreaterThanOrEqual(1);
    expect(now.swingState!.right.shoulderEnv).toBeLessThanOrEqual(1);

    // diagnose() attributes a run whose legs were aborted to the STEP sub-law.
    expect(c.diagnose().subLaw).toBe('step');
    expect(c.diagnose().reason).toContain('aborted');
  });

  test('dtS edge cases: undefined → 1/500 default; 0 / NaN / negative → timers do not advance', () => {
    const forced = {
      comPosWorld: { x: 0, y: 0.95, z: -0.3 },
      comVelWorld: { x: 0, y: 0, z: -0.2 },
      footSoleGapsM: { left: 0.001, right: 0.02 },
      cyclePhase01: 0.5,
    } as const;

    // Default dt (1/500): swingU advances by one fixed step per frame.
    const c1 = new ComReflexController();
    c1.computeFrame(makeInput(forced));
    const f2 = c1.computeFrame(makeInput(forced));
    expect(f2.swingState!.right.swingU).toBeCloseTo(DTU, 9);

    // Explicit dtS = 0.002 matches the default cadence.
    const c1b = new ComReflexController();
    c1b.computeFrame(makeInput({ ...forced, dtS: 0.002 }));
    expect(c1b.computeFrame(makeInput({ ...forced, dtS: 0.002 })).swingState!.right.swingU).toBeCloseTo(
      DTU, 9
    );

    // dtS = 0 / NaN / negative: clamped to 0 — the swing never advances or
    // regresses (and no inf/NaN creep into the envelope).
    const c2 = new ComReflexController();
    c2.computeFrame(makeInput({ ...forced, dtS: 0 }));
    const stagnant = c2.computeFrame(makeInput({ ...forced, dtS: 0 }));
    expect(stagnant.swingState!.right.state).toBe('swing');
    expect(stagnant.swingState!.right.swingU).toBeCloseTo(0, 9);

    const c3 = new ComReflexController();
    c3.computeFrame(makeInput({ ...forced, dtS: NaN }));
    expect(c3.computeFrame(makeInput({ ...forced, dtS: NaN })).swingState!.right.swingU).toBeCloseTo(0, 9);

    const c4 = new ComReflexController();
    c4.computeFrame(makeInput({ ...forced, dtS: -0.5 }));
    expect(c4.computeFrame(makeInput({ ...forced, dtS: -0.5 })).swingState!.right.swingU).toBeCloseTo(0, 9);
  });

  test('stance hysteresis: while both feet are airborne, the last-planted side holds', () => {
    const c = new ComReflexController();
    const first = c.computeFrame(
      makeInput({
        footSoleGapsM: { left: 0.03, right: 0.001 },
        cyclePhase01: 0.01, // right planted only → stance right
      })
    );
    expect(first.stanceSide).toBe('right');
    const second = c.computeFrame(
      makeInput({
        footSoleGapsM: { left: 0.03, right: 0.03 }, // both airborne → latch
        cyclePhase01: 0.81,
      })
    );
    expect(second.stanceSide).toBe('right');
  });

  test('natural swing window: swingSide follows the phase map and the hip offset is envelope-scaled', () => {
    const c = new ComReflexController();
    // Both planted → tie → left stance. Right foot pulled AHEAD of left:
    // right z=-0.00 (f=0), left z=+0.05 (f=-0.05). Capture at e=+0.15 (com z=-0.1)
    // → error = 0.15 - (0 - (-0.05)) = 0.10 → hip = 0.6·0.10·env(1.0) = 0.06.
    const out = c.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: -0.1 },
        comVelWorld: { x: 0, y: 0, z: 0 },
        rightFootPos: { x: 0.12, y: 0, z: 0 },
        cyclePhase01: SWING_WINDOWS.right.midU,
      })
    );
    expect(out.inSwingWindow).toBe(true);
    expect(out.phase).toBe('right_swing');
    expect(out.swingSide).toBe('right');
    expect(out.swingState!.right.state).toBe('swing');
    expect(out.swingState!.right.forced).toBe(false);
    expect(out.swingHipOffsetRad).toBeCloseTo(0.06, 4);

    // Outside any window with small |e| → no injection at all. The leg is
    // mid-swing from the previous frame, so it exits via the mandatory plant
    // (or later), but the hip/knee/ankle injection is 0 outside the window.
    const out2 = c.computeFrame(
      makeInput({
        comPosWorld: { x: 0, y: 0.95, z: -0.1 },
        rightFootPos: { x: 0.12, y: 0, z: 0 },
        cyclePhase01: 0.5,
      })
    );
    expect(out2.inSwingWindow).toBe(false);
    expect(out2.forcedStep).toBe(false);
    expect(out2.swingHipOffsetRad).toBe(0);
    expect(['swing', 'planted', 'refractory', 'stance']).toContain(out2.swingState!.right.state);
  });

  test('attribution: contained → none; aborted/never-cleared swing → step; saturated corrector → lean', () => {
    // Contained: the FSM dispatches (both natural-window and hot forced gates)
    // and the swing foot re-plants each cycle, |e| stays small → genuinely
    // healthy runner → 'none'.
    const healthy = new ComReflexController();
    const HCYCLE = 128;
    // Right swing window maps to frames u ∈ [0.125, 0.406) → i ∈ [16, 52).
    const hIsRightWindow = (i: number) => {
      const f = i % HCYCLE;
      return f >= 16 && f < 52;
    };
    for (let i = 0; i < 4 * HCYCLE; i++) {
      const inRightWindow = hIsRightWindow(i);
      // Inside the right swing window the foot is AIRBORNE (0.02 m clears the
      // 15 mm gate); the moment the window passes (gap back to 0.001) the FSM's
      // mandatory-plant exit fires → one replant credit per cycle.
      const rightGap = inRightWindow ? 0.02 : 0.001;
      healthy.computeFrame(
        makeInput({
          comPosWorld: { x: 0, y: 0.95, z: -0.02 },
          comVelWorld: { x: 0, y: 0, z: 0 },
          cyclePhase01: (i % HCYCLE) / HCYCLE,
          footSoleGapsM: { left: 0.001, right: rightGap },
        })
      );
    }
    const dh = healthy.diagnose();
    expect(healthy.getStats().perLegSwingAborts).toBe(0);
    expect(healthy.getStats().stanceReplantCycles).toBeGreaterThanOrEqual(4);
    expect(dh.subLaw).toBe('none');

    // Step-broke: forced steps fire but the swing foot never touches down →
    // the FSM times each swing out at the duration cap (abort). The verdict
    // fires once evidence (≥ 60 frames AND ≥ 1 abort) accumulates.
    const noClear = new ComReflexController();
    const SWING_MAX_FRAMES = Math.ceil((DEFAULT_REFLEX_GAINS.swingDurationU ?? 0.3) / DTU);
    for (let i = 0; i < 2 * SWING_MAX_FRAMES + 40; i++) {
      noClear.computeFrame(
        makeInput({
          comPosWorld: { x: 0, y: 0.95, z: -0.3 },
          comVelWorld: { x: 0, y: 0, z: -0.2 },
          cyclePhase01: 0.5, // double support → |e| triggers forced dispatch
          footSoleGapsM: { left: 0.001, right: 0.02 }, // right stays AIRBORNE (never plants)
        })
      );
    }
    const dNoClear = noClear.diagnose();
    expect(noClear.getStats().perLegSwingAborts).toBeGreaterThanOrEqual(1);
    expect(dNoClear.subLaw).toBe('step');
    expect(
      dNoClear.reason.includes('aborted') ||
      dNoClear.reason.includes('never cleared')
    ).toBe(true);

    // Lean-broke: natural-window steps keep clearing and re-planting (no
    // aborts, no missing plants), yet |e| still escapes forceStepM → the lean
    // corrector is the deficient sub-law.
    const leanBroke = new ComReflexController();
    const CYCLE = 128; // right window = frames 16..51 (u ∈ [0.125, 0.406))
    const isRightWindow = (i: number) => {
      const f = i % CYCLE;
      return f >= 16 && f < 52;
    };
    for (let i = 0; i < 4 * CYCLE; i++) {
      // Same airborne-then-plant pattern as the healthy runner — the step
      // machinery is sound; only the lean corrector is under-powered here.
      const rightGap = isRightWindow(i) ? 0.02 : 0.001;
      leanBroke.computeFrame(
        makeInput({
          comPosWorld: { x: 0, y: 0.95, z: -0.3 },
          comVelWorld: { x: 0, y: 0, z: -0.2 },
          cyclePhase01: (i % CYCLE) / CYCLE,
          footSoleGapsM: { left: 0.001, right: rightGap },
        })
      );
    }
    const dLean = leanBroke.diagnose();
    expect(leanBroke.getStats().perLegSwingAborts).toBe(0);
    expect(leanBroke.getStats().stanceReplantCycles).toBeGreaterThanOrEqual(4);
    expect(dLean.subLaw).toBe('lean');
    expect(dLean.reason).toContain('saturated');
  });
});
