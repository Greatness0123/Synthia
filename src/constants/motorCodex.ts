/**
 * Motor Codex (Motion Guide Manual)
 *
 * A structured dictionary of annotated motion recipes and baseline movement patterns.
 * All joint target angles are strictly specified in degrees.
 *
 * Notice for AI models:
 * Every recipe in this codex is a suggestion, not a rigid physical law.
 * Adjust joint angles dynamically based on your physical feedback.
 */

export interface MotorCodexStep {
  phase: string;
  timeOffsetMs: number;
  commentary: string;
  overrides: Record<string, number | number[]>;
  durationMs?: number;
  interpolation?: 'linear' | 'smooth' | 'step';
  rootVelocity?: [number, number, number];
  balanceMode?: 'auto' | 'soft' | 'dynamic_rmbs' | 'compliant' | 'off' | string;
  stiffnessScale?: number;
  contactsExpected?: string[];
}

export interface MotorCodexEntry {
  id: string;
  category: 'locomotion' | 'posture' | 'aerial' | 'gesture' | 'expressive' | 'recovery' | string;
  title: string;
  tags?: string[];
  disclaimer: string;
  summary: string;
  biomechanics_note: string;
  parameters: {
    recommendedSpeedMps?: number;
    cycleDurationMs?: number;
    activeGaitPhase?: boolean;
    balanceMode?: 'auto' | 'soft' | 'dynamic_rmbs' | 'compliant' | 'off' | string;
    recommendedForce?: number;
  };
  steps: MotorCodexStep[];
}

export const MOTOR_CODEX_DISCLAIMER =
  'SUGGESTION ONLY: Reference motion recorded from baseline scripts. Adapt angles dynamically based on physical feedback.';

const STORAGE_KEY = 'synthia_recorded_motor_codex';

/**
 * 23 Official Baseline Recipes recorded from humanoid physics calibration.
 */
