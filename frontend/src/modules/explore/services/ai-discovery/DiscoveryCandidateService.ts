/**
 * DiscoveryCandidateService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gathers verified candidate data from all available providers.
 * This is the "real data" layer - Gemini never invents places.
 *
 * Pipeline:
 *   GPS location
 *   → PlacesProvider (Google Places)
 *   → OpenStreetMapProvider (Overpass)
 *   → EventsProvider (Ticketmaster)
 *   → TrendingEngine
 *   → WeekendEscapeIntelligence
 *   → Firestore destinations
 *   → Merged, deduplicated, classified candidates
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PlacesProvider } from '@/src/modules/explore/services/discovery/PlacesProvider';
import { OpenStreetMapProvider } from '@/src/modules/explore/services/discovery/OpenStreetMapProvider';
import { EventsProvider } from '@/src/modules/explore/services/discovery/EventsProvider';
import { TrendingEngine } from '@/src/modules/explore/services/discovery/TrendingEngine';
import { WeekendEscapeIntelligence } from '@/src/modules/explore/services/discovery/WeekendEscapeIntelligence';
import { TravelClassifier } from '@/src/modules/explore/services/discovery/TravelClassifier';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import { withTimeoutFallback, PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';
import type {
  DestinationCoordinates,
  Destination,
  Event,
  NearbyItem,
  WeekendEscape,
} from '@/src/modules/explore/types';
import type { DiscoveryCandidate, DiscoveryCandidateType } from './types';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const DEFAULT_RADIUS_KM = 100;
const MAX_CANDIDATES = 60;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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

/**
 * Map a NearbyItem type to a DiscoveryCandidateType.
 */
function mapNearbyTypeToCandidateType(type: string): DiscoveryCandidateType {
  const map: Record<string, DiscoveryCandidateType> = {
    museum: 'museum',
    restaurant: 'restaurant',
    park: 'park',
    beach: 'beach',
    attraction: 'attraction',
    landmark: 'attraction',
    historical_site: 'cultural',
    theater: 'cultural',
    festival: 'event',
    event: 'event',
    hotel: 'attraction',
    airport: 'attraction',
    mall: 'attraction',
    sports_venue: 'adventure',
    nightlife: 'nightlife',
  };
  return map[type] || 'attraction';
}

/**
 * Map a travel category to a DiscoveryCandidateType.
 */
function mapTravelCategoryToType(category: string): DiscoveryCandidateType {
  const lower = (category || '').toLowerCase();
  if (lower.includes('beach')) return 'beach';
  if (lower.includes('museum') || lower.includes('art')) return 'museum';
  if (lower.includes('park') || lower.includes('nature') || lower.includes('garden')) return 'park';
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('cafe')) return 'restaurant';
  if (lower.includes('adventure') || lower.includes('hiking') || lower.includes('camp')) return 'adventure';
  if (lower.includes('cultural') || lower.includes('historic') || lower.includes('heritage')) return 'cultural';
  if (lower.includes('nightlife') || lower.includes('bar') || lower.includes('club')) return 'nightlife';
  if (lower.includes('family') || lower.includes('amusement') || lower.includes('zoo')) return 'family';
  if (lower.includes('romantic') || lower.includes('honeymoon')) return 'romantic';
  if (lower.includes('hidden') || lower.includes('gem')) return 'hidden_gem';
  return 'attraction';
}

/**
 * Convert a NearbyItem to a DiscoveryCandidate.
 */
function nearbyToCandidate(item: NearbyItem, source: DiscoveryCandidate['source']): DiscoveryCandidate {
  const travelCategory = (item as any).travelCategory || '';
  const travelTags = (item as any).travelTags || [];
  const type = travelCategory
    ? mapTravelCategoryToType(travelCategory)
    : mapNearbyTypeToCandidateType(item.type);

  return {
    id: item.id,
    title: item.name,
    type,
    category: travelCategory || item.type,
    description: item.description || '',
    imageUrl: item.imageUrl || undefined,
    coordinates: item.coordinates,
    distanceKm: item.distance,
    rating: item.rating || undefined,
    reviewCount: item.reviewCount || undefined,
    popularity: item.rating ? Math.round(item.rating * 20) : undefined,
    priceLevel: item.priceLevel || undefined,
    tags: [...(item.tags || []), ...travelTags],
    source,
    destinationId: item.destinationId || undefined,
    nearbyItem: item,
    travelCategory: travelCategory || undefined,
    travelTags: travelTags.length > 0 ? travelTags : undefined,
    isOpen: item.isOpen,
  };
}

