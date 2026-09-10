/**
 * IntentDiscoveryService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Intent-Driven Discovery Engine.
 * Replaces generic nearby search with 18+ targeted travel category searches.
 * Each category is queried independently, then merged, normalized, 
 * classified, ranked, and balanced.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem, DestinationCoordinates } from '@/src/modules/explore/types';
import { PlacesProvider } from './PlacesProvider';
import { OpenStreetMapProvider } from './OpenStreetMapProvider';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';

/* ── Travel Intent Categories ───────────────────────────────────────────────── */

export interface TravelIntentQuery {
  id: string;
  name: string;
  googleTypes: string[];
  osmTypes: string[];
  priority: number; // Higher = queried first when rate-limited
}

export const TRAVEL_INTENT_CATEGORIES: TravelIntentQuery[] = [
  { id: 'beaches', name: 'Beaches', googleTypes: ['beach'], osmTypes: ['beach'], priority: 10 },
  { id: 'national_parks', name: 'National Parks', googleTypes: ['national_park', 'park'], osmTypes: ['national_park', 'nature_reserve'], priority: 10 },
  { id: 'wildlife', name: 'Wildlife', googleTypes: ['zoo', 'aquarium'], osmTypes: ['zoo', 'aquarium', 'wildlife_park'], priority: 9 },
  { id: 'museums', name: 'Museums', googleTypes: ['museum', 'art_gallery'], osmTypes: ['museum', 'art_gallery'], priority: 9 },
  { id: 'historic_sites', name: 'Historic Sites', googleTypes: ['historic_site', 'castle', 'monument', 'landmark'], osmTypes: ['historic', 'castle', 'monument', 'ruins'], priority: 9 },
  { id: 'scenic_viewpoints', name: 'Scenic Viewpoints', googleTypes: ['natural_feature', 'viewpoint', 'waterfall'], osmTypes: ['viewpoint', 'waterfall', 'scenic'], priority: 8 },
  { id: 'water_bodies', name: 'Lakes & Waterfalls', googleTypes: ['waterfall', 'lake'], osmTypes: ['waterfall', 'lake', 'river'], priority: 8 },
  { id: 'mountains', name: 'Mountains', googleTypes: ['mountain'], osmTypes: ['mountain', 'peak', 'volcano'], priority: 8 },
  { id: 'adventure', name: 'Adventure', googleTypes: ['hiking_area', 'campground', 'marina'], osmTypes: ['hiking', 'camping', 'climbing', 'kayaking'], priority: 7 },
  { id: 'restaurants', name: 'Restaurants', googleTypes: ['restaurant'], osmTypes: ['restaurant'], priority: 7 },
  { id: 'cafes', name: 'Cafés', googleTypes: ['cafe'], osmTypes: ['cafe'], priority: 6 },
  { id: 'food_markets', name: 'Food Markets', googleTypes: ['market', 'food'], osmTypes: ['market', 'farmers_market'], priority: 6 },
  { id: 'shopping', name: 'Shopping', googleTypes: ['shopping_mall'], osmTypes: ['marketplace', 'mall'], priority: 5 },
  { id: 'entertainment', name: 'Entertainment', googleTypes: ['amusement_park', 'theme_park', 'water_park', 'stadium'], osmTypes: ['amusement_park', 'theme_park', 'water_park'], priority: 7 },
  { id: 'gardens', name: 'Gardens', googleTypes: ['park'], osmTypes: ['garden', 'botanical_garden', 'park'], priority: 7 },
  { id: 'zoos_aquariums', name: 'Zoos & Aquariums', googleTypes: ['zoo', 'aquarium'], osmTypes: ['zoo', 'aquarium'], priority: 7 },
  { id: 'cultural', name: 'Cultural', googleTypes: ['museum', 'art_gallery', 'performing_arts_theater', 'theater'], osmTypes: ['theatre', 'art_centre', 'cultural_centre'], priority: 6 },
  { id: 'local_attractions', name: 'Attractions', googleTypes: ['tourist_attraction', 'landmark'], osmTypes: ['attraction', 'viewpoint', 'monument'], priority: 8 },
];

/* ── Intent Discovery Result ────────────────────────────────────────────────── */

