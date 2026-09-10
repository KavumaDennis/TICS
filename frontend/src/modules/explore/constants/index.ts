/**
 * Explore Module Constants
 * ─────────────────────────────────────────────────────────────────────────────
 * All configuration constants for the Explore module.
 * No hardcoded categories - they come from Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Firestore Collection Names ─────────────────────────────────────────────── */

export const FIRESTORE_COLLECTIONS = {
  EXPLORE_CATEGORIES: 'exploreCategories',
  DESTINATIONS: 'destinations',
  EVENTS: 'events',
  RECOMMENDATIONS: 'recommendations',
  TRENDING: 'trending',
  SAVED_PLACES: 'savedPlaces',
  SEARCH_HISTORY: 'searchHistory',
  JOURNEY_FEED: 'journeyFeed',
  NEARBY_PLACES: 'nearbyPlaces',
  EXPLORE_ANALYTICS: 'exploreAnalytics',
} as const;

/* ── Cache Keys ─────────────────────────────────────────────────────────────── */

export const CACHE_KEYS = {
  CATEGORIES: 'explore_categories',
  TRENDING: 'explore_trending',
  DESTINATIONS: 'explore_destinations',
  EVENTS: 'explore_events',
  RECENTLY_VIEWED: 'explore_recently_viewed',
  SEARCH_HISTORY: 'explore_search_history',
  JOURNEY_FEED: 'explore_journey_feed',
  NEARBY: 'explore_nearby',
  WEEKEND_ESCAPES: 'explore_weekend_escapes',
  POPULAR: 'explore_popular',
  RECOMMENDATIONS: 'explore_recommendations',
} as const;

/**
 * Build a location-aware cache key.
 * Uses a location bucket (rounded to 2 decimal places ≈ 1.1km) so tiny GPS
 * movements don't destroy cache effectiveness.
 */
export function buildLocationKey(lat?: number, lng?: number): string {
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'default';
  const latBucket = Math.round(lat * 100) / 100;
  const lngBucket = Math.round(lng * 100) / 100;
  return `${latBucket}:${lngBucket}`;
}

/**
 * Build a location-scoped cache key for a section.
 * e.g. `explore:0.35:32.58:nearby`
 */
export function buildSectionCacheKey(
  section: string,
  lat?: number,
  lng?: number
): string {
  const loc = buildLocationKey(lat, lng);
  return `explore:${loc}:${section}`;
}

/* ── Cache TTL Values (milliseconds) ────────────────────────────────────────── */

export const CACHE_TTL = {
  CATEGORIES: 24 * 60 * 60 * 1000,       // 24 hours
  TRENDING: 6 * 60 * 60 * 1000,          // 6 hours
  DESTINATIONS: 12 * 60 * 60 * 1000,     // 12 hours
  EVENTS: 6 * 60 * 60 * 1000,            // 6 hours
  RECENTLY_VIEWED: 7 * 24 * 60 * 60 * 1000, // 7 days
  SEARCH_HISTORY: 30 * 24 * 60 * 60 * 1000, // 30 days
  JOURNEY_FEED: 1 * 60 * 60 * 1000,      // 1 hour
  NEARBY: 30 * 60 * 1000,                // 30 minutes
} as const;

/* ── Pagination Defaults ────────────────────────────────────────────────────── */

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
  TRENDING_LIMIT: 20,
  POPULAR_LIMIT: 20,
  FEATURED_LIMIT: 10,
  RECENTLY_VIEWED_LIMIT: 20,
  NEARBY_LIMIT: 30,
  FEED_LIMIT: 20,
  SEARCH_LIMIT: 10,
  AUTOCOMPLETE_LIMIT: 5,
} as const;

/* ── Search Configuration ───────────────────────────────────────────────────── */

