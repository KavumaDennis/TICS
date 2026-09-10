/**
 * TripStageEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines what recommendations and alerts are relevant based on the
 * current stage of the journey (Planning, Preparing, Travelling, etc.).
 *
 * Each stage has specific content types that are most useful to the traveler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TripStage, RecommendationCategory, AlertPriority, type TripIntelligenceContext } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  STAGE-SPECIFIC RECOMMENDATION CATEGORIES                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

const STAGE_RECOMMENDATIONS: Record<TripStage, RecommendationCategory[]> = {
  [TripStage.PLANNING]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.BUDGET,
    RecommendationCategory.ACCOMMODATION,
    RecommendationCategory.DOCUMENTS,
    RecommendationCategory.EVENTS,
    RecommendationCategory.CULTURE,
    RecommendationCategory.FAMILY,
    RecommendationCategory.ADVENTURE,
  ],
  [TripStage.PREPARING]: [
    RecommendationCategory.DOCUMENTS,
    RecommendationCategory.WEATHER,
    RecommendationCategory.BUDGET,
    RecommendationCategory.SAFETY,
    RecommendationCategory.HEALTH,
    RecommendationCategory.SHOPPING,
    RecommendationCategory.TRANSPORT,
  ],
  [TripStage.TRAVELLING]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.WEATHER,
    RecommendationCategory.FOOD,
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.EMERGENCY,
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.HEALTH,
  ],
  [TripStage.ARRIVING]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.ACCOMMODATION,
    RecommendationCategory.FOOD,
    RecommendationCategory.SAFETY,
    RecommendationCategory.WEATHER,
  ],
  [TripStage.EXPLORING]: [
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.FOOD,
    RecommendationCategory.EVENTS,
    RecommendationCategory.CULTURE,
    RecommendationCategory.SHOPPING,
    RecommendationCategory.PHOTOGRAPHY,
    RecommendationCategory.NIGHTLIFE,
    RecommendationCategory.ENTERTAINMENT,
    RecommendationCategory.ADVENTURE,
    RecommendationCategory.FAMILY,
    RecommendationCategory.BUSINESS,
  ],
  [TripStage.RETURNING]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.WEATHER,
    RecommendationCategory.BUDGET,
    RecommendationCategory.SAFETY,
    RecommendationCategory.EMERGENCY,
  ],
  [TripStage.COMPLETED]: [
    RecommendationCategory.BUDGET,
    RecommendationCategory.PHOTOGRAPHY,
    RecommendationCategory.CULTURE,
  ],
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  STAGE-SPECIFIC ALERT PRIORITIES                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

const STAGE_ALERT_PRIORITIES: Record<TripStage, AlertPriority[]> = {
  [TripStage.PLANNING]: [
    AlertPriority.LOW,
    AlertPriority.MEDIUM,
  ],
  [TripStage.PREPARING]: [
    AlertPriority.MEDIUM,
    AlertPriority.HIGH,
  ],
  [TripStage.TRAVELLING]: [
    AlertPriority.HIGH,
    AlertPriority.CRITICAL,
    AlertPriority.MEDIUM,
  ],
  [TripStage.ARRIVING]: [
    AlertPriority.HIGH,
    AlertPriority.MEDIUM,
  ],
  [TripStage.EXPLORING]: [
    AlertPriority.LOW,
    AlertPriority.MEDIUM,
  ],
  [TripStage.RETURNING]: [
    AlertPriority.HIGH,
    AlertPriority.CRITICAL,
    AlertPriority.MEDIUM,
  ],
  [TripStage.COMPLETED]: [
    AlertPriority.LOW,
  ],
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  STAGE-SPECIFIC CONTENT DESCRIPTIONS                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface StageContentGuide {
  stage: TripStage;
  label: string;
  description: string;
  focus: string;
  recommendedCategories: RecommendationCategory[];
  relevantPriorities: AlertPriority[];
}

const STAGE_GUIDES: Record<TripStage, StageContentGuide> = {
  [TripStage.PLANNING]: {
    stage: TripStage.PLANNING,
    label: 'Planning',
    description: 'Researching destinations, budgeting, and building itinerary',
    focus: 'Destinations, budget planning, packing lists, accommodation',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.PLANNING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.PLANNING],
  },
  [TripStage.PREPARING]: {
    stage: TripStage.PREPARING,
    label: 'Preparing',
    description: 'Final preparations before departure',
    focus: 'Documents, weather, packing, checklists, pre-departure tasks',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.PREPARING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.PREPARING],
  },
  [TripStage.TRAVELLING]: {
    stage: TripStage.TRAVELLING,
    label: 'Travelling',
    description: 'En route to destination',
    focus: 'Traffic, weather, road closures, fuel, flight status, navigation',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.TRAVELLING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.TRAVELLING],
  },
  [TripStage.ARRIVING]: {
    stage: TripStage.ARRIVING,
    label: 'Arriving',
    description: 'Arriving at destination',
    focus: 'Airport transfers, hotel check-in, local transport, first meal',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.ARRIVING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.ARRIVING],
  },
  [TripStage.EXPLORING]: {
    stage: TripStage.EXPLORING,
    label: 'Exploring',
    description: 'At destination, experiencing the location',
    focus: 'Nearby attractions, restaurants, events, museums, hidden gems',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.EXPLORING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.EXPLORING],
  },
  [TripStage.RETURNING]: {
    stage: TripStage.RETURNING,
    label: 'Returning',
    description: 'Heading back home',
    focus: 'Traffic, fuel, airport reminders, hotel checkout, road safety',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.RETURNING],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.RETURNING],
  },
  [TripStage.COMPLETED]: {
    stage: TripStage.COMPLETED,
    label: 'Completed',
    description: 'Trip has ended',
    focus: 'Trip summary, memories, future planning',
    recommendedCategories: STAGE_RECOMMENDATIONS[TripStage.COMPLETED],
    relevantPriorities: STAGE_ALERT_PRIORITIES[TripStage.COMPLETED],
  },
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  STAGE ENGINE                                                              */
/* ════════════════════════════════════════════════════════════════════════════ */

