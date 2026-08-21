/* 17.4-simclock — traveling gated two-step + SIMULATION CLOCK.
   Gait phase and timeouts now run on MuJoCo's simulation time (w.data.time)
   instead of wall-clock (performance.now). This makes the walk robust to
   screen-recording frame drops: when the physics slows down, the gait
   slows down with it, keeping the kinematic targets perfectly in phase
   with the physics substeps. Servo holdMs raised to 2000 ms (refresh 200 ms)
   to prevent the root drive from expiring during recorder stalls. */
(function () {
'use strict';
const cl = (v,a,b) => Math.min(b, Math.max(a,v));
const r3 = v => Math.round(v*1000)/1000;
const sm = p => 0.5 - 0.5*Math.cos(Math.PI*cl(p,0,1));
const kp = (p, pts) => {
  if (p <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, va] = pts[i], [b, vb] = pts[i+1];
    if (p <= b) return va + (vb - va) * sm((p - a) / (b - a));
  }
  return pts[pts.length-1][1];
};
window.MARCH = window.MARCH || {};
Object.assign(window.MARCH, {
  stepS: 0.8, finalHoldS: 1.2, maxWaitS: 0.6,
  hipPeak: 0.8, kneeFold: 1.1,
  hipPlant: 0.40, kneePlant: 0.15,
  footClear: 0.22, settle: 0.08,
  contactGap: 0.016, handoffHold: 0.15, minHHandoff: 0.78,
  servo: 0.12,          // body travels → COM ends up BETWEEN the feet
  extraReach: 0.15,     // second step hip reach bonus → left lands PAST right
  stanceTrail: 0.12,    // stance hip extends behind as body passes (no drag)
  leanFwd: 0.04, leanLR: 0.0, leanLRSign: 1,
  glued: true
});

function getContext(id='agent_0') {
  if (typeof window.synthiaGetContext === 'function') return window.synthiaGetContext(id);
  const b = window.__SYNTHIA_HUMANOID_BINDERS__;
  const pe = window.__SYNTHIA_PHYSICS_ENGINE__ || null;
  if (b && b.has && b.has(id)) return { binder: b.get(id), pe };
  return null;
}
let dispT = null, sampT = null, servT = null, S = null;

function stepCurves(p, K, hipPeak, hipPlant, startHip) {
  return {
    hip : kp(p, [[0,startHip],[0.35,hipPeak],[0.70,hipPlant+0.10],[1,hipPlant]]),
    knee: kp(p, [[0,0.05],[0.25,K.kneeFold],[0.60,K.kneePlant+0.15],[0.85,K.kneePlant],[1,K.kneePlant]]),
    ank : kp(p, [[0,0],[0.20,K.footClear],[0.60,0.10],[1,0]])
  };
}
const hold = (hip) => ({ hip, knee: 0.05, ank: 0 });

function pose(R, L, K, pitch, lz) {
  const o = {};
  o.mixamorigrightupleg=[r3(R.hip),0,0]; o.mixamorigleftupleg=[r3(L.hip),0,0];
  o.mixamorigrightleg=r3(R.knee);        o.mixamorigleftleg=r3(L.knee);
  o.mixamorigrightfoot=[r3(R.ank),0,0];  o.mixamorigleftfoot=[r3(L.ank),0,0];
  o.mixamorigspine=[r3(pitch),0,r3(lz)]; o.mixamorigspine1=[r3(pitch),0,r3(lz)];
  o.mixamorigspine2=[r3(pitch),0,r3(lz)]; o.mixamorighead=[r3(-pitch),0,r3(-lz)];
  o.mixamorigrightarm=[1.2,0,-0.3]; o.mixamorigleftarm=[1.2,0,0.3];
  o.mixamorigrightforearm=0.35; o.mixamorigleftforearm=0.35;
  return o;
}

window.synthiaMarchStop = function () {
  [dispT, sampT, servT].forEach(h => h && clearInterval(h)); dispT = sampT = servT = null;
  const ctx = getContext(); if (!ctx) return;
  const neutral = { mixamorigleftupleg:[0,0,0], mixamorigrightupleg:[0,0,0], mixamorigleftleg:0, mixamorigrightleg:0,
    mixamorigleftfoot:[0,0,0], mixamorigrightfoot:[0,0,0], mixamorigspine:[0,0,0], mixamorigspine1:[0,0,0],
    mixamorigspine2:[0,0,0], mixamorighead:[0,0,0] };
  window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId:'agent_0', activeGaitPhase:true,
    sequence: [{ timeOffsetMs:0, overrides:{} }, { timeOffsetMs:1200, overrides:neutral }] } }));
  if (ctx.binder && ctx.binder.setTargetRootVelocity) ctx.binder.setTargetRootVelocity(0, 0, 600);
  if (S) finish();
  console.log('[2STEP-G] released.');
};

