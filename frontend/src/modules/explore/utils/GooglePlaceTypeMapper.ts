/**
 * GooglePlaceTypeMapper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable mapping layer between app categories and Google Places API types.
 *
 * This mapper is used throughout the Explore module to ensure consistent
 * category-to-type mapping for Google Places searches.
 *
 * Architecture:
 *   NearMeScreen
 *     → useNearby()
 *       → NearMeEngine
 *         → GooglePlaceTypeMapper (this file)
 *         → NearMeService (Google Places API)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NearMeCategory, GooglePlaceType } from '@/src/modules/explore/types/nearme';

/**
 * Maps app categories to Google Place types for Nearby Search.
 *
 * Google Places API (New) supports the `includedTypes` parameter which
 * accepts an array of place types. This mapping ensures each category
 * uses the correct Google types.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/supported-types
 */
export const GOOGLE_PLACE_TYPES: Record<NearMeCategory, GooglePlaceType[]> = {
  all: [], // No filter - returns all types
  attractions: ['tourist_attraction'],
  museums: ['museum', 'art_gallery'],
  parks: ['park'],
  wildlife: ['zoo', 'aquarium', 'national_park'],
  beaches: ['beach'],
  restaurants: ['restaurant'],
  cafes: ['cafe'],
  shopping: ['shopping_mall'],
  hotels: ['lodging', 'campground'],
  historical_sites: ['museum', 'tourist_attraction', 'archaeological_site'],
  religious_sites: ['church', 'mosque', 'hindu_temple', 'synagogue', 'temple'],
  entertainment: ['amusement_park', 'movie_theater', 'stadium', 'night_club', 'casino'],
};

/**
 * Get Google Place types for a given category.
 */
export function getGoogleTypesForCategory(category: NearMeCategory): GooglePlaceType[] {
  return GOOGLE_PLACE_TYPES[category] || [];
}

/**
 * Check if a category requires multiple Google Place types.
 */
export function isMultiTypeCategory(category: NearMeCategory): boolean {
  const types = getGoogleTypesForCategory(category);
  return types.length > 1;
}

/**
 * Map Google Place types back to app categories.
 * Used for categorizing places returned by Google.
 */
export function mapGoogleTypeToCategory(types: GooglePlaceType[]): NearMeCategory {
  if (!types || types.length === 0) {
    return 'attractions';
  }

  // Priority mapping - first match wins
  for (const type of types) {
    const category = GOOGLE_TYPE_TO_CATEGORY[type];
    if (category) {
      return category;
    }
  }

  // Default fallback
  return 'attractions';
}

/**
 * Reverse mapping: Google Place type → App category
 */
const GOOGLE_TYPE_TO_CATEGORY: Partial<Record<GooglePlaceType, NearMeCategory>> = {
  // Attractions
  tourist_attraction: 'attractions',
  archaeological_site: 'historical_sites',

  // Museums
  museum: 'museums',
  art_gallery: 'museums',

  // Parks
  park: 'parks',
  national_park: 'parks',

  // Wildlife
  zoo: 'wildlife',
  aquarium: 'wildlife',

  // Beaches
  beach: 'beaches',

  // Restaurants
  restaurant: 'restaurants',

  // Cafes
  cafe: 'cafes',

  // Shopping
  shopping_mall: 'shopping',

  // Hotels
  lodging: 'hotels',
  campground: 'hotels',

  // Religious Sites
  church: 'religious_sites',
  mosque: 'religious_sites',
  hindu_temple: 'religious_sites',
  synagogue: 'religious_sites',
  temple: 'religious_sites',

  // Entertainment
  amusement_park: 'entertainment',
  movie_theater: 'entertainment',
  stadium: 'entertainment',
  night_club: 'entertainment',
  casino: 'entertainment',
};

/**
 * Get a human-readable label for a Google Place type.
 */
export function getGoogleTypeLabel(type: GooglePlaceType): string {
  const labels: Record<GooglePlaceType, string> = {
    tourist_attraction: 'Tourist Attraction',
    museum: 'Museum',
    park: 'Park',
    zoo: 'Zoo',
    art_gallery: 'Art Gallery',
    church: 'Church',
    mosque: 'Mosque',
    hindu_temple: 'Hindu Temple',
    restaurant: 'Restaurant',
    cafe: 'Café',
    shopping_mall: 'Shopping Mall',
    lodging: 'Hotel/Lodging',
    campground: 'Campground',
    aquarium: 'Aquarium',
    amusement_park: 'Amusement Park',
    stadium: 'Stadium',
    beach: 'Beach',
    natural_feature: 'Natural Feature',
    archaeological_site: 'Archaeological Site',
    national_park: 'National Park',
    synagogue: 'Synagogue',
    temple: 'Temple',
    movie_theater: 'Movie Theater',
    night_club: 'Night Club',
    casino: 'Casino',
  };

  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}