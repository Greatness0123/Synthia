/**
 * Controls for agent directives and goals.
 */

import React from 'react';
import { useAgentStore } from '../../store/agentStore';
import { Toggle } from '../ui/Toggle';
import { STRINGS } from '../../constants/strings';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Target } from '../ui/icons';

export const DirectivePanel: React.FC = () => {
  const { directiveMode, setDirectiveMode, currentGoal, setCurrentGoal } = useAgentStore();

  const handleToggle = (enabled: boolean) => {
    const mode = enabled ? 'training' : 'free_will';
    setDirectiveMode(mode);
  };

  const handleClearGoal = () => {
    // Only clear the goal text — user must manually toggle off training mode
    setCurrentGoal(null);
  };

  return (
    <div className="p-4 border-t border-border">
      <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4 flex items-center gap-1.5">
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
                className="w-full h-20 p-2 bg-bg-elevated border border-border rounded-btn text-xs text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
              {currentGoal && (
                <button
                  onClick={handleClearGoal}
                  className="w-full h-8 border border-border rounded-btn text-[10px] text-text-tertiary hover:text-accent-red hover:border-accent-red/40 transition-colors font-bold uppercase tracking-widest"
                >
                  {STRINGS.GOD_MODE.CLEAR_GOAL}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-[10px] font-mono text-text-tertiary">
          STATUS: <span className={directiveMode === 'training' ? 'text-accent-amber' : 'text-accent-green'}>
            {directiveMode === 'training' ? `${STRINGS.GOD_MODE.TRAINING}: ${currentGoal || 'PENDING'}` : STRINGS.GOD_MODE.FREE_WILL}
          </span>
        </div>
      </div>
    </div>
  );
};

