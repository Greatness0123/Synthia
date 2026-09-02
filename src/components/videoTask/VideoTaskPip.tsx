/**
 * VideoTaskPip
 * Floating Picture-in-Picture HUD displaying the active demonstration reference frame
 * alongside milestone navigation controls.
 */

import React from 'react';
import { useVideoTaskStore } from '../../store/videoTaskStore';
import { X, VideoCamera, ArrowRight, Target } from '../ui/icons';

export const VideoTaskPip: React.FC = () => {
  const {
    activeTask,
    pipOpen,
    setPipOpen,
    setModalOpen,
    currentMilestoneIndex,
    nextMilestone,
    prevMilestone,
    getCurrentMilestoneFrame,
  } = useVideoTaskStore();

  if (!activeTask || !pipOpen) return null;

  const currentFrame = getCurrentMilestoneFrame();
  const totalMilestones = activeTask.keyframeIndices.length;

  return (
    <div className="fixed bottom-28 left-6 z-40 w-64 rounded-2xl bg-bg-panel/90 backdrop-blur-md border border-white/15 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-1.5 text-text-primary">
          <VideoCamera size={13} />
          <span className="text-[11px] font-semibold tracking-wide">Video Demonstration</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setModalOpen(true)}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors text-[10px]"
            title="Open video task settings"
          >
            Edit
          </button>
          <button
            onClick={() => setPipOpen(false)}
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            title="Hide preview"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Frame Visual Preview */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
        {currentFrame ? (
          <img
            src={currentFrame.dataUrl}
            alt={`Milestone ${currentMilestoneIndex + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs text-text-tertiary">No milestone frame</span>
        )}

        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-xs border border-white/10 flex items-center gap-1 text-[10px] font-mono text-white">
          <Target size={10} className="text-emerald-400" />
          <span>
            {currentMilestoneIndex + 1} / {totalMilestones}
          </span>
        </div>

        {currentFrame && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-[10px] font-mono text-white/80">
            {currentFrame.timestamp.toFixed(1)}s
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02]">
        <button
          onClick={prevMilestone}
          disabled={currentMilestoneIndex === 0}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors rotate-180"
          title="Previous milestone"
        >
          <ArrowRight size={14} />
        </button>

        <span className="text-[11px] font-medium text-text-secondary truncate max-w-[120px]">
          {currentFrame?.label || `Milestone ${currentMilestoneIndex + 1}`}
        </span>

        <button
          onClick={nextMilestone}
          disabled={currentMilestoneIndex >= totalMilestones - 1}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Next milestone"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
