/**
 * EmbeddingEngine client-side wrapper.
 * Returns a deterministic mock/stubbed 384-float array when in mock mode.
 * Lazy-loads @xenova/transformers only when needed / Supabase is configured.
 */

export class EmbeddingEngine {
  private static instance: EmbeddingEngine;
  private pipe: any = null;

  private constructor() {}

  public static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine.instance) {
      EmbeddingEngine.instance = new EmbeddingEngine();
    }
    return EmbeddingEngine.instance;
  }

  public async init(): Promise<void> {
    if (this.pipe) return;

    try {
      console.log('[EmbeddingEngine] Lazy-loading @xenova/transformers...');
      const { pipeline } = await import('@xenova/transformers');
      this.pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        cache_dir: './models',
      });
      console.log('[EmbeddingEngine] @xenova/transformers loaded successfully.');
    } catch (err) {
      console.error('[EmbeddingEngine] Failed to lazy-load @xenova/transformers:', err);
    }
  }

  /**
   * Generates a deterministic hash-based 384-float array representing the text.
   */
  private generateMockEmbedding(text: string): Float32Array {
    const vector = new Float32Array(384);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 384; i++) {
      // Use trigonometric functions driven by hash and index to generate a smooth, deterministic pseudo-random unit vector
      const val = Math.sin(hash + i) * Math.cos(hash - i);
      vector[i] = val;
    }
    // Normalize vector
    let sumSq = 0;
    for (let i = 0; i < 384; i++) sumSq += vector[i] * vector[i];
    const magnitude = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < 384; i++) vector[i] /= magnitude;

    return vector;
  }

  public async embed(text: string, forceReal: boolean = false): Promise<Float32Array> {
    if (forceReal) {
      if (!this.pipe) {
        await this.init();
      }
      if (this.pipe) {
        const output = await this.pipe(text, {
          pooling: 'mean',
          normalize: true,
        });
        return output.data as Float32Array;
      }
    }

    // Default mock fallback
    return this.generateMockEmbedding(text);
  }
}

export const embeddingEngine = EmbeddingEngine.getInstance();
