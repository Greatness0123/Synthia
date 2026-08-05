# Synthia 1.5.1 — Object Spawning & Custom Model Import: Deep-Dive + Refined Plan

## Summary

This report analyzes two connected problems in Synthia: (1) the **object spawn button is broken** since the Rapier → MuJoCo migration, and (2) the **custom 3D model upload path produces non-interactive meshes**. The investigation traces the full event chain (`ObjectSpawner` → `useWorld` → `ObjectManager` → `PhysicsEngine`/`MJCFHumanoidTemplate`) and found the root causes are three concrete bug clusters in the MuJoCo integration — not a fundamental physics limitation. The user's V-HACD plan is technically sound and *architecturally required* (MuJoCo has no runtime decomposition hook), with the "apply once and store" design being correct, not merely an optimization. The plan is refined below into a phased, dependency-minimal implementation.

---

## How Spawning Works Today (traced end-to-end)

### Primitive spawn path
1. `ObjectSpawner.tsx` → `handleSpawn(preset)` dispatches `window` custom event `synthia:spawn` with `{presetId}` and **immediately shows a success toast**.
2. `useWorld.ts` `handleSpawnEvent` listener receives it, computes `findSpawnPosition()`, calls `objectManager.spawnObject(presetId, spawnPos)`.
3. `ObjectManager.spawnObject`:
   - Special-cases `piano` → `spawnPiano`.
   - Finds a free slot in the **pre-allocated pool** (`slotClaimed[]`, `NUM_ENV_SLOTS = 20`).
   - Creates the THREE.js visual mesh.
   - Looks up body `env_slot_{i}` and sibling geom `env_slot_{i}_{shape}` via `mj_name2id`.
   - **Mutates the compiled model in place**: `model.geom_size`, `model.geom_contype=2`, `model.geom_conaffinity=3`, friction, solref, solimp.
   - Writes 7-value freejoint `qpos` (pos + quat) converted via `worldToMuJoCo`.
4. The render loop (`WorldEngine.start` → `PhysicsEngine.step` at 2 ms fixed timestep / 500 Hz) simulates it; `syncVisuals()` copies `qpos`→`qvel` back to the THREE mesh each frame.

### Custom model path
1. `ObjectSpawner` Custom tab → `GLTFLoader.parse(arrayBuffer)` → `ModelPreview` (rotating 3D preview) → "Spawn Now" / "Save & Spawn" → dispatches `synthia:spawnCustom` with the parsed `THREE.Group`.
2. `useWorld` `handleSpawnCustom` → `ObjectManager.spawnCustomModel(scene, name, spawnPos, {isTerrain})`.
3. `spawnCustomModel` → `collectMeshGeometry()` (flattens world-space vertices+indices) → `reloadStateAndRehydrate(spec)`.
4. `reloadStateAndRehydrate`: captures all agent+object state via `StateRehydrator`, **string-injects custom `<asset>`/`<body>` XML into `baseXml`**, calls `physicsEngine.loadMJCFModel(combinedXml)`, then `StateRehydrator.restore`.
5. The custom body is a dynamic `<freejoint>` body with `<geom type="mesh" mesh="mesh_{id}">` whose vertices are inlined into the XML as `vertex="x y z ..."` / `face="i j k ..."`.

---

## Root-Cause Analysis: Three Bug Clusters

### Cluster A — The spawn button "doesn't work": silent failure + lying toast

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| A1 | `ObjectSpawner.handleSpawn` fires a **success toast unconditionally**, before the actual spawn result is known. `spawnObject` returning `null` or throwing is invisible to the user. | `ObjectSpawner.tsx` `handleSpawn` (line ~70) | "Spawned near the agent" is shown even when nothing spawned |
| A2 | `useWorld.handleSpawnEvent` has **no try/catch and no `isReady` guard**. If `PhysicsEngine.getWorld()` throws or `mj_name2id` returns -1 (slot bodies absent), the exception is swallowed by the event system and only a non-fatal `Logger.error` after the fact may fire. | `useWorld.ts` `handleSpawnEvent` | Silent no-op |
| A3 | **Pre-allocated slot bodies only exist after `spawnAgent()` compiles the combined MJCF.** Before that, the engine runs `PhysicsEngine.init()`'s *minimal* MJCF (floor + light only, no `env_slot_*`). A user clicking spawn during startup (before agent_0's async `loadMJCFModel` completes) gets `bodyId < 0` → `return null` → nothing spawns. | `ObjectManager.spawnObject` (body lookup), `PhysicsEngine.init()` (minimal MJCF), `useWorld` auto-spawn effect | Race: spawns fail silently during startup window |
| A4 | After `NUM_ENV_SLOTS = 20` primitives, `spawnObject` returns `null` with only a `Logger.warn` — UI still toasts success. | `ObjectManager.spawnObject` slot exhaustion | Hard cap with no user feedback |
| A5 | `spawnObject` does not guard `PhysicsEngine.getModule() === null` before `mj_name2id` dereferences. | `ObjectManager.spawnObject` | Potential null deref → exception → swallowed |

