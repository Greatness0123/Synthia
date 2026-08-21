/// <reference types="jest" />

import * as THREE from 'three';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import {
  ReactionMassController,
  DEFAULT_RMBS_PARAMS,
  RMBS_MAX_STEP_M,
  RMBS_PURSUIT_FRACTION,
  type RmbsInput,
  type RmbsParams,
} from '../ReactionMassController';

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
};

/**
 * Post-stability-pass masses: robot 90 kg + reaction mass 18 kg = 108 total
 * (matches DEFAULT_RMBS_PARAMS.mRm = 18 and the MJCF reaction_mass body).
 * Pelvis-local frame: local X = LR rail, local Y = FA rail (MuJoCo +Y = forward).
 *
 * Slew/fraction semantics under test:
 *   delta = (pDes − pRm) · params.pursuitFraction,
 *   |delta| ≤ params.maxSlewPerStep  (defaults 0.8 / 0.005)
 *   ctrl  = clamp(pRm + delta, ±railRange)
 *   SATURATED latches only when the mass is AT the rail (|ctrl| ≥ railRange)
 *   with the demand residual still above saturationThresholdM.
 */
const M_TOTAL = 108;
const M_ROBOT = 90;
const M_RM = 18;

function makeInput(partial: Partial<RmbsInput> = {}): RmbsInput {
  return {
    cTotal: { x: 0, y: 0 },
    pRm: { x: 0, y: 0 },
    vComRobot: { x: 0, y: 0 },
    torsoAngVelLocal: { x: 0, y: 0 },
    mTotal: M_TOTAL,
    mRm: M_RM,
    comHeight: 0.95,
    supportCenter: { x: 0, y: 0 },
    torsoUpWorld: { x: 0, y: 0, z: 1 },
    hasContact: true,
    acrobaticFlag: false,
    dt: 0.002,
    params: { ...DEFAULT_RMBS_PARAMS },
    ...partial,
  };
}

/** Coupled total COM from a known robot-only COM and RM position (plan's formula inverted). */
function coupledCom(cRobot: { x: number; y: number }, pRm: { x: number; y: number }) {
  return {
    x: (M_ROBOT * cRobot.x + M_RM * pRm.x) / M_TOTAL,
    y: (M_ROBOT * cRobot.y + M_RM * pRm.y) / M_TOTAL,
  };
}

const LEAD_H095 = Math.sqrt(0.95 / 9.81); // √(h/g) at h=0.95

