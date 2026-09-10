/**
 * AI Discovery Module Barrel Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Central export point for all AI Discovery services.
 * UI should only import from this barrel file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { AIDiscoveryEngine, createDiscoveryError } from './AIDiscoveryEngine';
export { DiscoveryContextBuilder } from './DiscoveryContextBuilder';
export { DiscoveryCandidateService } from './DiscoveryCandidateService';
export { DiscoveryPersonalizationService } from './DiscoveryPersonalizationService';
export { DiscoveryRankingService } from './DiscoveryRankingService';
export { DiscoveryCacheService } from './DiscoveryCacheService';

export type {
  DiscoveryUserContext,
  DiscoveryCandidate,
  DiscoveryCandidateType,
  AIRecommendation,
  DiscoverySection,
  DiscoverySectionType,
  DiscoveryFeed,
  DiscoveryOptions,
  DiscoveryAnalyticsEvent,
  DiscoveryInteraction,
  DiscoveryCacheEntry,
  GeminiDiscoveryResponse,
  DiscoveryError,
} from './types';