import { useSpeechStore } from '../store/speechStore';
import { useAgentStore } from '../store/agentStore';

export interface VoiceOptions {
  voiceURI?: string;
  volume?: number;
  rate?: number;
  pitch?: number;
}

export interface VoiceProvider {
  speak(text: string, options?: VoiceOptions): Promise<void>;
  stop(): void;
}

export class WebSpeechProvider implements VoiceProvider {
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  speak(text: string, options?: VoiceOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        reject(new Error('Web Speech API is not supported in this environment'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      if (options?.voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.voiceURI === options.voiceURI);
        if (voice) {
          utterance.voice = voice;
        }
      }

      utterance.volume = options?.volume ?? 1.0;
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      utterance.onend = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        resolve();
      };

      utterance.onerror = (e) => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        if (e.error === 'interrupted') {
          resolve(); // Interruption is normal, don't throw an error
        } else {
          reject(e);
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }
}

// Global provider instance
export const ttsProvider = new WebSpeechProvider();

/**
 * Resolves the system voice to use for a given agent.
 * Fallback to deterministic sequential assignment if no custom voice is selected.
 */
export function getSystemVoiceForAgent(agentId: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const { agentVoiceURIs } = useSpeechStore.getState();
  const selectedURI = agentVoiceURIs[agentId];

  if (selectedURI) {
    const voice = voices.find(v => v.voiceURI === selectedURI);
    if (voice) return voice;
  }

  // Fallback to sequential index-based assignment
  const agentIndex = parseInt(agentId.replace('agent_', ''), 10) || 0;
  return voices[agentIndex % voices.length];
}

/**
 * Coordinates and plays Speech Synthesis for an agent's completed thought.
 */
export async function speakAgentThought(agentId: string, text: string): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const { globalTtsEnabled, agentTtsEnabled, nonActiveBehavior } = useSpeechStore.getState();

  // If globally disabled, do not speak
  if (!globalTtsEnabled) return;

  // Check if speech is enabled for this specific agent (enabled by default if not set)
  const isEnabled = agentTtsEnabled[agentId] !== false;
  if (!isEnabled) return;

  const activeAgentId = useAgentStore.getState().activeAgentId;
  const isActive = agentId === activeAgentId;

  let volume = 1.0;

  if (isActive) {
    // If it's the active agent, cancel existing speech to start speaking immediately
    ttsProvider.stop();
    volume = 1.0;
  } else {
    // Non-active agent behavior
    if (nonActiveBehavior === 'mute') {
      // Skip speaking entirely for muted non-active agents
      return;
    } else if (nonActiveBehavior === 'attenuate') {
      volume = 0.1;
    }
  }

  const voice = getSystemVoiceForAgent(agentId);

  try {
    await ttsProvider.speak(text, {
      voiceURI: voice?.voiceURI,
      volume,
    });
  } catch (err) {
    console.error(`TTS Error for agent ${agentId}:`, err);
  }
}

/**
 * Initializes Speech Synthesis loading and hooks onto async voices changes.
 */
export function initSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const updateVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    useSpeechStore.getState().setAvailableVoices(voices);
  };

  // Bind the voices changed event
  window.speechSynthesis.onvoiceschanged = updateVoices;
  // Initial manual query
  updateVoices();
}