export class TripStageEngine {
  /**
   * Get the stage guide for the current trip stage.
   */
  getStageGuide(stage: TripStage): StageContentGuide {
    return STAGE_GUIDES[stage] || STAGE_GUIDES[TripStage.PLANNING];
  }

  /**
   * Get recommended categories for a given stage.
   */
  getRecommendedCategories(stage: TripStage): RecommendationCategory[] {
    return STAGE_RECOMMENDATIONS[stage] || STAGE_RECOMMENDATIONS[TripStage.PLANNING];
  }

  /**
   * Get relevant alert priorities for a given stage.
   */
  getRelevantPriorities(stage: TripStage): AlertPriority[] {
    return STAGE_ALERT_PRIORITIES[stage] || STAGE_ALERT_PRIORITIES[TripStage.PLANNING];
  }

  /**
   * Check if a recommendation category is relevant for the current stage.
   */
  isCategoryRelevant(stage: TripStage, category: RecommendationCategory): boolean {
    const categories = this.getRecommendedCategories(stage);
    return categories.includes(category);
  }

  /**
   * Check if an alert priority is relevant for the current stage.
   */
  isPriorityRelevant(stage: TripStage, priority: AlertPriority): boolean {
    const priorities = this.getRelevantPriorities(stage);
    return priorities.includes(priority);
  }

  /**
   * Get stage-specific prompt context for AI generation.
   */
  getStagePromptContext(stage: TripStage, context: TripIntelligenceContext): string {
    const guide = this.getStageGuide(stage);

    let prompt = `Current Trip Stage: ${guide.label}\n`;
    prompt += `Stage Focus: ${guide.focus}\n`;
    prompt += `Stage Description: ${guide.description}\n\n`;

    // Add stage-specific context
    switch (stage) {
      case TripStage.PLANNING:
        prompt += `The user is planning a ${context.tripType} trip.\n`;
        prompt += `Origin: ${context.origin.city || context.origin.country}\n`;
        prompt += `Destination: ${context.destination.city || context.destination.country}\n`;
        if (context.budget.max) {
          prompt += `Budget: Up to ${context.budget.currency || 'USD'} ${context.budget.max}\n`;
        }
        break;

      case TripStage.PREPARING:
        prompt += `The user is preparing to depart.\n`;
        prompt += `Departure: ${context.itinerary.find(e => e.type === 'transfer')?.startTime || 'Scheduled'}\n`;
        if (context.weather) {
          prompt += `Destination Weather: ${context.weather.temperature}°C, ${context.weather.condition}\n`;
        }
        break;

      case TripStage.TRAVELLING:
        prompt += `The user is currently travelling.\n`;
        prompt += `Transport Mode: ${context.transportMode}\n`;
        if (context.roadConditions.length > 0) {
          prompt += `Road Conditions: ${context.roadConditions.map(r => `${r.road}: ${r.condition}`).join(', ')}\n`;
        }
        if (context.weather) {
          prompt += `Current Weather: ${context.weather.temperature}°C, ${context.weather.condition}\n`;
        }
        break;

      case TripStage.ARRIVING:
        prompt += `The user is arriving at their destination.\n`;
        prompt += `Destination: ${context.destination.city || context.destination.country}\n`;
        if (context.destination.currency) {
          prompt += `Local Currency: ${context.destination.currency}\n`;
        }
        if (context.destination.language) {
          prompt += `Local Language: ${context.destination.language}\n`;
        }
        break;

      case TripStage.EXPLORING:
        prompt += `The user is exploring their destination.\n`;
        prompt += `Location: ${context.destination.city || context.destination.country}\n`;
        if (context.nearbyPlaces.length > 0) {
          prompt += `Nearby Places: ${context.nearbyPlaces.slice(0, 5).map(p => p.name).join(', ')}\n`;
        }
        if (context.events.length > 0) {
          prompt += `Local Events: ${context.events.slice(0, 3).map(e => e.name).join(', ')}\n`;
        }
        break;

      case TripStage.RETURNING:
        prompt += `The user is returning from their trip.\n`;
        prompt += `Returning to: ${context.origin.city || context.origin.country}\n`;
        if (context.weather) {
          prompt += `Weather at Origin: ${context.weather.temperature}°C, ${context.weather.condition}\n`;
        }
        break;

      case TripStage.COMPLETED:
        prompt += `The trip has been completed.\n`;
        prompt += `Destination was: ${context.destination.city || context.destination.country}\n`;
        break;
    }

    return prompt;
  }

  /**
   * Get all stage guides.
   */
  getAllStageGuides(): StageContentGuide[] {
    return Object.values(STAGE_GUIDES);
  }
}

export const tripStageEngine = new TripStageEngine();
export default tripStageEngine;