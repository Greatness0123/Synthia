# Synthia v1.5 — Codebase Overview (MuJoCo Physics Engine Focus)

## Summary
Synthia is a browser-based AI agent simulation platform that combines a MuJoCo physics engine (WebAssembly), a Three.js 3D rendering layer, and an LLM-powered coordinator backend to create autonomous, physically-simulated humanoid agents. The humanoid avatar (loaded from a `x-bot.glb` GLTF model) is driven by PD (proportional-derivative) motor controllers mapped onto MuJoCo hinge joints, with the AI coordinator sending joint angle targets via WebSocket. The primary visual client is a React + Vite frontend with a layered engine architecture.

## Architecture
**Primary pattern**: Layered engine architecture with React hooks as the glue layer.

Three major subsystems:

1. **Rendering Layer** (`WorldEngine`, `CameraManager`) — Three.js WebGL scene, camera controls, lights, AI frame capture
2. **Physics Engine Layer** (`PhysicsEngine`, `BodyManager`, `MotorController`, `MJCFHumanoidTemplate`, `HumanoidPhysicsBinder`) — MuJoCo WASM physics, MJCF XML model generation, PD motor control
3. **Coordinator Backend** (`coordinator/src/`) — Node.js server with agent loop, LLM providers (Gemini, OpenAI-compatible, Kaggle), payload building, memory management

**Tech stack**: React 18, Vite 8, TypeScript 6, Three.js 0.184, MuJoCo WASM 3.10, Zustand 5, Tailwind CSS 3, Express/WS on the coordinator side.

**Execution entry point**:
1. `index.html` → `src/main.tsx` → `src/App.tsx` renders the React app
2. `src/world/hooks/useWorld.ts` — single `useEffect` that initializes `PhysicsEngine` (WASM), `AudioEngine`, `WorldEngine` (Three.js), `ObjectManager`, `HumanoidPhysicsBinder` in sequence
3. `WorldEngine.start()` begins the rAF animation loop at 60fps, stepping physics at a fixed 500Hz timestep

## Directory Structure (annotated)

```
synthiav1.5/
├── src/
│   ├── world/engine/              — Core engines (physics, rendering, audio, objects)
│   │   ├── PhysicsEngine.ts       — MuJoCo WASM lifecycle: init, load MJCF, step, contact forces
│   │   ├── BodyManager.ts         — Generates MJCF XML, loads model, maps bone names → MuJoCo body/geom/actuator IDs
│   │   ├── MJCFHumanoidTemplate.ts — Generates the full humanoid MJCF XML string from bone positions
│   │   ├── MotorController.ts     — Sets PD motor targets on MuJoCo actuators, applies balance torques
│   │   ├── HumanoidPhysicsBinder.ts — Orchestrates the 4-step build pipeline (A→D), timeline execution
│   │   ├── WorldEngine.ts         — Three.js renderer, camera, lights, floor, animation loop
│   │   ├── CameraManager.ts       — Orbit/free camera, TransformControls, AI frame offscreen capture
│   │   ├── ObjectManager.ts       — Spawn/delete/sync interactive objects (piano, buttons, blocks)
│   │   ├── AudioEngine.ts         — Tone.js audio pipeline, PCM buffer capture for AI
│   │   ├── ObservationBuilder.ts  — Builds proprioception vectors and VLM-formatted observations
│   │   ├── AvatarSynchronizer.ts  — Syncs MuJoCo rigid body transforms → Three.js bone quaternions
│   │   ├── CollisionAdapter.ts    — Reads MuJoCo contacts, maps preset shapes to MJCF geoms
│   │   └── PhysicsDiagnostic.ts   — Runtime jitter diagnostic tool (DevTools console API)
│   ├── world/hooks/
│   │   ├── useWorld.ts            — Central React hook: init, lifecycle, event wiring, diagnostics ring buffer
│   │   └── useCoordinator.ts      — WebSocket connection to coordinator backend
│   ├── world/contexts/
│   │   └── CoordinatorContext.tsx  — React context provider wrapping useCoordinator
│   ├── store/                     — Zustand stores (world, agent, UI, connection, logs)
│   ├── components/                — React UI: agent panel, god mode controls, chat, layout
│   ├── constants/                 — Anatomical limits, rig constraints, physics matrix, body types
│   ├── types/                     — Shared TypeScript types (joint, agent, world, payload, export)
│   ├── debug/                     — Debug utilities (footGroundDistance.ts)
│   └── utils/                     — Logger, toast utilities
├── coordinator/src/               — Backend coordinator (Node.js + Express + WS)
│   ├── server.ts                  — Express server with WebSocket upgrade
│   ├── agentLoop.ts               — Main agent loop: observe → prompt → action → observe
│   ├── providers/                 — LLM provider implementations (Gemini, OpenAI-compat, Kaggle)
│   ├── payloadBuilder.ts          — Assembles VLM payloads (frame + joints + proprioception + objects)
│   ├── memoryManager.ts           — In-memory state & conversation history per agent
│   ├── embeddingEngine.ts         — Xenova embeddings for semantic search
│   └── types/                     — Coordinator-specific types
├── public/
│   ├── models/x-bot.glb           — Mixamo rigged humanoid model (SkinnedMesh + skeleton)
│   └── mujoco/mujoco.wasm         — MuJoCo WebAssembly binary (~3.1 MB)
├── package.json                   — Frontend dependencies
└── coordinator/package.json       — Backend dependencies
```

