/**
 * WeekendEscapeEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered Weekend Escape Discovery Engine.
 *
 * Sources:
 *   - Google Places (PlacesProvider)
 *   - OpenStreetMap (OpenStreetMapProvider)
 *   - Firestore curated destinations
 *
 * Escape Types:
 *   - Road Trips: 50-400 km
 *   - Day Trips: < 100 km
 *   - Nature, Beach, Adventure, Culture, Luxury, Family, Wellness, Food
 *
 * Enrichment:
 *   - Weather, travel time, driving distance, ratings, photos, hours, popularity
 *
 * Gemini Ranking (placeholder):
 *   - User interests, weather, season, travel history, distance, budget, ratings
 *
 * Never falls back to hardcoded data unless all providers fail.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, DestinationCoordinates, WeekendEscape, NearbyItem } from '@/src/modules/explore/types';
import { PlacesProvider } from './PlacesProvider';
import { OpenStreetMapProvider } from './OpenStreetMapProvider';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import { FIRESTORE_COLLECTIONS } from '@/src/modules/explore/constants';

/* ── Constants ───────────────────────────────────────────────────────────────── */

const ESCAPE_TYPE_THRESHOLDS = {
  day_trip: { maxDistance: 100, label: 'Day Trip' },
  weekend: { maxDistance: 250, label: 'Weekend Getaway' },
  road_trip: { maxDistance: 400, minDistance: 50, label: 'Road Trip' },
} as const;

const ESCAPE_STYLES = [
  'nature', 'beach', 'adventure', 'culture',
  'luxury', 'family', 'wellness', 'food',
] as const;

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface EscapeCandidate {
  id: string;
  name: string;
  description: string;
  coordinates: DestinationCoordinates;
  distance: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  tags: string[];
  categories: string[];
  bestSeason: string;
  type: 'day_trip' | 'weekend' | 'road_trip';
  escapeStyle: string;
  weather?: string;
  travelTime: string;
}

export interface WeekendEscapeResult {
  escapes: WeekendEscape[];
  computedAt: number;
  providersUsed: string[];
}

/* ── Weather Enrichment ──────────────────────────────────────────────────────── */

