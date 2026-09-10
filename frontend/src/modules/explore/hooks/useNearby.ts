/**
 * useNearby.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for the Near Me location intelligence module.
 * Handles location permission, GPS coordinates, Google Places Nearby Search,
 * category filtering, sorting, pagination, and personalization.
 *
 * Architecture:
 *   NearMeScreen
 *     → useNearby()
 *       → NearMeEngine
 *         → NearMeService (Google Places API)
 *         → ExploreService (Firestore events)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { NearMeEngine } from '@/src/modules/explore/services/nearme';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import { useExploreAnalytics } from '@/src/modules/explore/hooks/useExploreAnalytics';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  NEARBY_CONFIG,
  ERROR_MESSAGES,
  LOADING_MESSAGES,
} from '@/src/modules/explore/constants';
import {
  DEFAULT_NEARBY_FILTERS,
} from '@/src/modules/explore/types/nearme';
import type {
  NearbyPlace,
  NearMeCategory,
  NearbySortOption,
  NearbyFilters,
  NearMeResult,
  NearbyEvent,
  UserContext,
} from '@/src/modules/explore/types/nearme';

/* ── Types ──────────────────────────────────────────────────────────────────── */

type GpsStatus = 'granted' | 'denied' | 'blocked' | 'unavailable' | 'undetermined';

