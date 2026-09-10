/**
 * TripTypeAnalytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Analytics tracking service for trip-type-aware features.
 * Tracks separately for LOCAL, REGIONAL, and INTERNATIONAL trip types.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TripType } from './TripClassificationService';

export type TripAnalyticsEvent =
  | 'trip_created'
  | 'trip_viewed'
  | 'trip_completed'
  | 'trip_cancelled'
  | 'monitoring_opened'
  | 'timeline_viewed'
  | 'budget_planner_viewed'
  | 'documents_viewed'
  | 'notifications_viewed'
  | 'ai_builder_used'
  | 'maps_viewed'
  | 'journey_coordinated'
  | 'last_mile_used'
  | 'booking_opened';

interface AnalyticsEvent {
  event: TripAnalyticsEvent;
  tripType: TripType;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * In-memory analytics store for trip-type events.
 * In production, this would send events to a backend analytics service.
 */
class TripTypeAnalyticsStore {
  private events: AnalyticsEvent[] = [];
  private listeners: Array<(event: AnalyticsEvent) => void> = [];

  /**
   * Track an analytics event.
   */
  track(
    event: TripAnalyticsEvent,
    tripType: TripType,
    metadata?: Record<string, any>,
  ): void {
    const analyticsEvent: AnalyticsEvent = {
      event,
      tripType,
      timestamp: Date.now(),
      metadata,
    };

    this.events.push(analyticsEvent);
    console.log(`[Analytics] ${event} | Type: ${tripType}`, metadata || '');

    // Notify listeners
    this.listeners.forEach((listener) => listener(analyticsEvent));
  }

  /**
   * Subscribe to analytics events.
   */
  subscribe(listener: (event: AnalyticsEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get all tracked events.
   */
  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by trip type.
   */
  getEventsByType(tripType: TripType): AnalyticsEvent[] {
    return this.events.filter((e) => e.tripType === tripType);
  }

  /**
   * Get event counts by trip type.
   */
  getEventCounts(): Record<TripType, Record<TripAnalyticsEvent, number>> {
    const counts: Record<string, Record<string, number>> = {
      [TripType.LOCAL]: {} as any,
      [TripType.REGIONAL]: {} as any,
      [TripType.INTERNATIONAL]: {} as any,
    };

    for (const event of this.events) {
      if (!counts[event.tripType][event.event]) {
        counts[event.tripType][event.event] = 0;
      }
      counts[event.tripType][event.event]++;
    }

    return counts as Record<TripType, Record<TripAnalyticsEvent, number>>;
  }

  /**
   * Get aggregate analytics summary.
   */
  getSummary(): {
    totalTrips: Record<TripType, number>;
    completions: Record<TripType, number>;
    averageDuration: Record<TripType, number>;
    aiUsage: Record<TripType, number>;
    budgetAccuracy: Record<TripType, number>;
  } {
    const totalTrips = {
      [TripType.LOCAL]: this.getEventsByType(TripType.LOCAL).filter((e) => e.event === 'trip_created').length,
      [TripType.REGIONAL]: this.getEventsByType(TripType.REGIONAL).filter((e) => e.event === 'trip_created').length,
      [TripType.INTERNATIONAL]: this.getEventsByType(TripType.INTERNATIONAL).filter((e) => e.event === 'trip_created').length,
    };

    const completions = {
      [TripType.LOCAL]: this.getEventsByType(TripType.LOCAL).filter((e) => e.event === 'trip_completed').length,
      [TripType.REGIONAL]: this.getEventsByType(TripType.REGIONAL).filter((e) => e.event === 'trip_completed').length,
      [TripType.INTERNATIONAL]: this.getEventsByType(TripType.INTERNATIONAL).filter((e) => e.event === 'trip_completed').length,
    };

    const aiUsage = {
      [TripType.LOCAL]: this.getEventsByType(TripType.LOCAL).filter((e) => e.event === 'ai_builder_used').length,
      [TripType.REGIONAL]: this.getEventsByType(TripType.REGIONAL).filter((e) => e.event === 'ai_builder_used').length,
      [TripType.INTERNATIONAL]: this.getEventsByType(TripType.INTERNATIONAL).filter((e) => e.event === 'ai_builder_used').length,
    };

    return {
      totalTrips,
      completions,
      averageDuration: { [TripType.LOCAL]: 0, [TripType.REGIONAL]: 0, [TripType.INTERNATIONAL]: 0 },
      aiUsage,
      budgetAccuracy: { [TripType.LOCAL]: 0, [TripType.REGIONAL]: 0, [TripType.INTERNATIONAL]: 0 },
    };
  }

  /**
   * Clear all events (for testing).
   */
  clear(): void {
    this.events = [];
  }
}

// Singleton instance
export const tripTypeAnalytics = new TripTypeAnalyticsStore();

/**
 * Convenience function to track trip events with a TripType.
 */
export function trackTripEvent(
  event: TripAnalyticsEvent,
  tripType: TripType,
  metadata?: Record<string, any>,
): void {
  tripTypeAnalytics.track(event, tripType, metadata);
}

export default tripTypeAnalytics;