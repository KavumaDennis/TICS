/**
 * ExploreEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central orchestration layer for the Explore module.
 * UI never queries Firestore directly — everything flows through this engine.
 *
 * Architecture:
 *   ExploreEngine
 *   ├── RecommendationEngine
 *   ├── TrendingEngine
 *   ├── NearbyEngine
 *   ├── RankingEngine
 *   └── PersonalizationEngine
 *
 * Responsibilities:
 *   - Ranking, filtering, personalization
 *   - Recommendations, trending, nearby
 *   - Caching, prefetching, offline support
 *   - Events and weekend escapes orchestration
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ExploreService } from './ExploreService';
import { NearMeService } from './nearme/NearMeService';
import { ExploreCacheService } from './ExploreCacheService';
import { SearchService } from './SearchService';
import { DiscoveryOrchestrator } from './discovery/DiscoveryOrchestrator';
import type {
  ExploreCategory,
  Destination,
  Event,
  ExploreRecommendation,
  JourneyFeedItem,
  NearbyItem,
  NearbySortOption,
  SearchResult,
  SearchSuggestion,
  PaginatedResponse,
  ServiceResponse,
  DestinationCoordinates,
  WeekendEscape,
} from '@/src/modules/explore/types';
import { PAGINATION } from '@/src/modules/explore/constants';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface ExploreEngineOptions {
  userId?: string;
  location?: DestinationCoordinates;
  preferences?: Record<string, unknown>;
  season?: string;
  weather?: string;
}

export interface PersonalizedSection<T> {
  title: string;
  subtitle: string;
  items: T[];
  type: 'trending' | 'recommended' | 'popular' | 'nearby' | 'weekend' | 'seasonal' | 'continue';
}

export interface ExploreHomeData {
  categories: ExploreCategory[];
  sections: PersonalizedSection<Destination>[];
  journeyFeed: JourneyFeedItem[];
  recentlyViewed: Destination[];
  recommendations: ExploreRecommendation[];
  events: Event[];
  weekendEscapes: WeekendEscape[];
  nearby: NearbyItem[];
  providersUsed?: string[];
}

/* ── Ranking Engine ─────────────────────────────────────────────────────────── */

class RankingEngine {
  rankDestinations(
    destinations: Destination[],
    options: { location?: DestinationCoordinates; sortBy?: string } = {}
  ): Destination[] {
    let ranked = [...destinations];

    if (options.sortBy === 'rating') {
      ranked.sort((a, b) => b.rating - a.rating);
    } else if (options.sortBy === 'popularity') {
      ranked.sort((a, b) => b.popularity - a.popularity);
    } else if (options.location && options.sortBy === 'distance') {
      ranked.sort((a, b) => {
        const distA = this.calculateDistance(options.location!, a.coordinates);
        const distB = this.calculateDistance(options.location!, b.coordinates);
        return distA - distB;
      });
    } else {
      ranked.sort((a, b) => b.popularity - a.popularity);
    }

    return ranked;
  }

  rankEvents(events: Event[]): Event[] {
    return [...events].sort((a, b) => b.popularity - a.popularity);
  }

  rankNearby(items: NearbyItem[], sortBy: NearbySortOption = 'distance'): NearbyItem[] {
    const sorted = [...items];
    if (sortBy === 'rating') {
      sorted.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === 'popularity') {
      sorted.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
    } else {
      sorted.sort((a, b) => a.distance - b.distance);
    }
    return sorted;
  }

  private calculateDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
    const R = 6371;
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  filterByDistance(items: { distance: number }[], maxKm: number): typeof items {
    return items.filter((i) => i.distance <= maxKm);
  }

  filterByRating(items: { rating: number }[], minRating: number): typeof items {
    return items.filter((i) => i.rating >= minRating);
  }
}

/* ── Trending Engine ────────────────────────────────────────────────────────── */

class TrendingEngine {
  async getTrendingDestinations(
    options: { season?: string; location?: DestinationCoordinates } = {}
  ): Promise<Destination[]> {
    try {
      const result = await ExploreService.loadDestinations({ trending: true, pageSize: PAGINATION.TRENDING_LIMIT });
      let destinations = result.data;

      if (options.season) {
        destinations = destinations.filter((d) =>
          d.bestSeason?.toLowerCase().includes(options.season!.toLowerCase())
        );
      }

      return destinations;
    } catch {
      return [];
    }
  }