function finish() {
  const s = S; S = null;
  const K = window.MARCH, sam = s.samples;
  const waitWin = sam.filter(f => f.t >= K.stepS && f.t <= (s.T2 || K.stepS + K.maxWaitS));
  const rCatch = waitWin.length ? Math.min(...waitWin.map(f => f.gapR ?? 9)) : 9;
  const lWin = s.T2 ? sam.filter(f => f.t >= s.T2) : [];
  const lPeak = lWin.length ? Math.max(...lWin.map(f => f.gapL || 0)) : 0;
  const lFwd = lWin.length ? Math.max(...lWin.map(f => f.fwdL || 0)) : 0;
  const rFwd = Math.max(...sam.map(f => f.fwdR || 0));
  const V = [];
  if (rCatch < K.contactGap) V.push(['R_PLANTED', 'right sole gap ' + r3(rCatch) + ' m.']);
  else V.push(['R_FLOATING', 'right sole never below ' + r3(rCatch) + ' m.']);
  V.push(['HANDOFF_' + (s.handoff || 'none').toUpperCase() + (s.T2 ? '_at_' + r3(s.T2) + 's' : ''),
    s.handoff === 'clean' ? 'left step launched on right contact.' :
    s.handoff === 'forced' ? 'destabilized while waiting — left step as catch.' :
    s.handoff === 'timeout' ? 'no contact in ' + K.maxWaitS + ' s — left step anyway.' : 'left step never started.']);
  if (lFwd > 0.05) V.push(['L_PAST_R', 'left foot landed ' + r3(lFwd) + ' m AHEAD of the right — the pass worked.']);
  else if (s.handoff) V.push(['L_LEVEL', 'left only reached ' + r3(lFwd) + ' m vs right — raise MARCH.extraReach or MARCH.servo.']);
  if (lPeak >= 0.02 && lFwd >= 0.08) V.push(['L_STEP_OK', 'left lifted ' + r3(lPeak) + ' m.']);
  if (s.fell) V.push(['FELL', 'at ' + r3(s.fellT) + ' s (minH ' + r3(s.minH) + ').']);
  if (rCatch < K.contactGap && s.handoff === 'clean' && lFwd > 0.05 && !s.fell)
    V.push(['TWO_STEP_OK', 'right plant → clean handoff → left PAST right, upright. Loop = walking.']);
  console.table(V.map(v => ({ verdict: v[0], detail: v[1] })));
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ test:'gated_twostep_v17_4_simclock', march:K,
      rCatch:r3(rCatch), handoff:s.handoff, handoffT:r3(s.T2), lPeak:r3(lPeak), lFwd:r3(lFwd), rFwd:r3(rFwd),
      fell:s.fell, fellT:r3(s.fellT), minH:r3(s.minH), samples:sam }, null, 2)], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = 'synthia_gated2step_' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  } catch(e){}
}

