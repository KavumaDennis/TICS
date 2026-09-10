/**
 * IntentDetector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects travel intent from natural language user prompts.
 * Uses keyword analysis and pattern matching to classify the user's request
 * into one of 18+ supported travel intents.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TravelIntent } from './types';

/* ── Intent Patterns ───────────────────────────────────────────────────────── */

interface IntentPattern {
  intent: TravelIntent;
  keywords: string[];
  patterns: RegExp[];
  priority: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'beach_holiday',
    keywords: ['beach', 'coastal', 'shore', 'seaside', 'ocean', 'sea', 'sand', 'surf', 'island', 'coral', 'reef'],
    patterns: [/beach/i, /coastal/i, /seaside/i, /by the (sea|ocean)/i, /island (vacation|holiday|getaway)/i],
    priority: 8,
  },
  {
    intent: 'wildlife',
    keywords: ['wildlife', 'safari', 'animals', 'nature', 'game drive', 'big five', 'gorilla', 'elephant', 'lion', 'zebra', 'bird', 'national park', 'reserve'],
    patterns: [/wildlife/i, /safari/i, /game (drive|reserve)/i, /national park/i, /see (animals|wildlife)/i, /big five/i],
    priority: 9,
  },
  {
    intent: 'adventure_travel',
    keywords: ['adventure', 'hiking', 'trekking', 'climbing', 'rafting', 'bungee', 'zip line', 'kayak', 'camping', 'backpacking', 'extreme', 'thrill'],
    patterns: [/adventure/i, /hiking/i, /trek/i, /climb/i, /raft/i, /bungee/i, /camping/i, /backpack/i],
    priority: 7,
  },
  {
    intent: 'honeymoon',
    keywords: ['honeymoon', 'romantic', 'couple', 'wedding', 'anniversary', 'love', 'honeymooners', 'romance'],
    patterns: [/honeymoon/i, /romantic/i, /for (a )?couple/i, /anniversary/i, /romance/i],
    priority: 10,
  },
  {
    intent: 'family_vacation',
    keywords: ['family', 'kids', 'children', 'child', 'family-friendly', 'family vacation', 'with kids', 'with children', 'family trip'],
    patterns: [/family/i, /with (kids|children)/i, /children/i, /kid.friendly/i],
    priority: 9,
  },
  {
    intent: 'weekend_escape',
    keywords: ['weekend', 'getaway', 'short trip', 'day trip', 'escape', 'nearby', 'close', 'quick', 'this weekend', 'near me'],
    patterns: [/weekend/i, /getaway/i, /day trip/i, /short (trip|break|holiday)/i, /this weekend/i, /near me/i, /close by/i],
    priority: 8,
  },
  {
    intent: 'budget_travel',
    keywords: ['budget', 'cheap', 'affordable', 'inexpensive', 'low cost', 'economy', 'bargain', 'deal', 'discount', 'save', '$', 'usd', 'eur'],
    patterns: [/\$|usd|eur|budget|cheap|affordable|under\s+\d+/i],
    priority: 7,
  },
  {
    intent: 'luxury_travel',
    keywords: ['luxury', 'premium', 'exclusive', '5-star', 'five star', 'high-end', 'upscale', 'vip', 'deluxe', 'resort', 'spa', 'butler'],
    patterns: [/luxury/i, /5.?star/i, /premium/i, /exclusive/i, /high.?end/i, /vip/i, /deluxe/i],
    priority: 7,
  },
  {
    intent: 'cultural_experiences',
    keywords: ['culture', 'cultural', 'history', 'historical', 'heritage', 'museum', 'art', 'tradition', 'local', 'village', 'tribe', 'indigenous'],
    patterns: [/culture/i, /cultural/i, /history/i, /historical/i, /heritage/i, /museum/i, /art/i, /tradition/i],
    priority: 6,
  },
  {
    intent: 'food_tourism',
    keywords: ['food', 'cuisine', 'cooking', 'culinary', 'restaurant', 'eat', 'dining', 'gastronomy', 'wine', 'brewery', 'market', 'street food'],
    patterns: [/food/i, /cuisine/i, /culinary/i, /cooking (class|tour)/i, /street food/i, /wine (tasting|tour)/i, /gastronomy/i],
    priority: 6,
  },
  {
    intent: 'festivals',
    keywords: ['festival', 'fest', 'celebration', 'carnival', 'concert', 'music', 'event', 'fiesta', 'fair'],
    patterns: [/festival/i, /carnival/i, /concert/i, /music (festival|event)/i, /celebration/i],
    priority: 7,
  },
  {
    intent: 'events',
    keywords: ['event', 'conference', 'expo', 'show', 'performance', 'theatre', 'theater', 'sports', 'match', 'game'],
    patterns: [/event/i, /conference/i, /expo/i, /sports (event|match)/i, /concert/i, /show/i],
    priority: 5,
  },
  {
    intent: 'road_trip',
    keywords: ['road trip', 'drive', 'driving', 'road', 'cross country', 'self-drive', 'car', 'motorcycle', 'bike'],
    patterns: [/road trip/i, /self.?drive/i, /driving (holiday|vacation|trip)/i, /cross country/i],
    priority: 6,
  },
  {
    intent: 'solo_travel',
    keywords: ['solo', 'alone', 'single', 'by myself', 'just me', 'solo traveler', 'solo trip'],
    patterns: [/solo/i, /by myself/i, /travel(ling|ing) alone/i, /single (traveler|traveller)/i],
    priority: 6,
  },
  {
    intent: 'group_travel',
    keywords: ['group', 'friends', 'gang', 'crew', 'team', 'with friends', 'group trip', 'group vacation'],
    patterns: [/group/i, /with friends/i, /friends (trip|getaway)/i, /group (trip|travel|vacation)/i],
    priority: 5,
  },
  {
    intent: 'business_travel',
    keywords: ['business', 'work', 'corporate', 'conference', 'meeting', 'coworking', 'business trip', 'workation'],
    patterns: [/business/i, /work (trip|travel)/i, /corporate/i, /conference/i, /workation/i],
    priority: 5,
  },
  {
    intent: 'nearby_experiences',
    keywords: ['nearby', 'near me', 'close', 'around', 'neighborhood', 'local', 'vicinity', 'surrounding'],
    patterns: [/nearby/i, /near me/i, /around me/i, /close (to|by)/i, /local (spots|places|attractions)/i],
    priority: 7,
  },
  {
    intent: 'destination_recommendations',
    keywords: ['recommend', 'suggest', 'where', 'destination', 'place', 'go', 'visit', 'travel to', 'trip to'],
    patterns: [/recommend/i, /suggest/i, /where (should|can|to)/i, /best (place|destination)/i, /where to (go|visit)/i],
    priority: 4,
  },
];

