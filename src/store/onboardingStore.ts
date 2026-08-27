/**
 * Zustand store for onboarding state.
 * Tracks completion, active step, and whether the tour is running.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'synthia:onboarding-complete';
const VERSION_KEY = 'synthia:onboarding-version';
const ONBOARDING_VERSION = 2;

interface OnboardingState {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  startedAt: number | null;

  setActive: (active: boolean) => void;
  setCurrentStep: (step: number) => void;
  setTotalSteps: (total: number) => void;
  markComplete: () => void;
  reset: () => void;
  shouldAutoStart: () => boolean;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  active: false,
  currentStep: 0,
  totalSteps: 6,
  startedAt: null,

  setActive: (active) => set({ active, startedAt: active ? Date.now() : null }),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setTotalSteps: (totalSteps) => set({ totalSteps }),

  markComplete: () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(VERSION_KEY, String(ONBOARDING_VERSION));
    set({ active: false, currentStep: 0, startedAt: null });
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VERSION_KEY);
    set({ active: false, currentStep: 0, startedAt: null });
  },

  shouldAutoStart: () => {
    if (window.innerWidth < 768) return false;
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      const v = parseInt(localStorage.getItem(VERSION_KEY) || '0', 10);
      if (v >= ONBOARDING_VERSION) return false;
    }
    return true;
  },
}));
