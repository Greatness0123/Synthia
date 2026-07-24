import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine';
import { generateHumanoidMJCF, normalizeBoneName } from './MJCFHumanoidTemplate';
import { logger as Logger } from '../../utils/logger';

/**
 * BodyManager maps visual THREE.js bones to MuJoCo physics bodies, geoms, and actuators.
 * Ensures that all queries strip namespaces/colons and use standardized camelCase keys.
 */
export class BodyManager {
  private physicsEngine: PhysicsEngine;
  private modelRoot: THREE.Group | null = null;
  private capsuleCenterY: number = 0;
  private _boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }> | null = null;

  private bodyMap: Map<string, number> = new Map(); // boneName -> bodyId
  private geomMap: Map<string, number> = new Map(); // boneName -> geomId
  private actuatorMap: Map<string, number[]> = new Map(); // boneName -> actuatorIds
  private capsuleBodyId: number | null = null;

  private pristineBaseMjcfXml: string = '';
  private currentBaseMjcfXml: string = '';

  public isActive: boolean = false;

  constructor(physicsEngine: PhysicsEngine) {
    this.physicsEngine = physicsEngine;
  }

  public getPristineBaseMjcfXml(): string {
    return this.pristineBaseMjcfXml;
  }

  public getCurrentBaseMjcfXml(): string {
    return this.currentBaseMjcfXml;
  }

  public setCurrentBaseMjcfXml(xml: string): void {
    this.currentBaseMjcfXml = xml;
  }

  /**
   * Generates procedural humanoid MJCF, compiles it into the MuJoCo WASM heap,
   * and maps all bones recursively to their matching body/geom/actuator IDs.
   */
  public async activate(
    boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>,
    _skeleton: THREE.Skeleton,
    _capsuleBody: any,
    capsuleCenterY: number,
    modelRoot: THREE.Group
  ): Promise<boolean> {
    if (this.isActive) return true;

    this.physicsEngine.setMutating(true);

    try {
      this.modelRoot = modelRoot;
      this.capsuleCenterY = capsuleCenterY;
      this._boneInfoMap = boneInfoMap;

      this.deactivate();

      const mjcfXml = generateHumanoidMJCF(boneInfoMap, _skeleton, capsuleCenterY, modelRoot);
      this.pristineBaseMjcfXml = mjcfXml;
      this.currentBaseMjcfXml = mjcfXml;

      this.physicsEngine.loadMJCFModel(mjcfXml);
      this.physicsEngine.setReady(true);

      const world = this.physicsEngine.getWorld();
      const model = world.model;
      const module = PhysicsEngine.getModule();
      if (!module) {
        throw new Error('BodyManager: MuJoCo WASM module not initialized');
      }

      this.bodyMap.clear();
      this.geomMap.clear();

      // Map root capsule body and geom
      const rootBodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, 'root_capsule');
      if (rootBodyId >= 0) {
        this.capsuleBodyId = rootBodyId;
        this.bodyMap.set('root_capsule', rootBodyId);
      }

      const rootGeomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'root_capsule_geom');
      if (rootGeomId >= 0) {
        this.geomMap.set('root_capsule', rootGeomId);
      }

      // Map tracked bones using camelCase normalized names (Correction #15)
      for (const boneName of boneInfoMap.keys()) {
        const normalized = normalizeBoneName(boneName);

        const bodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, normalized);
        if (bodyId >= 0) {
          this.bodyMap.set(normalized, bodyId);
        }

        const geomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, normalized + '_geom');
        if (geomId >= 0) {
          this.geomMap.set(normalized, geomId);
        }
      }

      // Map actuator IDs
      this.actuatorMap.clear();
      for (const boneName of boneInfoMap.keys()) {
        const normalized = normalizeBoneName(boneName);
        const ids: number[] = [];
        const suffixes = ['_yaw', '_pitch', '_roll'];
        for (const suffix of suffixes) {
          const actName = `act_${normalized}${suffix}`;
          const actId = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, actName);
          if (actId >= 0) {
            ids.push(actId);
          }
        }
        if (ids.length > 0) {
          this.actuatorMap.set(normalized, ids);
        }
      }

      this.isActive = true;
      Logger.info(`BodyManager: Activated. Tracked ${this.bodyMap.size} body IDs, ${this.geomMap.size} geom IDs, and ${this.actuatorMap.size} actuator bones.`);
      return true;
    } catch (error) {
      Logger.error('BodyManager: Activation failed', error);
      this.deactivate();
      return false;
    } finally {
      this.physicsEngine.setMutating(false);
    }
  }

  public getActuatorMap(): Map<string, number[]> {
    return this.actuatorMap;
  }

  public deactivate(): void {
    if (!this.isActive) return;
    this.physicsEngine.setMutating(true);
    try {
      this.bodyMap.clear();
      this.geomMap.clear();
      this.actuatorMap.clear();
      this.capsuleBodyId = null;
      this.modelRoot = null;
      this._boneInfoMap = null;
      this.isActive = false;
      Logger.info('BodyManager: Deactivated');
    } finally {
      this.physicsEngine.setMutating(false);
    }
  }

  public getRigidBodiesMap(): Map<string, number> {
    return this.bodyMap;
  }

  public getCapsuleBody(): number | null {
    return this.capsuleBodyId;
  }

  public getBoneColliderHandle(boneName: string): number | null {
    const normalized = normalizeBoneName(boneName);
    return this.geomMap.get(normalized) ?? null;
  }

  /**
   * Updates qpos coordinates and orientation of root freejoint and all nested joints
   * to align perfectly with Three.js bone orientations.
   */
  public syncRigidBodiesFromBones(
    boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>
  ): void {
    if (!this.isActive || !this.modelRoot) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const module = PhysicsEngine.getModule();
    if (!module) return;

    const qpos = this.physicsEngine.qpos;
    const qvel = this.physicsEngine.qvel;

    this.modelRoot.updateMatrixWorld(true);
    const offsetLocal = new THREE.Vector3(0, this.capsuleCenterY, 0);
    const offsetWorld = offsetLocal.clone().applyQuaternion(this.modelRoot.quaternion);
    const capsulePosThree = new THREE.Vector3().copy(this.modelRoot.position).add(offsetWorld);

    const capsulePosMj = PhysicsEngine.worldToMuJoCo(capsulePosThree);
    const capsuleQuatMj = PhysicsEngine.threeQuatToMuJoCo(this.modelRoot.quaternion);

    const rootJntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, 'root_freejoint');
    if (rootJntId >= 0) {
      const qposadr = model.jnt_qposadr[rootJntId];
      const qveladr = model.jnt_dofadr[rootJntId];

      qpos[qposadr] = capsulePosMj[0];
      qpos[qposadr + 1] = capsulePosMj[1];
      qpos[qposadr + 2] = capsulePosMj[2];

      qpos[qposadr + 3] = capsuleQuatMj[0];
      qpos[qposadr + 4] = capsuleQuatMj[1];
      qpos[qposadr + 5] = capsuleQuatMj[2];
      qpos[qposadr + 6] = capsuleQuatMj[3];

      for (let i = 0; i < 6; i++) {
        qvel[qveladr + i] = 0;
      }
    }

    const CAPSULE_ATTACH_BONES = new Set(['mixamorigSpine', 'mixamorigLeftUpLeg', 'mixamorigRightUpLeg']);

    for (const [boneName, info] of boneInfoMap) {
      const normalized = normalizeBoneName(boneName);
      const bone = info.bone;

      const hasYaw = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_yaw') >= 0;
      const hasPitch = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_pitch') >= 0;
      const hasRoll = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_roll') >= 0;

      if (!hasYaw && !hasPitch && !hasRoll) continue;

      let qRel: THREE.Quaternion;
      if (CAPSULE_ATTACH_BONES.has(normalized)) {
        const boneWorldQuat = new THREE.Quaternion();
        bone.getWorldQuaternion(boneWorldQuat);
        const mjQuatArr = PhysicsEngine.threeQuatToMuJoCo(boneWorldQuat);
        qRel = new THREE.Quaternion(mjQuatArr[1], mjQuatArr[2], mjQuatArr[3], mjQuatArr[0]);
      } else {
        const parent = bone.parent as THREE.Bone;
        if (parent) {
          const parentWorldQuat = new THREE.Quaternion();
          const childWorldQuat = new THREE.Quaternion();
          parent.getWorldQuaternion(parentWorldQuat);
          bone.getWorldQuaternion(childWorldQuat);

          const pQuatMjArr = PhysicsEngine.threeQuatToMuJoCo(parentWorldQuat);
          const cQuatMjArr = PhysicsEngine.threeQuatToMuJoCo(childWorldQuat);

          const qP = new THREE.Quaternion(pQuatMjArr[1], pQuatMjArr[2], pQuatMjArr[3], pQuatMjArr[0]);
          const qC = new THREE.Quaternion(cQuatMjArr[1], cQuatMjArr[2], cQuatMjArr[3], cQuatMjArr[0]);

          qRel = qP.clone().invert().multiply(qC);
        } else {
          qRel = bone.quaternion.clone();
        }
      }

      const euler = new THREE.Euler().setFromQuaternion(qRel, 'ZXY');

      if (hasYaw) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_yaw');
        if (jntId >= 0) {
          qpos[model.jnt_qposadr[jntId]] = euler.z;
          qvel[model.jnt_dofadr[jntId]] = 0;
        }
      }
      if (hasPitch) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_pitch');
        if (jntId >= 0) {
          qpos[model.jnt_qposadr[jntId]] = euler.x;
          qvel[model.jnt_dofadr[jntId]] = 0;
        }
      }
      if (hasRoll) {
        const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, normalized + '_roll');
        if (jntId >= 0) {
          qpos[model.jnt_qposadr[jntId]] = euler.y;
          qvel[model.jnt_dofadr[jntId]] = 0;
        }
      }
    }
  }
}
