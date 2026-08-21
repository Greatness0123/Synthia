import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine';
import { logger as Logger } from '../../utils/logger';

// ── Capsule-balance controller gains (Option A: heavy root) ─────────────
// The root capsule now carries ~15 kg of pelvis mass (MJCF inertial), so the
// torso-vertical corrector needs proportionally higher gains than the original
// 100/40 designed for the near-massless 0.001 kg root. Scale chosen: ~8×.
export const BALANCE_KP = 800.0;
export const BALANCE_KD = 320.0;
/** Upright correction torque cap on the root body (N·m). */
export const MAX_BALANCE_TORQUE = 120.0;
/**
 * While a gait timeline is active the balance torque backs off to this
 * fraction of full strength so it stops fighting the commanded lean.
 */
export const GAIT_BALANCE_SCALE = 0.5;

export class MotorController {
  private model: any = null;
  private data: any = null;
  private actuatorMap: Map<string, number[]> = new Map(); // boneName -> [actuatorIds]
  private baseGains: Map<number, { kp: number; kv: number }> = new Map(); // actuatorId -> gains

  private globalStiffnessScale = 1.0;
  private globalDampingScale = 1.0;
  private limpModeActive = false;
  private simulationStepCount = 0;
  private gaitActive = false;
  private capsuleBalanceOverrideKP: number | null = null;
  private capsuleBalanceOverrideKD: number | null = null;

  // Diagnostics (read externally via PhysicsDiagnostic)
  public lastBalanceTorqueMag: number = 0;
  public lastBalanceTiltRad: number = 0;

  /** Enabled while a gait timeline is active — softens root balance torque. */
  public setGaitActive(active: boolean): void {
    this.gaitActive = active;
  }

  public isGaitActive(): boolean {
    return this.gaitActive;
  }

  constructor() {}

  public init(actuatorMap: Map<string, number[]>, model: any, data: any): void {
    this.model = model;
    this.data = data;
    this.actuatorMap = actuatorMap;

    // Collect all actuator IDs that belong to this specific agent's map
    const ourActuators = new Set<number>();
    actuatorMap.forEach((ids) => {
      for (const id of ids) {
        ourActuators.add(id);
      }
    });

    this.baseGains.clear();
    for (let i = 0; i < model.nu; i++) {
      if (ourActuators.has(i)) {
        // position actuators store kp in actuator_gainprm[i*3] and -kv in actuator_biasprm[i*3+2]
        const kp = model.actuator_gainprm[i * 3];
        const kv = -model.actuator_biasprm[i * 3 + 2];
        this.baseGains.set(i, { kp, kv });
      }
    }

    this.globalStiffnessScale = 1.0;
    this.globalDampingScale = 1.0;
    this.limpModeActive = false;
    // NOTE: simulationStepCount is deliberately NOT reset here. It defaults to 0
    // for brand-new binders, so fresh agents still ramp ctrl in over ~20 frames.
    // Re-initializing an EXISTING binder (multi-agent spawn → world reload) must
    // not restart this ramp, otherwise the old agent's ctrl collapses to 0 and
    // MuJoCo's position servos drive it toward the MJCF bind pose (Mixamo
    // T-pose) for ~20 frames. Legitimate resets go through resetRamp().
    void this.simulationStepCount;

    Logger.info(`MotorController: Initialized with our ${ourActuators.size} actuators (world has ${model.nu}).`);
  }

  public resetRamp(): void {
    this.simulationStepCount = 0;
  }

