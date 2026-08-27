import { PromptAssembler } from '../PromptAssembler';

describe('PromptAssembler', () => {
  const basePayload = {
    agent_id: 'agent_0',
    body_type: 'humanoid',
    heartbeat: 42,
    light_state: 'day',
    valid_joints: ['mixamorighead', 'mixamorigleftarm', 'mixamorigrightarm'],
    objects_in_world: [{ name: 'red_cube', type: 'cube' }],
    identity: {
      name: 'Echo',
      beliefs: ['I observe physical dynamics.'],
      traits: { curiosity: 0.85 },
    },
    upright_preset: { arms_down_angle_deg: 75 },
    directive_mode: 'free_will',
  };

  test('assembles structured system prompt with cacheable prefix before dynamic suffix', () => {
    const assembled = PromptAssembler.build(basePayload);
    expect(assembled.systemPrompt).toBeDefined();
    expect(assembled.segments.length).toBeGreaterThan(5);

    // Verify cacheable prefix tokens are calculated
    expect(assembled.cacheablePrefixTokens).toBeGreaterThan(0);
    expect(assembled.totalTokenEstimate).toBeGreaterThan(assembled.cacheablePrefixTokens);

    // Check segment ordering: P01 Core Identity must come before dynamic segments
    const p01Index = assembled.segments.findIndex(s => s.id === 'P01');
    const p12Index = assembled.segments.findIndex(s => s.id === 'P12');
    expect(p01Index).toBeLessThan(p12Index);
  });

  test('correctly names the platform SYNTHIA while identifying the specific agent', () => {
    const assembled = PromptAssembler.build(basePayload);
    expect(assembled.systemPrompt).toContain('You are Echo');
    expect(assembled.systemPrompt).toContain('SYNTHIA physical simulation platform');
  });

  test('does not contain artificial skill ladder rungs', () => {
    const assembled = PromptAssembler.build(basePayload);
    expect(assembled.systemPrompt).not.toContain('Your skill rung is');
    expect(assembled.systemPrompt).not.toContain('== SKILL PROGRESSION ==');
    expect(assembled.systemPrompt).not.toContain('Rung 0: Static Balance');
  });

  test('supports deliberation and empty motor actions in free-will mode', () => {
    const assembled = PromptAssembler.build(basePayload);
    expect(assembled.systemPrompt).toContain('DELIBERATION & FREEDOM');
    expect(assembled.systemPrompt).toContain('"actions": { "program_sequence": [], "joint_overrides": {} }');
    expect(assembled.systemPrompt).not.toContain('EVERY response MUST include motor actions — there is no valid reason to output an empty program_sequence');
  });

  test('includes reset_pose in program_sequence recovery instructions', () => {
    const assembled = PromptAssembler.build(basePayload);
    expect(assembled.systemPrompt).toContain('reset_pose');
    expect(assembled.systemPrompt).toContain('safely restores you to an upright standing pose in-place');
  });

  test('switches to training directive when directive_mode is training', () => {
    const trainingPayload = {
      ...basePayload,
      directive_mode: 'training',
      current_goal: 'Reach for the red sphere',
    };
    const assembled = PromptAssembler.build(trainingPayload);
    expect(assembled.systemPrompt).toContain('== DIRECTIVE: TRAINING MODE ==');
    expect(assembled.systemPrompt).toContain('Goal: Reach for the red sphere');
    expect(assembled.systemPrompt).not.toContain('== DIRECTIVE: FREE WILL MODE ==');
  });
});
