import {
  ComReflexController,
  DEFAULT_REFLEX_GAINS,
} from '../ComReflexController';
import { GAIT_CYCLE, SWING_WINDOWS } from '../gaitPhaseMap';

test('zProbe2 import chain loads', () => {
  expect(typeof ComReflexController).toBe('function');
  expect(typeof GAIT_CYCLE.durationS).toBe('number');
  expect(typeof SWING_WINDOWS.left.midU).toBe('number');
  expect(typeof DEFAULT_REFLEX_GAINS.kH).toBe('number');
});
