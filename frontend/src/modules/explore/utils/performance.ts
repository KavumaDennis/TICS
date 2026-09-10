/**
 * performance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Performance instrumentation for the Explore module.
 * Tracks timing for cache reads, section loads, and full refresh cycles.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface PerformanceTimings {
  [key: string]: number;
}

const timings: PerformanceTimings = {};
const marks: Record<string, number> = {};

/**
 * Mark the start of a performance measurement.
 */
export function markStart(key: string): void {
  marks[key] = Date.now();
}

/**
 * Mark the end of a performance measurement and log it.
 */
export function markEnd(key: string): void {
  if (!marks[key]) return;
  const elapsed = Date.now() - marks[key];
  timings[key] = elapsed;
  if (__DEV__) {
    console.log(`[ExplorePerformance] ${key}: ${elapsed}ms`);
  }
  delete marks[key];
}

/**
 * Log a one-off timing measurement.
 */
export function logTiming(key: string, elapsedMs: number): void {
  timings[key] = elapsedMs;
  if (__DEV__) {
    console.log(`[ExplorePerformance] ${key}: ${elapsedMs}ms`);
  }
}

/**
 * Get all recorded timings.
 */
export function getTimings(): PerformanceTimings {
  return { ...timings };
}

/**
 * Log a summary of all recorded timings.
 */
export function logPerformanceSummary(): void {
  if (!__DEV__) return;
  const entries = Object.entries(timings)
    .sort((a, b) => a[1] - b[1]);
  console.log('[ExplorePerformance] ═══════════════════════════════════════');
  console.log('[ExplorePerformance] 📊 PERFORMANCE SUMMARY:');
  console.log('[ExplorePerformance] ═══════════════════════════════════════');
  for (const [key, value] of entries) {
    console.log(`[ExplorePerformance] ${key}: ${value}ms`);
  }
  console.log('[ExplorePerformance] ═══════════════════════════════════════');
}

/**
 * Reset all recorded timings.
 */
export function resetTimings(): void {
  Object.keys(timings).forEach((k) => delete timings[k]);
  Object.keys(marks).forEach((k) => delete marks[k]);
}