/* ── IntentDetector ─────────────────────────────────────────────────────────── */

export const IntentDetector = {
  /**
   * Detect the primary travel intent from a user prompt.
   * Returns the most likely intent based on keyword and pattern matching.
   */
  detectIntent(prompt: string): TravelIntent {
    const lowerPrompt = prompt.toLowerCase();

    // Score each intent pattern
    const scores: Map<TravelIntent, number> = new Map();

    for (const pattern of INTENT_PATTERNS) {
      let score = 0;

      // Check keywords
      for (const keyword of pattern.keywords) {
        if (lowerPrompt.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      // Check regex patterns
      for (const regex of pattern.patterns) {
        if (regex.test(prompt)) {
          score += 3;
        }
      }

      if (score > 0) {
        // Apply priority multiplier
        score *= pattern.priority / 5;
        scores.set(pattern.intent, score);
      }
    }

    // If no intent detected, return general
    if (scores.size === 0) {
      return 'general';
    }

    // Return the highest scoring intent
    let bestIntent: TravelIntent = 'general';
    let bestScore = 0;

    for (const [intent, score] of scores.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return bestIntent;
  },

  /**
   * Detect multiple intents with confidence scores.
   * Useful for complex queries that span multiple categories.
   */
  detectIntentsWithConfidence(prompt: string): Array<{ intent: TravelIntent; confidence: number }> {
    const lowerPrompt = prompt.toLowerCase();
    const results: Array<{ intent: TravelIntent; confidence: number }> = [];
    let totalScore = 0;

    for (const pattern of INTENT_PATTERNS) {
      let score = 0;

      for (const keyword of pattern.keywords) {
        if (lowerPrompt.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      for (const regex of pattern.patterns) {
        if (regex.test(prompt)) {
          score += 3;
        }
      }

      if (score > 0) {
        score *= pattern.priority / 5;
        totalScore += score;
        results.push({ intent: pattern.intent, confidence: score });
      }
    }

    // Normalize to percentages
    if (totalScore > 0) {
      for (const result of results) {
        result.confidence = Math.round((result.confidence / totalScore) * 100);
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  },

  /**
   * Check if a prompt is a follow-up question to previous recommendations.
   */
  isFollowUp(prompt: string): boolean {
    const followUpPatterns = [
      /which (one|is|of)/i,
      /cheapest/i,
      /most (affordable|expensive|popular)/i,
      /tell me more/i,
      /more (about|details|info)/i,
      /what about/i,
      /how (about|much)/i,
      /compare/i,
      /first|second|third|last/i,
      /that (one|place|destination)/i,
      /this (one|place|destination)/i,
    ];

    return followUpPatterns.some((p) => p.test(prompt));
  },

  /**
   * Get all supported intents.
   */
  getSupportedIntents(): TravelIntent[] {
    return INTENT_PATTERNS.map((p) => p.intent);
  },
};