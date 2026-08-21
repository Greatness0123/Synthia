/* 17.8 — step-over placement + sign-correct pitch governor. */
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
  hipPeak: 0.8, kneeFold: 1.1, kneeFoldBoost: 0.1,
  hipPlant: 0.40, kneePlant: 0.15,
  footClear: 0.22, settle: 0.08,
  contactGap: 0.016, handoffHold: 0.15, minHHandoff: 0.78,
  servo: 0.15, extraReach: 0.08, stanceTrail: 0.12,
  leanFwd: 0.03, leanLR: 0.0, leanLRSign: 1,
  pitchCut: 0.30, pitchHalf: 0.18, catchPitch: 0.45,
  placeAhead: 0.12, legLenV: 0.86,                 // NEW: world-referenced step-over
  mode: 'loop', distanceM: 2.0, maxSteps: 8,
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
function stepCurves(p, K, P) {
  return {
    hip : kp(p, [[0,P.startHip],[0.35,P.hipPeak],[0.70,P.hipPlant+0.10],[1,P.hipPlant]]),
    knee: kp(p, [[0,0.05],[0.25,P.kneeFold],[0.60,K.kneePlant+0.15],[0.85,K.kneePlant],[1,K.kneePlant]]),
    ank : kp(p, [[0,0],[0.20,K.footClear],[0.60,0.10],[1,0]])
  };
}
const holdLeg = (hip, kneeFrom, sq) => ({ hip, knee: kneeFrom*(1-sq) + 0.02*sq, ank: 0 });
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
  console.log('[WALK17.8] released.');
};
function finish() {
  const s = S; S = null;
  const K = window.MARCH, sam = s.samples;
  const V = [];
  V.push(['STEPS', s.steps.length + ' steps, ' + s.cleanCount + ' clean, dist ' + r3(s.dist) + ' m, maxFwdPitch ' + r3(s.maxPitch) + '.']);
  V.push(['CLEARANCE', 'R ' + r3(s.peakR) + ' / L ' + r3(s.peakL) + ' m.']);
  if (s.catch) V.push(['CATCH', 'arrest state triggered.']);
  if (s.fell) V.push(['FELL', 'at ' + r3(s.fellT) + ' s (minH ' + r3(s.minH) + ').']);
  else V.push(['UPRIGHT', 'minH ' + r3(s.minH) + '.']);
  if (!s.fell && s.dist >= K.distanceM) V.push(['WALK_COMPLETE', 'loop reached ' + K.distanceM + ' m.']);
  console.table(V.map(v => ({ verdict: v[0], detail: v[1] })));
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ test:'continuous_walk_v17_8', march:K,
      steps:s.steps.length, cleanCount:s.cleanCount, peakR:r3(s.peakR), peakL:r3(s.peakL),
      maxPitch:r3(s.maxPitch), catch:s.catch, dist:r3(s.dist), fell:s.fell, fellT:r3(s.fellT), minH:r3(s.minH), samples:sam }, null, 2)], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = 'synthia_walk178_' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  } catch(e){}
}
window.synthiaMarch = function (firstSide = 'right') {
  const K = window.MARCH, ctx = getContext();
  if (!ctx) { console.error('[WALK17.8] no binder.'); return; }
  window.synthiaMarchStop();
  const binder = ctx.binder, pe = ctx.pe;
  if (K.glued && binder) {
    binder.setReactionMassEnabled && binder.setReactionMassEnabled(true);
    binder.setCapsuleBalanceEnabled && binder.setCapsuleBalanceEnabled(true);
  }
  if (K.servo > 0 && binder && binder.setTargetRootVelocity) {
    binder.setTargetRootVelocity(0, K.servo, 2000);
    servT = setInterval(() => { if (S) binder.setTargetRootVelocity(0, K.servo * S.servoScale, 2000); }, 200);
  }
  const w0 = pe && pe.getWorld ? pe.getWorld() : null;
  const d0 = w0 && w0.data;
  const capId = (binder && binder.getCapsuleBodyId) ? binder.getCapsuleBodyId() : 1;
  const FB = {};
  if (w0 && w0.model) {
    const mj = window.__SYNTHIA_MUJOCO_MODULE__ || window.mujoco || null;
    const vt = x => (x && typeof x === 'object' && 'value' in x) ? x.value : x;
    const T = (mj && mj.mjtObj) || {};
    for (const sd of ['right','left'])
      for (const n of ['agent_0_mixamorig'+sd+'foot','mixamorig'+sd+'foot']) {
        try { const b = mj.mj_name2id(w0.model, vt(T.mjOBJ_BODY), n); if (b >= 0) { FB[sd]=b; break; } } catch(e){}
      }
  }
  const paramsFor = i => (i === 0)
    ? { hipPeak:K.hipPeak, hipPlant:K.hipPlant, startHip:0.02, kneeFold:K.kneeFold }
    : { hipPeak:K.hipPeak + 0.5*K.extraReach, hipPlant:K.hipPlant + K.extraReach, startHip:-K.stanceTrail, kneeFold:K.kneeFold + K.kneeFoldBoost };
  const first = firstSide === 'left' ? 'L' : 'R';
  S = { t0:0, sim0:(d0 && Number.isFinite(d0.time)) ? d0.time : 0,
    steps: [{ leg:first, t0:0, P:paramsFor(0) }],
    plantT:null, done:false, cleanCount:0, catch:false, catchT:0,
    servoScale:1, leanScale:1, maxPitch:0,
    peakR:0, peakL:0, dist:0, fell:false, fellT:null, minH:9,
    startY:(d0 && d0.xpos) ? d0.xpos[capId*3+1] : 0, samples: [] };
  const getT = () => {
    const w = pe && pe.getWorld ? pe.getWorld() : null;
    const d = w && w.data;
    return (d && Number.isFinite(d.time)) ? (d.time - S.sim0) : 0;
  };
  dispT = setInterval(() => {
    if (!S) return;
    const t = getT();
    if (S.catch) {
      const C = { hip:0.12, knee:0.12, ank:0 };
      window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId:'agent_0', activeGaitPhase:true,
        sequence: [{ timeOffsetMs:0, overrides: pose(C, C, K, 0, 0) }] } }));
      return;
    }
    const cur = S.steps[S.steps.length-1];
    const pCur = cl((t - cur.t0)/K.stepS, 0, 1);
    const swinging = (t - cur.t0) < K.stepS;
    const legState = leg => {
      let last = null, li = -1;
      for (let i = 0; i < S.steps.length; i++) if (S.steps[i].leg === leg) { last = S.steps[i]; li = i; }
      if (last && li === S.steps.length-1 && swinging) return { kind:'swing', st:last, p:pCur };
      if (last) return { kind:'planted', st:last };
      return { kind:'idle' };
    };
    const mk = leg => {
      const stt = legState(leg);
      if (stt.kind === 'swing') return stepCurves(stt.p, K, stt.st.P);
      if (stt.kind === 'planted') {
        const sq = sm(cl((t - (stt.st.t0 + K.stepS))/0.25, 0, 1));
        const hip = stt.st.P.hipPlant - (swinging ? K.stanceTrail*sm(pCur) : 0);
        return holdLeg(hip, K.kneePlant, sq);
      }
      return { hip:-K.stanceTrail*(swinging ? sm(pCur) : 0), knee:0.05, ank:0 };
    };
    const R = mk('R'), L = mk('L');
    const pitch = K.leanFwd * S.leanScale * sm(Math.min(1, t/0.4));
    const stance = cur.leg === 'R' ? 'L' : 'R';
    const lz = K.leanLR * K.leanLRSign * (stance === 'L' ? 1 : -1) * sm(Math.min(1, t/0.4));
    window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId:'agent_0', activeGaitPhase:true,
      sequence: [{ timeOffsetMs:0, overrides: pose(R, L, K, pitch, lz) }] } }));
  }, 100);
  sampT = setInterval(() => {
    if (!S) return;
    const w = pe.getWorld(), d = w && w.data; if (!d) return;
    const t = r3(getT());
    const H = d.xpos[capId*3+2];
    const yPel = d.xpos[capId*3+1];
    const gR = FB.right !== undefined ? Math.max(0, d.xpos[FB.right*3+2] - 0.090) : null;
    const gL = FB.left  !== undefined ? Math.max(0, d.xpos[FB.left*3+2]  - 0.090) : null;
    const yR = FB.right !== undefined ? d.xpos[FB.right*3+1] : null;
    const yL = FB.left  !== undefined ? d.xpos[FB.left*3+1]  : null;
    S.dist = S.startY - yPel;
    /* ── SIGN-CORRECT forward pitch (+ = top leaning FORWARD on this rig) ── */
    const i4 = capId*4, qw=d.xquat[i4], qx=d.xquat[i4+1], qy=d.xquat[i4+2], qz=d.xquat[i4+3];
    const uy = 2*(qy*qz - qw*qx), uz = 1 - 2*(qx*qx + qy*qy);
    const pf = -Math.atan2(uy, uz);
    if (pf > S.maxPitch) S.maxPitch = pf;
    S.servoScale = pf < K.pitchHalf ? 1 : (pf < K.pitchCut ? 0.5 : 0);
    S.leanScale  = pf < 0.15 ? 1 : (pf < 0.25 ? 0.5 : 0);
    if (pf > K.catchPitch && !S.catch) { S.catch = true; S.catchT = t; S.servoScale = 0;
      console.warn('%c[WALK17.8] CATCH @' + t.toFixed(2) + 's (fwd pitch ' + pf.toFixed(2) + ')', 'color:#fa0;font-weight:bold'); }
    if (S.catch && t - S.catchT > 1.2) { window.synthiaMarchStop(); return; }
    const cur = S.steps[S.steps.length-1];
    const dt = t - cur.t0;
    const swinging = dt < K.stepS;
    if (swinging) {
      const g = cur.leg === 'R' ? gR : gL;
      if (g !== null) { if (cur.leg === 'R') S.peakR = Math.max(S.peakR, g); else S.peakL = Math.max(S.peakL, g); }
    }
    /* ── GATE + STEP-OVER PLACEMENT ── */
    if (!S.done && dt > 0.6*K.stepS) {
      const g = cur.leg === 'R' ? gR : gL;
      const go = how => {
        if (how === 'clean') S.cleanCount++;
        S.plantT = null;
        if (K.mode === 'loop' && S.steps.length < K.maxSteps && S.dist < K.distanceM) {
          /* place the new swing foot placeAhead AHEAD of the most-forward foot */
          const yFront = Math.min(yR ?? yPel, yL ?? yPel);
          const reach = yPel - (yFront - K.placeAhead);
          const hipCmd = cl(Math.atan2(reach, K.legLenV), 0.30, 0.85);
          const P = paramsFor(S.steps.length);
          P.hipPlant = Math.max(0.35, hipCmd);
          P.hipPeak = Math.max(P.hipPeak, P.hipPlant + 0.10);
          S.steps.push({ leg: cur.leg === 'R' ? 'L' : 'R', t0: t, P });
          console.log('%c[WALK17.8] step ' + S.steps.length + ' (' + S.steps[S.steps.length-1].leg + ') @' + t.toFixed(2) +
            's [' + how + '] hipPlant=' + P.hipPlant.toFixed(2) + ' (reach ' + reach.toFixed(2) + ' m)', 'color:#0f0;font-weight:bold');
        } else S.done = true;
      };
      if (dt < K.stepS + K.maxWaitS) {
        if (g !== null && g < K.contactGap) { if (!S.plantT) S.plantT = t; } else S.plantT = null;
        if (S.plantT && t - S.plantT >= K.handoffHold) go('clean');
        else if (H < K.minHHandoff) go('forced');
      } else {
        const planted = Math.min(gR ?? 9, gL ?? 9) < K.contactGap;
        if (planted && H > 0.80) go('timeout');
        else { S.catch = true; S.catchT = t; S.servoScale = 0;
          console.warn('%c[WALK17.8] CATCH @' + t.toFixed(2) + 's (no planted foot on timeout)', 'color:#fa0;font-weight:bold'); }
      }
    }
    if (S.dist >= K.distanceM) S.done = true;
    if (H < S.minH) S.minH = H;
    if (H < 0.45 && !S.fell) { S.fell = true; S.fellT = t; }
    S.samples.push({ t, H:r3(H), gapR:r3(gR), gapL:r3(gL), dist:r3(S.dist), step:S.steps.length, pitch:r3(pf), servo:S.servoScale });
    if (S.samples.length % 10 === 0) console.log('[WALK17.8] t='+t+' step='+S.steps.length+' dist='+S.dist.toFixed(2)+
      ' H='+H.toFixed(2)+' pitch='+pf.toFixed(2)+' sv='+S.servoScale+' gR='+(gR===null?'?':gR.toFixed(3))+' gL='+(gL===null?'?':gL.toFixed(3)));
    const lastDone = S.done && !swinging && dt > K.finalHoldS;
    if (S.fell || lastDone) window.synthiaMarchStop();
  }, 50);
  console.log('%c[WALK17.8] step-over placement (placeAhead=' + K.placeAhead + ') + sign-correct governor.', 'color:#0ff;font-weight:bold');
};
console.log('[WALK17.8] ready → synthiaMarch("right")');
})();