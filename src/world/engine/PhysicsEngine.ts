import mujoco, { MainModule, MjModel, MjData, MjContact } from '@mujoco/mujoco';
import * as THREE from 'three';
import { logger as Logger } from '../../utils/logger';

export interface ColliderContactState {
  inContact: boolean;
  impulse_magnitude: number;
  contact_normal: [number, number, number];
  max_force_magnitude: number;
  lastUpdate: number;
}

export interface MuJoCoContactForceData {
  collider1: number;
  collider2: number;
  impulse_magnitude: number;
  contact_normal: [number, number, number];
  max_force_magnitude: number;
  started: boolean;
  lastUpdate: number;
}

/**
 * SYNTHIA MuJoCo Physics Engine Integration
 * This is a completely rewritten, correct-from-scratch wrapper over the @mujoco/mujoco WASM engine.
 *
 * Implements:
 * - Proper frame rotations and translations (Corrections #4, #5)
 * - Safe WASM memory getters for qpos, qvel, and ctrl that re-acquire live views on every call (Correction #9)
 * - Correct contact resolution utilizing DoubleBuffer to query mj_contactForce without leaks (Correction #17)
 * - Support for velocity-clamping registered bodies
 */
export class PhysicsEngine {
  private static mujocoInitPromise: Promise<MainModule> | null = null;
  private static mujocoModule: MainModule | null = null;

  private model: MjModel | null = null;
  private data: MjData | null = null;
  private initialized = false;
  public isReady = false;
  public isStepping = false;
  private isMutatingWorld = false;
  private isPhysicsBroken = false;
  private lastLoadedXml = '';

  private contactForceRegistry: Map<number, ColliderContactState> = new Map();
  private velocityClampBodies: Set<number> = new Set();
  private stepCount = 0;

  /**
   * Converts Three.js coordinates (X, Y, Z) to MuJoCo coordinates (X, -Z, Y).
   * Up stays up (Three.js Y is up, MuJoCo Z is up), but axes are properly rotated (det = +1).
   * (Correction #5)
   */
  public static worldToMuJoCo(v: { x: number; y: number; z: number }): [number, number, number] {
    return [v.x, -v.z, v.y];
  }

  /**
   * Converts MuJoCo coordinates (X, Y, Z) to Three.js coordinates.
   * Inverse of worldToMuJoCo.
   * (Correction #5)
   */
  public static mujocoToWorld(p: [number, number, number] | Float64Array): { x: number; y: number; z: number } {
    return {
      x: p[0],
      y: p[2],
      z: -p[1]
    };
  }

  /**
   * Converts Three.js quaternions to MuJoCo scalar-first quaternions.
   * Applied via conjugation: q_mujoco = Q_align * q_three * Q_align⁻¹,
   * where Q_align is +90 deg about X.
   * Accounts for BOTH axis remap and component order (THREE.js is scalar-last x,y,z,w; MuJoCo is scalar-first w,x,y,z).
   * (Correction #4)
   */
  public static threeQuatToMuJoCo(q: { x: number; y: number; z: number; w: number }): [number, number, number, number] {
    const threeQ = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    // +90 deg about X
    const qAlign = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const qAlignInv = qAlign.clone().invert();
    const qTransformed = qAlign.clone().multiply(threeQ).multiply(qAlignInv);
    return [qTransformed.w, qTransformed.x, qTransformed.y, qTransformed.z];
  }

  /**
   * Converts MuJoCo scalar-first quaternions back to standard Three.js quaternions.
   * Inverse of threeQuatToMuJoCo.
   * (Correction #4)
   */
  public static mujocoQuatToThree(qWxyz: [number, number, number, number] | Float64Array): { x: number; y: number; z: number; w: number } {
    const qMj = new THREE.Quaternion(qWxyz[1], qWxyz[2], qWxyz[3], qWxyz[0]);
    // +90 deg about X
    const qAlign = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const qAlignInv = qAlign.clone().invert();
    const qThree = qAlignInv.clone().multiply(qMj).multiply(qAlign);
    return {
      x: qThree.x,
      y: qThree.y,
      z: qThree.z,
      w: qThree.w
    };
  }