/**
 * Convert a Destination to a DiscoveryCandidate.
 */
function destinationToCandidate(dest: Destination, userLocation?: DestinationCoordinates): DiscoveryCandidate {
  const distance = userLocation && dest.coordinates
    ? haversineDistance(userLocation, dest.coordinates)
    : undefined;

  const categories = dest.categories || [];
  const type = categories.length > 0
    ? mapTravelCategoryToType(categories[0])
    : 'destination';

  return {
    id: `dest_${dest.id}`,
    title: dest.name,
    type,
    category: categories[0] || 'destination',
    description: dest.description || '',
    imageUrl: dest.images?.[0]?.url || undefined,
    coordinates: dest.coordinates,
    distanceKm: distance !== undefined ? Math.round(distance * 100) / 100 : undefined,
    rating: dest.rating || undefined,
    reviewCount: dest.reviewCount || undefined,
    popularity: dest.popularity || undefined,
    priceLevel: undefined,
    tags: categories,
    source: 'firestore',
    destinationId: dest.id,
    destination: dest,
    travelCategory: categories[0] || undefined,
    travelTags: categories,
    bestTimeToVisit: dest.bestTimeToVisit || undefined,
    estimatedBudget: dest.estimatedBudget || undefined,
    topAttractions: dest.topAttractions || undefined,
  };
}

/**
 * Convert an Event to a DiscoveryCandidate.
 */
function eventToCandidate(event: Event, userLocation?: DestinationCoordinates): DiscoveryCandidate {
  const distance = userLocation && event.coordinates
    ? haversineDistance(userLocation, event.coordinates)
    : undefined;

  const type = mapTravelCategoryToType(event.category);

  return {
    id: `event_${event.id}`,
    title: event.title,
    type: 'event',
    category: event.category || 'event',
    description: event.description || event.shortDescription || '',
    imageUrl: event.images?.[0]?.url || undefined,
    coordinates: event.coordinates,
    distanceKm: distance !== undefined ? Math.round(distance * 100) / 100 : undefined,
    rating: event.rating || undefined,
    popularity: event.popularity || undefined,
    priceLevel: undefined,
    tags: event.tags || [],
    source: 'ticketmaster',
    eventId: event.id,
    startDate: event.startDate ? event.startDate.toISOString() : undefined,
    endDate: event.endDate ? event.endDate.toISOString() : undefined,
    event,
    travelCategory: event.category || undefined,
    travelTags: event.tags || [],
  };
}

/**
 * Convert a WeekendEscape to a DiscoveryCandidate.
 */
function weekendEscapeToCandidate(escape: WeekendEscape, userLocation?: DestinationCoordinates): DiscoveryCandidate {
  const dest = escape.destination;
  const distance = userLocation && dest?.coordinates
    ? haversineDistance(userLocation, dest.coordinates)
    : escape.distance;

  return {
    id: `escape_${escape.id}`,
    title: dest?.name || 'Weekend Escape',
    type: 'weekend_escape',
    category: escape.type || 'weekend_escape',
    description: dest?.description || escape.reason || '',
    imageUrl: dest?.images?.[0]?.url || undefined,
    coordinates: dest?.coordinates,
    distanceKm: distance !== undefined ? Math.round(distance * 100) / 100 : undefined,
    rating: dest?.rating || undefined,
    popularity: dest?.popularity || undefined,
    priceLevel: undefined,
    tags: dest?.categories || [],
    source: 'weekend_engine',
    destinationId: dest?.id,
    destination: dest,
    weekendEscape: escape,
    travelCategory: escape.type || undefined,
    travelTags: dest?.categories || [],
    bestTimeToVisit: dest?.bestTimeToVisit || undefined,
  };
}

/* ── DiscoveryCandidateService ──────────────────────────────────────────────── */