  async getTrendingEvents(): Promise<Event[]> {
    try {
      const result = await ExploreService.loadEvents({ trending: true, pageSize: 10 });
      return result.data;
    } catch {
      return [];
    }
  }
}

/* ── Nearby Engine ──────────────────────────────────────────────────────────── */

class NearbyEngine {
  /**
   * OSM-FIRST: dynamic nearby places come from OpenStreetMap via
   * NearMeService (same path as the Near Me screen). The previous
   * implementation read the Firestore `nearby_places` collection, which
   * dynamic OSM data never populates — so weekend-escapes "View All"
   * rendered nothing. Firestore remains a fallback if OSM fails.
   */
  async getNearbyPlaces(options: {
    lat: number;
    lng: number;
    radiusKm?: number;
    types?: string[];
    sortBy?: NearbySortOption;
    pageSize?: number;
  }): Promise<NearbyItem[]> {
    const radiusKm = Math.min(Math.max(options.radiusKm || 25, 1), 300);
    try {
      const osm = await NearMeService.searchNearby(options.lat, options.lng, {
        radius: radiusKm * 1000,
      });
      if (osm.places.length > 0) {
        let items: NearbyItem[] = osm.places.map((p) => ({
          id: p.id,
          name: p.name,
          type: 'attraction',
          description: p.description || '',
          imageUrl: p.imageUrl || '',
          coordinates: p.coordinates,
          distance: p.distance,
          rating: p.rating || 0,
          reviewCount: p.reviewCount || 0,
          priceLevel: 1,
          openingHours: '',
          phone: p.phone || '',
          website: p.website || '',
          tags: p.tags || [],
          destinationId: (p as any).destinationId || p.id,
          isOpen: p.isOpen,
        } as NearbyItem));

        // Honour the requested type filter when provided.
        if (options.types && options.types.length > 0) {
          const wanted = new Set(options.types.map((t) => t.toLowerCase()));
          const matching = items.filter(
            (i) =>
              wanted.has((i as any).type?.toLowerCase?.() || '') ||
              (i.tags || []).some((t) => wanted.has(String(t).toLowerCase()))
          );
          // Only narrow when the filter genuinely matches something — an
          // over-narrow filter must not blank the screen.
          if (matching.length > 0) items = matching;
        }

        if (options.sortBy === 'rating') {
          items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        } else {
          items.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
        }
        return items.slice(0, options.pageSize || 20);
      }
    } catch (err) {
      console.warn('[ExploreEngine] OSM getNearbyPlaces failed, trying Firestore:', err);
    }

    // Firestore fallback (curated nearby_places docs, if any).
    try {
      const result = await ExploreService.loadNearbyPlaces(options);
      return result.data;
    } catch {
      return [];
    }
  }
}

/* ── Personalization Engine ─────────────────────────────────────────────────── */

