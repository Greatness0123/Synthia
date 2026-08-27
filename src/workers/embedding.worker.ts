/**
 * Embedding Web Worker.
 * Runs @xenova/transformers in a separate thread to avoid blocking
 * the main thread where Three.js + MuJoCo run.
 *
 * The model (Xenova/all-MiniLM-L6-v2, ~22MB) is downloaded from HuggingFace
 * on first use and cached by the browser's Cache API automatically.
 */

let pipeline: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;

async function ensurePipeline(): Promise<void> {
  if (pipeline || initFailed) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { pipeline: loadPipeline } = await import('@xenova/transformers');
        pipeline = await loadPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (err) {
        initFailed = true;
        throw err;
      }
    })();
  }
  await initPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, text } = e.data;

  if (type === 'embed') {
    try {
      await ensurePipeline();
      const result = await pipeline(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(result.data as Float32Array);
      (self as any).postMessage({ type: 'result', id, embedding });
    } catch (err) {
      (self as any).postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (type === 'ping') {
    (self as any).postMessage({ type: 'pong' });
  }
};
