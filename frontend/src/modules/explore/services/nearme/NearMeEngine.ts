/**
 * NearMeEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ranking, filtering, personalization, and merging engine for the Near Me module.
 *
 * Responsibilities:
 *   - Merge Google Places results with Firestore events
 *   - Rank by distance, popularity, rating, user interests, weather, season
 *   - Apply filters (distance, rating, open now, free, etc.)
 *   - Personalize based on user context
 *   - Sort results
 *
 * Architecture:
 *   NearMeScreen
 *     → useNearby() hook
 *       → NearMeEngine
 *         → NearMeService (Google Places API)
 *         → ExploreService (Firestore events)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NearMeService } from './NearMeService';
import {
  NearbyPlace,
  NearbyEvent,
  NearMeCategory,
  NearbySortOption,
  NearbyFilters,
  DEFAULT_NEARBY_FILTERS,
  UserContext,
  NearMeResult,
} from '@/src/modules/explore/types/nearme';
import type { DestinationCoordinates } from '@/src/modules/explore/types';
import { NEARBY_CONFIG } from '@/src/modules/explore/constants';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';

/* ── Ranking Engine ───────────────────────────────────────────────────────── */

class RankingEngine {
  /**
   * Rank nearby places based on the selected sort option.
   */
  rank(
    places: NearbyPlace[],
    sortBy: NearbySortOption,
    userContext?: UserContext
  ): NearbyPlace[] {
    const ranked = [...places];

    switch (sortBy) {
      case 'distance':
        ranked.sort((a, b) => a.distance - b.distance);
        break;

      case 'rating':
        ranked.sort((a, b) => b.rating - a.rating);
        break;

      case 'popularity':
        ranked.sort((a, b) => b.popularity - a.popularity);
        break;

      case 'recently_added':
        // For Google Places, we don't have creation dates, so fall back to popularity
        ranked.sort((a, b) => b.popularity - a.popularity);
        break;

      case 'travel_time':
        ranked.sort((a, b) => a.travelTime.driving - b.travelTime.driving);
        break;

      default:
        ranked.sort((a, b) => a.distance - b.distance);
    }

    // Apply personalization boost if user context is available
    if (userContext) {
      return this.applyPersonalization(ranked, userContext);
    }

    return ranked;
  }

  /**
   * Apply personalization scoring to reorder results based on user interests.
   */
  private applyPersonalization(
    places: NearbyPlace[],
    context: UserContext
  ): NearbyPlace[] {
    const { interests, season, currentWeather } = context;

    return places.map(place => {
      let personalScore = 0;

      // Boost by interest match
      for (const interest of interests) {
        const interestLower = interest.toLowerCase();
        const matchesInterest =
          place.tags.some(t => t.includes(interestLower)) ||
          place.name.toLowerCase().includes(interestLower) ||
          place.category.toLowerCase().includes(interestLower);

        if (matchesInterest) {
          personalScore += 20;
        }
      }

      // Boost by season match
      if (season) {
        const seasonLower = season.toLowerCase();
        if (place.category === 'parks' || place.category === 'beaches') {
          if (seasonLower.includes('summer') || seasonLower.includes('spring')) {
            personalScore += 15;
          }
        }
        if (place.category === 'museums' || place.category === 'shopping') {
          if (seasonLower.includes('winter') || seasonLower.includes('fall')) {
            personalScore += 15;
          }
        }
      }

      // Boost by weather match
      if (currentWeather) {
        const weatherLower = currentWeather.toLowerCase();
        if (weatherLower.includes('rain') || weatherLower.includes('cloud')) {
          if (place.isIndoor) personalScore += 10;
        }
        if (weatherLower.includes('sunny') || weatherLower.includes('clear')) {
          if (place.isOutdoor) personalScore += 10;
        }
      }

      return {
        ...place,
        personalScore,
        seasonScore: personalScore > 0 ? personalScore : 0,
        weatherScore: personalScore > 0 ? personalScore : 0,
      };
    }).sort((a, b) => {
      // Sort by combined score: personal + rating + popularity
      const scoreA = a.personalScore + (a.rating * 5) + (a.popularity / 100);
      const scoreB = b.personalScore + (b.rating * 5) + (b.popularity / 100);
      return scoreB - scoreA;
    });
  }
}

/* ── Filter Engine ────────────────────────────────────────────────────────── */