  public setTargets(currentTargets: Map<string, any>): void {
    if (!this.model || !this.data) return;

    const ctrl = this.data.ctrl;

    // Reset ONLY our own agent's controls to 0 by default to prevent overwriting other agents
    this.actuatorMap.forEach((actuatorIds) => {
      for (const id of actuatorIds) {
        ctrl[id] = 0;
      }
    });

    if (this.limpModeActive) return;

    const rampFactor = Math.min(1.0, this.simulationStepCount / 20);
    this.simulationStepCount++;

    currentTargets.forEach((parsedTarget, boneName) => {
      const actuatorIds = this.actuatorMap.get(boneName);
      if (!actuatorIds || actuatorIds.length === 0) return;

      if (parsedTarget.isQuaternion) {
        throw new Error(`MotorController.setTargets: Quaternion targets are not supported yet (boneName=${boneName}). Found length-4 target: [${parsedTarget.x}, ${parsedTarget.y}, ${parsedTarget.z}, ${parsedTarget.w}]`);
      }

      if (actuatorIds.length === 1) {
        // Revolute joint (e.g. knees, elbows) -> Single pitch actuator
        let targetAngle = 0;
        if (parsedTarget.isScalar && typeof parsedTarget.scalar === 'number') {
          targetAngle = parsedTarget.scalar;
        } else if (parsedTarget.x !== undefined && typeof parsedTarget.x === 'number') {
          targetAngle = parsedTarget.x;
        }
        ctrl[actuatorIds[0]] = targetAngle * rampFactor;
      } else if (actuatorIds.length === 2) {
        // 2-DOF joint (ankle/foot, wrist/hand): MJCF emits _pitch (axis 1 0 0) + _roll (axis 0 1 0).
        // LLM/converter convention: x = pitch, z = roll; y is unused.
        let pitch = 0;
        let roll = 0;
        if (parsedTarget.isScalar && typeof parsedTarget.scalar === 'number') {
          pitch = parsedTarget.scalar;
        } else if (parsedTarget.x !== undefined) {
          pitch = parsedTarget.x || 0;
          roll = parsedTarget.z || 0;
        }
        ctrl[actuatorIds[0]] = Number.isFinite(pitch) ? pitch * rampFactor : 0;
        ctrl[actuatorIds[1]] = Number.isFinite(roll) ? roll * rampFactor : 0;
      } else if (actuatorIds.length === 3) {
        // Spherical joint decomposed into yaw, pitch, roll
        // MJCF actuator order: [yaw(axis 0 0 1), pitch(axis 1 0 0), roll(axis 0 1 0)]
        // LLM sends [x=pitch, y=yaw, z=roll] as Array or {x, y, z}
        let yaw = 0;
        let pitch = 0;
        let roll = 0;

        if (parsedTarget.isScalar && typeof parsedTarget.scalar === 'number') {
          pitch = parsedTarget.scalar;
        } else if (parsedTarget.x !== undefined) {
          yaw = parsedTarget.y || 0;   // Y → Yaw (LLM's y = yaw axis)
          pitch = parsedTarget.x || 0;  // X → Pitch (LLM's x = pitch axis)
          roll = parsedTarget.z || 0;   // Z → Roll (LLM's z = roll axis)
        }

        ctrl[actuatorIds[0]] = Number.isFinite(yaw) ? yaw * rampFactor : 0;
        ctrl[actuatorIds[1]] = Number.isFinite(pitch) ? pitch * rampFactor : 0;
        ctrl[actuatorIds[2]] = Number.isFinite(roll) ? roll * rampFactor : 0;
      }
    });
  }

  public setTargetAngle(boneName: string, angle: number): void {
    if (!this.model || !this.data || this.limpModeActive) return;
    const actuatorIds = this.actuatorMap.get(boneName);
    if (!actuatorIds || actuatorIds.length === 0) return;

    const rampFactor = Math.min(1.0, this.simulationStepCount / 20);
    // Direct assignment to pitch or first actuator
    const val = Number.isFinite(angle) ? angle * rampFactor : 0;
    this.data.ctrl[actuatorIds[0]] = val;
  }

