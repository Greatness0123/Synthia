/**
 * Agent-specific body controls (pose reset).
 */

import React from 'react';
import { useAgentStore } from '../../store/agentStore';
import { Button } from '../ui/Button';
import { STRINGS } from '../../constants/strings';
import { RefreshCw } from '../ui/icons';

export const AgentBodyControls: React.FC = () => {
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const { setBodyMode } = useAgentStore();

  const handleResetPose = () => {
    window.dispatchEvent(new CustomEvent('synthia:resetPose', { detail: { agentId: activeAgentId } }));
  };

  return (
    <div className="p-4 border-t border-border">
      {/* <h3 className="text-xs font-medium text-text-tertiary mb-4 flex items-center gap-1.5">
        <Bot size={12} />
        {STRINGS.GOD_MODE.BODY}
      </h3> */}

      <div className="space-y-4">
        <Button variant="secondary" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5" onClick={handleResetPose}>
          <RefreshCw size={12} />
          {STRINGS.GOD_MODE.RESET_POSE}
        </Button>
      </div>
    </div>
  );
};
