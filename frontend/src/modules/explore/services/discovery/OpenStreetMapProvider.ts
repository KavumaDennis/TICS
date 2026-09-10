/**
 * OpenStreetMapProvider.ts  (compatibility wrapper)
 * ─────────────────────────────────────────────────────────────────────────────
 * Backward-compatible facade for code that still imports the OSM provider
 * from `discovery/`. The real primary implementation lives in
 * `discovery/providers/OpenStreetMapProvider.ts` and returns normalized
 * TICSDestination objects. This wrapper adapts them to the legacy
 * `{ places: NearbyItem[], provider, fetchedAt }` shape.
 *
 * No fabricated ratings, review counts, or images are produced here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';
import { OpenStreetMapProvider as PrimaryOsmProvider, clearOpenStreetMapCache } from './providers/OpenStreetMapProvider';
import { toNearbyItems } from './DestinationAggregator';

export interface OpenStreetMapProviderResult {
  places: NearbyItem[];
  provider: 'openstreetmap';
  fetchedAt: number;
}

export const OpenStreetMapProvider = {
  /**
   * Fetch nearby destinations from OSM (primary). Returns NearbyItem[].
   */
  async getNearbyPlaces(
    lat: number,
    lng: number,
    radiusKm: number = 25
  ): Promise<OpenStreetMapProviderResult> {
    const dests = await PrimaryOsmProvider.searchNearby({ lat, lng, radiusKm, limit: 40 });
    return {
      places: toNearbyItems(dests, { lat, lng }),
      provider: 'openstreetmap',
      fetchedAt: Date.now(),
    };
  },

  /** Types this provider can surface. */
  getSupportedTypes(): readonly string[] {
    return ['tourist_attraction', 'museum', 'park', 'nature', 'historic', 'beach', 'viewpoint', 'restaurant', 'hotel'];
  },

  /** Clear OSM in-memory cache. */
  clearCache(): void {
    clearOpenStreetMapCache();
  },
};