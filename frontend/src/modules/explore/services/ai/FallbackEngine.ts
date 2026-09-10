/**
 * FallbackEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule-based fallback recommendation engine when Gemini AI is unavailable.
 * Uses Firestore destinations, user preferences, and basic rules to generate
 * structured recommendations without AI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AIRecommendation, AIDiscoveryResponse, TravelIntent, ExtractedEntities, AIUserContext } from './types';

/* ── FallbackEngine ──────────────────────────────────────────────────────────── */

export const FallbackEngine = {
  /**
   * Generate recommendations using rule-based logic when AI is unavailable.
   */
  async generateFallbackRecommendations(
    prompt: string,
    intent: TravelIntent,
    entities: ExtractedEntities,
    destinations: Array<Record<string, any>>,
    userContext: AIUserContext | undefined,
    conversationId: string
  ): Promise<AIDiscoveryResponse> {
    const convId = conversationId || 'fallback';
    const startTime = Date.now();

    // Score destinations based on intent, entities, and user context
    const scored = destinations.map((dest) => {
      let score = 0;
      const matchReasons: string[] = [];

      // 1. Intent-based scoring
      score += this.scoreByIntent(dest, intent, matchReasons);

      // 2. Budget scoring
      score += this.scoreByBudget(dest, entities, matchReasons);

      // 3. Season scoring
      score += this.scoreBySeason(dest, entities, matchReasons);

      // 4. Travel style scoring
      score += this.scoreByStyle(dest, entities, matchReasons);

      // 5. User preference scoring
      score += this.scoreByUserPreferences(dest, userContext, matchReasons);

      // 6. Popularity/rating boost
      const rating = dest.rating || 0;
      const popularity = dest.popularity || 0;
      score += (rating / 5) * 15 + (popularity / 100) * 5;

      // 7. Location proximity (if user location available)
      if (entities.currentLocation && dest.coordinates) {
        score += 5;
      }

      return { destination: dest, score, matchReasons };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top recommendations
    const topResults = scored.slice(0, 10);

    const recommendations: AIRecommendation[] = topResults.map((result) => ({
      destination: result.destination as any,
      confidence: Math.min(Math.round((result.score / 100) * 100), 95),
      explanation: result.matchReasons.length > 0
        ? result.matchReasons.slice(0, 2).join('. ')
        : 'Recommended destination matching your interests',
      estimatedBudget: {
        min: result.destination.estimatedBudget?.min || 0,
        max: result.destination.estimatedBudget?.max || 0,
        currency: result.destination.estimatedBudget?.currency || 'USD',
      },
      weather: undefined,
      nearbyAttractions: [],
      events: [],
      recommendedDuration: this.getDefaultDuration(intent),
      travelTips: [],
      bestTimeToVisit: result.destination.bestTimeToVisit || 'Year-round',
      travelStyle: entities.travelStyle || 'General',
      matchReasons: result.matchReasons,
    }));

    return {
      recommendations,
      intent,
      entities,
      query: prompt,
      totalResults: recommendations.length,
      processingTime: Date.now() - startTime,
      source: 'fallback',
      conversationId: convId,
      followUpSuggestions: this.getFollowUpSuggestions(intent),
    };
  },

  /**
   * Score a destination by intent match.
   */
  scoreByIntent(
    dest: Record<string, any>,
    intent: TravelIntent,
    matchReasons: string[]
  ): number {
    const categories = (dest.categories || []).map((c: string) => c.toLowerCase());
    const name = (dest.name || '').toLowerCase();
    const description = (dest.description || '').toLowerCase();

    const intentKeywords: Record<string, string[]> = {
      beach_holiday: ['beach', 'coastal', 'island', 'ocean'],
      wildlife: ['safari', 'wildlife', 'national park', 'nature reserve'],
      adventure_travel: ['adventure', 'hiking', 'trekking', 'mountain'],
      honeymoon: ['romantic', 'luxury', 'resort', 'couple'],
      family_vacation: ['family', 'theme park', 'amusement'],
      weekend_escape: ['weekend', 'day trip', 'nearby'],
      budget_travel: ['budget', 'affordable', 'cheap'],
      luxury_travel: ['luxury', 'premium', '5-star', 'exclusive'],
      cultural_experiences: ['museum', 'culture', 'heritage', 'history'],
      food_tourism: ['food', 'cuisine', 'restaurant', 'market'],
      festivals: ['festival', 'carnival', 'music', 'celebration'],
      events: ['event', 'conference', 'expo'],
      road_trip: ['road trip', 'drive', 'self-drive'],
      solo_travel: ['solo', 'safe', 'social'],
      group_travel: ['group', 'resort', 'package'],
      business_travel: ['business', 'conference', 'coworking'],
      nearby_experiences: ['nearby', 'local', 'close'],
      destination_recommendations: [],
      general: [],
    };

    const keywords = intentKeywords[intent] || [];
    let score = 0;

    for (const keyword of keywords) {
      if (categories.includes(keyword) || name.includes(keyword) || description.includes(keyword)) {
        score += 10;
      }
    }

    if (score > 0) {
      matchReasons.push(`Great for ${intent.replace(/_/g, ' ')}`);
    }

    return score;
  },

  /**
   * Score a destination by budget alignment.
   */
  scoreByBudget(
    dest: Record<string, any>,
    entities: ExtractedEntities,
    matchReasons: string[]
  ): number {
    if (!entities.budget) return 10;

    const budget = dest.estimatedBudget;
    if (!budget) return 5;

    const destAvgCost = (budget.min || 0) + (budget.max || 0) / 2;
    if (destAvgCost <= entities.budget) {
      matchReasons.push(`Within your ${entities.currency || 'USD'} ${entities.budget} budget`);
      return 20;
    } else if (destAvgCost <= entities.budget * 1.3) {
      return 10;
    }

    return 0;
  },

  /**
   * Score a destination by season compatibility.
   */
  scoreBySeason(
    dest: Record<string, any>,
    entities: ExtractedEntities,
    matchReasons: string[]
  ): number {
    if (!entities.season) return 10;

    const bestTime = (dest.bestTimeToVisit || '').toLowerCase();
    if (bestTime.includes(entities.season)) {
      matchReasons.push(`Ideal for ${entities.season} travel`);
      return 15;
    }

    return 5;
  },

  /**
   * Score a destination by travel style match.
   */
  scoreByStyle(
    dest: Record<string, any>,
    entities: ExtractedEntities,
    matchReasons: string[]
  ): number {
    if (!entities.travelStyle) return 10;

    const categories = (dest.categories || []).map((c: string) => c.toLowerCase());
    const style = entities.travelStyle.toLowerCase();

    if (categories.includes(style)) {
      matchReasons.push(`Matches your ${style} travel preference`);
      return 15;
    }

    return 5;
  },

  /**
   * Score a destination by user preferences.
   */
  scoreByUserPreferences(
    dest: Record<string, any>,
    userContext: AIUserContext | undefined,
    matchReasons: string[]
  ): number {
    if (!userContext) return 10;

    let score = 0;

    const categories = (dest.categories || []).map((c: string) => c.toLowerCase());
    if (userContext.favoriteCategories) {
      for (const fav of userContext.favoriteCategories) {
        if (categories.includes(fav.toLowerCase())) {
          score += 10;
          matchReasons.push('Matches your favorite travel style');
        }
      }
    }

    if (userContext.savedDestinations?.includes(dest.name)) {
      score += 5;
    }

    if (userContext.previousTrips?.includes(dest.name)) {
      score -= 5;
    }

    return score;
  },

  /**
   * Get default trip duration based on intent.
   */
  getDefaultDuration(intent: TravelIntent): string {
    const durations: Record<string, string> = {
      weekend_escape: '2-3 days',
      day_trip: '1 day',
      beach_holiday: '5-7 days',
      adventure_travel: '7-10 days',
      honeymoon: '7-14 days',
      family_vacation: '5-10 days',
      road_trip: '3-7 days',
      business_travel: '2-5 days',
      solo_travel: '5-10 days',
      cultural_experiences: '4-7 days',
      food_tourism: '3-5 days',
      festivals: '2-4 days',
      luxury_travel: '5-7 days',
      budget_travel: '3-5 days',
      wildlife: '5-7 days',
      nearby_experiences: '1-2 days',
    };
    return durations[intent] || '3-5 days';
  },

  /**
   * Get follow-up suggestions based on intent.
   */
  getFollowUpSuggestions(intent: TravelIntent): string[] {
    const suggestions: Record<string, string[]> = {
      beach_holiday: ['Which one has the best beaches?', 'What about all-inclusive resorts?'],
      wildlife: ['Which is best for gorilla trekking?', 'What about budget-friendly safaris?'],
      adventure_travel: ['Which has the best hiking trails?', 'Tell me about the adventure activities'],
      honeymoon: ['Which is most romantic?', 'What about secluded resorts?'],
      family_vacation: ['Which is best for kids?', 'What about family-friendly activities?'],
      weekend_escape: ['Which is closest?', 'What about day trips?'],
      budget_travel: ['Which is cheapest overall?', 'What about free activities?'],
      luxury_travel: ['Which is the most exclusive?', 'Tell me about luxury experiences'],
      cultural_experiences: ['Which has the best museums?', 'What about cultural tours?'],
      food_tourism: ['Which has the best street food?', 'What about cooking classes?'],
      festivals: ['Which has festivals this month?', 'What about music festivals?'],
      general: ['Tell me more about the first option', 'Which is the most popular?'],
    };

    return suggestions[intent] || [
      'Which one is the most affordable?',
      'Tell me more about the first option',
      'What activities are available?',
    ];
  },
};