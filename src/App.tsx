/**
 * Main application entry point and root component.
 */

import { AppShell } from './components/layout/AppShell';
import { WorldViewport } from './components/world/WorldViewport';
import { RehydrationModal } from './components/ui/RehydrationModal';
import { StatusBar } from './components/layout/StatusBar';
import { AgentStatus } from './components/agent/AgentStatus';
import { ThoughtBank } from './components/agent/ThoughtBank';
import { InjectionInput } from './components/agent/InjectionInput';
import { MemoryViewer } from './components/agent/MemoryViewer';
import { StructureViewer } from './components/agent/StructureViewer';
import { GodModePanel } from './components/godmode/GodModePanel';
import { useUIStore } from './store/uiStore';
import { useWorldStore } from './store/worldStore';
import { useAgentStore } from './store/agentStore';
import { Brain, Database, Cube, ListChecks, TreeStructure, Camera, VideoCamera, Monitor, X, Sun, Moon, Gear } from '@phosphor-icons/react';
import { ExportModal } from './components/export/ExportModal';
import { AgentSettingsModal } from './components/agent/AgentSettingsModal';
import { LogViewer } from './components/agent/LogViewer';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import * as Tone from 'tone';
import { cn } from './components/ui/Panel';
import type { CameraMode } from './types/world';

function App() {
  const { activeRightPanelTab, setActiveRightPanelTab, rightPanelOpen, setRightPanelOpen, theme, toggleTheme, settingsModalOpen, setSettingsModalOpen } = useUIStore();
  const { cameraMode, setCameraMode } = useWorldStore();

  useEffect(() => {
    const resumeAudio = async () => {
      await Tone.start();
      if ((window as any)._synthia_audio_engine) {
        await (window as any)._synthia_audio_engine.initialize();
      }
      document.removeEventListener('click', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    return () => document.removeEventListener('click', resumeAudio);
  }, []);

  // Apply theme class to root element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, [theme]);

  return (
    <AppShell>
      {/* 3D Viewport - Full Screen Canvas */}
      <WorldViewport />

      {/* === Floating UI Layer === */}

      {/* Logo Pill - Top Left */}
      <div className="fixed top-4 left-4 glassmorphism rounded-full flex items-center gap-2.5 px-4 py-2 z-50">
        <img src="/logo.png" alt="Synthia" className="w-6 h-6 object-contain" />
        <span className="text-xs font-bold tracking-widest text-text-secondary uppercase">Synthia</span>
      </div>

      {/* Dev Multi-Agent Controller - Top Center */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 glassmorphism rounded-full flex items-center gap-4 p-2 z-50">
        <button
          onClick={async () => {
            if ((window as any).synthia?.spawnAgent) {
              const newBinder = await (window as any).synthia.spawnAgent();
              if (newBinder) {
                console.log('Successfully spawned agent.');
              }
            }
          }}
          className="px-4 py-1.5 bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue text-[10px] font-bold uppercase tracking-widest rounded-full transition-all"
        >
          + Spawn Agent
        </button>

        {/* Agent Selector Dropdown */}
        <select
          value={useAgentStore((state) => state.activeAgentId)}
          onChange={(e) => {
            const nextAgentId = e.target.value;
            useAgentStore.getState().setActiveAgentId(nextAgentId);
          }}
          className="bg-transparent border-0 text-[10px] font-bold text-text-secondary outline-none uppercase select-none cursor-pointer"
        >
          {Object.keys(useAgentStore.getState().agents).map((id) => (
            <option key={id} value={id} className="bg-[#111115] text-text-secondary text-[10px] font-bold">
              {id}
            </option>
          ))}
        </select>

        {/* Agent Settings Button (Gear) */}
        <button
          onClick={() => setSettingsModalOpen(!settingsModalOpen)}
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all text-text-secondary group",
            settingsModalOpen && "bg-white/10 text-accent-blue"
          )}
          title="Agent Settings"
        >
          <Gear size={15} className="group-hover:rotate-45 transition-transform" />
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-all text-text-secondary group"
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === 'dark' ? (
            <Sun size={15} className="group-hover:text-accent-amber transition-colors" />
          ) : (
            <Moon size={15} className="group-hover:text-accent-purple transition-colors" />
          )}
        </button>
      </div>

      {/* Camera Controls Pill - Top Right */}
      <div className="fixed top-4 right-4 glassmorphism rounded-full flex items-center p-1 z-50">
        {[
          { mode: 'third_person', icon: Camera, label: '3RD' },
          { mode: 'first_person', icon: VideoCamera, label: '1ST' },
          { mode: 'model_input', icon: Monitor, label: '2ND' },
        ].map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => setCameraMode(mode as CameraMode)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all",
              cameraMode === mode
                ? "bg-white/10 text-accent-blue"
                : "text-text-tertiary hover:text-text-secondary hover:bg-white/5"
            )}
          >
            <Icon size={14} weight={cameraMode === mode ? "bold" : "regular"} />
            <span className="text-[10px] font-bold">{label}</span>
          </button>
        ))}
      </div>

      {/* Metrics Pill - Bottom Center */}
      <StatusBar />

      {/* GodMode Panel (trigger button + modal handled inside) */}
      <GodModePanel />

      {/* Right Panel Trigger Button - Top Right, under camera pill */}
      {!rightPanelOpen && (
        <button
          onClick={() => setRightPanelOpen(true)}
          className="fixed top-[68px] right-4 w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all z-50 group"
        >
          <TreeStructure size={20} className="text-text-secondary group-hover:text-accent-purple" />
        </button>
      )}

      {/* No backdrop - user can see through to viewport */}

      {/* Right Panel Modal */}
      <AnimatePresence>
        {rightPanelOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag
            dragMomentum={false}
            dragElastic={0}
            className="fixed top-[10vh] right-[15%] w-[380px] h-[80vh] glassmorphism rounded-modal z-[60] flex flex-col overflow-hidden cursor-grab active:cursor-grabbing"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 cursor-grab">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary select-none">
                Agent
              </span>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-text-tertiary" />
              </button>
            </div>

            {/* Agent Status */}
            <AgentStatus />

            {/* Tab Bar */}
            <div className="flex border-b border-white/10 p-1 gap-1 shrink-0">
              {[
                { id: 'thoughts', icon: Brain, label: 'Thoughts' },
                { id: 'memories', icon: Database, label: 'Memories' },
                { id: 'structure', icon: Cube, label: 'Structure' },
                { id: 'logs', icon: ListChecks, label: 'Logs' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveRightPanelTab(id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded transition-all ${
                    activeRightPanelTab === id
                      ? 'bg-white/10 text-accent-blue'
                      : 'text-text-tertiary hover:text-text-secondary hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} weight={activeRightPanelTab === id ? 'fill' : 'regular'} />
                  <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeRightPanelTab === 'thoughts' && (
                <>
                  <ThoughtBank />
                  <InjectionInput />
                </>
              )}
              {activeRightPanelTab === 'structure' && <StructureViewer />}
              {activeRightPanelTab === 'memories' && <MemoryViewer />}
              {activeRightPanelTab === 'logs' && <LogViewer />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Modals */}
      <ExportModal />
      <AgentSettingsModal />
      <RehydrationModal />
    </AppShell>
  );
}

export default App;
