/**
 * GlobalPopularEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Global Popular Destinations Engine.
 *
 * Popular is global, not local. This engine queries a rotating list of
 * major travel destinations across different regions worldwide.
 *
 * Regions: Europe, North America, South America, Africa, Middle East, Asia, Oceania
 *
 * Uses the shared ProviderDataCoordinator for deduplicated requests.
 * Limits concurrent hub queries to prevent timeouts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, NearbyItem } from '@/src/modules/explore/types';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';
import { TravelThemeEngine } from './TravelThemeEngine';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';

/* ── Global Destination Hubs ────────────────────────────────────────────────── */

const GLOBAL_DESTINATIONS = [
  // Europe
  { name: 'Paris', lat: 48.8566, lng: 2.3522, region: 'Europe' },
  { name: 'London', lat: 51.5074, lng: -0.1278, region: 'Europe' },
  { name: 'Barcelona', lat: 41.3874, lng: 2.1686, region: 'Europe' },
  { name: 'Rome', lat: 41.9028, lng: 12.4964, region: 'Europe' },
  { name: 'Santorini', lat: 36.3932, lng: 25.4615, region: 'Europe' },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, region: 'Europe' },
  { name: 'Prague', lat: 50.0755, lng: 14.4378, region: 'Europe' },
  { name: 'Swiss Alps', lat: 46.8182, lng: 8.2275, region: 'Europe' },

  // North America
  { name: 'New York', lat: 40.7128, lng: -74.0060, region: 'North America' },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, region: 'North America' },
  { name: 'Cancun', lat: 21.1619, lng: -86.8515, region: 'North America' },
  { name: 'Vancouver', lat: 49.2827, lng: -123.1207, region: 'North America' },

  // South America
  { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, region: 'South America' },
  { name: 'Machu Picchu', lat: -13.1631, lng: -72.5450, region: 'South America' },
  { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, region: 'South America' },

  // Africa
  { name: 'Cape Town', lat: -33.9249, lng: 18.4241, region: 'Africa' },
  { name: 'Marrakech', lat: 31.6295, lng: -7.9811, region: 'Africa' },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219, region: 'Africa' },
  { name: 'Zanzibar', lat: -6.1659, lng: 39.2026, region: 'Africa' },
  { name: 'Victoria Falls', lat: -17.9243, lng: 25.8567, region: 'Africa' },

  // Middle East
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, region: 'Middle East' },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773, region: 'Middle East' },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784, region: 'Middle East' },

  // Asia
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, region: 'Asia' },
  { name: 'Bali', lat: -8.3405, lng: 115.0920, region: 'Asia' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, region: 'Asia' },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018, region: 'Asia' },
  { name: 'Kyoto', lat: 35.0116, lng: 135.7681, region: 'Asia' },
  { name: 'Maldives', lat: 3.2028, lng: 73.2207, region: 'Asia' },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873, region: 'Asia' },

  // Oceania
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, region: 'Oceania' },
  { name: 'Queenstown', lat: -45.0312, lng: 168.6626, region: 'Oceania' },
  { name: 'Fiji', lat: -17.7134, lng: 178.0650, region: 'Oceania' },
];

// Limit hub queries to prevent hammering Overpass (bounded per call)
const MAX_TOTAL_HUBS = 3;

/* ── Minimum threshold before Firestore fallback ────────────────────────────── */

const MIN_POPULAR_REQUIRED = 15;

/* ── GlobalPopularEngine ────────────────────────────────────────────────────── */

