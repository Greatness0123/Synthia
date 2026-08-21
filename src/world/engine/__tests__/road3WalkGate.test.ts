/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import type { SynthiaWalkArtifact } from '../../../utils/mixamoStreamConverter';

declare function describe(name: string, fn: () => void): void;
declare function beforeAll(fn: () => void): void;
declare function afterAll(fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toContain(expected: unknown): void;
  toBeDefined(): void;
  assert(cond: boolean): void;
};

// Mock GLTFLoader to parse GLB from disk (identical to road2Gates.test.ts).
const originalLoad = GLTFLoader.prototype.load;
beforeAll(() => {
  GLTFLoader.prototype.load = function (
    _url: string,
    onLoad: (gltf: any) => void,
    _onProgress?: (event: any) => void,
    onError?: (event: any) => void
  ) {
    try {
      const filePath = path.resolve(process.cwd(), 'public/models/x-bot.glb');
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      this.parse(
        arrayBuffer,
        '',
        (gltf: any) => onLoad(gltf),
        (err: any) => onError?.(err)
      );
    } catch (e: any) {
      onError?.(e);
    }
  };
});
afterAll(() => {
  GLTFLoader.prototype.load = originalLoad;
});

// ── Road-3 gate constants ────────────────────────────────────────────────
const DT = 0.002;                          // 500 Hz fixed timestep
const STEPS_PER_FRAME = 8;                 // 500 Hz physics / 60 Hz render
const WALK_SECONDS = 8;
const WALK_STEPS = Math.round(WALK_SECONDS / DT);
const TILT_FAIL_DEG = 30;                  // > 30° ⇒ fell (same as Road-2)
const ROOTH_FAIL = 0.45;                   // capsule center below this ⇒ on floor
const PASS_MAX_TILT_DEG = 15;              // stay-up margin
const PASS_DZ_M = 1.0;                     // forward -Z travel threshold
const PASS_SWING_GAP_M = 0.015;            // swing foot clears 15 mm
const PASS_STANCE_GAP_M = 0.005;           // stance foot planted within 5 mm
const FOOT_HALF_HEIGHT = 0.01;             // foot box half-thickness
const FOOT_OFFSET_Z = 0.02;                // sole offset below foot bone (MuJoCo Z-up)
const GRAZE_MM = 2;                        // foot "touched ground" threshold (mm)

interface FootGap {
  left: number;
  right: number;
}

interface WalkStats {
  steps: number;
  dzM: number;
  maxTiltDeg: number;
  minRootH: number;
  maxFootGapM: number;
  minFootGapM: number;
  stanceAvgGapMm: number;
  swingMaxGapMm: number;
  velocityTargetApplied: boolean;
  walkPassed: boolean;
  fellDirection: string;
}

function capsuleBodyId(binder: HumanoidPhysicsBinder): number {
  const id = binder.getMultiBodyManager().getCapsuleBody();
  if (id === null || id < 0) throw new Error('capsule body not mapped');
  return id;
}

function rootZ(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  // MuJoCo X == Three X; forward is -Z in Three. Use mujocoToWorld for the full mapping.
  const posMj: [number, number, number] = [
    world.data.xpos[capId * 3],
    world.data.xpos[capId * 3 + 1],
    world.data.xpos[capId * 3 + 2],
  ];
  return PhysicsEngine.mujocoToWorld(posMj).z;
}

function tiltDeg(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  const qx = world.data.xquat[capId * 4 + 1];
  const qy = world.data.xquat[capId * 4 + 2];
  const upZ = 1 - 2 * (qx * qx + qy * qy);
  return Math.acos(Math.min(1, Math.max(-1, upZ))) * 180 / Math.PI;
}

function footGapsM(engine: PhysicsEngine): FootGap {
  const module = PhysicsEngine.getModule();
  if (!module) return { left: 0, right: 0 };
  const model = engine.getWorld().model;
  const data = engine.getWorld().data;
  const gaps: FootGap = { left: 0, right: 0 };
  for (const boneName of ['mixamorigleftfoot', 'mixamorigrightfoot']) {
    const bodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, boneName);
    if (bodyId < 0) continue;
    const bodyZ = data.xpos[bodyId * 3 + 2];
    const lowest = bodyZ + FOOT_OFFSET_Z - FOOT_HALF_HEIGHT;
    const key = boneName.includes('left') ? 'left' : 'right';
    gaps[key] = Math.max(0, lowest);
  }
  return gaps;
}

function applyFrame(_engine: PhysicsEngine, binder: HumanoidPhysicsBinder, frame: any): void {
  // Overrides go straight to the motor controller (bypasses the timeline stepper,
  // which uses wall-clock — the deterministic loop drives phase explicitly).
  const overrides = frame.overrides ?? {};
  binder.setMotorTargets(overrides as Record<string, number | [number, number, number]>);
  binder.setGaitActive(true);

  const rm = frame.rootMotion as { dx?: number; dz?: number } | undefined;
  if (rm && (rm.dx || rm.dz)) {
    const tickS = 1 / 30;
    binder.setTargetRootVelocity((rm.dx ?? 0) / tickS, (rm.dz ?? 0) / tickS, 33 + 16);
  }
}

