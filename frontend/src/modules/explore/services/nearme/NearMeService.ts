/**
 * NearMeService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Service layer for the Near Me module.
 * Handles all Google Places API (New) interactions for Nearby Search,
 * Place Details, Place Photos, and reverse geocoding.
 *
 * Architecture:
 *   NearMeScreen
 *     → useNearby() hook
 *       → NearMeEngine
 *         → NearMeService (Google Places API)
 *
 * The UI NEVER calls Google APIs directly.
 * All API keys are accessed through environment variables only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  GoogleNearbySearchResponse,
  GooglePlaceResult,
  GooglePlaceDetail,
  GooglePlaceDetailsResponse,
  GooglePlaceType,
  NearbyPlace,
  NearMeCategory,
  CATEGORY_TO_PLACE_TYPES,
  NearbyEvent,
} from '@/src/modules/explore/types/nearme';
import type { DestinationCoordinates } from '@/src/modules/explore/types';
import {
  NEARBY_CONFIG,
  TIMEOUTS,
  ERROR_MESSAGES,
} from '@/src/modules/explore/constants';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';

/* ── API Key ──────────────────────────────────────────────────────────────── */

function getGooglePlacesApiKey(): string {
  const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn('[NearMeService] Google Places API key not configured');
  }
  return key || '';
}

/* ── Google Places API Helpers ────────────────────────────────────────────── */

/**
 * Build the base URL for Google Places Nearby Search.
 */
function buildNearbySearchUrl(
  lat: number,
  lng: number,
  radius: number,
  includedTypes?: GooglePlaceType[],
  pageToken?: string
): string {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return '';

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    language: 'en',
    key: apiKey,
  });

  // Use includedTypes for category-specific searches (New Places API)
  if (includedTypes && includedTypes.length > 0) {
    includedTypes.forEach(type => {
      params.append('includedTypes', type);
    });
  }

  if (pageToken) {
    params.set('pagetoken', pageToken);
  }

  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
}

/**
 * Build the URL for Place Details.
 */
function buildPlaceDetailsUrl(placeId: string): string {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return '';

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,formatted_address,formatted_phone_number,website,url,geometry,types,rating,user_ratings_total,price_level,photos,opening_hours,business_status,vicinity,international_phone_number,reviews,utc_offset,adr_address',
    language: 'en',
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
}

/**
 * Build the URL for Place Photos.
 */
