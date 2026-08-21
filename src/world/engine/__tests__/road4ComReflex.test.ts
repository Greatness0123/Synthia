/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import type { ReflexGains } from '../ComReflexController';
import { GAIT_CYCLE, SWING_WINDOWS, isSideSwinging, type Side } from '../gaitPhaseMap';
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

// Mock GLTFLoader to parse GLB from disk (identical to road3WalkGate.test.ts).
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

// ── Road-4 gate constants ──────────────────────────────────────────────
const DT = 0.002;                          // 500 Hz fixed timestep
const STEPS_PER_FRAME = 8;                 // 500 Hz physics / 60 Hz render
const WALK_SECONDS = 8;
const WALK_STEPS = Math.round(WALK_SECONDS / DT);
const TILT_FAIL_DEG = 30;                  // > 30° ⇒ fell (same as Road-2/3)
const ROOTH_FAIL = 0.45;                   // capsule center below this ⇒ on floor
const PASS_MAX_TILT_DEG = 15;              // stay-up margin
const PASS_DZ_M = 1.0;                     // forward -Z travel threshold
const PASS_SWING_GAP_M = 0.015;            // swing foot clears 15 mm (middle third)
const PASS_STANCE_GAP_M = 0.005;           // stance foot planted within 5 mm
const FOOT_HALF_HEIGHT = 0.01;             // foot box half-thickness
const FOOT_OFFSET_Z = 0.02;                // sole offset below foot bone (MuJoCo Z-up)
const GRAZE_MM = 2;                        // foot "touched ground" threshold (mm)

/**
 * Round 4 gains — FROZEN at round 3. This round measures the per-leg swing FSM
 * fix in ISOLATION (mandatory plant + refractory + one-swinger-max + abort), so
 * NOTHING is re-tuned here. If the sub-law still says `step`, re-analyze the
 * FSM; if it says `lean`, a later round re-tunes kH≈3–5 / kD≈0.6–0.8.
 */
const ROUND_GAINS: ReflexGains = {
  kH: 2.0,
  kD: 0.4,
  kCapture: 1.0,
  forceStepM: 0.10,
  maxLeanRad: 0.25,
  maxSwingHipRad: 0.5,
};

// ── Move artifact field layout (same shape as road3's walk artifact) ───
interface MoveFrame {
  timeOffsetMs: number;
  overrides: Record<string, number | [number, number, number]>;
  rootMotion?: { dx?: number; dz?: number };
}

interface FootGap {
  left: number;
  right: number;
}

interface ReflexWalkStats {
  steps: number;
  dzM: number;
  maxTiltDeg: number;
  minRootH: number;
  swingMiddleThirdMinGapMm: number;
  stanceMaxGapMm: number;
  velocityTargetApplied: boolean;
  reflexApplied: boolean;
  fellDirection: string;
  eMaxM: number;
  vMaxMps: number;
  leanOffsetMaxRad: number;
  forcedStepCount: number;
  forcedPerCycle: number;
  swingSteps: number;
  stanceSideFlips: number;
  stanceReplantCycles: number;
  swingAborts: number;
  plantedTouchdowns: number;
  subLaw: string;
  subLawReason: string;
  walkPassed: boolean;
}

function capsuleBodyId(binder: HumanoidPhysicsBinder): number {
  const id = binder.getMultiBodyManager().getCapsuleBody();
  if (id === null || id < 0) throw new Error('capsule body not mapped');
  return id;
}

