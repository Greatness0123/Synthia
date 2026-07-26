# MuJoCo Model Loading API — Verification Report

## Question: Does this codebase use the wrong MuJoCo API method names?

**Answer: No — the codebase already uses the correct API pattern throughout.** The analysis in the user's message about what pattern *should* be used is correct, and the codebase already implements it properly. There is no instance of `from_xml_string` or `from_xml_path` anywhere in the source code.

## The Codebase's Actual MuJoCo Binding Usage

### PhysicsEngine.ts (lines 212–240) — The core model loader

```typescript
// Correct pattern: FS.writeFile + mj_loadXML
module.FS.writeFile('/model.xml', xmlString);
this.model = module.MjModel.mj_loadXML('/model.xml');
this.data = new module.MjData(this.model);
```

This is exactly the pattern the analysis recommends:
1. ✅ `FS.writeFile` to write XML to Emscripten's virtual filesystem
2. ✅ `MjModel.mj_loadXML('/model.xml')` — the static method, called with VFS path
3. ✅ `new MjData(model)` to create the simulation state

### PhysicsEngine.init() (lines 249–280) — Initial bootstrap

Same pattern for the minimal test model:
```typescript
module.FS.writeFile('/model.xml', minimalMJCF);
this.model = module.MjModel.mj_loadXML('/model.xml');
this.data = new module.MjData(this.model);
```

### BodyManager.ts (line 88) — Full humanoid model loading

Delegates to PhysicsEngine:
```typescript
this.physicsEngine.loadMJCFModel(mjcfXml);
```

Which calls the same `FS.writeFile` + `MjModel.mj_loadXML` sequence internally.

### The `@mujoco/mujoco` v3.10.0 TypeScript definitions confirm

Looking at the actual `node_modules/@mujoco/mujoco/mujoco.d.ts` type declaration:
- `MjModel` is a `ClassHandle` with many properties
- There is **no** `from_xml_string`, `from_xml_path`, or `loadFromXML` method defined in the type declarations
- The loading function is the raw Emscripten-bound free function `mj_loadXML` — exposed as `module.MjModel.mj_loadXML(path)` via Embind's class binding mechanism

## What the analysis got right

| Claim | Status |
|-------|--------|
| "The real API is `MjModel.loadFromXML(path)`" | ⚠️ Partially — the actual exposed method is `MjModel.mj_loadXML(path)` (lowercase `m`) |
| "`from_xml_string` doesn't exist" | ✅ Correct — it's not in the bindings |
| "Must use FS.writeFile first" | ✅ Correct — the codebase does this |
| "MuJoCo uses Z-up convention" | ✅ Handled correctly throughout |
| "Methods differ across versions" | ✅ Ground truth confirmed by reading the installed package's types |

## One subtle difference from the analysis

The analysis suggests `const model = mujoco.MjModel.loadFromXML('/working/humanoid.xml')` as the correct API name, but the actual `@mujoco/mujoco` v3.10.0 binding exposes it as **`mj_loadXML`** (preserving the C function name). The method name is `mj_loadXML`, not `loadFromXML`. The codebase correctly uses `module.MjModel.mj_loadXML()`.

The complete loading sequence in this codebase:
```typescript
// 1. Write XML to Emscripten VFS
module.FS.writeFile('/model.xml', mjcfXmlString);

// 2. Load via mj_loadXML with VFS path
const model = module.MjModel.mj_loadXML('/model.xml');

// 3. Create simulation data
const data = new module.MjData(model);
```

## Conclusion

This codebase does **not** have the bug described in the analysis. It uses the correct VFS-based `FS.writeFile` + `MjModel.mj_loadXML` pattern throughout. No `from_xml_string` or `from_xml_path` calls exist anywhere in `src/world/engine/`.
