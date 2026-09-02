/**
 * VideoTaskStore
 * Zustand store for managing Video Task Mode demonstration state, extracted frames,
 * milestone navigation, and VLM multimodal ingestion settings.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  VideoExtractionResult,
  VideoFrame,
  extractFramesFromVideo,
  VideoExtractionOptions,
} from '../services/videoProcessor';

export type VideoIngestionMode = 'watch_and_imitate' | 'video_to_plan' | 'sliding_window';

export interface ActiveVideoTask {
  name: string;
  duration: number;
  totalFrames: number;
  frames: VideoFrame[];
  keyframeIndices: number[];
  createdAt: number;
  taskGoalPrompt?: string;
}

export interface VideoTaskState {
  activeTask: ActiveVideoTask | null;
  currentMilestoneIndex: number; // Index into keyframeIndices (0 to N)
  ingestionMode: VideoIngestionMode;
  samplingFps: number;
  isProcessing: boolean;
  progress: number;
  error: string | null;
  modalOpen: boolean;
  pipOpen: boolean;

  // Actions
  setModalOpen: (open: boolean) => void;
  setPipOpen: (open: boolean) => void;
  setIngestionMode: (mode: VideoIngestionMode) => void;
  setSamplingFps: (fps: number) => void;
  setCurrentMilestoneIndex: (index: number) => void;
  nextMilestone: () => void;
  prevMilestone: () => void;
  loadVideoFile: (file: File, goalPrompt?: string, options?: VideoExtractionOptions) => Promise<void>;
  clearActiveTask: () => void;
  hasActiveTask: () => boolean;
  getCurrentMilestoneFrame: () => VideoFrame | null;
}

export const useVideoTaskStore = create<VideoTaskState>()(
  persist(
    (set, get) => ({
      activeTask: null,
      currentMilestoneIndex: 0,
      ingestionMode: 'watch_and_imitate',
      samplingFps: 1.0,
      isProcessing: false,
      progress: 0,
      error: null,
      modalOpen: false,
      pipOpen: true,

      setModalOpen: (modalOpen) => set({ modalOpen }),
      setPipOpen: (pipOpen) => set({ pipOpen }),
      setIngestionMode: (ingestionMode) => set({ ingestionMode }),
      setSamplingFps: (samplingFps) => set({ samplingFps }),

      setCurrentMilestoneIndex: (currentMilestoneIndex) => {
        const { activeTask } = get();
        if (!activeTask) return;
        const maxIdx = Math.max(0, activeTask.keyframeIndices.length - 1);
        const clamped = Math.max(0, Math.min(maxIdx, currentMilestoneIndex));
        set({ currentMilestoneIndex: clamped });
      },

      nextMilestone: () => {
        const { activeTask, currentMilestoneIndex } = get();
        if (!activeTask) return;
        if (currentMilestoneIndex < activeTask.keyframeIndices.length - 1) {
          set({ currentMilestoneIndex: currentMilestoneIndex + 1 });
        }
      },

      prevMilestone: () => {
        const { currentMilestoneIndex } = get();
        if (currentMilestoneIndex > 0) {
          set({ currentMilestoneIndex: currentMilestoneIndex - 1 });
        }
      },

      loadVideoFile: async (file: File, goalPrompt?: string, options?: VideoExtractionOptions) => {
        set({ isProcessing: true, progress: 0, error: null });
        try {
          const fps = options?.fps ?? get().samplingFps;
          const result: VideoExtractionResult = await extractFramesFromVideo(
            file,
            { ...options, fps },
            (progress) => set({ progress })
          );

          const activeTask: ActiveVideoTask = {
            name: result.metadata.name,
            duration: result.metadata.duration,
            totalFrames: result.frames.length,
            frames: result.frames,
            keyframeIndices: result.keyframeIndices,
            createdAt: Date.now(),
            taskGoalPrompt: goalPrompt || `Imitate demonstration: ${result.metadata.name}`,
          };

          set({
            activeTask,
            currentMilestoneIndex: 0,
            isProcessing: false,
            progress: 100,
            modalOpen: false,
            pipOpen: true,
          });
        } catch (err) {
          set({
            isProcessing: false,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },

      clearActiveTask: () => {
        set({
          activeTask: null,
          currentMilestoneIndex: 0,
          error: null,
          progress: 0,
        });
      },

      hasActiveTask: () => {
        const { activeTask } = get();
        return !!activeTask && activeTask.frames.length > 0;
      },

      getCurrentMilestoneFrame: () => {
        const { activeTask, currentMilestoneIndex } = get();
        if (!activeTask || activeTask.keyframeIndices.length === 0) return null;
        const frameIdx = activeTask.keyframeIndices[currentMilestoneIndex] ?? 0;
        return activeTask.frames[frameIdx] || null;
      },
    }),
    {
      name: 'synthia_video_task_store',
      // Only persist metadata and mode settings, avoid storing massive base64 arrays in localStorage
      partialize: (state) => ({
        ingestionMode: state.ingestionMode,
        samplingFps: state.samplingFps,
        pipOpen: state.pipOpen,
      }),
    }
  )
);
