/**
 * TimingEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates alerts and recommendations at the correct moment in the journey.
 *
 * Every piece of content should be delivered when it is most useful:
 * - 2 days before: packing reminders, passport reminders, weather forecast
 * - Morning of travel: traffic, fuel, flight, border wait times
 * - During travel: nearby attractions, road hazards, weather, restaurants
 * - At destination: local events, recommendations, safety, nearby places
 * - Before returning: traffic, checkout, airport, fuel, road conditions
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TripStage, TransportMode, type TripIntelligenceContext } from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TIME WINDOW DEFINITIONS                                                   */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface TimeWindow {
  label: string;
  description: string;
  /** Offset in milliseconds from the reference event */
  offsetMs: number;
  /** Reference event: 'departure', 'arrival', 'return' */
  reference: 'departure' | 'arrival' | 'return' | 'now';
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CONTENT TIMING SCHEDULES                                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface TimedContent {
  id: string;
  category: string;
  title: string;
  timing: {
    /** When this content should be delivered */
    windows: TimeWindow[];
    /** Maximum frequency (how often to repeat) */
    maxFrequency: 'once' | 'daily' | 'hourly' | 'realtime';
    /** Whether to re-evaluate and regenerate */
    reEvaluate: boolean;
  };
}

const CONTENT_TIMING: TimedContent[] = [
  // ── Pre-trip (Planning Stage) ──
  {
    id: 'packing_reminder',
    category: 'documents',
    title: 'Packing Reminder',
    timing: {
      windows: [
        { label: '2 days before', description: 'Remind user to pack', offsetMs: -2 * 24 * 60 * 60 * 1000, reference: 'departure' },
        { label: '1 day before', description: 'Final packing check', offsetMs: -1 * 24 * 60 * 60 * 1000, reference: 'departure' },
      ],
      maxFrequency: 'daily',
      reEvaluate: false,
    },
  },
  {
    id: 'passport_check',
    category: 'documents',
    title: 'Passport Validity Check',
    timing: {
      windows: [
        { label: '7 days before', description: 'Check passport validity', offsetMs: -7 * 24 * 60 * 60 * 1000, reference: 'departure' },
        { label: '2 days before', description: 'Final passport check', offsetMs: -2 * 24 * 60 * 60 * 1000, reference: 'departure' },
      ],
      maxFrequency: 'once',
      reEvaluate: false,
    },
  },
  {
    id: 'weather_forecast',
    category: 'weather',
    title: 'Weather Forecast',
    timing: {
      windows: [
        { label: '2 days before', description: 'Check destination weather', offsetMs: -2 * 24 * 60 * 60 * 1000, reference: 'departure' },
        { label: 'Morning of travel', description: 'Final weather check', offsetMs: -3 * 60 * 60 * 1000, reference: 'departure' },
      ],
      maxFrequency: 'daily',
      reEvaluate: true,
    },
  },

  // ── Day of Travel ──
  {
    id: 'traffic_check',
    category: 'navigation',
    title: 'Traffic to Departure',
    timing: {
      windows: [
        { label: 'Morning of travel', description: 'Check traffic to airport/station', offsetMs: -3 * 60 * 60 * 1000, reference: 'departure' },
        { label: '2 hours before', description: 'Re-check traffic', offsetMs: -2 * 60 * 60 * 1000, reference: 'departure' },
      ],
      maxFrequency: 'hourly',
      reEvaluate: true,
    },
  },
  {
    id: 'fuel_check',
    category: 'navigation',
    title: 'Fuel Check',
    timing: {
      windows: [
        { label: 'Morning of travel', description: 'Check fuel level', offsetMs: -2 * 60 * 60 * 1000, reference: 'departure' },
      ],
      maxFrequency: 'once',
      reEvaluate: false,
    },
  },
  {
    id: 'flight_status',
    category: 'transport',
    title: 'Flight Status',
    timing: {
      windows: [
        { label: '24 hours before', description: 'Check flight status', offsetMs: -24 * 60 * 60 * 1000, reference: 'departure' },
        { label: '3 hours before', description: 'Re-check flight status', offsetMs: -3 * 60 * 60 * 1000, reference: 'departure' },
        { label: 'At airport', description: 'Gate and boarding info', offsetMs: 0, reference: 'now' },
      ],
      maxFrequency: 'realtime',
      reEvaluate: true,
    },
  },
  {
    id: 'border_wait',
    category: 'navigation',
    title: 'Border Wait Times',
    timing: {
      windows: [
        { label: 'Approaching border', description: 'Check wait times', offsetMs: 0, reference: 'now' },
      ],
      maxFrequency: 'hourly',
      reEvaluate: true,
    },
  },

  // ── During Travel ──
  {
    id: 'nearby_attractions',
    category: 'nearby_experiences',
    title: 'Nearby Attractions',
    timing: {
      windows: [
        { label: 'During travel', description: 'Attractions along route', offsetMs: 0, reference: 'now' },
        { label: 'At destination', description: 'Local attractions', offsetMs: 0, reference: 'arrival' },
      ],
      maxFrequency: 'daily',
      reEvaluate: true,
    },
  },
  {
    id: 'road_hazards',
    category: 'safety',
    title: 'Road Hazards',
    timing: {
      windows: [
        { label: 'During travel', description: 'Real-time hazard alerts', offsetMs: 0, reference: 'now' },
      ],
      maxFrequency: 'realtime',
      reEvaluate: true,
    },
  },
  {
    id: 'weather_update',
    category: 'weather',
    title: 'Weather Update',
    timing: {
      windows: [
        { label: 'During travel', description: 'Current conditions', offsetMs: 0, reference: 'now' },
        { label: 'At destination', description: 'Destination weather', offsetMs: 0, reference: 'arrival' },
      ],
      maxFrequency: 'hourly',
      reEvaluate: true,
    },
  },
  {
    id: 'restaurant_recommendations',
    category: 'food',
    title: 'Restaurant Recommendations',
    timing: {
      windows: [
        { label: 'At destination', description: 'Local dining options', offsetMs: 0, reference: 'arrival' },
        { label: 'Meal times', description: 'Lunch/dinner suggestions', offsetMs: 0, reference: 'now' },
      ],
      maxFrequency: 'daily',
      reEvaluate: true,
    },
  },

  // ── At Destination ──
  {
    id: 'local_events',
    category: 'events',
    title: 'Local Events',
    timing: {
      windows: [
        { label: 'At destination', description: 'Events happening now', offsetMs: 0, reference: 'arrival' },
        { label: 'Weekend', description: 'Weekend events', offsetMs: 0, reference: 'now' },
      ],
      maxFrequency: 'daily',
      reEvaluate: true,
    },
  },
  {
    id: 'safety_info',
    category: 'safety',
    title: 'Safety Information',
    timing: {
      windows: [
        { label: 'At destination', description: 'Local safety tips', offsetMs: 0, reference: 'arrival' },
      ],
      maxFrequency: 'once',
      reEvaluate: false,
    },
  },
  {
    id: 'currency_exchange',
    category: 'budget',
    title: 'Currency Exchange',
    timing: {
      windows: [
        { label: 'At destination', description: 'Best exchange rates', offsetMs: 0, reference: 'arrival' },
        { label: 'Before return', description: 'Exchange remaining currency', offsetMs: -4 * 60 * 60 * 1000, reference: 'return' },
      ],
      maxFrequency: 'once',
      reEvaluate: false,
    },
  },

  // ── Before Returning ──
  {
    id: 'checkout_reminder',
    category: 'accommodation',
    title: 'Hotel Checkout Reminder',
    timing: {
      windows: [
        { label: 'Morning of checkout', description: 'Checkout time reminder', offsetMs: -3 * 60 * 60 * 1000, reference: 'return' },
        { label: '1 hour before checkout', description: 'Final checkout reminder', offsetMs: -1 * 60 * 60 * 1000, reference: 'return' },
      ],
      maxFrequency: 'hourly',
      reEvaluate: false,
    },
  },
  {
    id: 'return_traffic',
    category: 'navigation',
    title: 'Return Traffic Check',
    timing: {
      windows: [
        { label: 'Before return', description: 'Check traffic on return route', offsetMs: -2 * 60 * 60 * 1000, reference: 'return' },
      ],
      maxFrequency: 'hourly',
      reEvaluate: true,
    },
  },
  {
    id: 'airport_reminder',
    category: 'transport',
    title: 'Airport Departure Reminder',
    timing: {
      windows: [
        { label: '3 hours before flight', description: 'Head to airport', offsetMs: -3 * 60 * 60 * 1000, reference: 'return' },
        { label: '2 hours before flight', description: 'Arrive at airport', offsetMs: -2 * 60 * 60 * 1000, reference: 'return' },
      ],
      maxFrequency: 'once',
      reEvaluate: false,
    },
  },
];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TIMING ENGINE                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */

export class TimingEngine {
  /**
   * Get all timed content definitions.
   */
  getAllTimedContent(): TimedContent[] {
    return CONTENT_TIMING;
  }

  /**
   * Get content scheduled for a specific time window.
   */
  getContentForTime(context: TripIntelligenceContext): TimedContent[] {
    const now = Date.now();
    const departure = context.itinerary.find(e => e.id === 'departure')?.startTime;
    const arrival = context.itinerary.find(e => e.id === 'arrival')?.startTime;
    const departureMs = departure ? new Date(departure).getTime() : null;
    const arrivalMs = arrival ? new Date(arrival).getTime() : null;

    return CONTENT_TIMING.filter(content => {
      return content.timing.windows.some(window => {
        let referenceMs: number | null = null;

        switch (window.reference) {
          case 'departure':
            referenceMs = departureMs;
            break;
          case 'arrival':
            referenceMs = arrivalMs;
            break;
          case 'return':
            // Return is typically the arrival time for the return leg
            // For now, use departure + estimated trip duration
            if (departureMs && arrivalMs) {
              const tripDuration = arrivalMs - departureMs;
              referenceMs = departureMs + tripDuration * 2; // Estimate return
            }
            break;
          case 'now':
            referenceMs = now;
            break;
        }

        if (referenceMs === null) return false;

        const windowStart = referenceMs + window.offsetMs - 60 * 60 * 1000; // 1 hour window
        const windowEnd = referenceMs + window.offsetMs + 60 * 60 * 1000; // 1 hour window

        return now >= windowStart && now <= windowEnd;
      });
    });
  }

  /**
   * Get content for a specific category.
   */
  getContentByCategory(category: string): TimedContent[] {
    return CONTENT_TIMING.filter(c => c.category === category);
  }

  /**
   * Check if a specific content item is due now.
   */
  isDueNow(contentId: string, context: TripIntelligenceContext): boolean {
    const content = CONTENT_TIMING.find(c => c.id === contentId);
    if (!content) return false;

    const dueContent = this.getContentForTime(context);
    return dueContent.some(c => c.id === contentId);
  }

  /**
   * Get timing-based prompt context for AI generation.
   */
  getTimingPromptContext(context: TripIntelligenceContext): string {
    const dueContent = this.getContentForTime(context);
    const now = new Date();

    let prompt = `Current Time: ${now.toLocaleString()}\n`;

    if (context.itinerary.length > 0) {
      const departure = context.itinerary.find(e => e.id === 'departure');
      const arrival = context.itinerary.find(e => e.id === 'arrival');
      if (departure) prompt += `Departure: ${departure.startTime}\n`;
      if (arrival) prompt += `Arrival: ${arrival.startTime}\n`;
    }

    if (dueContent.length > 0) {
      prompt += `\nContent due now:\n`;
      for (const content of dueContent) {
        const activeWindows = content.timing.windows.filter(w => {
          let refMs: number | null = null;
          const departure = context.itinerary.find(e => e.id === 'departure')?.startTime;
          const arrival = context.itinerary.find(e => e.id === 'arrival')?.startTime;
          if (w.reference === 'departure' && departure) refMs = new Date(departure).getTime();
          if (w.reference === 'arrival' && arrival) refMs = new Date(arrival).getTime();
          if (w.reference === 'now') refMs = Date.now();
          if (!refMs) return false;
          const ws = refMs + w.offsetMs - 3600000;
          const we = refMs + w.offsetMs + 3600000;
          return Date.now() >= ws && Date.now() <= we;
        });
        prompt += `- ${content.title} (${activeWindows.map(w => w.label).join(', ')})\n`;
      }
    }

    return prompt;
  }

  /**
   * Get the recommended frequency for a content type.
   */
  getFrequency(contentId: string): 'once' | 'daily' | 'hourly' | 'realtime' {
    const content = CONTENT_TIMING.find(c => c.id === contentId);
    return content?.timing.maxFrequency || 'once';
  }

  /**
   * Check if content should be re-evaluated.
   */
  shouldReEvaluate(contentId: string): boolean {
    const content = CONTENT_TIMING.find(c => c.id === contentId);
    return content?.timing.reEvaluate || false;
  }
}

export const timingEngine = new TimingEngine();
export default timingEngine;