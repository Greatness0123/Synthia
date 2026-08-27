import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../utils/supabaseClient';
import { SUPABASE_BUCKETS } from '../../constants/supabase';
import { embeddingEngine } from './embeddingEngine';

export interface MemoryEntry {
  memory_id: string;
  heartbeat: number;
  day_cycle: number;
  light_state: 'day' | 'night';
  tier: 1 | 2 | 3;
  visual_description: string;
  audio_state: string;
  joint_state_summary: string;
  self_questions: any;
  thought: string;
  action_taken: any;
  outcome: string;
  reward_signal: number;
  goal_at_time: string;
  injected: boolean;
  session_id: string;
  frame_buffer?: Uint8Array;
}

export class MemoryManager {
  private supabase: SupabaseClient | null = null;
  private mockStore: any[] = [];
  private ensuredSessions: Set<string> = new Set();
  private frameBucketMissing = false;
  private schemaVersion: string | null = null;

  private static readonly MOCK_STORE_LIMIT = 1000;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = getSupabaseClient(supabaseUrl, supabaseKey);
    if (this.supabase) {
      console.log('[MemoryManager] Supabase client created (shared singleton)');
      this.detectSchemaVersion();
    } else {
      console.warn('[MemoryManager] Supabase not configured — using client-side in-memory mock store. Memories will not persist.');
    }
  }

  /**
   * Detect schema version from schema_meta table.
   * null = v1 (no schema_meta), '2.0.0' = v2+
   */
  private async detectSchemaVersion(): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data } = await this.supabase
        .from('schema_meta')
        .select('value')
        .eq('key', 'schema_version')
        .single();
      this.schemaVersion = data?.value || null;
      if (this.schemaVersion) {
        console.log(`[MemoryManager] Schema version: ${this.schemaVersion}`);
      }
    } catch {
      this.schemaVersion = null; // v1 database
    }
  }

  /** Whether the v2+ schema is deployed (triggers, HNSW index, etc.) */
  get isV2Schema(): boolean {
    return !!this.schemaVersion && this.schemaVersion >= '2.0.0';
  }

  private async ensureSession(sessionId: string, agentId: string, bodyType: string = 'humanoid'): Promise<void> {
    if (!this.supabase || this.ensuredSessions.has(sessionId)) return;

    try {
      const { error } = await this.supabase
        .from('sessions')
        .upsert(
          { id: sessionId, agent_id: agentId, body_type: bodyType },
          { onConflict: 'id', ignoreDuplicates: true }
        );

      if (error) {
        console.error(`[MemoryManager] Failed to ensure session '${sessionId}':`, error.message);
      } else {
        this.ensuredSessions.add(sessionId);
      }
    } catch (err) {
      console.error('[MemoryManager] ensureSession exception:', err);
    }
  }

  /**
   * Legacy session stat update for v1 databases.
   * On v2, the trg_memory_insert_session_stats trigger handles this automatically.
   */
  async updateSessionStats(sessionId: string, agentId: string, heartbeats: number, bodyType: string = 'humanoid'): Promise<void> {
    if (!this.supabase || this.isV2Schema) return; // skip on v2 (trigger handles it)
    try {
      await this.ensureSession(sessionId, agentId, bodyType);
      await this.supabase
        .from('sessions')
        .update({ total_heartbeats: heartbeats })
        .eq('id', sessionId);
    } catch (err) {
      console.error('[MemoryManager] updateSessionStats exception:', err);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase
        .from('sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch (err) {
      console.error('[MemoryManager] endSession exception:', err);
    }
  }

  async write(entry: MemoryEntry, agentId: string): Promise<boolean> {
    try {
      if (!this.supabase) {
        const embedding = await embeddingEngine.embed(entry.thought);
        this.mockStore.push({ ...entry, agent_id: agentId, embedding: Array.from(embedding) });
        // FIFO eviction to prevent unbounded growth
        if (this.mockStore.length > MemoryManager.MOCK_STORE_LIMIT) {
          this.mockStore.splice(0, this.mockStore.length - MemoryManager.MOCK_STORE_LIMIT);
        }
        return true;
      }

      await this.ensureSession(entry.session_id, agentId);

      // Pre-compute frame storage path before insert
      const framePath = `${agentId}/${entry.session_id}/hb_${entry.heartbeat}.webp`;

      const { data, error } = await this.supabase
        .from('memories')
        .insert({
          memory_id: entry.memory_id,
          agent_id: agentId,
          session_id: entry.session_id,
          heartbeat: entry.heartbeat,
          day_cycle: entry.day_cycle,
          light_state: entry.light_state,
          tier: entry.tier,
          visual_description: entry.visual_description,
          audio_state: entry.audio_state,
          joint_state_summary: entry.joint_state_summary,
          self_questions: entry.self_questions,
          thought: entry.thought,
          action_taken: entry.action_taken,
          outcome: entry.outcome,
          reward_signal: entry.reward_signal,
          goal_at_time: entry.goal_at_time,
          injected: entry.injected,
          embedding: null,
          frame_storage_path: framePath,
        })
        .select()
        .single();

      if (error) {
        console.error('[MemoryManager] Supabase insert error:', error.message);
        return false;
      }

      // Fire-and-forget: compute embedding async
      if (data?.id) {
        this.backfillEmbedding(data.id, entry.thought);
      }

      // Fire-and-forget: upload frame to pre-computed path (no post-upload UPDATE needed)
      if (entry.frame_buffer && data?.id) {
        this.uploadFrame(entry.frame_buffer, agentId, entry.session_id, entry.heartbeat);
      }
      return true;
    } catch (err) {
      console.error('[MemoryManager] write() exception:', err);
      return false;
    }
  }

  /**
   * Write with retry for transient errors (network, 5xx, timeout).
   * Schema/key/RLS errors are not retried.
   */
  async writeWithRetry(entry: MemoryEntry, agentId: string, maxAttempts = 3): Promise<boolean> {
    const delays = [500, 1000, 2000];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.write(entry, agentId);
      } catch (err) {
        const msg = String(err);
        const isRetryable = msg.includes('timeout') ||
          msg.includes('network') ||
          msg.includes('fetch') ||
          /5\d\d/.test(msg);
        if (!isRetryable || attempt === maxAttempts - 1) {
          return false;
        }
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
    }
    return false;
  }

  /**
   * Compute embedding async and update the memory row.
   * Does not block the cognitive cycle.
   */
  private backfillEmbedding(memoryId: string, thought: string): void {
    embeddingEngine.embed(thought).then(async (embedding) => {
      if (!this.supabase) return;
      const { error } = await this.supabase
        .from('memories')
        .update({ embedding: Array.from(embedding) })
        .eq('id', memoryId);
      if (error) {
        console.warn('[MemoryManager] Embedding backfill failed:', error.message);
      }
    }).catch((err) => {
      console.warn('[MemoryManager] Embedding backfill exception:', err);
    });
  }

  /**
   * Upload frame to the pre-computed storage path.
   * No post-upload UPDATE needed since frame_storage_path was set on insert.
   */
  private async uploadFrame(buffer: Uint8Array, agentId: string, sessionId: string, heartbeat: number): Promise<void> {
    if (!this.supabase || this.frameBucketMissing) return;
    try {
      const path = `${agentId}/${sessionId}/hb_${heartbeat}.webp`;
      const { error: uploadError } = await this.supabase.storage
        .from(SUPABASE_BUCKETS.FRAMES)
        .upload(path, buffer, { contentType: 'image/webp', upsert: true });

      if (uploadError) {
        const msg = uploadError.message || '';
        if (msg.includes('not found') || msg.includes('The resource was not found')) {
          if (!this.frameBucketMissing) {
            this.frameBucketMissing = true;
            console.warn('[MemoryManager] Storage bucket not found. Create "synthia-frames" in Storage -> New Bucket (private). Frame uploads paused.');
          }
        } else {
          console.error('[MemoryManager] Frame upload error:', msg);
        }
      }
    } catch (err) {
      console.error('[MemoryManager] uploadFrame exception:', err);
    }
  }

  /**
   * Generate a signed URL for a stored frame.
   * Call at display time, not upload time. URL expires in 1 hour.
   */
  async getFrameSignedUrl(frameStoragePath: string): Promise<string | null> {
    if (!this.supabase || !frameStoragePath) return null;
    try {
      const { data, error } = await this.supabase.storage
        .from(SUPABASE_BUCKETS.FRAMES)
        .createSignedUrl(frameStoragePath, 3600);
      if (error) {
        console.warn('[MemoryManager] Signed URL error:', error.message);
        return null;
      }
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  }

  async retrieveRelevant(embedding: Float32Array, agentId: string, limit: number = 5): Promise<any[]> {
    if (!this.supabase) {
      return this.mockStore
        .filter(m => m.agent_id === agentId)
        .slice(-limit);
    }

    const { data, error } = await this.supabase.rpc('match_memories', {
      query_embedding: Array.from(embedding),
      match_agent_id: agentId,
      match_count: limit,
    });

    if (error) {
      console.error('[MemoryManager] retrieveRelevant error:', error.message);
      return [];
    }
    return data || [];
  }

  async retrieveRecent(agentId: string, limit: number = 3): Promise<any[]> {
    if (!this.supabase) {
      return this.mockStore
        .filter(m => m.agent_id === agentId)
        .sort((a, b) => b.heartbeat - a.heartbeat)
        .slice(0, limit);
    }

    const { data, error } = await this.supabase
      .from('memories')
      .select('id, memory_id, heartbeat, tier, visual_description, audio_state, thought, action_taken, outcome, reward_signal, goal_at_time, light_state')
      .eq('agent_id', agentId)
      .order('heartbeat', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[MemoryManager] retrieveRecent error:', error.message);
      return [];
    }
    return data || [];
  }

  /**
   * Prune old memories. On v2, uses server-side RPC (agent-scoped).
   * On v1, falls back to client-side fetch-and-delete.
   */
  async pruneOld(agentId?: string): Promise<void> {
    if (!this.supabase) return;

    // v2: server-side RPC (agent-scoped, returns counts)
    if (this.isV2Schema && agentId) {
      try {
        const { error } = await this.supabase.rpc('prune_old_memories', {
          p_agent_id: agentId,
        });
        if (error) console.warn('[MemoryManager] Server prune error:', error.message);
      } catch (err) {
        console.error('[MemoryManager] Server prune exception:', err);
      }
      return;
    }

    // v1 fallback: client-side fetch-all-and-delete (legacy)
    try {
      const { data: sessions, error: sessionError } = await this.supabase
        .from('sessions')
        .select('id')
        .order('started_at', { ascending: false });

      if (sessionError) throw sessionError;
      if (!sessions || sessions.length === 0) return;

      const sessionIds = sessions.map(s => s.id);

      if (sessionIds.length > 2) {
        const oldSessionsT3 = sessionIds.slice(2);
        await this.supabase
          .from('memories')
          .delete()
          .eq('tier', 3)
          .in('session_id', oldSessionsT3);
      }

      if (sessionIds.length > 20) {
        const oldSessionsT2 = sessionIds.slice(20);
        await this.supabase
          .from('memories')
          .delete()
          .eq('tier', 2)
          .in('session_id', oldSessionsT2);
      }
    } catch (err) {
      console.error('[MemoryManager] pruneOld fallback error:', err);
    }
  }

  async getSessionsWithCounts(agentId: string): Promise<any[]> {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('sessions')
        .select('id, started_at, ended_at, total_heartbeats, body_type, memory_count, estimated_size_bytes')
        .eq('agent_id', agentId)
        .order('started_at', { ascending: false });

      if (error) {
        console.error('[MemoryManager] getSessionsWithCounts error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[MemoryManager] getSessionsWithCounts exception:', err);
      return [];
    }
  }

  async getMasteredSkills(agentId: string): Promise<any[]> {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('skills')
        .select('name, confidence, description, body_type, learned_at_heartbeat')
        .eq('agent_id', agentId);

      if (error) {
        console.error('[MemoryManager] getMasteredSkills error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[MemoryManager] getMasteredSkills exception:', err);
      return [];
    }
  }
}
