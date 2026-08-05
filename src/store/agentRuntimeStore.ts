/**
 * Zustand store for per-agent runtime inference configuration.
 *
 * The global connectionStore remains the source of defaults for newly spawned
 * agents. This store holds per-agent OVERRIDES: when an agent has an override
 * for a field, loops use it; otherwise they fall back to the global values.
 *
 * API keys are intentionally NOT persisted via zustand persist — they live in
 * sessionStorage keyed by agentId (same pattern as ConnectionPanel).
 */

import { create } from 'zustand';
import { useConnectionStore, type ProviderType } from './connectionStore';

export interface AgentRuntimeConfig {
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
  cycleMs: number;
  supabaseUrl: string;
  supabaseKey: string;
}

export type AgentRuntimeConfigKey = keyof AgentRuntimeConfig;

/** Runtime state of an agent's cognitive loop. */
export type AgentLoopState = 'not_started' | 'running' | 'stopped' | 'paused' | 'error';

const OVERRIDABLE_KEYS: AgentRuntimeConfigKey[] = [
  'provider',
  'endpoint',
  'apiKey',
  'model',
  'cycleMs',
  'supabaseUrl',
  'supabaseKey',
];

const API_KEY_SESSION_PREFIX = 'synthia_agent_apikey_';
const CYCLE_MS_SESSION_PREFIX = 'synthia_agent_cyclems_';

function loadApiKey(agentId: string): string {
  try {
    return sessionStorage.getItem(`${API_KEY_SESSION_PREFIX}${agentId}`) || '';
  } catch {
    return '';
  }
}

function loadCycleMs(agentId: string): number | null {
  try {
    const raw = sessionStorage.getItem(`${CYCLE_MS_SESSION_PREFIX}${agentId}`);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 250 ? parsed : null;
  } catch {
    return null;
  }
}

