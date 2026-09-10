/**
 * useExplore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main explore hook that orchestrates loading categories, destinations,
 * trending, recommendations, recently viewed, journey feed, events,
 * weekend escapes, and nearby places.
 *
 * Uses cache-first progressive loading + single-discovery orchestration:
 * 1. Read cache immediately → render cached data
 * 2. One DiscoveryOrchestrator.discover() call → distribute results to sections
 * 3. Each section updates its own loading state independently
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreEngine, DiscoveryOrchestrator } from '@/src/modules/explore/services';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import { withTimeout, PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';
import { markStart, markEnd, logTiming, logPerformanceSummary } from '@/src/modules/explore/utils/performance';
import type {
  ExploreCategory,
  Destination,
  ExploreRecommendation,
  JourneyFeedItem,
  Event,
  WeekendEscape,
  NearbyItem,
  ExploreState,
} from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface ExploreLoadingState {
  initial: boolean;
  nearby: boolean;
  trending: boolean;
  popular: boolean;
  categories: boolean;
  recommendations: boolean;
  events: boolean;
  weekendEscapes: boolean;
  journeyFeed: boolean;
}

interface UseExploreReturn extends ExploreState {
  loading: boolean;
  sectionLoading: ExploreLoadingState;
  refresh: () => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  loadMoreTrending: () => Promise<void>;
  saveDestination: (destinationId: string) => Promise<boolean>;
  unsaveDestination: (destinationId: string) => Promise<boolean>;
}

/* ── Initial State ──────────────────────────────────────────────────────────── */

const INITIAL_STATE: ExploreState = {
  categories: [],
  trending: [],
  popular: [],
  featured: [],
  recommendations: [],
  journeyFeed: [],
  recentlyViewed: [],
  nearby: [],
  events: [],
  weekendEscapes: [],
  loading: true,
  error: null,
};

