import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from './PhysicsEngine';
import { BodyManager } from './BodyManager';
import { MotorController } from './MotorController';
import type { TimelineSequence, ValidateResult } from '../../types/joint';
import { clampAngle, isScalarPayload, normalizeBoneKey } from '../../types/joint';
import SYNTHIA_RIG_CONSTRAINTS from '../../constants/rigConstraints';
import { logger as Logger } from '../../utils/logger';
import { ObservationBuilder } from './ObservationBuilder';
import { AvatarSynchronizer } from './AvatarSynchronizer';
import {
  getAnatomicalLimitForBone,
  WORLD_BOUNDARY_RADIUS,
} from '../../constants/anatomicalLimits';
import type { ActionApplyResult, RejectedAction } from '../../types/agent';
import { ComReflexController, DEFAULT_REFLEX_GAINS, type ReflexGains, type ReflexStats } from './ComReflexController';
import { ReactionMassController, DEFAULT_RMBS_PARAMS, type RmbsCommand, type RmbsMode, type RmbsParams } from './ReactionMassController';
import { allocateLeanA } from './ReflexLeanA';
import { GAIT_CYCLE, swingEnvAt, type Side } from './gaitPhaseMap';

// Proxy mimicking RAPIER.RigidBody so that ObservationBuilder and AvatarSynchronizer can work seamlessly with zero duplication!
export class BodyProxy {
  private bodyId: number;
  private model: any;
  private data: any;
  private prefix: string;

  constructor(bodyId: number, model: any, data: any, _module: any, prefix: string = '') {
    this.bodyId = bodyId;
    this.model = model;
    this.data = data;
    this.prefix = prefix;
    void _module;
  }

  public isValid(): boolean {
    return this.bodyId >= 0 && this.model !== null;
  }

  public translation() {
    const idx = this.bodyId * 3;
    const posMj: [number, number, number] = [
      this.data.xpos[idx],
      this.data.xpos[idx + 1],
      this.data.xpos[idx + 2]
    ];
    return PhysicsEngine.mujocoToWorld(posMj);
  }

  public rotation() {
    const idx = this.bodyId * 4;
    const qMj: [number, number, number, number] = [
      this.data.xquat[idx],
      this.data.xquat[idx + 1],
      this.data.xquat[idx + 2],
      this.data.xquat[idx + 3]
    ];
    const threeQuatObj = PhysicsEngine.mujocoQuatToThree(qMj);
    return {
      x: threeQuatObj.x,
      y: threeQuatObj.y,
      z: threeQuatObj.z,
      w: threeQuatObj.w
    };
  }

  public linvel() {
    const idx = this.bodyId * 6;
    const lMj: [number, number, number] = [
      this.data.cvel[idx + 3],
      this.data.cvel[idx + 4],
      this.data.cvel[idx + 5]
    ];
    return PhysicsEngine.mujocoToWorld(lMj);
  }

  public angvel() {
    const idx = this.bodyId * 6;
    const aMj: [number, number, number] = [
      this.data.cvel[idx],
      this.data.cvel[idx + 1],
      this.data.cvel[idx + 2]
    ];
    return PhysicsEngine.mujocoToWorld(aMj);
  }

  public setTranslation(pos: { x: number; y: number; z: number }): void {
    if (!this.isValid()) return;
    const module = PhysicsEngine.getModule();
    if (!module) return;
    const rootJntId = module.mj_name2id(this.model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + 'root_freejoint');
    if (rootJntId >= 0) {
      const qposadr = this.model.jnt_qposadr[rootJntId];
      const qveladr = this.model.jnt_dofadr[rootJntId];
      const posMj = PhysicsEngine.worldToMuJoCo(pos);
      this.data.qpos[qposadr] = posMj[0];
      this.data.qpos[qposadr + 1] = posMj[1];
      this.data.qpos[qposadr + 2] = posMj[2];
      if (qveladr >= 0 && this.data.qvel) {
        for (let i = 0; i < 6; i++) {
          this.data.qvel[qveladr + i] = 0;
        }
      }
    }
  }

  public setLinearVelocity(v: { x: number; y: number; z: number }): void {
    if (!this.isValid()) return;
    const dofAdr = this.model.body_dofadr[this.bodyId];
    if (dofAdr === undefined || dofAdr < 0) return;
    const vMj = PhysicsEngine.worldToMuJoCo({ x: v.x, y: v.y, z: v.z });
    this.data.qvel[dofAdr] = vMj[0];
    this.data.qvel[dofAdr + 1] = vMj[1];
    this.data.qvel[dofAdr + 2] = vMj[2];
  }
}

interface BoneInfo {
  bone: THREE.Bone;
  worldPosition: THREE.Vector3;
  name: string;
}

const ENABLE_KINEMATIC_GRF_INJECTOR = true;

/** Post-Road-2 total humanoid mass (original ~75 kg + 15 kg root pelvis). */
const HUMANOID_MASS_KG = 90;

/** Critical-damping rate (s⁻¹) of the root velocity servo (Road-3). */
const ROOT_VELOCITY_DAMP_W = 6.0;
/** Max commanded horizontal root speed (m/s) — gentle assist. */
const ROOT_VELOCITY_MAX_MPS = 0.15;
/** MuJoCo fixed timestep (500 Hz), used by the velocity impulse. */
const PHYSICS_DT = 0.002;

// ── Road-4 COM reflex constants ────────────────────────────────────────
/** Lean-back / lean-forward pitch on spine2 (Option A allocator). */
const REFLEX_SPINE2_BONE = 'mixamorigspine2';
/** Swing-hip / knee / ankle bone names by side. */
const REFLEX_HIP_BONE = (side: Side) => (side === 'left' ? 'mixamorigleftupleg' : 'mixamorigrightupleg');
const REFLEX_KNEE_BONE = (side: Side) => (side === 'left' ? 'mixamorigleftleg' : 'mixamorigrightleg');
const REFLEX_ANKLE_BONE = (side: Side) => (side === 'left' ? 'mixamorigleftfoot' : 'mixamorigrightfoot');
/** Knee flexion injection cap during a swing (rad), safe inside rig [0, 2.618]. */
const REFLEX_SWING_KNEE_MAX_RAD = 0.8;
/** Ankle dorsiflex injection cap during a swing (rad), safe inside rig ±0.785. */
const REFLEX_SWING_ANKLE_MAX_RAD = 0.3;

// ── RMBS telemetry ring (Road-5.1, diagnostic only) ─────────────────────
/** Decimation: one telemetry sample per 50 successful RMBS frames (10 Hz at 500 Hz). */
const RMBS_TELEM_EVERY_STEPS = 50;
/** Ring capacity: ~20 s of 10 Hz history, oldest sample dropped past this. */
const RMBS_TELEM_CAP = 200;

export class HumanoidPhysicsBinder {
  private physicsEngine: PhysicsEngine;
  private scene: THREE.Scene;
  private modelRoot: THREE.Group | null = null;
  private skeleton: THREE.Skeleton | null = null;
  private skinnedMesh: THREE.SkinnedMesh | null = null;
  private boneInfoMap: Map<string, BoneInfo> = new Map();
  private bindPoseQuaternions: Map<string, THREE.Quaternion> = new Map();
  private bindPoseWorldPositions: Map<string, THREE.Vector3> = new Map();
  private bindPoseWorldQuaternions: Map<string, THREE.Quaternion> = new Map();
  private debugSpheres: Map<string, THREE.Mesh> = new Map();
  private cameraHelpers: THREE.Group[] = [];
  private isLoaded: boolean = false;

  private bodyManager: BodyManager;
  private motorController: MotorController;
  private avatarSynchronizer: AvatarSynchronizer;

  private buildStep: 'A' | 'B' | 'C' | 'D' | null = null;

  public restArmAngleDeg: number = 75;
  private currentStiffness: number = 0;
  private currentDamping: number = 0;
  public friction: number = 0.5;

  private currentTargets: Map<string, any> = new Map();
  private jointLimits: Map<string, { min: number; max: number }> = new Map();
  private _lerpSpeed: number = 0.12;

  private lastAiCommandTime: number = Date.now();
  private airborneTimer: number = 0;
  private groundingMagnetStrength: number = 0.0;
  private targetSpawnGrounded: boolean = false;
  private groundSurfaceY: number = 0.0;
  private gaitActive: boolean = false;