window.synthiaMarch = function (firstSide = 'right') {
  const K = window.MARCH, ctx = getContext();
  if (!ctx) { console.error('[2STEP-G] no binder.'); return; }
  window.synthiaMarchStop();
  const binder = ctx.binder, pe = ctx.pe;
  if (K.glued && binder) {
    binder.setReactionMassEnabled && binder.setReactionMassEnabled(true);
    binder.setCapsuleBalanceEnabled && binder.setCapsuleBalanceEnabled(true);
  }
  /* ── SERVO MARGIN: holdMs 2000 ms + 200 ms refresh survives recorder stalls ── */
  if (K.servo > 0 && binder && binder.setTargetRootVelocity) {
    binder.setTargetRootVelocity(0, K.servo, 2000);
    servT = setInterval(() => binder.setTargetRootVelocity(0, K.servo, 2000), 200);
  }
  const mj = window.__SYNTHIA_MUJOCO_MODULE__ || window.mujoco || null;
  const w0 = pe && pe.getWorld ? pe.getWorld() : null;
  const model = w0 && w0.model;
  const d0 = w0 && w0.data;
  const capId = (binder && binder.getCapsuleBodyId) ? binder.getCapsuleBodyId() : 1;
  const FB = {};
  if (mj && model) {
    const vt = x => (x && typeof x === 'object' && 'value' in x) ? x.value : x;
    const T = (mj.mjtObj) || {};
    for (const sd of ['right','left'])
      for (const n of ['agent_0_mixamorig'+sd+'foot','mixamorig'+sd+'foot']) {
        try { const b = mj.mj_name2id(model, vt(T.mjOBJ_BODY), n); if (b >= 0) { FB[sd]=b; break; } } catch(e){}
      }
  }
  const first = firstSide === 'left' ? 'L' : 'R', second = first === 'R' ? 'L' : 'R';
  S = { 
    t0: performance.now(), 
    sim0: (d0 && Number.isFinite(d0.time)) ? d0.time : 0,   // capture simulation start time
    T2: null, handoff: null, plantT: null, fell: false, fellT: null, minH: 9, samples: [] 
  };

  /* ── SIMULATION CLOCK: reads MuJoCo time, falls back to wall-clock if missing ── */
  const getT = () => {
    const w = pe && pe.getWorld ? pe.getWorld() : null;
    const d = w && w.data;
    return (d && Number.isFinite(d.time)) ? (d.time - S.sim0) : (performance.now() - S.t0) / 1000;
  };

  dispT = setInterval(() => {
    if (!S) return;
    const t = getT();
    const p1 = cl(t / K.stepS, 0, 1);
    const p2 = S.T2 ? cl((t - S.T2) / K.stepS, 0, 1) : 0;
    let F_, S_;   // first-step leg, second-step leg
    if (p1 < 1) F_ = stepCurves(p1, K, K.hipPeak, K.hipPlant, 0.02);
    else if (S.T2) F_ = hold(K.hipPlant - K.stanceTrail * sm(p2));      // stance hip trails behind
    else F_ = hold(K.hipPlant);
    if (!S.T2) S_ = hold(-K.stanceTrail * sm(p1));                       // stance extends as body passes
    else if (p2 < 1) S_ = stepCurves(p2, K, K.hipPeak + 0.5*K.extraReach, K.hipPlant + K.extraReach, -K.stanceTrail);
    else S_ = hold(K.hipPlant + K.extraReach);
    const R = first === 'R' ? F_ : S_, L = first === 'R' ? S_ : F_;
    const pitch = K.leanFwd * sm(Math.min(1, t / K.stepS));
    const stance = !S.T2 ? (first === 'R' ? 'L' : 'R') : second;
    const lz = K.leanLR * K.leanLRSign * (stance === 'L' ? 1 : -1) * sm(Math.min(1, t / 0.4));
    window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId:'agent_0', activeGaitPhase:true,
      sequence: [{ timeOffsetMs:0, overrides: pose(R, L, K, pitch, lz) }] } }));
  }, 100);
  sampT = setInterval(() => {
    if (!S) return;
    const w = pe.getWorld(), d = w && w.data; if (!d) return;
    const t = r3(getT());
    const H = d.xpos[capId*3+2];
    const gR = FB.right !== undefined ? Math.max(0, d.xpos[FB.right*3+2] - 0.090) : null;
    const gL = FB.left  !== undefined ? Math.max(0, d.xpos[FB.left*3+2]  - 0.090) : null;
    const yR = FB.right !== undefined ? d.xpos[FB.right*3+1] : null;
    const yL = FB.left  !== undefined ? d.xpos[FB.left*3+1]  : null;
    const gFirst = first === 'R' ? gR : gL;
    if (!S.T2 && t > 0.6 * K.stepS) {
      if (gFirst !== null && gFirst < K.contactGap) { if (!S.plantT) S.plantT = t; }
      else S.plantT = null;
      if (S.plantT && t - S.plantT >= K.handoffHold) { S.T2 = t; S.handoff = 'clean';
        console.log('%c[2STEP-G] ' + first + ' contact → ' + second + ' step NOW @' + t.toFixed(2) + 's', 'color:#0f0;font-weight:bold'); }
      else if (H < K.minHHandoff) { S.T2 = t; S.handoff = 'forced'; }
      else if (t > K.stepS + K.maxWaitS) { S.T2 = t; S.handoff = 'timeout'; }
    }
    if (H < S.minH) S.minH = H;
    if (H < 0.45 && !S.fell) { S.fell = true; S.fellT = t; }
    S.samples.push({ t, H: r3(H), gapR: r3(gR), gapL: r3(gL),
      fwdR: (yR !== null && yL !== null) ? r3(yL - yR) : null,
      fwdL: (yR !== null && yL !== null) ? r3(yR - yL) : null });
    if (S.samples.length % 10 === 0) console.log('[2STEP-G] t=' + t + ' H=' + H.toFixed(2) +
      ' fwdR=' + (yR!==null&&yL!==null ? (yL-yR).toFixed(2) : '?') + ' fwdL=' + (yR!==null&&yL!==null ? (yR-yL).toFixed(2) : '?'));
    const end = S.T2 ? S.T2 + K.stepS + K.finalHoldS : K.stepS + K.maxWaitS + K.stepS + K.finalHoldS;
    if (S.fell || t >= end) window.synthiaMarchStop();
  }, 50);
  console.log('%c[2STEP-G] v17.4-simclock: servo ' + K.servo + ' + extraReach ' + K.extraReach + ' + stanceTrail ' + K.stanceTrail + ' (recording-safe).', 'color:#0ff;font-weight:bold');
};
console.log('[2STEP-G] ready → synthiaMarch("right") | knobs: window.MARCH');
})();