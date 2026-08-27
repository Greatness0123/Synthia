/**
 * Standalone draggable panel for spawning objects into the world.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useUIStore } from '../../store/uiStore';
import { OBJECT_PRESETS } from '../../constants/objectPresets';
import { motion, AnimatePresence } from 'framer-motion';
import { synthiaToast } from '../../utils/synthiaToast';
import { STRINGS } from '../../constants/strings';
import { ModelPreview } from './ModelPreview';
import {
  listUploadedModels,
  saveUploadedModel,
  type StoredUploadedModel,
} from '../../utils/uploadedModelsStore';
import { decomposeMesh } from '../../utils/vhacdDecomposer';
import { X, FileCloud, UploadSimple, Spinner, PRESET_ICONS, Cube } from '../ui/icons';

type Preset = typeof OBJECT_PRESETS[0];

export const ObjectSpawner: React.FC = () => {
  const { objectSpawnerOpen, setObjectSpawnerOpen } = useUIStore();
  const [previewScene, setPreviewScene] = useState<THREE.Object3D | null>(null);
  const [previewDimensions, setPreviewDimensions] = useState<string | null>(null);
  const [pendingModel, setPendingModel] = useState<{
    name: string;
    scene: THREE.Group;
    arrayBuffer: ArrayBuffer;
    isTerrain: boolean;
    processed?: {
      hulls: Array<{ positions: number[]; indices: number[] }>;
      hullCount: number;
      sourceTriCount: number;
      version: number;
    };
  } | null>(null);
  const [isTerrain, setIsTerrain] = useState(false);
  const [skipCollision, setSkipCollision] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [savedModels, setSavedModels] = useState<StoredUploadedModel[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const loadSavedModels = useCallback(async () => {
    const models = await listUploadedModels();
    setSavedModels(models);
  }, []);

  useEffect(() => {
    if (!objectSpawnerOpen) return;
    let cancelled = false;
    (async () => {
      const models = await listUploadedModels();
      if (!cancelled) setSavedModels(models);
    })();
    return () => { cancelled = true; };
  }, [objectSpawnerOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setObjectSpawnerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setObjectSpawnerOpen]);

  useEffect(() => {
    const handleCustomComplete = (e: CustomEvent<{ success: boolean; name: string }>) => {
      if (e.detail.success) {
        setPendingModel(null);
        setPreviewScene(null);
        setPreviewDimensions(null);
      }
    };
    window.addEventListener('synthia:spawnCustomComplete', handleCustomComplete as EventListener);
    return () => window.removeEventListener('synthia:spawnCustomComplete', handleCustomComplete as EventListener);
  }, []);

  const handleSpawn = (preset: Preset) => {
    window.dispatchEvent(new CustomEvent('synthia:spawn', { detail: { presetId: preset.id } }));
  };

  const showSizeWarning = (scene: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const minDim = Math.min(size.x, size.y, size.z);
    if (maxDim > 20 || minDim < 0.01) {
      synthiaToast.warning('This model is very large/small - you may want to adjust its scale after spawning');
    }
  };

  const collectMeshGeometry = (root: THREE.Object3D): { vertices: Float32Array; indices: Uint32Array } => {
    const vertices: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry) return;
      const geo = child.geometry;
      const posAttr = geo.getAttribute('position');
      if (!posAttr) return;

      const matrix = child.matrixWorld;
      const tmp = new THREE.Vector3();

      for (let i = 0; i < posAttr.count; i++) {
        tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
        vertices.push(tmp.x, tmp.y, tmp.z);
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          indices.push(geo.index.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(vertexOffset + i);
        }
      }
      vertexOffset += posAttr.count;
    });

    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
    };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();

      // glTF validation for multi-file glTF references
      const isGltf = file.name.toLowerCase().endsWith('.gltf');
      if (isGltf) {
        const text = new TextDecoder().decode(arrayBuffer);
        try {
          const json = JSON.parse(text);
          let hasExternal = false;
          if (json.buffers) {
            for (const buf of json.buffers) {
              if (buf.uri && !buf.uri.startsWith('data:')) {
                hasExternal = true;
                break;
              }
            }
          }
          if (json.images) {
            for (const img of json.images) {
              if (img.uri && !img.uri.startsWith('data:')) {
                hasExternal = true;
                break;
              }
            }
          }
          if (hasExternal) {
            synthiaToast.error('This .gltf references external files (.bin/textures). Please export as self-contained .glb and upload instead.');
            e.target.value = '';
            return;
          }
        } catch (err) {
          synthiaToast.error('Invalid .gltf format');
          e.target.value = '';
          return;
        }
      }

      const loader = new GLTFLoader();
      loader.parse(
        arrayBuffer,
        '',
        async (gltf) => {
          const scene = gltf.scene as THREE.Group;
          const box = new THREE.Box3().setFromObject(scene);
          const size = box.getSize(new THREE.Vector3());
          setPreviewScene(scene);
          setPreviewDimensions(
            `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} units`
          );

          // Get geometry and triangle count for fallback ladder
          const { vertices, indices } = collectMeshGeometry(scene);
          const triCount = indices.length / 3;

          let processed: any = undefined;

          if (skipCollision || isTerrain) {
            // No V-HACD needed
          } else if (triCount < 300) {
            // Skip V-HACD (near convex)
          } else {
            // Run V-HACD inside Worker
            setIsDecomposing(true);
            const controller = new AbortController();
            abortControllerRef.current = controller;

            try {
              // Use more aggressive settings for complex meshes
              const hullLimit = triCount > 50000 ? 24 : 16;
              const vertLimit = triCount > 50000 ? 48 : 32;
              const hulls = await decomposeMesh(vertices, indices, controller.signal, { maxHulls: hullLimit, maxVerticesPerHull: vertLimit });
              processed = {
                hulls,
                hullCount: hulls.length,
                sourceTriCount: triCount,
                version: 1
              };
              synthiaToast.success(`Decomposed into ${hulls.length} convex hulls successfully!`);
              setShowCollision(true); // Automatically toggle preview overlay to show computed hulls
            } catch (err: any) {
              if (err.name === 'AbortError') {
                e.target.value = '';
                return;
              }
              console.warn('V-HACD decomposition failed, falling back to auto convex hull:', err);
              synthiaToast.warning('Decomposition failed. Falling back to auto convex hull.');
            } finally {
              setIsDecomposing(false);
            }
          }

          setPendingModel({
            name: file.name.replace(/\.(glb|gltf)$/i, ''),
            scene,
            arrayBuffer,
            isTerrain,
            processed,
          });
          showSizeWarning(scene);
        },
        (err) => {
          synthiaToast.error(`Failed to load model: ${err.message}`);
        }
      );
    } catch {
      synthiaToast.error('Could not read uploaded file');
    }
    e.target.value = '';
  };

  const commitUpload = async () => {
    if (!pendingModel) return;
    const id = crypto.randomUUID();
    await saveUploadedModel({
      id,
      name: pendingModel.name,
      arrayBuffer: pendingModel.arrayBuffer,
      uploadedAt: Date.now(),
      isTerrain: pendingModel.isTerrain,
      skipCollision: skipCollision,
      processed: pendingModel.processed,
    });
    await loadSavedModels();
    synthiaToast.success(`"${pendingModel.name}" saved to My Uploaded Models`);
  };

  const spawnPending = async (saveFirst: boolean) => {
    if (!pendingModel) return;
    if (saveFirst) await commitUpload();

    window.dispatchEvent(
      new CustomEvent('synthia:spawnCustom', {
        detail: {
          name: pendingModel.name,
          scene: pendingModel.scene.clone(true),
          isTerrain: pendingModel.isTerrain,
          skipCollision: skipCollision,
          processed: pendingModel.processed,
        },
      })
    );
  };

  const spawnSavedModel = async (model: StoredUploadedModel) => {
    const loader = new GLTFLoader();
    loader.parse(
      model.arrayBuffer,
      '',
      async (gltf) => {
        const scene = gltf.scene as THREE.Group;

        // Lazy-load decomposition for legacy saved models that lack processed hulls
        let processed = model.processed;
        if (!processed && !model.isTerrain && !model.skipCollision) {
          const { vertices, indices } = collectMeshGeometry(scene);
          const triCount = indices.length / 3;

          if (triCount >= 300) {
            synthiaToast.info('Optimizing collision mesh for first spawn...');
            try {
              const hullLimit = triCount > 50000 ? 24 : 16;
              const vertLimit = triCount > 50000 ? 48 : 32;
              const hulls = await decomposeMesh(vertices, indices, undefined, { maxHulls: hullLimit, maxVerticesPerHull: vertLimit });
              processed = {
                hulls,
                hullCount: hulls.length,
                sourceTriCount: triCount,
                version: 1
              };
              // Persist back to DB
              await saveUploadedModel({
                ...model,
                processed
              });
              await loadSavedModels();
              synthiaToast.success('Collision mesh optimized and saved!');
        } catch (err) {
              console.warn('Lazy decomposition failed, falling back to auto-convex:', err);
            }
          }
        }

        window.dispatchEvent(
          new CustomEvent('synthia:spawnCustom', {
            detail: {
              name: model.name,
              scene: scene.clone(true),
              isTerrain: model.isTerrain,
              skipCollision: model.skipCollision,
              processed,
            },
          })
        );
      },
      () => synthiaToast.error('Failed to load saved model')
    );
  };

  return (
    <AnimatePresence>
      {objectSpawnerOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          drag
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={{ top: -400, left: -600, right: 600, bottom: 400 }}
          style={{ isolation: 'isolate' }}
          className="fixed right-[8vw] top-[18vh] w-[520px] max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col bg-bg-panel border border-white/10 rounded-modal z-[60] overflow-hidden cursor-grab active:cursor-grabbing shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-bg-panel shrink-0 cursor-grab">
            <h2 className="text-sm font-bold uppercase tracking-widest text-text-secondary">
              {STRINGS.GOD_MODE.OBJECT_SPAWNER_TITLE}
            </h2>
            <button
              onClick={() => setObjectSpawnerOpen(false)}
              className="text-text-tertiary hover:text-text-primary w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              aria-label="Close Object Spawner"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {/* Preset grid */}
            <div className="grid grid-cols-3 gap-3">
              {OBJECT_PRESETS.map((preset) => {
                const IconComponent = PRESET_ICONS[preset.icon] || Cube;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSpawn(preset)}
                    className="group flex flex-col items-center justify-center p-4 border border-border bg-bg-panel rounded-btn hover:border-white/20 hover:bg-bg-hover transition-all"
                  >
                    <IconComponent size={32} className="text-text-tertiary group-hover:text-text-primary mb-2 transition-colors" />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary">{preset.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Custom upload section */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase text-text-tertiary">Custom Model</div>
              <label className="flex flex-col items-center justify-center gap-2 p-6 border border-dashed border-border rounded-btn cursor-pointer hover:border-white/20 transition-colors">
                <UploadSimple size={28} className="text-text-tertiary" />
                <span className="text-xs font-bold uppercase text-text-secondary">Upload Model (.glb / .gltf)</span>
                <input type="file" accept=".glb,.gltf" onChange={handleFileUpload} className="hidden" />
              </label>

              {isDecomposing && (
                <div className="space-y-3 p-4 border border-border rounded-btn bg-bg-elevated/20 flex flex-col items-center justify-center">
                  <Spinner size={32} className="text-text-primary animate-spin" />
                  <div className="text-xs font-bold uppercase text-text-secondary">Generating collision mesh...</div>
                  <button
                    onClick={() => {
                      abortControllerRef.current?.abort();
                      setIsDecomposing(false);
                      synthiaToast.info('Decomposition cancelled');
                    }}
                    className="px-3 py-1.5 text-xs font-bold uppercase border border-border rounded-btn text-text-secondary hover:text-text-primary hover:border-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {pendingModel && (
                <div className="space-y-3 p-3 border border-border rounded-btn bg-bg-elevated/20">
                  <div className="text-xs font-bold uppercase text-text-secondary">{pendingModel.name}</div>
                  <ModelPreview
                    scene={previewScene}
                    showCollision={showCollision}
                    hulls={pendingModel.processed?.hulls}
                  />
                  {previewDimensions && (
                    <div className="text-xs font-mono text-text-tertiary">Dimensions: {previewDimensions}</div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showCollision}
                        onChange={(e) => setShowCollision(e.target.checked)}
                        className="text-secondary cursor-pointer"
                      />
                      Show collision mesh {pendingModel.processed ? `(${pendingModel.processed.hullCount} hulls)` : '(auto convex hull)'}
                    </label>
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isTerrain}
                        onChange={(e) => {
                          setIsTerrain(e.target.checked);
                          setPendingModel((prev) => (prev ? { ...prev, isTerrain: e.target.checked } : null));
                        }}
                        className="text-secondary cursor-pointer"
                      />
                      This is world terrain
                    </label>
                    <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipCollision}
                        onChange={(e) => {
                          setSkipCollision(e.target.checked);
                        }}
                        className="text-secondary cursor-pointer"
                      />
                      Skip collision (purely visual)
                    </label>
                    {skipCollision && (
                      <div className="text-xs text-text-secondary bg-white/5 p-2 rounded border border-white/10 leading-relaxed">
                        This object won't have physical collision - the AI won't be able to touch, push, or interact with it, and it will pass through agents and other objects.
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => spawnPending(false)}
                      className="flex-1 py-2 text-xs font-bold uppercase border border-white/20 rounded-btn text-text-primary hover:bg-white/10"
                    >
                      Spawn Now
                    </button>
                    <button
                      onClick={() => spawnPending(true)}
                      className="flex-1 py-2 text-xs font-bold uppercase bg-white/10 rounded-btn text-white hover:bg-white/10"
                    >
                      Save & Spawn
                    </button>
                  </div>
                </div>
              )}

              {savedModels.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-text-tertiary">My Uploaded Models</div>
                  {savedModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => spawnSavedModel(model)}
                      className="w-full flex items-center gap-3 p-2 border border-border rounded-btn hover:border-white/20 text-left transition-colors"
                    >
                      <FileCloud size={20} className="text-text-tertiary shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-text-primary truncate">{model.name}</span>
                        <span className="text-xs text-text-tertiary">
                          {model.isTerrain ? 'Terrain' : 'Object'} · {new Date(model.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
