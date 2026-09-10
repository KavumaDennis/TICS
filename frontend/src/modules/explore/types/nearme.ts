/**
 * Near Me Module Types
 * ─────────────────────────────────────────────────────────────────────────────
 * Type definitions specific to the Near Me location intelligence module.
 * These types represent Google Places API responses, ranked nearby places,
 * and merged data from Firestore events.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { DestinationCoordinates } from './index';

/* ── Google Place Types (New Places API) ─────────────────────────────────── */

/** Supported Google Places types for Nearby Search */
export type GooglePlaceType =
  | 'tourist_attraction'
  | 'museum'
  | 'park'
  | 'zoo'
  | 'art_gallery'
  | 'church'
  | 'mosque'
  | 'hindu_temple'
  | 'restaurant'
  | 'cafe'
  | 'shopping_mall'
  | 'lodging'
  | 'campground'
  | 'aquarium'
  | 'amusement_park'
  | 'stadium'
  | 'beach'
  | 'natural_feature'
  | 'archaeological_site'
  | 'national_park'
  | 'synagogue'
  | 'temple'
  | 'movie_theater'
  | 'night_club'
  | 'casino';

/* ── Category Mappings ───────────────────────────────────────────────────── */

export type NearMeCategory =
  | 'all'
  | 'attractions'
  | 'museums'
  | 'parks'
  | 'wildlife'
  | 'historical_sites'
  | 'beaches'
  | 'restaurants'
  | 'cafes'
  | 'shopping'
  | 'hotels'
  | 'religious_sites'
  | 'entertainment';

/** Maps our UI categories to Google Places API types */
export const CATEGORY_TO_PLACE_TYPES: Record<NearMeCategory, GooglePlaceType[]> = {
  all: [],
  attractions: ['tourist_attraction', 'amusement_park', 'aquarium'],
  museums: ['museum', 'art_gallery'],
  parks: ['park', 'natural_feature'],
  wildlife: ['zoo', 'aquarium', 'natural_feature'],
  historical_sites: ['church', 'mosque', 'hindu_temple', 'museum'],
  beaches: ['beach', 'natural_feature'],
  restaurants: ['restaurant', 'cafe'],
  cafes: ['cafe'],
  shopping: ['shopping_mall'],
  hotels: ['lodging', 'campground'],
  religious_sites: ['church', 'mosque', 'hindu_temple'],
  entertainment: ['amusement_park', 'stadium', 'aquarium'],
};

/* ── Places API Raw Response Types ──────────────────────────────────────── */

export interface GooglePlaceGeometry {
  location: {
    lat: number;
    lng: number;
  };
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
}

export interface GooglePlacePhoto {
  photo_reference: string;
  height: number;
  width: number;
  html_attributions: string[];
}

export interface GooglePlaceOpeningHours {
  open_now: boolean;
  periods?: Array<{
    open: { day: number; time: string };
    close: { day: number; time: string };
  }>;
  weekday_text?: string[];
}

export interface GooglePlaceReview {
  author_name: string;
  author_url: string;
  language: string;
  profile_photo_url: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
}

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: GooglePlaceGeometry;
  types: GooglePlaceType[];
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: GooglePlacePhoto[];
  opening_hours?: GooglePlaceOpeningHours;
  business_status?: string;
  plus_code?: {
    compound_code: string;
    global_code: string;
  };
  vicinity?: string;
  icon?: string;
  icon_background_color?: string;
}

export interface GoogleNearbySearchResponse {
  results: GooglePlaceResult[];
  status: string;
  error_message?: string;
  next_page_token?: string;
  html_attributions: string[];
}

export interface GooglePlaceDetailsResponse {
  result: GooglePlaceDetail;
  status: string;
  error_message?: string;
}

export interface GooglePlaceDetail extends GooglePlaceResult {
  formatted_phone_number?: string;
  website?: string;
  url?: string;
  utc_offset?: number;
  reviews?: GooglePlaceReview[];
  international_phone_number?: string;
  adr_address?: string;
}

/* ── Application-Level Nearby Place ─────────────────────────────────────── */

export type NearbySortOption =
  | 'distance'
  | 'rating'
  | 'popularity'
  | 'recently_added'
  | 'travel_time';

export interface NearbyPlace {
  id: string;
  placeId: string;
  name: string;
  description: string;
  category: NearMeCategory;
  googleTypes: GooglePlaceType[];
  coordinates: DestinationCoordinates;
  address: string;
  vicinity: string;
  distance: number; // km
  travelTime: {
    walking: number; // minutes
    driving: number; // minutes
  };
  rating: number;
  reviewCount: number;
  priceLevel: number;
  imageUrl: string;
  photoReferences: string[];
  openingHours: {
    openNow: boolean;
    weekdayText?: string[];
  } | null;
  businessStatus: string;
  phone: string;
  website: string;
  priceRange: string;
  tags: string[];
  isOpen: boolean;
  isFree: boolean;
  isFamilyFriendly: boolean;
  isIndoor: boolean;
  isOutdoor: boolean;
  isAccessible: boolean;
  popularity: number;
  seasonScore: number;
  weatherScore: number;
  personalScore: number;
  events: NearbyEvent[];
}

export interface NearbyEvent {
  id: string;
  title: string;
  description: string;
  category: 'festival' | 'concert' | 'sports' | 'business' | 'cultural';
  startDate: string;
  endDate: string;
  venue: string;
  distance: number;
}

/* ── Filter & Sort Types ─────────────────────────────────────────────────── */

export interface NearbyFilters {
  maxDistance: number;
  minRating: number;
  minPopularity: number;
  openNow: boolean;
  free: boolean;
  familyFriendly: boolean;
  indoor: boolean;
  outdoor: boolean;
  accessible: boolean;
}

export const DEFAULT_NEARBY_FILTERS: NearbyFilters = {
  maxDistance: 50,
  minRating: 0,
  minPopularity: 0,
  openNow: false,
  free: false,
  familyFriendly: false,
  indoor: false,
  outdoor: false,
  accessible: false,
};

/* ── Personalization Context ────────────────────────────────────────────── */

export interface UserContext {
  interests: string[];
  savedPlaceIds: string[];
  searchHistory: string[];
  tripHistory: string[];
  season: string;
  currentWeather: string;
  temperature: number;
}

/* ── Response Types ──────────────────────────────────────────────────────── */

export interface NearMeResult {
  places: NearbyPlace[];
  total: number;
  hasMore: boolean;
  nextPageToken: string | null;
  location: {
    city: string;
    country: string;
    countryCode?: string;
    lat: number;
    lng: number;
  };
  events: NearbyEvent[];
  timestamp: number;
  cacheKey?: string;
}

export interface NearMeState {
  places: NearbyPlace[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  location: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  } | null;
  hasMore: boolean;
  selectedPlace: NearbyPlace | null;
  viewMode: 'list' | 'map';
  activeCategory: NearMeCategory;
  filters: NearbyFilters;
  sortBy: NearbySortOption;
  events: NearbyEvent[];
  gpsStatus: 'granted' | 'denied' | 'blocked' | 'unavailable';
  isOffline: boolean;
}