### Cluster B — The world silently dies after any custom upload attempt (this is likely the *real* "spawn button broken" trigger)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| B1 | **`<asset>` is injected inside `<worldbody>`.** The custom XML string is `"<asset><mesh .../></asset><body .../>..."` and is concatenated right before `</worldbody>` in both `reloadStateAndRehydrate` **and** `generateCombinedMultiAgentMJCF`. In MJCF, `<asset>` is a **top-level sibling** of `<worldbody>` (schema: `<mujoco><compiler/><asset/><worldbody/><actuator/></mujoco>`). `mj_loadXML` fails. | `ObjectManager.reloadStateAndRehydrate`, `MJCFHumanoidTemplate.generateCombinedMultiAgentMJCF` | XML compile error on **every** custom spawn |
| B2 | When `loadMJCFModel` throws, `isPhysicsBroken=true` and `isReady` stays `false` (the `setReady(true)` in the try block never runs). `PhysicsEngine.step()` then returns early forever. `reloadStateAndRehydrate` catches the error and logs, but the **entire simulation is now frozen** — all future `spawnObject` calls also fail because the engine never steps. | `PhysicsEngine.loadMJCFModel` (catch), `ObjectManager.reloadStateAndRehydrate` (catch/finally) | One failed upload bricks physics until page reload |
| B3 | **Double-emission of custom meshes**: when `__SYNTHIA_GENERATE_COMBINED_MJCF__` exists (it always does after `useWorld` runs), `baseXml = generateCombinedMCF()` **already includes** `objectManager.customMeshesSpec` (see `useWorld.generateCombinedMCF` → `generateCombinedMultiAgentMJCF(agentsList, customSpecs)`). Then `reloadStateAndRehydrate` **appends `[newMeshSpec]` again** → duplicate `mesh_{id}` asset + duplicate `custom_{id}` body → second XML compile failure. Deleting a custom object has the same duplication (remaining specs appended on top of a base that already contains them). | `ObjectManager.reloadStateAndRehydrate` + `useWorld.generateCombinedMCF` | Duplicate-name compile error; the fallback non-combined path (`getCurrentBaseMjcfXml()`) also accumulates duplicates |
| B4 | **Terrain mass=0 with a freejoint**: `spawnCustomModel` sets `mass = options.isTerrain ? 0 : (options.mass ?? 1)` and the XML always emits `<freejoint>` + `<inertial mass="0">`. MuJoCo's compiler rejects/degrades massless dynamic bodies → another potential load failure for terrain uploads. | `ObjectManager.spawnCustomModel` | Terrain uploads may fail compilation |

### Cluster C — Custom meshes render but agents can't interact with them

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | **Wrong collision masks**: custom geoms are emitted `contype="2" conaffinity="1"`. Agent geoms are `contype="2" conaffinity="1"`. Contact requires `(A.contype & B.conaffinity) \|\| (B.contype & A.conaffinity)` → `2&1=0` both ways → **agents and custom objects never collide**. (Floor-object works: floor contype=1, object conaffinity=1 → `1&1=1`.) Primitive slots, by contrast, are set to `contype=2 conaffinity=3` in `spawnObject` → `2&3=2` → agents do collide with them. | `ObjectManager.reloadStateAndRehydrate` custom geom string; compare `spawnObject` mask write | Users see the mesh; the agent walks/clips through it |
| C2 | **Convexity assumption**: MuJoCo `<geom type="mesh">` only collides with **convex** meshes. The default compiler behavior (`meshconvex=auto`) silently replaces concave meshes with their convex hull — so most uploaded props *do* get coarse collision, but it's a poor fit (tables become solid blocks, "U" shapes fill in, etc.). No `meshconvex` attribute is set and no V-HACD decomposition exists, so there is no way to get accurate collision. | `MJCFHumanoidTemplate` / `ObjectManager` custom XML | Bad or missing physical interaction for real-world props |
| C3 | **Slot state is lost on any reload**: on every `reloadStateAndRehydrate` (custom spawn/delete) or agent spawn, the XML is regenerated with **fresh slot geoms** (`size=0.001`, `contype=0`). The remap loop (`this.objects.forEach` after reload) re-finds `bodyId`/`colliders` but **never re-applies geom size, contype/conaffinity, friction**. `StateRehydrator.restore` only restores qpos/qvel, not geom properties. Result: every previously-spawned primitive becomes a 1 mm invisible non-colliding ghost while its THREE mesh stays visible → "spawned objects vanish/fall through the floor after any custom import or agent spawn." | `ObjectManager.reloadStateAndRehydrate` remap block | Primitive objects degrade after reloads |
| C4 | Placeholder presets: `ball_pit`, `swing`, `step` are not mapped in `spawnObject`'s geometry switch — they fall into the `default` cube case. Not a crash, but wrong shapes. | `ObjectManager.spawnObject` switch | Wrong visuals |
| C5 | `.gltf` upload only works if the file is self-contained (base64-embedded buffers/images). A multi-file `.gltf` + `.bin` + textures upload reads **one file** and fails parse. | `ObjectSpawner.handleFileUpload` (single `file.arrayBuffer()`) | Confusing failure for multi-file glTF |