const INITIAL_SECTION_LOADING: ExploreLoadingState = {
  initial: true,
  nearby: true,
  trending: true,
  popular: true,
  categories: true,
  recommendations: true,
  events: true,
  weekendEscapes: true,
  journeyFeed: true,
};

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useExplore(userLocation?: { lat: number; lng: number }): UseExploreReturn {
  const [state, setState] = useState<ExploreState>(INITIAL_STATE);
  const [sectionLoading, setSectionLoading] = useState<ExploreLoadingState>(INITIAL_SECTION_LOADING);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [trendingCursor, setTrendingCursor] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const discoverPromiseRef = useRef<Promise<any> | null>(null);
  const discoveryKeyRef = useRef<string>('');

  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';

  const lat = userLocation?.lat;
  const lng = userLocation?.lng;

  /* ── Cache-First Load ─────────────────────────────────────────────────────── */

  const loadFromCache = useCallback(async () => {
    markStart('cache');
    const [
      cachedCategories,
      cachedTrending,
      cachedPopular,
      cachedNearby,
      cachedEvents,
      cachedWeekendEscapes,
      cachedJourneyFeed,
      cachedRecommendations,
      cachedRecentlyViewed,
    ] = await Promise.all([
      ExploreCacheService.getCachedCategories(),
      ExploreCacheService.getCachedTrending(lat, lng),
      ExploreCacheService.getCachedPopular(),
      ExploreCacheService.getCachedNearby(lat, lng),
      ExploreCacheService.getCachedEvents(lat, lng),
      ExploreCacheService.getCachedWeekendEscapes(lat, lng),
      ExploreCacheService.getCachedJourneyFeed(),
      ExploreCacheService.getCachedRecommendations(),
      ExploreCacheService.getCachedRecentlyViewed(),
    ]);
    markEnd('cache');

    const hasAnyData = Boolean(
      cachedCategories?.length ||
      cachedTrending?.length ||
      cachedPopular?.length ||
      cachedNearby?.length ||
      cachedEvents?.length ||
      cachedWeekendEscapes?.length ||
      cachedJourneyFeed?.length ||
      cachedRecommendations?.length ||
      cachedRecentlyViewed?.length
    );

    if (hasAnyData) {
      setState((prev) => ({
        ...prev,
        categories: cachedCategories ?? prev.categories,
        trending: cachedTrending ?? prev.trending,
        popular: cachedPopular ?? prev.popular,
        nearby: cachedNearby ?? prev.nearby,
        events: cachedEvents ?? prev.events,
        weekendEscapes: cachedWeekendEscapes ?? prev.weekendEscapes,
        journeyFeed: cachedJourneyFeed ?? prev.journeyFeed,
        recommendations: cachedRecommendations ?? prev.recommendations,
        recentlyViewed: cachedRecentlyViewed ?? prev.recentlyViewed,
        loading: false,
        error: null,
      }));

      setSectionLoading((prev) => ({
        ...prev,
        initial: false,
        categories: !cachedCategories?.length,
        trending: !cachedTrending?.length,
        popular: !cachedPopular?.length,
        nearby: !cachedNearby?.length,
        events: !cachedEvents?.length,
        weekendEscapes: !cachedWeekendEscapes?.length,
        journeyFeed: !cachedJourneyFeed?.length,
        recommendations: !cachedRecommendations?.length,
      }));

      logTiming('firstContent', 0);
      console.log('[useExplore] ✅ Cached data rendered immediately');
    }

    return hasAnyData;
  }, [lat, lng]);

  /* ── Single Discovery Call (shared across all sections) ──────────────────── */
  // This runs DiscoveryOrchestrator.discover() ONCE and distributes results
  // to each independent section loader.

  const getDiscovery = useCallback(() => {
    // Key the shared promise by location so a no-location discovery is never
    // reused once GPS resolves, and vice-versa.
    const key =
      typeof lat === 'number' && typeof lng === 'number'
        ? `explore:${lat.toFixed(2)}:${lng.toFixed(2)}`
        : 'explore:none';

    if (discoverPromiseRef.current && discoveryKeyRef.current === key) {
      return discoverPromiseRef.current;
    }

    // Location changed (or first run): previous discovery is obsolete.
    discoverPromiseRef.current = null;
    discoveryKeyRef.current = key;

    // The orchestrator runs its providers in parallel and already degrades
    // gracefully per-provider (Promise.allSettled internally), so a generous
    // budget is safe. Cached UI renders before this resolves either way.
    // LIVE EVIDENCE: with a slow/flaky Overpass the OSM-backed sections
    // legitimately need up to ~32-36s (provider budget 32s, section budgets
    // 36s), plus up to ~15s of bounded image enrichment (STEP 5). This
    // wrapper MUST exceed the sum, otherwise the WHOLE discovery is killed
    // and every Explore section renders empty (the exact "all sections
    // blank" regression seen on device).
    const promise = withTimeout(
      DiscoveryOrchestrator.discover({ location: userLocation }),
      60_000,
      'discovery'
    ).catch((err) => {
      console.warn('[useExplore] Discovery failed:', err);
      return {
        categories: [] as ExploreCategory[],
        trending: [] as Destination[],
        popular: [] as Destination[],
        events: [] as Event[],
        nearby: [] as NearbyItem[],
        weekendEscapes: [] as WeekendEscape[],
        journeyFeed: [] as JourneyFeedItem[],
        computedAt: Date.now(),
        providersUsed: [] as string[],
      };
    });

    discoverPromiseRef.current = promise;
    return promise;
  }, [userLocation, lat, lng]);

  /* ── Progressive Section Loaders (all share getDiscovery) ────────────────── */

  const loadNearby = useCallback(async () => {
    if (!lat || !lng) {
      setSectionLoading((prev) => ({ ...prev, nearby: false }));
      return;
    }
    markStart('nearby');
    try {
      const result = await getDiscovery();
      if (result && result.nearby.length > 0) {
        setState((prev) => ({ ...prev, nearby: result.nearby }));
        await ExploreCacheService.setCachedNearby(result.nearby, lat, lng);
      }
    } catch (err) {
      console.warn('[useExplore] Nearby load failed:', err);
    } finally {
      markEnd('nearby');
      setSectionLoading((prev) => ({ ...prev, nearby: false }));
    }
  }, [lat, lng, getDiscovery]);

  const loadTrending = useCallback(async () => {
    markStart('trending');
    try {
      const result = await getDiscovery();
      if (result && result.trending.length > 0) {
        setState((prev) => ({ ...prev, trending: result.trending }));
        await ExploreCacheService.setCachedTrending(result.trending, lat, lng);
      }
    } catch (err) {
      console.warn('[useExplore] Trending load failed:', err);
    } finally {
      markEnd('trending');
      setSectionLoading((prev) => ({ ...prev, trending: false }));
    }
  }, [lat, lng, getDiscovery]);

  const loadPopular = useCallback(async () => {
    markStart('popular');
    try {
      const result = await getDiscovery();
      if (result && result.popular.length > 0) {
        setState((prev) => ({ ...prev, popular: result.popular }));
        await ExploreCacheService.setCachedPopular(result.popular);
      }
    } catch (err) {
      console.warn('[useExplore] Popular load failed:', err);
    } finally {
      markEnd('popular');
      setSectionLoading((prev) => ({ ...prev, popular: false }));
    }
  }, [getDiscovery]);

  const loadCategories = useCallback(async () => {
    markStart('categories');
    try {
      const result = await getDiscovery();
      if (result && result.categories.length > 0) {
        setState((prev) => ({ ...prev, categories: result.categories }));
        await ExploreCacheService.setCachedCategories(result.categories);
      }
    } catch (err) {
      console.warn('[useExplore] Categories load failed:', err);
    } finally {
      markEnd('categories');
      setSectionLoading((prev) => ({ ...prev, categories: false }));
    }
  }, [getDiscovery]);

  const loadEvents = useCallback(async () => {
    markStart('events');
    try {
      const result = await getDiscovery();
      if (result && result.events.length > 0) {
        setState((prev) => ({ ...prev, events: result.events }));
        await ExploreCacheService.setCachedEvents(result.events, lat, lng);
      }
    } catch (err) {
      console.warn('[useExplore] Events load failed:', err);
    } finally {
      markEnd('events');
      setSectionLoading((prev) => ({ ...prev, events: false }));
    }
  }, [lat, lng, getDiscovery]);

  const loadWeekendEscapes = useCallback(async () => {
    markStart('weekendEscapes');
    try {
      const result = await getDiscovery();
      if (result && result.weekendEscapes.length > 0) {
        setState((prev) => ({ ...prev, weekendEscapes: result.weekendEscapes }));
        await ExploreCacheService.setCachedWeekendEscapes(result.weekendEscapes, lat, lng);
      }
    } catch (err) {
      console.warn('[useExplore] Weekend escapes load failed:', err);
    } finally {
      markEnd('weekendEscapes');
      setSectionLoading((prev) => ({ ...prev, weekendEscapes: false }));
    }
  }, [lat, lng, getDiscovery]);

  const loadJourneyFeed = useCallback(async () => {
    markStart('journeyFeed');
    try {
      const result = await getDiscovery();
      if (result && result.journeyFeed.length > 0) {
        setState((prev) => ({ ...prev, journeyFeed: result.journeyFeed }));
        await ExploreCacheService.setCachedJourneyFeed(result.journeyFeed);
      }
    } catch (err) {
      console.warn('[useExplore] Journey feed load failed:', err);
    } finally {
      markEnd('journeyFeed');
      setSectionLoading((prev) => ({ ...prev, journeyFeed: false }));
    }
  }, [getDiscovery]);

  const loadRecommendations = useCallback(async () => {
    markStart('recommendations');
    try {
      let recommendations: ExploreRecommendation[] = [];
      if (userId) {
        const result = await withTimeout(
          ExploreEngine.loadRecommendations(userId),
          PROVIDER_TIMEOUTS.FIRESTORE,
          'recommendations'
        );
        recommendations = result;
      }
      if (recommendations.length === 0) {
        const discovery = await getDiscovery();
        const fallbackDests = [...discovery.trending, ...discovery.popular]
          .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
          .slice(0, 10);
        if (fallbackDests.length > 0) {
          recommendations = fallbackDests.map((dest, index) => ({
            id: `rec_${dest.id}`,
            destinationId: dest.id,
            type: index < 3 ? 'trending_near_you' : index < 6 ? 'popular_nearby' : 'for_you',
            title: dest.name,
            description: dest.description || `Explore ${dest.name}`,
            reason: index < 3 ? 'Trending' : index < 6 ? 'Highly rated' : 'Popular choice',
            reasonCategory: index < 3 ? 'trending' : index < 6 ? 'interest' : 'adventure',
            score: 100 - index * 5,
            expiresAt: null,
            destination: dest,
          }));
        }
        // LAST-RESORT OSM SEED — if both trending and popular came back empty
        // (engine timeouts, no Firestore fallback data, etc.) but the OSM
        // pipeline delivered nearby places, build Recommendations directly
        // from the live OSM results so the "Recommended For You" section
        // never silently disappears.
        if (recommendations.length === 0 && discovery.nearby.length > 0) {
          console.log(`[useExplore] Recommender empty — seeding ${Math.min(discovery.nearby.length, 10)} recommendations from live OSM nearby data`);
          recommendations = discovery.nearby.slice(0, 10).map((place: NearbyItem, index: number) => ({
            id: `nearby-rec-${place.id}`,
            destinationId: place.id,
            type: 'trending_near_you' as const,
            title: place.name,
            description: place.description || `Explore ${place.name}`,
            reason: `Popular spot near you (${Math.round(place.distance)}km away)`,
            reasonCategory: 'location' as const,
            score: 100 - index * 5,
            expiresAt: null,
            destination: {
              id: place.id,
              name: place.name,
              slug: place.name.toLowerCase().replace(/\s+/g, '-'),
              description: place.description || '',
              country: '',
              countryCode: '',
              city: '',
              coordinates: place.coordinates,
              images: place.imageUrl ? [{ url: place.imageUrl, caption: '', credit: '' }] : [],
              categories: (place as any).tags || ['attraction'],
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
            } as Destination,
          }));
        }
      }
      if (recommendations.length > 0) {
        setState((prev) => ({ ...prev, recommendations }));
        await ExploreCacheService.setCachedRecommendations(recommendations);
      }
    } catch (err) {
      console.warn('[useExplore] Recommendations load failed:', err);
    } finally {
      markEnd('recommendations');
      setSectionLoading((prev) => ({ ...prev, recommendations: false }));
    }
  }, [userId, getDiscovery]);

  /* ── Main Load (Cache-First + Single Discovery) ───────────────────────────── */

  const loadExploreData = useCallback(async (isRefresh = false) => {
    if (loadingRef.current && !isRefresh) return;
    loadingRef.current = true;

    const requestId = ++requestIdRef.current;

    // Phase 1: Read cache immediately
    const hasCached = await loadFromCache();

    // Phase 2: Fire all section loads independently (share one discovery call)
    const sectionPromises = [
      loadNearby(),
      loadTrending(),
      loadPopular(),
      loadCategories(),
      loadEvents(),
      loadWeekendEscapes(),
      loadJourneyFeed(),
      loadRecommendations(),
    ];

    Promise.allSettled(sectionPromises).then(() => {
      if (requestId === requestIdRef.current) {
        setSectionLoading((prev) => ({ ...prev, initial: false }));
        logPerformanceSummary();
      }
    });

    if (!hasCached) {
      const checkFirstContent = setInterval(() => {
        if (requestId !== requestIdRef.current) {
          clearInterval(checkFirstContent);
          return;
        }
        setState((prev) => {
          if (!prev.loading) {
            clearInterval(checkFirstContent);
            return prev;
          }
          const hasContent = prev.categories.length > 0 || prev.trending.length > 0 || prev.nearby.length > 0;
          if (hasContent) {
            clearInterval(checkFirstContent);
            return { ...prev, loading: false };
          }
          return prev;
        });
      }, 100);

      setTimeout(() => {
        clearInterval(checkFirstContent);
        setState((prev) => ({ ...prev, loading: false }));
      }, 10_000);
    } else {
      setState((prev) => ({ ...prev, loading: false }));
    }

    // NOTE: the shared discovery promise is NOT reset here. It is keyed by
    // location inside getDiscovery(), so concurrent section loaders and any
    // overlapping run reuse the same in-flight discovery instead of starting
    // duplicate TrendingEngine / WeekendEscape / Events executions.
    loadingRef.current = false;
  }, [loadFromCache, loadNearby, loadTrending, loadPopular, loadCategories, loadEvents, loadWeekendEscapes, loadJourneyFeed, loadRecommendations]);

  /* ── Load on mount ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (hasLoadedOnceRef.current) return;
    hasLoadedOnceRef.current = true;
    loadExploreData();
  }, [loadExploreData]);

  /* ── Re-fetch when userLocation becomes available ─────────────────────────── */

  const prevLocationRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const locationKey = userLocation ? `${userLocation.lat},${userLocation.lng}` : undefined;
    if (locationKey !== prevLocationRef.current) {
      prevLocationRef.current = locationKey;
      if (locationKey) {
        loadExploreData(true);
      }
    }
  }, [userLocation, loadExploreData]);

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    console.log('[useExplore] Refreshing in background (existing data stays visible)');
    await loadExploreData(true);
  }, [loadExploreData]);

  /* ── Load More Feed Items ─────────────────────────────────────────────────── */

  const loadMoreFeed = useCallback(async () => {
    if (!feedCursor) return;
    try {
      const result = await ExploreEngine.loadJourneyFeed({ cursor: feedCursor });
      if (result.data.length) {
        setState((prev) => ({ ...prev, journeyFeed: [...prev.journeyFeed, ...result.data] }));
        setFeedCursor(result.lastCursor);
      }
    } catch (err) {
      console.error('[useExplore] Error loading more feed:', err);
    }
  }, [feedCursor]);

  /* ── Load More Trending ───────────────────────────────────────────────────── */

  const loadMoreTrending = useCallback(async () => {
    if (!trendingCursor) return;
    try {
      const result = await ExploreEngine.loadDestinations({ trending: true, cursor: trendingCursor });
      if (result.data.length) {
        setState((prev) => ({ ...prev, trending: [...prev.trending, ...result.data] }));
        setTrendingCursor(result.lastCursor);
      }
    } catch (err) {
      console.error('[useExplore] Error loading more trending:', err);
    }
  }, [trendingCursor]);

  /* ── Save/Unsave Destination ──────────────────────────────────────────────── */

  const saveDestination = useCallback(async (destinationId: string): Promise<boolean> => {
    if (!userId) return false;
    const success = await ExploreEngine.saveDestination(userId, destinationId);
    if (success) ExploreEngine.trackAnalyticsEvent(userId, 'destination_saved', { destinationId });
    return success;
  }, [userId]);

  const unsaveDestination = useCallback(async (destinationId: string): Promise<boolean> => {
    if (!userId) return false;
    return ExploreEngine.unsaveDestination(userId, destinationId);
  }, [userId]);

  /* ── Return ───────────────────────────────────────────────────────────────── */

  return {
    ...state,
    sectionLoading,
    refresh,
    loadMoreFeed,
    loadMoreTrending,
    saveDestination,
    unsaveDestination,
  };
}