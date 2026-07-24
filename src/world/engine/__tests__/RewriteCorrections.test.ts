/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import { DEFAULT_STANCE_POSE, getStanceAngleForJoint } from '../MotorController';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toContain(expected: unknown): void;
  toBeCloseTo(expected: number, precision?: number): void;
};

// Mock GLTFLoader.load to bypass three's native fetch and parse local file directly
const originalLoad = GLTFLoader.prototype.load;
beforeAll(() => {
  GLTFLoader.prototype.load = function(
    _url: string,
    onLoad: (gltf: any) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void
  ) {
    try {
      const filePath = path.resolve(process.cwd(), 'public/models/x-bot.glb');
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      this.parse(
        arrayBuffer,
        '',
        (gltf: any) => {
          onLoad(gltf);
        },
        (err: any) => {
          if (onError) onError(err);
        }
      );
    } catch (e: any) {
      if (onError) onError(e);
    }
  };
});

afterAll(() => {
  GLTFLoader.prototype.load = originalLoad;
});

describe('SYNTHIA Rewrite Corrections Validation', () => {
  let engine: PhysicsEngine;
  let scene: THREE.Scene;
  let binder: HumanoidPhysicsBinder;

  beforeEach(async () => {
    engine = new PhysicsEngine();
    await engine.init();
    scene = new THREE.Scene();
    binder = new HumanoidPhysicsBinder(engine, scene);
  });

  afterEach(() => {
    engine.cleanup();
    binder.cleanup();
  });

  test('Correction #4 & #5: Quaternion conversion round-trips non-trivial rotations perfectly via conjugation', () => {
    // 1. Identity transform check
    const identityThree = { x: 0, y: 0, z: 0, w: 1 };
    const convertedIdentity = PhysicsEngine.threeQuatToMuJoCo(identityThree);
    const roundtripIdentity = PhysicsEngine.mujocoQuatToThree(convertedIdentity);
    expect(roundtripIdentity.x).toBeCloseTo(0, 5);
    expect(roundtripIdentity.y).toBeCloseTo(0, 5);
    expect(roundtripIdentity.z).toBeCloseTo(0, 5);
    expect(roundtripIdentity.w).toBeCloseTo(1, 5);

    // 2. Non-trivial 90 deg rotation about X
    const rotXThree = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const convertedRotX = PhysicsEngine.threeQuatToMuJoCo({
      x: rotXThree.x,
      y: rotXThree.y,
      z: rotXThree.z,
      w: rotXThree.w
    });
    const roundtripRotX = PhysicsEngine.mujocoQuatToThree(convertedRotX);
    expect(roundtripRotX.x).toBeCloseTo(rotXThree.x, 5);
    expect(roundtripRotX.y).toBeCloseTo(rotXThree.y, 5);
    expect(roundtripRotX.z).toBeCloseTo(rotXThree.z, 5);
    expect(roundtripRotX.w).toBeCloseTo(rotXThree.w, 5);

    // 3. Complex compound rotation check (Yaw-Pitch-Roll)
    const complexThree = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.6, 0.2, 'ZXY'));
    const convertedComplex = PhysicsEngine.threeQuatToMuJoCo({
      x: complexThree.x,
      y: complexThree.y,
      z: complexThree.z,
      w: complexThree.w
    });
    const roundtripComplex = PhysicsEngine.mujocoQuatToThree(convertedComplex);
    expect(roundtripComplex.x).toBeCloseTo(complexThree.x, 5);
    expect(roundtripComplex.y).toBeCloseTo(complexThree.y, 5);
    expect(roundtripComplex.z).toBeCloseTo(complexThree.z, 5);
    expect(roundtripComplex.w).toBeCloseTo(complexThree.w, 5);
  });

  test('Correction #3 & #11 & #13: Frame-0 qpos and ctrl sync perfectly directly inside DEFAULT_STANCE_POSE', async () => {
    const loaded = await binder.loadAndVisualizeBindPose(new THREE.Vector3(0, 0, 0));
    expect(loaded).toBe(true);

    await binder.createRigidBodiesAndColliders();
    await binder.createJointsWithZeroMotors();
    await binder.activateMotorsWithStiffnessAndDamping(100, 20);
    await binder.activateMultiBody();

    // Trigger explicit pose reset (which spawns character directly in stance pose, with zero snap)
    binder.resetPose({ x: 0, y: 0.05, z: 0 });

    const world = engine.getWorld();
    const model = world.model;
    const data = world.data;
    const qpos = data.qpos;
    const ctrl = data.ctrl;
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();

    if (module) {
      const joints = binder.getMultiBodyManager().getRigidBodiesMap();
      for (const [boneName] of joints) {
        if (boneName === 'root_capsule') continue;

        const suffixes = ['_yaw', '_pitch', '_roll'];
        for (const suffix of suffixes) {
          const jntName = `${boneName}${suffix}`;
          const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, jntName);
          const actName = `act_${jntName}`;
          const actId = module.mj_name2id(model, module.mjtObj.mjOBJ_ACTUATOR.value, actName);

          if (jntId >= 0 && actId >= 0) {
            const qposadr = model.jnt_qposadr[jntId];
            const expectedAngle = getStanceAngleForJoint(jntName);

            // Verify Frame-0 position coordinates (qpos) matches exactly the stance pose
            expect(qpos[qposadr]).toBeCloseTo(expectedAngle, 5);

            // Verify Frame-0 control outputs (ctrl) is written to match perfectly in the same call
            expect(ctrl[actId]).toBeCloseTo(expectedAngle, 5);
          }
        }
      }
    }
  });

  test('Standing Stance Hold: upright posture is maintained under gravity without gradual height drift', async () => {
    const loaded = await binder.loadAndVisualizeBindPose(new THREE.Vector3(0, 0, 0));
    expect(loaded).toBe(true);

    await binder.createRigidBodiesAndColliders();
    await binder.createJointsWithZeroMotors();
    await binder.activateMotorsWithStiffnessAndDamping(150, 20);
    await binder.activateMultiBody();

    binder.resetPose({ x: 0, y: 0.05, z: 0 });

    // Ensure KGRF is deactivated
    (binder as any).KGRF_MULTIPLIER = 0.0;

    const capsuleBodyId = binder.getMultiBodyManager().getCapsuleBody();
    expect(capsuleBodyId).toBeGreaterThanOrEqual(0);

    const world = engine.getWorld();
    const data = world.data;

    // Capture initial pelvic height
    const initialZ = data.xpos[capsuleBodyId * 3 + 2];
    expect(initialZ).toBeGreaterThan(0.8);

    // Step physics for 100 iterations (headless simulation of hold)
    for (let i = 0; i < 100; i++) {
      binder.updateMotorTargets();
      engine.step();
    }

    const finalZ = data.xpos[capsuleBodyId * 3 + 2];

    // Assert that the character maintains its vertical position without height climb or sudden collapse
    expect(Math.abs(finalZ - initialZ)).toBeLessThanOrEqual(0.1);
    expect(finalZ).toBeGreaterThan(0.75);
  });
});
