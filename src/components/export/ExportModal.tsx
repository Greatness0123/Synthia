/**
 * Modal for exporting simulation data with side-panel preview.
 * Cleaned up in Phase 7 to run client-side with optional local fallback, LeRobot support, and Task Filter.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { useConnectionStore } from '../../store/connectionStore';
import * as Icons from '@phosphor-icons/react';
import { STRINGS } from '../../constants/strings';
import type { ExportFormat, ExportConfig, ExportType } from '../../types/export';
import { synthiaToast } from '../ui/Toast';
import { runClientSideExport } from '../../utils/clientDatasetExporter';
import { createClient } from '@supabase/supabase-js';
import { Panel } from '../ui/Panel';
import { motion, AnimatePresence } from 'framer-motion';

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  total_heartbeats: number;
  body_type: string | null;
  memory_count: number;
  estimated_size_bytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ExportModal: React.FC = () => {
  const { exportModalOpen, setExportModalOpen, exportProgress, setExportProgress } = useUIStore();
  const { supabaseUrl, supabaseKey } = useConnectionStore();
  const { memories, heartbeat, activeAgentId } = useAgentStore();

  const [availableSessions, setAvailableSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Scoping states
  const [exportScope, setExportScope] = useState<'single' | 'all'>('single');
  const [zipPerAgent, setZipPerAgent] = useState(false);

  const [exportType, setExportType] = useState<ExportType>('dataset');
  const [format, setFormat] = useState<ExportFormat>('JSONL');
  const [scope, setScope] = useState<ExportConfig['scope']>('all');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hbFrom, setHbFrom] = useState(0);
  const [hbTo, setHbTo] = useState(heartbeat);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  const [includeTiers, setIncludeTiers] = useState<number[]>([1, 2, 3]);
  const [includeThoughts, setIncludeThoughts] = useState(true);
  const [includeSkills, setIncludeSkills] = useState(true);
  const [includeMotorPrograms, setIncludeMotorPrograms] = useState(true);
  const [excludeInjected, setExcludeInjected] = useState(false);
  const [successfulOnly, setSuccessfulOnly] = useState(false);
  const [tierInfoOpen, setTierInfoOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Keep hbTo updated as simulation goes forward
  useEffect(() => {
    if (!isExporting) {
      setHbTo(heartbeat);
    }
  }, [heartbeat, isExporting]);

  // Fetch sessions directly from Supabase if configured
  useEffect(() => {
    if (!exportModalOpen || !supabaseUrl || !supabaseKey) {
      setAvailableSessions([]);
      return;
    }
    setSessionsLoading(true);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const targetAgentIds = exportScope === 'single'
      ? [activeAgentId]
      : Object.keys(useAgentStore.getState().agents);

    (async () => {
      try {
        const { data, error } = await supabase.from('sessions')
          .select('*')
          .in('agent_id', targetAgentIds)
          .order('started_at', { ascending: false });

        if (!error && data) {
          setAvailableSessions(data);
        }
      } catch (err) {
        console.error('[ExportModal] Fetch sessions exception:', err);
      } finally {
        setSessionsLoading(false);
      }
    })();
  }, [exportModalOpen, supabaseUrl, supabaseKey, activeAgentId, exportScope]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setExportModalOpen]);

  useEffect(() => {
    if (exportScope === 'all' && scope === 'session') {
      setScope('all');
    }
  }, [exportScope, scope]);

  // Dynamically resolve memories across targeted agents for real-time preview
  const targetedMemories = useMemo(() => {
    if (exportScope === 'single') {
      return memories;
    }
    const allAgents = Object.values(useAgentStore.getState().agents);
    return allAgents.flatMap(a => a.memories || []);
  }, [memories, exportScope, exportModalOpen]);

  // Extract unique tasks across targeted memories
  const availableTasks = useMemo(() => {
    const tasks = new Set<string>();
    targetedMemories.forEach(m => {
      if (m.goalAtTime) tasks.add(m.goalAtTime);
    });
    return Array.from(tasks);
  }, [targetedMemories]);

  const filteredCount = useMemo(() => {
    let filtered = targetedMemories.filter(memory => includeTiers.includes(memory.tier));
    if (excludeInjected) filtered = filtered.filter(memory => !memory.isInjected);
    if (successfulOnly) filtered = filtered.filter(memory => (memory.rewardSignal || 0) > 0.5);
    if (selectedTasks.length > 0) {
      filtered = filtered.filter(memory => memory.goalAtTime && selectedTasks.includes(memory.goalAtTime));
    }
    if (scope === 'heartbeat_range') {
      filtered = filtered.filter(memory => memory.heartbeat >= hbFrom && memory.heartbeat <= hbTo);
    } else if (scope === 'session' && selectedSessions.length > 0) {
      filtered = filtered.filter((memory) => selectedSessions.includes(memory.sessionId || ''));
    }
    return filtered.length;
  }, [targetedMemories, includeTiers, excludeInjected, successfulOnly, selectedTasks, scope, hbFrom, hbTo, selectedSessions]);

  const estimatedSize = useMemo(() => {
    const bytesPerRow = 2 * 1024;
    const totalBytes = filteredCount * bytesPerRow;
    if (totalBytes > 1024 * 1024) return `~${(totalBytes / (1024 * 1024)).toFixed(1)}MB`;
    return `~${(totalBytes / 1024).toFixed(1)}KB`;
  }, [filteredCount]);

  const selectedSessionData = useMemo(() => {
    return availableSessions.filter(s => selectedSessions.includes(s.id));
  }, [availableSessions, selectedSessions]);

  const totalMemoryCount = useMemo(() => {
    if (scope === 'session' && selectedSessionData.length > 0) {
      return selectedSessionData.reduce((sum, s) => sum + (s.memory_count || 0), 0);
    }
    return filteredCount;
  }, [scope, selectedSessionData, filteredCount]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    synthiaToast.info(STRINGS.TOASTS.EXPORT_STARTED);

    const config: ExportConfig = {
      exportType,
      format: exportType === 'dataset' ? format : undefined,
      agentIds: exportScope === 'single' ? [activeAgentId] : Object.keys(useAgentStore.getState().agents),
      zipPerAgent: exportScope === 'all' ? zipPerAgent : undefined,
      scope,
      includeTiers: includeTiers as any,
      includeFrames: false,
      includeThoughts: exportType === 'session_full' ? includeThoughts : undefined,
      includeSkills: exportType === 'session_full' ? includeSkills : undefined,
      includeMotorPrograms: exportType === 'session_full' ? includeMotorPrograms : undefined,
      excludeInjected,
      successfulOnly,
      taskFilter: selectedTasks.length > 0 ? selectedTasks : undefined,
      dateFrom: scope === 'date_range' ? dateFrom : undefined,
      dateTo: scope === 'date_range' ? dateTo : undefined,
      heartbeatFrom: scope === 'heartbeat_range' ? hbFrom : undefined,
      heartbeatTo: scope === 'heartbeat_range' ? hbTo : undefined,
      sessionIds: scope === 'session' ? selectedSessions : undefined,
    };

    try {
      await runClientSideExport(config, supabaseUrl || '', supabaseKey || '', setExportProgress);
      synthiaToast.success('Dataset export downloaded successfully!');
      setTimeout(() => setExportModalOpen(false), 800);
    } catch (err: any) {
      console.error('[ClientExport] Error during export:', err);
      synthiaToast.error(err.message || 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!exportModalOpen) return null;

  const exportTypes: { id: ExportType; name: string; icon: Icons.Icon; desc: string }[] = [
    { id: 'dataset', name: 'Dataset', icon: Icons.Database, desc: 'ML training datasets (LeRobot, JSONL, CSV)' },
    { id: 'thoughts_report', name: 'Thoughts Report', icon: Icons.Notebook, desc: STRINGS.EXPORT.EXPORT_TYPE_THOUGHTS_DESC },
    { id: 'session_full', name: 'Session Full', icon: Icons.Archive, desc: STRINGS.EXPORT.EXPORT_TYPE_SESSION_FULL_DESC },
  ];

  const formats: { id: ExportFormat; name: string; icon: Icons.Icon; tag?: string }[] = [
    { id: 'LeRobot', name: 'LeRobot', icon: Icons.Robot, tag: 'Hugging Face' },
    { id: 'JSONL', name: 'JSONL', icon: Icons.FileCode },
    { id: 'CSV', name: 'CSV', icon: Icons.FileCsv },
  ];

  const scopeOptions = [
    { id: 'all', label: 'All Heartbeats' },
    { id: 'date_range', label: 'Date Range' },
    { id: 'session', label: 'Session Picker', disabled: !supabaseUrl || !supabaseKey || exportScope === 'all' },
    { id: 'heartbeat_range', label: 'Heartbeat Range' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-[820px] max-h-[90vh] flex flex-col"
      >
        <Panel className="border-border-subtle shadow-2xl overflow-hidden flex flex-col bg-bg-panel/95 backdrop-blur-md">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-bg-panel shrink-0">
            <div className="flex items-center gap-2.5">
              <Icons.Export size={18} className="text-accent-blue" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-text-secondary">{STRINGS.EXPORT.TITLE}</h2>
            </div>
            <button onClick={() => setExportModalOpen(false)} className="text-text-tertiary hover:text-text-primary w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
              <Icons.X size={18} />
            </button>
          </div>

          <div className="flex overflow-hidden" style={{ minHeight: '480px' }}>
            {/* LEFT PANEL — Configuration */}
            <div className="flex-1 p-6 space-y-5 overflow-y-auto border-r border-border-subtle custom-scrollbar">
              {/* Scoping Selector - Single Agent vs All Active Agents */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Export Scoping</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setExportScope('single');
                      setZipPerAgent(false);
                    }}
                    className={`flex-1 h-9 flex items-center justify-center gap-2 border rounded-btn text-xs font-semibold transition-all ${
                      exportScope === 'single'
                        ? "border-accent-blue bg-accent-blue/10 text-text-primary font-bold"
                        : "border-border text-text-tertiary hover:border-text-secondary"
                    }`}
                  >
                    <Icons.User size={14} />
                    <span>Agent ({activeAgentId})</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportScope('all');
                    }}
                    className={`flex-1 h-9 flex items-center justify-center gap-2 border rounded-btn text-xs font-semibold transition-all ${
                      exportScope === 'all'
                        ? "border-accent-blue bg-accent-blue/10 text-text-primary font-bold"
                        : "border-border text-text-tertiary hover:border-text-secondary"
                    }`}
                  >
                    <Icons.Users size={14} />
                    <span>All Active Agents</span>
                  </button>
                </div>
              </div>

              {/* ZIP archive isolation - Multi-Agent only */}
              <AnimatePresence>
                {exportScope === 'all' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-1 border-b border-border-subtle pb-3"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={zipPerAgent}
                        onChange={() => setZipPerAgent(!zipPerAgent)}
                        className="rounded border-border accent-accent-blue cursor-pointer"
                      />
                      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors font-medium">
                        Separate folder per agent inside ZIP archive
                      </span>
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Export Type Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{STRINGS.EXPORT.EXPORT_TYPE}</label>
                <div className="grid grid-cols-3 gap-2">
                  {exportTypes.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setExportType(t.id)}
                        className={`p-3 flex flex-col items-center gap-1.5 text-center border rounded-btn transition-all ${
                          exportType === t.id
                            ? 'border-accent-blue bg-accent-blue/10 text-text-primary font-bold'
                            : 'border-border text-text-tertiary hover:border-text-secondary hover:bg-white/[0.01]'
                        }`}
                      >
                        <Icon size={18} weight={exportType === t.id ? 'bold' : 'regular'} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">{t.name}</span>
                        <span className="text-[9px] text-text-tertiary leading-tight font-normal line-clamp-2">{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format Selection (Dataset only) */}
              <AnimatePresence>
                {exportType === 'dataset' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden border-b border-border-subtle pb-3"
                  >
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{STRINGS.EXPORT.SELECT_FORMAT}</label>
                    <div className="flex gap-2">
                      {formats.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setFormat(f.id)}
                          className={`flex-1 h-9 flex items-center justify-center gap-2 border rounded-btn transition-all relative ${
                            format === f.id
                              ? "border-accent-blue bg-accent-blue/10 text-text-primary font-bold"
                              : "border-border text-text-tertiary hover:border-text-secondary"
                          }`}
                        >
                          <f.icon size={16} />
                          <span className="text-[10px] font-bold">{f.name}</span>
                          {f.tag && (
                            <span className="text-[8px] bg-accent-blue/20 text-accent-blue px-1 rounded font-mono font-normal">
                              {f.tag}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Session Full sub-options */}
              <AnimatePresence>
                {exportType === 'session_full' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden border-b border-border-subtle pb-3"
                  >
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Include In Archive</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Thoughts', checked: includeThoughts, onChange: () => setIncludeThoughts(!includeThoughts) },
                        { label: 'Skills', checked: includeSkills, onChange: () => setIncludeSkills(!includeSkills) },
                        { label: 'Motors', checked: includeMotorPrograms, onChange: () => setIncludeMotorPrograms(!includeMotorPrograms) },
                      ].map((opt, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={opt.onChange}
                            className="rounded border-border accent-accent-blue cursor-pointer"
                          />
                          <span className="text-[10px] text-text-secondary group-hover:text-text-primary transition-colors">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Task Tracker / Task Filter */}
              {availableTasks.length > 0 && (
                <div className="space-y-2 border-b border-border-subtle pb-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Training Task Filter</label>
                    {selectedTasks.length > 0 && (
                      <button
                        onClick={() => setSelectedTasks([])}
                        className="text-[9px] text-accent-blue hover:underline"
                      >
                        Clear Task Filter
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                    {availableTasks.map((t) => {
                      const isSelected = selectedTasks.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTasks(selectedTasks.filter(x => x !== t));
                            } else {
                              setSelectedTasks([...selectedTasks, t]);
                            }
                          }}
                          className={`px-2 py-1 rounded text-[9px] font-mono border transition-all ${
                            isSelected
                              ? 'border-accent-blue bg-accent-blue/15 text-accent-blue font-bold'
                              : 'border-border text-text-tertiary hover:border-text-secondary'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scope Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{STRINGS.EXPORT.SCOPE_LABEL}</label>
                <div className="grid grid-cols-2 gap-2">
                  {scopeOptions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => !s.disabled && setScope(s.id as ExportConfig['scope'])}
                      disabled={s.disabled}
                      className={`h-9 flex items-center justify-center border rounded-btn text-xs font-semibold transition-all ${
                        s.disabled
                          ? 'opacity-40 cursor-not-allowed border-dashed border-border text-text-tertiary'
                          : scope === s.id
                            ? 'border-accent-blue bg-accent-blue/10 text-text-primary font-bold'
                            : 'border-border text-text-tertiary hover:border-text-secondary'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional scope inputs */}
              <AnimatePresence mode="wait">
                {scope === 'date_range' && (
                  <motion.div
                    key="date"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="grid grid-cols-2 gap-3 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-wider text-text-tertiary">From Date</label>
                      <input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-wider text-text-tertiary">To Date</label>
                      <input
                        type="datetime-local"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                  </motion.div>
                )}

                {scope === 'heartbeat_range' && (
                  <motion.div
                    key="heartbeat"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="grid grid-cols-2 gap-3 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-wider text-text-tertiary">Min Heartbeat</label>
                      <input
                        type="number"
                        min="0"
                        value={hbFrom}
                        onChange={e => setHbFrom(parseInt(e.target.value) || 0)}
                        className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-wider text-text-tertiary">Max Heartbeat</label>
                      <input
                        type="number"
                        min="0"
                        value={hbTo}
                        onChange={e => setHbTo(parseInt(e.target.value) || 0)}
                        className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                  </motion.div>
                )}

                {scope === 'session' && (
                  <motion.div
                    key="sessions"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Select Sessions</label>
                    <div className="max-h-[120px] overflow-y-auto border border-border-subtle rounded-btn bg-black/10 divide-y divide-border-subtle custom-scrollbar">
                      {sessionsLoading ? (
                        <div className="p-3 text-center text-xs font-mono text-text-tertiary flex items-center justify-center gap-2">
                          <Icons.ArrowsClockwise size={12} className="animate-spin text-accent-blue" />
                          Fetching sessions...
                        </div>
                      ) : availableSessions.length === 0 ? (
                        <div className="p-3 text-center text-[10px] text-text-tertiary uppercase">No database sessions found.</div>
                      ) : (
                        availableSessions.map((s) => {
                          const isSelected = selectedSessions.includes(s.id);
                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedSessions(selectedSessions.filter(id => id !== s.id));
                                } else {
                                  setSelectedSessions([...selectedSessions, s.id]);
                                }
                              }}
                              className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${
                                isSelected ? 'bg-accent-blue/10 text-text-primary' : 'hover:bg-white/[0.02]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="rounded border-border accent-accent-blue"
                                />
                                <span className="text-[10px] font-mono font-bold">{s.id.slice(0, 16)}</span>
                              </div>
                              <span className="text-[9px] font-mono text-text-tertiary">
                                {formatBytes(s.estimated_size_bytes || 0)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Memory Tiers Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{STRINGS.EXPORT.TIER_LABEL}</label>
                  <button onClick={() => setTierInfoOpen(!tierInfoOpen)} className="text-text-tertiary hover:text-text-primary">
                    <Icons.Info size={14} />
                  </button>
                </div>

                <AnimatePresence>
                  {tierInfoOpen && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="text-[10px] text-text-tertiary bg-white/5 p-2 rounded border border-border-subtle leading-normal"
                    >
                      SYNTHIA saves thoughts and context to specific memory tiers: Tier 1 is Working Memory (short-term), Tier 2 is Episodic Memory (medium-term), and Tier 3 is Long-term/Archival Memory. Select which tiers are included in the export.
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="flex gap-2">
                  {[1, 2, 3].map((tier) => (
                    <button
                      key={tier}
                      onClick={() => {
                        if (includeTiers.includes(tier)) {
                          setIncludeTiers(includeTiers.filter(t => t !== tier));
                        } else {
                          setIncludeTiers([...includeTiers, tier]);
                        }
                      }}
                      className={`flex-1 h-8 flex items-center justify-center border rounded-btn text-xs font-bold transition-all ${
                        includeTiers.includes(tier)
                          ? 'border-accent-blue bg-accent-blue/10 text-accent-blue font-bold'
                          : 'border-border text-text-tertiary hover:border-text-secondary'
                      }`}
                    >
                      Tier {tier}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Filters */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{STRINGS.EXPORT.FILTERS}</label>
                <div className="grid grid-cols-2 gap-y-2">
                  {[
                    { label: 'Exclude Injected', checked: excludeInjected, onChange: () => setExcludeInjected(!excludeInjected) },
                    { label: 'Successful Only', checked: successfulOnly, onChange: () => setSuccessfulOnly(!successfulOnly) },
                  ].map((opt, i) => (
                    <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={opt.checked}
                        onChange={opt.onChange}
                        className="rounded border-border accent-accent-blue cursor-pointer"
                      />
                      <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL — Preview */}
            <div className="w-[280px] p-5 bg-bg-elevated/20 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Icons.Eye size={14} className="text-accent-blue" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">{STRINGS.EXPORT.PREVIEW_PANEL}</span>
              </div>

              <div className="flex-1 space-y-4">
                <div className="p-4 bg-black/10 rounded-panel border border-border-subtle space-y-3.5 text-left text-xs">
                  {/* Target Scoping Indicator */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-text-tertiary">Target Scoping</span>
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 mt-0.5">
                      {exportScope === 'single' ? (
                        <>
                          <Icons.User size={13} className="text-accent-blue" />
                          {activeAgentId}
                        </>
                      ) : (
                        <>
                          <Icons.Users size={13} className="text-accent-blue" />
                          All Active Agents ({Object.keys(useAgentStore.getState().agents).length})
                        </>
                      )}
                    </span>
                  </div>

                  {/* Export Type */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-text-tertiary">Type</span>
                    <span className="text-xs font-bold text-text-primary">
                      {exportTypes.find(t => t.id === exportType)?.name}
                    </span>
                  </div>

                  {/* Format (dataset only) */}
                  {exportType === 'dataset' && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase text-text-tertiary">Format</span>
                      <span className="text-xs font-bold text-text-primary">{format}</span>
                    </div>
                  )}

                  {/* Task Filter indicator if active */}
                  {selectedTasks.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase text-text-tertiary">Tasks Filtered</span>
                      <span className="text-[10px] font-mono text-accent-blue font-bold block">
                        {selectedTasks.length} task(s) selected
                      </span>
                    </div>
                  )}

                  {/* Scope */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-text-tertiary">Scope</span>
                    <span className="text-xs font-bold text-text-primary capitalize">{scope.replace('_', ' ')}</span>
                  </div>

                  {/* Breakdown */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-text-tertiary">Memories Match</span>
                    <span className="text-xs font-mono font-bold text-text-primary block">
                      {totalMemoryCount.toLocaleString()} rows
                    </span>
                  </div>

                  <div className="h-px bg-border-subtle" />

                  {/* Size Estimate */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-text-tertiary">{STRINGS.EXPORT.ESTIMATED_SIZE}</span>
                    <span className="text-sm font-bold text-text-primary block">
                      {estimatedSize}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress and Action Button */}
              <div className="mt-auto pt-4 space-y-3 shrink-0">
                {isExporting && (
                  <div className="space-y-1 text-left">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-text-secondary uppercase">Progress</span>
                      <span className="text-accent-blue font-bold">{exportProgress}%</span>
                    </div>
                    <div className="w-full h-1 bg-bg-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-accent-blue transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleExport}
                  disabled={isExporting || totalMemoryCount === 0}
                  className={`w-full h-10 rounded-btn text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer
                    ${isExporting
                      ? 'bg-accent-blue/10 border border-accent-blue/30 text-accent-blue cursor-not-allowed'
                      : totalMemoryCount === 0
                        ? 'bg-border text-text-tertiary border-transparent cursor-not-allowed opacity-50'
                        : 'bg-accent-blue hover:bg-accent-blue-hover text-white border-transparent shadow-md'
                    }`}
                >
                  {isExporting ? (
                    <>
                      <Icons.ArrowsClockwise size={12} className="animate-spin" />
                      <span>{STRINGS.EXPORT.EXPORTING(exportProgress)}</span>
                    </>
                  ) : (
                    <>
                      <Icons.DownloadSimple size={14} weight="bold" />
                      <span>{STRINGS.EXPORT.START_EXPORT}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
};
