import { getSupabaseClient } from './supabaseClient';

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  schemaVersion?: string;
}

/**
 * Test a Supabase connection: runs a lightweight query and checks schema version.
 * Returns ok/error plus the detected schema version (null = v1, '2.0.0' = v2+).
 */
export async function testSupabaseConnection(url: string, key: string): Promise<ConnectionTestResult> {
  const client = getSupabaseClient(url, key);
  if (!client) return { ok: false, error: 'Missing URL or key' };

  const start = performance.now();
  try {
    const { error } = await client.from('sessions').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        error: error.message,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    let schemaVersion: string | undefined;
    try {
      const { data } = await client
        .from('schema_meta')
        .select('value')
        .eq('key', 'schema_version')
        .single();
      schemaVersion = data?.value;
    } catch {
      // v1 schema, no schema_meta table exists
    }

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - start),
      schemaVersion,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      latencyMs: Math.round(performance.now() - start),
    };
  }
}
