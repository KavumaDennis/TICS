/**
 * FirestoreDestinationProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Curated TICS destination provider backed by Firestore.
 *
 * Firestore is the CURATED layer, not the sole discovery mechanism. It holds
 * destinations TICS wants to preserve, enrich, verify, or prioritize. The
 * aggregator merges these with OSM rather than replacing them.
 *
 * This provider is also a graceful fallback when OSM fails / is offline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import {
  DestinationProvider,
  ProviderQueryOptions,
  TICSDestination,
} from './types';

interface FirestoreDestLike {
  id: string;
  name: string;
  coordinates?: unknown;
  /** Actual seeded schema stores top-level lat/lng (see src/scripts/seedDestinations.ts). */
  lat?: unknown;
  lng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  location?: unknown;
  description?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  categories?: string[];
  images?: Array<{ url?: string }>;
  rating?: number;
  reviewCount?: number;
}

function num(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v)) return null; // rejects NaN / Infinity
  return v;
}

/**
 * Normalize coordinates from every schema actually used by TICS documents:
 *   top-level {lat,lng}            ← current seed script schema
 *   top-level {latitude,longitude}
 *   {coordinates:{lat,lng}} | {coordinates:{latitude,longitude}}
 *   {location:{latitude,longitude}} | Firestore GeoPoint (has .latitude/.longitude)
 *
 * Returns null for missing/invalid data. Never fabricates (0,0).
 */
export function extractCoordinates(dest: Partial<FirestoreDestLike>): { lat: number; lng: number } | null {
  const tryPair = (a: unknown, b: unknown): { lat: number; lng: number } | null => {
    const lat = num(a);
    const lng = num(b);
    if (lat === null || lng === null) return null;
    // Reject the "Null Island" sentinel — it means "no real location".
    if (lat === 0 && lng === 0) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  // 1) Top-level lat/lng (seed script schema)
  const topLevel = tryPair(dest.lat, dest.lng);
  if (topLevel) return topLevel;

  // 2) Top-level latitude/longitude
  const topLevel2 = tryPair(dest.latitude, dest.longitude);
  if (topLevel2) return topLevel2;

  // 3) Nested coordinates object ({lat,lng} or {latitude,longitude})
  if (dest.coordinates && typeof dest.coordinates === 'object') {
    const c = dest.coordinates as Record<string, unknown>;
    const nested = tryPair(c.lat ?? c.latitude, c.lng ?? c.longitude);
    if (nested) return nested;
  }

  // 4) location object or GeoPoint (GeoPoint exposes .latitude/.longitude)
  if (dest.location && typeof dest.location === 'object') {
    const l = dest.location as Record<string, unknown>;
    const loc = tryPair(l.latitude ?? l.lat, l.longitude ?? l.lng);
    if (loc) return loc;
  }

  return null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toTicsDestination(dest: FirestoreDestLike): TICSDestination | null {
  const coords = extractCoordinates(dest);
  if (!coords) return null;
  return {
    id: dest.id,
    sourceId: `firestore/${dest.id}`,
    name: dest.name,
    latitude: coords.lat,
    longitude: coords.lng,
    description: dest.description || undefined,
    country: dest.country,
    countryCode: dest.countryCode,
    city: dest.city,
    categories: dest.categories?.length ? dest.categories : ['Curated'],
    imageUrl: dest.images?.[0]?.url || undefined,
    rating: dest.rating,
    reviewCount: dest.reviewCount,
    source: 'firestore',
    sourceConfidence: 0.95, // manually curated → highest base confidence
    qualityScore: 0.9,
    metadata: { curated: true },
  };
}

export const FirestoreDestinationProvider: DestinationProvider = {
  name: 'firestore',
  kind: 'fallback',

  isAvailable(): boolean {
    return true;
  },

  async searchNearby({ lat, lng, radiusKm = 100, limit = 30 }): Promise<TICSDestination[]> {
    try {
      const result = await ExploreService.loadDestinations({ pageSize: limit });
      const loaded = result.data || [];
      const radius = radiusKm || 100;

      const mapped = loaded
        .map(toTicsDestination)
        .filter((d): d is TICSDestination => d !== null)
        .map((d) => {
          const dist = haversine(lat, lng, d.latitude, d.longitude);
          return { d, dist };
        });
      const within = mapped
        .filter(({ dist }) => dist <= radius)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, limit)
        .map(({ d, dist }) => {
          d.distanceKm = Math.round(dist * 100) / 100;
          return d;
        });

      console.log(
        `[FirestoreDestinationProvider] loaded=${loaded.length} validCoordinates=${mapped.length} withinRadius=${within.length} returned=${Math.min(within.length, limit)}`
      );
      return within;
    } catch (err) {
      console.warn('[FirestoreDestinationProvider] ERROR searchNearby:', err);
      return [];
    }
  },

  async searchByQuery(query, options = {}): Promise<TICSDestination[]> {
    const q = normalizeName(query.trim());
    if (q.length < 2) return [];
    try {
      const result = await ExploreService.loadDestinations({ pageSize: options.limit || 30 });
      const matches = (result.data || [])
        .map(toTicsDestination)
        .filter((d): d is TICSDestination => d !== null)
        .filter((d) => normalizeName(d.name).includes(q))
        .sort((a, b) => {
          const aExact = normalizeName(a.name) === q ? 0 : 1;
          const bExact = normalizeName(b.name) === q ? 0 : 1;
          return aExact - bExact;
        })
        .slice(0, options.limit || 10);
      return matches;
    } catch (err) {
      console.warn('[FirestoreDestinationProvider] ERROR searchByQuery:', err);
      return [];
    }
  },
};