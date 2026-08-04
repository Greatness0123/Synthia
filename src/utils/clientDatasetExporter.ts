import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { ExportConfig } from '../types/export';

// Simple function to trigger browser download of a Blob
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function runClientSideExport(
  config: ExportConfig,
  supabaseUrl: string,
  supabaseKey: string,
  onProgress: (percent: number) => void
): Promise<void> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials are required for export.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  onProgress(5);

  // 1. Gather memories
  let query = supabase.from('memories').select('*').in('agent_id', config.agentIds);

  if (config.scope === 'date_range') {
    if (config.dateFrom) query = query.gte('created_at', config.dateFrom);
    if (config.dateTo) query = query.lte('created_at', config.dateTo);
  } else if (config.scope === 'session') {
    if (config.sessionIds && config.sessionIds.length > 0) {
      query = query.in('session_id', config.sessionIds);
    }
  } else if (config.scope === 'heartbeat_range') {
    if (config.heartbeatFrom !== undefined) query = query.gte('heartbeat', config.heartbeatFrom);
    if (config.heartbeatTo !== undefined) query = query.lte('heartbeat', config.heartbeatTo);
  }

  if (config.includeTiers && config.includeTiers.length > 0) {
    query = query.in('tier', config.includeTiers);
  }
  if (config.excludeInjected) {
    query = query.not('injected', 'eq', true);
  }
  if (config.successfulOnly) {
    query = query.neq('outcome', 'failure');
  }
  if (config.minReward !== undefined) {
    query = query.gte('reward_signal', config.minReward);
  }

  const { data: memories, error: memoriesError } = await query.order('created_at', { ascending: true });
  if (memoriesError) {
    throw new Error(`Database error fetching memories: ${memoriesError.message}`);
  }
  if (!memories || memories.length === 0) {
    throw new Error('No memories found matching criteria');
  }

  onProgress(40);

  // Fetch session meta if session_full is chosen
  let sessionsMeta: any[] = [];
  let skillsMeta: any[] = [];
  if (config.exportType === 'session_full') {
    const sessionIds = [...new Set(memories.map((m) => m.session_id))].filter(Boolean);
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .in('id', sessionIds);
      if (sessions) sessionsMeta = sessions;
    }

    const { data: skills } = await supabase
      .from('skills')
      .select('*')
      .in('agent_id', config.agentIds);
    if (skills) skillsMeta = skills;
  }

  onProgress(60);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `synthia_export_${config.exportType}_${timestamp}`;

  // 2. Perform formatting based on ExportType
  if (config.exportType === 'dataset') {
    const format = config.format || 'CSV';

    if (config.zipPerAgent && config.agentIds.length > 1) {
      // Create a ZIP containing a folder per agent
      const zip = new JSZip();

      // Group memories by agent
      const agentGroups: Record<string, any[]> = {};
      config.agentIds.forEach((id) => {
        agentGroups[id] = memories.filter((m) => m.agent_id === id);
      });

      Object.entries(agentGroups).forEach(([agentId, agentMemories]) => {
        if (agentMemories.length === 0) return;

        if (format === 'CSV') {
          const csvContent = formatCSV(agentMemories);
          zip.file(`${agentId}/export.csv`, csvContent);
        } else {
          const jsonlContent = formatJSONL(agentMemories);
          zip.file(`${agentId}/data.jsonl`, jsonlContent);
        }
      });

      onProgress(85);
      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownload(content, `${baseFilename}.zip`);
    } else {
      // Download single file directly
      if (format === 'CSV') {
        const csvContent = formatCSV(memories);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `${baseFilename}.csv`);
      } else {
        const jsonlContent = formatJSONL(memories);
        const blob = new Blob([jsonlContent], { type: 'application/x-jsonlines;charset=utf-8;' });
        triggerDownload(blob, `${baseFilename}.jsonl`);
      }
    }
  } else if (config.exportType === 'thoughts_report') {
    const reportContent = formatThoughtsReport(memories);

    if (config.zipPerAgent && config.agentIds.length > 1) {
      const zip = new JSZip();
      const agentGroups: Record<string, any[]> = {};
      config.agentIds.forEach((id) => {
        agentGroups[id] = memories.filter((m) => m.agent_id === id);
      });

      Object.entries(agentGroups).forEach(([agentId, agentMemories]) => {
        if (agentMemories.length === 0) return;
        const agentReport = formatThoughtsReport(agentMemories);
        zip.file(`${agentId}/thoughts_report.md`, agentReport);
      });

      onProgress(85);
      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownload(content, `${baseFilename}.zip`);
    } else {
      const blob = new Blob([reportContent], { type: 'text/markdown;charset=utf-8;' });
      triggerDownload(blob, `${baseFilename}.md`);
    }
  } else if (config.exportType === 'session_full') {
    const sessionFullData = {
      export_metadata: {
        exported_at: new Date().toISOString(),
        scoping: config.scope,
        agent_ids: config.agentIds,
      },
      sessions: sessionsMeta,
      memories: memories.map(m => ({
        ...m,
        // Strip binary frame data to keep JSON export lightweight
        frame_buffer: undefined
      })),
      skills: skillsMeta,
    };

    if (config.zipPerAgent && config.agentIds.length > 1) {
      const zip = new JSZip();
      const agentGroups: Record<string, any[]> = {};
      config.agentIds.forEach((id) => {
        agentGroups[id] = memories.filter((m) => m.agent_id === id);
      });

      Object.entries(agentGroups).forEach(([agentId, agentMemories]) => {
        const agentSessions = sessionsMeta.filter((s) => s.agent_id === agentId);
        const agentSkills = skillsMeta.filter((sk) => sk.agent_id === agentId);

        const agentData = {
          export_metadata: {
            exported_at: new Date().toISOString(),
            agent_id: agentId,
          },
          sessions: agentSessions,
          memories: agentMemories.map(m => ({ ...m, frame_buffer: undefined })),
          skills: agentSkills,
        };

        zip.file(`${agentId}/session_full.json`, JSON.stringify(agentData, null, 2));
      });

      onProgress(85);
      const content = await zip.generateAsync({ type: 'blob' });
      triggerDownload(content, `${baseFilename}.zip`);
    } else {
      const blob = new Blob([JSON.stringify(sessionFullData, null, 2)], { type: 'application/json;charset=utf-8;' });
      triggerDownload(blob, `${baseFilename}.json`);
    }
  }

  onProgress(100);
}

