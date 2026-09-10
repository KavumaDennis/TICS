/**
 * DestinationCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight in-memory cache for API-derived destinations.
 * 
 * When Google Places/OSM destinations are tapped, they need to navigate to
 * the destination detail screen. However, these destinations don't exist in
 * Firestore. This cache stores recently fetched destinations so the detail
 * screen can display them without a Firestore lookup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination } from '@/src/modules/explore/types';

const destinationCache = new Map<string, Destination>();
const MAX_CACHE_SIZE = 200;

export const DestinationCache = {
  /**
   * Store a destination in the cache.
   */
  set(destination: Destination): void {
    if (destinationCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = destinationCache.keys().next().value;
      if (firstKey) destinationCache.delete(firstKey);
    }
    destinationCache.set(destination.id, destination);
  },

  /**
   * Store multiple destinations.
   */
  setMany(destinations: Destination[]): void {
    for (const dest of destinations) {
      this.set(dest);
    }
  },

  /**
   * Get a destination from the cache.
   */
  get(id: string): Destination | undefined {
    return destinationCache.get(id);
  },

  /**
   * Get all cached destinations.
   */
  getAll(): Destination[] {
    return Array.from(destinationCache.values());
  },

  /**
   * Clear the cache.
   */
  clear(): void {
    destinationCache.clear();
  },
};