  /**
   * Ensures that the @mujoco/mujoco package is initialized from the single-threaded build.
   * Imports via standard ESM, writes to virtual FS, loads without hand-written Emscripten loader.
   * (Correction #16)
   */
  private static async ensureMuJoCoInitialized(): Promise<MainModule> {
    if (PhysicsEngine.mujocoModule) return PhysicsEngine.mujocoModule;

    if (!PhysicsEngine.mujocoInitPromise) {
      PhysicsEngine.mujocoInitPromise = (async () => {
        const module = await mujoco({
          locateFile: (filename: string) => {
            if (filename.endsWith('.wasm')) {
              // Under Node/Jest environment, resolve local file. In browser, use /mujoco/mujoco.wasm
              if (typeof window === 'undefined') {
                return 'public/mujoco/mujoco.wasm';
              }
              return '/mujoco/mujoco.wasm';
            }
            return filename;
          }
        });
        PhysicsEngine.mujocoModule = module;
        return module;
      })();
    }

    try {
      return await PhysicsEngine.mujocoInitPromise;
    } catch (error) {
      PhysicsEngine.mujocoInitPromise = null;
      throw error;
    }
  }

  /**
   * Live getters that re-acquire live WASM heap address view from mjData on every single access.
   * (Correction #9)
   */
  public get qpos(): Float64Array {
    if (!this.data) throw new Error('PhysicsEngine: Data not initialized');
    return this.data.qpos;
  }

  public get qvel(): Float64Array {
    if (!this.data) throw new Error('PhysicsEngine: Data not initialized');
    return this.data.qvel;
  }

  public get ctrl(): Float64Array {
    if (!this.data) throw new Error('PhysicsEngine: Data not initialized');
    return this.data.ctrl;
  }

  public static getModule(): MainModule | null {
    return PhysicsEngine.mujocoModule;
  }

  public getModel(): MjModel | null {
    return this.model;
  }

  public getData(): MjData | null {
    return this.data;
  }

  public getLastLoadedXml(): string {
    return this.lastLoadedXml;
  }

  /**
   * Compiles MJCF model XML via mj_loadXML on the virtual filesystem and resets heap pointer views.
   * (Correction #12, #16)
   */
  public loadMJCFModel(xmlString: string): void {
    const module = PhysicsEngine.mujocoModule;
    if (!module) {
      throw new Error('PhysicsEngine: MuJoCo module not initialized');
    }

    try {
      if (this.model) {
        this.model.delete();
        this.model = null;
      }
      if (this.data) {
        this.data.delete();
        this.data = null;
      }

      module.FS.writeFile('/model.xml', xmlString);
      this.lastLoadedXml = xmlString;

      this.model = module.MjModel.mj_loadXML('/model.xml');
      if (!this.model) {
        throw new Error('PhysicsEngine: Failed to load MJCF model');
      }

      this.data = new module.MjData(this.model);
      this.initialized = true;
      this.isPhysicsBroken = false;
      Logger.info('MuJoCoPhysicsEngine: MJCF model loaded successfully');
    } catch (error) {
      Logger.error('MuJoCoPhysicsEngine: Failed to load MJCF model', error);
      this.isPhysicsBroken = true;
      throw error;
    }
  }

  /**
   * Initializes the engine with a minimal MJCF model.
   */
  public async init(): Promise<void> {
    try {
      const module = await PhysicsEngine.ensureMuJoCoInitialized();

      const minimalMJCF = `
<mujoco model="synthia_phase1_test">
  <compiler angle="radian"/>
  <option gravity="0 0 -9.81" timestep="0.01667"/>
  <worldbody>
    <light directional="true" pos="0 0 3" dir="0 0 -1"/>
    <geom name="floor" type="plane" size="100 100 0.1" rgba="0.8 0.9 0.8 1"/>
  </worldbody>
</mujoco>
      `.trim();

      module.FS.writeFile('/model.xml', minimalMJCF);

      this.model = module.MjModel.mj_loadXML('/model.xml');
      if (!this.model) {
        throw new Error('PhysicsEngine: Failed to load minimal MJCF XML model');
      }

      this.data = new module.MjData(this.model);

      this.initialized = true;
      this.isPhysicsBroken = false;
      Logger.info('MuJoCoPhysicsEngine: MuJoCo WASM initialized successfully');
    } catch (error) {
      Logger.error('MuJoCoPhysicsEngine: Failed to initialize MuJoCo', error);
      throw error;
    }
  }

