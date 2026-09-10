/**
 * PlacesProvider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Places API (New) provider for the Discovery Orchestrator.
 * Fetches nearby places across multiple categories for the "Around You" section.
 *
 * Categories queried:
 *   - tourist_attraction, museum, park, beach, lodging, restaurant
 *   - cafe, shopping_mall, zoo, aquarium, art_gallery, amusement_park
 *
 * Architecture:
 *   DiscoveryOrchestrator
 *     → PlacesProvider (Google Places API New)
 *     → OpenStreetMapProvider (Overpass API)
 *       → Merged, deduped → ExploreEngine
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DestinationCoordinates, NearbyItem } from '@/src/modules/explore/types';
import { PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';
import { googlePlacesAvailable } from './providers/config';

/* ── Constants ───────────────────────────────────────────────────────────────── */

// Travel-relevant place types only — excludes generic commercial types
// (furniture stores, coffee wholesalers, etc.) that aren't useful for
// a travel-discovery "Around You" section.
const GOOGLE_PLACE_TYPES = [
  'tourist_attraction',
  'museum',
  'park',
  'beach',
  'natural_feature',
  'zoo',
  'aquarium',
  'art_gallery',
  'amusement_park',
  'campground',
  'church',
  'mosque',
  'temple',
  'historical_landmark',
  'point_of_interest',
] as const;

const DEFAULT_RADIUS = 100_000; // 100 km in meters
const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACE_DETAILS_BASE = 'https://maps.googleapis.com/maps/api/place/details/json';
const PLACE_PHOTO_BASE = 'https://maps.googleapis.com/maps/api/place/photo';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface PlacesProviderResult {
  places: NearbyItem[];
  provider: 'google_places';
  fetchedAt: number;
}

interface GooglePlaceGeometry {
  location: { lat: number; lng: number };
}

interface GooglePlacePhoto {
  photo_reference: string;
  height: number;
  width: number;
}

interface GooglePlaceOpeningHours {
  open_now: boolean;
  weekday_text?: string[];
}

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: GooglePlaceGeometry;
  types: string[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: GooglePlacePhoto[];
  opening_hours?: GooglePlaceOpeningHours;
  business_status?: string;
  vicinity?: string;
}

interface GooglePlacesResponse {
  results: GooglePlaceResult[];
  status: string;
  next_page_token?: string;
  error_message?: string;
}

/* ── Service ─────────────────────────────────────────────────────────────────── */

function getApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
}

/**
 * Build URL for Google Places Nearby Search (New API uses includedTypes).
 */
function buildNearbyUrl(
  lat: number,
  lng: number,
  radius: number,
  type: string
): string {
  const key = getApiKey();
  if (!key) return '';

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    type,
    key,
    language: 'en',
  });

  return `${PLACES_API_BASE}?${params.toString()}`;
}

/**
 * Build URL for place photo.
 */
function buildPhotoUrl(photoRef: string, maxWidth = 400): string {
  const key = getApiKey();
  if (!key) return '';
  return `${PLACE_PHOTO_BASE}?maxwidth=${maxWidth}&photoreference=${photoRef}&key=${key}`;
}

/**
 * Fetch places for a single Google Place type.
 */
