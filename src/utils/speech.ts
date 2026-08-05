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
 * Extracts the content of <speak>...</speak> tags from a text string.
 * Returns null when no <speak> tag is present (i.e. the thought should NOT be spoken).
 * The returned text has the tags themselves stripped so speech only carries the
 * intended spoken content, not the markup.
 */
export function extractSpeechContent(text: string): string | null {
  if (!text) return null;
  const match = text.match(/<speak\b[^>]*>([\s\S]*?)<\/speak>/i);
  if (!match) return null;
  return match[1]
    .replace(/<speak\b[^>]*>/gi, '')
    .replace(/<\/speak>/gi, '')
    .trim();
}

/**
 * Removes <speak> tags from a thought so the UI never shows raw markup.
 */
export function stripSpeechTags(text: string): string {
  if (!text) return text;
  return text.replace(/<speak\b[^>]*>/gi, '').replace(/<\/speak>/gi, '').trim();
}

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
 *
 * IMPORTANT: Only text wrapped in <speak>...</speak> is spoken aloud, and only
 * that content is broadcast to other agents via the `synthia:agent_spoke`
 * spatial event. Internal thoughts are silent — agents only "hear" what the
 * speaker intentionally says.
 */
export async function speakAgentThought(agentId: string, text: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const speechContent = extractSpeechContent(text);
  if (speechContent === null) return; // No <speak> tag — silent thought, nothing broadcast

  // Dispatch custom event for client-side agent perception (overhearing) tunnel.
  // Only the extracted spoken content is shared — not the full thought.
  window.dispatchEvent(new CustomEvent('synthia:agent_spoke', {
    detail: { agentId, text: speechContent }
  }));

  if (!window.speechSynthesis) return;

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
    await ttsProvider.speak(speechContent, {
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