---

## Feasibility Verdict on the Proposed Plan

### V-HACD for MuJoCo collision meshes — ✅ Correct choice, with clarifications

- **V-HACD is the right tool.** MuJoCo's collision engine only supports convex geoms. The two ways to approximate a concave mesh are (a) the compiler's built-in convex hull (`meshconvex` attribute — one crudely fitted hull per mesh) or (b) decomposing the mesh into many convex pieces (V-HACD) and emitting them as a compound convex geom. Only (b) gives table-under-space, stairs, doorframe, and chair physical fidelity. V-HACD is exactly that tool.
- **"Apply once and store" is not just an optimization — it's the only viable architecture.** MuJoCo compiles the MJCF (including mesh vertices) at `loadMJCFModel` time. There is no runtime API to attach or swap a collision shape onto a compiled geom. The decomposition **must** be baked into the mesh data before XML compilation. Therefore: run V-HACD once at import time, persist the hulls, and re-serialize them into XML on every spawn/reload. The user's instinct is exactly right.
- **Nuance — MuJoCo already has auto-convex-hull for free.** Even at zero engineering cost, custom meshes *could* get coarse collision today via the default `meshconvex=auto` compiler behavior (it already applies silently). The gaps are (1) the collision masks (C1) which are *actually* blocking agent interaction, and (2) hull quality. **Recommendation: fix C1 + C2 to unblock interactivity immediately (Phase 1), add V-HACD for hull quality (Phase 2).**
- **Compound geom syntax**: MuJoCo supports `<geom type="mesh" mesh="part1 part2 part3"/>` — multiple mesh names form a single compound convex collider. This is the standard MJCF pattern for convex decomposition output and is what the V-HACD emitter should generate.
- **V-HACD in the browser**: requires a WASM build. Options: `hacd-wasm` (community wrapper of V-HACD 2.0), `three-vhacd` helpers, or hand-rolled emscripten build. The project already ships `@mujoco/mujoco` WASM via `locateFile`, so wiring a second WASM module follows an established pattern. **Must run in a Web Worker** — V-HACD on a 100k-tri mesh can block the main thread for seconds; "apply once" does not excuse a frozen UI.
- **Fallback policy**: tiny/primitive meshes (< ~300 tris) don't need decomposition (they're already convex or near-convex) — emit directly. Huge meshes (> ~200k tris) should warn and use auto-hull or require decimation.

### .glb-only default — ✅ Correct, with one refinement

- `.glb` is the correct default: self-contained binary, `GLTFLoader.parse(arrayBuffer)` already works, no external-file hazards, no extra loaders. `.gltf` should be accepted **only when self-contained** (detect external `.bin` references in the JSON at upload and reject with a friendly message). Doing this validation costs ~10 lines and avoids the false "Uploaded successfully" state for a multi-file glTF.
- **`.stl` is a special case worth reconsidering**: STL is a trivial triangle soup (~40-line parser, zero dependencies, no textures/animation) and is the natural "collision-input" format (CAD exports are usually STL). Adding STL parsing later gives collision-friendly uploads for near-zero cost. `.obj`/`.fbx` can wait — the "convert to .glb" suggestion for those is reasonable and should be surfaced in the dropzone UI ("Only .glb supported — export from Blender as glTF 2.0").

