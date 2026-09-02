/**
 * VideoProcessor Service
 * In-browser HTML5 Video + Canvas frame extraction and keyframe detection for SYNTHIA Task Mode.
 *
 * Decodes user-imported videos (.mp4, .webm, .mov) entirely client-side, samples frames at a
 * configurable rate (0.5-2.0 FPS), normalizes them to 384x384 compressed WebP/JPEG data URLs,
 * and detects milestone transitions via image difference metrics.
 */

export interface VideoFrame {
  index: number;
  timestamp: number; // in seconds
  dataUrl: string;   // base64 image data URL
  isKeyframe: boolean;
  diffScore: number; // frame-to-frame visual variance (0.0 to 1.0)
  label?: string;
}

export interface VideoMetadata {
  name: string;
  size: number;
  duration: number; // in seconds
  width: number;
  height: number;
  totalFramesSampled: number;
}

export interface VideoExtractionOptions {
  fps?: number;           // Target sampling rate (default: 1.0)
  maxWidth?: number;      // Maximum frame dimension (default: 384)
  maxHeight?: number;     // Maximum frame dimension (default: 384)
  quality?: number;       // Compression quality 0.0-1.0 (default: 0.75)
  maxDuration?: number;   // Max seconds to process (default: 60)
  keyframeThreshold?: number; // Variance threshold for keyframe marking (default: 0.15)
  targetMilestones?: number;  // Desired number of milestone anchors (default: 4-6)
}

export interface VideoExtractionResult {
  metadata: VideoMetadata;
  frames: VideoFrame[];
  keyframeIndices: number[];
}

/**
 * Calculates normalized RGB difference between two ImageData objects.
 */
function calculateFrameDifference(prev: ImageData, curr: ImageData): number {
  const pData = prev.data;
  const cData = curr.data;
  const len = pData.length;
  let totalDiff = 0;

  // Sample every 4th pixel for high performance during extraction
  for (let i = 0; i < len; i += 16) {
    const rDiff = Math.abs(pData[i] - cData[i]);
    const gDiff = Math.abs(pData[i + 1] - cData[i + 1]);
    const bDiff = Math.abs(pData[i + 2] - cData[i + 2]);
    totalDiff += (rDiff + gDiff + bDiff) / (3 * 255);
  }

  const sampledPixels = len / 16;
  return totalDiff / sampledPixels;
}

/**
 * Extracts, downscales, and samples frames from a video File in the browser.
 */
export async function extractFramesFromVideo(
  file: File,
  options: VideoExtractionOptions = {},
  onProgress?: (progress: number) => void
): Promise<VideoExtractionResult> {
  const fps = Math.max(0.2, Math.min(4.0, options.fps ?? 1.0));
  const maxWidth = options.maxWidth ?? 384;
  const maxHeight = options.maxHeight ?? 384;
  const quality = options.quality ?? 0.75;
  const maxDuration = options.maxDuration ?? 60;
  const targetMilestones = options.targetMilestones ?? 4;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = Math.min(video.duration, maxDuration);
        const originalWidth = video.videoWidth || 640;
        const originalHeight = video.videoHeight || 480;

        // Calculate aspect-ratio-preserving dimensions
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        if (targetWidth > maxWidth || targetHeight > maxHeight) {
          const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
          targetWidth = Math.round(targetWidth * ratio);
          targetHeight = Math.round(targetHeight * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          cleanup();
          reject(new Error('Failed to create canvas 2D rendering context'));
          return;
        }

        const interval = 1 / fps;
        const timestamps: number[] = [];
        for (let t = 0; t <= duration; t += interval) {
          timestamps.push(Math.min(t, duration - 0.05));
        }

        const frames: VideoFrame[] = [];
        let prevImageData: ImageData | null = null;

        for (let i = 0; i < timestamps.length; i++) {
          const time = timestamps[i];

          // Seek to timestamp
          await new Promise<void>((seekResolve) => {
            const handleSeeked = () => {
              video.removeEventListener('seeked', handleSeeked);
              seekResolve();
            };
            video.addEventListener('seeked', handleSeeked);
            video.currentTime = time;
          });

          // Draw and extract image
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const currentImageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

          // Compute difference score
          let diffScore = 0;
          if (prevImageData) {
            diffScore = calculateFrameDifference(prevImageData, currentImageData);
          } else {
            diffScore = 1.0; // First frame is baseline
          }
          prevImageData = currentImageData;

          // Export as compressed WebP (or JPEG fallback)
          let dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          frames.push({
            index: i,
            timestamp: Number(time.toFixed(2)),
            dataUrl,
            isKeyframe: false,
            diffScore,
          });

          if (onProgress) {
            onProgress(Math.round(((i + 1) / timestamps.length) * 100));
          }
        }

        // Identify keyframe milestones based on motion peaks & uniform distribution
        const keyframeIndices = selectMilestoneKeyframes(frames, targetMilestones);
        for (const idx of keyframeIndices) {
          if (frames[idx]) {
            frames[idx].isKeyframe = true;
          }
        }

        // Add user-friendly milestone labels
        keyframeIndices.forEach((idx, step) => {
          if (frames[idx]) {
            frames[idx].label = `Milestone ${step + 1} (${formatTimestamp(frames[idx].timestamp)})`;
          }
        });

        cleanup();

        resolve({
          metadata: {
            name: file.name,
            size: file.size,
            duration: Number(duration.toFixed(2)),
            width: targetWidth,
            height: targetHeight,
            totalFramesSampled: frames.length,
          },
          frames,
          keyframeIndices,
        });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video file: ${file.name}`));
    };
  });
}

/**
 * Selects an optimal set of representative milestone frames.
 * Always includes first and last frames, plus frames with significant visual change.
 */
function selectMilestoneKeyframes(frames: VideoFrame[], targetCount: number): number[] {
  if (frames.length <= targetCount) {
    return frames.map((_, i) => i);
  }

  const result = new Set<number>();
  result.add(0); // Initial state
  result.add(frames.length - 1); // Goal/end state

  // Sort candidate interior frames by diffScore
  const candidates = frames
    .slice(1, frames.length - 1)
    .map((f, i) => ({ originalIndex: i + 1, diffScore: f.diffScore }))
    .sort((a, b) => b.diffScore - a.diffScore);

  // Pick highest-variance frames ensuring temporal separation
  const minSeparation = Math.floor(frames.length / (targetCount * 1.5)) || 1;
  for (const cand of candidates) {
    if (result.size >= targetCount) break;

    const isFarEnough = Array.from(result).every(
      (existingIdx) => Math.abs(existingIdx - cand.originalIndex) >= minSeparation
    );

    if (isFarEnough) {
      result.add(cand.originalIndex);
    }
  }

  // If we still need more milestones, fill with uniform spacing
  if (result.size < targetCount) {
    const step = Math.floor(frames.length / targetCount);
    for (let i = step; i < frames.length; i += step) {
      result.add(i);
      if (result.size >= targetCount) break;
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * Formats seconds into MM:SS.S string
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
}
