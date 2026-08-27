# WASM Memory Fix Implementation Plan (Complete)

## Root Cause Analysis

The crash stack traces reveal TWO allocation sources on the WASM heap:

### Primary: `data.contact.get(i)` — embind proxy allocations
```
PhysicsEngine.ts:399
→ MjContactVec.get
→ mujoco::wasm::MjData::contact() const
→ std::vector<MjContact>::reserve(unsigned long)
→ operator new
→ emscripten_builtin_malloc
→ sbrk → _emscripten_resize_heap
→ CANNOT ENLARGE MEMORY
```
**Every call to `data.contact.get(i)` creates a brand new `std::vector<MjContact>` in WASM memory.** At 500Hz with 50 contacts, that's 25,000 allocations/second × ~100 bytes each = 2.5MB/second. Over 100 seconds = 250MB just from contacts.

### Secondary: `mj_ray` confirmed removed from production
`convertJSArrayToNumberVector` only appears in `PhysicsEngine.test.ts` (line 169). No production calls exist. The secondary crash trace must be from an older build.

### Cascading failure: rAF loop keeps firing after WASM abort
The `requestAnimationFrame` loop at `WorldEngine.ts:224` calls `requestAnimationFrame(animate)` **before** any error handling. When `mj_step` throws "Cannot enlarge memory":
1. Exception propagates up
2. rAF loop schedules next frame anyway
3. Next frame hits same poisoned WASM instance
4. Hundreds of cascading errors per second
5. Browser OOM killer terminates the entire tab
6. No error handlers can run — tab just dies

---

## Solution: 8 changes across 6 files

### Priority Order
1. **CRITICAL:** Throttle contact drain (biggest allocation source)
2. **CRITICAL:** Stop rAF loop on WASM abort (prevents tab crash)
3. **HIGH:** Add `<size nconmax="50" njmax="50"/>` (prevents dynamic buffer growth)
4. **HIGH:** Memory circuit breaker (graceful degradation)
5. **MEDIUM:** Cap ncon in CollisionAdapter
6. **MEDIUM:** Remove diagnostic contact loop
7. **LOW:** Enhanced error messages
8. **LOW:** WASM heap tracking

---

## Step 1: Throttle `drainContactForceEventsInternal` to 50Hz

**File:** `src/world/engine/PhysicsEngine.ts`

### Change 1.1: Add counter field (after line ~41)
```typescript
private _contactDrainCounter: number = 0;
```

### Change 1.2: Throttle the drain method (line ~369)
Add at the top of `drainContactForceEventsInternal`:
```typescript
// Throttle: process contacts every 10th step (50Hz at 500Hz physics)
// Reduces embind proxy allocations from data.contact.get(i) by 90%
this._contactDrainCounter++;
if (this._contactDrainCounter % 10 !== 0) return;
```

### Change 1.3: Cap ncon from 200 to 50 (line ~377)
Change `if (ncon <= 0 || ncon > 200) return;` to:
```typescript
if (ncon <= 0 || ncon > 50) return;
```

### Change 1.4: Reset counter in cleanup (line ~518)
Add after `this.stepCount = 0;`:
```typescript
this._contactDrainCounter = 0;
```

---

## Step 2: Stop rAF loop on WASM abort (CRITICAL)

**File:** `src/world/engine/WorldEngine.ts`

### Change 2.1: Add `_engineAlive` flag (after line ~36)
```typescript
private _engineAlive = true;
```

