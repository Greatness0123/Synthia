(function() {
  const DEG = Math.PI / 180;

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

  window.synthiaLookAround = function(durationMs = 3000, agentId = 'agent_0') {
    const seq = [
      // 200ms settle: gently lock neck+head to neutral before any movement
      { timeOffsetMs: 0,               overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { timeOffsetMs: 200,             overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      // Slow turns with deliberate hold times so the servo tracks smoothly
      { timeOffsetMs: durationMs * 0.25, overrides: { mixamorigneck: [0, 0, -10 * DEG], mixamorighead: [0, 0, -25 * DEG] } },
      { timeOffsetMs: durationMs * 0.38, overrides: { mixamorigneck: [0, 0, -10 * DEG], mixamorighead: [0, 0, -25 * DEG] } },
      { timeOffsetMs: durationMs * 0.50, overrides: { mixamorigneck: [-4 * DEG, 0, 0],  mixamorighead: [-8 * DEG, 0, 0] } },
      { timeOffsetMs: durationMs * 0.63, overrides: { mixamorigneck: [-4 * DEG, 0, 0],  mixamorighead: [-8 * DEG, 0, 0] } },
      { timeOffsetMs: durationMs * 0.75, overrides: { mixamorigneck: [0, 0, 10 * DEG],  mixamorighead: [0, 0, 25 * DEG] } },
      { timeOffsetMs: durationMs * 0.88, overrides: { mixamorigneck: [0, 0, 10 * DEG],  mixamorighead: [0, 0, 25 * DEG] } },
      // Ease back to neutral
      { timeOffsetMs: durationMs,      overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } }
    ];
    sendSequence(seq, agentId);
  };

  window.synthiaNodYes = function(count = 3, agentId = 'agent_0') {
    const seq = [];
    // 200ms settle to lock head neutral before nodding starts
    seq.push({ timeOffsetMs: 0,   overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: 200, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    let t = 200;
    // Slower nod (250ms per half-cycle vs 150ms before) gives servo time to damp
    for (let i = 0; i < count; i++) {
      seq.push({ timeOffsetMs: t + 250, overrides: { mixamorigneck: [7 * DEG, 0, 0],  mixamorighead: [16 * DEG, 0, 0] } });
      seq.push({ timeOffsetMs: t + 500, overrides: { mixamorigneck: [-2 * DEG, 0, 0], mixamorighead: [-4 * DEG, 0, 0] } });
      t += 500;
    }
    // Hold neutral at end so servo settles without ringing
    seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: t + 600, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    sendSequence(seq, agentId);
  };

  window.synthiaShakeNo = function(count = 3, agentId = 'agent_0') {
    const seq = [];
    // 200ms settle to lock head neutral before shaking starts
    seq.push({ timeOffsetMs: 0,   overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: 200, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    let t = 200;
    // Slower shake (300ms per half-cycle vs 175ms before) prevents servo over-shoot ringing
    for (let i = 0; i < count; i++) {
      seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 9 * DEG],  mixamorighead: [0, 0, 20 * DEG] } });
      seq.push({ timeOffsetMs: t + 600, overrides: { mixamorigneck: [0, 0, -9 * DEG], mixamorighead: [0, 0, -20 * DEG] } });
      t += 600;
    }
    // Hold neutral at end so servo settles without ringing
    seq.push({ timeOffsetMs: t + 300, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    seq.push({ timeOffsetMs: t + 600, overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } });
    sendSequence(seq, agentId);
  };

  window.synthiaShrug = function(agentId = 'agent_0') {
    const natural = {
      mixamorigleftshoulder: [0, 0, 0],
      mixamorigrightshoulder: [0, 0, 0],
      mixamorigleftforearm: 0,
      mixamorigrightforearm: 0,
      mixamoriglefthand: [0, 0, 0],
      mixamorigrighthand: [0, 0, 0],
      mixamorighead: [0, 0, 0]
    };
    
    const shrugPose = {
      mixamorigleftshoulder: [-25 * DEG, 0, 0],
      mixamorigrightshoulder: [-25 * DEG, 0, 0],
      mixamorigleftforearm: 20 * DEG,
      mixamorigrightforearm: 20 * DEG,
      mixamoriglefthand: [0, 0, 15 * DEG],
      mixamorigrighthand: [0, 0, -15 * DEG],
      mixamorighead: [5 * DEG, 0, 0]
    };
    
    const seq = [
      { timeOffsetMs: 0, overrides: natural },
      { timeOffsetMs: 300, overrides: shrugPose },
      { timeOffsetMs: 800, overrides: shrugPose },
      { timeOffsetMs: 1200, overrides: natural }
    ];
    sendSequence(seq, agentId);
  };

  window.synthiaCelebrate = function(agentId = 'agent_0') {
    const natural = {
      mixamorigleftarm: [75 * DEG, 0, 0],
      mixamorigrightarm: [75 * DEG, 0, 0],
      mixamorigleftforearm: 0,
      mixamorigrightforearm: 0,
      mixamorighead: [0, 0, 0],
      mixamorigspine: [0, 0, 0]
    };
    
    const vShape = {
      mixamorigleftarm: [-80 * DEG, 0, 30 * DEG],
      mixamorigrightarm: [-80 * DEG, 0, -30 * DEG],
      mixamorigleftforearm: 10 * DEG,
      mixamorigrightforearm: 10 * DEG,
      mixamorighead: [-15 * DEG, 0, 0]
    };
    
    const bounce = {
      mixamorigleftarm: [-90 * DEG, 0, 35 * DEG],
      mixamorigrightarm: [-90 * DEG, 0, -35 * DEG],
      mixamorigspine: [-5 * DEG, 0, 0]
    };
    
    const halfDown = {
      mixamorigleftarm: [-45 * DEG, 0, 20 * DEG],
      mixamorigrightarm: [-45 * DEG, 0, -20 * DEG],
      mixamorigspine: [0, 0, 0],
      mixamorighead: [0, 0, 0]
    };
    
    const seq = [
      { timeOffsetMs: 0, overrides: natural },
      { timeOffsetMs: 250, overrides: vShape },
      { timeOffsetMs: 500, overrides: { ...vShape, ...bounce } },
      { timeOffsetMs: 750, overrides: { ...vShape, mixamorigspine: [0, 0, 0] } },
      { timeOffsetMs: 1000, overrides: halfDown },
      { timeOffsetMs: 1500, overrides: natural }
    ];
    sendSequence(seq, agentId);
  };

  window.synthiaReach = function(side = 'right', agentId = 'agent_0') {
    const isR = side === 'right';
    const armBone = isR ? 'mixamorigrightarm' : 'mixamorigleftarm';
    const otherArmBone = isR ? 'mixamorigleftarm' : 'mixamorigrightarm';
    const forearmBone = isR ? 'mixamorigrightforearm' : 'mixamorigleftforearm';
    const otherForearmBone = isR ? 'mixamorigleftforearm' : 'mixamorigrightforearm';
    const handBone = isR ? 'mixamorigrighthand' : 'mixamoriglefthand';
    const otherHandBone = isR ? 'mixamoriglefthand' : 'mixamorigrighthand';
    
    const overrides = {
      mixamorigspine: [8 * DEG, 0, 0],
      [armBone]: [10 * DEG, 0, isR ? -80 * DEG : 80 * DEG],
      [forearmBone]: 5 * DEG,
      [handBone]: [10 * DEG, 0, 0],
      [otherArmBone]: [75 * DEG, 0, 0],
      [otherForearmBone]: 0,
      [otherHandBone]: [0, 0, 0]
    };
    
    const fingers = ['thumb1','thumb2','thumb3','index1','index2','index3','middle1','middle2','middle3','ring1','ring2','ring3','pinky1','pinky2','pinky3'];
    fingers.forEach(f => {
      overrides[`mixamorig${isR ? 'right' : 'left'}hand${f}`] = 15 * DEG;
    });
    
    sendPose(overrides, 500, agentId);
  };

  window.synthiaKick = function(side = 'right', agentId = 'agent_0') {
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
  };

  window.synthiaBow = function(agentId = 'agent_0') {
    const natural = {
      mixamorigspine: [0, 0, 0],
      mixamorigspine1: [0, 0, 0],
      mixamorighead: [0, 0, 0],
      mixamorigleftarm: [75 * DEG, 0, 0],
      mixamorigrightarm: [75 * DEG, 0, 0]
    };
    
    const bow = {
      mixamorigspine: [25 * DEG, 0, 0],
      mixamorigspine1: [15 * DEG, 0, 0],
      mixamorighead: [20 * DEG, 0, 0],
      mixamorigleftarm: [80 * DEG, 0, 0],
      mixamorigrightarm: [80 * DEG, 0, 0]
    };
    
    const seq = [
      { timeOffsetMs: 0, overrides: natural },
      { timeOffsetMs: 400, overrides: bow },
      { timeOffsetMs: 1200, overrides: bow },
      { timeOffsetMs: 1800, overrides: natural }
    ];
    sendSequence(seq, agentId);
  };

  console.log(`
[SYNTHIA] Expressive & Utility Actions Loaded:
- synthiaLookAround(durationMs=3000)
- synthiaNodYes(count=3)
- synthiaShakeNo(count=3)
- synthiaShrug()
- synthiaCelebrate()
- synthiaReach(side='right')
- synthiaKick(side='right')
- synthiaBow()
  `);
})();
