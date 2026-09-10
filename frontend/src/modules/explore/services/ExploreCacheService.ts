/**
 * ExploreCacheService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline cache service for the Explore module.
 * Uses AsyncStorage for persistent caching of categories, destinations,
 * events, recently viewed, and search history.
 *
 * Supports location-aware cache keys so tiny GPS movements don't destroy
 * cache effectiveness.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_KEYS,
  CACHE_TTL,
  buildSectionCacheKey,
} from '@/src/modules/explore/constants';
import type {
  ExploreCategory,
  Destination,
  Event,
  JourneyFeedItem,
  NearbyItem,
  WeekendEscape,
  ExploreRecommendation,
} from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/* ── Generic Cache Helpers ──────────────────────────────────────────────────── */

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.timestamp > entry.ttl;
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (isExpired(entry)) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch (err) {
    console.warn('[ExploreCacheService] read error for', key, err);
    return null;
  }
}

async function setCached<T>(
  key: string,
  data: T,
  ttl: number
): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (err) {
    console.warn('[ExploreCacheService] write error for', key, err);
  }
}

async function clearCached(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn('[ExploreCacheService] clear error for', key, err);
  }
}

/* ── Location-Aware Cache Helpers ───────────────────────────────────────────── */

/**
 * Get cached data for a section using a location-scoped key.
 */
async function getLocationCached<T>(
  section: string,
  lat?: number,
  lng?: number
): Promise<T | null> {
  const key = buildSectionCacheKey(section, lat, lng);
  return getCached<T>(key);
}

/**
 * Set cached data for a section using a location-scoped key.
 */
async function setLocationCached<T>(
  section: string,
  data: T,
  ttl: number,
  lat?: number,
  lng?: number
): Promise<void> {
  const key = buildSectionCacheKey(section, lat, lng);
  return setCached(key, data, ttl);
}

/* ── Category Cache ─────────────────────────────────────────────────────────── */

async function getCachedCategories(): Promise<ExploreCategory[] | null> {
  return getCached<ExploreCategory[]>(CACHE_KEYS.CATEGORIES);
}

async function setCachedCategories(categories: ExploreCategory[]): Promise<void> {
  return setCached(CACHE_KEYS.CATEGORIES, categories, CACHE_TTL.CATEGORIES);
}

/* ── Trending Cache ─────────────────────────────────────────────────────────── */

async function getCachedTrending(lat?: number, lng?: number): Promise<Destination[] | null> {
  return getLocationCached<Destination[]>('trending', lat, lng);
}

async function setCachedTrending(destinations: Destination[], lat?: number, lng?: number): Promise<void> {
  return setLocationCached('trending', destinations, CACHE_TTL.TRENDING, lat, lng);
}

/* ── Popular Cache ──────────────────────────────────────────────────────────── */

async function getCachedPopular(): Promise<Destination[] | null> {
  return getCached<Destination[]>(CACHE_KEYS.POPULAR);
}

async function setCachedPopular(destinations: Destination[]): Promise<void> {
  return setCached(CACHE_KEYS.POPULAR, destinations, CACHE_TTL.DESTINATIONS);
}

/* ── Destinations Cache ─────────────────────────────────────────────────────── */

async function getCachedDestinations(): Promise<Destination[] | null> {
  return getCached<Destination[]>(CACHE_KEYS.DESTINATIONS);
}

async function setCachedDestinations(destinations: Destination[]): Promise<void> {
  return setCached(CACHE_KEYS.DESTINATIONS, destinations, CACHE_TTL.DESTINATIONS);
}

/* ── Events Cache ───────────────────────────────────────────────────────────── */

async function getCachedEvents(lat?: number, lng?: number): Promise<Event[] | null> {
  return getLocationCached<Event[]>('events', lat, lng);
}

async function setCachedEvents(events: Event[], lat?: number, lng?: number): Promise<void> {
  return setLocationCached('events', events, CACHE_TTL.EVENTS, lat, lng);
}

/* ── Weekend Escapes Cache ──────────────────────────────────────────────────── */

async function getCachedWeekendEscapes(lat?: number, lng?: number): Promise<WeekendEscape[] | null> {
  return getLocationCached<WeekendEscape[]>('weekend', lat, lng);
}

async function setCachedWeekendEscapes(escapes: WeekendEscape[], lat?: number, lng?: number): Promise<void> {
  return setLocationCached('weekend', escapes, CACHE_TTL.NEARBY, lat, lng);
}

/* ── Recommendations Cache ──────────────────────────────────────────────────── */

