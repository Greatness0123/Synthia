import * as THREE from 'three';
import { ObjectPreset, OBJECT_PRESETS } from '../../constants/objectPresets';
import { PhysicsEngine } from './PhysicsEngine';
import { CollisionAdapter, ContactPair } from './CollisionAdapter';
import { AudioEngine } from './AudioEngine';
import { StateRehydrator } from './StateRehydrator';
import { NUM_ENV_SLOTS, injectAssetsAndBodies } from './MJCFHumanoidTemplate';
import { logger as Logger } from '../../utils/logger';
import { canSpawnObject } from './memoryMonitor';

export interface WorldObject {
  id: string;
  name: string;
  preset: ObjectPreset;
  mesh: THREE.Mesh | THREE.Group;
  colliders: number[]; // geom IDs in MuJoCo
  onContact?: (otherId: number) => void;
  // MuJoCo specific tracking fields
  bodyName?: string;
  bodyId?: number;
  slotIndex?: number; // if pre-allocated
  isCustom?: boolean;
}

export class ObjectManager {
  private physicsEngine: PhysicsEngine;
  private scene: THREE.Scene;
  private objects: Map<string, WorldObject> = new Map();
  private audioEngine: AudioEngine;

  // Track dragging state
  private draggingObjectId: string | null = null;

  // Primitive slot pool tracking
  private slotClaimed: boolean[] = new Array(NUM_ENV_SLOTS).fill(false);
  private slotToObjectId: Map<number, string> = new Map();
  // Track which preset is active in each slot — used to bake correct sizes
  // into the MJCF XML at compile time (runtime model mutations are invisible
  // to the MuJoCo WASM collision pipeline).
  private slotPresetMap: Map<number, ObjectPreset> = new Map();

  // Pristine (unpatched) base XML used as the starting point for
  // patchSlotGeomsInXml. Without this, reloadStateAndRehydrate would use
  // getLastLoadedXml() which returns previously-patched XML, leaving stale
  // contype/conaffinity on deactivated slots.
  private pristineBaseXml: string = '';

  private eventCallback: ((type: string, data: any) => void) | null = null;

  // ── Model reload batching (Phase 1.3) ─────────────────────────────────
  // Instead of reloading the MJCF model on every spawn/delete, we defer
  // and coalesce multiple operations into a single reload per frame.
  private _physicsReloadScheduled = false;
  private _pendingReloadCount = 0;

