/**
 * PromptBuilder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds structured prompts for Gemini AI based on the aggregated trip context.
 *
 * Every prompt includes:
 * - Complete trip context (type, stage, mode, origin, destination)
 * - Current conditions (weather, traffic, nearby places, events)
 * - User profile (preferences, history, budget, saved destinations)
 * - Timing context (departure/arrival times, itinerary progress)
 * - Clear output format instructions (structured JSON only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AggregatedContext } from './ContextAggregator';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PROMPT TYPES                                                              */
/* ════════════════════════════════════════════════════════════════════════════ */

export type PromptType = 'recommendations' | 'alerts';

export interface BuiltPrompt {
  systemInstruction: string;
  userMessage: string;
  expectedOutputFormat: string;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PROMPT BUILDER                                                            */
/* ════════════════════════════════════════════════════════════════════════════ */

export class PromptBuilder {
  /**
   * Build a complete prompt for Gemini based on context and type.
   */
  build(context: AggregatedContext, type: PromptType): BuiltPrompt {
    const contextBlock = this.buildContextBlock(context);
    const timingBlock = this.buildTimingBlock(context);
    const userBlock = this.buildUserBlock(context);
    const conditionsBlock = this.buildConditionsBlock(context);

    if (type === 'recommendations') {
      return this.buildRecommendationPrompt(contextBlock, timingBlock, userBlock, conditionsBlock, context);
    }
    return this.buildAlertPrompt(contextBlock, timingBlock, userBlock, conditionsBlock, context);
  }

  /**
   * Build the trip context block.
   */
  private buildContextBlock(context: AggregatedContext): string {
    const t = context.trip;
    return `=== TRIP CONTEXT ===
Trip Type: ${t.type} (${t.type === 'LOCAL' ? 'Same country travel' : t.type === 'REGIONAL' ? 'Cross-border regional travel' : 'International travel'})
Current Stage: ${t.stage} (${this.getStageDescription(t.stage)})
Transport Mode: ${t.transportMode} (${this.getModeDescription(t.transportMode)})
Trip Title: ${t.title}

Origin: ${t.origin.name || t.origin.city || t.origin.country}
  Country: ${t.origin.country} (${t.origin.countryCode || 'Unknown'})
  ${t.origin.city ? `City: ${t.origin.city}` : ''}

Destination: ${t.destination.name || t.destination.city || t.destination.country}
  Country: ${t.destination.country} (${t.destination.countryCode || 'Unknown'})
  ${t.destination.city ? `City: ${t.destination.city}` : ''}
  ${t.destination.timezone ? `Timezone: ${t.destination.timezone}` : ''}
  ${t.destination.currency ? `Currency: ${t.destination.currency}` : ''}
  ${t.destination.language ? `Language: ${t.destination.language}` : ''}

${t.departureTime ? `Departure: ${new Date(t.departureTime).toLocaleString()}` : ''}
${t.arrivalTime ? `Arrival: ${new Date(t.arrivalTime).toLocaleString()}` : ''}
${t.flightNumber ? `Flight: ${t.airline || ''} ${t.flightNumber}` : ''}`;
  }

  /**
   * Build the timing block.
   */
  private buildTimingBlock(context: AggregatedContext): string {
    const t = context.trip;
    const now = new Date();
    let block = `=== TIMING CONTEXT ===
Current Time: ${now.toLocaleString()}
Current Stage: ${t.stage}`;

    if (t.departureTime) {
      const dep = new Date(t.departureTime);
      const diffMs = dep.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / 86400000);
      const diffHours = Math.floor((diffMs % 86400000) / 3600000);

      if (diffMs > 0) {
        block += `\nTime until departure: ${diffDays > 0 ? `${diffDays} days, ` : ''}${diffHours} hours`;
      } else {
        const elapsed = Math.abs(diffMs);
        const elapsedHours = Math.floor(elapsed / 3600000);
        block += `\nDeparture was ${elapsedHours} hours ago`;
      }
    }

    if (t.arrivalTime) {
      const arr = new Date(t.arrivalTime);
      const diffMs = arr.getTime() - now.getTime();
      if (diffMs > 0 && diffMs < 7200000) {
        block += `\n⚠ ARRIVING SOON - within 2 hours`;
      }
    }

    // Add itinerary events
    if (context.itinerary.length > 0) {
      block += `\n\nItinerary:`;
      for (const event of context.itinerary) {
        block += `\n- ${event.title} (${new Date(event.startTime).toLocaleString()})`;
      }
    }

    return block;
  }

