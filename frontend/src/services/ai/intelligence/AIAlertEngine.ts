/**
 * AIAlertEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-FIRST alert engine.
 *
 * Primary: Gemini AI generates dynamic, context-aware alerts
 *   → ContextAggregator collects all trip data
 *   → PromptBuilder builds structured prompt
 *   → Gemini generates personalized alerts
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

export interface AIAlert extends AIResponseItem {
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

function generateFallbackAlerts(context: AggregatedContext): AIResponseItem[] {
  const fallbacks: AIResponseItem[] = [];
  const t = context.trip;

  // Local trip fallbacks
  if (t.type === 'LOCAL') {
    if (context.roadConditions.length > 0) {
      const closed = context.roadConditions.find(r => r.condition === 'closed');
      if (closed) {
        fallbacks.push({
          title: `Road closure: ${closed.road}`,
          description: `${closed.road} is closed. ${closed.incident || 'No details available.'} Find an alternative route immediately.`,
          reasoning: `Detected road closure on your route.`,
          priority: 'critical',
          confidenceScore: 0.9,
          suggestedActions: ['Navigate', 'Learn More', 'Dismiss'],
          category: 'transport',
        });
      }
      const congested = context.roadConditions.find(r => r.congestion === 'heavy');
      if (congested && !closed) {
        fallbacks.push({
          title: `Heavy traffic on ${congested.road}`,
          description: `Heavy traffic reported on ${congested.road}. Expect significant delays. Consider alternative routes.`,
          reasoning: `Real-time traffic data shows congestion on your route.`,
          priority: 'high',
          confidenceScore: 0.85,
          suggestedActions: ['Navigate', 'Learn More', 'Dismiss'],
          category: 'transport',
        });
      }
    }
    if (context.weather?.isSevere) {
      fallbacks.push({
        title: 'Severe weather warning',
        description: `${context.weather.condition} in your area. Temperature: ${context.weather.temperature}°C. Seek shelter and avoid travel if conditions are dangerous.`,
        reasoning: `Weather alert triggered by severe conditions at your location.`,
        priority: 'critical',
        confidenceScore: 0.9,
        suggestedActions: ['Learn More', 'Dismiss'],
        category: 'weather',
      });
    }
  }

  // Regional trip fallbacks
  if (t.type === 'REGIONAL') {
    fallbacks.push({
      title: 'Border crossing - document check',
      description: `Ensure your passport and vehicle documents are ready before reaching the border crossing to ${t.destination.country}.`,
      reasoning: `Regional trip requires border crossing documentation.`,
      priority: 'high',
      confidenceScore: 0.85,
      suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
      category: 'documents',
    });
    if (t.destination.currency) {
      fallbacks.push({
        title: `Currency exchange needed: ${t.destination.currency}`,
        description: `Exchange to ${t.destination.currency} before crossing the border. Rates are better on your side.`,
        reasoning: `Different currency at destination: ${t.destination.currency}.`,
        priority: 'medium',
        confidenceScore: 0.75,
        suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
        category: 'general',
      });
    }
  }

  // International trip fallbacks
  if (t.type === 'INTERNATIONAL') {
    fallbacks.push({
      title: `Passport & visa check for ${t.destination.country}`,
      description: `Ensure your passport is valid for at least 6 months beyond your travel dates. Check if you need a visa for ${t.destination.country}.`,
      reasoning: `International travel requires valid travel documents.`,
      priority: 'high',
      confidenceScore: 0.9,
      suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
      category: 'documents',
    });
    if (t.stage === 'preparing' || t.stage === 'planning') {
      fallbacks.push({
        title: 'Online check-in available',
        description: 'Check in online 24-48 hours before departure to save time at the airport and select your preferred seat.',
        reasoning: `You're in the ${t.stage} stage of an international trip.`,
        priority: 'medium',
        confidenceScore: 0.8,
        suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
        category: 'check_in',
      });
    }
    if (context.weather?.isSevere) {
      fallbacks.push({
        title: `Weather advisory for ${t.destination.city || t.destination.country}`,
        description: `${context.weather.condition} at your destination. Check with your airline for potential disruptions.`,
        reasoning: `Severe weather detected at your destination.`,
        priority: 'high',
        confidenceScore: 0.85,
        suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
        category: 'weather',
      });
    }
  }

  // Stage-based fallbacks
  if (t.stage === 'returning') {
    fallbacks.push({
      title: 'Return trip preparation',
      description: `Prepare for your return${t.destination.country ? ` from ${t.destination.country}` : ''}. Check traffic, weather, and allow extra time.`,
      reasoning: `You're in the returning stage of your trip.`,
      priority: 'medium',
      confidenceScore: 0.7,
      suggestedActions: ['Learn More', 'Acknowledge', 'Dismiss'],
      category: 'general',
    });
  }

  return fallbacks;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  AI ALERT ENGINE - AI FIRST                                                */
/* ════════════════════════════════════════════════════════════════════════════ */

export class AIAlertEngine {
  /**
   * PRIMARY ENTRY POINT: Generate alerts using AI first.
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
  }): Promise<AIAlert[]> {
    // Step 1: Aggregate context
    const context = await contextAggregator.aggregate(options);

    // Step 2: Try cache first
    const cached = validationLayer.getCached(context, 'alerts');
    if (cached) {
      return this.toOutput(cached, context, 'cache');
    }

    // Step 3: Try AI generation
    try {
      const aiResult = await this.generateWithAI(context);
      if (aiResult.valid && aiResult.items.length > 0) {
        validationLayer.cache(aiResult.items, context, 'alerts');
        return this.toOutput(aiResult.items, context, 'ai');
      }
    } catch (err) {
      console.warn('[AIAlertEngine] AI generation failed, using fallback:', err);
    }

    // Step 4: Fallback to templates
    const fallbackItems = generateFallbackAlerts(context);
    return this.toOutput(fallbackItems, context, 'fallback');
  }

  /**
   * Generate alerts using Gemini AI.
   */
  private async generateWithAI(context: AggregatedContext): Promise<ValidationResult> {
    const prompt = promptBuilder.build(context, 'alerts');

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
    return validationLayer.validate(jsonMatch[0], context, 'alerts');
  }

  /**
   * Convert validated items to output format.
   */
  private toOutput(
    items: AIResponseItem[],
    context: AggregatedContext,
    source: 'ai' | 'cache' | 'fallback',
  ): AIAlert[] {
    return items.map(item => ({
      ...item,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

export const aiAlertEngine = new AIAlertEngine();
export default aiAlertEngine;