/**
 * TransportModeEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides transport-mode-specific recommendations and alerts.
 *
 * Different transport modes (car, flight, bus, train, walking, cycling, boat)
 * require different intelligence. This engine ensures the right content
 * is generated for the right mode.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TransportMode, RecommendationCategory, AlertPriority, type TripIntelligenceContext } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MODE-SPECIFIC RECOMMENDATION CATEGORIES                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

const MODE_RECOMMENDATIONS: Record<TransportMode, RecommendationCategory[]> = {
  [TransportMode.CAR]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.FOOD,
    RecommendationCategory.EMERGENCY,
    RecommendationCategory.WEATHER,
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.SAFETY,
    RecommendationCategory.ADVENTURE,
    RecommendationCategory.FAMILY,
    RecommendationCategory.HEALTH,
  ],
  [TransportMode.BUS]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.FOOD,
    RecommendationCategory.WEATHER,
    RecommendationCategory.EMERGENCY,
    RecommendationCategory.NEARBY_EXPERIENCES,
  ],
  [TransportMode.TRAIN]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.FOOD,
    RecommendationCategory.WEATHER,
    RecommendationCategory.ENTERTAINMENT,
    RecommendationCategory.NEARBY_EXPERIENCES,
  ],
  [TransportMode.FLIGHT]: [
    RecommendationCategory.TRANSPORT,
    RecommendationCategory.DOCUMENTS,
    RecommendationCategory.WEATHER,
    RecommendationCategory.SAFETY,
    RecommendationCategory.BUDGET,
    RecommendationCategory.FOOD,
    RecommendationCategory.ENTERTAINMENT,
    RecommendationCategory.SHOPPING,
  ],
  [TransportMode.MOTORCYCLE]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.SAFETY,
    RecommendationCategory.WEATHER,
    RecommendationCategory.EMERGENCY,
    RecommendationCategory.HEALTH,
    RecommendationCategory.FOOD,
    RecommendationCategory.ADVENTURE,
  ],
  [TransportMode.WALKING]: [
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.FOOD,
    RecommendationCategory.SAFETY,
    RecommendationCategory.HEALTH,
    RecommendationCategory.PHOTOGRAPHY,
    RecommendationCategory.CULTURE,
  ],
  [TransportMode.CYCLING]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.SAFETY,
    RecommendationCategory.WEATHER,
    RecommendationCategory.HEALTH,
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.ADVENTURE,
  ],
  [TransportMode.BOAT]: [
    RecommendationCategory.NAVIGATION,
    RecommendationCategory.SAFETY,
    RecommendationCategory.WEATHER,
    RecommendationCategory.FOOD,
    RecommendationCategory.NEARBY_EXPERIENCES,
    RecommendationCategory.ENTERTAINMENT,
  ],
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MODE-SPECIFIC ALERT DOMAINS                                              */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface ModeAlertDomain {
  domain: string;
  description: string;
  examples: string[];
  priority: AlertPriority;
}

