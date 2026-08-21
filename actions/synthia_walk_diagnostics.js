/**
 * ════════════════════════════════════════════════════════════════════
 * synthia_walk_diagnostics.js — Precision Locomotion Diagnostics (v4)
 * ════════════════════════════════════════════════════════════════════
 */

window.synthiaDiag = (function () {
  'use strict';

  let intervalId = null;
  let sampleRateMs = 100;
  const recordedFrames = [];
  const touchdownEvents = [];
  let metaInfo = {};
  let startTime = null;
  let startRootPos = null;
  let activeWalkType = 'forward';

  let prevLeftZ = null;
  let prevRightZ = null;
  const TOUCHDOWN_Z_THRESHOLD = 0.095;

  const RELEVANT_JOINTS = new Set([
    'root_freejoint', 'freejoint',
    'mixamorigleftupleg', 'mixamorigrightupleg',
    'mixamorigleftleg', 'mixamorigrightleg',
    'mixamorigleftfoot', 'mixamorigrightfoot',
    'mixamoriglefttoebase', 'mixamorigrighttoebase',
    'mixamorigspine', 'mixamorigspine1', 'mixamorigspine2',
    'mixamorigleftarm', 'mixamorigrightarm',
    'rm_slide_fa', 'rm_slide_lr'
  ]);

  function getPE() { return window.__SYNTHIA_PHYSICS_ENGINE__ || null; }
  function getWorld() { const pe = getPE(); return pe && pe.getWorld ? pe.getWorld() : null; }
  function getMuJoCo() {
    if (window.__SYNTHIA_MUJOCO_MODULE__) return window.__SYNTHIA_MUJOCO_MODULE__;
    if (window.PhysicsEngine && typeof window.PhysicsEngine.getModule === 'function') {
      return window.PhysicsEngine.getModule();
    }
    return window.__MUJOCO_MODULE__ || window._mujocoModule || null;
  }

  function buildModelCatalog(model, mj) {
    const catalog = { joints: [], bodies: [], actuators: [], rmActuators: {} };
    if (!model || !mj) return catalog;

    for (let j = 0; j < model.njnt; j++) {
      const rawName = mj.mj_id2name(model, mj.mjtObj.mjOBJ_JOINT.value, j) || `joint_${j}`;
      const cleanName = rawName.replace(/^agent_\d+_/, '');
      const type = model.jnt_type[j];
      const qposadr = model.jnt_qposadr[j];
      const dofadr = model.jnt_dofadr[j];
      const qposCount = type === 0 ? 7 : (type === 1 ? 4 : 1);
      const dofCount = type === 0 ? 6 : (type === 1 ? 3 : 1);

      const isMatch = type === 0 || Array.from(RELEVANT_JOINTS).some(rj => cleanName.startsWith(rj) || cleanName === rj);
      if (isMatch) {
        catalog.joints.push({ id: j, name: cleanName, type, qposadr, dofadr, qposCount, dofCount });
      }
    }

    for (let b = 0; b < model.nbody; b++) {
      const rawName = mj.mj_id2name(model, mj.mjtObj.mjOBJ_BODY.value, b) || `body_${b}`;
      const cleanName = rawName.replace(/^agent_\d+_/, '');
      const mass = model.body_mass[b];
      const isMatch = Array.from(RELEVANT_JOINTS).some(rj => cleanName.startsWith(rj) || cleanName.includes('foot') || cleanName.includes('capsule') || cleanName.includes('hips'));
      if (isMatch) {
        catalog.bodies.push({ id: b, name: cleanName, mass });
      }
    }

    for (let a = 0; a < model.nu; a++) {
      const rawName = mj.mj_id2name(model, mj.mjtObj.mjOBJ_ACTUATOR.value, a) || `actuator_${a}`;
      const cleanName = rawName.replace(/^agent_\d+_/, '');
      const isMatch = Array.from(RELEVANT_JOINTS).some(rj => cleanName.includes(rj));
      if (isMatch) {
        catalog.actuators.push({ id: a, name: cleanName });
        if (cleanName.includes('rm_slide_fa')) catalog.rmActuators.fa = a;
        if (cleanName.includes('rm_slide_lr')) catalog.rmActuators.lr = a;
      }
    }

    return catalog;
  }

  function checkTouchdowns(data, catalog, comMjY, t) {
    const lFootBody = catalog.bodies.find(b => b.name === 'mixamorigleftfoot');
    const rFootBody = catalog.bodies.find(b => b.name === 'mixamorigrightfoot');

    if (lFootBody) {
      const lZ = data.xpos[lFootBody.id * 3 + 2];
      const lY = data.xpos[lFootBody.id * 3 + 1];
      const lSoleCenter = lY - 0.060;
      if (prevLeftZ !== null && prevLeftZ > TOUCHDOWN_Z_THRESHOLD && lZ <= TOUCHDOWN_Z_THRESHOLD) {
        const footAheadOfCom = comMjY - lSoleCenter;
        touchdownEvents.push({
          t: Math.round(t * 100) / 100,
          foot: 'left',
          footAheadOfComM: Math.round(footAheadOfCom * 1e4) / 1e4
        });
      }
      prevLeftZ = lZ;
    }

    if (rFootBody) {
      const rZ = data.xpos[rFootBody.id * 3 + 2];
      const rY = data.xpos[rFootBody.id * 3 + 1];
      const rSoleCenter = rY - 0.060;
      if (prevRightZ !== null && prevRightZ > TOUCHDOWN_Z_THRESHOLD && rZ <= TOUCHDOWN_Z_THRESHOLD) {
        const footAheadOfCom = comMjY - rSoleCenter;
        touchdownEvents.push({
          t: Math.round(t * 100) / 100,
          foot: 'right',
          footAheadOfComM: Math.round(footAheadOfCom * 1e4) / 1e4
        });
      }
      prevRightZ = rZ;
    }
  }

  function captureFrame(catalog) {
    const world = getWorld();
    const mj = getMuJoCo();
    if (!world || !mj || !world.model || !world.data) return null;

    const model = world.model;
    const data = world.data;
    const t = (performance.now() - (startTime || performance.now())) / 1000;

    const jointsData = {};
    for (const j of catalog.joints) {
      const qpos = [];
      for (let i = 0; i < j.qposCount; i++) qpos.push(Math.round(data.qpos[j.qposadr + i] * 1e4) / 1e4);
      const qvel = [];
      for (let i = 0; i < j.dofCount; i++) qvel.push(Math.round(data.qvel[j.dofadr + i] * 1e4) / 1e4);

      let pitchDeg = null;
      if (j.name.includes('pitch') || j.type === 3) {
        pitchDeg = Math.round((qpos[0] * 180 / Math.PI) * 100) / 100;
      }

      jointsData[j.name] = { pitchDeg: pitchDeg !== null ? pitchDeg : undefined, qpos, qvel };
    }

    const rmCtrl = {
      fa: catalog.rmActuators.fa !== undefined ? Math.round(data.ctrl[catalog.rmActuators.fa] * 1e4) / 1e4 : null,
      lr: catalog.rmActuators.lr !== undefined ? Math.round(data.ctrl[catalog.rmActuators.lr] * 1e4) / 1e4 : null
    };

    const keyBodies = {};
    for (const b of catalog.bodies) {
      const idx3 = b.id * 3;
      keyBodies[b.name] = {
        posMj: [
          Math.round(data.xpos[idx3] * 1e3) / 1e3,
          Math.round(data.xpos[idx3 + 1] * 1e3) / 1e3,
          Math.round(data.xpos[idx3 + 2] * 1e3) / 1e3
        ]
      };
    }

    let cx = 0, cy = 0, cz = 0, totalMass = 0;
    for (let b = 0; b < model.nbody; b++) {
      const m = model.body_mass[b];
      if (m <= 0) continue;
      cx += m * data.xpos[b * 3];
      cy += m * data.xpos[b * 3 + 1];
      cz += m * data.xpos[b * 3 + 2];
      totalMass += m;
    }
    const comMj = totalMass > 0 ? {
      x: Math.round((cx / totalMass) * 1e3) / 1e3,
      y: Math.round((cy / totalMass) * 1e3) / 1e3,
      z: Math.round((cz / totalMass) * 1e3) / 1e3
    } : null;

    const lFoot = keyBodies['mixamorigleftfoot'];
    const rFoot = keyBodies['mixamorigrightfoot'];
    const lSoleCenterY = lFoot ? lFoot.posMj[1] - 0.060 : null;
    const rSoleCenterY = rFoot ? rFoot.posMj[1] - 0.060 : null;
    const footSoleCenterY = (lSoleCenterY !== null && rSoleCenterY !== null)
      ? (lSoleCenterY + rSoleCenterY) / 2
      : (lSoleCenterY ?? rSoleCenterY);

    const comLeadM = (comMj && footSoleCenterY !== null)
      ? Math.round((footSoleCenterY - comMj.y) * 1e3) / 1e3
      : null;

    const capBody = catalog.bodies.find(b => b.name.includes('capsule') || b.name.includes('hips'));
    let tiltDeg = null;
    if (capBody) {
      const idx4 = capBody.id * 4;
      const qw = data.xquat[idx4], qx = data.xquat[idx4 + 1], qy = data.xquat[idx4 + 2];
      const bz_z = 1 - 2 * (qx * qx + qy * qy);
      tiltDeg = Math.round(Math.acos(Math.max(-1, Math.min(1, bz_z))) * (180 / Math.PI) * 10) / 10;
    }

    const rootPos = capBody ? keyBodies[capBody.name]?.posMj : null;
    const dispFwdM = (startRootPos && rootPos)
      ? Math.round((startRootPos[1] - rootPos[1]) * 1e3) / 1e3
      : 0;

    if (comMj) checkTouchdowns(data, catalog, comMj.y, t);

    return {
      t: Math.round(t * 100) / 100,
      rootHeightM: rootPos ? rootPos[2] : null,
      dispFwdM,
      tiltDeg,
      comLeadM,
      rmCtrl,
      feetZ: {
        left: lFoot ? lFoot.posMj[2] : null,
        right: rFoot ? rFoot.posMj[2] : null
      },
      joints: jointsData
    };
  }

  function downloadJson(dataObj, filename) {
    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`%c[DIAG DOWNLOAD] ${filename} (${(jsonStr.length / 1024).toFixed(1)} KB)`, 'color:#0f0; font-weight:bold');
  }

  return {
    start(walkType = 'forward', sampleIntervalMs = 100) {
      if (intervalId) this.stop(false);
      recordedFrames.length = 0;
      touchdownEvents.length = 0;
      prevLeftZ = null;
      prevRightZ = null;
      activeWalkType = walkType;
      sampleRateMs = sampleIntervalMs;
      startTime = performance.now();

      const world = getWorld();
      const mj = getMuJoCo();
      let catalog = null;
      if (world && mj && world.model) {
        catalog = buildModelCatalog(world.model, mj);
        const rootJnt = catalog.joints.find(j => j.type === 0);
        if (rootJnt && world.data.qpos) {
          startRootPos = [
            world.data.qpos[rootJnt.qposadr],
            world.data.qpos[rootJnt.qposadr + 1],
            world.data.qpos[rootJnt.qposadr + 2]
          ];
        }
      }

      metaInfo = {
        walkType,
        startTimeISO: new Date().toISOString(),
        sampleRateHz: 1000 / sampleRateMs,
        trackedJointCount: catalog ? catalog.joints.length : 0
      };

      console.log(`%c[DIAG v4] Recording (${walkType}, ${metaInfo.sampleRateHz} Hz)...`, 'color:#0ff; font-weight:bold');

      intervalId = setInterval(() => {
        if (!catalog && getWorld()?.model) catalog = buildModelCatalog(getWorld().model, getMuJoCo());
        if (catalog) {
          const frame = captureFrame(catalog);
          if (frame) recordedFrames.push(frame);
        }
      }, sampleRateMs);
    },

    stop(autoDownload = true) {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      const totalDuration = ((performance.now() - (startTime || performance.now())) / 1000).toFixed(2);

      const exportPayload = {
        meta: {
          ...metaInfo,
          totalFrames: recordedFrames.length,
          totalDurationS: parseFloat(totalDuration),
          endTimeISO: new Date().toISOString()
        },
        touchdownEvents,
        frames: recordedFrames
      };

      if (autoDownload && recordedFrames.length > 0) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadJson(exportPayload, `synthia_telemetry_${activeWalkType}_${ts}.json`);
      }

      this.printSummary();
      return exportPayload;
    },

    printSummary() {
      if (recordedFrames.length === 0) return;
      const last = recordedFrames[recordedFrames.length - 1];
      const minH = Math.min(...recordedFrames.map(f => f.rootHeightM || 999));
      const maxTilt = Math.max(...recordedFrames.map(f => f.tiltDeg || 0));

      console.group('%c══════ TELEMETRY SUMMARY ══════', 'color:#0ff; font-weight:bold');
      console.log(`Walk Type   : ${activeWalkType.toUpperCase()}`);
      console.log(`Duration    : ${last.t}s | Displacement: ${last.dispFwdM}m`);
      console.log(`Min Height  : ${minH.toFixed(3)}m ${minH < 0.45 ? '❌ FELL' : '✓ STABLE'}`);
      console.log(`Max Tilt    : ${maxTilt.toFixed(1)}°`);
      console.groupEnd();
    },

    attachToWalk() {
      const origWalk = window.synthiaWalk;
      const origWalkBack = window.synthiaWalkBackward;
      const origStop = window.synthiaStopWalk;

      window.synthiaWalk = function (...args) {
        window.synthiaDiag.start('forward', 100);
        return origWalk.apply(this, args);
      };
      window.synthiaWalkBackward = function (...args) {
        window.synthiaDiag.start('backward', 100);
        return origWalkBack.apply(this, args);
      };
      window.synthiaStopWalk = function (...args) {
        const res = origStop.apply(this, args);
        setTimeout(() => window.synthiaDiag.stop(true), 500);
        return res;
      };

      console.log('%c[DIAG v4] Attached.', 'color:#0f0; font-weight:bold');
    }
  };
})();
