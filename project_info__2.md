# SYNTHIA — Custom Rigged Model Integration: Feasibility & Architecture Report

## Summary

SYNTHIA is a browser-native embodied AI research platform. It runs a continuous cognitive loop (perceive → think → act → remember) driving an **~80-joint Mixamo humanoid** inside a MuJoCo WASM physics simulation. The user's task is to **extend the system to support arbitrary custom rigged 3D models** (`.glb`, `.gltf`, `.fbx`) — detect their kinematic chains, bind joints to MuJoCo degrees-of-freedom, actuate them with position servos, retarget the proprioception/vision sensors, and export the custom embodiment as a training-dataset preset. This report evaluates the **current hardcoding surface**, the **feasibility of each feature**, the **RAM/WASM heap & CPU cost consequences**, and lays out a **phased implementation plan**.

---

## Current Architecture: Where Custom Models Are Blocked

The codebase is **already architecture-ready for generic bodies at the interface level, but the implementation is deeply hardcoded to the Mixamo humanoid.** The generic signatures exist; the internals are Mixamo-specific.

### Hardcoded Surface Audit

| Area | File | Hardcode |
|---|---|---|
| Model loading | `src/world/engine/HumanoidPhysicsBinder.ts` | `loader.load('/models/x-bot.glb', ...)` — hardcoded GLB path, no way to load custom |
| Bone type map | `src/world/engine/MJCFHumanoidTemplate.ts` | `BONE_JOINT_TYPE: Record<string, JointType>` — only `mixamorig*` names; `CAPSULE_ATTACH_BONES = new Set(['mixamorighips'])`; `getPhysicsParentName` filters by Mixamo names |
| Rig limits | `src/constants/rigConstraints.ts` | `SYNTHIA_RIG_CONSTRAINTS: Record<string, JointLimit>` — every key is `mixamorig*` |
| Physics matrix | `src/constants/physics.ts` | `COMPLETE_MIXAMO_PHYSICS_MATRIX` — mass & inertia per Mixamo bone name |
| Anatomical limits | `src/constants/anatomicalLimits.ts` | `getAnatomicalLimitForBone()` — pattern-matches `knee`, `upleg`, `foot`, `spine`, etc. — all assume Mixamo naming |
| Balance controllers | `src/world/engine/HumanoidPhysicsBinder.ts` | `REFLEX_HIP_BONE(side)` returns `mixamorigleftupleg`/`mixamorigrightupleg`; `REFLEX_SPINE2_BONE = 'mixamorigspine2'`; foot detection uses `mixamorigleftfoot`/`mixamorigrightfoot` |
| Joint aliases | `src/world/engine/HumanoidPhysicsBinder.ts` | `resolveJointAlias(name)` — hardcoded `JOINT_ALIASES` map (e.g. `right_knee` → `mixamorigrightleg`) |
| Observation layout | `src/world/engine/ObservationBuilder.ts` | `VLM_KEY_JOINTS` — hardcoded `['pelvis', 'torso', 'neck', 'head', ...]` |
| Action parsing | `src/world/agent/AgentLoop.ts` | `parseAndValidateAction()` — normalizes joint names; no generic schema handling |
| Prompt schema | `src/world/agent/PromptAssembler.ts` | `buildP02BodySchema()` — hardcodes "approximately 80 joints and 120 degrees of freedom", "two arms with hands and fingers" |
| Body type UI | `src/components/godmode/BodyControls.tsx` | `isDisabled = config.id !== 'humanoid'` — non-humanoid types are shown but disabled |
| World store | `src/store/worldStore.ts` | `setBodyType()` warns `"Body type ${bodyType} is currently disabled"` and returns early unless `humanoid` |
| Export | `src/utils/clientDatasetExporter.ts` | Exports memories only — no embodiment/preset bundle |

### The Good News

The MJCF generator signature **already accepts a generic `boneInfoMap`**:

```typescript
export function generateAgentSubtreeMJCF(
  boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>,
  capsuleCenterY: number,
  pMatrix: any,
  rConstraints: any,
  prefix: string
): { bodyXml: string; actuatorsXml: string[] }
```

