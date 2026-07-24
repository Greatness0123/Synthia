import * as THREE from 'three';
import { PhysicsEngine } from './PhysicsEngine';
import { getAnatomicalLimitForBone } from '../../constants/anatomicalLimits';

// Define BONE_JOINT_TYPE for active humanoid bones
type JointType = 'revolute' | 'spherical' | 'fixed';
const BONE_JOINT_TYPE: Record<string, JointType> = {
  'mixamorigSpine': 'spherical',
  'mixamorigSpine1': 'spherical',
  'mixamorigSpine2': 'spherical',
  'mixamorigNeck': 'spherical',
  'mixamorigHead': 'spherical',
  'mixamorigLeftShoulder': 'spherical',
  'mixamorigRightShoulder': 'spherical',
  'mixamorigLeftArm': 'spherical',
  'mixamorigRightArm': 'spherical',
  'mixamorigLeftForeArm': 'revolute',
  'mixamorigRightForeArm': 'revolute',
  'mixamorigLeftHand': 'spherical',
  'mixamorigRightHand': 'spherical',
  'mixamorigLeftUpLeg': 'spherical',
  'mixamorigRightUpLeg': 'spherical',
  'mixamorigLeftLeg': 'revolute',
  'mixamorigRightLeg': 'revolute',
  'mixamorigLeftFoot': 'spherical',
  'mixamorigRightFoot': 'spherical',
};

// Add fingers and thumbs to active bones
{
  const sides = ['Left', 'Right'];
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
  for (const side of sides) {
    for (const finger of fingers) {
      for (let seg = 1; seg <= 3; seg++) {
        BONE_JOINT_TYPE[`mixamorig${side}Hand${finger}${seg}`] = 'spherical';
      }
    }
    for (let seg = 1; seg <= 3; seg++) {
      BONE_JOINT_TYPE[`mixamorig${side}HandThumb${seg}`] = 'spherical';
    }
  }
}

const CAPSULE_ATTACH_BONES = new Set([
  'mixamorigSpine', 'mixamorigLeftUpLeg', 'mixamorigRightUpLeg',
]);

/**
 * Normalizes bone names to strip any colons/namespaces and convert to camelCase.
 * (Correction #15)
 */
export function normalizeBoneName(name: string): string {
  let clean = name.replace(/:/g, '');
  const lower = clean.toLowerCase();
  if (lower === 'mixamorighips') return 'mixamorigHips';
  if (lower === 'mixamorigspine') return 'mixamorigSpine';
  if (lower === 'mixamorigspine1') return 'mixamorigSpine1';
  if (lower === 'mixamorigspine2') return 'mixamorigSpine2';
  if (lower === 'mixamorigneck') return 'mixamorigNeck';
  if (lower === 'mixamorighead') return 'mixamorigHead';
  if (lower === 'mixamorigleftshoulder') return 'mixamorigLeftShoulder';
  if (lower === 'mixamorigrightshoulder') return 'mixamorigRightShoulder';
  if (lower === 'mixamorigleftarm') return 'mixamorigLeftArm';
  if (lower === 'mixamorigrightarm') return 'mixamorigRightArm';
  if (lower === 'mixamorigleftforearm') return 'mixamorigLeftForeArm';
  if (lower === 'mixamorigrightforearm') return 'mixamorigRightForeArm';
  if (lower === 'mixamoriglefthand') return 'mixamorigLeftHand';
  if (lower === 'mixamorigrighthand') return 'mixamorigRightHand';
  if (lower === 'mixamorigleftupleg') return 'mixamorigLeftUpLeg';
  if (lower === 'mixamorigrightupleg') return 'mixamorigRightUpLeg';
  if (lower === 'mixamorigleftleg') return 'mixamorigLeftLeg';
  if (lower === 'mixamorigrightleg') return 'mixamorigRightLeg';
  if (lower === 'mixamorigleftfoot') return 'mixamorigLeftFoot';
  if (lower === 'mixamorigrightfoot') return 'mixamorigRightFoot';

  // Match finger/thumb structures
  const match = clean.match(/^mixamorig(left|right)hand(index|middle|ring|pinky|thumb)(\d)$/i);
  if (match) {
    const side = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const part = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
    const num = match[3];
    return `mixamorig${side}Hand${part}${num}`;
  }

  return clean;
}

