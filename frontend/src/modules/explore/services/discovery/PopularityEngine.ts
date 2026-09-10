/**
 * PopularityEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API-first Popularity Engine.
 *
 * Popularity is now COMPUTED from live Google Places + OpenStreetMap data
 * through the shared ProviderDataCoordinator (deduplicated).
 *
 * Popularity Score =
 *   Review count * rating * 0.40 +
 *   Travel category priority * 0.25 +
 *   Nearby attractions * 0.15 +
 *   Nearby restaurants * 0.10 +
 *   Nearby events * 0.10
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, NearbyItem } from '@/src/modules/explore/types';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface PopularDestination extends Destination {
  popularityScore: number;
  source: 'google' | 'osm' | 'firestore';
}

interface PopularityResult {
  destinations: PopularDestination[];
  computedAt: number;
  sourceBreakdown: { google: number; osm: number; firestore: number };
  firestoreReason?: string;
}

/* ── Minimum thresholds before Firestore fallback ────────────────────────────── */

const MIN_POPULAR_REQUIRED = 15;

/* ── Convert NearbyItem to PopularDestination ────────────────────────────────── */

function nearbyToPopular(
  place: NearbyItem,
  source: 'google' | 'osm',
  score: number
): PopularDestination {
  return {
    id: place.id,
    name: place.name,
    slug: place.name.toLowerCase().replace(/\s+/g, '-'),
    description: place.description || '',
    country: '',
    countryCode: '',
    city: '',
    coordinates: place.coordinates,
    images: place.imageUrl ? [{ url: place.imageUrl, caption: '', credit: '' }] : [],
    categories: [(place as any).travelCategory || 'attraction'],
    travelTips: [],
    nearbyAirport: null,
    nearbyHotels: [],
    nearbyAttractions: [],
    weatherSummary: null,
    bestSeason: '',
    bestTimeToVisit: '',
    popularity: place.rating || 0,
    rating: place.rating || 0,
    reviewCount: place.reviewCount || 0,
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
    popularityScore: score,
    source,
  };
}

/* ── PopularityEngine ────────────────────────────────────────────────────────── */

export const PopularityEngine = {
  /**
   * Compute popular destinations from live API data.
   * Firestore is only used as fallback if APIs return < 15 results.
   */
  async getPopularDestinations(
    lat?: number,
    lng?: number
  ): Promise<PopularityResult> {
    const sourceBreakdown = { google: 0, osm: 0, firestore: 0 };
    let firestoreReason: string | undefined;

    console.log('[PopularityEngine] ═══════════════════════════════════════');
    console.log('[PopularityEngine] Computing popular from live APIs...');
    console.log('[PopularityEngine] ═══════════════════════════════════════');

    // ── Step 1: Fetch through the OSM-first coordinator ─────────────────────
    // Google Places is optional enrichment handled inside the aggregator;
    // no direct Places request is made here (zero requests when disabled).
    let allOsmPlaces: NearbyItem[] = [];

    try {
      const osmResult = await ProviderDataCoordinator.getOpenStreetMap(lat || 0, lng || 0, 100);
      allOsmPlaces = osmResult.places;
      console.log(`[PopularityEngine] OpenStreetMap+Curated: ${allOsmPlaces.length} places`);
    } catch (err) {
      console.warn('[PopularityEngine] OpenStreetMap failed:', err);
    }

    // ── Step 2: Merge and classify ──────────────────────────────────────────
    const merged = this.mergePlaces(allOsmPlaces);
    console.log(`[PopularityEngine] Combined: ${merged.length} places`);

    const travelFiltered = TravelClassifier.filterTravelRelevant(merged);
    console.log(`[PopularityEngine] TravelClassifier: ${merged.length} → ${travelFiltered.length}`);

    // ── Step 3: Rank with the shared ranking engine (works without reviews) ─
    const ranked = TravelRankingEngine.rank(travelFiltered, { topN: 40 });

    // ── Step 4: Balance categories (won't collapse small pools) ─────────────
    const balanced = CategoryBalancer.balance(ranked, 5, 20);

    // ── Step 5: Convert to PopularDestinations ──────────────────────────────
    let popular: PopularDestination[] = balanced.map((place) => {
      const source: 'google' | 'osm' = 'osm';
      const score = (place.reviewCount || 0) * (place.rating || 0);
      return nearbyToPopular(place, source, score);
    });

    // Track sources
    for (const p of popular) {
      sourceBreakdown[p.source]++;
    }

    // ── Step 6: Firestore fallback if insufficient ──────────────────────────
    if (popular.length < MIN_POPULAR_REQUIRED) {
      firestoreReason = `Live candidates: ${popular.length}. Required: ${MIN_POPULAR_REQUIRED}.`;
      console.log(`[PopularityEngine] ⚠ ${firestoreReason} Injecting Firestore fallback...`);

      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: MIN_POPULAR_REQUIRED - popular.length + 5,
        });

        const existingIds = new Set(popular.map(p => p.id));
        for (const dest of firestoreResult.data) {
          if (!existingIds.has(dest.id) && popular.length < MIN_POPULAR_REQUIRED) {
            popular.push({
              ...dest,
              popularityScore: 50,
              source: 'firestore',
            });
            sourceBreakdown.firestore++;
            existingIds.add(dest.id);
          }
        }
      } catch (err) {
        console.warn('[PopularityEngine] Firestore fallback also failed:', err);
      }
    }

    // ── Step 7: Sort by score descending ────────────────────────────────────
    popular.sort((a, b) => b.popularityScore - a.popularityScore);

    console.log(`[PopularityEngine] ✓ Popular computed:
  Live (OSM): ${sourceBreakdown.google + sourceBreakdown.osm}
  OSM: ${sourceBreakdown.osm}
  Firestore: ${sourceBreakdown.firestore}${firestoreReason ? `\n  ⚠ Firestore reason: ${firestoreReason}` : ''}`);

    return {
      destinations: popular.slice(0, 20),
      computedAt: Date.now(),
      sourceBreakdown,
      firestoreReason,
    };
  },

  /**
   * Merge places from multiple providers.
   */
  mergePlaces(...placeArrays: NearbyItem[][]): NearbyItem[] {
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
};