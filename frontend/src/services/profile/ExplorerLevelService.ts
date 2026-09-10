/**
 * ExplorerLevelService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes the Explorer Level from total XP using progressive thresholds.
 * No level is stored in Firestore — only totalXP is persisted.
 * Everything else is derived dynamically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ExplorerLevelInfo {
  level: number;
  totalXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progress: number;       // XP earned within the current level
  progressPercent: number; // 0–100
}

/**
 * XP thresholds for levels 1–10 as defined in the spec.
 * Beyond level 10, a progressive curve is used.
 */
const LEVEL_THRESHOLDS: number[] = [
  0,      // Level 1
  500,    // Level 2
  1_500,  // Level 3
  3_000,  // Level 4
  5_000,  // Level 5
  7_500,  // Level 6
  10_500, // Level 7
  14_000, // Level 8
  18_000, // Level 9
  23_000, // Level 10
];

/** Base increment for the progressive curve beyond level 10 */
const BASE_PROGRESSIVE_INCREMENT = 5_000;

export const ExplorerLevelService = {
  /**
   * Get the XP threshold for a given level.
   * Levels 1–10 use predefined thresholds.
   * Levels 11+ use a progressive curve: each level requires
   * BASE_PROGRESSIVE_INCREMENT + (level - 10) * 500 more XP than the previous.
   */
  getThresholdForLevel(level: number): number {
    if (level <= 0) return 0;
    if (level <= LEVEL_THRESHOLDS.length) {
      return LEVEL_THRESHOLDS[level - 1];
    }
    // Progressive curve beyond level 10
    const baseLevel = LEVEL_THRESHOLDS.length; // 10
    const baseXP = LEVEL_THRESHOLDS[baseLevel - 1]; // 23,000
    let extra = 0;
    for (let l = baseLevel + 1; l <= level; l++) {
      extra += BASE_PROGRESSIVE_INCREMENT + (l - baseLevel - 1) * 500;
    }
    return baseXP + extra;
  },

  /**
   * Calculate the explorer level and all derived info from total XP.
   */
  calculate(totalXP: number): ExplorerLevelInfo {
    const xp = Math.max(0, totalXP);

    // Find the current level by scanning thresholds
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (xp >= LEVEL_THRESHOLDS[i]) {
        level = i + 1;
      } else {
        break;
      }
    }

    // If XP exceeds level 10 threshold, compute beyond
    if (xp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
      let threshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
      let nextThreshold: number;
      for (let l = LEVEL_THRESHOLDS.length + 1; ; l++) {
        nextThreshold = this.getThresholdForLevel(l);
        if (xp < nextThreshold) {
          level = l - 1;
          break;
        }
        threshold = nextThreshold;
      }
    }

    const xpForCurrentLevel = this.getThresholdForLevel(level);
    const xpForNextLevel = this.getThresholdForLevel(level + 1);
    const progress = xp - xpForCurrentLevel;
    const range = xpForNextLevel - xpForCurrentLevel;
    const progressPercent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100;

    return {
      level,
      totalXP: xp,
      xpForCurrentLevel,
      xpForNextLevel,
      progress,
      progressPercent,
    };
  },

  /**
   * Get the display title for a given level.
   */
  getLevelTitle(level: number): string {
    if (level <= 2) return 'Novice Explorer';
    if (level <= 4) return 'Adventurer';
    if (level <= 6) return 'Voyager';
    if (level <= 8) return 'Globetrotter';
    if (level <= 10) return 'Master Explorer';
    return 'Legendary Explorer';
  },
};

export default ExplorerLevelService;