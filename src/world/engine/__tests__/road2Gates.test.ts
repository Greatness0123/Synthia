/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import { MotorController, GAIT_BALANCE_SCALE } from '../MotorController';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function beforeAll(fn: () => void): void;
declare function afterAll(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toBeLessThanOrEqual(expected: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toContain(expected: unknown): void;
  toBeDefined(): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
  assert(cond: boolean): void;
  not: {
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toContain(expected: unknown): void;
    toBeDefined(): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
  };
};

// Mock GLTFLoader to parse GLB from disk (identical to multiAgentComposition.test.ts)
const originalLoad = GLTFLoader.prototype.load;
beforeAll(() => {
  GLTFLoader.prototype.load = function(
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
        (gltf: any) => {
          onLoad(gltf);
        },
        (err: any) => {
          if (onError) onError(err);
        }
      );
    } catch (e: any) {
      if (onError) onError(e);
    }
  };
});

afterAll(() => {
  GLTFLoader.prototype.load = originalLoad;
});

// ── Road-2 gate constants ───────────────────────────────────────────────
const DT = 0.002;                          // MuJoCo fixed timestep (500 Hz)
const STEPS_PER_FRAME = 8;                 // 500 Hz physics / 60 Hz render
const STAND_SECONDS = 10;
const STAND_STEPS = Math.round(STAND_SECONDS / DT);
const STRETCH_SECONDS = 5;
const STRETCH_STEPS = Math.round(STRETCH_SECONDS / DT);
const RECOVERY_SECONDS = 3;
const RECOVERY_STEPS = Math.round(RECOVERY_SECONDS / DT);
const TILT_FAIL_DEG = 30;                  // > 30° from vertical ⇒ "fell"
const ROOTH_FAIL = 0.45;                   // capsule center below this ⇒ on the floor
const PUSH_MIN_NS = 20;                    // N·s
const PUSH_MAX_NS = 60;

interface SegmentStats {
  steps: number;
  firstTiltDeg: number;
  lastTiltDeg: number;
  maxTiltDeg: number;
  minRootH: number;
  maxTorqueN: number;
  maxDriftM: number;
  balanceApplied: boolean;
}

interface GateRecord {
  name: string;
  kind: 'PASS' | 'STRETCH';
  pass: boolean;
  stats: SegmentStats;
  note: string;
}

const gateReport: GateRecord[] = [];

