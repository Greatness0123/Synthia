/**
 * EmbeddingEngine client-side wrapper.
 * Returns a deterministic hash-based 384-float array representing the text.
 *
 * NOTE: @xenova/transformers has been removed from this project.
 * All embeddings now use the deterministic mock implementation below.
 * Supabase vector similarity search still works — embeddings are consistent
 * across calls for the same text.
 */

export class EmbeddingEngine {
  private static instance: EmbeddingEngine;

  private constructor() {}

  public static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine.instance) {
      EmbeddingEngine.instance = new EmbeddingEngine();
    }
    return EmbeddingEngine.instance;
  }

  /**
   * Generates a deterministic hash-based 384-float unit vector for the text.
   * Consistent across calls — identical text always produces the same vector,
   * which is sufficient for relative similarity ranking in Supabase.
   */
  private generateMockEmbedding(text: string): Float32Array {
    const vector = new Float32Array(384);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 384; i++) {
      const val = Math.sin(hash + i) * Math.cos(hash - i);
      vector[i] = val;
    }
    // Normalize to unit vector
    let sumSq = 0;
    for (let i = 0; i < 384; i++) sumSq += vector[i] * vector[i];
    const magnitude = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < 384; i++) vector[i] /= magnitude;
    return vector;
  }

  public async embed(text: string, _forceReal: boolean = false): Promise<Float32Array> {
    return this.generateMockEmbedding(text);
  }
}

export const embeddingEngine = EmbeddingEngine.getInstance();
