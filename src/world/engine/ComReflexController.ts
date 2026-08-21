/**
 * Road-4 — pure COM reflex controller (framework-independent, deterministic).
 *
 * Implements the task's three laws:
 *   1. COM LEAN CORRECTION — always, clamped ±0.25 rad.
 *      e = COM fore/aft offset from the stance foot; v = COM fore/aft velocity.
 *      leanOffsetRad = clamp(kH·e + kD·v, −0.25, +0.25).
 *      SIGN: positive leanOffsetRad = torso leans BACK (counters a forward COM);
 *      the binder maps a positive offset to a negative pitch on the trunk
 *      (Three world: forward pitch = +X rotation, so lean-back = −X pitch).
 *   2. CAPTURE STEP — during the gait's empirical swing window, steer the swing
 *      hip so the foot lands at the capture point:
 *        captureM = e + v·√(h/g)   (fore/aft, ahead of the COM by the v·√(h/g) lead)
 *        swingHipOffsetRad = kCapture · (captureM − swingFootForeAft) · swingEnv
 *   3. FORCED STEP — when |e| exceeds forceStepM OUTSIDE any swing window,
 *      swing the free (non-stance) foot to capture at full gain.
 *
 * The controller is pure except for two tiny stateful latches: the last-planted
 * stance foot (hysteresis while both soles are momentarily airborne) and the
 * step transient tracker (one fired/landed credit per step cycle). It
 * accumulates run telemetry and can attribute a failure to the LEAN sub-law
 * (correction insufficient) vs the STEP sub-law (steps never fired / never
 * cleared / stance never re-planted).
 *
 * Forward axis convention is Three.js-like: forwardVec = (0,0,-1). A fore/aft
 * projection is f = dot(p, forwardVec); "ahead" ⇒ larger f. The empirical swing
 * windows come from gaitPhaseMap (single source of truth).
 */

import type { Side, SwingPhase } from './gaitPhaseMap';
import { GAIT_CYCLE, isSideSwinging, swingEnvAt } from './gaitPhaseMap';