class PersonalizationEngine {
  organizeSections(
    input: {
      trending: Destination[];
      popular: Destination[];
      featured: Destination[];
      recommendations: ExploreRecommendation[];
      nearby: NearbyItem[];
      recentlyViewed: Destination[];
      userLocation?: DestinationCoordinates;
      season?: string;
    }
  ): PersonalizedSection<Destination>[] {
    const sections: PersonalizedSection<Destination>[] = [];

    // 1. Trending
    if (input.trending.length > 0) {
      sections.push({
        title: 'Trending Now',
        subtitle: 'Most popular destinations right now',
        items: input.trending.slice(0, 10),
        type: 'trending',
      });
    }

    // 2. Recommended For You
    const recommendedDests = input.recommendations
      .filter((r) => r.destination)
      .map((r) => r.destination!);
    if (recommendedDests.length > 0) {
      sections.push({
        title: 'Recommended For You',
        subtitle: 'Based on your preferences and history',
        items: recommendedDests.slice(0, 10),
        type: 'recommended',
      });
    }

    // 3. Weekend Picks (seasonal)
    if (input.featured.length > 0) {
      sections.push({
        title: 'Weekend Picks',
        subtitle: 'Perfect for a short getaway',
        items: input.featured.slice(0, 10),
        type: 'weekend',
      });
    }

    // 4. Popular Near You
    if (input.popular.length > 0) {
      sections.push({
        title: 'Popular Destinations',
        subtitle: 'Top-rated destinations worldwide',
        items: input.popular.slice(0, 10),
        type: 'popular',
      });
    }

    // 5. Seasonal Picks
    if (input.season) {
      const seasonalItems = [...input.trending, ...input.popular]
        .filter((d) => d.bestSeason?.toLowerCase().includes(input.season!.toLowerCase()))
        .slice(0, 10);
      if (seasonalItems.length > 0) {
        sections.push({
          title: `${input.season} Escapes`,
          subtitle: `Best destinations for ${input.season}`,
          items: seasonalItems,
          type: 'seasonal',
        });
      }
    }

    // 6. Continue Exploring (recently viewed)
    if (input.recentlyViewed.length > 0) {
      sections.push({
        title: 'Continue Exploring',
        subtitle: 'Pick up where you left off',
        items: input.recentlyViewed.slice(0, 10),
        type: 'continue',
      });
    }

    return sections;
  }
}

/* ── Explore Engine (public API) ────────────────────────────────────────────── */

const rankingEngine = new RankingEngine();
const trendingEngine = new TrendingEngine();
const nearbyEngine = new NearbyEngine();
const personalizationEngine = new PersonalizationEngine();