function rootZ(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): number {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
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

function applyFrame(_engine: PhysicsEngine, binder: HumanoidPhysicsBinder, frame: MoveFrame): void {
  const overrides = frame.overrides ?? {};
  binder.setMotorTargets(overrides as Record<string, number | [number, number, number]>);
  binder.setGaitActive(true);

  const rm = frame.rootMotion as { dx?: number; dz?: number } | undefined;
  if (rm && (rm.dx || rm.dz)) {
    const tickS = 1 / 30;
    binder.setTargetRootVelocity((rm.dx ?? 0) / tickS, (rm.dz ?? 0) / tickS, 33 + 16);
  }
}

/** Cycle-fraction window of the MIDDLE THIRD of the side's swing window. */
function middleThirdRange(side: Side): { startU: number; endU: number } {
  const w = SWING_WINDOWS[side];
  const span = w.endU - w.startU;
  return { startU: w.startU + span * (1 / 3), endU: w.startU + span * (2 / 3) };
}

function describeFallDirection(engine: PhysicsEngine, binder: HumanoidPhysicsBinder): string {
  const world = engine.getWorld();
  const capId = capsuleBodyId(binder);
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

/**
 * Deterministic Road-4 walk: 500 Hz physics, 30 fps pose dispatch, per-step
 * balance → root assist → COM reflex (exactly the useWorld order).
 */
function runWalk(
  engine: PhysicsEngine,
  binder: HumanoidPhysicsBinder,
  artifact: SynthiaWalkArtifact,
  steps: number
): ReflexWalkStats {
  const startZ = rootZ(engine, binder);
  const rootMotion = artifact.rootMotion;
  const frames = artifact.sequence;
  const cycle = frames.length;
  const stepToFrame = (s: number) => {
    const frameIdx = Math.floor(s / STEPS_PER_FRAME);
    return ((frameIdx % cycle) + cycle) % cycle;
  };
  const frameToU = (f: number) => (f % GAIT_CYCLE.frames) / GAIT_CYCLE.frames;

  const stats: ReflexWalkStats = {
    steps,
    dzM: 0,
    maxTiltDeg: 0,
    minRootH: Infinity,
    swingMiddleThirdMinGapMm: Infinity,
    stanceMaxGapMm: 0,
    velocityTargetApplied: false,
    reflexApplied: false,
    fellDirection: 'none',
    eMaxM: 0,
    vMaxMps: 0,
    leanOffsetMaxRad: 0,
    forcedStepCount: 0,
    forcedPerCycle: 0,
    swingSteps: 0,
    stanceSideFlips: 0,
    stanceReplantCycles: 0,
    swingAborts: 0,
    plantedTouchdowns: 0,
    subLaw: 'none',
    subLawReason: '',
    walkPassed: false,
  };

  let initializedSwing = false;
  let stanceGapMaxM = 0;

  for (let s = 0; s < steps; s++) {
    if (engine.isBroken) break;

    const poseFrame = stepToFrame(s);

    engine.step();

    // Per-step (500 Hz): balance first, then root assist, then COM reflex.
    binder.applyBalanceStep();
    const applied = binder.applyRootVelocityDrive();
    if (applied) stats.velocityTargetApplied = true;
    const reflexApplied = binder.applyComReflexStep(0.002);
    if (reflexApplied) stats.reflexApplied = true;

    // 30 fps frame dispatch (mirrors playMixamoWalk).
    if (s % STEPS_PER_FRAME === STEPS_PER_FRAME - 1) {
      const frameForPose = stepToFrame(s);
      const rm = rootMotion[Math.min(frameForPose + 1, rootMotion.length - 1)] ?? { dx: 0, dz: 0 };
      const tickS = 1 / 30;
      binder.setTargetRootVelocity((rm.dx ?? 0) / tickS, (rm.dz ?? 0) / tickS, 33 + 16);
      applyFrame(engine, binder, { overrides: frames[frameForPose].overrides } as MoveFrame);
      binder.updateMotorTargets();
      binder.syncVisuals();
    }

    const tilt = tiltDeg(engine, binder);
    const capId = capsuleBodyId(binder);
    const world = engine.getWorld();
    const rootH = world.data.xpos[capId * 3 + 2];
    stats.maxTiltDeg = Math.max(stats.maxTiltDeg, tilt);
    stats.minRootH = Math.min(stats.minRootH, rootH);

    // Foot-gap bookkeeping with swing-window MIDDLE THIRD gating:
    // for each side, when u is in the middle third of that side's swing band,
    // the swing-foot gap at that moment is the clearance sample (min over run);
    // the OTHER foot is the stance sample (max over run).
    const u = frameToU(poseFrame);
    const gaps = footGapsM(engine);
    for (const side of ['left', 'right'] as Side[]) {
      const m = middleThirdRange(side);
      if (u >= m.startU && u < m.endU && isSideSwinging(u, side)) {
        const swingGap = side === 'left' ? gaps.left : gaps.right;
        const stanceGap = side === 'left' ? gaps.right : gaps.left;
        stats.swingMiddleThirdMinGapMm = Math.min(stats.swingMiddleThirdMinGapMm, swingGap * 1000);
        stanceGapMaxM = Math.max(stanceGapMaxM, stanceGap);
        initializedSwing = true;
      }
    }
    // Global stance tracking (any frame where one foot is planted micro).
    if (gaps.left <= GRAZE_MM / 1000) stanceGapMaxM = Math.max(stanceGapMaxM, gaps.right);
    if (gaps.right <= GRAZE_MM / 1000) stanceGapMaxM = Math.max(stanceGapMaxM, gaps.left);
  }

  stats.dzM = rootZ(engine, binder) - startZ;
  if (!initializedSwing) stats.swingMiddleThirdMinGapMm = 0;
  stats.stanceMaxGapMm = stanceGapMaxM * 1000;

  const fell = stats.maxTiltDeg >= TILT_FAIL_DEG || stats.minRootH < ROOTH_FAIL;
  stats.fellDirection = fell ? describeFallDirection(engine, binder) : 'none';

  // Reflex telemetry + sub-law attribution from the controller.
  const ctrl = binder.getReflexController();
  const rs = ctrl.getStats();
  stats.eMaxM = rs.maxAbsE;
  stats.vMaxMps = rs.maxAbsV;
  stats.leanOffsetMaxRad = rs.maxLeanOffsetRad;
  stats.forcedStepCount = rs.forcedStepCount;
  // Report-only columns: forced steps per gait cycle + FSM telemetry.
  stats.forcedPerCycle =
    rs.forcedStepCount / ((steps * DT) / GAIT_CYCLE.durationS);
  stats.swingSteps = rs.captureStepsLanded;
  stats.stanceSideFlips = rs.stanceSideFlips;
  stats.stanceReplantCycles = rs.stanceReplantCycles;
  stats.swingAborts = rs.perLegSwingAborts;
  stats.plantedTouchdowns = rs.plantedTouchdowns;
  const diag = ctrl.diagnose();
  stats.subLaw = diag.subLaw;
  stats.subLawReason = diag.reason;

  stats.walkPassed =
    !fell &&
    !engine.isBroken &&
    stats.dzM <= -PASS_DZ_M &&
    stats.maxTiltDeg < PASS_MAX_TILT_DEG &&
    stats.swingMiddleThirdMinGapMm >= PASS_SWING_GAP_M * 1000 &&
    stats.stanceMaxGapMm <= PASS_STANCE_GAP_M * 1000;

  return stats;
}

/** Append a round record to road4-rounds.json (create file if missing). */
function appendRounds(round: any): void {
  const p = path.resolve(process.cwd(), 'road4-rounds.json');
  let rounds: any[] = [];
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) rounds = parsed;
    else if (parsed && Array.isArray(parsed.rounds)) rounds = parsed.rounds;
  } catch { /* first round */ }
  rounds.push(round);
  fs.writeFileSync(p, JSON.stringify({ rounds }, null, 2));
}

