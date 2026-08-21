/**
 * Road-4 walk gate console helper (extends the Road-3 gate).
 *
 * USAGE (browser console, while the Synthia world is running):
 *   playWalk()            — start a ~8 s walk clip WITH the COM reflex on, then
 *                           print the gate summary incl. reflex telemetry
 *   playWalk(12)          — run for 12 seconds (reflex on)
 *   playWalk(8, false)    — same clip WITHOUT the COM reflex (A/B compare)
 *   playWalkReflex(8)     — alias: clip with the reflex on (same sample loop)
 *   playWalkStop()        — stop early and reset the pose
 *
 * Samples every ~16 ms: forward translation (ΔZ, -Z = forward in Three world),
 * torso tilt, per-foot ground gap (mm), and grounded flag. On completion prints
 * a console.table with the PASS/FAIL criteria:
 *   - translate forward ΔZ ≥ 1.0 m over the clip
 *   - stay up: max tilt < 15°
 *   - physics not broken
 *   - swing foot clears the ground (min gap ≥ 15 mm at mid-swing) while the
 *     stance foot stays planted (max gap ≤ 5 mm)
 * plus Road-4 reflex telemetry: |e| max, lean offset max (rad), forced-step
 * count, capture steps landed, stance flips, and the broken sub-law verdict
 * (lean vs step) from ComReflexController attribution alongside the fall
 * direction.
 */

import { loadWalkArtifact, startWalk, stopWalk } from '../utils/playMixamoWalk';
import { PhysicsEngine } from '../world/engine/PhysicsEngine';
import { DEFAULT_REFLEX_GAINS } from '../world/engine/ComReflexController';
import type { HumanoidPhysicsBinder } from '../world/engine/HumanoidPhysicsBinder';
import * as THREE from 'three';

const FOOT_BONES = ['mixamorigleftfoot', 'mixamorigrightfoot'];
const FOOT_HALF_HEIGHT = 0.01;   // foot box half-thickness (m)
const FOOT_OFFSET_Z = 0.02;      // sole offset below bone joint (m) — MuJoCo Z-up
const PASS_DZ_M = 1.0;
const PASS_MAX_TILT_DEG = 15;
const PASS_SWING_GAP_MM = 15;
const PASS_STANCE_GAP_MM = 5;
const FALL_TILT_DEG = 30;

interface WalkSample {
  t: number;
  z: number;           // capsule Three-world Z (-Z = forward)
  tiltDeg: number;
  grounded: boolean;
  footGapMm: { left: number; right: number };
}

let _rafId: number | null = null;
let _startTimeMs = 0;
let _clipMs = 8000;
let _samples: WalkSample[] = [];
let _walkHandle: { agentId: string; stop: () => void } | null = null;
let _reflexOn = false;

function readFootGapMm(
  module: any,
  model: any,
  data: any
): { left: number; right: number } {
  const gaps = { left: 0, right: 0 };
  for (const boneName of FOOT_BONES) {
    const bodyId = module.mj_name2id(model, module.mjtObj.mjOBJ_BODY.value, boneName);
    if (bodyId < 0) continue;
    const bodyZ = data.xpos[bodyId * 3 + 2]; // MuJoCo Z-up = vertical
    const lowestPointZ = bodyZ + FOOT_OFFSET_Z - FOOT_HALF_HEIGHT;
    const key = boneName.includes('left') ? 'left' : 'right';
    gaps[key] = Math.max(0, lowestPointZ) * 1000; // mm
  }
  return gaps;
}

/** Enable the Road-4 COM reflex on a binder with the default gains. */
function enableReflex(binder: HumanoidPhysicsBinder): void {
  binder.setComReflexEnabled(true, 'left');
  binder.setComReflexGains(DEFAULT_REFLEX_GAINS);
}

