/**
 * withTimeout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic timeout utility for external provider calls.
 * Ensures no single provider can block the Explore screen indefinitely.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Wrap a promise with a hard timeout.
 * If the promise doesn't resolve within `ms`, it rejects with a TimeoutError.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const startedAt = Date.now();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // [OSM TIMEOUT TRACE] — proves WHICH layer aborted a slow provider call
      // and how much of its own budget it had consumed when the section guard
      // fired. Underlying promise keeps running (fills provider cache).
      console.warn(
        `[OSM TIMEOUT TRACE]\ncaller: ${label}\ntimeout configured: ${ms}ms\n` +
          `timeout actually applied: ${ms}ms\nelapsed: ${Date.now() - startedAt}ms\n` +
          `abort signal: none (promise detached, keeps running)\n` +
          `abort reason: section budget exceeded — underlying OSM promise continues`
      );
      const err = new Error(`[${label}] Timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Wrap a promise with a timeout, but return a fallback value on timeout
 * instead of rejecting. This is useful for non-critical providers where
 * we want to continue rendering even if the provider is slow.
 */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(promise, ms, label);
  } catch (err: any) {
    if (err?.name === 'TimeoutError') {
      console.warn(`[withTimeout] ${label} timed out after ${ms}ms — using fallback`);
    }
    return fallback;
  }
}

/**
 * Provider timeout constants (upper bounds, not reasons to wait).
 */
export const PROVIDER_TIMEOUTS = {
  GOOGLE_PLACES: 5_000,
  // Overpass LIVE MEASUREMENT: 2s (healthy primary) to ~16-28s (failover to
  // the slow mirror). 12s aborted healthy requests; sized to the provider's
  // LOCAL_BUDGET_MS so the two never disagree.
  OPEN_STREET_MAP: 32_000,
  TICKETMASTER: 5_000,       // 5 seconds
  EVENTBRITE: 5_000,         // 5 seconds
  WEATHER: 3_000,            // 3 seconds
  GEMINI: 5_000,             // 5 seconds
  FIRESTORE: 5_000,          // 5 seconds
} as const;