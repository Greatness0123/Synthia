/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import { generateCombinedMultiAgentMJCF } from '../MJCFHumanoidTemplate';
import { StateRehydrator } from '../StateRehydrator';

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
  toBeDefined(): void;
  assert(cond: boolean): void;
};

// Mock GLTFLoader to parse GLB from disk
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

describe('Multi-Agent Composition & Isolation', () => {
  let engine: PhysicsEngine;
  let scene: THREE.Scene;
  let binder0: HumanoidPhysicsBinder;
  let binder1: HumanoidPhysicsBinder;

  beforeEach(async () => {
    engine = new PhysicsEngine();
    await engine.init();
    scene = new THREE.Scene();

    // Create 2 binders representing agent_0 and agent_1
    binder0 = new HumanoidPhysicsBinder(engine, scene, 'agent_0');
    binder1 = new HumanoidPhysicsBinder(engine, scene, 'agent_1');
  });

  afterEach(() => {
    engine.cleanup();
    binder0.cleanup();
    binder1.cleanup();
  });

  test('generateCombinedMultiAgentMJCF and StateRehydrator work stably with multi-agent setups', async () => {
    // 1. Load visual bone maps for both agents
    const loaded0 = await binder0.loadAndVisualizeBindPose(new THREE.Vector3(0, 0, 0));
    const loaded1 = await binder1.loadAndVisualizeBindPose(new THREE.Vector3(1.75, 0, 0));
    expect(loaded0).toBe(true);
    expect(loaded1).toBe(true);

    // Reposition visual roots
    binder0.repositionModel(0, 0.05, 0);
    binder1.repositionModel(1.75, 0.05, 0);

    // 2. Generate and load combined MJCF
    const combinedXml = generateCombinedMultiAgentMJCF([
      {
        prefix: binder0.prefix,
        boneInfoMap: binder0.getBoneInfoMap(),
        capsuleCenterY: binder0.getCapsuleCenterY(),
      },
      {
        prefix: binder1.prefix,
        boneInfoMap: binder1.getBoneInfoMap(),
        capsuleCenterY: binder1.getCapsuleCenterY(),
      }
    ]);

    expect(combinedXml).toBeTruthy();
    expect(combinedXml.includes('body name="agent_0_root_capsule"')).toBe(true);
    expect(combinedXml.includes('body name="agent_1_root_capsule"')).toBe(true);

    // Load into MuJoCo
    engine.loadMJCFModel(combinedXml);
    engine.setReady(true);

    // 3. Activate both binders (remaps IDs to the newly loaded combined model)
    const bm0 = binder0.getMultiBodyManager();
    const bm1 = binder1.getMultiBodyManager();

    bm0.remapIdsAgainstLoadedWorld(binder0.getBoneInfoMap());
    bm1.remapIdsAgainstLoadedWorld(binder1.getBoneInfoMap());

    binder0.initMotorController();
    binder1.initMotorController();

    binder0.mbActive = true;
    binder1.mbActive = true;

    // Verify lookup isolation: body IDs and joint IDs must be totally distinct
    const rigidMap0 = bm0.getRigidBodiesMap();
    const rigidMap1 = bm1.getRigidBodiesMap();

    const spineId0 = rigidMap0.get('mixamorigspine');
    const spineId1 = rigidMap1.get('mixamorigspine');

    expect(spineId0).toBeDefined();
    expect(spineId1).toBeDefined();
    expect(spineId0).not.toBe(spineId1); // Must not be the same ID, proving isolation!

    // Verify capsule body isolation
    const capId0 = bm0.getCapsuleBody();
    const capId1 = bm1.getCapsuleBody();
    expect(capId0).not.toBe(capId1);

    // 4. Capture & restore state using StateRehydrator
    const captured = StateRehydrator.capture(engine, ['agent_0', 'agent_1'], []);
    expect(captured.agents['agent_0']).toBeDefined();
    expect(captured.agents['agent_1']).toBeDefined();

    // Verify root positions are captured at correct spawn coordinates (0 vs 1.75)
    // (MuJoCo World Y corresponds to Three -Z, World Z to Three Y)
    const cap0_pos = captured.agents['agent_0'].rootPos;
    const cap1_pos = captured.agents['agent_1'].rootPos;

    expect(cap0_pos[0]).toBeCloseTo(0, 1);
    expect(cap1_pos[0]).toBeCloseTo(1.75, 1);

    // Step physics and verify stability
    for (let i = 0; i < 5; i++) {
      binder0.updateMotorTargets();
      binder1.updateMotorTargets();
      engine.step();
      binder0.syncVisuals();
      binder1.syncVisuals();
    }

    expect(engine.isBroken).toBe(false);

    // Re-restore state and verify physics stays unbroken
    StateRehydrator.restore(engine, captured, []);
    expect(engine.isBroken).toBe(false);
  });
});
