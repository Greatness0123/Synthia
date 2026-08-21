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
   DIAGNOSTICS (embedded): every walk auto-exports
       synthia_walk_diagnosis_<ISO>.json  (raw evidence + verdicts)
       synthia_walk_diagnosis_<ISO>.md    (readable report)
     covering: glue, root drive, speed cap, force budget, COM lead,
     RMBS/rail, balance torque, gait playback (COMMANDED vs ACTUAL joint
     angles), swing/toe-lift audit, friction/slip, undocumented forces,
     backward drift and walk outcome.
     One-shot:  synthiaRunWalkDiagnosis(2, 0.12)       (glued, full)
                synthiaRunWalkDiagnosisRaw(2, 0.12)    (pose-only, no glue drive)
     Modes:     synthiaWalk (full glue) | synthiaWalkRaw (pose-only)
                synthiaWalkNoServo (glue minus root servo)
     Manual API: window.synthiaWalkDiag.{start,sample,finish}
     Live log:  every 5th sample prints [WALK-JOINTS] commanded-vs-actual
                knee/ankle + sole gap + swing flags to the console.
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
    stopWalkTimeout = null, stopGraceTimeout = null, walkDiagInterval = null;

/* ---------------- ENGINE GLUE ---------------------------------------
   If your build exposes the context differently, replace ONLY this
   function with the getContext() from your current file. -------------- */