describe('RMBS — ReactionMassController (stability pass: slew + fraction)', () => {
  test('worldToPelvisLocal uses the inverse capsule rotation at 10° pitch and preserves pelvis-local slide axes', () => {
    const binder = new HumanoidPhysicsBinder({} as any, new THREE.Scene(), 'agent_0');
    const pitchDeg = 10;
    const pitchRad = pitchDeg * Math.PI / 180;
    const qMj: [number, number, number, number] = [
      Math.cos(pitchRad / 2),
      0,
      -Math.sin(pitchRad / 2),
      0,
    ];

    // A pure world-up vector should appear in the pelvis-local frame as
    // (sin(theta), 0, cos(theta)) when the capsule pitches -10° about local Y.
    const worldUp = { x: 0, y: 0, z: 1 };
    const local = (binder as any).worldToPelvisLocal(worldUp, qMj);
    const expectedX = Math.sin(pitchRad);
    const expectedZ = Math.cos(pitchRad);

    expect(local.x).toBeCloseTo(expectedX, 9);
    expect(local.y).toBeCloseTo(0, 9);
    expect(local.z).toBeCloseTo(expectedZ, 9);

    // The RMBS actuators are the body-local axes: LR slide = X, FA slide = Y.
    // Their control values are therefore consumed in pelvis-local coordinates,
    // not in world-facing axes.
    const actLrAxis = { x: 1, y: 0, z: 0 };
    const actFaAxis = { x: 0, y: 1, z: 0 };
    expect(actLrAxis.x).toBe(1);
    expect(actFaAxis.y).toBe(1);
  });

  test('DEFAULT_RMBS_PARAMS match the MJCF + tuned-up defaults (mRm 18, railRange 0.6, kCap −0.3, pursuit 0.8, slew 0.005)', () => {
    expect(DEFAULT_RMBS_PARAMS.mRm).toBe(18);
    expect(DEFAULT_RMBS_PARAMS.railRange).toBe(0.6);
    expect(DEFAULT_RMBS_PARAMS.kCap).toBe(-0.3);
    expect(RMBS_PURSUIT_FRACTION).toBe(0.8);
    expect(RMBS_MAX_STEP_M).toBe(0.005);
    expect(DEFAULT_RMBS_PARAMS.pursuitFraction).toBe(0.8);
    expect(DEFAULT_RMBS_PARAMS.maxSlewPerStep).toBe(0.005);
  });

  test('c_r decoupling: robot-only COM recovered through the fractional output (unclamped slew)', () => {
    const c = new ReactionMassController();
    // Tiny robot COM so 0.8·pDes stays under the 0.005 slew cap → the output
    // exposes the closed-form algebra exactly: pDes = −(m_robot/m_rm)·c_robot
    // at v=0, and ctrl = pDes·0.8.
    const cRobot = { x: -0.001, y: 0.0012 };
    const pRm = { x: 0, y: 0 };
    const cTotal = coupledCom(cRobot, pRm);

    const out = c.computeStep(makeInput({ cTotal, pRm, vComRobot: { x: 0, y: 0 } }));
    expect(out.mode).toBe('grounded');
    expect(out.saturated).toBe(false);
    // pDes.x = (108·0 − 90·(−0.001))/18 = 0.005 → ctrl = 0.8·0.005 = 0.004
    expect(out.ctrlLr).toBeCloseTo(0.004, 9);
    // pDes.y = (0 − 90·0.0012)/18 = −0.006 → ctrl = 0.8·(−0.006) = −0.0048
    expect(out.ctrlFa).toBeCloseTo(-0.0048, 9);
  });

  test('Closed form with explicit kCap=+1.0 (documented chase, unclamped slew)', () => {
    const c = new ReactionMassController();
    const params: RmbsParams = { ...DEFAULT_RMBS_PARAMS, kCap: 1.0 };
    const vForward = 0.002; // small enough that 0.8·pDes stays under the slew cap
    const out = c.computeStep(
      makeInput({ vComRobot: { x: 0, y: vForward }, params })
    );
    // target.y = 1.0·v·√(h/g) → pDes.y = (M/m_rm)·target = 6·target →
    // ctrl = 0.8·pDes (unclamped). Positive-lead forward is documented with
    // the explicit +kCap; the DEFAULT is negative damping (tested below).
    const expected = RMBS_PURSUIT_FRACTION * (M_TOTAL / M_RM) * vForward * LEAD_H095;
    expect(out.ctrlFa).toBeCloseTo(expected, 8);
    expect(out.ctrlLr).toBeCloseTo(0, 9);
    expect(out.mode).toBe('grounded');
    expect(out.saturated).toBe(false);
  });

  test('Live tuning: params.pursuitFraction and params.maxSlewPerStep override the defaults (console setRmbsParams contract)', () => {
    const c = new ReactionMassController();
    // Custom params: 0.5 pursuit (half of default 0.8) + a custom 0.008 slew cap.
    const params: RmbsParams = {
      ...DEFAULT_RMBS_PARAMS,
      pursuitFraction: 0.5,
      maxSlewPerStep: 0.008,
    };

    // Small demand so the FRACTION is the binding constraint: cRobot −0.001 →
    // pDes.y = (90·0.001)/18 = 0.005, ctrl = 0.5·0.005 = 0.0025 (under 0.008).
    const cTotal = coupledCom({ x: 0, y: -0.001 }, { x: 0, y: 0 });
    const frac = c.computeStep(
      makeInput({ cTotal, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: 0 }, params })
    );
    expect(frac.ctrlFa).toBeCloseTo(0.0025, 9);
    expect(frac.ctrlFa).toBeLessThan(RMBS_MAX_STEP_M); // would be 0.004 with default 0.8

    // Large demand so the SLEW CAP is the binding constraint: cRobot −0.05 →
    // pDes.y = (90·0.05)/18 = 0.25; pursuit 0.5 → 0.125 ≫ 0.008 cap.
    const cBig = new ReactionMassController();
    const cTotalBig = coupledCom({ x: 0, y: -0.05 }, { x: 0, y: 0 });
    const slew = cBig.computeStep(
      makeInput({ cTotal: cTotalBig, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: 0 }, params })
    );
    expect(slew.ctrlFa).toBe(0.008); // custom cap, not the default 0.005
    expect(slew.mode).toBe('grounded');
    expect(slew.saturated).toBe(false);
  });

  test('Slew limit: a huge one-step demand moves ctrl by exactly ±0.005 m — NO rail slam', () => {
    const c = new ReactionMassController();
    // v=20 m/s would command pDes = 6·(−0.3·20·0.3112) ≈ −11.2 m in one frame
    // with the old direct-clamp law (rail slam by construction). Now the slew
    // cap bounds the OUTPUT to one 0.005 m step, still GROUNDED.
    const out = c.computeStep(
      makeInput({ cTotal: { x: 0, y: 0 }, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: 20 } })
    );
    expect(out.ctrlFa).toBe(-RMBS_MAX_STEP_M);
    expect(out.ctrlLr).toBe(0);
    expect(out.mode).toBe('grounded'); // not at rail → no latch
    expect(out.saturated).toBe(false);

    const c2 = new ReactionMassController();
    const back = c2.computeStep(
      makeInput({ cTotal: { x: 0, y: 0 }, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: -20 } })
    );
    expect(back.ctrlFa).toBe(RMBS_MAX_STEP_M);
    expect(back.mode).toBe('grounded');
  });

  test('Convergence: per-step delta ≤ 0.005, tracks toward the rail, latches ONLY at the rail', () => {
    const c = new ReactionMassController();
    const params: RmbsParams = {
      ...DEFAULT_RMBS_PARAMS,
      railRange: 0.05,
      saturationThresholdM: 0.02,
      kCap: 1.0,
    };
    // v=0.05 → target.y = 0.05·√(h/g) = 0.015558; pDes.y = 6·target = 0.09335 ≫ rail.
    const bigV = 0.05;
    const base = makeInput({ vComRobot: { x: 0, y: bigV }, params });
    // pDes sanity: 6·0.05·lead = 0.09335
    expect(6 * bigV * LEAD_H095).toBeGreaterThan(params.railRange + params.saturationThresholdM);

    // Feedback loop: the binder feeds the real mass position each step, so the
    // test simulates the mass by feeding the previous ctrl back as the next pRm.
    let pRm = { x: 0, y: 0 };
    let prev: { ctrlLr: number; ctrlFa: number } = { ctrlLr: 0, ctrlFa: 0 };
    let firstLatchStep = -1;
    for (let i = 0; i < 250; i++) {
      const out = c.computeStep(makeInput({ ...base, pRm }));
      // Per-step output delta never exceeds the slew cap.
      expect(Math.abs(out.ctrlLr - prev.ctrlLr)).toBeLessThanOrEqual(RMBS_MAX_STEP_M + 1e-12);
      expect(Math.abs(out.ctrlFa - prev.ctrlFa)).toBeLessThanOrEqual(RMBS_MAX_STEP_M + 1e-12);
      prev = { ctrlLr: out.ctrlLr, ctrlFa: out.ctrlFa };
      pRm = { x: out.ctrlLr, y: out.ctrlFa };
      if (firstLatchStep < 0 && out.saturated) firstLatchStep = i;
    }

    // The mass can only reach the rail through the slew cap: 0.05 / 0.005 =
    // 10 → the 10th call (index 9) is the first ctrl AT the rail, and the
    // latch fires exactly there — never during the transit (the slew keeps the
    // output 0.005 m below the rail until the final step).
    expect(firstLatchStep).toBe(9);
    expect(c.getStats().saturationCount).toBeGreaterThanOrEqual(1);
    expect(c.getStats().maxAbsResidual).toBeGreaterThan(0.02);
    expect(c.getStats().maxAbsCtrl).toBeCloseTo(0.05, 6);
  });

  test('SATURATED hold at the rail, one event per latch, window countdown, then re-latch when still at rail', () => {
    const c = new ReactionMassController();
    const params: RmbsParams = {
      ...DEFAULT_RMBS_PARAMS,
      railRange: 0.05,
      saturationThresholdM: 0.02,
      kCap: 1.0,
    };
    const bigV = 0.05; // pDes.y = 0.09335 ≫ rail 0.05
    const base = makeInput({ vComRobot: { x: 0, y: bigV }, params });
    const step = (pRm: { x: number; y: number }) => c.computeStep(makeInput({ ...base, pRm }));

    // Physically-faithful feedback: the mass follows the commanded ctrl.
    // Rail 0.05 / slew 0.005 = 10 calls to reach the rail; call 10 (i=9) is
    // the first ctrl AT the rail, so the latch event fires on that call.
    let pRm = { x: 0, y: 0 };
    let out: any = null;
    for (let i = 0; i < 10; i++) {
      out = step(pRm);
      pRm = { x: out.ctrlLr, y: out.ctrlFa };
    }
    expect(out.ctrlFa).toBeCloseTo(0.05, 6);
    expect(out.mode).toBe('saturated');
    expect(out.saturated).toBe(true);
    expect(c.getStats().saturationCount).toBe(1);

    // Window (0.4 s @ 500 Hz = 200 frames). The latch call set timer=0.4; the
    // window holds 'saturated' for calls 1..199 (timer 0.398 → 0.002). The
    // event never re-fires along the way.
    for (let i = 0; i < 199; i++) {
      out = step(pRm);
      pRm = { x: out.ctrlLr, y: out.ctrlFa };
      expect(out.saturated).toBe(false);
      expect(out.ctrlFa).toBeCloseTo(0.05, 6);
      expect(out.mode).toBe('saturated');
    }
    // 200th call after the latch: timer hits 0 → grounded, still holding the
    // rail ctrl (the mass has not moved — ctrl == pRm == rail).
    out = step(pRm);
    expect(out.mode).toBe('grounded');
    expect(out.ctrlFa).toBeCloseTo(0.05, 6);
    expect(out.saturated).toBe(false);
    expect(c.getStats().saturationCount).toBe(1);

    // The mass is still AT the rail with the hot demand → the grounded path
    // re-latches immediately (atRail && residual > threshold).
    out = step(pRm);
    expect(out.ctrlFa).toBeCloseTo(0.05, 6);
    expect(out.mode).toBe('saturated');
    expect(out.saturated).toBe(true);
    expect(c.getStats().saturationCount).toBe(2);
  });

  test('Sign regression: DEFAULT kCap −0.3 damps +v (forward) → NEGATIVE ctrlFa', () => {
    const c = new ReactionMassController();
    const fwd = c.computeStep(
      makeInput({ cTotal: { x: 0, y: 0 }, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: 0.5 } })
    );
    // target.y = −0.3·0.5·lead < 0 → pDes.y < 0 → ctrlFa < 0 (damping opposes motion).
    expect(fwd.ctrlFa).toBeLessThan(0);
    expect(fwd.ctrlLr).toBe(0);

    const c2 = new ReactionMassController();
    const back = c2.computeStep(
      makeInput({ cTotal: { x: 0, y: 0 }, pRm: { x: 0, y: 0 }, vComRobot: { x: 0, y: -0.5 } })
    );
    expect(back.ctrlFa).toBeGreaterThan(0);
  });

  test('Lateral v along local X never bleeds into the FA rail (axis separation)', () => {
    const c = new ReactionMassController();
    const out = c.computeStep(
      makeInput({ cTotal: { x: 0, y: 0 }, pRm: { x: 0, y: 0 }, vComRobot: { x: 0.5, y: 0 } })
    );
    expect(out.ctrlLr).toBeLessThan(0); // −kCap damping on +X
    expect(out.ctrlFa).toBeCloseTo(0, 9); // pure lateral command, no FA leakage
  });

  test('Mode machine: no contact → AIRBALL with mild anti-spin (opposes pitch/roll rates)', () => {
    const c = new ReactionMassController();
    const out = c.computeStep(
      makeInput({
        torsoUpWorld: { x: 0, y: 0, z: 1 },
        hasContact: false,
        torsoAngVelLocal: { x: 5, y: 5 },
      })
    );
    expect(out.mode).toBe('airball');
    expect(out.ctrlFa).toBeCloseTo(0.05, 6);
    expect(out.ctrlLr).toBeCloseTo(0.05, 6);
  });

  test('AIRBALL without spin holds centered', () => {
    const c = new ReactionMassController();
    const out = c.computeStep(
      makeInput({
        torsoUpWorld: { x: 0, y: 0, z: 1 },
        hasContact: false,
        torsoAngVelLocal: { x: 0, y: 0 },
      })
    );
    expect(out.mode).toBe('airball');
    expect(out.ctrlLr).toBe(0);
    expect(out.ctrlFa).toBe(0);
  });

  test('Mode machine: torso-up below 0.5 → ACROBATIC (hold centered, passive)', () => {
    const c = new ReactionMassController();
    const out = c.computeStep(
      makeInput({
        torsoUpWorld: { x: 0, y: 0, z: 0.49 },
        hasContact: true,
        vComRobot: { x: 0, y: 20 },
      })
    );
    expect(out.mode).toBe('acrobatic');
    expect(out.ctrlLr).toBe(0);
    expect(out.ctrlFa).toBe(0);
    expect(out.saturated).toBe(false);
  });

  test('Mode machine: explicit acrobaticFlag overrides a grounded state', () => {
    const c = new ReactionMassController();
    const out = c.computeStep(
      makeInput({
        torsoUpWorld: { x: 0, y: 0, z: 1 },
        hasContact: true,
        acrobaticFlag: true,
        vComRobot: { x: 0, y: 20 },
      })
    );
    expect(out.mode).toBe('acrobatic');
    expect(out.ctrlLr).toBe(0);
    expect(out.ctrlFa).toBe(0);
  });

  test('Telemetry: stats accumulate frames, max residual, max ctrl; reset() clears all', () => {
    const c = new ReactionMassController();
    const params: RmbsParams = {
      ...DEFAULT_RMBS_PARAMS,
      railRange: 0.05,
      saturationThresholdM: 0.02,
      kCap: 1.0,
    };
    const base = makeInput({ vComRobot: { x: 0, y: 0.05 }, params });
    let pRm = { x: 0, y: 0 };
    for (let i = 0; i < 50; i++) {
      const out = c.computeStep(makeInput({ ...base, pRm }));
      pRm = { x: out.ctrlLr, y: out.ctrlFa };
    }
    const s = c.getStats();
    expect(s.frames).toBe(50);
    // Rail 0.05 is reached on call 10 (index 9) → exactly one latch in 50 steps.
    expect(s.saturationCount).toBe(1);
    expect(s.maxAbsResidual).toBeGreaterThan(0.02);
    expect(s.maxAbsCtrl).toBeCloseTo(0.05, 6);

    c.reset();
    expect(c.getStats().frames).toBe(0);
    expect(c.getStats().saturationCount).toBe(0);
    expect(c.getMode()).toBe('grounded');
  });
});
