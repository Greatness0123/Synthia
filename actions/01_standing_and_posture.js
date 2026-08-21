(function() {
  const DEG = Math.PI / 180;

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

  window.synthiaPoseReset = function() {
    window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: 'agent_0' } }));
    sendPose('Reset to Upright', null, ['upright_preset']);
  };

  window.synthiaPoseNatural = function() {
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
  };

  window.synthiaPoseGuard = function() {
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
  };

  window.synthiaPoseSquat = function() {
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
  };

  window.synthiaPoseHandsOnHips = function() {
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
  };

  window.synthiaPoseArmsCrossed = function() {
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
  };

  window.synthiaPoseTPose = function() {
    const overrides = {
      mixamorigleftarm: [0, 0, 0],
      mixamorigrightarm: [0, 0, 0],
      mixamoriglefthand: [0, 0, 0],
      mixamorigrighthand: [0, 0, 0],
      ...getFingerOverrides(0)
    };
    sendPose('T-Pose', overrides);
  };

  window.synthiaPoseArmsOverhead = function() {
    const overrides = {
      mixamorigleftarm: [-90 * DEG, 0, 0],
      mixamorigrightarm: [-90 * DEG, 0, 0],
      mixamorigleftforearm: 10 * DEG,
      mixamorigrightforearm: 10 * DEG,
      ...getFingerOverrides(0)
    };
    sendPose('Arms Overhead', overrides);
  };

  console.log(`
[Synthia Posture Actions Loaded]
Available global commands:
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
