/* =====================================================================
   02_walking_and_locomotion.js — Mocap-C1 Gait Engine v4 (Direction-Aware)
   ---------------------------------------------------------------------
   FORWARD  : spine lean + hip extension cooperate. A forward lean that
              pulses with each push-off tips the COM ahead of the stance
              foot; the stance hip then extends (sweeps behind) so the
              planted foot pushes the body forward (Newton III) — real
              progression instead of root-drag/foot-slip.
   BACKWARD : swing foot lands FLAT (ankle ≈ 0 at touchdown, reduced knee
              lift) with a longer rear grab arc, so the FULL sole plants
              and friction generates backward propulsion — no more
              toe-tip touches.
   Glue unchanged & proven: synthia:action sequence dispatch, root-velocity
   servo, xpos telemetry, fall interlock, 1200 ms grace stop.
   Conventions (dossier-verified): hip.x+ = fwd, knee+ = flex,
   foot.x+ = dorsiflex, spine.x+ = lean fwd. No root-position input.
   ===================================================================== */
(function () {
'use strict';
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const F = 32, FPS = 30;                    // one stride = 32 frames @30fps
const LEG_LEN = 0.90;
const USE_ARMS = true;                     // cosmetic counter-swing
const mod = x => ((x % 1) + 1) % 1;
const cl  = (v, a, b) => Math.min(b, Math.max(a, v));
const r6  = v => Math.round(v * 1e6) / 1e6;
const smooth = p => 0.5 - 0.5 * Math.cos(Math.PI * cl(p, 0, 1));
const kp = (p, pts) => {
  if (p <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i], [b, vb] = pts[i + 1];
    if (p <= b) return va + (vb - va) * smooth((p - a) / (b - a));
  }
  return pts[pts.length - 1][1];
};

let walkInterval = null, velocityInterval = null, telemetryInterval = null,
    stopWalkTimeout = null, stopGraceTimeout = null;

/* ---------------- ENGINE GLUE ---------------------------------------
   If your build exposes the context differently, replace ONLY this
   function with the getContext() from your current file. -------------- */
function getContext(agentId) {
  if (typeof window.synthiaGetContext === 'function') return window.synthiaGetContext(agentId);
  const reg = window.__SYNTHIA_AGENTS__ || window.__synthiaAgents || null;
  if (reg && reg[agentId]) return reg[agentId];
  return null;
}

/* ---------------- GAIT PARAMS (direction-aware) --------------------- */
function gaitParams(v, dir) {
  const isFwd = dir >= 0;
  const SWEEP = cl(1.15 * v, 0.08, 0.55);  // slip-consistent stride envelope
  return {
    isFwd,
    /* FORWARD: balanced reach / strong push-off.
       BACKWARD: shorter landing reach (plants under COM), longer grab. */
    FLX: (isFwd ? 0.55 : 0.40) * SWEEP,
    EXT: (isFwd ? 0.45 : 0.60) * SWEEP,
    /* BACKWARD: lower swing knee = flatter, calmer foot trajectory. */
    KSW: cl(0.60 + 1.0 * v, 0.60, isFwd ? 1.10 : 0.85),
    KST: 0.10,
    ROLL: 0.03,
    /* FORWARD: cooperative forward lean. BACKWARD: slight rear lean so
       the COM sits over the planting (rear) foot. */
    LEAN: isFwd ? cl(0.30 * v, 0.03, 0.12) : -cl(0.10 * v, 0.01, 0.04),
    /* Lean pulse timed to both legs' late-stance push-off (u≈0.4/0.9). */
    LEAN_OSC: isFwd ? 0.30 * SWEEP : 0.06 * SWEEP,
    ARM: cl(0.30 + 0.8 * v, 0.30, 0.55),
  };
}

/* ---------------- PER-LEG TARGETS (C1-continuous) ------------------- */
function legTargets(ph, P) {
  let hip, knee, ank, roll;
  if (ph < 0.5) {                                  // SWING
    const p = ph / 0.5;
    hip  = -P.EXT + (P.FLX + P.EXT) * smooth(p);   // behind → ahead, zero vel at ends
    knee = 0.03 + P.KSW * Math.sin(Math.PI * p);
    ank  = P.isFwd
      ? kp(p, [[0,-0.18],[0.30,0.30],[0.75,0.22],[1,0.12]])   // heel-strike
      : kp(p, [[0,-0.08],[0.30,0.16],[0.75,0.08],[1,0.02]]);  // FLAT plant → full-sole grab
  } else {                                         // STANCE
    const p = (ph - 0.5) / 0.5;
    hip  = P.FLX - (P.FLX + P.EXT) * smooth(p);    // ahead → behind (push-off)
    knee = 0.03 + P.KST * Math.sin(Math.PI * p);
    ank  = P.isFwd
      ? kp(p, [[0,0.12],[0.25,0.00],[0.50,0.10],[1,-0.18]])   // heel→flat→roll→push
      : kp(p, [[0,0.02],[0.30,0.06],[0.70,0.02],[1,-0.12]]);  // stay flat, mild push
  }
  roll = P.ROLL * Math.sin(TAU * ph);
  return { hip, knee, ank, roll };
}

/* ---------------- SEQUENCE BUILDER (pipeline format) ---------------- */
function buildSequence(dir, env, v) {
  const P = gaitParams(v, dir), seq = [];
  const leg = (o, side, ph) => {
    const t = legTargets(mod(ph), P);
    o['mixamorig' + side + 'upleg'] =
      [r6(cl(dir * env * t.hip, -2.094, 2.094)), 0,
       r6(cl(env * t.roll * (side === 'left' ? 1 : -1), -0.3, 0.3))];
    o['mixamorig' + side + 'leg']  = r6(cl(0.02 + (t.knee - 0.02) * env, 0, 2.618));
    o['mixamorig' + side + 'foot'] = [r6(cl(env * t.ank, -0.785, 0.785)), 0, 0];
    o['mixamorig' + side + 'toebase'] = r6(cl(env * 0.15 * Math.sin(TAU * (ph + 0.5)), -0.3, 0.3));
  };
  for (let i = 0; i < F; i++) {
    const u = i / F, o = {};
    leg(o, 'right', u); leg(o, 'left', u + 0.5);
    /* Cooperative trunk: base lean + push-off-synced pulse.
       Peaks at u≈0.4 & 0.9 = each leg's late-stance extension. */
    const lean = env * (P.LEAN + P.LEAN_OSC * Math.cos(TAU * (2 * u - 0.8)));
    const L = r6(lean / 3);
    o.mixamorigspine = [L, 0, 0]; o.mixamorigspine1 = [L, 0, 0];
    o.mixamorigspine2 = [L, 0, 0]; o.mixamorighead = [r6(-L), 0, 0];
    if (USE_ARMS) {
      const sA = P.ARM * env * Math.sin(TAU * u);
      o.mixamorigrightarm = [r6(-sA + 0.15), 0, r6(0.10)];
      o.mixamorigleftarm  = [r6( sA + 0.15), 0, r6(-0.10)];
      o.mixamorigrightforearm = r6(0.35); o.mixamorigleftforearm = r6(0.35);
    }
    seq.push({ timeOffsetMs: Math.round(i * 1000 / FPS), overrides: o });
  }
  return seq;
}

/* ---------------- START / STOP / TELEMETRY -------------------------- */
function startLocomotion(distanceM, speedMps, dir, agentId) {
  const ctx = getContext(agentId);
  if (!ctx) console.warn('[WALK] getContext() null — paste your build\'s getContext() into this file.');
  const binder = ctx ? ctx.binder : null, pe = ctx ? ctx.pe : null;
  if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }
  if (walkInterval) clearInterval(walkInterval);
  if (velocityInterval) clearInterval(velocityInterval);
  if (telemetryInterval) clearInterval(telemetryInterval);
  if (stopWalkTimeout) clearTimeout(stopWalkTimeout);

  console.log('%c[WALK] Starting Mocap-C1 v4 (' + (dir >= 0 ? 'FORWARD' : 'BACKWARD') + ')', 'color:#0ff;font-weight:bold');
  console.log('- Target: ' + distanceM + ' m @ ' + speedMps + ' m/s');
  if (binder) {
    if (typeof binder.setReactionMassEnabled === 'function') binder.setReactionMassEnabled(true);
    if (typeof binder.setCapsuleBalanceEnabled === 'function') binder.setCapsuleBalanceEnabled(true);
    if (typeof binder.setGaitActive === 'function') binder.setGaitActive(true);
  }
  const capId = (binder && typeof binder.getCapsuleBodyId === 'function') ? binder.getCapsuleBodyId() : 1;
  const getPos = () => {
    const data = (pe && pe.getWorld()) ? pe.getWorld().data : null;
    if (data && data.xpos) return { x: data.xpos[capId*3], y: data.xpos[capId*3+1], z: data.xpos[capId*3+2] };
    return null;
  };
  const startPos = getPos() || { x: 0, y: 0, z: 0.9 };
  const startTime = performance.now();
  const cycleMs = Math.round(F * 1000 / FPS);
  const vz = dir >= 0 ? +speedMps : -speedMps;
  const nominalMs = (distanceM / speedMps) * 1000;

  let env = 0;
  const dispatchCycle = () => {
    env = Math.min(1, env + 0.5);                  // ramp-in over 2 cycles
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { agentId, activeGaitPhase: true, sequence: buildSequence(dir, env, speedMps) }
    }));
  };
  dispatchCycle();
  walkInterval = setInterval(dispatchCycle, cycleMs);
  if (binder && typeof binder.setTargetRootVelocity === 'function') {
    binder.setTargetRootVelocity(0, vz, 1000);
    velocityInterval = setInterval(() => binder.setTargetRootVelocity(0, vz, 1000), 100);
  }
  telemetryInterval = setInterval(() => {
    const cur = getPos();
    const elapsedMs = performance.now() - startTime;
    if (!cur) {                                    // blind fallback: time-based stop
      if (elapsedMs >= nominalMs + 3000) window.synthiaStopWalk(agentId);
      return;
    }
    const forwardTravel = dir >= 0 ? (startPos.y - cur.y) : (cur.y - startPos.y);
    console.log('[WALK] t=' + (elapsedMs / 1000).toFixed(1) + 's | Disp: ' +
      forwardTravel.toFixed(2) + 'm / ' + distanceM + 'm | H: ' + cur.z.toFixed(2) + 'm');
    if (cur.z < 0.45) {
      console.warn('%c[FALL DETECTED] (H=' + cur.z.toFixed(2) + 'm). Halting.', 'color:#f55;font-weight:bold');
      return window.synthiaStopWalk(agentId);
    }
    if (forwardTravel >= distanceM) {
      console.log('%c[WALK COMPLETE] ' + forwardTravel.toFixed(2) + ' m in ' + (elapsedMs / 1000).toFixed(1) + ' s!', 'color:#0f0;font-weight:bold');
      window.synthiaStopWalk(agentId);
    }
  }, 500);
  stopWalkTimeout = setTimeout(() => window.synthiaStopWalk(agentId),
    Math.max(15000, nominalMs + 5000));
}