export const GlobalPopularEngine = {
  /**
   * Discover popular destinations from global hubs.
   * Rotates through major travel destinations across all regions using OSM
   * (bounded to a few hubs per call so Overpass is never hammered) and fills
   * from curated Firestore data when live results are insufficient.
   */
  async discoverGlobalPopular(): Promise<{
    destinations: Destination[];
    sourceBreakdown: { osm: number; firestore: number };
    regionsCovered: number;
  }> {
    console.log('[GlobalPopularEngine] ═══════════════════════════════════════');
    console.log('[GlobalPopularEngine] 🌍 Discovering global popular destinations');
    console.log('[GlobalPopularEngine] ═══════════════════════════════════════');

    const allPlaces: NearbyItem[] = [];
    const regionsCovered = new Set<string>();
    let apiFailed = false;

    // Rotate through hubs over time so every refresh surfaces different regions
    // while keeping the number of Overpass requests small and bounded.
    const periodIndex = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
    const startIdx = periodIndex % GLOBAL_DESTINATIONS.length;
    const hubsToQuery = Array.from({ length: MAX_TOTAL_HUBS }, (_, i) =>
      GLOBAL_DESTINATIONS[(startIdx + i) % GLOBAL_DESTINATIONS.length]
    );

    const batchResults = await Promise.allSettled(
      hubsToQuery.map((dest) =>
        ProviderDataCoordinator.getOpenStreetMap(dest.lat, dest.lng, 30)
      )
    );

    batchResults.forEach((result, idx) => {
      const dest = hubsToQuery[idx];
      if (result.status === 'fulfilled') {
        const places = result.value.places || [];
        if (places.length > 0) {
          for (const place of places) {
            (place as any).globalRegion = dest.region;
            (place as any).globalHub = dest.name;
          }
          allPlaces.push(...places);
          regionsCovered.add(dest.region);
        }
      } else {
        apiFailed = true;
      }
    });

    console.log(`[GlobalPopularEngine] Queried ${hubsToQuery.length} global hubs via OSM (${hubsToQuery.map(h => h.name).join(', ')})`);
    console.log(`[GlobalPopularEngine] Regions covered: ${regionsCovered.size}`);
    console.log(`[GlobalPopularEngine] Total places: ${allPlaces.length}`);

    // If APIs returned enough, use live data
    if (allPlaces.length >= MIN_POPULAR_REQUIRED) {
      // Classify for travel relevance
      const travelRelevant = TravelClassifier.filterTravelRelevant(allPlaces);
      console.log(`[GlobalPopularEngine] Travel relevant: ${travelRelevant.length}`);

      // Tag with themes
      const themed = TravelThemeEngine.tagPlaces(travelRelevant);

      // Rank using the shared travel ranking engine (works without Google
      // ratings — falls back to category / distance / quality signals).
      const ranked = TravelRankingEngine.rank(themed, { topN: 40 });

      // Balance categories
      const balanced = CategoryBalancer.balance(ranked, 2, 20);

      // Convert to Destinations
      const destinations: Destination[] = balanced.map(place => ({
        id: place.id,
        name: place.name,
        slug: place.name.toLowerCase().replace(/\s+/g, '-'),
        description: place.description || '',
        country: '',
        countryCode: '',
        city: '',
        coordinates: place.coordinates,
        images: place.imageUrl ? [{ url: place.imageUrl, caption: '', credit: '' }] : [],
        categories: [(place as any).travelCategory || 'attraction'],
        travelTips: [],
        nearbyAirport: null,
        nearbyHotels: [],
        nearbyAttractions: [],
        weatherSummary: null,
        bestSeason: '',
        bestTimeToVisit: '',
        popularity: place.rating || 0,
        rating: place.rating || 0,
        reviewCount: place.reviewCount || 0,
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
      }));

      console.log(`[GlobalPopularEngine] ✓ Generated ${destinations.length} global popular destinations from live APIs`);
      console.log(`[GlobalPopularEngine] Regions: ${Array.from(regionsCovered).join(', ')}`);

      return {
        destinations,
        sourceBreakdown: { osm: destinations.length, firestore: 0 },
        regionsCovered: regionsCovered.size,
      };
    }

    // ── Firestore fallback when APIs fail or return insufficient data ──────────
    const firestoreReason = apiFailed
      ? `OSM query failed for one or more hubs`
      : `OSM returned ${allPlaces.length} places. Minimum required = ${MIN_POPULAR_REQUIRED}.`;
    
    console.log(`[GlobalPopularEngine] ⚠ ${firestoreReason} Using Firestore fallback...`);

    try {
      const firestoreResult = await ExploreService.loadDestinations({
        pageSize: 20,
      });

      const destinations: Destination[] = firestoreResult.data.map(dest => ({
        ...dest,
      }));

      console.log(`[GlobalPopularEngine] ✓ Firestore fallback: Returned ${destinations.length} destinations`);
      console.log(`[GlobalPopularEngine] 🔥 SOURCE: Firestore (live APIs: ${allPlaces.length} places)`);

      return {
        destinations,
        sourceBreakdown: { osm: 0, firestore: destinations.length },
        regionsCovered: 0,
      };
    } catch (err) {
      console.warn('[GlobalPopularEngine] Firestore fallback also failed:', err);
      console.log(`[GlobalPopularEngine] Returning 0 destinations - all providers failed`);

      return {
        destinations: [],
        sourceBreakdown: { osm: 0, firestore: 0 },
        regionsCovered: 0,
      };
    }
  },
};