async function getCachedRecommendations(): Promise<ExploreRecommendation[] | null> {
  return getCached<ExploreRecommendation[]>(CACHE_KEYS.RECOMMENDATIONS);
}

async function setCachedRecommendations(recs: ExploreRecommendation[]): Promise<void> {
  return setCached(CACHE_KEYS.RECOMMENDATIONS, recs, CACHE_TTL.TRENDING);
}

/* ── Recently Viewed Cache ──────────────────────────────────────────────────── */

async function getCachedRecentlyViewed(): Promise<Destination[] | null> {
  return getCached<Destination[]>(CACHE_KEYS.RECENTLY_VIEWED);
}

async function setCachedRecentlyViewed(destinations: Destination[]): Promise<void> {
  return setCached(
    CACHE_KEYS.RECENTLY_VIEWED,
    destinations,
    CACHE_TTL.RECENTLY_VIEWED
  );
}

async function addToCachedRecentlyViewed(destination: Destination): Promise<void> {
  const existing = await getCachedRecentlyViewed();
  const updated = [destination, ...(existing || [])].filter(
    (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i
  );
  await setCachedRecentlyViewed(updated.slice(0, 20));
}

/* ── Search History Cache ───────────────────────────────────────────────────── */

async function getCachedSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.SEARCH_HISTORY);
    if (!raw) return [];
    const entry: CacheEntry<string[]> = JSON.parse(raw);
    if (isExpired(entry)) {
      await AsyncStorage.removeItem(CACHE_KEYS.SEARCH_HISTORY);
      return [];
    }
    return entry.data;
  } catch {
    return [];
  }
}

async function setCachedSearchHistory(queries: string[]): Promise<void> {
  return setCached(
    CACHE_KEYS.SEARCH_HISTORY,
    queries.slice(0, 20),
    CACHE_TTL.SEARCH_HISTORY
  );
}

async function addToCachedSearchHistory(query: string): Promise<void> {
  const existing = await getCachedSearchHistory();
  const updated = [query, ...existing.filter((q) => q !== query)].slice(0, 20);
  await setCachedSearchHistory(updated);
}

/* ── Journey Feed Cache ─────────────────────────────────────────────────────── */

async function getCachedJourneyFeed(): Promise<JourneyFeedItem[] | null> {
  return getCached<JourneyFeedItem[]>(CACHE_KEYS.JOURNEY_FEED);
}

async function setCachedJourneyFeed(items: JourneyFeedItem[]): Promise<void> {
  return setCached(CACHE_KEYS.JOURNEY_FEED, items, CACHE_TTL.JOURNEY_FEED);
}

/* ── Nearby Cache ───────────────────────────────────────────────────────────── */

async function getCachedNearby(lat?: number, lng?: number): Promise<NearbyItem[] | null> {
  return getLocationCached<NearbyItem[]>('nearby', lat, lng);
}

async function setCachedNearby(items: NearbyItem[], lat?: number, lng?: number): Promise<void> {
  return setLocationCached('nearby', items, CACHE_TTL.NEARBY, lat, lng);
}

/* ── Clear All Cache ────────────────────────────────────────────────────────── */

async function clearAllExploreCache(): Promise<void> {
  const keys = Object.values(CACHE_KEYS);
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (err) {
    console.warn('[ExploreCacheService] clearAll error:', err);
  }
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

export const ExploreCacheService = {
  // Generic get/set (used by ExploreLoadingOrchestrator)
  get: getCached,
  set: setCached,

  // Categories
  getCachedCategories,
  setCachedCategories,

  // Trending
  getCachedTrending,
  setCachedTrending,

  // Popular
  getCachedPopular,
  setCachedPopular,

  // Destinations
  getCachedDestinations,
  setCachedDestinations,

  // Events
  getCachedEvents,
  setCachedEvents,

  // Weekend Escapes
  getCachedWeekendEscapes,
  setCachedWeekendEscapes,

  // Recommendations
  getCachedRecommendations,
  setCachedRecommendations,

  // Recently Viewed
  getCachedRecentlyViewed,
  setCachedRecentlyViewed,
  addToCachedRecentlyViewed,

  // Search History
  getCachedSearchHistory,
  setCachedSearchHistory,
  addToCachedSearchHistory,

  // Journey Feed
  getCachedJourneyFeed,
  setCachedJourneyFeed,

  // Nearby
  getCachedNearby,
  setCachedNearby,

  // Clear All
  clearAllExploreCache,
};