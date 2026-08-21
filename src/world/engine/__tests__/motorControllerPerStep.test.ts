/// <reference types="jest" />

import { MotorController } from '../MotorController';

declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeTruthy(): void;
  toEqual(expected: unknown): void;
};

/** Build a fake MuJoCo model/data sized for the test actuator map. */
function makeFakeWorld() {
  const actuatorMap = new Map<string, number[]>([
    ['mixamorigspine2', [10, 11, 12]], // spherical: yaw, pitch, roll
    ['mixamorigleftupleg', [7, 8, 9]], // spherical: yaw, pitch, roll
    ['mixamorigleftleg', [20]], // revolute: pitch only
    ['mixamorigleftfoot', [30, 31]], // 2-DOF: pitch, roll
  ]);
  const nu = 40;
  const model = {
    nu,
    actuator_gainprm: new Float64Array(nu * 3),
    actuator_biasprm: new Float64Array(nu * 3),
  };
  // Give every actuator a base gain so init() doesn't misbehave.
  for (let i = 0; i < nu; i++) {
    model.actuator_gainprm[i * 3] = 80;
    model.actuator_biasprm[i * 3 + 2] = -10;
  }
  const data = { ctrl: new Float64Array(nu) };
  return { actuatorMap, model, data };
}

describe('Road-4 — MotorController.applyPerStepJointTargets', () => {
  test('writes spherical [yaw,pitch,roll], revolute [pitch], 2-DOF [pitch,roll] exactly', () => {
    const { actuatorMap, model, data } = makeFakeWorld();
    const mc = new MotorController();
    mc.init(actuatorMap, model, data);

    const applied = mc.applyPerStepJointTargets([
      ['mixamorigspine2', -0.2], // lean-back pitch on spine2
      ['mixamorigleftleg', 0.5], // knee revolute
      ['mixamorigleftfoot', 0.3, 0.1], // ankle dorsiflex + roll
      ['mixamorigleftupleg', 0.4, 0.05], // swing hip + small roll
    ]);

    // spine2 spherical: yaw=0, pitch=-0.2, roll=0
    expect(data.ctrl[10]).toBe(0);
    expect(data.ctrl[11]).toBe(-0.2);
    expect(data.ctrl[12]).toBe(0);

    // knee revolute: pitch only
    expect(data.ctrl[20]).toBe(0.5);

    // foot 2-DOF: pitch=0.3, roll=0.1
    expect(data.ctrl[30]).toBe(0.3);
    expect(data.ctrl[31]).toBe(0.1);

    // upleg spherical: yaw=0, pitch=0.4, roll=0.05
    expect(data.ctrl[7]).toBe(0);
    expect(data.ctrl[8]).toBe(0.4);
    expect(data.ctrl[9]).toBe(0.05);

    // Returned list carries every actuator id written.
    expect(applied).toEqual([10, 11, 12, 20, 30, 31, 7, 8, 9]);
  });

  test('applies full value (no 20-step ramp) and skips unknown bones', () => {
    const { actuatorMap, model, data } = makeFakeWorld();
    const mc = new MotorController();
    mc.init(actuatorMap, model, data);

    // Advance the simulation step counter past the ramp window.
    (mc as any).simulationStepCount = 100;

    const applied = mc.applyPerStepJointTargets([
      ['mixamorigleftleg', 0.8],
      ['mixamorigunknownbone', 0.9], // not in the actuator map → skipped
    ]);

    expect(data.ctrl[20]).toBe(0.8); // full value, no ramp scaling
    expect(applied).toEqual([20]);
  });

  test('indexes non-finite payloads to 0 and stays silent when limp mode is active', () => {
    const { actuatorMap, model, data } = makeFakeWorld();
    const mc = new MotorController();
    mc.init(actuatorMap, model, data);

    mc.applyPerStepJointTargets([['mixamorigleftleg', NaN]]);
    expect(data.ctrl[20]).toBe(0);

    mc.setLimpMode(true);
    const applied = mc.applyPerStepJointTargets([['mixamorigleftleg', 0.4]]);
    expect(applied).toEqual([]);
    expect(data.ctrl[20]).toBe(0);
  });
});
