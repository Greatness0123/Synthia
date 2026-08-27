/**
 * Motor Codex (Motion Guide Manual)
 *
 * A structured dictionary of annotated motion recipes and baseline movement patterns.
 * All joint target angles are strictly specified in degrees.
 *
 * Notice for AI models:
 * Every recipe in this codex is a suggestion, not a rigid physical law.
 * Adjust joint angles dynamically based on your physical feedback.
 *
 * HOW IT POPULATES:
 * The dictionary starts empty. Recipes are registered automatically when you
 * paste and run any action script (e.g. 01_standing_and_posture.js) in the
 * browser DevTools console, or by calling synthiaActions.recordAll().
 * You can also import recipes via the "Import JSON" button in the Motion Dictionary.
 */

export interface MotorCodexStep {
  phase: string;
  timeOffsetMs: number;
  commentary: string;
  overrides: Record<string, number | number[]>;
  durationMs?: number;
  interpolation?: 'linear' | 'smooth' | 'step';
  rootVelocity?: [number, number, number];
  balanceMode?: 'auto' | 'soft' | 'dynamic_rmbs' | 'compliant' | 'off' | string;
  stiffnessScale?: number;
  contactsExpected?: string[];
}

export interface MotorCodexEntry {
  id: string;
  category: 'locomotion' | 'posture' | 'aerial' | 'gesture' | 'expressive' | 'recovery' | string;
  title: string;
  tags: string[];
  disclaimer: string;
  summary: string;
  biomechanics_note: string;
  parameters: {
    recommendedSpeedMps?: number;
    cycleDurationMs?: number;
    activeGaitPhase?: boolean;
    balanceMode?: 'auto' | 'soft' | 'dynamic_rmbs' | 'compliant' | 'off' | string;
  };
  steps: MotorCodexStep[];
}

export const MOTOR_CODEX_DISCLAIMER =
  'Suggestion only. The recipes below are approximate structural templates from recorded scripts. They are not rigid constraints. Adjust angles, speed, and balance dynamically based on your physical feedback.';

const STORAGE_KEY = 'synthia_recorded_motor_codex';

let memoryEntries: MotorCodexEntry[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* ignore */ }
  });
}

export class MotorCodexRegistry {
  /**
   * Get all currently registered recipes.
   * Starts empty - populates when action scripts are executed in the console.
   */
  public static getAll(): MotorCodexEntry[] {
    if (typeof localStorage === 'undefined') {
      return [...memoryEntries];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...memoryEntries];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [...memoryEntries];
    } catch {
      return [...memoryEntries];
    }
  }

  /**
   * Register or update a recipe captured from an action script.
   */
  public static register(entry: MotorCodexEntry): void {
    if (!entry || !entry.id) return;
    const current = this.getAll();
    const existingIndex = current.findIndex((e) => e.id === entry.id);
    if (existingIndex >= 0) {
      current[existingIndex] = entry;
    } else {
      current.push(entry);
    }
    memoryEntries = [...current];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch (e) {
        console.warn('[MotorCodex] Failed to persist to localStorage:', e);
      }
    }
    notifyListeners();
  }

  /**
   * Remove a recipe by ID.
   */
  public static remove(id: string): void {
    const filtered = this.getAll().filter((e) => e.id !== id);
    memoryEntries = [...filtered];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch { /* ignore */ }
    }
    notifyListeners();
  }

  /**
   * Clear all recorded recipes.
   */
  public static clear(): void {
    memoryEntries = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch { /* ignore */ }
    }
    notifyListeners();
  }

  /**
   * Subscribe to registry changes.
   */
  public static subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
}

// Expose on window for browser script integration
if (typeof window !== 'undefined') {
  (window as any).synthiaRegisterRecipe = (entry: MotorCodexEntry) => {
    MotorCodexRegistry.register(entry);
    console.log(`[MotorCodex] Registered recipe: "${entry.title}" (${entry.id})`);
  };
  (window as any).synthiaGetRecipes = () => MotorCodexRegistry.getAll();
  (window as any).synthiaClearRecipes = () => MotorCodexRegistry.clear();
}