  /**
   * Steps the physical simulation. Clamps body velocities, drains contacts, and guards against crashes.
   */
  public step(): void {
    if (
      !this.initialized ||
      !this.isReady ||
      !this.model ||
      !this.data ||
      this.isStepping ||
      this.isMutatingWorld ||
      this.isPhysicsBroken
    ) return;

    this.isStepping = true;
    const module = PhysicsEngine.mujocoModule;
    if (!module) {
      this.isStepping = false;
      return;
    }

    try {
      module.mj_step(this.model, this.data);
      this.stepCount++;

      this.clampRegisteredBodyVelocities();
      this.drainContactForceEventsInternal();
    } catch (error) {
      Logger.error('MuJoCoPhysicsEngine: Fatal WASM memory or aliasing fault detected during step.', error);
      this.isPhysicsBroken = true;
      this.isReady = false;
    } finally {
      this.isStepping = false;
    }
  }

  public registerVelocityClampBody(bodyId: number): void {
    this.velocityClampBodies.add(bodyId);
  }

  public unregisterVelocityClampBody(bodyId: number): void {
    this.velocityClampBodies.delete(bodyId);
  }

  /**
   * Standardizes and limits body movement velocities to prevent solver crashes.
   */
  private clampRegisteredBodyVelocities(): void {
    if (!this.model || !this.data) return;

    const currentQVel = this.qvel;
    const maxLinear = 10.0;
    const maxAngular = 10.0;

    for (const bodyId of this.velocityClampBodies) {
      const dofAdr: number = this.model.body_dofadr[bodyId];
      const dofNum: number = this.model.body_dofnum[bodyId];
      if (dofAdr === undefined || dofNum === undefined) continue;

      if (dofNum === 6) {
        const linIdx = dofAdr;
        const angIdx = dofAdr + 3;

        const lx = currentQVel[linIdx];
        const ly = currentQVel[linIdx + 1];
        const lz = currentQVel[linIdx + 2];
        const linSpeed = Math.sqrt(lx * lx + ly * ly + lz * lz);
        if (linSpeed > maxLinear) {
          const scale = maxLinear / linSpeed;
          currentQVel[linIdx] = lx * scale;
          currentQVel[linIdx + 1] = ly * scale;
          currentQVel[linIdx + 2] = lz * scale;
        }

        const ax = currentQVel[angIdx];
        const ay = currentQVel[angIdx + 1];
        const az = currentQVel[angIdx + 2];
        const angSpeed = Math.sqrt(ax * ax + ay * ay + az * az);
        if (angSpeed > maxAngular) {
          const scale = maxAngular / angSpeed;
          currentQVel[angIdx] = ax * scale;
          currentQVel[angIdx + 1] = ay * scale;
          currentQVel[angIdx + 2] = az * scale;
        }
      }
    }
  }

  public get isBroken(): boolean {
    return this.isPhysicsBroken;
  }

  public setMutating(mutating: boolean): void {
    this.isMutatingWorld = mutating;
    Logger.info(`MuJoCoPhysicsEngine: Mutation lock set to ${mutating}`);
    if (mutating) {
      this.isReady = false;
    }
  }

  public get isMutating(): boolean {
    return this.isMutatingWorld;
  }

  public setReady(ready: boolean): void {
    this.isReady = ready;
    if (ready) this.isPhysicsBroken = false;
    Logger.info(`MuJoCoPhysicsEngine: Ready state set to ${ready}`);
  }

