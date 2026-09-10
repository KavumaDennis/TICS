/**
 * TravelRankingEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ranks places by travel relevance score.
 * Every place receives a Travel Score based on multiple weighted factors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem, Destination } from '@/src/modules/explore/types';

/* ── Scoring Weights ─────────────────────────────────────────────────────────── */

const SCORE_WEIGHTS = {
  RATING: 0.15,        // Rating (only when REAL data exists — never fabricated)
  REVIEW_COUNT: 0.10,  // Review count (only when REAL data exists)
  CATEGORY_PRIORITY: 0.25, // Travel category priority
  DISTANCE: 0.15,      // Proximity to user
  COMPLETENESS: 0.15,  // Data completeness (website/hours/images/description)
  PHOTOS: 0.10,        // Has photos
  CURATED: 0.05,       // Firestore curated / provider confidence
  OPEN_NOW: 0.05,      // Currently open
};

/**
 * When no review data exists (typical for OSM), the RATING + REVIEW_COUNT
 * weight is REDISTRIBUTED to category priority and completeness instead of
 * silently scoring everything 0. No fake ratings are ever invented.
 */
function effectiveWeights(hasReviewData: boolean) {
  if (hasReviewData) return SCORE_WEIGHTS;
  const freed = SCORE_WEIGHTS.RATING + SCORE_WEIGHTS.REVIEW_COUNT;
  return {
    ...SCORE_WEIGHTS,
    RATING: 0,
    REVIEW_COUNT: 0,
    CATEGORY_PRIORITY: SCORE_WEIGHTS.CATEGORY_PRIORITY + freed * 0.6,
    COMPLETENESS: SCORE_WEIGHTS.COMPLETENESS + freed * 0.4,
  };
}

/* ── Category Priority Scores ────────────────────────────────────────────────── */

const CATEGORY_PRIORITY: Record<string, number> = {
  // Highest priority - must-see destinations
  'National Park': 100,
  'Beach': 95,
  'Safari': 95,
  'Wildlife Park': 90,
  'Waterfall': 90,
  'Island': 90,
  'Scenic Viewpoint': 85,
  'Historic Site': 85,
  'Museum': 80,
  'Lake': 80,
  'Mountain': 80,
  'Nature Reserve': 80,
  'Castle': 80,
  'Monument': 75,
  'Archaeological Site': 75,
  'Art Gallery': 70,
  'Amusement Park': 70,
  'Theme Park': 70,
  'Water Park': 65,
  'Zoo': 65,
  'Aquarium': 65,
  'Forest': 65,
  'Park': 60,
  'Hiking Area': 60,
  'Campground': 55,
  'Marina': 50,
  'Diving Spot': 60,
  'Cycling Route': 50,
  'Live Music Venue': 60,
  'Theater': 60,
  'Restaurant': 55,
  'Café': 45,
  'Rooftop Bar': 50,
  'Brewery': 45,
  'Food Market': 55,
  'Shopping Mall': 40,
  'Artisan Market': 55,
  'Local Market': 55,
};

/* ── TravelRankingEngine ─────────────────────────────────────────────────────── */

export const TravelRankingEngine = {
  /**
   * Calculate a travel score for a place.
   */
  calculateScore(
    place: NearbyItem | Destination,
    options?: {
      userLocation?: { lat: number; lng: number };
      hasNearbyEvents?: boolean;
    }
  ): number {
    const rating = (place as any).rating || 0;
    const reviewCount = (place as any).reviewCount || 0;
    // Only treat review data as a signal when it genuinely exists.
    const hasReviewData = rating > 0 && rating <= 5;
    const W = effectiveWeights(hasReviewData);

    let score = 0;

    // 1. Rating score (only with real data)
    if (hasReviewData) {
      score += (rating / 5) * 100 * W.RATING;
    }

    // 2. Review count score (only with real data)
    if (hasReviewData) {
      const reviewScore = Math.min(100, (reviewCount / 1000) * 100);
      score += reviewScore * W.REVIEW_COUNT;
    }

    // 3. Travel category priority
    const travelCategory = (place as any).travelCategory;
    if (travelCategory && CATEGORY_PRIORITY[travelCategory]) {
      score += CATEGORY_PRIORITY[travelCategory] * W.CATEGORY_PRIORITY;
    } else {
      score += 50 * W.CATEGORY_PRIORITY;
    }

    // 4. Distance score - closer is better
    const distance = (place as any).distance || 0;
    if (distance > 0 && options?.userLocation) {
      if (distance >= 1 && distance <= 50) {
        score += 100 * W.DISTANCE;
      } else if (distance < 1) {
        score += 60 * W.DISTANCE; // Too close
      } else if (distance <= 100) {
        score += 80 * W.DISTANCE;
      } else if (distance <= 200) {
        score += 50 * W.DISTANCE;
      } else {
        score += 20 * W.DISTANCE; // Too far
      }
    } else {
      score += 50 * W.DISTANCE;
    }

    // 5. Data completeness (website / hours / description / tags)
    const meta = ((place as any).metadata || {}) as Record<string, unknown>;
    let completeness = 0;
    if ((place as any).website) completeness += 30;
    if ((place as any).openingHours) completeness += 25;
    if ((place as any).description) completeness += 25;
    if (((place as any).tags || []).length > 1) completeness += 20;
    if (typeof meta.qualityScore === 'number') {
      completeness = Math.max(completeness, Math.round(meta.qualityScore * 100));
    }
    score += completeness * W.COMPLETENESS;

    // 6. Photos available
    const images = (place as any).images || (place as any).imageUrl;
    if (images) {
      if (Array.isArray(images) && images.length > 0) {
        score += 100 * W.PHOTOS;
      } else if (typeof images === 'string' && images.length > 0) {
        score += 80 * W.PHOTOS;
      }
    }

    // 7. Curated / provider confidence bonus
    const curated =
      meta.curated === true ||
      typeof meta.wikidataId === 'string' ||
      (typeof (place as any).sourceConfidence === 'number' &&
        (place as any).sourceConfidence >= 0.9);
    if (curated) {
      score += 100 * W.CURATED;
    }

    // 8. Open now bonus
    const openNow = (place as any).openNow;
    if (openNow === true) {
      score += 100 * W.OPEN_NOW;
    }

    // 9. Nearby events bonus (kept for compatibility)
    if (options?.hasNearbyEvents) {
      score += 5;
    }

    return Math.round(score);
  },

  /**
   * Rank an array of places by travel score descending.
   */
  rank<T extends NearbyItem | Destination>(
    places: T[],
    options?: {
      userLocation?: { lat: number; lng: number };
      hasNearbyEvents?: boolean;
      topN?: number;
    }
  ): T[] {
    const scored = places.map((place) => ({
      place,
      score: this.calculateScore(place, options),
    }));

    scored.sort((a, b) => b.score - a.score);

    const topN = options?.topN || places.length;
    const ranked = scored.slice(0, topN).map(s => s.place);

    console.log(`[TravelRankingEngine] Ranked ${places.length} places, top scores:`,
      scored.slice(0, 5).map(s => `${(s.place as any).name}: ${s.score}`)
    );

    return ranked;
  },

  /**
   * Get the category priority for a travel category.
   */
  getCategoryPriority(category: string): number {
    return CATEGORY_PRIORITY[category] || 50;
  },
};