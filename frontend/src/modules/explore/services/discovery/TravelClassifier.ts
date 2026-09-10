/**
 * TravelClassifier.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Classifies places into travel categories and filters out non-travel places.
 * Ensures only places a traveler would actually want to visit are surfaced.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

/* ── Travel Categories ──────────────────────────────────────────────────────── */

export interface TravelClassification {
  travelCategory: string;
  travelTags: string[];
  isTravelRelevant: boolean;
  exclusionReason?: string;
}

/* ── Allowed Travel Categories ──────────────────────────────────────────────── */

const TRAVEL_CATEGORIES: Record<string, { category: string; tags: string[] }> = {
  // Nature
  beach: { category: 'Beach', tags: ['Nature', 'Relaxation', 'Photography'] },
  national_park: { category: 'National Park', tags: ['Nature', 'Wildlife', 'Hiking'] },
  park: { category: 'Park', tags: ['Nature', 'Relaxation', 'Outdoor'] },
  waterfall: { category: 'Waterfall', tags: ['Nature', 'Adventure', 'Photography'] },
  lake: { category: 'Lake', tags: ['Nature', 'Relaxation', 'Water Activities'] },
  mountain: { category: 'Mountain', tags: ['Nature', 'Adventure', 'Hiking'] },
  nature_reserve: { category: 'Nature Reserve', tags: ['Nature', 'Wildlife', 'Conservation'] },
  scenic_viewpoint: { category: 'Scenic Viewpoint', tags: ['Nature', 'Photography', 'Sightseeing'] },
  island: { category: 'Island', tags: ['Nature', 'Beach', 'Adventure'] },
  forest: { category: 'Forest', tags: ['Nature', 'Hiking', 'Adventure'] },

  // Wildlife
  zoo: { category: 'Zoo', tags: ['Wildlife', 'Family', 'Education'] },
  safari: { category: 'Safari', tags: ['Wildlife', 'Adventure', 'Photography'] },
  wildlife_park: { category: 'Wildlife Park', tags: ['Wildlife', 'Nature', 'Safari'] },
  aquarium: { category: 'Aquarium', tags: ['Wildlife', 'Family', 'Education'] },

  // Culture
  museum: { category: 'Museum', tags: ['Culture', 'Education', 'History'] },
  art_gallery: { category: 'Art Gallery', tags: ['Culture', 'Art', 'Photography'] },
  historic_site: { category: 'Historic Site', tags: ['Culture', 'History', 'Sightseeing'] },
  castle: { category: 'Castle', tags: ['Culture', 'History', 'Architecture'] },
  monument: { category: 'Monument', tags: ['Culture', 'History', 'Photography'] },
  archaeological_site: { category: 'Archaeological Site', tags: ['Culture', 'History', 'Adventure'] },

  // Entertainment
  amusement_park: { category: 'Amusement Park', tags: ['Entertainment', 'Family', 'Adventure'] },
  theme_park: { category: 'Theme Park', tags: ['Entertainment', 'Family', 'Adventure'] },
  water_park: { category: 'Water Park', tags: ['Entertainment', 'Family', 'Fun'] },
  live_music: { category: 'Live Music Venue', tags: ['Entertainment', 'Music', 'Nightlife'] },
  theater: { category: 'Theater', tags: ['Entertainment', 'Culture', 'Arts'] },

  // Food
  restaurant: { category: 'Restaurant', tags: ['Food', 'Dining', 'Cuisine'] },
  cafe: { category: 'Café', tags: ['Food', 'Relaxation', 'Coffee'] },
  rooftop_bar: { category: 'Rooftop Bar', tags: ['Food', 'Nightlife', 'Views'] },
  brewery: { category: 'Brewery', tags: ['Food', 'Drinks', 'Social'] },
  food_market: { category: 'Food Market', tags: ['Food', 'Local', 'Shopping'] },

  // Shopping
  shopping_mall: { category: 'Shopping Mall', tags: ['Shopping', 'Retail', 'Entertainment'] },
  artisan_market: { category: 'Artisan Market', tags: ['Shopping', 'Local', 'Culture'] },
  local_market: { category: 'Local Market', tags: ['Shopping', 'Local', 'Food'] },

  // Adventure
  hiking_area: { category: 'Hiking Area', tags: ['Adventure', 'Nature', 'Fitness'] },
  campground: { category: 'Campground', tags: ['Adventure', 'Nature', 'Outdoor'] },
  marina: { category: 'Marina', tags: ['Adventure', 'Water', 'Boating'] },
  diving: { category: 'Diving Spot', tags: ['Adventure', 'Water', 'Marine'] },
  cycling: { category: 'Cycling Route', tags: ['Adventure', 'Fitness', 'Outdoor'] },
};

/* ── Blacklist (never include unless explicitly searched) ────────────────────── */

