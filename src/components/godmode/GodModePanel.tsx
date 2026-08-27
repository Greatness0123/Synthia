import React from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useAgentStore } from '../../store/agentStore';
import { PhysicsControls } from './PhysicsControls';
import { BodyControls } from './BodyControls';
import { AgentBodyControls } from './AgentBodyControls';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Globe } from '../ui/icons';
import { STRINGS } from '../../constants/strings';

export const GodModePanel: React.FC = () => {
  const { godModeOpen, setGodModeOpen } = useWorldStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);

  return (
    <AnimatePresence>
      {godModeOpen && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed left-16 top-4 w-[380px] max-w-[calc(100vw-5rem)] h-[calc(100vh-2rem)] bg-bg-panel border border-white/10 rounded-modal z-[60] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
            <span className="text-xs font-medium text-text-secondary select-none">
              {STRINGS.GOD_MODE.TITLE}
            </span>
            <button
              onClick={() => setGodModeOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="Close World Controls"
            >
              <X size={16} className="text-text-tertiary" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* === SECTION 1: WORLD === */}
            <div className="p-3 bg-white/[0.02]">
                <span className="text-xs font-medium text-text-tertiary select-none flex items-center gap-1.5">
                  <Globe size={12} />
                  World
                </span>
            </div>
            <PhysicsControls />
            <BodyControls />

            {/* === SECTION 2: AGENT === */}
            <div className="p-3 border-t border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-text-tertiary select-none flex items-center gap-1.5">
                <User size={12} />
                Agent
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-mono text-text-secondary">
                {activeAgentId}
              </span>
            </div>
            <AgentBodyControls />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

