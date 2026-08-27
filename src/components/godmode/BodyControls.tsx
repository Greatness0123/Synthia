/**
 * Global rendering and debug controls for agent bodies.
 */

import React from 'react';
import { useWorldStore } from '../../store/worldStore';
import { BODY_TYPE_CONFIGS } from '../../constants/bodyTypes';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import { STRINGS } from '../../constants/strings';
import { Bot } from '../ui/icons';
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
    reactionMassEnabled,
    setReactionMassEnabled,
    capsuleBalanceEnabled,
    setCapsuleBalanceEnabled,
  } = useWorldStore();

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-xs font-medium text-text-tertiary mb-4 flex items-center gap-1.5">
        <Bot size={12} />
        {STRINGS.GOD_MODE.BODY}
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
                    ? "border-white/20 bg-white/5 text-text-primary"
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

        <Toggle
          label="Show All Cameras"
          ariaLabel="Show All Cameras"
          enabled={showAICameraHelper}
          onChange={setShowAICameraHelper}
        />

        <Toggle
          label="AI PiP View"
          ariaLabel="AI PiP View"
          enabled={showAIPiP}
          onChange={setShowAIPiP}
        />

        <Toggle
          label="Capsule Balance"
          ariaLabel="Toggle capsule balance (Road-2 root corrector)"
          enabled={capsuleBalanceEnabled}
          onChange={setCapsuleBalanceEnabled}
        />

        <Toggle
          label="Reaction-Mass (RMBS)"
          ariaLabel="Toggle reaction-mass balance system"
          enabled={reactionMassEnabled}
          onChange={setReactionMassEnabled}
        />

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
