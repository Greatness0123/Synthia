# Video import and frame-by-frame task processing feasibility for SYNTHIA

## Objective

This document evaluates whether a video import feature is feasible for Task Mode in SYNTHIA, especially when the underlying model stack is image-capable but not natively video-stream capable. The focus is on browser-side processing, token economy, latency, and practical implementation trade-offs.

## Executive summary

Yes — this is highly feasible in the current browser architecture.

A practical implementation can take a user-supplied video (.mp4, .webm, .mov), extract frames via the browser canvas or WebCodecs, sample them at a low but useful rate, and pass a short sequence of frames to an image-capable VLM as context for the current task. This works without requiring a dedicated backend video decoder or GPU-heavy server pipeline.

This is particularly useful for Task Mode when the system needs to understand a demonstration, compare it to the current scene, or convert a sequence of actions into a higher-level plan. The core technical challenge is not feasibility; it is token efficiency, sampling strategy, and keeping the process fast enough to feel natural in an interactive UI.

## 1) High-level architecture

```text
[ User imports video ]
         |
         v
[ Client-side demux / frame extraction ]
         |
         +--> fixed sampling (0.5-2 fps)
         +--> keyframe detection / scene-change detection
         +--> resize to 384x384 or 512x512
         |
         v
[ Frame pipeline + context manager ]
         |
         +--> temporal sliding window
         +--> milestone extraction
         +--> action-anchor selection
         |
         v
[ Image-capable model: GPT-4o / Claude / Gemini / Qwen-VL / local vision model ]
         |
         v
[ Task plan or action guidance ]
         |
         v
[ SYNTHIA agent acts in the world ]
```

## 2) Browser-side feasibility

### 2.1 HTML5 video + canvas extraction

This is the easiest and most robust path for the first implementation.

The browser can decode common video containers such as MP4 and WebM with a hidden `<video>` element. The workflow is:

1. Load the file into a video element.
2. Wait for metadata and duration.
3. Choose a frame interval such as 0.5 fps, 1 fps, or 2 fps.
4. Move `video.currentTime` to the target timestamp.
5. Draw it into a canvas.
6. Export the frame as JPEG or WebP using `canvas.toBlob()` or `canvas.toDataURL()`.
7. Downscale to a compact size such as 384×384 or 512×512.

This is browser-native, does not require a backend decoder, and works in current Chromium-based browsers with high compatibility.

### 2.2 WebCodecs API

For higher performance and longer videos, the WebCodecs `VideoDecoder` API is a more advanced option. It allows frame extraction and decoding without rendering video into the DOM. This is especially useful if the application needs to process longer videos or a larger number of frames without UI jank.

In practice, a robust implementation should start with the canvas approach and only upgrade to WebCodecs if the app begins handling long demos or heavy usage.

## 3) Sampling strategies that make sense

Sending every frame into a model would blow up context windows and cost. The right approach is to pick a lower-frequency sample set that preserves the task structure.

### Option A — Uniform sampling (recommended first)

- sample every 0.5–2 seconds
- keep 8–20 frames for a short task demonstration
- suitable for common single-task and short-horizon tasks

This is the simplest and most reliable approach for Task Mode.

### Option B — Motion-triggered sampling

- compare frame differences using simple image-difference, SSIM, or a lightweight variance metric
- sample only when motion or scene state changes meaningfully
- useful when the video includes idle moments or long pauses

This reduces token waste and is especially useful for long recordings.

### Option C — Keyframe extraction

- identify milestone stills such as “approach object”, “grasp”, “lift”, “drop”
- pass a smaller representation of the task to the model as sequence anchors

This is best when you want the agent to understand the task as a sequence of goals rather than as dozens of redundant frames.

## 4) Ingestion modes for Task Mode

### 4.1 Sequential watch-and-imitate mode

This is the most direct usage pattern.

The system sends:

- the current task text and objective,
- a target frame or short frame-window from the imported video,
- the agent’s current live perception frame,
- optional telemetry or joint summary,

