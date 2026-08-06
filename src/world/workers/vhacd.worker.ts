import { ConvexMeshDecomposition } from 'vhacd-js';

self.onmessage = async (e: MessageEvent) => {
  const { positions, indices, options } = e.data;
  try {
    const decomposer = await ConvexMeshDecomposition.create();
    const hulls = decomposer.computeConvexHulls({ positions, indices }, options || {
      maxHulls: 16,
      maxVerticesPerHull: 32
    });

    const processedHulls = hulls.map((hull: any) => ({
      positions: Array.from(hull.positions),
      indices: Array.from(hull.indices)
    }));

    self.postMessage({ ok: true, hulls: processedHulls });
  } catch (err: any) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
