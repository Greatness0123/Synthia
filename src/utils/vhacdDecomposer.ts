export function decomposeMesh(
  positions: Float32Array,
  indices: Uint32Array,
  signal?: AbortSignal,
  options?: { maxHulls?: number; maxVerticesPerHull?: number }
): Promise<{ positions: number[]; indices: number[] }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../world/workers/vhacd.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const handleAbort = () => {
      worker.terminate();
      reject(new DOMException('Decomposition cancelled', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Decomposition cancelled', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', handleAbort);
    }

    worker.onmessage = (e: MessageEvent) => {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
      if (e.data.ok) {
        resolve(e.data.hulls);
      } else {
        reject(new Error(e.data.error || 'V-HACD decomposition failed'));
      }
    };

    worker.onerror = (err) => {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
      worker.terminate();
      reject(err);
    };

    worker.postMessage({
      positions,
      indices,
      options: options || {
        maxHulls: 16,
        maxVerticesPerHull: 32
      }
    });
  });
}
