(function() {
  'use strict';
  const DEG = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  // ── Embedded Action Recorder & Exporter ───────────────────────────────────
  const Recorder = (function() {
    function radToDegOverrides(overrides) {
      const out = {};
      for (const [k, v] of Object.entries(overrides || {})) {
        if (Array.isArray(v)) {
          out[k] = v.map(x => Math.round(x * RAD2DEG));
        } else if (typeof v === 'number') {
          out[k] = Math.round(v * RAD2DEG);
        }
      }
      return out;
    }

    function downloadJSON(data, filename) {
      try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[Recorder] Downloaded: ${filename}`);
      } catch (e) {
        console.error('[Recorder] Export failed:', e);
      }
    }

    return {
      recordSequence: function(id, title, summary, biomechanics, sequence, autoExport = true) {
        const recipe = {
          id: `expressive_${id}`,
          category: 'expressive',
          title: title,
          disclaimer: 'SUGGESTION ONLY: Reference motion recorded from baseline scripts. Adapt angles dynamically.',
          summary: summary || `Expressive sequence for ${title}.`,
          biomechanics_note: biomechanics || 'Maintains body balance while articulating target limbs.',
          parameters: {
            cycleDurationMs: sequence.length > 0 ? sequence[sequence.length - 1].timeOffsetMs : 0,
            balanceMode: 'auto'
          },
          steps: sequence.map((f, idx) => ({
            phase: `Frame ${idx + 1} (${f.timeOffsetMs}ms)`,
            timeOffsetMs: f.timeOffsetMs,
            commentary: `Milestone frame at ${f.timeOffsetMs}ms`,
            overrides: radToDegOverrides(f.overrides)
          }))
        };
        console.log(`[Recorder] Recorded expressive sequence: ${title}`, recipe);
        if (typeof window.synthiaRegisterRecipe === 'function') {
          window.synthiaRegisterRecipe(recipe);
        }
        if (autoExport) {
          downloadJSON(recipe, `motor_codex_expressive_${id}.json`);
        }
        return recipe;
      }
    };
  })();

  function sendPose(overrides, durationMs = 0, agentId = 'agent_0') {
    if (durationMs > 0) {
      window.dispatchEvent(new CustomEvent('synthia:action', {
        detail: { sequence: [{ timeOffsetMs: durationMs, overrides }], agentId }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('synthia:action', {
        detail: { jointOverrides: overrides, agentId }
      }));
    }
  }

  function sendSequence(sequence, agentId = 'agent_0') {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { sequence, agentId }
    }));
  }

  window.synthiaLookAround = function(durationMs = 3000, agentId = 'agent_0', autoRecord = true) {
    const seq = [
      { timeOffsetMs: 0,               overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { timeOffsetMs: 200,             overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { timeOffsetMs: durationMs * 0.25, overrides: { mixamorigneck: [0, 0, -10 * DEG], mixamorighead: [0, 0, -25 * DEG] } },
      { timeOffsetMs: durationMs * 0.38, overrides: { mixamorigneck: [0, 0, -10 * DEG], mixamorighead: [0, 0, -25 * DEG] } },
      { timeOffsetMs: durationMs * 0.50, overrides: { mixamorigneck: [-4 * DEG, 0, 0],  mixamorighead: [-8 * DEG, 0, 0] } },
      { timeOffsetMs: durationMs * 0.63, overrides: { mixamorigneck: [-4 * DEG, 0, 0],  mixamorighead: [-8 * DEG, 0, 0] } },
      { timeOffsetMs: durationMs * 0.75, overrides: { mixamorigneck: [0, 0, 10 * DEG],  mixamorighead: [0, 0, 25 * DEG] } },
      { timeOffsetMs: durationMs * 0.88, overrides: { mixamorigneck: [0, 0, 10 * DEG],  mixamorighead: [0, 0, 25 * DEG] } },
      { timeOffsetMs: durationMs,      overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } }
    ];
    sendSequence(seq, agentId);
    if (autoRecord) {
      Recorder.recordSequence('curious_look_around', 'Curious Visual Scan', 'Smooth multi-directional head scan for environmental exploration.', 'Holds gaze orientations for stable camera frame capture.', seq);
    }
  };

  window.synthiaNodYes = function(count = 3, agentId = 'agent_0', autoRecord = true) {
    const seq = [];
    seq.push({ timeOffsetMs: 0,   overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: 200, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    let t = 200;
    for (let i = 0; i < count; i++) {
      seq.push({ timeOffsetMs: t + 250, overrides: { mixamorigneck: [7 * DEG, 0, 0],  mixamorighead: [16 * DEG, 0, 0] } });
      seq.push({ timeOffsetMs: t + 500, overrides: { mixamorigneck: [-2 * DEG, 0, 0], mixamorighead: [-4 * DEG, 0, 0] } });
      t += 500;
    }
    seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    sendSequence(seq, agentId);
    if (autoRecord) {
      Recorder.recordSequence('head_nod_yes', 'Head Nod Affirmation', 'Vertical head nodding motion indicating agreement.', 'Head pitch oscillation isolated to cervical spine without core perturbation.', seq);
    }
  };

  window.synthiaShakeNo = function(count = 3, agentId = 'agent_0', autoRecord = true) {
    const seq = [];
    seq.push({ timeOffsetMs: 0,   overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: 200, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    let t = 200;
    for (let i = 0; i < count; i++) {
      seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 9 * DEG],  mixamorighead: [0, 0, 20 * DEG] } });
      seq.push({ timeOffsetMs: t + 600, overrides: { mixamorigneck: [0, 0, -9 * DEG], mixamorighead: [0, 0, -20 * DEG] } });
      t += 600;
    }
    seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    sendSequence(seq, agentId);
    if (autoRecord) {
      Recorder.recordSequence('head_shake_no', 'Head Shake Negation', 'Lateral head yaw oscillation indicating disagreement.', 'Smooth neck yaw transitions avoiding servo ringing.', seq);
    }
  };

  window.synthiaKick = function(side = 'right', agentId = 'agent_0', autoRecord = true) {
    const isR = side === 'right';
    const kickUpLeg = isR ? 'mixamorigrightupleg' : 'mixamorigleftupleg';
    const kickLeg = isR ? 'mixamorigrightleg' : 'mixamorigleftleg';
    const kickFoot = isR ? 'mixamorigrightfoot' : 'mixamorigleftfoot';
    
    const stanceUpLeg = isR ? 'mixamorigleftupleg' : 'mixamorigrightupleg';
    const stanceLeg = isR ? 'mixamorigleftleg' : 'mixamorigrightleg';
    const stanceFoot = isR ? 'mixamorigleftfoot' : 'mixamorigrightfoot';
    
    const guardArms = {
      mixamorigleftarm: [45 * DEG, 0, 10 * DEG],
      mixamorigrightarm: [45 * DEG, 0, -10 * DEG],
      mixamorigleftforearm: 60 * DEG,
      mixamorigrightforearm: 60 * DEG
    };
    
    const neutralLegs = {
      [kickUpLeg]: [0, 0, 0], [kickLeg]: 0, [kickFoot]: [0, 0, 0],
      [stanceUpLeg]: [0, 0, 0], [stanceLeg]: 0, [stanceFoot]: [0, 0, 0],
      mixamorigspine: [0, 0, 0],
      mixamorigleftarm: [75 * DEG, 0, 0],
      mixamorigrightarm: [75 * DEG, 0, 0],
      mixamorigleftforearm: 0,
      mixamorigrightforearm: 0
    };
    
    const prep = {
      [stanceUpLeg]: [5 * DEG, 0, 0], [stanceLeg]: 5 * DEG,
      [kickUpLeg]: [15 * DEG, 0, 0], [kickLeg]: 30 * DEG,
      mixamorigspine: [5 * DEG, 0, 0],
      ...guardArms
    };
    
    const chamber = {
      [kickUpLeg]: [60 * DEG, 0, 0], [kickLeg]: 80 * DEG
    };
    
    const extension = {
      [kickUpLeg]: [70 * DEG, 0, 0], [kickLeg]: 10 * DEG, [kickFoot]: [-20 * DEG, 0, 0]
    };
    
    const retraction = {
      [kickUpLeg]: [40 * DEG, 0, 0], [kickLeg]: 50 * DEG, [kickFoot]: [0, 0, 0]
    };
    
    const seq = [
      { timeOffsetMs: 0, overrides: prep },
      { timeOffsetMs: 200, overrides: { ...prep, ...chamber } },
      { timeOffsetMs: 350, overrides: { ...prep, ...extension } },
      { timeOffsetMs: 550, overrides: { ...prep, ...retraction } },
      { timeOffsetMs: 800, overrides: neutralLegs }
    ];
    sendSequence(seq, agentId);
    if (autoRecord) {
      Recorder.recordSequence(`front_kick_${side}`, `Front Snap Kick (${side})`, 'Front snap kick with chamber, extension, retraction, and re-plant.', 'Spine lean compensates for single-leg support COM displacement.', seq);
    }
  };

  console.log(`
[SYNTHIA] Expressive & Utility Actions Loaded with Embedded Recorder:
- synthiaLookAround(durationMs) : Visual environment scan & auto-export
- synthiaNodYes(count)          : Head nod affirmation & auto-export
- synthiaShakeNo(count)         : Head shake negation & auto-export
- synthiaKick(side)             : Front snap kick & auto-export
  `);
})();
