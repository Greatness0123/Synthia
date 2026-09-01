/**
 * Input for injecting thoughts into the agent's stream.
 * Supports continuous voice transcription until user stops or timeout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { STRINGS } from '../../constants/strings';
import { Syringe, ArrowRight, Microphone, StopSquare } from '../ui/icons';
import { synthiaToast } from '../../utils/synthiaToast';
import { cn } from '../../utils/cn';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export const InjectionInput: React.FC = () => {
  const [value, setValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const activeAgentId = useAgentStore((state) => state.activeAgentId) || 'agent_0';
  const injectionQueue = useAgentStore((state) => state.agents?.[activeAgentId]?.injectionQueue) || [];
  const { setPendingInjectionForAgent } = useAgentStore();

  const recognitionRef = useRef<any>(null);
  const userStoppedRef = useRef(false);
  const resultIndexRef = useRef(0);

  const createRecognition = useCallback(() => {
    if (!SpeechRecognitionAPI) return null;

    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = resultIndexRef.current; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }
      resultIndexRef.current = event.results.length;

      if (finalTranscript) {
        const trimmed = finalTranscript.trim();
        setValue((prev) => (prev ? prev + ' ' + trimmed : trimmed));
        synthiaToast.success("Voice input captured.");
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (!userStoppedRef.current) {
          setTimeout(() => {
            try {
              resultIndexRef.current = 0;
              rec.start();
            } catch { /* speech API may throw if already started */ }
          }, 300);
        }
        return;
      }
      console.error("Speech Recognition Error:", event.error);
      synthiaToast.error(`Voice recognition error: ${event.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      if (!userStoppedRef.current) {
        setTimeout(() => {
          try {
            resultIndexRef.current = 0;
            rec.start();
          } catch { /* speech API may throw if already started */ }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    return rec;
  }, []);

  useEffect(() => {
    recognitionRef.current = createRecognition();
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* cleanup may throw */ }
      }
    };
  }, [createRecognition]);

  const toggleListening = () => {
    const rec = recognitionRef.current;
    if (!rec) return;

    if (isListening) {
      userStoppedRef.current = true;
      try { rec.stop(); } catch { /* speech API may throw if already stopped */ }
      setIsListening(false);
    } else {
      userStoppedRef.current = false;
      resultIndexRef.current = 0;
      try { rec.start(); } catch { /* speech API may throw if already started */ }
    }
  };

  const handleInject = () => {
    if (!value.trim()) return;

    const targetId = activeAgentId;
    setPendingInjectionForAgent(targetId, value.trim());

    synthiaToast.info(STRINGS.TOASTS.THOUGHT_INJECTED);
    setValue('');
  };

  return (
    <div className="p-4 border-t border-border bg-bg-panel shrink-0">
      {injectionQueue.length > 0 && (
        <div className="mb-2 flex justify-end">
          <span className="text-xs text-text-secondary bg-white/10 px-1.5 py-0.5 rounded-full border border-white/20">
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
                ? "bg-red-500/20 border-red-500/50 text-red-400 animate-pulse"
                : "bg-bg-elevated border-border text-text-tertiary hover:text-text-primary hover:border-text-secondary"
            )}
          >
            {isListening ? <StopSquare size={18} /> : <Microphone size={18} />}
          </button>
        )}

        <div className="relative flex-1 flex items-center">
          <div className="absolute left-3 text-text-tertiary">
            <Syringe size={16} />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInject()}
            placeholder={STRINGS.AGENT.INJECTION_PLACEHOLDER}
            className="w-full h-10 pl-10 pr-10 bg-bg-elevated border border-border rounded-btn text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
          />
          <button
            onClick={handleInject}
            disabled={!value.trim()}
            aria-label="Inject thought"
            className="absolute right-2 p-1.5 text-text-tertiary hover:text-text-primary disabled:opacity-0 transition-all"
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
