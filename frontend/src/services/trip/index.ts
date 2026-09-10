/**
 * Trip Services Index
 * ─────────────────────────────────────────────────────────────────────────────
 * Central export point for all trip-related services.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  TripClassificationService,
  TripType,
  default as TripClassificationServiceDefault,
} from './TripClassificationService';

export type {
  ClassificationInput,
  ClassificationResult,
  CountryInfo,
} from './TripClassificationService';

export {
  tripTypeAnalytics,
  trackTripEvent,
  default as tripTypeAnalyticsDefault,
} from './TripTypeAnalytics';

export type { TripAnalyticsEvent } from './TripTypeAnalytics';