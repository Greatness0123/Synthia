/**
 * ═══════════════════════════════════════════════════════════════════
 * 02_walking_and_locomotion.js — High-Clearance Ground Gait Engine
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Proven Kinematics:
 * - High knee clearance (0.90 rad) + ankle toe-lift (0.22 rad) ensures the
 *   swing foot never drags on high-friction floor.
 * - Stance leg pushes firmly to translate the pelvis from point A to B.
 * - Smooth 32-frame harmonic sequence with lateral roll weight shifting.
 * - Default speed: 0.12 m/s.
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  let walkInterval = null;
  let velocityInterval = null;
  let telemetryInterval = null;
  let stopWalkTimeout = null;
  let stopGraceTimeout = null;

  const TAU = Math.PI * 2;
  const F = 32;       // 32 frames per cycle
  const FPS = 30;     // 30 FPS -> 1067ms cycle
  const DEG = Math.PI / 180;

  const c = x => Math.cos(TAU * x);
  const s = x => Math.sin(TAU * x);
  const bump = x => 0.5 - 0.5 * Math.cos(TAU * x);
  const mod = x => ((x % 1) + 1) % 1;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const r6 = v => Math.round(v * 1e6) / 1e6;

  const swingEnv = uu => {
    const p = mod(uu - 0.02);
    return p >= 0.5 ? 0 : bump(p * 2);
  };

  /**
   * Generates a harmonic frame of the walk cycle.
   */
  function generateGaitFrame(u, dir = 1) {
    const uL = mod(u + 0.25);
    const uR = mod(u + 0.75);
    const aL = uR;
    const aR = uL;
    const o = {};

    const isForward = dir >= 0;

    const leg = (side, uu) => {
      const sw = swingEnv(uu);
      const isSwing = mod(uu - 0.02) < 0.5;
      const pSwing = mod(uu - 0.02);
      const kneeKick = bump(pSwing);
      const ankleKick = bump(cl(pSwing - 0.05, 0, 1));

      // Hip pitch:
      // Forward: swing thigh flexes forward (-0.32 rad), stance pushes back (+0.06 rad)
      // Backward: swing thigh extends back (+0.32 rad), stance pushes forward (-0.06 rad)
      const hipPitch = isForward
        ? (isSwing ? -0.32 * sw : +0.06 * (1 - sw))
        : (isSwing ? +0.32 * sw : -0.06 * (1 - sw));

      // High clearance knee (0.90 rad) so foot completely lifts off ground and never drags
      const knee = isSwing ? 0.90 * kneeKick : 0.04;

      // Ankle dorsiflexion (+0.22 rad) pulls toes upward to clear floor
      const ankle = isSwing ? 0.22 * ankleKick : 0.00;

      o['mixamorig' + side + 'upleg'] = [r6(cl(hipPitch, -2.094, 2.094)), 0, 0];
      o['mixamorig' + side + 'leg'] = r6(cl(knee, 0, 2.618));
      o['mixamorig' + side + 'foot'] = [r6(cl(ankle, -0.785, 0.785)), 0, 0];
      o['mixamorig' + side + 'toebase'] = 0;
    };

    leg('left', uL);
    leg('right', uR);

    // Counterswing arms
    const arm = (side, aa) => {
      const armRoll = side === 'right' ? 12 * DEG : -12 * DEG;
      const armPitch = isForward
        ? (1.20 - 0.15 * s(aa))
        : (1.20 + 0.15 * s(aa));
      o['mixamorig' + side + 'arm'] = [r6(armPitch), 0, armRoll];
      o['mixamorig' + side + 'forearm'] = 0;
      o['mixamorig' + side + 'hand'] = [0, 0, 0];
    };

    arm('left', aL);
    arm('right', aR);

    // Spine
    const spineRoll = 0.035 * s(u);
    o.mixamorigspine = [
      r6(cl(-0.03 + 0.01 * c(mod(2 * u)), -0.524, 0.785)),
      r6(cl(0.01 * s(u), -0.524, 0.524)),
      r6(cl(spineRoll, -0.524, 0.524))
    ];
    o.mixamorigspine1 = [-0.01, r6(0.01 * s(u)), r6(0.015 * s(u))];
    o.mixamorigspine2 = [-0.01, r6(0.01 * s(u)), r6(0.015 * s(u))];
    o.mixamorigneck = [0, r6(-0.02 * s(u)), 0];
    o.mixamorighead = [0, r6(-0.02 * s(u)), 0];

    return o;
  }

  function buildGaitSequence(dir = 1) {
    const sequence = [];
    for (let f = 0; f <= F; f++) {
      sequence.push({
        timeOffsetMs: Math.round((f * 1000) / FPS),
        overrides: generateGaitFrame(mod(f / F), dir)
      });
    }
    return sequence;
  }

  function getContext(agentId = 'agent_0') {
    const binders = window.__SYNTHIA_HUMANOID_BINDERS__;
    let binder = null;
    if (binders && binders.has(agentId)) {
      binder = binders.get(agentId);
    } else if (window.__SYNTHIA_HUMANOID_BINDER__) {
      binder = window.__SYNTHIA_HUMANOID_BINDER__;
    }

    const pe = window.__SYNTHIA_PHYSICS_ENGINE__;
    if (!binder || !pe) return null;
    return { binder, pe };
  }

  window.synthiaStopWalk = function (agentId = 'agent_0') {
    const ctx = getContext(agentId);

    if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
    if (velocityInterval) { clearInterval(velocityInterval); velocityInterval = null; }
    if (telemetryInterval) { clearInterval(telemetryInterval); telemetryInterval = null; }
    if (stopWalkTimeout) { clearTimeout(stopWalkTimeout); stopWalkTimeout = null; }
    if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }

    const neutralOverrides = {
      mixamorigleftupleg: [0, 0, 0],
      mixamorigrightupleg: [0, 0, 0],
      mixamorigleftleg: 0,
      mixamorigrightleg: 0,
      mixamorigleftfoot: [0, 0, 0],
      mixamorigrightfoot: [0, 0, 0],
      mixamorigspine: [0, 0, 0],
      mixamorigspine1: [0, 0, 0],
      mixamorigspine2: [0, 0, 0],
      mixamorighead: [0, 0, 0],
      mixamorigleftarm: [68 * DEG, 0, -12 * DEG],
      mixamorigrightarm: [68 * DEG, 0, 12 * DEG],
      mixamorigleftforearm: 0,
      mixamorigrightforearm: 0,
      mixamoriglefthand: [0, 0, 0],
      mixamorigrighthand: [0, 0, 0],
    };

    if (ctx && ctx.binder) {
      ctx.binder.setTargetRootVelocity(0, 0, 400);

      const stopSequence = [
        { timeOffsetMs: 0, overrides: {} },
        { timeOffsetMs: 380, overrides: neutralOverrides }
      ];

      window.dispatchEvent(new CustomEvent('synthia:action', {
        detail: {
          agentId: agentId,
          activeGaitPhase: true,
          sequence: stopSequence
        }
      }));

      stopGraceTimeout = setTimeout(() => {
        if (typeof ctx.binder.setGaitActive === 'function') {
          ctx.binder.setGaitActive(false);
        }
        stopGraceTimeout = null;
      }, 420);
    }

    console.log(`[WALK] Locomotion smoothly decelerated and halted.`);
  };

  window.synthiaWalk = function (distanceM = 2.0, speedMps = 0.12, agentId = 'agent_0') {
    startLocomotion(distanceM, speedMps, 1, agentId);
  };

  window.synthiaWalkBackward = function (distanceM = 2.0, speedMps = 0.12, agentId = 'agent_0') {
    startLocomotion(distanceM, speedMps, -1, agentId);
  };

  function startLocomotion(distanceM, speedMps, dir, agentId) {
    const ctx = getContext(agentId);
    if (!ctx) return;
    const { binder, pe } = ctx;

    if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }
    if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
    if (velocityInterval) { clearInterval(velocityInterval); velocityInterval = null; }
    if (telemetryInterval) { clearInterval(telemetryInterval); telemetryInterval = null; }
    if (stopWalkTimeout) { clearTimeout(stopWalkTimeout); stopWalkTimeout = null; }

    const dirName = dir >= 0 ? 'FORWARD' : 'BACKWARD';
    console.log(`%c[WALK] Starting High-Clearance Locomotion (${dirName})`, 'color:#0ff; font-weight:bold');
    console.log(`- Target: ${distanceM} m @ ${speedMps} m/s`);

    if (typeof binder.setReactionMassEnabled === 'function') binder.setReactionMassEnabled(true);
    if (typeof binder.setCapsuleBalanceEnabled === 'function') binder.setCapsuleBalanceEnabled(true);
    if (typeof binder.setGaitActive === 'function') binder.setGaitActive(true);

    const capId = (typeof binder.getCapsuleBodyId === 'function') ? binder.getCapsuleBodyId() : 1;

    const getPos = () => {
      const data = pe.getWorld() ? pe.getWorld().data : null;
      if (data && data.xpos) {
        return {
          x: data.xpos[capId * 3],
          y: data.xpos[capId * 3 + 1],
          z: data.xpos[capId * 3 + 2]
        };
      }
      return { x: 0, y: 0, z: 0.9 };
    };

    const startPos = getPos();
    const startTime = performance.now();
    const sequence = buildGaitSequence(dir);
    const cycleDurationMs = Math.round((F * 1000) / FPS); // 1067 ms
    const vzTarget = dir >= 0 ? +speedMps : -speedMps;

    const dispatchGait = () => {
      window.dispatchEvent(new CustomEvent('synthia:action', {
        detail: {
          agentId: agentId,
          activeGaitPhase: true,
          sequence: sequence
        }
      }));
    };

    dispatchGait();
    walkInterval = setInterval(dispatchGait, cycleDurationMs);

    binder.setTargetRootVelocity(0, vzTarget, 1000);
    velocityInterval = setInterval(() => {
      binder.setTargetRootVelocity(0, vzTarget, 1000);
    }, 100);

    telemetryInterval = setInterval(() => {
      const curPos = getPos();
      const dx = curPos.x - startPos.x;
      const forwardTravel = dir >= 0 ? (startPos.y - curPos.y) : (curPos.y - startPos.y);
      const totalDist = Math.hypot(dx, curPos.y - startPos.y);
      const elapsedS = ((performance.now() - startTime) / 1000).toFixed(1);

      console.log(`[WALK] t=${elapsedS}s | Disp: ${forwardTravel.toFixed(2)}m / ${distanceM}m | H: ${curPos.z.toFixed(2)}m`);

      if (curPos.z < 0.45) {
        console.warn(`%c[FALL DETECTED] (H=${curPos.z.toFixed(2)}m < 0.45m). Halting.`, 'color:#f55; font-weight:bold');
        window.synthiaStopWalk(agentId);
        return;
      }

      if (forwardTravel >= distanceM || totalDist >= distanceM) {
        console.log(`%c[WALK COMPLETE] Reached ${totalDist.toFixed(2)} m in ${elapsedS} s!`, 'color:#0f0; font-weight:bold');
        window.synthiaStopWalk(agentId);
      }
    }, 500);

    const maxDurationMs = Math.max(15000, (distanceM / speedMps) * 1000 + 5000);
    stopWalkTimeout = setTimeout(() => {
      window.synthiaStopWalk(agentId);
    }, maxDurationMs);
  }

  console.log(`[Synthia] High-Clearance Ground Gait Engine Ready.`);
})();
