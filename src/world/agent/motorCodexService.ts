/**
 * Motor Codex Service
 *
 * Provides fast querying of dynamically recorded recipes,
 * and formats clean, token-efficient prompt hints for AI models.
 */

import { MotorCodexRegistry, MotorCodexEntry, MOTOR_CODEX_DISCLAIMER } from '../../constants/motorCodex';

export class MotorCodexService {
  /**
   * Find the most relevant recorded recipes for a given goal, query, or context.
   */
  public static findRelevant(query: string, maxResults: number = 2): MotorCodexEntry[] {
    const allRecipes = MotorCodexRegistry.getAll();
    if (!allRecipes || allRecipes.length === 0) return [];
    if (!query || typeof query !== 'string') return allRecipes.slice(0, maxResults);

    const tokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
    if (tokens.length === 0) return allRecipes.slice(0, maxResults);

    const scored = allRecipes.map(entry => {
      let score = 0;

      // Exact title or ID match
      const titleLower = entry.title.toLowerCase();
      const idLower = entry.id.toLowerCase();
      if (query.toLowerCase().includes(titleLower) || query.toLowerCase().includes(idLower)) {
        score += 10;
      }

      // Title & ID individual token matches
      for (const token of tokens) {
        if (titleLower.includes(token)) {
          score += 5;
        }
        if (idLower.includes(token)) {
          score += 4;
        }
      }

      // Tag matches
      if (Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          if (tokens.includes(tag.toLowerCase())) {
            score += 4;
          } else if (tokens.some(t => tag.toLowerCase().includes(t))) {
            score += 2;
          }
        }
      }

      // Category match
      if (tokens.includes(entry.category?.toLowerCase())) {
        score += 3;
      }

      // Summary keyword match
      const summaryLower = (entry.summary || '').toLowerCase();
      for (const token of tokens) {
        if (summaryLower.includes(token)) {
          score += 1;
        }
      }

      return { entry, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.entry);
  }

  /**
   * Retrieve a specific recipe by ID.
   */
  public static getById(id: string): MotorCodexEntry | null {
    const allRecipes = MotorCodexRegistry.getAll();
    return allRecipes.find(e => e.id === id) || null;
  }

  /**
   * Format recipes into a clean, concise prompt without emdashes.
   */
  public static formatForPrompt(entries: MotorCodexEntry[]): string {
    if (!entries || entries.length === 0) return '';

    let out = `== MOTION GUIDE MANUAL (SUGGESTED MOTOR RECIPES) ==\n`;
    out += `DISCLAIMER: ${MOTOR_CODEX_DISCLAIMER}\n\n`;

    entries.forEach((entry, idx) => {
      out += `[Recipe ${idx + 1}: ${entry.title.toUpperCase()} (ID: ${entry.id})]\n`;
      if (entry.summary) {
        out += `Intent: ${entry.summary}\n`;
      }
      if (entry.biomechanics_note) {
        out += `Biomechanical note: ${entry.biomechanics_note}\n`;
      }
      if (entry.parameters?.recommendedSpeedMps !== undefined) {
        out += `Propulsion speed: ${entry.parameters.recommendedSpeedMps} m/s\n`;
      }

      out += `Milestone keyframes:\n`;
      (entry.steps || []).forEach((step, sIdx) => {
        out += `  Frame ${sIdx + 1} (${step.timeOffsetMs}ms): ${step.phase}\n`;
        if (step.commentary) {
          out += `    Note: ${step.commentary}\n`;
        }
        out += `    Joint targets in degrees: ${JSON.stringify(step.overrides)}\n`;
        if (step.rootVelocity) {
          out += `    Root velocity: [${step.rootVelocity.join(', ')}]\n`;
        }
      });
      out += '\n';
    });

    return out.trim();
  }
}