function buildPlacePhotoUrl(photoReference: string, maxWidth: number = 400): string {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return '';

  const params = new URLSearchParams({
    maxwidth: String(maxWidth),
    photoreference: photoReference,
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
}

/**
 * Build the URL for reverse geocoding to get city/country from coordinates.
 */
function buildReverseGeocodeUrl(lat: number, lng: number): string {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return '';

  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
    language: 'en',
  });

  return `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
}

/* ── Fetch Helpers ────────────────────────────────────────────────────────── */

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = TIMEOUTS.GOOGLE_PLACES
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept-Language': 'en' },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch nearby places from Google Places API (New) Nearby Search.
 */
async function fetchGoogleNearbySearch(
  lat: number,
  lng: number,
  radius: number,
  includedTypes?: GooglePlaceType[],
  pageToken?: string
): Promise<GoogleNearbySearchResponse> {
  const url = buildNearbySearchUrl(lat, lng, radius, includedTypes, pageToken);
  if (!url) {
    return { results: [], status: 'INVALID_REQUEST', html_attributions: [] };
  }

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.warn('[NearMeService] Nearby search HTTP error:', response.status);
      return { results: [], status: 'ERROR', html_attributions: [] };
    }

    const data: GoogleNearbySearchResponse = await response.json();
    return data;
  } catch (err) {
    console.error('[NearMeService] Nearby search error:', err);
    return { results: [], status: 'ERROR', html_attributions: [] };
  }
}

/**
 * Fetch place details from Google Places API.
 */
async function fetchGooglePlaceDetails(
  placeId: string
): Promise<GooglePlaceDetail | null> {
  const url = buildPlaceDetailsUrl(placeId);
  if (!url) return null;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;

    const data: GooglePlaceDetailsResponse = await response.json();
    if (data.status !== 'OK') return null;

    return data.result;
  } catch (err) {
    console.error('[NearMeService] Place details error:', err);
    return null;
  }
}

/**
 * Get a place photo URL from a photo reference.
 */
async function getPlacePhotoUrl(
  photoReference: string,
  maxWidth: number = 400
): Promise<string> {
  return buildPlacePhotoUrl(photoReference, maxWidth);
}

/* ── Type / Category Helpers ──────────────────────────────────────────────── */

/**
 * Map Google place types to our app category.
 */
function mapGoogleTypeToCategory(types: GooglePlaceType[]): NearMeCategory {
  const typeCategoryMap: Record<GooglePlaceType, NearMeCategory> = {
    tourist_attraction: 'attractions',
    museum: 'museums',
    park: 'parks',
    zoo: 'wildlife',
    art_gallery: 'museums',
    church: 'religious_sites',
    mosque: 'religious_sites',
    hindu_temple: 'religious_sites',
    restaurant: 'restaurants',
    cafe: 'cafes',
    shopping_mall: 'shopping',
    lodging: 'hotels',
    campground: 'hotels',
    aquarium: 'attractions',
    amusement_park: 'entertainment',
    stadium: 'entertainment',
    beach: 'beaches',
    natural_feature: 'parks',
    archaeological_site: 'historical_sites',
    national_park: 'parks',
    synagogue: 'religious_sites',
    temple: 'religious_sites',
    movie_theater: 'entertainment',
    night_club: 'entertainment',
    casino: 'entertainment',
  };

  for (const type of types) {
    if (typeCategoryMap[type]) return typeCategoryMap[type];
  }

  return 'attractions';
}

/**
 * Determine if a place is free (price_level === 0).
 */
function isPlaceFree(priceLevel?: number): boolean {
  return priceLevel === 0 || priceLevel === undefined;
}

/**
 * Determine if a place is family-friendly based on types.
 */
function isPlaceFamilyFriendly(types: GooglePlaceType[]): boolean {
  const familyTypes = new Set<GooglePlaceType>([
    'park', 'zoo', 'aquarium', 'amusement_park', 'museum',
    'beach', 'natural_feature', 'campground',
  ]);
  return types.some(t => familyTypes.has(t));
}

/**
 * Determine if a place is indoor-friendly.
 */
function isPlaceIndoor(types: GooglePlaceType[]): boolean {
  const indoorTypes = new Set<GooglePlaceType>([
    'museum', 'aquarium', 'shopping_mall', 'art_gallery',
    'restaurant', 'cafe', 'stadium',
  ]);
  return types.some(t => indoorTypes.has(t));
}

/**
 * Determine if a place is outdoor-friendly.
 */
function isPlaceOutdoor(types: GooglePlaceType[]): boolean {
  const outdoorTypes = new Set<GooglePlaceType>([
    'park', 'zoo', 'beach', 'natural_feature', 'campground',
    'amusement_park', 'stadium',
  ]);
  return types.some(t => outdoorTypes.has(t));
}

/**
 * Determine if a place is accessible.
 * Google Places doesn't directly provide this, so we infer from types.
 */
function isPlaceAccessible(types: GooglePlaceType[]): boolean {
  const accessibleTypes = new Set<GooglePlaceType>([
    'museum', 'shopping_mall', 'park', 'zoo', 'aquarium',
    'stadium', 'amusement_park', 'restaurant', 'cafe',
  ]);
  return types.some(t => accessibleTypes.has(t));
}

/**
 * Calculate distance between two coordinates using the Haversine formula.
 */
function calculateDistance(
  from: DestinationCoordinates,
  to: DestinationCoordinates
): number {
  const R = 6371; // Earth's radius in km
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
 * Estimate travel time based on distance.
 */
function estimateTravelTime(distanceKm: number): { walking: number; driving: number } {
  return {
    walking: Math.round((distanceKm / 5) * 60), // 5 km/h walking speed
    driving: Math.round((distanceKm / 40) * 60), // 40 km/h average city driving
  };
}

/* ── Transform Google Result to App NearbyPlace ──────────────────────────── */

async function transformGoogleResult(
  result: GooglePlaceResult,
  userLocation: DestinationCoordinates
): Promise<NearbyPlace> {
  const coords: DestinationCoordinates = {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
  const distance = calculateDistance(userLocation, coords);
  const travelTime = estimateTravelTime(distance);
  const types = result.types as GooglePlaceType[];
  const category = mapGoogleTypeToCategory(types);
  const firstPhoto = result.photos?.[0];

  return {
    id: `place_${result.place_id}`,
    placeId: result.place_id,
    name: result.name,
    description: result.vicinity || result.formatted_address || '',
    category,
    googleTypes: types,
    coordinates: coords,
    address: result.formatted_address || '',
    vicinity: result.vicinity || '',
    distance: Math.round(distance * 100) / 100,
    travelTime,
    rating: result.rating || 0,
    reviewCount: result.user_ratings_total || 0,
    priceLevel: result.price_level ?? 1,
    imageUrl: firstPhoto
      ? buildPlacePhotoUrl(firstPhoto.photo_reference, 400)
      : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400',
    photoReferences: result.photos?.map(p => p.photo_reference) || [],
    openingHours: result.opening_hours
      ? {
          openNow: result.opening_hours.open_now,
          weekdayText: result.opening_hours.weekday_text,
        }
      : null,
    businessStatus: result.business_status || 'OPERATIONAL',
    phone: '',
    website: '',
    priceRange: getPriceRange(result.price_level),
    tags: types,
    isOpen: result.opening_hours?.open_now ?? true,
    isFree: isPlaceFree(result.price_level),
    isFamilyFriendly: isPlaceFamilyFriendly(types),
    isIndoor: isPlaceIndoor(types),
    isOutdoor: isPlaceOutdoor(types),
    isAccessible: isPlaceAccessible(types),
    popularity: (result.rating || 0) * (result.user_ratings_total || 1),
    seasonScore: 0,
    weatherScore: 0,
    personalScore: 0,
    events: [],
  };
}

function getPriceRange(priceLevel?: number): string {
  const map: Record<number, string> = {
    0: 'Free',
    1: '$',
    2: '$$',
    3: '$$$',
    4: '$$$$',
  };
  return map[priceLevel ?? 1] || '$';
}

/* ── Reverse Geocoding ────────────────────────────────────────────────────── */

interface ReverseGeocodeResult {
  city: string;
  country: string;
  countryCode?: string;
}

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  const apiKey = getGooglePlacesApiKey();
  console.log('[DEBUG] Step 3: Reverse Geocoding');
  console.log('[DEBUG] Reverse Geocode URL:', `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey ? 'EXISTS' : 'MISSING'}&language=en`);
  
  if (!apiKey) {
    console.warn('[NearMeService] Google Places key missing — falling back to OSM Nominatim');
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
      const res = await fetchWithTimeout(url, TIMEOUTS.OPEN_STREET_MAP || 5000);
      if (res.ok) {
        const data = await res.json();
        const a = data?.address || {};
        const city = a.city || a.town || a.village || a.county || a.state || '';
        const country = a.country || '';
        const code = (a.country_code || '').toUpperCase();
        console.log(`[NearMeService] Nominatim reverse geocode: ${city}, ${country}`);
        return {
          city: city || `${lat.toFixed(4)}`,
          country: country || `${lng.toFixed(4)}`,
          countryCode: code || undefined,
        };
      }
    } catch (err) {
      console.warn('[NearMeService] Nominatim reverse geocode failed:', err);
    }
    return { city: `${lat.toFixed(4)}`, country: `${lng.toFixed(4)}` };
  }

  try {
    // Use raw fetch instead of fetchWithTimeout to avoid potential issues
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=en`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept-Language': 'en' },
    });
    
    console.log('[DEBUG] Reverse Geocode HTTP status:', response.status);
    
    if (!response.ok) {
      console.warn('[NearMeService] Geocode HTTP error:', response.status);
      return { city: `${lat.toFixed(4)}`, country: `${lng.toFixed(4)}` };
    }

    const data = await response.json();
    
    console.log('[DEBUG] Reverse Geocode Response:', {
      status: data.status,
      error_message: data.error_message || 'none',
      results_count: data.results?.length || 0,
    });
    
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.warn('[NearMeService] Geocode API status:', data.status, data.error_message || '');
      return { city: `${lat.toFixed(4)}`, country: `${lng.toFixed(4)}` };
    }

    // Iterate through all results and address components to find best match
    let city = '';
    let country = '';
    let countryCode = '';
    let state = '';
    let town = '';
    let village = '';
    let area = '';

    console.log('[DEBUG] All address components:');
    for (const result of data.results) {
      const types = result.types || [];
      console.log('[DEBUG] Result types:', types.join(', '));
      for (const component of result.address_components) {
        const compTypes = component.types || [];
        console.log('[DEBUG] Component:', component.long_name, '- types:', compTypes.join(', '));
        
        if (compTypes.includes('locality') && !city) {
          city = component.long_name;
        }
        if (compTypes.includes('postal_town') && !town) {
          town = component.long_name;
        }
        if (compTypes.includes('administrative_area_level_2') && !area) {
          area = component.long_name;
        }
        if (compTypes.includes('administrative_area_level_1') && !state) {
          state = component.long_name;
        }
        if (compTypes.includes('country') && !country) {
          country = component.long_name;
          // Extract ISO country code from short_name (e.g. "UG" for Uganda)
          if (component.short_name && /^[A-Za-z]{2}$/.test(component.short_name)) {
            countryCode = component.short_name.toUpperCase();
          }
        }
        if ((compTypes.includes('sublocality') || compTypes.includes('neighborhood')) && !city && !town) {
          village = component.long_name;
        }
      }
    }

    // Fallback chain: city > town > area > state > village > first result's formatted_address
    const displayCity = city || town || area || state || village || 
      (data.results[0]?.formatted_address?.split(',')[0]?.trim()) || 
      `${lat.toFixed(4)}`;

    console.log('[DEBUG] Parsed location:', { city: displayCity, country, countryCode });
    return { 
      city: displayCity, 
      country: country || '',
      countryCode: countryCode || undefined,
    };
  } catch (err) {
    console.error('[NearMeService] Reverse geocode error:', err);
    return { city: `${lat.toFixed(4)}`, country: `${lng.toFixed(4)}` };
  }
}