export const ExploreEngine = {
  /* ── Home ───────────────────────────────────────────────────────────────── */
  async loadExploreHome(options: ExploreEngineOptions = {}): Promise<ExploreHomeData> {
    console.log('[ExploreEngine] ═══════════════════════════════════════');
    console.log('[ExploreEngine] loadExploreHome called with location:', options.location);
    console.log('[ExploreEngine] ═══════════════════════════════════════');
    
    // Use the new DiscoveryOrchestrator for dynamic discovery
    console.log('[ExploreEngine] → Calling DiscoveryOrchestrator.discover()');
    const discoveryResult = await DiscoveryOrchestrator.discover({
      location: options.location,
      userId: options.userId,
      preferences: options.preferences,
      season: options.season,
      weather: options.weather,
    });
    console.log('[ExploreEngine] ← DiscoveryOrchestrator.discover() completed');
    console.log('[ExploreEngine] Discovery result:', {
      categories: discoveryResult.categories.length,
      trending: discoveryResult.trending.length,
      popular: discoveryResult.popular.length,
      events: discoveryResult.events.length,
      nearby: discoveryResult.nearby.length,
      weekendEscapes: discoveryResult.weekendEscapes.length,
      journeyFeed: discoveryResult.journeyFeed.length,
      providersUsed: discoveryResult.providersUsed,
    });

    // Get recently viewed destinations (still from Firestore)
    let recentlyViewed: Destination[] = [];
    if (options.userId) {
      recentlyViewed = await ExploreService.getRecentlyViewed(options.userId);
      console.log('[ExploreEngine] Recently viewed:', recentlyViewed.length);
    }

    // Get recommendations (still from Firestore for now)
    let recommendations: ExploreRecommendation[] = [];
    if (options.userId) {
      const recsResult = await ExploreService.loadRecommendations(options.userId);
      recommendations = recsResult.data ?? [];
      console.log('[ExploreEngine] Recommendations loaded:', recommendations.length);
      if (recommendations.length === 0) {
        if (recsResult.error) {
          console.warn(`[ExploreEngine] ⚠ Recommendations query failed: "${recsResult.error}". This means the Firestore query on the recommendations collection failed (network/permissions).`);
        } else {
          console.warn(`[ExploreEngine] ⚠ Recommendations returned 0 results for userId="${options.userId}". This could mean: (1) No recommendations have been generated yet for this user. (2) The recommendations collection is empty. (3) The user has no saved/liked destinations or interaction history. Recommendations require a backend process to generate them (e.g. a Cloud Function).`);
        }
      }
    } else {
      console.log('[ExploreEngine] No userId provided — skipping recommendations. They require a logged-in user with generated recommendations.');
    }

    // 🔥 FIX: Fallback recommendations from trending/popular so the section always renders
    if (recommendations.length === 0) {
      const fallbackDests = [...discoveryResult.trending, ...discoveryResult.popular]
        .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i) // dedupe
        .slice(0, 10);
      if (fallbackDests.length > 0) {
        recommendations = fallbackDests.map((dest, index) => ({
          id: `rec_${dest.id}`,
          destinationId: dest.id,
          type: index < 3 ? 'trending_near_you' : index < 6 ? 'popular_nearby' : 'for_you',
          title: dest.name,
          description: dest.description || `Explore ${dest.name}`,
          reason: index < 3
            ? 'Trending right now'
            : index < 6
              ? 'Highly rated by travelers'
              : 'Popular choice for your next trip',
          reasonCategory: index < 3 ? 'trending' : index < 6 ? 'interest' : 'adventure',
          score: 100 - index * 5,
          expiresAt: null,
          destination: dest,
        }));
        console.log(`[ExploreEngine] 🔥 Generated ${recommendations.length} fallback recommendations from trending/popular data`);
      }
    }

    // Organize into sections for the UI
    const sections = personalizationEngine.organizeSections({
      trending: discoveryResult.trending,
      popular: discoveryResult.popular,
      featured: discoveryResult.trending.slice(0, 5), // Use trending as featured
      recommendations,
      nearby: discoveryResult.nearby,
      recentlyViewed,
      userLocation: options.location,
      season: options.season,
    });

    console.log('[ExploreEngine] ✓ Returning NEW data from DiscoveryOrchestrator');
    console.log('[ExploreEngine] Sections:', sections.map(s => `${s.type}(${s.items.length})`).join(', '));

    return {
      categories: discoveryResult.categories,
      sections,
      journeyFeed: discoveryResult.journeyFeed,
      recentlyViewed,
      recommendations,
      events: discoveryResult.events,
      weekendEscapes: discoveryResult.weekendEscapes,
      nearby: discoveryResult.nearby,
      providersUsed: discoveryResult.providersUsed,
    };
  },

  /* ── Categories ─────────────────────────────────────────────────────────── */
  async loadCategories(): Promise<ExploreCategory[]> {
    const result = await ExploreService.loadCategories();
    return result.data ?? [];
  },

  async getCategoryById(categoryId: string): Promise<ExploreCategory | null> {
    const result = await ExploreService.getCategoryById(categoryId);
    return result.data;
  },

  async loadDestinationsByCategory(
    categorySlug: string,
    cursor?: string
  ): Promise<PaginatedResponse<Destination>> {
    return ExploreService.loadDestinationsByCategory(categorySlug, cursor);
  },

  /* ── Destinations ──────────────────────────────────────────────────────── */
  async getDestinationById(destinationId: string): Promise<ServiceResponse<Destination>> {
    return ExploreService.getDestinationById(destinationId);
  },

  async loadDestinations(options?: {
    category?: string;
    cursor?: string;
    pageSize?: number;
    featured?: boolean;
    trending?: boolean;
  }): Promise<PaginatedResponse<Destination>> {
    return ExploreService.loadDestinations(options);
  },

  /* ── Events ────────────────────────────────────────────────────────────── */
  async loadEvents(options?: {
    category?: string;
    country?: string;
    city?: string;
    trending?: boolean;
    featured?: boolean;
    destinationId?: string;
    cursor?: string;
    pageSize?: number;
    global?: boolean;
  }): Promise<PaginatedResponse<Event>> {
    return ExploreService.loadEvents(options);
  },

  async getEventById(eventId: string): Promise<ServiceResponse<Event>> {
    return ExploreService.getEventById(eventId);
  },

  /* ── Journey Feed ──────────────────────────────────────────────────────── */
  async loadJourneyFeed(options?: {
    cursor?: string;
    pageSize?: number;
  }): Promise<PaginatedResponse<JourneyFeedItem>> {
    return ExploreService.loadJourneyFeed(options);
  },

  /* ── Recommendations ──────────────────────────────────────────────────── */
  async loadRecommendations(userId: string): Promise<ExploreRecommendation[]> {
    const result = await ExploreService.loadRecommendations(userId);
    return result.data ?? [];
  },

  /* ── Trending ──────────────────────────────────────────────────────────── */
  async getTrendingDestinations(options?: { season?: string }): Promise<Destination[]> {
    return trendingEngine.getTrendingDestinations(options);
  },

  async getTrendingEvents(): Promise<Event[]> {
    return trendingEngine.getTrendingEvents();
  },

  /* ── Nearby ────────────────────────────────────────────────────────────── */
  async getNearbyPlaces(options: {
    lat: number;
    lng: number;
    radiusKm?: number;
    types?: string[];
    sortBy?: NearbySortOption;
    pageSize?: number;
  }): Promise<NearbyItem[]> {
    return nearbyEngine.getNearbyPlaces(options);
  },

  /* ── Weekend Escapes ───────────────────────────────────────────────────── */
  async getWeekendEscapes(options: {
    lat: number;
    lng: number;
    radiusKm?: number;
  }): Promise<WeekendEscape[]> {
    const nearby = await nearbyEngine.getNearbyPlaces({
      lat: options.lat,
      lng: options.lng,
      radiusKm: options.radiusKm || 100,
      sortBy: 'distance',
      pageSize: 20,
    });

    return nearby.map((item, index) => ({
      id: `escape_${item.id}`,
      destinationId: item.destinationId || item.id,
      type: index < 5 ? 'day_trip' : index < 15 ? 'weekend' : 'road_trip',
      distance: item.distance,
      travelTime: `${Math.round(item.distance / 50)}h ${Math.round((item.distance % 50) / 10 * 10)}m`,
      reason: getEscapeReason(item, index),
      destination: {
        id: item.destinationId || item.id,
        name: item.name,
        description: item.description,
        country: '',
        city: '',
        coordinates: item.coordinates,
        images: [{ url: item.imageUrl, caption: '', credit: '' }],
        categories: [],
        travelTips: [],
        nearbyAirport: null,
        nearbyHotels: [],
        nearbyAttractions: [],
        weatherSummary: null,
        bestSeason: '',
        bestTimeToVisit: '',
        popularity: item.rating,
        rating: item.rating,
        reviewCount: item.reviewCount,
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
      } as any,
    }));
  },

  /* ── Search ────────────────────────────────────────────────────────────── */
  async search(queryText: string): Promise<{ destinations: SearchResult[]; events: SearchResult[] }> {
    return SearchService.performSearch(queryText);
  },

  async getAutocompleteSuggestions(query: string): Promise<SearchSuggestion[]> {
    return SearchService.getAutocompleteSuggestions(query);
  },

  /* ── Ranking ────────────────────────────────────────────────────────────── */
  ranker: rankingEngine,

  /* ── User Actions ──────────────────────────────────────────────────────── */
  async saveDestination(userId: string, destinationId: string): Promise<boolean> {
    return ExploreService.saveDestination(userId, destinationId);
  },

  async unsaveDestination(userId: string, destinationId: string): Promise<boolean> {
    return ExploreService.unsaveDestination(userId, destinationId);
  },

  async trackAnalyticsEvent(
    userId: string,
    event: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    return ExploreService.trackAnalyticsEvent(userId as any, event as any, metadata as any);
  },

  async trackRecentlyViewed(userId: string, destinationId: string): Promise<void> {
    return ExploreService.trackRecentlyViewed(userId, destinationId);
  },

  async getRecentlyViewed(userId: string): Promise<Destination[]> {
    return ExploreService.getRecentlyViewed(userId);
  },
};

/* ── Helper Functions ───────────────────────────────────────────────────────── */

function getEscapeReason(item: NearbyItem, index: number): string {
  const reasons = [
    'Perfect for a day trip',
    'Just a short drive away',
    'Ideal for a weekend getaway',
    'Great for a road trip',
    'Adventure awaits nearby',
    'Escape the city for a day',
    'Weekend adventure spot',
    'Hidden gem close by',
  ];
  return reasons[index % reasons.length];
}