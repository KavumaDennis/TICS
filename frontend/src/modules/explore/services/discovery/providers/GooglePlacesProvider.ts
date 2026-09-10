/**
 * GooglePlacesProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OPTIONAL / DEPRECATED destination provider wrapping the legacy Google Places
 * fetch. It is never required for TICS discovery.
 *
 * When `TICS_ENABLE_GOOGLE_PLACES=false` (or the API key is missing) this
 * provider reports itself unavailable and issues ZERO Google Places requests.
 * Failures here never break the pipeline — they simply yield no results and
 * the aggregator continues with OSM / Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlacesProvider } from '../PlacesProvider';
import { googlePlacesAvailable } from './config';
import { DestinationProvider, ProviderQueryOptions, TICSDestination } from './types';

function toTics(item: { id: string; name: string; coordinates: { lat: number; lng: number }; imageUrl?: string; rating?: number; reviewCount?: number; distance?: number; phone?: string; website?: string; tags?: string[] }): TICSDestination {
  return {
    id: `tics:google_places:${item.id}`,
    sourceId: item.id,
    name: item.name,
    latitude: item.coordinates.lat,
    longitude: item.coordinates.lng,
    description: undefined,
    categories: item.tags || ['Attraction'],
    imageUrl: item.imageUrl || undefined,
    rating: item.rating,
    reviewCount: item.reviewCount,
    distanceKm: item.distance,
    phone: item.phone,
    website: item.website,
    source: 'google_places',
    sourceConfidence: 0.8,
    qualityScore: 0.7,
  };
}

export const GooglePlacesProvider: DestinationProvider = {
  name: 'google_places',
  kind: 'optional',

  isAvailable(): boolean {
    return googlePlacesAvailable();
  },

  async searchNearby({ lat, lng, radiusKm = 50, limit = 20 }): Promise<TICSDestination[]> {
    if (!this.isAvailable()) {
      // Explicitly disabled → no network request at all.
      return [];
    }
    try {
      const result = await PlacesProvider.getNearbyPlaces(lat, lng, radiusKm);
      return result.places.slice(0, limit).map(toTics);
    } catch (err) {
      console.warn('[GooglePlacesProvider] ERROR searchNearby (optional, ignored):', err);
      return [];
    }
  },

  async searchByQuery(): Promise<TICSDestination[]> {
    return [];
  },
};