describe('Road-4 — COM lean-reflex + capture-step gate', () => {
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

  test('Gate: COM reflex leads the walk (8 s clip at 500 Hz)', () => {
    // Enable the Road-4 reflex with this round's gains (starts left stance).
    binder.setComReflexEnabled(true, 'left');
    binder.setComReflexGains(ROUND_GAINS);

    // Warm-up: settle to bind before gait starts.
    applyFrame(engine, binder, artifact.sequence[0] as MoveFrame);
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
      `[ROAD4][WALK] round=4 steps=${stats.steps} ΔZ=${stats.dzM.toFixed(3)} m (need ≤ -1.0) ` +
      `maxTilt=${stats.maxTiltDeg.toFixed(2)}° (need < 15) ` +
      `swingMid3rdMinGap=${stats.swingMiddleThirdMinGapMm.toFixed(1)} mm (need ≥ 15) ` +
      `stanceMaxGap=${stats.stanceMaxGapMm.toFixed(1)} mm (need ≤ 5) ` +
      `eMax=${stats.eMaxM.toFixed(3)} m vMax=${stats.vMaxMps.toFixed(3)} m/s leanMax=${stats.leanOffsetMaxRad.toFixed(3)} rad ` +
      `forced=${stats.forcedStepCount} (${stats.forcedPerCycle.toFixed(1)}/cycle) ` +
      `replants=${stats.stanceReplantCycles} (need ≥ 7) aborts=${stats.swingAborts} (need 0) touchdowns=${stats.plantedTouchdowns} ` +
      `swingSteps=${stats.swingSteps} flips=${stats.stanceSideFlips} ` +
      `subLaw=${stats.subLaw} (${stats.subLawReason}) ` +
      `fellDirection=${stats.fellDirection}`
    );

    const round = {
      round: 4,
      gains: ROUND_GAINS,
      kpis: {
        dzM: stats.dzM,
        maxTiltDeg: stats.maxTiltDeg,
        swingMiddleThirdMinGapMm: stats.swingMiddleThirdMinGapMm,
        stanceMaxGapMm: stats.stanceMaxGapMm,
        eMaxM: stats.eMaxM,
        vMaxMps: stats.vMaxMps,
        leanOffsetMaxRad: stats.leanOffsetMaxRad,
        forcedStepCount: stats.forcedStepCount,
        forcedPerCycle: stats.forcedPerCycle,
        swingSteps: stats.swingSteps,
        stanceSideFlips: stats.stanceSideFlips,
        stanceReplantCycles: stats.stanceReplantCycles,
        swingAborts: stats.swingAborts,
        plantedTouchdowns: stats.plantedTouchdowns,
      },
      fellDirection: stats.fellDirection,
      subLaw: stats.subLaw,
      subLawReason: stats.subLawReason,
      pass: stats.walkPassed,
    };
    appendRounds(round);

    const report = {
      gate: 'road4_com_reflex',
      round: 4,
      gains: ROUND_GAINS,
      steps: stats.steps,
      dzM: stats.dzM,
      maxTiltDeg: stats.maxTiltDeg,
      minRootH: stats.minRootH,
      swingMiddleThirdMinGapMm: stats.swingMiddleThirdMinGapMm,
      stanceMaxGapMm: stats.stanceMaxGapMm,
      reflexApplied: stats.reflexApplied,
      velocityTargetApplied: stats.velocityTargetApplied,
      eMaxM: stats.eMaxM,
      vMaxMps: stats.vMaxMps,
      leanOffsetMaxRad: stats.leanOffsetMaxRad,
      forcedStepCount: stats.forcedStepCount,
      forcedPerCycle: stats.forcedPerCycle,
      swingSteps: stats.swingSteps,
      stanceSideFlips: stats.stanceSideFlips,
      stanceReplantCycles: stats.stanceReplantCycles,
      swingAborts: stats.swingAborts,
      plantedTouchdowns: stats.plantedTouchdowns,
      fellDirection: stats.fellDirection,
      subLaw: stats.subLaw,
      subLawReason: stats.subLawReason,
      pass: stats.walkPassed,
    };
    fs.writeFileSync(path.resolve(process.cwd(), 'road4-walk-stats.json'), JSON.stringify(report, null, 2));
    console.log('[ROAD4] stats dumped to road4-walk-stats.json; round appended to road4-rounds.json');

    // Hard-assert non-vacuous invariants — these MUST hold for the gate to mean anything:
    // 1. The COM reflex actually ran during the clip.
    // 2. The root assist actually had targets during the clip.
    // 3. Physics did not explode (NaN/divergence).
    // 4. Round-4 FSM: ≥ 1 mandatory-plant per gait cycle (7.5 cycles in the 8 s clip).
    expect(stats.reflexApplied).toBe(true);
    expect(stats.velocityTargetApplied).toBe(true);
    expect(engine.isBroken).toBe(false);
    expect(stats.stanceReplantCycles).toBeGreaterThanOrEqual(WALK_SECONDS / GAIT_CYCLE.durationS);

    // Physical outcome is REPORT-ONLY per round (tuning iterations = the gate loop).
    const pass = stats.walkPassed;
    console.log(
      pass
        ? '[ROAD4][GATE] PASS — COM reflex led the walk: forward ΔZ, tilt < 15°, swing clears, stance planted.'
        : `[ROAD4][GATE] ${
            stats.maxTiltDeg >= TILT_FAIL_DEG || stats.minRootH < ROOTH_FAIL
              ? `FALL — fell ${stats.fellDirection}`
              : 'FAIL (not fell, but criteria unmet)'
          } — sub-law ${stats.subLaw}: ${stats.subLawReason}. Next round: adjust kH/kD/capture gains per attribution.`
    );
  });
});