## Key Abstractions

### PhysicsEngine
- **File**: `src/world/engine/PhysicsEngine.ts`
- **Responsibility**: Owns the MuJoCo WASM module singleton, model (`MjModel`), and data (`MjData`). Manages the physics step loop, contact force registry, velocity clamping, and coordinate system conversion (Three.js Y-up ↔ MuJoCo Z-up).
- **Key methods**: `init()` (WASM bootstrap), `loadMJCFModel(xml)` (load/reload model), `step()` (advance physics by one 2ms timestep), `forward()` (recompute kinematics without stepping), `drainContactForceEventsInternal()` (read contacts into registry)
- **Coordinate conversion**: `worldToMuJoCo({x,y,z})` → `[x, -z, y]` and `mujocoToWorld([x,y,z])` → `{x, y: z, z: -y}`. Quaternions go through a +90° X-axis rotation to align Three.js Y-up with MuJoCo Z-up.
- **Mutating/Ready lock**: `setMutating(true)` prevents stepping; `setReady(false)` blocks the tick loop. Used during model build pipeline to avoid stepping on half-loaded state.

### HumanoidPhysicsBinder
- **File**: `src/world/engine/HumanoidPhysicsBinder.ts` (large — ~1000 lines)
- **Responsibility**: Orchestrates the humanoid physics lifecycle through four sequential build steps:
  - **Step A**: Load `x-bot.glb`, extract bone positions/world quaternions, compute model dimensions
  - **Step B**: Delegate to `BodyManager.activate()` — generates MJCF XML, loads into MuJoCo
  - **Step C**: No-op (joints are in XML already)
  - **Step D**: Activate multi-body mode, register proxies with `ObservationBuilder` and `AvatarSynchronizer`
- **Timeline system**: Accepts `TimelineSequence` (array of `{timeOffsetMs, overrides}`) from AI commands. Validates with rig constraints, clamps angles, applies tendon synergy links and scapulohumeral ratio. On each render frame, interpolates between timeline keyframes and sets motor targets.
- **Joint alias system**: Maps named joints (`left_knee_flex`, `right_hip_pitch`, etc.) to canonical bone names (`mixamorigleftleg`, `mixamorigrightupleg`) via `resolveJointAlias()`.
- **Balance control**: `MotorController.applyCapsuleBalance()` applies a PD torque to `xfrc_applied` based on capsule tilt from world-up, clamped to 60 Nm max.

### MotorController
- **File**: `src/world/engine/MotorController.ts`
- **Responsibility**: Sets position targets on MuJoCo actuators. Stores base gains (kp, kv) per actuator and applies global stiffness/damping scale. Supports limp mode (zero all gains for ragdoll).
- **`setTargets()`**: Maps from `Map<string, any>` where values are `{x,y,z}` triads or `{scalar}` → MuJoCo `ctrl` array entries, respecting actuator order (yaw→pitch→roll for spherical joints, pitch for revolute).
- **`applyCapsuleBalance()`**: Reads capsule body quaternion, computes tilt from world vertical, applies PD balancing torque to `xfrc_applied` at capsule body index.