export const BUILTIN_MOTOR_CODEX: MotorCodexEntry[] = [
  // ── POSTURE (6) ─────────────────────────────────────────────────────────────
  {
    id: 'posture_arms_overhead',
    category: 'posture',
    title: 'Arms Overhead',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for Arms Overhead.',
    biomechanics_note: 'Both arms raised vertically overhead in celebration.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Arms Overhead Hold',
        timeOffsetMs: 0,
        commentary: 'Both arms raised vertically overhead in celebration.',
        overrides: {
          mixamorigleftarm: [-90, 0, 0],
          mixamorigrightarm: [-90, 0, 0],
          mixamorigleftforearm: 10,
          mixamorigrightforearm: 10,
          mixamoriglefthandthumb1: 0,
          mixamoriglefthandthumb2: 0,
          mixamoriglefthandthumb3: 0,
          mixamoriglefthandindex1: 0,
          mixamoriglefthandindex2: 0,
          mixamoriglefthandindex3: 0,
          mixamoriglefthandmiddle1: 0,
          mixamoriglefthandmiddle2: 0,
          mixamoriglefthandmiddle3: 0,
          mixamoriglefthandring1: 0,
          mixamoriglefthandring2: 0,
          mixamoriglefthandring3: 0,
          mixamoriglefthandpinky1: 0,
          mixamoriglefthandpinky2: 0,
          mixamoriglefthandpinky3: 0,
          mixamorigrighthandthumb1: 0,
          mixamorigrighthandthumb2: 0,
          mixamorigrighthandthumb3: 0,
          mixamorigrighthandindex1: 0,
          mixamorigrighthandindex2: 0,
          mixamorigrighthandindex3: 0,
          mixamorigrighthandmiddle1: 0,
          mixamorigrighthandmiddle2: 0,
          mixamorigrighthandmiddle3: 0,
          mixamorigrighthandring1: 0,
          mixamorigrighthandring2: 0,
          mixamorigrighthandring3: 0,
          mixamorigrighthandpinky1: 0,
          mixamorigrighthandpinky2: 0,
          mixamorigrighthandpinky3: 0,
        },
      },
    ],
  },
  {
    id: 'posture_deep_squat',
    category: 'posture',
    title: 'Deep Squat',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for Deep Squat.',
    biomechanics_note: 'Deep knee flexion (110°) with spine counter-lean to center mass over feet.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Deep Squat Hold',
        timeOffsetMs: 0,
        commentary: 'Deep knee flexion (110°) with spine counter-lean to center mass over feet.',
        overrides: {
          mixamorigleftupleg: [75, 0, -10],
          mixamorigrightupleg: [75, 0, 10],
          mixamorigleftleg: 110,
          mixamorigrightleg: 110,
          mixamorigleftfoot: [18, 0, 0],
          mixamorigrightfoot: [18, 0, 0],
          mixamorigspine: [14, 0, 0],
          mixamorigspine1: [10, 0, 0],
          mixamorigleftarm: [50, 0, -40],
          mixamorigrightarm: [50, 0, 40],
          mixamorigleftforearm: 30,
          mixamorigrightforearm: 30,
          mixamoriglefthandthumb1: 15,
          mixamoriglefthandthumb2: 15,
          mixamoriglefthandthumb3: 15,
          mixamoriglefthandindex1: 15,
          mixamoriglefthandindex2: 15,
          mixamoriglefthandindex3: 15,
          mixamoriglefthandmiddle1: 15,
          mixamoriglefthandmiddle2: 15,
          mixamoriglefthandmiddle3: 15,
          mixamoriglefthandring1: 15,
          mixamoriglefthandring2: 15,
          mixamoriglefthandring3: 15,
          mixamoriglefthandpinky1: 15,
          mixamoriglefthandpinky2: 15,
          mixamoriglefthandpinky3: 15,
          mixamorigrighthandthumb1: 15,
          mixamorigrighthandthumb2: 15,
          mixamorigrighthandthumb3: 15,
          mixamorigrighthandindex1: 15,
          mixamorigrighthandindex2: 15,
          mixamorigrighthandindex3: 15,
          mixamorigrighthandmiddle1: 15,
          mixamorigrighthandmiddle2: 15,
          mixamorigrighthandmiddle3: 15,
          mixamorigrighthandring1: 15,
          mixamorigrighthandring2: 15,
          mixamorigrighthandring3: 15,
          mixamorigrighthandpinky1: 15,
          mixamorigrighthandpinky2: 15,
          mixamorigrighthandpinky3: 15,
        },
      },
    ],
  },
  {
    id: 'posture_hands_on_hips',
    category: 'posture',
    title: 'Hands on Hips',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for Hands on Hips.',
    biomechanics_note: 'Akimbo stance with elbows flared and palms resting on the hip bones at the sides.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Hands on Hips Hold',
        timeOffsetMs: 0,
        commentary: 'Akimbo stance with elbows flared and palms resting on the hip bones at the sides.',
        overrides: {
          mixamorigleftarm: [35, 0, -20],
          mixamorigrightarm: [35, 0, 20],
          mixamorigleftforearm: 100,
          mixamorigrightforearm: 100,
          mixamoriglefthand: [0, -15, 0],
          mixamorigrighthand: [0, 15, 0],
          mixamoriglefthandthumb1: [0, 0, 50],
          mixamoriglefthandthumb2: [0, 0, 50],
          mixamoriglefthandthumb3: [0, 0, 50],
          mixamoriglefthandindex1: 50,
          mixamoriglefthandindex2: 50,
          mixamoriglefthandindex3: 50,
          mixamoriglefthandmiddle1: 50,
          mixamoriglefthandmiddle2: 50,
          mixamoriglefthandmiddle3: 50,
          mixamoriglefthandring1: 50,
          mixamoriglefthandring2: 50,
          mixamoriglefthandring3: 50,
          mixamoriglefthandpinky1: 50,
          mixamoriglefthandpinky2: 50,
          mixamoriglefthandpinky3: 50,
          mixamorigrighthandthumb1: [0, 0, 50],
          mixamorigrighthandthumb2: [0, 0, 50],
          mixamorigrighthandthumb3: [0, 0, 50],
          mixamorigrighthandindex1: 50,
          mixamorigrighthandindex2: 50,
          mixamorigrighthandindex3: 50,
          mixamorigrighthandmiddle1: 50,
          mixamorigrighthandmiddle2: 50,
          mixamorigrighthandmiddle3: 50,
          mixamorigrighthandring1: 50,
          mixamorigrighthandring2: 50,
          mixamorigrighthandring3: 50,
          mixamorigrighthandpinky1: 50,
          mixamorigrighthandpinky2: 50,
          mixamorigrighthandpinky3: 50,
        },
      },
    ],
  },
  {
    id: 'posture_natural_standing',
    category: 'posture',
    title: 'Natural Stance',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for Natural Stance.',
    biomechanics_note: 'Relaxed standing posture with arms at sides and head level.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Natural Stance Hold',
        timeOffsetMs: 0,
        commentary: 'Relaxed standing posture with arms at sides and head level.',
        overrides: {
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
          mixamoriglefthand: [0, 0, 0],
          mixamorigrighthand: [0, 0, 0],
          mixamorigspine: [3, 0, 0],
          mixamorighead: [-3, 0, 0],
          mixamoriglefthandthumb1: 18,
          mixamoriglefthandthumb2: 18,
          mixamoriglefthandthumb3: 18,
          mixamoriglefthandindex1: 18,
          mixamoriglefthandindex2: 18,
          mixamoriglefthandindex3: 18,
          mixamoriglefthandmiddle1: 18,
          mixamoriglefthandmiddle2: 18,
          mixamoriglefthandmiddle3: 18,
          mixamoriglefthandring1: 14,
          mixamoriglefthandring2: 14,
          mixamoriglefthandring3: 14,
          mixamoriglefthandpinky1: 12,
          mixamoriglefthandpinky2: 12,
          mixamoriglefthandpinky3: 12,
          mixamorigrighthandthumb1: 18,
          mixamorigrighthandthumb2: 18,
          mixamorigrighthandthumb3: 18,
          mixamorigrighthandindex1: 18,
          mixamorigrighthandindex2: 18,
          mixamorigrighthandindex3: 18,
          mixamorigrighthandmiddle1: 18,
          mixamorigrighthandmiddle2: 18,
          mixamorigrighthandmiddle3: 18,
          mixamorigrighthandring1: 14,
          mixamorigrighthandring2: 14,
          mixamorigrighthandring3: 14,
          mixamorigrighthandpinky1: 12,
          mixamorigrighthandpinky2: 12,
          mixamorigrighthandpinky3: 12,
        },
      },
    ],
  },
  {
    id: 'posture_reset',
    category: 'posture',
    title: 'Reset to Upright',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for Reset to Upright.',
    biomechanics_note: 'Reset in-place to stable upright standing pose.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Reset to Upright Hold',
        timeOffsetMs: 0,
        commentary: 'Reset in-place to stable upright standing pose.',
        overrides: {},
      },
    ],
  },
  {
    id: 'posture_t_pose',
    category: 'posture',
    title: 'T-Pose',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Static posture preset for T-Pose.',
    biomechanics_note: 'Standard anatomical T-pose reference.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'T-Pose Hold',
        timeOffsetMs: 0,
        commentary: 'Standard anatomical T-pose reference.',
        overrides: {
          mixamorigleftarm: [0, 0, 0],
          mixamorigrightarm: [0, 0, 0],
          mixamoriglefthand: [0, 0, 0],
          mixamorigrighthand: [0, 0, 0],
          mixamoriglefthandthumb1: 0,
          mixamoriglefthandthumb2: 0,
          mixamoriglefthandthumb3: 0,
          mixamoriglefthandindex1: 0,
          mixamoriglefthandindex2: 0,
          mixamoriglefthandindex3: 0,
          mixamoriglefthandmiddle1: 0,
          mixamoriglefthandmiddle2: 0,
          mixamoriglefthandmiddle3: 0,
          mixamoriglefthandring1: 0,
          mixamoriglefthandring2: 0,
          mixamoriglefthandring3: 0,
          mixamoriglefthandpinky1: 0,
          mixamoriglefthandpinky2: 0,
          mixamoriglefthandpinky3: 0,
          mixamorigrighthandthumb1: 0,
          mixamorigrighthandthumb2: 0,
          mixamorigrighthandthumb3: 0,
          mixamorigrighthandindex1: 0,
          mixamorigrighthandindex2: 0,
          mixamorigrighthandindex3: 0,
          mixamorigrighthandmiddle1: 0,
          mixamorigrighthandmiddle2: 0,
          mixamorigrighthandmiddle3: 0,
          mixamorigrighthandring1: 0,
          mixamorigrighthandring2: 0,
          mixamorigrighthandring3: 0,
          mixamorigrighthandpinky1: 0,
          mixamorigrighthandpinky2: 0,
          mixamorigrighthandpinky3: 0,
        },
      },
    ],
  },

  // ── LOCOMOTION (1) ──────────────────────────────────────────────────────────
  {
    id: 'locomotion_waddle_walk',
    category: 'locomotion',
    title: 'Continuous Robotic Waddle Walk',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Bipedal forward locomotion using lateral weight shifting and alternating leg swings.',
    biomechanics_note:
      'Spine lateral lean (2 deg) shifts COM over stance foot to enable swing leg clearance. Arms counter-swing to maintain angular momentum balance.',
    parameters: {
      recommendedSpeedMps: 0.15,
      cycleDurationMs: 1600,
      activeGaitPhase: true,
      balanceMode: 'soft',
    },
    steps: [
      {
        phase: 'Phase 1: Right Push / Left Swing',
        timeOffsetMs: 0,
        commentary:
          'Right hip extends, left hip flexes 18 deg. Spine rolls 2 deg right to shift COM over right stance foot.',
        overrides: {
          mixamorigspine: [3, 0, 2],
          mixamorigspine1: [2, 0, 2],
          mixamorigleftupleg: [18, 0, 0],
          mixamorigleftleg: 20,
          mixamorigleftfoot: [12, 0, 0],
          mixamorigrightupleg: [-5, 0, 0],
          mixamorigrightleg: 3,
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftarm: [55, 0, -15],
          mixamorigrightarm: [75, 0, 15],
        },
      },
      {
        phase: 'Phase 2: Left Touchdown / Weight Transfer',
        timeOffsetMs: 250,
        commentary: 'Left foot lands flat. Spine returns to neutral roll as weight transfers forward.',
        overrides: {
          mixamorigspine: [3, 0, 0],
          mixamorigleftupleg: [8, 0, 0],
          mixamorigleftleg: 8,
          mixamorigleftfoot: [4, 0, 0],
          mixamorigrightupleg: [-2, 0, 0],
          mixamorigrightleg: 3,
          mixamorigrightfoot: [0, 0, 0],
        },
      },
      {
        phase: 'Phase 3: Left Push / Right Swing',
        timeOffsetMs: 500,
        commentary:
          'Left hip extends, right hip flexes 18 deg. Spine rolls 2 deg left to shift COM over left stance foot.',
        overrides: {
          mixamorigspine: [3, 0, -2],
          mixamorigspine1: [2, 0, -2],
          mixamorigleftupleg: [-5, 0, 0],
          mixamorigleftleg: 3,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightupleg: [18, 0, 0],
          mixamorigrightleg: 20,
          mixamorigrightfoot: [12, 0, 0],
          mixamorigleftarm: [75, 0, -15],
          mixamorigrightarm: [55, 0, 15],
        },
      },
      {
        phase: 'Phase 4: Right Touchdown / Cycle Reset',
        timeOffsetMs: 750,
        commentary: 'Right foot lands. Torso returns upright. Cycle ready to repeat from Phase 1.',
        overrides: {
          mixamorigspine: [3, 0, 0],
          mixamorigleftupleg: [-2, 0, 0],
          mixamorigleftleg: 3,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightupleg: [8, 0, 0],
          mixamorigrightleg: 8,
          mixamorigrightfoot: [4, 0, 0],
        },
      },
    ],
  },

  // ── AERIAL (2) ──────────────────────────────────────────────────────────────
  {
    id: 'aerial_forward_leap',
    category: 'aerial',
    title: 'Forward Leaping Jump',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Forward bounding jump combining vertical impulse with root velocity drive.',
    biomechanics_note: 'Spine forward pitch initiates COM displacement before vertical thrust.',
    parameters: {
      cycleDurationMs: 1000,
      activeGaitPhase: true,
      balanceMode: 'soft',
      recommendedForce: 6,
      recommendedSpeedMps: 0.12,
    },
    steps: [
      {
        phase: 'Forward Squat Preparation',
        timeOffsetMs: 0,
        commentary: 'Torso leans forward 14°, knees flex 40°, arms cocked back.',
        overrides: {
          mixamorigspine: [14, 0, 0],
          mixamorigleftupleg: [30, 0, 0],
          mixamorigrightupleg: [30, 0, 0],
          mixamorigleftleg: 40,
          mixamorigrightleg: 40,
          mixamorigleftfoot: [10, 0, 0],
          mixamorigrightfoot: [10, 0, 0],
          mixamorigleftarm: [45, 0, -20],
          mixamorigrightarm: [45, 0, 20],
          mixamorigleftforearm: 15,
          mixamorigrightforearm: 15,
        },
        rootVelocity: [0, 0.12, 0],
      },
      {
        phase: 'Asymmetric Forward Launch',
        timeOffsetMs: 200,
        commentary: 'Leading leg swings forward (+25°), trailing leg pushes back (-15°).',
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-15, 0, 0],
          mixamorigrightupleg: [25, 0, 0],
          mixamorigleftleg: 5,
          mixamorigrightleg: 20,
          mixamorigleftfoot: [-15, 0, 0],
          mixamorigrightfoot: [-15, 0, 0],
          mixamorigleftarm: [-60, 0, -10],
          mixamorigrightarm: [-60, 0, 10],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
        rootVelocity: [0, 0.12, 0],
      },
      {
        phase: 'Aerial Flight',
        timeOffsetMs: 450,
        commentary: 'Legs tuck to clear distance.',
        overrides: {
          mixamorigleftupleg: [15, 0, 0],
          mixamorigrightupleg: [15, 0, 0],
          mixamorigleftleg: 30,
          mixamorigrightleg: 30,
          mixamorigleftfoot: [-10, 0, 0],
          mixamorigrightfoot: [-10, 0, 0],
          mixamorigleftarm: [-45, 0, -25],
          mixamorigrightarm: [-45, 0, 25],
        },
      },
      {
        phase: 'Forward Landing Prep',
        timeOffsetMs: 700,
        commentary: 'Feet plant ahead of center of mass with flexed knees.',
        overrides: {
          mixamorigleftupleg: [20, 0, 0],
          mixamorigrightupleg: [20, 0, 0],
          mixamorigleftleg: 35,
          mixamorigrightleg: 35,
          mixamorigleftfoot: [10, 0, 0],
          mixamorigrightfoot: [10, 0, 0],
          mixamorigleftarm: [30, 0, -20],
          mixamorigrightarm: [30, 0, 20],
        },
      },
      {
        phase: 'Upright Recovery',
        timeOffsetMs: 1000,
        commentary: 'Return to neutral standing pose.',
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [0, 0, 0],
          mixamorigrightupleg: [0, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
      },
    ],
  },
  {
    id: 'aerial_vertical_jump',
    category: 'aerial',
    title: 'Vertical Jump with Soft Landing',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Dynamic 4-phase vertical jump with spring loading squat, explosive extension, and soft compliant landing.',
    biomechanics_note: 'Explosive triple extension generates vertical lift; compliant knee flexion absorbs impact energy.',
    parameters: {
      cycleDurationMs: 1000,
      activeGaitPhase: true,
      balanceMode: 'soft',
      recommendedForce: 6,
    },
    steps: [
      {
        phase: 'Squat Preparation (Spring Loading)',
        timeOffsetMs: 0,
        commentary: 'Knees flex 40°, hips flex 30°, arms swing back behind torso (+45°) to store elastic energy.',
        overrides: {
          mixamorigspine: [10, 0, 0],
          mixamorigleftupleg: [30, 0, 0],
          mixamorigrightupleg: [30, 0, 0],
          mixamorigleftleg: 40,
          mixamorigrightleg: 40,
          mixamorigleftfoot: [10, 0, 0],
          mixamorigrightfoot: [10, 0, 0],
          mixamorigleftarm: [45, 0, -20],
          mixamorigrightarm: [45, 0, 20],
          mixamorigleftforearm: 15,
          mixamorigrightforearm: 15,
        },
      },
      {
        phase: 'Explosive Triple Extension & Launch',
        timeOffsetMs: 200,
        commentary: 'Hips extend (-5°), knees snap straight (0°), ankles plantarflex (-15°), arms swing overhead (-60°).',
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [-5, 0, 0],
          mixamorigrightupleg: [-5, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [-15, 0, 0],
          mixamorigrightfoot: [-15, 0, 0],
          mixamorigleftarm: [-60, 0, -10],
          mixamorigrightarm: [-60, 0, 10],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
      },
      {
        phase: 'Mid-Air Tuck & Apex',
        timeOffsetMs: 450,
        commentary: 'In flight: knees tuck to 30°, hips to 15° to clear obstacles and prepare for ground contact.',
        overrides: {
          mixamorigleftupleg: [15, 0, 0],
          mixamorigrightupleg: [15, 0, 0],
          mixamorigleftleg: 30,
          mixamorigrightleg: 30,
          mixamorigleftfoot: [-10, 0, 0],
          mixamorigrightfoot: [-10, 0, 0],
          mixamorigleftarm: [-45, 0, -25],
          mixamorigrightarm: [-45, 0, 25],
        },
      },
      {
        phase: 'Touchdown & Impact Dissipation',
        timeOffsetMs: 700,
        commentary: 'Touchdown: knees flex 35° to absorb impact shock smoothly without rebounding.',
        overrides: {
          mixamorigleftupleg: [20, 0, 0],
          mixamorigrightupleg: [20, 0, 0],
          mixamorigleftleg: 35,
          mixamorigrightleg: 35,
          mixamorigleftfoot: [10, 0, 0],
          mixamorigrightfoot: [10, 0, 0],
          mixamorigleftarm: [30, 0, -20],
          mixamorigrightarm: [30, 0, 20],
        },
      },
      {
        phase: 'Return to Stable Upright Stance',
        timeOffsetMs: 1000,
        commentary: 'Knees and hips extend back to neutral resting stance with full balance restored.',
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigleftupleg: [0, 0, 0],
          mixamorigrightupleg: [0, 0, 0],
          mixamorigleftleg: 0,
          mixamorigrightleg: 0,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
      },
    ],
  },

  // ── GESTURE (6) ─────────────────────────────────────────────────────────────
  {
    id: 'gesture_ok_sign_right',
    category: 'gesture',
    title: 'OK Sign (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Raised arm with bent elbow, palm-forward OK sign.',
    biomechanics_note: 'x elevation (-20°), elbow hinge 90° (forearm up), palm-forward hand roll; OK ring settled at final frame.',
    parameters: { cycleDurationMs: 650, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Gesture milestone frame at 0ms',
        overrides: {
          mixamorigrightarm: [68, 0, 12],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
          mixamorigrighthandthumb1: 0,
          mixamorigrighthandthumb2: 0,
          mixamorigrighthandthumb3: 0,
          mixamorigrighthandindex1: 0,
          mixamorigrighthandindex2: 0,
          mixamorigrighthandindex3: 0,
          mixamorigrighthandmiddle1: 0,
          mixamorigrighthandmiddle2: 0,
          mixamorigrighthandmiddle3: 0,
          mixamorigrighthandring1: 0,
          mixamorigrighthandring2: 0,
          mixamorigrighthandring3: 0,
          mixamorigrighthandpinky1: 0,
          mixamorigrighthandpinky2: 0,
          mixamorigrighthandpinky3: 0,
        },
      },
      {
        phase: 'Frame 2 (250ms)',
        timeOffsetMs: 250,
        commentary: 'Gesture milestone frame at 250ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 3 (450ms)',
        timeOffsetMs: 450,
        commentary: 'Gesture milestone frame at 450ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (650ms)',
        timeOffsetMs: 650,
        commentary: 'Gesture milestone frame at 650ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, -90, 0],
          mixamorigrighthandthumb1: -45,
          mixamorigrighthandthumb2: -45,
          mixamorigrighthandthumb3: -35,
          mixamorigrighthandindex1: 45,
          mixamorigrighthandindex2: 55,
          mixamorigrighthandindex3: 40,
          mixamorigrighthandmiddle1: 0,
          mixamorigrighthandmiddle2: 0,
          mixamorigrighthandmiddle3: 0,
          mixamorigrighthandring1: 0,
          mixamorigrighthandring2: 0,
          mixamorigrighthandring3: 0,
          mixamorigrighthandpinky1: 0,
          mixamorigrighthandpinky2: 0,
          mixamorigrighthandpinky3: 0,
        },
      },
    ],
  },
  {
    id: 'gesture_open_hand_left',
    category: 'gesture',
    title: 'Open Hand (left)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Hand/finger gesture preset for Open Hand (left).',
    biomechanics_note: 'Open flat hand with relaxed extended fingers.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Open Hand (left) Pose',
        timeOffsetMs: 0,
        commentary: 'Open flat hand with relaxed extended fingers.',
        overrides: {
          mixamorigleftarm: [68, 0, -12],
          mixamorigleftforearm: 0,
          mixamoriglefthand: [0, 0, 0],
          mixamoriglefthandthumb1: [0, 0, 0],
          mixamoriglefthandthumb2: [0, 0, 0],
          mixamoriglefthandthumb3: [0, 0, 0],
          mixamoriglefthandindex1: 0,
          mixamoriglefthandindex2: 0,
          mixamoriglefthandindex3: 0,
          mixamoriglefthandmiddle1: 0,
          mixamoriglefthandmiddle2: 0,
          mixamoriglefthandmiddle3: 0,
          mixamoriglefthandring1: 0,
          mixamoriglefthandring2: 0,
          mixamoriglefthandring3: 0,
          mixamoriglefthandpinky1: 0,
          mixamoriglefthandpinky2: 0,
          mixamoriglefthandpinky3: 0,
        },
      },
    ],
  },
  {
    id: 'gesture_peace_right',
    category: 'gesture',
    title: 'Peace / Victory Sign (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Raised arm with bent elbow, palm-forward peace sign.',
    biomechanics_note: 'x elevation (-20°), elbow hinge 90° (forearm up), palm-forward hand roll; peace V settled at final frame.',
    parameters: { cycleDurationMs: 650, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Gesture milestone frame at 0ms',
        overrides: {
          mixamorigrightarm: [68, 0, 12],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 2 (250ms)',
        timeOffsetMs: 250,
        commentary: 'Gesture milestone frame at 250ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 3 (450ms)',
        timeOffsetMs: 450,
        commentary: 'Gesture milestone frame at 450ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (650ms)',
        timeOffsetMs: 650,
        commentary: 'Gesture milestone frame at 650ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, -90, 0],
          mixamorigrighthandthumb1: 55,
          mixamorigrighthandthumb2: 60,
          mixamorigrighthandthumb3: 40,
          mixamorigrighthandindex1: 0,
          mixamorigrighthandindex2: 0,
          mixamorigrighthandindex3: 0,
          mixamorigrighthandmiddle1: 0,
          mixamorigrighthandmiddle2: 0,
          mixamorigrighthandmiddle3: 0,
          mixamorigrighthandring1: 75,
          mixamorigrighthandring2: 85,
          mixamorigrighthandring3: 75,
          mixamorigrighthandpinky1: 75,
          mixamorigrighthandpinky2: 85,
          mixamorigrighthandpinky3: 75,
        },
      },
    ],
  },
  {
    id: 'gesture_pointing_left',
    category: 'gesture',
    title: 'Target Pointing (left)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Hand/finger gesture preset for Target Pointing (left).',
    biomechanics_note: 'Arm raised and swung forward with index finger extended. Thumb cleared via Z-axis tuck.',
    parameters: { balanceMode: 'auto' },
    steps: [
      {
        phase: 'Target Pointing (left) Pose',
        timeOffsetMs: 0,
        commentary: 'Arm raised and swung forward with index finger extended. Thumb cleared via Z-axis tuck.',
        overrides: {
          mixamorigleftarm: [0, 0, -70],
          mixamorigleftforearm: 0,
          mixamoriglefthand: [0, 0, 0],
          mixamoriglefthandthumb1: [0, 0, 30],
          mixamoriglefthandthumb2: [0, 0, 25],
          mixamoriglefthandthumb3: [0, 0, 20],
          mixamoriglefthandindex1: 0,
          mixamoriglefthandindex2: 0,
          mixamoriglefthandindex3: 0,
          mixamoriglefthandmiddle1: 75,
          mixamoriglefthandmiddle2: 85,
          mixamoriglefthandmiddle3: 75,
          mixamoriglefthandring1: 75,
          mixamoriglefthandring2: 85,
          mixamoriglefthandring3: 75,
          mixamoriglefthandpinky1: 75,
          mixamoriglefthandpinky2: 85,
          mixamoriglefthandpinky3: 75,
        },
      },
    ],
  },
  {
    id: 'gesture_ripple_right',
    category: 'gesture',
    title: 'Finger Ripple (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Dynamic sequential finger flutter.',
    biomechanics_note: 'Phased flexion wave through phalanges.',
    parameters: { cycleDurationMs: 840, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Gesture milestone frame at 0ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandthumb1: [0, 0, 20],
          mixamorigrighthandthumb2: [0, 0, 20],
          mixamorigrighthandthumb3: [0, 0, 20],
          mixamorigrighthandindex1: 80,
          mixamorigrighthandindex2: 80,
          mixamorigrighthandindex3: 80,
          mixamorigrighthandmiddle1: 10,
          mixamorigrighthandmiddle2: 10,
          mixamorigrighthandmiddle3: 10,
          mixamorigrighthandring1: 10,
          mixamorigrighthandring2: 10,
          mixamorigrighthandring3: 10,
          mixamorigrighthandpinky1: 10,
          mixamorigrighthandpinky2: 10,
          mixamorigrighthandpinky3: 10,
        },
      },
      {
        phase: 'Frame 2 (120ms)',
        timeOffsetMs: 120,
        commentary: 'Gesture milestone frame at 120ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandindex1: 10,
          mixamorigrighthandmiddle1: 80,
          mixamorigrighthandmiddle2: 80,
          mixamorigrighthandmiddle3: 80,
        },
      },
      {
        phase: 'Frame 3 (240ms)',
        timeOffsetMs: 240,
        commentary: 'Gesture milestone frame at 240ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandmiddle1: 10,
          mixamorigrighthandring1: 80,
          mixamorigrighthandring2: 80,
          mixamorigrighthandring3: 80,
        },
      },
      {
        phase: 'Frame 4 (360ms)',
        timeOffsetMs: 360,
        commentary: 'Gesture milestone frame at 360ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandring1: 10,
          mixamorigrighthandpinky1: 80,
          mixamorigrighthandpinky2: 80,
          mixamorigrighthandpinky3: 80,
        },
      },
      {
        phase: 'Frame 5 (480ms)',
        timeOffsetMs: 480,
        commentary: 'Gesture milestone frame at 480ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandpinky1: 10,
          mixamorigrighthandindex1: 80,
          mixamorigrighthandindex2: 80,
          mixamorigrighthandindex3: 80,
        },
      },
      {
        phase: 'Frame 6 (600ms)',
        timeOffsetMs: 600,
        commentary: 'Gesture milestone frame at 600ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandindex1: 10,
          mixamorigrighthandmiddle1: 80,
        },
      },
      {
        phase: 'Frame 7 (720ms)',
        timeOffsetMs: 720,
        commentary: 'Gesture milestone frame at 720ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandmiddle1: 10,
          mixamorigrighthandring1: 80,
        },
      },
      {
        phase: 'Frame 8 (840ms)',
        timeOffsetMs: 840,
        commentary: 'Gesture milestone frame at 840ms',
        overrides: {
          mixamorigrightarm: [10, 0, 60],
          mixamorigrightforearm: 45,
          mixamorigrighthandring1: 10,
          mixamorigrighthandpinky1: 80,
        },
      },
    ],
  },
  {
    id: 'gesture_wave_right',
    category: 'gesture',
    title: 'Hand Wave Greeting (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Friendly hand wave greeting with wrist roll and elbow oscillation.',
    biomechanics_note: 'x elevation (-20°), elbow hinge 90° (forearm up), palm-forward hand roll; wave = elbow oscillation.',
    parameters: { cycleDurationMs: 1650, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Gesture milestone frame at 0ms',
        overrides: {
          mixamorigrightarm: [68, 0, 12],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 2 (250ms)',
        timeOffsetMs: 250,
        commentary: 'Gesture milestone frame at 250ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 0,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 3 (450ms)',
        timeOffsetMs: 450,
        commentary: 'Gesture milestone frame at 450ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (650ms)',
        timeOffsetMs: 650,
        commentary: 'Gesture milestone frame at 650ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 90,
          mixamorigrighthand: [0, -90, 0],
        },
      },
      {
        phase: 'Frame 5 (850ms)',
        timeOffsetMs: 850,
        commentary: 'Gesture milestone frame at 850ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 115,
          mixamorigrighthand: [0, -90, 0],
        },
      },
      {
        phase: 'Frame 6 (1050ms)',
        timeOffsetMs: 1050,
        commentary: 'Gesture milestone frame at 1050ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 65,
          mixamorigrighthand: [0, -90, 0],
        },
      },
      {
        phase: 'Frame 7 (1250ms)',
        timeOffsetMs: 1250,
        commentary: 'Gesture milestone frame at 1250ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 115,
          mixamorigrighthand: [0, -90, 0],
        },
      },
      {
        phase: 'Frame 8 (1450ms)',
        timeOffsetMs: 1450,
        commentary: 'Gesture milestone frame at 1450ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 65,
          mixamorigrighthand: [0, -90, 0],
        },
      },
      {
        phase: 'Frame 9 (1650ms)',
        timeOffsetMs: 1650,
        commentary: 'Gesture milestone frame at 1650ms',
        overrides: {
          mixamorigrightarm: [-20, 0, 0],
          mixamorigrightforearm: 115,
          mixamorigrighthand: [0, -90, 0],
        },
      },
    ],
  },

  // ── EXPRESSIVE (8) ──────────────────────────────────────────────────────────
  {
    id: 'expressive_celebrate',
    category: 'expressive',
    title: 'Victory Celebration',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Celebratory victory pose with arms raised overhead and head held high.',
    biomechanics_note: 'Bilateral overhead elevation with spine counter-balance.',
    parameters: { cycleDurationMs: 1800, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Milestone frame at 0ms',
        overrides: { mixamorigleftarm: [68, 0, -12], mixamorigrightarm: [68, 0, 12] },
      },
      {
        phase: 'Frame 2 (400ms)',
        timeOffsetMs: 400,
        commentary: 'Milestone frame at 400ms',
        overrides: {
          mixamorigleftarm: [-80, 0, -15],
          mixamorigrightarm: [-80, 0, 15],
          mixamorigleftforearm: 15,
          mixamorigrightforearm: 15,
          mixamorigspine: [-5, 0, 0],
          mixamorighead: [-15, 0, 0],
        },
      },
      {
        phase: 'Frame 3 (1400ms)',
        timeOffsetMs: 1400,
        commentary: 'Milestone frame at 1400ms',
        overrides: {
          mixamorigleftarm: [-80, 0, -15],
          mixamorigrightarm: [-80, 0, 15],
          mixamorigleftforearm: 15,
          mixamorigrightforearm: 15,
          mixamorigspine: [-5, 0, 0],
          mixamorighead: [-15, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (1800ms)',
        timeOffsetMs: 1800,
        commentary: 'Milestone frame at 1800ms',
        overrides: {
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
          mixamorigspine: [0, 0, 0],
          mixamorighead: [0, 0, 0],
        },
      },
    ],
  },
  {
    id: 'expressive_curious_look_around',
    category: 'expressive',
    title: 'Curious Visual Scan',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Smooth multi-directional head scan for environmental exploration.',
    biomechanics_note: 'Holds gaze orientations for stable camera frame capture.',
    parameters: { cycleDurationMs: 3000, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Milestone frame at 0ms',
        overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] },
      },
      {
        phase: 'Frame 2 (200ms)',
        timeOffsetMs: 200,
        commentary: 'Milestone frame at 200ms',
        overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] },
      },
      {
        phase: 'Frame 3 (750ms)',
        timeOffsetMs: 750,
        commentary: 'Look left and upward',
        overrides: { mixamorigneck: [0, 0, -10], mixamorighead: [0, 0, -25] },
      },
      {
        phase: 'Frame 4 (1140ms)',
        timeOffsetMs: 1140,
        commentary: 'Hold left gaze orientation',
        overrides: { mixamorigneck: [0, 0, -10], mixamorighead: [0, 0, -25] },
      },
      {
        phase: 'Frame 5 (1500ms)',
        timeOffsetMs: 1500,
        commentary: 'Scan down center',
        overrides: { mixamorigneck: [-4, 0, 0], mixamorighead: [-8, 0, 0] },
      },
      {
        phase: 'Frame 6 (1890ms)',
        timeOffsetMs: 1890,
        commentary: 'Hold lower center gaze',
        overrides: { mixamorigneck: [-4, 0, 0], mixamorighead: [-8, 0, 0] },
      },
      {
        phase: 'Frame 7 (2250ms)',
        timeOffsetMs: 2250,
        commentary: 'Look right and upward',
        overrides: { mixamorigneck: [0, 0, 10], mixamorighead: [0, 0, 25] },
      },
      {
        phase: 'Frame 8 (2640ms)',
        timeOffsetMs: 2640,
        commentary: 'Hold right gaze',
        overrides: { mixamorigneck: [0, 0, 10], mixamorighead: [0, 0, 25] },
      },
      {
        phase: 'Frame 9 (3000ms)',
        timeOffsetMs: 3000,
        commentary: 'Return to center horizon',
        overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] },
      },
    ],
  },
  {
    id: 'expressive_front_kick_right',
    category: 'expressive',
    title: 'Front Snap Kick (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Front snap kick with chamber, extension, retraction, and re-plant.',
    biomechanics_note: 'Spine lean compensates for single-leg support COM displacement.',
    parameters: { cycleDurationMs: 800, balanceMode: 'auto' },
    steps: [
      {
        phase: 'Frame 1 (0ms)',
        timeOffsetMs: 0,
        commentary: 'Milestone frame at 0ms',
        overrides: {
          mixamorigleftupleg: [5, 0, 0],
          mixamorigleftleg: 5,
          mixamorigrightupleg: [15, 0, 0],
          mixamorigrightleg: 30,
          mixamorigspine: [5, 0, 0],
          mixamorigleftarm: [45, 0, 10],
          mixamorigrightarm: [45, 0, -10],
          mixamorigleftforearm: 60,
          mixamorigrightforearm: 60,
        },
      },
      {
        phase: 'Frame 2 (200ms)',
        timeOffsetMs: 200,
        commentary: 'Milestone frame at 200ms',
        overrides: {
          mixamorigleftupleg: [5, 0, 0],
          mixamorigleftleg: 5,
          mixamorigrightupleg: [60, 0, 0],
          mixamorigrightleg: 80,
          mixamorigspine: [5, 0, 0],
          mixamorigleftarm: [45, 0, 10],
          mixamorigrightarm: [45, 0, -10],
          mixamorigleftforearm: 60,
          mixamorigrightforearm: 60,
        },
      },
      {
        phase: 'Frame 3 (350ms)',
        timeOffsetMs: 350,
        commentary: 'Milestone frame at 350ms',
        overrides: {
          mixamorigleftupleg: [5, 0, 0],
          mixamorigleftleg: 5,
          mixamorigrightupleg: [70, 0, 0],
          mixamorigrightleg: 10,
          mixamorigspine: [5, 0, 0],
          mixamorigleftarm: [45, 0, 10],
          mixamorigrightarm: [45, 0, -10],
          mixamorigleftforearm: 60,
          mixamorigrightforearm: 60,
          mixamorigrightfoot: [-20, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (550ms)',
        timeOffsetMs: 550,
        commentary: 'Milestone frame at 550ms',
        overrides: {
          mixamorigleftupleg: [5, 0, 0],
          mixamorigleftleg: 5,
          mixamorigrightupleg: [40, 0, 0],
          mixamorigrightleg: 50,
          mixamorigspine: [5, 0, 0],
          mixamorigleftarm: [45, 0, 10],
          mixamorigrightarm: [45, 0, -10],
          mixamorigleftforearm: 60,
          mixamorigrightforearm: 60,
          mixamorigrightfoot: [0, 0, 0],
        },
      },
      {
        phase: 'Frame 5 (800ms)',
        timeOffsetMs: 800,
        commentary: 'Milestone frame at 800ms',
        overrides: {
          mixamorigrightupleg: [0, 0, 0],
          mixamorigrightleg: 0,
          mixamorigrightfoot: [0, 0, 0],
          mixamorigleftupleg: [0, 0, 0],
          mixamorigleftleg: 0,
          mixamorigleftfoot: [0, 0, 0],
          mixamorigspine: [0, 0, 0],
          mixamorigleftarm: [75, 0, 0],
          mixamorigrightarm: [75, 0, 0],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
        },
      },
    ],
  },
  {
    id: 'expressive_head_nod_yes',
    category: 'expressive',
    title: 'Head Nod Affirmation',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Vertical head nodding motion indicating agreement.',
    biomechanics_note: 'Head pitch oscillation isolated to cervical spine without core perturbation.',
    parameters: { cycleDurationMs: 3000, balanceMode: 'auto' },
    steps: [
      { phase: 'Frame 1 (0ms)', timeOffsetMs: 0, commentary: 'Milestone frame at 0ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { phase: 'Frame 2 (200ms)', timeOffsetMs: 200, commentary: 'Milestone frame at 200ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { phase: 'Frame 3 (450ms)', timeOffsetMs: 450, commentary: 'Milestone frame at 450ms', overrides: { mixamorigneck: [7, 0, 0], mixamorighead: [16, 0, 0] } },
      { phase: 'Frame 4 (700ms)', timeOffsetMs: 700, commentary: 'Milestone frame at 700ms', overrides: { mixamorigneck: [-2, 0, 0], mixamorighead: [-4, 0, 0] } },
      { phase: 'Frame 5 (950ms)', timeOffsetMs: 950, commentary: 'Milestone frame at 950ms', overrides: { mixamorigneck: [7, 0, 0], mixamorighead: [16, 0, 0] } },
      { phase: 'Frame 6 (1200ms)', timeOffsetMs: 1200, commentary: 'Milestone frame at 1200ms', overrides: { mixamorigneck: [-2, 0, 0], mixamorighead: [-4, 0, 0] } },
      { phase: 'Frame 7 (1450ms)', timeOffsetMs: 1450, commentary: 'Milestone frame at 1450ms', overrides: { mixamorigneck: [7, 0, 0], mixamorighead: [16, 0, 0] } },
      { phase: 'Frame 8 (1700ms)', timeOffsetMs: 1700, commentary: 'Milestone frame at 1700ms', overrides: { mixamorigneck: [-2, 0, 0], mixamorighead: [-4, 0, 0] } },
      { phase: 'Frame 9 (1950ms)', timeOffsetMs: 1950, commentary: 'Milestone frame at 1950ms', overrides: { mixamorigneck: [7, 0, 0], mixamorighead: [16, 0, 0] } },
      { phase: 'Frame 10 (2200ms)', timeOffsetMs: 2200, commentary: 'Milestone frame at 2200ms', overrides: { mixamorigneck: [-2, 0, 0], mixamorighead: [-4, 0, 0] } },
      { phase: 'Frame 11 (2450ms)', timeOffsetMs: 2450, commentary: 'Milestone frame at 2450ms', overrides: { mixamorigneck: [7, 0, 0], mixamorighead: [16, 0, 0] } },
      { phase: 'Frame 12 (2700ms)', timeOffsetMs: 2700, commentary: 'Milestone frame at 2700ms', overrides: { mixamorigneck: [-2, 0, 0], mixamorighead: [-4, 0, 0] } },
      { phase: 'Frame 13 (3000ms)', timeOffsetMs: 3000, commentary: 'Milestone frame at 3000ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
    ],
  },
  {
    id: 'expressive_head_shake_no',
    category: 'expressive',
    title: 'Head Shake Negation',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Lateral head yaw oscillation indicating disagreement.',
    biomechanics_note: 'Smooth neck yaw transitions avoiding servo ringing.',
    parameters: { cycleDurationMs: 3500, balanceMode: 'auto' },
    steps: [
      { phase: 'Frame 1 (0ms)', timeOffsetMs: 0, commentary: 'Milestone frame at 0ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { phase: 'Frame 2 (200ms)', timeOffsetMs: 200, commentary: 'Milestone frame at 200ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      { phase: 'Frame 3 (500ms)', timeOffsetMs: 500, commentary: 'Milestone frame at 500ms', overrides: { mixamorigneck: [0, 0, 9], mixamorighead: [0, 0, 20] } },
      { phase: 'Frame 4 (800ms)', timeOffsetMs: 800, commentary: 'Milestone frame at 800ms', overrides: { mixamorigneck: [0, 0, -9], mixamorighead: [0, 0, -20] } },
      { phase: 'Frame 5 (1100ms)', timeOffsetMs: 1100, commentary: 'Milestone frame at 1100ms', overrides: { mixamorigneck: [0, 0, 9], mixamorighead: [0, 0, 20] } },
      { phase: 'Frame 6 (1400ms)', timeOffsetMs: 1400, commentary: 'Milestone frame at 1400ms', overrides: { mixamorigneck: [0, 0, -9], mixamorighead: [0, 0, -20] } },
      { phase: 'Frame 7 (1700ms)', timeOffsetMs: 1700, commentary: 'Milestone frame at 1700ms', overrides: { mixamorigneck: [0, 0, 9], mixamorighead: [0, 0, 20] } },
      { phase: 'Frame 8 (2000ms)', timeOffsetMs: 2000, commentary: 'Milestone frame at 2000ms', overrides: { mixamorigneck: [0, 0, -9], mixamorighead: [0, 0, -20] } },
      { phase: 'Frame 9 (2300ms)', timeOffsetMs: 2300, commentary: 'Milestone frame at 2300ms', overrides: { mixamorigneck: [0, 0, 9], mixamorighead: [0, 0, 20] } },
      { phase: 'Frame 10 (2600ms)', timeOffsetMs: 2600, commentary: 'Milestone frame at 2600ms', overrides: { mixamorigneck: [0, 0, -9], mixamorighead: [0, 0, -20] } },
      { phase: 'Frame 11 (2900ms)', timeOffsetMs: 2900, commentary: 'Milestone frame at 2900ms', overrides: { mixamorigneck: [0, 0, 9], mixamorighead: [0, 0, 20] } },
      { phase: 'Frame 12 (3200ms)', timeOffsetMs: 3200, commentary: 'Milestone frame at 3200ms', overrides: { mixamorigneck: [0, 0, -9], mixamorighead: [0, 0, -20] } },
      { phase: 'Frame 13 (3500ms)', timeOffsetMs: 3500, commentary: 'Milestone frame at 3500ms', overrides: { mixamorigneck: [0, 0, 0], mixamorighead: [0, 0, 0] } },
    ],
  },
  {
    id: 'expressive_reach_right',
    category: 'expressive',
    title: 'Forward Reach (right)',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Reaching forward with the right arm.',
    biomechanics_note: 'Forward sagittal arm articulation with neutral wrist.',
    parameters: { cycleDurationMs: 1600, balanceMode: 'auto' },
    steps: [
      { phase: 'Frame 1 (0ms)', timeOffsetMs: 0, commentary: 'Milestone frame at 0ms', overrides: { mixamorigrightarm: [68, 0, 12] } },
      {
        phase: 'Frame 2 (350ms)',
        timeOffsetMs: 350,
        commentary: 'Milestone frame at 350ms',
        overrides: { mixamorigrightarm: [20, 0, 65], mixamorigrightforearm: 10, mixamorigrighthand: [0, 0, 0] },
      },
      {
        phase: 'Frame 3 (1200ms)',
        timeOffsetMs: 1200,
        commentary: 'Milestone frame at 1200ms',
        overrides: { mixamorigrightarm: [20, 0, 65], mixamorigrightforearm: 10, mixamorigrighthand: [0, 0, 0] },
      },
      {
        phase: 'Frame 4 (1600ms)',
        timeOffsetMs: 1600,
        commentary: 'Milestone frame at 1600ms',
        overrides: { mixamorigrightarm: [68, 0, 12], mixamorigrightforearm: 0, mixamorigrighthand: [0, 0, 0] },
      },
    ],
  },
  {
    id: 'expressive_respectful_bow',
    category: 'expressive',
    title: 'Respectful Bow',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Formal bow of respect with forward torso inclination.',
    biomechanics_note: 'Controlled forward spine pitch with arms steady at sides.',
    parameters: { cycleDurationMs: 1600, balanceMode: 'auto' },
    steps: [
      { phase: 'Frame 1 (0ms)', timeOffsetMs: 0, commentary: 'Milestone frame at 0ms', overrides: { mixamorigspine: [0, 0, 0], mixamorighead: [0, 0, 0] } },
      {
        phase: 'Frame 2 (400ms)',
        timeOffsetMs: 400,
        commentary: 'Milestone frame at 400ms',
        overrides: {
          mixamorigspine: [25, 0, 0],
          mixamorigspine1: [15, 0, 0],
          mixamorighead: [15, 0, 0],
          mixamorigleftarm: [68, 0, -5],
          mixamorigrightarm: [68, 0, 5],
        },
      },
      {
        phase: 'Frame 3 (1200ms)',
        timeOffsetMs: 1200,
        commentary: 'Milestone frame at 1200ms',
        overrides: {
          mixamorigspine: [25, 0, 0],
          mixamorigspine1: [15, 0, 0],
          mixamorighead: [15, 0, 0],
          mixamorigleftarm: [68, 0, -5],
          mixamorigrightarm: [68, 0, 5],
        },
      },
      {
        phase: 'Frame 4 (1600ms)',
        timeOffsetMs: 1600,
        commentary: 'Milestone frame at 1600ms',
        overrides: {
          mixamorigspine: [0, 0, 0],
          mixamorigspine1: [0, 0, 0],
          mixamorighead: [0, 0, 0],
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
        },
      },
    ],
  },
  {
    id: 'expressive_shrug',
    category: 'expressive',
    title: 'Shoulder Shrug',
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Expressive gesture conveying uncertainty or indifference.',
    biomechanics_note: 'Elbow flexion and arm abduction with head tilt.',
    parameters: { cycleDurationMs: 1600, balanceMode: 'auto' },
    steps: [
      { phase: 'Frame 1 (0ms)', timeOffsetMs: 0, commentary: 'Milestone frame at 0ms', overrides: { mixamorigleftarm: [68, 0, -12], mixamorigrightarm: [68, 0, 12] } },
      {
        phase: 'Frame 2 (300ms)',
        timeOffsetMs: 300,
        commentary: 'Milestone frame at 300ms',
        overrides: {
          mixamorigleftarm: [45, 0, -15],
          mixamorigrightarm: [45, 0, 15],
          mixamorigleftforearm: 45,
          mixamorigrightforearm: 45,
          mixamorighead: [-5, 0, 0],
        },
      },
      {
        phase: 'Frame 3 (1200ms)',
        timeOffsetMs: 1200,
        commentary: 'Milestone frame at 1200ms',
        overrides: {
          mixamorigleftarm: [45, 0, -15],
          mixamorigrightarm: [45, 0, 15],
          mixamorigleftforearm: 45,
          mixamorigrightforearm: 45,
          mixamorighead: [-5, 0, 0],
        },
      },
      {
        phase: 'Frame 4 (1600ms)',
        timeOffsetMs: 1600,
        commentary: 'Milestone frame at 1600ms',
        overrides: {
          mixamorigleftarm: [68, 0, -12],
          mixamorigrightarm: [68, 0, 12],
          mixamorigleftforearm: 0,
          mixamorigrightforearm: 0,
          mixamorighead: [0, 0, 0],
        },
      },
    ],
  },
];

let memoryCustomEntries: MotorCodexEntry[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function getCustomEntries(): MotorCodexEntry[] {
  if (typeof localStorage === 'undefined') {
    return [...memoryCustomEntries];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...memoryCustomEntries];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...memoryCustomEntries];
  } catch {
    return [...memoryCustomEntries];
  }
}

export class MotorCodexRegistry {
  /**
   * Get all baseline built-in recipes.
   */
  public static getBuiltin(): MotorCodexEntry[] {
    return JSON.parse(JSON.stringify(BUILTIN_MOTOR_CODEX));
  }

  /**
   * Get all registered recipes: built-in recipes merged with custom recordings from localStorage.
   * Matching IDs in custom storage override built-in entries; new IDs are appended.
   */
  public static getAll(): MotorCodexEntry[] {
    const base = this.getBuiltin();
    const custom = getCustomEntries();
    if (!custom.length) return base;

    const mergedMap = new Map<string, MotorCodexEntry>();
    base.forEach((item) => mergedMap.set(item.id, item));
    custom.forEach((item) => mergedMap.set(item.id, item));

    return Array.from(mergedMap.values());
  }

  /**
   * Register or update a custom recipe captured from an action script.
   */
  public static register(entry: MotorCodexEntry): void {
    if (!entry || !entry.id) return;
    const custom = getCustomEntries();
    const existingIndex = custom.findIndex((e) => e.id === entry.id);
    if (existingIndex >= 0) {
      custom[existingIndex] = entry;
    } else {
      custom.push(entry);
    }
    memoryCustomEntries = [...custom];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
      } catch (e) {
        console.warn('[MotorCodex] Failed to persist to localStorage:', e);
      }
    }
    notifyListeners();
  }

  /**
   * Remove a recipe by ID (removes custom override).
   */
  public static remove(id: string): void {
    const filtered = getCustomEntries().filter((e) => e.id !== id);
    memoryCustomEntries = [...filtered];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch {
        /* ignore */
      }
    }
    notifyListeners();
  }

  /**
   * Clear all custom recorded recipes (resets back to baseline built-in recipes).
   */
  public static clear(): void {
    memoryCustomEntries = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    notifyListeners();
  }

  /**
   * Execute a recipe by ID by dispatching a synthia:action CustomEvent to the world.
   */
  public static execute(recipeId: string, agentId = 'agent_0'): boolean {
    const recipe = this.getAll().find((r) => r.id === recipeId);
    if (!recipe || !recipe.steps || !recipe.steps.length) return false;

    if (typeof window !== 'undefined') {
      if (recipe.steps.length === 1) {
        window.dispatchEvent(
          new CustomEvent('synthia:action', {
            detail: {
              agentId,
              jointOverrides: recipe.steps[0].overrides,
              activeGaitPhase: recipe.parameters?.activeGaitPhase ?? false,
            },
          })
        );
      } else {
        const sequence = recipe.steps.map((s) => ({
          timeOffsetMs: s.timeOffsetMs,
          overrides: s.overrides,
          rootVelocity: s.rootVelocity,
        }));
        window.dispatchEvent(
          new CustomEvent('synthia:action', {
            detail: {
              agentId,
              sequence,
              activeGaitPhase: recipe.parameters?.activeGaitPhase ?? true,
            },
          })
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Subscribe to registry changes.
   */
  public static subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
}

// Expose on window for browser script and console integration
if (typeof window !== 'undefined') {
  (window as any).synthiaRegisterRecipe = (entry: MotorCodexEntry) => {
    MotorCodexRegistry.register(entry);
    console.log(`[MotorCodex] Registered recipe: "${entry.title}" (${entry.id})`);
  };
  (window as any).synthiaGetRecipes = () => MotorCodexRegistry.getAll();
  (window as any).synthiaClearRecipes = () => MotorCodexRegistry.clear();
  (window as any).synthiaExecuteRecipe = (recipeId: string, agentId = 'agent_0') =>
    MotorCodexRegistry.execute(recipeId, agentId);
}
