/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import { generateCombinedMultiAgentMJCF, generateAgentSubtreeMJCF } from '../MJCFHumanoidTemplate';
import { StateRehydrator } from '../StateRehydrator';
import { MotorController } from '../MotorController';

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
  toBeCloseTo(expected: number, numDigits?: number): void;
  assert(cond: boolean): void;
  not: {
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toContain(expected: unknown): void;
    toBeDefined(): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
  };
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

    // Set a mock ctrl value to verify capture & restore of actuator controls (ctrl)
    const worldData = engine.getData()!;
    const testActIdx = 2; // Some test actuator index
    worldData.ctrl[testActIdx] = 0.85;

    // 4. Capture & restore state using StateRehydrator
    const captured = StateRehydrator.capture(engine, ['agent_0', 'agent_1'], []);
    expect(captured.agents['agent_0']).toBeDefined();
    expect(captured.agents['agent_1']).toBeDefined();
    expect(captured.agents['agent_0'].ctrl).toBeDefined();

    // Verify ctrl was captured
    const module = PhysicsEngine.getModule()!;
    const testActName = module.mj_id2name(engine.getModel(), module.mjtObj.mjOBJ_ACTUATOR.value, testActIdx);
    if (testActName && testActName.startsWith('agent_0_')) {
      expect(captured.agents['agent_0'].ctrl[testActName]).toBeCloseTo(0.85, 2);
    }

    // Zero the control array
    worldData.ctrl[testActIdx] = 0.0;

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

    // Re-restore state and verify physics stays unbroken and ctrl is restored
    StateRehydrator.restore(engine, captured, []);
    expect(engine.isBroken).toBe(false);
    if (testActName && testActName.startsWith('agent_0_')) {
      expect(worldData.ctrl[testActIdx]).toBeCloseTo(0.85, 2);
    }
  });

  test('MotorController.init() must not restart the ctrl ramp for existing agents on world reload', async () => {
    // Regression test for the "existing agents snap to T-pose when a new agent spawns" bug.
    //
    // spawnAgent() → loadMJCFModel() deletes the old MjModel/MjData, so every binder's
    // MotorController needs its model/data WASM pointers refreshed via init(). Previously
    // init() reset simulationStepCount = 0, restarting the 20-frame ctrl ramp. With the
    // ramp at ~0, setTargets() wrote ctrl ≈ 0 for the old agent's actuators, and MuJoCo's
    // position servos drove the joints back toward the MJCF bind pose (Mixamo T-pose).
    //
    // This test simulates that exact path and asserts the ramp is preserved.

    // Step 1: load a single-agent world for agent_0 and activate its controller.
    const loaded = await binder0.loadAndVisualizeBindPose(new THREE.Vector3(0, 0, 0));
    expect(loaded).toBe(true);
    binder0.ensureCapsuleGeometry();
    binder0.repositionModel(0, 0.05, 0);
    await binder0.createRigidBodiesAndColliders();
    await binder0.createJointsWithZeroMotors();
    await binder0.activateMotorsWithStiffnessAndDamping(80, 10);
    binder0.setMode('rigid');

    const mc0: MotorController = (binder0 as any).motorController;

    // Step 2: let the ramp run to full (20 frames) with a distinctive arm target.
    for (let i = 0; i < 20; i++) {
      binder0.updateMotorTargets();
      engine.step();
    }
    const LEFT_ARM_TARGET = 1.0; // radians, well away from the bind-pose 0
    binder0.setMotorTargets({ mixamorigleftarm: LEFT_ARM_TARGET });
    binder0.updateMotorTargets();

    const ctrlBefore = engine.getData()!.ctrl;
    const modelBefore = engine.getModel();
    const armActId = bmArmActuatorId(engine, mc0, 'mixamorigleftarm');
    expect(armActId).toBeGreaterThanOrEqual(0);
    const ctrlValueBefore = ctrlBefore[armActId];
    // Sanity: the target must survive a full-ramp write (ramp factor 1.0).
    expect(ctrlValueBefore).toBeCloseTo(LEFT_ARM_TARGET, 1);

    // Step 3: simulate a new-agent spawn reload. The world is recompiled (fresh
    // model/data) and the OLD agent's controller is re-initialized against it —
    // the exact call sequence in useWorld.spawnAgent()'s per-binder loop.
    const { bodyXml, actuatorsXml } = generateSingleAgentSubtreeForTest(binder0);
    engine.loadMJCFModel(
      `<mujoco model="synthia_humanoid"><compiler angle="radian" coordinate="local"/>
       <option gravity="0 0 -9.81" timestep="0.002" iterations="100" integrator="implicitfast"/>
       <worldbody><geom name="floor" type="plane" size="100 100 0.1" contype="1" conaffinity="2"/>
       ${bodyXml}</worldbody><actuator>${actuatorsXml}</actuator></mujoco>`
    );
    engine.setReady(true);
    binder0.getMultiBodyManager().remapIdsAgainstLoadedWorld(binder0.getBoneInfoMap());
    binder0.initMotorController();

    // Step 4: the next frame must write ctrl at FULL scale — not ramp*0.
    // Re-assert the same target that was live before the reload.
    binder0.setMotorTargets({ mixamorigleftarm: LEFT_ARM_TARGET });
    binder0.updateMotorTargets();

    const ctrlAfter = engine.getData()!.ctrl;
    const armActIdAfter = armActuatorIdFor(binder0, 'mixamorigleftarm');
    expect(armActIdAfter).toBeGreaterThanOrEqual(0);
    const ctrlValueAfter = ctrlAfter[armActIdAfter];

    // Without the fix, init() reset the ramp and this value would be ~0
    // (target * 0), collapsing the arm back to the MJCF bind pose.
    expect(ctrlValueAfter).toBeCloseTo(LEFT_ARM_TARGET, 1);

    void modelBefore;
    void mc0;
  });
});

// ── Helpers for the ramp-preservation regression test ─────────────────────────

function armActuatorIdFor(binder0: HumanoidPhysicsBinder, boneName: string): number {
  const bm = binder0.getMultiBodyManager() as any;
  const ids: number[] = bm.getActuatorMap().get(boneName) || [];
  if (ids.length === 0) return -1;
  // Spherical joints are [yaw, pitch, roll]; the pitch actuator is the second.
  return ids.length === 3 ? ids[1] : ids[0];
}

function bmArmActuatorId(engine: PhysicsEngine, mc: MotorController, boneName: string): number {
  const bm = (mc as any).actuatorMap as Map<string, number[]>;
  const ids = bm.get(boneName) || [];
  if (ids.length === 0) return -1;
  void engine;
  return ids.length === 3 ? ids[1] : ids[0];
}

function generateSingleAgentSubtreeForTest(binder0: HumanoidPhysicsBinder): { bodyXml: string; actuatorsXml: string } {
  // Reuse the already-loaded bone info map to rebuild a fresh single-agent MJCF
  // subtree, exactly as BodyManager.activate() does on first spawn.
  const bm = binder0.getMultiBodyManager() as any;
  const prefix = binder0.prefix;
  const capsuleCenterY = binder0.getCapsuleCenterY();
  const boneInfoMap = binder0.getBoneInfoMap();
  const { bodyXml, actuatorsXml } = generateAgentSubtreeMJCF(boneInfoMap, capsuleCenterY, undefined, undefined, prefix);
  void bm;
  return { bodyXml: bodyXml.toString(), actuatorsXml: actuatorsXml.join('\n') };
}