  public setGravity(zGravity: number): void {
    if (this.model) {
      this.model.opt.gravity[0] = 0;
      this.model.opt.gravity[1] = 0;
      this.model.opt.gravity[2] = zGravity;
    }
  }

  public getWorld(): { model: MjModel; data: MjData } {
    if (!this.model || !this.data) throw new Error('PhysicsEngine: MuJoCoPhysicsEngine not initialized');
    return { model: this.model, data: this.data };
  }

  public getEventQueue(): null {
    return null;
  }

  /**
   * Queries contact forces via WebIDL double-buffers to update contact arrays.
   * Utilizes mj_contactForce and deletes WASM DoubleBuffer afterwards to avoid memory leaks.
   */
  private drainContactForceEventsInternal(): void {
    if (!this.model || !this.data || this.isMutatingWorld || this.isPhysicsBroken) return;
    const module = PhysicsEngine.mujocoModule;
    if (!module) return;

    try {
      const now = Date.now();
      const ncon = this.data.ncon;

      for (const [, state] of this.contactForceRegistry) {
        state.inContact = false;
      }

      const forceBuffer = new module.DoubleBuffer(6);

      for (let i = 0; i < ncon; i++) {
        const contact = this.data.contact.get(i) as MjContact;
        if (!contact) continue;

        const geom1 = contact.geom1;
        const geom2 = contact.geom2;

        module.mj_contactForce(this.model, this.data, i, forceBuffer);

        const forceView = forceBuffer.GetView();
        const normalForce = forceView[0];
        const frictionForce1 = forceView[1];
        const frictionForce2 = forceView[2];
        const totalImpulse = Math.sqrt(
          normalForce * normalForce +
          frictionForce1 * frictionForce1 +
          frictionForce2 * frictionForce2
        );

        const frame = contact.frame;
        const normal: [number, number, number] = [frame.get(0), frame.get(1), frame.get(2)];

        const updateState = (geomId: number, normalDirectionMultiplier: number) => {
          const mappedNormal: [number, number, number] = [
            normal[0] * normalDirectionMultiplier,
            normal[1] * normalDirectionMultiplier,
            normal[2] * normalDirectionMultiplier
          ];

          const existing = this.contactForceRegistry.get(geomId);
          if (existing) {
            existing.inContact = true;
            existing.impulse_magnitude = totalImpulse;
            existing.contact_normal = mappedNormal;
            existing.max_force_magnitude = totalImpulse;
            existing.lastUpdate = now;
          } else {
            this.contactForceRegistry.set(geomId, {
              inContact: true,
              impulse_magnitude: totalImpulse,
              contact_normal: mappedNormal,
              max_force_magnitude: totalImpulse,
              lastUpdate: now
            });
          }
        };

        updateState(geom1, 1);
        updateState(geom2, -1);
      }

      forceBuffer.delete();
    } catch (e) {
      Logger.warn('MuJoCoPhysicsEngine: Failed to drain contact force events', e);
    }
  }

  public getContactForceRegistry(): Map<number, ColliderContactState> {
    return this.contactForceRegistry;
  }

  public drainEvents(onContact: (handle1: number, handle2: number, started: boolean) => void): void {
    if (!this.model || !this.data || this.isMutatingWorld || this.isPhysicsBroken) return;

    try {
      const ncon = this.data.ncon;
      for (let i = 0; i < ncon; i++) {
        const contact = this.data.contact.get(i) as MjContact;
        if (!contact) continue;
        onContact(contact.geom1, contact.geom2, true);
      }
    } catch (e) {
      Logger.warn('MuJoCoPhysicsEngine: drainEvents failed safely', e);
    }
  }

  public flushEventQueue(): void {
    this.contactForceRegistry.clear();
  }

  public cleanup(): void {
    if (this.model) {
      this.model.delete();
      this.model = null;
    }
    if (this.data) {
      this.data.delete();
      this.data = null;
    }
    this.initialized = false;
    this.isReady = false;
    this.isPhysicsBroken = false;
    this.contactForceRegistry.clear();
    this.velocityClampBodies.clear();
  }
}
