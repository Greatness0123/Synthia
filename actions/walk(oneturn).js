/* 17.3 — 17's lively step + NEUTRAL plant ankle (16's proven full-sole recipe)
   + contact-only gated handoff (left step fires on right contact, no uz gate). */
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
let dispT = null, sampT = null, S = null;

/* NEUTRAL ankle at plant (ankEnd 0, hold ank 0) — 16's proven full-sole recipe */
function stepCurves(p, K) {
  return {
    hip : kp(p, [[0,0.02],[0.35,K.hipPeak],[0.70,K.hipPlant+0.10],[1,K.hipPlant]]),
    knee: kp(p, [[0,0.05],[0.25,K.kneeFold],[0.60,K.kneePlant+0.15],[0.85,K.kneePlant],[1,K.kneePlant]]),
    ank : kp(p, [[0,0],[0.20,K.footClear],[0.60,0.10],[1,0]])
  };
}
function holdLeg(sq, K) {
  const hip = K.hipPlant + K.settle*sq, knee = K.kneePlant*(1-sq) + 0.02*sq;
  return { hip, knee, ank: 0 };
}
const idleLeg = () => ({ hip: 0.02, knee: 0.05, ank: 0 });

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
  [dispT, sampT].forEach(h => h && clearInterval(h)); dispT = sampT = null;
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
  const rLevel = (waitWin.length && s.uz0 !== null) ? Math.max(...waitWin.map(f => 1 - Math.abs((f.soleUzR ?? s.uz0) - s.uz0))) : 0;
  const lWin = s.T2 ? sam.filter(f => f.t >= s.T2) : [];
  const lPeak = lWin.length ? Math.max(...lWin.map(f => f.gapL || 0)) : 0;
  const lFwd = lWin.length ? Math.max(...lWin.map(f => f.fwdL || 0)) : 0;
  const rFwd = Math.max(...sam.map(f => f.fwdR || 0));
  const V = [];
  if (rCatch < K.contactGap) V.push(['R_PLANTED', 'right sole gap ' + r3(rCatch) + ' m — contact determined.']);
  else V.push(['R_FLOATING', 'right sole never below ' + r3(rCatch) + ' m — raise MARCH.settle or contactGap.']);
  if (rLevel > 0.95) V.push(['R_SOLE_LEVEL', 'sole stayed level vs stand baseline (score ' + r3(rLevel) + ').']);
  else V.push(['R_SOLE_TILTED', 'sole deviated from stand baseline (score ' + r3(rLevel) + ') — informational only.']);
  V.push(['HANDOFF_' + (s.handoff || 'none').toUpperCase() + (s.T2 ? '_at_' + r3(s.T2) + 's' : ''),
    s.handoff === 'clean' ? 'left step launched the instant right contact was determined (your rule).' :
    s.handoff === 'forced' ? 'destabilized while waiting (H<' + K.minHHandoff + ') — left step as catch.' :
    s.handoff === 'timeout' ? 'no contact within ' + K.maxWaitS + ' s — left step anyway.' : 'left step never started.']);
  if (lPeak >= 0.02 && lFwd >= 0.08) V.push(['L_STEP_OK', 'left lifted ' + r3(lPeak) + ' m, reached ' + r3(lFwd) + ' m.']);
  else if (s.handoff) V.push(['L_STEP_WEAK', 'left peak ' + r3(lPeak) + ' / reach ' + r3(lFwd) + '.']);
  if (s.fell) V.push(['FELL', 'at ' + r3(s.fellT) + ' s (minH ' + r3(s.minH) + ').']);
  if (rCatch < K.contactGap && s.handoff === 'clean' && lFwd >= 0.08 && !s.fell)
    V.push(['TWO_STEP_OK', 'full-sole right plant → clean gated handoff → left step, upright. Loop = walking.']);
  console.table(V.map(v => ({ verdict: v[0], detail: v[1] })));
  try {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ test:'gated_twostep_v17_3', march:K,
      rCatch:r3(rCatch), rLevel:r3(rLevel), handoff:s.handoff, handoffT:r3(s.T2), lPeak:r3(lPeak), lFwd:r3(lFwd), rFwd:r3(rFwd),
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
  const mj = window.__SYNTHIA_MUJOCO_MODULE__ || window.mujoco || null;
  const w0 = pe && pe.getWorld ? pe.getWorld() : null;
  const model = w0 && w0.model;
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
  const soleUz = bi => { const i4 = bi*4; if (!pe.getWorld().data.xquat) return null;
    const qx = pe.getWorld().data.xquat[i4+1], qy = pe.getWorld().data.xquat[i4+2];
    return 1 - 2*(qx*qx + qy*qy); };
  const first = firstSide === 'left' ? 'L' : 'R', second = first === 'R' ? 'L' : 'R';
  S = { t0: performance.now(), T2: null, handoff: null, plantT: null, uz0: null, fell: false, fellT: null, minH: 9, samples: [] };
  dispT = setInterval(() => {
    if (!S) return;
    const t = (performance.now() - S.t0) / 1000;
    let R, L;
    if (first === 'R') {
      R = t < K.stepS ? stepCurves(t / K.stepS, K) : holdLeg(sm(Math.min(1, (t - K.stepS) / 0.25)), K);
      if (!S.T2) L = idleLeg();
      else L = (t - S.T2 < K.stepS) ? stepCurves((t - S.T2) / K.stepS, K) : holdLeg(sm(Math.min(1, (t - S.T2 - K.stepS) / 0.25)), K);
    } else {
      L = t < K.stepS ? stepCurves(t / K.stepS, K) : holdLeg(sm(Math.min(1, (t - K.stepS) / 0.25)), K);
      if (!S.T2) R = idleLeg();
      else R = (t - S.T2 < K.stepS) ? stepCurves((t - S.T2) / K.stepS, K) : holdLeg(sm(Math.min(1, (t - S.T2 - K.stepS) / 0.25)), K);
    }
    const pitch = K.leanFwd * sm(Math.min(1, t / K.stepS));
    const stance = !S.T2 ? (first === 'R' ? 'L' : 'R') : second;
    const lz = K.leanLR * K.leanLRSign * (stance === 'L' ? 1 : -1) * sm(Math.min(1, t / 0.4));
    window.dispatchEvent(new CustomEvent('synthia:action', { detail: { agentId:'agent_0', activeGaitPhase:true,
      sequence: [{ timeOffsetMs:0, overrides: pose(R, L, K, pitch, lz) }] } }));
  }, 100);
  sampT = setInterval(() => {
    if (!S) return;
    const w = pe.getWorld(), d = w && w.data; if (!d) return;
    const t = r3((performance.now() - S.t0) / 1000);
    const H = d.xpos[capId*3+2];
    const gR = FB.right !== undefined ? Math.max(0, d.xpos[FB.right*3+2] - 0.090) : null;
    const gL = FB.left  !== undefined ? Math.max(0, d.xpos[FB.left*3+2]  - 0.090) : null;
    const yR = FB.right !== undefined ? d.xpos[FB.right*3+1] : null;
    const yL = FB.left  !== undefined ? d.xpos[FB.left*3+1]  : null;
    const uzR = FB.right !== undefined ? soleUz(FB.right) : null;
    if (S.uz0 === null && uzR !== null) S.uz0 = uzR;   // stand baseline (≈ -0.63 on this rig)
    const gFirst = first === 'R' ? gR : gL;
    /* ── GATE: contact-only. Left step fires when right sole contact is determined. ── */
    if (!S.T2 && t > 0.6 * K.stepS) {
      if (gFirst !== null && gFirst < K.contactGap) { if (!S.plantT) S.plantT = t; }
      else S.plantT = null;
      if (S.plantT && t - S.plantT >= K.handoffHold) { S.T2 = t; S.handoff = 'clean';
        console.log('%c[2STEP-G] ' + first + ' contact determined → ' + second + ' step NOW @' + t.toFixed(2) + 's', 'color:#0f0;font-weight:bold'); }
      else if (H < K.minHHandoff) { S.T2 = t; S.handoff = 'forced'; console.warn('[2STEP-G] unstable → ' + second + ' step forced @' + t.toFixed(2) + 's'); }
      else if (t > K.stepS + K.maxWaitS) { S.T2 = t; S.handoff = 'timeout'; console.warn('[2STEP-G] no contact in ' + K.maxWaitS + 's → ' + second + ' step anyway @' + t.toFixed(2) + 's'); }
    }
    if (H < S.minH) S.minH = H;
    if (H < 0.45 && !S.fell) { S.fell = true; S.fellT = t; }
    S.samples.push({ t, H: r3(H), gapR: r3(gR), gapL: r3(gL), soleUzR: r3(uzR),
      fwdR: (yR !== null && yL !== null) ? r3(yL - yR) : null,
      fwdL: (yR !== null && yL !== null) ? r3(yR - yL) : null });
    if (S.samples.length % 10 === 0) console.log('[2STEP-G] ' + (t < K.stepS ? first + '_STEP' : (!S.T2 ? 'WAIT' : (t < S.T2 + K.stepS ? second + '_STEP' : 'HOLD'))) +
      ' t=' + t + ' g' + first + '=' + (gFirst===null?'?':gFirst.toFixed(3)) + ' H=' + H.toFixed(2));
    const end = S.T2 ? S.T2 + K.stepS + K.finalHoldS : K.stepS + K.maxWaitS + K.stepS + K.finalHoldS;
    if (S.fell || t >= end) window.synthiaMarchStop();
  }, 50);
  console.log('%c[2STEP-G] v17.3: lively 17 step + NEUTRAL plant ankle + contact-gated ' + second + ' step.', 'color:#0ff;font-weight:bold');
};
console.log('[2STEP-G] ready → synthiaMarch("right") | knobs: window.MARCH (contactGap, handoffHold, settle, maxWaitS)');
})();