// Helper: CSV Format
function formatCSV(memories: any[]): string {
  const header = 'agent_id,heartbeat,tier,thought,action_json,outcome,reward,session_id\n';
  const rows = memories.map((m) => {
    const actionJson = JSON.stringify(m.action_taken || {}).replace(/"/g, '""');
    const thought = (m.thought || '').replace(/"/g, '""');
    const outcome = m.outcome || '';
    const agentId = m.agent_id || 'agent_0';
    return `${agentId},${m.heartbeat},${m.tier},"${thought}","${actionJson}",${outcome},${m.reward_signal ?? 0},${m.session_id ?? ''}`;
  });
  return header + rows.join('\n');
}

// Helper: JSONL Format
function formatJSONL(memories: any[]): string {
  return memories
    .map((m) => {
      return JSON.stringify({
        agent_id: m.agent_id || 'agent_0',
        session_id: m.session_id ?? null,
        messages: [
          { role: 'system', content: 'You are SYNTHIA, an AI embodiment.' },
          { role: 'user', content: `${m.visual_description || 'Step'} Audio: ${m.audio_state || ''}` },
          {
            role: 'assistant',
            content: `${m.thought || ''}---ACTION---${JSON.stringify({
              actions: m.action_taken,
              memory_write: { tier: m.tier, summary: m.visual_description },
            })}`,
          },
        ],
      });
    })
    .join('\n');
}

// Helper: Thoughts Report format
function formatThoughtsReport(memories: any[]): string {
  const lines: string[] = [];
  lines.push('# SYNTHIA Cognitive Thoughts Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total Memories: ${memories.length}`);
  lines.push('');

  // Group by session
  const sessionGroups = new Map<string, any[]>();
  memories.forEach((m) => {
    const sId = m.session_id || 'unknown';
    if (!sessionGroups.has(sId)) {
      sessionGroups.set(sId, []);
    }
    sessionGroups.get(sId)!.push(m);
  });

  // Table of contents
  lines.push('## Table of Contents');
  lines.push('');
  let sessionIndex = 0;
  for (const [sessionId, sessionMemories] of sessionGroups) {
    sessionIndex++;
    const agentId = sessionMemories[0]?.agent_id || 'agent_0';
    lines.push(`${sessionIndex}. [Session ${sessionId} (${agentId})](#session-${sessionIndex}) — ${sessionMemories.length} memories`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Each session
  sessionIndex = 0;
  for (const [sessionId, sessionMemories] of sessionGroups) {
    sessionIndex++;
    const firstMemory = sessionMemories[0];
    const lastMemory = sessionMemories[sessionMemories.length - 1];
    const agentId = firstMemory?.agent_id || 'agent_0';

    lines.push(`## Session ${sessionIndex} — ${sessionId} [Agent: ${agentId}]`);
    lines.push('');
    lines.push(`- **Heartbeats:** ${firstMemory.heartbeat} → ${lastMemory.heartbeat}`);
    lines.push(`- **Memories:** ${sessionMemories.length}`);
    lines.push(`- **Started:** ${firstMemory.created_at || 'N/A'}`);
    lines.push('');

    // Tier breakdown
    const tier1 = sessionMemories.filter((m) => m.tier === 1);
    const tier2 = sessionMemories.filter((m) => m.tier === 2);
    const tier3 = sessionMemories.filter((m) => m.tier === 3);
    lines.push('**Tier Breakdown:**');
    lines.push(`- Tier 1 (Working): ${tier1.length}`);
    lines.push(`- Tier 2 (Episodic): ${tier2.length}`);
    lines.push(`- Tier 3 (Long-term): ${tier3.length}`);
    lines.push('');

    // Memories
    for (const m of sessionMemories) {
      lines.push(`### Heartbeat ${m.heartbeat} — Tier ${m.tier} [Agent: ${m.agent_id || 'agent_0'}]`);
      lines.push('');
      lines.push(`**Thought:**`);
      lines.push('');
      lines.push(`> ${m.thought || '(no thought)'}`);
      lines.push('');
      if (m.visual_description) {
        lines.push(`**Visual:** ${m.visual_description}`);
      }
      if (m.outcome) {
        lines.push(`**Outcome:** ${m.outcome}`);
      }
      if (m.reward_signal !== undefined && m.reward_signal !== null) {
        lines.push(`**Reward:** ${m.reward_signal.toFixed(2)}`);
      }
      if (m.goal_at_time) {
        lines.push(`**Goal:** ${m.goal_at_time}`);
      }
      if (m.injected) {
        lines.push(`**Injected:** Yes`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // Summary stats
  lines.push('## Summary Statistics');
  lines.push('');
  const avgReward = memories.reduce((sum, m) => sum + (m.reward_signal || 0), 0) / memories.length;
  const successes = memories.filter((m) => m.outcome && !m.outcome.includes('fail')).length;
  lines.push(`- **Average Reward:** ${avgReward.toFixed(3)}`);
  lines.push(`- **Success Rate:** ${((successes / memories.length) * 100).toFixed(1)}%`);
  lines.push(`- **Injected Memories:** ${memories.filter((m) => m.injected).length}`);
  lines.push('');

  return lines.join('\n');
}
