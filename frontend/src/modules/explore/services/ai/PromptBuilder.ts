/**
 * PromptBuilder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds system prompts for Gemini AI travel recommendations.
 * Ensures Gemini acts as a professional travel advisor using real data only.
 * Never hardcoded inside UI components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TravelIntent, ExtractedEntities, AIUserContext } from './types';
import { INTENT_LABELS } from './types';

/* ── PromptBuilder ──────────────────────────────────────────────────────────── */

export const PromptBuilder = {
  /**
   * Build the complete system prompt for Gemini.
   */
  buildSystemPrompt(): string {
    return `You are TICS AI, a professional travel advisor for the TICS travel platform.

YOUR ROLE:
- Act as an expert travel consultant who understands global destinations, seasons, budgets, and travel styles.
- Recommend ONLY real destinations from the supplied dataset.
- NEVER invent places, events, or attractions that are not in the provided data.
- Prefer destinations returned from Firestore and Google Places data.
- Explain EVERY recommendation with specific, personalized reasons.
- Respect user constraints such as budget, travel style, location, and season.

RULES:
1. Only recommend destinations that exist in the provided destination list.
2. Never make up coordinates, ratings, or prices.
3. If the user's request cannot be fulfilled with available data, say so honestly.
4. Always provide structured JSON output only.
5. Each recommendation must include a clear explanation of why it was selected.
6. Consider the user's location, budget, travel style, and season when recommending.
7. For budget-constrained users, prioritize affordable destinations.
8. For nearby queries, prioritize destinations within the specified radius.
9. For seasonal queries, recommend destinations with optimal weather during that time.

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown, no code blocks, no explanation outside the JSON.

{
  "recommendations": [
    {
      "destinationName": "City Name",
      "country": "Country Name",
      "explanation": "Personalized 1-2 sentence explanation why this destination fits",
      "confidence": 85,
      "estimatedBudget": { "min": 500, "max": 1500, "currency": "USD" },
      "recommendedDuration": "5-7 days",
      "bestTimeToVisit": "June to September",
      "travelStyle": "Beach",
      "matchReasons": ["Matches beach preference", "Within budget", "Great weather in December"],
      "travelTips": ["Book accommodation in advance", "Try local seafood"]
    }
  ],
  "followUpSuggestions": ["Which one is the cheapest?", "Tell me more about the first option"]
}`;
  },

  /**
   * Build the user context section for the prompt.
   */
  buildUserContext(userContext?: AIUserContext): string {
    if (!userContext) return '';

    const parts: string[] = ['USER CONTEXT:'];

    if (userContext.name) parts.push(`- Name: ${userContext.name}`);
    if (userContext.country) parts.push(`- From: ${userContext.country}`);
    if (userContext.preferredTravelStyles?.length) {
      parts.push(`- Preferred travel styles: ${userContext.preferredTravelStyles.join(', ')}`);
    }
    if (userContext.previousTrips?.length) {
      parts.push(`- Previously visited: ${userContext.previousTrips.join(', ')}`);
    }
    if (userContext.savedDestinations?.length) {
      parts.push(`- Saved destinations: ${userContext.savedDestinations.join(', ')}`);
    }
    if (userContext.budgetPreferences?.max) {
      parts.push(`- Budget: Up to ${userContext.budgetPreferences.currency || 'USD'} ${userContext.budgetPreferences.max}`);
    }
    if (userContext.favoriteCategories?.length) {
      parts.push(`- Favorite categories: ${userContext.favoriteCategories.join(', ')}`);
    }

    return parts.join('\n');
  },

  /**
   * Build the destination data section for the prompt.
   */
  buildDestinationData(destinations: Array<{
    name: string;
    country: string;
    description?: string;
    categories?: string[];
    bestTimeToVisit?: string;
    estimatedBudget?: { min?: number; max?: number; currency?: string };
    topAttractions?: string[];
  }>): string {
    if (!destinations.length) return '';

    const parts: string[] = ['AVAILABLE DESTINATIONS:'];
    for (const dest of destinations.slice(0, 30)) {
      const cats = dest.categories?.slice(0, 3).join(', ') || 'general';
      const budget = dest.estimatedBudget
        ? `${dest.estimatedBudget.currency || 'USD'} ${dest.estimatedBudget.min || '?'} - ${dest.estimatedBudget.max || '?'}`
        : 'Varies';
      const attractions = dest.topAttractions?.slice(0, 3).join(', ') || '';
      parts.push(
        `- ${dest.name}, ${dest.country} | Categories: ${cats} | Budget: ${budget} | Best time: ${dest.bestTimeToVisit || 'Year-round'}${attractions ? ` | Attractions: ${attractions}` : ''}`
      );
    }

    return parts.join('\n');
  },

  /**
   * Build the user query section for the prompt.
   */
  buildUserQuery(
    prompt: string,
    intent: TravelIntent,
    entities: ExtractedEntities,
    isFollowUp: boolean,
    conversationHistory?: string
  ): string {
    const parts: string[] = [];

    if (isFollowUp && conversationHistory) {
      parts.push('CONVERSATION HISTORY:');
      parts.push(conversationHistory);
      parts.push('');
      parts.push('FOLLOW-UP QUESTION:');
    } else {
      parts.push('USER REQUEST:');
    }

    parts.push(prompt);

    parts.push('');
    parts.push('DETECTED INTENT:');
    parts.push(INTENT_LABELS[intent] || intent);

    if (entities.budget) {
      parts.push(`\nBUDGET: ${entities.currency || 'USD'} ${entities.budget}`);
    }
    if (entities.duration) {
      parts.push(`DURATION: ${entities.duration}`);
    }
    if (entities.travelStyle) {
      parts.push(`TRAVEL STYLE: ${entities.travelStyle}`);
    }
    if (entities.season) {
      parts.push(`SEASON: ${entities.season}${entities.month ? ` (${entities.month})` : ''}`);
    }
    if (entities.currentLocation) {
      parts.push(`CURRENT LOCATION: ${entities.currentLocation}`);
    }
    if (entities.destination) {
      parts.push(`DESTINATION: ${entities.destination}`);
    }
    if (entities.radius) {
      parts.push(`RADIUS: ${entities.radius}km`);
    }
    if (entities.groupSize) {
      parts.push(`GROUP SIZE: ${entities.groupSize}`);
    }
    if (entities.interests?.length) {
      parts.push(`INTERESTS: ${entities.interests.join(', ')}`);
    }

    return parts.join('\n');
  },

  /**
   * Build the complete prompt for Gemini.
   */
  buildCompletePrompt(params: {
    prompt: string;
    intent: TravelIntent;
    entities: ExtractedEntities;
    userContext?: AIUserContext;
    destinations: Array<{
      name: string;
      country: string;
      description?: string;
      categories?: string[];
      bestTimeToVisit?: string;
      estimatedBudget?: { min?: number; max?: number; currency?: string };
      topAttractions?: string[];
    }>;
    isFollowUp?: boolean;
    conversationHistory?: string;
  }): string {
    const parts: string[] = [];

    // System prompt
    parts.push(this.buildSystemPrompt());
    parts.push('');

    // User context
    if (params.userContext) {
      const context = this.buildUserContext(params.userContext);
      if (context) {
        parts.push(context);
        parts.push('');
      }
    }

    // Destination data
    if (params.destinations.length > 0) {
      parts.push(this.buildDestinationData(params.destinations));
      parts.push('');
    }

    // User query
    parts.push(this.buildUserQuery(
      params.prompt,
      params.intent,
      params.entities,
      params.isFollowUp || false,
      params.conversationHistory
    ));

    return parts.join('\n');
  },
};