async function fetchByType(
  lat: number,
  lng: number,
  radius: number,
  type: string
): Promise<GooglePlaceResult[]> {
  const url = buildNearbyUrl(lat, lng, radius, type);
  if (!url) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUTS.GOOGLE_PLACES);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[PlacesProvider] HTTP ${response.status} for type ${type}`);
      return [];
    }

    const data: GooglePlacesResponse = await response.json();

    if (data.status === 'OK' && data.results?.length) {
      return data.results;
    }

    if (data.status === 'ZERO_RESULTS') return [];
    console.warn(`[PlacesProvider] API status ${data.status} for ${type}:`, data.error_message);
    return [];
  } catch (err: any) {
    // DOMException is not available in Hermes/React Native.
    // Use error.name === 'AbortError' instead of instanceof DOMException.
    if (err?.name === 'AbortError' || err?.code === 20) {
      console.warn(`[PlacesProvider] Timeout for type ${type}`);
    } else {
      console.error(`[PlacesProvider] Error fetching ${type}:`, err);
    }
    return [];
  }
}

/**
 * Transform a Google Place result into the app's NearbyItem model.
 */
function transformToNearbyItem(
  result: GooglePlaceResult,
  userLocation: DestinationCoordinates
): NearbyItem {
  const coords: DestinationCoordinates = {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
  const distance = calculateHaversineDistance(userLocation, coords);
  const firstPhoto = result.photos?.[0];

  // Map Google type to our NearbyPlaceType
  const type = mapGoogleTypeToNearbyType(result.types);

  return {
    id: `gp_${result.place_id}`,
    name: result.name,
    type,
    description: result.vicinity || result.formatted_address || '',
    imageUrl: firstPhoto
      ? buildPhotoUrl(firstPhoto.photo_reference)
      : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400',
    coordinates: coords,
    distance: Math.round(distance * 100) / 100,
    rating: result.rating || 0,
    reviewCount: result.user_ratings_total || 0,
    priceLevel: result.price_level ?? 1,
    openingHours: result.opening_hours?.open_now ? 'Open now' : '',
    phone: '',
    website: '',
    tags: result.types,
    destinationId: null,
    isOpen: result.opening_hours?.open_now ?? true,
  };
}

/**
 * Map Google Place types to our NearbyPlaceType.
 */
function mapGoogleTypeToNearbyType(types: string[]): NearbyItem['type'] {
  const typeMap: Record<string, NearbyItem['type']> = {
    tourist_attraction: 'attraction',
    museum: 'museum',
    park: 'park',
    beach: 'beach',
    lodging: 'hotel',
    restaurant: 'restaurant',
    cafe: 'restaurant',
    shopping_mall: 'mall',
    zoo: 'attraction',
    aquarium: 'attraction',
    art_gallery: 'museum',
    amusement_park: 'attraction',
    stadium: 'sports_venue',
    night_club: 'theater',
    movie_theater: 'theater',
    casino: 'theater',
    church: 'historical_site',
    mosque: 'historical_site',
    temple: 'historical_site',
  };

  for (const t of types) {
    if (typeMap[t]) return typeMap[t];
  }
  return 'attraction';
}

/**
 * Calculate Haversine distance in km between two coordinates.
 */
function calculateHaversineDistance(
  from: DestinationCoordinates,
  to: DestinationCoordinates
): number {
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/* ── In-memory dedup cache ──────────────────────────────────────────────────── */
// The orchestrator, TrendingEngine, WeekendEscapeIntelligence, and
// DiscoveryCandidateService all call getNearbyPlaces with the same coords
// within the same render cycle. This cache dedupes concurrent calls so we
// only hit the Google API once per (lat,lng,radius) within a short window.
const placesCache = new Map<string, { result: PlacesProviderResult; expiresAt: number }>();
const PLACES_CACHE_TTL_MS = 30_000; // 30s

function getCacheKey(lat: number, lng: number, radiusKm: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`;
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const PlacesProvider = {
  /**
   * Fetch nearby places from Google Places API across all configured categories.
   * Runs all category queries concurrently using Promise.allSettled.
   * Merges results, removes duplicates, computes Haversine distance, and sorts.
   *
   * @param lat - User's latitude
   * @param lng - User's longitude
   * @param radiusKm - Search radius in km (default: 100)
   * @returns Merged, sorted array of NearbyItem
   */
  async getNearbyPlaces(
    lat: number,
    lng: number,
    radiusKm: number = 100
  ): Promise<PlacesProviderResult> {
    // Google Places is OPTIONAL. When disabled, return empty with zero requests.
    if (!googlePlacesAvailable()) {
      return { places: [], provider: 'google_places', fetchedAt: Date.now() };
    }
    const cacheKey = getCacheKey(lat, lng, radiusKm);
    const cached = placesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const location: DestinationCoordinates = { lat, lng };
    const radiusMeters = radiusKm * 1000;

    // Fetch all categories concurrently
    const results = await Promise.allSettled(
      GOOGLE_PLACE_TYPES.map((type) =>
        fetchByType(lat, lng, radiusMeters, type)
      )
    );

    // Merge all results
    const allResults: GooglePlaceResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allResults.push(...result.value);
      }
    }

    // Deduplicate by place_id
    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      if (seen.has(r.place_id)) return false;
      seen.add(r.place_id);
      return true;
    });

    // Transform to app model
    const places = uniqueResults.map((r) =>
      transformToNearbyItem(r, location)
    );

    // Sort by distance then rating
    places.sort((a, b) => {
      const distDiff = a.distance - b.distance;
      if (Math.abs(distDiff) > 1) return distDiff; // Within 1km, prefer higher rating
      return (b.rating ?? 0) - (a.rating ?? 0);
    });

    console.log(
      `[PlacesProvider] Fetched ${places.length} places (${uniqueResults.length} unique) within ${radiusKm}km`
    );

    const result: PlacesProviderResult = {
      places: places.slice(0, 30), // Return top 30
      provider: 'google_places',
      fetchedAt: Date.now(),
    };

    // Store in dedup cache
    placesCache.set(cacheKey, { result, expiresAt: Date.now() + PLACES_CACHE_TTL_MS });

    return result;
  },

  /**
   * Get place types used by this provider.
   */
  getSupportedTypes(): readonly string[] {
    return GOOGLE_PLACE_TYPES;
  },
};