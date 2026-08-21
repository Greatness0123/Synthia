/**
 * Playback helper for the converted Mixamo walk artifact.
 *
 * Wire contract (from useWorld's event handlers):
 *   - `synthia:action`    → binder.validateAndApplyTimeline(sequence, { activeGaitPhase })
 *                           The binder's `syncVisuals` stepper interpolates between
 *                           frames using real wall-clock time (timeOffsetMs), so a
 *                           single dispatch plays the whole cycle at the clip's fps.
 *   - `synthia:rootMotion`→ capsule moves by {dx, dz} in THREE world space.
 *
 * Loop strategy:
 *   - Every `frames / fps` seconds the pose sequence is re-dispatched. The artifact's
 *     last frame is a clone of frame 0, so the tail and head are the same pose and the
 *     re-dispatch seam is invisible.
 *   - One root-motion delta is dispatched per tick (1000/fps ms). Delta indexing mirrors
 *     the stream: while pose frame k is playing, apply the displacement into frame k+1
 *     (rootMotion[k+1]). The loop-seam delta (rootMotion[0] and the trailing clone delta
 *     rootMotion[32]) are zeroed by the converter, so translation accumulates smoothly —
 *     the agent walks forward across the world instead of teleporting.
 */

import type { SynthiaWalkArtifact } from './mixamoStreamConverter';

export const DEFAULT_WALK_SOURCE = '/animations/mixamo-walking-synthia.json';

interface WalkHandle {
  agentId: string;
  intervalId: number;
  tick: number;
  fps: number;
  frames: number;
  cycleTicks: number;
}

const activeWalks = new Map<string, WalkHandle>();

function dispatchAction(agentId: string, sequence: SynthiaWalkArtifact['sequence']): void {
  window.dispatchEvent(
    new CustomEvent('synthia:action', {
      detail: { agentId, sequence, activeGaitPhase: true },
    })
  );
}

function dispatchRootMotion(agentId: string, dx: number, dz: number, tickSeconds: number): void {
  // Road-3: also emit the per-tick delta as a velocity (m/s) so useWorld's
  // synthia:rootMotion handler can drive the critically-damped root velocity
  // servo instead of teleporting the capsule. dx/dz are retained for back-compat.
  window.dispatchEvent(
    new CustomEvent('synthia:rootMotion', {
      detail: {
        agentId,
        dx,
        dz,
        velocity: {
          x: tickSeconds > 0 ? dx / tickSeconds : 0,
          z: tickSeconds > 0 ? dz / tickSeconds : 0,
        },
      },
    })
  );
}

function dispatchResetPose(agentId: string): void {
  window.dispatchEvent(
    new CustomEvent('synthia:resetPose', { detail: { agentId } })
  );
}

/** Load the generated walking artifact (fetched from the public animation dir). */
export async function loadWalkArtifact(
  source: string = DEFAULT_WALK_SOURCE
): Promise<SynthiaWalkArtifact> {
  if (typeof window === 'undefined') {
    throw new Error('playMixamoWalk: loadWalkArtifact requires a browser environment');
  }
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`playMixamoWalk: failed to fetch ${source} (HTTP ${res.status})`);
  }
  return (await res.json()) as SynthiaWalkArtifact;
}

/** True while a walk loop is active for this agent. */
export function isWalking(agentId: string): boolean {
  return activeWalks.has(agentId);
}

/**
 * Start a looping walk for an agent.
 *
 * @param artifact The converted artifact (from loadWalkArtifact).
 * @param agentId  Target agent (default 'agent_0').
 * @returns A handle with a `stop()` bound to this agent.
 */
export function startWalk(
  artifact: SynthiaWalkArtifact,
  agentId: string = 'agent_0'
): { agentId: string; stop: () => void } {
  if (typeof window === 'undefined') {
    throw new Error('playMixamoWalk: startWalk requires a browser environment');
  }

  stopWalk(agentId);

  const fps = artifact.metadata.fps || 30;
  const frames = artifact.metadata.frames || artifact.sequence.length;
  const cycleTicks = Math.max(1, frames);
  const tickMs = 1000 / fps;
  const sequence = artifact.sequence;
  const rootMotion = artifact.rootMotion;

  // Validate bundle shape up front so a malformed artifact fails loudly.
  if (sequence.length < 2 || rootMotion.length !== sequence.length) {
    throw new Error(
      `playMixamoWalk: artifact mismatch — sequence=${sequence.length}, rootMotion=${rootMotion.length}`
    );
  }

  // First cycle starts immediately.
  dispatchAction(agentId, sequence);

  const handle: WalkHandle = {
    agentId,
    tick: 0,
    fps,
    frames,
    cycleTicks,
    intervalId: 0,
  };

  handle.intervalId = window.setInterval(() => {
    const tick = handle.tick;
    const inCycle = tick % handle.cycleTicks;

    // Loop seam: re-dispatch the pose sequence at the start of every cycle.
    if (inCycle === 0 && tick > 0) {
      dispatchAction(agentId, sequence);
    }

    // Root-motion delta for the pose interval [k → k+1]: rootMotion[k+1].
    // rootMotion[0] and the trailing clone delta are zeroed by the converter,
    // so total displacement accumulates across cycles without teleporting.
    const deltaIndex = inCycle + 1;
    const delta = rootMotion[Math.min(deltaIndex, rootMotion.length - 1)] ?? { dx: 0, dz: 0 };
    if (delta.dx !== 0 || delta.dz !== 0) {
      dispatchRootMotion(agentId, delta.dx, delta.dz, tickMs / 1000);
    }

    handle.tick += 1;
  }, tickMs);

  activeWalks.set(agentId, handle);
  return { agentId, stop: () => stopWalk(agentId) };
}

/** Stop the walk for one agent and reset its pose to bind (halts all motion). */
export function stopWalk(agentId: string): void {
  const handle = activeWalks.get(agentId);
  if (handle) {
    window.clearInterval(handle.intervalId);
    activeWalks.delete(agentId);
  }
  dispatchResetPose(agentId);
}

/** Stop every active walk loop. */
export function stopAllWalks(): void {
  for (const agentId of Array.from(activeWalks.keys())) {
    stopWalk(agentId);
  }
}