const BLACKLISTED_TYPES = new Set([
  'church', 'mosque', 'synagogue', 'temple',
  'school', 'university', 'college',
  'hospital', 'clinic', 'pharmacy', 'dentist', 'doctor',
  'government_office', 'police', 'courthouse', 'embassy',
  'bank', 'atm', 'accounting', 'lawyer', 'insurance', 'real_estate_agency',
  'storage', 'self_storage',
  'cemetery', 'funeral_home', 'mortuary',
  'electrician', 'plumber', 'contractor', 'roofing_contractor',
  'car_repair', 'car_dealer', 'car_wash', 'gas_station', 'parking',
  'office', 'post_office', 'fire_station',
  'laundry', 'dry_cleaning', 'hair_care', 'beauty_salon', 'spa',
  'gym', 'fitness_center', 'yoga_studio',
  'supermarket', 'grocery_store', 'convenience_store', 'liquor_store',
  'hardware_store', 'home_goods_store', 'furniture_store',
  'electronics_store', 'computer_store', 'mobile_phone_store',
  'pet_store', 'veterinary_care',
  'travel_agency', 'lodging', 'motel', 'hostel',
  'bus_station', 'train_station', 'airport', 'taxi_stand',
  'subway_station', 'transit_station',
  'local_government_office', 'city_hall',
]);

/* ── Type Mapping (Google Places → Travel Categories) ───────────────────────── */

const GOOGLE_TYPE_TO_TRAVEL: Record<string, string> = {
  // Nature
  beach: 'beach',
  national_park: 'national_park',
  park: 'park',
  natural_feature: 'scenic_viewpoint',
  viewpoint: 'scenic_viewpoint',
  waterfall: 'waterfall',
  lake: 'lake',
  mountain: 'mountain',
  nature_reserve: 'nature_reserve',
  island: 'island',
  forest: 'forest',

  // Wildlife
  zoo: 'zoo',
  aquarium: 'aquarium',
  wildlife_park: 'wildlife_park',

  // Culture
  museum: 'museum',
  art_gallery: 'art_gallery',
  historic_site: 'historic_site',
  castle: 'castle',
  monument: 'monument',
  archaeological_site: 'archaeological_site',
  landmark: 'historic_site',
  place_of_worship: 'historic_site', // Only if it's a famous landmark

  // Entertainment
  amusement_park: 'amusement_park',
  theme_park: 'theme_park',
  water_park: 'water_park',
  night_club: 'live_music',
  casino: 'entertainment',
  movie_theater: 'theater',
  performing_arts_theater: 'theater',

  // Food
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'rooftop_bar',
  bakery: 'cafe',
  meal_takeaway: 'restaurant',
  meal_delivery: 'restaurant',
  food: 'restaurant',
  nightlife: 'rooftop_bar',

  // Shopping
  shopping_mall: 'shopping_mall',
  market: 'local_market',
  flea_market: 'local_market',
  artisan_market: 'artisan_market',
  tourist_attraction: 'historic_site',

  // Adventure
  hiking_area: 'hiking_area',
  campground: 'campground',
  marina: 'marina',
  diving_center: 'diving',
  bicycle_store: 'cycling',
  gym: 'fitness_center',
  stadium: 'entertainment',
  sports_complex: 'entertainment',
  athletic_field: 'entertainment',
  golf_course: 'entertainment',
  ski_resort: 'adventure',
  rafting: 'adventure',
  rock_climbing: 'adventure',
  zip_line: 'adventure',
};

/* ── TravelClassifier ───────────────────────────────────────────────────────── */