// ── Types ──────────────────────────────────────────────────────────────
export interface ReflexGains {
  /** Torso-lean rad per meter of COM fore/aft offset. */
  kH: number;
  /** Torso-lean rad per (m/s) of COM fore/aft velocity. */
  kD: number;
  /** Swing-hip rad per meter of (capture − swing-foot) error. */
  kCapture: number;
  /** |COM offset| (m) beyond which a forced step fires outside swing windows. */
  forceStepM: number;
  /** Lean correction clamp (rad). Task fixes this at ±0.25. */
  maxLeanRad?: number;
  /** Absolute swing-hip injection clamp (rad) — safety against twitch. */
  maxSwingHipRad?: number;
  /**
   * Swing lifetime in cycle fractions (0..1) for the per-leg FSM: the leg is
   * commanded up over [0, swingDurationU/2] and down over the second half.
   * Default 0.30 (9.6 frames at 32/cycle). FSM-only; unused when the FSM is off.
   */
  swingDurationU?: number;
  /**
   * Double-support dwell after a mandatory plant, in cycle fractions, before
   * that leg may re-swing. Default 0.10 (3.2 frames). FSM-only.
   */
  refractoryDurationU?: number;
  /** Per-leg forced-swing hip throw clamp (rad). Default 0.5. FSM-only. */
  maxForceStepHipRad?: number;
  /** Per-leg swing knee amplitude (rad). Default 0.8. FSM-only. */
  maxSwingKneeRad?: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SoleGapsM {
  left: number;
  right: number;
}

export interface ReflexFrameInput {
  comPosWorld: Vec3;
  comVelWorld: Vec3;
  /** Normalized fore/aft axis (yaw-only). Three.js convention: (0,0,-1). */
  forwardVec: Vec3;
  leftFootPos: Vec3;
  rightFootPos: Vec3;
  footSoleGapsM: SoleGapsM;
  /** Cycle fraction in [0,1) of the gait phase. */
  cyclePhase01: number;
  /** COM height above ground (m) — pendulum length for √(h/g). */
  comHeightM: number;
  /**
   * Seconds since the previous computeFrame call. When undefined the FSM
   * advances by the fixed-step default (FSM_DT_DEFAULT_S = 1/500 s), which
   * keeps pure-input unit tests deterministic. The binder passes 0.002.
   */
  dtS?: number;
  /** Optional: torso tilt (deg) — used by failure attribution only. */
  tiltDeg?: number;
  gains: ReflexGains;
}

/**
 * Per-leg step finite-state machine state (Road-4 round 4):
 *   stance → swing → planted → refractory → stance
 *   - stance:      leg is the support / resting leg (may be asked to swing).
 *   - swing:       leg is commanded airborne by the capture-step (natural
 *                  window or forced dispatch); enveloped 0→1→0 shoulder.
 *   - planted:     mandatory-plant exit fired (sole gap ≤ PLANTED_GAP_M);
 *                  next frame the leg enters refractory.
 *   - refractory:  double-support dwell after plant — blocks re-swing while
 *                  refractoryU > 0.
 */
export type LegStepState = 'stance' | 'swing' | 'planted' | 'refractory';

export interface LegStepTimers {
  /** Fraction of GAIT_CYCLE.durationS the leg has been swinging (0..maxSwingU). */
  swingU: number;
  /** Fraction of GAIT_CYCLE.durationS remaining in refractory (0..maxRefractoryU). */
  refractoryU: number;
}

export interface LegStepStateBundle {
  state: LegStepState;
  /** Swing progress in cycle fractions: 0 at liftoff → swingDurationU at abort. */
  swingU: number;
  /** 0→1→0 bump over the swing interval (peak at mid-swing, 0 at plant/abort). */
  shoulderEnv: number;
  /** Binder-facing leg command for this frame. */
  command: 'plant' | 'lift' | 'hold' | 'none';
  /** True while this leg is swinging due to law 3 (outside natural window). */
  forced: boolean;
}

export interface ReflexCommand {
  /** COM fore/aft offset from the stance foot (m; >0 = COM ahead). */
  e: number;
  /** COM fore/aft velocity (m/s; >0 = moving forward/ahead). */
  v: number;
  /**
   * Torso/hip lean correction (rad). SIGN: positive = lean BACK, i.e. the
   * torso counter-leans against a forward COM. Clamped to ±maxLeanRad.
   */
  leanOffsetRad: number;
  /** Capture-point fore/aft offset from the stance foot (m). */
  captureM: number;
  /** Stance side (support center). Hysteresis-latched while both feet airborne. */
  stanceSide: Side;
  /** The leg currently swinging (inside its window) or the forced free foot. */
  swingSide: Side;
  /**
   * Per-leg FSM state for telemetry/debug. Present once the FSM is active
   * (round 4). `swingState[swingSide].shoulderEnv` shapes the binder's swing
   * hip/knee/ankle injection; the binder only injects while
   * `swingState[swingSide].state === 'swing'`.
   */
  swingState?: { [side in Side]: LegStepStateBundle };
  /** True when the current cycle phase falls inside a natural swing window. */
  inSwingWindow: boolean;
  /**
   * Swing-hip pitch injection (rad, positive = hip flexes forward) so the
   * swing foot lands at the capture point. Envelope-shaped inside a window;
   * for a forced step the shape is the per-leg shoulderEnv bump.
   */
  swingHipOffsetRad: number;
  /** True when a forced capture step fires outside a swing window. */
  forcedStep: boolean;
  /** Set when the sole gaps indicate both feet planted (double support). */
  doubleSupport: boolean;
  /** Current phase classification from the phase map. */
  phase: SwingPhase;
}

/** Run-aggregated telemetry used by the gate AND by failure attribution. */
export interface ReflexStats {
  maxAbsE: number;
  maxAbsV: number;
  maxLeanOffsetRad: number;
  maxCaptureM: number;
  minCaptureM: number;
  forcedStepCount: number;
  captureStepsFired: number;
  captureStepsLanded: number;
  stanceSideFlips: number;
  swingGapMaxM: number;
  stanceGapMaxM: number;
  maxTiltDeg: number;
  frames: number;
  /**
   * Count of completed mandatory-plant events (each swing-leg touchdown that
   * exits `swing` at gap ≤ PLANTED_GAP_M). Gate invariant: ≥ 1 per gait cycle.
   */
  stanceReplantCycles: number;
  /** Count of legs aborted by the max-swing-duration cap. Must be 0 on a pass. */
  perLegSwingAborts: number;
  /** Count of mandatory-plant exit gates that satisfied `gap ≤ PLANTED_GAP_M`. */
  plantedTouchdowns: number;
}

export type FailureSubLaw = 'none' | 'lean' | 'step' | 'unknown';

/** Sub-law attribution verdict for a failed run. */
export interface ReflexDiagnosis {
  subLaw: FailureSubLaw;
  reason: string;
}

// ── Defaults ───────────────────────────────────────────────────────────
export const DEFAULT_REFLEX_GAINS: ReflexGains = {
  kH: 2.0,
  kD: 0.4,
  kCapture: 0.6,
  forceStepM: 0.18,
  maxLeanRad: 0.25,
  maxSwingHipRad: 0.5,
  swingDurationU: 0.30,
  refractoryDurationU: 0.10,
  maxForceStepHipRad: 0.5,
  maxSwingKneeRad: 0.8,
};

const G = 9.81;
/** Sole gap below which a foot counts as planted (matches the gate's 5 mm). */
const PLANTED_GAP_M = 0.005;
/** Sole gap above which a foot counts as clearly airborne (swing). */
const AIRBORNE_GAP_M = 0.015;
/** Minimum frames before failure attribution gives a verdict. */
const MIN_EVIDENCE_FRAMES = 60;

/**
 * Fixed-step default for the FSM when `ReflexFrameInput.dtS` is undefined —
 * keeps pure-input unit tests deterministic at the binder's 500 Hz cadence.
 */
const FSM_DT_DEFAULT_S = 1 / 500;

// ── Helpers ────────────────────────────────────────────────────────────
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalized(v: Vec3): Vec3 {
  const mag = Math.hypot(v.x, v.y, v.z);
  if (mag < 1e-9) return { x: 0, y: 0, z: -1 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 0→1→0 bump over x ∈ [0,1] (peak 1.0 at x=0.5, 0 at both ends). */
function bump(x: number): number {
  const p = clamp(x, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * p);
}

// ── Controller ─────────────────────────────────────────────────────────
export class ComReflexController {
  private lastPlantedSide: Side = 'left';
  private stats: ReflexStats = this.freshStats();

  // ── Per-leg step FSM (Road-4 round 4) ────────────────────────────────
  private legState: { [side in Side]: LegStepState } = {
    left: 'stance',
    right: 'stance',
  };
  private legSwingU: { [side in Side]: number } = { left: 0, right: 0 };
  private legRefractoryU: { [side in Side]: number } = { left: 0, right: 0 };
  private legForcedFlag: { [side in Side]: boolean } = { left: false, right: false };
  public swingRequest: Side | null = null;

  /** Reset the hysteresis latches, the FSM, and run telemetry (clip start). */
  public reset(startStanceSide: Side = 'left'): void {
    this.lastPlantedSide = startStanceSide;
    this.legState = { left: 'stance', right: 'stance' };
    this.legSwingU = { left: 0, right: 0 };
    this.legRefractoryU = { left: 0, right: 0 };
    this.legForcedFlag = { left: false, right: false };
    this.swingRequest = null;
    this.stats = this.freshStats();
  }

  public getStats(): ReflexStats {
    return { ...this.stats };
  }

  private freshStats(): ReflexStats {
    return {
      maxAbsE: 0,
      maxAbsV: 0,
      maxLeanOffsetRad: 0,
      maxCaptureM: -Infinity,
      minCaptureM: Infinity,
      forcedStepCount: 0,
      captureStepsFired: 0,
      captureStepsLanded: 0,
      stanceSideFlips: 0,
      swingGapMaxM: 0,
      stanceGapMaxM: 0,
      maxTiltDeg: 0,
      frames: 0,
      stanceReplantCycles: 0,
      perLegSwingAborts: 0,
      plantedTouchdowns: 0,
    };
  }

  /** Per-leg envelope (cycle-fraction basis) for the given gains. */
  private static swingDurU(g: ReflexGains): number {
    return Math.max(1e-6, g.swingDurationU ?? 0.3);
  }

  private static refractoryDurU(g: ReflexGains): number {
    return Math.max(0, g.refractoryDurationU ?? 0.1);
  }

  /**
   * Build the binder-facing bundle for one leg this frame.
   * command: stance/refractory → 'none'; swing at shoulderEnv<0.5 → 'lift',
   *          swing at shoulderEnv≥0.5 → 'hold'; planted → 'plant'.
   */
  private buildLegStateBundle(side: Side, g: ReflexGains): LegStepStateBundle {
    const state = this.legState[side];
    const swingU = this.legSwingU[side];
    const swingDurU = ComReflexController.swingDurU(g);
    const shoulderEnv = state === 'swing' ? bump(swingU / swingDurU) : 0;
    let command: 'plant' | 'lift' | 'hold' | 'none' = 'none';
    if (state === 'swing') {
      command = shoulderEnv < 0.5 ? 'lift' : 'hold';
    } else if (state === 'planted') {
      command = 'plant';
    }
    return { state, swingU, shoulderEnv, command, forced: this.legForcedFlag[side] };
  }

  /**
   * Advance the per-leg step FSM for this frame and resolve the single swinger.
   *
   * Order per leg: a mid-swing leg either aborts at maxSwingU (never frozen
   * airborne), plants at sole gap ≤ PLANTED_GAP_M (mandatory-plant exit),
   * or keeps swinging with swingU += dtU. `planted` is a one-frame
   * acknowledgment → `refractory` the next frame, and `refractoryU` counts
   * down to 0 → `stance`. Dispatch happens only when NO leg is mid-swing:
   * the natural phase-map window wins over the forced free side; both require
   * the target leg to be `stance` with `refractoryU` exhausted (refractory
   * dwell blocks re-swing). Forced dispatch credits `forcedStepCount` ONCE
   * (transition semantics), not per step.
   */
  private advanceLegStateMachines(opts: {
    dtS?: number;
    gains: ReflexGains;
    gaps: SoleGapsM;
    naturalSwingSide: Side | null;
    freeSide: Side;
    forcedDispatchSide: Side | null;
  }): { bundles: { [side in Side]: LegStepStateBundle }; swingRequest: Side | null; dispatchFired: boolean } {
    const SIDES: Side[] = ['left', 'right'];
    // dtS semantics: undefined → fixed default (1/500); NaN/negative → 0.
    const rawDtS = opts.dtS === undefined ? FSM_DT_DEFAULT_S : Number.isFinite(opts.dtS) ? opts.dtS : 0;
    const dtS = Math.max(0, rawDtS);
    const dtU = dtS / GAIT_CYCLE.durationS;
    const maxSwingU = ComReflexController.swingDurU(opts.gains);
    const maxRefractoryU = ComReflexController.refractoryDurU(opts.gains);
    let dispatchFired = false;

    // Phase A: advance / exit existing per-leg states.
    for (const side of SIDES) {
      const state = this.legState[side];
      const gap = side === 'left' ? opts.gaps.left : opts.gaps.right;
      if (state === 'swing') {
        this.legSwingU[side] += dtU;
        if (this.legSwingU[side] >= maxSwingU) {
          // Abort: max swing duration hit → leg descends (envelope already 0).
          this.legState[side] = 'stance';
          this.legSwingU[side] = 0;
          this.legForcedFlag[side] = false;
          this.stats.perLegSwingAborts += 1;
        } else if (gap <= PLANTED_GAP_M) {
          // Mandatory plant: swing → planted, exact one credit.
          this.legState[side] = 'planted';
          this.legSwingU[side] = 0;
          this.legForcedFlag[side] = false;
          this.stats.stanceReplantCycles += 1;
          this.stats.plantedTouchdowns += 1;
          this.stats.captureStepsLanded += 1;
        }
      } else if (state === 'planted') {
        // One-frame acknowledgment → refractory dwell (double support).
        this.legState[side] = 'refractory';
        this.legRefractoryU[side] = maxRefractoryU;
      } else if (state === 'refractory') {
        this.legRefractoryU[side] = Math.max(0, this.legRefractoryU[side] - dtU);
        if (this.legRefractoryU[side] <= 0) {
          this.legState[side] = 'stance';
        }
      }
    }

    // Phase B: dispatch a new swing only when NO leg is mid-swing (one-swinger-max).
    let swingRequest: Side | null = null;
    const alreadySwinging = SIDES.filter((s) => this.legState[s] === 'swing');
    if (alreadySwinging.length === 0) {
      if (opts.naturalSwingSide !== null) {
        const side = opts.naturalSwingSide;
        if (this.legState[side] === 'stance' && this.legRefractoryU[side] <= 0) {
          this.legState[side] = 'swing';
          this.legSwingU[side] = 0;
          this.legForcedFlag[side] = false;
          swingRequest = side;
          this.stats.captureStepsFired += 1;
        }
      }
      if (swingRequest === null && opts.forcedDispatchSide !== null) {
        const side = opts.forcedDispatchSide;
        if (this.legState[side] === 'stance' && this.legRefractoryU[side] <= 0) {
          this.legState[side] = 'swing';
          this.legSwingU[side] = 0;
          this.legForcedFlag[side] = true;
          swingRequest = side;
          this.stats.forcedStepCount += 1;
          this.stats.captureStepsFired += 1;
          dispatchFired = true;
        }
      }
    } else {
      swingRequest = alreadySwinging[0];
    }

    const bundles: { [side in Side]: LegStepStateBundle } = {
      left: this.buildLegStateBundle('left', opts.gains),
      right: this.buildLegStateBundle('right', opts.gains),
    };

    return { bundles, swingRequest, dispatchFired };
  }

  /**
   * Choose the stance (support) foot. A foot is planted when its sole gap
   * ≤ PLANTED_GAP_M. When exactly one foot is planted it is the stance foot.
   * When both are planted, the lower-gap (more-loaded) foot wins. When neither
   * is planted (both airborne mid-flight), the previous stance side is latched.
   */
  private resolveStanceSide(gaps: SoleGapsM): Side {
    const leftPlanted = gaps.left <= PLANTED_GAP_M;
    const rightPlanted = gaps.right <= PLANTED_GAP_M;
    if (leftPlanted && !rightPlanted) return 'left';
    if (rightPlanted && !leftPlanted) return 'right';
    if (leftPlanted && rightPlanted) {
      return gaps.left <= gaps.right ? 'left' : 'right';
    }
    return this.lastPlantedSide; // both airborne → hysteresis
  }

  /** True while the cycle fraction u is inside the given side's swing window. */
  private static sideInWindow(u: number, side: Side): boolean {
    return isSideSwinging(u, side);
  }

  /** Compute one reflex frame. Pure math + two tiny latches + stats. */
  public computeFrame(input: ReflexFrameInput): ReflexCommand {
    const fwd = normalized(input.forwardVec);
    const g = input.gains;

    // Fore/aft scalars along the yaw-axis forward direction.
    const comF = dot(input.comPosWorld, fwd);
    const comVelF = dot(input.comVelWorld, fwd);
    const leftFootF = dot(input.leftFootPos, fwd);
    const rightFootF = dot(input.rightFootPos, fwd);

    const stanceSide = this.resolveStanceSide(input.footSoleGapsM);
    if (stanceSide !== this.lastPlantedSide) {
      this.stats.stanceSideFlips += 1;
      this.lastPlantedSide = stanceSide;
    }
    const stanceFootF = stanceSide === 'left' ? leftFootF : rightFootF;

    // Law 1: COM lean correction.
    const e = comF - stanceFootF; // >0 = COM ahead of the support center
    const v = comVelF; // >0 = COM moving forward/ahead
    const maxLean = g.maxLeanRad ?? 0.25;
    const leanOffsetRad = clamp(g.kH * e + g.kD * v, -maxLean, maxLean);

    // Law 2: capture point = COM + v·√(h/g), in fore/aft terms relative to stance.
    const h = Math.max(0.2, input.comHeightM);
    const leadM = v * Math.sqrt(h / G);
    const captureM = e + leadM;

    // Swing target: which leg swings, and by how much.
    const u = input.cyclePhase01;
    const leftSwings = ComReflexController.sideInWindow(u, 'left');
    const rightSwings = ComReflexController.sideInWindow(u, 'right');
    const inSwingWindow = leftSwings || rightSwings;
    const naturalSwingSide: Side | null = leftSwings ? 'left' : rightSwings ? 'right' : null;

    // Law 3: forced step when |e| exceeds forceStepM outside any swing window.
    // The free foot is the NON-stance side (the foot that can actually step).
    const freeSide: Side = stanceSide === 'left' ? 'right' : 'left';
    const outsideWindow = !inSwingWindow;
    const forced = outsideWindow && Math.abs(e) > g.forceStepM;
    // Transition semantics: `forced` triggers a one-frame DISPATCH into the FSM
    // (the leg then owns its own timed swing). Re-arming only happens once the
    // leg has completed plant → refractory → stance.
    const forcedDispatchSide: Side | null = forced ? freeSide : null;

    // Advance the per-leg FSM: mandatory-plant exits, refractory dwell,
    // one-swinger-max, abort, and the dispatch transition.
    const fsm = this.advanceLegStateMachines({
      dtS: input.dtS,
      gains: g,
      gaps: input.footSoleGapsM,
      naturalSwingSide,
      freeSide,
      forcedDispatchSide,
    });
    // advanceLegStateMachines mutated this.legState / legSwingU / legRefractoryU
    // in place; the returned bundles are the binder-facing view for this frame.
    this.swingRequest = fsm.swingRequest;
    const fsmSwingSide = fsm.swingRequest;

    // The binder-facing swing side: the FSM swinger wins; fall back to the
    // natural/free side so `swingSide` is never null.
    const swingSide: Side = fsmSwingSide ?? naturalSwingSide ?? freeSide;
    const swingFootF = swingSide === 'left' ? leftFootF : rightFootF;
    const swingFootGap = swingSide === 'left' ? input.footSoleGapsM.left : input.footSoleGapsM.right;
    const stanceFootGap = stanceSide === 'left' ? input.footSoleGapsM.left : input.footSoleGapsM.right;

    // Swing-hip injection: natural-window legs keep the phase-map envelope;
    // forced legs follow the per-leg FSM shoulderEnv 0→1→0 bump. The binder
    // additionally gates on `swingState[swingSide].state === 'swing'`.
    let swingHipOffsetRad = 0;
    if (fsm.bundles[swingSide].state === 'swing') {
      if (fsm.bundles[swingSide].forced) {
        const error = captureM - (swingFootF - stanceFootF);
        swingHipOffsetRad =
          clamp(g.kCapture * error, -(g.maxForceStepHipRad ?? g.maxSwingHipRad ?? 0.5), g.maxForceStepHipRad ?? g.maxSwingHipRad ?? 0.5) *
          fsm.bundles[swingSide].shoulderEnv;
      } else {
        const error = captureM - (swingFootF - stanceFootF);
        const env = swingEnvAt(u, swingSide);
        swingHipOffsetRad = clamp(g.kCapture * error * env, -(g.maxSwingHipRad ?? 0.5), g.maxSwingHipRad ?? 0.5);
      }
    }

    // Telemetry (used by the gate + attribution).
    const s = this.stats;
    s.frames += 1;
    s.maxAbsE = Math.max(s.maxAbsE, Math.abs(e));
    s.maxAbsV = Math.max(s.maxAbsV, Math.abs(v));
    s.maxLeanOffsetRad = Math.max(s.maxLeanOffsetRad, Math.abs(leanOffsetRad));
    s.maxCaptureM = Math.max(s.maxCaptureM, captureM);
    s.minCaptureM = Math.min(s.minCaptureM, captureM);
    s.swingGapMaxM = Math.max(s.swingGapMaxM, swingFootGap);
    s.stanceGapMaxM = Math.max(s.stanceGapMaxM, stanceFootGap);
    if (typeof input.tiltDeg === 'number') {
      s.maxTiltDeg = Math.max(s.maxTiltDeg, input.tiltDeg);
    }

    const phase: SwingPhase = fsm.bundles.left.state === 'swing'
      ? 'left_swing'
      : fsm.bundles.right.state === 'swing'
        ? 'right_swing'
        : inSwingWindow
          ? (leftSwings ? 'left_swing' : 'right_swing')
          : 'double_support';

    const doubleSupport = !leftSwings && !rightSwings && fsm.bundles.left.state !== 'swing' && fsm.bundles.right.state !== 'swing';

    return {
      e,
      v,
      leanOffsetRad,
      captureM,
      stanceSide,
      swingSide,
      swingState: fsm.bundles,
      inSwingWindow,
      swingHipOffsetRad,
      forcedStep: forced,
      doubleSupport,
      phase,
    };
  }

  /**
   * Attribute a failed run to the LEAN or STEP sub-law.
   *
   *  - LEAN-broke: capture steps fired AND the swing foot cleared AND the
   *    stance foot stayed planted, yet |e| still grew past forceStepM (or the
   *    gate reports a growing tilt) → the lean corrector is under-powered.
   *  - STEP-broke: steps never fired despite |e| > forceStepM, or the swing
   *    foot never cleared the ground, or the stance foot never re-planted →
   *    the capture-step machinery is deficient.
   *  - none: |e| was contained and no failures occurred.
   */
  public diagnose(): ReflexDiagnosis {
    const s = this.stats;
    if (s.frames < MIN_EVIDENCE_FRAMES) {
      return { subLaw: 'unknown', reason: `insufficient evidence (${s.frames} frames)` };
    }

    const stepsFired = Math.max(1, s.captureStepsFired);
    const stepLandRate = s.captureStepsLanded / stepsFired;
    const swingCleared = s.swingGapMaxM >= AIRBORNE_GAP_M;
    const stancePlanted = s.stanceGapMaxM <= PLANTED_GAP_M + 0.002;
    const leanExceeded = s.maxAbsE > 0.18 + 0.02;

    if (s.perLegSwingAborts > 0) {
      return {
        subLaw: 'step',
        reason: `leg aborted suspended ${s.perLegSwingAborts}× — swing-duration cap hit before re-plant (swingU ≥ maxSwingU)`,
      };
    }
    if (!swingCleared) {
      return {
        subLaw: 'step',
        reason: `swing foot never cleared (max swing gap ${(s.swingGapMaxM * 1000).toFixed(0)} mm < 15 mm)`,
      };
    }
    if (!stancePlanted) {
      return {
        subLaw: 'step',
        reason: `stance foot never re-planted (max stance gap ${(s.stanceGapMaxM * 1000).toFixed(0)} mm > 5 mm)`,
      };
    }
    if (!leanExceeded) {
      return { subLaw: 'none', reason: `COM contained (max |e| ${s.maxAbsE.toFixed(2)} m ≤ 0.18 m)` };
    }
    if (s.captureStepsFired === 0) {
      return {
        subLaw: 'step',
        reason: `COM exceeded ${s.maxAbsE.toFixed(2)} m but NO capture step fired`,
      };
    }
    if (stepLandRate < 0.5) {
      return {
        subLaw: 'step',
        reason: `capture steps fired but rarely landed (${s.captureStepsLanded}/${s.captureStepsFired}, rate ${stepLandRate.toFixed(2)})`,
      };
    }
    return {
      subLaw: 'lean',
      reason: `lean corrector saturated: |e| max ${s.maxAbsE.toFixed(2)} m despite ${s.captureStepsLanded} landed steps (kH/kD too low or clamp hit)`,
    };
  }
}
