/**
 * DiscoveryRankingService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ranks discovery candidates using multiple factors:
 *  - Personal preference match
 *  - Distance
 *  - Travel relevance
 *  - Rating
 *  - Popularity
 *  - Current season
 *  - Weather suitability
 *  - Event date
 *  - User history
 *  - Saved preferences
 *  - Novelty
 *  - Trip compatibility
 *
 * Also ensures category and destination diversity to avoid
 * showing ten identical recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  DiscoveryCandidate,
  AIRecommendation,
  DiscoveryUserContext,
  DiscoveryCandidateType,
} from './types';

/* ── Ranking Weights ────────────────────────────────────────────────────────── */

const WEIGHTS = {
  PERSONAL_MATCH: 0.30,
  DISTANCE: 0.15,
  RATING: 0.10,
  POPULARITY: 0.10,
  SEASON: 0.05,
  WEATHER: 0.05,
  TRIP_COMPATIBILITY: 0.15,
  NOVELTY: 0.05,
  DIVERSITY: 0.05,
  TOTAL: 1.0,
};

/* ── Helper Functions ───────────────────────────────────────────────────────── */

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

function getSeasonScore(candidate: DiscoveryCandidate): number {
  const season = getCurrentSeason();
  const bestTime = (candidate.bestTimeToVisit || '').toLowerCase();
  if (!bestTime) return 0.5; // Neutral
  if (bestTime.includes(season)) return 1.0;
  // Check for partial match
  const seasonMap: Record<string, string[]> = {
    spring: ['march', 'april', 'may', 'spring'],
    summer: ['june', 'july', 'august', 'summer'],
    fall: ['september', 'october', 'november', 'fall', 'autumn'],
    winter: ['december', 'january', 'february', 'winter'],
  };
  const keywords = seasonMap[season] || [];
  if (keywords.some((k) => bestTime.includes(k))) return 1.0;
  return 0.4;
}

function getWeatherScore(candidate: DiscoveryCandidate, context: DiscoveryUserContext): number {
  if (!context.weather?.weatherMain || !candidate.weatherSuitability) return 0.5;
  const isRainy = ['rain', 'thunderstorm', 'drizzle', 'snow'].includes(context.weather.weatherMain);
  if (isRainy && candidate.weatherSuitability === 'indoor') return 1.0;
  if (isRainy && candidate.weatherSuitability === 'outdoor') return 0.2;
  if (!isRainy && candidate.weatherSuitability === 'outdoor') return 1.0;
  if (!isRainy && candidate.weatherSuitability === 'indoor') return 0.6;
  return 0.5;
}

function getEventDateScore(candidate: DiscoveryCandidate): number {
  if (!candidate.startDate) return 0.5;
  const startDate = new Date(candidate.startDate).getTime();
  const now = Date.now();
  const daysUntil = (startDate - now) / (1000 * 60 * 60 * 24);

  // Closest events (within 30 days) score highest
  if (daysUntil < 0) return 0; // Expired
  if (daysUntil <= 7) return 1.0;
  if (daysUntil <= 14) return 0.9;
  if (daysUntil <= 30) return 0.8;
  if (daysUntil <= 60) return 0.6;
  if (daysUntil <= 90) return 0.4;
  return 0.2;
}

function getTripCompatibilityScore(candidate: DiscoveryCandidate, context: DiscoveryUserContext): number {
  if (!context.activeTrip) return 0.5;
  const tripDest = (context.activeTrip.destination || '').toLowerCase();
  const candidateName = (candidate.title || '').toLowerCase();

  // If candidate is at or near trip destination
  if (candidateName.includes(tripDest) || tripDest.includes(candidateName)) return 1.0;

  // If candidate is near trip destination coordinates
  if (candidate.coordinates && context.activeTrip.destinationCoordinates) {
    const distance = haversineDistance(candidate.coordinates, context.activeTrip.destinationCoordinates);
    if (distance <= 30) return 0.9;
    if (distance <= 100) return 0.7;
    if (distance <= 300) return 0.5;
  }

  // Trip stage-based adjustments
  if (context.tripStage === 'pre_departure') {
    // Before trip: packing + things to do at destination
    if (candidateName.includes(tripDest)) return 1.0;
    if (candidate.type === 'destination' || candidate.type === 'attraction') return 0.7;
  } else if (context.tripStage === 'during_trip') {
    // During trip: nearby experiences
    if (candidate.distanceKm !== undefined && candidate.distanceKm <= 30) return 0.8;
    if (candidate.distanceKm !== undefined && candidate.distanceKm <= 100) return 0.6;
  }

  return 0.4;
}