### Change 2.2: Wrap animate loop in try-catch (lines ~224-295)
Replace the entire `animate` function body with:
```typescript
const animate = (time: number) => {
  // Guard: stop scheduling frames if engine is dead
  if (!this._engineAlive) return;
  
  this.animationFrameId = requestAnimationFrame(animate);

  try {
    const currentTime = performance.now();
    let dt = (currentTime - this.lastPhysicsTime) / 1000;
    this.lastPhysicsTime = currentTime;

    if (dt > this.MAX_ACCUMULATOR) {
      dt = this.MAX_ACCUMULATOR;
    }

    this.physicsAccumulator += dt;

    if (this.physicsEngine.isReady && !this.wasReady) {
      this.physicsAccumulator = 0;
    }
    this.wasReady = this.physicsEngine.isReady;

    if (this.physicsEngine.isReady) {
      while (this.physicsAccumulator >= this.FIXED_TIMESTEP) {
        this.physicsEngine.step();
        if (!this.physicsEngine.isBroken && onStep) {
          onStep();
        }
        this.physicsAccumulator -= this.FIXED_TIMESTEP;
      }

      if (!this.physicsEngine.isBroken && onFrame) {
        onFrame();
      }
    }

    const now = performance.now();
    const currentAgentId = useAgentStore.getState().activeAgentId || 'agent_0';
    const shouldUpdatePiP = currentAgentId !== (this as any).lastActiveAgentIdForPiP || (now - this.lastPipUpdateTime > 200);

    if (shouldUpdatePiP) {
      try {
        const frameBase64 = this.cameraManager.captureAIFrame(this.scene);
        if (frameBase64) {
          this.lastAIFrame = frameBase64;
          (this as any).lastActiveAgentIdForPiP = currentAgentId;
          useWorldStore.getState().setLastAIFrameForDisplay(frameBase64);
          this.lastPipUpdateTime = now;
        }
      } catch (err) {
        Logger.warn('WorldEngine: AI frame capture failed', err);
      }
    }

    this.cameraManager.updateTransformControls();

    if (this.particles && time > this.particleTargetTime) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.particles = null;
    } else if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += 0.02; 
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.selectionBox) {
      this.selectionBox.update();
    }

    this.camera = this.cameraManager.getMainCamera();
    this.renderer.render(this.scene, this.camera);
  } catch (e) {
    // WASM abort detected — stop the loop immediately
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Aborted') || msg.includes('Cannot enlarge memory') || msg.includes('memory access out of bounds')) {
      console.error('[SYNTHIA] WASM abort detected — stopping render loop', e);
      this._engineAlive = false;
      this.physicsEngine.stop?.();
      return; // Do NOT schedule next frame
    }
    throw e; // Re-throw unexpected errors
  }
};
```

### Change 2.3: Reset flag in `start()` (line ~221)
Add after `this.physicsAccumulator = 0;`:
```typescript
this._engineAlive = true;
```

---

## Step 3: MJCF `<size>` element (fixes dynamic buffer growth)

**File:** `src/world/engine/MJCFHumanoidTemplate.ts`

### Change 3.1: Add `<size>` element and reduce iterations (line ~486-488)
Replace:
```xml
  <option gravity="0 0 -9.81" timestep="0.002" iterations="200" integrator="implicitfast"/>
```
With:
```xml
  <size nconmax="50" njmax="50"/>
  <option gravity="0 0 -9.81" timestep="0.002" iterations="100" integrator="implicitfast"/>
```

**CRITICAL:** `<size>` is a separate element from `<option>`. MuJoCo MJCF does NOT allow `nconmax`/`njmax` as attributes of `<option>`.

**Impact:** Forces MuJoCo to pre-allocate a fixed-size contact buffer and NEVER grow it. This alone eliminates dynamic buffer reallocation as a source of WASM heap growth.

---

## Step 4: WASM memory circuit breaker

**File:** `src/world/engine/PhysicsEngine.ts`

### Change 4.1: Add memory check method (after `clampRegisteredBodyVelocities`)
```typescript
private isWasmMemoryCritical(): boolean {
  try {
    const module = PhysicsEngine.mujocoModule;
    if (!module) return false;
    
    // Try to get heap size from any available view
    const heap = module.HEAP8 || module.HEAPU8 || module.HEAPF64;
    if (heap && heap.byteLength) {
      const usedMB = heap.byteLength / (1024 * 1024);
      return usedMB > 1800; // 1.8GB threshold
    }
  } catch {
    // If we can't read heap, assume safe
  }
  return false;
}
```

### Change 4.2: Add circuit breaker in step() (before line ~250)
Add before `module.mj_step(this.model, this.data);`:
```typescript
// Circuit breaker: stop physics if memory is critical
if (this.isWasmMemoryCritical()) {
  Logger.error('[SYNTHIA] WASM memory critical — stopping physics engine');
  this.isPhysicsBroken = true;
  this.isReady = false;
  return;
}
```

---

## Step 5: Cap ncon in CollisionAdapter

**File:** `src/world/engine/CollisionAdapter.ts`

### Change 5.1: Cap ncon in getCollisionPairs (line ~50)
Change `if (ncon <= 0 || ncon > 200) return pairs;` to:
```typescript
if (ncon <= 0 || ncon > 50) return pairs;
```

