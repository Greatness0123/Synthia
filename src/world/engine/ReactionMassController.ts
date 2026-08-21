/**
 * RMBS v1 — Reaction-Mass Balance Controller (framework-independent, deterministic).
 *
 * Runs at 500 Hz. Consumes state that the HumanoidPhysicsBinder has already
 * rotated into the PELVIS-LOCAL horizontal frame:
 *   - local X = left/right slide rail (rm_slide_lr, axis 1 0 0)
 *   - local Y = fore/aft slip rail (rm_slide_fa, axis 0 1 0)
 * All positions are relative to the capsule (pelvis) frame origin. The two
 * output ctrl values are absolute qpos targets for the two slide position
 * actuators — the binder writes them into data.ctrl; this controller never
 * touches MuJoCo directly.
 *
 * Laws:
 *   GROUNDED  target = support + kCap·v·√(h/g);
 *             p_rm_des = (M·target − m_r·c_r)/m_rm.
 *             The command is a FRACTIONAL PURSUIT with a slew limit:
 *             delta = (p_rm_des − p_rm) · pursuitFraction, then
 *             |delta| ≤ maxSlewPerStep (m/step), then ctrl = p_rm + delta,
 *             clamped to ±railRange. Both pursuitFraction and maxSlewPerStep
 *             live on the params object (~`pursuitFraction: 0.8`,
 *             `maxSlewPerStep: 0.005` by default) so they can be tuned live
 *             from the console without a recompile. A demand residual
 *             (|p_rm_des − ctrl|) above saturationThresholdM latches SATURATED
 *             for stepWindowS (the binder then keeps the Road-4 reflex armed so
 *             a reactive capture step fires). A single 500 Hz step can move the
 *             ctrl at most 0.005 m (~2.5 m/s) — reset slams and mid-fall garbage
 *             demands are impossible by construction.
 *   AIRBALL   hold centered + mild anti-spin: the mass is displaced to oppose
 *             pitch (about local Y → LR rail) and roll (about local X → FA rail)
 *             rates. Authority is physically weak from a pelvis-centered rail,
 *             so the gains are deliberately tiny.
 *   ACROBATIC explicit flag OR torso up · world up < 0.5 → hold centered,
 *             purely passive (authored flips are never fought).
 *   SATURATED hold at the clamped rail during the window, then resume.
 *
 * Sign convention (regression-guarded in tests): +local Y (FA rail = MuJoCo +Y)
 * is ahead/forward. kCap is a SIGNED VELOCITY-DAMPING gain scaling the v·√(h/g)
 * lead term (target = support + kCap·v·√(h/g)). The DEFAULT is NEGATIVE (−0.3)
 * per the capture-point derivation: the reaction mass opposes the COM velocity
 * direction to damp it, not chase it — a gentle damping, not ±1. The sign can
 * still be flipped at tuning time without code changes.
 *
 * The controller owns two tiny latches (saturation window) and run telemetry,
 * mirroring ComReflexController's determinism contract: fixed dt, no clocks, no
 * randomness.
 *
 * KNOWN SCOPE LIMIT: `tiltRef` is the standing neutral reference for this
 * session. A future crouch-as-resting-pose feature must re-capture or disable
 * the trim; otherwise the trim would incorrectly bias the pelvis away from the
 * actual rest posture. This controller intentionally does not infer a new rest
 * pose from arbitrary crouch posture metadata.
 */

// ── Types ──────────────────────────────────────────────────────────────
export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type RmbsMode = 'grounded' | 'airball' | 'acrobatic' | 'saturated';
export type RmbsTrimState = 'settling' | 'active';

