/// <reference types="vite/client" />

declare module 'vhacd-js' {
  export class ConvexMeshDecomposition {
    static create(): Promise<ConvexMeshDecomposition>;
    computeConvexHulls(
      mesh: { positions: Float32Array | number[]; indices: Uint32Array | number[] },
      options?: { maxHulls?: number; maxVerticesPerHull?: number }
    ): Array<{ positions: number[]; indices: number[] }>;
  }
}