const MODE_ALERT_DOMAINS: Record<TransportMode, ModeAlertDomain[]> = {
  [TransportMode.CAR]: [
    { domain: 'traffic', description: 'Traffic congestion and delays', examples: ['Heavy traffic on Jinja Road', 'Accident on Kampala-Entebbe highway'], priority: AlertPriority.HIGH },
    { domain: 'road_conditions', description: 'Road closures, construction, hazards', examples: ['Road closure on Mukono bypass', 'Flooding on Masaka road'], priority: AlertPriority.CRITICAL },
    { domain: 'fuel', description: 'Fuel station locations and availability', examples: ['Fuel station 2 km ahead', 'Last station for 50 km'], priority: AlertPriority.MEDIUM },
    { domain: 'parking', description: 'Parking availability and costs', examples: ['Parking available at City Mall', 'Street parking restricted'], priority: AlertPriority.LOW },
    { domain: 'speed_camera', description: 'Speed camera and traffic enforcement', examples: ['Speed camera on Northern Bypass', 'Police checkpoint ahead'], priority: AlertPriority.MEDIUM },
    { domain: 'weather', description: 'Weather impacts on driving', examples: ['Heavy rain reducing visibility', 'Fog on mountain roads'], priority: AlertPriority.HIGH },
    { domain: 'emergency_services', description: 'Nearby police, hospitals, mechanics', examples: ['Police station 500 m ahead', 'Hospital with emergency room 3 km'], priority: AlertPriority.CRITICAL },
  ],
  [TransportMode.BUS]: [
    { domain: 'schedule', description: 'Bus schedule changes', examples: ['Bus delayed by 30 minutes', 'Departure gate changed'], priority: AlertPriority.HIGH },
    { domain: 'terminal', description: 'Terminal and stop information', examples: ['Bus arriving at platform 5', 'Terminal construction causing delays'], priority: AlertPriority.MEDIUM },
    { domain: 'route_changes', description: 'Route modifications or detours', examples: ['Route diverted due to road works', 'Express service available'], priority: AlertPriority.HIGH },
  ],
  [TransportMode.TRAIN]: [
    { domain: 'schedule', description: 'Train schedule and delays', examples: ['Train delayed by 15 minutes', 'Platform change'], priority: AlertPriority.HIGH },
    { domain: 'platform', description: 'Platform and track information', examples: ['Train arriving at platform 3', 'Track maintenance this weekend'], priority: AlertPriority.MEDIUM },
    { domain: 'strike', description: 'Service disruptions', examples: ['Rail strike on Friday', 'Reduced service due to maintenance'], priority: AlertPriority.CRITICAL },
  ],
  [TransportMode.FLIGHT]: [
    { domain: 'flight_status', description: 'Flight delays, cancellations, gate changes', examples: ['Flight delayed by 2 hours', 'Gate changed to B12'], priority: AlertPriority.CRITICAL },
    { domain: 'check_in', description: 'Check-in reminders and information', examples: ['Online check-in now open', 'Check-in counter closes in 1 hour'], priority: AlertPriority.HIGH },
    { domain: 'boarding', description: 'Boarding process and timing', examples: ['Boarding starts in 30 minutes', 'Final boarding call'], priority: AlertPriority.CRITICAL },
    { domain: 'baggage', description: 'Baggage claim and restrictions', examples: ['Baggage carousel 4', 'Baggage allowance: 23 kg'], priority: AlertPriority.MEDIUM },
    { domain: 'terminal', description: 'Terminal and gate information', examples: ['Departure from Terminal 2', 'Lounge access available'], priority: AlertPriority.MEDIUM },
    { domain: 'immigration', description: 'Immigration and customs', examples: ['Visa on arrival available', 'Customs declaration required'], priority: AlertPriority.HIGH },
  ],
  [TransportMode.MOTORCYCLE]: [
    { domain: 'road_hazards', description: 'Road hazards specific to motorcycles', examples: ['Gravel road ahead', 'Potholes on this route'], priority: AlertPriority.CRITICAL },
    { domain: 'weather', description: 'Weather conditions', examples: ['Rain expected, road slippery', 'Strong winds on bridge'], priority: AlertPriority.HIGH },
    { domain: 'safety_gear', description: 'Safety reminders', examples: ['Helmet required by law', 'Reflective jacket recommended'], priority: AlertPriority.HIGH },
  ],
  [TransportMode.WALKING]: [
    { domain: 'safe_routes', description: 'Safe walking routes', examples: ['Well-lit pedestrian path ahead', 'Crosswalk at 100 m'], priority: AlertPriority.MEDIUM },
    { domain: 'weather', description: 'Weather for walking', examples: ['High UV index, wear sunscreen', 'Rain expected in 15 minutes'], priority: AlertPriority.MEDIUM },
    { domain: 'amenities', description: 'Public amenities', examples: ['Public restroom 200 m ahead', 'Water fountain in park'], priority: AlertPriority.LOW },
  ],
  [TransportMode.CYCLING]: [
    { domain: 'bike_lanes', description: 'Bicycle lane information', examples: ['Bike lane available on this road', 'Shared road ahead'], priority: AlertPriority.MEDIUM },
    { domain: 'terrain', description: 'Terrain and elevation', examples: ['Steep hill for next 2 km', 'Off-road trail available'], priority: AlertPriority.MEDIUM },
    { domain: 'safety', description: 'Cycling safety', examples: ['High traffic area ahead', 'Helmet recommended'], priority: AlertPriority.HIGH },
  ],
  [TransportMode.BOAT]: [
    { domain: 'weather_marine', description: 'Marine weather conditions', examples: ['Rough seas expected', 'Wind advisory in effect'], priority: AlertPriority.CRITICAL },
    { domain: 'schedule', description: 'Ferry/boat schedule', examples: ['Ferry delayed by 20 min', 'Last departure at 6 PM'], priority: AlertPriority.HIGH },
    { domain: 'safety', description: 'Marine safety', examples: ['Life jackets located under seats', 'Emergency exit instructions'], priority: AlertPriority.CRITICAL },
  ],
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRANSPORT MODE ENGINE                                                     */
/* ════════════════════════════════════════════════════════════════════════════ */

export class TransportModeEngine {
  /**
   * Get recommended categories for a given transport mode.
   */
  getRecommendedCategories(mode: TransportMode): RecommendationCategory[] {
    return MODE_RECOMMENDATIONS[mode] || MODE_RECOMMENDATIONS[TransportMode.CAR];
  }

  /**
   * Get alert domains relevant to a transport mode.
   */
  getAlertDomains(mode: TransportMode): ModeAlertDomain[] {
    return MODE_ALERT_DOMAINS[mode] || MODE_ALERT_DOMAINS[TransportMode.CAR];
  }

  /**
   * Get mode-specific prompt context for AI generation.
   */
  getModePromptContext(mode: TransportMode, context: TripIntelligenceContext): string {
    const domains = this.getAlertDomains(mode);
    const categories = this.getRecommendedCategories(mode);

    let prompt = `Transport Mode: ${mode.toUpperCase()}\n\n`;
    prompt += `Relevant Alert Domains:\n`;
    for (const domain of domains) {
      prompt += `- ${domain.domain}: ${domain.description} (${domain.priority} priority)\n`;
    }

    prompt += `\nRelevant Categories: ${categories.map(c => c.replace(/_/g, ' ')).join(', ')}\n\n`;

    // Mode-specific context
    switch (mode) {
      case TransportMode.CAR:
        prompt += `The user is driving. Focus on:\n`;
        prompt += `- Traffic conditions and alternative routes\n`;
        prompt += `- Fuel station locations and pricing\n`;
        prompt += `- Road safety and hazards\n`;
        prompt += `- Parking availability\n`;
        prompt += `- Road trip suggestions and scenic routes\n`;
        if (context.tripType === 'REGIONAL') {
          prompt += `- Border crossing information\n`;
          prompt += `- Cross-border driving regulations\n`;
        }
        break;

      case TransportMode.FLIGHT:
        prompt += `The user is flying. Focus on:\n`;
        prompt += `- Flight status, delays, and gate changes\n`;
        prompt += `- Check-in and boarding reminders\n`;
        prompt += `- Terminal and airport information\n`;
        prompt += `- Baggage policies\n`;
        prompt += `- Travel document requirements\n`;
        prompt += `- Destination arrival and airport transfers\n`;
        break;

      case TransportMode.BUS:
        prompt += `The user is travelling by bus. Focus on:\n`;
        prompt += `- Bus schedules and delays\n`;
        prompt += `- Terminal and stop locations\n`;
        prompt += `- Route changes\n`;
        break;

      case TransportMode.TRAIN:
        prompt += `The user is travelling by train. Focus on:\n`;
        prompt += `- Train schedules and delays\n`;
        prompt += `- Platform and track information\n`;
        prompt += `- Service disruptions\n`;
        break;

      case TransportMode.WALKING:
        prompt += `The user is walking. Focus on:\n`;
        prompt += `- Safe walking routes\n`;
        prompt += `- Nearby attractions within walking distance\n`;
        prompt += `- Weather conditions\n`;
        prompt += `- Public amenities\n`;
        break;

      case TransportMode.CYCLING:
        prompt += `The user is cycling. Focus on:\n`;
        prompt += `- Bike lane availability\n`;
        prompt += `- Terrain and elevation\n`;
        prompt += `- Cycling safety\n`;
        break;

      case TransportMode.BOAT:
        prompt += `The user is travelling by boat/ferry. Focus on:\n`;
        prompt += `- Marine weather conditions\n`;
        prompt += `- Ferry schedules\n`;
        prompt += `- Safety information\n`;
        break;

      case TransportMode.MOTORCYCLE:
        prompt += `The user is riding a motorcycle. Focus on:\n`;
        prompt += `- Road hazards specific to motorcycles\n`;
        prompt += `- Weather conditions\n`;
        prompt += `- Safety gear reminders\n`;
        break;
    }

    return prompt;
  }

  /**
   * Check if a recommendation category is relevant for a given mode.
   */
  isCategoryRelevant(mode: TransportMode, category: RecommendationCategory): boolean {
    const categories = this.getRecommendedCategories(mode);
    return categories.includes(category);
  }

  /**
   * Get all available transport modes.
   */
  getAllModes(): TransportMode[] {
    return Object.values(TransportMode);
  }
}

export const transportModeEngine = new TransportModeEngine();
export default transportModeEngine;