### BodyManager
- **File**: `src/world/engine/BodyManager.ts`
- **Responsibility**: Generates MJCF XML via `generateHumanoidMJCF()`, loads it into `PhysicsEngine`, maps bone names to MuJoCo body/geom/actuator IDs, tracks which body IDs correspond to which bones.
- **`syncRigidBodiesFromBones()`**: Reverses the transform — reads Three.js bone world quaternions and writes them back into MuJoCo qpos for manually re-posing the skeleton.

### MJCFHumanoidTemplate
- **File**: `src/world/engine/MJCFHumanoidTemplate.ts`
- **Responsibility**: Generates the complete MuJoCo MJCF XML string for the humanoid. This is the most complex template in the system.
- **Structure**: Root `root_capsule` body (free joint, capsule geom, negligible 0.001 mass) → `torso_collider` sphere → nested bone bodies with hinge joints and box/sphere geoms.
- **Joint decomposition**: Spherical joints (3-DOF) are decomposed into three sequential hinge joints: yaw (0 0 1), pitch (1 0 0), roll (0 1 0). Revolute joints use a single pitch hinge (1 0 0). Fixed joints are `<joint type="free"/>` → omitted.
- **Foot geoms**: Box-shaped with 1.5 friction, positioned 6cm forward and 1.5cm above the ankle center, with an inverse-body-quaternion to guarantee identity world orientation (flat on floor).
- **Gain tuning**: Per-bone stiffness/damping: feet=600/100, knees=1000/180, hips=900/150, spine=700/130, arms=200/40, fingers=5/1, default=150/30.
- **Includes**: 20 pre-allocated `env_slot_*` bodies (hidden at z=-10), 88 piano key geoms, floor plane.

### BodyProxy
- **File**: `src/world/engine/HumanoidPhysicsBinder.ts` (inner class, line ~20)
- **Responsibility**: Wraps a MuJoCo body ID so it provides the same `.translation()`, `.rotation()`, `.linvel()`, `.angvel()` interface as the old Rapier `RigidBody` — zero-code-change compatibility with `ObservationBuilder` and `AvatarSynchronizer`.

### WorldEngine
- **File**: `src/world/engine/WorldEngine.ts`
- **Responsibility**: Three.js renderer setup, scene composition (lights, floor, grid, sky), animation loop at 60fps with fixed-timestep physics integration at 500Hz (2ms steps). Captures AI offscreen frame via `CameraManager.captureAIFrame()`.
- **Physics stepping**: Accumulates frame delta into a 2ms-tick accumulator (max 50ms), calls `physicsEngine.step()` and per-step/per-frame callbacks from `useWorld`.

### ObservationBuilder
- **File**: `src/world/engine/ObservationBuilder.ts`
- **Responsibility**: Builds two observation formats: (1) `Float32Array` vector for ML training with root height, projected gravity, local linear/angular velocities, and joint angles/velocities; (2) `VLMProprioception` JSON object for VLM/LLM prompts with human-readable joint angles in degrees and rolling pose history.

## Data Flow

1. **User sends message** → React chat component → `useCoordinator.sendMessage()` → WebSocket → `coordinator/src/server.ts`
2. **Coordinator agentLoop** calls `captureWorldState` (via response) → receives {frame, joints, proprioception, audio_pcm, contact_forces, objects, ...}
3. **PayloadBuilder** assembles the full VLM payload → sends to LLM provider (Gemini/OpenAI)
4. **LLM returns** `action` with `joint_overrides` and/or `sequence` timeline
5. **Coordinator** broadcasts action via WebSocket → `useWorld` dispatches `synthia:action` CustomEvent
6. **HumanoidPhysicsBinder.validateAndApplyTimeline()** validates joint angles against `SYNTHIA_RIG_CONSTRAINTS` + `anatomicalLimits`, clamps out-of-range values, applies tendon synergies
7. **On each render frame** (60fps), `HumanoidPhysicsBinder.syncVisuals()`:
   - Reads capsule MuJoCo position/rotation → positions Three.js model root
   - Performs mj_ray ground detection → computes ground surface height
   - Interpolates timeline keyframes → calls `MotorController.setTargets()`
   - Applies kinematic ground reaction forces (GRF) based on foot-penetration velocity
   - Syncs visual bones via `AvatarSynchronizer.synchronize()`
8. **On each physics step** (500Hz), `PhysicsEngine.step()`:
   - Calls `mj_step()` to advance simulation
   - Clamps registered body velocities to max 10 m/s linear, 10 rad/s angular
   - Drains contacts into `contactForceRegistry` for downstream use