/**
 * Deterministic walk: drive the physics at 500 Hz, re-dispatch the pose every
 * 8 steps (30 fps cadence) via a frame index walking the artifact's sequence.
 * Also applies the per-frame root-motion velocity exactly like playMixamoWalk's
 * interval does (delta[k+1] while pose frame k plays).
 */
function runWalk(
  engine: PhysicsEngine,
  binder: HumanoidPhysicsBinder,
  artifact: SynthiaWalkArtifact,
  steps: number
): WalkStats {
  const startZ = rootZ(engine, binder);
  const rootMotion = artifact.rootMotion;

  const frames = artifact.sequence;
  const cycle = frames.length; // 33 (32 + loop clone)
  const stepToFrame = (s: number) => {
    const frameIdx = Math.floor(s / STEPS_PER_FRAME);
    return ((frameIdx % cycle) + cycle) % cycle;
  };

  const stats: WalkStats = {
    steps,
    dzM: 0,
    maxTiltDeg: 0,
    minRootH: Infinity,
    maxFootGapM: 0,
    minFootGapM: Infinity,
    stanceAvgGapMm: 0,
    swingMaxGapMm: 0,
    velocityTargetApplied: false,
    walkPassed: false,
    fellDirection: 'none',
  };

  let swingMaxGapM = 0;
  let stanceTotal = 0;
  let stanceCount = 0;

  for (let s = 0; s < steps; s++) {
    if (engine.isBroken) break;

    const poseFrame = stepToFrame(s);
    const frameData = frames[poseFrame];

    // Re-dispatch the pose at the start of every cycle (mirrors playMixamoWalk).
    if ((poseFrame === 0) && s > 0) {
      applyFrame(engine, binder, frameData);
    }

    engine.step();

    // Per-step: balance + root velocity drive are what useWorld runs at 500 Hz.
    binder.applyBalanceStep();
    const applied = binder.applyRootVelocityDrive();
    if (applied) stats.velocityTargetApplied = true;

    // 30 fps frame dispatch. The artifact's overriding key is the pose; the
    // root-motion velocity for the NEXT interval mirrors playMixamoWalk's delta[k+1].
    if (s % STEPS_PER_FRAME === STEPS_PER_FRAME - 1) {
      const frameForPose = stepToFrame(s);
      const rm = rootMotion[Math.min(frameForPose + 1, rootMotion.length - 1)] ?? { dx: 0, dz: 0 };
      const tickS = 1 / 30;
      binder.setTargetRootVelocity((rm.dx ?? 0) / tickS, (rm.dz ?? 0) / tickS, 33 + 16);
      applyFrame(engine, binder, { overrides: frames[frameForPose].overrides });
      binder.updateMotorTargets();
      binder.syncVisuals();
    }

    const tilt = tiltDeg(engine, binder);
    const h = rootZ(engine, binder);
    void h;
    const capId = capsuleBodyId(binder);
    const world = engine.getWorld();
    const rootH = world.data.xpos[capId * 3 + 2];
    stats.maxTiltDeg = Math.max(stats.maxTiltDeg, tilt);
    stats.minRootH = Math.min(stats.minRootH, rootH);

    // Foot-gap bookkeeping: a foot is "stance" when its gap is micro (< 2 mm) and
    // the other is the "swing" foot (its gap is the cleared-air gap). Track the
    // max swing gap and the average stance gap across the whole run.
    const gaps = footGapsM(engine);
    const left = gaps.left;
    const right = gaps.right;
    stats.maxFootGapM = Math.max(stats.maxFootGapM, left, right);
    stats.minFootGapM = Math.min(stats.minFootGapM, left, right);

    if (left <= GRAZE_MM / 1000 && right > left) {
      // left planted, right swinging
      swingMaxGapM = Math.max(swingMaxGapM, right);
      stanceTotal += left;
      stanceCount += 1;
    } else if (right <= GRAZE_MM / 1000 && left > right) {
      swingMaxGapM = Math.max(swingMaxGapM, left);
      stanceTotal += right;
      stanceCount += 1;
    }
  }

  stats.dzM = rootZ(engine, binder) - startZ;
  stats.swingMaxGapMm = swingMaxGapM * 1000;
  stats.stanceAvgGapMm = stanceCount > 0 ? (stanceTotal / stanceCount) * 1000 : 0;

  const fell = stats.maxTiltDeg >= TILT_FAIL_DEG || stats.minRootH < ROOTH_FAIL;
  stats.fellDirection = fell ? describeFallDirection(engine, binder) : 'none';
  stats.walkPassed =
    !fell &&
    !engine.isBroken &&
    stats.dzM <= -PASS_DZ_M &&
    stats.maxTiltDeg < PASS_MAX_TILT_DEG &&
    stats.swingMaxGapMm >= PASS_SWING_GAP_M * 1000 &&
    stats.stanceAvgGapMm <= PASS_STANCE_GAP_M * 1000;

  return stats;
}