/* ── Firestore Events Integration ─────────────────────────────────────────── */

async function fetchNearbyEvents(
  city: string,
  _country: string
): Promise<NearbyEvent[]> {
  try {
    const result = await ExploreService.loadEvents({ city, pageSize: 10 });
    return result.data.map(e => ({
      id: e.id,
      title: e.title,
      description: e.shortDescription || e.description,
      category: mapEventCategory(e.category),
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      venue: e.venue?.name || '',
      distance: 0,
    }));
  } catch (err) {
    console.error('[NearMeService] Fetch events error:', err);
    return [];
  }
}

function mapEventCategory(category: string): NearbyEvent['category'] {
  const map: Record<string, NearbyEvent['category']> = {
    festival: 'festival',
    concert: 'concert',
    music: 'concert',
    sports: 'sports',
    business: 'business',
    cultural: 'cultural',
    art: 'cultural',
    food: 'festival',
  };
  return map[category?.toLowerCase()] || 'cultural';
}

/* ── OpenStreetMap Path (primary when Google Places is unavailable) ───────── */

import { DestinationAggregator } from '@/src/modules/explore/services/discovery/DestinationAggregator';
import { enrichNearbyItems } from '@/src/modules/explore/services/discovery/DestinationImageService';
import { withTimeoutFallback } from '@/src/modules/explore/utils/withTimeout';
import { googlePlacesAvailable } from '@/src/modules/explore/services/discovery/providers/config';
import type { TICSDestination } from '@/src/modules/explore/services/discovery/providers/types';