This means the **tree-walking and body/actuator emission logic is already generic** — it just needs a **generic `BONE_JOINT_TYPE`, `CAPSULE_ATTACH_BONES`, `getPhysicsParentName`** supply. The current hardcoded ones are Mixamo-specific.

Similarly:
- **`MotorController`** is fully generic — takes `actuatorMap: Map<string, number[]>` and applies PD position control.
- **`ObservationBuilder`** is generic — takes any joint body map.
- **`AvatarSynchronizer`** is generic — synchronizes any bone ↔ rigid-body pair.
- **`BodyManager`** is generic — maps any bone name to MuJoCo body/geom/actuator IDs.
- **`PhysicsEngine`** is generic — loads any MJCF XML.

So the **core physics machinery is reusable; only the kinematic + constraints layers are locked**.

---

## Feature-by-Feature Feasibility

### 1. Custom rigged avatar upload (.glb, .gltf, .fbx)

**Feasibility: High (easy for .glb/.gltf, Medium for .fbx)**

- `.glb` / `.gltf` already work in `ObjectSpawner.tsx` via `GLTFLoader` and `uploadedModelsStore.ts` (IndexedDB). No auth needed — purely client-side. ✅
- `.fbx` requires `FBXLoader` from `three/examples/jsm/loaders/FBXLoader.js`. It's pure JS, no auth. However, FBX files often have **external texture references** (`.tga`, `.png` paths) that the no-auth client-side workflow cannot resolve → textures lost. Need a warning in the UI.
- Currently the upload flow saves the **arrayBuffer** to IndexedDB — perfect for later model-as-body reuse. ✅

### 2. Automatic kinematic chain mapping & joint DOF binding

**Feasibility: Medium-High (good for humanoid-adjacent skeletons, imperfect for arbitrary robots)**

The detection algorithm:
1. Load GLB/GLTF → find `SkinnedMesh` → `.skeleton.bones`
2. Build parent tree from bone hierarchy (already exposes parent/children)
3. **Classify joints** by heuristics:
   - **Root**: bone with no parent, or the bone named `root`/`hips`/`pelvis`/`base`/`spine`
   - **1-DOF (hinge/revolute)**: bone with a single child whose local rotation axis is consistent with a hinge (elbow, knee, finger segment) — detectable by checking the local matrix's rotation components, or by name regex (`elbow`, `knee`, `forearm`, `leg`, `finger`, `toe`)
   - **2-DOF**: ankle/wrist — name regex (`foot`, `hand`, `ankle`, `wrist`)
   - **3-DOF (spherical)**: shoulder/hip/spine/head — name regex, or bones with 2+ children, or bones near the root
4. **Infer axis order**: for each bone, in rest pose, compute the bone's local axes. In Three.js convention, bone Y typically points along the bone (parent→child). The rotation axes are the perpendicular axes (X and Z). The current Mixamo code uses `ZXY` Euler order for spherical joints. A generic mapper would detect the "natural" axis from the bone's local matrix and set `axisOrder` accordingly.
5. **Infer limits**: if the GLB has animation clips, scan max/min rotation per axis per bone. Otherwise, use defaults: ±45° for generic limbs, ±120° for root-adjacent joints, `[0, 150°]` for single-DOF flexion joints.

**Key challenge**: The DOF classification is heuristic. A badly-rigged model (no naming conventions, unusual hierarchy) may mis-classify. **Mitigation**: expose a "joint review UI" where the user can visually see detected joints and adjust DOF/axis/limits before activation.

### 3. Deep integration into MuJoCo physics engine & motor torque actuation

**Feasibility: High (with refactoring)**

The generic `generateAgentSubtreeMJCF` already emits bodies/joints/actuators. What's needed:

1. Refactor `MJCFHumanoidTemplate.ts` to accept a `KinematicMap` instead of the hardcoded Mixamo `BONE_JOINT_TYPE`.
2. The `CAPSULE_ATTACH_BONES` and `getPhysicsParentName` should be **derived from the KinematicMap's root node**, not hardcoded.
3. The `motor torque actuation` is already position-PD via the generic `MotorController`. ✅ — no changes needed beyond supplying the actuatorMap.

**Collision geometry**: The current system emits a **sphere collider per bone** (except feet which get boxes). A generic mapper would do the same: sphere per bone, radius from bone length/child distance. For hands/feet, try to detect `foot`/`hand` by name → box collider.

