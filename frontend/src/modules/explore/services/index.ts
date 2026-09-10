/**
 * Services Barrel Export
 * ─────────────────────────────────────────────────────────────────────────────
 * Central export point for all Explore module services.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export { ExploreService } from './ExploreService';
export { SearchService } from './SearchService';
export { ExploreCacheService } from './ExploreCacheService';
export { ExploreEngine } from './ExploreEngine';
export { NearMeService, NearMeEngine } from './nearme';

// Discovery Orchestrator and Providers
export { DiscoveryOrchestrator } from './discovery/DiscoveryOrchestrator';
export { PlacesProvider } from './discovery/PlacesProvider';
export { OpenStreetMapProvider } from './discovery/OpenStreetMapProvider';
export { EventsProvider } from './discovery/EventsProvider';
export { TrendingEngine } from './discovery/TrendingEngine';
export { PopularityEngine } from './discovery/PopularityEngine';
export { CategoryDiscoveryEngine } from './discovery/CategoryDiscoveryEngine';
export { WeekendEscapeEngine } from './discovery/WeekendEscapeEngine';
export { JourneyFeedGenerator } from './discovery/JourneyFeedGenerator';
export { GeminiRankingService } from './discovery/GeminiRankingService';

// Destination provider layer (OSM-first)
export {
  DestinationAggregator,
  toNearbyItems as aggregatorToNearbyItems,
  toDestination as aggregatorToDestination,
} from './discovery/DestinationAggregator';
export {
  OpenStreetMapProvider as PrimaryOpenStreetMapProvider,
  FirestoreDestinationProvider,
  WikidataProvider,
  GeoNamesProvider,
  GooglePlacesProvider,
  isGooglePlacesEnabled,
  isGoogleMapsEnabled,
  getEnabledDestinationProviders,
} from './discovery/providers';
export type {
  TICSDestination,
  DestinationProvider,
  DestinationSource,
} from './discovery/providers';
export {
  enrichDestinations,
  enrichWeekendEscapes,
  enrichNearbyItems,
  enrichExploreSections,
} from './discovery/DestinationImageService';

// AI Discovery Module
export {
  AIDiscoveryService,
  IntentDetector,
  EntityExtractor,
  PromptBuilder,
  GeminiService,
  ConversationManager,
  FallbackEngine,
  AIDiscoveryCache,
} from './ai';

export type {
  TravelIntent,
  ExtractedEntities,
  BudgetEstimate,
  WeatherInfo,
  Place,
  AIRecommendation,
  AIDiscoveryResponse,
  ConversationMessage,
  ConversationContext,
  AIUserContext,
  AIDiscoveryOptions,
  AIDiscoveryAnalyticsEvent,
  AIDiscoveryError,
  SuggestedPrompt,
} from './ai';
