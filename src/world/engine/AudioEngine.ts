import * as Tone from 'tone';
import { logger as Logger } from '../../utils/logger';

export class AudioEngine {
  private masterOutput: any = null;
  private analyser: Tone.Analyser | null = null;
  private initialized = false;

  // ── Collision sound rate-limiting and node tracking ────────────────────
  private lastCollisionSoundAt: number = 0;
  private activeCollisionNodes: Array<{ noise: any; filter: any; envelope: any }> = [];
  private static readonly COLLISION_RATE_LIMIT_MS = 50;
  private static readonly MAX_CONCURRENT_COLLISIONS = 4;

  public async init(): Promise<void> {
    // Basic init that doesn't create nodes requiring user gesture if possible.
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.masterOutput = (Tone.getContext().rawContext as AudioContext).createMediaStreamDestination();

      this.analyser = new Tone.Analyser("waveform", 2048);
      Tone.getDestination().connect(this.analyser);
      Tone.getDestination().connect(this.masterOutput);

      this.initialized = true;
      Logger.info('AudioEngine: Tone.js initialized');
    } catch (error) {
      Logger.error('AudioEngine: Failed to initialize Tone.js', error);
    }
  }

  public playCollisionSound(impact: number): void {
    if (!this.initialized || impact < 0.5) return;

    // Rate-limit collision sounds to prevent node accumulation
    const now = performance.now();
    if (now - this.lastCollisionSoundAt < AudioEngine.COLLISION_RATE_LIMIT_MS) return;
    this.lastCollisionSoundAt = now;

    // Limit concurrent collision voice nodes
    if (this.activeCollisionNodes.length >= AudioEngine.MAX_CONCURRENT_COLLISIONS) return;

    const noise = new Tone.Noise("white").start();
    const filter = new Tone.Filter(2000, "lowpass").toDestination();
    noise.connect(filter);

    const env = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay: 0.05,
      sustain: 0,
      release: 0.05
    }).connect(filter);

    const nodeGroup = { noise, filter, envelope: env };
    this.activeCollisionNodes.push(nodeGroup);

    env.triggerAttackRelease(0.05);
    setTimeout(() => {
      try {
        noise.stop();
        noise.dispose();
        filter.dispose();
        env.dispose();
      } catch {
        // swallow disposal errors
      }
      this.activeCollisionNodes = this.activeCollisionNodes.filter(n => n !== nodeGroup);
    }, 100);
  }

  public getStream(): MediaStream | null {
    return this.masterOutput?.stream || null;
  }

  public async getBuffer(): Promise<Float32Array | null> {
    if (!this.initialized || !this.analyser) return null;

    const data = this.analyser.getValue() as Float32Array;
    const rms = Math.sqrt(data.reduce((s, v) => s + v*v, 0) / data.length);
    if (rms < 0.001) return null;  

    return data;
  }

  /** Dispose all WebAudio nodes to prevent leaks. */
  public dispose(): void {
    // Dispose any active collision sound nodes
    for (const node of this.activeCollisionNodes) {
      try {
        node.noise.stop();
        node.noise.dispose();
        node.filter.dispose();
        node.envelope.dispose();
      } catch {
        // swallow
      }
    }
    this.activeCollisionNodes = [];

    if (this.analyser) {
      this.analyser.dispose();
      this.analyser = null;
    }
    this.masterOutput = null;
    this.initialized = false;
  }
}
