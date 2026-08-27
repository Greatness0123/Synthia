/**
 * Zustand store for training-mode state: early-termination (ET) configuration
 * and episode bookkeeping.
 *
 * The store is dormant when directiveMode !== 'training' (read by callers).
 * ET only fires while both `etEnabled` is true and the active agent's
 * directiveMode is 'training'.
 */

import { create } from 'zustand';

interface TrainingState {
  // ── Early-termination config ──────────────────────────────────────
  etEnabled: boolean;
  healthyHeightMin: number;
  healthyHeightMax: number;
  maxEpisodeSeconds: number;
  terminateOnOutOfBounds: boolean;

  // ── Episode bookkeeping (read-only display; mutated by useWorld) ─
  currentEpisode: number;
  episodeStartTime: number;
  episodeAccumulatedReward: number;
  lastTerminationReason: string | null;

  // ── Actions ───────────────────────────────────────────────────────
  setEtEnabled: (enabled: boolean) => void;
  setHealthyHeightMin: (meters: number) => void;
  setHealthyHeightMax: (meters: number) => void;
  setMaxEpisodeSeconds: (seconds: number) => void;
  setTerminateOnOutOfBounds: (enabled: boolean) => void;
  startNewEpisode: (nowMs: number) => void;
  addEpisodeReward: (reward: number) => void;
  setLastTerminationReason: (reason: string | null) => void;
}

const STORAGE_KEY = 'synthia_training_session';

const defaults = {
  etEnabled: false,
  healthyHeightMin: 0.8,
  healthyHeightMax: 2.5,
  maxEpisodeSeconds: 120,
  terminateOnOutOfBounds: true,
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
  ...defaults,
  currentEpisode: 0,
  episodeStartTime: 0,
  episodeAccumulatedReward: 0,
  lastTerminationReason: null,

  setEtEnabled: (etEnabled) => {
    set({ etEnabled });
    persist(get());
  },
  setHealthyHeightMin: (healthyHeightMin) => {
    const max = get().healthyHeightMax;
    set({ healthyHeightMin: Math.min(healthyHeightMin, max - 0.1) });
    persist(get());
  },
  setHealthyHeightMax: (healthyHeightMax) => {
    const min = get().healthyHeightMin;
    set({ healthyHeightMax: Math.max(healthyHeightMax, min + 0.1) });
    persist(get());
  },
  setMaxEpisodeSeconds: (maxEpisodeSeconds) => {
    set({ maxEpisodeSeconds });
    persist(get());
  },
  setTerminateOnOutOfBounds: (terminateOnOutOfBounds) => {
    set({ terminateOnOutOfBounds });
    persist(get());
  },
  startNewEpisode: (nowMs) => {
    set((s) => ({
      currentEpisode: s.currentEpisode + 1,
      episodeStartTime: nowMs,
      episodeAccumulatedReward: 0,
      lastTerminationReason: null,
    }));
  },
  addEpisodeReward: (reward) => {
    set((s) => ({ episodeAccumulatedReward: s.episodeAccumulatedReward + reward }));
  },
  setLastTerminationReason: (reason) => {
    set({ lastTerminationReason: reason });
  },
}));

function persist(state: TrainingState): void {
  try {
    const data = {
      etEnabled: state.etEnabled,
      healthyHeightMin: state.healthyHeightMin,
      healthyHeightMax: state.healthyHeightMax,
      maxEpisodeSeconds: state.maxEpisodeSeconds,
      terminateOnOutOfBounds: state.terminateOnOutOfBounds,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — ignore.
  }
}

// One-shot session restore on module load. Runs once at import time.
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    useTrainingStore.setState({ ...defaults, ...data });
  }
} catch {
  // Corrupt JSON — leave defaults in place.
}
