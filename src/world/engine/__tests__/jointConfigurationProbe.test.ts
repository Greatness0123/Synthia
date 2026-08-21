/// <reference types="jest" />
/// <reference lib="dom" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { PhysicsEngine } from '../PhysicsEngine';
import { HumanoidPhysicsBinder } from '../HumanoidPhysicsBinder';
import SYNTHIA_RIG_CONSTRAINTS from '../../../constants/rigConstraints';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;

const PROBE_VAL = 0.2;
const STEPS = 30;

const SIDES = ['left', 'right'];
const CHILD_TAIL: Record<string, string> = {
  spine: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head', head: '',
  shoulder: 'arm', arm: 'forearm', forearm: 'hand', hand: 'handindex1',
  upleg: 'leg', leg: 'foot', foot: '',
};

function childName(bone: string): string {
  if (bone.includes('handindex') || bone.includes('handmiddle') || bone.includes('handring') || bone.includes('handpinky') || bone.includes('handthumb')) {
    const m = bone.match(/^(mixamorig(?:left|right)hand\w+)(\d)$/);
    if (m) {
      const n = parseInt(m[2], 10);
      return m[1] + (n >= 3 ? '3' : String(n + 1));
    }
    return bone;
  }
  const side = SIDES.find((s) => bone.includes(s)) ?? '';
  const rest = bone.replace('mixamorig', '').replace(side, '');
  const tail = CHILD_TAIL[rest] ?? '';
  if (!tail) return bone;
  return `mixamorig${side}${tail}`;
}

interface ProbeResult {
  bone: string;
  ch: string;
  sign: string;
  target: number;
  qposAfter: number;
  tip: string;
  dWorld: { x: number; y: number; z: number };
  dMj: [number, number, number];
  status: string;
}

/** Read the GLB JSON chunk (exactly what GLTFLoader.parse consumes). */
function readGlbJson(): any {
  const buf = fs.readFileSync(path.resolve(process.cwd(), 'public/models/x-bot.glb'));
  let offset = 12;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(offset + 8, offset + 8 + len).toString('utf8'));
    offset += 8 + len;
  }
  throw new Error('GLB: no JSON chunk');
}

/**
 * Build the Mixamo bone hierarchy from the raw GLB node TRS tree, in-node,
 * without GLTFLoader. Mirrors what GLTFLoader would produce: each Bone carries
 * its LOCAL TRS (parentWorld^-1 * world), parented per the GLB tree, so world
 * transforms compose exactly. Terminal nodes are pruned automatically because
 * only nodes whose canonical name is in SYNTHIA_RIG_CONSTRAINTS become bones.
 */