/** Map a Near Me UI category to an OSM-friendly category filter. */
function nearMeCategoryToProvider(
  category?: NearMeCategory
): string | undefined {
  if (!category || category === 'all') return undefined;
  const map: Partial<Record<NearMeCategory, string>> = {
    attractions: 'attractions',
    museums: 'museums',
    parks: 'parks',
    wildlife: 'nature',
    historical_sites: 'culture',
    beaches: 'beaches',
    restaurants: 'restaurants',
    cafes: 'restaurants',
    shopping: 'landmarks',
    hotels: 'hotels',
    religious_sites: 'culture',
    entertainment: 'entertainment',
  };
  return map[category];
}

function mapProviderTypeToNearMeCategory(d: TICSDestination): NearMeCategory {
  const t = (d.type || '').toLowerCase();
  if (['museum', 'art_gallery'].includes(t)) return 'museums';
  if (['park', 'garden', 'nature_reserve', 'forest', 'playground', 'dog_park'].includes(t)) return 'parks';
  if (['zoo', 'aquarium'].includes(t)) return 'wildlife';
  if (['castle', 'monument', 'historic_site', 'archaeological_site', 'place_of_worship', 'memorial', 'fort', 'ruins'].includes(t)) return 'historical_sites';
  if (t === 'beach' || t === 'bay') return 'beaches';
  if (['restaurant', 'fast_food'].includes(t)) return 'restaurants';
  if (['cafe', 'bar', 'pub'].includes(t)) return 'cafes';
  if (['hotel', 'lodging', 'hostel', 'guest_house', 'campground', 'caravan_site'].includes(t)) return 'hotels';
  if (['shopping_mall', 'market'].includes(t)) return 'shopping';
  if (['movie_theater', 'performing_arts_theater', 'night_club', 'theme_park', 'amusement_park', 'water_park', 'casino'].includes(t)) return 'entertainment';
  return 'attractions';
}