Then the model compares the imported demonstration to the current agent state and proposes a next action or correction. This is effective for short demonstrations and tasks whose progress is easy to read visually.

### 4.2 Video-to-plan mode

This is a better choice when the video is longer and the task is more procedural.

The system extracts 8–16 representative frames, sends them as a batch, and asks the model to produce a plan or recipe such as:

- walk_to_table
- reach_forward
- grasp_object
- lift_and_move
- place_on_target

The model does not need to see all frames in detail. It just needs high-level temporal anchors.

### 4.3 Temporal sliding-window mode

This is a middle ground and likely the best long-term implementation.

The system keeps only the most recent N frames in memory, so each inference step sees a compact historical context without exploding token usage. This is useful for tasks that unfold over time and require continuation.

## 5) Token and cost considerations

The main constraint is not extraction; it is the number of frames sent to the model and their resolution.

### Recommended setting

- 384×384 to 512×512 max image resolution
- 1–2 fps sampling for long videos
- 8–16 frames in a single prompt when the task is short
- rare longer sequences only when necessary

### Rough token cost

A single 384×384 image can consume a nontrivial number of tokens depending on the model. Sending 30 or 60 full-resolution frames per second would be impossible in most multimodal contexts. That is why temporal sampling is essential.

The practical approach is:

- less than 2 fps for most imported demonstrations
- downscale aggressively before sending
- keep only milestone frames or a short time window in the final model prompt

## 6) Practical implementation recommendation

### Best first version

Implement the following:

1. Import video in the browser
2. Extract frames at 1 fps or 0.5 fps
3. Resize to 384×384
4. Keep the last 8–12 frames
5. Send the frames as a compact sequence to the image model
6. Use the output as a plan or a next-action suggestion
7. Let SYNTHIA apply the action in the world engine

This is low-risk and matches the existing architecture well.

### Recommended second pass

Add:

- scene-change detection or optical-flow style change triggers
- a keyframe summarizer that selects the most informative frames
- action-anchored prompts where the model sees the current state plus a target frame

### Recommended third pass

Only if needed for high-end performance:

- WebCodecs frame decode in a worker
- background task queue
- frame caching and compressed previews
- “sample once, then re-use” pipeline for repeated task planning

## 7) CPU and system-load impact

This is the biggest real concern: if the rest of the system is already CPU-heavy, frame extraction can still be manageable if it is throttled correctly.

### Why it still works

- Browsers are already decoding video to display it.
- Canvas sampling is not unusually expensive compared to the world physics loop and model inference.
- If you keep sampling rates low, the resource load stays reasonable.

### Important caveats

- Running extraction at full FPS on a long video will create a noticeable front-end burden.
- If the world physics simulation is already heavy, you should decouple processing into a worker.
- Long videos should not be processed synchronously during the main UI render loop.

### Good practice

- process frames in a Web Worker when possible
- queue extraction instead of doing it all on the main thread
- allow users to preview a sparse temporal set before full model inference
- set a hard cap on frames per import

## 8) Feasibility conclusion

Implementing a client-side video import pipeline for Task Mode is highly feasible and fits the current architecture well.

The most realistic version is not “stream the entire video to the LLM,” but rather:

- decode and sample the video in-browser,
- compress frames down to compact image thumbnails,
- keep a short, relevant temporal window,
- send a small, highly informative set of frames to an image-capable model,
- use the model to generate action guidance or a sub-goal plan.

This approach avoids the main weakness of the design: massive token counts and unnecessary CPU/GPU load. It also makes the feature useful even when the underlying model stack is not native-video-capable.

## 9) Recommendation

Proceed with a conservative first implementation using canvas extraction + fixed temporal sampling.

Do not implement native video streaming as a first step unless there is a clear need for long-duration demonstrations. For the current architecture, a 1-fps or 0.5-fps sampled task demonstration with 8–16 frames is enough to start.

This is a strong feature for Task Mode because it bridges the gap between intuitive human demonstration and model-guided action while staying compatible with existing image-only multimodal endpoints.
