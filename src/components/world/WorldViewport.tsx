import React, { useRef, useEffect } from 'react';
import { ModelInputPiP } from './ModelInputPiP';
import { PianoReward } from './PianoReward';
import { useWorld } from '../../world/hooks/useWorld';
import { useWorldStore } from '../../store/worldStore';
import { Spinner } from '@phosphor-icons/react';
import { STRINGS } from '../../constants/strings';

/**
 * The Three.js 3D world viewport.
 */
export const WorldViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isReady, detectOutcomes } = useWorld(containerRef);
  const showAIPiP = useWorldStore(state => state.showAIPiP);
  const [pianoRewards, setPianoRewards] = React.useState<{id: string, reward: number, x: number, y: number}[]>([]);

  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      const outcomes = detectOutcomes();
      outcomes.forEach(outcome => {
        if (outcome.data?.description?.includes('piano')) {
          setPianoRewards(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            reward: outcome.data.reward,
            x: window.innerWidth / 2 + (Math.random() - 0.5) * 100, // Placeholder projection
            y: window.innerHeight / 2 + (Math.random() - 0.5) * 100
          }]);
          setTimeout(() => setPianoRewards(prev => prev.slice(1)), 1000);
        }
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isReady, detectOutcomes]);

  return (
    <div ref={containerRef} className="w-full h-full bg-bg-primary relative flex items-center justify-center overflow-hidden">
      {!isReady && (
        <div className="flex flex-col items-center gap-4 z-10">
          <Spinner className="w-8 h-8 text-accent-blue animate-spin" />
          <span className="text-xs font-mono text-text-secondary tracking-widest">
            {STRINGS.WORLD.LOADING}
          </span>
        </div>
      )}

      {showAIPiP && <ModelInputPiP />}

      {(pianoRewards || []).map(pr => (
        <PianoReward key={pr.id} reward={pr.reward} x={pr.x} y={pr.y} />
      ))}
    </div>
  );
};
