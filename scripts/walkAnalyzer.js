/**
 * WALK ANIMATION TOOLKIT — paste into browser console
 *
 * Commands:
 *   analyzeWalk()          — summary report
 *   analyzeWalk(true)      — verbose per-frame table
 *   playWalk()             — play walk on agent_0 (starts the model walking)
 *   stopWalk()             — stop walk + reset pose
 *   walkStatus()           — print current walk state
 */
(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // CONFIG — tweak these
  // ═══════════════════════════════════════════════════════════════════
  const WALK_JSON = '/animations/mixamo-walking-synthia.json';
  const DISCONTINUITY_THRESHOLD = 0.5;
  const SYMMETRY_EXPECTED_OFFSET_FRAMES = 16;

  // ═══════════════════════════════════════════════════════════════════
  // BONE LIMITS (copied from rigConstraints.ts)
  // ═══════════════════════════════════════════════════════════════════
  const LIMITS = {
    mixamorighips:           { x: [-Infinity, Infinity], y: [-Infinity, Infinity], z: [-Infinity, Infinity] },
    mixamorigspine:          { x: [-0.524, 0.785],      y: [-0.524, 0.524],       z: [-0.524, 0.524] },
    mixamorigspine1:         { x: [-0.524, 0.524],      y: [-0.524, 0.524],       z: [-0.524, 0.524] },
    mixamorigspine2:         { x: [-0.524, 0.524],      y: [-0.524, 0.524],       z: [-0.524, 0.524] },
    mixamorigneck:           { x: [-1.047, 1.047],      y: [-1.222, 1.222],       z: [-1.047, 1.047] },
    mixamorighead:           { x: [-1.047, 1.047],      y: [-1.047, 1.047],       z: [-1.047, 1.047] },
    mixamorigleftshoulder:   { x: [-0.261, 0.261],      y: [-0.261, 0.261],       z: [-0.261, 0.261] },
    mixamorigrightshoulder:  { x: [-0.261, 0.261],      y: [-0.261, 0.261],       z: [-0.261, 0.261] },
    mixamorigleftarm:        { x: [-2.356, 2.356],      y: [-1.57, 1.57],         z: [-1.57, 1.57] },
    mixamorigrightarm:       { x: [-2.356, 2.356],      y: [-1.57, 1.57],         z: [-1.57, 1.57] },
    mixamorigleftforearm:    { x: [0.0, 2.531],         y: [0.0, 0.0],            z: [0.0, 0.0] },
    mixamorigrightforearm:   { x: [0.0, 2.531],         y: [0.0, 0.0],            z: [0.0, 0.0] },
    mixamoriglefthand:       { x: [-1.396, 1.396],      y: [0.0, 0.0],            z: [-0.349, 0.349] },
    mixamorigrighthand:      { x: [-1.396, 1.396],      y: [0.0, 0.0],            z: [-0.349, 0.349] },
    mixamorigleftupleg:      { x: [-2.094, 2.094],      y: [-2.094, 2.094],       z: [-2.094, 2.094] },
    mixamorigrightupleg:     { x: [-2.094, 2.094],      y: [-2.094, 2.094],       z: [-2.094, 2.094] },
    mixamorigleftleg:        { x: [-2.618, 0.0],        y: [0.0, 0.0],            z: [0.0, 0.0] },
    mixamorigrightleg:       { x: [-2.618, 0.0],        y: [0.0, 0.0],            z: [0.0, 0.0] },
    mixamorigleftfoot:       { x: [-0.785, 0.785],      y: [0.0, 0.0],            z: [-0.785, 0.785] },
    mixamorigrightfoot:      { x: [-0.785, 0.785],      y: [0.0, 0.0],            z: [-0.785, 0.785] },
    mixamoriglefttoebase:    { x: [-1.745, 0.0],        y: [0.0, 0.0],            z: [0.0, 0.0] },
    mixamorigrighttoebase:   { x: [-1.745, 0.0],        y: [0.0, 0.0],            z: [0.0, 0.0] },
  };

  const FINGER_LIMIT = { x: [0.0, 1.745], y: [0.0, 0.0], z: [0.0, 0.0] };
  function getLimit(bone) {
    if (LIMITS[bone]) return LIMITS[bone];
    if (bone.includes('hand') && (bone.includes('thumb') || bone.includes('index') ||
        bone.includes('middle') || bone.includes('ring') || bone.includes('pinky'))) {
      return FINGER_LIMIT;
    }
    return null;
  }

  const PAIRS = [
    ['mixamorigleftupleg', 'mixamorigrightupleg'],
    ['mixamorigleftleg', 'mixamorigrightleg'],
    ['mixamorigleftfoot', 'mixamorigrightfoot'],
    ['mixamorigleftarm', 'mixamorigrightarm'],
    ['mixamorigleftforearm', 'mixamorigrightforearm'],
    ['mixamoriglefthand', 'mixamorigrighthand'],
    ['mixamorigleftshoulder', 'mixamorigrightshoulder'],
    ['mixamoriglefttoebase', 'mixamorigrighttoebase'],
  ];

  // ═══════════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════
  const R = (v, d = 3) => typeof v === 'number' ? v.toFixed(d) : String(v);

  let _cachedArtifact = null;
  async function loadArtifact() {
    if (_cachedArtifact) return _cachedArtifact;
    const res = await fetch(WALK_JSON);
    if (!res.ok) throw new Error('Failed to fetch ' + WALK_JSON + ': HTTP ' + res.status);
    _cachedArtifact = await res.json();
    return _cachedArtifact;
  }

  // ═══════════════════════════════════════════════════════════════════
  // analyzeWalk(verbose?)
  // ═══════════════════════════════════════════════════════════════════
  window.analyzeWalk = async function(verbose) {
    const artifact = await loadArtifact();
    const { metadata: meta, sequence, rootMotion } = artifact;

    if (!sequence?.length) throw new Error('No sequence[] in artifact');
    if (!rootMotion?.length) throw new Error('No rootMotion[] in artifact');
    if (sequence.length !== rootMotion.length) {
      throw new Error('Mismatch: sequence=' + sequence.length + ', rootMotion=' + rootMotion.length);
    }
    if (sequence.length < 2) throw new Error('Need at least 2 frames');

    const sorted = sequence.slice().sort((a, b) => a.timeOffsetMs - b.timeOffsetMs);
    const tickMs = 1000 / (meta.fps || 30);
    const totalMs = sorted[sorted.length - 1].timeOffsetMs;
    const numSteps = Math.ceil(totalMs / tickMs);

    const boneNames = new Set();
    for (const f of sorted) {
      for (const k of Object.keys(f.overrides || {})) boneNames.add(k);
    }

    const prevValues = {};
    const clampViolations = [];
    const discontinuities = [];
    const perFrameData = [];
    let totalDx = 0, totalDz = 0;

    for (let step = 0; step < numSteps; step++) {
      const elapsed = step * tickMs;
      let activeIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].timeOffsetMs <= elapsed) activeIdx = i;
        else break;
      }
      if (activeIdx < 0) activeIdx = 0;

      const activeFrame = sorted[activeIdx];
      const nextFrame = activeIdx + 1 < sorted.length ? sorted[activeIdx + 1] : null;
      const interpolated = {};

      if (nextFrame) {
        const duration = nextFrame.timeOffsetMs - activeFrame.timeOffsetMs;
        const t = duration > 0 ? Math.max(0, Math.min(1, (elapsed - activeFrame.timeOffsetMs) / duration)) : 1;
        const allKeys = new Set([
          ...Object.keys(activeFrame.overrides || {}),
          ...Object.keys(nextFrame.overrides || {}),
        ]);
        for (const key of allKeys) {
          const sv = activeFrame.overrides?.[key];
          const ev = nextFrame.overrides?.[key];
          if (sv !== undefined && ev !== undefined) {
            if (typeof sv === 'number' && typeof ev === 'number') {
              interpolated[key] = sv + (ev - sv) * t;
            } else if (Array.isArray(sv) && Array.isArray(ev) && sv.length === 3 && ev.length === 3) {
              interpolated[key] = [
                sv[0] + (ev[0] - sv[0]) * t,
                sv[1] + (ev[1] - sv[1]) * t,
                sv[2] + (ev[2] - sv[2]) * t,
              ];
            } else {
              interpolated[key] = ev;
            }
          } else if (ev !== undefined) {
            interpolated[key] = ev;
          } else if (sv !== undefined) {
            interpolated[key] = sv;
          }
        }
      } else {
        Object.assign(interpolated, activeFrame.overrides || {});
      }

      const rmIdx = Math.min(step + 1, rootMotion.length - 1);
      const rm = rootMotion[rmIdx] || { dx: 0, dz: 0 };
      totalDx += rm.dx || 0;
      totalDz += rm.dz || 0;

      perFrameData.push({ frame: step, t: elapsed, overrides: interpolated, rootDx: rm.dx, rootDz: rm.dz });

      for (const [bone, val] of Object.entries(interpolated)) {
        const limit = getLimit(bone);
        if (!limit) continue;
        const axes = typeof val === 'number' ? [{ axis: 'x', v: val }] :
                     Array.isArray(val) ? [{ axis: 'x', v: val[0] }, { axis: 'y', v: val[1] }, { axis: 'z', v: val[2] }] : [];
        for (const { axis, v } of axes) {
          if (v === undefined || v === null) continue;
          const [lo, hi] = limit[axis] || [-Infinity, Infinity];
          if (v < lo - 0.001 || v > hi + 0.001) {
            clampViolations.push({ bone, frame: step, axis, value: v, min: lo, max: hi });
          }
          const prev = prevValues[bone];
          if (prev !== undefined) {
            const pv = typeof prev === 'number' ? prev : (Array.isArray(prev) ? prev['xyz'.indexOf(axis)] : 0);
            const delta = Math.abs(v - (pv || 0));
            if (delta > DISCONTINUITY_THRESHOLD) {
              discontinuities.push({ bone, frame: step, delta, threshold: DISCONTINUITY_THRESHOLD });
            }
          }
        }
        prevValues[bone] = val;
      }
    }

    const symmetryResults = [];
    for (const [left, right] of PAIRS) {
      const leftPitch = perFrameData.map(f => {
        const v = f.overrides[left];
        if (typeof v === 'number') return v;
        if (Array.isArray(v)) return v[0];
        return 0;
      });
      const rightPitch = perFrameData.map(f => {
        const v = f.overrides[right];
        if (typeof v === 'number') return v;
        if (Array.isArray(v)) return v[0];
        return 0;
      });
      let bestOffset = 0, bestCorr = -Infinity;
      for (let off = 0; off < perFrameData.length; off++) {
        let corr = 0;
        for (let i = 0; i < perFrameData.length; i++) {
          corr += leftPitch[i] * rightPitch[(i + off) % perFrameData.length];
        }
        if (corr > bestCorr) { bestCorr = corr; bestOffset = off; }
      }
      symmetryResults.push({
        left, right,
        offsetFrames: bestOffset,
        expected: SYMMETRY_EXPECTED_OFFSET_FRAMES,
        ok: Math.abs(bestOffset - SYMMETRY_EXPECTED_OFFSET_FRAMES) <= 3,
      });
    }

    const firstFrame = sorted[0].overrides || {};
    const lastFrame = sorted[sorted.length - 1].overrides || {};
    let maxSeamDelta = 0, worstSeamBone = '';
    for (const bone of Object.keys(firstFrame)) {
      const fv = firstFrame[bone], lv = lastFrame[bone];
      if (fv === undefined || lv === undefined) continue;
      if (typeof fv === 'number' && typeof lv === 'number') {
        const d = Math.abs(fv - lv);
        if (d > maxSeamDelta) { maxSeamDelta = d; worstSeamBone = bone; }
      } else if (Array.isArray(fv) && Array.isArray(lv)) {
        for (let i = 0; i < 3; i++) {
          const d = Math.abs((fv[i] || 0) - (lv[i] || 0));
          if (d > maxSeamDelta) { maxSeamDelta = d; worstSeamBone = bone; }
        }
      }
    }

    const actualForward = Math.sqrt(totalDx * totalDx + totalDz * totalDz);
    const expectedForward = meta.forwardSpeedMps * (meta.frames / (meta.fps || 30));
    const forwardDelta = Math.abs(actualForward - expectedForward);

    const boneMaxDelta = {};
    for (const d of discontinuities) {
      if (!boneMaxDelta[d.bone] || d.delta > boneMaxDelta[d.bone].delta) boneMaxDelta[d.bone] = d;
    }
    const sortedByDelta = Object.entries(boneMaxDelta)
      .sort(([, a], [, b]) => b.delta - a.delta).slice(0, 10);

    // ── OUTPUT ──
    console.log('');
    console.log('WALK ANALYSIS \u2014 ' + meta.frames + ' frames @ ' + (meta.fps || 30) + 'fps (' + (meta.frames / (meta.fps || 30)).toFixed(3) + 's)');
    console.log('Forward: ' + R(actualForward) + 'm | Expected: ' + R(expectedForward) + 'm | Speed: ' + R(meta.forwardSpeedMps) + ' m/s ' + (forwardDelta < 0.05 ? '\u2713' : '\u26A0 \u0394=' + R(forwardDelta)));
    console.log('');

    if (clampViolations.length === 0) {
      console.log('CLAMP VIOLATIONS: none \u2713');
    } else {
      console.log('CLAMP VIOLATIONS (' + clampViolations.length + '):');
      const grouped = {};
      for (const v of clampViolations) {
        const key = v.bone + '.' + v.axis;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(v);
      }
      for (const [key, violations] of Object.entries(grouped)) {
        const frames = violations.map(v => v.frame).join(', ');
        const sample = violations[0];
        const dir = sample.value < sample.min ? 'UNDER' : 'OVER';
        console.log('  ' + key.padEnd(30) + ' frames [' + frames + ']  val=' + R(sample.value) + '  limit=[' + R(sample.min) + ', ' + R(sample.max) + ']  ' + dir);
      }
    }
    console.log('');

    if (sortedByDelta.length === 0) {
      console.log('SMOOTHNESS: all bones below ' + DISCONTINUITY_THRESHOLD + ' rad/frame \u2713');
    } else {
      console.log('SMOOTHNESS \u2014 worst bones (threshold ' + DISCONTINUITY_THRESHOLD + ' rad/frame):');
      for (const [bone, info] of sortedByDelta) {
        const flag = info.delta > DISCONTINUITY_THRESHOLD ? '\u26A0' : '\u2713';
        console.log('  ' + bone.padEnd(30) + ' max \u0394 ' + R(info.delta) + ' @ frame ' + info.frame + '  ' + flag);
      }
    }
    console.log('');

    console.log('LOOP SEAM: max \u0394 ' + R(maxSeamDelta) + ' rad (' + worstSeamBone + ') ' + (maxSeamDelta < 0.01 ? '\u2713' : '\u26A0'));
    console.log('');

    console.log('PHASE SYMMETRY:');
    for (const s of symmetryResults) {
      const flag = s.ok ? '\u2713' : '\u26A0';
      const shortL = s.left.replace('mixamorig', '');
      const shortR = s.right.replace('mixamorig', '');
      console.log('  ' + (shortL + '/' + shortR).padEnd(28) + s.offsetFrames + ' frames offset (expect ~' + s.expected + ') ' + flag);
    }

    if (verbose) {
      console.log('');
      console.log('\u2550'.repeat(63));
      console.log('  VERBOSE \u2014 PER-FRAME JOINT VALUES');
      console.log('\u2550'.repeat(63));
      const printBones = [...boneNames].filter(b => !b.includes('hand') || b.includes('shoulder')).sort();
      const hdr = 'FRAME'.padEnd(10) + 't'.padEnd(8) + printBones.map(b => b.replace('mixamorig', '').substring(0, 10).padStart(12)).join('');
      console.log(hdr);
      console.log('-'.repeat(hdr.length));
      for (const fd of perFrameData) {
        let line = ('F' + fd.frame).padEnd(10) + (R(fd.t, 0) + 'ms').padEnd(8);
        for (const bone of printBones) {
          const v = fd.overrides[bone];
          let display = '-';
          if (typeof v === 'number') display = R(v, 2);
          else if (Array.isArray(v)) display = '[' + v.map(n => R(n, 2)).join(',') + ']';
          line += display.padStart(12);
        }
        console.log(line);
      }
    }

    window.__WALK_ANALYSIS__ = {
      clampViolations, discontinuities, symmetryResults,
      loopSeam: { maxDelta: maxSeamDelta, bone: worstSeamBone },
      rootMotion: { actualForward, expectedForward, delta: forwardDelta },
      perFrameData, artifact,
    };
    console.log('');
    console.log('Full data stored in window.__WALK_ANALYSIS__');
  };

  // ═══════════════════════════════════════════════════════════════════
  // PLAYBACK ENGINE
  // ═══════════════════════════════════════════════════════════════════
  let _walkInterval = null;
  let _walkTick = 0;
  let _walkArtifact = null;

  function dispatchAction(agentId, sequence) {
    window.dispatchEvent(
      new CustomEvent('synthia:action', {
        detail: { agentId: agentId, sequence: sequence, activeGaitPhase: true },
      })
    );
  }

  function dispatchRootMotion(agentId, dx, dz) {
    window.dispatchEvent(
      new CustomEvent('synthia:rootMotion', { detail: { agentId: agentId, dx: dx, dz: dz } })
    );
  }

  function dispatchResetPose(agentId) {
    window.dispatchEvent(
      new CustomEvent('synthia:resetPose', { detail: { agentId: agentId } })
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // playWalk(agentId?)
  // ═══════════════════════════════════════════════════════════════════
  window.playWalk = async function(agentId) {
    agentId = agentId || 'agent_0';

    // Stop any existing walk first
    if (_walkInterval) {
      window.clearInterval(_walkInterval);
      _walkInterval = null;
    }

    _walkArtifact = await loadArtifact();
    const { metadata: meta, sequence, rootMotion } = _walkArtifact;

    if (sequence.length < 2 || rootMotion.length !== sequence.length) {
      throw new Error('Artifact mismatch: sequence=' + sequence.length + ', rootMotion=' + rootMotion.length);
    }

    // Dispatch the full sequence immediately — the binder's syncVisuals
    // timeline stepper handles frame-by-frame interpolation
    dispatchAction(agentId, sequence);

    const fps = meta.fps || 30;
    const frames = meta.frames || sequence.length;
    const tickMs = 1000 / fps;

    _walkTick = 0;

    _walkInterval = window.setInterval(function() {
      const inCycle = _walkTick % frames;

      // Re-dispatch sequence at the start of each cycle (loop seam)
      if (inCycle === 0 && _walkTick > 0) {
        dispatchAction(agentId, sequence);
      }

      // Root motion delta — index mirrors the pose stream
      const deltaIndex = inCycle + 1;
      const delta = rootMotion[Math.min(deltaIndex, rootMotion.length - 1)] || { dx: 0, dz: 0 };
      if (delta.dx !== 0 || delta.dz !== 0) {
        dispatchRootMotion(agentId, delta.dx, delta.dz);
      }

      _walkTick++;
    }, tickMs);

    console.log('[WALK] Playing on ' + agentId + ' \u2014 ' + frames + ' frames @ ' + fps + 'fps');
    console.log('[WALK] Speed: ' + meta.forwardSpeedMps + ' m/s | Cycle: ' + (frames / fps).toFixed(3) + 's');
    console.log('[WALK] Use stopWalk() to stop');
  };

  // ═══════════════════════════════════════════════════════════════════
  // stopWalk(agentId?)
  // ═══════════════════════════════════════════════════════════════════
  window.stopWalk = function(agentId) {
    agentId = agentId || 'agent_0';

    if (_walkInterval) {
      window.clearInterval(_walkInterval);
      _walkInterval = null;
    }
    _walkTick = 0;
    _walkArtifact = null;

    dispatchResetPose(agentId);
    console.log('[WALK] Stopped on ' + agentId + ' \u2014 pose reset');
  };

  // ═══════════════════════════════════════════════════════════════════
  // walkStatus()
  // ═══════════════════════════════════════════════════════════════════
  window.walkStatus = function() {
    if (!_walkInterval) {
      console.log('[WALK] Not playing');
      return;
    }
    const meta = _walkArtifact?.metadata;
    const frames = meta?.frames || 32;
    const fps = meta?.fps || 30;
    const cycle = (_walkTick % frames);
    const elapsed = (_walkTick * (1000 / fps) / 1000).toFixed(2);
    console.log('[WALK] Playing \u2014 tick ' + _walkTick + ' | frame ' + cycle + '/' + frames + ' | ' + elapsed + 's elapsed');
  };

  console.log('');
  console.log('WALK TOOLKIT loaded \u2014 commands:');
  console.log('  analyzeWalk()      \u2014 analyze JSON data');
  console.log('  analyzeWalk(true)  \u2014 verbose per-frame');
  console.log('  playWalk()         \u2014 start walking on agent_0');
  console.log('  stopWalk()         \u2014 stop + reset pose');
  console.log('  walkStatus()       \u2014 print current state');
})();
