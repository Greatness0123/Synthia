/**
 * Input for injecting thoughts into the agent's stream.
 */

import { useState, useEffect } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { STRINGS } from '../../constants/strings';
import { Syringe, ArrowRight, Microphone } from '../ui/icons';
import { synthiaToast } from '../../utils/synthiaToast';
import { cn } from '../ui/Panel';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export const InjectionInput: React.FC = () => {
  const [value, setValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const activeAgentId = useAgentStore((state) => state.activeAgentId) || 'agent_0';
  const injectionQueue = useAgentStore((state) => state.agents?.[activeAgentId]?.injectionQueue) || [];
  const { setPendingInjectionForAgent } = useAgentStore();

  useEffect(() => {
    if (!SpeechRecognitionAPI) return;

    const rec = new SpeechRecognitionAPI();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setValue((prev) => (prev ? prev + ' ' + transcript : transcript));
        synthiaToast.success("Voice input captured.");
      }
    };

    rec.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.error !== 'no-speech') {
        synthiaToast.error(`Voice recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    setRecognition(rec);
  }, []);

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  const handleInject = () => {
    if (!value.trim()) return;

    const targetId = activeAgentId;

    // Client path: per-agent pendingInjection — the client-side AgentLoop for this
    // agent reads pendingInjection from store.agents[targetId] and consumes it.
    setPendingInjectionForAgent(targetId, value.trim());

    synthiaToast.info(STRINGS.TOASTS.THOUGHT_INJECTED);
    setValue('');
  };

  return (
    <div className="p-4 border-t border-border bg-bg-panel shrink-0">
      {injectionQueue.length > 0 && (
        <div className="mb-2 flex justify-end">
          <span className="text-[9px] font-bold uppercase tracking-tighter text-accent-purple bg-accent-purple/10 px-1.5 py-0.5 rounded-full border border-accent-purple/20">
            {injectionQueue.length} queued
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {SpeechRecognitionAPI && (
          <button
            onClick={toggleListening}
            aria-label={isListening ? "Stop voice listening" : "Start voice input"}
            title={isListening ? "Stop listening" : "Start voice input (STT)"}
            className={cn(
              "w-10 h-10 rounded-btn flex items-center justify-center border transition-all shrink-0",
              isListening
                ? "bg-accent-red/20 border-accent-red/50 text-accent-red animate-pulse"
                : "bg-bg-elevated border-border text-text-tertiary hover:text-text-primary hover:border-text-secondary"
            )}
          >
            <Microphone size={18} />
          </button>
        )}

        <div className="relative flex-1 flex items-center">
          <div className="absolute left-3 text-accent-purple">
            <Syringe size={16} />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInject()}
            placeholder={STRINGS.AGENT.INJECTION_PLACEHOLDER}
            className="w-full h-10 pl-10 pr-10 bg-bg-elevated border border-border rounded-btn text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue transition-all"
          />
          <button
            onClick={handleInject}
            disabled={!value.trim()}
            aria-label="Inject thought"
            className="absolute right-2 p-1.5 text-text-tertiary hover:text-accent-blue disabled:opacity-0 transition-all"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
