/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SYNTHIA — Real-Time Center of Mass (COM) & Inverted Pendulum Data Recorder
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * USAGE INSTRUCTIONS (Browser DevTools Console):
 * 1. Open your browser DevTools Console (F12 or Ctrl+Shift+I -> Console tab).
 * 2. Copy and Paste this ENTIRE script into the console and press Enter.
 *    -> Recording starts IMMEDIATELY upon pasting!
 *    -> Real-time telemetry will print in the console every 0.5s.
 * 3. Type `stopcom` (or `stopcom()`) in the console and press Enter.
 *    -> Recording stops immediately.
 *    -> Automatically downloads a JSON file containing per-frame COM, 
 *       movement deltas, acceleration, capture point, and pendulum dynamics!
 * ═════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // Prevent duplicate concurrent recording sessions
  if (window.__SYNTHIA_COM_RECORDING_ACTIVE__) {
    console.warn('[COM Recorder] A recording is already active! Type `stopcom` to stop it before starting a new session.');
    return;
  }

  const GRAVITY = 9.81; // m/s^2
  const startTime = performance.now();
  let frameCount = 0;
  let lastFrameTime = startTime;
  let animationFrameId = null;
  let prevComWorld = null;
  let prevComVelWorld = null;

  // Frame data storage
  const recordedFrames = [];

  // Aggregated summary metrics
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let sumHeight = 0;
  let maxSpeed = 0;
  let sumSpeed = 0;
  let maxAccel = 0;
  let maxTiltDeg = 0;

  // ── Accessors for Physics Engine & Active Humanoid Binder ─────────────────
  function getPhysicsEngine() {
    return window.__SYNTHIA_PHYSICS_ENGINE__ || null;
  }

  function getActiveBinder() {
    const binders = window.__SYNTHIA_HUMANOID_BINDERS__;
    if (binders && typeof binders.values === 'function') {
      const active = Array.from(binders.values())[0];
      if (active) return active;
    }
    return window.__SYNTHIA_HUMANOID_BINDER__ || null;
  }

  function getMujocoModule() {
    const engine = getPhysicsEngine();
    return window.__SYNTHIA_MUJOCO_MODULE__ ||
           (engine && engine.constructor && typeof engine.constructor.getModule === 'function' ? engine.constructor.getModule() : null);
  }

  // ── Mass-Weighted Center of Mass & Velocity Calculation ─────────────────
  function computeComData() {
    const engine = getPhysicsEngine();
    const binder = getActiveBinder();
    const world = engine && typeof engine.getWorld === 'function' ? engine.getWorld() : null;
    const model = world ? world.model : (engine ? engine.model : null);
    const data = world ? world.data : (engine ? engine.data : null);
    const module = getMujocoModule();

    if (!model || !data) {
      // Fallback: Use binder skeleton position if MuJoCo structures are inaccessible
      if (binder && binder.skeleton && binder.skeleton.position) {
        const p = binder.skeleton.position;
        return {
          posWorld: { x: p.x, y: p.y, z: p.z },
          posMj: { x: p.x, y: p.z, z: p.y },
          velWorld: { x: 0, y: 0, z: 0 },
          velMj: { x: 0, y: 0, z: 0 },
          totalMass: 1.0,
          bodyCount: 1
        };
      }
      return null;
    }

    let totalMass = 0;
    let cx = 0, cy = 0, cz = 0;
    let vx = 0, vy = 0, vz = 0;
    let bodyCount = 0;

    const nbody = model.nbody || 0;
    for (let bi = 0; bi < nbody; bi++) {
      const m = model.body_mass ? model.body_mass[bi] : 0;
      if (m <= 0) continue;

      let name = '';
      if (module && typeof module.mj_id2name === 'function') {
        name = module.mj_id2name(model, module.mjtObj ? module.mjtObj.mjOBJ_BODY.value : 1, bi) || '';
      }
      // Skip environment objects, piano, floor, world
      if (name.startsWith('env_slot_') || name.startsWith('piano_') || name === 'floor' || name === 'world') {
        continue;
      }

      if (data.xpos) {
        cx += m * data.xpos[bi * 3];
        cy += m * data.xpos[bi * 3 + 1];
        cz += m * data.xpos[bi * 3 + 2];
      }

      if (data.cvel) {
        const cv = bi * 6;
        vx += m * data.cvel[cv + 3];
        vy += m * data.cvel[cv + 4];
        vz += m * data.cvel[cv + 5];
      }

      totalMass += m;
      bodyCount++;
    }

    const invM = totalMass > 0 ? 1 / totalMass : 1;
    const posMj = { x: cx * invM, y: cy * invM, z: cz * invM };
    const velMj = { x: vx * invM, y: vy * invM, z: vz * invM };

    // MuJoCo coordinates (X right, Y forward, Z up) -> Three.js World coordinates (X right, Y up, Z backward)
    const posWorld = { x: posMj.x, y: posMj.z, z: -posMj.y };
    const velWorld = { x: velMj.x, y: velMj.z, z: -velMj.y };

    return { posWorld, posMj, velWorld, velMj, totalMass, bodyCount };
  }

  // ── Capsule / Root Base Pose & Reflex State Extraction ───────────────────
  function getRootAndStanceData() {
    const engine = getPhysicsEngine();
    const binder = getActiveBinder();
    const world = engine && typeof engine.getWorld === 'function' ? engine.getWorld() : null;
    const data = world ? world.data : null;

    let rootPos = { x: 0, y: 0, z: 0 };
    let rootQuat = { x: 0, y: 0, z: 0, w: 1 };
    let eulerDeg = { pitch: 0, yaw: 0, roll: 0 };
    let capId = null;

    if (binder && typeof binder.getMultiBodyManager === 'function') {
      const bm = binder.getMultiBodyManager();
      if (bm && typeof bm.getCapsuleBody === 'function') {
        capId = bm.getCapsuleBody();
      }
    }

    if (capId !== null && capId >= 0 && data && data.xpos && data.xquat) {
      const px = data.xpos[capId * 3];
      const py = data.xpos[capId * 3 + 1];
      const pz = data.xpos[capId * 3 + 2];
      rootPos = { x: px, y: pz, z: -py };

      const q0 = data.xquat[capId * 4];
      const q1 = data.xquat[capId * 4 + 1];
      const q2 = data.xquat[capId * 4 + 2];
      const q3 = data.xquat[capId * 4 + 3];
      rootQuat = { x: q1, y: q2, z: q3, w: q0 };

      // Calculate Pitch, Yaw, Roll angles
      const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
      const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
      const roll = Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI);

      const sinp = 2 * (q0 * q2 - q3 * q1);
      const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * (180 / Math.PI);

      const siny_cosp = 2 * (q0 * q3 + q1 * q2);
      const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
      const yaw = Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI);

      eulerDeg = { pitch: Number(pitch.toFixed(2)), yaw: Number(yaw.toFixed(2)), roll: Number(roll.toFixed(2)) };
    }

    let reflexState = { enabled: false, activeGaitPhase: 'unknown', lastCommand: 'none' };
    if (binder) {
      if (typeof binder.getReflexController === 'function') {
        const rc = binder.getReflexController();
        if (rc) reflexState.enabled = true;
      }
      if (binder.activeGaitPhase) reflexState.activeGaitPhase = binder.activeGaitPhase;
    }

    return { rootPos, rootQuat, eulerDeg, reflexState };
  }

  // ── Frame Sampling Loop ─────────────────────────────────────────────────
  function sampleFrame(now) {
    if (!window.__SYNTHIA_COM_RECORDING_ACTIVE__) return;

    const dtSec = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    const relativeTimeSec = (now - startTime) / 1000;
    frameCount++;

    const comData = computeComData();
    if (comData) {
      const { posWorld, posMj, velWorld, velMj, totalMass, bodyCount } = comData;
      const rootData = getRootAndStanceData();

      // Velocity magnitude (speed)
      const speedMs = Math.hypot(velWorld.x, velWorld.y, velWorld.z);

      // Frame-to-frame Position & Velocity deltas
      const deltaPosWorld = prevComWorld ? {
        x: posWorld.x - prevComWorld.x,
        y: posWorld.y - prevComWorld.y,
        z: posWorld.z - prevComWorld.z
      } : { x: 0, y: 0, z: 0 };

      const deltaVelWorld = prevComVelWorld ? {
        x: velWorld.x - prevComVelWorld.x,
        y: velWorld.y - prevComVelWorld.y,
        z: velWorld.z - prevComVelWorld.z
      } : { x: 0, y: 0, z: 0 };

      // Linear Acceleration (m/s^2)
      const accelWorld = (dtSec > 0 && prevComVelWorld) ? {
        x: deltaVelWorld.x / dtSec,
        y: deltaVelWorld.y / dtSec,
        z: deltaVelWorld.z / dtSec
      } : { x: 0, y: 0, z: 0 };

      const accelMagMs2 = Math.hypot(accelWorld.x, accelWorld.y, accelWorld.z);

      // Inverted Pendulum Dynamics
      const heightM = Math.max(0.05, posWorld.y); // Vertical height of COM above ground
      const tauSec = Math.sqrt(heightM / GRAVITY); // Time constant tau = sqrt(h/g)
      const omega0RadS = 1 / tauSec; // Natural frequency omega_0 = sqrt(g/h)

      // Linear Inverted Pendulum Capture Point: x_cp = x_com + v_com * tau
      const capturePointWorld = {
        x: posWorld.x + velWorld.x * tauSec,
        y: posWorld.y,
        z: posWorld.z + velWorld.z * tauSec
      };

      const capturePointOffset = {
        x: capturePointWorld.x - posWorld.x,
        z: capturePointWorld.z - posWorld.z
      };

      // Inverted Pendulum Tilt angle from vertical axis
      const dxFromRoot = posWorld.x - rootData.rootPos.x;
      const dzFromRoot = posWorld.z - rootData.rootPos.z;
      const horizontalOffsetM = Math.hypot(dxFromRoot, dzFromRoot);
      const tiltAngleRad = Math.atan2(horizontalOffsetM, heightM);
      const tiltAngleDeg = tiltAngleRad * (180 / Math.PI);

      // Accumulate statistical summary values
      minHeight = Math.min(minHeight, heightM);
      maxHeight = Math.max(maxHeight, heightM);
      sumHeight += heightM;
      maxSpeed = Math.max(maxSpeed, speedMs);
      sumSpeed += speedMs;
      maxAccel = Math.max(maxAccel, accelMagMs2);
      maxTiltDeg = Math.max(maxTiltDeg, tiltAngleDeg);

      // Construct per-frame telemetry record
      const frameRecord = {
        frame: frameCount,
        timestampMs: Number(now.toFixed(2)),
        relativeTimeSec: Number(relativeTimeSec.toFixed(4)),
        dtSec: Number(dtSec.toFixed(5)),
        com: {
          world: { x: Number(posWorld.x.toFixed(5)), y: Number(posWorld.y.toFixed(5)), z: Number(posWorld.z.toFixed(5)) },
          mujoco: { x: Number(posMj.x.toFixed(5)), y: Number(posMj.y.toFixed(5)), z: Number(posMj.z.toFixed(5)) }
        },
        comVelocity: {
          world: { x: Number(velWorld.x.toFixed(5)), y: Number(velWorld.y.toFixed(5)), z: Number(velWorld.z.toFixed(5)) },
          speedMs: Number(speedMs.toFixed(5))
        },
        comAcceleration: {
          world: { x: Number(accelWorld.x.toFixed(4)), y: Number(accelWorld.y.toFixed(4)), z: Number(accelWorld.z.toFixed(4)) },
          magMs2: Number(accelMagMs2.toFixed(4))
        },
        changesPerFrame: {
          deltaPosWorld: { x: Number(deltaPosWorld.x.toFixed(6)), y: Number(deltaPosWorld.y.toFixed(6)), z: Number(deltaPosWorld.z.toFixed(6)) },
          deltaVelWorld: { x: Number(deltaVelWorld.x.toFixed(6)), y: Number(deltaVelWorld.y.toFixed(6)), z: Number(deltaVelWorld.z.toFixed(6)) }
        },
        invertedPendulum: {
          heightM: Number(heightM.toFixed(5)),
          timeConstantTauSec: Number(tauSec.toFixed(5)),
          naturalFrequencyOmega0RadS: Number(omega0RadS.toFixed(5)),
          tiltAngleDeg: Number(tiltAngleDeg.toFixed(3)),
          horizontalOffsetFromRootM: Number(horizontalOffsetM.toFixed(5)),
          capturePointWorld: {
            x: Number(capturePointWorld.x.toFixed(5)),
            y: Number(capturePointWorld.y.toFixed(5)),
            z: Number(capturePointWorld.z.toFixed(5))
          },
          capturePointLeadOffsetM: {
            x: Number(capturePointOffset.x.toFixed(5)),
            z: Number(capturePointOffset.z.toFixed(5))
          }
        },
        pendulumBaseRoot: {
          positionWorld: { x: Number(rootData.rootPos.x.toFixed(5)), y: Number(rootData.rootPos.y.toFixed(5)), z: Number(rootData.rootPos.z.toFixed(5)) },
          quaternion: rootData.rootQuat,
          orientationEulerDeg: rootData.eulerDeg
        },
        reflexAndState: rootData.reflexState,
        modelPhysicsInfo: {
          totalMassKg: Number(totalMass.toFixed(3)),
          bodyCount: bodyCount
        }
      };

      recordedFrames.push(frameRecord);

      // Save state for next delta computation
      prevComWorld = { ...posWorld };
      prevComVelWorld = { ...velWorld };

      // Real-time console status display (throttled every 30 frames ~ 0.5 sec)
      if (frameCount % 30 === 0) {
        const fps = Math.round(1 / dtSec);
        console.log(
          `[COM Rec] Frame #${frameCount} (${relativeTimeSec.toFixed(1)}s | ${fps} FPS) | ` +
          `COM Y(Height): ${heightM.toFixed(3)}m | ` +
          `Speed: ${speedMs.toFixed(3)}m/s | ` +
          `Accel: ${accelMagMs2.toFixed(2)}m/s² | ` +
          `Tilt: ${tiltAngleDeg.toFixed(1)}° | ` +
          `Capture Point Lead: (${capturePointOffset.x >= 0 ? '+' : ''}${capturePointOffset.x.toFixed(3)}, ${capturePointOffset.z >= 0 ? '+' : ''}${capturePointOffset.z.toFixed(3)})m`
        );
      }
    } else {
      if (frameCount % 60 === 0) {
        console.warn(`[COM Rec] Frame #${frameCount}: Waiting for physics engine model/data...`);
      }
    }

    animationFrameId = requestAnimationFrame(sampleFrame);
  }

  // ── Stop & Download Export Handler ─────────────────────────────────────────
  function stopAndExport() {
    if (!window.__SYNTHIA_COM_RECORDING_ACTIVE__) {
      console.warn('[COM Recorder] No active recording session found.');
      return;
    }

    window.__SYNTHIA_COM_RECORDING_ACTIVE__ = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    const endTime = performance.now();
    const durationSec = (endTime - startTime) / 1000;
    const avgFps = frameCount > 0 && durationSec > 0 ? (frameCount / durationSec) : 0;
    const avgHeight = frameCount > 0 ? (sumHeight / frameCount) : 0;
    const avgSpeed = frameCount > 0 ? (sumSpeed / frameCount) : 0;

    const binder = getActiveBinder();
    const agentId = binder && binder.agentId ? binder.agentId : 'agent_0';

    const exportPayload = {
      metadata: {
        title: "Synthia Center of Mass (COM) & Inverted Pendulum Recording",
        agentId: agentId,
        recordedAtIso: new Date().toISOString(),
        totalFrames: frameCount,
        durationSec: Number(durationSec.toFixed(3)),
        averageFps: Number(avgFps.toFixed(2)),
        summaryStatistics: {
          comHeight: {
            minM: minHeight === Infinity ? 0 : Number(minHeight.toFixed(5)),
            maxM: maxHeight === -Infinity ? 0 : Number(maxHeight.toFixed(5)),
            avgM: Number(avgHeight.toFixed(5))
          },
          comSpeed: {
            maxMs: Number(maxSpeed.toFixed(5)),
            avgMs: Number(avgSpeed.toFixed(5))
          },
          maxAccelerationMs2: Number(maxAccel.toFixed(4)),
          maxPendulumTiltDeg: Number(maxTiltDeg.toFixed(3))
        }
      },
      frames: recordedFrames
    };

    // Generate JSON blob & trigger automatic browser download
    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `synthia_com_pendulum_data_${dateStr}.json`;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    console.log(`%c[COM Recorder] STOPPED & EXPORTED successfully!`, 'color: #00ff88; font-weight: bold; font-size: 14px;');
    console.log(`📊 Summary: ${frameCount} frames recorded over ${durationSec.toFixed(2)}s (~${avgFps.toFixed(1)} FPS).`);
    console.log(`💾 File downloaded: "${filename}" (${(blob.size / 1024).toFixed(1)} KB)`);

    return exportPayload;
  }

  // ── Bind `stopcom` Function & Property Getter ─────────────────────────────
  window.__SYNTHIA_COM_RECORDING_ACTIVE__ = true;
  window.stopcom = stopAndExport;

  try {
    Object.defineProperty(window, 'stopcom', {
      get: function () {
        return stopAndExport();
      },
      configurable: true
    });
  } catch (e) {
    // If property definition fails, standard function call remains available
  }

  // Launch sampling loop
  animationFrameId = requestAnimationFrame(sampleFrame);

  // Print startup notification in console
  console.log(
    '%c🚀 Synthia COM & Inverted Pendulum Real-Time Data Recorder Started!',
    'color: #00d2ff; font-weight: bold; font-size: 15px;'
  );
  console.log(
    '%cRecording frame-by-frame Center of Mass position, velocity, acceleration, pendulum height & capture points...\n' +
    'To stop recording and download your JSON data file, type:\n' +
    '  > stopcom',
    'color: #e0e0e0; font-size: 12px;'
  );

})();