function providerToNearbyPlace(
  d: TICSDestination,
  userLocation: DestinationCoordinates
): NearbyPlace {
  const coords: DestinationCoordinates = { lat: d.latitude, lng: d.longitude };
  const distance = calculateDistance(userLocation, coords);
  const travelTime = estimateTravelTime(distance);
  const category = mapProviderTypeToNearMeCategory(d);
  const where = [d.city, d.region, d.country].filter(Boolean).join(', ');
  const hours = typeof d.openingHours === 'string' ? d.openingHours : '';

  // Outdoor / indoor flags are inferred from category only.
  const isOutdoor = ['parks', 'beaches', 'wildlife', 'attractions'].includes(category);

  return {
    id: d.id,
    placeId: d.sourceId || d.id,
    name: d.name,
    description: d.description || where,
    category,
    googleTypes: [],
    coordinates: coords,
    address: where,
    vicinity: where,
    distance: Math.round(distance * 100) / 100,
    travelTime,
    rating: d.rating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    priceLevel: 1,
    // Never fabricate images — enrichment fills this later when available.
    imageUrl: d.imageUrl || '',
    photoReferences: [],
    openingHours: hours ? { openNow: false, weekdayText: [hours] } : null,
    businessStatus: 'OPERATIONAL',
    phone: d.phone || '',
    website: d.website || '',
    priceRange: '$',
    tags: [...(d.tags || []), ...(d.categories || [])],
    // OSM rarely provides opening hours; defaulting to open (unknown) so the
    // "Open now" filter doesn't hide every OSM place. Cards that genuinely
    // know hours still honour them.
    isOpen: d.isOpen ?? true,
    isFree: ['parks', 'beaches'].includes(category),
    isFamilyFriendly: !['night_club', 'bar', 'pub'].includes(d.type || ''),
    isIndoor: !isOutdoor,
    isOutdoor,
    isAccessible: ['museums', 'shopping', 'parks'].includes(category),
    popularity: 0,
    seasonScore: 0,
    weatherScore: 0,
    personalScore: 0,
    events: [],
  };
}

