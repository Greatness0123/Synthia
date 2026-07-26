import { PhysicsEngine } from '../world/engine/PhysicsEngine';

let _intervalId: ReturnType<typeof setInterval> | null = null;

const FOOT_BONES = ['mixamorigLeftFoot', 'mixamorigRightFoot'];

/**
 * Computes the actual, real-time foot-ground gap distance under any orientation or tilt.
 * Queries geom_size from MjModel and world position (geom_xpos) and rotation matrix (geom_xmat) from MjData.
 * Projects all 8 local corners of the foot box and takes the minimum Z coordinate.
 */
function logFootGroundDistance() {
  const engine = (window as any).__SYNTHIA_PHYSICS_ENGINE__;
  if (!engine) return;
  const model = engine.getModel?.();
  const data = engine.getData?.();
  if (!model || !data) return;
  const module = PhysicsEngine.getModule();
  if (!module) return;

  for (const boneName of FOOT_BONES) {
    const geomName = `${boneName}_geom`;
    const geomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, geomName);
    if (geomId < 0) continue;

    // Get geom size (box dimensions: halfWidth, halfLength, halfHeight)
    const sizeIdx = geomId * 3;
    const hW = model.geom_size[sizeIdx];
    const hL = model.geom_size[sizeIdx + 1];
    const hH = model.geom_size[sizeIdx + 2];

    // Get world position of the geom
    const posIdx = geomId * 3;
    const gx = data.geom_xpos[posIdx];
    const gy = data.geom_xpos[posIdx + 1];
    const gz = data.geom_xpos[posIdx + 2];

    // Get 3x3 row-major world rotation matrix
    const matIdx = geomId * 9;
    const R0 = data.geom_xmat[matIdx];
    const R1 = data.geom_xmat[matIdx + 1];
    const R2 = data.geom_xmat[matIdx + 2];
    const R3 = data.geom_xmat[matIdx + 3];
    const R4 = data.geom_xmat[matIdx + 4];
    const R5 = data.geom_xmat[matIdx + 5];
    const R6 = data.geom_xmat[matIdx + 6];
    const R7 = data.geom_xmat[matIdx + 7];
    const R8 = data.geom_xmat[matIdx + 8];

    // Project all 8 local box corners to world space and compute minimum Z coordinate
    let minZ = Infinity;

    const signs = [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 1],
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, -1],
      [1, 1, 1]
    ];

    for (const [sx, sy, sz] of signs) {
      const px = sx * hW;
      const py = sy * hL;
      const pz = sz * hH;

      // Rotate local coordinates by geom_xmat row-major rotation matrix
      const rx = R0 * px + R1 * py + R2 * pz;
      const ry = R3 * px + R4 * py + R5 * pz;
      const rz = R6 * px + R7 * py + R8 * pz;

      const worldZ = gz + rz;
      if (worldZ < minZ) {
        minZ = worldZ;
      }
    }

    // Ground is at Z = 0 in MuJoCo coordinate convention
    const gapMm = minZ * 1000;

    const side = boneName.includes('Left') ? 'L' : 'R';
    const ts = (performance.now() / 1000).toFixed(2);
    console.log(`[foot-ground] ${ts}s ${side}foot gap=${gapMm.toFixed(1)}mm  geomZ=${(gz * 1000).toFixed(1)}mm`);
  }
}

function start() {
  if (_intervalId !== null) return;

  console.log('[foot-ground] Starting — will stop after 8 seconds.');

  _intervalId = setInterval(() => {
    try {
      logFootGroundDistance();
    } catch {
      // engine not ready yet, silently retry
    }
  }, 16);

  setTimeout(() => {
    stop();
  }, 8000);
}

function stop() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.log('[foot-ground] Stopped.');
  }
}

// Expose to window
if (typeof window !== 'undefined') {
  (window as any).startFootGroundDistance = start;
  (window as any).stopFootGroundDistance = stop;

  // Auto-start: poll until physics engine is ready, then start logging
  const autoStart = setInterval(() => {
    const engine = (window as any).__SYNTHIA_PHYSICS_ENGINE__;
    if (engine && typeof engine.getModel === 'function') {
      clearInterval(autoStart);
      start();
    }
  }, 500);
}
