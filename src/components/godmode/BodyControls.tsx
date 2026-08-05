/**
 * Global rendering and debug controls for agent bodies.
 */

import React from 'react';
import { useWorldStore } from '../../store/worldStore';
import { BODY_TYPE_CONFIGS } from '../../constants/bodyTypes';
import { Slider } from '../ui/Slider';
import { STRINGS } from '../../constants/strings';
import type { BodyType } from '../../types/world';

export const BodyControls: React.FC = () => {
  const {
    bodyType,
    setBodyType,
    showAICameraHelper,
    setShowAICameraHelper,
    showAIPiP,
    setShowAIPiP,
    movementSmoothing,
    setMovementSmoothing,
  } = useWorldStore();

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4">
        {STRINGS.GOD_MODE.BODY} (GLOBAL DEBUG)
      </h3>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2">
          {Object.values(BODY_TYPE_CONFIGS).map((config) => {
            const isDisabled = config.id !== 'humanoid';
            return (
              <button
                key={config.id}
                disabled={isDisabled}
                title={isDisabled ? "Coming in a future update" : undefined}
                onClick={() => setBodyType(config.id as BodyType)}
                className={`text-left px-3 py-2 rounded-btn text-xs border transition-all ${
                  bodyType === config.id
                    ? "border-accent-blue bg-accent-blue/5 text-text-primary"
                    : isDisabled
                      ? "border-border text-text-tertiary/40 cursor-not-allowed"
                      : "border-border text-text-tertiary hover:border-text-tertiary"
                }`}
              >
                {config.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">Show All Cameras</label>
          <button
            onClick={() => setShowAICameraHelper(!showAICameraHelper)}
            className={`w-8 h-4 rounded-full transition-colors relative ${showAICameraHelper ? 'bg-accent-blue' : 'bg-bg-elevated'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showAICameraHelper ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="text-[10px] uppercase tracking-wider text-text-tertiary">AI PiP View</label>
          <button
            onClick={() => setShowAIPiP(!showAIPiP)}
            className={`w-8 h-4 rounded-full transition-colors relative ${showAIPiP ? 'bg-accent-blue' : 'bg-bg-elevated'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${showAIPiP ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </div>

        <Slider
          label={STRINGS.GOD_MODE.MOVEMENT_SMOOTHING}
          min={0.05}
          max={1.0}
          step={0.01}
          value={movementSmoothing}
          onChange={(e) => setMovementSmoothing(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};