### Change 5.2: Cap ncon in isGeomInContact (line ~114)
Change `if (ncon <= 0 || ncon > 200) return false;` to:
```typescript
if (ncon <= 0 || ncon > 50) return false;
```

### Change 5.3: Cap ncon in areGeomsInContact (line ~130)
Change `if (ncon <= 0 || ncon > 200) return false;` to:
```typescript
if (ncon <= 0 || ncon > 50) return false;
```

---

## Step 6: Remove diagnostic contact loop

**File:** `src/world/hooks/useWorld.ts`

### Change 6.1: Remove redundant diagnostic contact capture (lines ~802-826)
Delete the entire block from:
```typescript
const contacts: Array<{ geom1: string; geom2: string; pos: number[]; dist: number; normal: number[]; force: number[] }> = [];
```
Through:
```typescript
forceBuffer.delete();
```

Also change the snapshot object (line ~845) to remove `contacts` property, or set it to an empty array:
```typescript
contacts: [],
```

This block runs during the diagnostic capture window and allocates/deallocates `DoubleBuffer(6)` + embind proxies per contact. The initial capture (lines ~582-606) already captures contacts, making this redundant.

---

## Step 7: Enhanced error messages

**File:** `src/world/engine/PhysicsEngine.ts`

### Change 7.1: Improve error message in step() catch block (line ~256-259)
Replace:
```typescript
} catch (error) {
      Logger.error('MuJoCoPhysicsEngine: Fatal WASM memory or aliasing fault detected during step.', error);
      this.isPhysicsBroken = true;
      this.isReady = false;
    }
```
With:
```typescript
} catch (error) {
      const isMemoryError = error instanceof Error && 
        (error.message.includes('Cannot enlarge memory') || 
         error.message.includes('memory access out of bounds'));
      if (isMemoryError) {
        Logger.error('MuJoCoPhysicsEngine: WASM memory exhausted. The simulation must restart.', error);
      } else {
        Logger.error('MuJoCoPhysicsEngine: Fatal WASM memory or aliasing fault detected during step.', error);
      }
      this.isPhysicsBroken = true;
      this.isReady = false;
    }
```

---

## Step 8: Fix memoryMonitor WASM heap tracking

**File:** `src/world/engine/memoryMonitor.ts`

### Change 8.1: Try alternate WASM heap tracking (line ~100-106)
Replace:
```typescript
function getWasmHeapBytes(): number {
  // HEAP8/HEAPU8 are not exported by the MuJoCo WASM module.
  // The TypedArray + throttle fixes in HumanoidPhysicsBinder eliminate the
  // heap fragmentation that previously hit the 2GB limit, so this metric
  // is no longer critical. Return 0; checkMemoryLevel() will stay 'normal'.
  return 0;
}
```
With:
```typescript
function getWasmHeapBytes(): number {
  // Try to access WASM memory via module reference
  try {
    const mod = _wasmModuleRef;
    if (mod?.HEAP8) return mod.HEAP8.byteLength;
    if (mod?.HEAPU8) return mod.HEAPU8.byteLength;
    // Try WebAssembly.Memory.buffer
    if (mod?.buffer) return mod.buffer.byteLength;
  } catch {
    // ignore
  }
  return 0;
}
```

---

## Verification

After implementing all changes, run:
```bash
npx tsc --noEmit
```

Then test in browser:
1. Spawn an agent
2. Let it walk for 3+ minutes
3. Confirm no "Cannot enlarge memory" crash
4. Check console for physics instability warnings
5. Monitor status bar Mem metric for growth
6. Verify the tab stays alive (no OOM kill)

## Summary of Impact

| Fix | Allocation Source | Reduction |
|-----|-------------------|-----------|
| Step 1: Throttle contact drain | `data.contact.get(i)` embind proxies | 90% fewer allocations |
| Step 2: Stop rAF on abort | Cascading rAF errors | Prevents tab crash |
| Step 3: `<size nconmax="50">` | MuJoCo dynamic buffer growth | Eliminates entirely |
| Step 4: Memory circuit breaker | Uncontrolled growth | Graceful shutdown at 1.8GB |
| Step 5: Cap ncon in CollisionAdapter | Contact iteration | 75% fewer iterations |
| Step 6: Remove diagnostic contacts | Redundant DoubleBuffer + proxies | Zero-risk removal |