9. **Loop repeats** — coordinator captures new world state, sends to LLM, receives action, applies...

## Non-Obvious Behaviors & Design Decisions

### ⚠️ Garbage Pointer / Bad Malloc Risk — Unvalidated `d.ncon` Reads

This is the **most critical finding** in the codebase. There are **three locations** where `d.ncon` (MuJoCo `mjtNum` for number of active contacts) is read without **sanity guard bounds-checking**:

1. **`PhysicsEngine.drainContactForceEventsInternal()`** (line ~275):  
   ```typescript
   const ncon = this.data.ncon;
   // No guard — if ncon is garbage, loop runs billions of times
   for (let i = 0; i < ncon; i++) {
       const contact = this.data.contact.get(i);
       ...
   }
   ```
   
2. **`HumanoidPhysicsBinder.syncVisuals()`** (diagnostics contact capture):  
   ```typescript
   for (let ci = 0; ci < d.ncon; ci++) {
       const contact = d.contact.get(ci);
       ...
       const forceBuffer = new module.DoubleBuffer(6);
       ...
   }
   ```

3. **`useWorld.ts`** diagnostics ring buffer (two locations — initial capture and per-frame):  
   ```typescript
   for (let ci = 0; ci < d.ncon; ci++) {
       ...
       const forceBuffer = new mujocoModule.DoubleBuffer(6);
       ...
   }
   ```

**Why this crashes instantly**: If `mjData` is uninitialized (null/0 pointer) or has just been loaded but `mj_forward()` hasn't been called yet, `d.ncon` reads from uninitialized WASM memory at address 0 or a garbage offset. The raw bytes decode to a huge integer (e.g., ~536 million contacts). The loop tries to allocate `DoubleBuffer(6)` for each contact, each buffer being 48 bytes (6 doubles × 8). 536M × 48 bytes ≈ 25 GB, instantly exceeding the 2 GB WASM 32-bit limit → "Cannot enlarge memory" crash.

**The fix pattern** should be applied in all three locations:
```typescript
// SANITY GUARD
if (!model || !data) return;
const ncon = data.ncon;
if (ncon < 0 || ncon > 200) {  // 200 contacts is already extreme for this simulation
    console.warn(`[SYNTHIA] Refusing to drain invalid contact count: ${ncon}`);
    return;
}
```

### Coordinate System Discrepancy
The system maintains **three different coordinate conventions**:
- **Three.js world space**: Y-up, Z-forward (right-handed)
- **MuJoCo simulation space**: Z-up, X-forward, Y-left (right-handed)  
- **LLM/AI space**: The agent prompt describes directions differently

The conversion functions `worldToMuJoCo` and `mujocoToWorld` handle position vectors. Quaternion conversion adds a +90° X-axis rotation. This is error-prone and frequently trips up developers. **Always use `PhysicsEngine.worldToMuJoCo()` / `.mujocoToWorld()` and `.threeQuatToMuJoCo()` / `.mujocoQuatToThree()` — never hand-roll conversions.**

### The 0.001-Kg Root Capsule
The root body (`root_capsule`) in the MJCF has `mass="0.001"` — essentially massless. This is intentional: the real physics mass is on the child bone bodies. This prevents the root capsule from contributing to inertia, making balance PD control responsive. The bulk mass (~70kg) is distributed across the 20+ child bone bodies.

### Timeline Interpolation Happens in `syncVisuals`, Not in Physics
The timeline queue (`timelineQueue` in `HumanoidPhysicsBinder`) stores AI-commanded joint angles with time offsets. Interpolation between keyframes happens **in the render callback** (60fps), which writes to `MotorController.setTargets()`, which writes to MuJoCo `ctrl[]` — and these targets are enforced by MuJoCo's position actuators at the **physics rate** (500Hz). This two-tier timing is intentional to keep smooth visual interpolation while PD control runs at native simulation frequency.

### `isMutating` / `isReady` Lock Prevents Physics During Model Load
`PhysicsEngine` has a mutex-like pattern: `setMutating(true)` + `setReady(false)` prevents `step()` from running while the MJCF model is being loaded or bones are being re-posed. `isStepping` provides re-entrancy protection. The `useWorld.ts` per-step callback also checks `physics.isStepping || physics.isMutating` before reading diagnostics.