async function fetchWeather(lat: number, lng: number): Promise<string | null> {
  const key = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=metric`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.weather?.[0]?.description || null;
  } catch {
    return null;
  }
}

/**
 * Merge nearby items into unified escape candidates.
 */
function toEscapeCandidate(
  item: NearbyItem,
  userLocation: DestinationCoordinates
): EscapeCandidate {
  // Determine escape type based on distance
  let type: 'day_trip' | 'weekend' | 'road_trip' = 'day_trip';
  if (item.distance > ESCAPE_TYPE_THRESHOLDS.road_trip.minDistance &&
      item.distance <= ESCAPE_TYPE_THRESHOLDS.road_trip.maxDistance) {
    type = 'road_trip';
  } else if (item.distance > ESCAPE_TYPE_THRESHOLDS.day_trip.maxDistance &&
             item.distance <= ESCAPE_TYPE_THRESHOLDS.weekend.maxDistance) {
    type = 'weekend';
  }

  return {
    id: `escape_${item.id}`,
    name: item.name,
    description: item.description,
    coordinates: item.coordinates,
    distance: item.distance,
    rating: item.rating,
    reviewCount: item.reviewCount,
    imageUrl: item.imageUrl,
    tags: item.tags,
    categories: [item.type],
    bestSeason: '',
    type,
    escapeStyle: determineEscapeStyle(item),
    travelTime: `${Math.round(item.distance / 50)}h ${Math.round((item.distance % 50) / 10 * 10)}m`,
  };
}

/**
 * Determine escape style based on tags and type.
 */
function determineEscapeStyle(item: NearbyItem): string {
  const tags = item.tags.map((t) => t.toLowerCase());
  const type = item.type;

  if (type === 'beach' || tags.includes('beach')) return 'beach';
  if (type === 'park' || tags.includes('park') || tags.includes('forest')) return 'nature';
  if (type === 'attraction' || tags.includes('hiking') || tags.includes('adventure')) return 'adventure';
  if (type === 'museum' || type === 'historical_site' || type === 'landmark') return 'culture';
  if (type === 'hotel' || item.priceLevel >= 3) return 'luxury';
  if (type === 'restaurant' || tags.includes('food') || tags.includes('cafe')) return 'food';
  return 'nature';
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const WeekendEscapeEngine = {
  /**
   * Discover weekend escapes by merging Google Places, OSM, and Firestore data.
   * Enriches with weather, travel time, and scores each candidate.
   * Gemini ranking (placeholder) personalizes the ordering.
   *
   * @param lat - User's latitude
   * @param lng - User's longitude
   * @param radiusKm - Search radius (default 400km for road trips)
   * @returns Ranked list of WeekendEscape
   */
  async getEscapes(
    lat: number,
    lng: number,
    radiusKm: number = 400
  ): Promise<WeekendEscapeResult> {
    const userLocation: DestinationCoordinates = { lat, lng };
    const providersUsed: string[] = [];

    console.log(`[WeekendEscapeEngine] 🔍 Finding escapes near ${lat}, ${lng} within ${radiusKm}km`);

    // Fetch from all providers concurrently
    const [googlePlaces, osmPlaces, curatedDestinations] = await Promise.allSettled([
      PlacesProvider.getNearbyPlaces(lat, lng, radiusKm),
      OpenStreetMapProvider.getNearbyPlaces(lat, lng, radiusKm),
      ExploreService.loadDestinations({ featured: true, pageSize: 20 }),
    ]);

    console.log(`[WeekendEscapeEngine] Provider results:`, {
      google: googlePlaces.status === 'fulfilled' ? googlePlaces.value.places.length : 0,
      osm: osmPlaces.status === 'fulfilled' ? osmPlaces.value.places.length : 0,
      curated: curatedDestinations.status === 'fulfilled' ? curatedDestinations.value.data.length : 0,
    });

    // Collect candidates
    const candidatesMap = new Map<string, EscapeCandidate>();

    // Google Places
    if (googlePlaces.status === 'fulfilled') {
      providersUsed.push('google_places');
      console.log(`[WeekendEscapeEngine] Adding ${googlePlaces.value.places.length} Google Places`);
      for (const place of googlePlaces.value.places) {
        const candidate = toEscapeCandidate(place, userLocation);
        candidatesMap.set(candidate.id, candidate);
      }
    }

    // OpenStreetMap
    if (osmPlaces.status === 'fulfilled') {
      providersUsed.push('openstreetmap');
      console.log(`[WeekendEscapeEngine] Adding ${osmPlaces.value.places.length} OSM places`);
      for (const place of osmPlaces.value.places) {
        const candidate = toEscapeCandidate(place, userLocation);
        // Deduplicate by approximate coordinates
        const dedupKey = `${candidate.name}_${candidate.coordinates.lat.toFixed(2)}_${candidate.coordinates.lng.toFixed(2)}`;
        const exists = Array.from(candidatesMap.values()).some(
          (c) => Math.abs(c.coordinates.lat - candidate.coordinates.lat) < 0.1 &&
                 Math.abs(c.coordinates.lng - candidate.coordinates.lng) < 0.1
        );
        if (!exists) {
          candidatesMap.set(`osm_${dedupKey}`, candidate);
        }
      }
    }

    // Curated Firestore destinations - ONLY use if they're within reasonable distance
    if (curatedDestinations.status === 'fulfilled') {
      providersUsed.push('firestore_curated');
      console.log(`[WeekendEscapeEngine] Checking ${curatedDestinations.value.data.length} curated destinations`);
      for (const dest of curatedDestinations.value.data) {
        const distance = haversineDistance(userLocation, dest.coordinates);
        // Only include curated destinations within 200km (skip far-away destinations like Maldives)
        if (distance <= 200) {
          const candidate: EscapeCandidate = {
            id: `curated_${dest.id}`,
            name: dest.name,
            description: dest.description,
            coordinates: dest.coordinates,
            distance: Math.round(distance * 100) / 100,
            rating: dest.rating,
            reviewCount: dest.reviewCount,
            imageUrl: dest.images?.[0]?.url || '',
            tags: dest.categories,
            categories: dest.categories,
            bestSeason: dest.bestSeason || '',
            type: distance < 100 ? 'day_trip' : distance < 250 ? 'weekend' : 'road_trip',
            escapeStyle: determineEscapeStyle({
              tags: dest.categories,
              type: dest.categories.includes('beach') ? 'beach' as any : 'attraction' as any,
              priceLevel: dest.estimatedBudget?.max ? 3 : 1,
            } as any),
            travelTime: `${Math.round(distance / 50)}h`,
          };
          candidatesMap.set(candidate.id, candidate);
        } else {
          console.log(`[WeekendEscapeEngine] Skipping ${dest.name} - too far (${Math.round(distance)}km)`);
        }
      }
    }

    // Convert to array and filter by distance thresholds
    let candidates = Array.from(candidatesMap.values());
    
    console.log(`[WeekendEscapeEngine] Total candidates before filtering: ${candidates.length}`);
    if (candidates.length > 0) {
      console.log(`[WeekendEscapeEngine] Distance range: ${Math.min(...candidates.map(c => c.distance))}km - ${Math.max(...candidates.map(c => c.distance))}km`);
    }
    
    // Filter by minimum distance (lowered to 0.5km to include nearby places)
    const beforeMinFilter = candidates.length;
    candidates = candidates.filter((c) => c.distance >= 0.5); // min 0.5km to be an "escape"
    
    console.log(`[WeekendEscapeEngine] After min distance filter (0.5km): ${candidates.length} (removed ${beforeMinFilter - candidates.length})`);
    
    if (candidates.length === 0 && beforeMinFilter > 0) {
      console.warn(`[WeekendEscapeEngine] ⚠ All candidates filtered out! Check distance thresholds.`);
      console.warn(`[WeekendEscapeEngine] Sample distances:`, Array.from(candidatesMap.values()).slice(0, 5).map(c => `${c.name}: ${c.distance}km`));
    }

    // Enrich with weather (batch, non-blocking)
    const enrichPromises = candidates.slice(0, 30).map(async (candidate) => {
      const weather = await fetchWeather(candidate.coordinates.lat, candidate.coordinates.lng);
      candidate.weather = weather || undefined;
    });
    await Promise.allSettled(enrichPromises);

    // Score each candidate
    const scored = candidates.map((candidate) => {
      let score = 0;

      // Distance score: closer is better, but not too close
      if (candidate.type === 'day_trip') {
        score += Math.max(0, 100 - candidate.distance) * 0.3;
      } else if (candidate.type === 'weekend') {
        score += Math.max(0, 150 - Math.abs(candidate.distance - 150)) * 0.3;
      } else {
        score += Math.max(0, 200 - Math.abs(candidate.distance - 250)) * 0.3;
      }

      // Rating score
      score += (candidate.rating || 0) * 10 * 0.25;

      // Popularity score
      score += Math.min(100, (candidate.reviewCount || 0) / 5) * 0.2;

      // Weather bonus
      if (candidate.weather && !candidate.weather.includes('rain')) {
        score += 15;
      }

      return { candidate, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    console.log(`[WeekendEscapeEngine] Top 10 escapes:`);
    scored.slice(0, 10).forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.candidate.name} - ${item.candidate.distance}km - Score: ${item.score}`);
    });

    // Convert to WeekendEscape model
    const escapes: WeekendEscape[] = scored.slice(0, 10).map(({ candidate }) => ({
      id: candidate.id,
      destinationId: candidate.id.replace(/^(escape_|curated_)/, ''),
      type: candidate.type,
      distance: candidate.distance,
      travelTime: candidate.travelTime,
      reason: getEscapeReason(candidate),
      destination: {
        id: candidate.id,
        name: candidate.name,
        slug: candidate.name.toLowerCase().replace(/\s+/g, '-'),
        description: candidate.description,
        country: '',
        countryCode: '',
        city: '',
        coordinates: candidate.coordinates,
        images: [{ url: candidate.imageUrl, caption: '', credit: '' }],
        categories: candidate.categories,
        travelTips: [],
        nearbyAirport: null,
        nearbyHotels: [],
        nearbyAttractions: [],
        weatherSummary: null,
        bestSeason: candidate.bestSeason,
        bestTimeToVisit: '',
        popularity: candidate.rating,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        reviews: [],
        travelRequirements: [],
        emergencyContacts: [],
        currency: '',
        language: '',
        timezone: '',
        timezoneOffset: '',
        estimatedBudget: null,
        topAttractions: [],
        relatedDestinationIds: [],
        featured: false,
        trending: false,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Destination,
    }));

    console.log(
      `[WeekendEscapeEngine] Generated ${escapes.length} escapes from ${candidates.length} candidates ` +
      `using providers: ${providersUsed.join(', ')}`
    );

    return {
      escapes,
      computedAt: Date.now(),
      providersUsed,
    };
  },
};

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function haversineDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
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

function getEscapeReason(candidate: EscapeCandidate): string {
  if (candidate.weather && !candidate.weather.includes('rain')) {
    return `Perfect weather (${candidate.weather}) for a ${candidate.type.replace('_', ' ')}`;
  }
  if (candidate.rating >= 4.5) {
    return `Top-rated ${candidate.escapeStyle} destination nearby`;
  }
  if (candidate.reviewCount > 100) {
    return `Popular ${candidate.escapeStyle} spot loved by travelers`;
  }
  return `Great ${candidate.escapeStyle} escape just ${Math.round(candidate.distance)}km away`;
}