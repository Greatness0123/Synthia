import { PhysicsEngine } from './PhysicsEngine';
import { logger as Logger } from '../../utils/logger';

/**
 * Biomechanically stable, neutral standing stance DEFAULT_STANCE_POSE.
 * Slightly flexed hips and knees, slightly dorsiflexed ankles for stable standing.
 * Arms are relaxed at sides (75 deg / 1.309 rad).
 * (Correction #13)
 */
export const DEFAULT_STANCE_POSE: Record<string, { yaw?: number; pitch?: number; roll?: number }> = {
  'mixamorigLeftUpLeg': { yaw: 0.0, pitch: -0.10, roll: 0.0 },
  'mixamorigRightUpLeg': { yaw: 0.0, pitch: -0.10, roll: 0.0 },
  'mixamorigLeftLeg': { pitch: -0.12 },
  'mixamorigRightLeg': { pitch: -0.12 },
  'mixamorigLeftFoot': { yaw: 0.0, pitch: 0.10, roll: 0.0 },
  'mixamorigRightFoot': { yaw: 0.0, pitch: 0.10, roll: 0.0 },
  'mixamorigLeftArm': { yaw: 0.0, pitch: 1.309, roll: 0.0 },
  'mixamorigRightArm': { yaw: 0.0, pitch: 1.309, roll: 0.0 },
};

/**
 * Returns the stable stance angle for any given joint/actuator name.
 * (Correction #3, #11, #13)
 */
export function getStanceAngleForJoint(jointName: string): number {
  const match = jointName.match(/^(.+?)_(pitch|yaw|roll)$/);
  if (!match) return 0.0;

  const bone = match[1];
  const axis = match[2] as 'pitch' | 'yaw' | 'roll';

  const pose = DEFAULT_STANCE_POSE[bone];
  if (pose && pose[axis] !== undefined) {
    return pose[axis]!;
  }
  return 0.0;
}

/**
 * MotorController manages PD target setpoints, idle stances,
 * gain scaling, limp mode, and root capsule balance torques.
 */
export class MotorController {
  private model: any = null;
  private data: any = null;
  private actuatorMap: Map<string, number[]> = new Map(); // boneName -> [actuatorIds]
  private baseGains: Map<number, { kp: number; kv: number }> = new Map(); // actuatorId -> gains

  private globalStiffnessScale = 1.0;
  private globalDampingScale = 1.0;
  private limpModeActive = false;
  private simulationStepCount = 0;

  private idleModeActive = false;
  private lastAiCommandStep = -9999;
  private readonly IDLE_TIMEOUT_STEPS = 120;

  constructor() {}

  /**
   * Initializes the motor controller, parses joint gains, and registers WASM pointers.
   */
  public init(actuatorMap: Map<string, number[]>, model: any, data: any): void {
    this.model = model;
    this.data = data;
    this.actuatorMap = actuatorMap;

    this.baseGains.clear();
    for (let i = 0; i < model.nu; i++) {
      const kp = model.actuator_gainprm[i * 3];
      const kv = -model.actuator_biasprm[i * 3 + 2];
      this.baseGains.set(i, { kp, kv });
    }

    this.globalStiffnessScale = 1.0;
    this.globalDampingScale = 1.0;
    this.limpModeActive = false;
    this.simulationStepCount = 0;
    this.idleModeActive = false;
    this.lastAiCommandStep = -9999;

    Logger.info(`MotorController: Initialized with ${model.nu} actuators.`);
  }

  public resetRamp(): void {
    this.simulationStepCount = 0;
  }

  public setIdleMode(active: boolean): void {
    this.idleModeActive = active;
    if (active) {
      Logger.info('MotorController: Idle balance mode activated — holding standing stance.');
    } else {
      Logger.info('MotorController: Idle balance mode deactivated.');
    }
  }

  public setAiCommand(): void {
    this.lastAiCommandStep = this.simulationStepCount;
    if (this.idleModeActive) {
      this.idleModeActive = false;
    }
  }

  private isIdleTimeout(): boolean {
    return (this.simulationStepCount - this.lastAiCommandStep) > this.IDLE_TIMEOUT_STEPS;
  }

  /**
   * Translates joint setpoints (DEFAULT_STANCE_POSE + deviations) to ctrl memory.
   * Leverages a 20-frame linear soft-start transition ramp for joint corrections/AI inputs,
   * but never limits Frame-0, which is already fully synced.
   * (Correction #3, #11)
   */
  public setTargets(currentTargets: Map<string, any>): void {
    if (!this.model || !this.data) return;

    const ctrl = this.data.ctrl;

    // Reset all controls to zero initially
    for (let i = 0; i < this.model.nu; i++) {
      ctrl[i] = 0.0;
    }

    if (this.limpModeActive) return;

    if (this.idleModeActive && this.isIdleTimeout()) {
      // maintain idle mode
    } else if (!this.idleModeActive && this.isIdleTimeout() && this.lastAiCommandStep >= 0) {
      this.idleModeActive = true;
    }

    // soft-start linear ramp for post-spawn pose transitions
    const rampFactor = this.simulationStepCount === 0 ? 1.0 : Math.min(1.0, this.simulationStepCount / 20);
    this.simulationStepCount++;

    const module = PhysicsEngine.getModule();
    if (!module) return;

    // Additive pattern: ctrl[joint] = DEFAULT_STANCE_POSE[joint] + rampFactor * deviation
    for (let i = 0; i < this.model.nu; i++) {
      const jointId = this.model.actuator_trnid[i * 2]; // target joint ID
      const jointName = module.mj_id2name(this.model, module.mjtObj.mjOBJ_JOINT.value, jointId);
      if (!jointName) continue;

      const baseStanceVal = getStanceAngleForJoint(jointName);
      let deviation = 0.0;

      // Extract active AI command deviation if not in idle mode
      if (!this.idleModeActive) {
        // Find if this joint's bone has an active deviation target
        const boneMatch = jointName.match(/^(.+?)_(pitch|yaw|roll)$/);
        if (boneMatch) {
          const boneName = boneMatch[1];
          const axis = boneMatch[2];
          const parsedTarget = currentTargets.get(boneName);
          if (parsedTarget) {
            if (parsedTarget.isScalar && typeof parsedTarget.scalar === 'number' && axis === 'pitch') {
              deviation = parsedTarget.scalar;
            } else if (parsedTarget.x !== undefined) {
              if (axis === 'yaw') deviation = parsedTarget.z || 0;
              if (axis === 'pitch') deviation = parsedTarget.x || 0;
              if (axis === 'roll') deviation = parsedTarget.y || 0;
            }
          }
        }
      }

      ctrl[i] = baseStanceVal + rampFactor * deviation;
    }
  }