### Contact Force Registry Uses Geom IDs, Not Body IDs
`contactForceRegistry` is keyed by **geom ID** (not body ID). This is MuJoCo-native — contacts happen between geoms. The `drainContactForceEventsInternal()` method assigns contact normals with sign-flipping: geom1 gets +normal, geom2 gets -normal, so each geom knows which direction the contact force pushes.

### Wrist/Finger Joints Have Extremely Low Gains
Finger joints get `kp=5, kv=1` (vs. knees at `kp=1000, kv=180`). This is a 200× stiffness difference. Fingers are nearly limp because the AI rarely controls them and high stiffness would cause energy explosions. The same design applies to neck/head (`kp=150, kv=30`).

### DoubleBuffer Lifetime Management
`module.DoubleBuffer(6)` allocations in contact force loops **must be manually deleted** via `forceBuffer.delete()`. MuJoCo WASM doesn't garbage-collect these. There are explicit `.delete()` calls in all contact-reading loops, but **if an exception is thrown between allocation and deletion**, the buffer leaks. The `try {} finally {}` pattern is NOT used — only bare `try {} catch {}` in some locations.

### Scapulohumeral Rhythm Injection
When the arm is lifted past 30°, `validateAndApplyTimeline()` automatically injects a shoulder rotation proportional to the arm elevation. This mimics real human biomechanics where the humerus and scapula move together. The injection is `Δshoulder = (armAngle - 0.523) / 2.0`, clamped to ±0.262 rad.

### Cervical Coupling
Neck yaw automatically injects a head roll component: `headZ = -0.15 * neckY`. This prevents the head from appearing disconnected from the neck during rotation.

### Tendon Synergy Validation
For multi-segment bones like fingers (index1→index2→index3), the system rejects overrides for distal segments if the proximal base segment has a 0° target angle. This prevents the middle finger joint from bending without the base joint also bending — a simple tendon simulation.

## Critical Files With Contact Force Loops (Potential Crash Sites)

These are the **three exact files and locations** where unvalidated `d.ncon` reads can cause the 2GB+ allocation crash:

| File | Line Context | Method/Block | Fix Needed |
|------|-------------|--------------|------------|
| `src/world/engine/PhysicsEngine.ts` | `drainContactForceEventsInternal()` | Loops `for (let i = 0; i < ncon; i++)` | Add `if (ncon < 0 \|\| ncon > 200) return;` guard |
| `src/world/engine/HumanoidPhysicsBinder.ts` | `syncVisuals()` ~line 460 | Diagnostics contact loop | Add ncon guard + move `DoubleBuffer` allocation outside loop |
| `src/world/hooks/useWorld.ts` | Per-frame diag ring callback ~line 380 | Initial + per-frame contact capture | Add ncon guard + reuse `DoubleBuffer` |

## Garbage Pointer Root Cause Analysis

The exact failure scenario matching the user's log:

1. React HMR (hot reload) or initial page load fires `useEffect` in `useWorld.ts`
2. Previous engine instance wasn't fully `.cleanup()`'d (WASM model/data deleted but stale references remain)
3. New `PhysicsEngine.init()` loads minimal MJCF (just floor plane), sets `initialized=true`
4. `BodyManager.activate()` calls `loadMJCFModel(xml)` — deletes old model/data, loads humanoid XML
5. Between lines 2-4 of `loadMJCFModel`, `model` is deleted and re-created
6. If any code reads `data.ncon` during this window, it reads from freed WASM memory → garbage value
7. The per-step diag ring callback in `useWorld.ts` fires **immediately** because `WorldEngine.start()` starts the rAF loop, and if physics is not guarded properly, `d.ncon` = garbage → crash

**The most dangerous location** is the per-step diag ring capture in `useWorld.ts` because:
- It runs at 500Hz (every 8th step)
- It allocates a NEW `DoubleBuffer(6)` inside the loop for each contact
- It has no ncon bounds check
- It runs even before the model is fully initialized

## Module Reference

