/**
 * Configuration for different body types and their joint hierarchies.
 * Every joint defines its degrees of freedom, limits, and physical properties.
 */

export type JointCategory = 'spine' | 'limb' | 'extremity';

export interface JointConfig {
  name: string;
  parent?: string;
  dof: 0 | 1 | 2 | 3;
  limits: [number, number][]; // Min/max in radians for each DOF
  defaultAngle: number[]; // Upright preset values for each DOF
  kp: number;
  kd: number;
  category: JointCategory;
  offset: [number, number, number]; // Local offset from parent joint
}

export interface BodyTypeConfig {
  id: string;
  name: string;
  joints: JointConfig[];
}

const DEFAULT_KP = 150;
const DEFAULT_KD = 12;

/**
 * Helper to determine joint category from name
 */
const getCategory = (name: string): JointCategory => {
  if (name.includes('lumbar') || name.includes('thoracic') || name.includes('cervical') || name === 'spine' || name === 'head' || name === 'pelvis') {
    return 'spine';
  }
  if (
    name.includes('thumb') ||
    name.includes('index') ||
    name.includes('middle') ||
    name.includes('ring') ||
    name.includes('pinky') ||
    name.includes('toe')
  ) {
    return 'extremity';
  }
  return 'limb';
};

const createJoint = (
  name: string,
  parent: string | undefined,
  offset: [number, number, number],
  dof: 0 | 1 | 2 | 3,
  limits: [number, number][] = [],
  defaultAngle: number[] = [],
  kp: number = DEFAULT_KP,
  kd: number = DEFAULT_KD
): JointConfig => ({
  name,
  parent,
  offset,
  dof,
  limits: limits.length === 0 ? Array(dof).fill([-Math.PI, Math.PI]) : limits,
  defaultAngle: defaultAngle.length === 0 ? Array(dof).fill(0) : defaultAngle,
  kp,
  kd,
  category: getCategory(name),
});

// Humanoid Joints Generation
const humanoidJoints: JointConfig[] = [
  createJoint('root', undefined, [0, 0, 0], 0),
  createJoint('pelvis', 'root', [0, 0.95, 0], 3, [], [0,0,0], 200, 20),

  // Spine
  createJoint('lumbar_1', 'pelvis', [0, 0.1, 0], 3, [], [0,0,0], 200, 20),
  createJoint('spine', 'lumbar_1', [0, 0.1, 0], 3, [], [0,0,0], 200, 20),
  createJoint('chest', 'spine', [0, 0.15, 0], 3, [], [0,0,0], 200, 20),
  createJoint('neck', 'chest', [0, 0.15, 0], 3, [], [0,0,0], 100, 10),
  createJoint('head', 'neck', [0, 0.12, 0], 3, [], [0,0,0], 100, 10),
];

// Add Arms and Legs
['left', 'right'].forEach(side => {
  const prefix = side === 'left' ? 'left_' : 'right_';
  const mult = side === 'left' ? -1 : 1;

  // Arms
  humanoidJoints.push(createJoint(`${prefix}shoulder`, 'chest', [mult * 0.18, 0, 0], 3, [], [0, 0, mult * 0.1], 150, 15));
  humanoidJoints.push(createJoint(`${prefix}elbow`, `${prefix}shoulder`, [0, -0.28, 0], 1, [[0, Math.PI * 0.8]], [0.1], 150, 15));
  humanoidJoints.push(createJoint(`${prefix}wrist`, `${prefix}elbow`, [0, -0.25, 0], 2, [], [0,0], 100, 10));

  // Legs
  humanoidJoints.push(createJoint(`${prefix}hip`, 'pelvis', [mult * 0.12, -0.05, 0], 3, [], [0,0,0], 250, 25));
  humanoidJoints.push(createJoint(`${prefix}knee`, `${prefix}hip`, [0, -0.42, 0], 1, [[0, Math.PI * 0.8]], [0.05], 250, 25));
  humanoidJoints.push(createJoint(`${prefix}ankle`, `${prefix}knee`, [0, -0.40, 0], 2, [], [0,0], 150, 15));
});

export const BODY_TYPE_CONFIGS: Record<string, BodyTypeConfig> = {
  humanoid: {
    id: 'humanoid',
    name: 'Humanoid (Standard)',
    joints: humanoidJoints,
  },
  custom: {
    id: 'custom',
    name: 'Custom Model',
    // Populated at runtime from KinematicChainMapper output — never statically defined here.
    joints: [],
  },
};
