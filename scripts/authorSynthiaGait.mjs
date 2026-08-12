import fs from 'node:fs';
const TAU = Math.PI*2, F = 32, FPS = 30;
const c = x => Math.cos(TAU*x), s = x => Math.sin(TAU*x);
const bump = x => 0.5 - 0.5*Math.cos(TAU*x);
const mod = x => ((x%1)+1)%1;
const cl = (v,a,b) => Math.min(b, Math.max(a, v));
const r6 = v => Math.round(v*1e6)/1e6;
const HIP_SIGN = +1, KNEE_SIGN = +1;      // verified
const STRIDE = 0.35;                       // 0.33 m/s — inside the torque budget
const FING = { thumb1:.25, thumb2:.50, thumb3:.20, index1:.35, index2:.50, index3:.30,
  middle1:.35, middle2:.50, middle3:.30, ring1:.35, ring2:.50, ring3:.30,
  pinky1:.30, pinky2:.45, pinky3:.25 };

function frame(u){
  // phase chosen so frame 0 ≈ standing (both knees near min, hips ~0) → no startup slam
  const uL = mod(u+0.25), uR = mod(u+0.75), aL = uR, aR = uL;
  const o = {};
  const leg = (S,uu) => {
    o['mixamorig'+S+'upleg']  = [r6(cl(HIP_SIGN*0.22*c(uu),-2.094,2.094)), 0, 0];
    o['mixamorig'+S+'leg']    = r6(cl(KNEE_SIGN*(0.05+0.08*bump(mod(uu-0.05))+0.32*bump(mod(uu-0.45))),0,2.618));
    o['mixamorig'+S+'foot']   = [0,0,0];
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
const dz = -STRIDE/F;
for (let f=0; f<=F; f++) sequence.push({ timeOffsetMs: Math.round(f*1000/FPS), overrides: frame(mod(f/F)) });
for (let f=1; f<=F; f++) rootMotion.push({ dx:0, dy:0, dz:r6(dz) });
const out = { metadata: { name:'Synthia Authored Walk v3', description:'Torque-budget gait: near-standing start phase, reduced amplitudes, matched stride.',
  source:'qwen-authored', schema:'synthia-action-timeline-v1', fps:FPS, frameCount:F, jointCount:52,
  'tposer-orientation':[0,0,0,1], rootMotion:'per-tick deltas (m), -Z = forward', generatedBy:'scripts/authorSynthiaGait.mjs' },
  sequence, rootMotion };
const dst = 'public/animations/mixamo-walking-synthia.json';
if (fs.existsSync(dst) && !fs.existsSync(dst+'.v2.bak')) fs.copyFileSync(dst, dst+'.v2.bak');
fs.writeFileSync(dst, JSON.stringify(out,null,2));
console.log('WROTE', dst, '| stride', STRIDE, 'm | speed', (STRIDE/(F/FPS)).toFixed(2), 'm/s');