function getContext(agentId = 'agent_0') {
  if (typeof window.synthiaGetContext === 'function') return window.synthiaGetContext(agentId);
  const binders = window.__SYNTHIA_HUMANOID_BINDERS__;
  const pe = window.__SYNTHIA_PHYSICS_ENGINE__ || null;
  if (binders && binders.has(agentId)) {
    return { binder: binders.get(agentId), pe };
  }
  if (window.__SYNTHIA_HUMANOID_BINDER__) {
    return { binder: window.__SYNTHIA_HUMANOID_BINDER__, pe };
  }
  const reg = window.__SYNTHIA_AGENTS__ || window.__synthiaAgents || null;
  if (reg && reg[agentId]) return reg[agentId];
  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   SELF-DIAGNOSTICS — embedded walk-causation recorder + exporter.
   -------------------------------------------------------------------
   Every synthiaWalk / synthiaWalkBackward run is instrumented. On stop
   (complete / fall / timeout / manual) it exports TWO files:
     synthia_walk_diagnosis_<ISO>.json  — raw samples + verdicts
     synthia_walk_diagnosis_<ISO>.md    — readable "what is wrong & why"
   One-shot helper: synthiaRunWalkDiagnosis(2, 0.12)
   Manual API:      window.synthiaWalkDiag.{start,sample,finish}
   All numbers are MuJoCo frame: +Y = forward, +Z = up, +X = right.
   ═══════════════════════════════════════════════════════════════════ */
const walkDiag = (function () {
  'use strict';
  const INSTANCE = { state: null, samples: [] };

  const safe = (fn, fb) => { try { const r = fn(); return r === undefined ? fb : r; } catch { return fb; } };
  const r3 = v => (Number.isFinite(v) ? Math.round(v * 1e3) / 1e3 : null);
  const stat = (arr, fn) => {
    const vs = (arr || []).map(fn).filter(v => Number.isFinite(v));
    if (vs.length === 0) return { mean: 0, min: 0, max: 0, std: 0, n: 0 };
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const variance = vs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vs.length;
    return { mean, min: Math.min(...vs), max: Math.max(...vs), std: Math.sqrt(variance), n: vs.length };
  };
  const getPE = () => window.__SYNTHIA_PHYSICS_ENGINE__ || null;
  const getModule = () => window.__SYNTHIA_MUJOCO_MODULE__ || null;
  const getWorld = () => { const pe = getPE(); if (!pe || typeof pe.getWorld !== 'function') return null; try { return pe.getWorld(); } catch { return null; } };
  const mjTypes = mj => {
    const T = (mj && mj.mjtObj) || {};
    const v = x => (x !== undefined && x !== null && typeof x === 'object' && 'value' in x) ? x.value : x;
    return { joint: v(T.mjOBJ_JOINT), body: v(T.mjOBJ_BODY), actuator: v(T.mjOBJ_ACTUATOR) };
  };

  function collectBodyIds(model, mj, prefix) {
    const ts = mjTypes(mj);
    const byName = new Map();
    const agentIds = [];
    let rmBodyId = -1;
    for (let bi = 0; bi < model.nbody; bi++) {
      const name = safe(() => mj.mj_id2name(model, ts.body, bi), '') || '';
      const mass = model.body_mass ? model.body_mass[bi] : 0;
      if (mass <= 0) continue;
      byName.set(name, bi);
      if (!name || name === 'floor' || name === 'world' || name.startsWith('env_slot_') || name.startsWith('piano_')) continue;
      if (name.startsWith(prefix)) {
        if (name.includes('reaction_mass')) rmBodyId = bi;
        else agentIds.push(bi);
      }
    }
    return { byName, agentIds, rmBodyId, prefix };
  }

  function buildIds(binder, agentId, world, mj) {
    const ids = {
      capId: null, dofAdr: -1, prefix: '',
      feet: { left: { bodyId: -1, geomId: null }, right: { bodyId: -1, geomId: null } },
      rm: null, bodies: { byName: new Map(), agentIds: [], rmBodyId: -1, prefix: '' }
    };
    if (!world || !mj || !world.model) return cloneIds(ids);
    const model = world.model;
    const prefix = (binder && binder.prefix) ? binder.prefix : (agentId + '_');
    ids.prefix = prefix;
    const bodies = collectBodyIds(model, mj, prefix);
    ids.bodies = bodies;

    let capId = safe(() => binder.getMultiBodyManager().getCapsuleBody(), null);
    if (capId === null || capId < 0) {
      capId = bodies.byName.get(prefix + 'root_capsule') ?? bodies.byName.get('root_capsule') ?? 1;
    }
    ids.capId = capId;
    ids.dofAdr = model.body_dofadr ? model.body_dofadr[capId] : -1;

    for (const side of ['left', 'right']) {
      const name = prefix + 'mixamorig' + side + 'foot';
      const fallback = 'mixamorig' + side + 'foot';
      const bodyId = bodies.byName.get(name) ?? bodies.byName.get(fallback);
      if (bodyId !== undefined) ids.feet[side].bodyId = bodyId;
      ids.feet[side].geomId = safe(() => binder.getMultiBodyManager().getBoneColliderHandle('mixamorig' + side + 'foot'), null);
    }

    const ts = mjTypes(mj);
    const viaBinder = binder ? safe(() => binder.resolveReactionMassIds(), null) : null;
    if (viaBinder) {
      ids.rm = { lr: viaBinder.actLrId, fa: viaBinder.actFaId, jntLr: viaBinder.jntLrId, jntFa: viaBinder.jntFaId, body: viaBinder.rmBodyId };
    } else {
      const nm = (type, n) => safe(() => mj.mj_name2id(model, type, n), -1);
      ids.rm = {
        lr: nm(ts.actuator, 'act_' + prefix + 'rm_slide_lr'),
        fa: nm(ts.actuator, 'act_' + prefix + 'rm_slide_fa'),
        jntLr: nm(ts.joint, prefix + 'rm_slide_lr'),
        jntFa: nm(ts.joint, prefix + 'rm_slide_fa'),
        body: -1
      };
    }
    return cloneIds(ids);
  }
  function cloneIds(ids) {
    return {
      capId: ids.capId, dofAdr: ids.dofAdr, prefix: ids.prefix,
      feet: { left: { bodyId: ids.feet.left.bodyId, geomId: ids.feet.left.geomId }, right: { bodyId: ids.feet.right.bodyId, geomId: ids.feet.right.geomId } },
      rm: ids.rm ? { lr: ids.rm.lr, fa: ids.rm.fa, jntLr: ids.rm.jntLr, jntFa: ids.rm.jntFa, body: ids.rm.body } : null,
      bodies: { byName: ids.bodies.byName, agentIds: ids.bodies.agentIds.slice(), rmBodyId: ids.bodies.rmBodyId, prefix: ids.bodies.prefix }
    };
  }

  function captureFrame() {
    const s = INSTANCE.state;
    if (!s || !s.ids) return null;
    const world = getWorld();
    const mj = getModule();
    if (!world || !world.model || !world.data || !mj) return { t: elapsedS(s), error: 'physics_unavailable' };
    const model = world.model, data = world.data;
    const capId = s.ids.capId, dofAdr = s.ids.dofAdr;
    const t = elapsedS(s);

    /* ── Recompute the timeline's COMMANDED joints for this instant so the
       export can show commanded vs ACTUAL at the same cycle phase — the
       "show me the joints" evidence. If the actual joints track the command
       but the foot never leaves the floor, the blocker is LOAD (the swing
       leg is still carrying body weight), not the animation. ──────────── */
    const elapsedMs = performance.now() - s.startedAt;
    const cycleMs = s.cycleMs || 1067;
    const cyclePhase = mod(elapsedMs / cycleMs);
    const envNow = Math.min(1, 0.5 * (Math.floor(elapsedMs / cycleMs) + 1));
    const CMD_P = (typeof gaitParams === 'function') ? gaitParams(s.speedMps, s.seqDir) : null;
    const cmdJoints = { hipR: null, kneeR: null, footR: null, hipL: null, kneeL: null, footL: null };
    if (CMD_P) {
      const cr = legTargets(mod(cyclePhase), CMD_P);
      const clTarget = legTargets(mod(cyclePhase + 0.5), CMD_P);
      cmdJoints.hipR = r3(s.seqDir * envNow * cr.hip);
      cmdJoints.kneeR = r3(0.02 + (cr.knee - 0.02) * envNow);
      cmdJoints.footR = r3(envNow * cr.ank);
      cmdJoints.hipL = r3(s.seqDir * envNow * clTarget.hip);
      cmdJoints.kneeL = r3(0.02 + (clTarget.knee - 0.02) * envNow);
      cmdJoints.footL = r3(envNow * clTarget.ank);
    }
    const rightSwingPhase = cyclePhase < 0.5;
    const leftSwingPhase = mod(cyclePhase + 0.5) < 0.5;

    const root = {
      x: data.xpos[capId * 3], y: data.xpos[capId * 3 + 1], z: data.xpos[capId * 3 + 2],
      vx: dofAdr >= 0 ? data.qvel[dofAdr] : 0,
      vy: dofAdr >= 0 ? data.qvel[dofAdr + 1] : 0,
      vz: dofAdr >= 0 ? data.qvel[dofAdr + 2] : 0
    };

    let tiltBackDeg = 0, tiltMagDeg = 0;
    try {
      const qw = data.xquat[capId * 4], qx = data.xquat[capId * 4 + 1], qy = data.xquat[capId * 4 + 2], qz = data.xquat[capId * 4 + 3];
      const ux = 2 * (qx * qz + qw * qy), uy = 2 * (qy * qz - qw * qx), uz = 1 - 2 * (qx * qx + qy * qy);
      tiltMagDeg = Math.acos(Math.min(1, Math.max(-1, uz))) * 180 / Math.PI;
      tiltBackDeg = Math.atan2(-uy, uz) * 180 / Math.PI;   // + = top leans backward
    } catch { }

    const com = { total: null, robot: null };
    {
      let tM = 0, tX = 0, tY = 0, tZ = 0, tVx = 0, tVy = 0, tVz = 0;
      let rM = 0, rX = 0, rY = 0, rZ = 0, rVx = 0, rVy = 0, rVz = 0;
      for (const bi of s.ids.bodies.agentIds) {
        const m = model.body_mass[bi]; if (m <= 0) continue;
        const x = data.xpos[bi * 3], y = data.xpos[bi * 3 + 1], z = data.xpos[bi * 3 + 2];
        const cv = bi * 6;
        const vx = data.cvel[cv + 3], vy = data.cvel[cv + 4], vz = data.cvel[cv + 5];
        tM += m; tX += m * x; tY += m * y; tZ += m * z; tVx += m * vx; tVy += m * vy; tVz += m * vz;
        if (bi === s.ids.bodies.rmBodyId) continue;
        rM += m; rX += m * x; rY += m * y; rZ += m * z; rVx += m * vx; rVy += m * vy; rVz += m * vz;
      }
      if (tM > 0) com.total = { x: tX / tM, y: tY / tM, z: tZ / tM, vy: tVy / tM, m: tM };
      if (rM > 0) com.robot = { x: rX / rM, y: rY / rM, z: rZ / rM, vy: rVy / rM, m: rM };
    }

    const feet = { left: null, right: null };
    let plantedCount = 0, supX = 0, supY = 0;
    for (const side of ['left', 'right']) {
      const id = s.ids.feet[side];
      const foot = { pos: null, vel: null, contact: false, planted: false, soleGapM: null, slipY: null };
      if (id.bodyId >= 0) {
        const bi = id.bodyId;
        foot.pos = { x: data.xpos[bi * 3], y: data.xpos[bi * 3 + 1], z: data.xpos[bi * 3 + 2] };
        foot.vel = { x: data.cvel[bi * 6 + 3], y: data.cvel[bi * 6 + 4], z: data.cvel[bi * 6 + 5] };
        foot.contact = id.geomId !== null ? safe(() => getPE().getContactForceRegistry().get(id.geomId).inContact, false) : false;
        foot.planted = foot.contact || foot.pos.z <= 0.12;
        foot.soleGapM = Math.max(0, foot.pos.z - 0.090);
        foot.slipY = foot.vel.y;
        /* Support center: −0.040 m forward of the ankle with the new 13 cm
           heel/mid foot box (was −0.060 for the old 26 cm single box). */
        if (foot.planted) { plantedCount++; supX += foot.pos.x; supY += foot.pos.y - 0.040; }
      }
      foot.swing = (side === 'left') ? leftSwingPhase : rightSwingPhase;
      if (foot.swing && Number.isFinite(foot.soleGapM) && s.footLiftPeak) {
        s.footLiftPeak[side] = Math.max(s.footLiftPeak[side], foot.soleGapM);
      }
      feet[side] = foot;
    }
    const support = plantedCount > 0 ? { x: supX / plantedCount, y: supY / plantedCount } : null;
    const comRobot = com.robot || com.total;
    const comLeadY = (comRobot && support) ? comRobot.y - support.y : null;

    const servo = { target: null, active: false, actualThreeZ: null, actualMjY: root.vy };
    if (s.binder) {
      const tgt = safe(() => s.binder.targetRootVelocity, null);
      if (tgt) servo.target = { x: tgt.x, z: tgt.z };
      servo.active = safe(() => s.binder.rootVelocityTargetActive(), false);
      const rv = safe(() => s.binder.getRootVelocity(), null);
      if (rv) servo.actualThreeZ = rv.z;
    }

    const rmbs = { enabled: false, mode: null, ctrlLr: null, ctrlFa: null, slideLr: null, slideFa: null, saturationCount: 0, trim: null };
    if (s.binder) rmbs.enabled = safe(() => s.binder.reactionMassEnabled, false);
    if (s.binder) rmbs.mode = safe(() => s.binder.rmbsMode(), null);
    const rm = s.ids.rm;
    if (rm && rm.fa >= 0 && rm.lr >= 0 && data.ctrl) {
      rmbs.ctrlLr = data.ctrl[rm.lr];
      rmbs.ctrlFa = data.ctrl[rm.fa];
      const jntQ = jntId => {
        if (jntId < 0 || !model.jnt_qposadr) return null;
        return data.qpos[model.jnt_qposadr[jntId]] ?? null;
      };
      rmbs.slideFa = jntQ(rm.jntFa);
      rmbs.slideLr = jntQ(rm.jntLr);
    }
    if (s.binder) {
      rmbs.saturationCount = safe(() => s.binder.getReactionMassController().getStats().saturationCount, 0);
      rmbs.trim = safe(() => s.binder.getRmbsTrimState(), null);
    }

    const balance = { enabled: s.binder ? safe(() => s.binder.capsuleBalanceEnabled, false) : false };
    const gait = { active: s.binder ? safe(() => s.binder.motorController.isGaitActive(), false) : false };
    const grounded = s.binder ? safe(() => s.binder._isGrounded, true) : true;
    const friction = s.binder ? (Number.isFinite(s.binder.friction) ? s.binder.friction : null) : null;

    const forces = { qfrc: null, cfrcY: null, cfrcFz: null, cfrcTx: null, cfrcTy: null, xfrcApplied: null };
    if (dofAdr >= 0 && data.qfrc_constraint) {
      forces.qfrc = { x: data.qfrc_constraint[dofAdr], y: data.qfrc_constraint[dofAdr + 1], z: data.qfrc_constraint[dofAdr + 2] };
    }
    if (data.cfrc_ext) {
      forces.cfrcY = data.cfrc_ext[capId * 6 + 1];
      forces.cfrcFz = data.cfrc_ext[capId * 6 + 2];
      forces.cfrcTx = data.cfrc_ext[capId * 6 + 3];
      forces.cfrcTy = data.cfrc_ext[capId * 6 + 4];
    }
    if (data.xfrc_applied) {
      forces.xfrcApplied = { fx: data.xfrc_applied[capId * 6], fy: data.xfrc_applied[capId * 6 + 1], fz: data.xfrc_applied[capId * 6 + 2], tx: data.xfrc_applied[capId * 6 + 3], ty: data.xfrc_applied[capId * 6 + 4], tz: data.xfrc_applied[capId * 6 + 5] };
    }

    const ts = mjTypes(mj);
    const jnt = stem => {
      const id = safe(() => mj.mj_name2id(model, ts.joint, s.ids.prefix + stem), -1);
      if (id < 0 || !model.jnt_qposadr) return null;
      return data.qpos[model.jnt_qposadr[id]] ?? null;
    };
    const joints = {
      hipL: jnt('mixamorigleftupleg_pitch'), hipR: jnt('mixamorigrightupleg_pitch'),
      kneeL: jnt('mixamorigleftleg_pitch'), kneeR: jnt('mixamorigrightleg_pitch'),
      footL: jnt('mixamorigleftfoot_pitch'), footR: jnt('mixamorigrightfoot_pitch'),
      spine: jnt('mixamorigspine_pitch'), spine2: jnt('mixamorigspine2_pitch')
    };

    return {
      t: Math.round(t * 1000) / 1000,
      root: { x: r3(root.x), y: r3(root.y), z: r3(root.z), vx: r3(root.vx), vy: r3(root.vy), vz: r3(root.vz) },
      /* VISUAL-FORWARD displacement (forward walks travel MuJoCo −Y). */
      dispFwdM: r3(s.dir >= 0 ? (s.startPos.y - root.y) : (root.y - s.startPos.y)),
      tiltBackDeg: r3(tiltBackDeg), tiltMagDeg: r3(tiltMagDeg),
      com: com.total ? { x: r3(com.total.x), y: r3(com.total.y), z: r3(com.total.z), vy: r3(com.total.vy), mass: com.total.m } : null,
      comRobot: comRobot ? { x: r3(comRobot.x), y: r3(comRobot.y), z: r3(comRobot.z), vy: r3(comRobot.vy), mass: comRobot.m } : null,
      support: support ? { x: r3(support.x), y: r3(support.y) } : null,
      comLeadY: comLeadY === null ? null : r3(comLeadY),
      feet: {
        left: feet.left ? { pos: feet.left.pos, vel: feet.left.vel, contact: feet.left.contact, planted: feet.left.planted, soleGapM: r3(feet.left.soleGapM), slipY: r3(feet.left.slipY), swing: feet.left.swing } : null,
        right: feet.right ? { pos: feet.right.pos, vel: feet.right.vel, contact: feet.right.contact, planted: feet.right.planted, soleGapM: r3(feet.right.soleGapM), slipY: r3(feet.right.slipY), swing: feet.right.swing } : null
      },
      servo, rmbs, balance, gait, grounded, friction,
      forces,
      joints,
      cmdJoints,
      cyclePhase: r3(cyclePhase), envNow: r3(envNow), mode: s.mode,
      ncon: data.ncon ?? 0
    };
  }

  const elapsedS = s => ((performance.now() - s.startedAt) / 1000);

  function start(opts) {
    finish(); // close any prior session (it exports its own report)
    const binder = opts.binder || null;
    const agentId = opts.agentId || 'agent_0';
    const world = getWorld(), mj = getModule();
    const glue = {
      synthiaGetContext: typeof window.synthiaGetContext === 'function',
      agentsRegistry: !!(window.__SYNTHIA_AGENTS__ || window.__synthiaAgents),
      realBinderMapPresent: !!window.__SYNTHIA_HUMANOID_BINDERS__,
      contextFromSyncGetContext: opts.ctx !== null && opts.ctx !== undefined,
      binderPresent: !!binder,
      walkMethodsWork: !!binder && typeof binder.setTargetRootVelocity === 'function'
    };
    glue.resolvesFor02 = glue.contextFromSyncGetContext && glue.binderPresent;
    const capIdParam = (binder && typeof binder.getCapsuleBodyId === 'function') ? binder.getCapsuleBodyId() : null;
    INSTANCE.state = {
      agentId,
      dir: opts.dir,
      speedMps: opts.speedMps,
      distanceM: opts.distanceM,
      mode: opts.mode || 'glued',
      seqDir: (opts.seqDir !== undefined) ? opts.seqDir : (opts.dir >= 0 ? -1 : 1),
      cycleMs: opts.cycleMs || Math.round(F * 1000 / FPS),
      footLiftPeak: { left: 0, right: 0 },
      binder,
      pe: getPE(),
      capId: capIdParam,
      startPos: { x: opts.startPos.x, y: opts.startPos.y, z: opts.startPos.z },
      startedAt: performance.now(),
      stoppedAt: null,
      finishReason: null,
      fallDetected: false,
      completeDetected: false,
      glue,
      ids: buildIds(binder, agentId, world, mj),
      rmbsPreEnabledByUrl: (typeof location !== 'undefined') ? safe(() => new URLSearchParams(location.search).has('rmbs'), false) : false,
      binderCalls: {
        setReactionMassEnabled: (binder && typeof binder.setReactionMassEnabled === 'function') ? 'called → RMBS enabled=true' : 'SKIPPED — binder==null (broken glue)',
        setCapsuleBalanceEnabled: (binder && typeof binder.setCapsuleBalanceEnabled === 'function') ? 'called → capsule balance enabled=true' : 'SKIPPED — binder==null (broken glue)',
        setGaitActive: (binder && typeof binder.setGaitActive === 'function') ? 'called → gaitActive=true' : 'SKIPPED — binder==null (broken glue)',
        setTargetRootVelocity: (binder && typeof binder.setTargetRootVelocity === 'function')
          ? ('called with (0, ' + (opts.dir >= 0 ? '+' : '-') + opts.speedMps + ', 1000) → Three.js Z (visual-forward walk = MuJoCo −Y = +Z)')
          : 'SKIPPED — binder==null (broken glue) — NO root drive at all'
      }
    };
    INSTANCE.samples.length = 0;
    console.log('%c[WALK-DIAG] Recording cause-evidence @ ' + Math.round(1000 / walkDiag.interval) + ' Hz — exports on stop.', 'color:#fa0;font-weight:bold');
  }

  function sample() {
    const f = captureFrame();
    if (!f) return;
    f.f = INSTANCE.samples.length;
    INSTANCE.samples.push(f);
    const s = INSTANCE.state;
    if (!s) return;
    if (f.root && f.root.z < 0.45) s.fallDetected = true;
    if (f.dispFwdM !== null) {           // dispFwdM is now VISUAL-FORWARD (positive = forward)
      if (f.dispFwdM >= s.distanceM) s.completeDetected = true;
    }
    /* ── LIVE JOINT AUDIT (every 5th sample): commanded vs actual knee/ankle
       + sole gap + swing flags. If actual tracks command but sole stays ~0
       during swing, the leg is still carrying LOAD → the walk cannot lift. ── */
    if (f.f % 5 === 0 && f.joints && f.cmdJoints && f.feet) {
      const j = f.joints, c = f.cmdJoints;
      const fl = f.feet.left, fr = f.feet.right;
      console.log('[WALK-JOINTS] t=' + f.t + 's ph=' + f.cyclePhase + ' mode=' + s.mode +
        ' | kneeR cmd=' + c.kneeR + ' act=' + j.kneeR +
        ' | kneeL cmd=' + c.kneeL + ' act=' + j.kneeL +
        ' | footR cmd=' + c.footR + ' act=' + j.footR +
        ' | soleL=' + (fl ? fl.soleGapM : '?') + ' soleR=' + (fr ? fr.soleGapM : '?') +
        ' | swingL=' + (fl ? fl.swing : '?') + ' swingR=' + (fr ? fr.swing : '?'));
    }
  }

  function finish(reason) {
    if (walkDiagInterval) { clearInterval(walkDiagInterval); walkDiagInterval = null; }
    const s = INSTANCE.state;
    if (!s) return;
    s.stoppedAt = performance.now();
    if (!reason) {
      if (s.fallDetected) reason = 'fall_detected';
      else if (s.completeDetected) reason = 'walk_complete';
      else reason = 'stopped_manually_or_timeout';
    }
    s.finishReason = reason;
    const report = analyze();
    exportReport(report, s);
    printReport(report, s);
    INSTANCE.state = null;
    INSTANCE.samples.length = 0;
  }

  function analyze() {
    const s = INSTANCE.state;
    const sam = INSTANCE.samples;
    const n = sam.length;
    const dir = s.dir >= 0 ? 1 : -1;
    const checks = [];
    const fail = [];
    const warn = [];

    checks.push({ id: 'glue', title: 'Engine glue (getContext resolves a binder?)', verdict: '', why: '', evidence: '', fix: '' });
    checks[checks.length - 1].verdict = s.glue.resolvesFor02 ? 'PASS' : 'FAIL';
    checks[checks.length - 1].why = s.glue.resolvesFor02
      ? 'getContext(agentId) returned a binder — the root-velocity servo, RMBS, capsule balance and gait-flag hooks all ran.'
      : 'getContext(agentId) returned null. This script only looks for window.synthiaGetContext / window.__SYNTHIA_AGENTS__ / window.__synthiaAgents — none of those exist in this build. The real registry is window.__SYNTHIA_HUMANOID_BINDERS__ (a Map). With binder==null, setReactionMassEnabled / setCapsuleBalanceEnabled / setGaitActive / setTargetRootVelocity are ALL skipped → the walk is POSE-ONLY: the legs animate exactly as commanded but NOTHING drives or balances the body.';
    checks[checks.length - 1].evidence = JSON.stringify(s.glue);
    checks[checks.length - 1].fix = s.glue.resolvesFor02 ? '' : 'Before walking, paste once:\n  window.synthiaGetContext = (id) => ({ binder: window.__SYNTHIA_HUMANOID_BINDERS__.get(id || \'agent_0\'), pe: window.__SYNTHIA_PHYSICS_ENGINE__ });\nthen re-paste 02 (so its closure sees the new function) and re-run the walk.\n';
    if (!s.glue.resolvesFor02) fail.push('glue');

    checks.push({ id: 'rootDrive', title: 'Root-velocity servo (forward drive)', verdict: '', why: '', evidence: '', fix: '' });
    if (!s.glue.resolvesFor02) {
      checks[checks.length - 1].verdict = 'N/A';
      checks[checks.length - 1].why = 'Never reached — getContext() was null so binder.setTargetRootVelocity(...) was never called. There is NO forward root assist at all; the body only moves if the leg/pose stack alone pushes it.';
      checks[checks.length - 1].evidence = 'binder==null → servo skipped';
      checks[checks.length - 1].fix = 'Fix the glue first (see above).';
    } else {
      const vys = sam.map(f => f.root ? f.root.vy : NaN).filter(Number.isFinite);
      const meanVy = vys.length ? vys.reduce((a, b) => a + b, 0) / vys.length : 0;
      /* Visual-forward travels MuJoCo −Y → the +Y velocity target is −dir*speed. */
      const targetMjY = -dir * s.speedMps;
      const achievable = Math.abs(targetMjY) > 1e-6 ? meanVy / targetMjY : 0;
      const clipped = s.speedMps > 0.15;
      checks[checks.length - 1].verdict = achievable >= 0.6 ? 'PASS' : (achievable >= 0.25 ? 'WARN' : 'FAIL');
      checks[checks.length - 1].why = (clipped ? 'COMMANDED ' + s.speedMps + ' m/s EXCEEDS THE SERVO CAP: HumanoidPhysicsBinder clamps the root servo to ROOT_VELOCITY_MAX_MPS = 0.15 m/s, so a 0.30 demand can only ever deliver 0.15. ' : '')
        + 'Mean root velocity in VISUAL-FORWARD direction (MuJoCo −Y, i.e. negating measured +Y root velocity) = ' + r3(-meanVy) + ' m/s vs commanded ' + r3(s.speedMps) + ' m/s → ' + Math.round(achievable * 100) + '% of target (100% = walking at the commanded speed visually). The servo is only an assist; the legs/GRF must supply the rest. A low number = the body is not being propelled forward.';
      checks[checks.length - 1].evidence = 'meanMjY=' + r3(meanVy) + ' m/s → visual-fwd ' + r3(-meanVy) + ' m/s, target=' + r3(targetMjY) + ' m/s, servo-cap=0.15 m/s, clipped=' + clipped + ', n=' + vys.length;
      checks[checks.length - 1].fix = clipped ? 'Test at ≤ 0.15 m/s, or raise ROOT_VELOCITY_MAX_MPS in HumanoidPhysicsBinder.ts (it is a constant).' : (achievable < 0.25 ? 'Glue is fine but the body is not moving forward — read the COM / RMBS / force checks below for why.' : '');
      if (achievable < 0.6 && !clipped) warn.push('rootDrive');
      if (achievable < 0.25 && !clipped) fail.push('rootDrive');
    }

    const tgtSample = sam.find(f => f.servo && f.servo.target);
    if (tgtSample && s.binder) {
      const tz = tgtSample.servo.target.z;
      const mjY = -tz;                       // Three.js −Z maps to MuJoCo +Y
      const signOk = dir === 1 ? mjY < 0 : mjY > 0;  // visual-forward = MuJoCo −Y
      checks.push({ id: 'rootSign', title: 'Root-velocity sign vs direction', verdict: signOk ? 'PASS' : 'FAIL', why: signOk
        ? ('Commanded Three.js Z = ' + r3(tz) + ' maps to MuJoCo Y = ' + r3(mjY) + ' — a forward walk travels MuJoCo −Y, so this matches the requested ' + (dir === 1 ? 'forward' : 'backward') + ' walk.')
        : ('COMMANDED THE WRONG WAY: Three.js Z = ' + r3(tz) + ' maps to MuJoCo Y = ' + r3(mjY) + ', OPPOSITE to the requested ' + (dir === 1 ? 'visual-forward (−Y)' : 'visual-backward (+Y)') + ' — the servo itself actively pushes the body the wrong way.'),
        evidence: 'targetZ=' + r3(tz), fix: signOk ? '' : 'Use setTargetRootVelocity(0, ' + (dir === 1 ? '+' : '-') + 'speed) for a forward/backward walk.' });
      if (!signOk) fail.push('rootSign');
    }

    const qfySt = stat(sam, f => (f.forces && f.forces.qfrc) ? f.forces.qfrc.y : NaN);
    const cfySt = stat(sam, f => (f.forces && Number.isFinite(f.forces.cfrcY)) ? f.forces.cfrcY : NaN);
    const vySt = stat(sam, f => f.root ? f.root.vy : NaN);
    checks.push({ id: 'forceBudget', title: 'Net horizontal force available (contact/constraint, MuJoCo +Y)', verdict: 'INFO', why: 'This is the physical answer to "is there enough force?": qfrc_constraint along +Y averaged ' + r3(qfySt.mean) + ' N (contact-solver reaction at the free-joint DOF; min ' + r3(qfySt.min) + ', max ' + r3(qfySt.max) + ') and the capsule cfrc_ext +Y averaged ' + r3(cfySt.mean) + ' N. Visual-forward is MuJoCo −Y, so NEGATIVE +Y = net VISUAL-FORWARD push from ground contact; positive = net BACKWARD drag. Run 19-58-26 had mean qfrcY = −232 N (spike −1036 N) — the feet WERE pushing forward; the failure was backward PITCH (see balance row), not missing propulsion.', evidence: 'meanQfrcY=' + r3(qfySt.mean) + ' | meanCfrcY=' + r3(cfySt.mean), fix: 'Cross-check against the balance (backward pitch) and stance-knee (KST) checks below — the cancelling subsystem is one of them.' });

    const leads = sam.map(f => f.comLeadY).filter(v => v !== null && Number.isFinite(v));
    const meanLead = leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : NaN;
    /* Visual-forward = MuJoCo −Y → the COM is "ahead" when comLeadY is MORE NEGATIVE. */
    const backPct = leads.length ? (leads.filter(v => v > 0.02).length / leads.length) * 100 : 0;
    const GP = gaitParams(s.speedMps, dir);
    checks.push({ id: 'gaitParams', title: 'Gait parameters in use', verdict: 'INFO', why: 'At ' + s.speedMps + ' m/s: SWEEP=' + r3(GP.SWEEP) + ', FLX=' + r3(GP.FLX) + ', EXT=' + r3(GP.EXT) + ', KSW=' + r3(GP.KSW) + ', LEAN=' + r3(GP.LEAN) + ' rad (~' + r3(GP.LEAN * 57.2958) + '°) spread over spine+spine1+spine2, LEAN_OSC=' + r3(GP.LEAN_OSC) + '. The forward lean is deliberately small — per-segment spine pitch is only ~' + r3(GP.LEAN / 3) + ' rad.', evidence: JSON.stringify({ SWEEP: r3(GP.SWEEP), FLX: r3(GP.FLX), EXT: r3(GP.EXT), KSW: r3(GP.KSW), LEAN: r3(GP.LEAN), LEAN_OSC: r3(GP.LEAN_OSC) }), fix: '' });

    checks.push({ id: 'comLead', title: 'COM vs support center (mass must sit AHEAD of stance sole to fall forward)', verdict: '', why: '', evidence: '', fix: '' });
    checks[checks.length - 1].verdict = !Number.isFinite(meanLead) ? 'N/A' : (dir === 1 ? (meanLead < -0.02 ? 'PASS' : 'FAIL') : (meanLead > 0.02 ? 'PASS' : 'FAIL'));
    checks[checks.length - 1].why = 'COM lead (robot COM − support sole center; VISUAL-FORWARD = MORE NEGATIVE comLeadY, i.e. the COM ahead of the sole in −Y) averaged ' + (Number.isFinite(meanLead) ? r3(meanLead) + ' m in +Y frame = ' + r3(-meanLead) + ' m AHEAD visually' : '?') + '; ' + Math.round(backPct) + '% of samples had the COM > 2 cm BEHIND the support sole (+Y side). Interpretation note: run 19-58-26 measured −0.34 m (+Y frame) = 0.34 m AHEAD visually — its failure was NOT COM-lead but growing BACKWARD PITCH (see balance/result rows) and a sinking pelvis.';
    checks[checks.length - 1].evidence = leads.length ? 'meanComLeadY=' + r3(meanLead) + ' m (n=' + leads.length + ')' : 'no support/COM samples';
    checks[checks.length - 1].fix = 'Increase the forward lean (LEAN / LEAN_OSC in gaitParams) or bias the stance hip (hip.x+) so the pelvis/COM is pushed AHEAD of the planted foot. Lean = ' + r3(GP.LEAN) + ' rad is very small.';
    if (dir === 1 && Number.isFinite(meanLead) && meanLead <= 0.02) fail.push('comLead');

    /* Visual-forward = MuJoCo −Y → "dragged backward" = root velocity MORE POSITIVE than +1 cm/s. */
    const drift = sam.filter(f => f.root && Number.isFinite(f.root.vy) && f.root.vy > 0.01).length;
    const driftPct = n ? (drift / n) * 100 : 0;
    checks.push({ id: 'backwardDrift', title: 'Backward drift while ' + (dir === 1 ? 'forward' : 'backward') + ' walk commanded', verdict: (n >= 5 && driftPct > 15) ? 'FAIL' : (n < 5 ? 'N/A' : 'PASS'), why: driftPct === 0
      ? 'No samples showed the root moving backward (visual-forward = MuJoCo −Y, so backward = root vy > +1 cm/s).'
      : Math.round(driftPct) + '% of samples had the root moving BACKWARD (visual vy > +0.01 m/s) during a ' + (dir === 1 ? 'forward' : 'backward') + ' command. This is the literal "dragged backwards" symptom, quantified.' + (dir !== 1 ? ' (For a backward walk positive +Y velocity is expected — this row is informational.)' : ''),
      evidence: driftPct === 0 ? 'bwdVelSamples=0/' + n : 'bwdVelSamples=' + drift + '/' + n + ' (' + Math.round(driftPct) + '%)', fix: (n >= 5 && driftPct > 15 && dir === 1) ? 'Check the balance row (backward pitch) and stance-knee KST first; then RMBS rail + root sign.' : '' });
    if (dir === 1 && n >= 5 && driftPct > 15) fail.push('backwardDrift');

    const rmOn = s.rmbsPreEnabledByUrl || (s.binder ? safe(() => s.binder.reactionMassEnabled, false) : false);
    const satCount = s.binder ? safe(() => s.binder.getReactionMassController().getStats().saturationCount, 0) : 0;
    const cfaSt = stat(sam, f => (f.rmbs && Number.isFinite(f.rmbs.ctrlFa)) ? f.rmbs.ctrlFa : NaN);
    const slideFaSt = stat(sam, f => (f.rmbs && Number.isFinite(f.rmbs.slideFa)) ? f.rmbs.slideFa : NaN);
    const railed = satCount > 0 || Math.abs(cfaSt.mean) > 0.5;
    checks.push({ id: 'rmbs', title: 'RMBS reaction mass + FA rail', verdict: !rmOn ? 'N/A' : (railed ? 'FAIL' : 'PASS'), why: !rmOn
      ? 'RMBS is OFF — an 18 kg reaction mass sitting dead-center does nothing. (02 calls setReactionMassEnabled(true) only when glue resolves; pre-enabled via ?rmbs=1 URL flag = ' + s.rmbsPreEnabledByUrl + '.) If you expected RMBS assist, it is not engaged.'
      : 'RMBS is ON. mean ctrlFa=' + r3(cfaSt.mean) + ' (std ' + r3(cfaSt.std) + '), slideFa qpos mean=' + r3(slideFaSt.mean) + ', saturation events=' + satCount + '. Rig-calibration note inside HumanoidPhysicsBinder: healthy = rm_slide_fa oscillating −0.08…−0.14; a rail PIN (e.g. +0.117) with saturation = the 18 kg mass physically pinned at the rail end, which pulls the torso/pelvis BACKWARD while walking forward — a direct dragging-back mechanism.',
      evidence: 'enabled=' + rmOn + ', saturationCount=' + satCount + ', meanCtrlFa=' + r3(cfaSt.mean) + ', meanSlideFa=' + r3(slideFaSt.mean),
      fix: railed ? 'Check the −0.060 m support-center calibration in reactionMassSupportCenter() and railRange/trimming. A rearward-rail pin means RMBS is fighting the walk.' : (rmOn ? 'RMBS running but not railed — not the primary drag source.' : '') });
    if (rmOn && railed) fail.push('rmbs');

    const balOn = s.binder ? safe(() => s.binder.capsuleBalanceEnabled, false) : false;
    const tiltBackSt = stat(sam, f => Number.isFinite(f.tiltBackDeg) ? f.tiltBackDeg : NaN);
    checks.push({ id: 'balance', title: 'Capsule balance torque vs forward lean', verdict: !balOn ? 'N/A' : (tiltBackSt.mean > 5 ? 'WARN' : 'PASS'), why: 'Capsule balance is ' + (balOn ? 'ON' : 'OFF') + '. Mean backward tilt (positive = top leaning back) = ' + r3(tiltBackSt.mean) + '°, max ' + r3(tiltBackSt.max) + '°. 02 commands a forward lean; if the balance PD servo is holding the capsule level/upright it actively cancels that lean, keeping the COM over/behind the feet.', evidence: 'enabled=' + balOn + ', meanTiltBack=' + r3(tiltBackSt.mean), fix: 'Review setCapsuleBalanceGains (RMBS forces 200/40). If the capsule is being held from leaning forward, it fights the COM-lead requirement.' });
    if (balOn && tiltBackSt.mean > 5) warn.push('balance');

    const hipLSt = stat(sam, f => (f.joints && Number.isFinite(f.joints.hipL)) ? f.joints.hipL : NaN);
    const hipRSt = stat(sam, f => (f.joints && Number.isFinite(f.joints.hipR)) ? f.joints.hipR : NaN);
    const kneeLSt = stat(sam, f => (f.joints && Number.isFinite(f.joints.kneeL)) ? f.joints.kneeL : NaN);
    const moving = Math.max(hipLSt.std, hipRSt.std, kneeLSt.std);
    checks.push({ id: 'gait', title: 'Gait playback (joints actually swinging)', verdict: moving > 0.08 ? 'PASS' : 'FAIL', why: moving > 0.08
      ? 'Hip/knee swing stddev = ' + r3(moving) + ' rad over the stride — the 32-frame timeline IS being applied and the legs ARE stepping. The problem is NOT missing animation.'
      : 'Hip/knee swing stddev = ' + r3(moving) + ' rad — the legs are barely moving. The sequence is likely being rejected by validateAndApplyTimeline (wrong bone keys / clamps) or never dispatched, so there is NO push-off at all.',
      evidence: 'hipL.std=' + r3(hipLSt.std) + ', hipR.std=' + r3(hipRSt.std) + ', kneeL.std=' + r3(kneeLSt.std),
      fix: moving > 0.08 ? '' : 'Watch the console for rejection/clamping notes from validateAndApplyTimeline; verify the rig bone names in SYNTHIA_RIG_CONSTRAINTS.' });
    if (moving <= 0.08) fail.push('gait');

    const peakL = s.footLiftPeak ? s.footLiftPeak.left : 0;
    const peakR = s.footLiftPeak ? s.footLiftPeak.right : 0;
    const minPeak = Math.min(peakL, peakR);
    checks.push({ id: 'toeLift', title: 'Swing-foot toe lift (max sole gap during commanded swing)', verdict: minPeak >= 0.03 ? 'PASS' : (minPeak >= 0.01 ? 'WARN' : 'FAIL'), why: 'Maximum sole-to-floor gap achieved during commanded swing: left = ' + r3(peakL) + ' m, right = ' + r3(peakR) + ' m. A gap < ~3 cm means the toe never truly clears. In all three diagnostic runs (56-43/57-29/58-26) this stayed at 0.000 m while the knee was commanded 0.4–0.85 rad — the signature of a LOADED swing leg on a sinking, backward-pitching pelvis, NOT a mechanically stuck toe or a missing animation.', evidence: 'footLiftPeak: L=' + r3(peakL) + ', R=' + r3(peakR), fix: minPeak >= 0.03 ? '' : 'Fix the backward pitch + stance-knee (KST) first — a loaded leg cannot lift. If it stays < 3 cm with stable pitch, raise KSW or shift the swing-knee fold earlier in the stride.' });
    if (minPeak < 0.03) fail.push('toeLift');

    let slipCount = 0, contactCount = 0;
    for (const f of sam) {
      for (const side of ['left', 'right']) {
        const ft = f.feet && f.feet[side];
        if (ft && ft.planted) { contactCount++; if (Math.abs(ft.slipY) > 0.10) slipCount++; }
      }
    }
    const slipPct = contactCount ? (slipCount / contactCount) * 100 : 0;
    const frictionVal = s.binder ? safe(() => s.binder.friction, null) : null;
    checks.push({ id: 'friction', title: 'Ground friction / foot slip', verdict: slipPct < 20 ? 'PASS' : 'FAIL', why: 'Planted-foot samples that slid along +Y > 0.10 m/s: ' + Math.round(slipPct) + '% (slip=' + slipCount + '/contact=' + contactCount + '). binder.friction = ' + frictionVal + '. Sliding soles cannot push off — friction is the only horizontal coupling. If the lean or RMBS shoves the body back, the feet slip backward and the body never progresses.', evidence: 'slipPct=' + Math.round(slipPct), fix: 'If slip % is high: raise friction (binder.friction / worldStore.globalFriction) or re-time the stance ankle so the full sole loads before push-off.' });
    if (slipPct >= 20) fail.push('friction');

    const xfSt = stat(sam, f => (f.forces && f.forces.xfrcApplied) ? f.forces.xfrcApplied.fy : NaN);
    checks.push({ id: 'external', title: 'Undocumented / explicit external forces', verdict: Math.abs(xfSt.mean) < 1e-3 ? 'PASS' : 'FAIL', why: Math.abs(xfSt.mean) < 1e-3
      ? 'xfrc_applied (explicitly injected wrenches on the capsule) mean +Y = ' + r3(xfSt.mean) + ' N → NO explicit external force is being applied by the app. Any backward pull is generated INTERNALLY: foot/floor contact constraints, the leg motors, the RMBS rail, the balance torque, the root servo, or the pose stack.'
      : 'SOMETHING IS INJECTING AN EXPLICIT FORCE along +Y = ' + r3(xfSt.mean) + ' N — find who writes xfrc_applied / mj_applyFT.',
      evidence: 'meanXfrcAppliedY=' + r3(xfSt.mean) + ' | qfrcConstraintY mean=' + r3(qfySt.mean), fix: Math.abs(xfSt.mean) < 1e-3 ? '' : 'Search the codebase for xfrc_applied / mj_applyFT writes.' });
    if (Math.abs(xfSt.mean) >= 1e-3) fail.push('external');

    const last = sam[sam.length - 1] || null;
    const disp = last ? last.dispFwdM : 0;   // dispFwdM is now VISUAL-FORWARD (positive = walked forward)
    const minH = stat(sam, f => f.root ? f.root.z : NaN).min;
    const maxTilt = stat(sam, f => Number.isFinite(f.tiltMagDeg) ? f.tiltMagDeg : NaN).max;
    const gaitActiveLast = last ? last.gait.active : false;
    checks.push({ id: 'grf', title: 'Kinematic GRF injector + gait boost', verdict: gaitActiveLast ? 'INFO' : 'WARN', why: 'ENABLE_KINEMATIC_GRF_INJECTOR is compile-time TRUE in HumanoidPhysicsBinder; it converts planted-foot slip into root impulses ×' + (gaitActiveLast ? '1.5 (gait active)' : '1.0 (gait NOT active — the 1.5 boost is missing, likely broken glue)') + '. Last sample gaitActive=' + gaitActiveLast + '. The injector only helps while the feet push; if RMBS/balance counter-push harder, its impulse is cancelled.', evidence: 'gaitActive=' + gaitActiveLast, fix: gaitActiveLast ? '' : 'gaitActive stays false when glue is broken (02 cannot call binder.setGaitActive) — the GRF boost is lost.' });
    if (!gaitActiveLast) warn.push('grf');

    checks.push({ id: 'result', title: 'Walk outcome', verdict: s.completeDetected ? 'PASS' : (s.fallDetected ? 'FAIL' : 'WARN'), why: 'Final forward displacement = ' + r3(disp) + ' m (target ' + s.distanceM + ' m). Min root height = ' + r3(minH) + ' m, max capsule tilt = ' + r3(maxTilt) + '°. Finish reason: ' + s.finishReason + '.', evidence: 'disp=' + r3(disp) + ', minH=' + r3(minH) + ', maxTilt=' + r3(maxTilt), fix: '' });
    if (!s.completeDetected && !s.fallDetected) warn.push('result');
    if (s.fallDetected) fail.push('result');

    return {
      checks,
      primaryCauses: fail,
      warnings: warn,
      sampleCount: n,
      durationS: ((s.stoppedAt - s.startedAt) / 1000)
    };
  }

  function markdownReport(report, s) {
    const lines = [];
    lines.push('# Synthia Walk Diagnosis');
    lines.push('');
    lines.push('**Commanded:** ' + (s.dir >= 0 ? 'FORWARD' : 'BACKWARD') + ' ' + s.distanceM + ' m @ ' + s.speedMps + ' m/s (agent ' + s.agentId + ')');
    lines.push('**Duration:** ' + report.durationS.toFixed(1) + ' s · **Samples:** ' + report.sampleCount + ' · **Finish reason:** ' + s.finishReason);
    lines.push('**Frame:** MuJoCo — +Z = up, +X = right. Visual-forward = MuJoCo **-Y** (successful forward walk has negative root.vy and POSITIVE dispFwdM). rootDrive/comLead/backwardDrift/forceBudget rows are reported in VISUAL-FORWARD terms. soleGapM and feet.z are direction-independent.');
    lines.push('');
    lines.push('## Verdicts');
    lines.push('');
    for (const c of report.checks) {
      lines.push('### `[' + c.verdict + ']` ' + c.title);
      lines.push('');
      if (c.why) lines.push(c.why);
      if (c.evidence) lines.push('');
      if (c.evidence) lines.push('_Evidence: ' + String(c.evidence).replace(/\|/g, '\\|') + '_');
      if (c.fix) { lines.push(''); lines.push('**Fix:** ' + c.fix); }
      lines.push('');
    }
    lines.push('## Primary causes (confirmed FAIL checks)');
    lines.push('');
    if (report.primaryCauses.length === 0) {
      lines.push('- None confirmed — review the WARN/INFO rows too.');
    } else {
      for (const p of report.primaryCauses) lines.push('- ' + p);
    }
    lines.push('');
    lines.push('## Order of attack (most likely first)');
    lines.push('');
    lines.push('1. **Glue** — if `glue` FAILs, everything else is pose-only; fix `window.synthiaGetContext` and re-paste 02.');
    lines.push('2. **COM lead** — if the COM trails the stance sole, gravity is the backward pull.');
    lines.push('3. **RMBS rail** — a saturated rearward rail pin is a literal backward force (18 kg).');
    lines.push('4. **Balance torque** — a level-holding PD cancels the forward lean.');
    lines.push('5. **Root servo cap** — 0.3 m/s demand caps at 0.15 m/s.');
    lines.push('');
    lines.push('--- generated by 02_walking_and_locomotion.js embedded diagnostics');
    return lines.join('\n');
  }

  function download(name, blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { }
  }

  function exportReport(report, s) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = 'synthia_walk_diagnosis_' + ts;
    const payload = {
      generatedAtISO: new Date().toISOString(),
      frame: 'MuJoCo frame: +Z = up, +X = right. Visual-forward = MuJoCo -Y (successful forward walk = negative root.vy, POSITIVE dispFwdM). rootDrive/comLead/backwardDrift/forceBudget rows are reported in VISUAL-FORWARD terms. All forces N, velocities m/s, positions m, angles rad (tilts deg).',
      command: { dir: s.dir >= 0 ? 'forward' : 'backward', distanceM: s.distanceM, speedMps: s.speedMps, agentId: s.agentId },
      glueProbe: s.glue,
      binderCalls: s.binderCalls,
      rmbsPreEnabledByUrl: s.rmbsPreEnabledByUrl,
      finishReason: s.finishReason,
      analysis: report,
      samples: INSTANCE.samples.slice(),
      rmbsTelemetryRing: safe(() => (window.__SYNTHIA_RMBS_TELEM__ || []).slice(-50), [])
    };
    const json = JSON.stringify(payload, null, 2);
    download(base + '.json', new Blob([json], { type: 'application/json' }));
    download(base + '.md', new Blob([markdownReport(report, s)], { type: 'text/markdown' }));
    console.log('%c[WALK-DIAG] Exported ' + base + '.json + .md', 'color:#0f0;font-weight:bold');
  }

  function printReport(report, s) {
    console.group('%c════════ WALK DIAGNOSIS ════════', 'color:#fa0;font-weight:bold');
    console.log('Commanded: ' + (s.dir >= 0 ? 'FORWARD' : 'BACKWARD') + ' ' + s.distanceM + ' m @ ' + s.speedMps + ' m/s → ' + s.finishReason);
    for (const c of report.checks) {
      const col = c.verdict === 'FAIL' ? '#f55' : c.verdict === 'WARN' ? '#fa0' : '#0f0';
      console.log('%c[' + c.verdict + '] ' + c.title, 'color:' + col + ';font-weight:bold');
      console.log('   ' + String(c.why || '').split('\n')[0]);
    }
    console.log('Primary causes: ' + (report.primaryCauses.length ? report.primaryCauses.join('; ') : 'none — see WARN rows'));
    console.log('Files exported: synthia_walk_diagnosis_<ISO>.json + .md');
    console.groupEnd();
  }

  const api = {
    start,
    sample,
    finish,
    analyze,
    interval: 100,
    isActive: () => !!INSTANCE.state,
    getSamples: () => INSTANCE.samples.slice()
  };
  window.synthiaWalkDiag = api;
  window.synthiaRunWalkDiagnosis = (d = 2, s = 0.12, a = 'agent_0') => {
    console.log('%c[WALK-DIAG] One-shot diagnosis -> synthiaWalk(' + d + ', ' + s + ', ' + a + ') — report exports on stop.', 'color:#fa0;font-weight:bold');
    window.synthiaWalk(d, s, a);
  };
  window.synthiaRunWalkDiagnosisRaw = (d = 2, s = 0.12, a = 'agent_0') => {
    console.log('%c[WALK-DIAG] One-shot RAW diagnosis -> synthiaWalkRaw(' + d + ', ' + s + ', ' + a + ') — pose-only, replicates the stable no-glue walk. Report exports on stop.', 'color:#fa0;font-weight:bold');
    window.synthiaWalkRaw(d, s, a);
  };
  console.log('%c[WALK-DIAG] Embedded diagnostics armed: every walk auto-exports synthia_walk_diagnosis_<ISO>.json/.md', 'color:#fa0;font-weight:bold');
  return api;
})();

