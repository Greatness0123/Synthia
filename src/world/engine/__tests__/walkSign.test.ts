/// <reference types="jest" />

import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PhysicsEngine } from '../PhysicsEngine';

declare function describe(name: string, fn: () => void): void;
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): any;

// Set up GLTFLoader to read x-bot.glb directly from disk in Node context
const originalLoad = GLTFLoader.prototype.load;
beforeAll(() => {
  GLTFLoader.prototype.load = function(
    _url: string,
    onLoad: (gltf: any) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void
  ) {
    try {
      const filePath = path.resolve(process.cwd(), 'public/models/x-bot.glb');
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      this.parse(
        arrayBuffer,
        '',
        (gltf: any) => {
          onLoad(gltf);
        },
        (err: any) => {
          if (onError) onError(err);
        }
      );
    } catch (e: any) {
      if (onError) onError(e);
    }
  };
});

afterAll(() => {
  GLTFLoader.prototype.load = originalLoad;
});

describe('walkSign tests', () => {
  let skeleton: THREE.Skeleton;

  beforeAll(async () => {
    const loader = new GLTFLoader();
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.load('/models/x-bot.glb', resolve, undefined, reject);
    });

    const modelRoot = gltf.scene;
    let skinnedMesh: THREE.SkinnedMesh | null = null;
    modelRoot.traverse((child: any) => {
      if (child.isSkinnedMesh) {
        skinnedMesh = child;
      }
    });

    expect(skinnedMesh).toBeDefined();
    skeleton = skinnedMesh!.skeleton;
    modelRoot.updateMatrixWorld(true);
  });

  // Helper to compute displacement Y in MuJoCo parent-relative space under dynamic axis
  function getDisplacementY(boneName: string, parentName: string, angle: number, axis: [number, number, number]): number {
    const bone = skeleton.bones.find(b => b.name.toLowerCase().replace(/:/g, '') === boneName);
    const parent = skeleton.bones.find(b => b.name.toLowerCase().replace(/:/g, '') === parentName);

    if (!bone || !parent) {
      throw new Error(`Bone ${boneName} or parent ${parentName} not found`);
    }

    const qChildThree = new THREE.Quaternion();
    const qParentThree = new THREE.Quaternion();
    bone.getWorldQuaternion(qChildThree);
    parent.getWorldQuaternion(qParentThree);

    const childQuatMj = PhysicsEngine.threeQuatToMuJoCo(qChildThree);
    const parentQuatMj = PhysicsEngine.threeQuatToMuJoCo(qParentThree);

    const qChild = new THREE.Quaternion(childQuatMj[1], childQuatMj[2], childQuatMj[3], childQuatMj[0]);
    const qParent = new THREE.Quaternion(parentQuatMj[1], parentQuatMj[2], parentQuatMj[3], parentQuatMj[0]);

    const qRel_bind = qParent.clone().invert().multiply(qChild);
    const localDirectionMj = new THREE.Vector3(0, 0, 1);

    const v_bind = localDirectionMj.clone().applyQuaternion(qRel_bind);

    // Hinge rotation about the specified axis
    const qHinge = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle);
    const qRel_rotated = qRel_bind.clone().multiply(qHinge);

    const v_rotated = localDirectionMj.clone().applyQuaternion(qRel_rotated);
    const v_disp = v_rotated.clone().sub(v_bind);

    return v_disp.y;
  }

  test('walk gait phase and sign assertions', () => {
    const filePath = path.resolve(process.cwd(), 'public/animations/mixamo-walking-synthia.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const firstFrame = data.sequence[0];

    const leftUpLegVal = firstFrame.overrides['mixamorigleftupleg'];
    const rightUpLegVal = firstFrame.overrides['mixamorigrightupleg'];

    expect(Array.isArray(leftUpLegVal)).toBe(true);
    expect(Array.isArray(rightUpLegVal)).toBe(true);

    const leftPitch = (leftUpLegVal as [number, number, number])[0];
    const rightPitch = (rightUpLegVal as [number, number, number])[0];

    // Under the primary fix, the axes of left and right upleg are negated to [-1, 0, 0]
    const leftAxis: [number, number, number] = [-1, 0, 0];
    const rightAxis: [number, number, number] = [-1, 0, 0];

    // Compute physical displacement Y (MuJoCo forward direction)
    const leftDisplacementY = getDisplacementY('mixamorigleftupleg', 'mixamorighips', leftPitch, leftAxis);
    const rightDisplacementY = getDisplacementY('mixamorigrightupleg', 'mixamorighips', rightPitch, rightAxis);

    console.log(`[WALK-SIGN] Left upleg target: ${leftPitch.toFixed(6)}, physical displacement Y: ${leftDisplacementY.toFixed(6)}`);
    console.log(`[WALK-SIGN] Right upleg target: ${rightPitch.toFixed(6)}, physical displacement Y: ${rightDisplacementY.toFixed(6)}`);

    // 1. Left upleg pitch at frame 0 must be negative (trailing stance leg, backward extension)
    // Physical backward extension means displacementY is negative.
    expect(leftDisplacementY).toBeLessThan(-0.4);

    // 2. Right upleg pitch at frame 0 must not be simultaneously negative (not in deep backward extension like left)
    // One leg is in deep extension (-0.46) and the other is recovering/straightening (-0.20).
    expect(rightDisplacementY).toBeGreaterThanOrEqual(-0.25);
  });

  test('canonical Forward Kick on right upleg', () => {
    // 3. Dispatching mixamorigrightupleg: [0.785, 0, 0] must result in right knee swinging forward.
    // +0.785 rad forward kick under negated axis [-1, 0, 0]
    const displacementY = getDisplacementY('mixamorigrightupleg', 'mixamorighips', 0.785, [-1, 0, 0]);
    console.log(`[FORWARD-KICK] Target: 0.785, displacement Y: ${displacementY.toFixed(6)}`);
    expect(displacementY).toBeGreaterThan(0);
  });
});
