/**
 * SearchService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Search service for the Explore module. Combines Google Places autocomplete
 * with Firestore data for comprehensive, ranked search results.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import {
  FIRESTORE_COLLECTIONS,
  SEARCH_CONFIG,
  PAGINATION,
} from '@/src/modules/explore/constants';
import type {
  SearchResult,
  SearchResultType,
  SearchSuggestion,
} from '@/src/modules/explore/types';
import { DestinationAggregator } from './discovery/DestinationAggregator';
import { enrichNearbyItems } from './discovery/DestinationImageService';
import { withTimeoutFallback } from '../utils/withTimeout';
import { googlePlacesAvailable } from './discovery/providers/config';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
  rating?: number;
  price_level?: number;
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
}

interface GooglePlacesResponse {
  predictions?: Array<{
    place_id: string;
    description: string;
    structured_formatting: {
      main_text: string;
      secondary_text: string;
    };
    types: string[];
  }>;
  results?: GooglePlaceResult[];
  status: string;
  error_message?: string;
}

/* ── API Key ────────────────────────────────────────────────────────────────── */

function getGooglePlacesApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn('[SearchService] Google Places API key not configured');
  }
  return key || '';
}

/* ── Type Mapping ───────────────────────────────────────────────────────────── */

function mapGooglePlaceType(types: string[]): SearchResultType {
  const typeMap: Record<string, SearchResultType> = {
    country: 'country',
    locality: 'city',
    administrative_area_level_1: 'city',
    administrative_area_level_2: 'city',
    lodging: 'hotel',
    airport: 'airport',
    museum: 'museum',
    park: 'park',
    restaurant: 'restaurant',
    tourist_attraction: 'landmark',
    point_of_interest: 'landmark',
    establishment: 'destination',
    night_club: 'landmark',
    shopping_mall: 'landmark',
    stadium: 'sports_venue',
    gym: 'landmark',
    spa: 'landmark',
    church: 'landmark',
    mosque: 'landmark',
    temple: 'landmark',
    synagogue: 'landmark',
    art_gallery: 'museum',
    bar: 'restaurant',
    cafe: 'restaurant',
    food: 'restaurant',
    bus_station: 'landmark',
    train_station: 'landmark',
    subway_station: 'landmark',
    transit_station: 'landmark',
  };

  for (const type of types) {
    if (typeMap[type]) return typeMap[type];
  }
  return 'destination';
}

/* ── Google Places API ──────────────────────────────────────────────────────── */

/**
 * Fetch autocomplete suggestions from Google Places API.
 */
async function fetchGoogleAutocomplete(
  input: string,
  sessionToken?: string
): Promise<SearchSuggestion[]> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey || input.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) return [];

  try {
    const types = SEARCH_CONFIG.GOOGLE_PLACES_TYPES.join('|');
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&types=establishment&components=country:${types}&key=${apiKey}${
      sessionToken ? `&sessiontoken=${sessionToken}` : ''
    }`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept-Language': 'en' },
    });

    if (!response.ok) {
      console.warn('[SearchService] Google Places autocomplete HTTP error:', response.status);
      return [];
    }

    const data: GooglePlacesResponse = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[SearchService] Google Places autocomplete error:', data.status, data.error_message);
      return [];
    }

    if (!data.predictions?.length) return [];

    return data.predictions.slice(0, PAGINATION.AUTOCOMPLETE_LIMIT).map((p) => ({
      id: p.place_id,
      text: p.structured_formatting.main_text,
      type: mapGooglePlaceType(p.types),
      subtext: p.structured_formatting.secondary_text,
      icon: getIconForType(mapGooglePlaceType(p.types)),
    }));
  } catch (err) {
    console.error('[SearchService] Google autocomplete error:', err);
    return [];
  }
}

/**
 * Perform a nearby search using Google Places API.
 */
async function fetchGoogleNearbySearch(options: {
  lat: number;
  lng: number;
  radius: number;
  type?: string;
}): Promise<GooglePlaceResult[]> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return [];

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${options.lat},${options.lng}&radius=${options.radius}${
      options.type ? `&type=${options.type}` : ''
    }&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data: GooglePlacesResponse = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

    return data.results || [];
  } catch (err) {
    console.error('[SearchService] Google nearby search error:', err);
    return [];
  }
}

/**
 * Fetch place photos from Google Places API.
 */
async function fetchPlacePhoto(
  photoReference: string,
  maxWidth: number = 400
): Promise<string> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return '';

  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${apiKey}`;
}

/* ── OSM / Provider Search (primary destination search) ────────────────────── */

import type { TICSDestination } from './discovery/providers/types';