class FilterEngine {
  /**
   * Apply all active filters to the places list.
   */
  applyFilters(
    places: NearbyPlace[],
    filters: NearbyFilters
  ): NearbyPlace[] {
    let filtered = [...places];

    // Distance filter
    if (filters.maxDistance < NEARBY_CONFIG.MAX_RADIUS_KM) {
      filtered = filtered.filter(p => p.distance <= filters.maxDistance);
    }

    // Rating filter
    if (filters.minRating > 0) {
      filtered = filtered.filter(p => p.rating >= filters.minRating);
    }

    // Boolean filters — OSM data can't populate most capability flags, so a
    // filter is only applied when at least one place positively satisfies it.
    // Otherwise the filter would silently blank the whole list (the previous
    // "filters not working" behavior).
    if (filters.openNow && filtered.some(p => p.isOpen)) {
      filtered = filtered.filter(p => p.isOpen);
    }

    if (filters.free && filtered.some(p => p.isFree)) {
      filtered = filtered.filter(p => p.isFree);
    }

    if (filters.familyFriendly && filtered.some(p => p.isFamilyFriendly)) {
      filtered = filtered.filter(p => p.isFamilyFriendly);
    }

    if (filters.indoor && filtered.some(p => p.isIndoor)) {
      filtered = filtered.filter(p => p.isIndoor);
    }

    if (filters.outdoor && filtered.some(p => p.isOutdoor)) {
      filtered = filtered.filter(p => p.isOutdoor);
    }

    if (filters.accessible && filtered.some(p => p.isAccessible)) {
      filtered = filtered.filter(p => p.isAccessible);
    }

    return filtered;
  }
}

/* ── Events Merger ────────────────────────────────────────────────────────── */

class EventsMerger {
  /**
   * Merge nearby events into the places list.
   * Events are attached to their closest place or added as standalone items.
   */
  mergeEvents(
    places: NearbyPlace[],
    events: NearbyEvent[]
  ): { places: NearbyPlace[]; standaloneEvents: NearbyEvent[] } {
    if (!events.length) {
      return { places, standaloneEvents: [] };
    }

    const standaloneEvents: NearbyEvent[] = [];
    const eventsByVenue = new Map<string, NearbyEvent[]>();

    // Group events by venue name
    for (const event of events) {
      const venueKey = event.venue.toLowerCase().trim();
      if (!eventsByVenue.has(venueKey)) {
        eventsByVenue.set(venueKey, []);
      }
      eventsByVenue.get(venueKey)!.push(event);
    }

    // Attach events to matching places
    const updatedPlaces = places.map(place => {
      const venueKey = place.name.toLowerCase().trim();
      const matchingEvents = eventsByVenue.get(venueKey) || [];
      if (matchingEvents.length > 0) {
        eventsByVenue.delete(venueKey);
        return { ...place, events: matchingEvents };
      }
      return place;
    });

    // Remaining events become standalone
    for (const [, eventList] of eventsByVenue) {
      standaloneEvents.push(...eventList);
    }

    return { places: updatedPlaces, standaloneEvents };
  }
}

/* ── Cache Engine ─────────────────────────────────────────────────────────── */

const CACHE_TTL_DURATION = 30 * 60 * 1000; // 30 minutes

class CacheEngine {
  /**
   * Generate cache key from location and category.
   * Each category has its own cache to prevent showing wrong results.
   */
  private getCacheKey(lat: number, lng: number, category: NearMeCategory): string {
    // Round coordinates to ~1km precision for cache matching
    const latRounded = Math.round(lat * 100) / 100;
    const lngRounded = Math.round(lng * 100) / 100;
    return `nearme_${latRounded}_${lngRounded}_${category}`;
  }