/* ---------------- GAIT PARAMS (direction-aware) --------------------- */
function gaitParams(v, dir) {
  const isFwd = dir >= 0;
  const SWEEP = cl(1.15 * v, 0.08, 0.55);  // slip-consistent stride envelope
  return {
    isFwd,
    /* FORWARD: balanced reach / strong push-off.
       BACKWARD (plays as VISUAL-FORWARD after the -dir mesh re-map):
       symmetric reach — the swing leg must throw the thigh up, not shuffle. */
    FLX: (isFwd ? 0.55 : 0.50) * SWEEP,
    EXT: (isFwd ? 0.45 : 0.50) * SWEEP,
    /* Swing knee lift — cap lowered (1.10→0.85) after diagnostics: the
       actuators only delivered ≈0.31 rad on a 0.85-rad command, so commanding
       above the capability just wastes the swing-foothold phase. */
    KSW: cl(0.55 + 1.0 * v, 0.50, 0.85),
    /* Stance knee flexion during push-off. WAS 0.02 (near-locked): a straight
       stance leg pivots the pelvis up-and-BACK around the ankle — the measured
       monotonically growing backward pitch (1.8°→60°) across all 3 runs.
       0.10 lets the pelvis ride up-and-forward over the sole instead. */
    KST: 0.10,
    ROLL: 0.03,
    /* FORWARD: cooperative forward lean. BACKWARD: slight rear lean so
       the COM sits over the planting (rear) foot. */
    LEAN: isFwd ? cl(0.90 * v, 0.05, 0.22) : -cl(0.10 * v, 0.01, 0.04),
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
      : kp(p, [[0,-0.08],[0.35,0.16],[0.60,0.26],[0.85,0.10],[1,0.02]]);
      // TOE CLEARANCE: dorsiflex peaks ~0.26 rad at mid-swing apex (foot toes
      // up while airborne), returning FLAT (≈0) at touchdown for full-sole grab.
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
function startLocomotion(distanceM, speedMps, dir, agentId, mode) {
  /* mode='glued'   : full glue (RMBS + balance + gait flag + root servo) [default]
     mode='raw'     : POSE-ONLY — replicates the no-glue state exactly (walks
                      backwards fine per observation). No binder calls at all.
     mode='noservo' : glue (RMBS + balance + gait flag) but NO root-velocity
                      servo — isolates the servo's contribution. */
  mode = mode || 'glued';
  const glued = mode !== 'raw';
  const withServo = mode === 'glued';
  const ctx = getContext(agentId);
  if (!ctx && glued) console.warn('[WALK] getContext() null — paste your build\'s getContext() into this file.');
  const binder = glued ? (ctx ? ctx.binder : null) : null, pe = glued ? (ctx ? ctx.pe : null) : null;
  if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }
  if (walkInterval) clearInterval(walkInterval);
  if (velocityInterval) clearInterval(velocityInterval);
  if (telemetryInterval) clearInterval(telemetryInterval);
  if (stopWalkTimeout) clearTimeout(stopWalkTimeout);

  console.log('%c[WALK] Starting Mocap-C1 v4 (' + (dir >= 0 ? 'FORWARD' : 'BACKWARD') + ') [mode=' + mode + ']', 'color:#0ff;font-weight:bold');
  console.log('- Target: ' + distanceM + ' m @ ' + speedMps + ' m/s');
  if (glued && binder) {
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
  /* MESH-FORWARD CONVENTION (rig-verified): the 3D mesh faces -Y, so a
     VISUAL-forward walk requires MuJoCo -Y. setTargetRootVelocity takes
     Three.js X/Z: +Z → MuJoCo -Y, hence +speedMps. The gait must also push
     -Y, so buildSequence receives -dir (its '+' dir spatially pushes +Y).
     Root and gait now cooperate; before this re-map they fought (measured
     qfrc_constraint +Y ≈ -264..-299 N — the original "tug"). */
  /* MESH-FORWARD CONVENTION (qwen-verified): bone-space hip.x+ flexes the
     leg toward the mesh facing (= MuJoCo -Y). buildSequence(dir) plus the
     +Z root servo is the direction chain that walked forward cleanly in
     walking_script_by_qwen.js; keep both in the SAME sign (dir), not -dir. */
  const vz = dir >= 0 ? +speedMps : -speedMps;
  const nominalMs = (distanceM / speedMps) * 1000;

  /* ── SELF-DIAGNOSTICS: begin evidence capture for this run ──────── */
  walkDiag.start({ agentId, dir, speedMps, distanceM, binder, pe, capId, startPos, ctx, seqDir: dir, cycleMs, mode });

  let env = 0;
  const dispatchCycle = () => {
    env = Math.min(1, env + 0.5);                  // ramp-in over 2 cycles
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { agentId, activeGaitPhase: true, sequence: buildSequence(dir, env, speedMps) }
    }));
  };
  dispatchCycle();
  walkInterval = setInterval(dispatchCycle, cycleMs);
  if (glued && withServo && binder && typeof binder.setTargetRootVelocity === 'function') {
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
    /* Measures -Y motion as positive distance (visual forward). */
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
  walkDiagInterval = setInterval(() => walkDiag.sample(), walkDiag.interval);
  stopWalkTimeout = setTimeout(() => window.synthiaStopWalk(agentId),
    Math.max(15000, nominalMs + 5000));
}

