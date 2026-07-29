# SYNTHIA — Duplicate Declarations & Functional Overlap Analysis

> **Report 57 — Comprehensive Codebase Redundancy Audit**
>
> This document catalogs every case where the Synthia codebase has two or more declarations, mechanisms, or abstractions that serve the same function under different names. Each finding includes the files involved, what overlap exists, the risk it creates, and a concrete fix proposal.

---

## FINDING 1: Complete Type System Duplication (frontend/ ↔ coordinator/)

### Files involved
| File | Line |
|------|------|
| `src/types/world.ts` | Entire file |
| `coordinator/src/types/world.ts` | Entire file |
| `src/types/agent.ts` | Entire file |
| `coordinator/src/types/agent.ts` | Entire file |
| `src/types/payload.ts` | Entire file |
| `coordinator/src/types/payload.ts` | Entire file |

### What's duplicated
The **entire type system** is copy-pasted between `src/types/` and `coordinator/src/types/`. Every single interface, type alias, and union is declared twice:
- `Vector3` — 2 copies (identical)
- `BodyType` — 2 copies (identical)
- `BodyMode` — 2 copies (identical)
- `WorldObject` — 2 copies (coordinator version MISSING `friction` field — **BUG**)
- `JointState` — 2 copies (identical)
- `CameraMode` — 2 copies (identical)
- `Thought` — 2 copies (identical)
- `Memory` — 2 copies (coordinator version MISSING `sessionId` — **BUG**)
- `Skill` — 2 copies (identical)
- `AgentStatus` — 2 copies (identical)
- `DirectiveMode` — 2 copies (identical)
- `InferPayload` — 2 copies (coordinator has EXTRA field `contact_forces` — frontend doesn't — **BUG**)
- `InferResponse` — 2 copies (identical)
- `ExportType`, `ExportFormat`, `ExportConfig` — defined only in frontend, referenced in coordinator, so coordinator silently uses stub types

### Risk
The coordinator and frontend will silently diverge. Currently `WorldObject.friction`, `Memory.sessionId`, and `InferPayload.contact_forces` are already out of sync. Any future schema change needs to be manually applied to both copies. Nothing enforces consistency.

### Fix proposal
**Replace the two copies with a shared package.** Create `src/shared/types/` and have both `src/types/` and `coordinator/src/types/` re-export from it. Use a file-copy script (`scripts/sync-types.mjs` already exists but is not integrated into the build pipeline — run it as a pre-commit hook or as part of `npm run dev`).

**Alternatively**: Remove `coordinator/src/types/` entirely and import from `src/types/` via a path alias. The coordinator already lives in the same monorepo and can access `../src/types/`.

---

## FINDING 2: Joint Limit Systems — Triple Declaration (anatomicalLimits, rigConstraints, MJCF inline)

### Files involved
1. `src/constants/anatomicalLimits.ts` — `getAnatomicalLimitForBone()` uses heuristic name matching
2. `src/constants/rigConstraints.ts` — `SYNTHIA_RIG_CONSTRAINTS` maps explicit canonical names to `JointLimit` objects with allowances
3. `src/world/engine/MJCFHumanoidTemplate.ts` — inline limits in `buildBodyTreeXML()` that ALSO call `getAnatomicalLimitForBone()`

### How they overlap

**anatomicalLimits.ts** returns limits like `{min: -150*DEG, max: 0}` for knees using `name.includes('knee') || name.includes('leg')`.

**rigConstraints.ts** defines `mixamorigleftleg` with `{x: [-2.618, 0.0]}` — same range (since -2.618 rad ≈ -150°).

But for a bone like `mixamorigleftfoot`:
- **anatomicalLimits.ts** returns `{min: -45*DEG, max: 45*DEG}` (via `name.includes('foot')`)
- **rigConstraints.ts** defines `{dof: 2, x: [-0.785, 0.785], z: [-0.785, 0.785]}` (note: uses `x` AND `z` axes)

In `HumanoidPhysicsBinder.ts`'s `setMotorTargets()`, the code checks BOTH:
```
const limits = this.jointLimits.get(canonical) ?? getAnatomicalLimitForBone(canonical);
```
This means if `this.jointLimits` was populated from `SYNTHIA_RIG_CONSTRAINTS` and doesn't have an entry for a bone, it falls back to `getAnatomicalLimitForBone` which may return a DIFFERENT range.

In `MJCFHumanoidTemplate.ts`'s `buildBodyTreeXML()`, limits are resolved by:
```
const constraint = rConstraints[boneName];
const limits = getAnatomicalLimitForBone(boneName);
```
And then the code builds XML range strings from BOTH sources — but with complex precedence logic that can produce inconsistent ranges.

### Risk
Same bone clamped differently depending on which code path validates it. A joint angle could pass `getAnatomicalLimitForBone()` but fail `SYNTHIA_RIG_CONSTRAINTS`, or vice versa.

### Fix proposal
**Make `SYNTHIA_RIG_CONSTRAINTS` the single source of truth** for all joint limits. Remove `getAnatomicalLimitForBone()` entirely, or at minimum remove the non-overlapping entries from `anatomicalLimits.ts` and have `rigConstraints.ts` cover every bone that can be actuated. The `JointLimit` interface in `src/types/joint.ts` should be the canonical type used everywhere.

---

## FINDING 3: Contact Force Detection — Three Parallel Implementations

### Files involved
1. `src/world/engine/PhysicsEngine.ts` — `drainContactForceEventsInternal()` reads contacts into `contactForceRegistry` Map
2. `src/world/engine/PhysicsEngine.ts` — `drainEvents(onContact)` callback-based contact reporting
3. `src/world/engine/CollisionAdapter.ts` — `getCollisionPairs()` static method that ALSO reads `data.ncon` / `data.contact.get(i)`

### All three do the same thing
Iterate `data.ncon`, call `data.contact.get(i)`, extract `geom1`, `geom2`, `dist`, compute force via `mj_contactForce`. They're three implementations of the identical algorithm, each with slightly different output format.

### Call sites
- `HumanoidPhysicsBinder.applyKinematicGroundReactionForces()` reads BOTH from `contactForceRegistry` (via `getContactForceRegistry()`) AND from `previousFootPositions` (kinematic tracking)
- `ObjectManager.update()` calls `CollisionAdapter.getCollisionPairs()` independently
- The pipeline drains contacts MULTIPLE times per frame

### Risk
Double-counting contacts or missing them entirely if the registry clears between reads. Wasted WASM calls.

### Fix proposal
**Consolidate into one method** on `PhysicsEngine` that returns a structured ContactPair array. Remove `drainEvents()` and `CollisionAdapter.getCollisionPairs()`. Have the contact registry inside `PhysicsEngine` be the only access point. `ObjectManager.update()` should use `PhysicsEngine.getStructuredContacts()` instead of calling the adapter.

---

## FINDING 4: `WorldObject` Interface — Different in Types vs Runtime

### Files involved
| File | Interface |
|------|-----------|
| `src/types/world.ts:13-24` | `WorldObject` (database-serializable shape) |
| `src/world/engine/ObjectManager.ts:7-16` | `WorldObject` (runtime physics shape) |

### They share the name but have completely different shapes

**`src/types/world.ts` WorldObject:**
```typescript
{
  id: string;
  type: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  isStatic: boolean;
  mass: number;
  friction: number;
  restitution: number;
  interactionZones?: string[];
}
```

**`src/world/engine/ObjectManager.ts` WorldObject:**
```typescript
{
  id: string;
  name: string;
  preset: ObjectPreset;
  mesh: THREE.Mesh | THREE.Group;
  colliders: number[];
  onContact?: (otherId: number) => void;
  bodyName?: string;
  bodyId?: number;
  slotIndex?: number;
  isCustom?: boolean;
}
```

These are completely unrelated types sharing a name. The types version is for database/session persistence. The ObjectManager version is for the runtime physics engine. They have ZERO overlapping fields except `id`.

### Risk
Confusion for any developer trying to understand "what is a WorldObject". The store's `worldStore.objects: WorldObject[]` uses the type from `src/types/world.ts`, but the engine's `ObjectManager.getObjects()` returns `Map<string, WorldObject>` with the runtime definition. These are not interchangeable.

### Fix proposal
**Rename the ObjectManager type to `PhysicsBody` or `WorldBody`** to distinguish it from the serializable `WorldObject`. The store should only hold serializable world objects, and the ObjectManager should hold physics bodies.

---

## FINDING 5: `lightState` — Split Across Two Zustand Stores

### Files involved
- `src/store/worldStore.ts` line 21: `lightState: 'day' | 'night'`
- `src/store/agentStore.ts` line 24: `lightState: 'day' | 'night'`

### The same boolean state is stored in BOTH stores
Both declare their own `lightState` with the same type. Neither store has a setter for the other store's state. If `worldStore` updates `lightState`, `agentStore` will still hold the old value unless manually synced.

### Risk
The stores will silently diverge. One part of the UI shows day while the logic layer thinks it's night.

### Fix proposal
**Keep `lightState` in exactly ONE store** (recommend `worldStore` as it's ambient environment state). Remove it from `agentStore`. Have the agent's logic read from `worldStore` instead.

---

## FINDING 6: `injectionQueue` vs `pendingInjection` — Dual Queuing in agentStore

### Files involved
- `src/store/agentStore.ts` — `pendingInjection: string | null`, `injectionQueue: string[]`, `injectionQueueCount: number`
- `src/world/engine/HumanoidPhysicsBinder.ts` — `timelineQueue: TimelineSequence`, `executeProgramSequence(programs: string[])`
- `coordinator/src/injectionQueue.ts` — Separate server-side injection queue

### What's duplicated
There are **three independent queuing mechanisms** for agent actions:
1. `agentStore.pendingInjection` — a single-item slot for injection
2. `agentStore.injectionQueue` — a full array queue for injections
3. `HumanoidPhysicsBinder.timelineQueue` — a timed action frame queue
4. `coordinator/src/injectionQueue.ts` — a server-side queue under `coordinator/`

A single queue with a single mechanism is sufficient. Having three means the system doesn't know which one is authoritative.

### Risk
Injections can be lost or duplicated. If something pushes to `pendingInjection` and another thing pushes to `injectionQueue`, which one gets processed?

### Fix proposal
**Consolidate to ONE queue** in `agentStore`. Remove `pendingInjection` (it's just a queue of length 1). Remove `HumanoidPhysicsBinder.timelineQueue` and have the binder read directly from `agentStore.injectionQueue`. Remove or rework `coordinator/src/injectionQueue.ts` to use the same channel.

---

## FINDING 7: Gravity/Physics Constants — Spread Across Multiple Files with No Single Source of Truth

### Files involved
- `src/store/worldStore.ts` — `gravity: -9.81` (default)
- `src/world/engine/PhysicsEngine.ts` — `init()` hardcodes `gravity="0 0 -9.81"` in XML
- `src/constants/physics.ts` — Mentions gravity in comments but exports no GRAVITY constant
- `src/world/engine/HumanoidPhysicsBinder.ts` — `getMotorSettings()` returns `-9.81` as a magic number

### What's wrong
- The XML template string in `PhysicsEngine.init()` line 107 contains `gravity="0 0 -9.81"` as a hardcoded string literal
- The `worldStore` has `gravity` as a state that CAN be changed
- But `PhysicsEngine.setGravity()` writes to the model's `opt.gravity`, and `worldStore.setGravity()` just stores a number
- There's no single reference to "the current gravity"

### Fix proposal
**Add `export const DEFAULT_GRAVITY = -9.81` to `src/constants/physics.ts`**. Have both `worldStore` and `PhysicsEngine.init()` reference it. When gravity changes, `worldStore` should call `physicsEngine.setGravity(newGravity)` so the physics engine stays in sync with the store.

---

## FINDING 8: Capsule Root Offset — Three Different Values in Three Different Files

### Files involved
| File | Variable | Value |
|------|----------|-------|
| `HumanoidPhysicsBinder.ts` | `capsuleCenterY` | Computed as `modelHeight / 2` (~0.9) |
| `BodyManager.ts` | `capsuleCenterY` | Set from binder during activation |
| `AvatarSynchronizer.ts` | `rootOffsetHeight` | `0.04` (hardcoded default) |
| `MJCFHumanoidTemplate.ts` | capsule half-height | `(modelHeight / 2) - capsuleRadius` |

### The problem
`AvatarSynchronizer` has its own root offset of `0.04` which is completely different from the `capsuleCenterY` of `~0.9` used by the physics engine. When `syncRoot()` runs in the synchronizer, it applies a 4cm offset, but the binder's `syncVisuals()` applies a ~90cm offset. These offsets are supposed to represent the SAME concept: "how far is the capsule center from the model root."

### Risk
Visual skeleton floats at wrong height relative to physics capsule. The model appears to hover above or sink into the ground depending on which sync path runs.

### Fix proposal
**Remove `rootOffsetHeight` from `AvatarSynchronizer`** and have it accept the capsule center Y from the binder. Add `setCapsuleCenterY(y: number)` method. The synchronizer should never guess this value.

---

## FINDING 9: Dead Code — `getCollisionMask` in `physics.ts`

### Location
`src/constants/physics.ts` lines 15-17

### Code
```typescript
export const getCollisionMask = (membership: number, filter: number): number => {
  return (membership << 16) | filter;
};
```

### Why it's dead
This is a Rapier-era collision bitmask helper. The project now uses MuJoCo with `contype`/`conaffinity` fields. The function is exported but never imported by any file in the project (confirmed by zero import references).

### Fix proposal
**Remove** `getCollisionMask`. If Rapier support returns, it can be re-added.

---

## FINDING 10: Dead Code — `BODY_TYPE_CONFIGS` in `bodyTypes.ts`

### Location
`src/constants/bodyTypes.ts` lines 57-138

### What it defines
A complete joint hierarchy config for 'humanoid', 'quadruped', 'robotic_arm', and 'custom' body types, with bone offsets, DOF counts, limits, and PD gains.

### Why it's dead
The MuJoCo system (`MJCFHumanoidTemplate.ts`) generates the humanoid skeleton directly from the loaded GLTF model's bones — it doesn't use `BODY_TYPE_CONFIGS` at all. The quadruped and robotic_arm configs were designed for the Rapier era but are never instantiated (the `worldStore.bodyType` setter warns: `"Body type ${bodyType} is currently disabled. Coming in a future update."`).

### Fix proposal
**Either remove the file entirely** (if MuJoCo handles all future humanoid variants) or **keep only the humanoid config** and update the non-humanoid configs to use Mixamo bone names. Remove the Rapier-era joint definitions that are incompatible with the current system.

---

## FINDING 11: Dead Code — `SKILL_RUNGS` in `progressionLadder.ts`

### Location
`src/constants/progressionLadder.ts` lines 9-22

### What it defines
A 10-rung skill progression ladder from "Static Balance" to "Full Autonomy".

### Why it's dead
The `agentStore` has `currentRung: number` but the rung definitions in `SKILL_RUNGS` are never used to gate behavior, constrain actions, or drive transitions. They're defined but never referenced as business logic.

### Fix proposal
**Either integrate the rungs into agent behavior logic** (e.g., only allow certain motor programs at certain rungs) **or remove the file** and keep only the `currentRung` number as a free-form progress indicator.

---

## FINDING 12: Dead Fields — `skills` vs `masteredSkills` in agentStore

### Location
`src/store/agentStore.ts` lines 17, 31

### The duplication
- `skills: string[]` — declared at line 17
- `masteredSkills: string[]` — declared at line 31, populated via `addMasteredSkill()`
- Both are `string[]` arrays of skill names

### What's wrong
These appear to hold the same concept ("skills the agent has learned"). There's no documentation explaining the difference. If `skills` is the full list and `masteredSkills` is a subset, the relationship is confusing. If they're the same thing, one should be removed.

### Fix proposal
**Remove `skills`** and rename `masteredSkills` to just `skills`. Or remove `masteredSkills` and use only `skills`. The `coordinator` response model uses `skill_mastered: string | null` so the concept of "newly mastered skill" belongs in the flow but with only one array.

---

## FINDING 13: Dead Fields — Unused Class Properties in BodyManager & HumanoidPhysicsBinder

### Files involved
- `src/world/engine/BodyManager.ts` line 17: `private _boneInfoMap`
  - File includes `void this._boneInfoMap;` (line 103) which is a TypeScript warning suppression
  - The field is initialized during `activate()` but NEVER READ anywhere
  - **Fix**: Remove the field entirely.

- `src/world/engine/HumanoidPhysicsBinder.ts` lines 142-144:
  - `private lastAiCommandTime: number`
  - `private airborneTimer: number`
  - `private groundingMagnetStrength: number`
  - File includes `void this.lastAiCommandTime; void this.airborneTimer; void this.groundingMagnetStrength;` at line 171
  - These are assigned but NEVER READ
  - They're leftover from the Rapier-era grounding control logic that was not ported to MuJoCo
  - **Fix**: Remove these three fields and their void-suppression lines.

---

## FINDING 14: Collision Group ID Mismatch — `contype` Bug in MJCFHumanoidTemplate

### Location
`src/world/engine/MJCFHumanoidTemplate.ts` — every `<geom>` in the humanoid tree

### Current value
```xml
contype="2" conaffinity="1"
```

### Expected value (per `src/constants/physics.ts`)
| Constant | Value | Meaning |
|----------|-------|---------|
| RAGDOLL_CONTYPE | 1 | Humanoid body geoms belong to group 1 |
| RAGDOLL_CONAFFINITY | 2 | Humanoid geoms collide with environment (group 2) |
| ENVIRONMENT_CONTYPE | 2 | Floor/object geoms belong to group 2 |
| ENVIRONMENT_CONAFFINITY | 3 | Environment collides with everything (1+2) |

The humanoid body geoms use `contype="2"` which means they're **declaring themselves as environment** (group 2), not as ragdoll (group 1). They should use `contype="1"` to match `RAGDOLL_CONTYPE`.

### What this means in practice
- Humanoid geoms don't collide with each other (since both have contype=2, conaffinity=1 — they collide with group 1 but ARE in group 2, so the reciprocal collision is: geomA in group 2 collides with geomB that has conaffinity includes 2. But conaffinity=1 means only group 1. So humanoid geoms DON'T collide with each other — which is correct (self-collision is bad).
- But humanoid geoms DO collide with the floor (floor contype=1, conaffinity=2 — collides with group 2, which the humanoid IS). So contact detection works.
- The mismatch is in self-documentation: the value should be `contype="1"` to match the constant, but the current value `contype="2"` may accidentally work the same way in MuJoCo because of reciprocal collision filtering.

### Fix proposal
**Change humanoid geom contype to `RAGDOLL_CONTYPE` (1)** in `MJCFHumanoidTemplate.ts` to match the constant definitions. Import and use the constants rather than hardcoding magic numbers:
```typescript
import { RAGDOLL_CONTYPE, RAGDOLL_CONAFFINITY } from '../../constants/physics';
```

---

## FINDING 15: `doubleBuffer` Allocation — Duplicated in PhysicsEngine and CollisionAdapter

### Files involved
- `src/world/engine/PhysicsEngine.ts` — `drainContactForceEventsInternal()` allocates `new module.DoubleBuffer(6)`
- `src/world/engine/CollisionAdapter.ts` — `getCollisionPairs()` allocates `new module.DoubleBuffer(6)`

Both methods allocate a WASM DoubleBuffer of size 6, call `mj_contactForce()`, read the force vector, then call `.delete()`. This is the SAME exact algorithm duplicated.

### Fix proposal
**Create a single private helper method** `getContactForce(contactIndex: number): [number, [number, number, number]]` on `PhysicsEngine` that wraps the DoubleBuffer allocation/cleanup. Both `drainContactForceEventsInternal()` and `CollisionAdapter.getCollisionPairs()` should call this helper instead of allocating their own.

---

## FINDING 16: Typed `ProviderType` — Declared Twice

### Files involved
- `src/store/connectionStore.ts` line 11: `export type ProviderType = 'kaggle' | 'gemini' | 'nim' | 'openrouter' | 'groq' | 'custom'`
- `coordinator/src/providers/types.ts` line 7: `export type ProviderType = 'kaggle' | 'gemini' | 'nim' | 'openrouter' | 'groq' | 'custom'`

Identical type, declared in two places.

### Fix proposal
Same as Finding 1 — consolidate into shared types.

---

## FINDING 17: Inconsistent `Memory` Interface — `sessionId` Missing in Coordinator

### Files involved
- `src/types/agent.ts:17-33` — includes `sessionId?: string`
- `coordinator/src/types/agent.ts:17-32` — NO `sessionId` field

### Risk
If the coordinator tries to serialize/deserialize Memory objects, it will lose the `sessionId` field because the coordinator's type doesn't know about it. This is an active drift bug.

### Fix proposal
Add `sessionId?: string` to the coordinator's Memory type (as part of Finding 1 consolidation).

---

## FINDING 18: `_skeletonOrBones` Parameter Name Confusion in `generateHumanoidMJCF`

### Location
`src/world/engine/MJCFHumanoidTemplate.ts` line 67

### Current signature
```typescript
export function generateHumanoidMJCF(
  boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>,
  _skeletonOrBones: any,
  capsuleCenterYOrPhysicsMatrix?: any,
  modelRootOrRigConstraints?: any,
  physicsMatrix?: any,
  rigConstraints?: any
): string
```

### What's wrong
The second through sixth parameters are typed as `any` and their meaning depends on the position and type of the third parameter (if it's a number, params 2-3 have one meaning; if it's an object, params 2-3 have another meaning). This is an overloading pattern that should have been separate function signatures.

### Risk
Callers pass arguments in the wrong order silently. The function accepts `any` so there's zero type safety.

### Fix proposal
**Refactor into two explicit signatures:**
```typescript
export function generateHumanoidMJCF(
  boneInfoMap: ..., skeleton: THREE.Skeleton,
  capsuleCenterY: number, modelRoot: THREE.Group,
  physicsMatrix?: ..., rigConstraints?: ...
): string;
```
Remove the multi-meaning parameter pattern. Use TypeScript function overloads if backward compatibility is needed.

---

## SUMMARY TABLE: All Findings Ranked by Impact

| # | Finding | Impact | Fix Effort | Fix Type |
|---|---------|--------|------------|----------|
| 1 | Full type duplication frontend ↔ coordinator | **CRITICAL** — Data corruption (missing fields) | Medium | Structural (shared types) |
| 3 | Triple contact force detection | **HIGH** — Wasted WASM calls, potential double-count | Medium | Consolidation |
| 4 | Dual WorldObject interfaces | **HIGH** — Confusion about what a "world object" is | Medium | Rename + refactor |
| 14 | Collision group mismatch (contype=2 wrong) | **HIGH** — Physics bugs (collisions wrong) | Low | Change constant |
| 2 | Triple joint limit systems | **HIGH** — Inconsistent clamping | Medium | Make rigConstraints canonical |
| 5 | lightState in two stores | **MEDIUM** — State divergence | Low | Remove from agentStore |
| 6 | Triple injection queuing | **MEDIUM** — Lost injections | Medium | Consolidate to one queue |
| 7 | Gravity spread across files | **MEDIUM** — Inconsistency on gravity change | Low | Add DEFAULT_GRAVITY constant |
| 8 | Capsule offset mismatched | **MEDIUM** — Visual/physics misalignment | Low | Centralize capsuleCenterY |
| 12 | skills vs masteredSkills | **LOW** — Confusing API | Low | Remove one array |
| 9 | Dead code: getCollisionMask | **LOW** — Unused code | Low | Delete |
| 10 | Dead code: BODY_TYPE_CONFIGS | **LOW** — Unused, deprecated | Low | Delete or update |
| 11 | Dead code: SKILL_RUNGS | **LOW** — Unused business logic | Low | Delete or integrate |
| 13 | Dead fields with void-suppression | **LOW** — Code smell | Low | Delete fields |
| 15 | Duplicate DoubleBuffer allocation | **LOW** — Code duplication | Low | Extract helper |
| 16 | ProviderType typed twice | **LOW** — Part of #1 | Low | Part of #1 fix |
| 17 | Memory.sessionId missing in coordinator | **MEDIUM** — Data loss | Low | Add field |
| 18 | generateHumanoidMJCF overloading | **LOW** — Type-unsafe API | Medium | Refactor signature |

---

## RECOMMENDED IMMEDIATE FIXES (Top Priority)

### Fix 1 (Highest Impact): Consolidate ALL types into a shared module
1. Create `src/shared/types/` directory
2. Move all interface/type definitions there
3. Have both `src/types/` and `coordinator/src/types/` re-export from shared
4. Add `sessionId` to coordinator's Memory
5. Add `friction` to coordinator's WorldObject
6. Add `contact_forces` to frontend's InferPayload

### Fix 2: Fix the `contype` collision bug
Change line in `MJCFHumanoidTemplate.ts` from:
```xml
contype="2" conaffinity="1"
```
to:
```xml
contype="1" conaffinity="2"
```

### Fix 3: Consolidate contact force detection to a single method
1. Add `getContactPair(index: number): {...}` to PhysicsEngine
2. Remove `drainEvents()` method
3. Have `CollisionAdapter.getCollisionPairs()` delegate to `PhysicsEngine`
4. Remove `CollisionAdapter` static duplication

### Fix 4: Remove `lightState` from `agentStore`
Change all agentStore consumers to read `lightState` from `useWorldStore` instead.

### Fix 5: Fix capsule offset in AvatarSynchronizer
Remove `rootOffsetHeight: 0.04` default and have the synchronizer receive the correct value from the binder at setup time.

---

## APPENDIX: Files That Should Be Removed or Fully Rewritten

| File | Action | Reason |
|------|--------|--------|
| `coordinator/src/types/agent.ts` | Delete (use shared) | Duplicate |
| `coordinator/src/types/world.ts` | Delete (use shared) | Duplicate |
| `coordinator/src/types/payload.ts` | Delete (use shared) | Duplicate |
| `coordinator/src/providers/types.ts` | Delete ProviderType (import from shared) | Duplicate |
| `src/constants/progressionLadder.ts` | Delete or integrate into agent logic | Dead code |
| `src/constants/bodyTypes.ts` | Delete or rewrite for MuJoCo | Half-dead (only humanoid config maybe salvageable) |

---

**Total: 18 findings identified. 4 at CRITICAL/HIGH impact, 5 at MEDIUM impact, 9 at LOW impact.**