/// <reference types="jest" />

import { ObjectManager } from '../ObjectManager';
import { PhysicsEngine } from '../PhysicsEngine';
import { generateHumanoidMJCF } from '../MJCFHumanoidTemplate';
import { AudioEngine } from '../AudioEngine';
import * as THREE from 'three';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeGreaterThanOrEqual(expected: number): void;
};

describe('ObjectManager', () => {
  let engine: PhysicsEngine;
  let scene: THREE.Scene;
  let audioEngine: AudioEngine;
  let objectManager: ObjectManager;

  beforeEach(async () => {
    engine = new PhysicsEngine();
    await engine.init();

    // Generate base humanoid MJCF and compile/load it so we have pre-allocated slots compiled
    const boneInfoMap = new Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>();
    const pelvis = new THREE.Bone();
    pelvis.name = 'mixamorighips';
    boneInfoMap.set('mixamorighips', { bone: pelvis, worldPosition: new THREE.Vector3(0, 0.9, 0) });
    const xml = generateHumanoidMJCF(boneInfoMap, [], 0.9, pelvis);
    engine.loadMJCFModel(xml);
    engine.setReady(true);

    scene = new THREE.Scene();
    audioEngine = new AudioEngine();
    objectManager = new ObjectManager(engine, scene, audioEngine);
  });

  afterEach(() => {
    engine.cleanup();
  });

  test('spawnObject Claims slots and releases correctly', () => {
    const obj = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj).toBeTruthy();
    expect(obj?.slotIndex).toBe(0);
    expect(obj?.bodyName).toBe('env_slot_0');

    // Spawning second object claims next slot
    const obj2 = objectManager.spawnObject('sphere', new THREE.Vector3(0, 2, 0));
    expect(obj2?.slotIndex).toBe(1);

    // Delete first claims slot back
    objectManager.deleteObject(obj!.id);
    const obj3 = objectManager.spawnObject('cylinder', new THREE.Vector3(0, 3, 0));
    expect(obj3?.slotIndex).toBe(0); // claims slot 0 again
  });

  test('spawnObject works after custom-model spawn + delete cycle and custom geom masks are correct', () => {
    // 1. Spawn a primitive
    const prim = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(prim).toBeTruthy();
    expect(prim?.slotIndex).toBe(0);

    // 2. Spawn a custom model
    const customGroup = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    customGroup.add(mesh);

    const customObj = objectManager.spawnCustomModel(
      customGroup,
      'MyCustomMesh',
      new THREE.Vector3(0, 2, 0),
      { isTerrain: false, mass: 2 }
    );
    expect(customObj).toBeTruthy();
    expect(customObj?.isCustom).toBe(true);

    // Verify custom meshes are appended inside this.customMeshesSpec
    expect(objectManager.customMeshesSpec.length).toBe(1);

    // Check custom geom contype and conaffinity inside model
    const world = engine.getWorld();
    const model = world.model;
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();

    if (module) {
      const geomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, `custom_geom_${customObj!.id}`);
      expect(geomId).toBeGreaterThanOrEqual(0);
      expect(model.geom_contype[geomId]).toBe(2);
      expect(model.geom_conaffinity[geomId]).toBe(3);
    }

    // 3. Delete the custom model
    objectManager.deleteObject(customObj!.id);
    expect(objectManager.customMeshesSpec.length).toBe(0);

    // 4. Spawn another primitive and confirm it works
    const prim2 = objectManager.spawnObject('sphere', new THREE.Vector3(0, 3, 0));
    expect(prim2).toBeTruthy();
    expect(prim2?.slotIndex).toBe(1); // slot 0 was claimed by prim, so this is slot 1
  });

  test('slot state (C3 size, friction, contype/conaffinity) survives consecutive multiple reloads', () => {
    // 1. Spawn a primitive (cube)
    const obj = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj).toBeTruthy();
    expect(obj?.slotIndex).toBe(0);

    const worldBefore = engine.getWorld();
    const geomIdBefore = obj!.colliders[0];
    // Check initial mutated values
    expect(worldBefore.model.geom_contype[geomIdBefore]).toBe(2);
    expect(worldBefore.model.geom_conaffinity[geomIdBefore]).toBe(3);
    expect(worldBefore.model.geom_friction[geomIdBefore * 3]).toBe(obj!.preset.friction);

    // 2. Perform consecutive multiple reload cycles (e.g. simulating spawning dynamic models or other agents)
    objectManager.reloadStateAndRehydrate();
    objectManager.reloadStateAndRehydrate();
    objectManager.reloadStateAndRehydrate();

    // 3. Verify that the properties are successfully restored to the slot geoms
    const worldAfter = engine.getWorld();
    const geomIdAfter = obj!.colliders[0];

    // Confirm properties are identical after 3 sequential reloads
    expect(worldAfter.model.geom_contype[geomIdAfter]).toBe(2);
    expect(worldAfter.model.geom_conaffinity[geomIdAfter]).toBe(3);
    expect(worldAfter.model.geom_friction[geomIdAfter * 3]).toBe(obj!.preset.friction);
  });
});
