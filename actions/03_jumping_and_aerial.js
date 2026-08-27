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
      recordSequence: function(id, title, category, summary, biomechanics, frames, parameters = {}, autoExport = true) {
        const recipe = {
          id: `aerial_${id}`,
          category: category || 'aerial',
          title: title,
          disclaimer: 'SUGGESTION ONLY: Reference motion recorded from baseline scripts. Adapt angles dynamically.',
          summary: summary || `Recorded sequence for ${title}.`,
          biomechanics_note: biomechanics || 'Maintains momentum and balance through phased keyframes.',
          parameters: {
            cycleDurationMs: frames.length > 0 ? frames[frames.length - 1].timeOffsetMs : 0,
            activeGaitPhase: true,
            balanceMode: 'soft',
            ...parameters
          },
          steps: frames.map((f, idx) => ({
            phase: f.phase || `Frame ${idx + 1} (${f.timeOffsetMs}ms)`,
            timeOffsetMs: f.timeOffsetMs,
            commentary: f.commentary || `Keyframe at ${f.timeOffsetMs}ms`,
            overrides: radToDegOverrides(f.overrides),
            rootVelocity: f.rootVelocity
          }))
        };
        console.log(`[Recorder] Recorded sequence: ${title}`, recipe);
        if (typeof window.synthiaRegisterRecipe === 'function') {
          window.synthiaRegisterRecipe(recipe);
        }
        if (autoExport) {
          downloadJSON(recipe, `motor_codex_aerial_${id}.json`);
        }
        return recipe;
      }
    };
  })();

  function sendSequence(frames, opts = {}) {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { 
        sequence: frames, 
        activeGaitPhase: true, 
        programSequence: opts.programSequence || [] 
      }
    }));
  }

  window.synthiaJump = function(force = 6.0, autoRecord = true) {
    console.log(`Executing synthiaJump with force ${force}`);
    
    const frames = [
      // Frame 0 (0ms): Squat preparation (knees flex 40°)
      {
        phase: 'Squat Preparation (Spring Loading)',
        commentary: 'Knees flex 40°, hips flex 30°, arms swing back behind torso (+45°) to store elastic energy.',
        timeOffsetMs: 0,
        overrides: {
          mixamorigspine: [10 * DEG, 0, 0],
          mixamorigleftupleg: [30 * DEG, 0, 0],
          mixamorigrightupleg: [30 * DEG, 0, 0],
          mixamorigleftleg: 40 * DEG,
          mixamorigrightleg: 40 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [45 * DEG, 0, -20 * DEG],
          mixamorigrightarm: [45 * DEG, 0, 20 * DEG],
          mixamorigleftforearm: 15 * DEG,
          mixamorigrightforearm: 15 * DEG,
        }
      },
      // Frame 1 (200ms): Explosive extension
      {
        phase: 'Explosive Triple Extension & Launch',
        commentary: 'Hips extend (-5°), knees snap straight (0°), ankles plantarflex (-15°), arms swing overhead (-60°).',
        timeOffsetMs: 200,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-5 * DEG, 0, 0],
          mixamorigrightupleg: [-5 * DEG, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [-15 * DEG, 0, 0],
          mixamorigrightfoot: [-15 * DEG, 0, 0],
          mixamorigleftarm: [-60 * DEG, 0, -10 * DEG],
          mixamorigrightarm: [-60 * DEG, 0, 10 * DEG],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        }
      },
      // Frame 2 (450ms): Aerial tuck (knees flex 30°)
      {
        phase: 'Mid-Air Tuck & Apex',
        commentary: 'In flight: knees tuck to 30°, hips to 15° to clear obstacles and prepare for ground contact.',
        timeOffsetMs: 450,
        overrides: {
          mixamorigleftupleg: [15 * DEG, 0, 0],
          mixamorigrightupleg: [15 * DEG, 0, 0],
          mixamorigleftleg: 30 * DEG,
          mixamorigrightleg: 30 * DEG,
          mixamorigleftfoot: [-10 * DEG, 0, 0],
          mixamorigrightfoot: [-10 * DEG, 0, 0],
          mixamorigleftarm: [-45 * DEG, 0, -25 * DEG],
          mixamorigrightarm: [-45 * DEG, 0, 25 * DEG],
        }
      },
      // Frame 3 (700ms): Landing preparation (knees flex 35°)
      {
        phase: 'Touchdown & Impact Dissipation',
        commentary: 'Touchdown: knees flex 35° to absorb impact shock smoothly without rebounding.',
        timeOffsetMs: 700,
        overrides: {
          mixamorigleftupleg: [20 * DEG, 0, 0],
          mixamorigrightupleg: [20 * DEG, 0, 0],
          mixamorigleftleg: 35 * DEG,
          mixamorigrightleg: 35 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [30 * DEG, 0, -20 * DEG],
          mixamorigrightarm: [30 * DEG, 0, 20 * DEG],
        }
      },
      // Frame 4 (1000ms): Return to standing
      {
        phase: 'Return to Stable Upright Stance',
        commentary: 'Knees and hips extend back to neutral resting stance with full balance restored.',
        timeOffsetMs: 1000,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [0, 0, 0],
          mixamorigrightupleg: [0, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftarm: [68 * DEG, 0, -12 * DEG],
          mixamorigrightarm: [68 * DEG, 0, 12 * DEG],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        }
      }
    ];

    sendSequence(frames, { programSequence: ['jump'] });

    if (autoRecord) {
      Recorder.recordSequence(
        'vertical_jump',
        'Vertical Jump with Soft Landing',
        'aerial',
        'Dynamic 4-phase vertical jump with spring loading squat, explosive extension, and soft compliant landing.',
        'Explosive triple extension generates vertical lift; compliant knee flexion absorbs impact energy.',
        frames,
        { recommendedForce: force }
      );
    }

    // Call executeJump at the extension frame
    setTimeout(() => {
      const binder = window.__SYNTHIA_HUMANOID_BINDER__;
      if (binder && binder.executeJump) {
        binder.executeJump(force);
      }
    }, 200);
  };

  window.synthiaForwardLeap = function(force = 6.0, autoRecord = true) {
    console.log(`Executing synthiaForwardLeap with force ${force}`);
    
    const binder = window.__SYNTHIA_HUMANOID_BINDER__;
    if (binder && binder.setTargetRootVelocity) {
      binder.setTargetRootVelocity(0, -0.12, 800);
    }

    const frames = [
      {
        phase: 'Forward Squat Preparation',
        commentary: 'Torso leans forward 14°, knees flex 40°, arms cocked back.',
        timeOffsetMs: 0,
        overrides: {
          mixamorigspine: [14 * DEG, 0, 0],
          mixamorigleftupleg: [30 * DEG, 0, 0],
          mixamorigrightupleg: [30 * DEG, 0, 0],
          mixamorigleftleg: 40 * DEG,
          mixamorigrightleg: 40 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [45 * DEG, 0, -20 * DEG],
          mixamorigrightarm: [45 * DEG, 0, 20 * DEG],
          mixamorigleftforearm: 15 * DEG,
          mixamorigrightforearm: 15 * DEG,
        },
        rootVelocity: [0, 0.12, 0]
      },
      {
        phase: 'Asymmetric Forward Launch',
        commentary: 'Leading leg swings forward (+25°), trailing leg pushes back (-15°).',
        timeOffsetMs: 200,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-15 * DEG, 0, 0],
          mixamorigrightupleg: [25 * DEG, 0, 0],
          mixamorigleftleg: 5 * DEG,
          mixamorigrightleg: 20 * DEG,
          mixamorigleftfoot: [-15 * DEG, 0, 0],
          mixamorigrightfoot: [-15 * DEG, 0, 0],
          mixamorigleftarm: [-60 * DEG, 0, -10 * DEG],
          mixamorigrightarm: [-60 * DEG, 0, 10 * DEG],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
        rootVelocity: [0, 0.12, 0]
      },
      {
        phase: 'Aerial Flight',
        commentary: 'Legs tuck to clear distance.',
        timeOffsetMs: 450,
        overrides: {
          mixamorigleftupleg: [15 * DEG, 0, 0],
          mixamorigrightupleg: [15 * DEG, 0, 0],
          mixamorigleftleg: 30 * DEG,
          mixamorigrightleg: 30 * DEG,
          mixamorigleftfoot: [-10 * DEG, 0, 0],
          mixamorigrightfoot: [-10 * DEG, 0, 0],
          mixamorigleftarm: [-45 * DEG, 0, -25 * DEG],
          mixamorigrightarm: [-45 * DEG, 0, 25 * DEG],
        }
      },
      {
        phase: 'Forward Landing Prep',
        commentary: 'Feet plant ahead of center of mass with flexed knees.',
        timeOffsetMs: 700,
        overrides: {
          mixamorigleftupleg: [20 * DEG, 0, 0],
          mixamorigrightupleg: [20 * DEG, 0, 0],
          mixamorigleftleg: 35 * DEG,
          mixamorigrightleg: 35 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [30 * DEG, 0, -20 * DEG],
          mixamorigrightarm: [30 * DEG, 0, 20 * DEG],
        }
      },
      {
        phase: 'Upright Recovery',
        commentary: 'Return to neutral standing pose.',
        timeOffsetMs: 1000,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [0, 0, 0],
          mixamorigrightupleg: [0, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftarm: [68 * DEG, 0, -12 * DEG],
          mixamorigrightarm: [68 * DEG, 0, 12 * DEG],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        }
      }
    ];

    sendSequence(frames, { programSequence: ['jump'] });

    if (autoRecord) {
      Recorder.recordSequence(
        'forward_leap',
        'Forward Leaping Jump',
        'aerial',
        'Forward bounding jump combining vertical impulse with root velocity drive.',
        'Spine forward pitch initiates COM displacement before vertical thrust.',
        frames,
        { recommendedForce: force, recommendedSpeedMps: 0.12 }
      );
    }

    setTimeout(() => {
      const binder = window.__SYNTHIA_HUMANOID_BINDER__;
      if (binder && binder.executeJump) {
        binder.executeJump(force);
      }
    }, 200);
  };

  window.synthiaBunnyHop = function(count = 3) {
    console.log(`Executing synthiaBunnyHop with count ${count}`);
    const force = 4.0;
    let hopsDone = 0;

    function hop() {
      if (hopsDone >= count) return;
      
      const frames = [
        {
          timeOffsetMs: 0,
          overrides: {
            mixamorigspine: [5 * DEG, 0, 0],
            mixamorigleftupleg: [20 * DEG, 0, 0],
            mixamorigrightupleg: [20 * DEG, 0, 0],
            mixamorigleftleg: 25 * DEG,
            mixamorigrightleg: 25 * DEG,
            mixamorigleftfoot: [5 * DEG, 0, 0],
            mixamorigrightfoot: [5 * DEG, 0, 0],
            mixamorigleftarm: [45 * DEG, 0, -12 * DEG],
            mixamorigrightarm: [45 * DEG, 0, 12 * DEG],
          }
        },
        {
          timeOffsetMs: 150,
          overrides: {
            mixamorigspine: [0, 0, 0],
            mixamorigleftupleg: [-5 * DEG, 0, 0],
            mixamorigrightupleg: [-5 * DEG, 0, 0],
            mixamorigleftleg: 0,
            mixamorigrightleg: 0,
            mixamorigleftfoot: [-10 * DEG, 0, 0],
            mixamorigrightfoot: [-10 * DEG, 0, 0],
            mixamorigleftarm: [-20 * DEG, 0, -12 * DEG],
            mixamorigrightarm: [-20 * DEG, 0, 12 * DEG],
          }
        },
        {
          timeOffsetMs: 300,
          overrides: {
            mixamorigleftupleg: [10 * DEG, 0, 0],
            mixamorigrightupleg: [10 * DEG, 0, 0],
            mixamorigleftleg: 15 * DEG,
            mixamorigrightleg: 15 * DEG,
          }
        },
        {
          timeOffsetMs: 450,
          overrides: {
            mixamorigleftupleg: [0, 0, 0],
            mixamorigrightupleg: [0, 0, 0],
            mixamorigleftleg: 0,
            mixamorigrightleg: 0,
            mixamorigleftarm: [68 * DEG, 0, -12 * DEG],
            mixamorigrightarm: [68 * DEG, 0, 12 * DEG],
          }
        }
      ];

      sendSequence(frames, { programSequence: ['jump'] });

      setTimeout(() => {
        const binder = window.__SYNTHIA_HUMANOID_BINDER__;
        if (binder && binder.executeJump) {
          binder.executeJump(force);
        }
      }, 150);

      hopsDone++;
      if (hopsDone < count) {
        setTimeout(hop, 600);
      }
    }

    hop();
  };

  console.log(`
=== Synthia Jumping and Aerial Actions Loaded with Embedded Recorder ===
Available functions:
- synthiaJump(force=6.0)     : Vertical jump with prep & auto-export
- synthiaForwardLeap(force)  : Forward leaping jump & auto-export
- synthiaBunnyHop(count=3)   : Repeated small hops
========================================================================
  `);
})();