function mapProviderType(d: TICSDestination): SearchResultType {
  const t = (d.type || '').toLowerCase();
  if (t === 'city' || d.categories?.includes('City')) return 'city';
  if (t === 'country') return 'country';
  if (t === 'museum' || t === 'art_gallery') return 'museum';
  if (t === 'park') return 'park';
  if (['restaurant', 'cafe', 'bar', 'fast_food'].includes(t)) return 'restaurant';
  if (['hotel', 'lodging', 'hostel', 'guest_house'].includes(t)) return 'hotel';
  if (t === 'airport' || t === 'aerodrome') return 'airport';
  if (['castle', 'monument', 'historic_site', 'archaeological_site', 'place_of_worship', 'landmark', 'viewpoint'].includes(t)) return 'landmark';
  return 'destination';
}

/**
 * Destination search across OSM / Wikidata / GeoNames / Firestore.
 * This replaces Google Places textsearch as the primary search source.
 */
async function fetchProviderTextSearch(queryText: string): Promise<SearchResult[]> {
  try {
    const dests = await DestinationAggregator.search(queryText, { limit: 12 });
    return dests.map((d) => ({
      id: d.id,
      type: mapProviderType(d),
      name: d.name,
      description:
        [d.city, d.region, d.country].filter(Boolean).join(', ') ||
        d.description ||
        '',
      imageUrl: d.imageUrl || '',
      country: d.country || '',
      city: d.city || '',
      coordinates: { lat: d.latitude, lng: d.longitude },
      rating: d.rating || 0,
      priceLevel: 0,
      distance: null,
      destinationId: null,
      metadata: { source: d.source },
    }));
  } catch (err) {
    console.warn('[SearchService] Provider text search failed:', err);
    return [];
  }
}

/** Autocomplete suggestions from OSM/Wikidata/GeoNames/Firestore providers. */
async function fetchProviderSuggestions(
  input: string
): Promise<SearchSuggestion[]> {
  try {
    const dests = await DestinationAggregator.search(input, {
      limit: PAGINATION.AUTOCOMPLETE_LIMIT,
    });
    return dests.map((d) => ({
      id: d.id,
      text: d.name,
      type: mapProviderType(d),
      subtext: [d.city, d.country].filter(Boolean).join(', ') || 'Destination',
      icon: getIconForType(mapProviderType(d)),
    }));
  } catch (err) {
    console.warn('[SearchService] Provider suggestions failed:', err);
    return [];
  }
}

/* ── Firestore Search ───────────────────────────────────────────────────────── */

/**
 * Search destinations in Firestore.
 * Uses simple query without composite index requirement.
 */
