-- ============================================================
-- SYNTHIA v2 Additive Migration
-- Safe to run on existing v1 databases
-- ============================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Schema metadata (tracks which migrations have been applied)
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE schema_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read schema_meta" ON schema_meta;
CREATE POLICY "Allow anon read schema_meta"
  ON schema_meta
  FOR SELECT
  USING (true);

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '2.0.0')
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 3. Memories: add frame_storage_path column for private bucket signed URLs
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS frame_storage_path TEXT;

-- 4. HNSW vector index (cosine distance, works on empty tables)
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Standard indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_memories_agent_tier_hb
  ON memories (agent_id, tier, heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_memories_session_id
  ON memories (session_id);
CREATE INDEX IF NOT EXISTS idx_memories_agent_created
  ON memories (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_started
  ON sessions (agent_id, started_at DESC);

-- 6. match_memories: drop old 3-arg signature, create new 4-arg with cosine operator
DROP FUNCTION IF EXISTS match_memories(vector(384), text, int);

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(384),
  match_agent_id text,
  match_count int DEFAULT 5,
  match_tiers int[] DEFAULT ARRAY[1, 2]
)
RETURNS TABLE (
  id uuid,
  memory_id text,
  heartbeat int,
  tier int,
  visual_description text,
  audio_state jsonb,
  thought text,
  action_taken jsonb,
  outcome text,
  reward_signal float,
  goal_at_time text,
  light_state text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    memory_id,
    heartbeat,
    tier,
    visual_description,
    audio_state,
    thought,
    action_taken,
    outcome,
    reward_signal,
    goal_at_time,
    light_state,
    1 - (embedding <=> query_embedding) AS similarity
  FROM memories
  WHERE agent_id = match_agent_id
    AND tier = ANY(match_tiers)
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 7. Session stats trigger (eliminates app read-modify-write round-trips)
CREATE OR REPLACE FUNCTION update_session_stats_on_memory_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    UPDATE sessions
    SET memory_count = memory_count + 1,
        estimated_size_bytes = estimated_size_bytes +
          COALESCE(
            length(NEW.thought) * 2 +
            COALESCE(length(NEW.visual_description) * 2, 0) +
            COALESCE(length(NEW.joint_state_summary::text) * 2, 0) +
            COALESCE(length(NEW.action_taken::text) * 2, 0),
            2048
          ),
        total_heartbeats = GREATEST(total_heartbeats, NEW.heartbeat)
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_insert_session_stats ON memories;
CREATE TRIGGER trg_memory_insert_session_stats
  AFTER INSERT ON memories
  FOR EACH ROW
  EXECUTE FUNCTION update_session_stats_on_memory_insert();

-- 8. Identity auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_identity_updated_at ON agent_identity;
CREATE TRIGGER trg_agent_identity_updated_at
  BEFORE UPDATE ON agent_identity
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 9. Storage buckets
-- Attempt via SQL; if this fails on your project version, create manually:
--   Storage -> New Bucket -> synthia-frames (private)
--   Storage -> New Bucket -> synthia-models (private)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('synthia-frames', 'synthia-frames', false, 5242880,
          ARRAY['image/webp', 'image/png', 'image/jpeg'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create synthia-frames bucket via SQL. Create it manually in Storage -> New Bucket.';
END $$;

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('synthia-models', 'synthia-models', false, 52428800,
          ARRAY['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create synthia-models bucket via SQL. Create it manually in Storage -> New Bucket.';
END $$;

-- 10. Storage object policies (explicit anon role for browser app)
CREATE POLICY "Allow anon frame uploads"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'synthia-frames');

CREATE POLICY "Allow anon frame reads"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'synthia-frames');

CREATE POLICY "Allow anon frame updates"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'synthia-frames');

CREATE POLICY "Allow anon frame deletes"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'synthia-frames');

CREATE POLICY "Allow anon model uploads"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'synthia-models');

CREATE POLICY "Allow anon model reads"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'synthia-models');

CREATE POLICY "Allow anon model deletes"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'synthia-models');

-- 11. Prune old memories (server-side, agent-scoped, returns counts)
CREATE OR REPLACE FUNCTION prune_old_memories(
  p_agent_id text,
  p_keep_recent_sessions int DEFAULT 2,
  p_t3_threshold int DEFAULT 2,
  p_t2_threshold int DEFAULT 20
)
RETURNS TABLE (deleted_t3 bigint, deleted_t2 bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_t3 bigint := 0;
  v_deleted_t2 bigint := 0;
BEGIN
  IF p_agent_id IS NULL OR p_agent_id = '' THEN
    RAISE EXCEPTION 'p_agent_id is required';
  END IF;

  DELETE FROM memories
  WHERE tier = 3
    AND agent_id = p_agent_id
    AND session_id IN (
      SELECT id FROM sessions
      WHERE agent_id = p_agent_id
      ORDER BY started_at DESC
      OFFSET p_t3_threshold
    );

  GET DIAGNOSTICS v_deleted_t3 = ROW_COUNT;

  DELETE FROM memories
  WHERE tier = 2
    AND agent_id = p_agent_id
    AND session_id IN (
      SELECT id FROM sessions
      WHERE agent_id = p_agent_id
      ORDER BY started_at DESC
      OFFSET p_t2_threshold
    );

  GET DIAGNOSTICS v_deleted_t2 = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_t3, v_deleted_t2;
END;
$$;
