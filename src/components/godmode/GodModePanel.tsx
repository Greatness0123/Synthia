/**
 * Floating modal for "God Mode" controls with a circular trigger button.
 * Split into World-level controls and Agent-specific controls.
 */

import React from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { PhysicsControls } from './PhysicsControls';
import { BodyControls } from './BodyControls';
import { AgentBodyControls } from './AgentBodyControls';
import { DirectivePanel } from './DirectivePanel';
import { ObjectSpawner } from './ObjectSpawner';
import { motion, AnimatePresence } from 'framer-motion';
import { GearSix, X, Cube, User } from '@phosphor-icons/react';
import { Button } from '../ui/Button';
import { STRINGS } from '../../constants/strings';

export const GodModePanel: React.FC = () => {
  const { godModeOpen, setGodModeOpen } = useWorldStore();
  const { setObjectSpawnerOpen } = useUIStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);

  return (
    <>
      {/* Circular Trigger Button - Top Left, under logo pill */}
      {!godModeOpen && (
        <button
          onClick={() => setGodModeOpen(true)}
          className="fixed top-[68px] left-4 w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all z-50 group"
        >
          <GearSix size={20} className="text-text-secondary group-hover:text-accent-blue" />
        </button>
      )}

      {/* Floating Modal */}
      <AnimatePresence>
        {godModeOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag
            dragMomentum={false}
            dragElastic={0}
            className="fixed top-[15vh] left-[15%] w-[420px] h-[70vh] glassmorphism rounded-modal z-[60] flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 cursor-grab">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary select-none">
                {STRINGS.GOD_MODE.TITLE}
              </span>
              <button
                onClick={() => setGodModeOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-text-tertiary" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* === SECTION 1: WORLD-LEVEL CONTROLS === */}
              <div className="p-3 bg-white/[0.02]">
                <span className="text-[9px] font-black uppercase tracking-widest text-text-tertiary/70 select-none block px-1.5 mb-1">
                  🌐 WORLD-LEVEL CONTROLS
                </span>
              </div>
              <PhysicsControls />
              <BodyControls />

              {/* World Spawner Quick Action */}
              <div className="p-4 border-t border-white/10">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() => setObjectSpawnerOpen(true)}
                >
                  <Cube size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{STRINGS.GOD_MODE.SPAWN_BUTTON}</span>
                </Button>
              </div>

              {/* === SECTION 2: AGENT-SPECIFIC CONTROLS === */}
              <div className="p-3 bg-accent-blue/10 border-t border-b border-white/10 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-accent-blue select-none flex items-center gap-1.5">
                  <User size={12} weight="bold" />
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

      <ObjectSpawner />
    </>
  );
};