export const SEARCH_CONFIG = {
  DEBOUNCE_MS: 300,
  MIN_QUERY_LENGTH: 2,
  MAX_RECENT_SEARCHES: 20,
  GOOGLE_PLACES_TYPES: [
    'country',
    'locality',
    'lodging',
    'airport',
    'museum',
    'park',
    'restaurant',
    'tourist_attraction',
    'point_of_interest',
    'establishment',
  ],
} as const;

/* ── Nearby Configuration ───────────────────────────────────────────────────── */

export const NEARBY_CONFIG = {
  DEFAULT_RADIUS_KM: 50,
  MAX_RADIUS_KM: 200,
  SORT_OPTIONS: ['distance', 'popularity', 'rating'] as const,
  DEFAULT_SORT: 'distance' as const,
} as const;

/* ── Weather Configuration ──────────────────────────────────────────────────── */

export const WEATHER_CONFIG = {
  FORECAST_DAYS: 7,
  TEMP_UNITS: 'metric' as const,
  LANGUAGE: 'en',
} as const;

/* ── Analytics Events ───────────────────────────────────────────────────────── */

export const ANALYTICS_EVENTS = {
  DESTINATION_VIEWED: 'destination_viewed',
  CATEGORY_OPENED: 'category_opened',
  EVENT_OPENED: 'event_opened',
  COORDINATE_JOURNEY_CLICKED: 'coordinate_journey_clicked',
  DESTINATION_SAVED: 'destination_saved',
  SEARCH_PERFORMED: 'search_performed',
  RECOMMENDATION_OPENED: 'recommendation_opened',
  JOURNEY_CREATED: 'journey_created',
  FEED_ITEM_VIEWED: 'feed_item_viewed',
  NEARBY_ITEM_VIEWED: 'nearby_item_viewed',
} as const;

/* ── UI Configuration ───────────────────────────────────────────────────────── */

export const UI_CONFIG = {
  HERO_HEIGHT: 280,
  CATEGORY_ICON_SIZE: 32,
  CARD_IMAGE_HEIGHT: 200,
  CAROUSEL_ITEM_WIDTH: 280,
  CAROUSEL_ITEM_HEIGHT: 180,
  SECTION_HEADER_HEIGHT: 48,
  SKELETON_COUNT: 5,
  RECENTLY_VIEWED_MAX: 20,
  BOTTOM_CTA_HEIGHT: 72,
} as const;

/* ── Error Messages ─────────────────────────────────────────────────────────── */

export const ERROR_MESSAGES = {
  LOAD_CATEGORIES: 'Failed to load categories. Please try again.',
  LOAD_DESTINATIONS: 'Failed to load destinations. Please try again.',
  LOAD_EVENTS: 'Failed to load events. Please try again.',
  LOAD_SEARCH: 'Search failed. Please try again.',
  LOAD_NEARBY: 'Failed to load nearby places. Please try again.',
  LOAD_FEED: 'Failed to load journey feed. Please try again.',
  LOAD_RECOMMENDATIONS: 'Failed to load recommendations. Please try again.',
  LOCATION_REQUIRED: 'Location access is required to see nearby places.',
  NO_RESULTS: 'No results found. Try adjusting your search.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
} as const;

/* ── Loading States ─────────────────────────────────────────────────────────── */

export const LOADING_MESSAGES = {
  EXPLORE: 'Discovering amazing places for you...',
  CATEGORY: 'Loading experiences...',
  DESTINATION: 'Loading destination details...',
  EVENT: 'Loading event details...',
  SEARCH: 'Searching...',
  NEARBY: 'Finding places near you...',
  FEED: 'Preparing your journey feed...',
} as const;

/* ── Service Timeouts ───────────────────────────────────────────────────────── */

export const TIMEOUTS = {
  FIREBASE_QUERY: 15000,
  GOOGLE_PLACES: 5000,
  OPEN_WEATHER: 3000,
  OPEN_STREET_MAP: 5000,
  TICKETMASTER: 5000,
  EVENTBRITE: 5000,
  GEMINI: 5000,
  CACHE_READ: 2000,
  CACHE_WRITE: 3000,
} as const;
