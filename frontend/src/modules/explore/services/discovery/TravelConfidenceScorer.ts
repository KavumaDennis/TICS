/**
 * TravelConfidenceScorer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates a recommendation confidence score (1-5) for every destination.
 * 
 * ★★★★★ Highly Recommended - Exceptional quality, complete data
 * ★★★★ Recommended - High quality, reliable recommendation
 * ★★★ Worth Visiting - Good quality, may lack some data
 * ★★ Hidden Gem - Niche appeal or limited data
 * ★ Basic - Minimal data available, use with caution
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { NearbyItem } from '@/src/modules/explore/types';

export type ConfidenceLevel = 1 | 2 | 3 | 4 | 5;

export interface ConfidenceResult {
  level: ConfidenceLevel;
  stars: string;
  label: string;
  score: number; // 0-100
  factors: {
    dataCompleteness: number; // 0-100
    reviewConfidence: number; // 0-100
    providerAgreement: number; // 0-100
    photoAvailability: number; // 0-100
    categoryQuality: number; // 0-100
  };
}

/* ── Confidence Labels ──────────────────────────────────────────────────────── */

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  5: 'Highly Recommended',
  4: 'Recommended',
  3: 'Worth Visiting',
  2: 'Hidden Gem',
  1: 'Basic',
};

/* ── TravelConfidenceScorer ──────────────────────────────────────────────────── */

export const TravelConfidenceScorer = {
  /**
   * Calculate confidence score for a place.
   */
  calculate(place: NearbyItem): ConfidenceResult {
    const factors = {
      dataCompleteness: this.calculateDataCompleteness(place),
      reviewConfidence: this.calculateReviewConfidence(place),
      providerAgreement: this.calculateProviderAgreement(place),
      photoAvailability: this.calculatePhotoAvailability(place),
      categoryQuality: this.calculateCategoryQuality(place),
    };

    // Weighted total score
    const totalScore = Math.round(
      factors.dataCompleteness * 0.25 +
      factors.reviewConfidence * 0.25 +
      factors.providerAgreement * 0.15 +
      factors.photoAvailability * 0.15 +
      factors.categoryQuality * 0.20
    );

    // Map to confidence level
    const level = this.scoreToLevel(totalScore);
    const stars = '★'.repeat(level) + '☆'.repeat(5 - level);

    return {
      level,
      stars,
      label: CONFIDENCE_LABELS[level],
      score: totalScore,
      factors,
    };
  },

  /**
   * Calculate data completeness score.
   */
  calculateDataCompleteness(place: NearbyItem): number {
    let score = 0;
    let checks = 0;

    // Has name
    if (place.name && place.name.length > 0) { score += 20; }
    checks += 20;

    // Has description
    if (place.description && place.description.length > 10) { score += 20; }
    checks += 20;

    // Has valid coordinates
    if (place.coordinates && place.coordinates.lat !== 0 && place.coordinates.lng !== 0) { score += 15; }
    checks += 15;

    // Has rating
    if (place.rating && place.rating > 0) { score += 15; }
    checks += 15;

    // Has images
    if (place.imageUrl && place.imageUrl.length > 0) { score += 15; }
    checks += 15;

    // Has travel category
    if ((place as any).travelCategory) { score += 15; }
    checks += 15;

    return Math.round((score / checks) * 100);
  },

  /**
   * Calculate review confidence score.
   */
  calculateReviewConfidence(place: NearbyItem): number {
    const rating = place.rating || 0;
    const reviewCount = place.reviewCount || 0;

    // Rating contributes up to 50 points
    const ratingScore = (rating / 5) * 50;

    // Review count contributes up to 50 points
    let reviewScore = 0;
    if (reviewCount >= 1000) reviewScore = 50;
    else if (reviewCount >= 500) reviewScore = 45;
    else if (reviewCount >= 100) reviewScore = 35;
    else if (reviewCount >= 50) reviewScore = 25;
    else if (reviewCount >= 10) reviewScore = 15;
    else if (reviewCount > 0) reviewScore = 5;

    return Math.round(ratingScore + reviewScore);
  },

  /**
   * Calculate provider agreement score.
   * Higher if both Google Places and OSM returned similar data.
   */
  calculateProviderAgreement(place: NearbyItem): number {
    // Currently we don't track which provider returned what.
    // Default to medium confidence since Google Places is reliable.
    const provider = (place as any).provider;
    if (provider === 'google_places') return 80;
    if (provider === 'openstreetmap') return 60;
    return 50;
  },

  /**
   * Calculate photo availability score.
   */
  calculatePhotoAvailability(place: NearbyItem): number {
    if (place.imageUrl && place.imageUrl.length > 0) {
      return 80; // Has a photo
    }
    return 20; // No photo
  },

  /**
   * Calculate category quality score.
   * Higher priority travel categories get higher scores.
   */
  calculateCategoryQuality(place: NearbyItem): number {
    const category = (place as any).travelCategory || '';
    
    const qualityMap: Record<string, number> = {
      'National Park': 95,
      'Beach': 90,
      'Safari': 95,
      'Wildlife Park': 90,
      'Waterfall': 85,
      'Island': 85,
      'Historic Site': 85,
      'Museum': 80,
      'Scenic Viewpoint': 80,
      'Lake': 75,
      'Mountain': 75,
      'Nature Reserve': 80,
      'Castle': 80,
      'Monument': 75,
      'Archaeological Site': 75,
      'Art Gallery': 70,
      'Amusement Park': 70,
      'Theme Park': 70,
      'Zoo': 65,
      'Aquarium': 65,
      'Park': 60,
      'Restaurant': 55,
      'Café': 45,
      'Shopping Mall': 40,
      'Hiking Area': 60,
    };

    return qualityMap[category] || 50;
  },

  /**
   * Map score (0-100) to confidence level (1-5).
   */
  scoreToLevel(score: number): ConfidenceLevel {
    if (score >= 80) return 5;
    if (score >= 60) return 4;
    if (score >= 40) return 3;
    if (score >= 20) return 2;
    return 1;
  },
};