  /**
   * Get cached nearby results for a location and category.
   */
  async getCachedResults(
    lat: number,
    lng: number,
    category: NearMeCategory
  ): Promise<NearMeResult | null> {
    try {
      const cacheKey = this.getCacheKey(lat, lng, category);
      const cached = await ExploreCacheService.getCachedNearby();
      
      if (cached) {
        const cachedResult = cached as unknown as NearMeResult;
        
        // Verify cache key matches (category-specific)
        if (cachedResult.cacheKey !== cacheKey) {
          console.log('[DEBUG] Cache key mismatch:', cachedResult.cacheKey, '!==', cacheKey);
          return null;
        }
        
        // Verify location is close enough
        if (cachedResult.location) {
          const dist = this.haversineDistance(
            lat, lng,
            cachedResult.location.lat,
            cachedResult.location.lng
          );
          
          // Check if location is within 1km and cache is fresh
          if (dist < 1 && cachedResult.timestamp) {
            const age = Date.now() - cachedResult.timestamp;
            if (age < CACHE_TTL_DURATION) {
              console.log('[DEBUG] Cache hit for category:', category);
              return cachedResult;
            } else {
              console.log('[DEBUG] Cache expired for category:', category);
            }
          }
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cache nearby results for a location and category.
   */
  async setCachedResults(result: NearMeResult, lat: number, lng: number, category: NearMeCategory): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(lat, lng, category);
      
      // Add cache key to result
      const resultWithKey = {
        ...result,
        cacheKey,
      };
      
      await ExploreCacheService.setCachedNearby(resultWithKey as any);
      console.log('[DEBUG] Cached result for category:', category, 'key:', cacheKey);
    } catch {
      // Silently fail cache writes
    }
  }

  private haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

/* ── NearMeEngine (Public API) ────────────────────────────────────────────── */

const rankingEngine = new RankingEngine();
const filterEngine = new FilterEngine();
const eventsMerger = new EventsMerger();
const cacheEngine = new CacheEngine();

export const NearMeEngine = {
  /**
   * Main entry point: search nearby places, merge with events, rank, and filter.
   */
  async getNearbyExperiences(
    lat: number,
    lng: number,
    options: {
      category?: NearMeCategory;
      sortBy?: NearbySortOption;
      filters?: NearbyFilters;
      userContext?: UserContext;
      pageToken?: string;
      radius?: number;
    } = {}
  ): Promise<NearMeResult> {
    const {
      category = 'all',
      sortBy = 'distance',
      filters = DEFAULT_NEARBY_FILTERS,
      userContext,
      pageToken,
      radius,
    } = options;

    console.log('[DEBUG] NearMeEngine.getNearbyExperiences:', { lat, lng, category, sortBy, radius });

    // 1. Try cache first (only if category is 'all' to avoid showing wrong category)
    if (!pageToken && category === 'all') {
      const cached = await cacheEngine.getCachedResults(lat, lng, category);
      if (cached) {
        console.log('[DEBUG] NearMeEngine: Using cached result for category:', category);
        // If cached result has different category, refetch
        if (cached.places.length > 0 && cached.places[0].category !== category && category !== 'all') {
          console.log('[DEBUG] NearMeEngine: Cache has different category, refetching...');
        } else {
          return cached;
        }
      }
    }

    // 2. Fetch from Google Places API via NearMeService
    console.log('[DEBUG] NearMeEngine: Calling NearMeService.searchNearby...');
    const searchResult = await NearMeService.searchNearby(lat, lng, {
      radius,
      category,
      pageToken,
    });
    console.log('[DEBUG] NearMeEngine: Got', searchResult.places.length, 'places from search');

    let places = searchResult.places;

    // 3. Apply filters
    console.log('[DEBUG] NearMeEngine: Applying filters...');
    places = filterEngine.applyFilters(places, filters);
    console.log('[DEBUG] NearMeEngine: After filters, places:', places.length);

    // 4. Rank results
    console.log('[DEBUG] NearMeEngine: Ranking places...');
    places = rankingEngine.rank(places, sortBy, userContext);
    console.log('[DEBUG] NearMeEngine: After ranking, places:', places.length);

    // 5. Get location info
    console.log('[DEBUG] NearMeEngine: Getting location info...');
    const locationInfo = await NearMeService.getLocationInfo(lat, lng);
    console.log('[DEBUG] NearMeEngine: Location info:', locationInfo);

    // 6. Fetch nearby events from Firestore
    console.log('[DEBUG] NearMeEngine: Fetching events for', locationInfo.city, locationInfo.country);
    const events = await NearMeService.getNearbyEvents(
      locationInfo.city,
      locationInfo.country
    );
    console.log('[DEBUG] NearMeEngine: Got', events.length, 'events');

    // 7. Merge events into places
    console.log('[DEBUG] NearMeEngine: Merging events into places...');
    const { places: mergedPlaces, standaloneEvents } = eventsMerger.mergeEvents(places, events);
    console.log('[DEBUG] NearMeEngine: After merge, places:', mergedPlaces.length, 'standalone events:', standaloneEvents.length);

    const result: NearMeResult = {
      places: mergedPlaces,
      total: mergedPlaces.length,
      hasMore: searchResult.hasMore,
      nextPageToken: searchResult.nextPageToken,
      location: {
        city: locationInfo.city,
        country: locationInfo.country,
        countryCode: locationInfo.countryCode,
        lat,
        lng,
      },
      events: standaloneEvents,
      timestamp: Date.now(),
    };

    console.log('[DEBUG] NearMeEngine: Final result:', {
      places: result.places.length,
      events: result.events.length,
      location: result.location,
      hasMore: result.hasMore,
    });

    // 8. Cache the result
    if (!pageToken) {
      await cacheEngine.setCachedResults(result, lat, lng, category);
      console.log('[DEBUG] NearMeEngine: Result cached');
    }

    return result;
  },

  /**
   * Get detailed information about a specific place.
   */
  async getPlaceDetails(
    placeId: string,
    userLocation: DestinationCoordinates
  ): Promise<NearbyPlace | null> {
    return NearMeService.getPlaceDetails(placeId, userLocation);
  },

  /**
   * Get a photo URL for a place.
   */
  getPhotoUrl(photoReference: string, maxWidth?: number): string {
    return NearMeService.getPhotoUrl(photoReference, maxWidth);
  },

  /**
   * Get location info (city, country) from coordinates.
   */
  async getLocationInfo(lat: number, lng: number): Promise<{ city: string; country: string }> {
    return NearMeService.getLocationInfo(lat, lng);
  },

  /**
   * Rank a list of places (useful for re-ranking without re-fetching).
   */
  rankPlaces(
    places: NearbyPlace[],
    sortBy: NearbySortOption,
    userContext?: UserContext
  ): NearbyPlace[] {
    return rankingEngine.rank(places, sortBy, userContext);
  },

  /**
   * Apply filters to a list of places.
   */
  filterPlaces(
    places: NearbyPlace[],
    filters: NearbyFilters
  ): NearbyPlace[] {
    return filterEngine.applyFilters(places, filters);
  },
};