window.synthiaStopWalk = function (agentId) {
  if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
  if (velocityInterval) { clearInterval(velocityInterval); velocityInterval = null; }
  if (telemetryInterval) { clearInterval(telemetryInterval); telemetryInterval = null; }
  if (stopWalkTimeout) { clearTimeout(stopWalkTimeout); stopWalkTimeout = null; }
  if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }
  const ctx = getContext(agentId);
  const neutral = {
    mixamorigleftupleg: [0,0,0], mixamorigrightupleg: [0,0,0],
    mixamorigleftleg: 0, mixamorigrightleg: 0,
    mixamorigleftfoot: [0,0,0], mixamorigrightfoot: [0,0,0],
    mixamorigspine: [0,0,0], mixamorigspine1: [0,0,0], mixamorigspine2: [0,0,0],
    mixamorighead: [0,0,0],
    mixamorigleftarm: [68*DEG,0,-12*DEG], mixamorigrightarm: [68*DEG,0,12*DEG],
    mixamorigleftforearm: 0, mixamorigrightforearm: 0,
  };
  if (ctx && ctx.binder) {
    ctx.binder.setTargetRootVelocity(0, 0, 600);
    window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId, activeGaitPhase: true,
      sequence: [
        { timeOffsetMs: 0,    overrides: {} },
        { timeOffsetMs: 600,  overrides: Object.assign({}, neutral, { mixamorigspine: [-0.02,0,0] }) },
        { timeOffsetMs: 1200, overrides: neutral } ] } }));
    stopGraceTimeout = setTimeout(() => {
      if (typeof ctx.binder.setGaitActive === 'function') ctx.binder.setGaitActive(false);
      stopGraceTimeout = null;
    }, 1500);
  }
  console.log('[WALK] Locomotion smoothly decelerated and halted.');
};

window.synthiaWalk = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, 1, a);
window.synthiaWalkBackward = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, -1, a);
console.log('[Synthia] Mocap-C1 Gait Engine Ready (v4: spine-hip cooperation fwd, full-sole grab bwd).');
})();