**V-HACD for the body mesh**: The existing `vhacdDecomposer.ts` is already used for custom objects. For the agent body, the collision can be:
- **Option A (simple)**: use the generic sphere-per-bone colliders (no V-HACD needed). This is the current approach and works well.
- **Option B (accurate)**: V-HACD the custom body mesh and embed hulls as `<geom type="mesh">`. Higher fidelity but adds MJCF string size and WASM compile cost.

**Recommendation**: Start with Option A. Add V-HACD later for specific parts (feet, hands).

### 4. Proprioception & vision sensor retargeting for custom body meshes

**Feasibility: Medium-High**

Vision retargeting:
- The current `getHeadTransform()` searches `boneInfoMap` for a bone containing `"head"`. For custom models, I'd search for a "camera" or "sensor" bone by name (`head`, `camera`, `sensor`, `eye`, `Hips` as fallback). If none found, fall back to the root capsule center + default forward vector.
- The `CameraManager` already handles arbitrary camera positions — ✅.

Proprioception retargeting:
- `ObservationBuilder.buildVLMProprioception()` uses the hardcoded `VLM_KEY_JOINTS`. Change it to accept a `jointKeyList` parameter derived from the KinematicMap.
- The `BodyProxy` in `HumanoidPhysicsBinder.ts` already provides generic `translation()`, `rotation()`, `linvel()`, `angvel()` — ✅.

### 5. No authentication — purely client-side

