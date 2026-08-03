import { useState } from 'react';
import { useConnectionStore, type ProviderType } from '../../store/connectionStore';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore, type AgentRuntimeConfig } from '../../store/agentRuntimeStore';
import { useCoordinator } from '../../world/hooks/useCoordinator';
import { STRINGS } from '../../constants/strings';
import { CaretDown, CaretUp, Circle, ArrowsClockwise, CheckCircle, WifiHigh } from '@phosphor-icons/react';
import { synthiaToast } from '../ui/Toast';

const PROVIDER_INFO: Record<ProviderType, { label: string; defaultEndpoint: string; defaultModel: string; needsKey: boolean }> = {
  kaggle:     { label: 'Kaggle / Cloudflare', defaultEndpoint: 'http://localhost:8000/infer', defaultModel: 'Qwen2.5-VL-3B-Instruct', needsKey: false },
  gemini:     { label: 'Google Gemini',        defaultEndpoint: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash', needsKey: true },
  nim:        { label: 'NVIDIA NIM',           defaultEndpoint: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.1-8b-instruct', needsKey: true },
  openrouter: { label: 'OpenRouter',           defaultEndpoint: 'https://openrouter.ai/api/v1', defaultModel: 'meta-llama/llama-3.1-8b-instruct', needsKey: true },
  groq:       { label: 'Groq',                 defaultEndpoint: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.1-8b-instant', needsKey: true },
  custom:     { label: 'Custom (OpenAI-compat)', defaultEndpoint: '', defaultModel: '', needsKey: true },
};

export const ConnectionPanel: React.FC = () => {
  const { endpoint, setEndpoint, status, rtt } = useConnectionStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const runtimeStore = useAgentRuntimeStore();
  const config = runtimeStore.getConfig(activeAgentId);

  const { sendMessage } = useCoordinator();

  const [dbExpanded, setDbExpanded] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

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
    sendMessage('set_supabase', { url: config.supabaseUrl, key: config.supabaseKey });

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

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4">
        {STRINGS.GOD_MODE.CONNECTION}
      </h3>

      <div className="space-y-4">

        {/* Coordinator WebSocket URL - Shared World Level */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary font-bold">
            COORDINATOR ENDPOINT
            <span className="ml-1 text-text-tertiary/50 font-normal">(ws://) [GLOBAL]</span>
          </label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="ws://localhost:3001/ws"
            className="w-full h-8 px-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
          />
        </div>

        {/* Provider dropdown */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Inference Provider
          </label>
          <div className="relative">
            <select
              value={config.provider}
              onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
              className="w-full h-8 px-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-blue"
            >
              {Object.entries(PROVIDER_INFO).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
            <CaretDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          </div>
        </div>

        {/* API Key (conditional) */}
        {showApiKey && (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-text-tertiary">
              API Key
              <span className="ml-1 text-text-tertiary/50">(session only)</span>
            </label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => runtimeStore.setConfig(activeAgentId, { apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full h-8 px-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
            />
          </div>
        )}

        {/* Model (for non-Kaggle) */}
        {config.provider !== 'kaggle' && (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-text-tertiary">
              Model
            </label>
            <input
              type="text"
              value={config.model || ''}
              onChange={(e) => runtimeStore.setConfig(activeAgentId, { model: e.target.value })}
              placeholder={PROVIDER_INFO[config.provider]?.defaultModel || 'model-name'}
              className="w-full h-8 px-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
            />
          </div>
        )}

        {/* Inference Endpoint */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">
            {config.provider === 'kaggle' ? 'Kaggle Inference Endpoint' : 'API Base URL'}
          </label>
          <input
            type="text"
            value={config.endpoint || ''}
            onChange={(e) => runtimeStore.setConfig(activeAgentId, { endpoint: e.target.value })}
            placeholder={PROVIDER_INFO[config.provider]?.defaultEndpoint || 'https://...'}
            className="w-full h-8 px-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
          />
        </div>

        {/* Connect / Apply button */}
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
              Sending…
            </>
          ) : sentOk ? (
            <>
              <CheckCircle size={12} weight="fill" />
              Sent — AI Thinking
            </>
          ) : (
            <>
              <WifiHigh size={12} />
              {STRINGS.GOD_MODE.CONNECT}
            </>
          )}
        </button>

        {/* Status badge */}
        <div className={`flex items-center justify-between px-2 py-1.5 rounded-btn border ${statusBg[status]}`}>
          <div className="flex items-center gap-2">
            <Circle size={7} weight="fill" className={`${statusColors[status]} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] font-mono text-text-secondary uppercase">{status}</span>
          </div>
          <span className="text-[10px] font-mono text-text-tertiary">{rtt > 0 ? `${rtt}ms` : '—'}</span>
        </div>

        {/* Cycle speed */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] uppercase tracking-wider text-text-tertiary">Cycle Speed</label>
            <span className="text-[10px] font-mono text-text-secondary">{config.cycleMs}ms</span>
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
        </div>

        {/* Database Section */}
        <div className="border border-border rounded-btn overflow-hidden">
          <button
            onClick={() => setDbExpanded(!dbExpanded)}
            className="w-full px-3 py-2 flex items-center justify-between bg-bg-elevated/20 hover:bg-bg-elevated/40 transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
              {STRINGS.GOD_MODE.DATABASE}
              {config.supabaseUrl && <span className="ml-2 text-accent-green/70">●</span>}
            </span>
            {dbExpanded ? <CaretDown size={12} /> : <CaretUp size={12} />}
          </button>

          {dbExpanded && (
            <div className="p-3 space-y-3 bg-bg-elevated/10">
              <p className="text-[9px] text-text-tertiary leading-relaxed">
                Optional — fill in for persistent AI memory. Leave blank to run with in-memory store.
              </p>
              <div className="space-y-1">
                <label className="text-[9px] uppercase text-text-tertiary">Supabase URL</label>
                <input
                  type="text"
                  value={config.supabaseUrl || ''}
                  onChange={(e) => runtimeStore.setConfig(activeAgentId, { supabaseUrl: e.target.value })}
                  placeholder="https://xxxx.supabase.co"
                  className="w-full h-7 px-2 bg-bg-elevated border border-border rounded-btn text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase text-text-tertiary">Anon Key</label>
                <input
                  type="password"
                  value={config.supabaseKey || ''}
                  onChange={(e) => runtimeStore.setConfig(activeAgentId, { supabaseKey: e.target.value })}
                  placeholder="eyJhbGci…"
                  className="w-full h-7 px-2 bg-bg-elevated border border-border rounded-btn text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
