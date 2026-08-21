import fs from 'node:fs';
const TAU = Math.PI*2, F = 32, FPS = 30;
const c = x => Math.cos(TAU*x), s = x => Math.sin(TAU*x);
const bump = x => 0.5 - 0.5*Math.cos(TAU*x);
const mod = x => ((x%1)+1)%1;
const cl = (v,a,b) => Math.min(b, Math.max(a, v));
const r6 = v => Math.round(v*1e6)/1e6;
const HIP_SIGN = +1, KNEE_SIGN = +1, ANKLE_SIGN = +1;   // verified: pitch+ = forward/flex
// Road-3: target ~0.3 m/s → stride 0.32 m per 1.067 s cycle.
const STRIDE = 0.32;
const FING = { thumb1:.25, thumb2:.50, thumb3:.20, index1:.35, index2:.50, index3:.30,
  middle1:.35, middle2:.50, middle3:.30, ring1:.35, ring2:.50, ring3:.30,
  pinky1:.30, pinky2:.45, pinky3:.25 };

// Swing-leg envelope: 0 at touch-down, rises to 1 at mid-swing, 0 at touch-down.
// Phase uu ∈ [0,1] is the leg's own phase; swing active on uu ∈ [0.02, 0.52].
const swingEnv = uu => {
  const p = mod(uu - 0.02);
  return p >= 0.5 ? 0 : bump(p * 2);
};

function frame(u){
  // phase chosen so frame 0 ≈ standing (both knees near min, hips ~0) → no startup slam
  const uL = mod(u+0.25), uR = mod(u+0.75), aL = uR, aR = uL;
  const o = {};
  const leg = (S,uu) => {
    // ── Road-3 gait: real swing clearance + near-straight stance ──────────
    // Swing leg (uu ∈ [0.02, 0.52]): hip flex +0.5·env, knee 1.0·bump, ankle dorsiflex +0.3·env.
    // Stance leg (other half): hip small extension hold, knee near-straight (~0.05),
    // ankle flat (0,0,0) — no plantar-flex during stance so the sole stays planted.
    const sw = swingEnv(uu);                      // 0 → 1 → 0 across the swing half
    const isSwing = mod(uu - 0.02) < 0.5;
    const pSwing = mod(uu - 0.02);               // 0..0.5 during swing
    const kneeKick = bump(pSwing);               // 0 → 1 → 0
    const ankleKick = bump(cl(pSwing - 0.05, 0, 1)); // slight lag behind hip

    const hipPitch = isSwing
      ? HIP_SIGN * 0.50 * sw
      : -0.10 + 0.04 * c(uu);                    // stance: slight extension hold
    const knee = isSwing
      ? KNEE_SIGN * 1.00 * kneeKick
      : KNEE_SIGN * (0.05 + 0.03 * bump(uu));    // stance: near-straight
    const ankle = isSwing
      ? ANKLE_SIGN * 0.30 * ankleKick            // dorsiflex to clear the ground
      : 0;

    o['mixamorig'+S+'upleg']  = [r6(cl(hipPitch,-2.094,2.094)), 0, 0];
    o['mixamorig'+S+'leg']    = r6(cl(knee,0,2.618));
    o['mixamorig'+S+'foot']   = [r6(cl(ankle,-0.785,0.785)), 0, 0];
    o['mixamorig'+S+'toebase']= 0;
  };
  leg('left',uL); leg('right',uR);
  const arm = (S,aa) => {
    o['mixamorig'+S+'shoulder'] = [r6(cl(0.20*s(aa)-0.2618,-0.7,0.7)), 0, 0];
    o['mixamorig'+S+'arm']      = [1.25, 0, 0];
    o['mixamorig'+S+'forearm']  = 0.12;
    o['mixamorig'+S+'hand']     = [0,0,0];
    for (const k in FING) o['mixamorig'+S+'hand'+k] = FING[k];
  };
  arm('left',aL); arm('right',aR);
  o.mixamorigspine  = [r6(cl(0.06+0.015*c(mod(2*u)),-0.524,0.785)), r6(cl(0.04*s(u),-0.524,0.524)), r6(cl(0.02*s(u),-0.524,0.524))];
  o.mixamorigspine1 = [0.02, r6(0.02*s(u)), r6(0.01*s(u))];
  o.mixamorigspine2 = [0.02, r6(0.02*s(u)), r6(0.01*s(u))];
  o.mixamorigneck   = [0, r6(-0.03*s(u)), 0];
  o.mixamorighead   = [-0.05, r6(-0.03*s(u)), 0];
  return o;
}
const sequence = [], rootMotion = [{dx:0,dy:0,dz:0}];
// Road-3: shape the root deltas with a half-cosine bump so the torso advances
// in a tuck/step rhythm instead of constant-speed coasting. Integral over the
// cycle = STRIDE, in -Z (forward).
for (let f=1; f<=F; f++) {
  const ph = (f-1)/F;                 // 0..~0.969 → covers frames 1..32
  const bumpF = 0.5 - 0.5*Math.cos(TAU * ph); // 0 → 1 → 0 across the cycle
  rootMotion.push({ dx: 0, dy: 0, dz: r6(-STRIDE * bumpF) });
}
for (let f=0; f<=F; f++) sequence.push({ timeOffsetMs: Math.round(f*1000/FPS), overrides: frame(mod(f/F)) });
const out = { metadata: { name:'Synthia Authored Walk v4', description:'Road-3 gait: real swing clearance (hip 0.5, knee 1.0, ankle dorsiflex 0.3), near-straight stance, root velocity ~0.3 m/s, torque-budget cadence.',
  source:'qwen-authored', schema:'synthia-action-timeline-v1', fps:FPS, frameCount:F, jointCount:52,
  'tposer-orientation':[0,0,0,1], rootMotion:'per-tick deltas (m), -Z = forward', generatedBy:'scripts/authorSynthiaGait.mjs' },
  sequence, rootMotion };
const dst = 'public/animations/mixamo-walking-synthia.json';
if (fs.existsSync(dst) && !fs.existsSync(dst+'.v3.bak')) fs.copyFileSync(dst, dst+'.v3.bak');
fs.writeFileSync(dst, JSON.stringify(out,null,2));
console.log('WROTE', dst, '| stride', STRIDE, 'm | speed', (STRIDE/(F/FPS)).toFixed(2), 'm/s');