export const DiscoveryCandidateService = {
  /**
   * Gather all candidate data from all available providers.
   * Never throws - each provider failure degrades gracefully.
   */
  async gatherCandidates(options: {
    location?: DestinationCoordinates;
    radiusKm?: number;
    userId?: string;
  } = {}): Promise<{
    candidates: DiscoveryCandidate[];
    providersUsed: string[];
    errors: string[];
  }> {
    const { location, radiusKm = DEFAULT_RADIUS_KM, userId } = options;
    const providersUsed: string[] = [];
    const errors: string[] = [];

    // Use default coordinates ONLY when no location was supplied — and log the
    // provenance so a hardcoded fallback can never be mistaken for device GPS.
    const hasProvidedLocation =
      typeof location?.lat === 'number' && typeof location?.lng === 'number';
    const lat = location?.lat ?? 0.3476;
    const lng = location?.lng ?? 32.5825;
    console.log(
      `[LOCATION TRACE]\nsource: ${hasProvidedLocation ? 'caller (validated session GPS)' : 'HARDCODED FALLBACK (no location provided)'}\nlatitude: ${lat}\nlongitude: ${lng}\ntimestamp: ${new Date().toISOString()}\nconsumer: DiscoveryCandidateService`
    );
    const userLocation: DestinationCoordinates = { lat, lng };

    // ── Fetch all providers in parallel ────────────────────────────────────
    const [
      placesResult,
      osmResult,
      eventsResult,
      trendingResult,
      weekendResult,
      firestoreResult,
    ] = await Promise.allSettled([
      // Google Places
      withTimeoutFallback(
        PlacesProvider.getNearbyPlaces(lat, lng, radiusKm),
        PROVIDER_TIMEOUTS.GOOGLE_PLACES,
        'places',
        { places: [], provider: 'google_places' as const, fetchedAt: Date.now() }
      ),
      // OpenStreetMap
      withTimeoutFallback(
        OpenStreetMapProvider.getNearbyPlaces(lat, lng, radiusKm),
        PROVIDER_TIMEOUTS.OPEN_STREET_MAP,
        'osm',
        { places: [], provider: 'openstreetmap' as const, fetchedAt: Date.now() }
      ),
      // Events
      withTimeoutFallback(
        EventsProvider.getEvents(lat, lng, radiusKm),
        PROVIDER_TIMEOUTS.TICKETMASTER,
        'events',
        { events: [], provider: 'ticketmaster' as const, fetchedAt: Date.now() }
      ),
      // Trending
      withTimeoutFallback(
        TrendingEngine.getTrendingDestinations(lat, lng),
        PROVIDER_TIMEOUTS.GOOGLE_PLACES,
        'trending',
        {
          destinations: [],
          sourceBreakdown: { google: 0, osm: 0, firestore: 0 },
          computedAt: Date.now(),
          firestoreReason: '',
        }
      ),
      // Weekend escapes
      withTimeoutFallback(
        WeekendEscapeIntelligence.discoverEscapes(lat, lng, 250),
        PROVIDER_TIMEOUTS.GOOGLE_PLACES,
        'weekend',
        { escapes: [], candidates: 0, selected: 0, source: 'firestore' as const, firestoreReason: '' }
      ),
      // Firestore destinations
      withTimeoutFallback(
        ExploreService.loadDestinations({ pageSize: 30 }),
        PROVIDER_TIMEOUTS.FIRESTORE,
        'firestore',
        { data: [], total: 0, hasMore: false, lastCursor: null }
      ),
    ]);

    const candidates: DiscoveryCandidate[] = [];
    const seenIds = new Set<string>();

    // ── Google Places ──────────────────────────────────────────────────────
    if (placesResult.status === 'fulfilled') {
      const places = placesResult.value.places || [];
      if (places.length > 0) {
        providersUsed.push('google_places');
        // Filter travel-relevant places
        const travelPlaces = TravelClassifier.filterTravelRelevant(places);
        for (const place of travelPlaces) {
          const candidate = nearbyToCandidate(place, 'google_places');
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('Google Places unavailable');
    }

    // ── OpenStreetMap ──────────────────────────────────────────────────────
    if (osmResult.status === 'fulfilled') {
      const places = osmResult.value.places || [];
      if (places.length > 0) {
        providersUsed.push('openstreetmap');
        const travelPlaces = TravelClassifier.filterTravelRelevant(places);
        for (const place of travelPlaces) {
          const candidate = nearbyToCandidate(place, 'openstreetmap');
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('OpenStreetMap unavailable');
    }

    // ── Events ─────────────────────────────────────────────────────────────
    if (eventsResult.status === 'fulfilled') {
      const events = eventsResult.value.events || [];
      if (events.length > 0) {
        providersUsed.push('ticketmaster');
        // Filter out expired events
        const now = Date.now();
        const upcomingEvents = events.filter((e: Event) => {
          const endTime = e.endDate ? e.endDate.getTime() : e.startDate.getTime();
          return endTime > now;
        });
        for (const event of upcomingEvents.slice(0, 15)) {
          const candidate = eventToCandidate(event, userLocation);
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('Events unavailable');
    }

    // ── Trending ───────────────────────────────────────────────────────────
    if (trendingResult.status === 'fulfilled') {
      const destinations = trendingResult.value.destinations || [];
      if (destinations.length > 0) {
        providersUsed.push('trending_engine');
        for (const dest of destinations.slice(0, 10)) {
          const candidate = destinationToCandidate(dest, userLocation);
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('Trending unavailable');
    }

    // ── Weekend escapes ────────────────────────────────────────────────────
    if (weekendResult.status === 'fulfilled') {
      const escapes = weekendResult.value.escapes || [];
      if (escapes.length > 0) {
        providersUsed.push('weekend_engine');
        for (const escape of escapes.slice(0, 10)) {
          const candidate = weekendEscapeToCandidate(escape, userLocation);
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('Weekend escapes unavailable');
    }

    // ── Firestore destinations ─────────────────────────────────────────────
    if (firestoreResult.status === 'fulfilled') {
      const destinations = firestoreResult.value.data || [];
      if (destinations.length > 0) {
        providersUsed.push('firestore');
        for (const dest of destinations.slice(0, 15)) {
          const candidate = destinationToCandidate(dest, userLocation);
          if (!seenIds.has(candidate.id)) {
            seenIds.add(candidate.id);
            candidates.push(candidate);
          }
        }
      }
    } else {
      errors.push('Firestore unavailable');
    }

    // ── Deduplicate by title + coordinates ─────────────────────────────────
    const deduped: DiscoveryCandidate[] = [];
    const seenKeys = new Set<string>();
    for (const candidate of candidates) {
      const key = candidate.coordinates
        ? `${candidate.title.toLowerCase()}_${candidate.coordinates.lat.toFixed(2)}_${candidate.coordinates.lng.toFixed(2)}`
        : candidate.title.toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduped.push(candidate);
      }
    }

    // Sort by distance (if available) then rating
    deduped.sort((a, b) => {
      if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
        return a.distanceKm - b.distanceKm;
      }
      return (b.rating || 0) - (a.rating || 0);
    });

    console.log(`[DiscoveryCandidateService] Gathered ${deduped.length} candidates from ${providersUsed.join(', ')}`);
    if (errors.length > 0) {
      console.warn(`[DiscoveryCandidateService] Provider errors: ${errors.join(', ')}`);
    }

    return {
      candidates: deduped.slice(0, MAX_CANDIDATES),
      providersUsed,
      errors,
    };
  },

  /**
   * Get candidates for a specific destination (for trip-aware discovery).
   */
  async getCandidatesForDestination(
    destination: { name?: string; coordinates?: DestinationCoordinates },
    options: { radiusKm?: number } = {}
  ): Promise<DiscoveryCandidate[]> {
    if (!destination.coordinates) return [];
    const result = await this.gatherCandidates({
      location: destination.coordinates,
      radiusKm: options.radiusKm || 50,
    });
    return result.candidates;
  },

  /**
   * Get candidates for a specific category.
   */
  filterByCategory(candidates: DiscoveryCandidate[], category: string): DiscoveryCandidate[] {
    const lower = category.toLowerCase();
    return candidates.filter((c) =>
      c.category.toLowerCase().includes(lower) ||
      c.tags.some((t) => t.toLowerCase().includes(lower)) ||
      c.type === category
    );
  },

  /**
   * Get candidates within a distance threshold.
   */
  filterByDistance(candidates: DiscoveryCandidate[], maxKm: number): DiscoveryCandidate[] {
    return candidates.filter((c) => c.distanceKm === undefined || c.distanceKm <= maxKm);
  },

  /**
   * Get candidates outside a distance threshold (for regional/international).
   */
  filterByMinDistance(candidates: DiscoveryCandidate[], minKm: number): DiscoveryCandidate[] {
    return candidates.filter((c) => c.distanceKm === undefined || c.distanceKm >= minKm);
  },
};