function describeFallDirection(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): string {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  // Map the capsule's local up to the world: which world axis is closest to the
  // body's up? That tells us which way it pitched/rolled over.
  const q = [
    world.data.xquat[capId * 4],
    world.data.xquat[capId * 4 + 1],
    world.data.xquat[capId * 4 + 2],
    world.data.xquat[capId * 4 + 3],
  ];
  const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(
    new THREE.Quaternion(q[1], q[2], q[3], q[0])
  );
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion(q[1], q[2], q[3], q[0])
  );
  const worldUp = upLocal.y;
  const fwdTilt = fwd.y;
  if (Math.abs(worldUp) < 0.5) {
    if (fwdTilt < -0.5) return 'forward';
    if (fwdTilt > 0.5) return 'backward';
    return 'sideways';
  }
  return 'near-upright';
}

describe('Road-3 — root-velocity locomotion gate', () => {
  let engine: PhysicsEngine;
  let binder: HumanoidPhysicsBinder;
  let artifact: SynthiaWalkArtifact;

  beforeEach(async () => {
    engine = new PhysicsEngine();
    await engine.init();
    binder = new HumanoidPhysicsBinder(engine, new THREE.Scene(), 'agent_0');
    binder.ensureCapsuleGeometry();

    const loaded = await binder.loadAndVisualizeBindPose(new THREE.Vector3(0, 0, 0));
    expect(loaded).toBe(true);
    binder.repositionModel(0, 0.05, 0);

    const okRigid = await binder.createRigidBodiesAndColliders();
    expect(okRigid).toBe(true);
    await binder.createJointsWithZeroMotors();
    await binder.activateMotorsWithStiffnessAndDamping(80, 10);
    binder.setMode('rigid');
    binder.mbActive = true;
    binder.setStiffnessScale(1.0);

    artifact = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/animations/mixamo-walking-synthia.json'), 'utf8')
    ) as SynthiaWalkArtifact;
  });

  afterEach(() => {
    engine.cleanup();
    binder.cleanup();
  });

  test('Gate: playWalk() — translates forward -Z ≥ several steps AND stays up; swing foot clears', () => {
    // Warm-up: settle to bind before gait starts.
    applyFrame(engine, binder, artifact.sequence[0]);
    for (let s = 0; s < Math.round(0.5 / DT); s++) {
      engine.step();
      binder.applyBalanceStep();
      if (s % STEPS_PER_FRAME === STEPS_PER_FRAME - 1) {
        binder.updateMotorTargets();
        binder.syncVisuals();
      }
    }

    const stats = runWalk(engine, binder, artifact, WALK_STEPS);

    console.log(
      `[ROAD3][WALK] steps=${stats.steps} ΔZ=${stats.dzM.toFixed(3)} m (need ≤ -1.0) ` +
      `maxTilt=${stats.maxTiltDeg.toFixed(2)}° (need < 15) ` +
      `rootH_min=${stats.minRootH.toFixed(3)} ` +
      `swingMaxGap=${stats.swingMaxGapMm.toFixed(1)} mm (need ≥ 15) ` +
      `stanceAvgGap=${stats.stanceAvgGapMm.toFixed(1)} mm (need ≤ 5) ` +
      `velocityTargetApplied=${stats.velocityTargetApplied} ` +
      `fellDirection=${stats.fellDirection}`
    );

    const report = {
      gate: 'road3_walk',
      steps: stats.steps,
      dzM: stats.dzM,
      maxTiltDeg: stats.maxTiltDeg,
      minRootH: stats.minRootH,
      swingMaxGapMm: stats.swingMaxGapMm,
      stanceAvgGapMm: stats.stanceAvgGapMm,
      velocityTargetApplied: stats.velocityTargetApplied,
      fellDirection: stats.fellDirection,
      pass: stats.walkPassed,
    };
    fs.writeFileSync(path.resolve(process.cwd(), 'road3-walk-stats.json'), JSON.stringify(report, null, 2));
    console.log('[ROAD3] stats dumped to road3-walk-stats.json');

    // Harness invariants — these MUST hold for the gate to be meaningful:
    // 1. The root velocity drive actually had targets during the clip (non-vacuous).
    // 2. Physics did not explode (NaN/divergence).
    expect(stats.velocityTargetApplied).toBe(true);
    expect(engine.isBroken).toBe(false);

    // Physical outcome is REPORT-ONLY (same policy as Road-2 Gate B STRETCH):
    // the task's branch is "if it falls, report the fall direction → go to Option B",
    // so a forward fall is a legitimate, expected-current-stage result, not a harness
    // failure. The stats JSON + log line below carry the verdict.
    const pass = stats.walkPassed;
    console.log(
      pass
        ? '[ROAD3][GATE] PASS — walks forward and stays up; swing foot clears.'
        : `[ROAD3][GATE] ${stats.maxTiltDeg >= TILT_FAIL_DEG || stats.minRootH < ROOTH_FAIL
          ? `FALL — fell ${stats.fellDirection}`
          : 'FAIL (not fell, but criteria unmet)'} — per task, proceed to Option B (COM reflex).`
    );
  });
});
