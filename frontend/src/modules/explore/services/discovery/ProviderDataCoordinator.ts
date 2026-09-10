/**
 * ProviderDataCoordinator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared provider data layer for the Explore module.
 *
 * The orchestrator, TrendingEngine, WeekendEscapeIntelligence, and other
 * consumers all request nearby destination data. This coordinator:
 *   1. Consolidates requests through the OSM-first DestinationAggregator
 *   2. Coalesces in-flight requests (all consumers share the same Promise)
 *   3. Reuses cached results within a TTL window
 *   4. Tracks provider health for diagnostics
 *
 * Google Places is OPTIONAL. When disabled it returns an empty result and no
 * Google request is even issued. OSM + Firestore curated keep working.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';
import { GooglePlacesProvider, googlePlacesAvailable } from './providers';
import { DestinationAggregator } from './DestinationAggregator';
import type { TICSDestination } from './providers';

/* ── Provider Status Types ──────────────────────────────────────────────────── */

export type ProviderStatus =
  | 'SUCCESS_WITH_DATA'
  | 'SUCCESS_EMPTY'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'PARSE_ERROR'
  | 'NOT_QUERIED';

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  rawCount: number;
  usableCount: number;
  latencyMs: number;
  error?: string;
  queriedAt: number;
}

/* ── Result shapes (backward-compatible) ──────────────────────────────────── */

export interface PlacesProviderResult {
  places: NearbyItem[];
  provider: 'google_places';
  fetchedAt: number;
}

export interface OpenStreetMapProviderResult {
  places: NearbyItem[];
  provider: 'openstreetmap';
  fetchedAt: number;
}

export interface EventsProviderResult {
  events: unknown[];
  fetchedAt: number;
}

/* ── Cache Entry ──────────────────────────────────────────────────────────── */

interface CacheEntry<T> {
  promise: Promise<T>;
  result?: T;
  expiresAt: number;
}

/* ── Constants ──────────────────────────────────────────────────────────────── */

const CACHE_TTL_MS = 30_000; // 30 seconds

const osmCache = new Map<string, CacheEntry<OpenStreetMapProviderResult>>();
const googleCache = new Map<string, CacheEntry<PlacesProviderResult>>();
const providerHealth: Record<string, ProviderHealth> = {};

function buildKey(lat: number, lng: number, radiusKm: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radiusKm}`;
}

function coalesceRequest<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  label: string,
  fetchFn: () => Promise<T>,
  getHealth: (result: T) => { rawCount: number; usableCount: number }
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  // Reuse in-flight promise (request coalescing).
  if (existing && !existing.result) return existing.promise;
  // Reuse fresh cached result.
  if (existing && existing.result && existing.expiresAt > now) {
    return Promise.resolve(existing.result);
  }

  const startTime = Date.now();
  const entry: CacheEntry<T> = {
    promise: fetchFn()
      .then((result) => {
        entry.result = result;
        entry.expiresAt = Date.now() + CACHE_TTL_MS;
        const health = getHealth(result);
        providerHealth[label] = {
          provider: label,
          status: health.rawCount > 0 ? 'SUCCESS_WITH_DATA' : 'SUCCESS_EMPTY',
          rawCount: health.rawCount,
          usableCount: health.usableCount,
          latencyMs: Date.now() - startTime,
          queriedAt: Date.now(),
        };
        return result;
      })
      .catch((err) => {
        providerHealth[label] = {
          provider: label,
          status: 'NETWORK_ERROR',
          rawCount: 0,
          usableCount: 0,
          latencyMs: Date.now() - startTime,
          error: err?.message || String(err),
          queriedAt: Date.now(),
        };
        throw err;
      }),
    expiresAt: 0,
  };
  cache.set(key, entry);
  return entry.promise;
}

function toNearby(dests: TICSDestination[], lat: number, lng: number): NearbyItem[] {
  return DestinationAggregator.toNearbyItems(dests, { lat, lng });
}

export const ProviderDataCoordinator = {
  /**
   * OpenStreetMap-first destination data (merged with Firestore curated, plus
   * optional Google enrichment). Returns NearbyItem[] for compatibility.
   */
  async getOpenStreetMap(
    lat: number,
    lng: number,
    radiusKm: number = 100
  ): Promise<OpenStreetMapProviderResult> {
    const key = buildKey(lat, lng, radiusKm);
    return coalesceRequest(
      osmCache,
      key,
      'openstreetmap',
      async () => {
        const dests = await DestinationAggregator.nearby({ lat, lng, radiusKm, limit: 40 });
        return {
          places: toNearby(dests, lat, lng),
          provider: 'openstreetmap' as const,
          fetchedAt: Date.now(),
        };
      },
      (result) => ({ rawCount: result.places.length, usableCount: result.places.length })
    );
  },

  /**
   * Google Places data. OPTIONAL — returns empty when disabled so the pipeline
   * never depends on it. Never throws into the critical path.
   */
  async getGooglePlaces(
    lat: number,
    lng: number,
    radiusKm: number = 100
  ): Promise<PlacesProviderResult> {
    if (!googlePlacesAvailable()) {
      return { places: [], provider: 'google_places', fetchedAt: Date.now() };
    }
    const key = buildKey(lat, lng, radiusKm);
    return coalesceRequest(
      googleCache,
      key,
      'google_places',
      async () => {
        const dests = await GooglePlacesProvider.searchNearby({ lat, lng, radiusKm, limit: 30 });
        return {
          places: toNearby(dests, lat, lng),
          provider: 'google_places' as const,
          fetchedAt: Date.now(),
        };
      },
      (result) => ({ rawCount: result.places.length, usableCount: result.places.length })
    );
  },

  /** Get provider health information for diagnostics. */
  getProviderHealth(): Record<string, ProviderHealth> {
    return { ...providerHealth };
  },

  /** Clear all caches (e.g. on location change). */
  clearCaches(): void {
    osmCache.clear();
    googleCache.clear();
  },

  /** Get a summary of provider health for logging. */
  getHealthSummary(): string {
    const entries = Object.entries(providerHealth);
    if (entries.length === 0) return 'No providers queried yet';
    return entries
      .map(([name, h]) => `${name}: ${h.status} (raw: ${h.rawCount}, usable: ${h.usableCount}, ${h.latencyMs}ms)`)
      .join('\n');
  },
};