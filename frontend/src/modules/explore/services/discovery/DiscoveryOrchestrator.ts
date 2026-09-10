/**
 * DiscoveryOrchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API-First Travel Discovery Pipeline v2.
 * 
 * Fixes:
 * 1. Popular Destinations now use GlobalPopularEngine (no user location influence)
 * 2. Weekend Escapes now use WeekendEscapeIntelligence (dedicated destination pipeline)
 * 3. Firestore fallback for every engine when live APIs fail
 * 4. Accurate source logging - never says "FIRESTORE: NOT USED" when it was
 * 
 * Firestore is NEVER the primary source. Only used as fallback when APIs
 * return insufficient results.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  DestinationCoordinates,
  ExploreCategory,
  Destination,
  Event,
  JourneyFeedItem,
  NearbyItem,
  WeekendEscape,
} from '@/src/modules/explore/types';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { EventsProvider } from './EventsProvider';
import { TrendingEngine } from './TrendingEngine';
import { PopularityEngine } from './PopularityEngine';
import { CategoryDiscoveryEngine, getDefaultCategories } from './CategoryDiscoveryEngine';
import { WeekendEscapeEngine } from './WeekendEscapeEngine';
import { JourneyFeedGenerator } from './JourneyFeedGenerator';
import { GeminiRankingService } from './GeminiRankingService';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';
import { GlobalPopularEngine, GlobalPopularCache } from './GlobalPopularEngine';
import { getLastOsmOutcome, getOsmJoinStats, clearOpenStreetMapCache } from './providers/OpenStreetMapProvider';
import { isValidUserLocation } from './providers/types';
import { googlePlacesAvailable } from './providers/config';
import { WeekendEscapeIntelligence } from './WeekendEscapeIntelligence';
import { DestinationCache } from './DestinationCache';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import { withTimeoutFallback } from '@/src/modules/explore/utils/withTimeout';
import { enrichExploreSections, enrichNearbyItems } from './DestinationImageService';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface DiscoveryOptions {
  userId?: string;
  location?: DestinationCoordinates;
  preferences?: Record<string, unknown>;
  season?: string;
  weather?: string;
  radiusKm?: number;
}

export interface DiscoveryResult {
  categories: ExploreCategory[];
  trending: Destination[];
  popular: Destination[];
  events: Event[];
  nearby: NearbyItem[];
  weekendEscapes: WeekendEscape[];
  journeyFeed: JourneyFeedItem[];
  computedAt: number;
  providersUsed: string[];
}

/* ── Minimum thresholds ──────────────────────────────────────────────────────── */

const MIN_NEARBY_REQUIRED = 10;
/* ── Request coalescing & run metrics ─────────────────────────────────────── */

const discoveryMetrics = { duplicatesPrevented: 0 };

// Key: explore:{latBucket}:{lngBucket}:{radius} (or explore:none).
// Concurrent callers with the same key share ONE in-flight discovery.
const inFlightDiscoveries = new Map<string, Promise<DiscoveryResult>>();

function discoveryKey(lat?: number, lng?: number, radiusKm: number = 100): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'explore:none';
  const latBucket = Math.round(lat * 2) / 2;
  const lngBucket = Math.round(lng * 2) / 2;
  return `explore:${latBucket}:${lngBucket}:${radiusKm}`;
}

/** Single end-of-run health summary for fast diagnosis.
 *  States are truthful: SUCCESS_EMPTY only when the service genuinely answered
 *  with zero matches; TIMEOUT/FAILED when it could not be reached. */
