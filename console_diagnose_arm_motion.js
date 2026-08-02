// ═══════════════════════════════════════════════════════════════════
// Synthia — Arm Motion Ghost Diagnosis (browser console script)
//
// Symptom under test:
//   - All pre-existing agents (original + previously spawned) show ARM
//     MOVEMENT with no visible cause.
//   - A freshly spawned agent appears with arms by side (correct).
//
// This script does NOT change anything. It:
//   1. Snapshots every binder's arm state (motor targets, MuJoCo ctrl,
//      joint qpos, visual arm raise angle).
//   2. Hooks `synthia:action` and records whether any agent's arm bones
//      were actually commanded by the LLM/AgentLoop.
//   3. Samples the visual arm angle + arm-pitch ctrl/qpos per agent over
//      a window, then correlates the first motion onset of each arm with
//      (a) an arm command in a `synthia:action` event,
//      (b) a stale animation timeline (timelineQueue),
//      (c) the motor ctrl ramp,
//      (d) a world reload caused by a spawn.
//   4. Prints a per-agent verdict: LLM_COMMAND / STALE_TIMELINE /
//      CTRL_RAMP / SPAWN_WORLD_RELOAD_RACE / UNEXPLAINED_GHOST.
//
// USAGE (paste into the browser console while the world is running):
//   synthiaArmDiag.snapshot()        — one-time state dump for all agents
//   synthiaArmDiag.scan()            — static check for every known ghost source
//   synthiaArmDiag.observe(6)        — watch for 6s, then auto-print verdicts
//   synthiaArmDiag.observe(6, true)  — also download the raw samples as JSON
//   synthiaArmDiag.report()          — re-print the last observation verdicts
//   synthiaArmDiag.reset()           — clear listeners + buffers
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Globals the app exposes (see useWorld.ts) ─────────────────────
  function binders() {
    return (window.__SYNTHIA_HUMANOID_BINDERS__) || null;
  }
  function physics() {
    return (window.__SYNTHIA_PHYSICS_ENGINE__) || null;
  }
  function module() {
    return (window.__SYNTHIA_MUJOCO_MODULE__) || PhysicsEngineModuleFallback();
  }
  function PhysicsEngineModuleFallback() {
    const pe = physics();
    if (pe && pe.constructor && pe.constructor.getModule) return pe.constructor.getModule();
    return null;
  }

  // ── Arm-relevant canonical bones ──────────────────────────────────
  const ARM_BONES = [
    'mixamorigleftshoulder', 'mixamorigrightshoulder',
    'mixamorigleftarm', 'mixamorigrightarm',
    'mixamorigleftforearm', 'mixamorigrightforearm',
    'mixamoriglefthand', 'mixamorigrighthand',
  ];
  const UPPER_ARM = { left: 'mixamorigleftarm', right: 'mixamorigrightarm' };
  const SHOULDER = { left: 'mixamorigleftshoulder', right: 'mixamorigrightshoulder' };
  const AXIS_SUFFIXES = ['yaw', 'pitch', 'roll'];

  const DEG = 180 / Math.PI;
  const MOTION_EPS_DEG = 3;      // arm raise change that counts as "moved"
  const ACTION_LOOKBACK_MS = 300; // event window before onset that counts as a cause
  const ACTION_LOOKAHEAD_MS = 80;

  // ── Ring buffer of all synthia:action events ever seen ───────────
  const actionRing = [];
  const ACTION_RING_MAX = 400;

  function recordAction(detail) {
    const rec = {
      t: performance.now(),
      agentId: detail.agentId || 'agent_0',
      jointOverrideKeys: Object.keys(detail.jointOverrides || {}).length,
      armKeys: armKeysOf(detail.jointOverrides || {}),
      hasSequence: Array.isArray(detail.sequence) && detail.sequence.length > 0,
      seqLen: Array.isArray(detail.sequence) ? detail.sequence.length : 0,
      programs: Array.isArray(detail.programSequence) ? detail.programSequence.slice() : [],
      gait: !!detail.activeGaitPhase,
    };
    actionRing.push(rec);
    if (actionRing.length > ACTION_RING_MAX) actionRing.shift();
    return rec;
  }

  function armKeysOf(overrides) {
    if (!overrides) return [];
    return Object.keys(overrides).filter((k) => {
      const n = String(k).toLowerCase().replace(/:/g, '');
      return ARM_BONES.some((b) => n.includes(b));
    });
  }

  // Inject the listener once at script load so events BEFORE observe()
  // starts are still captured — the back-look is what proves "no cause".
  if (!window.__synthiaArmDiagHookInstalled) {
    window.addEventListener('synthia:action', (e) => {
      recordAction(e.detail || {});
    });
    Object.defineProperty(window, '__synthiaArmDiagHookInstalled', { value: true, configurable: false, enumerable: false });
  }

  // ── Low-level MuJoCo readers ──────────────────────────────────────
  function world() {
    const pe = physics();
    if (!pe || !pe.getWorld) return null;
    try { return pe.getWorld(); } catch (e) { return null; }
  }

  function jointId(mdl, mj, name) {
    return mj.mj_name2id(mdl, mj.mjtObj.mjOBJ_JOINT.value, name);
  }
  function actuatorId(mdl, mj, name) {
    return mj.mj_name2id(mdl, mj.mjtObj.mjOBJ_ACTUATOR.value, name);
  }

  function readJointQpos(mdl, data, mj, name) {
    const id = jointId(mdl, mj, name);
    if (id < 0) return null;
    return { id, qpos: data.qpos[mdl.jnt_qposadr[id]], qvel: data.qvel[mdl.jnt_dofadr[id]] };
  }
  function readCtrl(mdl, data, mj, name) {
    const id = actuatorId(mdl, mj, name);
    if (id < 0) return null;
    return { id, ctrl: data.ctrl[id] };
  }

  // ── Visual arm raise angle (0° = by side, ~90° = T-pose flat) ────
  function armRaiseAngle(binder, side) {
    try {
      const armInfo = binder.getBoneInfoMap().get(UPPER_ARM[side]);
      const shInfo = binder.getBoneInfoMap().get(SHOULDER[side]);
      if (!armInfo || !shInfo) return null;

      const armPos = new window.THREE.Vector3();
      const shoulderPos = new window.THREE.Vector3();
      const hipsPos = new window.THREE.Vector3();
      const neckPos = new window.THREE.Vector3();

      armInfo.bone.getWorldPosition(armPos);
      shInfo.bone.getWorldPosition(shoulderPos);
      const hips = binder.getBoneInfoMap().get('mixamorighips');
      const neck = binder.getBoneInfoMap().get('mixamorigneck');
      if (!hips || !neck) return null;
      hips.bone.getWorldPosition(hipsPos);
      neck.bone.getWorldPosition(neckPos);

      const armDir = armPos.sub(shoulderPos);
      const up = neckPos.sub(hipsPos);
      if (armDir.lengthSq() < 1e-9 || up.lengthSq() < 1e-9) return null;
      armDir.normalize();
      up.normalize();

      const angleToUp = Math.acos(Math.max(-1, Math.min(1, armDir.dot(up)))) * DEG;
      // 180° = arm straight down (by side) → raise 0°. 90° = T-pose → raise ~90°.
      return 180 - angleToUp;
    } catch (e) {
      return null;
    }
  }

  // ── Per-binder arm snapshot ───────────────────────────────────────
  function snapshotBinder(agentId, binder) {
    const mj = module();
    const w = world();
    const mdl = w && w.model;
    const data = w && w.data;
    const prefix = binder.prefix || agentId + '_';

    const arm = {};
    for (const side of ['left', 'right']) {
      const bone = UPPER_ARM[side];
      const joint = {};
      for (const ax of AXIS_SUFFIXES) {
        const jName = prefix + bone + '_' + ax;
        const aName = 'act_' + jName;
        if (mdl && mj) {
          const j = readJointQpos(mdl, data, mj, jName);
          const c = readCtrl(mdl, data, mj, aName);
          joint[ax] = {
            qpos: j ? j.qpos : null,
            qvel: j ? j.qvel : null,
            ctrl: c ? c.ctrl : null,
          };
        } else {
          joint[ax] = { qpos: null, qvel: null, ctrl: null };
        }
      }
      arm[side] = {
        raiseDeg: armRaiseAngle(binder, side),
        joint,
      };
    }

    // currentTargets for all arm bones
    const targets = {};
    for (const bone of ARM_BONES) {
      if (binder.currentTargets && binder.currentTargets.has(bone)) {
        targets[bone] = binder.currentTargets.get(bone);
      }
    }

    const mc = binder.motorController;
    const worldState = {
      buildStep: binder.getBuildStep(),
      mbActive: binder.mbActive,
      gaitActive: binder.gaitActive,
      targetSpawnGrounded: binder.targetSpawnGrounded,
      timelineQueueLen: Array.isArray(binder.timelineQueue) ? binder.timelineQueue.length : 0,
      ctrlRampStep: mc ? mc.simulationStepCount : null,
      limpMode: mc ? mc.limpModeActive : null,
      restArmAngleDeg: binder.restArmAngleDeg,
      capsuleValid: !!(binder.getCapsuleBody && binder.getCapsuleBody() && binder.getCapsuleBody().isValid()),
    };

    return { agentId, arm, targets, worldState };
  }

  function allBinderIds() {
    const map = binders();
    if (!map || !map.keys) return [];
    return Array.from(map.keys());
  }

  function snapshotAll() {
    const map = binders();
    if (!map) return null;
    const out = [];
    for (const id of allBinderIds()) {
      const b = map.get(id);
      if (!b) continue;
      out.push(snapshotBinder(id, b));
    }
    return out;
  }

  // ── Static scan for known ghost sources ───────────────────────────
  function scan() {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Arm Motion — STATIC GHOST-SOURCE SCAN                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const map = binders();
    if (!map || map.size === 0) {
      console.log('[ARM-DIAG] No binders found. Is the world initialized? (window.__SYNTHIA_HUMANOID_BINDERS__)');
      return;
    }

    const pe = physics();
    if (pe) {
      console.log('[ARM-DIAG] Physics: isReady=' + pe.isReady + ' isStepping=' + pe.isStepping +
        ' isMutating=' + pe.isMutating + ' stepCount=' + (pe.getStepCount ? pe.getStepCount() : '?') +
        ' lastXmlLen=' + (pe.getLastLoadedXml ? (pe.getLastLoadedXml() || '').length : '?'));
    }

    for (const id of allBinderIds()) {
      const b = map.get(id);
      if (!b) continue;
      const s = snapshotBinder(id, b);
      const flags = [];
      const mc = b.motorController;

      if (s.worldState.timelineQueueLen > 0) {
        flags.push('STALE_TIMELINE: timelineQueue has ' + s.worldState.timelineQueueLen + ' frame(s) — an old animation may still be playing');
      }
      if (typeof s.worldState.ctrlRampStep === 'number' && s.worldState.ctrlRampStep < 20) {
        flags.push('CTRL_RAMP: motor ramp at ' + s.worldState.ctrlRampStep + '/20 — ctrl scaled down, arms may be mid-swing from bind pose');
      }
      if (s.worldState.limpMode) {
        flags.push('LIMP_MODE: ragdoll active (gains zeroed)');
      }
      if (s.worldState.gaitActive) {
        flags.push('GAIT_ACTIVE: locomotion timeline running');
      }
      if (s.worldState.targetSpawnGrounded === false) {
        flags.push('SPAWN_ALIGNMENT_PENDING: spawn-grounding pass armed on this binder');
      }
      if (!s.worldState.capsuleValid) {
        flags.push('CAPSULE_INVALID: binder pinned to a missing/stale capsule id — physics writes are no-ops');
      }

      // Deviations from the arms-down rest command (75° pitch on upper arm)
      for (const side of ['left', 'right']) {
        const bone = UPPER_ARM[side];
        const t = s.targets[bone];
        if (t) {
          const x = typeof t.x === 'number' ? t.x : (typeof t.scalar === 'number' ? t.scalar : NaN);
          const rest = s.worldState.restArmAngleDeg * DEG * Math.PI / 180; // deg → rad
          if (isFinite(x) && Math.abs(x - rest) > 0.1) {
            flags.push('ARM_TARGET_OFF_REST: ' + bone + ' target x=' + x.toFixed(3) + ' rad (rest=' + rest.toFixed(3) + ' rad / ' + s.worldState.restArmAngleDeg + '°)');
          }
        }
      }

      console.log('── agent ' + id + ' ──');
      console.log('  raiseDeg  : left=' + fmt(s.arm.left.raiseDeg) + '°  right=' + fmt(s.arm.right.raiseDeg) + '°');
      console.log('  world     : ' + JSON.stringify(s.worldState));
      if (flags.length === 0) {
        console.log('  verdict   : CLEAN (no static ghost source detected)');
      } else {
        flags.forEach((f) => console.log('  FLAG      : ' + f));
      }
    }

    // Recent action history (proves whether LLM was commanding arms)
    console.log('── recent synthia:action events (last ' + actionRing.length + ' buffered) ──');
    const recent = actionRing.slice(-12);
    if (recent.length === 0) {
      console.log('  (none buffered — events only recorded after this script was pasted)');
    }
    recent.forEach((r) => {
      console.log('  +' + (r.t - (actionRing[0] ? actionRing[0].t : r.t)).toFixed(0) + 'ms agent=' + r.agentId +
        ' keys=' + r.jointOverrideKeys + ' armKeys=[' + r.armKeys.join(', ') + ']' +
        ' seq=' + r.seqLen + ' gait=' + r.gait);
    });
  }

  // ── Observation / correlation ─────────────────────────────────────
  const obs = {
    running: false,
    timer: null,
    samples: [],
    startT: 0,
    agentCountAtStart: 0,
    spawnEvents: [], // {t, size}
    lastActionByAgent: {},
  };

  function armSampleRow() {
    const map = binders();
    if (!map) return null;
    const row = { t: performance.now(), agents: {} };
    for (const id of allBinderIds()) {
      const b = map.get(id);
      if (!b) continue;
      const s = snapshotBinder(id, b);
      row.agents[id] = {
        l: s.arm.left.raiseDeg,
        r: s.arm.right.raiseDeg,
        qL: s.arm.left.joint.pitch ? s.arm.left.joint.pitch.qpos : null,
        qR: s.arm.right.joint.pitch ? s.arm.right.joint.pitch.qpos : null,
        cL: s.arm.left.joint.pitch ? s.arm.left.joint.pitch.ctrl : null,
        cR: s.arm.right.joint.pitch ? s.arm.right.joint.pitch.ctrl : null,
        tlq: s.worldState.timelineQueueLen,
        ramp: s.worldState.ctrlRampStep,
      };
    }
    return row;
  }

  function fmt(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    return Number(v).toFixed(d === undefined ? 2 : d);
  }
  function fmtVal(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    return Number(v).toFixed(d === undefined ? 2 : d);
  }

  function classifyOnset(agentId, side, oi, rows) {
    const row = rows[oi];
    if (!row) return 'NO_DATA';
    const a = row.agents[agentId];
    if (!a) return 'NO_DATA';
    const raise = side === 'left' ? a.l : a.r;
    if (raise === null || !isFinite(raise)) return 'NO_DATA';

    const tOnset = row.t;

    // (a) LLM command — an action event with this agent's arm bone keys
    //     within [onset - LOOKBACK, onset + LOOKAHEAD]
    let cmd = null;
    for (const ev of actionRing) {
      if (ev.agentId !== agentId) continue;
      const dt = ev.t - tOnset;
      if (dt >= -ACTION_LOOKBACK_MS && dt <= ACTION_LOOKAHEAD_MS && ev.armKeys.length > 0) {
        cmd = ev;
        break;
      }
    }
    if (cmd) return 'LLM_COMMAND(armKeys=[' + cmd.armKeys.join(',') + '])';

    // (b) stale timeline on this agent at onset
    if (a.tlq > 0) return 'STALE_TIMELINE(tlq=' + a.tlq + ')';

    // (c) ctrl ramp still active at onset
    if (typeof a.ramp === 'number' && a.ramp < 20) return 'CTRL_RAMP(ramp=' + a.ramp + '/20)';

    // (d) a spawn (world reload) happened shortly before onset
    for (const sp of obs.spawnEvents) {
      if (tOnset - sp.t >= -50 && tOnset - sp.t < 1500) {
        return 'SPAWN_WORLD_RELOAD_RACE(agentCount ' + sp.before + '→' + sp.after + ')';
      }
    }

    return 'UNEXPLAINED_GHOST';
  }

  function report(lastOnly) {
    if (obs.samples.length === 0) {
      console.log('[ARM-DIAG] No observation data yet. Run synthiaArmDiag.observe(seconds).');
      return;
    }
    const rows = obs.samples;
    const agentIds = Object.keys(rows[0].agents || {});
    const agentsSeen = {};
    for (const row of rows) {
      for (const id of Object.keys(row.agents || {})) agentsSeen[id] = true;
    }
    const allIds = Object.keys(agentsSeen);

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Arm Motion — OBSERVATION VERDICTS  (' + rows.length + ' samples)            │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('[ARM-DIAG] Motion threshold: ' + MOTION_EPS_DEG + '° raise change. Cause lookback: ' + ACTION_LOOKBACK_MS + 'ms.');

    if (obs.spawnEvents.length > 0) {
      console.log('[ARM-DIAG] SPAWNS DURING WINDOW:');
      obs.spawnEvents.forEach((sp) => console.log('  +' + (sp.t - obs.startT).toFixed(0) + 'ms  agent count ' + sp.before + ' → ' + sp.after));
    }

    const rowsFor = (id) => rows.map((r, i) => ({ i, t: r.t, a: r.agents[id] })).filter((x) => x.a);

    for (const id of allIds) {
      const fr = rowsFor(id);
      if (fr.length === 0) continue;
      const first = fr[0].a;
      const last = fr[fr.length - 1].a;
      const dL = (first.l !== null && last.l !== null) ? last.l - first.l : null;
      const dR = (first.r !== null && last.r !== null) ? last.r - first.r : null;

      // onset index per side
      function onsetIndex(sideKey) {
        const base = first[sideKey];
        if (base === null || !isFinite(base)) return -1;
        for (let k = 0; k < fr.length; k++) {
          const v = fr[k].a[sideKey];
          if (v !== null && isFinite(v) && Math.abs(v - base) > MOTION_EPS_DEG) return k;
        }
        return -1;
      }
      const oiL = onsetIndex('l');
      const oiR = onsetIndex('r');
      const vL = oiL >= 0 ? classifyOnset(id, 'left', fr[oiL].i, rows) : 'NO_MOTION';
      const vR = oiR >= 0 ? classifyOnset(id, 'right', fr[oiR].i, rows) : 'NO_MOTION';

      console.log('── agent ' + id + ' ──');
      console.log('  left : raise ' + fmtVal(first.l, 1) + '°→' + fmtVal(last.l, 1) + '°  Δ' + fmtVal(dL, 1) + '°  → ' + vL);
      console.log('  right: raise ' + fmtVal(first.r, 1) + '°→' + fmtVal(last.r, 1) + '°  Δ' + fmtVal(dR, 1) + '°  → ' + vR);
    }

    // Cross-agent simultaneous motion check (hallmark of world reload / shared-state write)
    const simultaneous = [];
    for (let i = 0; i < rows.length; i++) {
      const moved = [];
      for (const id of allIds) {
        const a = rows[i].agents[id];
        if (!a) continue;
        for (const s of ['l', 'r']) {
          if (a[s] !== null && isFinite(a[s]) && a[s] > MOTION_EPS_DEG) moved.push(id + '/' + s + '=' + fmtVal(a[s], 1) + '°');
        }
      }
      if (moved.length >= 2) simultaneous.push({ i, t: rows[i].t, moved });
    }
    if (simultaneous.length > 0) {
      const s = simultaneous[0];
      console.log('[ARM-DIAG] NOTE: ' + simultaneous.length + ' sample(s) had 2+ arms > ' + MOTION_EPS_DEG +
        '° raised simultaneously (first at +' + (s.t - obs.startT).toFixed(0) + 'ms: ' + s.moved.join(', ') + ')' +
        ' — consistent with a world-reload/shared-slice artifact, not independent LLM commands.');
    }

    console.log('[ARM-DIAG] Next: synthiaArmDiag.observe(6) to re-run, or synthiaArmDiag.snapshot() for a live dump.');
  }

  function observe(seconds, download) {
    reset(false);
    const durMs = (seconds || 6) * 1000;
    obs.startT = performance.now();
    obs.agentCountAtStart = allBinderIds().length;
    console.log('[ARM-DIAG] Observing for ' + (seconds || 6) + 's… (agents at start: ' + obs.agentCountAtStart + ')');
    console.log('[ARM-DIAG] Watch for arm movement — any agent motion without an LLM arm command is the ghost.');

    // spawn detector: re-check binder count each sample tick
    const sampleTick = () => {
      const before = allBinderIds().length;
      const row = armSampleRow();
      if (row) obs.samples.push(row);
      const after = allBinderIds().length;
      if (after > before) {
        obs.spawnEvents.push({ t: performance.now(), before, after });
        console.log('[ARM-DIAG] SPAWN DETECTED at +' + (performance.now() - obs.startT).toFixed(0) + 'ms (agents ' + before + '→' + after + ')');
      }
    };

    obs.timer = setInterval(sampleTick, 25);
    obs.running = true;

    setTimeout(() => {
      clearInterval(obs.timer);
      obs.timer = null;
      obs.running = false;
      console.log('[ARM-DIAG] Observation complete (' + obs.samples.length + ' samples).');
      report(true);
      if (download) {
        // Attach the action history so the JSON is self-contained.
        const payload = {
          capturedAt: new Date().toISOString(),
          thresholds: { motionEpsDeg: MOTION_EPS_DEG, lookbackMs: ACTION_LOOKBACK_MS },
          spawnEvents: obs.spawnEvents,
          samples: obs.samples,
          actions: actionRing,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arm_motion_diag_' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        console.log('[ARM-DIAG] JSON downloaded.');
      }
    }, durMs);
  }

  function snapshot() {
    const all = snapshotAll();
    if (!all) {
      console.log('[ARM-DIAG] No binders found. World not ready?');
      return;
    }
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Arm Motion — LIVE SNAPSHOT (' + all.length + ' agents)                │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    for (const s of all) {
      console.log('── agent ' + s.agentId + ' ──');
      console.log('  raise   : left=' + fmtVal(s.arm.left.raiseDeg, 1) + '°  right=' + fmtVal(s.arm.right.raiseDeg, 1) + '°');
      console.log('  arm pitch (qpos / ctrl):');
      for (const side of ['left', 'right']) {
        const j = s.arm[side].joint.pitch || {};
        console.log('    ' + side.padEnd(5) + ' qpos=' + fmtVal(j.qpos, 4) + ' rad  ctrl=' + fmtVal(j.ctrl, 4) +
          ' rad  (rest ctrl ≈ ' + (s.worldState.restArmAngleDeg * Math.PI / 180).toFixed(4) + ')');
      }
      console.log('  targets : ' + JSON.stringify(s.targets, (k, v) => typeof v === 'number' ? Number(v.toFixed(4)) : v));
      console.log('  world   : ' + JSON.stringify(s.worldState));
    }
  }

  function reset(alsoHook) {
    if (obs.timer) {
      clearInterval(obs.timer);
      obs.timer = null;
    }
    obs.running = false;
    obs.samples = [];
    obs.spawnEvents = [];
    obs.startT = 0;
    obs.agentCountAtStart = 0;
    obs.lastActionByAgent = {};
    if (alsoHook) actionRing.length = 0;
    console.log('[ARM-DIAG] Reset. Buffers cleared' + (alsoHook ? ' (action history cleared)' : '') + '.');
  }

  // ── Public API ────────────────────────────────────────────────────
  window.synthiaArmDiag = {
    snapshot,
    scan,
    observe,
    report: () => report(true),
    reset: () => reset(true),
    _actionRing: actionRing,
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Synthia Arm-Motion Ghost Diagnostic loaded');
  console.log('  ' + allBinderIds().length + ' agent(s) currently bound (' + (binders() ? 'binders OK' : 'binders MISSING — world not ready?') + ')');
  console.log('');
  console.log('  synthiaArmDiag.scan()           — static ghost-source check');
  console.log('  synthiaArmDiag.snapshot()       — live state dump per agent');
  console.log('  synthiaArmDiag.observe(6)       — watch 6s & auto-verdict');
  console.log('  synthiaArmDiag.observe(6, true) — same + download JSON');
  console.log('  synthiaArmDiag.report()         — reprint last verdicts');
  console.log('  synthiaArmDiag.reset()          — clear listeners/buffers');
  console.log('═══════════════════════════════════════════════════════════');
})();