function getPhysicsParentName(bone: THREE.Bone, trackedBones: Set<string>): string | null {
  const canonical = normalizeBoneName(bone.name);
  if (CAPSULE_ATTACH_BONES.has(canonical)) return null;
  let parent: THREE.Object3D | null = bone.parent;
  while (parent) {
    if (parent instanceof THREE.Bone) {
      const parentCanonical = normalizeBoneName(parent.name);
      if (trackedBones.has(parentCanonical)) return parentCanonical;
    }
    parent = parent.parent;
  }
  return null;
}

function getJointArmature(boneName: string): number {
  const name = boneName.toLowerCase();
  if (name.includes('foot')) return 0.01;
  if (name.includes('upleg') || name.includes('leg')) return 0.02;
  return 0.0;
}

function getJointFrictionloss(boneName: string): number {
  const name = boneName.toLowerCase();
  if (name.includes('upleg') || name.includes('leg') || name.includes('foot')) return 0.1;
  return 0.0;
}

/**
 * Native PD parameters from 03_PHYSICS_AND_DOMAIN_BLUEPRINT.md.
 * (Correction #11)
 */
function getMuJoCoBoneGains(boneName: string): { kp: number; kv: number } {
  const name = boneName.toLowerCase();
  if (name.includes('hand') && (name.includes('index') || name.includes('middle') || name.includes('ring') || name.includes('pinky') || name.includes('thumb'))) {
    return { kp: 5, kv: 1 };
  }
  if (name.includes('upleg') || name.includes('leg')) {
    return { kp: 400, kv: 80 };
  }
  if (name.includes('arm') || name.includes('forearm')) {
    return { kp: 200, kv: 40 };
  }
  if (name.includes('spine')) {
    return { kp: 300, kv: 60 };
  }
  if (name.includes('neck') || name.includes('head')) {
    return { kp: 150, kv: 30 };
  }
  return { kp: 150, kv: 30 };
}

/**
 * Torque limits range using forcerange, never gear.
 * (Correction #2)
 */
function getMuJoCoForceRange(boneName: string): string {
  const name = boneName.toLowerCase();
  if (name.includes('hand') && (name.includes('index') || name.includes('middle') || name.includes('ring') || name.includes('pinky') || name.includes('thumb'))) {
    return '-3 3';
  }
  if (name.includes('upleg') || name.includes('leg') || name.includes('foot')) {
    return '-150 150';
  }
  if (name.includes('arm') || name.includes('forearm')) {
    return '-80 80';
  }
  if (name.includes('spine')) {
    return '-120 120';
  }
  if (name.includes('neck') || name.includes('head')) {
    return '-40 40';
  }
  return '-50 50';
}

/**
 * Standard biomechanics segment mass fractions (de Leva 1996) scaled exactly to a 70kg target.
 * (Correction #14)
 */