function buildSkeletonFromGlb(): { root: THREE.Group; bones: THREE.Bone[]; boneNames: Set<string> } {
  const gltf = readGlbJson();
  const nodes = gltf.nodes as Array<{
    name?: string;
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    children?: number[];
  }>;

  const childToParent = new Map<number, number>();
  nodes.forEach((n, i) => {
    if (n.children) for (const c of n.children) childToParent.set(c, i);
  });
  const roots: number[] = [];
  nodes.forEach((_, i) => { if (!childToParent.has(i)) roots.push(i); });

  const worldMats: Array<THREE.Matrix4 | null> = new Array(nodes.length).fill(null);
  const localMat = (n: any): THREE.Matrix4 =>
    new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(n.translation ?? [0, 0, 0]),
      new THREE.Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(n.scale ?? [1, 1, 1])
    );
  const computeWorld = (idx: number, parentMat: THREE.Matrix4 | null): void => {
    const wm = parentMat ? parentMat.clone().multiply(localMat(nodes[idx])) : localMat(nodes[idx]);
    worldMats[idx] = wm;
    if (nodes[idx].children) for (const c of nodes[idx].children) computeWorld(c, wm);
  };
  for (const r of roots) computeWorld(r, null);

  const canon = (name: string): string => name.toLowerCase().replace(/:/g, '');
  const wanted = new Set<string>();
  for (const key of Object.keys(SYNTHIA_RIG_CONSTRAINTS)) wanted.add(key);
  const isWanted = (idx: number): boolean => {
    const name = nodes[idx].name;
    return !!name && wanted.has(canon(name));
  };

  // True GLTFLoader semantics: each Bone stores its LOCAL TRS relative to its
  // nearest wanted ancestor (parentWorld⁻¹ · world), so bone.getWorldQuaternion()
  // reproduces the production bind pose exactly (T-pose, ~1.8 m tall).
  const wantedNodeIdx = new Set<number>();
  nodes.forEach((_, idx) => { if (isWanted(idx)) wantedNodeIdx.add(idx); });

  const nearestWanted = new Map<number, number>();
  for (const idx of wantedNodeIdx) {
    let p = childToParent.get(idx);
    let nearest = -1;
    while (p !== undefined) {
      if (wantedNodeIdx.has(p)) { nearest = p; break; }
      p = childToParent.get(p);
    }
    nearestWanted.set(idx, nearest);
  }

  const bonesByNode = new Map<number, THREE.Bone>();
  const localPos = new THREE.Vector3();
  const localQuat = new THREE.Quaternion();
  const localScale = new THREE.Vector3();

  for (const idx of wantedNodeIdx) {
    const wm = worldMats[idx]!;
    const nearest = nearestWanted.get(idx) ?? -1;
    const local = nearest >= 0 ? worldMats[nearest]!.clone().invert().multiply(wm) : wm.clone();
    local.decompose(localPos, localQuat, localScale);
    const bone = new THREE.Bone();
    bone.name = nodes[idx].name ?? `node_${idx}`;
    bone.position.copy(localPos);
    bone.quaternion.copy(localQuat);
    bone.scale.copy(localScale);
    bonesByNode.set(idx, bone);
  }

  // Wire hierarchy: parent each bone under its nearest WANTED ancestor.
  for (const [idx, bone] of bonesByNode) {
    const nearest = nearestWanted.get(idx) ?? -1;
    if (nearest < 0) {
      // root of the humanoid tree: anchor under modelRoot
      (bone as any).userData.__isRootBone = true;
    } else {
      const parentBone = bonesByNode.get(nearest);
      if (parentBone) parentBone.add(bone);
    }
  }

  // Mirror the real GLB's terminal children (HeadTop_End, Toe_End, *_4):
  // any wanted bone without a wanted child gets a dummy terminal so
  // HumanoidPhysicsBinder.isTerminal() keeps it in the boneInfoMap
  // (exactly how head/toebase survive in the production loader).
  for (const [idx, bone] of bonesByNode) {
    const kids = nodes[idx].children ?? [];
    const hasWantedChild = kids.some((c) => isWanted(c));
    if (!hasWantedChild) {
      const dummy = new THREE.Bone();
      dummy.name = (nodes[idx].name ?? `node_${idx}`) + '_end';
      bone.add(dummy);
    }
  }

  const root = new THREE.Group();
  root.userData.isSynthiaPrimitive = true;
  for (const [, bone] of bonesByNode) {
    if ((bone as any).userData.__isRootBone) root.add(bone);
  }
  root.updateMatrixWorld(true);

  const bones = Array.from(bonesByNode.values());
  const boneNames = new Set(bones.map((b) => canon(b.name)));
  return { root, bones, boneNames };
}

