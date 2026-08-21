/**
 * ═══════════════════════════════════════════════════════════════════
 * Synthia Action Runner — Master Console Suite
 * 
 * Provides a unified namespace `window.synthiaActions` to inspect,
 * trigger, and chain all humanoid motion presets.
 * 
 * Usage in browser DevTools Console:
 *   synthiaActions.help()               — List all available action commands
 *   synthiaActions.walk(2.0, 0.08)       — Start continuous robotic waddle (2m at 0.08m/s)
 *   synthiaActions.walkMicro(1.0)        — Start cautious micro-shift shuffle
 *   synthiaActions.stopWalk()            — Halt walking and reset to stable stance
 *   synthiaActions.jump(6.0)             — Execute vertical jump with squat prep & soft landing
 *   synthiaActions.forwardLeap()         — Jump with forward momentum
 *   synthiaActions.bunnyHop(3)           — Series of rapid small hops
 *   synthiaActions.squat()               — Deep balanced squat
 *   synthiaActions.guard()               — Combat boxing guard stance
 *   synthiaActions.natural()             — Natural resting posture
 *   synthiaActions.reset()               — Full pose reset to upright bind pose
 *   synthiaActions.point('right')        — Point index finger forward
 *   synthiaActions.fist('both')          — Form tight closed fists
 *   synthiaActions.wave('right', 3)      — Wave hand back and forth
 *   synthiaActions.thumbsUp('right')     — Thumbs up gesture
 *   synthiaActions.peace('right')        — Victory / peace sign
 *   synthiaActions.ok('right')           — OK sign
 *   synthiaActions.ripple('right')       — Sequential finger wave / ripple
 *   synthiaActions.lookAround(3000)      — Smooth head scan
 *   synthiaActions.nod(3)                — Head nod (agreement)
 *   synthiaActions.shake(3)              — Head shake (disagreement)
 *   synthiaActions.shrug()               — Expressive shoulder shrug
 *   synthiaActions.celebrate()           — Two-handed celebration cheer
 *   synthiaActions.reach('right')        — Forward single-arm reach
 *   synthiaActions.kick('right')         — Front snap kick with balance prep
 *   synthiaActions.bow()                 — Formal forward bow
 * ═══════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const DEG = Math.PI / 180;

  function getBinder(agentId = 'agent_0') {
    const binders = window.__SYNTHIA_HUMANOID_BINDERS__;
    if (binders && binders.has(agentId)) {
      return binders.get(agentId);
    }
    return window.__SYNTHIA_HUMANOID_BINDER__ || null;
  }

  function getPhysics() {
    return window.__SYNTHIA_PHYSICS_ENGINE__ || null;
  }

  const synthiaActions = {
    // ── Locomotion ──────────────────────────────────────────────────
    walk: function (distanceM = 2.0, speedMps = 0.12, agentId = 'agent_0') {
      if (typeof window.synthiaWalk === 'function') {
        window.synthiaWalk(distanceM, speedMps, agentId);
      } else {
        console.warn('[Runner] synthiaWalk not found. Please paste 02_walking_and_locomotion.js');
      }
    },

    walkBackward: function (distanceM = 2.0, speedMps = 0.12, agentId = 'agent_0') {
      if (typeof window.synthiaWalkBackward === 'function') {
        window.synthiaWalkBackward(distanceM, speedMps, agentId);
      } else {
        console.warn('[Runner] synthiaWalkBackward not found. Please paste 02_walking_and_locomotion.js');
      }
    },

    walkMicro: function (distanceM = 1.0, agentId = 'agent_0') {
      if (typeof window.synthiaWalkMicro === 'function') {
        window.synthiaWalkMicro(distanceM, agentId);
      } else {
        console.warn('[Runner] synthiaWalkMicro not found. Please paste 02_walking_and_locomotion.js');
      }
    },

    stopWalk: function (agentId = 'agent_0') {
      if (typeof window.synthiaStopWalk === 'function') {
        window.synthiaStopWalk(agentId);
      } else {
        const b = getBinder(agentId);
        if (b) b.setTargetRootVelocity(0, 0, 0);
        window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId } }));
      }
    },

    // ── Stances & Postures ──────────────────────────────────────────
    reset: function () {
      if (typeof window.synthiaPoseReset === 'function') {
        window.synthiaPoseReset();
      } else {
        window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: 'agent_0' } }));
      }
    },

    natural: function () {
      if (typeof window.synthiaPoseNatural === 'function') {
        window.synthiaPoseNatural();
      }
    },

    guard: function () {
      if (typeof window.synthiaPoseGuard === 'function') {
        window.synthiaPoseGuard();
      }
    },

    squat: function () {
      if (typeof window.synthiaPoseSquat === 'function') {
        window.synthiaPoseSquat();
      }
    },

    handsOnHips: function () {
      if (typeof window.synthiaPoseHandsOnHips === 'function') {
        window.synthiaPoseHandsOnHips();
      }
    },

    armsCrossed: function () {
      if (typeof window.synthiaPoseArmsCrossed === 'function') {
        window.synthiaPoseArmsCrossed();
      }
    },

    tPose: function () {
      if (typeof window.synthiaPoseTPose === 'function') {
        window.synthiaPoseTPose();
      }
    },

    armsOverhead: function () {
      if (typeof window.synthiaPoseArmsOverhead === 'function') {
        window.synthiaPoseArmsOverhead();
      }
    },

    // ── Jumping & Aerial ────────────────────────────────────────────
    jump: function (force = 6.0) {
      if (typeof window.synthiaJump === 'function') {
        window.synthiaJump(force);
      }
    },

    forwardLeap: function () {
      if (typeof window.synthiaForwardLeap === 'function') {
        window.synthiaForwardLeap();
      }
    },

    bunnyHop: function (count = 3) {
      if (typeof window.synthiaBunnyHop === 'function') {
        window.synthiaBunnyHop(count);
      }
    },

    squatJump: function () {
      if (typeof window.synthiaSquatJump === 'function') {
        window.synthiaSquatJump();
      }
    },

    // ── Hand & Finger Gestures ──────────────────────────────────────
    point: function (side = 'right') {
      if (typeof window.synthiaPoint === 'function') {
        window.synthiaPoint(side);
      }
    },

    fist: function (which = 'both') {
      if (typeof window.synthiaFist === 'function') {
        window.synthiaFist(which);
      }
    },

    openHand: function (which = 'both') {
      if (typeof window.synthiaOpenHand === 'function') {
        window.synthiaOpenHand(which);
      }
    },

    thumbsUp: function (side = 'right') {
      if (typeof window.synthiaThumbsUp === 'function') {
        window.synthiaThumbsUp(side);
      }
    },

    peace: function (side = 'right') {
      if (typeof window.synthiaPeace === 'function') {
        window.synthiaPeace(side);
      }
    },

    ok: function (side = 'right') {
      if (typeof window.synthiaOK === 'function') {
        window.synthiaOK(side);
      }
    },

    wave: function (side = 'right', cycles = 3) {
      if (typeof window.synthiaWave === 'function') {
        window.synthiaWave(side, cycles);
      }
    },

    ripple: function (side = 'right') {
      if (typeof window.synthiaFingerRipple === 'function') {
        window.synthiaFingerRipple(side);
      }
    },

    // ── Expressive & Utility ────────────────────────────────────────
    lookAround: function (durationMs = 3000) {
      if (typeof window.synthiaLookAround === 'function') {
        window.synthiaLookAround(durationMs);
      }
    },

    nod: function (count = 3) {
      if (typeof window.synthiaNodYes === 'function') {
        window.synthiaNodYes(count);
      }
    },

    shake: function (count = 3) {
      if (typeof window.synthiaShakeNo === 'function') {
        window.synthiaShakeNo(count);
      }
    },

    shrug: function () {
      if (typeof window.synthiaShrug === 'function') {
        window.synthiaShrug();
      }
    },

    celebrate: function () {
      if (typeof window.synthiaCelebrate === 'function') {
        window.synthiaCelebrate();
      }
    },

    reach: function (side = 'right') {
      if (typeof window.synthiaReach === 'function') {
        window.synthiaReach(side);
      }
    },

    kick: function (side = 'right') {
      if (typeof window.synthiaKick === 'function') {
        window.synthiaKick(side);
      }
    },

    bow: function () {
      if (typeof window.synthiaBow === 'function') {
        window.synthiaBow();
      }
    },

    // ── Diagnostics & Telemetry ─────────────────────────────────────
    status: function (agentId = 'agent_0') {
      const b = getBinder(agentId);
      const pe = getPhysics();
      if (!b || !pe) {
        console.log('[Status] Binder or Physics Engine not loaded.');
        return null;
      }
      const data = pe.getWorld() ? pe.getWorld().data : null;
      const capId = (typeof b.getCapsuleBodyId === 'function') ? b.getCapsuleBodyId() : 1;
      const isGrounded = b._isGrounded;
      const rmbsMode = (typeof b.rmbsMode === 'function') ? b.rmbsMode() : 'N/A';
      
      const pos = data && data.xpos ? {
        x: data.xpos[capId * 3]?.toFixed(3),
        y: data.xpos[capId * 3 + 1]?.toFixed(3),
        z: data.xpos[capId * 3 + 2]?.toFixed(3)
      } : { x: '?', y: '?', z: '?' };

      console.log(`%c[SYNTHIA STATUS: ${agentId}]`, 'color:#0ff; font-weight:bold');
      console.log(`- Position (MuJoCo): X=${pos.x}, Y=${pos.y} (Forward is -Y), Z=${pos.z} (Up)`);
      console.log(`- Grounded: ${isGrounded ? 'YES' : 'NO'}`);
      console.log(`- RMBS Mode: ${rmbsMode}`);
      return { pos, isGrounded, rmbsMode };
    },

    help: function () {
      console.log(`%c
═════════════════════════════════════════════════════════════════
  SYNTHIA ACTIONS MASTER RUNNER (window.synthiaActions)
═════════════════════════════════════════════════════════════════
  Locomotion:
    synthiaActions.walk(meters=2.0, speed=0.08)  — Continuous waddle
    synthiaActions.walkMicro(meters=1.0)          — Cautious micro-shuffle
    synthiaActions.stopWalk()                     — Stop and stabilize
  
  Jumps & Aerial:
    synthiaActions.jump(force=6.0)               — Squat prep + vertical jump
    synthiaActions.forwardLeap()                 — Jump with forward momentum
    synthiaActions.bunnyHop(count=3)             — Rapid mini hops
    synthiaActions.squatJump()                   — Deep explosive squat jump
  
  Postures & Stances:
    synthiaActions.reset()                       — Reset to upright bind pose
    synthiaActions.natural()                     — Natural resting stance
    synthiaActions.guard()                       — Combat boxing guard
    synthiaActions.squat()                       — Deep balanced squat
    synthiaActions.handsOnHips()                 — Akimbo posture
    synthiaActions.armsCrossed()                 — Crossed arms posture
    synthiaActions.tPose()                       — T-Pose diagnostic
    synthiaActions.armsOverhead()                — High stretch
  
  Hand & Finger Gestures:
    synthiaActions.point('right'|'left')         — Index point forward
    synthiaActions.fist('both'|'right'|'left')   — Closed fists
    synthiaActions.openHand('both')              — Flat open palms
    synthiaActions.thumbsUp('right'|'left')      — Thumbs up
    synthiaActions.peace('right'|'left')         — Peace / victory sign
    synthiaActions.ok('right'|'left')            — OK sign
    synthiaActions.wave('right'|'left', 3)       — Animated hand wave
    synthiaActions.ripple('right'|'left')        — Finger curl ripple
  
  Expressive Motions:
    synthiaActions.lookAround(3000)              — Head scanning
    synthiaActions.nod(3)                        — Head nod (yes)
    synthiaActions.shake(3)                      — Head shake (no)
    synthiaActions.shrug()                       — Shoulder shrug
    synthiaActions.celebrate()                   — Arms overhead cheer
    synthiaActions.reach('right'|'left')         — Forward arm reach
    synthiaActions.kick('right'|'left')          — Front snap kick
    synthiaActions.bow()                         — Polite forward bow
  
  Diagnostics:
    synthiaActions.status()                      — Print position & stability
═════════════════════════════════════════════════════════════════`, 'color:#7ef; font-family:monospace');
    }
  };

  window.synthiaActions = synthiaActions;
  synthiaActions.help();
})();