### Preview-before-import — ✅ Already 90% implemented

`ModelPreview.tsx` already renders a rotating preview with auto-centering and dimension display. Refinements: (1) add a **"Show collision mesh" toggle** that overlays the generated hulls (auto-hull wireframe in Phase 1, V-HACD hulls in Phase 2) so users see what physics will be; (2) show triangle count and an estimated "collision complexity" (convex parts count); (3) make the "Import" action *only* fire after the user confirms the preview — currently "Spawn Now" both imports and spawns, which is fine, but there's no "preview-only / cancel" affordance beyond closing the dialog.

---

## Refined Implementation Plan

### Phase 0 — Unbreak spawning & custom uploads (blocking, no new deps)

1. **Fix B1 — asset placement**: move custom `<asset>` blocks to the top level of the MJCF (sibling of `<worldbody>`). Concretely: rewrite `reloadStateAndRehydrate` to *build the full XML* rather than string-injecting near `</worldbody>`:
   - Collect `<asset>` tags and `<body>` tags separately.
   - Insert assets after `<compiler>`/before `<worldbody>`; insert bodies before `</worldbody>`.
   - Same correction in `generateCombinedMultiAgentMJCF` (`customModelsXml` must be split the same way).
2. **Fix B3 — duplicate emission**: add `newMeshSpec` to `this.customMeshesSpec` *before* calling the generator, and let the generator be the single source of truth (it already reads `customMeshesSpec`). Delete the separate `specsToAppend`/append logic. For the non-combined fallback path, the same rule: generate from `customMeshesSpec` only, never append on top of a base that already contains them.
3. **Fix B4 — terrain**: emit terrain as a **static body** (no freejoint), with a small but non-zero mass or MuJoCo `static` semantics (no `<inertial>` → body is welded to world and immovable — this is what "terrain" should mean anyway). Dynamic objects keep `<freejoint>` + real mass.
4. **Fix C1 — interaction masks**: custom geoms → `contype="2" conaffinity="3"` (matching primitives, so agents collide). Terrain geoms → `contype="1" conaffinity="2"` (static world, collides with floor and objects/agents).
5. **Fix C3 — restore slot properties on reload**: store the *effective* spawn params (shape→size, contype/conaffinity, friction, restitution) on each `WorldObject`; in the post-reload remap loop, re-apply them to the fresh slot geoms (same writes as `spawnObject`). This keeps primitives alive across agent spawns and custom imports.
6. **Fix A1/A2/A4/A5 — honest spawn feedback + guards**:
   - `useWorld.handleSpawnEvent`: wrap in try/catch; guard `physicsEngine.isReady`; log-spawn failure with reason.
   - Make `ObjectSpawner` show the toast based on the actual result. Cleanest: have the `synthia:spawn` handler dispatch a synchronous result back (`synthia:spawnResult` event with `{presetId, ok, reason}`) OR move the success toast into `handleSpawnEvent` entirely (single source of truth).
   - Add explicit "slot pool exhausted (20/20)" toast when `NUM_ENV_SLOTS` is full; document the cap in the UI.
7. **Fix C5 — glTF validation**: in `handleFileUpload`, if extension is `.gltf`, parse the JSON; if it references external `.bin`/textures, reject with the "export as .glb" message.
8. **Regression tests**: extend `ObjectManager.test.ts` to assert (a) `spawnObject` works after a custom-model spawn + delete cycle (state survives reload), (b) the generated combined XML parses with custom meshes (asset placement), (c) custom geom masks are `contype=2 conaffinity=3`.

### Phase 1 — Custom collision works without V-HACD (MVP interactivity)

- Ensure `meshconvex` behavior is explicit in the generated XML: set `<compiler meshconvex="auto"/>` (or a deliberate per-model choice).
- Verify agents now collide with uploaded props via the auto convex hull. Validate with the existing integration-test pattern (`PhysicsIntegration.test.ts` — spawn custom, push agent into it, assert `ncon > 0`).
- This phase costs zero new dependencies and unblocks "uploaded objects are interactable" immediately.

### Phase 2 — V-HACD import-time decomposition (the user's plan, refined)