describe('Joint Configuration Probe (runtime MuJoCo)', () => {
  let engine: PhysicsEngine;
  let binder: HumanoidPhysicsBinder;
  let built: { root: THREE.Group; bones: THREE.Bone[]; boneNames: Set<string> };

  beforeEach(async () => {
    engine = new PhysicsEngine();
    await engine.init();
    binder = new HumanoidPhysicsBinder(engine, new THREE.Scene(), 'agent_0');
    built = buildSkeletonFromGlb();

    // Replicate loadAndVisualizeBindPose's post-load state exactly:
    const modelRoot = built.root;
    (binder as any).modelRoot = modelRoot;
    (binder as any).scene.add(modelRoot);
    (binder as any).skeleton = { bones: built.bones } as any;
    (binder as any).skinnedMesh = { skeleton: { bones: built.bones } } as any;
    modelRoot.updateMatrixWorld(true);
    (binder as any).extractBonePositions();
    (binder as any).calculateCameraVectors();
    (binder as any).calculateModelDimensions();
    (binder as any).renderDebugSpheres(false);
    (binder as any).buildStep = 'A';
    (binder as any).isLoaded = true;

    binder.ensureCapsuleGeometry();
    binder.repositionModel(0, 0.05, 0);
    await binder.createRigidBodiesAndColliders();
    await binder.createJointsWithZeroMotors();
    await binder.activateMotorsWithStiffnessAndDamping(80, 10);
    binder.setMode('rigid');
  });

  afterEach(() => {
    binder.cleanup();
    engine.cleanup();
  });

  test('L3 evidence: +1.12 knee through setMotorTargets', () => {
    binder.resetToBindPose();
    const res = binder.setMotorTargets({ mixamorigleftleg: 1.12 } as any);
    const stored = (binder as any).currentTargets.get('mixamorigleftleg');
    console.log('[L3] applied=', JSON.stringify(res.applied));
    console.log('[L3] rejected=', JSON.stringify(res.rejected));
    console.log('[L3] stored=', JSON.stringify(stored));
  });

  test('L2 evidence: +1.12 knee through validateAndApplyTimeline', () => {
    binder.resetToBindPose();
    const skeleton = (binder as any).skeleton;
    const seq = [{ timeOffsetMs: 0, overrides: { mixamorigleftleg: 1.12 } }] as any;
    const validation = binder.validateAndApplyTimeline(skeleton, seq, { activeGaitPhase: false });
    console.log('[L2] applied=', JSON.stringify(validation.appliedTimeline[0]?.overrides));
    console.log('[L2] clampingNotes=', JSON.stringify(validation.clampingNotes));
    console.log('[L2] rejections=', JSON.stringify(validation.rejections));
  });

  test('L3 evidence: positive-only rightforearm -0.2 clamped to 0', () => {
    binder.resetToBindPose();
    const res = binder.setMotorTargets({ mixamorigrightforearm: -0.2 } as any);
    const stored = (binder as any).currentTargets.get('mixamorigrightforearm');
    console.log('[L3-FOREARM] applied=', JSON.stringify(res.applied));
    console.log('[L3-FOREARM] rejected=', JSON.stringify(res.rejected));
    console.log('[L3-FOREARM] stored=', JSON.stringify(stored));
  });

  test('per-joint world delta vectors (full precision)', () => {
    const world = engine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule()!;
    const bodyMap = binder.getMultiBodyManager().getRigidBodiesMap();

    const bodyPos = (bodyId: number): [number, number, number] => [
      data.xpos[bodyId * 3], data.xpos[bodyId * 3 + 1], data.xpos[bodyId * 3 + 2]
    ];

    const rows: ProbeResult[] = [];
    const joints: Array<{ k: string; c: any }> = Object.entries(SYNTHIA_RIG_CONSTRAINTS)
      .filter(([k]) => !k.includes('hips') && !k.includes('toebase'))
      .map(([k, c]) => ({ k, c } as { k: string; c: any }));

    for (const { k, c } of joints) {
      const dof = c.dof as number;
      const channels: string[] = [];
      if (dof === 1) channels.push('pitch');
      if (dof === 2) channels.push('pitch', 'roll');
      if (dof === 3) channels.push('pitch', 'yaw', 'roll');

      for (const ch of channels) {
        for (const sign of ['+', '-']) {
          const v = sign === '+' ? PROBE_VAL : -PROBE_VAL;
          binder.resetToBindPose();
          const minimal: any = {};
          if (dof === 3) {
            minimal[k] = [ch === 'pitch' ? v : 0, ch === 'yaw' ? v : 0, ch === 'roll' ? v : 0];
          } else if (dof === 2) {
            minimal[k] = [ch === 'pitch' ? v : 0, 0, ch === 'roll' ? v : 0];
          } else {
            minimal[k] = v;
          }
          const tipName = childName(k);
          const tipId = bodyMap.get(tipName);
          if (tipId === undefined) continue;
          if (!built.boneNames.has(k)) continue;

          const before = bodyPos(tipId);
          binder.setMotorTargets(minimal as any);
          for (let s = 0; s < STEPS; s++) {
            binder.updateMotorTargets();
            engine.step();
          }
          const after = bodyPos(tipId);
          const dMj: [number, number, number] = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
          const dWorld = PhysicsEngine.mujocoToWorld(dMj);

          let qposAfter = 0;
          const suffix = ch === 'pitch' ? '_pitch' : ch === 'yaw' ? '_yaw' : '_roll';
          const jntId = module.mj_name2id(model, module.mjtObj.mjOBJ_JOINT.value, 'agent_0_' + k + suffix);
          if (jntId >= 0) qposAfter = data.qpos[model.jnt_qposadr[jntId]];

          const statusArr: string[] = [];
          if (Math.abs(qposAfter) < 1e-6 && Math.abs(v) > 0) statusArr.push('zeroed/clamped');
          else if (Math.abs(qposAfter) < Math.abs(PROBE_VAL) - 0.02) statusArr.push('clamped');
          if (Math.abs(dMj[0]) + Math.abs(dMj[1]) + Math.abs(dMj[2]) < 1e-6) statusArr.push('no-displacement');

          rows.push({ bone: k, ch, sign, target: v, qposAfter, tip: tipName, dMj, dWorld, status: statusArr.join('|') || 'ok' });
        }
      }
    }

    console.log('── PER-JOINT WORLD DELTA VECTORS ──');
    console.log('bone | axis | sign | target | qposAfter | tip | dWorld(x,y,z) | dMj(x,y,z) | status');
    console.log('-----+------+------+--------+-----------+-----+--------------+------------+---------');
    for (const r of rows) {
      console.log(
        `${r.bone.padEnd(24)} | ${r.ch.padEnd(5)} | ${r.sign} | ${r.target.toFixed(2).padStart(6)} | ${r.qposAfter.toFixed(4).padStart(9)} | ${r.tip.padEnd(20)} | ` +
        `(${r.dWorld.x.toFixed(6)}, ${r.dWorld.y.toFixed(6)}, ${r.dWorld.z.toFixed(6)}) | ` +
        `(${r.dMj[0].toFixed(6)}, ${r.dMj[1].toFixed(6)}, ${r.dMj[2].toFixed(6)}) | ${r.status}`
      );
    }

    const row = rows.filter((r) => r.bone === 'mixamorigleftupleg' && r.ch === 'pitch' && r.sign === '+');
    if (row.length) {
      console.log(`[ANCHOR1] leftupleg pitch+ => knee dZ=${row[0].dWorld.z.toFixed(6)} (${row[0].dWorld.z > 0 ? '+Z BACKWARD' : '-Z FORWARD'})`);
    }
    const rowR = rows.filter((r) => r.bone === 'mixamorigrightupleg' && r.ch === 'pitch' && r.sign === '+');
    if (rowR.length) {
      console.log(`[ANCHOR1-R] rightupleg pitch+ => knee dZ=${rowR[0].dWorld.z.toFixed(6)} (${rowR[0].dWorld.z > 0 ? '+Z BACKWARD' : '-Z FORWARD'})`);
    }
    const rowK = rows.filter((r) => r.bone === 'mixamorigleftleg' && r.ch === 'pitch' && r.sign === '-');
    if (rowK.length) {
      console.log(`[ANCHOR2] leftleg pitch- => ankle dZ=${rowK[0].dWorld.z.toFixed(6)} (${rowK[0].dWorld.z < 0 ? '-Z FORWARD BUCKLE' : '+Z BACKWARD'})`);
    }
  });

  test('foot sole direction', () => {
    const world = engine.getWorld();
    const model = world.model;
    const data = world.data;
    const module = PhysicsEngine.getModule()!;
    const bodyMap = binder.getMultiBodyManager().getRigidBodiesMap();
    const footId = bodyMap.get('mixamorigleftfoot')!;
    const soleGeomId = module.mj_name2id(model, module.mjtObj.mjOBJ_GEOM.value, 'agent_0_mixamorigleftfoot_geom');
    if (soleGeomId >= 0) {
      const offMj: [number, number, number] = [
        data.geom_xpos[soleGeomId * 3] - data.xpos[footId * 3],
        data.geom_xpos[soleGeomId * 3 + 1] - data.xpos[footId * 3 + 1],
        data.geom_xpos[soleGeomId * 3 + 2] - data.xpos[footId * 3 + 2]
      ];
      const offWorld = PhysicsEngine.mujocoToWorld(offMj);
      console.log('[SOLE] MuJoCo offset=', `(${offMj[0].toFixed(6)}, ${offMj[1].toFixed(6)}, ${offMj[2].toFixed(6)})`);
      console.log('[SOLE] World offset =', `(${offWorld.x.toFixed(6)}, ${offWorld.y.toFixed(6)}, ${offWorld.z.toFixed(6)})`);
      console.log(`[SOLE] sole sits toward world ${offWorld.z < 0 ? '-Z (FORWARD)' : '+Z (BACKWARD)'} of ankle`);
    } else {
      console.log('[SOLE] geom not found');
    }
  });
});