/**
 * OpenStreetMap-first nearby search. Category filtering changes the actual
 * Overpass query (via the aggregator), not just client-side filtering.
 */
async function searchNearbyOsm(
  lat: number,
  lng: number,
  radiusMeters: number,
  category?: NearMeCategory
): Promise<{ places: NearbyPlace[] }> {
  const radiusKm = Math.max(1, Math.round(radiusMeters / 1000));
  try {
    const dests = await DestinationAggregator.nearby({
      lat,
      lng,
      radiusKm,
      category: nearMeCategoryToProvider(category),
      limit: 30,
    });

    // Client-side refinement for categories the OSM predicate can't express
    // precisely: "Cafés" reuses the restaurants query, so filter to actual
    // café/bar/pub types — otherwise the selector appears not to filter.
    let refined = dests;
    if (category === 'cafes') {
      const cafes = dests.filter((d) =>
        ['cafe', 'bar', 'pub'].includes((d.type || '').toLowerCase())
      );
      if (cafes.length > 0) refined = cafes;
    } else if (category === 'wildlife') {
      const wildlife = dests.filter((d) =>
        ['zoo', 'aquarium', 'wildlife_park', 'park'].includes((d.type || '').toLowerCase())
      );
      if (wildlife.length > 0) refined = wildlife;
    }

    const places = refined.map((d) => providerToNearbyPlace(d, { lat, lng }));

    // OSM POIs rarely ship an image. Resolve real photos (Wikipedia → Pexels
    // → Openverse) with the shared cached enrichment layer. AWAITED but
    // strictly bounded, and limited to the first 15 places (what actually
    // renders) so the screen never waits long for results — the rest are
    // filled by the persistent cache on the next load.
    const toEnrich = places.slice(0, 15);
    await withTimeoutFallback(
      enrichNearbyItems(toEnrich as any),
      6_000,
      'nearme-image-enrich',
      toEnrich as any
    ).catch(() => undefined);

    console.log(`[NearMeService] OSM nearby: ${places.length} places (${category || 'all'}), with images: ${places.filter(p => p.imageUrl).length}`);
    return { places };
  } catch (err) {
    console.warn('[NearMeService] ERROR OSM nearby failed:', err);
    return { places: [] };
  }
}

/* ── Public API ───────────────────────────────────────────────────────────── */

