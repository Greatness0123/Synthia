import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AgentIdentity {
  agent_id: string;
  name: string;
  beliefs: any[];
  traits: Record<string, any>;
  window_started_at: string | null;
  edit_count_window: number;
  updated_at: string;
}

export interface IdentityUpdate {
  field: 'name' | 'beliefs' | 'traits';
  new_value: any;
  reason?: string;
}

export interface IdentityApplyResult {
  ok: boolean;
  identity?: AgentIdentity;
  rejection?: string;
}

const RATE_LIMIT_WINDOW_MS = 300_000; // 5 minutes
const MAX_EDITS_PER_WINDOW = 1;

const DEFAULT_IDENTITY: AgentIdentity = {
  agent_id: '',
  name: '',
  beliefs: [],
  traits: {},
  window_started_at: null,
  edit_count_window: 0,
  updated_at: '',
};

export class IdentityManager {
  private supabase: SupabaseClient | null = null;
  private mockStore: Map<string, AgentIdentity> = new Map();
  private mockLog: Array<{ agent_id: string; field: string; old_value: any; new_value: any; reason: string; created_at: string }> = [];

  constructor(supabaseUrl: string, supabaseKey: string) {
    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      console.log('[IdentityManager] Supabase client created');
    } else {
      console.warn('[IdentityManager] Supabase not configured — using in-memory mock store');
    }
  }

  async ensureIdentity(agentId: string): Promise<AgentIdentity> {
    if (!this.supabase) {
      const existing = this.mockStore.get(agentId);
      if (existing) return existing;
      const defaults = { ...DEFAULT_IDENTITY, agent_id: agentId, name: agentId, updated_at: new Date().toISOString() };
      this.mockStore.set(agentId, defaults);
      return defaults;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data, error } = await this.supabase
      .from('agent_identity')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (data) return data as AgentIdentity;

    const defaults: AgentIdentity = {
      agent_id: agentId,
      name: agentId,
      beliefs: [],
      traits: {},
      window_started_at: null,
      edit_count_window: 0,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await this.supabase
      .from('agent_identity')
      .upsert(defaults, { onConflict: 'agent_id' });

    if (upsertError) {
      console.error(`[IdentityManager] ensureIdentity upsert failed for ${agentId}:`, upsertError.message);
    }

    return defaults;
  }

  async applyIdentityUpdate(agentId: string, update: IdentityUpdate): Promise<IdentityApplyResult> {
    if (!update.reason || update.reason.trim().length === 0) {
      return { ok: false, rejection: 'missing_reason' };
    }

    const identity = await this.ensureIdentity(agentId);
    const now = new Date();
    const nowISO = now.toISOString();
    const windowStart = identity.window_started_at ? new Date(identity.window_started_at).getTime() : 0;
    const withinWindow = identity.window_started_at && (now.getTime() - windowStart) < RATE_LIMIT_WINDOW_MS;

    if (withinWindow && identity.edit_count_window >= MAX_EDITS_PER_WINDOW) {
      return { ok: false, rejection: 'rate_limited', identity };
    }

    if (update.field === 'beliefs') {
      const enforced = this.enforceBeliefsOp(update.new_value);
      if (!enforced.ok) {
        return { ok: false, rejection: enforced.reason, identity };
      }
      update = { ...update, new_value: enforced.value };
    }

    let oldValue: any;
    let newValue: any;

    if (update.field === 'name' || update.field === 'traits') {
      oldValue = identity[update.field];
      newValue = update.new_value;
    } else if (update.field === 'beliefs') {
      oldValue = JSON.parse(JSON.stringify(identity.beliefs));
      newValue = this.applyBeliefsUpdate(identity.beliefs, update.new_value);
    } else {
      return { ok: false, rejection: 'unknown_field', identity };
    }

    const newWindowStarted = withinWindow ? identity.window_started_at : nowISO;
    const newEditCount = withinWindow ? identity.edit_count_window + 1 : 1;

    if (!this.supabase) {
      const updated = {
        ...identity,
        [update.field]: newValue,
        window_started_at: newWindowStarted,
        edit_count_window: newEditCount,
        updated_at: nowISO,
      };
      this.mockStore.set(agentId, updated);
      this.mockLog.push({
        agent_id: agentId,
        field: update.field,
        old_value: oldValue,
        new_value: update.field === 'beliefs' ? update.new_value : newValue,
        reason: update.reason!,
        created_at: nowISO,
      });
      return { ok: true, identity: updated };
    }

    const { error: updateError } = await this.supabase
      .from('agent_identity')
      .update({
        [update.field]: newValue,
        window_started_at: newWindowStarted,
        edit_count_window: newEditCount,
        updated_at: nowISO,
      })
      .eq('agent_id', agentId);

    if (updateError) {
      console.error(`[IdentityManager] update failed for ${agentId}:`, updateError.message);
      return { ok: false, rejection: 'update_failed', identity };
    }

    const { error: logError } = await this.supabase
      .from('agent_identity_log')
      .insert({
        agent_id: agentId,
        field: update.field,
        old_value: oldValue,
        new_value: update.field === 'beliefs' ? update.new_value : newValue,
        reason: update.reason!,
        created_at: nowISO,
      });

    if (logError) {
      console.error(`[IdentityManager] log insert failed for ${agentId}:`, logError.message);
      return { ok: false, rejection: 'log_insert_failed' };
    }

    const updatedIdentity = {
      ...identity,
      [update.field]: newValue,
      window_started_at: newWindowStarted,
      edit_count_window: newEditCount,
      updated_at: nowISO,
    };

    return { ok: true, identity: updatedIdentity };
  }

  private enforceBeliefsOp(value: any): { ok: boolean; value?: any; reason?: string } {
    if (!value || typeof value !== 'object') {
      return { ok: false, reason: 'malformed_beliefs_op' };
    }

    const { op } = value;

    if (op === 'append') {
      if (typeof value.entry !== 'string') {
        return { ok: false, reason: 'malformed_beliefs_op' };
      }
      return { ok: true, value: { op: 'append', entry: value.entry } };
    }

    if (op === 'modify') {
      if (typeof value.entry !== 'string') {
        return { ok: false, reason: 'malformed_beliefs_op' };
      }
      if (typeof value.index !== 'number' || value.index < 0) {
        return { ok: false, reason: 'malformed_beliefs_op' };
      }
      return { ok: true, value: { op: 'modify', index: value.index, entry: value.entry } };
    }

    return { ok: false, reason: 'malformed_beliefs_op' };
  }

  private applyBeliefsUpdate(beliefs: any[], updateOp: any): any[] {
    const copy = [...beliefs];
    if (updateOp.op === 'append') {
      copy.push(updateOp.entry);
    } else if (updateOp.op === 'modify') {
      if (updateOp.index < copy.length) {
        copy[updateOp.index] = updateOp.entry;
      } else {
        copy.push(updateOp.entry);
      }
    }
    return copy;
  }

  getMockStore(): Map<string, AgentIdentity> {
    return this.mockStore;
  }

  getMockLog(): Array<{ agent_id: string; field: string; old_value: any; new_value: any; reason: string; created_at: string }> {
    return this.mockLog;
  }
}

export const createIdentityManager = (supabaseUrl: string, supabaseKey: string) =>
  new IdentityManager(supabaseUrl, supabaseKey);