  /**
   * Build the user profile block.
   */
  private buildUserBlock(context: AggregatedContext): string {
    const u = context.user;
    let block = `=== USER PROFILE ===`;

    if (u.travelStyle.length > 0) {
      block += `\nTravel Style: ${u.travelStyle.join(', ')}`;
    }
    if (u.preferences.length > 0) {
      block += `\nPreferences: ${u.preferences.join(', ')}`;
    }
    if (u.budget.max) {
      block += `\nBudget: Up to ${u.budget.currency || 'USD'} ${u.budget.max}${u.budget.min ? ` (min: ${u.budget.min})` : ''}`;
    }
    if (u.favoriteCategories.length > 0) {
      block += `\nFavorite Categories: ${u.favoriteCategories.join(', ')}`;
    }
    if (u.savedDestinations.length > 0) {
      block += `\nSaved Destinations: ${u.savedDestinations.join(', ')}`;
    }
    if (u.tripHistory.length > 0) {
      block += `\nTrip History: ${u.tripHistory.join(', ')}`;
    }
    if (u.likedRecommendations.length > 0) {
      block += `\nPreviously Liked: ${u.likedRecommendations.length} recommendations`;
    }
    if (u.dismissedAlerts.length > 0) {
      block += `\n⚠ Avoid similar content to these dismissed items: ${u.dismissedAlerts.slice(-3).join(', ')}`;
    }

    return block;
  }

  /**
   * Build the current conditions block.
   */
  private buildConditionsBlock(context: AggregatedContext): string {
    let block = `=== CURRENT CONDITIONS ===`;

    // Weather
    if (context.weather) {
      const w = context.weather;
      block += `\n\nWeather: ${w.temperature}°C, ${w.condition}`;
      block += `\n  Humidity: ${w.humidity}% | Wind: ${w.windSpeed} m/s`;
      if (w.isSevere) block += `\n  ⚠ SEVERE WEATHER ADVISORY`;
      if (w.forecast.length > 0) {
        block += `\n  Forecast:`;
        w.forecast.slice(0, 3).forEach(f => {
          block += `\n  - ${f.date}: ${f.condition}, ${f.tempLow}-${f.tempHigh}°C`;
        });
      }
    } else {
      block += `\n\nWeather: Not available`;
    }

    // Road conditions
    if (context.roadConditions.length > 0) {
      block += `\n\nRoad Conditions:`;
      for (const r of context.roadConditions) {
        block += `\n- ${r.road}: ${r.condition} (congestion: ${r.congestion})${r.incident ? ` - ${r.incident}` : ''}`;
      }
    }

    // Nearby places
    if (context.location.nearbyPlaces.length > 0) {
      block += `\n\nNearby Places:`;
      context.location.nearbyPlaces.slice(0, 5).forEach(p => {
        block += `\n- ${p.name} (${Math.round(p.distance)}m) - ${p.type}${p.rating ? `, rating: ${p.rating}/5` : ''}`;
      });
    }

    // Events
    if (context.location.events.length > 0) {
      block += `\n\nLocal Events:`;
      context.location.events.slice(0, 3).forEach(e => {
        block += `\n- ${e.name} (${e.date}) - ${e.category}`;
      });
    }

    // Current location
    if (context.location.current) {
      block += `\n\nCurrent Location: ${context.location.current.latitude}, ${context.location.current.longitude}`;
      if (context.location.current.speed) {
        block += `\nSpeed: ${context.location.current.speed} m/s`;
      }
    }

    return block;
  }

  /**
   * Build the recommendation prompt.
   */
  private buildRecommendationPrompt(
    contextBlock: string,
    timingBlock: string,
    userBlock: string,
    conditionsBlock: string,
    context: AggregatedContext,
  ): BuiltPrompt {
    const t = context.trip;
    const stage = t.stage.toLowerCase();

    return {
      systemInstruction: `You are TICS AI, a travel intelligence assistant. Your role is to generate personalized, context-aware travel recommendations.

You MUST:
1. Analyze the complete trip context before generating any recommendations
2. Generate recommendations that are SPECIFIC to this exact journey, not generic travel tips
3. Explain WHY each recommendation is relevant (reasoning field)
4. Assign appropriate priority based on urgency and impact
5. Include actionable suggested actions
6. Return ONLY valid JSON - no markdown, no explanations outside the JSON

The recommendations should feel like they come from a travel companion who understands the user's specific journey.`,
      userMessage: `Generate personalized travel recommendations for this journey.

${contextBlock}

${timingBlock}

${userBlock}

${conditionsBlock}

=== RECOMMENDATION REQUIREMENTS ===
Generate 3-5 recommendations that are:
1. SPECIFIC to this ${t.type} trip (${t.type === 'LOCAL' ? 'focus on local roads, nearby attractions, weekend activities, scenic routes, restaurants, fuel stations, parking' : t.type === 'REGIONAL' ? 'focus on border crossings, currency exchange, regional events, driving regulations, accommodation' : 'focus on visas, passports, flights, hotels, airport transfers, cultural tips, safety'})
2. APPROPRIATE for the current stage (${stage})
3. SUITABLE for ${t.transportMode} travel
4. BASED on current conditions (weather, traffic, nearby places)
5. PERSONALIZED to the user's preferences and history
6. TIMELY and actionable right now

Return a JSON array of objects with EXACTLY these fields:
{
  "title": "Short, specific, actionable title",
  "description": "2-3 sentence detailed description with specific details from the context",
  "reasoning": "Brief explanation of why this recommendation was generated based on the context",
  "priority": "critical|high|medium|low",
  "confidenceScore": 0.85,
  "suggestedActions": ["Coordinate Journey", "View Details", "Navigate", "Save", "Dismiss"],
  "category": "navigation|safety|weather|budget|food|accommodation|events|nearby_experiences|health|transport|documents|shopping|photography|adventure|family|business|nightlife|culture|entertainment|emergency"
}`,
      expectedOutputFormat: `JSON array of objects with: title, description, reasoning, priority, confidenceScore, suggestedActions, category`,
    };
  }

