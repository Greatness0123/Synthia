/**
 * Left rail - vertical toolbar consolidating all floating trigger buttons.
 * Uses flex column with gap instead of hardcoded top-[Npx] positioning.
 */

import { useUIStore } from '../../store/uiStore';
import { useWorldStore } from '../../store/worldStore';
import { GearSix, TreeStructure, Export, Cube } from '../ui/icons';
import { Logo } from '../ui/Logo';
import { cn } from '../../utils/cn';

export const LeftRail: React.FC = () => {
  const {
    setExportModalOpen,
    setObjectSpawnerOpen,
    rightPanelOpen,
    setRightPanelOpen,
  } = useUIStore();
  const { godModeOpen, setGodModeOpen } = useWorldStore();

  return (
    <div className="fixed left-4 top-4 flex flex-col gap-2 z-50">
      {/* Logo */}
      <div className="glassmorphism rounded-full flex items-center justify-center w-10 h-10">
        <Logo size={28} />
      </div>

      <div className="w-full h-px bg-white/10 my-1" />

      {/* World Controls */}
      <button
        onClick={() => setGodModeOpen(!godModeOpen)}
        data-tour="world-controls-trigger"
        className={cn(
          "w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all group",
          godModeOpen && "bg-white/10"
        )}
        aria-label="World Controls"
        title="World Controls"
      >
        <GearSix size={20} className={cn("text-text-secondary group-hover:text-text-primary transition-colors", godModeOpen && "text-text-primary")} />
      </button>

      {/* Agent Inspector */}
      <button
        onClick={() => setRightPanelOpen(!rightPanelOpen)}
        className={cn(
          "w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all group",
          rightPanelOpen && "bg-white/10"
        )}
        aria-label="Agent Inspector"
        title="Agent Inspector"
      >
        <TreeStructure size={20} className={cn("text-text-secondary group-hover:text-text-primary transition-colors", rightPanelOpen && "text-text-primary")} />
      </button>

      <div className="w-full h-px bg-white/10 my-1" />

      {/* Export */}
      <button
        onClick={() => setExportModalOpen(true)}
        className="w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all group"
        aria-label="Export Data"
        title="Export Data"
      >
        <Export size={20} className="text-text-secondary group-hover:text-text-primary transition-colors" />
      </button>

      {/* Object Spawner */}
      <button
        onClick={() => setObjectSpawnerOpen(true)}
        className="w-10 h-10 glassmorphism rounded-full flex items-center justify-center hover:bg-white/10 transition-all group"
        aria-label="Spawn Objects"
        title="Spawn Objects"
      >
        <Cube size={20} className="text-text-secondary group-hover:text-text-primary transition-colors" />
      </button>
    </div>
  );
};
