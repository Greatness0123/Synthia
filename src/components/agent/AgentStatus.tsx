/**
 * Header for the agent panel showing the active agent's name + status.
 */

import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore } from '../../store/agentRuntimeStore';
import { Badge } from '../ui/Badge';
import { Brain } from '@phosphor-icons/react';
import { cn } from '../ui/Panel';
import { STRINGS } from '../../constants/strings';

export const AgentStatus: React.FC = () => {
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const loopState = useAgentRuntimeStore((state) => state.loopStates[activeAgentId] || 'not_started');

  const statusLabel = loopState === 'running' ? 'thinking'
    : loopState === 'paused' ? 'paused'
    : loopState === 'stopped' ? 'stopped'
    : loopState === 'error' ? 'error'
    : 'idle';

  return (
    <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-bg-panel">
      <div className="flex items-center gap-2">
        <Brain size={20} className="text-accent-purple" weight="light" />
        <h2 className="text-sm font-medium">{STRINGS.AGENT.NAME_LABEL || activeAgentId}</h2>
      </div>
      <Badge
        variant={loopState === 'running' ? 'accent' : 'default'}
        className={cn(loopState === 'running' && 'animate-pulse')}
      >
        {statusLabel}
      </Badge>
    </div>
  );
};