  // ── Shared button materials (Phase 2.1) ───────────────────────────────
  // Reuse instead of creating new MeshStandardMaterial per button press
  private static readonly _buttonNormalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.1,
  });
  private static readonly _buttonPressedMat = new THREE.MeshStandardMaterial({
    color: 0xcc0000,
    roughness: 0.4,
    metalness: 0.1,
  });

  // Cache for custom mesh structures currently added to the scene to allow reloads
  public customMeshesSpec: Array<{
    id: string;
    name: string;
    preset: ObjectPreset;
    position: THREE.Vector3;
    quaternion?: THREE.Quaternion;
    options: { isTerrain: boolean; mass?: number; friction?: number; restitution?: number; skipCollision?: boolean };
    vertices: Float32Array;
    indices: Uint32Array;
    processed?: {
      hulls: Array<{ positions: number[]; indices: number[] }>;
      hullCount: number;
      sourceTriCount: number;
      version: number;
    };
  }> = [];

  constructor(physicsEngine: PhysicsEngine, scene: THREE.Scene, audioEngine: AudioEngine) {
    this.physicsEngine = physicsEngine;
    this.scene = scene;
    this.audioEngine = audioEngine;
  }

  /**
   * Schedule a deferred physics model reload. Multiple spawn/delete calls
   * within the same frame will be coalesced into a single reload, drastically
   * reducing WASM heap fragmentation from repeated model recompilations.
   */
  private scheduleReload(): void {
    this._pendingReloadCount++;
    if (this._physicsReloadScheduled) return;
    this._physicsReloadScheduled = true;

    // Use queueMicrotask so all spawn/delete operations in the current
    // synchronous block complete before the reload fires.
    queueMicrotask(() => {
      this._physicsReloadScheduled = false;
      if (this._pendingReloadCount > 0) {
        this._pendingReloadCount = 0;
        this.reloadStateAndRehydrate();
      }
    });
  }

  public setEventCallback(cb: (type: string, data: any) => void) {
    this.eventCallback = cb;
  }

  public setDraggingObject(id: string | null): void {
    this.draggingObjectId = id;
    if (id) {
      const obj = this.objects.get(id);
      if (obj && obj.bodyId !== undefined && obj.bodyId >= 0) {
        // Zero out velocities on dragging start to prevent erratic physics throws
        const world = this.physicsEngine.getWorld();
        const qvel = this.physicsEngine.qvel;
        const dofAdr = world.model.body_dofadr[obj.bodyId];
        const dofNum = world.model.body_dofnum[obj.bodyId];
        if (dofAdr !== undefined && dofNum === 6) {
          for (let i = 0; i < 6; i++) {
            qvel[dofAdr + i] = 0;
          }
        }
      }
    }
  }

  private collectMeshGeometry(root: THREE.Object3D): { vertices: Float32Array; indices: Uint32Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      const geo = child.geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) return;

      const matrix = child.matrixWorld;
      const tmp = new THREE.Vector3();

      for (let i = 0; i < posAttr.count; i++) {
        tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
        vertices.push(tmp.x, tmp.y, tmp.z);
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          indices.push(geo.index.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(vertexOffset + i);
        }
      }
      vertexOffset += posAttr.count;
    });

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
    };
  }

  /**
   * Patch the MJCF XML string to bake correct geom sizes, contype,
   * conaffinity, and friction for each active primitive slot. MuJoCo WASM
   * does NOT pick up runtime mutations of model-level properties, so the
   * correct values must be present in the XML at compilation time.
   */
  private patchSlotGeomsInXml(xml: string): string {
    let result = xml;

    for (let i = 0; i < NUM_ENV_SLOTS; i++) {
      const preset = this.slotPresetMap.get(i);
      if (!preset) continue;

      const adapterGeom = CollisionAdapter.objectPresetToMJCFGeom(preset);
      const sizeValues = adapterGeom.size.split(' ');

      const geomType = adapterGeom.geomType;
      const activeGeomName = `env_slot_${i}_${geomType}`;
      const sizeAttr = sizeValues.join(' ');
      const friction = preset.friction;

      // Replace the specific geom line: size="0.001..." → size="<actual>",
      // contype="0" conaffinity="0" → contype="2" conaffinity="3", and
      // add/replace friction attribute so it's baked into the compiled model.
      // The regex also consumes an optional trailing friction="..." to avoid
      // duplicate attributes when re-patching already-patched XML.
      const sizeRegex = new RegExp(
        `(geom\\s+name="${activeGeomName}"\\s+type="${geomType}"\\s+)size="[^"]*"\\s+contype="[^"]*"\\s+conaffinity="[^"]*"(?:\\s+friction="[^"]*")?`,
      );
      result = result.replace(sizeRegex, `$1size="${sizeAttr}" contype="2" conaffinity="1" friction="${friction}"`);
    }

    return result;
  }

  /**
   * Helper to perform scene state-capture, compilation, reload, and hydration
   */
  public reloadStateAndRehydrate() {
    this.physicsEngine.setMutating(true);
    this.physicsEngine.setReady(false);

    try {
      const module = PhysicsEngine.getModule();
      if (!module) return;

      // 1. Capture current simulation state using StateRehydrator
      const activeAgentIds = (typeof window !== 'undefined' && (window as any).__SYNTHIA_HUMANOID_BINDERS__)
        ? Array.from((window as any).__SYNTHIA_HUMANOID_BINDERS__.keys()) as string[]
        : ['agent_0'];

      const capturedState = StateRehydrator.capture(this.physicsEngine, activeAgentIds, Array.from(this.objects.values()));

      // 3. Rebuild the XML MJCF model
      let skeletonBinder: any = null;
      let baseXml = '';
      if (typeof window !== 'undefined' && typeof (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__ === 'function') {
        baseXml = (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__();
      } else {
        skeletonBinder = typeof window !== 'undefined' ? (window as any).__SYNTHIA_HUMANOID_BINDER__ : null;
        if (skeletonBinder) {
          const mbm = skeletonBinder.getMultiBodyManager();
          baseXml = mbm.getPristineBaseMjcfXml();
        } else {
          // Cache the pristine (unpatched) base XML on first call so
          // deactivated slots correctly revert to contype=0/conaffinity=0.
          // Without this, we'd re-patch from previously-patched XML.
          if (!this.pristineBaseXml) {
            this.pristineBaseXml = this.physicsEngine.getLastLoadedXml();
          }
          baseXml = this.pristineBaseXml;
        }
      }

      if (!baseXml) {
        throw new Error('Hydration error: Base MJCF is empty or uninitialized');
      }

      let combinedXml = baseXml;

      if (typeof window === 'undefined' || typeof (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__ !== 'function') {
        // Construct the combined custom model XML tags inside non-combined fallback
        const customAssets: string[] = [];
        const customBodies: string[] = [];

        this.customMeshesSpec.forEach((spec) => {
          if (spec.options?.skipCollision) return;

          const posMj = PhysicsEngine.worldToMuJoCo(spec.position);
          const quatMj = spec.quaternion
            ? PhysicsEngine.threeQuatToMuJoCo(spec.quaternion)
            : [1, 0, 0, 0];

          const hasHulls = spec.processed && spec.processed.hulls && spec.processed.hulls.length > 0;

          if (hasHulls) {
            const geomsXml: string[] = [];
            spec.processed!.hulls.forEach((hull, i) => {
              customAssets.push(`<mesh name="hull_${spec.id}_${i}" vertex="${hull.positions.join(' ')}" face="${hull.indices.join(' ')}"/>`);
              if (spec.options?.isTerrain) {
                geomsXml.push(`<geom name="custom_geom_${spec.id}_${i}" type="mesh" mesh="hull_${spec.id}_${i}" contype="1" conaffinity="2"/>`);
              } else {
                geomsXml.push(`<geom name="custom_geom_${spec.id}_${i}" type="mesh" mesh="hull_${spec.id}_${i}" contype="2" conaffinity="3"/>`);
              }
            });

            if (spec.options?.isTerrain) {
              customBodies.push(`
          <body name="custom_${spec.id}" pos="${posMj[0]} ${posMj[1]} ${posMj[2]}" quat="${quatMj[0]} ${quatMj[1]} ${quatMj[2]} ${quatMj[3]}">
            ${geomsXml.join('\n            ')}
          </body>`);
            } else {
              customBodies.push(`
          <body name="custom_${spec.id}" pos="${posMj[0]} ${posMj[1]} ${posMj[2]}" quat="${quatMj[0]} ${quatMj[1]} ${quatMj[2]} ${quatMj[3]}">
            <freejoint name="custom_${spec.id}_joint"/>
            ${geomsXml.join('\n            ')}
            <inertial pos="0 0 0" mass="${spec.preset.mass}" diaginertia="0.1 0.1 0.1"/>
          </body>`);
            }
          } else {
            const verticesStr = Array.from(spec.vertices).join(' ');
            const facesStr = Array.from(spec.indices).join(' ');

            customAssets.push(`<mesh name="mesh_${spec.id}" vertex="${verticesStr}" face="${facesStr}"/>`);

            if (spec.options?.isTerrain) {
              customBodies.push(`
          <body name="custom_${spec.id}" pos="${posMj[0]} ${posMj[1]} ${posMj[2]}" quat="${quatMj[0]} ${quatMj[1]} ${quatMj[2]} ${quatMj[3]}">
            <geom name="custom_geom_${spec.id}" type="mesh" mesh="mesh_${spec.id}" contype="1" conaffinity="2"/>
          </body>`);
            } else {
              customBodies.push(`
          <body name="custom_${spec.id}" pos="${posMj[0]} ${posMj[1]} ${posMj[2]}" quat="${quatMj[0]} ${quatMj[1]} ${quatMj[2]} ${quatMj[3]}">
            <freejoint name="custom_${spec.id}_joint"/>
            <geom name="custom_geom_${spec.id}" type="mesh" mesh="mesh_${spec.id}" contype="2" conaffinity="3"/>
            <inertial pos="0 0 0" mass="${spec.preset.mass}" diaginertia="0.1 0.1 0.1"/>
          </body>`);
            }
          }
        });

        combinedXml = injectAssetsAndBodies(baseXml, customAssets, customBodies);
      }

      // 3.5 Patch active slot geom sizes into the XML so collision works at
      //     compile time (runtime model mutations are invisible to the WASM
      //     collision pipeline).
      combinedXml = this.patchSlotGeomsInXml(combinedXml);

      // 4. Load compiled XML into the physics engine
      this.physicsEngine.loadMJCFModel(combinedXml);
      if (typeof window !== 'undefined' && typeof (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__ !== 'function' && skeletonBinder) {
        skeletonBinder.getMultiBodyManager().setCurrentBaseMjcfXml(combinedXml);
      }
      this.physicsEngine.setReady(true);

      const newWorld = this.physicsEngine.getWorld();
      const newModel = newWorld.model;

      // 5a. Run mj_setConst FIRST — it resets qpos to XML defaults.
      //     We must do this before restore() so that restore() overwrites
      //     the defaults with the saved positions.
      const setConstModule = PhysicsEngine.getModule();
      if (setConstModule) {
        setConstModule.mj_setConst(newModel, newWorld.data);
      }

      // 5b. Pre-resolve bodyIds against the NEW model so that
      //     StateRehydrator.restore() writes positions to the correct bodies.
      this.objects.forEach((obj) => {
        if (obj.isCustom) {
          if (obj.preset.id.startsWith('custom_') && obj.mesh.userData.physics?.skipCollision) {
            obj.bodyId = -1;
            return;
          }
          obj.bodyId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_BODY.value, `custom_${obj.id}`);
        } else if (obj.slotIndex !== undefined) {
          obj.bodyId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_BODY.value, `env_slot_${obj.slotIndex}`);
        }
      });

      // 5c. State rehydration — overwrites qpos with saved positions
      StateRehydrator.restore(this.physicsEngine, capturedState, Array.from(this.objects.values()));

      // Re-map IDs on all active binders if multi-agent is running
      if (typeof window !== 'undefined' && (window as any).__SYNTHIA_HUMANOID_BINDERS__) {
        (window as any).__SYNTHIA_HUMANOID_BINDERS__.forEach((binder: any) => {
          binder.getMultiBodyManager().remapIdsAgainstLoadedWorld(binder.getBoneInfoMap());
          binder.initMotorController();
        });
      }

      // Rehydrate pre-allocated slot bodies and custom models — resolve
      // body/geom IDs and colliders against the freshly-loaded model.
      this.objects.forEach((obj) => {

        let bodyId = -1;
        if (obj.isCustom) {
          if (obj.preset.id.startsWith('custom_') && obj.mesh.userData.physics?.skipCollision) {
            obj.bodyId = -1;
            obj.colliders = [];
            return;
          }
          bodyId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_BODY.value, `custom_${obj.id}`);
        } else if (obj.slotIndex !== undefined) {
          bodyId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_BODY.value, `env_slot_${obj.slotIndex}`);
        }

        if (bodyId >= 0) {
          obj.bodyId = bodyId;

          obj.colliders = [];
          if (obj.isCustom) {
            const geomId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_GEOM.value, `custom_geom_${obj.id}`);
            if (geomId >= 0) {
              obj.colliders.push(geomId);
            } else {
              let i = 0;
              while (true) {
                const gId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_GEOM.value, `custom_geom_${obj.id}_${i}`);
                if (gId >= 0) {
                  obj.colliders.push(gId);
                  i++;
                } else {
                  break;
                }
              }
            }
          } else if (obj.slotIndex !== undefined) {
            const actualPresetShapeId = obj.preset.id === 'wedge' ? 'box' : obj.preset.id;
            const activeGeomName = `env_slot_${obj.slotIndex}_${actualPresetShapeId}`;
            const geomId = module.mj_name2id(newModel, module.mjtObj.mjOBJ_GEOM.value, activeGeomName);
            if (geomId >= 0) {
              obj.colliders.push(geomId);
            }
          }
        }
      });

    } catch (error) {
      Logger.error('ObjectManager: Mesh reload and state hydration failed!', error);
    } finally {
      this.physicsEngine.setMutating(false);
    }
  }

  public spawnCustomModel(
    modelGroup: THREE.Group,
    name: string,
    position: THREE.Vector3,
    options: { isTerrain: boolean; mass?: number; friction?: number; restitution?: number; skipCollision?: boolean; processed?: any }
  ): WorldObject | null {
    const id = Math.random().toString(36).substring(2, 9);
    const mass = options.isTerrain ? 0 : (options.mass ?? 1);
    const friction = options.friction ?? 0.5;
    const restitution = options.restitution ?? 0.2;

    const group = modelGroup.clone(true);
    group.position.copy(position);
    group.name = name;
    group.userData.isSynthiaPrimitive = true;
    group.userData.objectId = id;
    group.userData.isCustomUpload = true;
    group.userData.physics = { mass, friction, restitution, skipCollision: options.skipCollision, processed: options.processed };
    this.scene.add(group);

    const preset: ObjectPreset = {
      id: `custom_${id}`,
      name,
      category: options.isTerrain ? 'Terrain' : 'Primitives',
      icon: 'Cube',
      mass,
      friction,
      restitution,
    };

    const { vertices, indices } = this.collectMeshGeometry(group);

    const worldObject: WorldObject = {
      id,
      name,
      preset,
      mesh: group,
      colliders: [],
      isCustom: true,
    };

    this.objects.set(id, worldObject);

    if (options.skipCollision) {
      // Raycast to place correct ground height
      const raycaster = new THREE.Raycaster();
      // Raycast downwards from high up
      raycaster.set(new THREE.Vector3(position.x, 100, position.z), new THREE.Vector3(0, -1, 0));
      const floorMesh = (window as any).__SYNTHIA_FLOOR_MESH__;
      if (floorMesh) {
        const intersects = raycaster.intersectObject(floorMesh, true);
        if (intersects.length > 0) {
          group.position.y = intersects[0].point.y;
        }
      }
      return worldObject;
    }

    // Add new spec to customMeshesSpec BEFORE calling the generator, making it the single source of truth
    this.customMeshesSpec.push({
      id,
      name,
      preset,
      position,
      options,
      vertices,
      indices,
      processed: options.processed
    });

    // Schedule batched reload (multiple spawns coalesce into one)
    this.scheduleReload();

    return worldObject;
  }

  public spawnObject(presetId: string, position: THREE.Vector3): WorldObject | null {
    const module = PhysicsEngine.getModule();
    if (!module) {
      Logger.error('ObjectManager.spawnObject: MuJoCo module not loaded');
      return null;
    }

    // Throttle spawns when WASM memory is critical
    if (!canSpawnObject()) {
      Logger.warn('ObjectManager.spawnObject: WASM memory critical — spawn refused');
      return null;
    }

    const preset = OBJECT_PRESETS.find((p: any) => p.id === presetId);
    if (!preset) {
      Logger.error(`ObjectManager.spawnObject: Unknown preset '${presetId}'`);
      return null;
    }

    // 1. Find an unclaimed pre-allocated pool slot
    const slotIdx = this.slotClaimed.indexOf(false);
    if (slotIdx < 0) {
      Logger.warn(`ObjectManager: Pre-allocated slots exhausted (all ${NUM_ENV_SLOTS} slots active!)`);
      return null;
    }

    const id = Math.random().toString(36).substring(2, 9);

    // 2. Set slot claimed
    this.slotClaimed[slotIdx] = true;
    this.slotToObjectId.set(slotIdx, id);

    // 3. Create visual representation in Three.js
    let geometry: THREE.BufferGeometry;
    switch (preset.id) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1);
        break;
      case 'wedge': {
        geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          -0.5, -0.5,  0.5,
           0.5, -0.5,  0.5,
          -0.5, -0.5, -0.5,
           0.5, -0.5, -0.5,
          -0.5,  0.5, -0.5,
           0.5,  0.5, -0.5
        ]);
        const indices = [
          0, 3, 1, 0, 2, 3,
          0, 1, 5, 0, 5, 4,
          2, 5, 3, 2, 4, 5,
          0, 4, 2,
          1, 3, 5
        ];
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        break;
      }
      case 'cube':
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
    }

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.name = preset.name;
    mesh.userData.isSynthiaPrimitive = true;
    mesh.userData.objectId = id;
    this.scene.add(mesh);

    const bodyName = `env_slot_${slotIdx}`;

    // 4. Record the preset so patchSlotGeomsInXml bakes correct sizes into XML
    this.slotPresetMap.set(slotIdx, preset);

    // 5. Schedule batched reload so the collision pipeline sees the correct
    //    geom sizes. Multiple spawns in the same frame coalesce into one reload.
    this.scheduleReload();

    // 6. Now that the model is reloaded with correct geometry, resolve the
    //    body and geom IDs from the fresh model and set qpos/qvel.
    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const bodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, bodyName);
    if (bodyId < 0) {
      Logger.error(`ObjectManager.spawnObject: MuJoCo body '${bodyName}' not found after reload`);
      this.objects.delete(id);
      this.slotClaimed[slotIdx] = false;
      this.slotToObjectId.delete(slotIdx);
      this.slotPresetMap.delete(slotIdx);
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      return null;
    }

    // Resolve colliders from fresh model
    const actualPresetShapeId = ['cube', 'wedge'].includes(preset.id) ? 'box' : preset.id;
    const activeGeomName = `env_slot_${slotIdx}_${actualPresetShapeId}`;
    const geomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, activeGeomName);
    if (geomId < 0) {
      Logger.error(`ObjectManager.spawnObject: MuJoCo geom '${activeGeomName}' not found after reload`);
      this.objects.delete(id);
      this.slotClaimed[slotIdx] = false;
      this.slotToObjectId.delete(slotIdx);
      this.slotPresetMap.delete(slotIdx);
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      return null;
    }

    // 7. Register the object with resolved IDs
    const worldObject: WorldObject = {
      id,
      name: preset.name,
      preset,
      mesh,
      colliders: [geomId],
      bodyName,
      bodyId,
      slotIndex: slotIdx,
    };
    this.objects.set(id, worldObject);

    // 8. Set spawn position and zero velocities
    const qposAdr = model.jnt_qposadr[model.body_jntadr[bodyId]];
    const posMj = PhysicsEngine.worldToMuJoCo(position);
    data.qpos[qposAdr] = posMj[0];
    data.qpos[qposAdr + 1] = posMj[1];
    data.qpos[qposAdr + 2] = posMj[2];
    data.qpos[qposAdr + 3] = 1;
    data.qpos[qposAdr + 4] = 0;
    data.qpos[qposAdr + 5] = 0;
    data.qpos[qposAdr + 6] = 0;

    const dofAdr = model.body_dofadr[bodyId];
    if (dofAdr >= 0) {
      data.qvel[dofAdr] = 0;
      data.qvel[dofAdr + 1] = 0;
      data.qvel[dofAdr + 2] = 0;
      data.qvel[dofAdr + 3] = 0;
      data.qvel[dofAdr + 4] = 0;
      data.qvel[dofAdr + 5] = 0;
    }

    // 9. Recompute spatial transforms so broadphase uses the correct position
    this.physicsEngine.forward();

    return worldObject;
  }

  public spawnPiano(id: string, preset: ObjectPreset, position: THREE.Vector3): WorldObject {
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = preset.name;
    group.userData.isSynthiaPrimitive = true;
    group.userData.objectId = id;
    this.scene.add(group);

    // Build Three.js visual key blocks matching the pre-allocated boxes
    for (let i = 0; i < 88; i++) {
      const isBlack = [1, 3, 6, 8, 10].includes((i + 9) % 12);
      const width = isBlack ? 0.012 : 0.022;
      const height = isBlack ? 0.022 : 0.015;
      const depth = isBlack ? 0.08 : 0.12;
      const color = isBlack ? 0x1a1a1a : 0xe8e8e8;

      const geo = new THREE.BoxGeometry(width, height, depth);
      const mat = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);

      const xOffset = (i - 44) * 0.023;
      const yOffset = isBlack ? 0.015 : 0;
      const zOffset = isBlack ? -0.02 : 0;

      mesh.position.set(xOffset, yOffset, zOffset);
      group.add(mesh);
    }

    // Activate pre-allocated piano body
    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule();

    let pianoBodyId = -1;
    const colliders: number[] = [];

    if (module) {
      pianoBodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, 'piano_body');
      if (pianoBodyId >= 0) {
        // Move piano body to spawn point
        const qposAdr = model.jnt_qposadr[model.body_jntadr[pianoBodyId]];
        const posMj = PhysicsEngine.worldToMuJoCo(position);
        data.qpos[qposAdr] = posMj[0];
        data.qpos[qposAdr + 1] = posMj[1];
        data.qpos[qposAdr + 2] = posMj[2];
        data.qpos[qposAdr + 3] = 1;
        data.qpos[qposAdr + 4] = 0;
        data.qpos[qposAdr + 5] = 0;
        data.qpos[qposAdr + 6] = 0;

        const dofAdr = model.body_dofadr[pianoBodyId];
        if (dofAdr >= 0) {
          data.qvel[dofAdr] = 0;
          data.qvel[dofAdr + 1] = 0;
          data.qvel[dofAdr + 2] = 0;
          data.qvel[dofAdr + 3] = 0;
          data.qvel[dofAdr + 4] = 0;
          data.qvel[dofAdr + 5] = 0;
        }

        // Enable collision masks (contype/conaffinity) for all 88 keys
        const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        for (let i = 0; i < 88; i++) {
          const midiNote = 21 + i;
          const octave = Math.floor(midiNote / 12) - 1;
          const noteIndex = midiNote % 12;
          const noteName = NOTE_NAMES[noteIndex] + octave;

          const geomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, `piano_${noteName}`);
          if (geomId >= 0) {
            colliders.push(geomId);
            model.geom_contype[geomId] = 2;
            model.geom_conaffinity[geomId] = 3;
          }
        }

        this.physicsEngine.forward();
      }
    }

    const worldObject: WorldObject = {
      id,
      name: preset.name,
      preset,
      mesh: group,
      colliders,
      bodyName: 'piano_body',
      bodyId: pianoBodyId,
    };

    this.objects.set(id, worldObject);
    return worldObject;
  }

  public renameObject(id: string, newName: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    obj.name = newName;
    obj.mesh.name = newName;

    if (this.eventCallback) {
      this.eventCallback('update', { id, action: 'rename', object: obj });
    }
  }

  public updateObjectPhysics(id: string, updates: { mass?: number; friction?: number; restitution?: number }): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    if (updates.mass !== undefined) obj.preset.mass = updates.mass;
    if (updates.friction !== undefined) obj.preset.friction = updates.friction;
    if (updates.restitution !== undefined) obj.preset.restitution = updates.restitution;

    const world = this.physicsEngine.getWorld();
    const model = world.model;

    obj.colliders.forEach((geomId) => {
      if (updates.friction !== undefined) {
        model.geom_friction[geomId * 3] = updates.friction;
      }
      if (updates.restitution !== undefined) {
        model.geom_solimp[geomId * 5 + 2] = 0.001;
      }
    });

    if (obj.mesh) {
      obj.mesh.userData.physics = {
        mass: obj.preset.mass,
        friction: obj.preset.friction,
        restitution: obj.preset.restitution,
      };
    }
  }

  public setGlobalFriction(friction: number): void {
    this.objects.forEach((obj) => {
      obj.preset.friction = friction;
      this.updateObjectPhysics(obj.id, { friction });
    });
  }

  public setObjectPosition(id: string, position: THREE.Vector3, quaternion?: THREE.Quaternion): void {
    const obj = this.objects.get(id);
    if (!obj || obj.bodyId === undefined || obj.bodyId < 0) return;

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    const jntAdr = model.body_jntadr[obj.bodyId];
    if (jntAdr < 0) return;

    const qposAdr = model.jnt_qposadr[jntAdr];
    const dofAdr = model.body_dofadr[obj.bodyId];

    const posMj = PhysicsEngine.worldToMuJoCo(position);
    data.qpos[qposAdr] = posMj[0];
    data.qpos[qposAdr + 1] = posMj[1];
    data.qpos[qposAdr + 2] = posMj[2];

    if (quaternion) {
      const quatMj = PhysicsEngine.threeQuatToMuJoCo(quaternion);
      data.qpos[qposAdr + 3] = quatMj[0];
      data.qpos[qposAdr + 4] = quatMj[1];
      data.qpos[qposAdr + 5] = quatMj[2];
      data.qpos[qposAdr + 6] = quatMj[3];
    }

    // Zero out velocities to ensure accurate static placement
    if (dofAdr >= 0) {
      data.qvel[dofAdr] = 0;
      data.qvel[dofAdr + 1] = 0;
      data.qvel[dofAdr + 2] = 0;
      data.qvel[dofAdr + 3] = 0;
      data.qvel[dofAdr + 4] = 0;
      data.qvel[dofAdr + 5] = 0;
    }
  }

  public deleteObject(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    this.scene.remove(obj.mesh);
    if (obj.mesh instanceof THREE.Mesh) {
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
    } else {
      obj.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }

    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    // Reset geom collision/size bounds on slot releasing
    if (obj.slotIndex !== undefined) {
      this.slotClaimed[obj.slotIndex] = false;
      this.slotToObjectId.delete(obj.slotIndex);
      this.slotPresetMap.delete(obj.slotIndex);

      // Move body far below scene so StateRehydrator does not restore it
      if (obj.bodyId !== undefined && obj.bodyId >= 0) {
        const qposAdr = model.jnt_qposadr[model.body_jntadr[obj.bodyId]];
        data.qpos[qposAdr] = 0;
        data.qpos[qposAdr + 1] = 0;
        data.qpos[qposAdr + 2] = -10;

        const dofAdr = model.body_dofadr[obj.bodyId];
        if (dofAdr >= 0) {
          data.qvel[dofAdr] = 0;
          data.qvel[dofAdr + 1] = 0;
          data.qvel[dofAdr + 2] = 0;
          data.qvel[dofAdr + 3] = 0;
          data.qvel[dofAdr + 4] = 0;
          data.qvel[dofAdr + 5] = 0;
        }
      }

      // Remove from objects map BEFORE reload so StateRehydrator skips it
      this.objects.delete(id);

      // Schedule batched reload so the slot geom reverts to size=0.001 / contype=0
      this.scheduleReload();
      return;
    } else if (obj.isCustom) {
      // Custom uploaded dynamic meshes: remove spec and schedule batched reload
      this.customMeshesSpec = this.customMeshesSpec.filter(spec => spec.id !== id);
      this.scheduleReload();
    }

    this.objects.delete(id);
  }

  public getObjects(): Map<string, WorldObject> {
    return this.objects;
  }

  public syncVisuals() {
    const world = this.physicsEngine.getWorld();
    const model = world.model;
    const data = world.data;

    this.objects.forEach((obj) => {
      if (obj.bodyId === undefined || obj.bodyId < 0) return;

      const jntAdr = model.body_jntadr[obj.bodyId];
      if (jntAdr < 0) return;

      const qposAdr = model.jnt_qposadr[jntAdr];

      if (obj.id === this.draggingObjectId) {
        // Direct kinematic visual mapping
        const posMj = PhysicsEngine.worldToMuJoCo(obj.mesh.position);
        data.qpos[qposAdr] = posMj[0];
        data.qpos[qposAdr + 1] = posMj[1];
        data.qpos[qposAdr + 2] = posMj[2];

        const quatMj = PhysicsEngine.threeQuatToMuJoCo(obj.mesh.quaternion);
        data.qpos[qposAdr + 3] = quatMj[0];
        data.qpos[qposAdr + 4] = quatMj[1];
        data.qpos[qposAdr + 5] = quatMj[2];
        data.qpos[qposAdr + 6] = quatMj[3];
      } else {
        // MuJoCo positions (p_mj = [x, y, z]) converted back to Three.js coordinates
        const x_mj = data.qpos[qposAdr];
        const y_mj = data.qpos[qposAdr + 1];
        const z_mj = data.qpos[qposAdr + 2];
        const posThree = PhysicsEngine.mujocoToWorld([x_mj, y_mj, z_mj]);
        obj.mesh.position.set(posThree.x, posThree.y, posThree.z);

        const qW = data.qpos[qposAdr + 3];
        const qX = data.qpos[qposAdr + 4];
        const qY = data.qpos[qposAdr + 5];
        const qZ = data.qpos[qposAdr + 6];
        const rotThree = PhysicsEngine.mujocoQuatToThree([qW, qX, qY, qZ]);
        obj.mesh.quaternion.set(rotThree.x, rotThree.y, rotThree.z, rotThree.w);
      }
    });
  }

  public update() {
    const module = PhysicsEngine.getModule();
    if (!module) return;

    const world = this.physicsEngine.getWorld();
    const pairs = CollisionAdapter.getCollisionPairs(module, world.model, world.data);

    // Track triggered note events to prevent duplicate frame fires
    const triggeredNotes = new Set<string>();

    pairs.forEach((pair) => {
      // 1. Piano Notes Detection: Check if either geom matches piano_key sequence
      const pianoKeyPrefix = 'piano_';
      let keyGeomName: string | null = null;
      if (pair.name1.startsWith(pianoKeyPrefix)) keyGeomName = pair.name1;
      else if (pair.name2.startsWith(pianoKeyPrefix)) keyGeomName = pair.name2;

      if (keyGeomName) {
        const note = keyGeomName.substring(pianoKeyPrefix.length);
        if (!triggeredNotes.has(note)) {
          triggeredNotes.add(note);
          if (this.eventCallback) {
            this.eventCallback('piano_note', { note, agentId: extractAgentIdFromPair(pair) });
            this.audioEngine.playNote(note);
          }
        }
      }

      // 2. Button Press Callback: check if either geom belongs to a claims slot of a button primitive
      this.objects.forEach((obj) => {
        if (obj.preset.id === 'button') {
          if (obj.colliders.includes(pair.geom1Id) || obj.colliders.includes(pair.geom2Id)) {
            if (this.eventCallback) this.eventCallback('button_press', { id: obj.id, agentId: extractAgentIdFromPair(pair) });

            if (obj.mesh instanceof THREE.Mesh) {
              obj.mesh.material = ObjectManager._buttonPressedMat;
              setTimeout(() => {
                if (obj.mesh && obj.mesh instanceof THREE.Mesh) {
                  obj.mesh.material = ObjectManager._buttonNormalMat;
                }
              }, 200);
            }
          }
        }
      });
    });
  };
}

/**
 * Given a collision pair, extract the agentId from the colliding agent's geom prefix.
 * Returns '' if the pair contains no agent-identified geoms.
 */
function extractAgentIdFromPair(pair: ContactPair): string {
  const GEOM_PREFIX = 'agent_';
  for (const name of [pair.name1, pair.name2]) {
    const idx = name.indexOf(GEOM_PREFIX);
    if (idx !== -1) {
      const prefixEnd = idx + GEOM_PREFIX.length;
      const slashIdx = name.indexOf('/', prefixEnd);
      if (slashIdx !== -1) return name.substring(idx, slashIdx);
      const nextUnderscore = name.indexOf('_', prefixEnd);
      return nextUnderscore >= 0 ? name.substring(idx, nextUnderscore) : name.substring(idx);
    }
  }
  return '';
}
