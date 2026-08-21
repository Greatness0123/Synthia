(function() {
  const DEG = Math.PI / 180;

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

  const RELAXED = (side) => ({
    [`mixamorig${side}handthumb1`]: 15*DEG, [`mixamorig${side}handthumb2`]: 20*DEG, [`mixamorig${side}handthumb3`]: 15*DEG,
    [`mixamorig${side}handindex1`]: 15*DEG, [`mixamorig${side}handindex2`]: 20*DEG, [`mixamorig${side}handindex3`]: 15*DEG,
    [`mixamorig${side}handmiddle1`]: 15*DEG, [`mixamorig${side}handmiddle2`]: 20*DEG, [`mixamorig${side}handmiddle3`]: 15*DEG,
    [`mixamorig${side}handring1`]: 12*DEG, [`mixamorig${side}handring2`]: 16*DEG, [`mixamorig${side}handring3`]: 12*DEG,
    [`mixamorig${side}handpinky1`]: 10*DEG, [`mixamorig${side}handpinky2`]: 14*DEG, [`mixamorig${side}handpinky3`]: 10*DEG,
  });

  window.synthiaPoint = (side = 'right') => {
    const armRoll = -(side === 'right' ? 75 : -75);
    sendPose({
      [`mixamorig${side}arm`]: [10*DEG, 0, armRoll*DEG],
      [`mixamorig${side}forearm`]: 30*DEG,
      [`mixamorig${side}hand`]: [0, 0, 0],
      [`mixamorig${side}handthumb1`]: 15*DEG, [`mixamorig${side}handthumb2`]: 20*DEG, [`mixamorig${side}handthumb3`]: 15*DEG,
      [`mixamorig${side}handindex1`]: 0, [`mixamorig${side}handindex2`]: 0, [`mixamorig${side}handindex3`]: 0,
      [`mixamorig${side}handmiddle1`]: 75*DEG, [`mixamorig${side}handmiddle2`]: 85*DEG, [`mixamorig${side}handmiddle3`]: 75*DEG,
      [`mixamorig${side}handring1`]: 75*DEG, [`mixamorig${side}handring2`]: 85*DEG, [`mixamorig${side}handring3`]: 75*DEG,
      [`mixamorig${side}handpinky1`]: 75*DEG, [`mixamorig${side}handpinky2`]: 85*DEG, [`mixamorig${side}handpinky3`]: 75*DEG,
    });
  };

  window.synthiaFist = (which = 'both') => {
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
  };

  window.synthiaOpenHand = (which = 'both') => {
    const sides = which === 'both' ? ['left', 'right'] : [which];
    const overrides = {};
    for (const side of sides) {
      const armRoll = side === 'right' ? -20 : 20;
      overrides[`mixamorig${side}arm`] = [60*DEG, 0, armRoll*DEG];
      overrides[`mixamorig${side}forearm`] = 15*DEG;
      Object.assign(overrides, OPEN(side));
    }
    sendPose(overrides);
  };

  window.synthiaThumbsUp = (side = 'right') => {
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
  };

  window.synthiaPeace = (side = 'right') => {
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
  };

  window.synthiaOK = (side = 'right') => {
    const armRoll = -(side === 'right' ? 30 : -30);
    const overrides = {
      [`mixamorig${side}arm`]: [65*DEG, 0, armRoll*DEG],
      [`mixamorig${side}forearm`]: 35*DEG,
      [`mixamorig${side}handthumb1`]: 50*DEG, [`mixamorig${side}handthumb2`]: 65*DEG, [`mixamorig${side}handthumb3`]: 50*DEG,
      [`mixamorig${side}handindex1`]: 40*DEG, [`mixamorig${side}handindex2`]: 55*DEG, [`mixamorig${side}handindex3`]: 40*DEG,
      [`mixamorig${side}handmiddle1`]: 0, [`mixamorig${side}handmiddle2`]: 0, [`mixamorig${side}handmiddle3`]: 0,
      [`mixamorig${side}handring1`]: 0, [`mixamorig${side}handring2`]: 0, [`mixamorig${side}handring3`]: 0,
      [`mixamorig${side}handpinky1`]: 0, [`mixamorig${side}handpinky2`]: 0, [`mixamorig${side}handpinky3`]: 0,
    };
    sendPose(overrides);
  };

  window.synthiaWave = (side = 'right', cycles = 3) => {
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
  };

  window.synthiaFingerRipple = (side = 'right') => {
    const basePose = {
      [`mixamorig${side}arm`]: [75*DEG, 0, 0],
      [`mixamorig${side}forearm`]: 15*DEG,
      ...OPEN(side)
    };
    
    const frames = [
      { t: 0, changes: {} },
      { t: 200, changes: { [`mixamorig${side}handthumb1`]: 75*DEG, [`mixamorig${side}handthumb2`]: 85*DEG, [`mixamorig${side}handthumb3`]: 75*DEG } },
      { t: 380, changes: { [`mixamorig${side}handindex1`]: 75*DEG, [`mixamorig${side}handindex2`]: 85*DEG, [`mixamorig${side}handindex3`]: 75*DEG } },
      { t: 560, changes: { [`mixamorig${side}handmiddle1`]: 75*DEG, [`mixamorig${side}handmiddle2`]: 85*DEG, [`mixamorig${side}handmiddle3`]: 75*DEG } },
      { t: 740, changes: { [`mixamorig${side}handring1`]: 75*DEG, [`mixamorig${side}handring2`]: 85*DEG, [`mixamorig${side}handring3`]: 75*DEG } },
      { t: 920, changes: { [`mixamorig${side}handpinky1`]: 75*DEG, [`mixamorig${side}handpinky2`]: 85*DEG, [`mixamorig${side}handpinky3`]: 75*DEG } },
      { t: 1100, changes: {} }
    ];

    const sequence = frames.map((frame, idx) => {
      // For each frame, we merge the base open hand with the specific finger curled
      const overrides = { ...basePose, ...frame.changes };
      return {
        timeOffsetMs: frame.t,
        overrides
      };
    });

    sendSequence(sequence);
  };

  console.log(`
[SYNTHIA] Hand & Finger Gestures Loaded:
- synthiaPoint(side)
- synthiaFist(which)
- synthiaOpenHand(which)
- synthiaThumbsUp(side)
- synthiaPeace(side)
- synthiaOK(side)
- synthiaWave(side, cycles)
- synthiaFingerRipple(side)
All functions exported to window. 'side' defaults to 'right', 'which' to 'both'.
  `);

})();