async function searchFirestoreDestinations(
  queryText: string
): Promise<SearchResult[]> {
  try {
    const db = getFirebaseFirestore();
    const text = queryText.toLowerCase();

    // Use simple query without composite index requirement
    const destRef = collection(db, FIRESTORE_COLLECTIONS.DESTINATIONS);
    const q = query(
      destRef,
      firestoreLimit(PAGINATION.SEARCH_LIMIT * 3)
    );
    const snap = await getDocs(q);

    const results: SearchResult[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const name = (data.name || '').toLowerCase();
      const country = (data.country || '').toLowerCase();
      const city = (data.city || '').toLowerCase();
      const description = (data.description || '').toLowerCase();
      const categories = (data.categories || []).map((c: string) => c.toLowerCase());

      // Simple client-side matching since Firestore doesn't support full-text search
      if (
        name.includes(text) ||
        country.includes(text) ||
        city.includes(text) ||
        description.includes(text) ||
        categories.some((c: string) => c.includes(text))
      ) {
        results.push({
          id: doc.id,
          type: 'destination',
          name: data.name || '',
          description: data.description || '',
          imageUrl: data.images?.[0]?.url || '',
          country: data.country || '',
          city: data.city || '',
          coordinates: data.coordinates || { lat: 0, lng: 0 },
          rating: data.rating || 0,
          priceLevel: data.estimatedBudget?.max ? 3 : 2,
          distance: null,
          destinationId: doc.id,
          metadata: { categories: data.categories || [] },
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[SearchService] Firestore search error:', err);
    return [];
  }
}

/**
 * Search events in Firestore.
 * Uses simple query without composite index requirement.
 */
async function searchFirestoreEvents(
  queryText: string
): Promise<SearchResult[]> {
  try {
    const db = getFirebaseFirestore();
    const text = queryText.toLowerCase();

    const eventRef = collection(db, FIRESTORE_COLLECTIONS.EVENTS);
    const q = query(
      eventRef,
      firestoreLimit(PAGINATION.SEARCH_LIMIT * 3)
    );
    const snap = await getDocs(q);

    const results: SearchResult[] = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      const title = (data.title || '').toLowerCase();
      const description = (data.description || '').toLowerCase();
      const country = (data.country || '').toLowerCase();
      const city = (data.city || '').toLowerCase();
      const category = (data.category || '').toLowerCase();

      if (
        title.includes(text) ||
        description.includes(text) ||
        country.includes(text) ||
        city.includes(text) ||
        category.includes(text)
      ) {
        results.push({
          id: doc.id,
          type: 'event',
          name: data.title || '',
          description: data.shortDescription || data.description || '',
          imageUrl: data.images?.[0]?.url || '',
          country: data.country || '',
          city: data.city || '',
          coordinates: data.coordinates || { lat: 0, lng: 0 },
          rating: data.rating || 0,
          priceLevel: 2,
          distance: null,
          destinationId: data.destinationId || null,
          metadata: { startDate: data.startDate, category: data.category },
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[SearchService] Firestore events search error:', err);
    return [];
  }
}

/* ── Icon Helper ────────────────────────────────────────────────────────────── */

function getIconForType(type: SearchResultType): string {
  const iconMap: Record<SearchResultType, string> = {
    country: 'globe',
    city: 'city',
    hotel: 'bed',
    airport: 'airplane',
    event: 'calendar',
    museum: 'palette',
    park: 'nature',
    restaurant: 'restaurant',
    landmark: 'landmark',
    festival: 'celebration',
    sports_venue: 'sports',
    business_event: 'business',
    destination: 'explore',
  };
  return iconMap[type] || 'search';
}

/* ── Search Ranking ─────────────────────────────────────────────────────────── */

function rankSearchResults(
  results: SearchResult[],
  queryText: string
): SearchResult[] {
  const text = queryText.toLowerCase();

  return results.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // Exact name match gets highest priority
    if (a.name.toLowerCase() === text) scoreA += 100;
    if (b.name.toLowerCase() === text) scoreB += 100;

    // Name starts with query
    if (a.name.toLowerCase().startsWith(text)) scoreA += 50;
    if (b.name.toLowerCase().startsWith(text)) scoreB += 50;

    // Name contains query
    if (a.name.toLowerCase().includes(text)) scoreA += 25;
    if (b.name.toLowerCase().includes(text)) scoreB += 25;

    // Rating boost
    scoreA += (a.rating || 0) * 2;
    scoreB += (b.rating || 0) * 2;

    return scoreB - scoreA;
  });
}

/* ── Public API ─────────────────────────────────────────────────────────────── */

/**
 * Get autocomplete suggestions combining Google Places and Firestore.
 */
async function getAutocompleteSuggestions(
  input: string,
  sessionToken?: string
): Promise<SearchSuggestion[]> {
  if (input.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) return [];

  try {
    // Get Google Places suggestions when enabled; otherwise use OSM providers.
    const googleSuggestions = googlePlacesAvailable()
      ? await fetchGoogleAutocomplete(input, sessionToken)
      : await fetchProviderSuggestions(input);

    // Get Firestore suggestions (destinations and events)
    const destinations = await searchFirestoreDestinations(input);
    const events = await searchFirestoreEvents(input);

    // Convert Firestore results to suggestions
    const firestoreSuggestions: SearchSuggestion[] = [
      ...destinations.map((d) => ({
        id: `dest_${d.id}`,
        text: d.name,
        type: 'destination' as SearchResultType,
        subtext: `${d.city}, ${d.country}`,
        icon: 'destination',
      })),
      ...events.map((e) => ({
        id: `evt_${e.id}`,
        text: e.name,
        type: 'event' as SearchResultType,
        subtext: e.description.substring(0, 50),
        icon: 'event',
      })),
    ];

    // Combine and deduplicate
    const seen = new Set<string>();
    const combined: SearchSuggestion[] = [];

    for (const suggestion of [...googleSuggestions, ...firestoreSuggestions]) {
      const key = `${suggestion.type}_${suggestion.text.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(suggestion);
      }
    }

    return combined.slice(0, PAGINATION.AUTOCOMPLETE_LIMIT * 2);
  } catch (err) {
    console.error('[SearchService] getAutocompleteSuggestions error:', err);
    return [];
  }
}

/**
 * PRIMARY worldwide search — OSM Nominatim (keyless, no billing, built for
 * exactly this). The Overpass global name-regex query in
 * OpenStreetMapProvider.buildSearchQuery scans the entire planet and routinely
 * times out; Nominatim answers in ~200ms for any place on Earth.
 * Requires an identifying User-Agent per Nominatim usage policy.
 */
async function fetchNominatimSearch(queryText: string): Promise<SearchResult[]> {
  const q = queryText.trim();
  if (q.length < 2) return [];
  try {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: '12',
      addressdetails: '1',
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          // Nominatim usage policy requires an identifiable UA; requests
          // without one are commonly blocked.
          'User-Agent': 'TICS/1.0 (React Native; https://tics.app)',
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      place_id: number | string;
      lat: string;
      lon: string;
      name?: string;
      display_name: string;
      type?: string;
      class?: string;
      address?: Record<string, string>;
    }>;

    return rows
      .filter((r) => r.lat && r.lon)
      .map((r) => {
        const a = r.address || {};
        const displayName = r.name || r.display_name.split(',')[0];
        const cls = `${r.class}/${r.type || ''}`;
        return {
          id: `nom_${r.place_id}`,
          type: mapNominatimType(cls),
          name: displayName,
          description: r.display_name,
          imageUrl: '', // enrichment fills this after mapping
          country: a.country || '',
          city: a.city || a.town || a.village || a.county || a.state || '',
          coordinates: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
          rating: 0,
          priceLevel: 0,
          distance: null,
          destinationId: null,
          metadata: { source: 'openstreetmap', nominatimClass: cls },
        } as SearchResult;
      });
  } catch (err) {
    console.warn('[SearchService] Nominatim search failed:', err);
    return [];
  }
}

/** Map a Nominatim class/type to a TICS search result type. */
function mapNominatimType(nominatimClass: string): SearchResult['type'] {
  const t = nominatimClass.toLowerCase();
  if (t.includes('museum') || t.includes('gallery')) return 'museum';
  if (t.includes('park') || t.includes('garden') || t.includes('nature')) return 'park';
  if (t.includes('restaurant') || t.includes('cafe') || t.includes('fast_food') || t.includes('bar') || t.includes('pub')) return 'restaurant';
  if (t.includes('hotel') || t.includes('hostel') || t.includes('guest_house')) return 'hotel';
  // Cities/towns/villages and countries get their own accurate types.
  if (t.includes('city') || t.includes('town') || t.includes('village') || t.includes('country')) return 'city';
  // Historic/monument/attraction/peak/beach etc. all surface as 'landmark'
  // (SearchResultType has no beach/historic_site variants; 'landmark' is the
  // accurate umbrella for sights).
  return 'landmark';
}

/**
 * Perform a full search across Google Places, Firestore destinations, and events.
 */
async function performSearch(
  queryText: string
): Promise<{ destinations: SearchResult[]; events: SearchResult[] }> {
  if (queryText.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
    return { destinations: [], events: [] };
  }

  try {
    const [destinations, events, googleResults, providerResults, nominatimResults] = await Promise.all([
      searchFirestoreDestinations(queryText),
      searchFirestoreEvents(queryText),
      googlePlacesAvailable()
        ? fetchGoogleTextSearch(queryText)
        : Promise.resolve([] as SearchResult[]),
      fetchProviderTextSearch(queryText),
      // PRIMARY: fast, keyless, truly worldwide OSM search.
      fetchNominatimSearch(queryText),
    ]);

    // Nominatim (worldwide OSM) → Overpass name search → Google (optional) →
    // Firestore curated.
    const allDestinations = [...nominatimResults, ...providerResults, ...googleResults, ...destinations];
    const seen = new Set<string>();
    const uniqueDestinations = allDestinations.filter((d) => {
      const key = `${d.type}_${d.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Real photos for the top results via the shared enrichment chain
    // (Wikipedia → Pexels → Openverse). Bounded; results are cached for
    // 30 days so repeat searches are instant.
    await withTimeoutFallback(
      enrichNearbyItems(uniqueDestinations.slice(0, 12) as any),
      6_000,
      'search-image-enrich',
      undefined as any
    ).catch(() => undefined);

    return {
      destinations: rankSearchResults(uniqueDestinations, queryText),
      events: rankSearchResults(events, queryText),
    };
  } catch (err) {
    console.error('[SearchService] performSearch error:', err);
    return { destinations: [], events: [] };
  }
}

/**
 * Fetch text search results from Google Places API.
 */
async function fetchGoogleTextSearch(queryText: string): Promise<SearchResult[]> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return [];

  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryText)}&key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data: GooglePlacesResponse = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

    return (data.results || []).slice(0, 10).map((place) => ({
      id: `gp_${place.place_id}`,
      type: mapGooglePlaceType(place.types),
      name: place.name,
      description: place.formatted_address || '',
      imageUrl: place.photos?.[0]?.photo_reference
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${apiKey}`
        : '',
      country: '',
      city: '',
      coordinates: place.geometry?.location || { lat: 0, lng: 0 },
      rating: place.rating || 0,
      priceLevel: place.price_level || 0,
      distance: null,
      destinationId: null,
      metadata: { source: 'google_places' },
    }));
  } catch (err) {
    console.error('[SearchService] Google text search error:', err);
    return [];
  }
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

export const SearchService = {
  getAutocompleteSuggestions,
  performSearch,
  fetchGoogleAutocomplete,
  fetchGoogleNearbySearch,
  fetchPlacePhoto,
  searchFirestoreDestinations,
  searchFirestoreEvents,
};