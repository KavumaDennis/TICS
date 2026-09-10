/**
 * useWeekendEscapes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for discovering weekend escapes based on user location.
 * Provides day trips, weekend getaways, road trips, and adventure recommendations.
 *
 * Cache-first: renders cached escapes immediately, refreshes in background.
 * Uses location-aware cache keys to prevent tiny GPS movements from
 * destroying cache effectiveness.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ExploreEngine } from '@/src/modules/explore/services/ExploreEngine';
import type { WeekendEscape, DestinationCoordinates } from '@/src/modules/explore/types';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseWeekendEscapesReturn {
  escapes: WeekendEscape[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useWeekendEscapes(location?: DestinationCoordinates): UseWeekendEscapesReturn {
  const [escapes, setEscapes] = useState<WeekendEscape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);

  const lat = location?.lat;
  const lng = location?.lng;

  /* ── Load weekend escapes ─────────────────────────────────────────────────── */

  const loadEscapes = useCallback(async () => {
    if (loadRef.current) return loadRef.current;

    const requestId = ++requestIdRef.current;
    loadRef.current = (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!lat || !lng) {
          setEscapes([]);
          setLoading(false);
          return;
        }

        // Cache-first: attempt immediate cached render
        try {
          const cached = await ExploreCacheService.getCachedWeekendEscapes(lat, lng);
          if (cached && cached.length > 0) {
            setEscapes(cached);
            setLoading(false);
          }
        } catch {
          // cache miss is fine - proceed to network
        }

        // Fetch from engine (with timeout to prevent blocking)
        // 50km radius: 100km Overpass queries (200km bbox) are heavy and
        // routinely time out on public endpoints, which is why View All came
        // back empty. 50km still covers genuine weekend trips.
        const result = await ExploreEngine.getNearbyPlaces({
          lat,
          lng,
          radiusKm: 50,
          types: ['tourist_attraction', 'park', 'museum', 'beach'],
          sortBy: 'distance',
          pageSize: 20,
        });

        if (requestId !== requestIdRef.current) return; // stale response

        if (result && result.length > 0) {
          const weekendEscapes: WeekendEscape[] = result.map((item, index) => ({
            id: `escape_${item.id}`,
            destinationId: item.destinationId || item.id,
            type: (index < 3 ? 'day_trip' : index < 7 ? 'weekend' : 'road_trip') as any,
            distance: item.distance,
            travelTime: `${Math.round(item.distance / 50)}h`,
            reason: getEscapeReason(index),
            destination: {
              id: item.destinationId || item.id,
              name: item.name,
              description: item.description || '',
              country: '',
              city: '',
              coordinates: item.coordinates,
              images: [{ url: item.imageUrl || '', caption: '', credit: '' }],
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
              slug: item.name?.toLowerCase().replace(/\s+/g, '-') || '',
              countryCode: '',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any,
          }));
          setEscapes(weekendEscapes);
          // Cache the result with location-aware key
          await ExploreCacheService.setCachedWeekendEscapes(weekendEscapes, lat, lng);
        } else {
          // FALLBACK: map whatever the last discover() run cached (dynamic
          // OSM nearby places) into escapes so View All is never empty.
          const { DestinationCache } = await import(
            '@/src/modules/explore/services/discovery/DestinationCache'
          );
          const kmTo = (dLat2: number, dLng2: number) => {
            const dLat = ((dLat2 - lat) * Math.PI) / 180;
            const dLng = ((dLng2 - lng) * Math.PI) / 180;
            const h =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((lat * Math.PI) / 180) *
                Math.cos((dLat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
            return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
          };
          const cachedDests = DestinationCache.getAll()
            .map((d) => ({
              dest: d,
              km:
                d.coordinates
                  ? kmTo(d.coordinates.lat, d.coordinates.lng)
                  : Infinity,
            }))
            .filter((x) => x.km >= 5 && x.km <= 120)
            .sort((a, b) => a.km - b.km);
          if (cachedDests.length > 0) {
            const fallbackEscapes: WeekendEscape[] = cachedDests.slice(0, 20).map((x, index) => ({
              id: `escape_${x.dest.id}`,
              destinationId: x.dest.id,
              type: (index < 5 ? 'day_trip' : index < 12 ? 'weekend' : 'road_trip') as any,
              distance: Math.round(x.km * 100) / 100,
              travelTime: `${Math.max(1, Math.round(x.km / 50))}h`,
              reason: getEscapeReason(index),
              destination: x.dest,
            }));
            setEscapes(fallbackEscapes);
            console.log(`[useWeekendEscapes] OSM empty — using ${fallbackEscapes.length} cached dynamic places`);
          }
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error('[useWeekendEscapes] Error loading escapes:', err);
        // Keep existing cached data visible on error
        if (escapes.length === 0) {
          setError('Failed to load weekend escapes');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
        loadRef.current = null;
      }
    })();

    return loadRef.current;
  }, [lat, lng, escapes.length]);

  /* ── Load on mount or location change ─────────────────────────────────────── */

  useEffect(() => {
    loadEscapes();
  }, [location, loadEscapes]);

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    await loadEscapes();
  }, [loadEscapes]);

  /* ── Load more ────────────────────────────────────────────────────────────── */

  const loadMore = useCallback(async () => {
    // Implementation for pagination if needed
  }, []);

  /* ── Return ───────────────────────────────────────────────────────────────── */

  return {
    escapes,
    loading,
    error,
    refresh,
    loadMore,
  };
}

/* ── Helper Functions ───────────────────────────────────────────────────────── */

function getEscapeReason(index: number): string {
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