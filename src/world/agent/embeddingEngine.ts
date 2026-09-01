/**
 * EmbeddingEngine - Semantic text embeddings via Web Worker.
 *
 * Runs @xenova/transformers (Xenova/all-MiniLM-L6-v2, 384 dims) in a Web Worker
 * to avoid blocking the main thread where Three.js + MuJoCo run.
 *
 * The model is downloaded from HuggingFace on first use and cached by the browser's
 * Cache API automatically (~22MB, not stored in the repo).
 *
 * Falls back to a deterministic mock embedding if:
 * - Worker fails to load or times out (10s)
 * - navigator.connection.saveData is true
 * - User is offline
 * - Model load fails
 *
 * LRU cache (500 entries) avoids recomputing embeddings for repeated text.
 */

const CACHE_MAX = 500;
const EMBED_TIMEOUT_MS = 10_000;

// --- LRU Cache ---

class LRUCache<V> {
  private map = new Map<string, V>();

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    if (this.map.size >= CACHE_MAX) {
      // Delete oldest (first entry)
      const firstKey = this.map.keys().next().value!;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  get size(): number {
    return this.map.size;
  }
}

// --- EmbeddingEngine ---

export class EmbeddingEngine {
  private static instance: EmbeddingEngine;
  private worker: Worker | null = null;
  private initFailed = false;
  private pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 0;
  private cache = new LRUCache<Float32Array>();
  private _loading = false;
  private _loaded = false;

  /** Whether the real model is currently loading (for UI status). */
  get loading(): boolean { return this._loading; }
  /** Whether the real model has finished loading at least once. */
  get loaded(): boolean { return this._loaded; }

  private constructor() {}

  public static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine.instance) {
      EmbeddingEngine.instance = new EmbeddingEngine();
    }
    return EmbeddingEngine.instance;
  }

  /**
   * Lazily initialize the Web Worker. Call once on first embed request.
   * Returns true if worker started successfully.
   */
  private initWorker(): boolean {
    if (this.worker || this.initFailed) return !this.initFailed;

    // Check save-data preference
    const conn = (navigator as any).connection;
    if (conn?.saveData) {
      console.warn('[EmbeddingEngine] save-data enabled, using mock embeddings');
      this.initFailed = true;
      return false;
    }

    try {
      this.worker = new Worker(
        new URL('../../workers/embedding.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, embedding, error } = e.data;
        if (type === 'result' || type === 'error') {
          const pending = this.pending.get(id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(id);
            if (type === 'result') {
              pending.resolve(new Float32Array(embedding));
            } else {
              pending.reject(new Error(error));
            }
          }
        }
      };

      this.worker.onerror = (e) => {
        console.error('[EmbeddingEngine] Worker error:', e.message);
        this.initFailed = true;
        // Reject all pending
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error('Worker crashed'));
        }
        this.pending.clear();
      };

      return true;
    } catch (err) {
      console.warn('[EmbeddingEngine] Failed to create worker:', err);
      this.initFailed = true;
      return false;
    }
  }

  /**
   * Send text to the worker and get an embedding back.
   * Times out after EMBED_TIMEOUT_MS.
   */
  private embedViaWorker(text: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Embedding timeout'));
      }, EMBED_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type: 'embed', id, text });
    });
  }

  /**
   * Deterministic hash-based mock embedding (384-dim unit vector).
   * Used as fallback when real model is unavailable.
   */
  private generateMockEmbedding(text: string): Float32Array {
    const vector = new Float32Array(384);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 384; i++) {
      vector[i] = Math.sin(hash + i) * Math.cos(hash - i);
    }
    let sumSq = 0;
    for (let i = 0; i < 384; i++) sumSq += vector[i] * vector[i];
    const magnitude = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < 384; i++) vector[i] /= magnitude;
    return vector;
  }

  /**
   * Generate an embedding for the given text.
   * Uses the Web Worker for real embeddings, falls back to mock on failure.
   * Results are cached (LRU, 500 entries).
   */
  public async embed(text: string): Promise<Float32Array> {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) return cached;

    // Check if offline
    if (!navigator.onLine) {
      const mock = this.generateMockEmbedding(text);
      this.cache.set(text, mock);
      return mock;
    }

    // Try real embedding via worker
    if (this.initWorker()) {
      try {
        if (!this._loading && !this._loaded) {
          this._loading = true;
        }
        const embedding = await this.embedViaWorker(text);
        this._loading = false;
        this._loaded = true;
        this.cache.set(text, embedding);
        return embedding;
      } catch (err) {
        this._loading = false;
        const msg = err instanceof Error ? err.message : String(err);
        if (!this.initFailed) {
          console.warn('[EmbeddingEngine] Real embedding failed, using mock:', msg);
        }
        // Fall through to mock
      }
    }

    // Mock fallback
    const mock = this.generateMockEmbedding(text);
    this.cache.set(text, mock);
    return mock;
  }

  /**
   * Generate an embedding synchronously (mock only).
   * Use only when async embedding is not possible.
   */
  public embedSync(text: string): Float32Array {
    const cached = this.cache.get(text);
    if (cached) return cached;
    const mock = this.generateMockEmbedding(text);
    this.cache.set(text, mock);
    return mock;
  }

  /**
   * Get the cache for debugging/display.
   */
  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Dispose the worker (call on app shutdown).
   */
  public dispose(): void {
    if (this.worker) {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Engine disposed'));
      }
      this.pending.clear();
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const embeddingEngine = EmbeddingEngine.getInstance();
