import { MotorCodexRegistry, MOTOR_CODEX_DISCLAIMER, MotorCodexEntry } from '../../../constants/motorCodex';
import { MotorCodexService } from '../motorCodexService';
import { PromptAssembler } from '../PromptAssembler';

describe('Motor Codex & Motion Guide Manual System', () => {
  const sampleWalkRecipe: MotorCodexEntry = {
    id: 'locomotion_waddle_walk',
    category: 'locomotion',
    title: 'Continuous Robotic Waddle Walk',
    tags: ['walk', 'forward', 'locomotion'],
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Forward locomotion using lateral weight shifting.',
    biomechanics_note: 'Tilting spine roll 2 degrees centers mass over stance foot.',
    parameters: { recommendedSpeedMps: 0.12, activeGaitPhase: true },
    steps: [
      {
        phase: 'Phase 1: Right Leg Push',
        timeOffsetMs: 0,
        commentary: 'Right hip extends back -5 degrees.',
        overrides: { mixamorigleftupleg: [18, 0, 0], mixamorigrightupleg: [-5, 0, 0] },
        rootVelocity: [0, 0.12, 0],
      },
    ],
  };

  const sampleJumpRecipe: MotorCodexEntry = {
    id: 'aerial_vertical_jump',
    category: 'aerial',
    title: 'Vertical Jump',
    tags: ['jump', 'leap', 'hop'],
    disclaimer: MOTOR_CODEX_DISCLAIMER,
    summary: 'Squat prep followed by explosive vertical extension.',
    biomechanics_note: 'Knees flex 40 degrees before triple extension.',
    parameters: { activeGaitPhase: true },
    steps: [
      {
        phase: 'Squat Prep',
        timeOffsetMs: 0,
        commentary: 'Knees flex 40 degrees.',
        overrides: { mixamorigleftleg: 40, mixamorigrightleg: 40 },
      },
    ],
  };

  beforeEach(() => {
    MotorCodexRegistry.clear();
  });

  test('Registry starts empty before any scripts are run', () => {
    expect(MotorCodexRegistry.getAll().length).toBe(0);
  });

  test('Registry dynamically registers and removes recipes', () => {
    MotorCodexRegistry.register(sampleWalkRecipe);
    expect(MotorCodexRegistry.getAll().length).toBe(1);

    MotorCodexRegistry.register(sampleJumpRecipe);
    expect(MotorCodexRegistry.getAll().length).toBe(2);

    MotorCodexRegistry.remove(sampleJumpRecipe.id);
    expect(MotorCodexRegistry.getAll().length).toBe(1);
    expect(MotorCodexRegistry.getAll()[0].id).toBe(sampleWalkRecipe.id);
  });

  test('Registering a recipe with the same id updates it in place', () => {
    MotorCodexRegistry.register(sampleWalkRecipe);
    MotorCodexRegistry.register({ ...sampleWalkRecipe, summary: 'Updated summary' });
    expect(MotorCodexRegistry.getAll().length).toBe(1);
    expect(MotorCodexRegistry.getAll()[0].summary).toBe('Updated summary');
  });

  test('MotorCodexService matches registered recipes by keyword and goal context', () => {
    MotorCodexRegistry.register(sampleWalkRecipe);
    MotorCodexRegistry.register(sampleJumpRecipe);

    const walkResults = MotorCodexService.findRelevant('I want to walk forward 2 meters', 2);
    expect(walkResults.length).toBeGreaterThan(0);
    expect(walkResults[0].id).toBe('locomotion_waddle_walk');

    const jumpResults = MotorCodexService.findRelevant('jump up over the obstacle', 1);
    expect(jumpResults.length).toBe(1);
    expect(jumpResults[0].id).toBe('aerial_vertical_jump');
  });

  test('MotorCodexService returns empty array when registry is empty', () => {
    const results = MotorCodexService.findRelevant('walk forward', 2);
    expect(results.length).toBe(0);
  });

  test('PromptAssembler injects Motor Codex segment when enabled and hints exist', () => {
    MotorCodexRegistry.register(sampleWalkRecipe);

    const payload = {
      agent_id: 'agent_0',
      use_action_dictionary: true,
      motor_codex_hints: MotorCodexService.formatForPrompt(MotorCodexService.findRelevant('walk forward', 1)),
      directive_mode: 'training',
      current_goal: 'Walk forward to the table',
    };

    const assembled = PromptAssembler.build(payload);
    expect(assembled.systemPrompt).toContain('== MOTION GUIDE MANUAL (SUGGESTED MOTOR RECIPES) ==');
    expect(assembled.systemPrompt).toContain('DISCLAIMER:');
    expect(assembled.systemPrompt).toContain('CONTINUOUS ROBOTIC WADDLE WALK');

    const p11 = assembled.segments.find((s) => s.id === 'P11');
    expect(p11).toBeDefined();
    expect(p11?.order).toBe(135);
  });

  test('PromptAssembler excludes Motor Codex segment when disabled (Tabula Rasa)', () => {
    MotorCodexRegistry.register(sampleWalkRecipe);

    const payload = {
      agent_id: 'agent_0',
      use_action_dictionary: false,
      motor_codex_hints: MotorCodexService.formatForPrompt(MotorCodexService.findRelevant('walk forward', 1)),
      directive_mode: 'training',
      current_goal: 'Walk forward to the table',
    };

    const assembled = PromptAssembler.build(payload);
    expect(assembled.systemPrompt).not.toContain('== MOTION GUIDE MANUAL');
    const p11 = assembled.segments.find((s) => s.id === 'P11');
    expect(p11).toBeUndefined();
  });
});