export interface RmbsParams {
  /** Reaction-mass mass (kg). */
  mRm: number;
  /** Slide rail travel each direction (±m). */
  railRange: number;
  /** Velocity-damping gain scaling the v·√(h/g) lead (signed; default −0.3 — the mass damps COM velocity, it does not chase it). */
  kCap: number;
  /** Rail-clamp residual (m) that latches SATURATED. */
  saturationThresholdM: number;
  /** Hold-at-rail window (s) after SATURATED latches. */
  stepWindowS: number;
  /** AIRBALL anti-spin gain (m per rad/s of torso rate). */
  airSpinGain?: number;
  /** AIRBALL anti-spin displacement clamp (±m). */
  airSpinMaxM?: number;
  /** Fraction of the closed-form demand error corrected per 500 Hz step (live-tunable). */
  pursuitFraction: number;
  /** Maximum ctrl movement per 500 Hz step (m) — the slew cap (live-tunable). */
  maxSlewPerStep: number;
  /** Neutral-trim integral gain (rad/s per rad). */
  leanIntGain: number;
  /** Neutral-trim integral clamp (m, fore/aft offset). */
  leanIntClamp: number;
  /** Grounded settle delay before capture begins. */
  trimSettleDelayS: number;
  /** Average window for the standing reference capture. */
  trimCaptureS: number;
}

export const DEFAULT_RMBS_PARAMS: RmbsParams = {
  mRm: 18,
  railRange: 0.6,
  kCap: -0.3,
  saturationThresholdM: 0.05,
  stepWindowS: 0.4,
  airSpinGain: 0.02,
  airSpinMaxM: 0.05,
  pursuitFraction: 0.8,
  maxSlewPerStep: 0.02,
  leanIntGain: 0.1,
  leanIntClamp: 0.3,
  trimSettleDelayS: 0,
  trimCaptureS: 0.25,
};

export interface RmbsInput {
  /** Total COM including the reaction mass, pelvis-local horizontal, rel. anchor. */
  cTotal: Vec2;
  /** Current reaction-mass position (slide qpos), pelvis-local horizontal. */
  pRm: Vec2;
  /** Robot-only COM velocity, pelvis-local horizontal. */
  vComRobot: Vec2;
  /** Torso angular velocity projected into the pelvis frame: x = roll rate, y = pitch rate. */
  torsoAngVelLocal?: Vec2;
  /** Total mass including the reaction mass (kg). */
  mTotal: number;
  /** Reaction-mass mass (kg). */
  mRm: number;
  /** COM height above ground (m) — pendulum length for √(h/g). */
  comHeight: number;
  /** Support center, pelvis-local horizontal, rel. anchor. */
  supportCenter: Vec2;
  /** Torso up-vector in WORLD frame (MuJoCo Z-up) — for acrobatic detection. */
  torsoUpWorld: Vec3;
  /** True when any agent geom contacts ground / a sole is planted. */
  hasContact: boolean;
  /** Explicit ACROBATIC override from the action pipeline. */
  acrobaticFlag: boolean;
  /** Seconds since the previous computeStep call (fixed 0.002 at 500 Hz). */
  dt: number;
  /** Fore/aft capsule tilt in pelvis-local coordinates (positive = pitched forward). */
  tiltFa?: number;
  /** Current trim state; the binder captures a standing reference after the transient. */
  trimState?: RmbsTrimState;
  /** Standing reference value captured after the transient settles. */
  tiltRef?: number;
  /** Integrated fore/aft lean offset currently being tracked. */
  leanInt?: number;
  /** True while the binder is in an active gait phase / action timeline. */
  gaitActive?: boolean;
  /** True while the action pipeline is driving a sustained posture override. */
  actionActive?: boolean;
  params: RmbsParams;
}

export interface RmbsCommand {
  /** Absolute qpos target for rm_slide_lr (pelvis-local X). */
  ctrlLr: number;
  /** Absolute qpos target for rm_slide_fa (pelvis-local Y). */
  ctrlFa: number;
  mode: RmbsMode;
  /** True when SATURATED was (re-)latched on THIS step (event flag). */
  saturated: boolean;
}

/** Run-aggregated telemetry used by the gates and RMBS debug panel. */
export interface RmbsStats {
  frames: number;
  saturationCount: number;
  maxAbsCaptureLead: number;
  maxAbsComVel: number;
  maxAbsResidual: number;
  maxAbsCtrl: number;
}