// Deterministic seeded RNG (mulberry32)
function mulberry32(seed: number): () => number {
  return function lcg() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Physics read helpers (MuJoCo world: X-forward, Y-left, Z-up) ────────
function capsuleBodyId(binder: HumanoidPhysicsBinder): number {
  const id = binder.getMultiBodyManager().getCapsuleBody();
  if (id === null || id < 0) throw new Error('capsule body not mapped');
  return id;
}

function rootHeight(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  return world.data.xpos[capId * 3 + 2]; // MuJoCo Z-up
}

function rootX(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  return world.data.xpos[capId * 3]; // Three X == MuJoCo X
}

function tiltDeg(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
  const qx = world.data.xquat[capId * 4 + 1];
  const qy = world.data.xquat[capId * 4 + 2];
  const upZ = 1 - 2 * (qx * qx + qy * qy);
  return Math.acos(Math.min(1, Math.max(-1, upZ))) * 180 / Math.PI;
}

type StepFn = (stepIndex: number) => void;

/**
 * Run N physics steps in production order:
 *   engine.step() → binder.applyBalanceStep()   (per 500 Hz step)
 *   binder.updateMotorTargets() + syncVisuals() (per 60 Hz frame)
 */
function runSteps(
  engine: PhysicsEngine,
  binder: HumanoidPhysicsBinder,
  steps: number,
  onStep?: StepFn
): SegmentStats {
  const mc = (binder as any).motorController as MotorController;
  const stats: SegmentStats = {
    steps,
    firstTiltDeg: 0,
    lastTiltDeg: 0,
    maxTiltDeg: 0,
    minRootH: Infinity,
    maxTorqueN: 0,
    maxDriftM: 0,
    balanceApplied: false,
  };
  const startX = rootX(engine, binder);
  let tiltFirst = true;

  for (let s = 0; s < steps; s++) {
    if (engine.isBroken) {
      stats.lastTiltDeg = tiltDeg(engine, binder);
      stats.maxDriftM = Math.max(stats.maxDriftM, Math.abs(rootX(engine, binder) - startX));
      return stats; // physics blew up — stop collecting
    }

    engine.step();

    const ok = binder.applyBalanceStep();
    if (ok) stats.balanceApplied = true;
    stats.maxTorqueN = Math.max(stats.maxTorqueN, mc.lastBalanceTorqueMag);

    if (s % STEPS_PER_FRAME === STEPS_PER_FRAME - 1) {
      binder.updateMotorTargets();
      binder.syncVisuals();
    }

    if (onStep) onStep(s);

    const tilt = tiltDeg(engine, binder);
    const h = rootHeight(engine, binder);
    if (tiltFirst) {
      stats.firstTiltDeg = tilt;
      tiltFirst = false;
    }
    stats.maxTiltDeg = Math.max(stats.maxTiltDeg, tilt);
    stats.minRootH = Math.min(stats.minRootH, h);
    stats.maxDriftM = Math.max(stats.maxDriftM, Math.abs(rootX(engine, binder) - startX));
  }

  stats.lastTiltDeg = tiltDeg(engine, binder);
  return stats;
}

describe('Road-2 prerequisites — Option C + Option A gates', () => {
  let engine: PhysicsEngine;
  let binder: HumanoidPhysicsBinder;

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
  });

  afterEach(() => {
    engine.cleanup();
    binder.cleanup();
  });

  test('Gate A1 (PASS criterion): stand at bind pose for 10 s, no fall', () => {
    const stats = runSteps(engine, binder, STAND_STEPS);

    // Non-silent balance: the 500 Hz corrector must actually have run.
    expect(stats.balanceApplied).toBe(true);
    expect(engine.isBroken).toBe(false);
    expect(stats.maxTiltDeg).toBeLessThan(TILT_FAIL_DEG);
    expect(stats.minRootH).toBeGreaterThan(ROOTH_FAIL);

    console.log(
      `[ROAD2][GATE_A1] steps=${stats.steps} tilt ${stats.firstTiltDeg.toFixed(2)}°→${stats.lastTiltDeg.toFixed(2)}° ` +
      `max=${stats.maxTiltDeg.toFixed(2)}° rootH_min=${stats.minRootH.toFixed(3)} ` +
      `maxTorque=${stats.maxTorqueN.toFixed(2)} N·m drift=${stats.maxDriftM.toFixed(3)} m`
    );
    gateReport.push({ name: 'A1_stand_10s', kind: 'PASS', pass: true, stats, note: 'bind pose, gait inactive' });
  });

  test('Gate A2 (R17 closure): gait-active balance path uses GAIT_BALANCE_SCALE=0.5', () => {
    const mc = (binder as any).motorController as MotorController;
    const module = PhysicsEngine.getModule();
    if (!module) throw new Error('MuJoCo module not loaded');

    // Probe: reset to bind, then impose a known 0.1 rad forward tilt on the root
    // free joint, zero velocities, run one step + one balance application, and
    // record the torque magnitude. The identical state is probed once with
    // gait active and once without; the ratio must equal GAIT_BALANCE_SCALE.
    const TILT_RAD = 0.1; // ~5.7° — small enough that neither probe hits the 120 N·m cap
    const probe = (gaitActive: boolean): number => {
      binder.resetPose({ x: 0, y: 0, z: 0 });
      binder.setStiffnessScale(1.0);

      const world = engine.getWorld();
      const model = world.model;
      const data = world.data;
      const rootJntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, binder.prefix + 'root_freejoint');
      if (rootJntId < 0) throw new Error('root_freejoint not found');
      const qadr = model.jnt_qposadr[rootJntId];
      const dadr = model.jnt_dofadr[rootJntId];

      const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), TILT_RAD);
      const qMj = PhysicsEngine.threeQuatToMuJoCo(tiltQ);
      data.qpos[qadr + 3] = qMj[0];
      data.qpos[qadr + 4] = qMj[1];
      data.qpos[qadr + 5] = qMj[2];
      data.qpos[qadr + 6] = qMj[3];
      for (let i = 0; i < 6; i++) data.qvel[dadr + i] = 0;
      // Clear any residual balance torque so both probes start from xfrc=0.
      const capId = capsuleBodyId(binder);
      for (let i = 0; i < 6; i++) data.xfrc_applied[capId * 6 + i] = 0;

      binder.setGaitActive(gaitActive);
      engine.step();
      binder.applyBalanceStep();
      return mc.lastBalanceTorqueMag;
    };

    const torqueGaitOff = probe(false);
    const torqueGaitOn = probe(true);

    expect(torqueGaitOff).toBeGreaterThan(1.0); // sanity: measurable correction at 5.7° tilt
    expect(torqueGaitOn).toBeLessThan(torqueGaitOff);
    const ratio = torqueGaitOn / torqueGaitOff;
    expect(Math.abs(ratio - GAIT_BALANCE_SCALE)).toBeLessThan(0.15);

    console.log(
      `[ROAD2][GATE_A2] torque gaitOff=${torqueGaitOff.toFixed(2)} N·m gaitOn=${torqueGaitOn.toFixed(2)} N·m ` +
      `ratio=${ratio.toFixed(3)} expected=${GAIT_BALANCE_SCALE}`
    );
  });

  test('Gate B (STRETCH, non-blocking): hold right-leg-forward 0.4 rad for 5 s', () => {
    // COM-over-support problem — the Option B reflex's job. Reported, not asserted.
    const applied = binder.setMotorTargets({ mixamorigrightupleg: [0.4, 0, 0] });
    const accepted = applied.applied.some((j) => j === 'mixamorigrightupleg');
    expect(accepted).toBe(true);

    const stats = runSteps(engine, binder, STRETCH_STEPS);
    expect(stats.balanceApplied).toBe(true);
    expect(engine.isBroken).toBe(false);

    const passed = stats.maxTiltDeg < TILT_FAIL_DEG && stats.minRootH > ROOTH_FAIL;
    console.log(
      `[ROAD2][GATE_B_STRETCH] ${passed ? 'PASS' : 'FAIL (expected until Option B lands)'} ` +
      `steps=${stats.steps} tilt ${stats.firstTiltDeg.toFixed(2)}°→${stats.lastTiltDeg.toFixed(2)}° ` +
      `max=${stats.maxTiltDeg.toFixed(2)}° rootH_min=${stats.minRootH.toFixed(3)} ` +
      `maxTorque=${stats.maxTorqueN.toFixed(2)} N·m`
    );
    gateReport.push({
      name: 'B_forward_leg_5s',
      kind: 'STRETCH',
      pass: passed,
      stats,
      note: 'right upleg pitch 0.4 rad held 5 s; COM-over-support, expects Option B',
    });
  });

  test('Gate C (PASS criterion): survive 3 seeded horizontal pushes', () => {
    // Warm stand so the pose is settled before the first impulse.
    const warm = runSteps(engine, binder, Math.round(1 / DT));
    expect(warm.balanceApplied).toBe(true);

    const rng = mulberry32(424242);
    const pushes: Array<{ angleRad: number; mag: number; maxTiltDeg: number; minRootH: number; maxDriftM: number }> = [];

    for (let i = 0; i < 3; i++) {
      const angleRad = rng() * Math.PI * 2;
      const mag = PUSH_MIN_NS + rng() * (PUSH_MAX_NS - PUSH_MIN_NS);
      const impulse = new THREE.Vector3(Math.cos(angleRad) * mag, 0, Math.sin(angleRad) * mag);

      binder.push('root_capsule', impulse);
      const window = runSteps(engine, binder, RECOVERY_STEPS);

      expect(window.balanceApplied).toBe(true);
      expect(engine.isBroken).toBe(false);
      // Non-vacuous: the push must have actually perturbed the body. The corrector
      // recovers quickly (sub-5cm drift), so we accept either measurable lateral
      // drift OR a measurable torso-tilt spike — either proves the impulse landed.
      expect(window.maxDriftM > 0.015 || window.maxTiltDeg > 1.0).toBe(true);
      expect(window.maxTiltDeg).toBeLessThan(TILT_FAIL_DEG);
      expect(window.minRootH).toBeGreaterThan(ROOTH_FAIL);

      pushes.push({
        angleRad,
        mag,
        maxTiltDeg: window.maxTiltDeg,
        minRootH: window.minRootH,
        maxDriftM: window.maxDriftM,
      });
      console.log(
        `[ROAD2][GATE_C] push#${i + 1} angle=${(angleRad * 180 / Math.PI).toFixed(0)}° mag=${mag.toFixed(2)} N·s ` +
        `maxTilt=${window.maxTiltDeg.toFixed(2)}° rootH_min=${window.minRootH.toFixed(3)} drift=${window.maxDriftM.toFixed(3)} m ` +
        `maxTorque=${window.maxTorqueN.toFixed(2)} N·m`
      );
    }

    gateReport.push({
      name: 'C_3_pushes',
      kind: 'PASS',
      pass: true,
      stats: {
        steps: 3 * RECOVERY_STEPS,
        firstTiltDeg: 0,
        lastTiltDeg: 0,
        maxTiltDeg: Math.max(...pushes.map((p) => p.maxTiltDeg)),
        minRootH: Math.min(...pushes.map((p) => p.minRootH)),
        maxTorqueN: 0,
        maxDriftM: Math.max(...pushes.map((p) => p.maxDriftM)),
        balanceApplied: true,
      },
      note: `pushes: ${pushes.map((p) => `${p.mag.toFixed(0)} N·s @ ${(p.angleRad * 180 / Math.PI).toFixed(0)}°`).join(', ')}`,
    });
  });

  afterAll(() => {
    const out = {
      generatedAt: new Date().toISOString(),
      dt: DT,
      gains: { BALANCE_KP: 800, BALANCE_KD: 320, MAX_BALANCE_TORQUE: 120, GAIT_BALANCE_SCALE },
      gates: gateReport,
    };
    fs.writeFileSync(path.resolve(process.cwd(), 'road2-gate-stats.json'), JSON.stringify(out, null, 2));
    console.log('[ROAD2] stats dumped to road2-gate-stats.json');
  });
});
