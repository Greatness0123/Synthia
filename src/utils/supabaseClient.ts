import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const clients = new Map<string, SupabaseClient>();

/**
 * Returns a memoized Supabase client for the given URL + key pair.
 * One client per unique (url, key) combination. Returns null if either is empty.
 */
export function getSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null;
  const cacheKey = `${url}::${key}`;
  if (clients.has(cacheKey)) return clients.get(cacheKey)!;
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 1 },
    },
  });
  clients.set(cacheKey, client);
  return client;
}
