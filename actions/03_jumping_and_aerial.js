(function() {
  const DEG = Math.PI / 180;

  function sendSequence(frames, opts = {}) {
    window.dispatchEvent(new CustomEvent('synthia:action', {
      detail: { 
        sequence: frames, 
        activeGaitPhase: true, 
        programSequence: opts.programSequence || [] 
      }
    }));
  }

  window.synthiaJump = function(force = 6.0) {
    console.log(`Executing synthiaJump with force ${force}`);
    
    const frames = [
      // Frame 0 (0ms): Squat preparation (knees flex 40°)
      {
        timeOffsetMs: 0,
        overrides: {
          mixamorigspine: [10 * DEG, 0, 0],
          mixamorigleftupleg: [30 * DEG, 0, 0],
          mixamorigrightupleg: [30 * DEG, 0, 0],
          mixamorigleftleg: 40 * DEG,
          mixamorigrightleg: 40 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [45 * DEG, 0, -20 * DEG], // swing back, outward
          mixamorigrightarm: [45 * DEG, 0, 20 * DEG],
          mixamorigleftforearm: 15 * DEG,
          mixamorigrightforearm: 15 * DEG,
        }
      },
      // Frame 1 (200ms): Explosive extension
      {
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

    // Call executeJump at the extension frame
    setTimeout(() => {
      const binder = window.__SYNTHIA_HUMANOID_BINDER__;
      if (binder && binder.executeJump) {
        binder.executeJump(force);
      }
    }, 200);
  };

  window.synthiaForwardLeap = function(force = 6.0) {
    console.log(`Executing synthiaForwardLeap with force ${force}`);
    
    const binder = window.__SYNTHIA_HUMANOID_BINDER__;
    if (binder && binder.setTargetRootVelocity) {
      binder.setTargetRootVelocity(0, -0.12, 800);
    }

    const frames = [
      // Frame 0 (0ms): Squat preparation
      {
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
        }
      },
      // Frame 1 (200ms): Explosive extension
      {
        timeOffsetMs: 200,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-15 * DEG, 0, 0], // trailing leg
          mixamorigrightupleg: [25 * DEG, 0, 0], // leading leg
          mixamorigleftleg: 5 * DEG,
          mixamorigrightleg: 20 * DEG,
          mixamorigleftfoot: [-15 * DEG, 0, 0],
          mixamorigrightfoot: [-15 * DEG, 0, 0],
          mixamorigleftarm: [-60 * DEG, 0, -10 * DEG],
          mixamorigrightarm: [-60 * DEG, 0, 10 * DEG],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        }
      },
      // Frame 2 (450ms): Aerial tuck
      {
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
      // Frame 3 (700ms): Landing preparation
      {
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

  window.synthiaSquatJump = function() {
    console.log("Executing synthiaSquatJump");
    const force = 8.0;

    const frames = [
      // Deeper squat prep (0 -> 400ms, knees flex 90°)
      {
        timeOffsetMs: 0,
        overrides: {
          mixamorigspine: [20 * DEG, 0, 0],
          mixamorigleftupleg: [60 * DEG, 0, 0],
          mixamorigrightupleg: [60 * DEG, 0, 0],
          mixamorigleftleg: 90 * DEG,
          mixamorigrightleg: 90 * DEG,
          mixamorigleftfoot: [15 * DEG, 0, 0],
          mixamorigrightfoot: [15 * DEG, 0, 0],
          mixamorigleftarm: [50 * DEG, 0, -25 * DEG],
          mixamorigrightarm: [50 * DEG, 0, 25 * DEG],
          mixamorigleftforearm: 20 * DEG,
          mixamorigrightforearm: 20 * DEG,
        }
      },
      // Explosive extension (400ms)
      {
        timeOffsetMs: 400,
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-5 * DEG, 0, 0],
          mixamorigrightupleg: [-5 * DEG, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [-20 * DEG, 0, 0],
          mixamorigrightfoot: [-20 * DEG, 0, 0],
          mixamorigleftarm: [-90 * DEG, 0, 0], // Fully overhead
          mixamorigrightarm: [-90 * DEG, 0, 0], // Fully overhead
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        }
      },
      // Aerial (650ms)
      {
        timeOffsetMs: 650,
        overrides: {
          mixamorigleftupleg: [20 * DEG, 0, 0],
          mixamorigrightupleg: [20 * DEG, 0, 0],
          mixamorigleftleg: 40 * DEG,
          mixamorigrightleg: 40 * DEG,
          mixamorigleftfoot: [-10 * DEG, 0, 0],
          mixamorigrightfoot: [-10 * DEG, 0, 0],
        }
      },
      // Landing prep (900ms)
      {
        timeOffsetMs: 900,
        overrides: {
          mixamorigleftupleg: [30 * DEG, 0, 0],
          mixamorigrightupleg: [30 * DEG, 0, 0],
          mixamorigleftleg: 45 * DEG,
          mixamorigrightleg: 45 * DEG,
          mixamorigleftfoot: [10 * DEG, 0, 0],
          mixamorigrightfoot: [10 * DEG, 0, 0],
          mixamorigleftarm: [30 * DEG, 0, -20 * DEG],
          mixamorigrightarm: [30 * DEG, 0, 20 * DEG],
        }
      },
      // Stand up (1300ms)
      {
        timeOffsetMs: 1300,
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
        }
      }
    ];

    sendSequence(frames, { programSequence: ['jump'] });

    setTimeout(() => {
      const binder = window.__SYNTHIA_HUMANOID_BINDER__;
      if (binder && binder.executeJump) {
        binder.executeJump(force);
      }
    }, 400);
  };

  console.log(`
=== Synthia Jumping and Aerial Actions Loaded ===
Available functions:
- synthiaJump(force=6.0)     : Vertical jump with prep
- synthiaForwardLeap(force)  : Forward leaping jump
- synthiaBunnyHop(count=3)   : Repeated small hops
- synthiaSquatJump()         : Deep squat to high jump
=================================================
  `);
})();