function getBiomechanicalMass(boneName: string): number {
  const lower = boneName.toLowerCase();

  // Head + neck (8.26% total = 5.782 kg)
  if (lower === 'mixamorighead') return 4.915;
  if (lower === 'mixamorigneck') return 0.867;

  // Trunk (43.46% total = 30.422 kg, including shoulders, root, and spine segments)
  if (lower === 'mixamorigleftshoulder') return 0.800;
  if (lower === 'mixamorigrightshoulder') return 0.800;
  if (lower === 'mixamorigspine') return 8.000;
  if (lower === 'mixamorigspine1') return 9.500;
  if (lower === 'mixamorigspine2') return 10.322;

  // Upper arms (2.71% each = 1.897 kg)
  if (lower === 'mixamorigleftarm') return 1.897;
  if (lower === 'mixamorigrightarm') return 1.897;

  // Forearms (1.62% each = 1.134 kg)
  if (lower === 'mixamorigleftforearm') return 1.134;
  if (lower === 'mixamorigrightforearm') return 1.134;

  // Hands + fingers (0.61% each = 0.427 kg)
  if (lower === 'mixamoriglefthand') return 0.300;
  if (lower === 'mixamorigrighthand') return 0.300;
  if (lower.includes('handindex') || lower.includes('handmiddle') || lower.includes('handring') || lower.includes('handpinky') || lower.includes('handthumb')) {
    return 0.00847; // 0.127 kg split among 15 finger joints
  }

  // Thighs (14.16% each = 9.912 kg)
  if (lower === 'mixamorigleftupleg') return 9.912;
  if (lower === 'mixamorigrightupleg') return 9.912;

  // Shanks/Legs (4.33% each = 3.031 kg)
  if (lower === 'mixamorigleftleg') return 3.031;
  if (lower === 'mixamorigrightleg') return 3.031;

  // Feet (1.37% each = 0.959 kg)
  if (lower === 'mixamorigleftfoot') return 0.959;
  if (lower === 'mixamorigrightfoot') return 0.959;

  return 0.100;
}

/**
 * Computes the principal moments of inertia based on physical shapes.
 * Capsule of radius r and length L, or box of sizes (w, d, h).
 * (Correction #1)
 */
function getBiomechanicalInertia(
  boneName: string,
  mass: number,
  isFoot: boolean,
  radius: number,
  length: number
): { x: number; y: number; z: number } {
  if (isFoot) {
    const w = 0.05 * 2;
    const d = 0.11 * 2;
    const h = 0.01 * 2;
    const ixx = (mass * (d * d + h * h)) / 12;
    const iyy = (mass * (w * w + h * h)) / 12;
    const izz = (mass * (w * w + d * d)) / 12;
    return { x: ixx, y: iyy, z: izz };
  } else {
    const r = radius;
    const h = length / 2;
    const izz = (mass * r * r) / 2;
    const ixx_iyy = mass * ((r * r) / 4 + (h * h) / 3);
    return { x: ixx_iyy, y: ixx_iyy, z: izz };
  }
}