**Feasibility: Already true.** ✅ All uploads go to IndexedDB. V-HACD runs in a Web Worker. MuJoCo WASM is bundled. No server-side calls except optional inference providers (which use the user's own API key).

### 6. Custom embodiment presets exportable directly with training datasets

**Feasibility: Medium-High**

New data structure needed:

```typescript
interface EmbodimentPreset {
  id: string;
  name: string;
  modelType: 'glb' | 'gltf' | 'fbx';
  arrayBuffer: ArrayBuffer | null; // raw model bytes
  kinematicMap: KinematicNode[];   // joints, DOF, axes, limits
  rigConstraints: Record<string, JointLimit>;
  physicsMatrix: Record<string, BonePhysicalProperties>;
  boneRoleMap: BoneRoleMap;        // root, head, footL, footR, etc.
  actionSchema: {                    // for the LLM
    jointNames: string[];
    jointTypes: Record<string, 1 | 2 | 3>;
    axisDescriptions: Record<string, string>;
  };
  bodyType: 'humanoid' | 'quadruped' | 'robotic_arm' | 'custom';
}
```

This bundles into a `.synthia-body.json` (or `.zip`) file. The `clientDatasetExporter.ts` would add an `embodiment_preset` export type that bundles the preset JSON alongside the memories dataset.

---

## Cost & Consequence Analysis

### RAM / WASM Heap Impact — THE KEY RISK

The current system already has **explicit memory guards**:
- `PhysicsEngine.isWasmMemoryCritical()` — stops physics if `usedJSHeapSize > 1.8GB`
- `memoryMonitor.ts` — warns at 1.4GB, critical at 1.8GB
- `ObjectManager.spawnObject()` — blocks spawn if `canSpawnObject()` returns false at critical

**Heap eaters per custom body:**

| Component | Size estimate | Heap Type |
|---|---|---|
| Raw GLB file | 1–50 MB | IndexedDB (not heap) |
| Three.js geometry + textures | 10–200 MB | GPU memory (not JS heap) |
| MuJoCo model (bodies, geoms, joints, actuators) | ~1–2 MB per agent (80 bodies) | WASM heap |
| MuJoCo data (qpos/qvel/ctrl arrays) | ~500 KB per agent | WASM heap |
| MJCF string (generated per reload) | 50–150 KB | JS heap (temporary, GC'd) |
| V-HACD hulls in MJCF mesh data | 35–100 KB per object | MJCF string → WASM model |
| Contact registry | ~1 MB max (capped at 4096 entries) | JS heap |

**The real danger is the MJCF string size with V-HACD mesh data.** A complex model (50k+ tris) decomposed into 24 hulls × 48 verts = ~3.5K floats = ~35KB of mesh data in the MJCF string. MuJoCo compiles this into its internal model. **Adding one custom agent with V-HACD could push a double-agent world to the 1.8GB critical limit.**

**Mitigations:**
1. **Use sphere-per-bone colliders for the agent body** (Option A above) instead of V-HACD. This keeps the MJCF small.
2. **Cap custom model triangle count** (e.g., 50k) before V-HACD is applied.
3. **Cache V-HACD results in IndexedDB** (already done via `processed` field).
4. **Limit total custom agents** in the world — enforce a soft cap (e.g., 4 agents with custom bodies).
5. **Only load the active custom model** — don't load all saved models into memory simultaneously.
6. **Use `skipCollision` for very complex models** — the AI can still control the body (physics is driven by joint servos), only ground contact is lost.

### CPU Cost

- **MJCF generation**: O(bones) string concatenation. For 80 bones, ~1-5ms. For 200+ bones (very detailed), ~10-20ms. Every object spawn triggers a full world recompile, so this adds to the existing cost.
- **MuJoCo solve**: Each additional DOF adds to the solver time. The current model uses `iterations="100"` (single) or `"200"` (multi-agent). A 300-DOF custom body could make the fixed-step take longer → frame drops at 60Hz.
- **V-HACD**: runs in a Worker (off-main-thread). One-time cost per model upload. ✅

### Regression Risk & Code Bloat

**The #1 risk is breaking the default x-bot humanoid.** The generalization touches:
- `HumanoidPhysicsBinder.ts` (core physics)
- `MJCFHumanoidTemplate.ts` (MJCF generation)
- `useWorld.ts` (spawning logic)
- `PromptAssembler.ts` (LLM contract)

**Strategy to de-risk:**
- Keep the Mixamo path **completely untouched** as the "legacy" path.
- Add a **runtime-selected generator**: `HumanoidPhysicsBinder` takes a `BodyTemplateProvider` interface. When `bodyType === 'humanoid'`, it uses the existing `generateHumanoidMJCF`. When `custom`, it uses the new `generateCustomBodyMJCF`.
- The balance controllers (`ComReflexController`, `ReactionMassController`, `MotorController.applyCapsuleBalance`) are **humanoid-specific**. For non-humanoid bodies, disable them by default (`if (bodyType !== 'humanoid') skip`). This avoids nonsensical "lean reflexes" on a quadruped.

### AI Behavior & Token Cost

- The LLM needs the custom body's **joint schema**. For an 80-joint humanoid, the current prompt is ~4-6k tokens. A quadruped (+12 joints) or arm (+6 joints) adds ~1-3k tokens for the schema. **Estimated cost increase: 20-50% per cycle.**
- The `valid_joints` list in the payload already feeds the LLM. This is **already generic** — ✅. But the prompt's hardcoded "two arms, two legs" text in `buildP02BodySchema` must become dynamically generated from the KinematicMap.
- The action parsing (`AgentLoop.parseAndValidateAction`) needs to accept a **generic joint list** instead of assuming the Mixamo naming. This is a small change (the `normalizeRaw` function is already generic).

### Dataset Export Interoperability

- The current LeRobot export expects fixed-dimension `action` arrays. Custom bodies produce **variable-length actions** (different joint counts). This breaks standard LeRobot consumers.
- **Mitigation**: add a `body_type` and `joint_names` field to each export row. Document that the action dimension is body-specific. For `dataset` format, add an `embodiment_preset` column or separate file.

---

## Recommended Implementation Plan

### Phase 0 — Exploration (DONE)
- Audit hardcoded surface (this report).

### Phase 1 — Kinematic Chain Mapper (~500-800 lines)
- New file: `src/world/engine/KinematicChainMapper.ts`
- Input: `THREE.Skeleton`, `THREE.Group`, optional animation clips
- Output: `KinematicMap`:
  ```typescript
  interface KinematicNode {
    name: string;
    parent: string | null;
    dof: 0 | 1 | 2 | 3;
    axisOrder: 'ZXY' | 'XYZ';
    limits: [number, number][];
    defaultAngles: number[];
    isTerminal: boolean;
    isCameraMount: boolean;
  }
  interface KinematicMap {
    rootNode: string;
    nodes: Record<string, KinematicNode>;
    boneRoleMap: {
      root: string;
      head: string | null;
      footL: string | null;
      footR: string | null;
      spine2: string | null;
      hipL: string | null;
      hipR: string | null;
      kneeL: string | null;
      kneeR: string | null;
      ankleL: string | null;
      ankleR: string | null;
    };
  }
  ```
- Heuristics: name-based DOF classification + rest-pose axis detection + animation range extraction.
- **Key**: expose a debug viewer so users can inspect the detected kinematic map before activating.

### Phase 2 — Generic MJCF Generator Refactor (~300-500 lines)
- Refactor `MJCFHumanoidTemplate.ts`:
  - Extract `generateAgentSubtreeMJCF` to accept a `GenericJointSpec[]` instead of relying on `BONE_JOINT_TYPE`.
  - The `CAPSULE_ATTACH_BONES` and `getPhysicsParentName` become derived from the KinematicMap.
  - Emit generic sphere colliders per bone; box colliders for `foot`/`hand` roles.
- New function: `generateCustomBodyMJCF(kinematicMap, pMatrix, rConstraints, capsuleCenter, prefix)`.

### Phase 3 — Physics Matrix Estimator (~200-300 lines)
- New file: `src/utils/kinematicPhysicsEstimator.ts`
- Given bone world positions (bind pose), estimate mass per segment:
  - Use the existing `COMPLETE_MIXAMO_PHYSICS_MATRIX` as a ratio template.
  - Scale by bone length / segment volume estimated from `Box3`.
  - Allow user override (mass slider in UI).

### Phase 4 — Custom Rig Constraints Generator (~200-300 lines)
- New file: `src/constants/customRigConstraints.ts`
- Generate `Record<string, JointLimit>` from the KinematicMap. This is the **key integration point** — the existing MJCF generator already reads `rConstraints[boneName]`.

### Phase 5 — HumanoidPhysicsBinder Generalization (~300-500 lines)
- Modify constructor to accept:
  - `modelSource: string | ArrayBuffer` (instead of hardcoded `/models/x-bot.glb`)
  - `bodyTemplate?: BodyTemplateProvider` (interface with `generateMJCF()`, `getKinematicMap()`, `getPhysicsMatrix()`, `getRigConstraints()`, `getBoneRoleMap()`)
- `getHeadTransform()`: use `boneRoleMap.head` (or camera-mount bone) instead of searching for `"head"`.
- Balance controllers: gate on `bodyType !== 'humanoid'` → no-op.
- `resolveJointAlias()`: build dynamic aliases from KinematicMap instead of hardcoded `JOINT_ALIASES`.

### Phase 6 — useWorld Spawn Integration (~300-500 lines)
- Modify `spawnAgent()` to:
  - If `worldStore.customModelId` is set, load the saved GLB from `uploadedModelsStore`, run `KinematicChainMapper`, build the custom template, and pass it to the `HumanoidPhysicsBinder`.
  - If `bodyType !== 'humanoid'`, skip humanoid-specific balance controller setup.

### Phase 7 — Prompt & Action Schema Generalization (~200-400 lines)
- `PromptAssembler.buildP02BodySchema()`: generate dynamic body schema from KinematicMap (joint names, DOF, roles).
- `AgentLoop.parseAndValidateAction()`: accept a `jointSchema` from the payload; normalize joint names against the custom schema.
- Add a "Body Schema" panel in the AgentSettings/GodMode UI where users can see the detected joints.

### Phase 8 — Proprioception & Vision Retargeting (~200-300 lines)
- `ObservationBuilder.buildVLMProprioception()`: accept `VLM_KEY_JOINTS` as a parameter.
- `HumanoidPhysicsBinder.getHeadTransform()`: use camera-mount bone; fall back to root + forward vector.

### Phase 9 — Embodiment Preset Export (~150-250 lines)
- New type in `src/types/export.ts`: `EmbodimentPreset`.
- `clientDatasetExporter.ts`: add `exportType === 'embodiment_preset'` which bundles GLB arrayBuffer + KinematicMap + rigConstraints + physicsMatrix + BoneRoleMap + actionSchema.
- UI: add "Export Embodiment Preset" button in GodMode panel.

### Phase 10 — UI for Model Selection (~300-500 lines)
- Reuse `ObjectSpawner.tsx` upload flow but for "body" instead of "object".
- Add "Use as Agent Body" button in the saved models panel.
- Add a "Body Type" selector that enables `custom` when custom models are uploaded.
- Add a "Joint Review" modal showing detected joints with DOF/axis/limit editing.

### Phase 11 — Tests & Regression (~300-500 lines)
- Unit tests for `KinematicChainMapper` using a synthetic skeleton.
- Integration test: load a custom GLB, generate MJCF, verify joint/actuator counts.
- Regression: ensure `mixamo-x-bot` still loads and walks identically.

---

## Estimated Total Effort

| Phase | Lines | Effort (dev-days) |
|---|---|---|
| KinematicChainMapper | 500-800 | 2-3 |
| MJCF Generator Refactor | 300-500 | 1-2 |
| Physics Matrix Estimator | 200-300 | 0.5-1 |
| Custom Rig Constraints | 200-300 | 0.5-1 |
| HumanoidPhysicsBinder Generalization | 300-500 | 2-3 |
| useWorld Spawn Integration | 300-500 | 1-2 |
| Prompt/Action Schema | 200-400 | 1-1.5 |
| Proprioception/Vision Retarget | 200-300 | 1-1.5 |
| Embodiment Export | 150-250 | 0.5-1 |
| UI | 300-500 | 1-2 |
| Tests | 300-500 | 1-1.5 |
| **Total** | **~2,900-4,800** | **~12-20 dev-days** |

---

## Top 5 Hidden Risks & Mitigations

1. **WASM heap overflow** with custom bodies + objects.
   - **Mitigation**: Sphere-per-bone colliders; cap triangle count; cap custom agents; use `skipCollision` when heap critical.

2. **Breaking the default Mixamo humanoid.**
   - **Mitigation**: Keep Mixamo path untouched as "legacy"; feature-gate the custom path; add regression test.

3. **Mis-classified joints on non-standard rigs** (weird bone names/hierarchy).
   - **Mitigation**: Provide a "Joint Review" UI with manual overrides; use conservative defaults (2-3 DOF for ambiguous bones).

4. **Scale mismatch** (cm vs m, feet vs meters).
   - **Mitigation**: Compute model bounding box at load; normalize scale so the "root" length matches ~1.7m for humanoids; warn user about extreme aspect ratios.

5. **V-HACD is slow/heavy for large models.**
   - **Mitigation**: Run in a Worker with abort support (already done in `ObjectSpawner.tsx`); recommend `skipCollision` for >50k tri models; cache results.

---

## Suggested Reading Order (for developers)

1. `src/world/engine/MJCFHumanoidTemplate.ts` — Understand the generic MJCF generator (the most reusable piece).
2. `src/world/engine/HumanoidPhysicsBinder.ts` — Understand the hardcoded Mixamo bindings (the most fragile piece).
3. `src/constants/rigConstraints.ts` + `src/constants/physics.ts` — Understand the constraint & physics data formats.
4. `src/world/agent/PromptAssembler.ts` — Understand the LLM body-schema contract.
5. `src/components/godmode/ObjectSpawner.tsx` — Understand the existing GLB/GLTF upload + V-HACD flow (the foundation for the avatar upload).

---

## Conclusion

**This feature is feasible and should be pursued.** The architecture is already 80% generic at the interface level — the missing piece is replacing the hardcoded Mixamo constants with a **runtime-generated KinematicMap** + **generic MJCF emitter** + **dynamic constraint/physics tables**. The main risks are **WASM heap overflow** (mitigable through collider choice & caps) and **regression of the default humanoid** (mitigable through a feature-gated additive path).

The 6 requirements map cleanly to the 12-phase plan. Total effort is **~2,900-4,800 lines of TypeScript (~12-20 dev-days)**. The cost in RAM is dominated by MuJoCo grid and MJCF string size, not the raw model file. The cost in CPU is dominated by MJCF recompiles on object spawns (already present) and MuJoCo solve iterations on high-DOF bodies.

**Recommended starting point**: Build `KinematicChainMapper.ts` first (Phase 1). It is self-contained, testable with a synthetic skeleton, and unblocks every subsequent phase.