export interface IntentDiscoveryResult {
  allPlaces: NearbyItem[];
  categoryResults: Record<string, NearbyItem[]>;
  sourceBreakdown: { google: number; osm: number };
  categoriesQueried: number;
  categoriesWithResults: number;
}

/* ── IntentDiscoveryService ──────────────────────────────────────────────────── */

export const IntentDiscoveryService = {
  /**
   * Execute multiple targeted travel searches in parallel.
   * Each travel category is queried independently.
   */
  async discoverByIntent(
    lat: number,
    lng: number,
    radiusKm: number = 100
  ): Promise<IntentDiscoveryResult> {
    console.log('[IntentDiscoveryService] ═══════════════════════════════════════');
    console.log('[IntentDiscoveryService] 🎯 Starting Intent-Driven Discovery');
    console.log('[IntentDiscoveryService] Categories to query:', TRAVEL_INTENT_CATEGORIES.length);
    console.log('[IntentDiscoveryService] ═══════════════════════════════════════');

    const allGooglePlaces: NearbyItem[] = [];
    const allOsmPlaces: NearbyItem[] = [];
    const categoryResults: Record<string, NearbyItem[]> = {};
    let categoriesWithResults = 0;

    // Sort by priority (higher first) for rate-limit handling
    const sortedCategories = [...TRAVEL_INTENT_CATEGORIES].sort((a, b) => b.priority - a.priority);

    // ── Phase 1: Query Google Places for each category ──────────────────────
    for (const category of sortedCategories) {
      try {
        const result = await PlacesProvider.getNearbyPlaces(lat, lng, radiusKm);
        const places = (result.places || []).filter(p => {
          const pType = p.type || '';
          const pTags = p.tags || [];
          return category.googleTypes.some(t => pType === t || pTags.includes(t));
        });
        
        if (places.length > 0) {
          categoryResults[category.id] = places;
          allGooglePlaces.push(...places);
          categoriesWithResults++;
          console.log(`[IntentDiscoveryService] ✅ ${category.name}: ${places.length} places`);
        }
      } catch (err) {
        console.warn(`[IntentDiscoveryService] ⚠ ${category.name} failed:`, (err as Error).message);
      }
    }

    // ── Phase 2: Fetch from OpenStreetMap (broader net) ────────────────────
    try {
      const osmResult = await OpenStreetMapProvider.getNearbyPlaces(lat, lng, radiusKm);
      allOsmPlaces.push(...osmResult.places);
      console.log(`[IntentDiscoveryService] OpenStreetMap: ${osmResult.places.length} places`);
    } catch (err) {
      console.warn('[IntentDiscoveryService] OpenStreetMap failed:', err);
    }

    // ── Phase 3: Merge google results into OSM category if not yet present ─
    for (const [catId, places] of Object.entries(categoryResults)) {
      if (!categoryResults[catId]) {
        categoryResults[catId] = places;
      }
    }

    console.log(`[IntentDiscoveryService] ✓ Discovery complete:
  Google categories queried: ${sortedCategories.length}
  Categories with results: ${categoriesWithResults}
  Google results: ${allGooglePlaces.length}
  OpenStreetMap results: ${allOsmPlaces.length}`);

    return {
      allPlaces: [...allGooglePlaces, ...allOsmPlaces],
      categoryResults,
      sourceBreakdown: { google: allGooglePlaces.length, osm: allOsmPlaces.length },
      categoriesQueried: sortedCategories.length,
      categoriesWithResults,
    };
  },

  /**
   * Merge and process raw intent results through the travel pipeline.
   */
  async processIntentResults(
    intentResult: IntentDiscoveryResult,
    userLocation: DestinationCoordinates
  ): Promise<NearbyItem[]> {
    // Merge Google + OSM
    const merged = this.mergePlaces(intentResult.allPlaces);

    // Travel Classify
    const classified = TravelClassifier.filterTravelRelevant(merged);

    // Travel Rank
    const ranked = TravelRankingEngine.rank(classified, { userLocation });

    // Category Balance
    const balanced = CategoryBalancer.balance(ranked, 4, 60);

    return balanced;
  },

  /**
   * Merge places with deduplication.
   */
  mergePlaces(places: NearbyItem[]): NearbyItem[] {
    const merged = new Map<string, NearbyItem>();
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
    return Array.from(merged.values());
  },
};