  public setGaitActive(active: boolean): void {
    this.gaitActive = active;
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId !== null && capsuleBodyId >= 0) {
      this.motorController.setGaitActive(active);
    }
    Logger.info(`HumanoidPhysicsBinderMuJoCo: gaitActive=${active}`);
  }

  public setLinearVelocity(v: { x: number; y: number; z: number }): void {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;
    const world = this.physicsEngine.getWorld();
    const proxy = new BodyProxy(capsuleBodyId, world.model, world.data, null);
    proxy.setLinearVelocity(v);
  }

  private hipToFootDistance: number = 0.95;
  private modelHeight: number = 1.8;
  private capsuleRadius: number = 0.2;

  private _isGrounded: boolean = true;
  private readonly GROUND_SNAP_THRESHOLD: number = 0.12;

  private upVector: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private forwardVector: THREE.Vector3 = new THREE.Vector3(0, 0, 1);

  private previousFootPositions: Map<string, THREE.Vector3> = new Map();
  private readonly KGRF_MULTIPLIER: number = 150.0;

  private capsuleCenterY: number = 0;

  // ── Root velocity drive (Road-3: replaces root teleportation) ─────────
  private targetRootVelocity: THREE.Vector3 | null = null;
  private targetRootVelocityExpiryMs: number = 0;
  /** Isolation-testing gate: when false, applyRootVelocityDrive is a no-op. */
  private rootVelocityDriveEnabled: boolean = true;
  /** Isolation-testing gate: when false, the Road-2 capsule-balance torque is a no-op. */
  private capsuleBalanceEnabled: boolean = true;

  // ── COM reflex (Road-4) ───────────────────────────────────────────────
  private reflexController: ComReflexController = new ComReflexController();
  private reflexGains: ReflexGains = { ...DEFAULT_REFLEX_GAINS };
  private reflexEnabled: boolean = false;
  private reflexSimStep: number = 0;
  private reflexBodyCache: number[] | null = null;
  private reflexTotalMass: number = 0;
  /** Last Road-4 COM-reflex telemetry frame (debug/diagnostics only). */
  public lastReflexStats: Record<string, unknown> | null = null;

  // ── RMBS v1: reaction-mass balance system ─────────────────────────────
  private reactionMass: ReactionMassController = new ReactionMassController();
  private reactionMassEnabled: boolean = false;
  private reactionMassAcrobatic: boolean = false;
  private rmbsParams: RmbsParams = { ...DEFAULT_RMBS_PARAMS };
  /** Lazy RMBS id cache; re-attached whenever world.model changes (recompile/rehydrate). */
  private rmCache: { model: any; rmBodyId: number; actLrId: number; actFaId: number; jntLrId: number; jntFaId: number } | null = null;
  public lastRmbsStats: ReturnType<ReactionMassController['getStats']> | null = null;
  /** Counts successful RMBS frames only — drives the 10 Hz telemetry decimation. */
  private rmbsTelemetryStep: number = 0;
  /** Decimated diagnostic counter for footSoleGapM id/raw-value dumps (Road-5.1). */
  private footSoleDiagStep: number = 0;
  /**
   * EMA-filtered support center (stability pass, α=0.3). A foot shifting
   * (double→single support, or a planted foot sliding) can never jump the RMBS
   * target. null = no valid sample yet / nothing planted. Cleared on enable and
   * on resetPose so a teleport/reset can't carry a stale support across worlds.
   */
  private rmbsSupportEma: { x: number; y: number } | null = null;

  private timelineQueue: TimelineSequence = [];
  private timelineSequenceStart: number | null = null;

  public mbActive: boolean = false;
  private observationBuilder: ObservationBuilder = new ObservationBuilder();
  public agentId: string;
  public prefix: string;

  // ── Floor geom ID (cached at model load, used for ground detection) ──
  private _floorGeomId: number = -1;

  // ── Cached per-frame objects (avoid per-frame allocation churn) ────────
  private _syncCapsulePos = new THREE.Vector3();
  private _syncCapsuleQuat = new THREE.Quaternion();
  private _syncOffsetLocal = new THREE.Vector3();
  private _syncOffsetWorld = new THREE.Vector3();
  private _syncBonesMap = new Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>();
  private _syncProxiesMap = new Map<string, BodyProxy>();
  private _syncWorldPos = new THREE.Vector3();

  constructor(physicsEngine: PhysicsEngine, scene: THREE.Scene, agentId: string = '') {
    this.physicsEngine = physicsEngine;
    this.scene = scene;
    this.agentId = agentId;
    this.prefix = agentId ? `${agentId}_` : '';
    this.bodyManager = new BodyManager(physicsEngine, agentId);
    this.motorController = new MotorController();
    this.avatarSynchronizer = new AvatarSynchronizer(0.04);

    // Silence unused fields under tsc -b strict mode
    void this.lastAiCommandTime;
    void this.airborneTimer;
    void this.groundingMagnetStrength;
  }

  public validateAndApplyTimeline(targetSkeleton: THREE.Skeleton, sequence: TimelineSequence, options?: { activeGaitPhase?: boolean }): ValidateResult {
    this.lastAiCommandTime = Date.now();
    this.airborneTimer = 0;
    this.groundingMagnetStrength = 0.0;

    const rejections: string[] = [];
    const clampingNotes: string[] = [];
    const injections: string[] = [];

    const frames = (sequence || []).slice().sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const appliedTimeline: TimelineSequence = [];

    for (const frame of frames) {
      const sanitizedOverrides: Record<string, number | [number, number, number]> = {};

      for (const [rawKey, rawVal] of Object.entries(frame.overrides || {})) {
        const key = normalizeBoneKey(rawKey);

        let bone = targetSkeleton.getBoneByName ? targetSkeleton.getBoneByName(key) : null;
        if (!bone) {
          bone = targetSkeleton.bones?.find((b) => normalizeBoneKey(b.name) === key) || null;
        }
        if (!bone) {
          rejections.push(`unknown_bone:${rawKey}`);
          continue;
        }

        const constraint = SYNTHIA_RIG_CONSTRAINTS[key];
        if (!constraint) {
          rejections.push(`unknown_constraint:${key}`);
          continue;
        }

        const cap = options?.activeGaitPhase && constraint.allowance?.locomotionCap ? constraint.allowance.locomotionCap : undefined;

        let xVal: number;
        let yVal = 0;
        let zVal = 0;
        if (isScalarPayload(rawVal)) {
          xVal = typeof rawVal === 'number' ? rawVal : rawVal[0];
        } else if (Array.isArray(rawVal) && rawVal.length === 3) {
          xVal = rawVal[0]; yVal = rawVal[1]; zVal = rawVal[2];
        } else {
          rejections.push(`invalid_payload:${key}`);
          continue;
        }

        const clampX = (v: number) => {
          let min = constraint.x[0];
          let max = constraint.x[1];
          if (typeof cap === 'number') {
            min = min * cap;
            max = max * cap;
          }

          if (constraint.dof === 1 && constraint.x[1] === 0.0 && v > 0) {
            clampingNotes.push(`${key}:positive_x_clamped_to_0`);
            return 0.0;
          }
          const res = clampAngle(v, min, max);
          if (res !== v) clampingNotes.push(`${key}:x_clamped:${v}->${res}`);
          return res;
        };

        const clampY = (v: number) => {
          let min = constraint.y[0];
          let max = constraint.y[1];
          if (typeof cap === 'number') { min = min * cap; max = max * cap; }
          const res = clampAngle(v, min, max);
          if (res !== v) clampingNotes.push(`${key}:y_clamped:${v}->${res}`);
          return res;
        };

        const clampZ = (v: number) => {
          let min = constraint.z[0];
          let max = constraint.z[1];
          if (typeof cap === 'number') { min = min * cap; max = max * cap; }
          const res = clampAngle(v, min, max);
          if (res !== v) clampingNotes.push(`${key}:z_clamped:${v}->${res}`);
          return res;
        };

        if (constraint.dof === 1) {
          const xClamped = clampX(xVal);
          sanitizedOverrides[key] = xClamped;

          if (constraint.allowance?.tendonSynergyLink) {
            const baseKey = key.replace(/(\d)$/, '1');
            const baseOverrideInFrame = frame.overrides?.[baseKey] !== undefined || sanitizedOverrides[baseKey] !== undefined;
            if (!baseOverrideInFrame) {
              const baseTarget = this.currentTargets.get(baseKey) as any;
              const baseAngle = typeof baseTarget === 'number' ? baseTarget : (baseTarget && baseTarget.x) || 0;
              if (Math.abs(baseAngle) <= 0.01) {
                rejections.push(`tendon_synergy_violation:${key}`);
                continue;
              }
            }
          }
        } else {
          const xC = clampX(xVal);
          const yC = clampY(yVal);
          const zC = clampZ(zVal);
          sanitizedOverrides[key] = [xC, yC, zC];
        }

        if (constraint.allowance?.scapulohumeralRatio) {
          const armX = xVal;
          if (Math.abs(armX) > 0.523) {
            const shoulderKey = key.includes('left') ? 'mixamorigleftshoulder' : 'mixamorigrightshoulder';
            const delta = Math.max(-0.2618, Math.min(0.2618, (armX - Math.sign(armX) * 0.523) / 2.0));

            const existing = sanitizedOverrides[shoulderKey];
            if (existing === undefined) {
              sanitizedOverrides[shoulderKey] = [delta, 0, 0];
            } else if (Array.isArray(existing)) {
              existing[0] = clampX((existing[0] || 0) + delta);
              sanitizedOverrides[shoulderKey] = existing;
            }
            injections.push(`scapulohumeral_inject:${shoulderKey}:${delta.toFixed(4)}`);
          }
        }

        if (key === 'mixamorigneck' && constraint.allowance?.requiresCervicalCoupling) {
          const neckY = yVal;
          const zInject = -0.15 * neckY;
          const existing = sanitizedOverrides['mixamorigneck'];
          if (!existing) {
            sanitizedOverrides['mixamorigneck'] = [xVal, clampY(neckY), clampZ(zInject)];
          } else if (Array.isArray(existing)) {
            existing[2] = clampZ((existing[2] || 0) + zInject);
            sanitizedOverrides['mixamorigneck'] = existing;
          }
          injections.push(`cervical_counter_tilt:mixamorigneck:${zInject.toFixed(4)}`);
        }
      }

      appliedTimeline.push({ timeOffsetMs: frame.timeOffsetMs, overrides: sanitizedOverrides });
    }

    this.timelineQueue = appliedTimeline;
    return { appliedTimeline, rejections, clampingNotes, injections };
  }

  public async loadAndVisualizeBindPose(spawnPoint: THREE.Vector3): Promise<boolean> {
    this.physicsEngine.setMutating(true);
    this.physicsEngine.setReady(false);

    try {
      this.cleanup();

      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.load(
          '/models/x-bot.glb',
          resolve,
          undefined,
          (err) => {
            Logger.error('HumanoidPhysicsBinderMuJoCo: Failed to load x-bot.glb', err);
            reject(err);
          }
        );
      });

      const modelRoot: THREE.Group = gltf.scene;
      this.modelRoot = modelRoot;
      modelRoot.userData.isSynthiaPrimitive = true;
      this.scene.add(modelRoot);
      modelRoot.position.copy(spawnPoint);

      modelRoot.traverse((child) => {
        if ((child as any).isSkinnedMesh) {
          this.skinnedMesh = child as THREE.SkinnedMesh;
        }
      });

      if (!this.skinnedMesh) {
        throw new Error('HumanoidPhysicsBinderMuJoCo: No SkinnedMesh found in model');
      }

      this.skeleton = this.skinnedMesh.skeleton;
      if (!this.skeleton || this.skeleton.bones.length === 0) {
        throw new Error('HumanoidPhysicsBinderMuJoCo: Skeleton has no bones');
      }

      modelRoot.updateMatrixWorld(true);
      this.extractBonePositions();
      this.calculateCameraVectors();
      this.calculateModelDimensions();
      this.renderDebugSpheres();

      this.buildStep = 'A';
      this.isLoaded = true;
      this.physicsEngine.setReady(true);

      Logger.info(`HumanoidPhysicsBinderMuJoCo STEP A Complete: Loaded model with ${this.boneInfoMap.size} bones.`);
      return true;
    } catch (error) {
      Logger.error('HumanoidPhysicsBinderMuJoCo STEP A: Failed', error);
      return false;
    } finally {
      this.physicsEngine.setMutating(false);
    }
  }

  private calculateModelDimensions(): void {
    let highestY: number | null = null;
    let lowestY: number | null = null;

    this.boneInfoMap.forEach((info) => {
      if (highestY === null || info.worldPosition.y > highestY) {
        highestY = info.worldPosition.y;
      }
      if (lowestY === null || info.worldPosition.y < lowestY) {
        lowestY = info.worldPosition.y;
      }
    });

    if (highestY !== null && lowestY !== null) {
      this.modelHeight = Math.abs(highestY - lowestY) + 0.15;
    }

    let leftShoulderX: number | null = null;
    let rightShoulderX: number | null = null;

    this.boneInfoMap.forEach((info, name) => {
      if (name.includes('leftshoulder') || name.includes('leftarm')) {
        if (leftShoulderX === null) leftShoulderX = info.worldPosition.x;
      }
      if (name.includes('rightshoulder') || name.includes('rightarm')) {
        if (rightShoulderX === null) rightShoulderX = info.worldPosition.x;
      }
    });

    if (leftShoulderX !== null && rightShoulderX !== null) {
      const shoulderWidth = Math.abs(leftShoulderX - rightShoulderX);
      this.capsuleRadius = Math.max(0.15, Math.min(0.3, shoulderWidth / 3));
    }
  }

  private calculateCameraVectors(): void {
    if (!this.skeleton) return;

    let headPos: THREE.Vector3 | null = null;
    let headBone: THREE.Bone | null = null;
    let neckPos: THREE.Vector3 | null = null;
    let leftArmPos: THREE.Vector3 | null = null;
    let rightArmPos: THREE.Vector3 | null = null;

    for (const bone of this.skeleton.bones) {
      const name = bone.name.toLowerCase();
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);

      if (name.includes('head') && !name.includes('headtop')) {
        headPos = worldPos.clone();
        headBone = bone;
      }
      if (name.includes('neck')) neckPos = worldPos.clone();
      if (name.includes('leftarm') && !name.includes('forearm')) leftArmPos = worldPos.clone();
      if (name.includes('rightarm') && !name.includes('forearm')) rightArmPos = worldPos.clone();
    }

    if (headPos && neckPos) {
      this.upVector.subVectors(headPos, neckPos).normalize();
    } else {
      this.upVector.set(0, 1, 0);
    }

    if (leftArmPos && rightArmPos && headPos && neckPos) {
      const armVec = new THREE.Vector3().subVectors(rightArmPos, leftArmPos).normalize();
      this.forwardVector.crossVectors(this.upVector, armVec).normalize();
    } else {
      this.forwardVector.set(0, 0, 1);
    }

    if (headBone) {
      const headWorldQuat = new THREE.Quaternion();
      headBone.getWorldQuaternion(headWorldQuat);
      const headWorldQuatInv = headWorldQuat.clone().invert();
      this.upVector.applyQuaternion(headWorldQuatInv);
      this.forwardVector.applyQuaternion(headWorldQuatInv);
    }
  }

  private extractBonePositions(): void {
    if (!this.skeleton) return;

    this.boneInfoMap.clear();
    this.bindPoseQuaternions.clear();
    this.bindPoseWorldPositions.clear();
    this.bindPoseWorldQuaternions.clear();

    for (const bone of this.skeleton.bones) {
      if (this.isTerminal(bone)) continue;

      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);
      const worldQuat = new THREE.Quaternion();
      bone.getWorldQuaternion(worldQuat);
      const canonicalName = bone.name.toLowerCase().replace(/:/g, '');

      // Store the bind-pose world quaternion immutably — this is the T-pose orientation
      // captured at load time and must never change, even as physics drives bone rotations.
      // Used by generateCombinedMCF / buildBodyTreeXML to always bake T-pose joint structure
      // into the MJCF regardless of how animated the agent is at world-recompile time.
      this.bindPoseWorldPositions.set(canonicalName, worldPos.clone());
      this.bindPoseWorldQuaternions.set(canonicalName, worldQuat.clone());

      const entry = {
        bone,
        worldPosition: worldPos.clone(),
        name: canonicalName,
        bindWorldPosition: worldPos.clone(),
        bindWorldQuaternion: worldQuat.clone(),
      } as any;

      this.boneInfoMap.set(canonicalName, entry);
      this.bindPoseQuaternions.set(canonicalName, bone.quaternion.clone());

      const limits = getAnatomicalLimitForBone(canonicalName);
      if (limits) {
        this.jointLimits.set(canonicalName, limits);
      }
    }

    this.calculateHipToFootDistance();
  }

  private calculateHipToFootDistance(): void {
    let hipY: number | null = null;
    let lowestFootY: number | null = null;

    this.boneInfoMap.forEach((info, name) => {
      if (name.includes('hips') || name.includes('pelvis') || name.includes('hip')) {
        if (hipY === null || info.worldPosition.y < hipY) {
          hipY = info.worldPosition.y;
        }
      }
      if (name.includes('foot') || name.includes('toe')) {
        if (lowestFootY === null || info.worldPosition.y < lowestFootY) {
          lowestFootY = info.worldPosition.y;
        }
      }
    });

    if (hipY !== null && lowestFootY !== null) {
      this.hipToFootDistance = Math.abs(hipY - lowestFootY);
    }
  }

  public getSpawnHipY(groundY: number = 0): number {
    return groundY + this.hipToFootDistance;
  }

  public repositionModel(x: number, y: number, z: number): void {
    if (!this.modelRoot || !this.skeleton) return;
    this.modelRoot.position.set(x, y, z);
    this.modelRoot.updateMatrixWorld(true);

    this.boneInfoMap.forEach((info) => {
      const worldPos = new THREE.Vector3();
      info.bone.getWorldPosition(worldPos);
      info.worldPosition.copy(worldPos);
      // Also update bindWorldPosition so the MJCF uses correct spawn-offset bone positions.
      // bindWorldQuaternion is intentionally NOT updated — it is immutable T-pose orientation.
      (info as any).bindWorldPosition = worldPos.clone();
    });

    this.calculateModelDimensions();
  }

  /**
   * Before world recompile: translates all bindWorldPosition entries by the current capsule
   * position delta from physics (MuJoCo xpos). This keeps the correct spawn-offset T-pose
   * bone structure in world space so the MJCF bakes each agent at their current location.
   * bindWorldQuaternion is intentionally untouched — it is an immutable T-pose snapshot.
   */
  public syncBindWorldPositionsFromPhysics(): void {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const data = world.data;

    // Get current capsule center from MuJoCo xpos (world frame)
    const mjX = data.xpos[capsuleBodyId * 3];
    const mjY = data.xpos[capsuleBodyId * 3 + 1];
    const mjZ = data.xpos[capsuleBodyId * 3 + 2];
    const capsuleThree = PhysicsEngine.mujocoToWorld([mjX, mjY, mjZ] as [number, number, number]);

    // The bindWorldPositions were captured in T-pose at the original spawn point.
    // Compute the delta from spawn capsule center to current capsule center in Three.js space.
    const spawnCapsuleCenter = new THREE.Vector3(
      (this.bindPoseWorldPositions.get('mixamorighips')?.x ?? capsuleThree.x),
      capsuleThree.y, // we only need X/Z delta — Y is handled by physics/StateRehydrator
      (this.bindPoseWorldPositions.get('mixamorighips')?.z ?? capsuleThree.z),
    );
    const dx = capsuleThree.x - spawnCapsuleCenter.x;
    const dz = capsuleThree.z - spawnCapsuleCenter.z;

    // Translate every bindWorldPosition by that same X/Z delta
    this.boneInfoMap.forEach((info) => {
      const bindPos = (info as any).bindWorldPosition as THREE.Vector3 | undefined;
      if (bindPos) {
        bindPos.x += dx;
        bindPos.z += dz;
        // Also update worldPosition to match (used by BodyManager remapIds)
        info.worldPosition.x += dx;
        info.worldPosition.z += dz;
      }
    });

    // Keep bindPoseWorldPositions in sync too
    this.bindPoseWorldPositions.forEach((pos) => {
      pos.x += dx;
      pos.z += dz;
    });
  }

  public renderDebugSpheres(show: boolean = false): void {
    this.debugSpheres.forEach(sphere => {
      this.scene.remove(sphere);
      (sphere.geometry as THREE.BufferGeometry).dispose();
      (sphere.material as THREE.Material).dispose();
    });
    this.debugSpheres.clear();

    if (!show) return;

    this.boneInfoMap.forEach((boneInfo, boneName) => {
      const geometry = new THREE.SphereGeometry(0.02, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0x55ff55,
        transparent: true,
        opacity: 0.5,
      });

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(boneInfo.worldPosition);
      this.scene.add(sphere);
      this.debugSpheres.set(boneName, sphere);
    });
  }

  public renderAICameraHelper(show: boolean = false, cameraData?: Array<{ label: string; position: THREE.Vector3; quaternion: THREE.Quaternion; color: number }>): void {
    if (!show) {
      this.cameraHelpers.forEach(h => h.visible = false);
      return;
    }

    if (!cameraData || cameraData.length === 0) return;

    while (this.cameraHelpers.length < cameraData.length) {
      const idx = this.cameraHelpers.length;
      const cam = cameraData[idx];

      const group = new THREE.Group();
      group.renderOrder = 1000;

      const bodyGeo = new THREE.BoxGeometry(0.12, 0.08, 0.15);
      const bodyMat = new THREE.MeshBasicMaterial({ color: cam.color, wireframe: true, depthTest: false });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.renderOrder = 1000;
      group.add(body);

      const lineGeo = new THREE.CylinderGeometry(0.006, 0.006, 3.0);
      const lineMat = new THREE.MeshBasicMaterial({ color: cam.color, depthTest: false });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = Math.PI / 2;
      line.position.z = 1.5;
      line.renderOrder = 1000;
      group.add(line);

      this.scene.add(group);
      this.cameraHelpers.push(group);
    }

    cameraData.forEach((cam, i) => {
      const helper = this.cameraHelpers[i];
      if (!helper) return;
      helper.visible = true;
      helper.position.copy(cam.position);
      helper.quaternion.copy(cam.quaternion);
    });
  }

  private isTerminal(bone: THREE.Bone): boolean {
    const name = bone.name.toLowerCase();
    const fingerPattern = /(thumb|index|middle|ring|pinky)\d+$/;
    if (fingerPattern.test(name)) return false;

    const fingerToeTerminals = ['thumb4', 'index4', 'middle4', 'ring4', 'pinky4', 'index_tip', 'middle_tip', 'thumb_tip', 'pinky_tip'];
    if (fingerToeTerminals.some(t => name.includes(t))) return true;

    if (name.endsWith('_end') || name.endsWith('end')) return true;
    if (bone.children.length === 0) return true;
    return false;
  }

  public async createRigidBodiesAndColliders(): Promise<boolean> {
    if (!this.isLoaded || !this.modelRoot || !this.skeleton) {
      Logger.error('HumanoidPhysicsBinderMuJoCo STEP B: Model not loaded.');
      return false;
    }

    this.physicsEngine.setMutating(true);
    this.physicsEngine.setReady(false);

    try {
      this.capsuleCenterY = this.modelHeight / 2;

      // Delegate activation directly to MuJoCoBodyManager!
      const success = await this.bodyManager.activate(
        this.boneInfoMap,
        this.skeleton,
        null,
        this.capsuleCenterY,
        this.modelRoot
      );

      if (success) {
        this.initMotorController();
      }

      this.buildStep = 'B';
      this.physicsEngine.setReady(true);
      return success;
    } catch (error) {
      Logger.error('HumanoidPhysicsBinderMuJoCo STEP B: Failed', error);
      return false;
    } finally {
      this.physicsEngine.setMutating(false);
    }
  }

  /**
   * Fix 1: Ensures capsuleCenterY is correctly set for spawned agents.
   * Must be called after loadAndVisualizeBindPose() and before generateCombinedMCF()
   * to prevent the root capsule from being placed at Z=0 (floor level), which causes
   * the contact solver to catapult the agent skyward on the first physics step.
   */
  public ensureCapsuleGeometry(): void {
    this.capsuleCenterY = this.modelHeight / 2;
    // Keep BodyManager offset consistent so setCapsulePosition math is correct
    (this.bodyManager as any).capsuleCenterY = this.capsuleCenterY;
    Logger.info(`HumanoidPhysicsBinder (${this.agentId}): ensureCapsuleGeometry set capsuleCenterY=${this.capsuleCenterY.toFixed(3)}`);
  }

  public async createJointsWithZeroMotors(): Promise<boolean> {
    this.buildStep = 'C';
    return true;
  }

  public async activateMotorsWithStiffnessAndDamping(stiffness: number, damping: number): Promise<boolean> {
    this.currentStiffness = stiffness;
    this.currentDamping = damping;
    this.buildStep = 'D';
    return true;
  }

  public async activateMultiBody(): Promise<boolean> {
    if (this.buildStep !== 'D' || !this.modelRoot || !this.skeleton) return false;
    if (this.mbActive) return true;

    try {
      const world = this.physicsEngine.getWorld();
      const module = PhysicsEngine.getModule();
      if (!module) return false;

      const rigidBodiesMap = new Map<string, BodyProxy>();
      const bodyIds = this.bodyManager.getRigidBodiesMap();
      const capsuleBodyId = this.bodyManager.getCapsuleBody();

      for (const [boneName, bodyId] of bodyIds) {
        if (boneName === 'root_capsule') continue;
        const proxy = new BodyProxy(bodyId, world.model, world.data, module);
        rigidBodiesMap.set(boneName, proxy);
      }

      this.observationBuilder.clear();
      if (capsuleBodyId !== null && capsuleBodyId >= 0) {
        const capsuleProxy = new BodyProxy(capsuleBodyId, world.model, world.data, module);
        this.observationBuilder.registerJoint('capsule', capsuleProxy as any, null);

        for (const [boneName, proxy] of rigidBodiesMap) {
          this.observationBuilder.registerJoint(
            boneName,
            proxy as any,
            capsuleProxy as any
          );
        }
      }

      this.avatarSynchronizer.clear();
      for (const [boneName] of rigidBodiesMap) {
        const info = this.boneInfoMap.get(boneName);
        if (!info) continue;
        this.avatarSynchronizer.registerBone(boneName, info.bone.name, {
          canonicalName: boneName, syncRotation: true, syncTranslation: false, rootOffsetY: 0,
        });
      }

      this.observationBuilder.setGroundHeight(0);
      this.mbActive = true;
      Logger.info('HumanoidPhysicsBinderMuJoCo: Multi-body active');
      return true;
    } catch (error) {
      Logger.error('HumanoidPhysicsBinderMuJoCo: Multi-body activation failed', error);
      return false;
    }
  }

  public deactivateMultiBody(): void {
    this.observationBuilder.clear();
    this.avatarSynchronizer.clear();
    this.mbActive = false;
    Logger.info('HumanoidPhysicsBinderMuJoCo: Multi-body deactivated');
  }

  public getMultiBodyManager() {
    return this.bodyManager;
  }

  public initMotorController(): void {
    const world = this.physicsEngine.getWorld();
    this.motorController.init(
      this.bodyManager.getActuatorMap(),
      world.model,
      world.data
    );
  }

  public getBoneInfoMap() {
    return this.boneInfoMap;
  }

  public getCapsuleCenterY(): number {
    return this.capsuleCenterY;
  }

  public getObservationBuilder(): ObservationBuilder {
    return this.observationBuilder;
  }

  public syncVisuals(): void {
    if (!this.isLoaded || !this.modelRoot) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule();
    if (!module) return;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    // 1. Position and orient the Three.js model root using MuJoCo capsule body
    // Read directly from WASM arrays instead of creating a BodyProxy per frame
    const capsulePosX = data.xpos[capsuleBodyId * 3];
    const capsulePosY = data.xpos[capsuleBodyId * 3 + 1];
    const capsulePosZ = data.xpos[capsuleBodyId * 3 + 2];
    const capsuleQuatW = data.xquat[capsuleBodyId * 4];
    const capsuleQuatX = data.xquat[capsuleBodyId * 4 + 1];
    const capsuleQuatY = data.xquat[capsuleBodyId * 4 + 2];
    const capsuleQuatZ = data.xquat[capsuleBodyId * 4 + 3];

    // Convert MuJoCo coordinates to Three.js and update cached vectors in-place
    this._syncCapsulePos.set(capsulePosX, capsulePosZ, -capsulePosY);
    this._syncCapsuleQuat.set(capsuleQuatX, capsuleQuatZ, -capsuleQuatY, capsuleQuatW);

    this._syncOffsetLocal.set(0, this.capsuleCenterY, 0);
    this._syncOffsetWorld.copy(this._syncOffsetLocal).applyQuaternion(this._syncCapsuleQuat);

    this.modelRoot.position.copy(this._syncCapsulePos).sub(this._syncOffsetWorld);
    this.modelRoot.quaternion.copy(this._syncCapsuleQuat);

    // 2. Determine ground surface height from floor geom position (no mj_ray — eliminates WASM heap fragmentation)
    // Lazy-init: cache floor geom ID on first call after model is ready
    if (this._floorGeomId < 0 && module) {
      this._floorGeomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'floor');
    }
    if (this._floorGeomId >= 0 && data.geom_xpos) {
      // mj_ray dist = capsulePosZ - floorZ (ray goes straight down along Z in MuJoCo).
      // groundSurfaceY = capsulePosY - dist = capsulePosY - capsulePosZ + floorZ.
      const floorZ = data.geom_xpos[this._floorGeomId * 3 + 2];
      this.groundSurfaceY = capsulePosY - capsulePosZ + floorZ;
    } else {
      this.groundSurfaceY = 0.0;
    }

    // Spawn alignment: set targetSpawnGrounded to true to mark grounding initialized
    if (!this.targetSpawnGrounded) {
      this.targetSpawnGrounded = true;
    }

    const capsuleBottomY = capsulePosY - this.capsuleCenterY;
    this._isGrounded = capsuleBottomY <= (this.groundSurfaceY + this.GROUND_SNAP_THRESHOLD);

    // Static friction enforcement: kill residual horizontal micro-drift when grounded and idle.
    // MuJoCo's soft-constraint friction can leave tiny velocities that accumulate into
    // visible gliding. Damp them aggressively while the agent is on the ground, but bypass
    // during active gait so forward root drive isn't annihilated.
    if (this._isGrounded && !this.motorController.isGaitActive()) {
      const dofAdr = model.body_dofadr[capsuleBodyId];
      if (dofAdr !== undefined && dofAdr >= 0) {
        const qvel = data.qvel;
        // MuJoCo free joint: qvel[dofAdr+0..2] = linear (X,Y,Z in MuJoCo = X,Z,-Y in Three)
        // qvel[dofAdr+3..5] = angular
        const vx = qvel[dofAdr];
        const vy = qvel[dofAdr + 1];
        const lateralSpeed = Math.sqrt(vx * vx + vy * vy);
        // If lateral speed is below 0.08 m/s, dampen hard — this is near-stationary micro-drift
        if (lateralSpeed < 0.08) {
          qvel[dofAdr] *= 0.85;
          qvel[dofAdr + 1] *= 0.85;
        } else if (lateralSpeed < 0.25) {
          // Moderate damping at low speeds to prevent slow-creep
          qvel[dofAdr] *= 0.94;
          qvel[dofAdr + 1] *= 0.94;
        }
        // Also damp angular yaw drift (Z-axis in MuJoCo)
        const wz = qvel[dofAdr + 5];
        if (Math.abs(wz) < 0.05) {
          qvel[dofAdr + 5] *= 0.80;
        }
      }
    }

    // Kinematic ground reaction forces
    this.applyKinematicGroundReactionForces();

    // 3. Synchronize visual bones with proxies!
    if (this.mbActive) {
      // Reuse cached maps instead of creating new ones per frame
      this._syncBonesMap.clear();
      this._syncProxiesMap.clear();

      for (const [canonical] of this.bodyManager.getRigidBodiesMap()) {
        if (canonical === 'root_capsule') continue;
        const boneInfo = this.boneInfoMap.get(canonical);
        if (!boneInfo) continue;
        this._syncWorldPos.set(0, 0, 0);
        boneInfo.bone.getWorldPosition(this._syncWorldPos);
        this._syncBonesMap.set(canonical, { bone: boneInfo.bone, worldPosition: this._syncWorldPos.clone() });
      }

      for (const [canonical, bodyId] of this.bodyManager.getRigidBodiesMap()) {
        if (canonical === 'root_capsule') continue;
        this._syncProxiesMap.set(canonical, new BodyProxy(bodyId, model, data, module, this.prefix));
      }

      this.avatarSynchronizer.synchronize(this._syncBonesMap, this._syncProxiesMap as any);
    }

    this.modelRoot.updateMatrixWorld(true);

    if (this.debugSpheres.size > 0 && this.skeleton) {
      this.boneInfoMap.forEach((boneInfo, boneName) => {
        const debugSphere = this.debugSpheres.get(boneName);
        if (debugSphere) {
          this._syncWorldPos.set(0, 0, 0);
          boneInfo.bone.getWorldPosition(this._syncWorldPos);
          debugSphere.position.copy(this._syncWorldPos);
        }
      });
    }

    // Timeline stepper interpolation logic (identical to HumanoidPhysicsBinder.ts)
    if (this.timelineQueue.length > 0) {
      if (this.timelineSequenceStart === null) {
        this.timelineSequenceStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      }

      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const elapsed = now - (this.timelineSequenceStart as number);
      const sorted = this.timelineQueue.slice().sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);

      let activeIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if ((sorted[i].timeOffsetMs || 0) <= elapsed) {
          activeIdx = i;
        } else {
          break;
        }
      }

      if (activeIdx >= 0) {
        const activeFrame = sorted[activeIdx];
        const nextFrame = activeIdx + 1 < sorted.length ? sorted[activeIdx + 1] : null;

        if (nextFrame) {
          const duration = nextFrame.timeOffsetMs - activeFrame.timeOffsetMs;
          const t_interp = duration > 0 ? Math.max(0, Math.min(1, (elapsed - activeFrame.timeOffsetMs) / duration)) : 1;

          const interpolatedOverrides: Record<string, number | [number, number, number]> = {};
          const allKeys = new Set([
            ...Object.keys(activeFrame.overrides || {}),
            ...Object.keys(nextFrame.overrides || {}),
          ]);

          for (const key of allKeys) {
            const startVal = activeFrame.overrides?.[key];
            const endVal = nextFrame.overrides?.[key];

            if (startVal !== undefined && endVal !== undefined) {
              if (typeof startVal === 'number' && typeof endVal === 'number') {
                interpolatedOverrides[key] = startVal + (endVal - startVal) * t_interp;
              } else if (Array.isArray(startVal) && Array.isArray(endVal) && startVal.length === 3 && endVal.length === 3) {
                // Direct joint-space linear interpolation avoids Euler gimbal flips, ±PI branch cuts, and coordinate axis confusion
                interpolatedOverrides[key] = [
                  startVal[0] + (endVal[0] - startVal[0]) * t_interp,
                  startVal[1] + (endVal[1] - startVal[1]) * t_interp,
                  startVal[2] + (endVal[2] - startVal[2]) * t_interp,
                ];
              } else {
                interpolatedOverrides[key] = endVal;
              }
            } else if (endVal !== undefined) {
              interpolatedOverrides[key] = endVal;
            } else if (startVal !== undefined) {
              interpolatedOverrides[key] = startVal;
            }
          }

          this.setMotorTargets(interpolatedOverrides as any);
        } else {
          this.setMotorTargets(activeFrame.overrides as any);
        }
      }

      const GRACE_MS = 50;
      this.timelineQueue = sorted.filter(f => (f.timeOffsetMs || 0) > elapsed - GRACE_MS);
      if (this.timelineQueue.length === 0) this.timelineSequenceStart = null;
    }
  }

  private applyKinematicGroundReactionForces(): void {
    if (!this.modelRoot) return;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const dofAdr = model.body_dofadr[capsuleBodyId];
    const qvel = data.qvel;

    if (this.mbActive) {
      if (!ENABLE_KINEMATIC_GRF_INJECTOR) return;
      const registry = this.physicsEngine.getContactForceRegistry();
      const footBones = ['mixamorigleftfoot', 'mixamorigrightfoot'];
      const totalImpulse = new THREE.Vector3(0, 0, 0);
      const totalTorque = new THREE.Vector3(0, 0, 0);

      const capsuleProxy = new BodyProxy(capsuleBodyId, model, data, null);
      const capsulePos = capsuleProxy.translation();
      const modelQuat = this.modelRoot.quaternion.clone();
      const modelForward = new THREE.Vector3(0, 0, -1).applyQuaternion(modelQuat);

      for (const boneName of footBones) {
        const colliderHandle = this.bodyManager.getBoneColliderHandle(boneName);
        if (colliderHandle === null) continue;

        const state = registry.get(colliderHandle);
        if (!state || !state.inContact || state.impulse_magnitude < 0.5) continue;

        const nz = state.contact_normal[2];
        if (nz < 0.3) continue;

        const boneInfo = this.boneInfoMap.get(boneName);
        if (!boneInfo) continue;
        const footPos = new THREE.Vector3();
        boneInfo.bone.getWorldPosition(footPos);

        const gaitBoost = this.gaitActive ? 1.5 : 1.0;
        let forwardComponent: number;
        if (state.contact_force) {
          const forceWorld = PhysicsEngine.mujocoToWorld(state.contact_force);
          const lateralForce = new THREE.Vector3(forceWorld.x, 0, forceWorld.z);
          forwardComponent = lateralForce.dot(modelForward);
        } else {
          const contactNormal = new THREE.Vector3(
            state.contact_normal[0],
            state.contact_normal[1],
            state.contact_normal[2]
          );
          const lateralForce = contactNormal.clone();
          lateralForce.y = 0;
          forwardComponent = lateralForce.dot(modelForward);
        }

        const forceScale = 1.0 / 700.0;
        const cap = 8.0;
        const impulseMag = Math.max(-cap, Math.min(cap, forwardComponent * forceScale * gaitBoost));

        if (Math.abs(forwardComponent) > 0.01) {
          const grf = modelForward.clone().multiplyScalar(impulseMag);
          totalImpulse.add(grf);
        }

        const offsetFromCenter = footPos.x - capsulePos.x;
        const torqueY = -forwardComponent * 0.003 * offsetFromCenter * 6.0;
        totalTorque.y += Math.max(-5.0, Math.min(5.0, torqueY));
      }

      if (totalImpulse.lengthSq() > 0) {
        // qvel velocity impulse for free joint: deltaV = impulse / mass
        // (Road-3: corrected to the real post-Road-2 total body mass ~90 kg)
        const deltaV = totalImpulse.clone().multiplyScalar(1 / HUMANOID_MASS_KG);
        const deltaVMj = PhysicsEngine.worldToMuJoCo(deltaV);
        qvel[dofAdr] += deltaVMj[0];
        qvel[dofAdr + 1] += deltaVMj[1];
        qvel[dofAdr + 2] += deltaVMj[2];
      }
      if (Math.abs(totalTorque.y) > 0) {
        // angular velocity impulse: deltaW = torque / inertia (inertia = 10.0)
        const inertia = 10.0;
        const deltaW = totalTorque.clone().multiplyScalar(1 / inertia);
        const deltaWMj = PhysicsEngine.worldToMuJoCo(deltaW);
        qvel[dofAdr + 3] += deltaWMj[0];
        qvel[dofAdr + 4] += deltaWMj[1];
        qvel[dofAdr + 5] += deltaWMj[2];
      }
      return;
    }

    // Kinematic model foot positions reaction forces
    const feetNames = ['mixamoriglefttoebase', 'mixamorigrighttoebase'];
    const totalImpulse = new THREE.Vector3(0, 0, 0);
    const totalTorque = new THREE.Vector3(0, 0, 0);
    const modelQuat = this.modelRoot.quaternion.clone();

    feetNames.forEach((boneName) => {
      const boneInfo = this.boneInfoMap.get(boneName);
      if (!boneInfo) return;

      const currentPos = new THREE.Vector3();
      boneInfo.bone.getWorldPosition(currentPos);

      const previousPos = this.previousFootPositions.get(boneName);
      if (previousPos) {
        if (currentPos.y <= this.groundSurfaceY + 0.15) {
          const delta = new THREE.Vector3().subVectors(currentPos, previousPos);
          const deltaMag = delta.length();

          const MAX_POSE_FOOT_DELTA = 0.18;
          if (deltaMag > MAX_POSE_FOOT_DELTA) {
            this.previousFootPositions.set(boneName, currentPos.clone());
            return;
          }

          const planarDelta = delta.clone();
          planarDelta.y = 0;
          const planarDeltaMag = planarDelta.length();

          if (planarDeltaMag > 0.001) {
            const modelForward = new THREE.Vector3(0, 0, -1).applyQuaternion(modelQuat);
            const forwardMotion = planarDelta.clone().projectOnVector(modelForward);

            const forwardMag = forwardMotion.length();

            if (forwardMag > 0.002) {
              const grf = forwardMotion.clone().negate().multiplyScalar(this.KGRF_MULTIPLIER);
              const MAX_GRF_IMPULSE = 16.0;
              if (grf.length() > MAX_GRF_IMPULSE) {
                grf.setLength(MAX_GRF_IMPULSE);
              }

              const capsuleProxy = new BodyProxy(capsuleBodyId, model, data, null);
              const capsulePos = capsuleProxy.translation();
              const offsetFromCenter = currentPos.x - capsulePos.x;
              const torqueY = -grf.z * offsetFromCenter * 5.0;
              const MAX_TORQUE_Y = 5.0;

              grf.y = 0;
              totalImpulse.add(grf);
              totalTorque.y += Math.max(-MAX_TORQUE_Y, Math.min(MAX_TORQUE_Y, torqueY));
            }
          }
        }
      }

      this.previousFootPositions.set(boneName, currentPos.clone());
    });

    if (totalImpulse.lengthSq() > 0) {
      // Road-3: corrected to the real post-Road-2 total body mass ~90 kg.
      const deltaV = totalImpulse.clone().multiplyScalar(1 / HUMANOID_MASS_KG);
      const deltaVMj = PhysicsEngine.worldToMuJoCo(deltaV);
      qvel[dofAdr] += deltaVMj[0];
      qvel[dofAdr + 1] += deltaVMj[1];
      qvel[dofAdr + 2] += deltaVMj[2];
    }
    if (Math.abs(totalTorque.y) > 0) {
      const inertia = 10.0;
      const deltaW = totalTorque.clone().multiplyScalar(1 / inertia);
      const deltaWMj = PhysicsEngine.worldToMuJoCo(deltaW);
      qvel[dofAdr + 3] += deltaWMj[0];
      qvel[dofAdr + 4] += deltaWMj[1];
      qvel[dofAdr + 5] += deltaWMj[2];
    }
  }

  public getIsGrounded(): boolean {
    return this._isGrounded;
  }

  // ── Root velocity drive (Road-3) ───────────────────────────────────────
  /**
   * Command a horizontal root velocity (m/s, Three.js world X/Z). The drive is
   * a critically-damped servo applied per 500 Hz physics step; it suspends
   * while the agent is airborne so aerial impulses aren't fought.
   */
  public setTargetRootVelocity(vx: number, vz: number, holdMs: number): void {
    this.targetRootVelocity = new THREE.Vector3(vx, 0, vz);
    this.targetRootVelocityExpiryMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() + holdMs : Date.now() + holdMs;
  }

  /** True while a root velocity target is registered and not expired. */
  public rootVelocityTargetActive(): boolean {
    if (!this.targetRootVelocity) return false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return now < this.targetRootVelocityExpiryMs;
  }

  /**
   * Isolation-testing gate for the Road-3 root velocity servo. When disabled,
   * applyRootVelocityDrive() returns false (no-op) regardless of the active
   * target — lets an isolation test attribute drift purely to the leg/pose
   * stack without the root assist fighting it.
   */
  public setRootVelocityDriveEnabled(enabled: boolean): void {
    this.rootVelocityDriveEnabled = enabled;
    Logger.info(`HumanoidPhysicsBinder (${this.agentId}): root velocity drive enabled=${enabled}`);
  }

  /** Current horizontal root speed (m/s, Three.js X/Z). */
  public getRootVelocity(): { x: number; z: number } {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return { x: 0, z: 0 };
    const world = this.physicsEngine.getWorld();
    const dofAdr = world.model.body_dofadr[capsuleBodyId];
    if (dofAdr === undefined || dofAdr < 0) return { x: 0, z: 0 };
    const qvel = world.data.qvel;
    const vMj: [number, number, number] = [qvel[dofAdr], qvel[dofAdr + 1], qvel[dofAdr + 2]];
    const vWorld = PhysicsEngine.mujocoToWorld(vMj);
    return { x: vWorld.x, z: vWorld.z };
  }

  /**
   * Per-physics-step (500 Hz) root velocity servo. Call after applyBalanceStep().
   * Critically-damped: accel = ω²·(error) with ω = ROOT_VELOCITY_DAMP_W, applied
   * as an additive velocity delta in the free-joint linear DOFs, then hard-clamped
   * to ROOT_VELOCITY_MAX_MPS. Suspends when airborne (no drive while in the air).
   * Returns true iff a target was applied this step.
   */
  public applyRootVelocityDrive(nowMs?: number): boolean {
    if (this.buildStep !== 'D' || !this.rootVelocityDriveEnabled) return false;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return false;

    const ts = nowMs ?? ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    if (!this.targetRootVelocity || ts >= this.targetRootVelocityExpiryMs) {
      this.targetRootVelocity = null;
      return false;
    }
    if (!this._isGrounded) return false; // airborne suspend — no drive while in the air

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const dofAdr = model.body_dofadr[capsuleBodyId];
    if (dofAdr === undefined || dofAdr < 0) return false;

    const qvel = data.qvel;
    const vMj: [number, number, number] = [qvel[dofAdr], qvel[dofAdr + 1], qvel[dofAdr + 2]];
    const vWorld = PhysicsEngine.mujocoToWorld(vMj);

    // Critically-damped error decay: accel = ω²·(target − current), ω = 6 s⁻¹.
    const k = ROOT_VELOCITY_DAMP_W; // s⁻¹
    const ax = k * k * (this.targetRootVelocity.x - vWorld.x) * PHYSICS_DT;
    const az = k * k * (this.targetRootVelocity.z - vWorld.z) * PHYSICS_DT;

    let newVx = vWorld.x + ax;
    let newVz = vWorld.z + az;

    // Hard speed clamp (0.3 m/s).
    const speed = Math.hypot(newVx, newVz);
    if (speed > ROOT_VELOCITY_MAX_MPS) {
      const scale = ROOT_VELOCITY_MAX_MPS / speed;
      newVx *= scale;
      newVz *= scale;
    }

    const newVMj = PhysicsEngine.worldToMuJoCo({ x: newVx, y: 0, z: newVz });
    qvel[dofAdr] = newVMj[0];
    qvel[dofAdr + 1] = newVMj[1];
    // qvel[dofAdr + 2] is vertical — intentionally untouched.
    return true;
  }

  // ── COM lean-reflex + capture-step (Road-4) ────────────────────────────
  /** Enable/disable the per-step COM reflex (off by default until toggled). */
  public setComReflexEnabled(enabled: boolean, startStanceSide: Side = 'left'): void {
    this.reflexEnabled = enabled;
    if (enabled) {
      this.reflexController.reset(startStanceSide);
      this.reflexBodyCache = null;
    }
    Logger.info(`HumanoidPhysicsBinder (${this.agentId}): COM reflex enabled=${enabled}`);
  }

  /** Override the reflex gains (kH/kD/kCapture/forceStepM). Used by tuning rounds. */
  public setComReflexGains(gains: Partial<ReflexGains>): void {
    this.reflexGains = { ...this.reflexGains, ...gains };
    this.reflexController.reset('left');
  }

  /** The live controller — gates read getStats()/diagnose() from here. */
  public getReflexController(): ComReflexController {
    return this.reflexController;
  }

  /** Current reflex stats aggregate (max |e|, steps fired/landed, etc.). */
  public getReflexStats(): ReflexStats {
    return this.reflexController.getStats();
  }

  /**
   * Build the mass-weighted body id list (and total mass) for the COM sum.
   * Skips world/floor/env bodies exactly like the useWorld diagnostics ring:
   * names starting with env_slot_ plus floor/world. Also skips the
   * reaction_mass body (RMBS), which would otherwise corrupt the Road-4 COM
   * and capture math. Rebuilt lazily (and whenever the model is recompiled —
   * the cache is cleared on enable).
   */
  private refreshReflexBodyCache(): { ids: number[]; totalMass: number } {
    const world = this.physicsEngine.getWorld();
    const module = PhysicsEngine.getModule();
    const model = world?.model;
    if (!model || !module || !world?.data) return { ids: [], totalMass: 0 };

    const ids: number[] = [];
    let totalMass = 0;
    for (let bi = 0; bi < model.nbody; bi++) {
      const m = model.body_mass[bi];
      if (m <= 0) continue;
      const name = module.mj_id2name(model, module.mjtObj.mjOBJ_BODY.value, bi) ?? '';
      if (name.startsWith('env_slot_') || name === 'floor' || name === 'world') continue;
      if (name.includes('reaction_mass')) continue;
      ids.push(bi);
      totalMass += m;
    }
    this.reflexBodyCache = ids;
    this.reflexTotalMass = totalMass;
    return { ids, totalMass };
  }

  /** Mass-weighted humanoid COM (position + velocity) in Three.js world space. */
  private computeComWorld(world: any): { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number } } {
    let cache = this.reflexBodyCache;
    let totalMass = this.reflexTotalMass;
    if (cache === null || cache.length === 0) {
      const built = this.refreshReflexBodyCache();
      cache = built.ids;
      totalMass = built.totalMass;
    }
    const data = world.data;
    let cx = 0, cy = 0, cz = 0;
    let vx = 0, vy = 0, vz = 0;
    for (const bi of cache) {
      // Per-body mass lookup mirrors the diag ring (body_mass is indexed by body id).
      const mi = world.model.body_mass[bi];
      cx += mi * data.xpos[bi * 3];
      cy += mi * data.xpos[bi * 3 + 1];
      cz += mi * data.xpos[bi * 3 + 2];
      const cv = bi * 6;
      // cvel linear = [cv+3, cv+4, cv+5] (MuJoCo frame), same as BodyProxy.linvel.
      vx += mi * data.cvel[cv + 3];
      vy += mi * data.cvel[cv + 4];
      vz += mi * data.cvel[cv + 5];
    }
    const inv = totalMass > 0 ? 1 / totalMass : 0;
    const posMj: [number, number, number] = [cx * inv, cy * inv, cz * inv];
    const velMj: [number, number, number] = [vx * inv, vy * inv, vz * inv];
    const pos = PhysicsEngine.mujocoToWorld(posMj);
    const vel = PhysicsEngine.mujocoToWorld(velMj);
    return { pos, vel };
  }

  /** Capsule YAW-ONLY forward vector (drops pitch/roll per the task spec). */
  private capsuleYawForwardVec(world: any): { x: number; y: number; z: number } {
    const capId = this.bodyManager.getCapsuleBody();
    if (capId === null || capId < 0) return { x: 0, y: 0, z: -1 };
    const qMj: [number, number, number, number] = [
      world.data.xquat[capId * 4],
      world.data.xquat[capId * 4 + 1],
      world.data.xquat[capId * 4 + 2],
      world.data.xquat[capId * 4 + 3],
    ];
    const t = PhysicsEngine.mujocoQuatToThree(qMj);
    const q = new THREE.Quaternion(t.x, t.y, t.z, t.w);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const yawOnly = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(yawOnly).normalize();
    return { x: fwd.x, y: fwd.y, z: fwd.z };
  }

  /** Current gait cycle phase in [0,1) derived from the playing timeline. */
  private currentGaitPhaseU(nowMs: number): number {
    if (this.timelineSequenceStart === null) return 0;
    const elapsedS = (nowMs - this.timelineSequenceStart) / 1000;
    return (((elapsedS / GAIT_CYCLE.durationS) % 1) + 1) % 1;
  }

  private footSoleGapM(world: any, footBodyId: number): number {
    const zMj = world.data.xpos[footBodyId * 3 + 2];
    // In MuJoCo bind/standing pose, ankle body center rests at Z ~ 0.09m when the sole bottom is at floor Z = 0.
    // The gap is the height of the bottom sole above the floor Z = 0.
    const lowest = zMj - 0.090;
    const gap = Math.max(0, lowest);

    // Diagnostic (Road-5.1 support-detection fix): decimated dump of the foot
    // body/geom ids this helper resolves via mj_name2id plus the bodyMap ids it
    // is called with, and the raw xpos z value read. Fired ~once per 500 calls
    // while grounded only. Pure logging - never changes behavior or returns.
    this.footSoleDiagStep += 1;
    if (this.footSoleDiagStep % 500 === 0 && this._isGrounded) {
      try {
        const module = PhysicsEngine.getModule();
        const model = world.model;
        if (module && model) {
          const lBody = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, this.prefix + 'mixamorigleftfoot');
          const rBody = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, this.prefix + 'mixamorigrightfoot');
          const lGeom = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, this.prefix + 'mixamorigleftfoot_geom');
          const rGeom = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, this.prefix + 'mixamorigrightfoot_geom');
          const feetMap = this.bodyManager.getRigidBodiesMap();
          const lMapId = feetMap.get('mixamorigleftfoot');
          const rMapId = feetMap.get('mixamorigrightfoot');
          console.log(
            `[FOOT_SOLE_DIAG ${this.agentId}] step=${this.footSoleDiagStep} ` +
            `calledWithFootBodyId=${footBodyId} ` +
            `bodyMap l=${lMapId} r=${rMapId} ` +
            `mj_name2id lBody=${lBody} rBody=${rBody} lGeom=${lGeom} rGeom=${rGeom} ` +
            `zRawMj=${world.data.xpos[footBodyId * 3 + 2]} gap=${gap} grounded=${this._isGrounded}`
          );
        }
      } catch {
        // Diagnostics must never throw into the 500 Hz step.
      }
    }

    return gap;
  }

  /**
   * Per-physics-step (500 Hz) COM lean-reflex + capture-step.
   *
   * Order of operations:
   *   1. compute mass-weighted COM + velocity (Three world)
   *   2. yaw-only forward axis, sole-gap stance detection
   *   3. ComReflexController.computeFrame (lean + capture + forced-step laws)
   *   4. inject additively: spine2 lean delta (Option A), swing-hip capture
   *      delta, v4 knee-lift + ankle-dorsiflex shape during the swing window
   *      (and forced steps), on top of the current flush ctrl.
   *
   * Guards: buildStep 'D', mbActive, reflexEnabled. Returns commands applied.
   */
  public applyComReflexStep(nowMs?: number): boolean {
    if (this.buildStep !== 'D' || !this.mbActive || !this.reflexEnabled) return false;
    const world = this.physicsEngine.getWorld();
    if (!world || !world.model || !world.data) return false;
    const capId = this.bodyManager.getCapsuleBody();
    if (capId === null || capId < 0) return false;

    const ts = nowMs ?? (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    // ---- inputs ----
    const com = this.computeComWorld(world);
    const forward = this.capsuleYawForwardVec(world);
    const feetMap = this.bodyManager.getRigidBodiesMap();
    const lFootId = feetMap.get('mixamorigleftfoot');
    const rFootId = feetMap.get('mixamorigrightfoot');
    if (lFootId === undefined || rFootId === undefined) return false;

    // Ankle body center to foot sole center offset in MuJoCo space (-0.06m in Y = forward)
    const lPosMj: [number, number, number] = [
      world.data.xpos[lFootId * 3],
      world.data.xpos[lFootId * 3 + 1] - 0.060,
      world.data.xpos[lFootId * 3 + 2],
    ];
    const rPosMj: [number, number, number] = [
      world.data.xpos[rFootId * 3],
      world.data.xpos[rFootId * 3 + 1] - 0.060,
      world.data.xpos[rFootId * 3 + 2],
    ];
    const lPos = PhysicsEngine.mujocoToWorld(lPosMj);
    const rPos = PhysicsEngine.mujocoToWorld(rPosMj);

    const cmd = this.reflexController.computeFrame({
      comPosWorld: com.pos,
      comVelWorld: com.vel,
      forwardVec: forward,
      leftFootPos: lPos,
      rightFootPos: rPos,
      footSoleGapsM: {
        left: this.footSoleGapM(world, lFootId),
        right: this.footSoleGapM(world, rFootId),
      },
      cyclePhase01: this.currentGaitPhaseU(ts),
      comHeightM: com.pos.y,
      dtS: 0.002,
      gains: this.reflexGains,
    });

    // ---- injections (all ADDITIVE onto the flush ctrl) ----
    const u = this.currentGaitPhaseU(ts);
    const entries: Array<[string, number, number?]> = [];

    // (1) Lean offset → spine2 pitch (Option A allocator, additive).
    const baseSpinePitch = this.motorController.readBoneCtrl(REFLEX_SPINE2_BONE, 1) ?? 0;
    const lean = allocateLeanA(cmd.leanOffsetRad, baseSpinePitch);
    entries.push([REFLEX_SPINE2_BONE, lean.pitchDeltaRad]);

    // (2) Swing-side capture hip + v4 knee/ankle shape.
    // Round 4 (per-leg FSM): the controller reports per-leg FSM state in
    // `cmd.swingState`. Inject the hip/knee/ankle swing deltas ONLY while that
    // leg is mid-swing (`state === 'swing'`); a forced leg's amplitude follows
    // its per-leg `shoulderEnv` 0→1→0 bump (never frozen at 1.0), while a
    // natural-window leg keeps the phase-map envelope. When the FSM leaves
    // 'swing' (planted/refractory/stance) the deltas taper to 0 and the leg
    // descends — the mandatory-plant exit, not a per-step hold.
    const swingBundle = cmd.swingState?.[cmd.swingSide];
    const isSwinging = swingBundle?.state === 'swing';
    if (isSwinging) {
      const legEnv = swingBundle.forced ? swingBundle.shoulderEnv : swingEnvAt(u, cmd.swingSide);
      entries.push([REFLEX_HIP_BONE(cmd.swingSide), cmd.swingHipOffsetRad]);
      entries.push([REFLEX_KNEE_BONE(cmd.swingSide), REFLEX_SWING_KNEE_MAX_RAD * legEnv]);
      entries.push([REFLEX_ANKLE_BONE(cmd.swingSide), REFLEX_SWING_ANKLE_MAX_RAD * legEnv]);
    }

    this.motorController.addPerStepJointDeltas(entries);

    // ---- telemetry ----
    const reflexStats = this.reflexController.getStats();
    this.lastReflexStats = {
      e: cmd.e,
      v: cmd.v,
      leanOffsetRad: cmd.leanOffsetRad,
      captureM: cmd.captureM,
      stanceSide: cmd.stanceSide,
      forcedStepCount: reflexStats.forcedStepCount,
      swingSteps: reflexStats.captureStepsLanded,
      stanceReplantCycles: reflexStats.stanceReplantCycles,
      swingAborts: reflexStats.perLegSwingAborts,
      plantedTouchdowns: reflexStats.plantedTouchdowns,
      simSteps: this.reflexSimStep,
    };

    this.reflexSimStep += 1;
    return true;
  }

  public executeJump(force: number = 6.0): void {
    this.lastAiCommandTime = Date.now();
    this.airborneTimer = 0;
    this.groundingMagnetStrength = 0.0;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const dofAdr = model.body_dofadr[capsuleBodyId];
    const qvel = data.qvel;

    if (!this._isGrounded) {
      Logger.info('HumanoidPhysicsBinderMuJoCo.executeJump: Ignored — not grounded.');
      return;
    }

    // Apply vertical takeoff velocity to root freejoint (Z is up in MuJoCo)
    // If force is a small scalar (e.g. 3-8), treat it as direct takeoff velocity in m/s.
    // If force is large (e.g. > 50 N*s), divide by mass 70.
    const deltaV = force <= 15 ? force * 0.5 : force / 70.0;
    qvel[dofAdr + 2] = Math.max(qvel[dofAdr + 2], deltaV);
    this._isGrounded = false;
    Logger.info(`HumanoidPhysicsBinderMuJoCo.executeJump: Jump impulse applied (deltaV = ${deltaV.toFixed(2)} m/s, takeoff Z = ${qvel[dofAdr + 2].toFixed(2)} m/s).`);
  }

  public setBoneRotation(boneName: string, quaternion: THREE.Quaternion): void {
    const boneInfo = this.boneInfoMap.get(boneName.toLowerCase().replace(/:/g, ''));
    if (!boneInfo) return;
    boneInfo.bone.quaternion.copy(quaternion);
  }

  public setCapsulePosition(x: number, y: number, z: number): void {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const qpos = data.qpos;
    const qvel = data.qvel;

    const module = PhysicsEngine.getModule();
    if (!module) return;

    const rootJntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + 'root_freejoint');
    if (rootJntId >= 0) {
      const qposadr = model.jnt_qposadr[rootJntId];
      const qveladr = model.jnt_dofadr[rootJntId];

      const capsulePosThree = { x, y: y + this.capsuleCenterY, z };
      const capsulePosMj = PhysicsEngine.worldToMuJoCo(capsulePosThree);

      qpos[qposadr] = capsulePosMj[0];
      qpos[qposadr + 1] = capsulePosMj[1];
      qpos[qposadr + 2] = capsulePosMj[2];

      // Reset quaternion to identity (upright)
      qpos[qposadr + 3] = 1;
      qpos[qposadr + 4] = 0;
      qpos[qposadr + 5] = 0;
      qpos[qposadr + 6] = 0;

      for (let i = 0; i < 6; i++) {
        qvel[qveladr + i] = 0;
      }
    }
  }

  public getJointState(): Record<string, { position: [number, number, number], rotation: [number, number, number, number] }> {
    const state: Record<string, any> = {};

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId !== null && capsuleBodyId >= 0) {
      const world = this.physicsEngine.getWorld();
      const capsuleProxy = new BodyProxy(capsuleBodyId, world.model, world.data, null);
      const pos = capsuleProxy.translation();
      const rot = capsuleProxy.rotation();

      state['capsule'] = {
        position: [pos.x, pos.y, pos.z] as [number, number, number],
        rotation: [rot.x, rot.y, rot.z, rot.w] as [number, number, number, number],
      };
    }

    if (this.skeleton && this.modelRoot) {
      this.boneInfoMap.forEach((boneInfo, boneName) => {
        const worldPos = new THREE.Vector3();
        boneInfo.bone.getWorldPosition(worldPos);
        const worldQuat = new THREE.Quaternion();
        boneInfo.bone.getWorldQuaternion(worldQuat);

        state[boneName] = {
          position: [worldPos.x, worldPos.y, worldPos.z] as [number, number, number],
          rotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w] as [number, number, number, number],
        };
      });
    }

    return state;
  }

  public getHeadTransform(): { position: THREE.Vector3, quaternion: THREE.Quaternion } | null {
    if (!this.skeleton || !this.modelRoot) return null;

    let headBone: THREE.Bone | null = null;
    for (const [name, info] of this.boneInfoMap) {
      if (name.includes('head')) {
        headBone = info.bone;
        break;
      }
    }

    if (!headBone) return null;

    this.modelRoot.updateMatrixWorld(true);

    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);
    const headQuat = new THREE.Quaternion();
    headBone.getWorldQuaternion(headQuat);

    const forward = this.forwardVector.clone().applyQuaternion(headQuat).normalize();
    const up = this.upVector.clone().applyQuaternion(headQuat).normalize();

    const EYE_FORWARD_OFFSET = 0.50;
    const eyePos = headPos.clone().add(forward.clone().multiplyScalar(EYE_FORWARD_OFFSET));
    const lookTarget = eyePos.clone().add(forward.clone().multiplyScalar(50));

    const camMatrix = new THREE.Matrix4().lookAt(eyePos, lookTarget, up);
    const camQuat = new THREE.Quaternion().setFromRotationMatrix(camMatrix);

    return {
      position: eyePos,
      quaternion: camQuat,
    };
  }

  public getContactForces(): Record<string, { contact: boolean; impulse_magnitude: number; contact_normal: [number, number, number]; touching: string }> {
    const result: Record<string, { contact: boolean; impulse_magnitude: number; contact_normal: [number, number, number]; touching: string }> = {};

    const capsuleGeomId = this.bodyManager.getBoneColliderHandle('root_capsule');
    if (capsuleGeomId === null) return result;

    const registry = this.physicsEngine.getContactForceRegistry();
    const state = registry.get(capsuleGeomId);

    if (state && state.inContact && state.impulse_magnitude > 0.01) {
      let touching: string;
      const nz = state.contact_normal[2];
      if (nz > 0.7) {
        touching = 'floor';
      } else if (nz < -0.7) {
        touching = 'ceiling';
      } else {
        touching = 'object';
      }

      result['capsule_body'] = {
        contact: true,
        impulse_magnitude: Math.round(state.impulse_magnitude * 1000) / 1000,
        contact_normal: state.contact_normal,
        touching,
      };
    }

    return result;
  }

  public push(_partName: string, impulse: THREE.Vector3): void {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const dofAdr = model.body_dofadr[capsuleBodyId];
    const qvel = data.qvel;

    // Apply linear velocity change (deltaV = impulse / mass)
    const mass = 70;
    const deltaV = impulse.clone().multiplyScalar(1 / mass);
    const deltaVMj = PhysicsEngine.worldToMuJoCo(deltaV);
    qvel[dofAdr] += deltaVMj[0];
    qvel[dofAdr + 1] += deltaVMj[1];
    qvel[dofAdr + 2] += deltaVMj[2];

    Logger.info(`HumanoidPhysicsBinderMuJoCo: Applied push velocity change: [${deltaV.x.toFixed(2)}, ${deltaV.y.toFixed(2)}, ${deltaV.z.toFixed(2)}]`);
  }

  public setMode(mode: 'rigid' | 'ragdoll'): void {
    if (mode === 'ragdoll') {
      this.motorController.setLimpMode(true);
      Logger.info('HumanoidPhysicsBinderMuJoCo: Switched to RAGDOLL mode — limp active');
    } else {
      this.motorController.setLimpMode(false);
      this.resetToBindPose();
      Logger.info('HumanoidPhysicsBinderMuJoCo: Switched to RIGID mode — position control restored');
    }
  }

  public getBuildStep(): string {
    return this.buildStep || 'UNINITIALIZED';
  }

  public getMotorSettings(): { stiffness: number, damping: number, gravity: number, friction: number } {
    return {
      stiffness: this.currentStiffness,
      damping: this.currentDamping,
      gravity: -9.81,
      friction: this.friction,
    };
  }

  public async nextStep(): Promise<boolean> {
    if (!this.isLoaded) return false;

    const currentStep = this.buildStep;
    if (currentStep === null || currentStep === 'A') {
      return this.createRigidBodiesAndColliders();
    } else if (currentStep === 'B') {
      return this.createJointsWithZeroMotors();
    } else if (currentStep === 'C') {
      return this.activateMotorsWithStiffnessAndDamping(80, 10);
    } else if (currentStep === 'D') {
      if (!this.mbActive) {
        return this.activateMultiBody();
      }
      return true;
    }
    return false;
  }

  public getUprightPreset(): Record<string, any> {
    const preset: Record<string, any> = {
      // arms_down_angle_deg: this.restArmAngleDeg,
    };
    this.currentTargets.forEach((val, key) => {
      preset[key] = (val as any).scalar ?? (val as any).x ?? (typeof val === 'number' ? val : 0);
    });
    return preset;
  }

  private resolveJointAlias(name: string): string {
    const JOINT_ALIASES: Record<string, string> = {
      'head_yaw': 'mixamorighead',
      'head_pitch': 'mixamorighead',
      'head_roll': 'mixamorighead',
      'neck_yaw': 'mixamorighead',
      'neck_pitch': 'mixamorighead',
      'neck_roll': 'mixamorighead',
      'torso_yaw': 'mixamorigspine2',
      'torso_pitch': 'mixamorigspine2',
      'torso_roll': 'mixamorigspine2',
      'spine_yaw': 'mixamorigspine',
      'spine_pitch': 'mixamorigspine',
      'spine1_yaw': 'mixamorigspine1',
      'spine1_pitch': 'mixamorigspine1',
      'spine2_yaw': 'mixamorigspine2',
      'spine2_pitch': 'mixamorigspine2',
      'hips_yaw': 'mixamorigspine',
      'lower_back_yaw': 'mixamorigspine',
      'upper_back_yaw': 'mixamorigspine2',
      'right_shoulder_pitch': 'mixamorigrightarm',
      'right_shoulder_roll': 'mixamorigrightarm',
      'right_shoulder_yaw': 'mixamorigrightarm',
      'right_elbow_flex': 'mixamorigrightforearm',
      'right_elbow': 'mixamorigrightforearm',
      'right_wrist_yaw': 'mixamorigrighthand',
      'right_wrist': 'mixamorigrighthand',
      'left_shoulder_pitch': 'mixamorigleftarm',
      'left_shoulder_roll': 'mixamorigleftarm',
      'left_shoulder_yaw': 'mixamorigleftarm',
      'left_elbow_flex': 'mixamorigleftforearm',
      'left_elbow': 'mixamorigleftforearm',
      'left_wrist_yaw': 'mixamoriglefthand',
      'left_wrist': 'mixamoriglefthand',
      'right_hip_pitch': 'mixamorigrightupleg',
      'right_hip_roll': 'mixamorigrightupleg',
      'right_hip_yaw': 'mixamorigrightupleg',
      'right_knee_flex': 'mixamorigrightleg',
      'right_knee': 'mixamorigrightleg',
      'right_ankle_pitch': 'mixamorigrightfoot',
      'right_ankle_roll': 'mixamorigrightfoot',
      'right_ankle': 'mixamorigrightfoot',
      'left_hip_pitch': 'mixamorigleftupleg',
      'left_hip_roll': 'mixamorigleftupleg',
      'left_hip_yaw': 'mixamorigleftupleg',
      'left_knee_flex': 'mixamorigleftleg',
      'left_knee': 'mixamorigleftleg',
      'left_ankle_pitch': 'mixamorigleftfoot',
      'left_ankle_roll': 'mixamorigleftfoot',
      'left_ankle': 'mixamorigleftfoot',
    };
    return JOINT_ALIASES[name] ?? name;
  }

  public setMotorTargets(targets: Record<string, number | number[]>): ActionApplyResult {
    const applied: string[] = [];
    const rejected: RejectedAction[] = [];

    if (this.buildStep !== 'D') {
      return { applied, rejected };
    }

    for (const [boneName, target] of Object.entries(targets)) {
      const aliasedName = this.resolveJointAlias(boneName.toLowerCase().replace(/:/g, ''));
      const canonical = aliasedName;

      if (!this.boneInfoMap.has(canonical)) {
        rejected.push({
          joint: boneName,
          reason: 'unknown_joint',
          requested: target,
        });
        continue;
      }

      let parsedTarget: any = null;
      try {
        if (Array.isArray(target)) {
          if (target.length === 4) {
            parsedTarget = { x: target[0], y: target[1], z: target[2], w: target[3], isQuaternion: true };
          } else if (target.length === 3) {
            parsedTarget = { x: target[0], y: target[1], z: target[2], isQuaternion: false };
          } else if (target.length === 2) {
            parsedTarget = { x: target[0], y: target[1], z: 0, isQuaternion: false };
          } else {
            parsedTarget = { scalar: target[0], isScalar: true };
          }
        } else if (typeof target === 'number') {
          parsedTarget = { scalar: target, isScalar: true };
        } else if (typeof target === 'object' && target !== null) {
          if ('angle' in target) {
            parsedTarget = { scalar: (target as any).angle * (Math.PI / 180), isScalar: true };
          } else if ('x' in target || 'y' in target || 'z' in target) {
            parsedTarget = { x: (target as any).x ?? 0, y: (target as any).y ?? 0, z: (target as any).z ?? 0, isQuaternion: false };
          } else {
            parsedTarget = { scalar: Number(target), isScalar: true };
          }
        } else if (typeof target === 'string') {
          const parsedNumber = parseFloat(target);
          parsedTarget = { scalar: isNaN(parsedNumber) ? 0 : parsedNumber, isScalar: true };
        }
      } catch {
        parsedTarget = { scalar: 0, isScalar: true };
      }

      if (!parsedTarget) {
        parsedTarget = { scalar: 0, isScalar: true };
      }

      const limits = this.jointLimits.get(canonical) ?? getAnatomicalLimitForBone(canonical);
      if (parsedTarget.isScalar && typeof parsedTarget.scalar === 'number') {
        const targetValue = parsedTarget.scalar;
        let finalValue = targetValue;
        if (limits && (targetValue < limits.min || targetValue > limits.max)) {
          finalValue = Math.max(limits.min, Math.min(limits.max, targetValue));
          rejected.push({
            joint: boneName,
            reason: 'exceeds_anatomical_limit',
            requested: targetValue,
            limit_min: limits.min,
            limit_max: limits.max,
          });
        }
        parsedTarget.scalar = finalValue;
      } else if (!parsedTarget.isQuaternion && typeof parsedTarget.x === 'number' && limits) {
        parsedTarget.x = Math.max(limits.min, Math.min(limits.max, parsedTarget.x));
      }

      this.currentTargets.set(canonical, parsedTarget);
      applied.push(boneName);
    }

    return { applied, rejected };
  }

  public updateMotorTargets(): void {
    if (this.buildStep !== 'D') return;

    // Apply native position control
    this.motorController.setTargets(this.currentTargets);
  }

  /**
   * Per-physics-step root balance correction (500 Hz). Must be invoked from
   * the WorldEngine `onStep` hook — NOT the 60 Hz render loop — so the balance
   * controller samples the 500 Hz plant without aliasing.
   *
   * Returns true only when the balance torque was actually applied. A false
   * return means the binder is not yet in build step 'D' (or has no capsule),
   * so callers/tests can detect a silent no-op instead of passing vacuously.
   */
  public applyBalanceStep(): boolean {
    if (this.buildStep !== 'D' || !this.capsuleBalanceEnabled) return false;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return false;

    this.motorController.applyCapsuleBalance(capsuleBodyId);
    return true;
  }

  // ── RMBS v1: reaction-mass balance ────────────────────────────────────
  /** Enable/disable the per-step reaction-mass balance (off by default). */
  public setReactionMassEnabled(enabled: boolean): void {
    this.reactionMassEnabled = enabled;
    if (enabled) {
      this.reactionMass.reset();
      this.reactionMass.resetTrimState();
      this.rmCache = null;
      this.rmbsSupportEma = null; // stale support must not survive a (re)enable
      // Shock-absorber pairing: when RMBS is on, auto-enable light damping (KP=200, KD=40)
      // for pitch stability without fighting horizontal translation. zeta ≈ 0.41 (lightly damped).
      this.motorController.setCapsuleBalanceGains(200, 40);
    } else {
      // Restore full Road-2 gains when RMBS is off
      this.motorController.setCapsuleBalanceGains(null, null);
    }
    Logger.info(`HumanoidPhysicsBinder (${this.agentId}): RMBS enabled=${enabled}`);
  }

  /**
   * Isolation-testing gate for the Road-2 capsule-balance torque. When
   * disabled, applyBalanceStep() returns false (no torque applied) — lets an
   * isolation test put the base stack (legs/pose) on its own without the root
   * capsule torque masking drift.
   */
  public setCapsuleBalanceEnabled(enabled: boolean): void {
    this.capsuleBalanceEnabled = enabled;
    Logger.info(`HumanoidPhysicsBinder (${this.agentId}): capsule balance enabled=${enabled}`);
  }

  /**
   * Pass-through: set live-tunable capsule balance gains (KP/KD overrides).
   * When RMBS is on, shock-absorber defaults (200, 40) are auto-applied.
   * Call with null/null to restore full Road-2 gains.
   */
  public setCapsuleBalanceGains(kp: number | null, kd: number | null): void {
    this.motorController.setCapsuleBalanceGains(kp, kd);
  }

  /**
   * Live-tune the RMBS params from the console (mirrors setComReflexGains).
   * Partial merge — callers only pass the fields they want to change, e.g.
   * `binder.setRmbsParams({ pursuitFraction: 1.0, maxSlewPerStep: 0.01 })`.
   * The controller reads the FULL params object each 500 Hz step, so the new
   * values take effect immediately with no reset. `resolveReactionMassIds`
   * still live-overrides only mRm/railRange on a world recompile, so tuned
   * pursuit/slew values survive rehydrate.
   */
  public setRmbsParams(partial: Partial<RmbsParams>): void {
    this.rmbsParams = { ...this.rmbsParams, ...partial };
    Logger.info(
      `HumanoidPhysicsBinder (${this.agentId}): RMBS params → pursuitFraction=${this.rmbsParams.pursuitFraction}, maxSlewPerStep=${this.rmbsParams.maxSlewPerStep}`
    );
  }

  /** Current live RMBS params (console-readable for tuning/probing). */
  public getRmbsParams(): RmbsParams {
    return { ...this.rmbsParams };
  }

  /** Current neutral-trim state for acceptance tests and console probes. */
  public getRmbsTrimState(): { trimState: 'settling' | 'active'; tiltRef: number; leanInt: number } {
    return this.reactionMass.getTrimState();
  }

  /** Explicit ACROBATIC override from the action pipeline (authored flips). */
  public setReactionMassAcrobatic(acrobatic: boolean): void {
    this.reactionMassAcrobatic = acrobatic;
  }

  /** The live RMBS controller — gates read getMode()/getStats() from here. */
  public getReactionMassController(): ReactionMassController {
    return this.reactionMass;
  }

  /** Current RMBS mode ('grounded' | 'airball' | 'acrobatic' | 'saturated'). */
  public rmbsMode(): RmbsMode {
    return this.reactionMass.getMode();
  }

  /**
   * Lazily resolve the RMBS body/joint/actuator ids against the CURRENT world.
   * Re-attached whenever world.model changes (world recompile → rehydrate),
   * so the cache can never point at a deleted MjModel.
   */
  private resolveReactionMassIds(): {
    model: any;
    rmBodyId: number;
    actLrId: number;
    actFaId: number;
    jntLrId: number;
    jntFaId: number;
  } | null {
    const world = this.physicsEngine.getWorld();
    if (!world || !world.model || !world.data) return null;
    const module = PhysicsEngine.getModule();
    if (!module) return null;

    if (this.rmCache && this.rmCache.model === world.model) {
      return this.rmCache;
    }

    const rmBodyId = module.mj_name2id(world.model, module.mjtObj.mjOBJ_BODY.value, this.prefix + 'reaction_mass');
    const actLrId = module.mj_name2id(world.model, module.mjtObj.mjOBJ_ACTUATOR.value, 'act_' + this.prefix + 'rm_slide_lr');
    const actFaId = module.mj_name2id(world.model, module.mjtObj.mjOBJ_ACTUATOR.value, 'act_' + this.prefix + 'rm_slide_fa');
    const jntLrId = module.mj_name2id(world.model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + 'rm_slide_lr');
    const jntFaId = module.mj_name2id(world.model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + 'rm_slide_fa');

    if (rmBodyId < 0 || actLrId < 0 || actFaId < 0 || jntLrId < 0 || jntFaId < 0) {
      // Legacy world without RMBS — leave the cache null so we re-probe on the next model.
      this.rmCache = null;
      return null;
    }

    // Stability pass: live-read the authoritative model values so the controller
    // params can never drift from the compiled MJCF again — the model is the
    // single source of truth. RM mass from the reaction_mass body; rail travel
    // from the LR slide joint's positive range (both rails are emitted with the
    // same ±range, so LR is the canonical source). Guards keep the defaults
    // intact if the model values are ever missing/non-finite/non-positive.
    const liveRm = world.model.body_mass?.[rmBodyId];
    if (Number.isFinite(liveRm) && liveRm > 0) {
      this.rmbsParams.mRm = liveRm;
    }
    const liveRangeMax = world.model.jnt_range?.[jntLrId * 2 + 1];
    if (Number.isFinite(liveRangeMax) && liveRangeMax > 0) {
      this.rmbsParams.railRange = liveRangeMax;
    }

    this.rmCache = { model: world.model, rmBodyId, actLrId, actFaId, jntLrId, jntFaId };
    (window as any).__SYNTHIA_RM_IDS__ = { rm: rmBodyId, cap: this.bodyManager.getCapsuleBody() };
    return this.rmCache;
  }

  /**
   * World (MuJoCo) vector → pelvis-local (MuJoCo-space math, frame-agnostic).
   * The capsule xquat is scalar-first (w,x,y,z); the inverse rotation maps a
   * world-direction back into the root_capsule frame, which is the frame the
   * two slide rails live in (RM body is an identity-mounted child).
   */
  private worldToPelvisLocal(
    vMj: { x: number; y: number; z: number },
    capQuatMj: [number, number, number, number]
  ): { x: number; y: number; z: number } {
    const q = new THREE.Quaternion(capQuatMj[1], capQuatMj[2], capQuatMj[3], capQuatMj[0]);
    const qInv = q.clone().invert();
    const v = new THREE.Vector3(vMj.x, vMj.y, vMj.z).applyQuaternion(qInv);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Upright torso axis in WORLD (MuJoCo) frame from the capsule orientation. */
  private capsuleUpWorld(capQuatMj: [number, number, number, number]): { x: number; y: number; z: number } {
    const q = new THREE.Quaternion(capQuatMj[1], capQuatMj[2], capQuatMj[3], capQuatMj[0]);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return { x: up.x, y: up.y, z: up.z };
  }

  /**
   * RMBS support center (MuJoCo frame). Robust planted detection that cannot
   * NaN out (Road-5.1): a foot is planted when (a) the contact-force registry
   * reports contact on that foot's geom, or (b) the foot body center is near
   * the floor in the Three world (translation().y <= 0.12; a swing foot is
   * ~0.25+). footSoleGapM survives only as an optional refinement when it
   * returns a finite value. Returns null only when nothing is planted.
   */
  private reactionMassSupportCenter(
    world: any,
    lFootId: number,
    rFootId: number
  ): { x: number; y: number } | null {
    const lProxy = new BodyProxy(lFootId, world.model, world.data, null, this.prefix);
    const rProxy = new BodyProxy(rFootId, world.model, world.data, null, this.prefix);
    const lT = lProxy.translation();
    const rT = rProxy.translation();

    // Per-foot geom contact (best effort): the registry is keyed by geom id.
    const registry = this.physicsEngine.getContactForceRegistry();
    const lGeom = this.bodyManager.getBoneColliderHandle('mixamorigleftfoot');
    const rGeom = this.bodyManager.getBoneColliderHandle('mixamorigrightfoot');
    const lContact = lGeom !== null && (registry.get(lGeom)?.inContact ?? false);
    const rContact = rGeom !== null && (registry.get(rGeom)?.inContact ?? false);

    // Ankle near floor: the Three-world vertical is .y (floor at y = 0).
    const lNearFloor = Number.isFinite(lT.y) && lT.y <= 0.12;
    const rNearFloor = Number.isFinite(rT.y) && rT.y <= 0.12;

    // Optional refinement: sole-gap is used ONLY when finite, so a stale or
    // NaN xpos can never poison the planted decision (Math.max(0, NaN) = NaN).
    const lGap = this.footSoleGapM(world, lFootId);
    const rGap = this.footSoleGapM(world, rFootId);
    const lGapOk = Number.isFinite(lGap) && lGap <= 0.05;
    const rGapOk = Number.isFinite(rGap) && rGap <= 0.05;

    const lPlanted = lContact || lNearFloor || lGapOk;
    const rPlanted = rContact || rNearFloor || rGapOk;
    if (!lPlanted && !rPlanted) return null;

    // Support center in the MuJoCo frame: worldToMuJoCo ([x, -z, y]) of the
    // foot translations recovers the exact MuJoCo xpos XY for the planted feet.
    // LIVE-RIG CALIBRATION (DO NOT REMOVE): offset by -0.060 m along MuJoCo Y.
    // This is empirically tuned foot-center calibration for the live rig geometry.
    // Removing it causes rm_slide_fa to rail saturated at +0.117 (rearward),
    // producing a permanent backward pitch bias and backward drift during forward
    // walking. With the offset: rm_slide_fa oscillates -0.08...-0.14 (healthy).
    const lMj = PhysicsEngine.worldToMuJoCo({ x: lT.x, y: lT.y, z: lT.z });
    const rMj = PhysicsEngine.worldToMuJoCo({ x: rT.x, y: rT.y, z: rT.z });
    lMj[1] -= 0.060;
    rMj[1] -= 0.060;
    const raw = lPlanted && rPlanted
      ? { x: (lMj[0] + rMj[0]) / 2, y: (lMj[1] + rMj[1]) / 2 }
      : lPlanted
        ? { x: lMj[0], y: lMj[1] }
        : { x: rMj[0], y: rMj[1] };

    // Stability pass: EMA-filter (α=0.3) so a foot shifting (double→single
    // support, or a planted foot sliding) never jumps the RMBS target. The
    // filter is only fed FINITE values; nothing planted returns null above and
    // the EMA does NOT decay — it resumes from the filtered value on the next
    // valid sample.
    if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
      return raw;
    }
    if (this.rmbsSupportEma === null) {
      this.rmbsSupportEma = { x: raw.x, y: raw.y };
      return { x: raw.x, y: raw.y };
    }
    this.rmbsSupportEma = {
      x: 0.3 * raw.x + 0.7 * this.rmbsSupportEma.x,
      y: 0.3 * raw.y + 0.7 * this.rmbsSupportEma.y,
    };
    return { x: this.rmbsSupportEma.x, y: this.rmbsSupportEma.y };
  }

  /**
   * Per-physics-step (500 Hz) reaction-mass balance.
   *
   * Guards: buildStep 'D', RMBS enabled, RMBS ids resolvable. Reads
   * data.subtree_com/subtree_linvel (total COM incl. RM), the RM body
   * xpos/cvel, the planted-feet support center, and the capsule xquat;
   * rotates everything into the pelvis-local horizontal frame; calls
   * ReactionMassController.computeStep; writes data.ctrl at the two RM
   * actuator ids DIRECTLY (never via MotorController — the 60 Hz pose flush
   * does not own these actuators, CRITICAL RULE 1).
   */
  public applyReactionMassStep(dtS: number = 0.002): boolean {
    if (this.buildStep !== 'D' || !this.reactionMassEnabled) return false;

    const world = this.physicsEngine.getWorld();
    if (!world || !world.model || !world.data) return false;
    const module = PhysicsEngine.getModule();
    if (!module) return false;
    const capId = this.bodyManager.getCapsuleBody();
    if (capId === null || capId < 0) return false;

    const ids = this.resolveReactionMassIds();
    if (!ids) return false;

    const data = world.data;
    const model = world.model;

    const capQuatMj: [number, number, number, number] = [
      data.xquat[capId * 4],
      data.xquat[capId * 4 + 1],
      data.xquat[capId * 4 + 2],
      data.xquat[capId * 4 + 3],
    ];
    const capXpos = {
      x: data.xpos[capId * 3],
      y: data.xpos[capId * 3 + 1],
      z: data.xpos[capId * 3 + 2],
    };

    // Total COM (incl. RM) from MuJoCo's built-in subtree quantities (MuJoCo frame).
    // IMPORTANT: subtree_com[capId] is the CAPSULE's subtree (humanoid + RM only);
    // subtree_com[0] is the world subtree and would pull in env/floor masses.
    const cTotalWorld = {
      x: data.subtree_com[capId * 3] - capXpos.x,
      y: data.subtree_com[capId * 3 + 1] - capXpos.y,
      z: data.subtree_com[capId * 3 + 2] - capXpos.z,
    };
    const vTotalWorld = {
      x: data.subtree_linvel[capId * 3],
      y: data.subtree_linvel[capId * 3 + 1],
      z: data.subtree_linvel[capId * 3 + 2],
    };

    // RM body state (MuJoCo frame).
    const rmBodyId = ids.rmBodyId;
    const mRm = model.body_mass[rmBodyId];
    const pRmWorld = {
      x: data.xpos[rmBodyId * 3] - capXpos.x,
      y: data.xpos[rmBodyId * 3 + 1] - capXpos.y,
      z: data.xpos[rmBodyId * 3 + 2] - capXpos.z,
    };
    const vRmWorld = {
      x: data.cvel[rmBodyId * 6 + 3],
      y: data.cvel[rmBodyId * 6 + 4],
      z: data.cvel[rmBodyId * 6 + 5],
    };

    // Total agent mass (humanoid + RM only): prefix-filtered body_mass sum —
    // the same scan refreshReflexBodyCache already proves reliable. Excludes
    // env_slot_/floor/world and any OTHER agent's bodies.
    const mTotal = this.reactionMassTotalM(model, module);
    if (mTotal <= 0) return false;

    // Robot-only COM velocity (the capture lead must NOT include RM motion).
    const mRobot = Math.max(0, mTotal - mRm);
    const vRobotWorld = mRobot > 0
      ? {
          x: (mTotal * vTotalWorld.x - mRm * vRmWorld.x) / mRobot,
          y: (mTotal * vTotalWorld.y - mRm * vRmWorld.y) / mRobot,
          z: (mTotal * vTotalWorld.z - mRm * vRmWorld.z) / mRobot,
        }
      : { x: 0, y: 0, z: 0 };

    // Feet for the support center (Road-4 ground truth).
    const feetMap = this.bodyManager.getRigidBodiesMap();
    const lFootId = feetMap.get('mixamorigleftfoot');
    const rFootId = feetMap.get('mixamorigrightfoot');
    const supportWorld = (lFootId !== undefined && rFootId !== undefined)
      ? this.reactionMassSupportCenter(world, lFootId, rFootId)
      : null;

    // Rotate world-frame quantities into the pelvis-local frame (CRITICAL RULE 2).
    const cTotalLocal = this.worldToPelvisLocal(cTotalWorld, capQuatMj);
    const pRmLocal = this.worldToPelvisLocal(pRmWorld, capQuatMj);
    const vRobotLocal = this.worldToPelvisLocal(vRobotWorld, capQuatMj);
    const supportLocal = supportWorld
      ? this.worldToPelvisLocal(
          { x: supportWorld.x - capXpos.x, y: supportWorld.y - capXpos.y, z: 0 },
          capQuatMj
        )
      : { x: 0, y: 0, z: 0 };

    // Torso angular velocity in the pelvis frame (x = roll rate, y = pitch rate).
    const angVelWorld = {
      x: data.cvel[capId * 6],
      y: data.cvel[capId * 6 + 1],
      z: data.cvel[capId * 6 + 2],
    };
    const angVelLocal = this.worldToPelvisLocal(angVelWorld, capQuatMj);

    // Groundedness for the mode machine: sole planted OR capsule in contact.
    const hasContact = supportWorld !== null || this._isGrounded;

    // Direction-aware RMBS velocity:
    // worldToPelvisLocal rotates into the pelvis frame where local Y = pelvis forward axis.
    // During forward walking, vRobotLocal.y is POSITIVE (pelvis-local forward).
    // During backward walking, vRobotLocal.y is NEGATIVE (pelvis-local backward).
    // The capture-point formula: target.y = support.y + kCap × v × lead
    // With kCap = -0.3: forward walk → kCap × (+v) = negative → mass goes backward = CORRECT.
    //                   backward walk → kCap × (-v) = positive → mass goes forward = WRONG.
    // So the original code was actually correct for FORWARD, broken for BACKWARD.
    // But backward empirically worked... this means pelvis-local Y sign may be opposite.
    // Pass vRobotLocal.y as-is and let kCap handle it; do NOT negate.
    const cmd = this.reactionMass.computeStep({
      cTotal: { x: cTotalLocal.x, y: cTotalLocal.y },
      pRm: { x: pRmLocal.x, y: pRmLocal.y },
      vComRobot: { x: vRobotLocal.x, y: vRobotLocal.y },
      torsoAngVelLocal: { x: angVelLocal.x, y: angVelLocal.y },
      mTotal,
      mRm,
      // Absolute COM height above the floor (MuJoCo Z-up: floor at z=0).
      comHeight: data.subtree_com[capId * 3 + 2],
      supportCenter: { x: supportLocal.x, y: supportLocal.y },
      torsoUpWorld: this.capsuleUpWorld(capQuatMj),
      hasContact,
      acrobaticFlag: this.reactionMassAcrobatic,
      dt: dtS,
      params: this.rmbsParams,
    });

    const tiltFa = Number.isFinite(data.xmat[capId * 9 + 7]) ? -data.xmat[capId * 9 + 7] : 0;
    const trimState = this.reactionMass.getTrimState();
    const groundedTimeS = this.rmbsTelemetryStep * dtS;
    const shouldCapture = trimState.trimState === 'settling' && groundedTimeS <= this.rmbsParams.trimCaptureS;

    const trimmedCmd = { ...cmd };
    if (trimState.trimState === 'active') {
      trimmedCmd.ctrlFa = cmd.ctrlFa - trimState.leanInt;
    }
    if (shouldCapture) {
      const nextTiltRef = Number.isFinite(tiltFa) ? tiltFa : 0;
      this.reactionMass.setTrimState('active', nextTiltRef, trimState.leanInt);
    } else if (trimState.trimState === 'settling') {
      this.reactionMass.setTrimState('settling', trimState.tiltRef, trimState.leanInt);
    }

    // Write the RM actuator targets directly (absolute slide qpos).
    data.ctrl[ids.actLrId] = trimmedCmd.ctrlLr;
    data.ctrl[ids.actFaId] = trimmedCmd.ctrlFa;

    // ── RMBS telemetry ring (Road-5.1, diagnostic only) ──────────────────
    // Counter advances ONLY on successful RMBS frames, so the ring stays a
    // clean ~10 Hz stream while RMBS is active and never grows when disabled.
    this.rmbsTelemetryStep += 1;
    if (this.rmbsTelemetryStep % RMBS_TELEM_EVERY_STEPS === 0) {
      // Capsule XY (MuJoCo frame) is the fallback support when neither foot is
      // planted or the feet are unresolved — keeps the ring live every sample.
      this.recordRmbsTelemetry(cmd, capId, data, supportWorld, {
        x: data.xpos[capId * 3],
        y: data.xpos[capId * 3 + 1],
      });
      // C1/C2 console-sync probe (stability-pass gate): one decimated stats
      // row per 10 Hz sample so the browser console exposes mode/saturation/
      // ctrl. Diagnostic only — never changes behavior.
      const s = this.reactionMass.getStats();
      console.log(
        `[RMBS_STATS ${this.agentId}]`,
        JSON.stringify(s),
        `mode=${cmd.mode}`,
        `supportNull=${(!supportWorld).toString()}`
      );
    }

    this.lastRmbsStats = this.reactionMass.getStats();
    return true;
  }

  /**
   * Decimate one successful RMBS frame into the 10 Hz console-readable ring on
   * `window.__SYNTHIA_RMBS_TELEM__`. Pure and non-throwing; only invoked on the
   * successful 500 Hz path where data/capId are already validated. Records
   * EVERY decimated sample — even when supportWorld is null (airborne or
   * unresolved feet) — using the capsule XY (MuJoCo frame) as the support
   * proxy, so the stream can never go silent. Every pushed field is forced
   * finite (non-finite values fall back to 0).
   */
  private recordRmbsTelemetry(
    cmd: RmbsCommand,
    capId: number,
    data: any,
    supportWorld: { x: number; y: number } | null,
    fallbackSupport: { x: number; y: number }
  ): void {
    let ring = (window as any).__SYNTHIA_RMBS_TELEM__;
    if (!Array.isArray(ring)) {
      ring = [];
      (window as any).__SYNTHIA_RMBS_TELEM__ = ring;
    }

    // Support center (MuJoCo frame: +X = LR rail, +Y = FA/forward): the
    // planted-feet mean when available, otherwise the capsule XY fallback.
    const hasSupport = supportWorld !== null && Number.isFinite(supportWorld.x) && Number.isFinite(supportWorld.y);
    const supLr = hasSupport ? supportWorld.x : (Number.isFinite(fallbackSupport.x) ? fallbackSupport.x : 0);
    const supFa = hasSupport ? supportWorld.y : (Number.isFinite(fallbackSupport.y) ? fallbackSupport.y : 0);

    const comLr = Number.isFinite(data.subtree_com[capId * 3]) ? data.subtree_com[capId * 3] : 0;
    const comFa = Number.isFinite(data.subtree_com[capId * 3 + 1]) ? data.subtree_com[capId * 3 + 1] : 0;

    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    if (ring.length >= RMBS_TELEM_CAP) ring.shift();
    ring.push({
      t,
      mode: cmd.mode,
      supportNull: !hasSupport,
      eFa: Number.isFinite(comFa - supFa) ? comFa - supFa : 0,
      eLr: Number.isFinite(comLr - supLr) ? comLr - supLr : 0,
      ctrlFa: Number.isFinite(cmd.ctrlFa) ? cmd.ctrlFa : 0,
      ctrlLr: Number.isFinite(cmd.ctrlLr) ? cmd.ctrlLr : 0,
    });
  }

  /**
   * Total agent mass (humanoid + RM only) — prefix-filtered body_mass sum.
   * Excludes env_slot_/floor/world and every OTHER agent's bodies, so the
   * RMBS total is correct in multi-agent worlds. Same scan refreshReflexBodyCache
   * proves reliable.
   */
  private reactionMassTotalM(model: any, module: any): number {
    if (!model || !module) return 0;
    let total = 0;
    for (let bi = 0; bi < model.nbody; bi++) {
      const m = model.body_mass[bi];
      if (m <= 0) continue;
      const name = module.mj_id2name(model, module.mjtObj.mjOBJ_BODY.value, bi) ?? '';
      if (name.startsWith('env_slot_') || name === 'floor' || name === 'world') continue;
      if (this.prefix && !name.startsWith(this.prefix)) continue;
      total += m;
    }
    return total;
  }

  public setLerpSpeed(speed: number): void {
    this._lerpSpeed = Math.max(0.01, Math.min(1.0, speed));
    void this._lerpSpeed;
  }

  public executeProgramSequence(programs: string[]): void {
    this.lastAiCommandTime = Date.now();
    this.airborneTimer = 0;
    this.groundingMagnetStrength = 0.0;

    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return;

    for (const program of programs) {
      const name = program.toLowerCase().replace(/[_\s]/g, '');

      if (name.includes('stand') || name.includes('upright') || name.includes('recover') || name.includes('reorient') || name.includes('reset')) {
        const capsuleBody = this.getCapsuleBody();
        let x = 0;
        let z = 0;
        if (capsuleBody && capsuleBody.isValid()) {
          const t = capsuleBody.translation();
          x = t.x;
          z = t.z;
        }
        this.resetPose({ x, y: 0, z });
      } else if (name.includes('jump')) {
        this.executeJump(6.0);
      } else {
        Logger.warn(`HumanoidPhysicsBinder: Unknown program sequence "${program}" ignored. Use joint_overrides or sequence timeline for movement, or "stand"/"reset_pose"/"jump" for special actions.`);
      }
    }
  }

  public resetPose(spawnPoint: { x: number; y: number; z: number }): void {
    this.setGaitActive(false);
    this.setCapsulePosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    this.resetToBindPose();
    this.previousFootPositions.clear();
    // A teleport/reset must not carry a stale EMA support across the world.
    this.rmbsSupportEma = null;

    // Apply a temporary stiffness boost to stabilize the humanoid after teleport.
    // Without this, gravity and contact forces can kick a leg loose before the PD
    // motors converge to the zero-angle bind pose.  The gain scale decays back to
    // 1.0 over ~1 second via the motor ramp in the next animation frames.
    this.setStiffnessScale(3.0);
    setTimeout(() => this.setStiffnessScale(1.0), 1000);
  }

  public isOutOfWorldBounds(): boolean {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return false;

    const world = this.physicsEngine.getWorld();
    const posMj = [
      world.data.xpos[capsuleBodyId * 3],
      world.data.xpos[capsuleBodyId * 3 + 1],
      world.data.xpos[capsuleBodyId * 3 + 2]
    ];
    const pos = PhysicsEngine.mujocoToWorld(posMj as any);
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    return dist > WORLD_BOUNDARY_RADIUS || Math.abs(pos.y) > WORLD_BOUNDARY_RADIUS;
  }

  public resetToBindPose(): void {
    this.setGaitActive(false);
    this.currentTargets.clear();
    this.motorController.resetRamp();

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const qpos = data.qpos;
    const qvel = data.qvel;
    const module = PhysicsEngine.getModule();
    if (!module) return;

    const armsDownAngle = this.restArmAngleDeg * (Math.PI / 180);

    // Reset all hinge qpos values to 0 (or armsDownAngle for arm roll)
    const joints = this.bodyManager.getRigidBodiesMap();
    for (const [boneName] of joints) {
      const hasYaw = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_yaw') >= 0;
      const hasPitch = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_pitch') >= 0;
      const hasRoll = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_roll') >= 0;

      if (hasYaw) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_yaw');
        qpos[model.jnt_qposadr[jntId]] = 0;
        qvel[model.jnt_dofadr[jntId]] = 0;
      }
      if (hasPitch) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_pitch');
        let initialPitch = 0;
        if (boneName === 'mixamorigleftarm' || boneName === 'mixamorigrightarm') {
          initialPitch = armsDownAngle;
        }
        qpos[model.jnt_qposadr[jntId]] = initialPitch;
        qvel[model.jnt_dofadr[jntId]] = 0;
      }
      if (hasRoll) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, this.prefix + boneName + '_roll');
        qpos[model.jnt_qposadr[jntId]] = 0;
        qvel[model.jnt_dofadr[jntId]] = 0;
      }
    }

    // Arm targets: arms down by side at rest (pitch / X = armsDownAngle for both arms)
    this.currentTargets.set('mixamorigleftarm', { x: armsDownAngle, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightarm', { x: armsDownAngle, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightforearm', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigleftforearm', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightshoulder', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigleftshoulder', { x: 0, y: 0, z: 0, isQuaternion: false });
    // Spine: neutral target in bind pose
    this.currentTargets.set('mixamorigspine', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigspine1', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigspine2', { x: 0, y: 0, z: 0, isQuaternion: false });
    // Hips: neutral target in bind pose. Explicitly zero both hip roll
    // qpos/qvel as a safety net — a lingering non-zero roll here manifests as
    // a leg drifting backward right after spawn.
    const leftHipRollJoint = this.prefix + 'mixamorigleftupleg_roll';
    const leftHipRollId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, leftHipRollJoint);
    if (leftHipRollId >= 0) {
      qpos[model.jnt_qposadr[leftHipRollId]] = 0;
      qvel[model.jnt_dofadr[leftHipRollId]] = 0;
    }
    const rightHipRollJoint = this.prefix + 'mixamorigrightupleg_roll';
    const rightHipRollId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, rightHipRollJoint);
    if (rightHipRollId >= 0) {
      qpos[model.jnt_qposadr[rightHipRollId]] = 0;
      qvel[model.jnt_dofadr[rightHipRollId]] = 0;
    }
    this.currentTargets.set('mixamorigleftupleg', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightupleg', { x: 0, y: 0, z: 0, isQuaternion: false });
    // Knees: target = 0 (straight leg)
    this.currentTargets.set('mixamorigleftleg', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightleg', { x: 0, y: 0, z: 0, isQuaternion: false });
    // Ankles: neutral target in bind pose
    this.currentTargets.set('mixamorigleftfoot', { x: 0, y: 0, z: 0, isQuaternion: false });
    this.currentTargets.set('mixamorigrightfoot', { x: 0, y: 0, z: 0, isQuaternion: false });
  }

  public async adjustMotors(stiffness: number, damping: number): Promise<boolean> {
    this.currentStiffness = stiffness;
    this.currentDamping = damping;
    return true;
  }

  /**
   * Multiplies the active servo gains without rewriting base gains. Used for the
   * brief "stiffness lock" after spawn so contact forces don't kick a leg loose
   * before the pose is fully settled. Pass 1.0 to restore normal stiffness.
   */
  public setStiffnessScale(scale: number): void {
    this.motorController.setGainScale(scale, 1.0);
  }

  public getModelRoot(): THREE.Group | null {
    return this.modelRoot;
  }

  public getCapsuleBody(): any {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    if (capsuleBodyId === null || capsuleBodyId < 0) return null;
    const world = this.physicsEngine.getWorld();
    return new BodyProxy(capsuleBodyId, world.model, world.data, PhysicsEngine.getModule());
  }

  public getDiagnostics(): Record<string, any> {
    const capsuleBodyId = this.bodyManager.getCapsuleBody();
    let capsulePos = null;
    if (capsuleBodyId !== null && capsuleBodyId >= 0) {
      const world = this.physicsEngine.getWorld();
      const proxy = new BodyProxy(capsuleBodyId, world.model, world.data, null);
      const t = proxy.translation();
      capsulePos = [t.x.toFixed(3), t.y.toFixed(3), t.z.toFixed(3)];
    }

    return {
      buildStep: this.buildStep,
      isLoaded: this.isLoaded,
      boneCount: this.boneInfoMap.size,
      hasCapsuleBody: capsuleBodyId !== null,
      capsulePosition: capsulePos,
      modelHeight: this.modelHeight,
      capsuleRadius: this.capsuleRadius,
      capsuleCenterY: this.capsuleCenterY,
      hipToFootDistance: this.hipToFootDistance,
      currentStiffness: this.currentStiffness,
      currentDamping: this.currentDamping,
      gravity: -9.81,
      friction: this.friction,
      mbActive: this.mbActive,
      multiBodyBoneCount: this.bodyManager.getRigidBodiesMap().size,
      multiBodyMotorJoints: this.motorController.getJointCount(),
    };
  }

  public cleanup(): void {
    this.bodyManager.deactivate();
    this.observationBuilder.clear();
    this.avatarSynchronizer.clear();

    // Reset floor geom cache
    this._floorGeomId = -1;

    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      this.modelRoot.traverse((child) => {
        if ((child as any).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(m => m.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        }
      });
      this.modelRoot = null;
    }

    this.debugSpheres.forEach((sphere) => {
      this.scene.remove(sphere);
      if (sphere.geometry) sphere.geometry.dispose();
      if (sphere.material) (sphere.material as THREE.Material).dispose();
    });
    this.debugSpheres.clear();

    this.boneInfoMap.clear();
    this.bindPoseQuaternions.clear();
    this.skeleton = null;
    this.skinnedMesh = null;
    this.isLoaded = false;
    this.buildStep = null;
    this.mbActive = false;
  }
}
