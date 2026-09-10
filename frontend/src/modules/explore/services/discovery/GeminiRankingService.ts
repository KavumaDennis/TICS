/**
 * GeminiRankingService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered ranking service using Gemini.
 *
 * Responsibilities:
 *   - Rank discovery candidates (destinations, events, places)
 *   - Explain recommendations
 *   - Personalize ordering based on user context
 *   - Generate engaging feed headlines
 *   - Produce concise recommendation reasons
 *
 * IMPORTANT:
 *   Gemini should NOT retrieve data.
 *   Gemini should ONLY rank, explain, and personalize.
 *   Raw travel data must always come from the API providers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  ExploreCategory,
  Destination,
  Event,
  JourneyFeedItem,
  NearbyItem,
  WeekendEscape,
  DestinationCoordinates,
} from '@/src/modules/explore/types';

/* ── Types ───────────────────────────────────────────────────────────────────── */

export interface RankingContext {
  categories: ExploreCategory[];
  trending: Destination[];
  popular: Destination[];
  events: Event[];
  nearby: NearbyItem[];
  weekendEscapes: WeekendEscape[];
  journeyFeed: JourneyFeedItem[];
  userLocation?: DestinationCoordinates;
  userPreferences?: Record<string, unknown>;
}

export interface RankedResult {
  categories: ExploreCategory[];
  trending: Destination[];
  popular: Destination[];
  events: Event[];
  nearby: NearbyItem[];
  weekendEscapes: WeekendEscape[];
  journeyFeed: JourneyFeedItem[];
}

/* ── Ranking Helpers ─────────────────────────────────────────────────────────── */

/**
 * Simple rule-based ranking (placeholder for Gemini AI).
 * In production, this would call Gemini API for intelligent ranking.
 */
function rankByRelevance<T extends { rating?: number; popularity?: number }>(
  items: T[],
  weights: { rating: number; popularity: number } = { rating: 0.6, popularity: 0.4 }
): T[] {
  return [...items].sort((a, b) => {
    const scoreA = (a.rating || 0) * weights.rating + (a.popularity || 0) * weights.popularity;
    const scoreB = (b.rating || 0) * weights.rating + (b.popularity || 0) * weights.popularity;
    return scoreB - scoreA;
  });
}

/**
 * Generate a personalized reason for a recommendation.
 */
function generateRecommendationReason(item: Destination | Event | NearbyItem): string {
  const reasons: string[] = [];

  if (item.rating && item.rating >= 4.5) {
    reasons.push(`Top-rated (${item.rating} ⭐)`);
  }
  if ('reviewCount' in item && item.reviewCount && item.reviewCount > 100) {
    reasons.push(`${item.reviewCount} reviews`);
  }
  if ('distance' in item && item.distance && item.distance < 50) {
    reasons.push(`Only ${Math.round(item.distance)}km away`);
  }
  if ('popularity' in item && item.popularity && item.popularity > 80) {
    reasons.push('Highly popular');
  }

  return reasons.length > 0 ? reasons.slice(0, 2).join(' • ') : 'Recommended for you';
}

/**
 * Enhance feed item titles with Gemini-style engagement.
 */
function enhanceFeedTitle(item: JourneyFeedItem): JourneyFeedItem {
  // In production, Gemini would rewrite this
  // For now, we just ensure the title is engaging
  if (item.title && !item.title.includes('✨') && !item.title.includes('🔥')) {
    // Add emoji if missing
    const emojis = ['✨', '🔥', '🌟', '💫', '⭐'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    // Don't modify if it already has emojis
    if (!/[^\w\s]/.test(item.title[0])) {
      return {
        ...item,
        title: `${randomEmoji} ${item.title}`,
      };
    }
  }
  return item;
}

/* ── Public API ──────────────────────────────────────────────────────────────── */

export const GeminiRankingService = {
  /**
   * Rank all discovery results using AI-powered algorithms.
   * This is a placeholder for actual Gemini API integration.
   *
   * @param context - All discovery results to rank
   * @returns Ranked results
   */
  async rankDiscoveries(context: RankingContext): Promise<RankedResult> {
    // In production, this would:
    // 1. Send context to Gemini API
    // 2. Get personalized rankings
    // 3. Get recommendation reasons
    // 4. Get enhanced headlines

    // For now, use rule-based ranking
    const ranked: RankedResult = {
      categories: context.categories, // Categories are already sorted by sortOrder
      trending: rankByRelevance(context.trending, { rating: 0.5, popularity: 0.5 }),
      popular: rankByRelevance(context.popular, { rating: 0.4, popularity: 0.6 }),
      events: rankByRelevance(context.events, { rating: 0.3, popularity: 0.7 }),
      nearby: [...context.nearby].sort((a, b) => a.distance - b.distance),
      weekendEscapes: [...context.weekendEscapes].sort((a, b) => a.distance - b.distance),
      journeyFeed: context.journeyFeed
        .map(enhanceFeedTitle)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)),
    };

    // Add recommendation reasons to items (in production, Gemini would generate these)
    // This is just a placeholder to show the concept
    console.log('[GeminiRankingService] Ranked all discovery results');

    return ranked;
  },

  /**
   * Generate a concise reason for a recommendation.
   * In production, this would call Gemini API.
   */
  async generateReason(item: Destination | Event | NearbyItem): Promise<string> {
    // Placeholder - in production, call Gemini
    return generateRecommendationReason(item);
  },

  /**
   * Enhance a feed headline for engagement.
   * In production, this would call Gemini API.
   */
  async enhanceHeadline(headline: string): Promise<string> {
    // Placeholder - in production, call Gemini
  return enhanceFeedTitle({
      id: '',
      type: 'trending_destination',
      title: headline,
      description: '',
      imageUrl: '',
      destinationId: '',
      eventId: null,
      source: 'destination',
      priority: 5,
      expiryDate: null,
      cta: { label: 'Explore', action: 'view_destination' },
      metadata: {},
      createdAt: new Date(),
    }).title;
  },
};