function haversineDistance(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const R = 6371;
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

/* ── DiscoveryRankingService ───────────────────────────────────────────────── */

export const DiscoveryRankingService = {
  /**
   * Rank candidates using the weighted scoring system.
   * Returns scored recommendations sorted by relevance.
   */
  rankCandidates(
    candidates: DiscoveryCandidate[],
    context: DiscoveryUserContext,
    personalScores: Map<string, number>
  ): AIRecommendation[] {
    const season = getCurrentSeason();
    const isRainy = ['rain', 'thunderstorm', 'drizzle', 'snow'].includes((context.weather?.weatherMain || '').toLowerCase());

    const scored = candidates.map((candidate) => {
      // Personalization score from DiscoveryPersonalizationService
      const personalScore = personalScores.get(candidate.id) ?? 50;

      // Normalize personal score (50-100 range → 0-1)
      const personalMatch = Math.max(0, Math.min(1, (personalScore - 20) / 80));

      // Distance score (closer = better, up to 200km)
      let distanceScore = 0.5;
      if (candidate.distanceKm !== undefined) {
        if (candidate.distanceKm <= 5) distanceScore = 1.0;
        else if (candidate.distanceKm <= 15) distanceScore = 0.9;
        else if (candidate.distanceKm <= 50) distanceScore = 0.8;
        else if (candidate.distanceKm <= 100) distanceScore = 0.6;
        else if (candidate.distanceKm <= 500) distanceScore = 0.4;
        else if (candidate.distanceKm <= 1500) distanceScore = 0.3;
        else distanceScore = 0.2;

        // Give international destinations a boost when user prefers international
        if (context.localVsRegionalVsInternational === 'international' && candidate.distanceKm > 500) {
          distanceScore = 0.7;
        }
      }

      // Rating score
      const ratingScore = candidate.rating ? Math.max(0, Math.min(1, (candidate.rating - 2) / 3)) : 0.5;

      // Popularity score (normalize by 100)
      const popularityScore = candidate.popularity ? Math.max(0, Math.min(1, candidate.popularity / 100)) : 0.5;

      // Season score
      const seasonScore = getSeasonScore(candidate);

      // Weather score
      const weatherScore = getWeatherScore(candidate, context);

      // Event date score
      const eventDateScore = getEventDateScore(candidate);

      // Trip compatibility
      const tripScore = getTripCompatibilityScore(candidate, context);

      // Novelty score (hidden gems, less-known places get a boost)
      let noveltyScore = 0.5;
      if (candidate.type === 'hidden_gem') noveltyScore = 0.9;
      if ((candidate.tags || []).some((t) => t.toLowerCase().includes('hidden'))) noveltyScore = 0.8;
      if (candidate.reviewCount && candidate.reviewCount < 10) noveltyScore = 0.7;
      if (candidate.popularity && candidate.popularity > 80) noveltyScore = 0.3;

      // Diversity score (calculated later in ranking)
      const diversityScore = 0.5;

      // Normalize weights to sum to 1
      const totalWeight = WEIGHTS.PERSONAL_MATCH + WEIGHTS.DISTANCE + WEIGHTS.RATING +
        WEIGHTS.POPULARITY + WEIGHTS.SEASON + WEIGHTS.WEATHER +
        WEIGHTS.TRIP_COMPATIBILITY + WEIGHTS.NOVELTY + WEIGHTS.TOTAL;

      const finalScore = Math.round((
        personalMatch * WEIGHTS.PERSONAL_MATCH +
        distanceScore * WEIGHTS.DISTANCE +
        ratingScore * WEIGHTS.RATING +
        popularityScore * WEIGHTS.POPULARITY +
        (candidate.type === 'event' ? eventDateScore : seasonScore) * WEIGHTS.SEASON +
        weatherScore * WEIGHTS.WEATHER +
        tripScore * WEIGHTS.TRIP_COMPATIBILITY +
        noveltyScore * WEIGHTS.NOVELTY +
        diversityScore * WEIGHTS.DIVERSITY
      ) * 100);

      return {
        id: candidate.id,
        title: candidate.title,
        type: candidate.type,
        category: candidate.category,
        description: candidate.description,
        imageUrl: candidate.imageUrl,
        coordinates: candidate.coordinates,
        distanceKm: candidate.distanceKm,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        popularity: candidate.popularity,
        priceLevel: candidate.priceLevel,
        tags: candidate.tags,
        source: candidate.source,
        destinationId: candidate.destinationId,
        eventId: candidate.eventId,
        startDate: candidate.startDate,
        endDate: candidate.endDate,
        destination: candidate.destination,
        event: candidate.event,
        nearbyItem: candidate.nearbyItem,
        weekendEscape: candidate.weekendEscape,
        reason: '',
        bestTimeToVisit: candidate.bestTimeToVisit,
        bestFor: this.determineBestFor(candidate, context),
        relevanceScore: finalScore,
        confidence: Math.min(95, Math.round(personalMatch * 60 + ratingScore * 20 + distanceScore * 20)),
        isAIReasoned: false,
        weatherSuitability: candidate.weatherSuitability,
        tripTypeSuitability: this.determineTripTypeSuitability(candidate),
        noveltyScore: Math.round(noveltyScore * 100),
        diversityScore: Math.round(diversityScore * 100),
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply diversity: ensure no more than 30% from same category in top results
    return this.applyDiversity(scored);
  },

  /**
   * Determine the best contexts for this candidate.
   */
  determineBestFor(candidate: DiscoveryCandidate, context: DiscoveryUserContext): string[] {
    const bestFor: string[] = [];
    const type = candidate.type;
    const category = (candidate.category || '').toLowerCase();

    if (type === 'weekend_escape') bestFor.push('weekend');
    if (type === 'event') bestFor.push('events');
    if (type === 'museum' || category.includes('museum')) bestFor.push('culture', 'indoor');
    if (type === 'beach' || category.includes('beach')) bestFor.push('beach', 'relaxation');
    if (type === 'park' || category.includes('park') || category.includes('garden')) bestFor.push('nature', 'outdoor');
    if (type === 'adventure' || category.includes('adventure') || category.includes('hiking')) bestFor.push('adventure', 'outdoor');
    if (type === 'restaurant' || category.includes('food') || category.includes('restaurant')) bestFor.push('food', 'dining');
    if (type === 'cultural' || category.includes('cultural') || category.includes('heritage')) bestFor.push('culture', 'history');
    if (type === 'nightlife') bestFor.push('nightlife');
    if (type === 'family') bestFor.push('family');
    if (type === 'romantic') bestFor.push('romantic');
    if (category.includes('hidden') || type === 'hidden_gem') bestFor.push('hidden_gem');

    // Distance-based
    if (candidate.distanceKm !== undefined) {
      if (candidate.distanceKm <= 20) bestFor.push('nearby');
      if (candidate.distanceKm > 20 && candidate.distanceKm <= 500) bestFor.push('regional');
      if (candidate.distanceKm > 500) bestFor.push('international');
    }

    // Trip stage
    if (context.tripStage === 'pre_departure') bestFor.push('pre_trip');
    if (context.tripStage === 'during_trip') bestFor.push('during_trip');
    if (context.tripStage === 'post_trip') bestFor.push('post_trip');

    // Default
    if (bestFor.length === 0) bestFor.push('all');

    return bestFor;
  },

  /**
   * Determine trip type suitability.
   */
  determineTripTypeSuitability(candidate: DiscoveryCandidate): ('local' | 'regional' | 'international')[] {
    const suitability: ('local' | 'regional' | 'international')[] = [];

    if (candidate.distanceKm !== undefined) {
      if (candidate.distanceKm <= 50) suitability.push('local');
      if (candidate.distanceKm > 50 && candidate.distanceKm <= 500) suitability.push('regional');
      if (candidate.distanceKm > 500) suitability.push('international');
    } else if (candidate.type === 'event' || candidate.type === 'nearby_place') {
      suitability.push('local');
    } else if (candidate.type === 'destination' || candidate.type === 'weekend_escape') {
      suitability.push('regional', 'international');
    } else {
      suitability.push('local', 'regional');
    }

    return suitability;
  },

  /**
   * Apply diversity to prevent showing too many identical recommendations.
   */
  applyDiversity(recommendations: AIRecommendation[]): AIRecommendation[] {
    if (recommendations.length <= 3) return recommendations;

    const result: AIRecommendation[] = [];
    const categoryCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const maxPerCategory = Math.max(2, Math.ceil(recommendations.length * 0.3));
    const maxPerType = Math.max(2, Math.ceil(recommendations.length * 0.35));

    for (const rec of recommendations) {
      const categoryKey = rec.category || 'general';
      const typeKey = rec.type || 'attraction';
      const catCount = categoryCounts.get(categoryKey) || 0;
      const typeCount = typeCounts.get(typeKey) || 0;

      if (catCount < maxPerCategory && typeCount < maxPerType) {
        result.push(rec);
        categoryCounts.set(categoryKey, catCount + 1);
        typeCounts.set(typeKey, typeCount + 1);
      }
    }

    // If diversity filtered too much, add remaining from the tail (but cap at 40% for safety)
    if (result.length < Math.min(10, recommendations.length)) {
      const usedIds = new Set(result.map((r) => r.id));
      for (const rec of recommendations) {
        if (usedIds.has(rec.id)) continue;
        result.push(rec);
        usedIds.add(rec.id);
        if (result.length >= recommendations.length) break;
      }
    }

    return result;
  },

  /**
   * Assign candidates to discovery sections.
   */
  assignToSections(
    recommendations: AIRecommendation[],
    context: DiscoveryUserContext
  ): Record<string, AIRecommendation[]> {
    const sections: Record<string, AIRecommendation[]> = {
      for_you: [],
      near_you: [],
      this_weekend: [],
      hidden_gems: [],
      trending: [],
      because_you_like: [],
      perfect_for_your_trip: [],
      explore_something_new: [],
    };

    const usedIds = new Set<string>();
    const now = new Date();
    const weekendStart = new Date(now);
    weekendStart.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7)); // Saturday
    weekendStart.setHours(0, 0, 0, 0);
    const weekendEnd = new Date(weekendStart);
    weekendEnd.setDate(weekendStart.getDate() + 2);

    // ── Near You: within 20km ─────────────────────────────────────────────
    const nearYou = recommendations.filter((r) =>
      r.distanceKm !== undefined && r.distanceKm <= 20
    );
    if (nearYou.length > 0) {
      sections.near_you = nearYou.slice(0, 6);
      nearYou.forEach((r) => usedIds.add(r.id));
    }

    // ── This Weekend: events or close destinations ─────────────────────────
    const thisWeekend = recommendations.filter((r) => {
      // Events happening this weekend
      if (r.startDate) {
        const start = new Date(r.startDate);
        const end = r.endDate ? new Date(r.endDate) : start;
        if (start <= weekendEnd && end >= weekendStart) {
          return r.distanceKm === undefined || r.distanceKm <= 300;
        }
      }
      // Weekend escapes or short trips
      if (r.type === 'weekend_escape') return true;
      // Close destinations
      return r.distanceKm !== undefined && r.distanceKm > 0 && r.distanceKm <= 300;
    }).filter((r) => !usedIds.has(r.id));

    if (thisWeekend.length > 0) {
      sections.this_weekend = thisWeekend.slice(0, 6);
      thisWeekend.forEach((r) => usedIds.add(r.id));
    }

    // ── Hidden Gems: obscure, low reviewCount, hidden type ────────────────
    const hiddenGems = recommendations.filter((r) =>
      !usedIds.has(r.id) &&
      (r.type === 'hidden_gem' ||
       (r.reviewCount !== undefined && r.reviewCount < 50) ||
       (r.tags || []).some((t) => t.toLowerCase().includes('hidden')))
    );
    if (hiddenGems.length > 0) {
      sections.hidden_gems = hiddenGems.slice(0, 4);
      hiddenGems.forEach((r) => usedIds.add(r.id));
    }

    // ── Perfect For Your Trip ─────────────────────────────────────────────
    if (context.activeTrip) {
      const tripMatching = recommendations.filter((r) =>
        !usedIds.has(r.id) &&
        (r.bestFor.includes('during_trip') || r.bestFor.includes('pre_trip') || r.bestFor.includes('post_trip'))
      );
      if (tripMatching.length > 0) {
        sections.perfect_for_your_trip = tripMatching.slice(0, 6);
        tripMatching.forEach((r) => usedIds.add(r.id));
      }
    }

    // ── Trending: high popularity ──────────────────────────────────────────
    const trending = recommendations.filter((r) =>
      !usedIds.has(r.id) &&
      (r.popularity || 0) >= 60
    );
    if (trending.length > 0) {
      sections.trending = trending.slice(0, 6);
      trending.forEach((r) => usedIds.add(r.id));
    }

    // ── Because You Like: high personal score ─────────────────────────────
    const becauseYouLike = recommendations.filter((r) =>
      !usedIds.has(r.id) && r.relevanceScore >= 65
    );
    if (becauseYouLike.length > 0) {
      sections.because_you_like = becauseYouLike.slice(0, 6);
      becauseYouLike.forEach((r) => usedIds.add(r.id));
    }

    // ── For You: remaining high-scoring ───────────────────────────────────
    const forYou = recommendations.filter((r) => !usedIds.has(r.id) && r.relevanceScore >= 55);
    if (forYou.length > 0) {
      sections.for_you = forYou.slice(0, 8);
      forYou.forEach((r) => usedIds.add(r.id));
    }

    // ── Explore Something New: lower novelty, different types ─────────────
    const exploreNew = recommendations.filter((r) => !usedIds.has(r.id));
    if (exploreNew.length > 0) {
      sections.explore_something_new = exploreNew.slice(0, 5);
    }

    // Remove empty sections
    const result: Record<string, AIRecommendation[]> = {};
    for (const [key, value] of Object.entries(sections)) {
      if (value.length > 0) result[key] = value;
    }

    return result;
  },
};