/** Fall direction of the capsule's current orientation (same logic as road4). */
function describeFallDirection(): string {
  const engine = (window as any).__SYNTHIA_PHYSICS_ENGINE__ as PhysicsEngine | undefined;
  const binders = (window as any).__SYNTHIA_HUMANOID_BINDERS__;
  const agentId = _walkHandle?.agentId ?? 'agent_0';
  const binder = binders?.get?.(agentId) as HumanoidPhysicsBinder | undefined;
  if (!engine || !binder) return 'unknown';
  const capId = binder.getMultiBodyManager().getCapsuleBody();
  if (capId === null || capId < 0) return 'unknown';
  const data = engine.getData?.();
  if (!data) return 'unknown';
  const q = [
    data.xquat[capId * 4],
    data.xquat[capId * 4 + 1],
    data.xquat[capId * 4 + 2],
    data.xquat[capId * 4 + 3],
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

function sampleOnce(): void {
  const engine = (window as any).__SYNTHIA_PHYSICS_ENGINE__ as PhysicsEngine | undefined;
  const binders = (window as any).__SYNTHIA_HUMANOID_BINDERS__;
  const agentId = _walkHandle?.agentId ?? 'agent_0';
  const binder = binders?.get?.(agentId) as HumanoidPhysicsBinder | undefined;
  if (!engine || !binder) return;

  const module = PhysicsEngine.getModule();
  const model = engine.getModel?.();
  const data = engine.getData?.();
  if (!module || !model || !data) return;

  const capId = binder.getMultiBodyManager().getCapsuleBody();
  if (capId === null || capId < 0) return;

  // Capsule translation in Three-world space (PhysicsEngine.mujocoToWorld handles
  // the MuJoCo (X-fwd, Y-left, Z-up) → Three (X-right, Y-up, Z-back) mapping).
  const proxy = binder.getCapsuleBody();
  const t = proxy?.translation?.();
  if (!t) return;

  const qx = data.xquat[capId * 4 + 1];
  const qy = data.xquat[capId * 4 + 2];
  const upZ = 1 - 2 * (qx * qx + qy * qy);
  const tiltDeg = Math.acos(Math.min(1, Math.max(-1, upZ))) * 180 / Math.PI;

  _samples.push({
    t: performance.now() - _startTimeMs,
    z: t.z,
    tiltDeg,
    grounded: binder.getIsGrounded(),
    footGapMm: readFootGapMm(module, model, data),
  });
}

function frame(): void {
  if (!_walkHandle) return;
  sampleOnce();

  if (performance.now() - _startTimeMs >= _clipMs) {
    finish();
    return;
  }
  _rafId = requestAnimationFrame(frame);
}

function gateSummary(samples: WalkSample[]): void {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dz = last.z - first.z;
  const maxTilt = Math.max(...samples.map((s) => s.tiltDeg));
  const clipS = last.t / 1000;

  const leftGaps = samples.map((s) => s.footGapMm.left);
  const rightGaps = samples.map((s) => s.footGapMm.right);
  const gapStats = (gaps: number[]) => ({
    mx: Math.max(...gaps),
    mn: Math.min(...gaps),
  });
  const left = gapStats(leftGaps);
  const right = gapStats(rightGaps);

  const fell = maxTilt >= FALL_TILT_DEG;
  const walkPassed =
    !fell && engineOk() && dz <= -PASS_DZ_M && maxTilt < PASS_MAX_TILT_DEG;

  // Road-4 reflex telemetry (available when the reflex was enabled this clip).
  const binders = (window as any).__SYNTHIA_HUMANOID_BINDERS__;
  const agentId = _walkHandle?.agentId ?? 'agent_0';
  const binder = binders?.get?.(agentId) as HumanoidPhysicsBinder | undefined;
  const reflexStats = _reflexOn && binder ? binder.getReflexStats() : null;
  const diag = _reflexOn && binder ? binder.getReflexController().diagnose() : null;
  const fallDir = fell ? describeFallDirection() : 'none';

  console.table({
    'clip duration (s)': clipS.toFixed(1),
    'ΔZ forward (m)': dz.toFixed(3),
    'expected @0.15 m/s (m)': (clipS * 0.15).toFixed(2),
    'max tilt (°)': maxTilt.toFixed(2),
    'left foot max gap (mm)': left.mx.toFixed(1),
    'left foot min gap (mm)': left.mn.toFixed(1),
    'right foot max gap (mm)': right.mx.toFixed(1),
    'right foot min gap (mm)': right.mn.toFixed(1),
    'physics broken': engineOk() ? 'no' : 'YES',
    'swing foot cleared ≥15mm?':
      left.mx >= PASS_SWING_GAP_MM || right.mx >= PASS_SWING_GAP_MM ? 'yes' : 'NO',
    'stance foot planted ≤5mm?':
      Math.min(left.mn, right.mn) <= PASS_STANCE_GAP_MM ? 'yes' : 'NO',
    // ── Road-4 reflex telemetry columns ─────────────────────────────
    'COM |e| max (m)': reflexStats ? reflexStats.maxAbsE.toFixed(3) : 'n/a',
    'lean offset max (rad)': reflexStats ? reflexStats.maxLeanOffsetRad.toFixed(3) : 'n/a',
    'forced steps': reflexStats ? String(reflexStats.forcedStepCount) : 'n/a',
    'capture steps landed': reflexStats ? String(reflexStats.captureStepsLanded) : 'n/a',
    'stance flips': reflexStats ? String(reflexStats.stanceSideFlips) : 'n/a',
    'sub-law': diag ? diag.subLaw : 'n/a',
    'fall direction': fell ? fallDir : 'none',
    'WALK GATE': walkPassed
      ? 'PASS'
      : fell
        ? `FAIL — fell ${fallDir}${diag ? ` — sub-law ${diag.subLaw}: ${diag.reason}` : ''}`
        : 'FAIL (see numbers)',
  });
}

function finish(): void {
  if (_rafId !== null) cancelAnimationFrame(_rafId);
  _rafId = null;

  if (_walkHandle) {
    stopWalk(_walkHandle.agentId);
    _walkHandle = null;
  }

  const samples = _samples;
  _samples = [];
  _reflexOn = false;
  if (samples.length < 2) {
    console.warn('[WALK-GATE] Not enough samples collected — is physics + binders ready?');
    return;
  }

  gateSummary(samples);
}

function engineOk(): boolean {
  const engine = (window as any).__SYNTHIA_PHYSICS_ENGINE__ as any;
  return !!(engine && !engine.isBroken);
}

/**
 * Start a walk clip and sample for {seconds} (default 8).
 * With the Road-4 COM reflex ENABLED by default so the walk is reflex-led;
 * pass useReflex=false to A/B against the reflex-off root-drive behavior.
 */
export function playWalk(seconds: number = 8, useReflex: boolean = true): void {
  if (_walkHandle) {
    console.warn('[WALK-GATE] A clip is already running — call playWalkStop() first.');
    return;
  }
  if (typeof window === 'undefined') return;

  const agentId = 'agent_0';
  const binders = (window as any).__SYNTHIA_HUMANOID_BINDERS__;
  const phys = (window as any).__SYNTHIA_PHYSICS_ENGINE__;
  if (!binders?.get?.(agentId) || !phys) {
    console.warn('[WALK-GATE] Agent/physics not ready yet. Retry in a second.');
    return;
  }

  _clipMs = Math.round(seconds * 1000);
  _samples = [];
  _reflexOn = useReflex;

  if (useReflex) {
    enableReflex(binders.get(agentId) as HumanoidPhysicsBinder);
  }

  loadWalkArtifact()
    .then((artifact) => {
      _walkHandle = startWalk(artifact, agentId);
      _startTimeMs = performance.now();
      sampleOnce(); // baseline sample
      _rafId = requestAnimationFrame(frame);
      console.log(
        `[WALK-GATE] clip started — ${seconds}s, sample loop running, reflex=${useReflex ? 'ON' : 'OFF'}.`
      );
    })
    .catch((err) => {
      console.error('[WALK-GATE] failed to load walk artifact:', err);
    });
}

/** Alias: start the walk clip with the COM reflex on (same sample loop). */
export function playWalkReflex(seconds: number = 8): void {
  playWalk(seconds, true);
}

/** Stop an in-progress clip early. */
export function playWalkStop(): void {
  if (_rafId !== null) cancelAnimationFrame(_rafId);
  _rafId = null;
  if (_walkHandle) {
    stopWalk(_walkHandle.agentId);
    _walkHandle = null;
  }
  _samples = [];
  _reflexOn = false;
  console.log('[WALK-GATE] stopped.');
}

// Expose on window for console use (same pattern as footGroundDistance.ts).
if (typeof window !== 'undefined') {
  (window as any).playWalk = playWalk;
  (window as any).playWalkReflex = playWalkReflex;
  (window as any).playWalkStop = playWalkStop;
}