function persistApiKey(agentId: string, apiKey: string): void {
  try {
    if (apiKey) {
      sessionStorage.setItem(`${API_KEY_SESSION_PREFIX}${agentId}`, apiKey);
    } else {
      sessionStorage.removeItem(`${API_KEY_SESSION_PREFIX}${agentId}`);
    }
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

function persistCycleMs(agentId: string, cycleMs: number): void {
  try {
    if (cycleMs > 0) {
      sessionStorage.setItem(`${CYCLE_MS_SESSION_PREFIX}${agentId}`, String(cycleMs));
    }
  } catch {
    /* ignore */
  }
}

function defaultConfigFor(agentId: string): AgentRuntimeConfig {
  const conn = useConnectionStore.getState();
  const storedCycle = loadCycleMs(agentId);
  return {
    provider: conn.provider,
    endpoint: conn.inferenceEndpoint,
    apiKey: loadApiKey(agentId) || conn.providerApiKey,
    model: conn.providerModel,
    cycleMs: storedCycle ?? conn.cycleMs ?? 2000,
    supabaseUrl: conn.supabaseUrl,
    supabaseKey: conn.supabaseKey,
  };
}

interface AgentRuntimeStoreState {
  /** Full effective config per agentId (defaults when no override is set). */
  configs: Record<string, AgentRuntimeConfig>;
  /** Subset of keys that were explicitly overridden per agentId. */
  overrides: Record<string, Partial<Record<AgentRuntimeConfigKey, boolean>>>;
  /** Live loop state per agentId (drives the connection status chip). */
  loopStates: Record<string, AgentLoopState>;

  getConfig: (agentId: string) => AgentRuntimeConfig;
  hasOverride: (agentId: string, key: AgentRuntimeConfigKey) => boolean;
  setConfig: (agentId: string, patch: Partial<AgentRuntimeConfig>) => void;
  setApiKey: (agentId: string, apiKey: string) => void;
  setCycleMsOverride: (agentId: string, cycleMs: number) => void;
  setLoopState: (agentId: string, state: AgentLoopState) => void;
  getLoopState: (agentId: string) => AgentLoopState;
  resetToGlobal: (agentId: string, ...keys: AgentRuntimeConfigKey[]) => void;
  resetAgent: (agentId: string) => void;
}

export const useAgentRuntimeStore = create<AgentRuntimeStoreState>((set, get) => ({
  configs: {},
  overrides: {},
  loopStates: {},

  getConfig: (agentId) => {
    const state = get();
    if (!agentId) return defaultConfigFor('agent_0');
    const existing = state.configs[agentId];
    if (!existing) {
      const defaults = defaultConfigFor(agentId);
      set({ configs: { ...state.configs, [agentId]: defaults } });
      return defaults;
    }
    return existing;
  },

  hasOverride: (agentId, key) => {
    return !!get().overrides[agentId]?.[key];
  },

  setConfig: (agentId, patch) => {
    if (!agentId) return;
    const state = get();
    const current = state.configs[agentId] || defaultConfigFor(agentId);
    const merged = { ...current, ...patch };

    if (patch.apiKey !== undefined) {
      persistApiKey(agentId, patch.apiKey);
    }
    if (patch.cycleMs !== undefined) {
      persistCycleMs(agentId, patch.cycleMs);
    }

    const overrideKeys: Partial<Record<AgentRuntimeConfigKey, boolean>> = {
      ...(state.overrides[agentId] || {}),
    };
    for (const key of OVERRIDABLE_KEYS) {
      if (patch[key] !== undefined) {
        overrideKeys[key] = true;
      }
    }

    set({
      configs: { ...state.configs, [agentId]: merged },
      overrides: { ...state.overrides, [agentId]: overrideKeys },
    });
  },

  setApiKey: (agentId, apiKey) => {
    get().setConfig(agentId, { apiKey });
  },

  setCycleMsOverride: (agentId, cycleMs) => {
    get().setConfig(agentId, { cycleMs });
  },

  setLoopState: (agentId, loopState) => {
    if (!agentId) return;
    set((state) => ({ loopStates: { ...state.loopStates, [agentId]: loopState } }));
  },

  getLoopState: (agentId) => {
    return get().loopStates[agentId] || 'not_started';
  },

  resetToGlobal: (agentId, ...keys) => {
    if (!agentId) return;
    const state = get();
    const current = state.configs[agentId] || defaultConfigFor(agentId);
    const conn = useConnectionStore.getState();
    const next = { ...current };
    const overrideKeys = { ...(state.overrides[agentId] || {}) };

    const resetKeys = keys.length > 0 ? keys : (OVERRIDABLE_KEYS as AgentRuntimeConfigKey[]);
    for (const key of resetKeys) {
      switch (key) {
        case 'provider': next.provider = conn.provider; break;
        case 'endpoint': next.endpoint = conn.inferenceEndpoint; break;
        case 'apiKey':
          next.apiKey = conn.providerApiKey;
          persistApiKey(agentId, '');
          break;
        case 'model': next.model = conn.providerModel; break;
        case 'cycleMs':
          next.cycleMs = conn.cycleMs || 2000;
          try { sessionStorage.removeItem(`${CYCLE_MS_SESSION_PREFIX}${agentId}`); } catch { /* ignore */ }
          break;
        case 'supabaseUrl': next.supabaseUrl = conn.supabaseUrl; break;
        case 'supabaseKey': next.supabaseKey = conn.supabaseKey; break;
      }
      delete overrideKeys[key];
    }

    set({
      configs: { ...state.configs, [agentId]: next },
      overrides: { ...state.overrides, [agentId]: overrideKeys },
    });
  },

  resetAgent: (agentId) => {
    if (!agentId) return;
    const state = get();
    const configs = { ...state.configs };
    const overrides = { ...state.overrides };
    delete configs[agentId];
    delete overrides[agentId];
    try {
      sessionStorage.removeItem(`${API_KEY_SESSION_PREFIX}${agentId}`);
      sessionStorage.removeItem(`${CYCLE_MS_SESSION_PREFIX}${agentId}`);
    } catch {
      /* ignore */
    }
    set({ configs, overrides });
  },
}));
