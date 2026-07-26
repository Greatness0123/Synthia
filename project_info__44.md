# MuJoCo Model Loading API — Verification Report

## Question: Does this codebase use the wrong MuJoCo API method names?

**Answer: No — the codebase already uses the correct API pattern throughout.** The analysis in your message about what pattern *should* be used is correct, and the codebase already implements it properly. There is no instance of `from_xml_string` or `from_xml_path` anywhere in the source code.

## The Codebase's Actual MuJoCo Binding Usage

### PhysicsEngine.ts (lines 212–240) — The core model loader

```typescript
// Correct pattern: FS.writeFile + mj_loadXML
module.FS.writeFile('/model.xml', xmlString);
this.model = module.MjModel.mj_loadXML('/model.xml');
this.data = new module.MjData(this.model);
```

This is exactly the pattern your analysis recommends:
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

## What the installed `@mujoco/mujoco` v3.10.0 types actually contain

I read `node_modules/@mujoco/mujoco/mujoco.d.ts` directly. The type declarations confirm:
- `MjModel` is a `ClassHandle` with many properties but **no `from_xml_string`**, **no `from_xml_path`**, and **no `loadFromXML`**
- The actual exposed loading method is `MjModel.mj_loadXML(path)` — preserving the lowercase C function name via Embind
- `MjData` constructor takes a model: `new MjData(MjModel)`

## The one difference: exact method name

Your analysis suggested the correct API is `mujoco.MjModel.loadFromXML(path)`. The actual `@mujoco/mujoco` v3.10.0 binding exposes it as **`mj_loadXML`** (preserving the C function name verbatim). This codebase correctly uses `module.MjModel.mj_loadXML()` — which matches what the installed package actually exports.

## Conclusion

This codebase does **not** have the bug you described. It uses the correct VFS-based `FS.writeFile` + `MjModel.mj_loadXML` pattern throughout `PhysicsEngine.ts`. No `from_xml_string`, `from_xml_path`, or `loadFromXML` calls exist anywhere in `src/world/engine/`. If there's a runtime failure, it's coming from somewhere else — not from a wrong method name on the MuJoCo binding.