window.synthiaStopWalk = function (agentId) {
  if (walkInterval) { clearInterval(walkInterval); walkInterval = null; }
  if (velocityInterval) { clearInterval(velocityInterval); velocityInterval = null; }
  if (telemetryInterval) { clearInterval(telemetryInterval); telemetryInterval = null; }
  if (stopWalkTimeout) { clearTimeout(stopWalkTimeout); stopWalkTimeout = null; }
  if (stopGraceTimeout) { clearTimeout(stopGraceTimeout); stopGraceTimeout = null; }
  if (walkDiagInterval) { clearInterval(walkDiagInterval); walkDiagInterval = null; }
  walkDiag.finish();
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

window.synthiaWalk = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, 1, a, 'glued');
window.synthiaWalkBackward = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, -1, a, 'glued');
window.synthiaWalkRaw = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, 1, a, 'raw');
window.synthiaWalkNoServo = (d = 2.0, s = 0.12, a = 'agent_0') => startLocomotion(d, s, 1, a, 'noservo');
console.log('[Synthia] Mocap-C1 Gait Engine Ready (v4: spine-hip cooperation fwd, full-sole grab bwd).');
console.log('%c[Synthia] Diagnostics armed → synthiaRunWalkDiagnosis(2, 0.12) or just synthiaWalk() — exports a detailed report on stop.', 'color:#fa0');
})();