function logDiscoveryHealth(input: {
  locationAvailable: boolean;
  lat?: number;
  lng?: number;
  nearbyCount?: number;
  trendingCount?: number;
  popularCount?: number;
  eventCount?: number;
  weekendCount?: number;
  feedCount?: number;
  categoryCount?: number;
  providersUsed: string[];
  firestoreUsed: boolean;
  duplicateRequestsPrevented: number;
  orchestrationMs?: number;
}): void {
  const fmt = (n?: number) => (typeof n === 'number' ? String(n) : '-');

  // ── Provider states (real outcomes, never "SUCCESS_EMPTY" for failures) ──
  const osmOutcome = getLastOsmOutcome();
  const osmState =
    osmOutcome.status === 'SUCCESS_WITH_DATA'
      ? 'SUCCESS_WITH_DATA'
      : osmOutcome.status === 'SUCCESS_EMPTY'
        ? 'SUCCESS_EMPTY'
        : osmOutcome.status === 'TIMEOUT'
          ? `TIMEOUT (${osmOutcome.durationMs}ms)`
          : osmOutcome.status === 'FAILED'
            ? `FAILED (${osmOutcome.durationMs}ms)`
            : 'NOT_QUERIED';

  const gpEnabled = googlePlacesAvailable();
  const geonamesEnabled = Boolean(process.env.EXPO_PUBLIC_GEONAMES_USERNAME);

  console.log('[DiscoveryHealth]');
  console.log('Location:');
  console.log(
    input.locationAvailable
      ? `  available=true\n  lat=${input.lat}\n  lng=${input.lng}`
      : '  available=false (location-dependent sections waiting for GPS)'
  );
  console.log('Providers:');
  console.log(`  OSM=${osmState}`);
  console.log(
    `  Firestore=${input.firestoreUsed ? 'FALLBACK' : 'SUCCESS_WITH_DATA'}`
  );
  console.log('  Wikidata=ENABLED');
  console.log(`  GeoNames=${geonamesEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`  GooglePlaces=${gpEnabled ? 'OPTIONAL_ENABLED' : 'DISABLED'}`);
  console.log('Sections:');
  console.log(
    `  nearby=${fmt(input.nearbyCount)} trending=${fmt(input.trendingCount)} popular=${fmt(input.popularCount)} events=${fmt(input.eventCount)} weekend=${fmt(input.weekendCount)} feed=${fmt(input.feedCount)} categories=${fmt(input.categoryCount)}`
  );

  // ── Fallbacks actually used this run (from providersUsed markers) ─────────
  const used = new Set(input.providersUsed);
  const fb = (section: string, marker: string) => (used.has(marker) ? section + '=firestore' : section + '=none');
  console.log('Fallbacks:');
  console.log(
    [
      fb('popular', 'firestore_popular_fallback'),
      fb('nearby', 'firestore_nearby_fallback'),
      fb('weekend', 'firestore_escape_fallback'),
      fb('trending', 'firestore_trending_fallback'),
      input.popularCount && !input.firestoreUsed ? 'popular=cache' : null,
    ]
      .filter(Boolean)
      .join('\n  ')
  );

  const joins = getOsmJoinStats();
  console.log('Performance:');
  if (typeof input.orchestrationMs === 'number') {
    console.log(`  orchestration=${input.orchestrationMs}ms`);
  }
  console.log(`Duplicate requests prevented: ${input.duplicateRequestsPrevented}`);
  console.log(`OSM in-flight joins: ${joins}`);
}


/* ── Orchestrator ────────────────────────────────────────────────────────────── */

let requestCounter = 0;

export const DiscoveryOrchestrator = {
  /**
   * Coalescing entry point. Concurrent callers for the same location share a
   * single in-flight discovery instead of launching duplicate provider runs.
   * Every request is traceable via requestId / startedAt / completedAt.
   */
  discover(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const { location, radiusKm = 100 } = options;
    const key = discoveryKey(location?.lat, location?.lng, radiusKm);
    const requestId = ++requestCounter;
    const startedAt = Date.now();

    const existing = inFlightDiscoveries.get(key);
    if (existing) {
      discoveryMetrics.duplicatesPrevented += 1;
      console.log(
        `[DiscoveryOrchestrator] requestId=${requestId} duplicate prevented (key=${key}) — joining in-flight run`
      );
      return existing;
    }

    console.log(`[DiscoveryOrchestrator] requestId=${requestId} startedAt=${startedAt} key=${key}`);

    const promise = this.discoverInternal(options)
      .finally(() => {
        inFlightDiscoveries.delete(key);
        console.log(
          `[DiscoveryOrchestrator] requestId=${requestId} completedAt=${Date.now()} durationMs=${Date.now() - startedAt}`
        );
      });
    inFlightDiscoveries.set(key, promise);
    return promise;
  },

  /**
   * Main discovery method - API-first travel pipeline.
   * 
   * Key fixes:
   * - Popular uses GlobalPopularEngine (no user location influence)
   * - Weekend Escapes uses WeekendEscapeIntelligence (dedicated pipeline)
   * - Every engine has Firestore fallback when live APIs fail
   * - Accurate source logging
   */
  async discoverInternal(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const { location, radiusKm = 100 } = options;
    const providersUsed: string[] = [];
    let firestoreUsed = false;

    // ── Guard: valid location check (graceful degradation) ──────────────────
    // Uses the centralized validator: rejects (0,0) null-island sentinels and
    // out-of-range coordinates so no location-dependent provider is ever
    // queried with garbage.
    const isValidLocation = isValidUserLocation(location?.lat, location?.lng);

    if (!isValidLocation || !location) {
      // ── LOCATION-INDEPENDENT DISCOVERY ONLY ────────────────────────────────
      // Never invent a fallback city (previously Nairobi). Location-dependent
      // sections (Nearby, Weekend Escape, local Trending, local Events) simply
      // stay empty here and populate when the location-aware discovery runs.
      console.log('[DiscoveryOrchestrator] ℹ️ Location unavailable — running location-independent discovery only.');
      console.log('[DiscoveryOrchestrator] Nearby / Weekend / local sections will wait for GPS.');

      const orchestrationStart = Date.now();
      const [globalPopularResult, categoriesSnap] = await Promise.all([
        GlobalPopularCache.get().catch(() => null),
        ExploreService.loadCategories().catch(() => ({ data: [] as ExploreCategory[] })),
      ]);

      let popular: Destination[] = [];
      if (globalPopularResult && globalPopularResult.destinations.length > 0) {
        popular = globalPopularResult.destinations;
        providersUsed.push('global_popular_engine');
      }
      if (popular.length === 0) {
        try {
          const firestoreResult = await ExploreService.loadDestinations({ pageSize: 20 });
          if (firestoreResult.data.length > 0) {
            popular = firestoreResult.data;
            firestoreUsed = true;
            providersUsed.push('firestore_popular_fallback');
          }
        } catch (err) {
          console.warn('[DiscoveryOrchestrator] Popular Firestore fallback failed:', err);
        }
      }

      const categories = categoriesSnap.data || [];
      if (categories.length > 0) providersUsed.push('category_engine');

      logDiscoveryHealth({
        locationAvailable: false,
        popularCount: popular.length,
        categoryCount: categories.length,
        providersUsed,
        firestoreUsed,
        duplicateRequestsPrevented: discoveryMetrics.duplicatesPrevented,
        orchestrationMs: Date.now() - orchestrationStart,
      });

      return {
        categories,
        trending: [],
        popular,
        events: [],
        nearby: [],
        weekendEscapes: [],
        journeyFeed: [],
        computedAt: Date.now(),
        providersUsed,
      };
    }

    /* ── Legacy no-location branch removed (Nairobi default eliminated) ────── */

    const lat = location.lat;
    const lng = location.lng;

    console.log('[DiscoveryOrchestrator] ═══════════════════════════════════════');
    console.log('[DiscoveryOrchestrator] 🏝️ API-First Travel Discovery Pipeline v2');
    console.log('[DiscoveryOrchestrator] Location:', { lat, lng, radiusKm });
    console.log('[DiscoveryOrchestrator] ═══════════════════════════════════════');

    // ────────────────────────────────────────────────────────────────────────
    // STEP 1: Fetch ALL providers in parallel
    // ────────────────────────────────────────────────────────────────────────

    // Per-engine hard budgets. NOTE on 'budget:nearby' / 'budget:trending' /
    // 'budget:weekend': these engines route through the OSM provider, whose
    // LIVE-MEASURED latency against public Overpass is 2s (healthy primary)
    // to ~16-28s (primary down → slow mirror). A 6s section budget aborted
    // healthy OSM requests mid-flight and silently replaced them with empty
    // fallback data — the root cause of "OSM=TIMEOUT (5-6s)" on the Explore
    // screen. They are therefore sized ABOVE the OSM provider's total budget
    // (35s) so the OSM request itself is never what gets discarded. The first
    // uncached load may take up to ~30s for these sections; all subsequent
    // loads are cache hits. Categories/events/feed keep tight budgets (they
    // degrade to their own fallbacks and are not OSM-critical).
    const [
      categoriesResult,
      trendingResult,
      globalPopularResult,
      eventsResult,
      nearbyResult,
      weekendEscapeResult,
      feedResult,
    ] = await Promise.allSettled([
      withTimeoutFallback(
        CategoryDiscoveryEngine.getCategories(lat, lng, radiusKm),
        15_000, 'budget:categories', { categories: [] as any, computedAt: Date.now() }
      ),
      withTimeoutFallback(
        TrendingEngine.getTrendingDestinations(lat, lng),
        36_000, 'budget:trending',
        { destinations: [], sourceBreakdown: { google: 0, osm: 0, firestore: 0 } } as any
      ),
      withTimeoutFallback(
        GlobalPopularCache.get(),
        7_500, 'budget:popular',
        { destinations: [], sourceBreakdown: { osm: 0, firestore: 0 }, regionsCovered: 0 } as any
      ),
      withTimeoutFallback(
        EventsProvider.getEvents(lat, lng, radiusKm),
        4_000, 'budget:events', { events: [] } as any
      ),
      withTimeoutFallback(
        ProviderDataCoordinator.getOpenStreetMap(lat, lng, radiusKm),
        36_000, 'budget:nearby',
        { places: [], provider: 'openstreetmap' as const, fetchedAt: Date.now() }
      ),
      withTimeoutFallback(
        WeekendEscapeIntelligence.discoverEscapes(lat, lng, 120),
        36_000, 'budget:weekend',
        { escapes: [], candidates: 0, selected: 0, source: 'firestore' as const } as any
      ),
      withTimeoutFallback(
        JourneyFeedGenerator.generateFeed(lat, lng),
        4_000, 'budget:feed', [] as any
      ),
    ]);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 2: Extract results with providers tracking
    // ────────────────────────────────────────────────────────────────────────

    // Categories (Firestore-first, static defaults fallback inside the engine).
    // withTimeoutFallback() resolves with an EMPTY list on timeout, so also
    // substitute defaults when the result is empty — the Categories section
    // must never silently disappear.
    let categories = categoriesResult.status === 'fulfilled'
      ? categoriesResult.value.categories
      : ([] as any[]);
    if (categories.length === 0) {
      console.warn('[DiscoveryOrchestrator] ⚠ Categories empty (rejected or timed-out) — using static default categories');
      categories = getDefaultCategories();
    }
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value.categories.length > 0) {
      providersUsed.push('category_engine');
    }

    // 🔥 TRENDING - API FIRST with Firestore fallback (handled inside TrendingEngine).
    // The engine runs under withTimeoutFallback(), which RESOLVES with an EMPTY
    // result on timeout — so also fall back to Firestore when it returns empty.
    let trending: Destination[] = [];
    let trendingSourceBreakdown = { google: 0, osm: 0, firestore: 0 };
    if (trendingResult.status === 'fulfilled') {
      const result = trendingResult.value;
      trending = result.destinations;
      trendingSourceBreakdown = result.sourceBreakdown;
      if (trending.length > 0) {
        providersUsed.push('trending_engine');
      }
      if (result.sourceBreakdown.firestore > 0) {
        firestoreUsed = true;
        console.log(`[DiscoveryOrchestrator] ⚠ Trending Firestore fallback: ${result.firestoreReason}`);
      }
    }
    if (trending.length === 0) {
      console.warn('[DiscoveryOrchestrator] ⚠ TrendingEngine unavailable (rejected or empty/timed-out result), using Firestore fallback for trending');
      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: 20,
        });
        if (firestoreResult.data.length > 0) {
          trending = firestoreResult.data;
          trendingSourceBreakdown.firestore = firestoreResult.data.length;
          firestoreUsed = true;
          providersUsed.push('firestore_trending_fallback');
          console.log(`[DiscoveryOrchestrator] 🔥 Trending Firestore fallback: ${trending.length} destinations`);
        }
      } catch (trendingErr) {
        console.warn('[DiscoveryOrchestrator] Firestore trending fallback also failed:', trendingErr);
      }
    }

    let popular: Destination[] = [];
    let popularRegions = 0;
    let popularSourceBreakdown = { osm: 0, firestore: 0 };
    // 🔥 FIX 1: POPULAR - From GlobalPopularEngine with Firestore fallback.
    // 🔥 FIX 1: POPULAR - From GlobalPopularEngine with Firestore fallback.
    // NOTE: withTimeoutFallback() RESOLVES (not rejects) with an EMPTY result
    // when the engine exceeds its budget, so `status === 'rejected'` alone
    // never fires the fallback — a timed-out engine silently left `popular`
    // empty and the whole Popular Destinations section disappeared while OSM
    // data kept flowing elsewhere. Treat empty results as a fallback trigger.
    if (globalPopularResult.status === 'fulfilled' && globalPopularResult.value.destinations.length > 0) {
      const result = globalPopularResult.value;
      popular = result.destinations;
      popularSourceBreakdown = result.sourceBreakdown;
      popularRegions = result.regionsCovered;
      providersUsed.push('global_popular_engine');
      
      if (result.sourceBreakdown.firestore > 0) {
        firestoreUsed = true;
        console.log(`[DiscoveryOrchestrator] 🔥 Popular from Firestore fallback: ${popular.length} destinations`);
      } else {
        console.log(`[DiscoveryOrchestrator] 🌍 Popular from GlobalPopularEngine: ${popular.length} destinations across ${popularRegions} regions`);
      }
    } else {
      const popularFailureReason = globalPopularResult.status === 'rejected'
        ? (globalPopularResult as any)?.reason || (globalPopularResult as PromiseRejectedResult).reason
        : 'empty/timed-out result';
      console.warn(`[DiscoveryOrchestrator] ⚠ GlobalPopularEngine unavailable (${popularFailureReason}), using Firestore fallback for popular`);
      // Firestore fallback for popular
      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: 20,
        });
        if (firestoreResult.data.length > 0) {
          popular = firestoreResult.data;
          firestoreUsed = true;
          providersUsed.push('firestore_popular_fallback');
          console.log(`[DiscoveryOrchestrator] 🔥 Popular Firestore fallback: ${popular.length} destinations`);
        }
      } catch (localErr) {
        console.warn('[DiscoveryOrchestrator] Firestore popular fallback also failed:', localErr);
      }
    }

    // Events (from Ticketmaster)
    const events = eventsResult.status === 'fulfilled'
      ? eventsResult.value.events.slice(0, 20)
      : [];
    if (eventsResult.status === 'fulfilled' && events.length > 0) {
      providersUsed.push('events_provider');
    }

    // 🔥 FIX 2: WEEKEND ESCAPES - From WeekendEscapeIntelligence with Firestore fallback
    let weekendEscapes: WeekendEscape[] = [];
    let weekendCandidates = 0;
    let weekendSource: 'live' | 'firestore' = 'live';
    if (weekendEscapeResult.status === 'fulfilled') {
      const result = weekendEscapeResult.value;
      weekendEscapes = result.escapes;
      weekendCandidates = result.candidates;
      weekendSource = result.source;
      providersUsed.push('weekend_escape_intelligence');
      
      if (result.source === 'firestore') {
        firestoreUsed = true;
        console.log(`[DiscoveryOrchestrator] 🔥 Weekend Escapes from Firestore fallback: ${weekendEscapes.length} escapes (reason: ${result.firestoreReason})`);
      } else {
        console.log(`[DiscoveryOrchestrator] 🏕️ Weekend Escapes from live APIs: ${weekendEscapes.length} selected from ${weekendCandidates} candidates`);
      }
    } else {
      const reason = (weekendEscapeResult as any)?.reason || 'unknown error';
      console.warn(`[DiscoveryOrchestrator] ⚠ WeekendEscapeIntelligence failed: ${reason}`);
      // Firestore fallback for weekend escapes
      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: 20,
        });
        const firestoreEscapes: WeekendEscape[] = firestoreResult.data
          .filter(dest => {
            if (!dest.coordinates?.lat || !dest.coordinates?.lng) return false;
            const distance = this.haversineDistance(
              { lat, lng },
              { lat: dest.coordinates.lat, lng: dest.coordinates.lng }
            );
            return distance >= 10 && distance <= 300;
          })
          .map((dest) => {
            const distance = this.haversineDistance(
              { lat, lng },
              { lat: dest.coordinates.lat, lng: dest.coordinates.lng }
            );
            return {
              id: `fs_escape_${dest.id}`,
              destinationId: dest.id,
              type: (distance <= 100 ? 'day_trip' : distance <= 200 ? 'weekend' : 'road_trip') as any,
              distance: Math.round(distance * 100) / 100,
              travelTime: `${Math.round(distance / 50)} hours`,
              reason: `Explore ${dest.name} - a great escape ${Math.round(distance)}km away`,
              destination: dest,
            } as WeekendEscape;
          });
        
        if (firestoreEscapes.length > 0) {
          weekendEscapes = firestoreEscapes.slice(0, 10);
          firestoreUsed = true;
          providersUsed.push('firestore_escape_fallback');
          console.log(`[DiscoveryOrchestrator] 🔥 Weekend Escapes Firestore fallback: ${weekendEscapes.length} escapes`);
        }
      } catch (oldErr) {
        console.warn('[DiscoveryOrchestrator] Firestore weekend escape fallback also failed:', oldErr);
      }
    }

    // Journey Feed
    const journeyFeed = feedResult.status === 'fulfilled'
      ? feedResult.value
      : [];
    if (feedResult.status === 'fulfilled' && journeyFeed.length > 0) {
      providersUsed.push('feed_generator');
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 3: NEARBY - Travel Classify + Rank + Balance + Firestore fallback
    // ────────────────────────────────────────────────────────────────────────

    const rawNearbyPlaces = nearbyResult.status === 'fulfilled' ? nearbyResult.value.places : [];
    const allRawPlaces = this.mergeNearbyPlaces(rawNearbyPlaces);
    const travelPlaces = TravelClassifier.filterTravelRelevant(allRawPlaces);

    // Cache all travel places as Destinations so detail screen can find them
    DestinationCache.setMany(travelPlaces.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.name.toLowerCase().replace(/\s+/g, '-'),
      description: p.description || '',
      country: '',
      countryCode: '',
      city: '',
      coordinates: p.coordinates,
      images: p.imageUrl ? [{ url: p.imageUrl, caption: '', credit: '' }] : [],
      categories: [(p as any).travelCategory || 'attraction'],
      travelTips: [],
      nearbyAirport: null,
      nearbyHotels: [],
      nearbyAttractions: [],
      weatherSummary: null,
      bestSeason: '',
      bestTimeToVisit: '',
      popularity: p.rating || 0,
      rating: p.rating || 0,
      reviewCount: p.reviewCount || 0,
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
    } as Destination)));

    if (rawNearbyPlaces.length > 0) providersUsed.push('openstreetmap_provider');

    const hasNearbyEvents = events.length > 0;
    const rankedTravelPlaces = TravelRankingEngine.rank(travelPlaces, {
      userLocation: location,
      hasNearbyEvents,
    });

    let nearby = CategoryBalancer.balance(rankedTravelPlaces, 3, 20);

    // ── OSM RETRY before degrading to Firestore ─────────────────────────────
    // This is why "some sections render dynamic OSM and some don't": Explore
    // and the AI-discovery pipeline each query OSM independently. If Explore's
    // request hit a transient Overpass 5xx burst, it cached an empty result
    // and degraded to Firestore, while AI discovery (a later, separate query)
    // succeeded. A single bounded retry with cleared caches makes Around
    // You / Trending recover together with the rest of the app.
    if (nearby.length === 0) {
      const osmOutcome = getLastOsmOutcome();
      if (
        osmOutcome.status === 'TIMEOUT' ||
        osmOutcome.status === 'FAILED' ||
        osmOutcome.status === 'SUCCESS_EMPTY'
      ) {
        console.log(`[DiscoveryOrchestrator] 🔁 OSM returned 0 (${osmOutcome.status}) — clearing caches and retrying once before Firestore fallback...`);
        try {
          clearOpenStreetMapCache();
          ProviderDataCoordinator.clearCaches();
          const retry = await withTimeoutFallback(
            ProviderDataCoordinator.getOpenStreetMap(lat, lng, radiusKm),
            30_000,
            'budget:nearby-retry',
            { places: [], provider: 'openstreetmap' as const, fetchedAt: Date.now() }
          );
          if (retry.places.length > 0) {
            const retryTravel = TravelClassifier.filterTravelRelevant(
              this.mergeNearbyPlaces(retry.places)
            );
            const retryRanked = TravelRankingEngine.rank(retryTravel, { userLocation: { lat, lng } });
            nearby = CategoryBalancer.balance(retryRanked, 3, 20);
            console.log(`[DiscoveryOrchestrator] ✅ OSM retry recovered ${nearby.length} dynamic places`);
          }
        } catch (retryErr) {
          console.warn('[DiscoveryOrchestrator] OSM retry failed:', retryErr);
        }
      }
    }

    // ── Nearby Firestore fallback if live APIs returned insufficient ──────────
    if (nearby.length < MIN_NEARBY_REQUIRED) {
      console.log(`[DiscoveryOrchestrator] ⚠ Nearby: live APIs returned ${nearby.length} places. Minimum required = ${MIN_NEARBY_REQUIRED}. Using Firestore fallback...`);

      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: MIN_NEARBY_REQUIRED - nearby.length + 5,
        });

        const existingIds = new Set(nearby.map(n => n.id));
        // GEOGRAPHIC GATE — same rule as getNearby(): the Firestore
        // `destinations` collection is GLOBAL editorial content (Dubai,
        // Barcelona, Sydney…). Those must never appear in "Around You" at
        // 999km just to satisfy a count — that is exactly the bug where the
        // section rendered fallback cities instead of dynamic OSM data.
        const NEARBY_FALLBACK_MAX_KM = Math.max(radiusKm, 50) + 25;
        let excludedCount = 0;
        for (const dest of firestoreResult.data) {
          if (existingIds.has(dest.id) || nearby.length >= MIN_NEARBY_REQUIRED) continue;

          // Safely determine coordinates - handle case where coordinates may be undefined or null
          let coords: DestinationCoordinates = { lat: 0, lng: 0 };
          let hasValidCoords = false;
          if (dest.coordinates && typeof dest.coordinates === 'object') {
            const c = dest.coordinates as any;
            if (typeof c.lat === 'number' && typeof c.lng === 'number') {
              coords = { lat: c.lat, lng: c.lng };
              hasValidCoords = true;
            }
          }

          const distance = hasValidCoords ? this.haversineDistance(location, coords) : 999;

          if (!hasValidCoords || distance > NEARBY_FALLBACK_MAX_KM) {
            excludedCount++;
            continue;
          }

          nearby.push({
            id: dest.id,
            name: dest.name,
            type: 'attraction',
            description: dest.description || '',
            imageUrl: dest.images?.[0]?.url || '',
            coordinates: coords,
            distance: Math.round(distance * 100) / 100,
            rating: dest.rating || 0,
            reviewCount: dest.reviewCount || 0,
            priceLevel: 1,
            openingHours: '',
            phone: '',
            website: '',
            tags: dest.categories,
            destinationId: dest.id,
            isOpen: true,
          } as NearbyItem);
          existingIds.add(dest.id);
        }
        
        if (firestoreResult.data.length > 0) {
          firestoreUsed = true;
          providersUsed.push('firestore_nearby_fallback');
          console.log(`[DiscoveryOrchestrator] 🔥 Nearby Firestore fallback: ${nearby.length} total places (${excludedCount} global/out-of-radius records correctly excluded)`);
        }
      } catch (err) {
        console.warn('[DiscoveryOrchestrator] Firestore nearby fallback failed:', err);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 4: PIPELINE SUMMARY
    // ────────────────────────────────────────────────────────────────────────

    console.log('[DiscoveryOrchestrator] ═══════════════════════════════════════');
    console.log('[DiscoveryOrchestrator] 📊 PIPELINE SUMMARY:');
    console.log('[DiscoveryOrchestrator] ═══════════════════════════════════════');
    console.log(`[DiscoveryOrchestrator] Nearby (OSM+Curated): ${rawNearbyPlaces.length} candidates`);
    console.log(`[DiscoveryOrchestrator] Combined: ${allRawPlaces.length}`);
    console.log(`[DiscoveryOrchestrator] TravelClassifier: ${allRawPlaces.length} → ${travelPlaces.length}`);
    console.log(`[DiscoveryOrchestrator] TravelRanking: ${travelPlaces.length} scored`);
    console.log(`[DiscoveryOrchestrator] CategoryBalancer: selected ${nearby.length}`);
    console.log(`[DiscoveryOrchestrator] ---`);
    console.log(`[DiscoveryOrchestrator] Trending:`);
    console.log(`  Google: ${trendingSourceBreakdown.google}`);
    console.log(`  OSM: ${trendingSourceBreakdown.osm}`);
    console.log(`  Firestore: ${trendingSourceBreakdown.firestore}`);
    if (trendingResult.status === 'fulfilled' && trendingResult.value.firestoreReason) {
      console.log(`  ⚠ Firestore reason: ${trendingResult.value.firestoreReason}`);
    }
    console.log(`[DiscoveryOrchestrator] Popular (Global): ${popular.length} destinations`);
    if (popularSourceBreakdown.firestore > 0) {
      console.log(`[DiscoveryOrchestrator]   🔥 SOURCE: Firestore (${popular.length} destinations)`);
    } else {
      console.log(`[DiscoveryOrchestrator]   SOURCE: Live APIs (${popularRegions} regions)`);
    }
    console.log(`[DiscoveryOrchestrator] Events (Ticketmaster): ${events.length}`);
    console.log(`[DiscoveryOrchestrator] Weekend Escapes: ${weekendEscapes.length}`);
    if (weekendSource === 'firestore') {
      console.log(`[DiscoveryOrchestrator]   🔥 SOURCE: Firestore`);
    } else {
      console.log(`[DiscoveryOrchestrator]   SOURCE: Live APIs (${weekendCandidates} candidates)`);
    }
    console.log(`[DiscoveryOrchestrator] Journey Feed: ${journeyFeed.length}`);
    console.log(`[DiscoveryOrchestrator] ---`);
    console.log(`[DiscoveryOrchestrator] Service providers: ${providersUsed.join(', ')}`);
    if (firestoreUsed) {
      console.log(`[DiscoveryOrchestrator] 🔥 FIRESTORE: USED AS FALLBACK for one or more sections`);
    } else {
      console.log(`[DiscoveryOrchestrator] 🔥 FIRESTORE: NOT USED (all data from live APIs)`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 5: Real images for destinations missing one (BOUNDED AWAIT)
    // ────────────────────────────────────────────────────────────────────────

    // MUST be awaited (bounded): enrichment mutates the destination objects in
    // place, but the section loaders snapshot these arrays into React state
    // immediately after discover() returns. Fire-and-forget mutation therefore
    // NEVER re-renders — which is why Around You / Weekend / Popular cards
    // appeared without images even though enrichment eventually succeeded.
    // Awaiting a bounded 7s pass guarantees resolved images are present in the
    // state that gets rendered. (Concurrency-limited pool + in-memory and
    // 30-day AsyncStorage cache keep repeat loads at 0ms.)
    await withTimeoutFallback(
      enrichExploreSections({ trending, popular, weekendEscapes, nearby }),
      15_000,
      'destination-image-enrich',
      undefined
    ).catch(() => undefined);

    // RE-CACHE after enrichment: the pre-enrichment snapshot (STEP 2) had
    // empty images, so opening a detail screen showed no photos even though
    // the card had one. The cache now carries the resolved image URLs —
    // images persist from card → detail for dynamic OSM data (nearby,
    // trending, popular and weekend escapes alike).
    const enrichedForCache: Destination[] = [
      ...nearby.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.name.toLowerCase().replace(/\s+/g, '-'),
        description: p.description || '',
        country: '',
        countryCode: '',
        city: '',
        coordinates: p.coordinates,
        images: p.imageUrl ? [{ url: p.imageUrl, caption: '', credit: '' }] : [],
        // Rich category set so CategoryScreen slug matching finds dynamic
        // OSM places (travelCategory + type + travelTags).
        categories: Array.from(new Set([
          (p as any).travelCategory || 'attraction',
          p.type || '',
          ...((p as any).tags || []),
        ].filter(Boolean))),
        travelTips: [],
        nearbyAirport: null,
        nearbyHotels: [],
        nearbyAttractions: [],
        weatherSummary: null,
        bestSeason: '',
        bestTimeToVisit: '',
        popularity: p.rating || 0,
        rating: p.rating || 0,
        reviewCount: p.reviewCount || 0,
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
      } as Destination)),
      ...trending,
      ...popular,
      ...weekendEscapes.map((e) => e.destination).filter(Boolean),
    ];
    DestinationCache.setMany(enrichedForCache);

    // ────────────────────────────────────────────────────────────────────────
    // STEP 6: Gemini ranking (optional enrichment — NON-BLOCKING)
    // ────────────────────────────────────────────────────────────────────────

    // Fire Gemini enrichment in the background; NEVER block the critical path.
    // The UI renders with basic deterministic ranking immediately.
    let rankedResult = { categories, trending, popular, events, nearby, weekendEscapes, journeyFeed };
    
    GeminiRankingService.rankDiscoveries({
      categories,
      trending,
      popular,
      events,
      nearby,
      weekendEscapes,
      journeyFeed,
      userLocation: location,
    }).then((result) => {
      console.log('[DiscoveryOrchestrator] ✅ Gemini enrichment completed in background');
      // Store enriched result for consumers to read later
      DiscoveryOrchestrator.lastRankedResult = result;
    }).catch((err) => {
      console.warn('[DiscoveryOrchestrator] Gemini enrichment failed (non-blocking):', err);
    });

    logDiscoveryHealth({
      locationAvailable: true,
      lat,
      lng,
      nearbyCount: rawNearbyPlaces.length,
      trendingCount: trending.length,
      popularCount: popular.length,
      eventCount: events.length,
      weekendCount: weekendEscapes.length,
      feedCount: journeyFeed.length,
      categoryCount: categories.length,
      providersUsed,
      firestoreUsed,
      duplicateRequestsPrevented: discoveryMetrics.duplicatesPrevented,
    });

    return {
      categories: rankedResult.categories,
      trending: rankedResult.trending,
      popular: rankedResult.popular,
      events: rankedResult.events,
      nearby: rankedResult.nearby,
      weekendEscapes: rankedResult.weekendEscapes,
      journeyFeed: rankedResult.journeyFeed,
      computedAt: Date.now(),
      providersUsed,
    };
  },

  /* ── Last Ranked Result (from background Gemini) ───────────────────────────── */
  lastRankedResult: null as any,
  
  getLastRankedResult() {
    return this.lastRankedResult;
  },

  /**
   * Merge nearby places from multiple providers.
   */
  mergeNearbyPlaces(...placeArrays: NearbyItem[][]): NearbyItem[] {
    const merged = new Map<string, NearbyItem>();
    for (const places of placeArrays) {
      for (const place of places) {
        const key = `${place.name.toLowerCase()}_${place.coordinates.lat.toFixed(3)}_${place.coordinates.lng.toFixed(3)}`;
        if (!merged.has(key)) {
          merged.set(key, place);
        } else {
          const existing = merged.get(key)!;
          if ((place.rating || 0) > (existing.rating || 0)) {
            merged.set(key, place);
          }
        }
      }
    }
    return Array.from(merged.values());
  },

  /**
   * Calculate Haversine distance between two coordinates in km.
   */
  haversineDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
    const R = 6371;
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  toRad(deg: number): number {
    return deg * (Math.PI / 180);
  },

  /**
   * Get only the "Around You" section data (travel-filtered).
   */
  async getNearby(lat: number, lng: number, radiusKm: number = 25): Promise<NearbyItem[]> {
    // OSM-first: the coordinator aggregates OSM + Firestore curated (+ optional
    // Google enrichment when explicitly enabled). No direct Places request.
    const nearby = await ProviderDataCoordinator.getOpenStreetMap(lat, lng, radiusKm);

    const travelFiltered = TravelClassifier.filterTravelRelevant(nearby.places);
    const ranked = TravelRankingEngine.rank(travelFiltered, { userLocation: { lat, lng } });
    let results = CategoryBalancer.balance(ranked, 3, 20);

    // Firestore fallback for getNearby
    if (results.length < MIN_NEARBY_REQUIRED) {
      console.log(`[DiscoveryOrchestrator.getNearby] ⚠ Live providers returned ${results.length} places. Using Firestore fallback...`);
      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: MIN_NEARBY_REQUIRED - results.length + 5,
        });
        const existingIds = new Set(results.map(n => n.id));
        let excludedCount = 0;
        for (const dest of firestoreResult.data) {
          if (existingIds.has(dest.id) || results.length >= MIN_NEARBY_REQUIRED) continue;
          
          // Safely determine coordinates
          let coords: DestinationCoordinates = { lat: 0, lng: 0 };
          let hasValidCoords = false;
          if (dest.coordinates && typeof dest.coordinates === 'object') {
            const c = dest.coordinates as any;
            if (typeof c.lat === 'number' && typeof c.lng === 'number') {
              coords = { lat: c.lat, lng: c.lng };
              hasValidCoords = true;
            }
          }
          
          const distance = hasValidCoords ? this.haversineDistance({ lat, lng }, coords) : 999;

          // GEOGRAPHIC GATE — the Firestore `destinations` collection contains
          // GLOBAL editorial destinations (Dubai, Paris, Tokyo, ...). Those are
          // NOT "Nearby" for a user in Kampala and must never be injected into
          // the Around You section just to satisfy a count. Only accept
          // fallback records that are actually within a Nearby radius
          // (userRadius + a small margin). Honest empty > dishonest global.
          const NEARBY_FALLBACK_MAX_KM = Math.max(radiusKm, 50) + 25;
          if (!hasValidCoords || distance > NEARBY_FALLBACK_MAX_KM) {
            excludedCount += 1;
            continue;
          }

          results.push({
            id: dest.id,
            name: dest.name,
            type: 'attraction',
            description: dest.description || '',
            imageUrl: dest.images?.[0]?.url || '',
            coordinates: coords,
            distance: Math.round(distance * 100) / 100,
            rating: dest.rating || 0,
            reviewCount: dest.reviewCount || 0,
            priceLevel: 1,
            openingHours: '',
            phone: '',
            website: '',
            tags: dest.categories,
            destinationId: dest.id,
            isOpen: true,
          } as NearbyItem);
          existingIds.add(dest.id);
        }
        console.log(`[DiscoveryOrchestrator.getNearby] 🔥 Firestore fallback: ${results.length} total places (${excludedCount} global/out-of-radius records correctly excluded from Nearby)`);
      } catch (err) {
        console.warn('[DiscoveryOrchestrator.getNearby] Firestore fallback failed:', err);
      }
    }

    // Fill real images for any NearbyItems that lack one. MUST be awaited
    // (bounded): fire-and-forget in-place mutation never re-renders the
    // "Around You" cards (same defect as enrichExploreSections).
    await withTimeoutFallback(
      enrichNearbyItems(results),
      10_000,
      'getNearby-image-enrich',
      results
    ).catch(() => undefined);

    // Provider attribution — makes it impossible for Firestore fallback to
    // silently mask a dead OSM pipeline during debugging/verification.
    const attribution = results.reduce<Record<string, number>>((acc, n) => {
      const src = typeof n.id === 'string' && n.id.startsWith('tics:openstreetmap')
        ? 'osm'
        : typeof n.id === 'string' && n.id.startsWith('tics:')
          ? (n.id.split(':')[1] ?? 'other')
          : 'firestore';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});
    console.log('[ExplorePipeline] provider attribution:', JSON.stringify(attribution));

    return results;
  },
};