interface UseNearbyReturn {
  // State
  places: NearbyPlace[];
  events: NearbyEvent[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  location: { city: string; country: string; countryCode?: string; lat: number; lng: number } | null;
  gpsStatus: GpsStatus;
  hasMore: boolean;
  isOffline: boolean;

  // Active filters & sort
  activeCategory: NearMeCategory;
  sortBy: NearbySortOption;
  filters: NearbyFilters;
  viewMode: 'list' | 'map';

  // Actions
  setActiveCategory: (category: NearMeCategory) => void;
  setSortBy: (sort: NearbySortOption) => void;
  setFilters: (filters: Partial<NearbyFilters>) => void;
  resetFilters: () => void;
  setViewMode: (mode: 'list' | 'map') => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  requestLocationPermission: () => Promise<boolean>;
  getPlaceDetails: (placeId: string) => Promise<NearbyPlace | null>;

  // Analytics
  trackCategorySelected: (category: NearMeCategory) => void;
  trackPlaceViewed: (place: NearbyPlace) => void;
  trackCoordinateJourney: (place: NearbyPlace) => void;
  trackSavePlace: (place: NearbyPlace) => void;
  trackSharePlace: (place: NearbyPlace) => void;
  trackDirectionsStarted: (place: NearbyPlace, mode: 'walking' | 'driving') => void;
  trackMapViewOpened: () => void;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useNearby(): UseNearbyReturn {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    city: string;
    country: string;
    countryCode?: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('undetermined');
  const [hasMore, setHasMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [activeCategory, setActiveCategory] = useState<NearMeCategory>('all');

  // Refs mirroring state — the category/filter handlers below refetch data,
  // and a stale `loadNearby` closure (built with the PREVIOUS category) was
  // making the selector refetch the wrong category. Handlers write the ref
  // first; loadNearby always reads the ref, so a refetch always uses the
  // latest selection regardless of closure age.
  const activeCategoryRef = useRef<NearMeCategory>('all');
  const filtersRef = useRef<NearbyFilters>(DEFAULT_NEARBY_FILTERS as any);
  // Unfiltered last fetch — client filters are re-applied from this snapshot
  // (filtering the state array in place was destructive: relaxing a filter
  // never brought the removed places back).
  const allPlacesRef = useRef<NearbyPlace[]>([]);
  const [sortBy, setSortBy] = useState<NearbySortOption>('distance');
  const [filters, setFiltersState] = useState<NearbyFilters>(DEFAULT_NEARBY_FILTERS as any);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const pageTokenRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const initialLoadDone = useRef(false);
  const currentCoords = useRef<{ lat: number; lng: number } | null>(null);

  const analytics = useExploreAnalytics();
  const user = useAuthStore((s: any) => s.user);

  /* ── Analytics tracking helpers ───────────────────────────────────────────── */

  const trackCategorySelected = useCallback((category: NearMeCategory) => {
    analytics.track('category_opened', { category });
  }, [analytics]);

  const trackPlaceViewed = useCallback((place: NearbyPlace) => {
    analytics.track('nearby_item_viewed', { placeId: place.placeId, name: place.name, category: place.category });
  }, [analytics]);

  const trackCoordinateJourney = useCallback((place: NearbyPlace) => {
    analytics.track('coordinate_journey_clicked', { placeId: place.placeId, name: place.name });
  }, [analytics]);

  const trackSavePlace = useCallback((place: NearbyPlace) => {
    analytics.track('destination_saved', { placeId: place.placeId, name: place.name });
  }, [analytics]);

  const trackSharePlace = useCallback((place: NearbyPlace) => {
    analytics.track('destination_saved', { action: 'share', placeId: place.placeId });
  }, [analytics]);

  const trackDirectionsStarted = useCallback((place: NearbyPlace, mode: 'walking' | 'driving') => {
    analytics.track('coordinate_journey_clicked', { placeId: place.placeId, mode });
  }, [analytics]);

  const trackMapViewOpened = useCallback(() => {
    analytics.track('destination_viewed', { view: 'map' });
  }, [analytics]);

  /* ── Location Permission ──────────────────────────────────────────────────── */

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setGpsStatus('granted');
        analytics.track('destination_viewed', { event: 'location_permission_granted' });
        return true;
      } else if (status === 'denied') {
        setGpsStatus('denied');
        setError('Location access is required to discover nearby places. Please enable location permissions in your device settings.');
        return false;
      } else {
        setGpsStatus('blocked');
        setError('Location access is blocked. Please enable location permissions in your device settings.');
        return false;
      }
    } catch (err) {
      console.error('[useNearby] Location permission error:', err);
      setGpsStatus('unavailable');
      setError('Unable to request location permissions. Please try again.');
      return false;
    }
  }, [analytics]);

  /* ── Get current location ─────────────────────────────────────────────────── */

  const getCurrentLocation = useCallback(async () => {
    try {
      console.log('[DEBUG] Requesting current position...');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      console.log('[DEBUG] Latitude:', loc.coords.latitude);
      console.log('[DEBUG] Longitude:', loc.coords.longitude);
      console.log('[DEBUG] Accuracy:', loc.coords.accuracy);

      currentCoords.current = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };

      return {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };
    } catch (err) {
      console.error('[useNearby] Get location error:', err);
      // Try getting last known position as fallback
      try {
        console.log('[DEBUG] Trying last known position...');
        const lastLoc = await Location.getLastKnownPositionAsync();
        if (lastLoc) {
          console.log('[DEBUG] Last known position found:', lastLoc.coords.latitude, lastLoc.coords.longitude);
          currentCoords.current = {
            lat: lastLoc.coords.latitude,
            lng: lastLoc.coords.longitude,
          };
          return {
            lat: lastLoc.coords.latitude,
            lng: lastLoc.coords.longitude,
          };
        }
      } catch (fallbackErr) {
        console.error('[useNearby] Last known position error:', fallbackErr);
      }
      return null;
    }
  }, []);

  /* ── Load nearby places ───────────────────────────────────────────────────── */

  const loadNearby = useCallback(async (isRefresh = false) => {
    if (loadingRef.current && !isRefresh) {
      console.log('[DEBUG] Already loading, skipping...');
      return;
    }

    const coords = currentCoords.current;
    console.log('[DEBUG] Step 4: Loading nearby with coords:', coords);
    if (!coords) {
      console.log('[DEBUG] No coordinates available');
      setError(ERROR_MESSAGES.LOCATION_REQUIRED);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    loadingRef.current = true;

    if (isRefresh) {
      setRefreshing(true);
      pageTokenRef.current = null;
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      console.log('[DEBUG] Calling NearMeEngine.getNearbyExperiences...');
      // Build user context if available
      const userContext: UserContext | undefined = user ? {
        interests: user.interests || [],
        savedPlaceIds: user.savedPlaces || [],
        searchHistory: [],
        tripHistory: [],
        season: getCurrentSeason(),
        currentWeather: '',
        temperature: 20,
      } : undefined;

      const result: NearMeResult = await NearMeEngine.getNearbyExperiences(
        coords.lat,
        coords.lng,
        {
          // Read from refs, not state — the category/filter handlers refetch
          // immediately after mutating state, and the loadNearby closure they
          // capture may predate the state update (the stale-closure bug that
          // made the category selector fetch the previous category).
          category: activeCategoryRef.current,
          sortBy,
          filters: filtersRef.current,
          userContext,
          pageToken: isRefresh ? undefined : pageTokenRef.current || undefined,
        }
      );

      // Keep the unfiltered snapshot: filter changes re-apply from here so
      // relaxing a filter restores previously hidden places.
      allPlacesRef.current = result.places;

      console.log('[DEBUG] NearMeEngine result:', {
        placesCount: result.places.length,
        eventsCount: result.events.length,
        hasMore: result.hasMore,
        location: result.location,
      });

      if (isRefresh) {
        setPlaces(result.places);
      } else {
        setPlaces(prev => [...prev, ...result.places]);
      }

      setEvents(result.events);
      setHasMore(result.hasMore);
      pageTokenRef.current = result.nextPageToken;
      setIsOffline(false);

      if (result.location) {
        console.log('[DEBUG] Step 5: Location set:', result.location);
        setLocation(result.location);
      }

      // Cache the location info
      if (isRefresh) {
        const cached = await ExploreCacheService.getCachedNearby();
        if (!cached) {
          await ExploreCacheService.setCachedNearby(result as any);
        }
      }

      // Track analytics
      analytics.track('destination_viewed', { event: 'near_me_opened' });
      
      console.log('[DEBUG] Step 6: Nearby places loaded successfully');
      console.log('[DEBUG] Nearby Hook Result:', {
        places: result.places.length,
        events: result.events.length,
        location: result.location,
      });
    } catch (err) {
      console.error('[useNearby] Load error:', err);

      // Try loading from cache on error
      const cached = await ExploreCacheService.getCachedNearby();
      if (cached) {
        const cachedResult = cached as unknown as NearMeResult;
        setPlaces(cachedResult.places);
        setEvents(cachedResult.events);
        if (cachedResult.location) setLocation(cachedResult.location);
        setIsOffline(true);
        setError('You\'re offline. Showing cached results.');
      } else {
        setError(ERROR_MESSAGES.LOAD_NEARBY);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, [activeCategory, sortBy, filters, user, analytics]);

  /* ── Initialize on mount ──────────────────────────────────────────────────── */

  useEffect(() => {
    async function init() {
      if (initialLoadDone.current) return;
      initialLoadDone.current = true;

      console.log('=== NEAR ME FLOW START ===');
      console.log('Step 1: Checking location permission...');

      // Check location permission
      let { status } = await Location.getForegroundPermissionsAsync();
      console.log('Permission Status:', status);

      // Auto-request if undetermined (first time)
      if (status === 'undetermined') {
        console.log('Permission undetermined, requesting...');
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        status = newStatus;
        console.log('Permission after request:', status);
        if (newStatus === 'granted') {
          analytics.track('destination_viewed', { event: 'location_permission_granted' });
        }
      }

      setGpsStatus(status as GpsStatus);

      if (status !== 'granted') {
        console.log('Permission denied/blocked, showing error UI');
        setError(status === 'denied'
          ? 'Location access was denied. Please enable it in your device settings to discover nearby places.'
          : 'Location access is required to discover places near you.');
        setLoading(false);
        return;
      }

      console.log('Step 2: Getting current location...');
      // Get current location
      const coords = await getCurrentLocation();
      console.log('Current Location:', coords);
      if (!coords) {
        console.log('Failed to get location');
        setError('Unable to determine your location. Please ensure GPS is enabled.');
        setLoading(false);
        return;
      }

      console.log('Step 3-7: Loading nearby places...');
      // Load nearby places
      await loadNearby(true);
    }

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    console.log('Refresh triggered');
    await loadNearby(true);
  }, [loadNearby]);

  /* ── Load more (pagination) ──────────────────────────────────────────────── */

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;
    await loadNearby(false);
  }, [hasMore, loadNearby]);

  /* ── Set category ─────────────────────────────────────────────────────────── */

  const handleSetCategory = useCallback((category: NearMeCategory) => {
    console.log('[DEBUG] =========================================');
    console.log('[DEBUG] CATEGORY SELECTED:', category);
    console.log('[DEBUG] Previous category:', activeCategoryRef.current);
    console.log('[DEBUG] =========================================');

    // Update the REF FIRST: loadNearby reads activeCategoryRef.current, so the
    // refetch below always uses the newly selected category. (The previous
    // setTimeout-then-loadNearby pattern captured a STALE closure built with
    // the previous category — the selector appeared to do nothing.)
    activeCategoryRef.current = category;
    setActiveCategory(category);
    setPlaces([]);
    pageTokenRef.current = null;
    trackCategorySelected(category);

    // Immediate refetch with the new category (OSM query is category-tagged).
    loadNearby(true);
  }, [loadNearby, trackCategorySelected]);

  /* ── Set sort ─────────────────────────────────────────────────────────────── */

  const handleSetSortBy = useCallback((sort: NearbySortOption) => {
    setSortBy(sort);
    setPlaces([]);
    pageTokenRef.current = null;
    // Re-rank the unfiltered snapshot (never the already-filtered state array)
    const base = allPlacesRef.current;
    if (base.length > 0) {
      const filtered = NearMeEngine.filterPlaces(base, filtersRef.current);
      setPlaces(NearMeEngine.rankPlaces(filtered, sort));
    } else {
      loadNearby(true);
    }
  }, [loadNearby]);

  /* ── Set filters ──────────────────────────────────────────────────────────── */

  const handleSetFilters = useCallback((partial: Partial<NearbyFilters>) => {
    // Merge into the ref (single source of truth for reloads), then re-apply
    // from the unfiltered snapshot — filtering the state array in place was
    // destructive: relaxing a filter never brought places back.
    filtersRef.current = { ...filtersRef.current, ...partial };
    setFiltersState(filtersRef.current);
    const base = allPlacesRef.current;
    if (base.length > 0) {
      setPlaces(NearMeEngine.filterPlaces(base, filtersRef.current));
    }
  }, []);

  const resetFilters = useCallback(() => {
    filtersRef.current = { ...(DEFAULT_NEARBY_FILTERS as any) };
    setFiltersState(filtersRef.current);
    loadNearby(true);
  }, [loadNearby]);

  /* ── Get place details ────────────────────────────────────────────────────── */

  const getPlaceDetails = useCallback(async (placeId: string): Promise<NearbyPlace | null> => {
    if (!currentCoords.current) return null;
    return NearMeEngine.getPlaceDetails(placeId, currentCoords.current);
  }, []);

  /* ── Helper to get current season ─────────────────────────────────────────── */

  function getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  return {
    // State
    places,
    events,
    loading,
    refreshing,
    error,
    location,
    gpsStatus,
    hasMore,
    isOffline,

    // Active filters & sort
    activeCategory,
    sortBy,
    filters,
    viewMode,

    // Actions
    setActiveCategory: handleSetCategory,
    setSortBy: handleSetSortBy,
    setFilters: handleSetFilters,
    resetFilters,
    setViewMode,
    loadMore,
    refresh,
    requestLocationPermission,
    getPlaceDetails,

    // Analytics
    trackCategorySelected,
    trackPlaceViewed,
    trackCoordinateJourney,
    trackSavePlace,
    trackSharePlace,
    trackDirectionsStarted,
    trackMapViewOpened,
  };
}