  /**
   * Build the alert prompt.
   */
  private buildAlertPrompt(
    contextBlock: string,
    timingBlock: string,
    userBlock: string,
    conditionsBlock: string,
    context: AggregatedContext,
  ): BuiltPrompt {
    const t = context.trip;
    const stage = t.stage.toLowerCase();

    return {
      systemInstruction: `You are TICS AI, a travel intelligence assistant. Your role is to generate personalized, context-aware travel alerts.

You MUST:
1. Analyze the complete trip context before generating any alerts
2. Generate alerts that are SPECIFIC to this exact journey, not generic warnings
3. Explain WHY each alert is relevant (reasoning field)
4. Assign appropriate priority based on urgency and impact
5. Include actionable next steps
6. Return ONLY valid JSON - no markdown, no explanations outside the JSON

Priority Guidelines:
- CRITICAL: Flight cancellations, road closures, accidents, severe weather, border closures, emergencies
- HIGH: Heavy traffic, gate changes, rain warnings, hotel check-in, fuel shortage, border delays
- MEDIUM: Restaurant recommendations, nearby museums, festivals, scenic viewpoints
- LOW: Coffee shops, shopping, photo opportunities, travel tips, hidden gems

The alerts should feel like they come from a travel companion watching out for the user.`,
      userMessage: `Generate personalized travel alerts for this journey.

${contextBlock}

${timingBlock}

${userBlock}

${conditionsBlock}

=== ALERT REQUIREMENTS ===
Generate 2-4 alerts that are:
1. SPECIFIC to this ${t.type} trip
2. APPROPRIATE for the current stage (${stage})
3. SUITABLE for ${t.transportMode} travel
4. BASED on current conditions (weather, traffic, nearby places, events)
5. PROPERLY PRIORITIZED (critical > high > medium > low)
6. TIMELY and actionable right now

Return a JSON array of objects with EXACTLY these fields:
{
  "title": "Short, clear, specific alert title",
  "description": "2-3 sentence detailed description with specific details from the context",
  "reasoning": "Brief explanation of why this alert was generated based on the context",
  "priority": "critical|high|medium|low",
  "confidenceScore": 0.85,
  "suggestedActions": ["Acknowledge", "Snooze", "Dismiss", "Learn More", "Navigate"],
  "category": "flight|weather|transport|general|check_in|boarding|gate|baggage|documents|safety|health|emergency"
}`,
      expectedOutputFormat: `JSON array of objects with: title, description, reasoning, priority, confidenceScore, suggestedActions, category`,
    };
  }

  private getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
      planning: 'Researching destinations, budgeting, building itinerary',
      preparing: 'Final preparations before departure',
      travelling: 'En route to destination',
      arriving: 'Arriving at destination',
      exploring: 'At destination, experiencing the location',
      returning: 'Heading back home',
      completed: 'Trip has ended',
    };
    return descriptions[stage.toLowerCase()] || '';
  }

  private getModeDescription(mode: string): string {
    const descriptions: Record<string, string> = {
      car: 'Driving personal or rental vehicle',
      bus: 'Public or private bus/coach',
      train: 'Railway travel',
      flight: 'Commercial airline flight',
      motorcycle: 'Motorcycle or scooter',
      walking: 'On foot',
      cycling: 'Bicycle',
      boat: 'Ferry, boat, or cruise',
    };
    return descriptions[mode.toLowerCase()] || '';
  }
}

export const promptBuilder = new PromptBuilder();
export default promptBuilder;