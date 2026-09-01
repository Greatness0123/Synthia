import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SimplifiedVoice {
  voiceURI: string;
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

export interface SpeechUtterance {
  id: string;
  speakerId: string;
  text: string;
  position: { x: number; y: number; z: number };
  timestamp: number;
  deliveredTo: string[];
}

interface SpeechState {
  globalTtsEnabled: boolean;
  nonActiveBehavior: 'mute' | 'attenuate';
  agentVoiceURIs: Record<string, string>;
  agentTtsEnabled: Record<string, boolean>;
  availableVoices: SimplifiedVoice[];
  utterances: SpeechUtterance[];

  setGlobalTtsEnabled: (enabled: boolean) => void;
  setNonActiveBehavior: (behavior: 'mute' | 'attenuate') => void;
  setVoiceForAgent: (agentId: string, voiceURI: string) => void;
  setTtsEnabledForAgent: (agentId: string, enabled: boolean) => void;
  setAvailableVoices: (voices: SpeechSynthesisVoice[]) => void;
  addUtterance: (utterance: SpeechUtterance) => void;
  markUtteranceDelivered: (id: string, agentId: string) => void;
  clearExpiredUtterances: (expiryMs: number) => void;
}

export const useSpeechStore = create<SpeechState>()(
  persist(
    (set) => ({
      globalTtsEnabled: false,
      nonActiveBehavior: 'mute',
      agentVoiceURIs: {},
      agentTtsEnabled: {},
      availableVoices: [],
      utterances: [],

      setGlobalTtsEnabled: (globalTtsEnabled) => set({ globalTtsEnabled }),
      setNonActiveBehavior: (nonActiveBehavior) => set({ nonActiveBehavior }),
      setVoiceForAgent: (agentId, voiceURI) =>
        set((state) => ({
          agentVoiceURIs: { ...state.agentVoiceURIs, [agentId]: voiceURI },
        })),
      setTtsEnabledForAgent: (agentId, enabled) =>
        set((state) => ({
          agentTtsEnabled: { ...state.agentTtsEnabled, [agentId]: enabled },
        })),
      setAvailableVoices: (voices) =>
        set({
          availableVoices: voices.map((v) => ({
            voiceURI: v.voiceURI,
            name: v.name,
            lang: v.lang,
            default: v.default,
            localService: v.localService,
          })),
        }),
      addUtterance: (utterance) =>
        set((state) => ({
          utterances: [...state.utterances, utterance],
        })),
      markUtteranceDelivered: (id, agentId) =>
        set((state) => ({
          utterances: state.utterances.map((u) =>
            u.id === id
              ? { ...u, deliveredTo: [...u.deliveredTo, agentId] }
              : u
          ),
        })),
      clearExpiredUtterances: (expiryMs) =>
        set((state) => {
          const limit = Date.now() - expiryMs;
          return {
            utterances: state.utterances.filter((u) => u.timestamp > limit),
          };
        }),
    }),
    {
      name: 'synthia_speech_config',
      partialize: (state) => ({
        globalTtsEnabled: state.globalTtsEnabled,
        nonActiveBehavior: state.nonActiveBehavior,
        agentVoiceURIs: state.agentVoiceURIs,
        agentTtsEnabled: state.agentTtsEnabled,
      }),
    }
  )
);