  /**
   * Road-4 — per-physics-step (500 Hz) joint ctrl injection.
   *
   * Writes `data.ctrl` DIRECTLY each step (called from the onStep reflex) so
   * the COM lean + capture-step offsets are additive ON TOP of the 30/60 fps
   * pose flush produced by `setTargets()`. Unlike `setTargets`, this method:
   *   - does NOT touch `currentTargets` (the pose flush owns those),
   *   - does NOT apply the 20-step ramp (the ramp is 1.0 in steady state and
   *     the reflex must respond immediately).
   * Indexing mirrors `setTargets()` EXACTLY:
   *   - spherical (3 actuators): ctrl[0]=yaw, ctrl[1]=pitch, ctrl[2]=roll
   *   - revolute (1 actuator):   ctrl[0]=angle
   *   - 2-DOF ankle/foot (2):    ctrl[0]=pitch, ctrl[1]=roll
   *
   * @param entries [boneName, pitchRad, rollRad?] — roll omitted = 0.
   * @returns The actuator ids that were written (for test verification).
   */
  public applyPerStepJointTargets(
    entries: Array<[string, number, number?]>
  ): number[] {
    if (!this.model || !this.data || this.limpModeActive) return [];

    const applied: number[] = [];
    for (const [boneName, pitchRad, rollRad = 0] of entries) {
      const actuatorIds = this.actuatorMap.get(boneName);
      if (!actuatorIds || actuatorIds.length === 0) continue;

      if (actuatorIds.length === 1) {
        const val = Number.isFinite(pitchRad) ? pitchRad : 0;
        this.data.ctrl[actuatorIds[0]] = val;
      } else if (actuatorIds.length === 2) {
        const pitch = Number.isFinite(pitchRad) ? pitchRad : 0;
        const roll = Number.isFinite(rollRad) ? rollRad : 0;
        // 2-DOF (foot/ankle): ctrl[0]=pitch, ctrl[1]=roll (exact mirror of setTargets).
        this.data.ctrl[actuatorIds[0]] = pitch;
        this.data.ctrl[actuatorIds[1]] = roll;
      } else {
        // Spherical (upleg/shoulder): actuator order [yaw, pitch, roll].
        // Pitch goes to index 1; yaw (index 0) and roll (index 2) = 0.
        const pitch = Number.isFinite(pitchRad) ? pitchRad : 0;
        const roll = Number.isFinite(rollRad) ? rollRad : 0;
        this.data.ctrl[actuatorIds[0]] = 0; // yaw
        this.data.ctrl[actuatorIds[1]] = pitch;
        this.data.ctrl[actuatorIds[2]] = roll;
      }
      applied.push(...actuatorIds);
    }
    return applied;
  }

  /**
   * Read the CURRENT `data.ctrl` value for one DOF of a bone (the value last
   * written by the pose flush at 30/60 fps, before this step's injection).
   * dofIndex follows setTargets indexing: spherical → 0=yaw 1=pitch 2=roll,
   * revolute → 0, 2-DOF → 0=pitch 1=roll. Returns null when unknown.
   */
  public readBoneCtrl(boneName: string, dofIndex: number): number | null {
    if (!this.model || !this.data || this.limpModeActive) return null;
    const actuatorIds = this.actuatorMap.get(boneName);
    if (!actuatorIds || dofIndex < 0 || dofIndex >= actuatorIds.length) return null;
    return this.data.ctrl[actuatorIds[dofIndex]] ?? null;
  }

