/**
 * console_diagnose_fall.js
 *
 * Non-invasive diagnostic: reads live MuJoCo state to determine WHY the model falls backward.
 * Zero hardcoded values — everything is read from the actual model/data arrays.
 *
 * Correct for @mujoco/mujoco v3.10+ (Float64Array frame access, reordered mjtGeom).
 *
 * Usage:
 *   diagnose_fall()          — run 180 frames of analysis, print full report + JSON download
 *   diagnose_fall_live()     — attach to animation loop, log every frame
 *   diagnose_fall_stop()     — stop live mode
 *   analyzeFrame()           — single-frame snapshot (returns object)
 */

(function () {
  'use strict';

  var liveIntervalId = null;

  // ─── Ring buffer: auto-captures from the moment the script loads ──
  var RING_SIZE = 300; // ~10 seconds at 30fps
  var ringBuffer = [];
  var ringIndex = 0;
  var ringFull = false;
  var ringIntervalId = null;
  var ringFrameCount = 0;

  // ─── Access ──────────────────────────────────────────
  function getEngine() {
    var pe = window.__SYNTHIA_PHYSICS_ENGINE__;
    if (!pe) throw new Error('window.__SYNTHIA_PHYSICS_ENGINE__ not found');
    return pe;
  }
  function getBinder() {
    var b = window.__SYNTHIA_HUMANOID_BINDER__;
    if (!b) throw new Error('window.__SYNTHIA_HUMANOID_BINDER__ not found');
    return b;
  }
  function getModule() {
    return window.__SYNTHIA_MUJOCO_MODULE__ || null;
  }

  // ─── Coord conversion ────────────────────────────────
  function mjToWorld(x, y, z) {
    return { x: x, y: z, z: -y };
  }

  // ─── Name lookup helpers ─────────────────────────────
  function bodyName(model, module, id) {
    if (!module || id < 0) return 'body_' + id;
    try { return module.mj_id2name(model, 1, id) || 'body_' + id; } catch (_) { return 'body_' + id; }
  }
  function geomName(model, module, id) {
    if (!module || id < 0) return 'geom_' + id;
    try { return module.mj_id2name(model, 2, id) || 'geom_' + id; } catch (_) { return 'geom_' + id; }
  }
  function jointName(model, module, id) {
    if (!module || id < 0) return 'joint_' + id;
    try { return module.mj_id2name(model, 3, id) || 'joint_' + id; } catch (_) { return 'joint_' + id; }
  }
  function actuatorName(model, module, id) {
    if (!module || id < 0) return 'actuator_' + id;
    try { return module.mj_id2name(model, 4, id) || 'actuator_' + id; } catch (_) { return 'actuator_' + id; }
  }

  // ─── MJCF joint type names ──────────────────────────
  var JOINT_TYPE_NAMES = ['free', 'ball', 'slide', 'hinge'];

  // ─── MJCF geom type names (v3.10+ reordered) ────────
  var GEOM_TYPE_NAMES = ['plane', 'hfield', 'sphere', 'capsule', 'ellipsoid', 'cylinder', 'box', 'mesh', 'sdf'];

  // ─── Core analysis (single snapshot) ─────────────────
  function analyzeFrame() {
    var engine = getEngine();
    var binder = getBinder();
    var module = getModule();
    var world = engine.getWorld();
    var model = world.model;
    var data = world.data;
    var bodies = binder.getMultiBodyManager().getRigidBodiesMap();
    var capsuleId = binder.getMultiBodyManager().getCapsuleBody();

    var report = {};

    // 1. MODEL INFO
    report.modelInfo = {
      nbody: model.nbody,
      njnt: model.njnt,
      nq: model.nq,
      nv: model.nv,
      nu: model.nu,
      ncon: data.ncon,
      gravity: [model.opt.gravity[0], model.opt.gravity[1], model.opt.gravity[2]],
      timestep: model.opt.timestep,
      integrator: model.opt.integrator,
      solver: model.opt.solver,
      iterations: model.opt.iterations
    };

    // 2. ROOT BODY STATE
    var rootDof = model.body_dofadr[capsuleId];
    report.root = {
      bodyId: capsuleId,
      pos_mj: [data.xpos[capsuleId * 3], data.xpos[capsuleId * 3 + 1], data.xpos[capsuleId * 3 + 2]],
      pos_world: mjToWorld(data.xpos[capsuleId * 3], data.xpos[capsuleId * 3 + 1], data.xpos[capsuleId * 3 + 2]),
      quat_mj: [data.xquat[capsuleId * 4], data.xquat[capsuleId * 4 + 1], data.xquat[capsuleId * 4 + 2], data.xquat[capsuleId * 4 + 3]],
      linvel_mj: [data.qvel[rootDof], data.qvel[rootDof + 1], data.qvel[rootDof + 2]],
      angvel_mj: [data.qvel[rootDof + 3], data.qvel[rootDof + 4], data.qvel[rootDof + 5]],
      linvel_world: mjToWorld(data.qvel[rootDof], data.qvel[rootDof + 1], data.qvel[rootDof + 2]),
      angvel_world: mjToWorld(data.qvel[rootDof + 3], data.qvel[rootDof + 4], data.qvel[rootDof + 5]),
      xfrc: [data.xfrc_applied[capsuleId * 6], data.xfrc_applied[capsuleId * 6 + 1], data.xfrc_applied[capsuleId * 6 + 2],
             data.xfrc_applied[capsuleId * 6 + 3], data.xfrc_applied[capsuleId * 6 + 4], data.xfrc_applied[capsuleId * 6 + 5]],
      mass: model.body_mass[capsuleId],
      isGrounded: binder.getIsGrounded ? binder.getIsGrounded() : 'N/A'
    };

    // 3. CENTER OF MASS COMPUTATION (all bodies)
    var totalMass = 0;
    var comX = 0, comY = 0, comZ = 0;
    for (var i = 0; i < model.nbody; i++) {
      var mass = model.body_mass[i];
      if (mass <= 0) continue;
      comX += mass * data.xpos[i * 3];
      comY += mass * data.xpos[i * 3 + 1];
      comZ += mass * data.xpos[i * 3 + 2];
      totalMass += mass;
    }
    if (totalMass > 0) { comX /= totalMass; comY /= totalMass; comZ /= totalMass; }
    report.centerOfMass = {
      totalMass: totalMass,
      com_mj: [comX, comY, comZ],
      com_world: mjToWorld(comX, comY, comZ),
      com_height_mj: comZ
    };

    // 4. ALL BODY STATE (sorted by MuJoCo Z = height)
    var bodyData = [];
    for (var i = 0; i < model.nbody; i++) {
      var bx = data.xpos[i * 3], by = data.xpos[i * 3 + 1], bz = data.xpos[i * 3 + 2];
      var dof = model.body_dofadr[i];
      var dofNum = model.body_dofnum[i];
      var linV = dofNum >= 3 ? [data.qvel[dof], data.qvel[dof + 1], data.qvel[dof + 2]] : null;
      var angV = dofNum >= 6 ? [data.qvel[dof + 3], data.qvel[dof + 4], data.qvel[dof + 5]] : null;
      var xfrcIdx = i * 6;
      bodyData.push({
        id: i,
        name: bodyName(model, module, i),
        parent: model.body_parentid[i],
        mass: model.body_mass[i],
        pos_mj: [bx, by, bz],
        pos_world: mjToWorld(bx, by, bz),
        height_mj: bz,
        height_world: mjToWorld(bx, by, bz).y,
        dofNum: dofNum,
        linvel: linV,
        angvel: angV,
        xfrc_force: [data.xfrc_applied[xfrcIdx], data.xfrc_applied[xfrcIdx + 1], data.xfrc_applied[xfrcIdx + 2]],
        xfrc_torque: [data.xfrc_applied[xfrcIdx + 3], data.xfrc_applied[xfrcIdx + 4], data.xfrc_applied[xfrcIdx + 5]]
      });
    }
    bodyData.sort(function (a, b) { return b.height_mj - a.height_mj; });
    report.bodies = bodyData;

    // 5. ALL FOOT GEOMS
    var footBones = ['mixamorigleftfoot', 'mixamorigrightfoot'];
    report.feet = {};
    footBones.forEach(function (boneName) {
      var bodyId = bodies.get(boneName);
      var geomId = binder.getMultiBodyManager().getBoneColliderHandle(boneName);
      if (bodyId === undefined) {
        report.feet[boneName] = { error: 'body not in rigidBodiesMap' };
        return;
      }
      var bx = data.xpos[bodyId * 3], by = data.xpos[bodyId * 3 + 1], bz = data.xpos[bodyId * 3 + 2];
      var dof = model.body_dofadr[bodyId];
      var xfrcIdx = bodyId * 6;

      // Geom properties
      var geomInfo = null;
      if (geomId !== null && geomId >= 0) {
        var gType = model.geom_type[geomId];
        geomInfo = {
          geomId: geomId,
          type: GEOM_TYPE_NAMES[gType] || 'type_' + gType,
          size: [model.geom_size[geomId * 3], model.geom_size[geomId * 3 + 1], model.geom_size[geomId * 3 + 2]],
          localPos: [model.geom_pos[geomId * 3], model.geom_pos[geomId * 3 + 1], model.geom_pos[geomId * 3 + 2]],
          contype: model.geom_contype[geomId],
          conaffinity: model.geom_conaffinity[geomId],
          bodyId: model.geom_bodyid[geomId],
          // Computed world position of geom center
          worldPos: mjToWorld(data.geom_xpos[geomId * 3], data.geom_xpos[geomId * 3 + 1], data.geom_xpos[geomId * 3 + 2])
        };
      }

      report.feet[boneName] = {
        bodyId: bodyId,
        pos_mj: [bx, by, bz],
        pos_world: mjToWorld(bx, by, bz),
        height_world: mjToWorld(bx, by, bz).y,
        dofNum: model.body_dofnum[bodyId],
        linvel: dof >= 0 ? [data.qvel[dof], data.qvel[dof + 1], data.qvel[dof + 2]] : null,
        angvel: dof >= 0 ? [data.qvel[dof + 3], data.qvel[dof + 4], data.qvel[dof + 5]] : null,
        xfrc_force: [data.xfrc_applied[xfrcIdx], data.xfrc_applied[xfrcIdx + 1], data.xfrc_applied[xfrcIdx + 2]],
        xfrc_torque: [data.xfrc_applied[xfrcIdx + 3], data.xfrc_applied[xfrcIdx + 4], data.xfrc_applied[xfrcIdx + 5]],
        geom: geomInfo
      };
    });

    // 6. ALL CONTACTS
    var contacts = [];
    for (var ci = 0; ci < data.ncon; ci++) {
      var contact = data.contact.get(ci);
      if (!contact) continue;
      var g1 = contact.geom1, g2 = contact.geom2;
      var g1name = geomName(model, module, g1);
      var g2name = geomName(model, module, g2);

      // v3.10+: contact.frame may be Float64Array or DoubleBuffer accessor
      var frame = contact.frame;
      var nx = 0, ny = 0, nz = 0;
      if (frame) {
        try {
          nx = frame[0]; ny = frame[1]; nz = frame[2];
        } catch (_) {
          try {
            nx = frame.get(0); ny = frame.get(1); nz = frame.get(2);
          } catch (_) {}
        }
      }

      // Get force via mj_contactForce
      var fBuf = new module.DoubleBuffer(6);
      try {
        module.mj_contactForce(model, data, ci, fBuf);
        var fView = fBuf.GetView();
        var force = [fView[0], fView[1], fView[2]];
      } catch (e) {
        var force = [0, 0, 0];
      }
      fBuf.delete();

      contacts.push({
        geom1: g1name, geom1Id: g1,
        geom2: g2name, geom2Id: g2,
        dist: contact.dist,
        normal_mj: [nx, ny, nz],
        normal_world: mjToWorld(nx, ny, nz),
        force: force
      });
    }
    report.contacts = contacts;

    // 7. CONTACT FORCE REGISTRY
    var registry = engine.getContactForceRegistry();
    var registryReport = {};
    registry.forEach(function (state, geomId) {
      if (!state.inContact && state.impulse_magnitude < 0.01) return;
      registryReport[geomName(model, module, geomId)] = {
        geomId: geomId,
        inContact: state.inContact,
        impulse: state.impulse_magnitude,
        normal_mj: state.contact_normal,
        maxForce: state.max_force_magnitude,
        age: Date.now() - state.lastUpdate
      };
    });
    report.contactRegistry = registryReport;

    // 8. ALL JOINT ANGLES (every joint in the model)
    var joints = {};
    for (var ji = 0; ji < model.njnt; ji++) {
      var jname = jointName(model, module, ji);
      var jtype = model.jnt_type[ji];
      var qposAdr = model.jnt_qposadr[ji];
      var dofAdr = model.jnt_dofadr[ji];

      // Safe reads: some arrays may not exist in all WASM builds
      var jrange0 = 0, jrange1 = 0, stiffness = 0, damping = 0;
      try { jrange0 = model.jnt_range[ji * 2]; } catch (_) {}
      try { jrange1 = model.jnt_range[ji * 2 + 1]; } catch (_) {}
      try { stiffness = model.jnt_stiffness[ji]; } catch (_) {}
      // MuJoCo has dof_damping (per-DOF), NOT jnt_damping (per-joint)
      try { damping = model.dof_damping[dofAdr]; } catch (_) {}

      var qposVal = data.qpos[qposAdr];
      var qvelVal = data.qvel[dofAdr];

      joints[jname] = {
        id: ji,
        type: JOINT_TYPE_NAMES[jtype] || 'type_' + jtype,
        qpos: qposVal,
        qpos_deg: qposVal * 180 / Math.PI,
        qvel: qvelVal,
        range: [jrange0, jrange1],
        range_deg: [jrange0 * 180 / Math.PI, jrange1 * 180 / Math.PI],
        stiffness: stiffness,
        damping: damping,
        bodyId: model.jnt_bodyid[ji],
        bodyName: bodyName(model, module, model.jnt_bodyid[ji])
      };
    }
    report.joints = joints;

    // 9. ALL ACTUATORS
    var actuators = {};
    for (var ai = 0; ai < model.nu; ai++) {
      var aname = actuatorName(model, module, ai);
      actuators[aname] = {
        id: ai,
        ctrl: data.ctrl[ai],
        force: data.actuator_force[ai],
        length: data.actuator_length[ai],
        velocity: data.actuator_velocity[ai],
        kp: model.actuator_gainprm[ai * 3],
        biasKp: model.actuator_biasprm[ai * 3 + 1],
        biasKv: model.actuator_biasprm[ai * 3 + 2],
        trntype: model.actuator_trntype[ai],
        trnid: [model.actuator_trnid[ai * 2], model.actuator_trnid[ai * 2 + 1]],
        gear: model.actuator_gear[ai],
        ctrllimited: model.actuator_ctrllimited[ai],
        ctrlrange: [model.actuator_ctrlrange[ai * 2], model.actuator_ctrlrange[ai * 2 + 1]]
      };
    }
    report.actuators = actuators;

    // 10. TILT ANALYSIS
    var qw = data.xquat[capsuleId * 4];
    var qx = data.xquat[capsuleId * 4 + 1];
    var qy = data.xquat[capsuleId * 4 + 2];
    var qz = data.xquat[capsuleId * 4 + 3];
    var upX = 2 * (qx * qz + qw * qy);
    var upY = 2 * (qy * qz - qw * qx);
    var upZ = 1 - 2 * (qx * qx + qy * qy);
    var tiltAngle = Math.acos(Math.min(1, Math.max(-1, upZ)));
    report.tilt = {
      angle_rad: tiltAngle,
      angle_deg: tiltAngle * 180 / Math.PI,
      upVector_mj: [upX, upY, upZ],
      tiltDir_mj: [upX, upY, 0],
      tiltDir_world: mjToWorld(upX, upY, 0)
    };

    // 11. COBRA: Check which geom the capsule is touching
    var capsuleGeoms = [];
    for (var gi = 0; gi < model.ngeom; gi++) {
      if (model.geom_bodyid[gi] === capsuleId) {
        capsuleGeoms.push({
          geomId: gi,
          name: geomName(model, module, gi),
          type: GEOM_TYPE_NAMES[model.geom_type[gi]] || 'type_' + model.geom_type[gi],
          size: [model.geom_size[gi * 3], model.geom_size[gi * 3 + 1], model.geom_size[gi * 3 + 2]],
          contype: model.geom_contype[gi],
          conaffinity: model.geom_conaffinity[gi],
          worldPos: mjToWorld(data.geom_xpos[gi * 3], data.geom_xpos[gi * 3 + 1], data.geom_xpos[gi * 3 + 2])
        });
      }
    }
    report.capsuleGeoms = capsuleGeoms;

    // 12. SUMMARY DIAGNOSIS
    var summary = [];

    // Tilt
    if (report.tilt.angle_deg > 5) {
      summary.push('WARN_TILT: Root tilted ' + report.tilt.angle_deg.toFixed(1) + ' deg');
    }

    // Root height
    var rootH = report.root.pos_world.y;
    if (rootH < 0.3) {
      summary.push('CRITICAL_LOW: Root height = ' + rootH.toFixed(3) + 'm (below expected ~0.9m)');
    } else if (rootH < 0.6) {
      summary.push('WARN_LOW: Root height = ' + rootH.toFixed(3) + 'm (lower than expected)');
    }

    // CoM vs feet
    var leftFootZ = report.feet['mixamorigleftfoot'] ? report.feet['mixamorigleftfoot'].pos_world.z : null;
    var rightFootZ = report.feet['mixamorigrightfoot'] ? report.feet['mixamorigrightfoot'].pos_world.z : null;
    if (leftFootZ !== null && rightFootZ !== null) {
      var avgFootZ = (leftFootZ + rightFootZ) / 2;
      var comFootOffset = report.centerOfMass.com_world.z - avgFootZ;
      report.comFootOffset_m = comFootOffset;
      if (comFootOffset < -0.05) {
        summary.push('CRITICAL_COM_BEHIND: CoM is ' + Math.abs(comFootOffset).toFixed(3) + 'm BEHIND feet');
      } else if (comFootOffset < -0.02) {
        summary.push('WARN_COM_BEHIND: CoM is ' + Math.abs(comFootOffset).toFixed(3) + 'm behind feet');
      } else if (comFootOffset > 0.1) {
        summary.push('WARN_COM_AHEAD: CoM is ' + comFootOffset.toFixed(3) + 'm ahead of feet');
      }
    }

    // Contacts
    var floorContact = contacts.some(function (c) {
      return c.geom1 === 'floor' || c.geom2 === 'floor';
    });
    if (contacts.length === 0) {
      summary.push('WARN_NO_CONTACTS: No active contacts detected');
    }
    if (!floorContact) {
      summary.push('WARN_NO_FLOOR: No floor contact detected');
    }

    // Check contact normal Z component (MuJoCo Z = vertical)
    var footContacts = contacts.filter(function (c) {
      return c.geom1.indexOf('foot') >= 0 || c.geom2.indexOf('foot') >= 0 ||
             c.geom1.indexOf('toe') >= 0 || c.geom2.indexOf('toe') >= 0;
    });
    if (footContacts.length > 0) {
      footContacts.forEach(function (c) {
        var nz = Math.abs(c.normal_mj[2]);
        if (nz < 0.3) {
          summary.push('WARN_NORMAL_AXIS: Foot contact normal Z=' + nz.toFixed(3) + ' (should be >0.3 for vertical)');
        }
      });
    }

    // Root velocity
    var upVel = report.root.linvel_world.y;
    if (upVel > 2.0) {
      summary.push('WARN_UP_VEL: Root moving upward at ' + upVel.toFixed(2) + ' m/s');
    }
    var backVel = report.root.linvel_world.z;
    if (backVel < -0.5) {
      summary.push('WARN_BACK_VEL: Root moving backward at ' + Math.abs(backVel).toFixed(2) + ' m/s');
    }

    // xfrc on root
    var rootTq = report.root.xfrc_torque;
    var tqMag = Math.sqrt(rootTq[0] * rootTq[0] + rootTq[1] * rootTq[1] + rootTq[2] * rootTq[2]);
    report.rootBalanceTorqueMag = tqMag;
    if (tqMag > 50) {
      summary.push('WARN_HIGH_TORQUE: Balance torque magnitude = ' + tqMag.toFixed(1) + ' (near max 60)');
    }

    // Joint limits
    var nearLimitCount = 0;
    Object.keys(joints).forEach(function (jname) {
      var j = joints[jname];
      if (j.range[0] !== 0 || j.range[1] !== 0) {
        var margin0 = j.qpos - j.range[0];
        var margin1 = j.range[1] - j.qpos;
        if (margin0 < 0.05 || margin1 < 0.05) nearLimitCount++;
      }
    });
    if (nearLimitCount > 0) {
      summary.push('WARN_LIMITS: ' + nearLimitCount + ' joints near limits');
    }

    report.summary = summary;

    return report;
  }

  // ─── Pretty print ────────────────────────────────────
  function printReport(r, frameIdx) {
    var f = frameIdx !== undefined ? '[Frame ' + frameIdx + '] ' : '';
    console.log('%c ' + f + '══════════════════════════════════════════', 'color: #00ff88');
    console.log('%c ' + f + 'FALL DIAGNOSIS', 'color: #00ff88; font-weight: bold; font-size: 14px');
    console.log('%c ' + f + '══════════════════════════════════════════', 'color: #00ff88');

    // Summary
    console.log('\n%c SUMMARY', 'color: #ff4444; font-weight: bold');
    if (r.summary.length === 0) {
      console.log('  No issues detected in this frame.');
    } else {
      r.summary.forEach(function (s) {
        var color = s.startsWith('CRITICAL') ? '#ff0000' : '#ffaa00';
        console.log('%c  ' + s, 'color:' + color);
      });
    }

    // Model
    console.log('\n%c MODEL', 'color: #88aaff; font-weight: bold');
    console.log('  Bodies:', r.modelInfo.nbody, '  Joints:', r.modelInfo.njnt, '  nq:', r.modelInfo.nq, '  nv:', r.modelInfo.nv);
    console.log('  Actuators:', r.modelInfo.nu, '  Contacts:', r.modelInfo.ncon);
    console.log('  Gravity:', r.modelInfo.gravity, '  Timestep:', r.modelInfo.timestep);
    console.log('  Integrator:', r.modelInfo.integrator, '  Solver iterations:', r.modelInfo.iterations);

    // CoM
    console.log('\n%c CENTER OF MASS', 'color: #ffaa00; font-weight: bold');
    console.log('  Total mass:', r.centerOfMass.totalMass.toFixed(1), 'kg');
    console.log('  CoM (world):', r.centerOfMass.com_world);
    console.log('  CoM height (world Y):', r.centerOfMass.com_world.y.toFixed(4));
    if (r.comFootOffset_m !== undefined) {
      console.log('  CoM offset from feet (world Z):', r.comFootOffset_m.toFixed(4) + 'm',
        r.comFootOffset_m < 0 ? '(BEHIND)' : '(AHEAD)');
    }

    // Root
    console.log('\n%c ROOT CAPSULE', 'color: #88aaff; font-weight: bold');
    console.log('  Mass:', r.root.mass, 'kg');
    console.log('  Position (world):', r.root.pos_world);
    console.log('  Quaternion (MuJoCo wxyz):', r.root.quat_mj.map(function (v) { return v.toFixed(4); }));
    console.log('  Linear vel (world):', r.root.linvel_world);
    console.log('  Angular vel (world):', r.root.angvel_world);
    console.log('  xfrc force:', r.root.xfrc_force, '  torque:', r.root.xfrc_torque);
    console.log('  Balance torque magnitude:', r.rootBalanceTorqueMag.toFixed(2));
    console.log('  Grounded:', r.root.isGrounded);

    // Tilt
    console.log('\n%c TILT', 'color: #ff4444; font-weight: bold');
    console.log('  Angle:', r.tilt.angle_deg.toFixed(2) + ' deg');
    console.log('  Up vector (MuJoCo):', r.tilt.upVector_mj.map(function (v) { return v.toFixed(4); }));

    // Feet
    console.log('\n%c FEET', 'color: #00ff88; font-weight: bold');
    Object.keys(r.feet).forEach(function (name) {
      var f = r.feet[name];
      if (f.error) { console.log('  ' + name + ':', f.error); return; }
      console.log('  ' + name + ':');
      console.log('    Position (world):', f.pos_world);
      console.log('    Height (world Y):', f.height_world ? f.height_world.toFixed(4) : 'N/A');
      if (f.geom) {
        console.log('    Geom:', f.geom.type, '  size:', f.geom.size, '  localPos:', f.geom.localPos);
        console.log('    Geom world pos:', f.geom.worldPos);
        console.log('    contype:', f.geom.contype, '  conaffinity:', f.geom.conaffinity);
      }
      console.log('    xfrc force:', f.xfrc_force, '  torque:', f.xfrc_torque);
    });

    // Contacts
    console.log('\n%c CONTACTS (' + r.contacts.length + ')', 'color: #ffaa00; font-weight: bold');
    if (r.contacts.length === 0) {
      console.log('  No contacts!');
    } else {
      r.contacts.forEach(function (c) {
        console.log('  ' + c.geom1 + ' <-> ' + c.geom2 +
          '  dist=' + c.dist.toFixed(4) +
          '  force=' + c.force.map(function (v) { return v.toFixed(2); }) +
          '  normal_mj=' + c.normal_mj.map(function (v) { return v.toFixed(3); }));
      });
    }

    // Contact registry
    var regKeys = Object.keys(r.contactRegistry);
    if (regKeys.length > 0) {
      console.log('\n%c CONTACT REGISTRY', 'color: #ffaa00; font-weight: bold');
      regKeys.forEach(function (gname) {
        var rs = r.contactRegistry[gname];
        console.log('  ' + gname + ': impulse=' + rs.impulse.toFixed(3) +
          '  normal_mj=' + (rs.normal_mj ? rs.normal_mj.map(function (v) { return v.toFixed(3); }) : 'N/A') +
          '  age=' + rs.age + 'ms');
      });
    }

    // Key joints (sorted by absolute deviation from 0)
    console.log('\n%c JOINTS (sorted by angle magnitude)', 'color: #88aaff; font-weight: bold');
    var jArr = Object.keys(r.joints).map(function (k) { return { name: k, j: r.joints[k] }; });
    jArr.sort(function (a, b) { return Math.abs(b.j.qpos) - Math.abs(a.j.qpos); });
    jArr.slice(0, 25).forEach(function (item) {
      var j = item.j;
      var deg = j.qpos_deg;
      var r0 = j.range_deg[0].toFixed(0);
      var r1 = j.range_deg[1].toFixed(0);
      var nearLimit = '';
      if (j.range[0] !== 0 || j.range[1] !== 0) {
        var margin0 = j.qpos - j.range[0];
        var margin1 = j.range[1] - j.qpos;
        if (margin0 < 0.05 || margin1 < 0.05) nearLimit = ' [NEAR LIMIT]';
      }
      console.log('  ' + item.name + ': ' + deg.toFixed(1) + ' deg  [' + r0 + ', ' + r1 + ']  kp=' + j.stiffness + '  kv=' + j.damping + nearLimit);
    });

    // Capsule geoms
    console.log('\n%c CAPSULE GEOMS', 'color: #88aaff; font-weight: bold');
    r.capsuleGeoms.forEach(function (g) {
      console.log('  ' + g.name + ':', g.type, '  size:', g.size, '  worldPos:', g.worldPos);
    });

    console.log('\n%c ══════════════════════════════════════════', 'color: #00ff88');
  }

  // ─── Ring buffer: auto-capture from load time ─────────
  function captureRingFrame() {
    try {
      var engine = getEngine();
      if (!engine || !engine.isReady) return;
      var r = analyzeFrame();
      r._frame = ringFrameCount++;
      r._time = Date.now();
      if (ringFull) {
        ringBuffer[ringIndex] = r;
      } else {
        ringBuffer.push(r);
        if (ringBuffer.length >= RING_SIZE) ringFull = true;
      }
      ringIndex = (ringIndex + 1) % RING_SIZE;
    } catch (_) {}
  }

  function startRingCapture() {
    if (ringIntervalId) return;
    ringIntervalId = setInterval(captureRingFrame, 33); // ~30fps
    console.log('%c[FALL DIAG] Ring buffer active: capturing last ' + RING_SIZE + ' frames continuously', 'color: #00ff88');
    console.log('  Paste this script BEFORE the model loads to capture the full fall sequence');
    console('  Or paste after — the ring buffer already has frames from before you called diagnose_fall()');
  }

  function getRingBufferFrames() {
    if (!ringFull) return ringBuffer.slice();
    // Reorder: oldest first
    var result = [];
    for (var i = 0; i < RING_SIZE; i++) {
      result.push(ringBuffer[(ringIndex + i) % RING_SIZE]);
    }
    return result;
  }

  // ─── Multi-frame analysis ────────────────────────────
  function diagnose_fall() {
    var engine = getEngine();
    if (!engine.isReady) { console.error('[FALL DIAG] Engine not ready'); return; }

    // Stop ring capture and get what we have so far
    var existingFrames = getRingBufferFrames();
    console.log('%c[FALL DIAG] Ring buffer has ' + existingFrames.length + ' pre-captured frames', 'color: #00ff88; font-weight: bold');

    // Continue capturing for 180 more frames (or use ring buffer if it's large enough)
    var reports = existingFrames.slice();
    var framesToCapture = Math.max(0, 180 - reports.length);
    var frameIndex = 0;

    if (framesToCapture === 0) {
      // Ring buffer already has enough data — print immediately
      console.log('%c[FALL DIAG] Using ' + reports.length + ' frames from ring buffer', 'color: #00ff88; font-weight: bold');
      printFinalReport(reports);
      downloadReports(reports);
      return;
    }

    console.log('%c[FALL DIAG] Capturing ' + framesToCapture + ' more frames...', 'color: #00ff88; font-weight: bold');

    var intervalId = setInterval(function () {
      try {
        var r = analyzeFrame();
        r._frame = reports.length;
        r._time = Date.now();
        reports.push(r);
        frameIndex++;

        if (frameIndex % 30 === 0) {
          console.log('[FALL DIAG] Frame ' + frameIndex + '/' + framesToCapture +
            '  h=' + r.root.pos_world.y.toFixed(3) +
            '  tilt=' + r.tilt.angle_deg.toFixed(1) + 'deg' +
            '  com=' + r.centerOfMass.com_world.y.toFixed(3));
        }

        if (frameIndex >= framesToCapture) {
          clearInterval(intervalId);
          printFinalReport(reports);
          downloadReports(reports);
        }
      } catch (e) {
        clearInterval(intervalId);
        console.error('[FALL DIAG] Error at frame', frameIndex, ':', e);
      }
    }, 33); // ~30fps sampling
  }

  function printFinalReport(reports) {
    console.log('%c\n╔══════════════════════════════════════════════════╗', 'color: #00ff88; font-weight: bold');
    console.log('%c║  MULTI-FRAME FALL ANALYSIS (' + reports.length + ' frames)      ║', 'color: #00ff88; font-weight: bold');
    console.log('%c╚══════════════════════════════════════════════════╝', 'color: #00ff88; font-weight: bold');

    // Print first frame in detail
    console.log('\n%c --- FRAME 0 (initial state) ---', 'color: #88aaff');
    printReport(reports[0], 0);

    // Print last frame in detail
    console.log('\n%c --- LAST FRAME (final state) ---', 'color: #88aaff');
    printReport(reports[reports.length - 1], reports.length - 1);

    // Time series
    console.log('\n%c --- TIME SERIES ---', 'color: #ffaa00; font-weight: bold');
    console.log('Frame | Time  | RootH  | Tilt  | CoM_H | ComOff | Feets | Contacts | UpVel  | BkVel  | Flags');
    console.log('------+-------+--------+-------+-------+--------+-------+----------+--------+--------+------');
    reports.forEach(function (r) {
      var rootH = r.root.pos_world.y.toFixed(3);
      var tilt = r.tilt.angle_deg.toFixed(1);
      var comH = r.centerOfMass.com_world.y.toFixed(3);
      var comOff = r.comFootOffset_m !== undefined ? r.comFootOffset_m.toFixed(3) : 'N/A';
      var fH = '';
      ['mixamorigleftfoot', 'mixamorigrightfoot'].forEach(function (fn) {
        var f = r.feet[fn];
        if (f && f.height_world) fH += f.height_world.toFixed(2) + '/';
      });
      var cons = r.contacts.length;
      var upVel = r.root.linvel_world.y.toFixed(2);
      var bkVel = r.root.linvel_world.z.toFixed(2);
      var flags = r.summary.length > 0 ? r.summary[0].substring(0, 20) : '';
      console.log(
        String(r._frame).padStart(5) + ' | ' +
        rootH.padStart(5) + ' | ' +
        tilt.padStart(6) + ' | ' +
        comH.padStart(5) + ' | ' +
        comOff.padStart(6) + ' | ' +
        fH.padStart(5) + ' | ' +
        String(cons).padStart(8) + ' | ' +
        upVel.padStart(6) + ' | ' +
        bkVel.padStart(6) + ' | ' +
        flags
      );
    });

    // First/last floor contact
    var firstFloorContact = null;
    var lastFloorContact = null;
    reports.forEach(function (r, i) {
      var fc = r.contacts.some(function (c) { return c.geom1 === 'floor' || c.geom2 === 'floor'; });
      if (fc) {
        if (firstFloorContact === null) firstFloorContact = i;
        lastFloorContact = i;
      }
    });
    if (firstFloorContact !== null) {
      console.log('\n  First floor contact at frame:', firstFloorContact,
        '  Last at frame:', lastFloorContact);
    } else {
      console.log('\n%c  NEVER touched floor in ' + reports.length + ' frames!', 'color: #ff4444; font-weight: bold');
    }

    // Root cause analysis
    console.log('\n%c --- ROOT CAUSE ANALYSIS ---', 'color: #ff4444; font-weight: bold');
    var first = reports[0];
    var last = reports[reports.length - 1];
    var mid = reports[Math.floor(reports.length / 2)];

    var heightDrop = first.root.pos_world.y - last.root.pos_world.y;
    console.log('  Height drop:', heightDrop.toFixed(3) + 'm (' +
      first.root.pos_world.y.toFixed(3) + ' -> ' + last.root.pos_world.y.toFixed(3) + ')');

    var tiltIncrease = last.tilt.angle_deg - first.tilt.angle_deg;
    console.log('  Tilt increase:', tiltIncrease.toFixed(1) + ' deg (' +
      first.tilt.angle_deg.toFixed(1) + ' -> ' + last.tilt.angle_deg.toFixed(1) + ')');

    if (first.comFootOffset_m !== undefined) {
      console.log('  CoM behind feet (initial):', first.comFootOffset_m.toFixed(3) + 'm');
    }

    // Velocity trend
    var avgUpVel = 0, maxBackVel = 0;
    reports.forEach(function (r) {
      avgUpVel += r.root.linvel_world.y;
      if (r.root.linvel_world.z < maxBackVel) maxBackVel = r.root.linvel_world.z;
    });
    avgUpVel /= reports.length;
    console.log('  Avg upward velocity:', avgUpVel.toFixed(3) + ' m/s');
    console.log('  Max backward velocity:', maxBackVel.toFixed(3) + ' m/s');

    // CoM-behind-feet duration
    var comBehindCount = reports.filter(function (r) {
      return r.comFootOffset_m !== undefined && r.comFootOffset_m < -0.02;
    }).length;
    console.log('  Frames with CoM behind feet:', comBehindCount + '/' + reports.length);

    // Verdict
    console.log('\n%c VERDICT:', 'color: #ff4444; font-weight: bold; font-size: 13px');
    if (first.comFootOffset_m !== undefined && first.comFootOffset_m < -0.05) {
      console.log('%c  Primary: Center of mass starts ' + Math.abs(first.comFootOffset_m).toFixed(3) +
        'm BEHIND the feet', 'color: #ff4444; font-weight: bold');
      console.log('%c  The model spawns with CoM outside base of support', 'color: #ff4444');
      console.log('%c  Fix: Move foot geom forward, add ankle forward lean, or adjust mass distribution', 'color: #00ff88');
    } else if (tiltIncrease > 10) {
      console.log('%c  Primary: Progressive backward tilt (' + tiltIncrease.toFixed(1) + ' deg increase)', 'color: #ff4444; font-weight: bold');
      console.log('%c  Fix: Increase leg kp/kv, fix contact normal axis in GRF, adjust balance torque', 'color: #00ff88');
    } else if (heightDrop > 0.3) {
      console.log('%c  Primary: Vertical collapse (' + heightDrop.toFixed(3) + 'm drop)', 'color: #ff4444; font-weight: bold');
      console.log('%c  Fix: Increase leg stiffness, check actuator forces', 'color: #00ff88');
    } else if (comBehindCount > reports.length * 0.5) {
      console.log('%c  Primary: CoM persistently behind feet', 'color: #ff4444; font-weight: bold');
      console.log('%c  Fix: Adjust foot geom forward offset or mass distribution', 'color: #00ff88');
    } else {
      console.log('%c  No clear single root cause. Review time series for specific failure mode.', 'color: #ffaa00');
    }

    // Download JSON
    downloadReports(reports);
  }

  function downloadReports(reports) {
    var blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'fall_diagnosis.json'; a.click();
    URL.revokeObjectURL(url);
    console.log('\n%c JSON report downloaded as fall_diagnosis.json', 'color: #888888');

    // Also download markdown summary
    var md = generateMarkdownSummary(reports);
    var mdBlob = new Blob([md], { type: 'text/markdown' });
    var mdUrl = URL.createObjectURL(mdBlob);
    var a2 = document.createElement('a'); a2.href = mdUrl; a2.download = 'fall_diagnosis.md'; a2.click();
    URL.revokeObjectURL(mdUrl);
    console.log('%c Markdown report downloaded as fall_diagnosis.md', 'color: #888888');
  }

  function generateMarkdownSummary(reports) {
    var first = reports[0];
    var last = reports[reports.length - 1];
    var lines = [];

    lines.push('# Fall Diagnosis Report');
    lines.push('');
    lines.push('**Generated:** ' + new Date().toISOString());
    lines.push('**Frames analyzed:** ' + reports.length);
    lines.push('');

    // Model info
    lines.push('## Model');
    lines.push('| Parameter | Value |');
    lines.push('|-----------|-------|');
    lines.push('| Bodies | ' + first.modelInfo.nbody + ' |');
    lines.push('| Joints | ' + first.modelInfo.njnt + ' |');
    lines.push('| DOFs (nq/nv) | ' + first.modelInfo.nq + '/' + first.modelInfo.nv + ' |');
    lines.push('| Actuators | ' + first.modelInfo.nu + ' |');
    lines.push('| Gravity | ' + first.modelInfo.gravity.join(', ') + ' |');
    lines.push('| Timestep | ' + first.modelInfo.timestep + ' |');
    lines.push('| Integrator | ' + first.modelInfo.integrator + ' |');
    lines.push('');

    // Root cause
    lines.push('## Root Cause');
    var heightDrop = first.root.pos_world.y - last.root.pos_world.y;
    var tiltIncrease = last.tilt.angle_deg - first.tilt.angle_deg;
    lines.push('- Height drop: **' + heightDrop.toFixed(3) + 'm** (' + first.root.pos_world.y.toFixed(3) + ' -> ' + last.root.pos_world.y.toFixed(3) + ')');
    lines.push('- Tilt increase: **' + tiltIncrease.toFixed(1) + ' deg** (' + first.tilt.angle_deg.toFixed(1) + ' -> ' + last.tilt.angle_deg.toFixed(1) + ')');
    if (first.comFootOffset_m !== undefined) {
      lines.push('- CoM offset from feet (initial): **' + first.comFootOffset_m.toFixed(3) + 'm**');
    }
    lines.push('');

    // Key frame data
    lines.push('## Time Series');
    lines.push('| Frame | Root H | Tilt | CoM H | ComOff | Cons | UpVel | BkVel |');
    lines.push('|-------|--------|------|-------|--------|------|-------|-------|');
    reports.forEach(function (r) {
      lines.push('| ' + r._frame + ' | ' +
        r.root.pos_world.y.toFixed(3) + ' | ' +
        r.tilt.angle_deg.toFixed(1) + ' | ' +
        r.centerOfMass.com_world.y.toFixed(3) + ' | ' +
        (r.comFootOffset_m !== undefined ? r.comFootOffset_m.toFixed(3) : 'N/A') + ' | ' +
        r.contacts.length + ' | ' +
        r.root.linvel_world.y.toFixed(2) + ' | ' +
        r.root.linvel_world.z.toFixed(2) + ' |');
    });
    lines.push('');

    // Body masses
    lines.push('## Body Masses');
    lines.push('| Body | Mass (kg) | Height (m) |');
    lines.push('|------|-----------|------------|');
    first.bodies.forEach(function (b) {
      if (b.mass > 0.1) {
        lines.push('| ' + b.name + ' | ' + b.mass.toFixed(1) + ' | ' + b.height_world.toFixed(3) + ' |');
      }
    });
    lines.push('');

    // Joint angles (initial)
    lines.push('## Joint Angles (Frame 0, sorted by magnitude)');
    lines.push('| Joint | Angle (deg) | Range (deg) | Stiffness | Damping | Near Limit |');
    lines.push('|-------|-------------|-------------|-----------|---------|------------|');
    var jArr = Object.keys(first.joints).map(function (k) { return { name: k, j: first.joints[k] }; });
    jArr.sort(function (a, b) { return Math.abs(b.j.qpos) - Math.abs(a.j.qpos); });
    jArr.slice(0, 30).forEach(function (item) {
      var j = item.j;
      var nearLimit = '';
      if (j.range[0] !== 0 || j.range[1] !== 0) {
        var margin0 = j.qpos - j.range[0];
        var margin1 = j.range[1] - j.qpos;
        if (margin0 < 0.05 || margin1 < 0.05) nearLimit = 'YES';
      }
      lines.push('| ' + item.name + ' | ' + j.qpos_deg.toFixed(1) + ' | [' +
        j.range_deg[0].toFixed(0) + ', ' + j.range_deg[1].toFixed(0) + '] | ' +
        j.stiffness + ' | ' + j.damping + ' | ' + nearLimit + ' |');
    });
    lines.push('');

    // Foot data
    lines.push('## Foot Data');
    Object.keys(first.feet).forEach(function (name) {
      var f = first.feet[name];
      lines.push('### ' + name);
      lines.push('- Position (world): ' + JSON.stringify(f.pos_world));
      lines.push('- Height (world Y): ' + (f.height_world ? f.height_world.toFixed(4) : 'N/A'));
      if (f.geom) {
        lines.push('- Geom type: ' + f.geom.type);
        lines.push('- Geom size: ' + f.geom.size.join(', '));
        lines.push('- Geom localPos: ' + f.geom.localPos.join(', '));
        lines.push('- contype: ' + f.geom.contype + '  conaffinity: ' + f.geom.conaffinity);
      }
    });
    lines.push('');

    // Summary
    lines.push('## Diagnosis Summary');
    first.summary.forEach(function (s) { lines.push('- ' + s); });
    if (first.summary.length === 0) lines.push('- No issues detected in initial frame');
    lines.push('');

    return lines.join('\n');
  }

  // ─── Live mode ───────────────────────────────────────
  var liveFrameCount = 0;
  function diagnose_fall_live() {
    if (liveIntervalId) { clearInterval(liveIntervalId); }
    liveFrameCount = 0;
    console.log('%c[FALL DIAG LIVE] Logging every frame. Call diagnose_fall_stop() to stop.', 'color: #00ff88');
    liveIntervalId = setInterval(function () {
      try {
        var r = analyzeFrame();
        r._frame = liveFrameCount++;
        r._time = Date.now();
        console.log(
          'F=' + String(r._frame || 0).padStart(4) +
          ' h=' + r.root.pos_world.y.toFixed(3) +
          ' tilt=' + r.tilt.angle_deg.toFixed(1) +
          ' com=' + r.centerOfMass.com_world.y.toFixed(3) +
          ' cons=' + r.contacts.length +
          ' upV=' + r.root.linvel_world.y.toFixed(2) +
          ' bkV=' + r.root.linvel_world.z.toFixed(2) +
          (r.comFootOffset_m !== undefined ? ' comOff=' + r.comFootOffset_m.toFixed(3) : '')
        );
        if (r.summary.length > 0) {
          r.summary.forEach(function (s) { console.log('  > ' + s); });
        }
      } catch (e) {
        console.error('[FALL DIAG LIVE] Error:', e);
      }
    }, 100);
  }

  function diagnose_fall_stop() {
    if (liveIntervalId) {
      clearInterval(liveIntervalId);
      liveIntervalId = null;
      console.log('[FALL DIAG LIVE] Stopped.');
    }
  }

  // ─── Expose ──────────────────────────────────────────
  window.diagnose_fall = diagnose_fall;
  window.diagnose_fall_live = diagnose_fall_live;
  window.diagnose_fall_stop = diagnose_fall_stop;
  window.analyzeFrame = analyzeFrame;
  window.diagnose_ring_status = function () {
    console.log('[FALL DIAG RING] Buffer: ' + ringBuffer.length + '/' + RING_SIZE + ' frames');
    console.log('  Ring active: ' + (ringIntervalId !== null));
    console.log('  Total captured: ' + ringFrameCount);
  };

  console.log('%c[FALL DIAG] Loaded. Commands:', 'color: #00ff88; font-weight: bold');
  console.log('  diagnose_fall()        — full analysis + JSON + MD download');
  console.log('  diagnose_fall_live()   — live frame-by-frame logging');
  console.log('  diagnose_fall_stop()   — stop live mode');
  console.log('  analyzeFrame()         — single-frame snapshot');
  console.log('  diagnose_ring_status() — check ring buffer status');

  // Auto-start ring capture immediately
  startRingCapture();
})();