| File | Purpose |
|------|---------|
| `src/world/engine/PhysicsEngine.ts` | MuJoCo WASM bootstrap, model loading, stepping, contact forces, coordinate transforms |
| `src/world/engine/BodyManager.ts` | MJCF XML generation → model load → bone/geom/actuator ID mapping |
| `src/world/engine/MJCFHumanoidTemplate.ts` | Generates full humanoid MJCF XML string from Three.js bone positions |
| `src/world/engine/MotorController.ts` | PD position control: sets actuator targets, limp mode, capsule balance torque |
| `src/world/engine/HumanoidPhysicsBinder.ts` | 4-step build pipeline (A→D), timeline validation/execution, visual sync, GRF injection |
| `src/world/engine/WorldEngine.ts` | Three.js renderer setup, 60fps animation loop with 500Hz fixed-step physics |
| `src/world/engine/ObservationBuilder.ts` | Numerical and VLM-formatted proprioception/observation vectors |
| `src/world/engine/AvatarSynchronizer.ts` | Topology-sorted bone quaternion sync with slerp smoothing (α=0.85) |
| `src/world/engine/CollisionAdapter.ts` | Contact pair parsing, object preset → MJCF geom mapping |
| `src/world/engine/PhysicsDiagnostic.ts` | Runtime jitter diagnostic: measures angular speed, oscillations, torque clamping |
| `src/world/engine/AudioEngine.ts` | Tone.js audio pipeline with PCM buffer capture |
| `src/world/engine/ObjectManager.ts` | Spawn/delete/sync interactive objects with physics colliders |
| `src/world/hooks/useWorld.ts` | Central React hook: engine init, event wiring, 300-frame diagnostics ring buffer, AI frame capture |
| `src/world/hooks/useCoordinator.ts` | WebSocket connection to coordinator, message send/receive |
| `src/world/contexts/CoordinatorContext.tsx` | React context wrapper for coordinator hook |
| `src/store/worldStore.ts` | Zustand store: bodyType, spawnPoint, gravity, cameraMode, lightState, etc. |
| `src/constants/rigConstraints.ts` | Per-bone joint DOF and angle range constraints |
| `src/constants/anatomicalLimits.ts` | Per-bone min/max angle limits and world boundary radius |
| `src/constants/physics.ts` | COMPLETE_MIXAMO_PHYSICS_MATRIX (mass, inertia per bone) |
| `src/types/joint.ts` | TimelineSequence, ValidateResult, clampAngle, normalizeBoneKey |
| `coordinator/src/agentLoop.ts` | Main agent observation→prompt→action loop |
| `coordinator/src/payloadBuilder.ts` | Assembles VLM payload: frame + joints + proprioception + objects |
| `coordinator/src/providers/geminiProvider.ts` | Gemini 2.5 Flash provider |
| `coordinator/src/providers/openaiCompatProvider.ts` | OpenAI-compatible provider (for Kaggle/other APIs) |

## Suggested Reading Order (for new developers)

1. **`src/world/engine/PhysicsEngine.ts`** — Understand the MuJoCo WASM lifecycle, coordinate conversions, and contact force plumbing. This is the foundation.
2. **`src/world/engine/MJCFHumanoidTemplate.ts`** — See how Three.js bone positions become MuJoCo bodies, joints, and actuators. The XML generation is complex but central to understanding the physics model.
3. **`src/world/engine/MotorController.ts`** — How AI joint angle commands reach MuJoCo actuators. Short and focused.
4. **`src/world/engine/HumanoidPhysicsBinder.ts`** — The orchestration layer. Follow the 4-step build pipeline and the timeline execution path.
5. **`src/world/hooks/useWorld.ts`** — How the React layer wires everything together. The init sequence, event handlers, and diagnostics ring buffer are all here.
6. **`coordinator/src/agentLoop.ts`** — How the coordinator drives the observation→action loop on the backend.

## Crash Risk Summary

The three locations listed in the "Critical Files" table above each need a **bounds check on `d.ncon`** before iterating contacts. The fix is a 3-line guard:
```typescript
if (!this.model || !this.data || this.isMutatingWorld || this.isPhysicsBroken) return;
if (ncon < 0 || ncon > 200) return; // ADD THIS LINE
```

This should be added in:
- `PhysicsEngine.drainContactForceEventsInternal()` (already has model/data/mutating check, missing ncon guard)
- `HumanoidPhysicsBinder.syncVisuals()` contact capture block
- `useWorld.ts` per-step diag ring contact capture (both initial and per-frame)

Each of these currently trusts `d.ncon` implicitly, which is unsafe in the WASM context where a dangling pointer can produce a 536-million contact count.