1. **WASM module**: add `hacd-wasm` (or vendored emscripten build of V-HACD 2.0) as an optional, lazy-loaded asset (only fetched when a custom model is imported — keeps initial load small; reuse the `locateFile` pattern from `@mujoco/mujoco`).
2. **Worker**: run decomposition in a single Web Worker; main thread receives `{hulls: {vertices: Float32Array, indices: Uint32Array}[]}`. UI shows "Generating collision mesh…" with progress; include a cancellation path.
3. **Storage**: extend `StoredUploadedModel` (in `src/utils/uploadedModelsStore.ts`) with `processed?: { hullData: ArrayBuffer; hullCount: number; sourceTriCount: number; version: number }` persisted to IndexedDB alongside the GLB. **V-HACD runs exactly once per upload**; every spawn/reload reads the stored hulls. Legacy uploads without `processed` get decomposed lazily on first spawn, then persisted.
4. **MJCF emission**: for each hull part emit an `<asset><mesh name="hull_{id}_{i}" vertex="…" face="…"/></asset>` (top-level!) and one geom per custom body: `<geom type="mesh" mesh="hull_{id}_0 hull_{id}_1 …" contype="2" conaffinity="3"/>`. Inline vertex strings are fine at hull sizes (typically < 2k verts/hull), but cap total inlined verts (e.g., warn + auto-hull fallback above ~50k).
5. **Fallback ladder**: tri count < 300 → direct mesh; 300–50k → V-HACD; > 50k (or worker failure) → `meshconvex=auto` hull + warning toast. This keeps the feature robust even if V-HACD fails on pathological inputs.
6. **Preview integration**: after decomposition completes (worker), show the hull wireframe in `ModelPreview` ("Show collision mesh" toggle) so the user approves the collision before import.

### Phase 3 (optional, later) — Format expansion

- Add `.stl` via a tiny custom parser (reuse the exact same pipeline: parse → preview → V-HACD → store hulls).
- Add `.obj` via `OBJLoader` from `three/examples` (moderate cost).
- Defer `.fbx` (heavy loader, animation-centric) — keep the "convert to .glb" guidance.

---

## Key Non-Obvious Constraints a Developer Must Know

1. **MuJoCo has no runtime collision-shape API.** All geometry (including hulls) is fixed at `mj_loadXML` compile time. Any collision change requires a full model recompile + `StateRehydrator` round-trip. This is why "bake once, store, re-emit on every reload" is the correct pattern.
2. **The whole world is one MuJoCo model, recompiled often.** Spawning an agent, spawning a custom object, or deleting a custom object triggers a full XML recompile of *every* agent + *every* object. The `StateRehydrator` capture/restore must stay in sync: it restores positions but *not* geom properties (C3) — a trap for anyone extending this code.
3. **Collision is opt-in via bitmasks, and the convention is asymmetric**: agents/slots use `contype=2, conaffinity=1..3`; floor uses `contype=1, conaffinity=2`. Getting these backwards is the #1 cause of "I can see it but can't touch it."
4. **The simulation is 500 Hz (2 ms timestep) with `implicitfast` + 100 iterations** — already heavy. Inlining MBs of mesh vertices into the XML on every reload will visibly stall the world; hull-storage + size caps matter.
5. **`weightless`/mass=0 dynamic bodies are invalid in MuJoCo** — terrain must be static (no `<inertial>`, no `<freejoint>`).
6. **`<asset>` is not valid inside `<worldbody>`** — the current code does exactly this, and one failed compile flips `isPhysicsBroken=true` which silently stops all stepping until reload.
7. **The success toast lies.** `ObjectSpawner` reports success before the engine confirms anything. Any "spawn button doesn't work" debugging must start by checking *actual* return values in `useWorld.handleSpawnEvent` / `ObjectManager.spawnObject`.

---

## Suggested Reading Order (for a developer taking this on)

1. `src/world/engine/ObjectManager.ts` — the entire spawn/import/collision surface; where all three bug clusters live.
2. `src/world/engine/MJCFHumanoidTemplate.ts` — the MJCF generator; where `<asset>` placement and slot pre-allocation are defined.
3. `src/world/engine/PhysicsEngine.ts` — the reusable WASM compile/step/mutation lifecycle; `isReady`/`isMutating`/`isPhysicsBroken` semantics.
4. `src/world/hooks/useWorld.ts` — the event wiring, `generateCombinedMCF`, and `StateRehydrator` orchestration.
5. `src/world/engine/StateRehydrator.ts` — what survives a reload (positions/velocities/ctrl) and what doesn't (geom properties).
6. `src/components/godmode/ObjectSpawner.tsx` + `ModelPreview.tsx` — the UI surface and where honest result feedback must be added.
7. `src/world/engine/__tests__/ObjectManager.test.ts` + `PhysicsIntegration.test.ts` — the existing test harness to extend (Node-based GLB load, real MuJoCo WASM).
