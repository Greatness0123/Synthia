/// <reference types="jest" />

import { ObjectManager } from '../ObjectManager';
import { PhysicsEngine } from '../PhysicsEngine';
import { CollisionAdapter } from '../CollisionAdapter';
import { generateHumanoidMJCF } from '../MJCFHumanoidTemplate';
import * as THREE from 'three';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
};

describe('ObjectManager', () => {
  let engine: PhysicsEngine;
  let scene: THREE.Scene;
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
    objectManager = new ObjectManager(engine, scene);
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

    // Check custom geom contype and conaffinity inside model (fresh references after reload)
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();

    if (module) {
      const { model } = engine.getWorld();
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
    // 1. Spawn a primitive (cube) — triggers model reload internally
    const obj = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj).toBeTruthy();
    expect(obj?.slotIndex).toBe(0);

    // Get fresh references after reload
    let { model } = engine.getWorld();
    const geomIdBefore = obj!.colliders[0];
    expect(model.geom_contype[geomIdBefore]).toBe(2);
    expect(model.geom_conaffinity[geomIdBefore]).toBe(1);
    expect(model.geom_friction[geomIdBefore * 3]).toBe(obj!.preset.friction);

    // 2. Perform consecutive multiple reload cycles
    objectManager.reloadStateAndRehydrate();
    objectManager.reloadStateAndRehydrate();
    objectManager.reloadStateAndRehydrate();

    // 3. Verify that the properties are successfully restored — re-read after last reload
    ({ model } = engine.getWorld());
    const geomIdAfter = obj!.colliders[0];

    expect(model.geom_contype[geomIdAfter]).toBe(2);
    expect(model.geom_conaffinity[geomIdAfter]).toBe(1);
    expect(model.geom_friction[geomIdAfter * 3]).toBe(obj!.preset.friction);
  });

  test('primitive floor contact survives delete-respawn cycle in the same slot', () => {
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();
    if (!module) return;

    // Helper: resolve floor geom by name from current model (must be called after every reload)
    const getFloorGeomId = () => {
      const { model } = engine.getWorld();
      return module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'floor');
    };

    // Helper: assert that a specific spawned primitive geom contacts the floor
    const assertFloorContactWithPrimitive = (obj: { colliders: number[] }, label: string) => {
      const { model, data } = engine.getWorld();
      const geomId = obj.colliders[0];
      const floorId = getFloorGeomId();
      expect(floorId).toBeGreaterThanOrEqual(0);

      const ncon = data.ncon;
      const hasDirectContact = CollisionAdapter.areGeomsInContact(data, floorId, geomId);

      // Diagnostic output
      const geomName = module.mj_id2name(model, module.mjtObj.mjOBJ_GEOM.value, geomId) || `geom_${geomId}`;
      const bodyId = model.geom_bodyid[geomId];
      const bodyName = module.mj_id2name(model, module.mjtObj.mjOBJ_BODY.value, bodyId) || `body_${bodyId}`;
      const qposAdr = model.jnt_qposadr[model.body_jntadr[bodyId]];
      const xpos = data.qpos[qposAdr];
      const ypos = data.qpos[qposAdr + 1];
      const zpos = data.qpos[qposAdr + 2];
      const sizeOff = geomId * 3;
      const size = `[${model.geom_size[sizeOff]}, ${model.geom_size[sizeOff+1]}, ${model.geom_size[sizeOff+2]}]`;
      const rbound = model.geom_rbound[geomId];
      const contype = model.geom_contype[geomId];
      const conaffinity = model.geom_conaffinity[geomId];

      const gxOff = geomId * 3;
      const gxpos = data.geom_xpos ? `[${data.geom_xpos[gxOff].toFixed(3)}, ${data.geom_xpos[gxOff+1].toFixed(3)}, ${data.geom_xpos[gxOff+2].toFixed(3)}]` : 'N/A';

      console.log(
        `[${label}] ncon=${ncon} geom=${geomName} body=${bodyName} ` +
        `qpos=[${xpos.toFixed(3)}, ${ypos.toFixed(3)}, ${zpos.toFixed(3)}] ` +
        `geom_xpos=${gxpos} ` +
        `size=${size} rbound=${rbound.toFixed(4)} contype=${contype} conaffinity=${conaffinity}`
      );

      if (ncon > 0) {
        for (let i = 0; i < ncon; i++) {
          const c = data.contact.get(i);
          if (c) {
            const n1 = module.mj_id2name(model, module.mjtObj.mjOBJ_GEOM.value, c.geom1) || `g${c.geom1}`;
            const n2 = module.mj_id2name(model, module.mjtObj.mjOBJ_GEOM.value, c.geom2) || `g${c.geom2}`;
            console.log(`  contact[${i}]: ${n1} <-> ${n2} dist=${c.dist.toFixed(4)}`);
          }
        }
      }

      expect(hasDirectContact).toBeTruthy();
    };

    // ---- First spawn ----
    const obj1 = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj1).toBeTruthy();
    expect(obj1?.slotIndex).toBe(0);

    // Fresh references after model reload
    let { model, data } = engine.getWorld();
    const geomId1 = obj1!.colliders[0];
    const bodyId1 = obj1!.bodyId!;

    // qpos must map Three.js (0,1,0) → MuJoCo [0, ~0, 1]
    const qposAdr1 = model.jnt_qposadr[model.body_jntadr[bodyId1]];
    expect(data.qpos[qposAdr1]).toBeCloseTo(0, 5);       // x
    expect(data.qpos[qposAdr1 + 1]).toBeCloseTo(0, 5);   // -z
    expect(data.qpos[qposAdr1 + 2]).toBeCloseTo(1, 5);   // y

    // Active geom size set to 0.5 half-extents (baked into XML at compile time)
    const sizeOffset1 = geomId1 * 3;
    expect(model.geom_size[sizeOffset1]).toBe(0.5);
    expect(model.geom_size[sizeOffset1 + 1]).toBe(0.5);
    expect(model.geom_size[sizeOffset1 + 2]).toBe(0.5);

    // Bounding sphere radius nonzero (computed by MuJoCo from compile-time size)
    expect(model.geom_rbound[geomId1]).toBeGreaterThan(0);

    // Collision masks baked into XML
    expect(model.geom_contype[geomId1]).toBe(2);
    expect(model.geom_conaffinity[geomId1]).toBe(1);

    // qvel must be zero after spawn
    const dofAdr1 = model.body_dofadr[bodyId1];
    for (let i = 0; i < 6; i++) {
      expect(data.qvel[dofAdr1 + i]).toBeCloseTo(0, 5);
    }

    // Step the simulation — gravity pulls the cube toward the floor
    for (let s = 0; s < 200; s++) engine.step();

    // The SPAWNED PRIMITIVE must contact the floor
    assertFloorContactWithPrimitive(obj1!, 'after first spawn + step');

    // Object must be near supported height (not fallen through floor)
    ({ data } = engine.getWorld());
    const yAfterStep1 = data.qpos[qposAdr1 + 2];
    expect(yAfterStep1).toBeGreaterThanOrEqual(-0.1);

    // ---- Delete ----
    objectManager.deleteObject(obj1!.id);

    // Slot released
    expect((objectManager as any).slotClaimed[0]).toBe(false);

    // Fresh references after model reload
    ({ model, data } = engine.getWorld());

    // Body moved underground (StateRehydrator does not restore deleted objects)
    // The slot body is at z=-10 in the XML default, and since the object was
    // removed from the objects map before reload, it stays at the XML default.
    // Look up the body to verify
    const bodyId1AfterDelete = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, 'env_slot_0');
    expect(bodyId1AfterDelete).toBeGreaterThanOrEqual(0);
    const qposAdr1Del = model.jnt_qposadr[model.body_jntadr[bodyId1AfterDelete]];
    expect(data.qpos[qposAdr1Del + 2]).toBe(-10);

    // qvel zeroed on delete
    const dofAdr1Del = model.body_dofadr[bodyId1AfterDelete];
    for (let i = 0; i < 6; i++) {
      expect(data.qvel[dofAdr1Del + i]).toBeCloseTo(0, 5);
    }

    // Inactive geom disabled (baked into XML for inactive slot)
    const geomId1AfterDelete = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'env_slot_0_box');
    expect(geomId1AfterDelete).toBeGreaterThanOrEqual(0);
    expect(model.geom_contype[geomId1AfterDelete]).toBe(0);
    expect(model.geom_conaffinity[geomId1AfterDelete]).toBe(0);

    // Step while slot is inactive — body stays underground, no floor contact from this geom
    for (let s = 0; s < 5; s++) engine.step();
    ({ data } = engine.getWorld());
    const undergroundContact = CollisionAdapter.areGeomsInContact(data, getFloorGeomId(), geomId1AfterDelete);
    expect(undergroundContact).toBeFalsy();

    // ---- Respawn into same slot ----
    const obj2 = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj2).toBeTruthy();
    expect(obj2?.slotIndex).toBe(0); // same slot reused
    expect(obj2?.bodyName).toBe('env_slot_0');

    // Fresh references after model reload
    ({ model, data } = engine.getWorld());
    const geomId2 = obj2!.colliders[0];
    const bodyId2 = obj2!.bodyId!;

    // qpos correctly set for respawn
    const qposAdr2 = model.jnt_qposadr[model.body_jntadr[bodyId2]];
    expect(data.qpos[qposAdr2]).toBeCloseTo(0, 5);
    expect(data.qpos[qposAdr2 + 1]).toBeCloseTo(0, 5);
    expect(data.qpos[qposAdr2 + 2]).toBeCloseTo(1, 5);

    // Active geom restored (baked into XML)
    const sizeOffset2 = geomId2 * 3;
    expect(model.geom_size[sizeOffset2]).toBe(0.5);
    expect(model.geom_size[sizeOffset2 + 1]).toBe(0.5);
    expect(model.geom_size[sizeOffset2 + 2]).toBe(0.5);
    expect(model.geom_rbound[geomId2]).toBeGreaterThan(0);
    expect(model.geom_contype[geomId2]).toBe(2);
    expect(model.geom_conaffinity[geomId2]).toBe(1);

    // qvel zeroed on respawn
    const dofAdr2 = model.body_dofadr[bodyId2];
    for (let i = 0; i < 6; i++) {
      expect(data.qvel[dofAdr2 + i]).toBeCloseTo(0, 5);
    }

    // Step the simulation again — must re-establish floor contact for THIS primitive
    for (let s = 0; s < 200; s++) engine.step();

    assertFloorContactWithPrimitive(obj2!, 'after respawn + step');

    // Object still near supported height
    ({ data } = engine.getWorld());
    const yAfterRespawn = data.qpos[qposAdr2 + 2];
    expect(yAfterRespawn).toBeGreaterThanOrEqual(-0.1);
  });

  test('WASM runtime model mutations do not affect collision (documents limitation)', () => {
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();
    if (!module) return;

    const testMJCF = `
<mujoco model="mutation_test">
  <compiler angle="radian"/>
  <option gravity="0 0 -9.81" timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="100 100 0.1" contype="1" conaffinity="2"/>
    <body name="test_box" pos="0 0 1">
      <freejoint name="free_joint"/>
      <geom name="box_geom" type="box" size="0.001 0.001 0.001" contype="0" conaffinity="0"/>
    </body>
  </worldbody>
</mujoco>`;

    module.FS.writeFile('/mutation_test.xml', testMJCF);
    const testModel = module.MjModel.mj_loadXML('/mutation_test.xml');
    expect(testModel).toBeTruthy();
    const testData = new module.MjData(testModel);
    module.mj_forward(testModel, testData);

    const boxGeomId = module.mj_name2id(testModel, module.mjtObj.mjOBJ_GEOM.value, 'box_geom');
    expect(boxGeomId).toBeGreaterThanOrEqual(0);

    // Mutate size and contype at runtime (exactly as old ObjectManager.spawnObject did)
    testModel.geom_size[boxGeomId * 3] = 0.5;
    testModel.geom_size[boxGeomId * 3 + 1] = 0.5;
    testModel.geom_size[boxGeomId * 3 + 2] = 0.5;
    testModel.geom_rbound[boxGeomId] = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5 + 0.5 * 0.5);
    testModel.geom_contype[boxGeomId] = 2;
    testModel.geom_conaffinity[boxGeomId] = 3;

    module.mj_setConst(testModel, testData);
    module.mj_forward(testModel, testData);

    const bodyId = module.mj_name2id(testModel, module.mjtObj.mjOBJ_BODY.value, 'test_box');
    const qposAdr = testModel.jnt_qposadr[testModel.body_jntadr[bodyId]];

    for (let s = 0; s < 200; s++) module.mj_step(testModel, testData);

    const zAfter = testData.qpos[qposAdr + 2];
    console.log(`[WASM limitation probe] runtime mutation: qpos_z=${zAfter.toFixed(4)} ncon=${testData.ncon}`);

    // Runtime mutations are invisible to the WASM collision pipeline — no contact
    const hasFloorContact = CollisionAdapter.areGeomsInContact(testData, 0, boxGeomId);
    expect(hasFloorContact).toBeFalsy();

    testData.delete();
    testModel.delete();
  });

  test('compile-time correct size produces floor contacts (control test)', () => {
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();
    if (!module) return;

    const testMJCF = `
<mujoco model="size_correct_test">
  <compiler angle="radian"/>
  <option gravity="0 0 -9.81" timestep="0.002"/>
  <worldbody>
    <geom name="floor" type="plane" size="100 100 0.1" contype="1" conaffinity="2"/>
    <body name="test_box" pos="0 0 1">
      <freejoint name="free_joint"/>
      <geom name="box_geom" type="box" size="0.5 0.5 0.5" contype="2" conaffinity="3"/>
    </body>
  </worldbody>
</mujoco>`;

    module.FS.writeFile('/size_correct_test.xml', testMJCF);
    const testModel = module.MjModel.mj_loadXML('/size_correct_test.xml');
    expect(testModel).toBeTruthy();
    const testData = new module.MjData(testModel);

    const boxGeomId = module.mj_name2id(testModel, module.mjtObj.mjOBJ_GEOM.value, 'box_geom');
    expect(boxGeomId).toBeGreaterThanOrEqual(0);

    const bodyId = module.mj_name2id(testModel, module.mjtObj.mjOBJ_BODY.value, 'test_box');
    const qposAdr = testModel.jnt_qposadr[testModel.body_jntadr[bodyId]];

    for (let s = 0; s < 200; s++) {
      module.mj_step(testModel, testData);
    }

    const zAfter = testData.qpos[qposAdr + 2];
    console.log(`[control] compile-time correct: qpos_z=${zAfter.toFixed(4)} ncon=${testData.ncon}`);

    expect(zAfter).toBeGreaterThanOrEqual(-0.1);
    expect(zAfter).toBeLessThanOrEqual(1.0);

    const hasFloorContact = CollisionAdapter.areGeomsInContact(testData, 0, boxGeomId);
    expect(hasFloorContact).toBeTruthy();

    testData.delete();
    testModel.delete();
  });

  test('all primitive presets have compatible floor collision masks after spawn', () => {
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();
    if (!module) return;

    const presets = ['cube', 'sphere', 'cylinder', 'wedge'];

    for (const presetId of presets) {
      const obj = objectManager.spawnObject(presetId, new THREE.Vector3(0, 1, 0));
      expect(obj).toBeTruthy();

      // Get fresh model reference after spawn (which triggers model reload)
      const { model } = engine.getWorld();
      const geomId = obj!.colliders[0];
    expect(model.geom_contype[geomId]).toBe(2);
    expect(model.geom_conaffinity[geomId]).toBe(1);
      expect(model.geom_rbound[geomId]).toBeGreaterThan(0);

      // Geom size must be nonzero
      const sizeOffset = geomId * 3;
      const sx = model.geom_size[sizeOffset];
      const sy = model.geom_size[sizeOffset + 1];
      const sz = model.geom_size[sizeOffset + 2];
      expect(sx + sy + sz).toBeGreaterThan(0);

      objectManager.deleteObject(obj!.id);
    }
  });

  test('spawning second object preserves first object floor contact', () => {
    const module = PhysicsEngine.getModule();
    expect(module).toBeTruthy();
    if (!module) return;

    const getFloorGeomId = () => {
      const { model } = engine.getWorld();
      return module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'floor');
    };

    // ---- Spawn first object ----
    const obj1 = objectManager.spawnObject('cube', new THREE.Vector3(0, 1, 0));
    expect(obj1).toBeTruthy();
    expect(obj1?.slotIndex).toBe(0);

    // Step until settled
    for (let s = 0; s < 200; s++) engine.step();

    // Verify first object contacts the floor
    let { model, data } = engine.getWorld();
    const geomId1 = obj1!.colliders[0];
    const bodyId1 = obj1!.bodyId!;
    const qposAdr1 = model.jnt_qposadr[model.body_jntadr[bodyId1]];
    const z1AfterFirstSpawn = data.qpos[qposAdr1 + 2];
    expect(z1AfterFirstSpawn).toBeGreaterThanOrEqual(-0.1);
    expect(z1AfterFirstSpawn).toBeLessThanOrEqual(1.0);
    expect(CollisionAdapter.areGeomsInContact(data, getFloorGeomId(), geomId1)).toBeTruthy();

    // ---- Spawn second object (different slot, offset position) ----
    const obj2 = objectManager.spawnObject('sphere', new THREE.Vector3(2, 1, 0));
    expect(obj2).toBeTruthy();
    expect(obj2?.slotIndex).toBe(1);

    // Step until settled (need many steps for sphere to damp out bouncing)
    for (let s = 0; s < 2000; s++) engine.step();
    ({ model, data } = engine.getWorld());

    // First object must still be near the floor
    const bodyId1After = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, 'env_slot_0');
    expect(bodyId1After).toBeGreaterThanOrEqual(0);
    const qposAdr1After = model.jnt_qposadr[model.body_jntadr[bodyId1After]];
    const z1AfterSecondSpawn = data.qpos[qposAdr1After + 2];

    const bodyId2After = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, 'env_slot_1');
    expect(bodyId2After).toBeGreaterThanOrEqual(0);
    const qposAdr2After = model.jnt_qposadr[model.body_jntadr[bodyId2After]];
    const z2After = data.qpos[qposAdr2After + 2];

    expect(z2After).toBeGreaterThanOrEqual(-0.1);
    expect(z2After).toBeLessThanOrEqual(1.0);

    expect(z1AfterSecondSpawn).toBeGreaterThanOrEqual(-0.1);
    expect(z1AfterSecondSpawn).toBeLessThanOrEqual(1.0);
    const geomId1After = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'env_slot_0_box');
    expect(geomId1After).toBeGreaterThanOrEqual(0);
    expect(CollisionAdapter.areGeomsInContact(data, getFloorGeomId(), geomId1After)).toBeTruthy();

    const geomId2After = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'env_slot_1_sphere');
    expect(geomId2After).toBeGreaterThanOrEqual(0);
    expect(CollisionAdapter.areGeomsInContact(data, getFloorGeomId(), geomId2After)).toBeTruthy();
  });
});