export const NearMeService = {
  /**
   * Perform a Google Places Nearby Search.
   * Returns raw Google results transformed into app NearbyPlace objects.
   */
  async searchNearby(
    lat: number,
    lng: number,
    options: {
      radius?: number;
      category?: NearMeCategory;
      pageToken?: string;
    } = {}
  ): Promise<{
    places: NearbyPlace[];
    nextPageToken: string | null;
    hasMore: boolean;
  }> {
    const radius = options.radius ?? NEARBY_CONFIG.DEFAULT_RADIUS_KM * 1000;
    const userLocation: DestinationCoordinates = { lat, lng };

    console.log('[DEBUG] Step 4: Google Places Nearby Search');
    console.log('[DEBUG] Coordinates:', lat, lng);
    console.log('[DEBUG] Radius:', radius);
    console.log('[DEBUG] Category:', options.category);

    // OSM-first: when Google Places is disabled/unavailable, use OpenStreetMap.
    if (!googlePlacesAvailable()) {
      const osm = await searchNearbyOsm(lat, lng, radius, options.category);
      return { places: osm.places, nextPageToken: null, hasMore: false };
    }

    // Get Google Place types for the selected category
    const includedTypes = options.category && options.category !== 'all'
      ? CATEGORY_TO_PLACE_TYPES[options.category]
      : [];
    
    console.log('[DEBUG] Included types for search:', includedTypes);

    let allResults: GooglePlaceResult[] = [];
    let nextPageToken: string | null = options.pageToken || null;

    // Fetch with category-specific types (Google Places best practice)
    const response = await fetchGoogleNearbySearch(
      lat,
      lng,
      radius,
      includedTypes.length > 0 ? includedTypes : undefined,
      nextPageToken || undefined
    );

    console.log('[DEBUG] Nearby search response:', {
      status: response.status,
      results_count: response.results?.length || 0,
      included_types: includedTypes,
      has_next_page: !!response.next_page_token,
    });
    
    if (response.status !== 'OK') {
      console.warn('[NearMeService] Nearby search error:', response.status, response.error_message || '');
    }
    
    if (response.status === 'OK' && response.results?.length) {
      allResults = response.results;
      nextPageToken = response.next_page_token || null;
    }

    // Deduplicate by place_id
    const seen = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      if (seen.has(r.place_id)) return false;
      seen.add(r.place_id);
      return true;
    });

    console.log('[DEBUG] Total results before dedup:', allResults.length);
    console.log('[DEBUG] Unique results after dedup:', uniqueResults.length);

    // Transform to app model
    const places = await Promise.all(
      uniqueResults.map(r => transformGoogleResult(r, userLocation))
    );
    
    // For specific categories, verify results match (Google should handle this, but verify)
    if (options.category && options.category !== 'all' && places.length > 0) {
      const matchingPlaces = places.filter(p => p.category === options.category);
      const matchRate = (matchingPlaces.length / places.length) * 100;
      
      console.log('[DEBUG] Category match verification:', {
        requested: options.category,
        total: places.length,
        matching: matchingPlaces.length,
        match_rate: `${matchRate.toFixed(1)}%`,
      });
      
      // If match rate is very low, log warning
      if (matchRate < 50 && places.length > 5) {
        console.warn('[NearMeService] Low category match rate. Google may not be respecting includedTypes.');
        const categoryDistribution = places.reduce((acc, p) => {
          acc[p.category] = (acc[p.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.warn('[NearMeService] Category distribution:', categoryDistribution);
      }
    }

    console.log('[DEBUG] Transformed places:', places.length);
    if (places.length > 0) {
      console.log('[DEBUG] Sample place:', {
        name: places[0].name,
        category: places[0].category,
        distance: places[0].distance,
        rating: places[0].rating,
        hasImage: !!places[0].imageUrl,
      });
    }

    return {
      places,
      nextPageToken,
      hasMore: !!nextPageToken,
    };
  },

  /**
   * Get detailed information about a specific place.
   */
  async getPlaceDetails(
    placeId: string,
    userLocation: DestinationCoordinates
  ): Promise<NearbyPlace | null> {
    try {
      const detail = await fetchGooglePlaceDetails(placeId);
      if (!detail) return null;

      const place = await transformGoogleResult(
        detail as GooglePlaceResult,
        userLocation
      );

      // Enrich with additional details
      place.phone = detail.formatted_phone_number || '';
      place.website = detail.website || '';
      place.description = detail.adr_address
        ? detail.adr_address.replace(/<[^>]*>/g, '')
        : detail.formatted_address || '';

      return place;
    } catch (err) {
      console.error('[NearMeService] getPlaceDetails error:', err);
      return null;
    }
  },

  /**
   * Get a photo URL for a place.
   */
  getPhotoUrl(
    photoReference: string,
    maxWidth: number = 400
  ): string {
    return buildPlacePhotoUrl(photoReference, maxWidth);
  },

  /**
   * Reverse geocode coordinates to get city and country.
   */
  async getLocationInfo(
    lat: number,
    lng: number
  ): Promise<ReverseGeocodeResult> {
    return reverseGeocode(lat, lng);
  },

  /**
   * Fetch nearby events from Firestore for the given location.
   */
  async getNearbyEvents(
    city: string,
    country: string
  ): Promise<NearbyEvent[]> {
    return fetchNearbyEvents(city, country);
  },
};