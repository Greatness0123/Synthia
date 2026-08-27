import React, { useRef } from 'react';
import { ModelInputPiP } from './ModelInputPiP';
import { useWorld } from '../../world/hooks/useWorld';
import { useWorldStore } from '../../store/worldStore';
import { Spinner } from '../ui/icons';
import { STRINGS } from '../../constants/strings';

/**
 * The Three.js 3D world viewport.
 */
export const WorldViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isReady } = useWorld(containerRef);
  const showAIPiP = useWorldStore(state => state.showAIPiP);

  return (
    <div ref={containerRef} data-tour="viewport" className="w-full h-full bg-bg-primary relative flex items-center justify-center overflow-hidden">
      {!isReady && (
        <div className="flex flex-col items-center gap-4 z-10">
          <Spinner className="w-8 h-8 text-text-primary animate-spin" />
          <span className="text-xs font-mono text-text-secondary tracking-widest">
            {STRINGS.WORLD.LOADING}
          </span>
        </div>
      )}

      {showAIPiP && <ModelInputPiP />}
    </div>
  );
};
