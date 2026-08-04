/**
 * AgentSettingsModal component.
 * Driven entirely by useAgentStore's activeAgentId selection.
 * Covers: Connection/provider settings, memory explorer, skill/rung progression ladder, and per-agent export trigger.
 */

import React, { useState, useMemo } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore, type AgentRuntimeConfig } from '../../store/agentRuntimeStore';
import { useConnectionStore, type ProviderType } from '../../store/connectionStore';
import { useCoordinator } from '../../world/hooks/useCoordinator';
import { SKILL_RUNGS } from '../../constants/progressionLadder';
import { STRINGS } from '../../constants/strings';
import { Panel, cn } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Cpu,
  Brain,
  Database,
  ChartLineUp,
  Export,
  CaretDown,
  CaretUp,
  Circle,
  ArrowsClockwise,
  CheckCircle,
  WifiHigh,
  MagnifyingGlass,
  Bookmark,
  Sparkle
} from '@phosphor-icons/react';
import { synthiaToast } from '../ui/Toast';

const PROVIDER_INFO: Record<ProviderType, { label: string; defaultEndpoint: string; defaultModel: string; needsKey: boolean }> = {
  kaggle:     { label: 'Kaggle / Cloudflare', defaultEndpoint: 'http://localhost:8000/infer', defaultModel: 'Qwen2.5-VL-3B-Instruct', needsKey: false },
  gemini:     { label: 'Google Gemini',        defaultEndpoint: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash', needsKey: true },
  nim:        { label: 'NVIDIA NIM',           defaultEndpoint: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.1-8b-instruct', needsKey: true },
  openrouter: { label: 'OpenRouter',           defaultEndpoint: 'https://openrouter.ai/api/v1', defaultModel: 'meta-llama/llama-3.1-8b-instruct', needsKey: true },
  groq:       { label: 'Groq',                 defaultEndpoint: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.1-8b-instant', needsKey: true },
  custom:     { label: 'Custom (OpenAI-compat)', defaultEndpoint: '', defaultModel: '', needsKey: true },
};

export const AgentSettingsModal: React.FC = () => {
  const { settingsModalOpen, setSettingsModalOpen, setExportModalOpen } = useUIStore();
  const { activeAgentId, agents } = useAgentStore();

  // Use current agent state specifically, to ensure reactive updates if agent selection switches
  const currentAgent = agents[activeAgentId] || {
    thoughts: [],
    memories: [],
    skills: [],
    currentRung: 0,
    heartbeat: 0,
    status: 'idle',
  };

  const [activeTab, setActiveTab] = useState<'infra' | 'cognition' | 'export'>('infra');

  // Infrastructure state
  const { endpoint, setEndpoint, status, rtt } = useConnectionStore();
  const runtimeStore = useAgentRuntimeStore();
  const config = runtimeStore.getConfig(activeAgentId);
  const { sendMessage } = useCoordinator();

  const [dbExpanded, setDbExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // Cognition state (Memory explorer filtering)
  const [memorySearch, setMemorySearch] = useState('');
  const [memoryTierFilter, setMemoryTierFilter] = useState<number | 'all'>('all');

  const handleProviderChange = (newProvider: ProviderType) => {
    const info = PROVIDER_INFO[newProvider];
    const patch: Partial<AgentRuntimeConfig> = { provider: newProvider };
    if (info) {
      if (info.defaultEndpoint && newProvider !== 'custom') {
        patch.endpoint = info.defaultEndpoint;
      }
      if (info.defaultModel) {
        patch.model = info.defaultModel;
      }
    }
    runtimeStore.setConfig(activeAgentId, patch);
  };

  const handleConnect = async () => {
    if (status !== 'connected') {
      synthiaToast.error('Not connected to coordinator. Check the Endpoint URL above.');
      return;
    }
    if (!config.endpoint && config.provider !== 'custom') {
      synthiaToast.error('Please enter an inference endpoint URL.');
      return;
    }
    if (PROVIDER_INFO[config.provider].needsKey && !config.apiKey) {
      synthiaToast.error(`API key required for ${PROVIDER_INFO[config.provider].label}.`);
      return;
    }

    setIsSending(true);
    setSentOk(false);
    await new Promise(resolve => setTimeout(resolve, 600));

    // Send provider config for active agent to coordinator
    sendMessage('set_provider', {
      agentId: activeAgentId,
      type: config.provider,
      endpoint: config.endpoint,
      apiKey: config.apiKey || undefined,
      model: config.model || undefined,
    });
    sendMessage('set_supabase', { url: config.supabaseUrl, key: config.supabaseKey, agentId: activeAgentId });

    setIsSending(false);
    setSentOk(true);
    synthiaToast.success(`Connected ${activeAgentId} to ${PROVIDER_INFO[config.provider].label}`);
    setTimeout(() => setSentOk(false), 5000);
  };

  const statusColors: Record<string, string> = {
    connected: 'text-accent-green',
    connecting: 'text-accent-amber',
    disconnected: 'text-text-tertiary',
    error: 'text-accent-red',
  };

  const statusBg: Record<string, string> = {
    connected: 'bg-accent-green/10 border-accent-green/30',
    connecting: 'bg-accent-amber/10 border-accent-amber/30',
    disconnected: 'bg-bg-elevated border-border',
    error: 'bg-accent-red/10 border-accent-red/30',
  };

  const showApiKey = PROVIDER_INFO[config.provider].needsKey;

  // Filtered Memories for detailed memory explorer
  const filteredMemories = useMemo(() => {
    let result = currentAgent.memories || [];
    if (memoryTierFilter !== 'all') {
      result = result.filter(m => m.tier === memoryTierFilter);
    }
    if (memorySearch.trim() !== '') {
      const q = memorySearch.toLowerCase();
      result = result.filter(m =>
        (m.summary && m.summary.toLowerCase().includes(q)) ||
        (m.thought && m.thought.toLowerCase().includes(q))
      );
    }
    return [...result].reverse(); // reverse to show latest first
  }, [currentAgent.memories, memoryTierFilter, memorySearch]);

  if (!settingsModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-[840px] h-[80vh] flex flex-col"
      >
        <Panel className="border-border-subtle shadow-2xl overflow-hidden flex flex-col h-full bg-bg-panel/95 backdrop-blur-md">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-bg-panel shrink-0">
            <div className="flex items-center gap-3">
              <Cpu size={18} className="text-accent-blue" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-text-secondary">
                AGENT SETTINGS
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-accent-blue/10 text-[10px] font-bold font-mono text-accent-blue uppercase tracking-wider">
                {activeAgentId}
              </span>
            </div>
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="text-text-tertiary hover:text-text-primary w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-[180px] border-r border-border-subtle bg-bg-elevated/5 p-3 flex flex-col gap-1.5 shrink-0">
              <button
                onClick={() => setActiveTab('infra')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'infra'
                    ? "bg-accent-blue/10 text-accent-blue font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <Cpu size={16} />
                Infrastructure
              </button>

              <button
                onClick={() => setActiveTab('cognition')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'cognition'
                    ? "bg-accent-purple/10 text-accent-purple font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <Brain size={16} />
                Cognition
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'export'
                    ? "bg-accent-green/10 text-accent-green font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <Export size={16} />
                Data & Export
              </button>

              <div className="mt-auto p-2 bg-white/[0.02] border border-white/5 rounded-btn text-[9px] text-text-tertiary text-center leading-normal">
                Subscribed to <br />
                <span className="font-mono font-bold text-text-secondary">{activeAgentId}</span>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-bg-panel/20">
              {activeTab === 'infra' && (
                <div className="space-y-5 max-w-[540px]">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Inference & Database Infrastructure</h3>
                    <p className="text-[11px] text-text-tertiary leading-normal mt-1">
                      Configure how this specific agent's cognition loops connect to Large Language Model backends and persistent storage.
                    </p>
                  </div>

                  {/* Coordinator WebSocket URL - Shared World Level */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold flex justify-between">
                      <span>COORDINATOR ENDPOINT</span>
                      <span className="text-text-tertiary/50 font-normal">ws:// [GLOBAL]</span>
                    </label>
                    <input
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="ws://localhost:3001/ws"
                      className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Provider dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                        Inference Provider
                      </label>
                      <div className="relative">
                        <select
                          value={config.provider}
                          onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
                          className="w-full h-8 pl-2.5 pr-8 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        >
                          {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                            <option key={key} value={key}>{info.label}</option>
                          ))}
                        </select>
                        <CaretDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                      </div>
                    </div>

                    {/* Model (for non-Kaggle) */}
                    {config.provider !== 'kaggle' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                          Model ID
                        </label>
                        <input
                          type="text"
                          value={config.model || ''}
                          onChange={(e) => runtimeStore.setConfig(activeAgentId, { model: e.target.value })}
                          placeholder={PROVIDER_INFO[config.provider]?.defaultModel || 'model-name'}
                          className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                        />
                      </div>
                    )}
                  </div>

                  {/* API Key (conditional) */}
                  {showApiKey && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                        API Key
                        <span className="ml-1 text-text-tertiary/50 font-normal">(session-scoped only)</span>
                      </label>
                      <input
                        type="password"
                        value={config.apiKey || ''}
                        onChange={(e) => runtimeStore.setConfig(activeAgentId, { apiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      />
                    </div>
                  )}

                  {/* Inference Endpoint */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                      {config.provider === 'kaggle' ? 'Kaggle Inference Endpoint' : 'API Base URL'}
                    </label>
                    <input
                      type="text"
                      value={config.endpoint || ''}
                      onChange={(e) => runtimeStore.setConfig(activeAgentId, { endpoint: e.target.value })}
                      placeholder={PROVIDER_INFO[config.provider]?.defaultEndpoint || 'https://...'}
                      className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                    />
                  </div>

                  {/* Connection Button and Status Row */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <button
                        onClick={handleConnect}
                        disabled={isSending}
                        className={`w-full h-9 rounded-btn text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all
                          ${sentOk
                            ? 'bg-accent-green/20 border border-accent-green/50 text-accent-green'
                            : 'bg-text-primary text-bg-primary border-transparent hover:opacity-90'
                          }
                          disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {isSending ? (
                          <>
                            <ArrowsClockwise size={12} className="animate-spin" />
                            Sending Configuration…
                          </>
                        ) : sentOk ? (
                          <>
                            <CheckCircle size={12} weight="fill" />
                            Applied Successfully
                          </>
                        ) : (
                          <>
                            <WifiHigh size={14} />
                            Deploy Cognition Config
                          </>
                        )}
                      </button>
                    </div>

                    <div className={`flex items-center justify-between h-9 px-4 rounded-btn border min-w-[140px] ${statusBg[status]}`}>
                      <div className="flex items-center gap-2">
                        <Circle size={6} weight="fill" className={`${statusColors[status]} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
                        <span className="text-[9px] font-mono text-text-secondary uppercase">{status}</span>
                      </div>
                      <span className="text-[9px] font-mono text-text-tertiary">{rtt > 0 ? `${rtt}ms` : '—'}</span>
                    </div>
                  </div>

                  {/* Cycle speed */}
                  <div className="space-y-2 border-t border-border-subtle pt-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Cognitive Cycle Speed</label>
                      <span className="text-xs font-mono font-bold text-accent-blue">{config.cycleMs}ms</span>
                    </div>
                    <input
                      type="range"
                      min="500"
                      max="5000"
                      step="100"
                      value={config.cycleMs}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value);
                        runtimeStore.setCycleMsOverride(activeAgentId, newValue);
                        sendMessage('set_cycle_ms', { agentId: activeAgentId, cycleMs: newValue });
                      }}
                      className="w-full h-1 bg-bg-elevated rounded-lg appearance-none cursor-pointer accent-accent-blue"
                    />
                    <p className="text-[9px] text-text-tertiary leading-relaxed">
                      Defines the rest interval between successive environmental sweeps, action decodes, and memory dumps.
                    </p>
                  </div>

                  {/* Database Section */}
                  <div className="border border-border rounded-btn overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDbExpanded(!dbExpanded)}
                      className="w-full px-4 py-2.5 flex items-center justify-between bg-bg-elevated/20 hover:bg-bg-elevated/40 transition-colors"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                        <Database size={13} />
                        Supabase Memory Archiving
                        {config.supabaseUrl && <span className="text-accent-green/70">● Active</span>}
                      </span>
                      {dbExpanded ? <CaretDown size={14} /> : <CaretUp size={14} />}
                    </button>

                    {dbExpanded && (
                      <div className="p-4 space-y-3 bg-bg-elevated/10 border-t border-border-subtle">
                        <p className="text-[10px] text-text-tertiary leading-relaxed">
                          Provide a target Supabase DB credentials override to write memories, skills, and model checkpoints specifically for this agent.
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold text-text-tertiary">Supabase URL Override</label>
                          <input
                            type="text"
                            value={config.supabaseUrl || ''}
                            onChange={(e) => runtimeStore.setConfig(activeAgentId, { supabaseUrl: e.target.value })}
                            placeholder="https://xxxx.supabase.co"
                            className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase font-bold text-text-tertiary">Service/Anon Key Override</label>
                          <input
                            type="password"
                            value={config.supabaseKey || ''}
                            onChange={(e) => runtimeStore.setConfig(activeAgentId, { supabaseKey: e.target.value })}
                            placeholder="eyJhbGci…"
                            className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'cognition' && (
                <div className="space-y-6 flex flex-col h-full">
                  {/* Skill Rungs Progression */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <ChartLineUp size={16} className="text-accent-purple" />
                      <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Skill & Progression Ladder</h3>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {SKILL_RUNGS.map((rung) => {
                        const isMastered = currentAgent.currentRung >= rung.id;
                        return (
                          <div
                            key={rung.id}
                            className={cn(
                              "p-2.5 rounded-btn border text-center flex flex-col items-center justify-between min-h-[90px] transition-all relative",
                              isMastered
                                ? "border-accent-purple bg-accent-purple/5 text-text-primary shadow-sm"
                                : "border-border text-text-tertiary bg-white/[0.01]"
                            )}
                          >
                            <span className="text-[9px] font-bold font-mono uppercase text-text-tertiary/80 block">RUNG {rung.id}</span>
                            <div className="my-1.5 flex flex-col items-center">
                              <span className="text-[10px] font-bold leading-tight line-clamp-2">{rung.name}</span>
                            </div>
                            <span className="text-[8px] font-mono opacity-80 uppercase tracking-tighter truncate max-w-full">
                              {rung.criteria}
                            </span>
                            {isMastered && (
                              <Sparkle size={12} weight="fill" className="absolute top-1 right-1 text-accent-purple animate-pulse" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Detailed Memory Explorer */}
                  <div className="border-t border-border-subtle pt-5 flex flex-col flex-1 min-h-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <Database size={16} className="text-accent-purple" />
                        <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Detailed Memory Explorer</h3>
                      </div>
                      <span className="text-[10px] font-mono text-text-tertiary">
                        Total Memories Archived: <strong className="text-text-secondary">{currentAgent.memories?.length || 0}</strong>
                      </span>
                    </div>

                    {/* Filter controls */}
                    <div className="flex items-center gap-3 mb-3">
                      {/* Search */}
                      <div className="flex-1 relative">
                        <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                        <input
                          type="text"
                          placeholder="Search thoughts, visual descriptions, action tokens..."
                          value={memorySearch}
                          onChange={(e) => setMemorySearch(e.target.value)}
                          className="w-full h-8 pl-8 pr-3 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none"
                        />
                      </div>

                      {/* Tier filter */}
                      <div className="flex items-center gap-1">
                        {['all', 1, 2, 3].map((tier) => (
                          <button
                            key={tier}
                            onClick={() => setMemoryTierFilter(tier as any)}
                            className={cn(
                              "h-8 px-2.5 text-[9px] font-bold uppercase border rounded-btn transition-all",
                              memoryTierFilter === tier
                                ? "border-accent-purple bg-accent-purple/10 text-text-primary"
                                : "border-border text-text-tertiary hover:border-text-secondary"
                            )}
                          >
                            {tier === 'all' ? 'All Tiers' : `Tier ${tier}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Memories List */}
                    <div className="flex-1 overflow-y-auto max-h-[220px] border border-border-subtle rounded-btn bg-black/10 divide-y divide-border-subtle custom-scrollbar">
                      {filteredMemories.length === 0 ? (
                        <div className="p-8 text-center text-[10px] uppercase tracking-wider text-text-tertiary opacity-30">
                          No matching memories found in activeAgent archive
                        </div>
                      ) : (
                        filteredMemories.map((m) => {
                          const reward = m.rewardSignal ?? m.reward_signal ?? 0;
                          return (
                            <div key={m.id} className="p-3 bg-bg-panel/40 space-y-2 text-left relative group hover:bg-white/[0.01]">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="tertiary" className="text-[9px]">HB {m.heartbeat}</Badge>
                                  <span className={`px-1.5 py-0.5 text-[8px] font-bold font-mono rounded ${
                                    m.tier === 1 ? 'bg-accent-green/10 text-accent-green' :
                                    m.tier === 2 ? 'bg-accent-blue/10 text-accent-blue' :
                                    'bg-accent-amber/10 text-accent-amber'
                                  }`}>
                                    TIER {m.tier}
                                  </span>
                                  {m.tier === 1 && (
                                    <Bookmark size={11} weight="fill" className="text-accent-teal" />
                                  )}
                                </div>
                                <span className={cn(
                                  "text-[10px] font-mono font-bold",
                                  reward >= 0.8 ? 'text-accent-green' : reward >= 0.3 ? 'text-accent-amber' : 'text-accent-red'
                                )}>
                                  Reward: {reward > 0 ? '+' : ''}{reward.toFixed(2)}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <p className="text-[11px] text-text-primary leading-relaxed font-mono">
                                  {m.thought}
                                </p>
                                {m.summary && (
                                  <p className="text-[10px] text-text-tertiary italic">
                                    Summary: {m.summary}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'export' && (
                <div className="space-y-5 max-w-[540px]">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Dataset Export Scoping</h3>
                    <p className="text-[11px] text-text-tertiary leading-normal mt-1">
                      Download compiled cognition records, state logs, and video sequences specifically for this active agent.
                    </p>
                  </div>

                  <div className="p-5 bg-accent-blue/5 border border-accent-blue/10 rounded-btn space-y-3">
                    <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                      <Bookmark size={14} className="text-accent-blue" />
                      Active Selection Export Ready
                    </h4>
                    <p className="text-[11px] text-text-secondary leading-normal">
                      Click below to open the export wizard. The session records, thoughts list, and frames will be filtered automatically to download <strong>only</strong> the data belonging to <strong className="text-accent-blue font-mono">{activeAgentId}</strong>.
                    </p>

                    <div className="pt-2">
                      <Button
                        variant="primary"
                        className="w-full py-2.5 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg"
                        onClick={() => {
                          setSettingsModalOpen(false);
                          setExportModalOpen(true);
                        }}
                      >
                        <Export size={16} />
                        Configure Scoped Export
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 border border-border rounded-btn bg-white/[0.01]">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider block mb-1">
                      Multi-Agent Export
                    </span>
                    <p className="text-[10px] text-text-tertiary leading-relaxed">
                      If you need to archive datasets across all simulation bodies simultaneously, you can choose "All Active Agents" in the scope picker inside the export wizard. This will produce indexing files grouped under an <code>agent_id</code> column or separate subfolders automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
};
