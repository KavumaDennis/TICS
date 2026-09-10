/**
 * TrendingEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API-first Trending Engine.
 *
 * Trending is now COMPUTED from live Google Places + OpenStreetMap data
 * through the shared ProviderDataCoordinator (deduplicated).
 *
 * Trending Score =
 *   Google rating * 0.30 +
 *   Review count * 0.20 +
 *   Travel category priority * 0.20 +
 *   Distance * 0.10 +
 *   Photos available * 0.10 +
 *   Open now * 0.05 +
 *   Nearby events * 0.05
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, NearbyItem } from '@/src/modules/explore/types';
import { ProviderDataCoordinator } from './ProviderDataCoordinator';
import { TravelClassifier } from './TravelClassifier';
import { TravelRankingEngine } from './TravelRankingEngine';
import { CategoryBalancer } from './CategoryBalancer';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface TrendingDestination extends Destination {
  trendingScore: number;
  source: 'google' | 'osm' | 'firestore';
}

interface TrendingResult {
  destinations: TrendingDestination[];
  computedAt: number;
  sourceBreakdown: { google: number; osm: number; firestore: number };
  firestoreReason?: string;
}

/* ── Minimum thresholds before Firestore fallback ────────────────────────────── */

const MIN_TRENDING_REQUIRED = 15;

/* ── Convert NearbyItem to TrendingDestination ───────────────────────────────── */

function nearbyToTrending(
  place: NearbyItem,
  source: 'google' | 'osm',
  score: number
): TrendingDestination {
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
    trendingScore: score,
    source,
  };
}

/* ── TrendingEngine ──────────────────────────────────────────────────────────── */

export const TrendingEngine = {
  /**
   * Compute trending destinations from live API data.
   * Firestore is only used as fallback if APIs return < 15 results.
   */
  async getTrendingDestinations(
    lat?: number,
    lng?: number
  ): Promise<TrendingResult> {
    const sourceBreakdown = { google: 0, osm: 0, firestore: 0 };
    let firestoreReason: string | undefined;

    console.log('[TrendingEngine] ═══════════════════════════════════════');
    console.log('[TrendingEngine] Computing trending from live APIs...');
    console.log('[TrendingEngine] ═══════════════════════════════════════');

    // ── Step 1: Fetch through the OSM-first coordinator (OSM + curated) ─────
    let allOsmPlaces: NearbyItem[] = [];

    try {
      const osmResult = await ProviderDataCoordinator.getOpenStreetMap(lat || 0, lng || 0, 100);
      allOsmPlaces = osmResult.places;
      console.log(`[TrendingEngine] OpenStreetMap + Curated: ${allOsmPlaces.length} places`);
    } catch (err) {
      console.warn('[TrendingEngine] OpenStreetMap failed:', err);
    }

    // ── Step 2: Merge and classify ──────────────────────────────────────────
    const merged = this.mergePlaces(allOsmPlaces);
    console.log(`[TrendingEngine] Combined: ${merged.length} places`);

    const travelFiltered = TravelClassifier.filterTravelRelevant(merged);
    console.log(`[TrendingEngine] TravelClassifier: ${merged.length} → ${travelFiltered.length}`);

    // ── Step 3: Rank by travel score ────────────────────────────────────────
    const ranked = TravelRankingEngine.rank(travelFiltered, {
      userLocation: lat && lng ? { lat, lng } : undefined,
    });

    // ── Step 4: Balance categories (won't collapse small pools) ─────────────
    const balanced = CategoryBalancer.balance(ranked, 5, 20);

    // ── Step 5: Convert to TrendingDestinations ─────────────────────────────
    let trending: TrendingDestination[] = balanced.map((place) => {
      // OSM (and Firestore curated merged upstream) is the live source now.
      const source: 'google' | 'osm' = 'osm';
      const score = TravelRankingEngine.calculateScore(place, {
        userLocation: lat && lng ? { lat, lng } : undefined,
      });
      return nearbyToTrending(place, source, score);
    });

    // Track sources
    for (const t of trending) {
      sourceBreakdown[t.source]++;
    }

    // ── Step 6: Firestore fallback if insufficient ──────────────────────────
    if (trending.length < MIN_TRENDING_REQUIRED) {
      firestoreReason = `Live candidates: ${trending.length}. Required: ${MIN_TRENDING_REQUIRED}.`;
      console.log(`[TrendingEngine] ⚠ ${firestoreReason} Injecting Firestore fallback...`);

      try {
        const firestoreResult = await ExploreService.loadDestinations({
          pageSize: MIN_TRENDING_REQUIRED - trending.length + 10,
        });

        const existingIds = new Set(trending.map(t => t.id));
        for (const dest of firestoreResult.data) {
          if (!existingIds.has(dest.id) && trending.length < MIN_TRENDING_REQUIRED) {
            trending.push({
              ...dest,
              trendingScore: 50,
              source: 'firestore',
            });
            sourceBreakdown.firestore++;
            existingIds.add(dest.id);
          }
        }
      } catch (err) {
        console.warn('[TrendingEngine] Firestore fallback also failed:', err);
      }
    }

    // ── Step 7: Sort by score descending ────────────────────────────────────
    trending.sort((a, b) => b.trendingScore - a.trendingScore);

    console.log(`[TrendingEngine] ✓ Trending computed:
  Live (OSM+Curated): ${sourceBreakdown.google + sourceBreakdown.osm}
  OSM: ${sourceBreakdown.osm}
  Firestore: ${sourceBreakdown.firestore}${firestoreReason ? `\n  ⚠ Firestore reason: ${firestoreReason}` : ''}`);

    return {
      destinations: trending.slice(0, 20),
      computedAt: Date.now(),
      sourceBreakdown,
      firestoreReason,
    };
  },

  /**
   * Merge places from multiple providers, deduplicating by coordinates.
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