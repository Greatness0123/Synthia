import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { useAgentRuntimeStore } from '../../store/agentRuntimeStore';
import { createClient } from '@supabase/supabase-js';

/**
 * Custom hook to run client-side Supabase keepalive pings.
 * Querying Supabase every 24 hours prevents Free-tier projects from pausing (7-day pause threshold).
 */
export function useSupabaseKeepalive() {
  const connStore = useConnectionStore();
  const rtStore = useAgentRuntimeStore();
  const lastPingTimes = useRef<Map<string, number>>(new Map());

  // 24 hours interval
  const PING_INTERVAL_MS = 24 * 60 * 60 * 1000;

  useEffect(() => {
    // Collect all unique supabase configs
    const configs: { url: string; key: string }[] = [];
    const seenUrls = new Set<string>();

    // Global config
    if (connStore.supabaseUrl && connStore.supabaseKey) {
      const url = connStore.supabaseUrl.trim();
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        configs.push({ url, key: connStore.supabaseKey.trim() });
      }
    }

    // Per-agent configs
    Object.keys(rtStore.configs).forEach((agentId) => {
      const rt = rtStore.configs[agentId];
      if (rt.supabaseUrl && rt.supabaseKey) {
        const url = rt.supabaseUrl.trim();
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          configs.push({ url, key: rt.supabaseKey.trim() });
        }
      }
    });

    // Run keepalive ping for each unique config
    configs.forEach(({ url, key }) => {
      const now = Date.now();
      const lastPing = lastPingTimes.current.get(url) || 0;

      if (now - lastPing >= PING_INTERVAL_MS) {
        lastPingTimes.current.set(url, now);

        console.log(`[Supabase Keepalive] Triggering ping to prevent pause for ${url}...`);
        const supabase = createClient(url, key);
        (async () => {
          try {
            const { error } = await supabase.from('sessions').select('id').limit(1);
            if (error) {
              console.error(`[Supabase Keepalive] Ping failed for ${url}:`, error.message);
            } else {
              console.log(`[Supabase Keepalive] Ping successful for ${url}`);
            }
          } catch (err: any) {
            console.error(`[Supabase Keepalive] Exception during ping for ${url}:`, err);
          }
        })();
      }
    });
  }, [connStore.supabaseUrl, connStore.supabaseKey, rtStore.configs]);
}
