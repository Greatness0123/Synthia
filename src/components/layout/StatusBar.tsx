import { useConnectionStore } from '../../store/connectionStore';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore } from '../../store/agentRuntimeStore';
import { cn } from '../ui/Panel';

const Metric = ({ label, value, colorClass = "text-text-secondary" }: { label: string, value: string | number, colorClass?: string }) => (
  <div className="flex items-center gap-1.5 px-2.5 h-full border-r border-white/10 last:border-r-0">
    <span className="text-[9px] text-text-tertiary uppercase">{label}</span>
    <span className={cn("text-[10px] font-mono", colorClass)}>{value}</span>
  </div>
);

/**
 * Floating glassmorphic metrics pill at bottom-center of viewport.
 * Shows only client-side metrics — RTT/Inference are removed (coordinator-era).
 */
export const StatusBar: React.FC = () => {
  const { frameSize } = useConnectionStore();
  const { heartbeat, lightState, activeAgentId } = useAgentStore();
  const loopState = useAgentRuntimeStore((s) => s.loopStates[activeAgentId] || 'not_started');
  const cycleMs = useAgentRuntimeStore((s) => s.configs[activeAgentId]?.cycleMs ?? useConnectionStore.getState().cycleMs ?? 2000);

  const loopColor = loopState === 'running' ? 'text-accent-green'
    : loopState === 'error' ? 'text-accent-red'
    : loopState === 'paused' ? 'text-accent-amber'
    : 'text-text-tertiary';

  const dotColor = loopState === 'running' ? 'bg-accent-green animate-pulse'
    : loopState === 'error' ? 'bg-accent-red'
    : loopState === 'paused' ? 'bg-accent-amber'
    : 'bg-text-tertiary';

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glassmorphism rounded-full flex items-center h-9 px-1 z-50">
      {/* Agent loop status dot */}
      <div className="flex items-center gap-1.5 px-2.5 border-r border-white/10 h-full">
        <div className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />
        <span className={cn("text-[9px] font-mono uppercase", loopColor)}>{loopState.replace('_', ' ')}</span>
      </div>

      <Metric
        label="Cycle"
        value={`${(cycleMs / 1000).toFixed(1)}s`}
      />
      <Metric
        label="Frame"
        value={frameSize != null && frameSize > 0 ? `${(frameSize / 1024).toFixed(1)}KB` : '—'}
      />
      <Metric label="HB" value={heartbeat} />
      <Metric label="Light" value={lightState.toUpperCase()} />
    </div>
  );
};
