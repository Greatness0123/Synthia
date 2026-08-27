(function() {
  'use strict';
  const DEG = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  // ── Embedded Action Recorder & Exporter ───────────────────────────────────
  const Recorder = (function() {
    let currentRecording = null;

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
      recordSinglePose: function(id, title, overrides, commentary = '', autoExport = true) {
        const recipe = {
          id: `posture_${id}`,
          category: 'posture',
          title: title,
          disclaimer: 'SUGGESTION ONLY: Reference posture recorded from baseline scripts. Adapt angles dynamically.',
          summary: `Static posture preset for ${title}.`,
          biomechanics_note: commentary || 'Maintains balanced posture with stable center of mass.',
          parameters: { balanceMode: 'auto' },
          steps: [
            {
              phase: `${title} Hold`,
              timeOffsetMs: 0,
              commentary: commentary || `Holding ${title} with balanced joint alignments.`,
              overrides: radToDegOverrides(overrides)
            }
          ]
        };
        console.log(`[Recorder] Recorded posture: ${title}`, recipe);
        if (typeof window.synthiaRegisterRecipe === 'function') {
          window.synthiaRegisterRecipe(recipe);
        }
        if (autoExport) {
          downloadJSON(recipe, `motor_codex_posture_${id}.json`);
        }
        return recipe;
      }
    };
  })();

  function sendPose(name, overrides, programSequence = null) {
    const detail = {
      jointOverrides: overrides || {},
      agentId: 'agent_0'
    };
    if (programSequence) {
      detail.programSequence = programSequence;
    }
    window.dispatchEvent(new CustomEvent('synthia:action', { detail }));
    console.log(`[Synthia Posture] Applied pose: ${name}`);
  }

  function getFingerOverrides(values) {
    const overrides = {};
    const sides = ['left', 'right'];
    const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    
    sides.forEach(side => {
      fingers.forEach(f => {
        [1, 2, 3].forEach(n => {
          const val = typeof values === 'object' ? (values[f] !== undefined ? values[f] : 0) : values;
          overrides[`mixamorig${side}hand${f}${n}`] = val;
        });
      });
    });
    return overrides;
  }

  window.synthiaPoseReset = function(autoRecord = true) {
    window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: 'agent_0' } }));
    sendPose('Reset to Upright', null, ['upright_preset']);
    if (autoRecord) {
      Recorder.recordSinglePose('reset', 'Reset to Upright', {}, 'Reset in-place to stable upright standing pose.');
    }
  };

  window.synthiaPoseNatural = function(autoRecord = true) {
    const fingerVals = {
      thumb: 18 * DEG,
      index: 18 * DEG,
      middle: 18 * DEG,
      ring: 14 * DEG,
      pinky: 12 * DEG
    };

    const overrides = {
      mixamorigleftarm: [68 * DEG, 0, -12 * DEG],
      mixamorigrightarm: [68 * DEG, 0, 12 * DEG],
      mixamorigleftforearm: 0,
      mixamorigrightforearm: 0,
      mixamoriglefthand: [0, 0, 0],
      mixamorigrighthand: [0, 0, 0],
      mixamorigspine: [3 * DEG, 0, 0],
      mixamorighead: [-3 * DEG, 0, 0],
      ...getFingerOverrides(fingerVals)
    };
    sendPose('Natural Stance', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('natural_standing', 'Natural Stance', overrides, 'Relaxed standing posture with arms at sides and head level.');
    }
  };

  window.synthiaPoseGuard = function(autoRecord = true) {
    const overrides = {
      mixamorigleftarm: [20 * DEG, 0, -55 * DEG],
      mixamorigrightarm: [20 * DEG, 0, 55 * DEG],
      mixamorigleftforearm: 100 * DEG,
      mixamorigrightforearm: 100 * DEG,
      mixamorigspine: [5 * DEG, 0, 0],
      mixamorighead: [5 * DEG, 0, 0],
      mixamorigleftleg: 10 * DEG,
      mixamorigrightleg: 10 * DEG,
      mixamorigleftupleg: [5 * DEG, 0, 0],
      mixamorigrightupleg: [5 * DEG, 0, 0],
      ...getFingerOverrides(80 * DEG)
    };
    sendPose('Boxing Guard', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('guard_stance', 'Boxing Guard', overrides, 'Athletic defensive guard with raised forearms and flexed knees.');
    }
  };

  window.synthiaPoseSquat = function(autoRecord = true) {
    const overrides = {
      mixamorigleftupleg: [75 * DEG, 0, -10 * DEG],
      mixamorigrightupleg: [75 * DEG, 0, 10 * DEG],
      mixamorigleftleg: 110 * DEG,
      mixamorigrightleg: 110 * DEG,
      mixamorigleftfoot: [18 * DEG, 0, 0],
      mixamorigrightfoot: [18 * DEG, 0, 0],
      mixamorigspine: [14 * DEG, 0, 0],
      mixamorigspine1: [10 * DEG, 0, 0],
      mixamorigleftarm: [50 * DEG, 0, -40 * DEG],
      mixamorigrightarm: [50 * DEG, 0, 40 * DEG],
      mixamorigleftforearm: 30 * DEG,
      mixamorigrightforearm: 30 * DEG,
      ...getFingerOverrides(15 * DEG)
    };
    sendPose('Deep Squat', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('deep_squat', 'Deep Squat', overrides, 'Deep knee flexion (110°) with spine counter-lean to center mass over feet.');
    }
  };

  window.synthiaPoseHandsOnHips = function(autoRecord = true) {
    const overrides = {
      mixamorigleftarm: [30 * DEG, 0, -30 * DEG],
      mixamorigrightarm: [30 * DEG, 0, 30 * DEG],
      mixamorigleftforearm: 75 * DEG,
      mixamorigrightforearm: 75 * DEG,
      mixamoriglefthand: [10 * DEG, 0, 0],
      mixamorigrighthand: [10 * DEG, 0, 0],
      ...getFingerOverrides(55 * DEG)
    };
    sendPose('Hands on Hips', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('hands_on_hips', 'Hands on Hips', overrides, 'Akimbo stance with hands placed firmly on hips.');
    }
  };

  window.synthiaPoseArmsCrossed = function(autoRecord = true) {
    const overrides = {
      mixamorigleftarm: [15 * DEG, 0, -30 * DEG],
      mixamorigrightarm: [15 * DEG, 0, 30 * DEG],
      mixamorigleftforearm: 120 * DEG,
      mixamorigrightforearm: 120 * DEG,
      mixamoriglefthand: [5 * DEG, 0, 0],
      mixamorigrighthand: [5 * DEG, 0, 0],
      ...getFingerOverrides(40 * DEG)
    };
    sendPose('Arms Crossed', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('arms_crossed', 'Arms Crossed', overrides, 'Folded arms across chest.');
    }
  };

  window.synthiaPoseTPose = function(autoRecord = true) {
    const overrides = {
      mixamorigleftarm: [0, 0, 0],
      mixamorigrightarm: [0, 0, 0],
      mixamoriglefthand: [0, 0, 0],
      mixamorigrighthand: [0, 0, 0],
      ...getFingerOverrides(0)
    };
    sendPose('T-Pose', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('t_pose', 'T-Pose', overrides, 'Standard anatomical T-pose reference.');
    }
  };

  window.synthiaPoseArmsOverhead = function(autoRecord = true) {
    const overrides = {
      mixamorigleftarm: [-90 * DEG, 0, 0],
      mixamorigrightarm: [-90 * DEG, 0, 0],
      mixamorigleftforearm: 10 * DEG,
      mixamorigrightforearm: 10 * DEG,
      ...getFingerOverrides(0)
    };
    sendPose('Arms Overhead', overrides);
    if (autoRecord) {
      Recorder.recordSinglePose('arms_overhead', 'Arms Overhead', overrides, 'Both arms raised vertically overhead in celebration.');
    }
  };

  console.log(`
[Synthia Posture Actions Loaded with Embedded Recorder]
Available global commands (running any command automatically records and downloads its Motor Codex JSON):
  - synthiaPoseReset()        : Full reset to upright
  - synthiaPoseNatural()      : Relaxed natural stance
  - synthiaPoseGuard()        : Boxing guard stance
  - synthiaPoseSquat()        : Deep squat
  - synthiaPoseHandsOnHips()  : Akimbo
  - synthiaPoseArmsCrossed()  : Crossed arms
  - synthiaPoseTPose()        : T-pose diagnostic
  - synthiaPoseArmsOverhead() : Victory/stretch
  `);
})();
