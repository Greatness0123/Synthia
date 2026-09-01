import { MotorCodexRegistry, BUILTIN_MOTOR_CODEX, MotorCodexEntry } from '../../../constants/motorCodex';
import { MotorCodexService } from '../motorCodexService';
import { PromptAssembler } from '../PromptAssembler';

describe('Motor Codex & Motion Guide Manual System', () => {
  beforeEach(() => {
    MotorCodexRegistry.clear();
  });

  test('Registry initializes with all 23 official BUILTIN_MOTOR_CODEX entries', () => {
    expect(BUILTIN_MOTOR_CODEX.length).toBe(23);
    const all = MotorCodexRegistry.getAll();
    expect(all.length).toBe(23);

    // Verify key categories are represented
    const categories = new Set(all.map((r) => r.category));
    expect(categories.has('locomotion')).toBe(true);
    expect(categories.has('posture')).toBe(true);
    expect(categories.has('aerial')).toBe(true);
    expect(categories.has('gesture')).toBe(true);
    expect(categories.has('expressive')).toBe(true);
  });

  test('Custom recordings override built-ins with same ID and append new IDs', () => {
    const customWalk: MotorCodexEntry = {
      ...BUILTIN_MOTOR_CODEX.find((r) => r.id === 'locomotion_waddle_walk')!,
      summary: 'Custom tuned waddle walk with extra clearance.',
    };
    const brandNewRecipe: MotorCodexEntry = {
      id: 'custom_breakdance',
      category: 'expressive',
      title: 'Breakdance Spin',
      disclaimer: 'Custom recipe',
      summary: 'Experimental spin maneuver.',
      biomechanics_note: 'Dynamic COM rotation.',
      parameters: { balanceMode: 'dynamic_rmbs' },
      steps: [{ phase: 'Spin', timeOffsetMs: 0, commentary: 'Spin', overrides: {} }],
    };

    MotorCodexRegistry.register(customWalk);
    MotorCodexRegistry.register(brandNewRecipe);

    const all = MotorCodexRegistry.getAll();
    expect(all.length).toBe(24); // 23 base + 1 new

    const updatedWalk = all.find((r) => r.id === 'locomotion_waddle_walk');
    expect(updatedWalk?.summary).toBe('Custom tuned waddle walk with extra clearance.');

    // Clearing custom entries restores the 23 base recipes
    MotorCodexRegistry.clear();
    expect(MotorCodexRegistry.getAll().length).toBe(23);
  });

  test('MotorCodexService matches built-in recipes by keyword and goal context', () => {
    const walkResults = MotorCodexService.findRelevant('I want to walk forward across the room', 2);
    expect(walkResults.length).toBeGreaterThan(0);
    expect(walkResults.some((r) => r.id.includes('walk'))).toBe(true);

    const jumpResults = MotorCodexService.findRelevant('perform a vertical jump', 1);
    expect(jumpResults.length).toBe(1);
    expect(jumpResults[0].id).toBe('aerial_vertical_jump');

    const nodResults = MotorCodexService.findRelevant('nod your head in agreement', 1);
    expect(nodResults.length).toBe(1);
    expect(nodResults[0].id).toBe('expressive_head_nod_yes');

    const bowResults = MotorCodexService.findRelevant('bow respectfully', 1);
    expect(bowResults.length).toBe(1);
    expect(bowResults[0].id).toBe('expressive_respectful_bow');
  });

  test('PromptAssembler injects Motor Codex segment when enabled and hints exist', () => {
    const hints = MotorCodexService.findRelevant('walk forward', 1);
    const payload = {
      agent_id: 'agent_0',
      use_action_dictionary: true,
      motor_codex_hints: MotorCodexService.formatForPrompt(hints),
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
    const hints = MotorCodexService.findRelevant('walk forward', 1);
    const payload = {
      agent_id: 'agent_0',
      use_action_dictionary: false,
      motor_codex_hints: MotorCodexService.formatForPrompt(hints),
      directive_mode: 'training',
      current_goal: 'Walk forward to the table',
    };

    const assembled = PromptAssembler.build(payload);
    expect(assembled.systemPrompt).not.toContain('== MOTION GUIDE MANUAL');
    const p11 = assembled.segments.find((s) => s.id === 'P11');
    expect(p11).toBeUndefined();
  });
});