// ── Constants ──────────────────────────────────────────────────────────
const G = 9.81;

/**
 * Default fraction of the closed-form error corrected per 500 Hz step. 0.8
 * corrects 80% of the demand error per step — an aggressive pursuit that
 * catches drift fast (tuned up from 0.4). `DEFAULT_RMBS_PARAMS.pursuitFraction`
 * is the live-tunable source of truth.
 */
export const RMBS_PURSUIT_FRACTION = 0.8;

/**
 * Default maximum ctrl movement per 500 Hz step (m). 0.02 m @ 500 Hz ≈ 10 m/s —
 * the fastest the reaction mass is physically allowed to move (probe-validated
 * stable at 0.02). `DEFAULT_RMBS_PARAMS.maxSlewPerStep` is the live-tunable
 * source of truth. Reset slams and mid-fall garbage demands are still
 * impossible by construction.
 */
export const RMBS_MAX_STEP_M = 0.02;

// ── Helpers ────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// ── Controller ─────────────────────────────────────────────────────────
export class ReactionMassController {
  private mode: RmbsMode = 'grounded';
  private saturatedTimerS: number = 0;
  private saturatedCtrl: Vec2 = { x: 0, y: 0 };
  private trimState: RmbsTrimState = 'settling';
  private tiltRef: number = 0;
  private leanInt: number = 0;
  private stats: RmbsStats = this.freshStats();

  /** Clear latches and run telemetry (spawn/reset). */
  public reset(): void {
    this.mode = 'grounded';
    this.saturatedTimerS = 0;
    this.saturatedCtrl = { x: 0, y: 0 };
    this.trimState = 'settling';
    this.tiltRef = 0;
    this.leanInt = 0;
    this.stats = this.freshStats();
  }

  public resetTrimState(): void {
    this.trimState = 'settling';
    this.tiltRef = 0;
    this.leanInt = 0;
  }

  public getMode(): RmbsMode {
    return this.mode;
  }

  public getTrimState(): { trimState: RmbsTrimState; tiltRef: number; leanInt: number } {
    return {
      trimState: this.trimState,
      tiltRef: this.tiltRef,
      leanInt: this.leanInt,
    };
  }

  public setTrimState(trimState: RmbsTrimState, tiltRef: number = this.tiltRef, leanInt: number = this.leanInt): void {
    this.trimState = trimState;
    this.tiltRef = tiltRef;
    this.leanInt = leanInt;
  }

  public getStats(): RmbsStats {
    return { ...this.stats };
  }

  private freshStats(): RmbsStats {
    return {
      frames: 0,
      saturationCount: 0,
      maxAbsCaptureLead: 0,
      maxAbsComVel: 0,
      maxAbsResidual: 0,
      maxAbsCtrl: 0,
    };
  }

  private clearSaturation(): void {
    this.saturatedTimerS = 0;
    this.saturatedCtrl = { x: 0, y: 0 };
  }

  private latchSaturation(ctrl: Vec2, windowS: number): void {
    this.mode = 'saturated';
    this.saturatedTimerS = windowS;
    this.saturatedCtrl = { x: ctrl.x, y: ctrl.y };
    this.stats.saturationCount += 1;
  }