function estimateBoneLength(
  boneName: string,
  boneInfo: { bone: THREE.Bone; worldPosition: THREE.Vector3 },
  allBones: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>
): number {
  const firstChild = boneInfo.bone.children.find((child): child is THREE.Bone => {
    if (!(child instanceof THREE.Bone)) return false;
    return allBones.has(normalizeBoneName(child.name));
  });
  if (firstChild) {
    const childInfo = allBones.get(normalizeBoneName(firstChild.name));
    if (childInfo) {
      const dx = childInfo.worldPosition.x - boneInfo.worldPosition.x;
      const dy = childInfo.worldPosition.y - boneInfo.worldPosition.y;
      const dz = childInfo.worldPosition.z - boneInfo.worldPosition.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  const heuristic: Record<string, number> = {
    'mixamorigSpine': 0.25, 'mixamorigNeck': 0.10, 'mixamorigHead': 0.12,
    'mixamorigLeftArm': 0.30, 'mixamorigRightArm': 0.30,
    'mixamorigLeftForeArm': 0.27, 'mixamorigRightForeArm': 0.27,
    'mixamorigLeftHand': 0.10, 'mixamorigRightHand': 0.10,
    'mixamorigLeftUpLeg': 0.42, 'mixamorigRightUpLeg': 0.42,
    'mixamorigLeftLeg': 0.40, 'mixamorigRightLeg': 0.40,
    'mixamorigLeftFoot': 0.12, 'mixamorigRightFoot': 0.12,
  };
  return heuristic[boneName] ?? 0.15;
}

/**
 * Procedurally generates the core XML model file for the biped simulation.
 * Customizes segment masses, inertia tensors, actuators, limits, and environmental slots.
 */
export function generateHumanoidMJCF(
  boneInfoMap: Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>,
  _skeletonOrBones?: any,
  capsuleCenterYOrPhysicsMatrix?: any,
  modelRootOrRigConstraints?: any,
  _physicsMatrix?: any,
  _rigConstraints?: any
): string {
  let capsuleCenterY = 0.9;
  if (typeof capsuleCenterYOrPhysicsMatrix === 'number') {
    capsuleCenterY = capsuleCenterYOrPhysicsMatrix;
  }

  // Build a normalized bone map to avoid colon mismatch issues (Correction #15)
  const normalizedBoneMap = new Map<string, { bone: THREE.Bone; worldPosition: THREE.Vector3 }>();
  for (const [key, value] of boneInfoMap.entries()) {
    normalizedBoneMap.set(normalizeBoneName(key), value);
  }

  const trackedBones = new Set<string>();
  for (const canonical of normalizedBoneMap.keys()) {
    if (BONE_JOINT_TYPE[canonical]) {
      trackedBones.add(canonical);
    }
  }

  const actuators: string[] = [];

  let modelX = 0;
  let modelZ = 0;
  const hipsInfo = normalizedBoneMap.get('mixamorigHips');
  if (hipsInfo) {
    modelX = hipsInfo.worldPosition.x;
    modelZ = hipsInfo.worldPosition.z;
  }

  const modelHeight = 1.8;
  const capsuleRadius = 0.18;
  const capsuleHalfHeight = Math.max(0.15, (modelHeight * 0.3) - capsuleRadius);

  const capsulePosThree = { x: modelX, y: capsuleCenterY, z: modelZ };
  const capsulePosMj = PhysicsEngine.worldToMuJoCo(capsulePosThree);
  const capsuleQuatMj = [1, 0, 0, 0];

  const rootCapsulePosStr = `${capsulePosMj[0]} ${capsulePosMj[1]} ${capsulePosMj[2]}`;
  const rootCapsuleQuatStr = `${capsuleQuatMj[0]} ${capsuleQuatMj[1]} ${capsuleQuatMj[2]} ${capsuleQuatMj[3]}`;

  const buildBodyTreeXML = (
    boneName: string,
    parentPos: [number, number, number],
    parentQuat: [number, number, number, number]
  ): string => {
    const boneInfo = normalizedBoneMap.get(boneName);
    if (!boneInfo) return '';

    const bone = boneInfo.bone;
    const threePos = boneInfo.worldPosition.clone();
    const threeQuat = new THREE.Quaternion();
    bone.getWorldQuaternion(threeQuat);

    const childPosMj = PhysicsEngine.worldToMuJoCo(threePos);
    const childQuatMj = PhysicsEngine.threeQuatToMuJoCo(threeQuat);

    const pChild = new THREE.Vector3(...childPosMj);
    const qChild = new THREE.Quaternion(childQuatMj[1], childQuatMj[2], childQuatMj[3], childQuatMj[0]);

    const pParent = new THREE.Vector3(...parentPos);
    const qParent = new THREE.Quaternion(parentQuat[1], parentQuat[2], parentQuat[3], parentQuat[0]);

    const pRel = pChild.clone().sub(pParent).applyQuaternion(qParent.clone().invert());
    const qRel = qParent.clone().invert().multiply(qChild);

    const posStr = `${pRel.x} ${pRel.y} ${pRel.z}`;
    const quatStr = `${qRel.w} ${qRel.x} ${qRel.y} ${qRel.z}`;

    const mass = getBiomechanicalMass(boneName);

    let geomXML: string;
    const isFoot = boneName.toLowerCase().includes('foot');
    const radius = 0.04;
    const boneLength = estimateBoneLength(boneName, boneInfo, normalizedBoneMap);

    if (isFoot) {
      const FOOT_COLLIDER_HALF_WIDTH = 0.05;
      const FOOT_COLLIDER_HALF_HEIGHT = 0.01;
      const FOOT_COLLIDER_HALF_LENGTH = 0.11;
      // Local sole offset lies below the ankle (Correction #7)
      geomXML = `<!-- Foot sole sole-aligned collider -->
        <geom name="${boneName}_geom" type="box" size="${FOOT_COLLIDER_HALF_WIDTH} ${FOOT_COLLIDER_HALF_LENGTH} ${FOOT_COLLIDER_HALF_HEIGHT}" pos="0 0 -0.02" contype="2" conaffinity="1"/>`;
    } else {
      const colHalfHeight = Math.max(0.02, boneLength / 2 - radius);
      geomXML = `<!-- Limb collider -->
        <geom name="${boneName}_geom" type="capsule" size="${radius} ${colHalfHeight}" pos="0 0 0" contype="2" conaffinity="1"/>`;
    }

    const inertia = getBiomechanicalInertia(boneName, mass, isFoot, radius, boneLength);

    let jointsXML: string;
    const jointType = BONE_JOINT_TYPE[boneName] || 'spherical';
    const limits = getAnatomicalLimitForBone(boneName);

    const getSafeRangeStr = (min: number, max: number): string => {
      const sMin = isFinite(min) ? min : -3.14159;
      const sMax = isFinite(max) ? max : 3.14159;
      return `${sMin} ${sMax}`;
    };

    const gains = getMuJoCoBoneGains(boneName);
    const kp = gains.kp;
    const kv = gains.kv;
    const forcerange = getMuJoCoForceRange(boneName);

    const armature = getJointArmature(boneName);
    const frictionloss = getJointFrictionloss(boneName);
    const jointExtra = armature > 0 ? ` armature="${armature}"` : '';
    const jointExtra2 = frictionloss > 0 ? ` frictionloss="${frictionloss}"` : '';

    if (jointType === 'revolute') {
      const min = limits?.min ?? -2.618;
      const max = limits?.max ?? 0;
      jointsXML = `<joint name="${boneName}_pitch" type="hinge" axis="1 0 0" range="${getSafeRangeStr(min, max)}" limited="true"${jointExtra}${jointExtra2}/>`;
      actuators.push(`<position name="act_${boneName}_pitch" joint="${boneName}_pitch" kp="${kp}" kv="${kv}" forcerange="${forcerange}" ctrlrange="${getSafeRangeStr(min, max)}"/>`);
    } else {
      const minX = limits?.min ?? -0.785;
      const maxX = limits?.max ?? 0.785;
      const minY = -0.785;
      const maxY = 0.785;
      const minZ = -0.785;
      const maxZ = 0.785;
      jointsXML = `
        <joint name="${boneName}_yaw" type="hinge" axis="0 0 1" range="${getSafeRangeStr(minY, maxY)}" limited="true"${jointExtra}${jointExtra2}/>
        <joint name="${boneName}_pitch" type="hinge" axis="1 0 0" range="${getSafeRangeStr(minX, maxX)}" limited="true"${jointExtra}${jointExtra2}/>
        <joint name="${boneName}_roll" type="hinge" axis="0 1 0" range="${getSafeRangeStr(minZ, maxZ)}" limited="true"${jointExtra}${jointExtra2}/>
      `;
      actuators.push(`<position name="act_${boneName}_yaw" joint="${boneName}_yaw" kp="${kp}" kv="${kv}" forcerange="${forcerange}" ctrlrange="${getSafeRangeStr(minY, maxY)}"/>`);
      actuators.push(`<position name="act_${boneName}_pitch" joint="${boneName}_pitch" kp="${kp}" kv="${kv}" forcerange="${forcerange}" ctrlrange="${getSafeRangeStr(minX, maxX)}"/>`);
      actuators.push(`<position name="act_${boneName}_roll" joint="${boneName}_roll" kp="${kp}" kv="${kv}" forcerange="${forcerange}" ctrlrange="${getSafeRangeStr(minZ, maxZ)}"/>`);
    }

    const childBones = Array.from(trackedBones).filter(b => {
      const childBone = normalizedBoneMap.get(b);
      return childBone && getPhysicsParentName(childBone.bone, trackedBones) === boneName;
    });
    const childrenXML = childBones.map(cb => buildBodyTreeXML(cb, childPosMj as [number, number, number], childQuatMj as [number, number, number, number])).join('\n');

    return `
      <body name="${boneName}" pos="${posStr}" quat="${quatStr}">
        <inertial pos="0 0 0" mass="${mass}" diaginertia="${inertia.x} ${inertia.y} ${inertia.z}"/>
        ${jointsXML}
        ${geomXML}
        ${childrenXML}
      </body>
    `.trim();
  };

  const spineBranch = buildBodyTreeXML('mixamorigSpine', capsulePosMj as [number, number, number], capsuleQuatMj as [number, number, number, number]);
  const leftLegBranch = buildBodyTreeXML('mixamorigLeftUpLeg', capsulePosMj as [number, number, number], capsuleQuatMj as [number, number, number, number]);
  const rightLegBranch = buildBodyTreeXML('mixamorigRightUpLeg', capsulePosMj as [number, number, number], capsuleQuatMj as [number, number, number, number]);

  const slotBodies: string[] = [];
  for (let i = 0; i < 20; i++) {
    slotBodies.push(`
    <body name="env_slot_${i}" pos="0 0 -10">
      <freejoint name="env_slot_${i}_joint"/>
      <!-- Slot geoms deactivated by default -->
      <geom name="env_slot_${i}_sphere" type="sphere" size="0.001" contype="0" conaffinity="0"/>
      <geom name="env_slot_${i}_box" type="box" size="0.001 0.001 0.001" contype="0" conaffinity="0"/>
      <geom name="env_slot_${i}_cylinder" type="cylinder" size="0.001 0.001" contype="0" conaffinity="0"/>
      <geom name="env_slot_${i}_capsule" type="capsule" size="0.001 0.001" contype="0" conaffinity="0"/>
    </body>`);
  }

  const pianoGeoms: string[] = [];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let i = 0; i < 88; i++) {
    const isBlack = [1, 3, 6, 8, 10].includes((i + 9) % 12);
    const width = isBlack ? 0.012 : 0.022;
    const height = isBlack ? 0.022 : 0.015;
    const depth = isBlack ? 0.08 : 0.12;

    const xOffset = (i - 44) * 0.023;
    const yOffset = isBlack ? 0.015 : 0;
    const zOffset = isBlack ? -0.02 : 0;

    const midiNote = 21 + i;
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    const noteName = NOTE_NAMES[noteIndex] + octave;

    pianoGeoms.push(`      <geom name="piano_${noteName}" type="box" size="${width / 2} ${depth / 2} ${height / 2}" pos="${xOffset} ${zOffset} ${-yOffset}" contype="0" conaffinity="0"/>`);
  }

  const pianoBody = `
    <body name="piano_body" pos="0 0 -30">
      <freejoint name="piano_joint"/>
      <inertial pos="0 0 0" mass="50" diaginertia="5.0 5.0 5.0"/>
${pianoGeoms.join('\n')}
    </body>
  `;

  return `
<mujoco model="synthia_humanoid">
  <compiler angle="radian" coordinate="local"/>
  <option gravity="0 0 -9.81" timestep="0.01667" iterations="100" integrator="implicitfast"/>
  <worldbody>
    <light directional="true" pos="0 0 5" dir="0 0 -1"/>
    <geom name="floor" type="plane" size="100 100 0.1" rgba="0.8 0.9 0.8 1" contype="1" conaffinity="2"/>

    <body name="root_capsule" pos="${rootCapsulePosStr}" quat="${rootCapsuleQuatStr}">
      <freejoint name="root_freejoint"/>
      <!-- Root capsule: zero collision participation (Correction #6) -->
      <geom name="root_capsule_geom" type="capsule" size="${capsuleRadius} ${capsuleHalfHeight}" pos="0 0 0" contype="0" conaffinity="0"/>
      <inertial pos="0 0 0" mass="1.0" diaginertia="0.05 0.05 0.05"/>

      ${spineBranch}
      ${leftLegBranch}
      ${rightLegBranch}
    </body>

    ${slotBodies.join('\n')}

    ${pianoBody}
  </worldbody>

  <actuator>
    ${actuators.join('\n    ')}
  </actuator>
</mujoco>
  `.trim();
}
