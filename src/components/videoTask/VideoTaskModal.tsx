/**
 * VideoTaskModal
 * UI modal for importing, previewing, sampling, and configuring video demonstration tasks.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useVideoTaskStore, VideoIngestionMode } from '../../store/videoTaskStore';
import { useAgentStore } from '../../store/agentStore';
import { useAgentRuntimeStore } from '../../store/agentRuntimeStore';
import {
  X,
  VideoCamera,
  UploadSimple,
  Play,
  Pause,
  Check,
  Spinner,
  Target,
  Trash,
} from '../ui/icons';
import { cn } from '../../utils/cn';
import { synthiaToast } from '../../utils/synthiaToast';

export const VideoTaskModal: React.FC = () => {
  const {
    modalOpen,
    setModalOpen,
    activeTask,
    loadVideoFile,
    isProcessing,
    progress,
    error,
    ingestionMode,
    setIngestionMode,
    samplingFps,
    setSamplingFps,
    clearActiveTask,
    currentMilestoneIndex,
    setCurrentMilestoneIndex,
  } = useVideoTaskStore();

  const { setCurrentGoal, setDirectiveMode } = useAgentStore();
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const config = useAgentRuntimeStore((s) => s.configs[activeAgentId]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [goalPrompt, setGoalPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'inspect'>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (activeTask) {
        setActiveTab('inspect');
        setGoalPrompt(activeTask.taskGoalPrompt || `Imitate demonstration: ${activeTask.name}`);
      } else {
        setActiveTab('upload');
      }
    });
  }, [activeTask]);

  if (!modalOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      synthiaToast.error('Please select a valid video file (.mp4, .webm, .mov)');
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    setGoalPrompt(`Imitate demonstration: ${file.name.replace(/\.[^/.]+$/, '')}`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      synthiaToast.error('Please select a valid video file (.mp4, .webm, .mov)');
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    setGoalPrompt(`Imitate demonstration: ${file.name.replace(/\.[^/.]+$/, '')}`);
  };

  const handleStartProcessing = async () => {
    if (!selectedFile) return;
    try {
      await loadVideoFile(selectedFile, goalPrompt.trim(), { fps: samplingFps });
      synthiaToast.success('Video demonstration processed successfully!');
      setActiveTab('inspect');
    } catch (err) {
      synthiaToast.error(err instanceof Error ? err.message : 'Failed to process video');
    }
  };

  const handleDeployTask = () => {
    if (!activeTask) return;
    const goal = goalPrompt.trim() || activeTask.taskGoalPrompt || `Imitate ${activeTask.name}`;
    setCurrentGoal(goal);
    setDirectiveMode('training');
    setModalOpen(false);
    synthiaToast.success(`Video Task active: ${activeTask.name}`);
  };

  const handleClear = () => {
    clearActiveTask();
    setSelectedFile(null);
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
    }
    setActiveTab('upload');
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const hasProvider = !!config?.endpoint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-bg-panel border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-text-primary">
              <VideoCamera size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Video Demonstration Task</h2>
              <p className="text-xs text-text-tertiary">
                Import task video for multimodal visual imitation & planning
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Tabs */}
          {activeTask && (
            <div className="flex rounded-xl bg-white/5 p-1 border border-white/5">
              <button
                onClick={() => setActiveTab('inspect')}
                className={cn(
                  'flex-1 py-1.5 text-xs font-medium rounded-lg transition-all',
                  activeTab === 'inspect'
                    ? 'bg-white/10 text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                )}
              >
                Demonstration Milestones ({activeTask.keyframeIndices.length})
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={cn(
                  'flex-1 py-1.5 text-xs font-medium rounded-lg transition-all',
                  activeTab === 'upload'
                    ? 'bg-white/10 text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                )}
              >
                Upload New Video
              </button>
            </div>
          )}

          {activeTab === 'upload' && (
            <>
              {/* Dropzone */}
              {!selectedFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-white/30 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors bg-white/[0.02]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="p-3.5 rounded-2xl bg-white/5 text-text-secondary border border-white/10">
                    <UploadSimple size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-text-primary">
                      Click to upload or drag & drop video
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Supports MP4, WebM, MOV (Decoded client-side in browser)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Video Preview & Scrub */}
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-white/10 flex items-center justify-center">
                    {videoPreviewUrl && (
                      <video
                        ref={videoRef}
                        src={videoPreviewUrl}
                        onEnded={() => setIsPlaying(false)}
                        className="w-full h-full object-contain"
                      />
                    )}
                    <button
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-colors group"
                    >
                      <div className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white group-hover:scale-110 transition-transform">
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </div>
                    </button>
                  </div>

                  {/* Extraction Settings */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary">
                        Sampling Frequency
                      </label>
                      <div className="flex gap-2">
                        {[0.5, 1.0, 2.0].map((fps) => (
                          <button
                            key={fps}
                            type="button"
                            onClick={() => setSamplingFps(fps)}
                            className={cn(
                              'flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors',
                              samplingFps === fps
                                ? 'bg-white/15 border-white/30 text-text-primary'
                                : 'bg-white/5 border-white/10 text-text-tertiary hover:text-text-secondary'
                            )}
                          >
                            {fps} FPS
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary">
                        Ingestion Strategy
                      </label>
                      <select
                        value={ingestionMode}
                        onChange={(e) => setIngestionMode(e.target.value as VideoIngestionMode)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-text-primary outline-none focus:border-white/30"
                      >
                        <option value="watch_and_imitate" className="bg-bg-panel text-text-primary">
                          Watch & Imitate (Visual Servoing)
                        </option>
                        <option value="video_to_plan" className="bg-bg-panel text-text-primary">
                          Video to Plan (Step Sequence)
                        </option>
                        <option value="sliding_window" className="bg-bg-panel text-text-primary">
                          Temporal Sliding Window
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* Goal Prompt */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary">
                      Task Goal Directive
                    </label>
                    <input
                      type="text"
                      value={goalPrompt}
                      onChange={(e) => setGoalPrompt(e.target.value)}
                      placeholder="e.g., Reach the target object and balance"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-white/30"
                    />
                  </div>

                  {/* Progress Indicator */}
                  {isProcessing && (
                    <div className="space-y-2 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary flex items-center gap-1.5">
                          <Spinner size={14} className="animate-spin text-text-primary" />
                          Extracting & sampling frames...
                        </span>
                        <span className="font-mono text-text-primary">{progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-text-primary transition-all duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'inspect' && activeTask && (
            <div className="space-y-4">
              {/* Task Details Pill */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-text-primary">{activeTask.name}</h4>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    {activeTask.duration}s duration • {activeTask.totalFrames} frames sampled •{' '}
                    {activeTask.keyframeIndices.length} milestones
                  </p>
                </div>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove video demonstration"
                >
                  <Trash size={16} />
                </button>
              </div>

              {/* Milestone Frames Strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-text-secondary">
                    Extracted Milestone Anchors
                  </label>
                  <span className="text-[11px] text-text-tertiary">
                    Click milestone to set as active target
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {activeTask.keyframeIndices.map((frameIdx, milestoneIdx) => {
                    const frame = activeTask.frames[frameIdx];
                    if (!frame) return null;
                    const isSelected = milestoneIdx === currentMilestoneIndex;

                    return (
                      <button
                        key={frame.index}
                        onClick={() => setCurrentMilestoneIndex(milestoneIdx)}
                        className={cn(
                          'group relative rounded-xl overflow-hidden border p-1 text-left transition-all aspect-square flex flex-col',
                          isSelected
                            ? 'border-white/60 bg-white/10 ring-1 ring-white/40'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        )}
                      >
                        <img
                          src={frame.dataUrl}
                          alt={`Milestone ${milestoneIdx + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <div className="absolute inset-x-1 bottom-1 p-1 bg-black/80 backdrop-blur-xs rounded-b-lg flex items-center justify-between">
                          <span className="text-[10px] font-mono text-white font-medium">
                            #{milestoneIdx + 1}
                          </span>
                          <span className="text-[9px] font-mono text-white/70">
                            {frame.timestamp.toFixed(1)}s
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 p-1 rounded-full bg-white text-black shadow-md">
                            <Target size={10} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ingestion Mode Pill */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <span className="text-xs text-text-secondary">Active Ingestion Strategy:</span>
                <span className="text-xs font-medium text-text-primary capitalize">
                  {ingestionMode.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <div className="text-[11px] text-text-tertiary">
            {!hasProvider && (
              <span className="text-amber-400">⚠️ Configure inference provider in settings first</span>
            )}
          </div>

          <div className="flex gap-2.5">
            {activeTab === 'upload' && selectedFile && (
              <button
                onClick={handleStartProcessing}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-text-primary text-bg-panel hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Spinner size={14} className="animate-spin" />
                    Extracting ({progress}%)
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Process Frames
                  </>
                )}
              </button>
            )}

            {activeTab === 'inspect' && activeTask && (
              <button
                onClick={handleDeployTask}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-text-primary text-bg-panel hover:opacity-90 transition-all flex items-center gap-1.5"
              >
                <Check size={14} />
                Deploy Video Task
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