export const TravelClassifier = {
  /**
   * Classify a place into travel categories.
   * Returns null if the place should be excluded.
   */
  classify(place: NearbyItem): TravelClassification | null {
    const types = place.tags || [];
    const name = place.name?.toLowerCase() || '';
    const type = place.type || '';

    // Check blacklist first
    for (const tag of types) {
      if (BLACKLISTED_TYPES.has(tag)) {
        return {
          travelCategory: 'Excluded',
          travelTags: [],
          isTravelRelevant: false,
          exclusionReason: `Blacklisted type: ${tag}`,
        };
      }
    }

    // Also check name for blacklisted keywords
    const blacklistKeywords = [
      'church', 'mosque', 'temple', 'synagogue', 'chapel',
      'school', 'university', 'college', 'academy', 'institute',
      'hospital', 'clinic', 'pharmacy', 'medical', 'dental',
      'government', 'police', 'courthouse', 'embassy', 'consulate',
      'bank', 'atm', 'accounting', 'lawyer', 'attorney', 'insurance',
      'real estate', 'storage', 'cemetery', 'funeral',
      'electrician', 'plumber', 'contractor', 'car repair', 'garage',
      'gas station', 'petrol', 'office', 'post office',
      'laundry', 'dry cleaning', 'hair salon', 'barber',
      'supermarket', 'grocery', 'convenience store', 'liquor',
      'hardware', 'furniture', 'electronics', 'pet store',
      'veterinary', 'bus station', 'train station', 'taxi',
    ];

    for (const keyword of blacklistKeywords) {
      if (name.includes(keyword)) {
        return {
          travelCategory: 'Excluded',
          travelTags: [],
          isTravelRelevant: false,
          exclusionReason: `Blacklisted name keyword: ${keyword}`,
        };
      }
    }

    // Try to map to a travel category
    let travelKey: string | null = null;

    // Check type first
    if (type && GOOGLE_TYPE_TO_TRAVEL[type]) {
      travelKey = GOOGLE_TYPE_TO_TRAVEL[type];
    }

    // Check tags
    if (!travelKey) {
      for (const tag of types) {
        if (GOOGLE_TYPE_TO_TRAVEL[tag]) {
          travelKey = GOOGLE_TYPE_TO_TRAVEL[tag];
          break;
        }
      }
    }

    // Check name for travel keywords
    if (!travelKey) {
      const nameKeywords: Record<string, string> = {
        'beach': 'beach',
        'park': 'park',
        'museum': 'museum',
        'gallery': 'art_gallery',
        'waterfall': 'waterfall',
        'lake': 'lake',
        'mountain': 'mountain',
        'viewpoint': 'scenic_viewpoint',
        'view point': 'scenic_viewpoint',
        'lookout': 'scenic_viewpoint',
        'zoo': 'zoo',
        'aquarium': 'aquarium',
        'safari': 'safari',
        'wildlife': 'wildlife_park',
        'castle': 'castle',
        'monument': 'monument',
        'historic': 'historic_site',
        'heritage': 'historic_site',
        'ruins': 'archaeological_site',
        'amusement': 'amusement_park',
        'theme park': 'theme_park',
        'water park': 'water_park',
        'theatre': 'theater',
        'theater': 'theater',
        'restaurant': 'restaurant',
        'cafe': 'cafe',
        'coffee': 'cafe',
        'brewery': 'brewery',
        'market': 'local_market',
        'hiking': 'hiking_area',
        'trail': 'hiking_area',
        'campground': 'campground',
        'camping': 'campground',
        'marina': 'marina',
        'diving': 'diving',
        'cycling': 'cycling',
        'bike': 'cycling',
        'resort': 'resort',
        'garden': 'park',
        'botanical': 'park',
        'observatory': 'scenic_viewpoint',
        'lighthouse': 'historic_site',
        'palace': 'historic_site',
        'tower': 'monument',
        'bridge': 'historic_site',
        'square': 'historic_site',
        'fountain': 'monument',
        'statue': 'monument',
        'memorial': 'monument',
        'temple': 'historic_site', // Famous temples are tourist attractions
        'cathedral': 'historic_site', // Famous cathedrals are tourist attractions
        'mosque': 'historic_site', // Famous mosques are tourist attractions
      };

      for (const [keyword, category] of Object.entries(nameKeywords)) {
        if (name.includes(keyword)) {
          travelKey = category;
          break;
        }
      }
    }

    // If no travel category found, exclude
    if (!travelKey) {
      return {
        travelCategory: 'Excluded',
        travelTags: [],
        isTravelRelevant: false,
        exclusionReason: 'No travel category matched',
      };
    }

    const travelInfo = TRAVEL_CATEGORIES[travelKey];
    if (!travelInfo) {
      return {
        travelCategory: 'Excluded',
        travelTags: [],
        isTravelRelevant: false,
        exclusionReason: `Unknown travel key: ${travelKey}`,
      };
    }

    return {
      travelCategory: travelInfo.category,
      travelTags: travelInfo.tags,
      isTravelRelevant: true,
    };
  },

  /**
   * Filter an array of places to only include travel-relevant ones.
   */
  filterTravelRelevant(places: NearbyItem[]): NearbyItem[] {
    const filtered: NearbyItem[] = [];
    const excluded: string[] = [];

    for (const place of places) {
      const classification = this.classify(place);
      if (classification && classification.isTravelRelevant) {
        // Attach classification to the place
        (place as any).travelCategory = classification.travelCategory;
        (place as any).travelTags = classification.travelTags;
        filtered.push(place);
      } else if (classification) {
        excluded.push(`${place.name} (${classification.exclusionReason})`);
      }
    }

    if (excluded.length > 0) {
      console.log(`[TravelClassifier] Excluded ${excluded.length} non-travel places:`, excluded.slice(0, 5));
    }
    console.log(`[TravelClassifier] Filtered ${places.length} → ${filtered.length} travel-relevant places`);

    return filtered;
  },

  /**
   * Get all supported travel categories.
   */
  getTravelCategories(): string[] {
    return Object.values(TRAVEL_CATEGORIES).map(t => t.category);
  },

  /**
   * Check if a place type is blacklisted.
   */
  isBlacklisted(type: string): boolean {
    return BLACKLISTED_TYPES.has(type);
  },
};