/* ── Persistent global cache (stale-while-revalidate) ─────────────────────── */
// Global Popular is LOCATION-INDEPENDENT, so it must not re-query three
// Overpass hubs on every Explore load. Fresh for 6h, stale-served up to 7d.

interface GlobalCacheState {
  destinations: Destination[];
  regionsCovered: number;
  fetchedAt: number;
}

const globalCache: { state: GlobalCacheState | null; refreshInFlight: Promise<{
  destinations: Destination[];
  sourceBreakdown: { osm: number; firestore: number };
  regionsCovered: number;
}> | null } = {
  state: null,
  refreshInFlight: null,
};

const GLOBAL_FRESH_MS = 6 * 60 * 60 * 1000;   // 6 hours
const GLOBAL_STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cachedResult(state: GlobalCacheState) {
  return {
    destinations: state.destinations,
    sourceBreakdown: { osm: state.destinations.length, firestore: 0 },
    regionsCovered: state.regionsCovered,
  };
}

export const GlobalPopularCache = {
  /**
   * Cache-first entry point used by the orchestrator:
   *   fresh  → return immediately
   *   stale  → return stale immediately + bounded background refresh
   *   miss   → one bounded live query (hub budget applies)
   */
  async get(): Promise<{
    destinations: Destination[];
    sourceBreakdown: { osm: number; firestore: number };
    regionsCovered: number;
  }> {
    const state = globalCache.state;
    const age = state ? Date.now() - state.fetchedAt : Infinity;

    if (state && age < GLOBAL_FRESH_MS) {
      console.log(`[GlobalPopularEngine] cache HIT fresh (${state.destinations.length})`);
      return cachedResult(state);
    }

    if (state && age < GLOBAL_STALE_MS) {
      console.log(`[GlobalPopularEngine] cache STALE — serving ${state.destinations.length} and refreshing in background`);
      void this.refresh();
      return cachedResult(state);
    }

    console.log('[GlobalPopularEngine] cache MISS — bounded live hub query');
    return this.refresh();
  },

  /** Bounded live refresh; concurrent callers share one in-flight refresh. */
  async refresh(): Promise<{
    destinations: Destination[];
    sourceBreakdown: { osm: number; firestore: number };
    regionsCovered: number;
  }> {
    if (globalCache.refreshInFlight) return globalCache.refreshInFlight;

    const promise = (async () => {
      try {
        const result = await GlobalPopularEngine.discoverGlobalPopular();
        if (result.destinations.length > 0) {
          globalCache.state = {
            destinations: result.destinations,
            regionsCovered: result.regionsCovered,
            fetchedAt: Date.now(),
          };
        }
        return result;
      } finally {
        globalCache.refreshInFlight = null;
      }
    })();

    globalCache.refreshInFlight = promise;
    return promise;
  },
};