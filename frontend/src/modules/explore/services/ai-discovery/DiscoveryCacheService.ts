/**
 * DiscoveryCacheService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Caching service for AI Discovery feeds.
 *
 * Features:
 *  - Cache-first rendering (never block UI on Gemini)
 *  - Background refresh with TTL
 *  - Deduplication of concurrent AI requests
 *  - Location-aware cache keys
 *  - User-scoped cache keys (so one user doesn't get another's feed)
 *  - Fallback to stale cache if refresh fails
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DiscoveryFeed, DiscoveryCacheEntry, DiscoveryOptions } from './types';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const CACHE_PREFIX = '@tics_ai_discovery';
const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const STALE_TTL = 24 * 60 * 60 * 1000; // 24 hours - after this, stale cache is too old
const MAX_CACHE_ENTRIES = 5;

/* ── Active request deduplication ───────────────────────────────────────────── */

let activeRequestKey: string | null = null;
let activeRequestPromise: Promise<DiscoveryFeed> | null = null;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/**
 * Build a location bucket key (rounded to 2 decimal places ≈ 1.1km).
 */
function buildLocationKey(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'default';
  return `${Math.round(lat * 100) / 100}:${Math.round(lng * 100) / 100}`;
}

/**
 * Build a cache key for a discovery request.
 */
function buildCacheKey(userId?: string, location?: { lat: number; lng: number }): string {
  const locKey = buildLocationKey(location?.lat, location?.lng);
  return `${CACHE_PREFIX}:${userId || 'guest'}:${locKey}`;
}

function isExpired(entry: DiscoveryCacheEntry): boolean {
  return Date.now() - entry.cachedAt > entry.ttl;
}

function isTooStale(entry: DiscoveryCacheEntry): boolean {
  return Date.now() - entry.cachedAt > STALE_TTL;
}

/* ── Cache service ──────────────────────────────────────────────────────────── */

export const DiscoveryCacheService = {
  /**
   * Read a cached discovery feed.
   * Returns null if no cache exists or it's too old.
   */
  async get(options: DiscoveryOptions): Promise<DiscoveryFeed | null> {
    try {
      if (options.useCache === false) return null;

      const key = buildCacheKey(options.userId, options.location);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;

      const entry: DiscoveryCacheEntry = JSON.parse(raw);

      // If cache is expired but not too stale, return it with isStale flag
      if (isExpired(entry)) {
        if (isTooStale(entry)) {
          await AsyncStorage.removeItem(key);
          return null;
        }
        return { ...entry.feed, isStale: true };
      }

      return entry.feed;
    } catch {
      return null;
    }
  },

  /**
   * Read a cached feed without checking expiry (for immediate rendering).
   */
  async getImmediate(options: DiscoveryOptions): Promise<DiscoveryFeed | null> {
    try {
      const key = buildCacheKey(options.userId, options.location);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const entry: DiscoveryCacheEntry = JSON.parse(raw);
      return entry.feed;
    } catch {
      return null;
    }
  },

  /**
   * Save a discovery feed to cache.
   */
  async set(feed: DiscoveryFeed, options: DiscoveryOptions): Promise<void> {
    try {
      const key = buildCacheKey(options.userId, options.location);
      const entry: DiscoveryCacheEntry = {
        feed,
        cachedAt: Date.now(),
        ttl: options.cacheTTL || DEFAULT_TTL,
        userId: options.userId,
        locationKey: buildLocationKey(options.location?.lat, options.location?.lng),
      };

      await AsyncStorage.setItem(key, JSON.stringify(entry));

      // Clean up old cache entries if too many
      await this.cleanup();
    } catch {}
  },

  /**
   * Clear cached feeds for a user.
   */
  async clear(userId?: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefix = `${CACHE_PREFIX}:${userId || 'guest'}:`;
      const matching = keys.filter((k) => k.startsWith(prefix));
      if (matching.length > 0) {
        await AsyncStorage.multiRemove(matching);
      }
    } catch {}
  },

  /**
   * Clear all AI discovery cache.
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matching = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (matching.length > 0) {
        await AsyncStorage.multiRemove(matching);
      }
    } catch {}
  },

  /**
   * Dedupe concurrent AI requests.
   * If a request is already in-flight for the same user+location, reuse it.
   */
  async dedupeRequest(
    key: string,
    requestFn: () => Promise<DiscoveryFeed>
  ): Promise<DiscoveryFeed> {
    // If same key is in-flight, return the shared promise
    if (activeRequestKey === key && activeRequestPromise) {
      return activeRequestPromise;
    }

    const promise = requestFn();
    activeRequestKey = key;
    activeRequestPromise = promise;

    try {
      return await promise;
    } finally {
      // Only clear if this is still the active request
      if (activeRequestKey === key) {
        activeRequestKey = null;
        activeRequestPromise = null;
      }
    }
  },

  /**
   * Build a dedup key from options.
   */
  buildDedupKey(options: DiscoveryOptions): string {
    const locKey = buildLocationKey(options.location?.lat, options.location?.lng);
    return `${options.userId || 'guest'}:${locKey}:${options.forceRefresh ? 'refresh' : 'normal'}`;
  },

  /**
   * Get the default TTL value.
   */
  getDefaultTTL(): number {
    return DEFAULT_TTL;
  },

  /**
   * Clean up old cache entries to prevent unbounded growth.
   */
  async cleanup(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length <= MAX_CACHE_ENTRIES) return;

      // Sort by last modified time using cache metadata
      const entries: Array<{ key: string; cachedAt: number }> = [];
      for (const key of cacheKeys) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const entry = JSON.parse(raw);
            entries.push({ key, cachedAt: entry.cachedAt || 0 });
          }
        } catch {}
      }

      // Remove oldest entries beyond the limit
      entries.sort((a, b) => b.cachedAt - a.cachedAt);
      const excess = entries.slice(MAX_CACHE_ENTRIES);
      if (excess.length > 0) {
        await AsyncStorage.multiRemove(excess.map((e) => e.key));
      }
    } catch {}
  },

  /**
   * Check if a cache entry is fresh enough for immediate use.
   */
  isFresh(feed: DiscoveryFeed | null): boolean {
    if (!feed) return false;
    return !feed.isStale && Date.now() - feed.generatedAt < DEFAULT_TTL;
  },
};