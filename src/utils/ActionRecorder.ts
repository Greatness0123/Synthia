/**
 * ActionRecorder
 *
 * Universal recorder & annotator for humanoid actions in Synthia.
 * Captures live joint angles (commanded vs actual), root velocities, contact states,
 * and compiles them into clean, degree-based Motor Codex recipes.
 */

export interface RecordedFrame {
  timeOffsetMs: number;
  phaseName: string;
  commentary: string;
  commandedJointsDeg: Record<string, number | number[]>;
  actualJointsDeg?: Record<string, number | number[]>;
  rootVelocity?: [number, number, number];
  contacts?: string[];
}

export interface RecordedActionRecipe {
  id: string;
  category: string;
  title: string;
  summary: string;
  biomechanics_note: string;
  parameters: {
    recommendedSpeedMps?: number;
    cycleDurationMs?: number;
    activeGaitPhase?: boolean;
    balanceMode?: string;
  };
  steps: Array<{
    phase: string;
    timeOffsetMs: number;
    commentary: string;
    overrides: Record<string, number | number[]>;
    rootVelocity?: [number, number, number];
  }>;
}

export class ActionRecorder {
  private static isRecording = false;
  private static currentAction: Partial<RecordedActionRecipe> | null = null;
  private static frames: RecordedFrame[] = [];
  private static startTime = 0;

  /**
   * Start recording a new action sequence.
   */
  public static start(id: string, title: string, category: string = 'locomotion', summary: string = '', biomechanics: string = '') {
    this.isRecording = true;
    this.startTime = performance.now();
    this.frames = [];
    this.currentAction = {
      id,
      title,
      category,
      summary: summary || `Recorded motion recipe for ${title}`,
      biomechanics_note: biomechanics || `Recorded from live simulation execution.`,
      parameters: {},
      steps: [],
    };
    console.log(`[ActionRecorder] Recording started: "${title}" (${id})`);
  }

  /**
   * Capture a single milestone frame.
   */
  public static recordFrame(
    phaseName: string,
    commandedOverrides: Record<string, number | number[]>,
    commentary: string = '',
    opts: { rootVelocity?: [number, number, number]; timeOffsetMs?: number } = {}
  ) {
    if (!this.isRecording) return;

    const timeOffsetMs = opts.timeOffsetMs !== undefined
      ? opts.timeOffsetMs
      : Math.round(performance.now() - this.startTime);

    // Ensure all values are degrees (convert if radians are detected)
    const degOverrides: Record<string, number | number[]> = {};
    for (const [bone, val] of Object.entries(commandedOverrides)) {
      if (Array.isArray(val)) {
        degOverrides[bone] = val.map(v => (Math.abs(v) <= Math.PI * 2 && v !== 0 ? Math.round(v * (180 / Math.PI)) : Math.round(v)));
      } else if (typeof val === 'number') {
        degOverrides[bone] = (Math.abs(val) <= Math.PI * 2 && val !== 0) ? Math.round(val * (180 / Math.PI)) : Math.round(val);
      }
    }

    const frame: RecordedFrame = {
      timeOffsetMs,
      phaseName,
      commentary: commentary || `Milestone frame at ${timeOffsetMs}ms`,
      commandedJointsDeg: degOverrides,
      rootVelocity: opts.rootVelocity,
    };

    this.frames.push(frame);
    console.log(`[ActionRecorder] Frame recorded: [${timeOffsetMs}ms] ${phaseName}`);
  }

  /**
   * Stop recording, assemble the recipe, and return/download the JSON.
   */
  public static stop(autoDownload: boolean = true): RecordedActionRecipe | null {
    if (!this.isRecording || !this.currentAction) {
      console.warn('[ActionRecorder] No active recording to stop.');
      return null;
    }

    this.isRecording = false;

    const recipe: RecordedActionRecipe = {
      id: this.currentAction.id || `action_${Date.now()}`,
      category: this.currentAction.category || 'custom',
      title: this.currentAction.title || 'Custom Action',
      summary: this.currentAction.summary || '',
      biomechanics_note: this.currentAction.biomechanics_note || '',
      parameters: {
        cycleDurationMs: this.frames.length > 0 ? this.frames[this.frames.length - 1].timeOffsetMs : 0,
        ...this.currentAction.parameters,
      },
      steps: this.frames.map(f => ({
        phase: f.phaseName,
        timeOffsetMs: f.timeOffsetMs,
        commentary: f.commentary,
        overrides: f.commandedJointsDeg,
        rootVelocity: f.rootVelocity,
      })),
    };

    console.log(`[ActionRecorder] Recording stopped. Total frames: ${recipe.steps.length}`);

    if (autoDownload && typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.downloadJson(recipe, `${recipe.id}_codex.json`);
    }

    this.currentAction = null;
    this.frames = [];
    return recipe;
  }

  /**
   * Helper to trigger browser file download of the JSON recipe.
   */
  public static downloadJson(data: any, filename: string) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[ActionRecorder] Exported recipe to ${filename}`);
    } catch (err) {
      console.error('[ActionRecorder] Download failed:', err);
    }
  }
}

// Expose globally on window for browser scripts
if (typeof window !== 'undefined') {
  (window as any).synthiaActionRecorder = ActionRecorder;
}
