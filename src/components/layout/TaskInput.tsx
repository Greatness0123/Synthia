/**
 * Collapsible task input pill.
 * Collapsed: small pill below status bar, click to expand.
 * Expanded: full input bar. After submit, shows success indicator then auto-collapses.
 * Empty = free will. Occupied = task/training mode.
 */

import { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore } from '../../store/agentRuntimeStore';
import { X, Check } from '../ui/icons';
import { cn } from '../../utils/cn';

export const TaskInput: React.FC = () => {
  const { directiveMode, setDirectiveMode, currentGoal, setCurrentGoal } = useAgentStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const config = useAgentRuntimeStore((s) => s.configs[activeAgentId]);
  const [localValue, setLocalValue] = useState(currentGoal || '');
  const [expanded, setExpanded] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sync local state from store on agent/goal switch */
  useEffect(() => {
    setLocalValue(currentGoal || '');
    if (currentGoal) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [activeAgentId, currentGoal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasProvider = !!config?.endpoint;
  const isActive = directiveMode === 'training' && currentGoal;

  const handleSubmit = () => {
    const text = localValue.trim();
    if (!text) return;
    setCurrentGoal(text);
    setDirectiveMode('training');
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setExpanded(false);
    }, 1500);
  };

  const handleClear = () => {
    setLocalValue('');
    setCurrentGoal(null);
    setDirectiveMode('free_will');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setExpanded(false);
    }
  };

  // Collapsed pill
  if (!expanded && !showSuccess) {
    return (
      <button
        data-tour="task-input"
        onClick={() => { setExpanded(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          "fixed bottom-14 left-1/2 -translate-x-1/2 rounded-full flex items-center gap-2 px-4 py-2 transition-all z-50 cursor-pointer",
          "bg-bg-panel border border-white/10 hover:border-white/20",
          isActive && "border-white/30"
        )}
      >
        <span className="text-xs text-text-tertiary">Give SYNTHIA a task...</span>
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-text-primary animate-pulse" />
        )}
      </button>
    );
  }

  // Success indicator
  if (showSuccess) {
    return (
      <div className="fixed bottom-14 left-1/2 -translate-x-1/2 rounded-full flex items-center gap-2 px-4 py-2 bg-bg-panel border border-white/20 z-50">
        <Check size={14} className="text-text-primary" />
        <span className="text-xs text-text-primary font-medium">Task registered</span>
      </div>
    );
  }

  // Expanded input
  return (
    <div
      data-tour="task-input"
      className={cn(
        "fixed bottom-14 left-1/2 -translate-x-1/2 rounded-2xl flex items-center z-50",
        "w-[min(640px,calc(100vw-2rem))] h-12 px-4 gap-3",
        "bg-bg-panel border border-white/10",
        isActive && "border-white/30"
      )}
    >
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (!isActive) setExpanded(false); }}
        placeholder={hasProvider ? "Give SYNTHIA a task..." : "Set up an inference provider first"}
        disabled={!hasProvider}
        className={cn(
          "flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary",
          "outline-none ring-0 focus:outline-none focus:ring-0 focus:ring-transparent focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
        aria-label="Task input"
      />

      {localValue && (
        <button
          onClick={handleClear}
          className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Clear task"
          title="Terminate task and return to free will"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
