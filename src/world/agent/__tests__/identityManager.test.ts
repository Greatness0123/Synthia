import { IdentityManager } from '../identityManager';

function makeManager(): IdentityManager {
  return new IdentityManager('', '');
}

describe('IdentityManager', () => {
  let manager: IdentityManager;

  beforeEach(() => {
    manager = makeManager();
  });

  test('fresh agent gets a default identity record', async () => {
    const identity = await manager.ensureIdentity('agent_0');
    expect(identity).toBeDefined();
    expect(identity.agent_id).toBe('agent_0');
    expect(identity.name).toBe('agent_0');
    expect(identity.beliefs).toEqual([]);
    expect(identity.traits).toEqual({});
    expect(identity.edit_count_window).toBe(0);
    expect(identity.window_started_at).toBeNull();
  });

  test('valid edit succeeds and writes a log entry', async () => {
    const result = await manager.applyIdentityUpdate('agent_0', {
      field: 'name',
      new_value: 'Echo',
      reason: 'Self-naming during first interaction',
    });
    expect(result.ok).toBe(true);
    expect(result.identity).toBeDefined();
    expect(result.identity!.name).toBe('Echo');

    const log = manager.getMockLog();
    expect(log.length).toBe(1);
    expect(log[0].agent_id).toBe('agent_0');
    expect(log[0].field).toBe('name');
    expect(log[0].old_value).toBe('agent_0');
    expect(log[0].new_value).toBe('Echo');
    expect(log[0].reason).toBe('Self-naming during first interaction');
  });

  test('edit without reason is rejected', async () => {
    const result = await manager.applyIdentityUpdate('agent_0', {
      field: 'name',
      new_value: 'Echo',
      reason: '',
    });
    expect(result.ok).toBe(false);
    expect(result.rejection).toBe('missing_reason');
    expect(manager.getMockLog().length).toBe(0);
  });

  test('edit inside the 5-min window is rejected with rate_limit', async () => {
    const result1 = await manager.applyIdentityUpdate('agent_0', {
      field: 'name',
      new_value: 'Echo',
      reason: 'First edit',
    });
    expect(result1.ok).toBe(true);

    const result2 = await manager.applyIdentityUpdate('agent_0', {
      field: 'name',
      new_value: 'Echo-2',
      reason: 'Second edit within window',
    });
    expect(result2.ok).toBe(false);
    expect(result2.rejection).toBe('rate_limited');
  });

  test('beliefs append succeeds, raw replacement is rejected', async () => {
    const badResult = await manager.applyIdentityUpdate('agent_0', {
      field: 'beliefs',
      new_value: ['completely replaced'],
      reason: 'Trying to replace entire beliefs array',
    });
    expect(badResult.ok).toBe(false);
    expect(badResult.rejection).toBe('malformed_beliefs_op');

    const result = await manager.applyIdentityUpdate('agent_0', {
      field: 'beliefs',
      new_value: { op: 'append', entry: 'The world is round' },
      reason: 'Learning about geography',
    });
    expect(result.ok).toBe(true);
    expect(result.identity!.beliefs).toEqual(['The world is round']);
  });
});
