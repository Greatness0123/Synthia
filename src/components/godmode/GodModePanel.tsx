import React from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useAgentStore } from '../../store/agentStore';
import { PhysicsControls } from './PhysicsControls';
import { BodyControls } from './BodyControls';
import { AgentBodyControls } from './AgentBodyControls';
import { DirectivePanel } from './DirectivePanel';
import { motion, AnimatePresence } from 'framer-motion';
import { GearSix, X, User, Globe } from '../ui/icons';
import { STRINGS } from '../../constants/strings';

export const GodModePanel: React.FC = () => {
  const { godModeOpen, setGodModeOpen } = useWorldStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);

  return (
    <>
      {/* Circular Trigger Button - Top Left, under logo pill */}
      {!godModeOpen && (
        <button
          onClick={() => setGodModeOpen(true)}
          className="fixed top-[68px] left-4 w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all z-50 group"
          aria-label="Open God Mode"
          title="God Mode Controls"
        >
          <GearSix size={20} className="text-text-secondary group-hover:text-accent-blue" />
        </button>
      )}

      {/* Floating Modal */}
      <AnimatePresence>
        {godModeOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={{ top: -400, left: -400, right: 400, bottom: 400 }}
            style={{ isolation: 'isolate' }}
            className="fixed top-[15vh] left-[15%] w-[420px] max-w-[calc(100vw-2rem)] h-[70vh] max-h-[calc(100vh-2rem)] glassmorphism rounded-modal z-[60] flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 cursor-grab">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary select-none">
                {STRINGS.GOD_MODE.TITLE}
              </span>
              <button
                onClick={() => setGodModeOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Close God Mode"
              >
                <X size={16} className="text-text-tertiary" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* === SECTION 1: WORLD-LEVEL CONTROLS === */}
              <div className="p-3 bg-white/[0.02]">
                  <span className="text-[9px] font-black uppercase tracking-widest text-text-tertiary/70 select-none flex items-center gap-1.5">
                    <Globe size={12} />
                    WORLD-LEVEL CONTROLS
                  </span>
              </div>
              <PhysicsControls />
              <BodyControls />

              {/* === SECTION 2: AGENT-SPECIFIC CONTROLS === */}
              <div className="p-3 bg-accent-blue/10 border-t border-b border-white/10 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-accent-blue select-none flex items-center gap-1.5">
                  <User size={12} />
                  AGENT-SPECIFIC CONTROLS
                </span>
                <span className="px-2 py-0.5 rounded-full bg-accent-blue/20 text-[9px] font-bold font-mono text-accent-blue uppercase tracking-wider">
                  {activeAgentId}
                </span>
              </div>
              <AgentBodyControls />
              <DirectivePanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

