/**
 * Controls for agent directives and goals.
 */

import React, { useEffect, useState } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useTrainingStore } from '../../store/trainingStore';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import { STRINGS } from '../../constants/strings';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Target, CaretDown } from '../ui/icons';

export const DirectivePanel: React.FC = () => {
  const { directiveMode, setDirectiveMode, currentGoal, setCurrentGoal } = useAgentStore();
  const {
    etEnabled,
    setEtEnabled,
    healthyHeightMin,
    setHealthyHeightMin,
    healthyHeightMax,
    setHealthyHeightMax,
    maxEpisodeSeconds,
    setMaxEpisodeSeconds,
    terminateOnOutOfBounds,
    setTerminateOnOutOfBounds,
    currentEpisode,
    episodeAccumulatedReward,
    lastTerminationReason,
  } = useTrainingStore();

  const [epSettingsOpen, setEpSettingsOpen] = useState(false);
  const [elapsedDisplay, setElapsedDisplay] = useState('0.0');

  // Live episode clock — ticks 4 Hz while in training mode with ET enabled.
  useEffect(() => {
    if (!(directiveMode === 'training' && etEnabled)) return;
    const id = window.setInterval(() => {
      const s = useTrainingStore.getState();
      if (s.episodeStartTime <= 0) {
        setElapsedDisplay('0.0');
        return;
      }
      const sec = (performance.now() - s.episodeStartTime) / 1000;
      setElapsedDisplay(sec.toFixed(1));
    }, 250);
    return () => window.clearInterval(id);
  }, [directiveMode, etEnabled]);

  const showElapsed = directiveMode === 'training' && etEnabled;

  const handleToggle = (enabled: boolean) => {
    const mode = enabled ? 'training' : 'free_will';
    setDirectiveMode(mode);
  };

  const handleClearGoal = () => {
    setCurrentGoal(null);
  };

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-4 flex items-center gap-1.5">
        <Flag size={12} />
        {STRINGS.GOD_MODE.DIRECTIVE}
      </h3>

      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <Target size={10} className="text-text-tertiary" />
          <Toggle
            label={STRINGS.GOD_MODE.TRAINING_MODE_LABEL}
            ariaLabel="Enable training mode"
            enabled={directiveMode === 'training'}
            onChange={handleToggle}
          />
        </div>

        <AnimatePresence>
          {directiveMode === 'training' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              <textarea
                value={currentGoal || ''}
                onChange={(e) => setCurrentGoal(e.target.value)}
                placeholder="Define training objective..."
                aria-label="Training objective"
                className="w-full h-20 p-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              {currentGoal && (
                <button
                  onClick={handleClearGoal}
                  className="w-full h-8 border border-border rounded-btn text-xs text-text-tertiary hover:text-text-primary hover:border-white/20 transition-colors font-bold uppercase tracking-widest"
                >
                  {STRINGS.GOD_MODE.CLEAR_GOAL}
                </button>
              )}

              {/* Episode Settings (ET + counters) */}
              <div className="pt-2 border-t border-border/50">
                <button
                  onClick={() => setEpSettingsOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors py-1"
                  aria-expanded={epSettingsOpen}
                >
                  <span>Episode Settings</span>
                  <span className={`transform transition-transform duration-150 ${epSettingsOpen ? 'rotate-180' : ''}`}>
                    <CaretDown size={10} />
                  </span>
                </button>

                <AnimatePresence>
                  {epSettingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-3 pt-2"
                    >
                      <Toggle
                        label="Early Termination"
                        ariaLabel="Enable early termination"
                        enabled={etEnabled}
                        onChange={setEtEnabled}
                      />

                      <Slider
                        label="Healthy Height Min (m)"
                        min={0.3}
                        max={2.0}
                        step={0.05}
                        value={healthyHeightMin}
                        onChange={(e) => setHealthyHeightMin(parseFloat(e.target.value))}
                      />

                      <Slider
                        label="Healthy Height Max (m)"
                        min={1.5}
                        max={4.0}
                        step={0.05}
                        value={healthyHeightMax}
                        onChange={(e) => setHealthyHeightMax(parseFloat(e.target.value))}
                      />

                      <Slider
                        label="Max Episode (s)"
                        min={10}
                        max={300}
                        step={10}
                        value={maxEpisodeSeconds}
                        onChange={(e) => setMaxEpisodeSeconds(parseFloat(e.target.value))}
                      />

                      <Toggle
                        label="Terminate on Out-of-Bounds"
                        ariaLabel="Terminate episode when agent leaves world bounds"
                        enabled={terminateOnOutOfBounds}
                        onChange={setTerminateOnOutOfBounds}
                      />

                      <div className="text-xs font-mono text-text-tertiary space-y-0.5 pt-1">
                        <div>EPISODE: <span className="text-text-primary">{currentEpisode}</span></div>
                        <div>ELAPSED: <span className="text-text-primary">{showElapsed ? elapsedDisplay : '0.0'}s</span></div>
                        <div>REWARD: <span className="text-text-primary">{episodeAccumulatedReward.toFixed(2)}</span></div>
                        {lastTerminationReason && (
                          <div>LAST: <span className="text-text-primary">{lastTerminationReason}</span></div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-xs font-mono text-text-tertiary">
          STATUS: <span className="text-text-primary">
            {directiveMode === 'training' ? `${STRINGS.GOD_MODE.TRAINING}: ${currentGoal || 'PENDING'}` : STRINGS.GOD_MODE.FREE_WILL}
          </span>
        </div>
      </div>
    </div>
  );
};