  public setTargetAngle(boneName: string, angle: number): void {
    if (!this.model || !this.data || this.limpModeActive) return;
    const actuatorIds = this.actuatorMap.get(boneName);
    if (!actuatorIds || actuatorIds.length === 0) return;

    const rampFactor = this.simulationStepCount === 0 ? 1.0 : Math.min(1.0, this.simulationStepCount / 20);
    this.data.ctrl[actuatorIds[0]] = angle * rampFactor;
  }

  public setGainScale(stiffnessScale: number, dampingScale: number): void {
    this.globalStiffnessScale = Math.max(0.01, stiffnessScale);
    this.globalDampingScale = Math.max(0.01, dampingScale);

    if (this.limpModeActive) return;

    this.applyGainsToModel();
  }

  public setLimpMode(active: boolean): void {
    this.limpModeActive = active;

    if (!this.model || !this.data) return;

    if (active) {
      for (let i = 0; i < this.model.nu; i++) {
        this.model.actuator_gainprm[i * 3] = 0;
        this.model.actuator_biasprm[i * 3 + 1] = 0;
        this.model.actuator_biasprm[i * 3 + 2] = 0;
        this.data.ctrl[i] = 0;
      }
      this.idleModeActive = false;
      Logger.info('MotorController: Limp mode activated. All gains zeroed.');
    } else {
      this.applyGainsToModel();
      Logger.info('MotorController: Limp mode deactivated. Gains restored.');
    }
  }

  private applyGainsToModel(): void {
    if (!this.model) return;

    for (let i = 0; i < this.model.nu; i++) {
      const base = this.baseGains.get(i);
      if (base) {
        const kp = base.kp * this.globalStiffnessScale;
        const kv = base.kv * this.globalDampingScale;

        this.model.actuator_gainprm[i * 3] = kp;
        this.model.actuator_biasprm[i * 3 + 1] = -kp;
        this.model.actuator_biasprm[i * 3 + 2] = -kv;
      }
    }
  }

  public getJointCount(): number {
    return this.actuatorMap.size;
  }

  /**
   * Calculates stabilizing corrective torques on the root capsule based on
   * world tilt orientation and angular velocities.
   * Capped and applies directly to xfrc_applied, with zero contact-state dependency.
   * (Correction #10)
   */
  public applyCapsuleBalance(capsuleBodyId: number): void {
    if (!this.model || !this.data || capsuleBodyId < 0) return;

    const xquat = this.data.xquat;
    const qW = xquat[capsuleBodyId * 4];
    const qX = xquat[capsuleBodyId * 4 + 1];
    const qY = xquat[capsuleBodyId * 4 + 2];
    const qZ = xquat[capsuleBodyId * 4 + 3];

    // Rotated Z world vector
    const rx = 2 * (qX * qZ + qW * qY);
    const ry = 2 * (qY * qZ - qW * qX);
    const rz = qW * qW - qX * qX - qY * qY + qZ * qZ;

    const dot = Math.min(1.0, Math.max(-1.0, rz));
    const tiltAngle = Math.acos(dot);

    let tiltAxisX = 0;
    let tiltAxisY = 0;
    if (tiltAngle > 1e-5) {
      const sinTilt = Math.sin(tiltAngle);
      tiltAxisX = ry / sinTilt;
      tiltAxisY = -rx / sinTilt;
    }

    const dofAdr = this.model.body_dofadr[capsuleBodyId];
    const qvel = this.data.qvel;
    const wx = qvel[dofAdr + 3];
    const wy = qvel[dofAdr + 4];
    const wz = qvel[dofAdr + 5];

    // Balanced PD coefficients scaled to 70kg target
    const BALANCE_KP = 250.0 * this.globalStiffnessScale;
    const BALANCE_KD = 60.0 * this.globalDampingScale;

    let tx = BALANCE_KP * tiltAxisX * tiltAngle - BALANCE_KD * wx;
    let ty = BALANCE_KP * tiltAxisY * tiltAngle - BALANCE_KD * wy;
    let tz = -BALANCE_KD * wz;

    const torqueMag = Math.sqrt(tx * tx + ty * ty + tz * tz);
    const MAX_BALANCE_TORQUE = 100.0;
    if (torqueMag > MAX_BALANCE_TORQUE) {
      const scale = MAX_BALANCE_TORQUE / torqueMag;
      tx *= scale;
      ty *= scale;
      tz *= scale;
    }

    const xfrc = this.data.xfrc_applied;
    const idx = capsuleBodyId * 6;
    xfrc[idx + 0] = 0;
    xfrc[idx + 1] = 0;
    xfrc[idx + 2] = 0;
    xfrc[idx + 3] = tx;
    xfrc[idx + 4] = ty;
    xfrc[idx + 5] = tz;
  }
}
