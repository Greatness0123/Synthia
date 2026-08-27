import { logger as Logger } from '../../utils/logger';

export interface MemorySnapshot {
  timestamp: number;
  wasmHeapBytes: number;
  jsHeapUsedBytes: number | null;
  jsHeapLimitBytes: number | null;
  threeGeometries: number;
  threeTextures: number;
  threePrograms: number;
  contactForceRegistrySize: number;
  objectCount: number;
  mockMemoryStoreSize: number;
}

// ── Memory thresholds ──────────────────────────────────────────────────
const WARN_WASM_BYTES = 1.4 * 1024 * 1024 * 1024;   // 1.4 GB
const CRITICAL_WASM_BYTES = 1.8 * 1024 * 1024 * 1024; // 1.8 GB

let _lastWarningLevel: 'normal' | 'warn' | 'critical' = 'normal';

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _listeners: ((snapshot: MemorySnapshot) => void)[] = [];
let _wasmModuleRef: any = null;
let _physicsEngineRef: any = null;
let _objectManagerRef: any = null;

export function initMemoryMonitor(config: {
  wasmModule?: any;
  physicsEngine?: any;
  objectManager?: any;
  intervalMs?: number;
  onSnapshot?: (snapshot: MemorySnapshot) => void;
}): void {
  _wasmModuleRef = config.wasmModule ?? null;
  _physicsEngineRef = config.physicsEngine ?? null;
  _objectManagerRef = config.objectManager ?? null;

  if (config.onSnapshot) {
    _listeners.push(config.onSnapshot);
  }

  const intervalMs = config.intervalMs ?? 5000;

  if (_intervalId !== null) {
    clearInterval(_intervalId);
  }

  _intervalId = setInterval(() => {
    const snapshot = collectSnapshot();
    for (const listener of _listeners) {
      try {
        listener(snapshot);
      } catch {
        // listener error — ignore
      }
    }
  }, intervalMs);
}

export function stopMemoryMonitor(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  _listeners = [];
  _wasmModuleRef = null;
  _physicsEngineRef = null;
  _objectManagerRef = null;
}

export function addMemoryListener(listener: (snapshot: MemorySnapshot) => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(l => l !== listener);
  };
}

export function collectSnapshot(): MemorySnapshot {
  const wasmHeapBytes = getWasmHeapBytes();
  const jsHeapUsedBytes = getJsHeapUsed();
  const jsHeapLimitBytes = getJsHeapLimit();
  const threeStats = getThreeStats();
  const contactForceRegistrySize = getContactForceRegistrySize();
  const objectCount = getObjectCount();
  const mockMemoryStoreSize = getMockMemoryStoreSize();

  return {
    timestamp: Date.now(),
    wasmHeapBytes,
    jsHeapUsedBytes,
    jsHeapLimitBytes,
    ...threeStats,
    contactForceRegistrySize,
    objectCount,
    mockMemoryStoreSize,
  };
}

function getWasmHeapBytes(): number {
  // NEVER access HEAP8/HEAPU8 on the MuJoCo embind module — they are not exported
  // and accessing them triggers a fatal Emscripten abort that kills the WASM instance.
  // Use performance.memory (Chrome/Edge only) as a proxy for total WASM+JS heap.
  try {
    const mem = (performance as any).memory;
    if (mem && mem.totalJSHeapSize) return mem.totalJSHeapSize;
  } catch {
    // ignore
  }
  return 0;
}

function getJsHeapUsed(): number | null {
  try {
    return (performance as any).memory?.usedJSHeapSize ?? null;
  } catch {
    return null;
  }
}

function getJsHeapLimit(): number | null {
  try {
    return (performance as any).memory?.jsHeapSizeLimit ?? null;
  } catch {
    return null;
  }
}

function getThreeStats(): { threeGeometries: number; threeTextures: number; threePrograms: number } {
  try {
    const mod = _wasmModuleRef;
    // Access renderer.info via the global world engine reference
    const worldEngine = (window as any)._synthia_world_engine;
    if (!worldEngine) return { threeGeometries: 0, threeTextures: 0, threePrograms: 0 };

    const renderer = worldEngine.getRenderer?.();
    if (!renderer?.info) return { threeGeometries: 0, threeTextures: 0, threePrograms: 0 };

    return {
      threeGeometries: renderer.info.memory?.geometries ?? 0,
      threeTextures: renderer.info.memory?.textures ?? 0,
      threePrograms: renderer.info.programs?.length ?? 0,
    };
  } catch {
    return { threeGeometries: 0, threeTextures: 0, threePrograms: 0 };
  }
}

function getContactForceRegistrySize(): number {
  try {
    return _physicsEngineRef?.getContactForceRegistry()?.size ?? 0;
  } catch {
    return 0;
  }
}

function getObjectCount(): number {
  try {
    return _objectManagerRef?.getObjects()?.size ?? 0;
  } catch {
    return 0;
  }
}

function getMockMemoryStoreSize(): number {
  try {
    // Access via global reference if available
    const memMgr = (window as any).__SYNTHIA_MEMORY_MANAGER__;
    if (memMgr?.mockStore) {
      return Array.isArray(memMgr.mockStore) ? memMgr.mockStore.length : memMgr.mockStore.size ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function logMemorySnapshot(label?: string): void {
  const snap = collectSnapshot();
  const wasmMB = (snap.wasmHeapBytes / (1024 * 1024)).toFixed(1);
  const jsMB = snap.jsHeapUsedBytes != null ? (snap.jsHeapUsedBytes / (1024 * 1024)).toFixed(1) : 'N/A';
  const limitMB = snap.jsHeapLimitBytes != null ? (snap.jsHeapLimitBytes / (1024 * 1024)).toFixed(1) : 'N/A';

  Logger.info(
    `[MEMORY${label ? ' ' + label : ''}] ` +
    `WASM=${wasmMB}MB, JS=${jsMB}/${limitMB}MB, ` +
    `Three.js: geo=${snap.threeGeometries} tex=${snap.threeTextures} prog=${snap.threePrograms}, ` +
    `contacts=${snap.contactForceRegistrySize}, objects=${snap.objectCount}`
  );
}

/** Check memory level and warn if approaching limits. Returns current level. */
export function checkMemoryLevel(): 'normal' | 'warn' | 'critical' {
  const snap = collectSnapshot();
  let level: 'normal' | 'warn' | 'critical' = 'normal';

  if (snap.wasmHeapBytes >= CRITICAL_WASM_BYTES) {
    level = 'critical';
  } else if (snap.wasmHeapBytes >= WARN_WASM_BYTES) {
    level = 'warn';
  }

  if (level !== _lastWarningLevel) {
    if (level === 'critical') {
      Logger.error(`[MEMORY] CRITICAL: WASM heap at ${(snap.wasmHeapBytes / (1024 * 1024)).toFixed(0)}MB — approaching 2GB limit. Object spawning blocked.`);
    } else if (level === 'warn') {
      Logger.warn(`[MEMORY] WARNING: WASM heap at ${(snap.wasmHeapBytes / (1024 * 1024)).toFixed(0)}MB — nearing safe limit.`);
    }
    _lastWarningLevel = level;
  }

  return level;
}

/** Returns true if WASM memory is safe for new object spawns. */
export function canSpawnObject(): boolean {
  const level = checkMemoryLevel();
  return level !== 'critical';
}
