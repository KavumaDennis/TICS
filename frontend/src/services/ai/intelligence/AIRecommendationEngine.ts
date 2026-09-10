/**
 * AIRecommendationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-FIRST recommendation engine.
 *
 * Primary: Gemini AI generates dynamic, context-aware recommendations
 *   → ContextAggregator collects all trip data
 *   → PromptBuilder builds structured prompt
 *   → Gemini generates personalized recommendations
 *   → ValidationLayer validates, deduplicates, ranks, caches
 *
 * Fallback: Rule-based templates only when AI is unavailable
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { contextAggregator, type AggregatedContext } from './ContextAggregator';
import { promptBuilder } from './PromptBuilder';
import { validationLayer, type AIResponseItem, type ValidationResult } from './ValidationLayer';
import { assistantChat } from '@/src/firebase/callables';
import type { Trip } from '@/src/store/tripStore';
import type { TravelerLocation } from '@/src/services/LocationService';
import type { WeatherData, UserPreferences, NearbyPlace, RoadCondition } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  OUTPUT TYPE                                                               */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface AIRecommendation extends AIResponseItem {
  id: string;
  metadata: {
    tripType: string;
    tripStage: string;
    transportMode: string;
    generatedAt: string;
    source: 'ai' | 'cache' | 'fallback';
  };
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  FALLBACK TEMPLATES - Only used when AI is unavailable                     */
/* ════════════════════════════════════════════════════════════════════════════ */

function generateFallbackRecommendations(context: AggregatedContext): AIResponseItem[] {
  const fallbacks: AIResponseItem[] = [];
  const t = context.trip;

  // Local trip fallbacks
  if (t.type === 'LOCAL') {
    if (context.roadConditions.length > 0) {
      const congested = context.roadConditions.find(r => r.congestion === 'heavy' || r.congestion === 'moderate');
      if (congested) {
        fallbacks.push({
          title: `Traffic on ${congested.road}`,
          description: `Traffic is ${congested.congestion} on ${congested.road}. Consider an alternative route to save time.`,
          reasoning: `Based on current road conditions detected for your route.`,
          priority: 'high',
          confidenceScore: 0.7,
          suggestedActions: ['Navigate', 'View Details', 'Dismiss'],
          category: 'navigation',
        });
      }
    }
    if (context.location.nearbyPlaces.length > 0) {
      const p = context.location.nearbyPlaces[0];
      fallbacks.push({
        title: `Nearby: ${p.name}`,
        description: `You're only ${Math.round(p.distance)}m from ${p.name}. ${p.rating ? `Rated ${p.rating}/5.` : 'A popular local spot.'}`,
        reasoning: `Based on your current location and nearby places.`,
        priority: 'medium',
        confidenceScore: 0.65,
        suggestedActions: ['View Details', 'Navigate', 'Save', 'Dismiss'],
        category: 'nearby_experiences',
      });
    }
    if (context.weather && context.weather.condition.toLowerCase().includes('rain')) {
      fallbacks.push({
        title: 'Rain expected - plan indoor activities',
        description: `${context.weather.condition} expected with temperatures around ${context.weather.temperature}°C. Consider visiting indoor attractions first.`,
        reasoning: `Based on current weather conditions at your location.`,
        priority: 'medium',
        confidenceScore: 0.75,
        suggestedActions: ['View Details', 'Save', 'Dismiss'],
        category: 'weather',
      });
    }
  }

  // Regional trip fallbacks
  if (t.type === 'REGIONAL') {
    fallbacks.push({
      title: 'Border crossing preparation',
      description: `Ensure you have your passport and vehicle documents ready for crossing into ${t.destination.country}. Check border wait times before departing.`,
      reasoning: `Based on your regional trip to ${t.destination.country}.`,
      priority: 'high',
      confidenceScore: 0.8,
      suggestedActions: ['View Details', 'Save', 'Dismiss'],
      category: 'documents',
    });
    if (t.destination.currency) {
      fallbacks.push({
        title: `Currency exchange: ${t.destination.currency}`,
        description: `Exchange to ${t.destination.currency} before crossing the border for the best rates. Compare rates at different exchange points.`,
        reasoning: `Based on your destination ${t.destination.country} which uses ${t.destination.currency}.`,
        priority: 'medium',
        confidenceScore: 0.7,
        suggestedActions: ['View Details', 'Save', 'Dismiss'],
        category: 'budget',
      });
    }
  }

  // International trip fallbacks
  if (t.type === 'INTERNATIONAL') {
    fallbacks.push({
      title: `Prepare for ${t.destination.country}`,
      description: `Check passport validity (6+ months), visa requirements, and travel insurance for ${t.destination.country}. ${t.destination.currency ? `Local currency: ${t.destination.currency}.` : ''}`,
      reasoning: `Based on your international trip to ${t.destination.country}.`,
      priority: 'high',
      confidenceScore: 0.85,
      suggestedActions: ['View Details', 'Save', 'Dismiss'],
      category: 'documents',
    });
    if (context.weather) {
      fallbacks.push({
        title: `${t.destination.city || t.destination.country} weather: ${context.weather.temperature}°C`,
        description: `Current conditions: ${context.weather.condition}, ${context.weather.temperature}°C. ${context.weather.isSevere ? 'Severe weather advisory in effect.' : 'Pack accordingly for your trip.'}`,
        reasoning: `Based on current weather at your destination.`,
        priority: 'medium',
        confidenceScore: 0.75,
        suggestedActions: ['View Details', 'Save', 'Dismiss'],
        category: 'weather',
      });
    }
    fallbacks.push({
      title: 'Airport transfer planning',
      description: `Book airport transfer in advance for a smooth arrival at ${t.destination.city || t.destination.country}. Options include taxi, ride-hailing, or shuttle services.`,
      reasoning: `Based on your international travel to ${t.destination.country}.`,
      priority: 'medium',
      confidenceScore: 0.7,
      suggestedActions: ['View Details', 'Save', 'Dismiss'],
      category: 'transport',
    });
  }

  // Stage-based fallbacks
  if (t.stage === 'planning' || t.stage === 'preparing') {
    fallbacks.push({
      title: `${t.stage === 'planning' ? 'Plan your' : 'Prepare for your'} trip to ${t.destination.city || t.destination.country}`,
      description: `You're in the ${t.stage} stage. Focus on ${t.stage === 'planning' ? 'researching attractions, budgeting, and building your itinerary.' : 'packing, document checks, and pre-departure tasks.'}`,
      reasoning: `Based on your current trip stage: ${t.stage}.`,
      priority: 'low',
      confidenceScore: 0.6,
      suggestedActions: ['View Details', 'Save', 'Dismiss'],
      category: 'navigation',
    });
  }

  return fallbacks;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  AI RECOMMENDATION ENGINE - AI FIRST                                       */
/* ════════════════════════════════════════════════════════════════════════════ */

export class AIRecommendationEngine {
  /**
   * PRIMARY ENTRY POINT: Generate recommendations using AI first.
   * Falls back to templates only when AI is unavailable.
   */
  async generate(options: {
    trip: Trip | null;
    currentLocation?: TravelerLocation | null;
    weather?: WeatherData | null;
    nearbyPlaces?: NearbyPlace[];
    events?: Array<{ id: string; name: string; date: string; location: string; category: string; description?: string }>;
    roadConditions?: RoadCondition[];
    userPreferences?: Partial<UserPreferences>;
  }): Promise<AIRecommendation[]> {
    // Step 1: Aggregate context
    const context = await contextAggregator.aggregate(options);

    // Step 2: Try cache first
    const cached = validationLayer.getCached(context, 'recommendations');
    if (cached) {
      return this.toOutput(cached, context, 'cache');
    }

    // Step 3: Try AI generation
    try {
      const aiResult = await this.generateWithAI(context);
      if (aiResult.valid && aiResult.items.length > 0) {
        validationLayer.cache(aiResult.items, context, 'recommendations');
        return this.toOutput(aiResult.items, context, 'ai');
      }
    } catch (err) {
      console.warn('[AIRecommendationEngine] AI generation failed, using fallback:', err);
    }

    // Step 4: Fallback to templates
    const fallbackItems = generateFallbackRecommendations(context);
    return this.toOutput(fallbackItems, context, 'fallback');
  }

  /**
   * Generate recommendations using Gemini AI.
   */
  private async generateWithAI(context: AggregatedContext): Promise<ValidationResult> {
    const prompt = promptBuilder.build(context, 'recommendations');

    const res = await assistantChat({
      message: prompt.userMessage,
      instruction: prompt.systemInstruction,
    });

    if (!res?.answer) {
      return { valid: false, items: [], errors: ['No response from AI'], source: 'ai' };
    }

    // Extract JSON from response
    const jsonMatch = res.answer.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { valid: false, items: [], errors: ['No JSON array found in response'], source: 'ai' };
    }

    // Validate and process
    return validationLayer.validate(jsonMatch[0], context, 'recommendations');
  }

  /**
   * Convert validated items to output format.
   */
  private toOutput(
    items: AIResponseItem[],
    context: AggregatedContext,
    source: 'ai' | 'cache' | 'fallback',
  ): AIRecommendation[] {
    return items.map(item => ({
      ...item,
      id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        tripType: context.trip.type,
        tripStage: context.trip.stage,
        transportMode: context.trip.transportMode,
        generatedAt: new Date().toISOString(),
        source,
      },
    }));
  }
}

export const aiRecommendationEngine = new AIRecommendationEngine();
export default aiRecommendationEngine;