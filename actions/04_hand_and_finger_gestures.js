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
      recordSinglePose: function(id, title, overrides, commentary = '', autoExport = true) {
        const recipe = {
          id: `gesture_${id}`,
          category: 'gesture',
          title: title,
          disclaimer: 'SUGGESTION ONLY: Reference motion recorded from baseline scripts. Adapt angles dynamically.',
          summary: `Hand/finger gesture preset for ${title}.`,
          biomechanics_note: commentary || 'Maintains stable arm posture with isolated finger joints.',
          parameters: { balanceMode: 'auto' },
          steps: [
            {
              phase: `${title} Pose`,
              timeOffsetMs: 0,
              commentary: commentary || `Forming ${title} gesture.`,
              overrides: radToDegOverrides(overrides)
            }
          ]
        };
        console.log(`[Recorder] Recorded gesture: ${title}`, recipe);
        if (typeof window.synthiaRegisterRecipe === 'function') {
          window.synthiaRegisterRecipe(recipe);
        }
        if (autoExport) {
          downloadJSON(recipe, `motor_codex_gesture_${id}.json`);
        }
        return recipe;
      },

      recordSequence: function(id, title, summary, biomechanics, sequence, autoExport = true) {
        const recipe = {
          id: `gesture_${id}`,
          category: 'gesture',
          title: title,
          disclaimer: 'SUGGESTION ONLY: Reference motion recorded from baseline scripts. Adapt angles dynamically.',
          summary: summary || `Dynamic gesture sequence for ${title}.`,
          biomechanics_note: biomechanics || 'Articulates wrist and arm oscillations smoothly.',
          parameters: {
            cycleDurationMs: sequence.length > 0 ? sequence[sequence.length - 1].timeOffsetMs : 0,
            balanceMode: 'auto'
          },
          steps: sequence.map((f, idx) => ({
            phase: `Frame ${idx + 1} (${f.timeOffsetMs}ms)`,
            timeOffsetMs: f.timeOffsetMs,
            commentary: `Gesture milestone frame at ${f.timeOffsetMs}ms`,
            overrides: radToDegOverrides(f.overrides)
          }))
        };
        console.log(`[Recorder] Recorded gesture sequence: ${title}`, recipe);
        if (typeof window.synthiaRegisterRecipe === 'function') {
          window.synthiaRegisterRecipe(recipe);
        }
        if (autoExport) {
          downloadJSON(recipe, `motor_codex_gesture_${id}.json`);
        }
        return recipe;
      }
    };
  })();

  function sendPose(jointOverrides, agentId = 'agent_0') {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { jointOverrides, agentId }
    }));
  }

  function sendSequence(sequence, agentId = 'agent_0') {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { sequence, agentId }
    }));
  }

  const FIST = (side) => ({
    [`mixamorig${side}handthumb1`]: 75*DEG, [`mixamorig${side}handthumb2`]: 80*DEG, [`mixamorig${side}handthumb3`]: 55*DEG,
    [`mixamorig${side}handindex1`]: 75*DEG, [`mixamorig${side}handindex2`]: 90*DEG, [`mixamorig${side}handindex3`]: 75*DEG,
    [`mixamorig${side}handmiddle1`]: 75*DEG, [`mixamorig${side}handmiddle2`]: 90*DEG, [`mixamorig${side}handmiddle3`]: 75*DEG,
    [`mixamorig${side}handring1`]: 75*DEG, [`mixamorig${side}handring2`]: 90*DEG, [`mixamorig${side}handring3`]: 75*DEG,
    [`mixamorig${side}handpinky1`]: 75*DEG, [`mixamorig${side}handpinky2`]: 90*DEG, [`mixamorig${side}handpinky3`]: 75*DEG,
  });

  const OPEN = (side) => ({
    [`mixamorig${side}handthumb1`]: 0, [`mixamorig${side}handthumb2`]: 0, [`mixamorig${side}handthumb3`]: 0,
    [`mixamorig${side}handindex1`]: 0, [`mixamorig${side}handindex2`]: 0, [`mixamorig${side}handindex3`]: 0,
    [`mixamorig${side}handmiddle1`]: 0, [`mixamorig${side}handmiddle2`]: 0, [`mixamorig${side}handmiddle3`]: 0,
    [`mixamorig${side}handring1`]: 0, [`mixamorig${side}handring2`]: 0, [`mixamorig${side}handring3`]: 0,
    [`mixamorig${side}handpinky1`]: 0, [`mixamorig${side}handpinky2`]: 0, [`mixamorig${side}handpinky3`]: 0,
  });

  window.synthiaPoint = (side = 'right', autoRecord = true) => {
    const armRoll = -(side === 'right' ? 75 : -75);
    const overrides = {
      [`mixamorig${side}arm`]: [10*DEG, 0, armRoll*DEG],
      [`mixamorig${side}forearm`]: 30*DEG,
      [`mixamorig${side}hand`]: [0, 0, 0],
      [`mixamorig${side}handthumb1`]: 15*DEG, [`mixamorig${side}handthumb2`]: 20*DEG, [`mixamorig${side}handthumb3`]: 15*DEG,
      [`mixamorig${side}handindex1`]: 0, [`mixamorig${side}handindex2`]: 0, [`mixamorig${side}handindex3`]: 0,
      [`mixamorig${side}handmiddle1`]: 75*DEG, [`mixamorig${side}handmiddle2`]: 85*DEG, [`mixamorig${side}handmiddle3`]: 75*DEG,
      [`mixamorig${side}handring1`]: 75*DEG, [`mixamorig${side}handring2`]: 85*DEG, [`mixamorig${side}handring3`]: 75*DEG,
      [`mixamorig${side}handpinky1`]: 75*DEG, [`mixamorig${side}handpinky2`]: 85*DEG, [`mixamorig${side}handpinky3`]: 75*DEG,
    };
    sendPose(overrides);
    if (autoRecord) {
      Recorder.recordSinglePose(`pointing_${side}`, `Target Pointing (${side})`, overrides, 'Arm elevated forward with extended index finger and curled remaining fingers.');
    }
  };

  window.synthiaFist = (which = 'both', autoRecord = true) => {
    const sides = which === 'both' ? ['left', 'right'] : [which];
    const overrides = {};
    for (const side of sides) {
      const armRoll = side === 'right' ? 12*DEG : -12*DEG;
      overrides[`mixamorig${side}arm`] = [68*DEG, 0, armRoll];
      overrides[`mixamorig${side}forearm`] = 0;
      overrides[`mixamorig${side}hand`] = [0, 0, 0];
      Object.assign(overrides, FIST(side));
    }
    sendPose(overrides);
    if (autoRecord) {
      Recorder.recordSinglePose(`fist_${which}`, `Closed Fist (${which})`, overrides, 'Tight bilateral or unilateral fist with fully curled phalanges.');
    }
  };

  window.synthiaThumbsUp = (side = 'right', autoRecord = true) => {
    const armRoll = -(side === 'right' ? 25 : -25);
    const overrides = {
      [`mixamorig${side}arm`]: [60*DEG, 0, armRoll*DEG],
      [`mixamorig${side}forearm`]: 25*DEG,
      [`mixamorig${side}hand`]: [0, 0, 0],
      [`mixamorig${side}handthumb1`]: 0, [`mixamorig${side}handthumb2`]: 0, [`mixamorig${side}handthumb3`]: 0,
      [`mixamorig${side}handindex1`]: 80*DEG, [`mixamorig${side}handindex2`]: 90*DEG, [`mixamorig${side}handindex3`]: 80*DEG,
      [`mixamorig${side}handmiddle1`]: 80*DEG, [`mixamorig${side}handmiddle2`]: 90*DEG, [`mixamorig${side}handmiddle3`]: 80*DEG,
      [`mixamorig${side}handring1`]: 80*DEG, [`mixamorig${side}handring2`]: 90*DEG, [`mixamorig${side}handring3`]: 80*DEG,
      [`mixamorig${side}handpinky1`]: 80*DEG, [`mixamorig${side}handpinky2`]: 90*DEG, [`mixamorig${side}handpinky3`]: 80*DEG,
    };
    sendPose(overrides);
    if (autoRecord) {
      Recorder.recordSinglePose(`thumbs_up_${side}`, `Thumbs Up Approval (${side})`, overrides, 'Extended vertical thumb with closed fist.');
    }
  };

  window.synthiaPeace = (side = 'right', autoRecord = true) => {
    const armRoll = -(side === 'right' ? 60 : -60);
    const overrides = {
      [`mixamorig${side}arm`]: [10*DEG, 0, armRoll*DEG],
      [`mixamorig${side}forearm`]: 20*DEG,
      [`mixamorig${side}handthumb1`]: 25*DEG, [`mixamorig${side}handthumb2`]: 35*DEG, [`mixamorig${side}handthumb3`]: 25*DEG,
      [`mixamorig${side}handindex1`]: 0, [`mixamorig${side}handindex2`]: 0, [`mixamorig${side}handindex3`]: 0,
      [`mixamorig${side}handmiddle1`]: 0, [`mixamorig${side}handmiddle2`]: 0, [`mixamorig${side}handmiddle3`]: 0,
      [`mixamorig${side}handring1`]: 75*DEG, [`mixamorig${side}handring2`]: 85*DEG, [`mixamorig${side}handring3`]: 75*DEG,
      [`mixamorig${side}handpinky1`]: 75*DEG, [`mixamorig${side}handpinky2`]: 85*DEG, [`mixamorig${side}handpinky3`]: 75*DEG,
    };
    sendPose(overrides);
    if (autoRecord) {
      Recorder.recordSinglePose(`peace_${side}`, `Peace / Victory Sign (${side})`, overrides, 'V-sign with extended index and middle fingers.');
    }
  };

  window.synthiaWave = (side = 'right', cycles = 3, autoRecord = true) => {
    const armRoll = -(side === 'right' ? 60 : -60);
    const rollSign = side === 'right' ? 1 : -1;
    
    const sequence = [];
    const totalFrames = 2 * cycles + 1;
    
    for (let i = 0; i < totalFrames; i++) {
      const isUp = i % 2 === 0;
      const wristRoll = isUp ? 20 * rollSign : -20 * rollSign;
      sequence.push({
        timeOffsetMs: i * 200,
        overrides: {
          [`mixamorig${side}arm`]: [-45*DEG, 0, armRoll*DEG],
          [`mixamorig${side}forearm`]: 60*DEG,
          [`mixamorig${side}hand`]: [0, 0, wristRoll*DEG],
          ...OPEN(side)
        }
      });
    }
    sendSequence(sequence);
    if (autoRecord) {
      Recorder.recordSequence(`wave_${side}`, `Hand Wave Greeting (${side})`, 'Friendly hand waving motion with wrist oscillation.', 'Wrist roll oscillation with open palm.', sequence);
    }
  };

  console.log(`
[SYNTHIA] Hand & Finger Gestures Loaded with Embedded Recorder:
- synthiaPoint(side)      : Point index finger & auto-export
- synthiaFist(which)       : Closed fist & auto-export
- synthiaThumbsUp(side)   : Thumbs up approval & auto-export
- synthiaPeace(side)      : Peace sign & auto-export
- synthiaWave(side, count): Wave hand back and forth & auto-export
  `);
})();
