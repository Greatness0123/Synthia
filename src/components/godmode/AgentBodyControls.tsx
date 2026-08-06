/**
 * Agent-specific body controls (mode, multi-body PD, pose reset).
 */

import React from 'react';
import { useAgentStore } from '../../store/agentStore';
import { Button } from '../ui/Button';
import { STRINGS } from '../../constants/strings';
import { Bot, Zap, RefreshCw } from '../ui/icons';

export const AgentBodyControls: React.FC = () => {
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const bodyMode = useAgentStore((state) => state.bodyMode);
  const useMultiBodyPD = useAgentStore((state) => state.useMultiBodyPD);
  const { setBodyMode, setUseMultiBodyPD } = useAgentStore();

  const handleResetPose = () => {
    window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: activeAgentId } }));
  };

  const handleSetBodyMode = (mode: 'rigid' | 'ragdoll') => {
    setBodyMode(mode);
    window.dispatchEvent(new CustomEvent('synthia:setBodyMode', { detail: { agentId: activeAgentId, mode } }));
  };

  const handleToggleMultiBodyPD = () => {
    const nextEnable = !useMultiBodyPD;
    setUseMultiBodyPD(nextEnable);
    window.dispatchEvent(new CustomEvent('synthia:toggleMultiBodyPD', { detail: { agentId: activeAgentId, enable: nextEnable } }));
  };

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4 flex items-center gap-1.5">
        <Bot size={12} />
        {STRINGS.GOD_MODE.BODY}
      </h3>

      <div className="space-y-4">
        <div className="flex gap-2 p-1 bg-bg-elevated rounded-btn">
          {(['rigid', 'ragdoll'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleSetBodyMode(mode)}
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-badge transition-all ${
                bodyMode === mode
                  ? "bg-bg-panel text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary flex items-center gap-1.5"><Zap size={10} /> Multi-Body PD Motors</label>
          <button
            onClick={handleToggleMultiBodyPD}
            className={`w-8 h-4 rounded-full transition-colors relative ${useMultiBodyPD ? 'bg-accent-blue' : 'bg-bg-elevated'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${useMultiBodyPD ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>

        <Button variant="secondary" size="sm" className="w-full text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5" onClick={handleResetPose}>
          <RefreshCw size={10} />
          {STRINGS.GOD_MODE.RESET_POSE}
        </Button>
      </div>
    </div>
  );
};
