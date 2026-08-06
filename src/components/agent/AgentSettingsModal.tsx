/**
 * AgentSettingsModal component.
 * Driven entirely by useAgentStore's activeAgentId selection.
 * Covers: Connection/provider settings, memory explorer, per-agent voice/TTS, vision settings, and connection testing.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore, type AgentRuntimeConfig } from '../../store/agentRuntimeStore';
import { type ProviderType } from '../../store/connectionStore';
import { Panel, cn } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Dropdown } from '../ui/Dropdown';
import { motion } from 'framer-motion';
import {
  X,
  Cpu,
  Brain,
  Database,
  CaretDown,
  CaretUp,
  Circle,
  ArrowsClockwise,
  CheckCircle,
  WifiHigh,
  MagnifyingGlass,
  Bookmark,
  SpeakerHigh,
  Eye,
  WarningCircle,
  PlugsConnected,
  Pause,
  Play
} from '../ui/icons';
import { synthiaToast } from '../../utils/synthiaToast';
import { useSpeechStore } from '../../store/speechStore';
import { getSystemVoiceForAgent, ttsProvider } from '../../utils/speech';
import { useWorldStore } from '../../store/worldStore';
import { InferenceClient } from '../../world/agent/InferenceClient';

const PROVIDER_INFO: Record<ProviderType, { label: string; defaultEndpoint: string; defaultModel: string; needsKey: boolean; models?: string[] }> = {
  kaggle:     { label: 'Kaggle / Cloudflare', defaultEndpoint: 'http://localhost:8000/infer', defaultModel: 'Qwen2.5-VL-3B-Instruct', needsKey: false },
  gemini:     { label: 'Google Gemini', defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', needsKey: true,
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
  groq:       { label: 'Groq', defaultEndpoint: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.2-90b-vision-preview', needsKey: true,
    models: ['llama-3.2-90b-vision-preview', 'llama-3.2-11b-vision-preview', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  openrouter: { label: 'OpenRouter', defaultEndpoint: 'https://openrouter.ai/api/v1', defaultModel: 'meta-llama/llama-3.2-90b-vision-instruct', needsKey: true,
    models: ['meta-llama/llama-3.2-90b-vision-instruct', 'qwen/qwen-2-vl-72b-instruct', 'google/gemini-2.0-flash-exp:free', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-8b-instruct'] },
  nim:        { label: 'NVIDIA NIM', defaultEndpoint: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.2-90b-vision-instruct', needsKey: true,
    models: ['meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-11b-vision-instruct', 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1', 'meta/llama-4-scout-17b-16e-instruct', 'qwen/qwen3.5-397b-a17b'] },
  qwen:       { label: 'Qwen (DashScope)', defaultEndpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3-vl-plus', needsKey: true,
    models: ['qwen3-vl-plus', 'qwen3-vl-flash', 'qwen-vl-max', 'qwen-vl-plus', 'qwen2.5-vl-72b-instruct', 'qwen2.5-vl-32b-instruct', 'qwen3-omni-flash'] },
  cerebras:   { label: 'Cerebras', defaultEndpoint: 'https://api.cerebras.ai/v1', defaultModel: 'gemma-4-31b', needsKey: true,
    models: ['gemma-4-31b'] },
  minimax:    { label: 'MiniMax', defaultEndpoint: 'https://api.minimax.io/v1', defaultModel: 'MiniMax-M3', needsKey: true,
    models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5'] },
  moonshot:   { label: 'Moonshot AI (Kimi)', defaultEndpoint: 'https://api.moonshot.ai/v1', defaultModel: 'kimi-k2.6', needsKey: true,
    models: ['kimi-k2.6', 'kimi-k3', 'moonshot-v1-8k-vision-preview'] },
  mistral:    { label: 'Mistral', defaultEndpoint: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', needsKey: true,
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'pixtral-large-latest', 'ministral-14b-latest', 'ministral-8b-latest'] },
  nvidia:     { label: 'NVIDIA', defaultEndpoint: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.2-90b-vision-instruct', needsKey: true,
    models: ['meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-11b-vision-instruct', 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1', 'meta/llama-4-scout-17b-16e-instruct', 'meta/llama-4-maverick-17b-128e-instruct'] },
  xai:        { label: 'xAI (Grok)', defaultEndpoint: 'https://api.x.ai/v1', defaultModel: 'grok-4.5', needsKey: true,
    models: ['grok-4.5', 'grok-4.3', 'grok-4.20'] },
  zai:        { label: 'Z AI (Zhipu)', defaultEndpoint: 'https://api.z.ai/api/paas/v4', defaultModel: 'glm-5v-turbo', needsKey: true,
    models: ['glm-5v-turbo', 'glm-5.2', 'glm-5.1', 'glm-4.7', 'glm-4.6v', 'glm-4.6v-flash'] },
  anthropic:  { label: 'Anthropic', defaultEndpoint: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-20250514', needsKey: true,
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
  openai:     { label: 'OpenAI', defaultEndpoint: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', needsKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'] },
  deepseek:   { label: 'DeepSeek', defaultEndpoint: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', needsKey: true,
    models: ['deepseek-chat', 'deepseek-reasoner'] },
  together:   { label: 'Together AI', defaultEndpoint: 'https://api.together.xyz/v1', defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct-Turbo', needsKey: true,
    models: ['Qwen/Qwen2.5-VL-72B-Instruct-Turbo', 'meta-llama/Llama-Vision-Free', 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo'] },
  fireworks:  { label: 'Fireworks AI', defaultEndpoint: 'https://api.fireworks.ai/inference/v1', defaultModel: 'accounts/fireworks/models/llama-v3p2-90b-vision-instruct', needsKey: true,
    models: ['accounts/fireworks/models/llama-v3p2-90b-vision-instruct', 'accounts/fireworks/models/qwen-vl-72b-instruct'] },
  huggingface:{ label: 'Hugging Face', defaultEndpoint: 'https://api-inference.huggingface.co/v1', defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct', needsKey: true,
    models: ['Qwen/Qwen2.5-VL-72B-Instruct', 'meta-llama/Llama-3.2-11B-Vision-Instruct', 'mistralai/Mistral-Small-3.1-24B-Instruct-2503'] },
  ollama:     { label: 'Ollama (Local)', defaultEndpoint: 'http://localhost:11434/v1', defaultModel: 'llava', needsKey: false,
    models: ['llava', 'llama3.2-vision', 'moondream', 'minicpm-v'] },
  lmstudio:   { label: 'LM Studio', defaultEndpoint: 'http://localhost:1234/v1', defaultModel: '', needsKey: false },
  custom:     { label: 'Custom (OpenAI-compat)', defaultEndpoint: '', defaultModel: '', needsKey: true },
};

const VISION_SIZES = [224, 336, 448, 672, 896];

interface ConnectionTestState {
  status: 'idle' | 'testing' | 'ok' | 'fail';
  latencyMs?: number;
  error?: string;
}

export const AgentSettingsModal: React.FC = () => {
  const { settingsModalOpen, setSettingsModalOpen } = useUIStore();
  const { activeAgentId, agents } = useAgentStore();
  const { aiVisionFov, aiVisionSize, setAiVisionFov, setAiVisionSize } = useWorldStore();

  // Use current agent state specifically, to ensure reactive updates if agent selection switches
  const currentAgent = agents[activeAgentId] || {
    thoughts: [],
    memories: [],
    skills: [],
    currentRung: 0,
    heartbeat: 0,
    status: 'idle',
  };

  const [activeTab, setActiveTab] = useState<'infra' | 'memory' | 'voice' | 'vision'>('infra');

  // Speech configurations
  const {
    agentVoiceURIs,
    agentTtsEnabled,
    availableVoices,
    nonActiveBehavior,
    setVoiceForAgent,
    setTtsEnabledForAgent,
    setNonActiveBehavior
  } = useSpeechStore();

  const isAgentTtsEnabled = agentTtsEnabled[activeAgentId] !== false;
  const selectedVoiceURI = agentVoiceURIs[activeAgentId] || '';
  const defaultVoice = getSystemVoiceForAgent(activeAgentId);

  // Infrastructure state
  const runtimeStore = useAgentRuntimeStore();
  const config = runtimeStore.getConfig(activeAgentId);

  const [dbExpanded, setDbExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>({ status: 'idle' });
  const [showCustomModel, setShowCustomModel] = useState(false);

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
    setShowCustomModel(false);
    runtimeStore.setConfig(activeAgentId, patch);
  };

  const handleConnect = async () => {
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

    const client = new InferenceClient();
    client.setProvider(config.provider, config.endpoint, config.apiKey, config.model);
    const result = await client.testConnection();

    setIsSending(false);

    if (result.ok) {
      setSentOk(true);
      setConnectionTest({ status: 'ok', latencyMs: result.latencyMs });
      synthiaToast.success(`Config saved and verified for ${activeAgentId}`);
      setTimeout(() => setSentOk(false), 5000);
    } else {
      setConnectionTest({
        status: 'fail',
        latencyMs: result.latencyMs,
        error: result.error,
      });
      synthiaToast.error(result.error || 'Connection test failed â€” config not applied.');
    }
  };

  const handleTestConnection = async () => {
    if (!config.endpoint && config.provider !== 'custom') {
      synthiaToast.error('Please enter an inference endpoint URL.');
      return;
    }
    if (PROVIDER_INFO[config.provider].needsKey && !config.apiKey) {
      synthiaToast.error(`API key required for ${PROVIDER_INFO[config.provider].label}.`);
      return;
    }

    setConnectionTest({ status: 'testing' });
    const client = new InferenceClient();
    client.setProvider(config.provider, config.endpoint, config.apiKey, config.model);
    const result = await client.testConnection();
    setConnectionTest(
      result.ok
        ? { status: 'ok', latencyMs: result.latencyMs }
        : { status: 'fail', latencyMs: result.latencyMs, error: result.error }
    );
  };

  const showApiKey = PROVIDER_INFO[config.provider].needsKey;

  // Live status chip: derive from whether the loop can actually run
  const loopState = runtimeStore.getLoopState(activeAgentId);
  const hasProviderConfig = PROVIDER_INFO[config.provider].needsKey
    ? !!config.apiKey && !!config.endpoint
    : !!config.endpoint;

  const statusChip = !hasProviderConfig
    ? { color: 'text-accent-red', dot: 'bg-accent-red', label: 'No Provider Configured' }
    : loopState === 'running'
      ? { color: 'text-accent-green', dot: 'bg-accent-green', label: 'Agent Loop Active' }
      : loopState === 'paused'
        ? { color: 'text-accent-amber', dot: 'bg-accent-amber', label: 'Paused' }
        : { color: 'text-accent-amber', dot: 'bg-accent-amber', label: 'Not Started' };

  const handlePauseResume = () => {
    if (loopState === 'running') {
      window.__synthia?.pauseAgent?.(activeAgentId);
    } else if (loopState === 'paused' || loopState === 'stopped') {
      window.__synthia?.resumeAgent?.(activeAgentId);
    }
  };

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

  useEffect(() => {
    if (!settingsModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsModalOpen, setSettingsModalOpen]);

  if (!settingsModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setSettingsModalOpen(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[840px] max-w-[calc(100vw-2rem)] h-[80vh] max-h-[calc(100vh-2rem)] flex flex-col"
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
                onClick={() => setActiveTab('memory')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'memory'
                    ? "bg-accent-purple/10 text-accent-purple font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <Brain size={16} />
                Memory
              </button>

              <button
                onClick={() => setActiveTab('voice')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'voice'
                    ? "bg-accent-teal/10 text-accent-teal font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <SpeakerHigh size={16} />
                Voice & TTS
              </button>

              <button
                onClick={() => setActiveTab('vision')}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-btn text-xs font-bold uppercase tracking-wider transition-all text-left",
                  activeTab === 'vision'
                    ? "bg-accent-blue/10 text-accent-blue font-black"
                    : "text-text-tertiary hover:bg-white/5 hover:text-text-secondary"
                )}
              >
                <Eye size={16} />
                Vision
              </button>

              <div className="mt-auto p-2 bg-white/[0.02] border border-white/5 rounded-btn text-[9px] text-text-tertiary text-center leading-normal">
                Subscribed to <br />
                <span className="font-mono font-bold text-text-secondary">{activeAgentId}</span>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-bg-panel/20 custom-scrollbar">
              {activeTab === 'infra' && (
                <div className="space-y-5 max-w-[540px]">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Inference & Database Infrastructure</h3>
                    <p className="text-[11px] text-text-tertiary leading-normal mt-1">
                      Configure how this specific agent's cognition loops connect to Large Language Model backends and persistent storage.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Provider dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                        Inference Provider
                      </label>
                      <Dropdown
                        value={config.provider}
                        onChange={(val) => handleProviderChange(val as ProviderType)}
                        items={Object.entries(PROVIDER_INFO).map(([key, info]) => ({ value: key, label: info.label }))}
                        searchable
                      />
                    </div>

                    {/* Model (for non-Kaggle) */}
                    {config.provider !== 'kaggle' && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
                          Model
                        </label>
                        {PROVIDER_INFO[config.provider]?.models?.length ? (
                          <Dropdown
                            value={showCustomModel ? '__custom__' : (PROVIDER_INFO[config.provider]?.models?.includes(config.model || '') ? (config.model || '') : '__custom__')}
                            onChange={(val) => {
                              if (val === '__custom__') {
                                setShowCustomModel(true);
                                runtimeStore.setConfig(activeAgentId, { model: '' });
                              } else {
                                setShowCustomModel(false);
                                runtimeStore.setConfig(activeAgentId, { model: val });
                              }
                            }}
                            items={[
                              ...(PROVIDER_INFO[config.provider].models!).map((m) => ({ value: m, label: m })),
                              { value: '__custom__', label: 'Customâ€¦' },
                            ]}
                          />
                        ) : null}
                        {(showCustomModel || !PROVIDER_INFO[config.provider]?.models?.length) && (
                          <input
                            type="text"
                            value={config.model || ''}
                            onChange={(e) => runtimeStore.setConfig(activeAgentId, { model: e.target.value })}
                            placeholder={PROVIDER_INFO[config.provider]?.defaultModel || 'model-name'}
                            className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                          />
                        )}
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

                  {/* Connection Buttons and Status Row */}
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
                            Verifying Configâ€¦
                          </>
                        ) : sentOk ? (
                          <>
                            <CheckCircle size={12} />
                            Saved Successfully
                          </>
                        ) : (
                          <>
                            <WifiHigh size={14} />
                            Save Config
                          </>
                        )}
                      </button>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-9 px-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                      onClick={handleTestConnection}
                      disabled={connectionTest.status === 'testing' || !hasProviderConfig}
                      title={!hasProviderConfig ? 'Configure a provider + key first' : 'Send a test request to the provider'}
                    >
                      {connectionTest.status === 'testing' ? (
                        <ArrowsClockwise size={12} className="animate-spin" />
                      ) : (
                        <PlugsConnected size={14} />
                      )}
                      Test
                    </Button>

                    <div className={cn(
                      "flex items-center justify-between h-9 px-4 rounded-btn border min-w-[140px]",
                      "bg-bg-elevated border-border"
                    )}>
                      <div className="flex items-center gap-2">
                        <Circle size={6} className={statusChip.dot} />
                        <span className={cn("text-[9px] font-mono uppercase", statusChip.color)}>{statusChip.label}</span>
                      </div>
                    </div>

                    {(loopState === 'running' || loopState === 'paused' || loopState === 'stopped') && hasProviderConfig && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-9 px-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                        onClick={handlePauseResume}
                        title={loopState === 'running' ? 'Pause agent loop' : 'Resume agent loop'}
                      >
                        {loopState === 'running' ? (
                          <>
                            <Pause size={14} />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play size={14} />
                            Resume
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Connection Test Result */}
                  {connectionTest.status === 'ok' && (
                    <div className="flex items-center gap-2 p-3 rounded-btn border border-accent-green/30 bg-accent-green/5 text-accent-green">
                      <CheckCircle size={14} />
                      <span className="text-[10px] font-mono">
                        Connection OK â€” {connectionTest.latencyMs}ms round-trip
                      </span>
                    </div>
                  )}
                  {connectionTest.status === 'fail' && connectionTest.error && (
                    <div className="flex items-start gap-2 p-3 rounded-btn border border-accent-red/30 bg-accent-red/5 text-accent-red">
                      <WarningCircle size={14} className="mt-0.5 shrink-0" />
                      <span className="text-[10px] font-mono break-all">
                        Failed: {connectionTest.error}
                      </span>
                    </div>
                  )}

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
                        {config.supabaseUrl && <span className="text-accent-green/70">â— Active</span>}
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
                            placeholder="eyJhbGciâ€¦"
                            className="w-full h-8 px-2.5 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'memory' && (
                <div className="space-y-6 flex flex-col h-full">
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
                          const reward = m.rewardSignal ?? 0;
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
                                    <Bookmark size={11} className="text-accent-teal" />
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

              {activeTab === 'voice' && (
                <div className="space-y-5 max-w-[540px]">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Agent Voice & TTS Synthesis</h3>
                    <p className="text-[11px] text-text-tertiary leading-normal mt-1">
                      Configure text-to-speech settings, choose custom browser-native system voices, and tune playback behavior for {activeAgentId}.
                    </p>
                  </div>

                  {/* Enable/Disable Agent TTS */}
                  <div className="flex items-center justify-between p-4 rounded-btn border border-border bg-white/[0.01]">
                    <div className="space-y-0.5">
                      <label className="text-xs font-bold text-text-primary uppercase tracking-wider">Enable Voice Playback</label>
                      <p className="text-[10px] text-text-tertiary leading-normal">
                        Only text wrapped in <code className="text-accent-teal">{"<speak>...</speak>"}</code> tags is spoken aloud. Internal thoughts stay silent.
                      </p>
                    </div>
                    <button
                      onClick={() => setTtsEnabledForAgent(activeAgentId, !isAgentTtsEnabled)}
                      className={cn(
                        "px-4 h-8 rounded-btn text-[10px] font-bold uppercase tracking-wider border transition-all",
                        isAgentTtsEnabled
                          ? "border-accent-teal bg-accent-teal/10 text-text-primary font-bold"
                          : "border-border text-text-tertiary hover:border-text-secondary"
                      )}
                    >
                      {isAgentTtsEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* Voice Selector Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold flex justify-between">
                      <span>Select Speech Voice</span>
                      <span className="text-text-tertiary/50 font-normal">Browser-Native Web Speech API</span>
                    </label>
                    <Dropdown
                      value={selectedVoiceURI}
                      onChange={(val) => setVoiceForAgent(activeAgentId, val)}
                      disabled={!isAgentTtsEnabled}
                      searchable
                      placeholder={`System Default (${defaultVoice?.name || 'Loading...'})`}
                      items={[
                        { value: '', label: `System Default (${defaultVoice?.name || 'Loading...'})` },
                        ...availableVoices.map((voice) => ({
                          value: voice.voiceURI,
                          label: `${voice.name} (${voice.lang}) ${voice.localService ? '[Local]' : ''}`,
                        })),
                      ]}
                    />
                    {availableVoices.length === 0 && (
                      <p className="text-[9px] text-accent-amber mt-1">
                        No system voices detected yet. Ensure your device audio output is active or wait for browser voices to load.
                      </p>
                    )}
                  </div>

                  {/* Test Voice Button */}
                  <div className="pt-2">
                    <Button
                      variant="secondary"
                      disabled={!isAgentTtsEnabled}
                      onClick={async () => {
                        const voice = getSystemVoiceForAgent(activeAgentId);
                        const testText = "Hello! This is my synthesized voice. I am ready to think and learn in this simulation.";
                        try {
                          await ttsProvider.speak(testText, {
                            voiceURI: voice?.voiceURI,
                            volume: 1.0,
                          });
                        } catch {
                          synthiaToast.error("Failed to play voice test.");
                        }
                      }}
                      className="w-full h-9 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <SpeakerHigh size={14} />
                      Test Synthesized Voice
                    </Button>
                  </div>

                  {/* Multi-agent Audio Behavior (Global Option presented here for convenience) */}
                  <div className="space-y-3 border-t border-border-subtle pt-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Multi-Agent Concurrent Speech</h4>
                      <p className="text-[10px] text-text-tertiary leading-normal mt-1">
                        Configure how the application handles concurrent thoughts from non-active background agents.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setNonActiveBehavior('mute')}
                        className={cn(
                          "p-3 rounded-btn border text-left flex flex-col justify-between min-h-[70px] transition-all",
                          nonActiveBehavior === 'mute'
                            ? "border-accent-blue bg-accent-blue/5 text-text-primary"
                            : "border-border text-text-tertiary hover:border-text-secondary bg-white/[0.01]"
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">Mute Background (Option A)</span>
                        <span className="text-[9px] text-text-tertiary/80 leading-tight mt-1">
                          Only the active agent is spoken. Background thoughts are skipped to avoid browser queue lag.
                        </span>
                      </button>

                      <button
                        onClick={() => setNonActiveBehavior('attenuate')}
                        className={cn(
                          "p-3 rounded-btn border text-left flex flex-col justify-between min-h-[70px] transition-all",
                          nonActiveBehavior === 'attenuate'
                            ? "border-accent-blue bg-accent-blue/5 text-text-primary"
                            : "border-border text-text-tertiary hover:border-text-secondary bg-white/[0.01]"
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">Attenuate (Duck Volume)</span>
                        <span className="text-[9px] text-text-tertiary/80 leading-tight mt-1">
                          Background thoughts speak at 10% volume, queued behind the active agent's thoughts.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vision' && (
                <div className="space-y-5 max-w-[540px]">
                  <div>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">AI Perception Vision</h3>
                    <p className="text-[11px] text-text-tertiary leading-normal mt-1">
                      Tune how the agent's eyes work â€” wider FOV behaves like a first-person shooter's field of view, higher resolution costs more per frame.
                    </p>
                  </div>

                  {/* FOV Slider */}
                  <div className="space-y-2 p-4 rounded-btn border border-border bg-white/[0.01]">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Field of View (FOV)</label>
                      <span className="text-xs font-mono font-bold text-accent-blue">{aiVisionFov}Â°</span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="180"
                      step="1"
                      value={aiVisionFov}
                      onChange={(e) => setAiVisionFov(parseInt(e.target.value))}
                      className="w-full h-1 bg-bg-elevated rounded-lg appearance-none cursor-pointer accent-accent-blue"
                    />
                    <p className="text-[9px] text-text-tertiary leading-relaxed">
                      Higher FOV = wider view like FPS games (default 110Â°). Lower = tighter, more focused shots.
                    </p>
                  </div>

                  {/* Resolution Picker */}
                  <div className="space-y-2 p-4 rounded-btn border border-border bg-white/[0.01]">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">Render Resolution</label>
                      <span className="text-xs font-mono font-bold text-accent-blue">{aiVisionSize}Ã—{aiVisionSize}</span>
                    </div>
                    <div className="flex gap-2">
                      {VISION_SIZES.map((size) => (
                        <button
                          key={size}
                          onClick={() => setAiVisionSize(size)}
                          className={cn(
                            "flex-1 h-9 rounded-btn border text-[10px] font-bold transition-all",
                            aiVisionSize === size
                              ? "border-accent-blue bg-accent-blue/10 text-text-primary"
                              : "border-border text-text-tertiary hover:border-text-secondary"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    <p className={cn("text-[9px] leading-relaxed", aiVisionSize > 448 ? 'text-accent-amber' : 'text-text-tertiary')}>
                      {aiVisionSize > 448
                        ? `⚠ Higher resolutions increase API token/cost per frame significantly.`
                        : 'Default 448×448. Lower sizes reduce API cost; higher sizes improve detail but cost more.'}
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

