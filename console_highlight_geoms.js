/**
 * console_highlight_geoms.js
 *
 * 3D edge wireframes in the Three.js scene at each MuJoCo geom's real position
 * and rotation. Labels appear only on mouse hover over a geom wireframe.
 *
 * Correct for @mujoco/mujoco v3.10+ (reordered mjtGeom enum).
 *
 * Usage:
 *   highlight_all_geoms()          — add 3D edge wireframes (pos + rot)
 *   highlight_embed()              — embed highlights into render loop (persistent live tracking)
 *   highlight_geoms_live(10)       — live update at 10fps (interval-based)
 *   stop_highlight_geoms()         — stop live mode
 *   clear_highlights()             — remove everything
 *   list()                         — print table + export JSON
 *   highlight_filter('foot')       — only highlight geoms matching a substring
 *   highlight_filter(null)         — show all geoms again
 *   check_floors()                 — compare visual vs collision floor alignment
 */

(function () {
  'use strict';

  const MJ_GEOM_TYPES = [
    'plane',      // 0
    'hfield',     // 1
    'sphere',     // 2
    'capsule',    // 3
    'ellipsoid',  // 4
    'cylinder',   // 5
    'box',        // 6
    'mesh',       // 7
    'sdf',        // 8
  ];

  const COLOR = {
    active:   0x00ff88,
    inactive: 0xff4444,
    dormant:  0x444444,
    floor:    0x88aaff,
  };

  let debugGroup = null;
  let labelContainer = null;
  let liveIntervalId = null;
  let filterSubstring = null;
  let raycaster = null;
  let mousePos = new THREE.Vector2(-9999, -9999);
  let hoveredIndex = -1;
  let labelMap = {};
  let mouseMoveHandler = null;
  let hoverLabel = null;

  // ─── Access ──────────────────────────────────────────
  function getEngine() {
    const pe = window.__SYNTHIA_PHYSICS_ENGINE__;
    if (!pe) throw new Error('window.__SYNTHIA_PHYSICS_ENGINE__ not found');
    return pe;
  }
  function getModule() { return window.__SYNTHIA_MUJOCO_MODULE__ || null; }
  function getScene() {
    const sc = window.__SYNTHIA_SCENE__;
    if (!sc) throw new Error('window.__SYNTHIA_SCENE__ not found');
    return sc;
  }
  function getCamera() {
    const cam = window.__SYNTHIA_CAMERA__;
    if (!cam) throw new Error('window.__SYNTHIA_CAMERA__ not found');
    return cam;
  }

  // ─── Coord conversion ────────────────────────────────
  function mujocoToWorld(x, y, z) {
    return new THREE.Vector3(x, z, -y);
  }

  // ─── Rotation conversion: MuJoCo geom_xmat → Three.js quaternion ──
  // geom_xmat is 9 doubles per geom (row-major 3x3 rotation matrix) in MuJoCo Z-up coords.
  // Transform: R_three = T * R_mj * T^T where T swaps Z-up → Y-up.
  var _mat4 = new THREE.Matrix4();
  var _quat = new THREE.Quaternion();
  function mujocoMatToQuat(xmat, idx) {
    // Extract 3x3 from geom_xmat (row-major: m00 m01 m02 m10 m11 m12 m20 m21 m22)
    var i0 = idx * 9;
    var r00 = xmat[i0], r01 = xmat[i0+1], r02 = xmat[i0+2];
    var r10 = xmat[i0+3], r11 = xmat[i0+4], r12 = xmat[i0+5];
    var r20 = xmat[i0+6], r21 = xmat[i0+7], r22 = xmat[i0+8];
    // Apply axis swap: R_three = T * R_mj * T^T
    // T = [1 0 0; 0 0 1; 0 -1 0], T^T = [1 0 0; 0 0 -1; 0 1 0]
    // Result row-major:
    //   [ r00, -r02,  r01]
    //   [ r20, -r22,  r21]
    //   [-r10,  r12, -r11]
    _mat4.set(
      r00, -r02,  r01, 0,
      r20, -r22,  r21, 0,
     -r10,  r12, -r11, 0,
      0,    0,    0,   1
    );
    _quat.setFromRotationMatrix(_mat4);
    return _quat.clone();
  }

  // ─── 3D -> 2D projection ─────────────────────────────
  function projectToScreen(worldPos, camera, canvas) {
    const viewMatrix = camera.matrixWorldInverse.elements;
    const projMatrix = camera.projectionMatrix.elements;
    const wx = worldPos.x, wy = worldPos.y, wz = worldPos.z;
    const vx = viewMatrix[0]*wx + viewMatrix[4]*wy + viewMatrix[8]*wz  + viewMatrix[12];
    const vy = viewMatrix[1]*wx + viewMatrix[5]*wy + viewMatrix[9]*wz  + viewMatrix[13];
    const vz = viewMatrix[2]*wx + viewMatrix[6]*wy + viewMatrix[10]*wz + viewMatrix[14];
    const vw = viewMatrix[3]*wx + viewMatrix[7]*wy + viewMatrix[11]*wz + viewMatrix[15];
    const cx = projMatrix[0]*vx + projMatrix[4]*vy + projMatrix[8]*vz  + projMatrix[12]*vw;
    const cy = projMatrix[1]*vx + projMatrix[5]*vy + projMatrix[9]*vz  + projMatrix[13]*vw;
    const cw = projMatrix[3]*vx + projMatrix[7]*vy + projMatrix[11]*vz + projMatrix[15]*vw;
    const ndcx = cx / cw, ndcy = cy / cw, ndcz = (projMatrix[2]*vx + projMatrix[6]*vy + projMatrix[10]*vz + projMatrix[14]*vw) / cw;
    return {
      x: (ndcx * 0.5 + 0.5) * canvas.clientWidth,
      y: (-ndcy * 0.5 + 0.5) * canvas.clientHeight,
      z: ndcz,
      visible: cw > 0,
    };
  }

  // ─── Shape label ─────────────────────────────────────
  function getShapeLabel(typeInt, s0, s1, s2) {
    switch (typeInt) {
      case 0: return 'plane ' + s0.toFixed(2) + 'x' + s1.toFixed(2);
      case 1: return 'hfield';
      case 2: return 'sphere r=' + s0.toFixed(3);
      case 3: return 'capsule r=' + s0.toFixed(3) + ' h=' + (s1*2).toFixed(3);
      case 4: return 'ellipsoid ' + s0.toFixed(3) + 'x' + s1.toFixed(3) + 'x' + s2.toFixed(3);
      case 5: return 'cylinder r=' + s0.toFixed(3) + ' h=' + (s1*2).toFixed(3);
      case 6: return 'box ' + s0.toFixed(3) + 'x' + s1.toFixed(3) + 'x' + s2.toFixed(3);
      case 7: return 'mesh';
      case 8: return 'sdf';
      default: return 'type_' + typeInt;
    }
  }

  // ─── Get geom name ───────────────────────────────────
  function getGeomName(module, model, i) {
    if (!module) return 'geom_' + i;
    try {
      var n = module.mj_id2name(model, module.mjtObj.mjOBJ_GEOM.value, i);
      if (n) return n;
    } catch (_) {}
    return 'geom_' + i;
  }

  // ─── Color picker ────────────────────────────────────
  function getGeomColor(name, contype, conaffinity) {
    if (name === 'floor') return COLOR.floor;
    if (contype === 0 && conaffinity === 0) return COLOR.dormant;
    if (contype > 0 || conaffinity > 0) return COLOR.active;
    return COLOR.inactive;
  }

  function getLabelColor(name, contype, conaffinity) {
    if (name === 'floor') return '#88aaff';
    if (contype === 0 && conaffinity === 0) return '#888888';
    return '#00ff88';
  }

  function getLabelBg(name, contype, conaffinity) {
    if (name === 'floor') return 'rgba(136,170,255,0.9)';
    if (contype === 0 && conaffinity === 0) return 'rgba(80,80,80,0.9)';
    return 'rgba(0,255,136,0.9)';
  }

  // ─── Create 3D geometry for a geom type ──────────────
  function createGeomGeometry(typeInt, s0, s1, s2) {
    switch (typeInt) {
      case 2: return new THREE.SphereGeometry(s0, 16, 12);
      case 3: return new THREE.CapsuleGeometry(s0, s1 * 2, 8, 16);
      case 5: return new THREE.CylinderGeometry(s0, s0, s1 * 2, 16, 1);
      case 6: return new THREE.BoxGeometry(s0 * 2, s2 * 2, s1 * 2);
      case 0: {
        var w = Math.min(s0, 50), h = Math.min(s1, 50);
        var g = new THREE.PlaneGeometry(w * 2, h * 2);
        g.rotateX(-Math.PI / 2);
        return g;
      }
      case 4: {
        var g = new THREE.SphereGeometry(1, 16, 12);
        g.scale(s0, s2, s1);
        return g;
      }
      default: return new THREE.SphereGeometry(0.03, 6, 4);
    }
  }

  // ─── Hover label (single, positioned on mouse) ───────
  function ensureHoverLabel() {
    if (hoverLabel && document.body.contains(hoverLabel)) return hoverLabel;
    hoverLabel = document.createElement('div');
    hoverLabel.id = 'mujoco-geom-hover';
    hoverLabel.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:99999;' +
      'font:bold 11px/1.2 monospace;white-space:nowrap;padding:4px 8px;border-radius:4px;' +
      'background:rgba(0,0,0,0.92);color:#00ff88;border:1px solid #00ff88;' +
      'text-shadow:0 0 2px #000;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
    document.body.appendChild(hoverLabel);
    return hoverLabel;
  }

  function showHoverLabel(idx, screenX, screenY) {
    var engine = getEngine();
    var model = engine.getModel();
    if (!model) return;
    var module = getModule();
    var typeInt = model.geom_type[idx];
    var s0 = model.geom_size[idx * 3];
    var s1 = model.geom_size[idx * 3 + 1];
    var s2 = model.geom_size[idx * 3 + 2];
    var contype = model.geom_contype[idx];
    var conaffinity = model.geom_conaffinity[idx];
    var name = getGeomName(module, model, idx);
    var dimLabel = getShapeLabel(typeInt, s0, s1, s2);
    var typeName = MJ_GEOM_TYPES[typeInt] || 'type_' + typeInt;

    var label = ensureHoverLabel();
    label.innerHTML = '<span style="color:#fff;font-weight:bold">' + idx + ': ' + name + '</span><br>' +
      '<span style="color:' + getLabelColor(name, contype, conaffinity) + '">' + typeName + ' [' + dimLabel + ']</span>';
    label.style.color = getLabelColor(name, contype, conaffinity);
    label.style.borderColor = getLabelColor(name, contype, conaffinity);

    // Position to the right of cursor, offset so it doesn't overlap
    var lx = screenX + 16;
    var ly = screenY - 10;
    // Keep within viewport
    var rect = label.getBoundingClientRect();
    if (lx + 200 > window.innerWidth) lx = screenX - 210;
    if (ly + 60 > window.innerHeight) ly = screenY - 60;
    if (ly < 0) ly = 10;
    label.style.left = lx + 'px';
    label.style.top = ly + 'px';
    label.style.display = 'block';
  }

  function hideHoverLabel() {
    if (hoverLabel) hoverLabel.style.display = 'none';
    hoveredIndex = -1;
  }

  // ─── Mouse tracking + raycaster hover ────────────────
  function onMouseMove(e) {
    var canvas = document.querySelector('canvas');
    if (!canvas) return;
    mousePos.x = (e.clientX / canvas.clientWidth) * 2 - 1;
    mousePos.y = -(e.clientY / canvas.clientHeight) * 2 + 1;
    mousePos._screenX = e.clientX;
    mousePos._screenY = e.clientY;
  }

  function checkHover() {
    if (!debugGroup || !raycaster) return;
    raycaster.setFromCamera(mousePos, getCamera());
    var hits = raycaster.intersectObjects(debugGroup.children, true);
    if (hits.length > 0) {
      // Walk up to find the mesh with userData.geomIndex
      var obj = hits[0].object;
      while (obj && obj.userData && obj.userData.geomIndex === undefined) {
        obj = obj.parent;
      }
      if (obj && obj.userData && obj.userData.geomIndex !== undefined) {
        var idx = obj.userData.geomIndex;
        if (idx !== hoveredIndex) {
          hoveredIndex = idx;
          showHoverLabel(idx, mousePos._screenX || 0, mousePos._screenY || 0);
        } else {
          // Update position even if same geom
          showHoverLabel(idx, mousePos._screenX || 0, mousePos._screenY || 0);
        }
        return;
      }
    }
    hideHoverLabel();
  }

  // ─── Build all 3D geom markers ───────────────────────
  function highlight_all_geoms() {
    clear_highlights();

    var engine = getEngine();
    var model = engine.getModel();
    var data = engine.getData();
    if (!model || !data) { console.error('[HIGHLIGHT] Model/data not available'); return; }

    var scene = getScene();
    debugGroup = new THREE.Group();
    debugGroup.name = '__GEOM_DEBUG__';
    scene.add(debugGroup);

    raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.05 };
    labelMap = {};

    var module = getModule();
    var ngeom = model.ngeom;
    var added = 0;

    for (var i = 0; i < ngeom; i++) {
      var typeInt = model.geom_type[i];
      var s0 = model.geom_size[i * 3];
      var s1 = model.geom_size[i * 3 + 1];
      var s2 = model.geom_size[i * 3 + 2];
      var posIdx = i * 3;
      var worldPos = mujocoToWorld(data.geom_xpos[posIdx], data.geom_xpos[posIdx+1], data.geom_xpos[posIdx+2]);
      var name = getGeomName(module, model, i);
      var contype = model.geom_contype[i];
      var conaffinity = model.geom_conaffinity[i];

      if (filterSubstring && !name.toLowerCase().includes(filterSubstring.toLowerCase())) continue;

      var color = getGeomColor(name, contype, conaffinity);

      // Invisible mesh for raycasting
      var geo = createGeomGeometry(typeInt, s0, s1, s2);
      var hitMat = new THREE.MeshBasicMaterial({ visible: false });
      var hitMesh = new THREE.Mesh(geo, hitMat);
      hitMesh.position.copy(worldPos);
      hitMesh.name = 'debug_' + i;
      hitMesh.userData = { geomIndex: i, geomName: name };

      // Apply rotation from geom_xmat if available
      if (data.geom_xmat) {
        hitMesh.quaternion.copy(mujocoMatToQuat(data.geom_xmat, i));
      }

      // Edge wireframe lines (visible, clean edges)
      var edges = new THREE.EdgesGeometry(geo, 15);
      var lineMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.85, depthTest: true, depthWrite: false });
      var wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.renderOrder = 998;
      hitMesh.add(wireframe);

      debugGroup.add(hitMesh);
      added++;
    }

    // Bind mouse events
    mouseMoveHandler = onMouseMove;
    document.addEventListener('mousemove', mouseMoveHandler, { passive: true });

    console.log('[HIGHLIGHT] Added ' + added + ' 3D edge wireframes (hover for labels)');
    if (filterSubstring) console.log('[HIGHLIGHT] Filter: "' + filterSubstring + '"');
  }

  // ─── Live mode ───────────────────────────────────────
  function highlight_geoms_live(fps) {
    fps = fps || 10;
    stop_highlight_geoms();
    highlight_all_geoms();
    liveIntervalId = setInterval(function () {
      updatePositions();
      checkHover();
    }, Math.round(1000 / fps));
    console.log('[HIGHLIGHT] Live mode at ~' + fps + 'fps');
  }

  function updatePositions() {
    if (!debugGroup) return;
    var engine = getEngine();
    var model = engine.getModel();
    var data = engine.getData();
    if (!model || !data) return;

    var hasXmat = !!data.geom_xmat;

    debugGroup.children.forEach(function (child) {
      if (!child.userData || child.userData.geomIndex === undefined) return;
      var idx = child.userData.geomIndex;
      var posIdx = idx * 3;
      child.position.copy(mujocoToWorld(data.geom_xpos[posIdx], data.geom_xpos[posIdx+1], data.geom_xpos[posIdx+2]));
      if (hasXmat) {
        child.quaternion.copy(mujocoMatToQuat(data.geom_xmat, idx));
      }
    });
  }

  function stop_highlight_geoms() {
    if (liveIntervalId) { clearInterval(liveIntervalId); liveIntervalId = null; }
    if (embedRafId) { cancelAnimationFrame(embedRafId); embedRafId = null; }
    console.log('[HIGHLIGHT] Live mode stopped');
  }

  // ─── Embedded live mode (requestAnimationFrame) ───────
  var embedRafId = null;
  var embedActive = false;

  function highlight_embed() {
    stop_highlight_geoms();
    highlight_all_geoms();
    embedActive = true;

    function embedLoop() {
      if (!embedActive || !debugGroup) return;
      updatePositions();
      checkHover();
      embedRafId = requestAnimationFrame(embedLoop);
    }
    embedRafId = requestAnimationFrame(embedLoop);
    console.log('[HIGHLIGHT] Embedded live mode active (requestAnimationFrame)');
    console.log('  Highlights will track geom position + rotation every frame.');
    console.log('  Call stop_highlight_geoms() to disable.');
  }

  // ─── Floor diagnostic ─────────────────────────────────
  function check_floors() {
    var engine = getEngine();
    var model = engine.getModel();
    var data = engine.getData();
    var module = getModule();
    var scene = getScene();
    if (!model || !data) { console.error('[FLOOR CHECK] Model/data not available'); return; }

    // --- 1. Find MuJoCo collision floor geom ---
    var mjFloor = null;
    for (var i = 0; i < model.ngeom; i++) {
      var name = getGeomName(module, model, i);
      if (name === 'floor') {
        mjFloor = {
          index: i,
          name: name,
          type: model.geom_type[i],
          typeName: MJ_GEOM_TYPES[model.geom_type[i]] || 'type_' + model.geom_type[i],
          size: [model.geom_size[i*3], model.geom_size[i*3+1], model.geom_size[i*3+2]],
          pos_mujoco: [data.geom_xpos[i*3], data.geom_xpos[i*3+1], data.geom_xpos[i*3+2]],
          pos_world: mujocoToWorld(data.geom_xpos[i*3], data.geom_xpos[i*3+1], data.geom_xpos[i*3+2]),
          contype: model.geom_contype[i],
          conaffinity: model.geom_conaffinity[i],
        };
        break;
      }
    }

    // --- 2. Find Three.js visual floor ---
    // Prefer the authoritative reference from WorldEngine
    var threeFloor = null;
    var floorMesh = window.__SYNTHIA_FLOOR_MESH__;
    if (floorMesh && floorMesh.geometry) {
      var worldPos = new THREE.Vector3();
      var worldQuat = new THREE.Quaternion();
      floorMesh.getWorldPosition(worldPos);
      floorMesh.getWorldQuaternion(worldQuat);
      threeFloor = {
        name: floorMesh.name || '(worldEngine floor)',
        visible: floorMesh.visible,
        position: { x: floorMesh.position.x, y: floorMesh.position.y, z: floorMesh.position.z },
        rotation: { x: floorMesh.rotation.x, y: floorMesh.rotation.y, z: floorMesh.rotation.z },
        scale: { x: floorMesh.scale.x, y: floorMesh.scale.y, z: floorMesh.scale.z },
        geoSize: floorMesh.geometry.parameters ? {
          width: floorMesh.geometry.parameters.width,
          height: floorMesh.geometry.parameters.height,
        } : null,
        worldPos: worldPos,
        worldQuat: worldQuat,
      };
    } else {
      // Fallback: scan scene for a large PlaneGeometry at origin (likely the floor)
      scene.traverse(function (obj) {
        if (threeFloor) return;
        if (obj.isMesh && obj.geometry && obj.geometry.type === 'PlaneGeometry') {
          var params = obj.geometry.parameters;
          if (params && params.width >= 500 && params.height >= 500) {
            var wp = new THREE.Vector3();
            var wq = new THREE.Quaternion();
            obj.getWorldPosition(wp);
            obj.getWorldQuaternion(wq);
            threeFloor = {
              name: obj.name || '(scene PlaneGeometry)',
              visible: obj.visible,
              position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
              rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
              scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
              geoSize: { width: params.width, height: params.height },
              worldPos: wp,
              worldQuat: wq,
            };
          }
        }
      });
    }

    // --- 3. Report ---
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('  FLOOR ALIGNMENT CHECK');
    console.log('══════════════════════════════════════════════════');

    if (!mjFloor) {
      console.warn('[FLOOR CHECK] No MuJoCo geom named "floor" found!');
    } else {
      console.log('');
      console.log('▸ MuJoCo Collision Floor (physics):');
      console.log('  Type:', mjFloor.typeName, '(' + mjFloor.type + ')');
      console.log('  Size (half-extents):', mjFloor.size.map(function(v){return v.toFixed(3)}).join(' × '));
      console.log('  Pos (MuJoCo):', mjFloor.pos_mujoco.map(function(v){return v.toFixed(4)}).join(', '));
      console.log('  Pos (Three.js):', '(' + mjFloor.pos_world.x.toFixed(4) + ', ' + mjFloor.pos_world.y.toFixed(4) + ', ' + mjFloor.pos_world.z.toFixed(4) + ')');
      console.log('  contype:', mjFloor.contype, '  conaffinity:', mjFloor.conaffinity);
    }

    if (!threeFloor) {
      console.warn('[FLOOR CHECK] No Three.js floor found! (checked __SYNTHIA_FLOOR_MESH__ and scene scan)');
    } else {
      console.log('');
      console.log('▸ Three.js Visual Floor (rendering):');
      console.log('  Source:', floorMesh ? '__SYNTHIA_FLOOR_MESH__ (authoritative)' : 'scene scan (fallback)');
      console.log('  Name:', threeFloor.name);
      console.log('  Visible:', threeFloor.visible);
      console.log('  Geo size:', threeFloor.geoSize ? (threeFloor.geoSize.width + ' × ' + threeFloor.geoSize.height) : '(unknown)');
      console.log('  Position:', '(' + threeFloor.position.x.toFixed(4) + ', ' + threeFloor.position.y.toFixed(4) + ', ' + threeFloor.position.z.toFixed(4) + ')');
      console.log('  Rotation (euler):', '(' + (threeFloor.rotation.x * 180 / Math.PI).toFixed(2) + '°, ' + (threeFloor.rotation.y * 180 / Math.PI).toFixed(2) + '°, ' + (threeFloor.rotation.z * 180 / Math.PI).toFixed(2) + '°)');
    }

    // --- 4. Alignment comparison ---
    if (mjFloor && threeFloor) {
      console.log('');
      console.log('▸ Alignment:');

      var mjY = mjFloor.pos_world.y;
      var visY = threeFloor.position.y;
      var heightDiff = Math.abs(mjY - visY);
      var heightOk = heightDiff < 0.001;

      console.log('  Height:  MuJoCo=' + mjY.toFixed(4) + '  Three.js=' + visY.toFixed(4) +
        '  Δ=' + heightDiff.toFixed(6) + (heightOk ? '  ✓ ALIGNED' : '  ✗ MISMATCH'));

      var mjRotOk = Math.abs(threeFloor.rotation.x - (-Math.PI/2)) < 0.001;
      console.log('  Rotation: Three.js PlaneGeometry rot.x=' + (threeFloor.rotation.x * 180 / Math.PI).toFixed(2) + '°' +
        (mjRotOk ? '  ✓ (horizontal plane)' : '  ? (non-standard rotation)'));

      var mjWidth = mjFloor.size[0] * 2;
      var mjHeight = mjFloor.size[1] * 2;
      var visWidth = threeFloor.geoSize ? threeFloor.geoSize.width : 0;
      var visHeight = threeFloor.geoSize ? threeFloor.geoSize.height : 0;
      console.log('  Size:    MuJoCo=' + mjWidth.toFixed(0) + '×' + mjHeight.toFixed(0) +
        '  Three.js=' + visWidth + '×' + visHeight +
        (visWidth >= mjWidth && visHeight >= mjHeight ? '  ✓ (visual covers collision)' : '  ⚠ visual smaller than collision'));

      console.log('');
      if (heightOk) {
        console.log('  RESULT: Floors are on the same level ✓');
      } else {
        console.log('  RESULT: Floors are at DIFFERENT heights ✗ (Δ=' + heightDiff.toFixed(4) + ')');
      }
    } else {
      console.log('');
      console.log('  RESULT: Cannot compare — ' +
        (!mjFloor ? 'missing MuJoCo floor' : '') +
        (!threeFloor ? 'missing Three.js floor' : ''));
    }
    console.log('══════════════════════════════════════════════════');
    console.log('');

    return { mujocoFloor: mjFloor, threeFloor: threeFloor };
  }

  // ─── Clear ───────────────────────────────────────────
  function clear_highlights() {
    if (liveIntervalId) { clearInterval(liveIntervalId); liveIntervalId = null; }
    if (embedRafId) { cancelAnimationFrame(embedRafId); embedRafId = null; }
    embedActive = false;
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler);
      mouseMoveHandler = null;
    }
    hideHoverLabel();
    if (debugGroup) {
      debugGroup.children.forEach(function (c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
        c.children.forEach(function (child) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      });
      getScene().remove(debugGroup);
      debugGroup = null;
    }
    raycaster = null;
    labelMap = {};
    hoveredIndex = -1;
    console.log('[HIGHLIGHT] Cleared');
  }

  // ─── Filter ──────────────────────────────────────────
  function highlight_filter(substring) {
    filterSubstring = substring;
    console.log(substring ? '[HIGHLIGHT] Filter: "' + substring + '"' : '[HIGHLIGHT] Filter cleared');
    highlight_all_geoms();
  }

  // ─── list() ──────────────────────────────────────────
  function list() {
    var engine = getEngine();
    var model = engine.getModel();
    var data = engine.getData();
    var module = getModule();
    if (!model || !data) { console.error('[HIGHLIGHT] Model/data not available'); return; }

    var ngeom = model.ngeom;
    var rows = [], table = [];

    for (var i = 0; i < ngeom; i++) {
      var typeInt = model.geom_type[i];
      var typeName = MJ_GEOM_TYPES[typeInt] || 'type_' + typeInt;
      var s0 = model.geom_size[i*3], s1 = model.geom_size[i*3+1], s2 = model.geom_size[i*3+2];
      var posIdx = i*3;
      var x = data.geom_xpos[posIdx], y = data.geom_xpos[posIdx+1], z = data.geom_xpos[posIdx+2];
      var bodyId = model.geom_bodyid[i];
      var contype = model.geom_contype[i], conaffinity = model.geom_conaffinity[i];
      var name = getGeomName(module, model, i);
      var bodyName = 'body_' + bodyId;
      if (module) { try { var b = module.mj_id2name(model, module.mjtObj.mjOBJ_BODY.value, bodyId); if (b) bodyName = b; } catch (_) {} }

      var dimLabel = getShapeLabel(typeInt, s0, s1, s2);
      rows.push({ id: i, name: name, body: bodyName, type: typeName, typeInt: typeInt, size: {s0:s0,s1:s1,s2:s2}, size_description: dimLabel,
        position_mujoco: { x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4) },
        position_world: { x: +x.toFixed(4), y: +z.toFixed(4), z: +(-y).toFixed(4) },
        contype: contype, conaffinity: conaffinity });
      table.push({ '#': i, name: name.substring(0,35), body: bodyName.substring(0,20), type: typeName, dims: dimLabel,
        pos: '(' + x.toFixed(2) + ', ' + y.toFixed(2) + ', ' + z.toFixed(2) + ')', ct: contype, ca: conaffinity });
    }

    console.table(table);
    console.log('Total geoms: ' + ngeom);
    window.__MUJOCO_GEOMS__ = rows;
    var blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'mujoco_geoms.json'; a.click(); URL.revokeObjectURL(url);
    return rows;
  }

  // ─── Expose ──────────────────────────────────────────
  window.highlight_all_geoms = highlight_all_geoms;
  window.highlight_embed = highlight_embed;
  window.highlight_geoms_live = highlight_geoms_live;
  window.stop_highlight_geoms = stop_highlight_geoms;
  window.clear_highlights = clear_highlights;
  window.highlight_filter = highlight_filter;
  window.check_floors = check_floors;
  window.list = list;

  console.log('[HIGHLIGHT] Edge wireframes + hover labels loaded (v3.10+ enum, live rotation)');
  console.log('  highlight_all_geoms()          — add 3D edge wireframes (pos + rot)');
  console.log('  highlight_embed()              — persistent live tracking via rAF');
  console.log('  highlight_geoms_live(10)       — live update at 10fps (interval)');
  console.log('  stop_highlight_geoms()         — stop live mode');
  console.log('  clear_highlights()             — remove all');
  console.log('  highlight_filter("foot")       — only show geoms matching "foot"');
  console.log('  highlight_filter(null)         — show all');
  console.log('  check_floors()                 — compare visual vs collision floor');
  console.log('  list()                         — table + JSON export');
})();