  /**
   * Compute one 500 Hz RMBS frame. Pure math + the saturation latch + telemetry.
   * `params.mRm` is the authority (the binder passes the REAL mass so the formula
   * can never disagree with the model).
   */
  public computeStep(input: RmbsInput): RmbsCommand {
    const p = input.params;
    const dt = Number.isFinite(input.dt) && input.dt > 0 ? input.dt : 0.002;
    this.stats.frames += 1;

    // ── Mode machine (highest priority first) ────────────────────────────
    const torsoUpWorld = input.torsoUpWorld ?? { x: 0, y: 0, z: 1 };
    const upDot = dot3(torsoUpWorld, { x: 0, y: 0, z: 1 });
    const acrobatic = input.acrobaticFlag || upDot < 0.5;

    if (acrobatic) {
      this.clearSaturation();
      this.mode = 'acrobatic';
      return { ctrlLr: 0, ctrlFa: 0, mode: 'acrobatic', saturated: false };
    }

    // Ongoing saturation window → hold at the rail, count down.
    if (this.mode === 'saturated' || this.saturatedTimerS > 0) {
      this.saturatedTimerS = Math.max(0, this.saturatedTimerS - dt);
      let nextMode: RmbsMode = 'saturated';
      if (this.saturatedTimerS <= 0) {
        nextMode = input.hasContact ? 'grounded' : 'airball';
      }
      this.mode = nextMode;
      this.stats.maxAbsCtrl = Math.max(this.stats.maxAbsCtrl, Math.abs(this.saturatedCtrl.x), Math.abs(this.saturatedCtrl.y));
      return { ctrlLr: this.saturatedCtrl.x, ctrlFa: this.saturatedCtrl.y, mode: nextMode, saturated: false };
    }

    const modeBase: 'grounded' | 'airball' = input.hasContact ? 'grounded' : 'airball';
    this.mode = modeBase;

    // ── AIRBALL: hold centered + mild anti-spin ──────────────────────────
    if (modeBase === 'airball') {
      const ang = input.torsoAngVelLocal ?? { x: 0, y: 0 };
      const gain = p.airSpinGain ?? 0.02;
      const maxSpin = Math.min(p.airSpinMaxM ?? 0.05, p.railRange);
      // Oppose pitch (ωy) via the LR rail; oppose roll (ωx) via the FA rail.
      const ctrlLr = clamp(gain * ang.y, -maxSpin, maxSpin);
      const ctrlFa = clamp(gain * ang.x, -maxSpin, maxSpin);
      this.stats.maxAbsCtrl = Math.max(this.stats.maxAbsCtrl, Math.abs(ctrlLr), Math.abs(ctrlFa));
      return { ctrlLr, ctrlFa, mode: 'airball', saturated: false };
    }

    // ── GROUNDED: closed-form COM tracking ───────────────────────────────
    const h = Math.max(0.2, input.comHeight);
    const lead = Math.sqrt(h / G);
    const target: Vec2 = {
      x: input.supportCenter.x + p.kCap * input.vComRobot.x * lead,
      y: input.supportCenter.y + p.kCap * input.vComRobot.y * lead,
    };
    this.stats.maxAbsCaptureLead = Math.max(this.stats.maxAbsCaptureLead, Math.hypot(target.x, target.y));
    this.stats.maxAbsComVel = Math.max(this.stats.maxAbsComVel, Math.hypot(input.vComRobot.x, input.vComRobot.y));

    const mRobot = input.mTotal - input.mRm;
    if (mRobot <= 0 || input.mRm <= 0) {
      this.stats.maxAbsCtrl = Math.max(this.stats.maxAbsCtrl, 0);
      return { ctrlLr: 0, ctrlFa: 0, mode: 'grounded', saturated: false };
    }

    // Robot-only COM from the coupled total COM (plan's formula).
    const cRx = (input.mTotal * input.cTotal.x - input.mRm * input.pRm.x) / mRobot;
    const cRy = (input.mTotal * input.cTotal.y - input.mRm * input.pRm.y) / mRobot;

    // p_rm_des = (M·target − m_r·c_r) / m_rm
    const pDesX = (input.mTotal * target.x - mRobot * cRx) / input.mRm;
    let pDesY = (input.mTotal * target.y - mRobot * cRy) / input.mRm;

    // ── Fractional pursuit + slew limit (gentle reflex) ─────────────────
    // delta = (p_rm_des − p_rm) · p.pursuitFraction, |delta| capped to
    // p.maxSlewPerStep, then ctrl = p_rm + delta. The params object is the
    // LIVE source of truth (console-tunable via setRmbsParams); the exported
    // constants only backstop hand-built params objects that predate the
    // fields. A single step can move the ctrl at most one slew cap — reset
    // slams and mid-fall garbage demands are impossible by construction. The
    // rail clamp still guards the absolute output, and the saturation latch
    // fires on the DEMAND residual (|p_rm_des − ctrl|), i.e. only once the
    // mass is at/past its commanded motion with the demand still beyond the
    // rail.
    const canSlew = Number.isFinite(input.pRm.x) && Number.isFinite(input.pRm.y);
    const pRmX = canSlew ? input.pRm.x : 0;
    const pRmY = canSlew ? input.pRm.y : 0;

    const pursuitFraction = p.pursuitFraction ?? RMBS_PURSUIT_FRACTION;
    const maxSlewPerStep = p.maxSlewPerStep ?? RMBS_MAX_STEP_M;

    const deltaX = clamp(pursuitFraction * (pDesX - pRmX), -maxSlewPerStep, maxSlewPerStep);
    let deltaY = clamp(pursuitFraction * (pDesY - pRmY), -maxSlewPerStep, maxSlewPerStep);

    const ctrlLr = clamp(pRmX + deltaX, -p.railRange, p.railRange);
    let ctrlFa = clamp(pRmY + deltaY, -p.railRange, p.railRange);
    let residual = Math.max(Math.abs(pDesX - ctrlLr), Math.abs(pDesY - ctrlFa));

    const trimState = input.trimState ?? this.trimState;
    const trimActive = trimState === 'active';
    const tiltFa = Number.isFinite(input.tiltFa) ? (input.tiltFa as number) : 0;
    const tiltRef = Number.isFinite(input.tiltRef) ? (input.tiltRef as number) : this.tiltRef;
    const actionGuard = Boolean(input.gaitActive || input.actionActive);
    const modePause = this.mode !== 'grounded';
    const integratorPause = modePause || !input.hasContact || actionGuard || Math.abs(ctrlLr) >= p.railRange - 1e-9 || Math.abs(ctrlFa) >= p.railRange - 1e-9 || residual > 0.3;

    if (trimActive) {
      this.trimState = 'active';
      this.tiltRef = tiltRef;
      if (!integratorPause) {
        this.leanInt = clamp(this.leanInt + p.leanIntGain * (tiltFa - this.tiltRef) * dt, -p.leanIntClamp, p.leanIntClamp);
        pDesY = pDesY - this.leanInt;
        deltaY = clamp(pursuitFraction * (pDesY - pRmY), -maxSlewPerStep, maxSlewPerStep);
        ctrlFa = clamp(pRmY + deltaY, -p.railRange, p.railRange);
        residual = Math.max(Math.abs(pDesX - ctrlLr), Math.abs(pDesY - ctrlFa));
      } else {
        this.leanInt = clamp(this.leanInt, -p.leanIntClamp, p.leanIntClamp);
      }
    } else {
      this.leanInt = clamp(this.leanInt, -p.leanIntClamp, p.leanIntClamp);
    }

    this.trimState = trimState;
    this.tiltRef = tiltRef;

    this.stats.maxAbsResidual = Math.max(this.stats.maxAbsResidual, residual);
    this.stats.maxAbsCtrl = Math.max(this.stats.maxAbsCtrl, Math.abs(ctrlLr), Math.abs(ctrlFa));

    // SATURATED fires only when the mass has actually CONVERGED to the rail
    // (|ctrl| at railRange) with the demand still beyond it. During the slew
    // transit the residual is large but the mass is still moving — latching
    // early would hold the mass short of the rail and defeat the pursuit.
    const atRail =
      Math.abs(ctrlLr) >= p.railRange - 1e-9 ||
      Math.abs(ctrlFa) >= p.railRange - 1e-9;
    if (atRail && residual > p.saturationThresholdM) {
      this.latchSaturation({ x: ctrlLr, y: ctrlFa }, p.stepWindowS);
      return { ctrlLr, ctrlFa, mode: 'saturated', saturated: true };
    }

    return { ctrlLr, ctrlFa, mode: 'grounded', saturated: false };
  }
}
