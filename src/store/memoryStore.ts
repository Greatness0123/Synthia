/**
 * Zustand store for live memory monitor snapshots.
 * Updated every 5s by the memory monitor interval.
 */

import { create } from 'zustand';
import type { MemorySnapshot } from '../world/engine/memoryMonitor';

interface MemoryState {
  snapshot: MemorySnapshot | null;
  setSnapshot: (s: MemorySnapshot) => void;
}

export const useMemoryStore = create<MemoryState>()((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => set({ snapshot }),
}));