  /**
   * Road-4 — ADDITIVE per-step (500 Hz) ctrl injection.
   *
   * Exactly like `applyPerStepJointTargets` but ADDS the deltas onto the
   * currently-flushed ctrl values instead of overwriting them, so a spherical
   * joint's pose yaw/roll survive the reflex (only the requested axis deltas
   * move). Dof indexing mirrors setTargets: spherical [yaw,pitch,roll] with
   * pitchDelta → index 1 and rollDelta → index 2 (yaw never modified here),
   * revolute → index 0, 2-DOF → pitch 0 / roll 1.
   *
   * @param entries [boneName, pitchDeltaRad, rollDeltaRad?] — roll omitted = 0.
   * @returns The actuator ids that were modified.
   */
  public addPerStepJointDeltas(
    entries: Array<[string, number, number?]>
  ): number[] {
    if (!this.model || !this.data || this.limpModeActive) return [];

    const applied: number[] = [];
    for (const [boneName, pitchDeltaRad, rollDeltaRad = 0] of entries) {
      const actuatorIds = this.actuatorMap.get(boneName);
      if (!actuatorIds || actuatorIds.length === 0) continue;

      if (actuatorIds.length === 1) {
        const d = Number.isFinite(pitchDeltaRad) ? pitchDeltaRad : 0;
        if (d !== 0) {
          this.data.ctrl[actuatorIds[0]] += d;
          applied.push(actuatorIds[0]);
        }
      } else if (actuatorIds.length === 2) {
        const dp = Number.isFinite(pitchDeltaRad) ? pitchDeltaRad : 0;
        const dr = Number.isFinite(rollDeltaRad) ? rollDeltaRad : 0;
        if (dp !== 0) {
          this.data.ctrl[actuatorIds[0]] += dp;
          applied.push(actuatorIds[0]);
        }
        if (dr !== 0) {
          this.data.ctrl[actuatorIds[1]] += dr;
          applied.push(actuatorIds[1]);
        }
      } else {
        // Spherical [yaw,pitch,roll]: only pitch (index 1) and roll (index 2)
        // are touched additively; yaw (index 0) stays exactly as posed.
        const dp = Number.isFinite(pitchDeltaRad) ? pitchDeltaRad : 0;
        const dr = Number.isFinite(rollDeltaRad) ? rollDeltaRad : 0;
        if (dp !== 0) {
          this.data.ctrl[actuatorIds[1]] += dp;
          applied.push(actuatorIds[1]);
        }
        if (dr !== 0) {
          this.data.ctrl[actuatorIds[2]] += dr;
          applied.push(actuatorIds[2]);
        }
      }
    }
    return applied;
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
      // Zero out only our own specific actuator gains for passive ragdoll
      this.actuatorMap.forEach((actuatorIds) => {
        for (const i of actuatorIds) {
          this.model.actuator_gainprm[i * 3] = 0;
          this.model.actuator_biasprm[i * 3 + 1] = 0;
          this.model.actuator_biasprm[i * 3 + 2] = 0;
          this.data.ctrl[i] = 0;
        }
      });
      Logger.info('MotorController: Limp mode activated. Gains zeroed for our actuators.');
    } else {
      // Restore standard scaled gains for our actuators
      this.applyGainsToModel();
      Logger.info('MotorController: Limp mode deactivated. Gains restored for our actuators.');
    }
  }

  private applyGainsToModel(): void {
    if (!this.model) return;

    this.actuatorMap.forEach((actuatorIds) => {
      for (const i of actuatorIds) {
        const gains = this.baseGains.get(i);
        if (gains) {
          this.model.actuator_gainprm[i * 3] = gains.kp * this.globalStiffnessScale;
          this.model.actuator_biasprm[i * 3 + 1] = -gains.kp * this.globalStiffnessScale;
          this.model.actuator_biasprm[i * 3 + 2] = -gains.kv * this.globalDampingScale;
        }
      }
    });
  }

  public getJointCount(): number {
    return this.actuatorMap.size;
  }

  /**
   * Set live-tunable overrides for capsule balance gains. Pass null to restore defaults.
   * When non-null, these values become the FINAL effective KP/KD (bypassing BALANCE_KP/KD
   * constants and all scale multiplication). MAX_BALANCE_TORQUE cap still applies.
   */
  public setCapsuleBalanceGains(kp: number | null, kd: number | null): void {
    this.capsuleBalanceOverrideKP = kp;
    this.capsuleBalanceOverrideKD = kd;
  }

  public applyCapsuleBalance(capsuleBodyId: number): void {
    if (!this.model || !this.data || capsuleBodyId < 0) return;

    const xquat = this.data.xquat;
    const qW = xquat[capsuleBodyId * 4];
    const qX = xquat[capsuleBodyId * 4 + 1];
    const qY = xquat[capsuleBodyId * 4 + 2];
    const qZ = xquat[capsuleBodyId * 4 + 3];

    // Convert MuJoCo scalar-first orientation of capsule to Three.js coordinates
    const threeQuatObj = PhysicsEngine.mujocoQuatToThree([qW, qX, qY, qZ]);
    const q = new THREE.Quaternion(threeQuatObj.x, threeQuatObj.y, threeQuatObj.z, threeQuatObj.w);

    // Compute upright balance error relative to world vertical axis (0, 1, 0)
    const capsuleUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const tiltAngle = Math.acos(Math.min(1, Math.max(-1, capsuleUp.y)));

    const tiltAxis = new THREE.Vector3();
    const axisDir = new THREE.Vector3(-capsuleUp.z, 0, capsuleUp.x);
    if (tiltAngle > 1e-5 && axisDir.lengthSq() > 1e-8) {
      tiltAxis.copy(axisDir).normalize();
    }

    // Get angular velocity in Three.js/world frame
    const dofAdr = this.model.body_dofadr[capsuleBodyId];
    const qvel = this.data.qvel;
    const angVelMj: [number, number, number] = [
      qvel[dofAdr + 3],
      qvel[dofAdr + 4],
      qvel[dofAdr + 5]
    ];
    const angVelWorld = PhysicsEngine.mujocoToWorld(angVelMj);

    // Use override gains if set (live-tunable); otherwise use defaults with dynamic scaling.
    let kp: number;
    let kd: number;
    if (this.capsuleBalanceOverrideKP !== null && this.capsuleBalanceOverrideKD !== null) {
      // Override: bypass all scaling, use the override values directly
      kp = this.capsuleBalanceOverrideKP;
      kd = this.capsuleBalanceOverrideKD;
    } else {
      // Default: scale balancing gains dynamically. GAIT_BALANCE_SCALE backs the corrector
      // off while a gait timeline is active so it stops fighting the commanded
      // lean; gains are tuned for the ~15 kg root (Option A).
      const balanceScale = this.gaitActive ? GAIT_BALANCE_SCALE : 1.0;
      kp = BALANCE_KP * this.globalStiffnessScale * balanceScale;
      kd = BALANCE_KD * this.globalDampingScale * balanceScale;
    }

    // Upright balancing torque in Three.js/world space
    const torqueWorld = new THREE.Vector3(
      kp * tiltAxis.x * tiltAngle - kd * angVelWorld.x,
      kp * tiltAxis.y * tiltAngle - kd * angVelWorld.y,
      kp * tiltAxis.z * tiltAngle - kd * angVelWorld.z
    );

    // Clamp balancing torque (Option A: raised 60 → 120 N·m for the heavy root)
    const torqueMag = torqueWorld.length();
    if (torqueMag > MAX_BALANCE_TORQUE) {
      torqueWorld.multiplyScalar(MAX_BALANCE_TORQUE / torqueMag);
    }

    this.lastBalanceTorqueMag = torqueWorld.length();
    this.lastBalanceTiltRad = tiltAngle;

    // Convert balancing torque back to MuJoCo coordinate system
    const torqueMj = PhysicsEngine.worldToMuJoCo(torqueWorld);

    // Apply directly into xfrc_applied for the capsule body with finite safety guards
    const tx = Number.isFinite(torqueMj[0]) ? torqueMj[0] : 0;
    const ty = Number.isFinite(torqueMj[1]) ? torqueMj[1] : 0;
    const tz = Number.isFinite(torqueMj[2]) ? torqueMj[2] : 0;

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
