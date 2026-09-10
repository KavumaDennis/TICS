/**
 * Explore Module
 * ─────────────────────────────────────────────────────────────────────────────
 * The discovery engine of TICS. Helps users discover travel experiences and
 * convert those discoveries into coordinated journeys.
 *
 * Architecture:
 *   Screen → Components → Hooks → Services → ExploreEngine → Firestore → External APIs
 *   UI never queries Firestore directly — everything flows through ExploreEngine.
 *
 * Module Structure:
 *   types/      - TypeScript type definitions
 *   constants/  - Configuration constants
 *   services/   - Business logic and data access (ExploreEngine, ExploreService, etc.)
 *   hooks/      - React hooks tying UI to services
 *   components/ - Reusable UI components
 *   screens/    - Full screen implementations
 *   navigation/ - Navigation routing
 *   utils/      - Shared utilities
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Types
export type {
  ExploreCategory,
  Destination,
  DestinationCoordinates,
  DestinationImage,
  DestinationWeatherSummary,
  DestinationTravelTip,
  DestinationReview,
  TravelRequirement,
  EmergencyContact,
  Event,
  EventVenue,
  JourneyFeedItem,
  FeedItemType,
  SearchResult,
  SearchResultType,
  SearchSuggestion,
  SearchHistoryItem,
  PopularSearchItem,
  NearbyItem,
  NearbyPlaceType,
  NearbySortOption,
  ExploreRecommendation,
  WeekendEscape,
  ExploreAnalyticsEvent,
  PaginatedResponse,
  ServiceResponse,
  ExploreState,
  NearbyPlace,
  SectionState,
  ExploreSectionsState,
} from './types';

// Constants
export {
  FIRESTORE_COLLECTIONS,
  CACHE_KEYS,
  CACHE_TTL,
  PAGINATION,
  SEARCH_CONFIG,
  NEARBY_CONFIG,
  WEATHER_CONFIG,
  ANALYTICS_EVENTS,
  UI_CONFIG,
  ERROR_MESSAGES,
  LOADING_MESSAGES,
  TIMEOUTS,
} from './constants';

// Services
export { ExploreService } from './services/ExploreService';
export { SearchService } from './services/SearchService';
export { ExploreCacheService } from './services/ExploreCacheService';
export { ExploreEngine } from './services/ExploreEngine';
export type { ExploreEngineOptions, PersonalizedSection, ExploreHomeData } from './services/ExploreEngine';

// Hooks
export { useExplore } from './hooks/useExplore';
export { useSearch } from './hooks/useSearch';
export { useNearby } from './hooks/useNearby';
export { useJourneyFeed } from './hooks/useJourneyFeed';
export { useDestinationDetail } from './hooks/useDestinationDetail';
export { useExploreAnalytics } from './hooks/useExploreAnalytics';
export { useSearchHistory } from './hooks/useSearchHistory';
export { useWeekendEscapes } from './hooks/useWeekendEscapes';
export { useAIDiscovery } from './hooks/useAIDiscovery';
export type { AIDiscoveryState, UseAIDiscoveryReturn } from './hooks/useAIDiscovery';
export { useAIDiscoveryFeed } from './hooks/useAIDiscoveryFeed';
export type { AIDiscoveryFeedState, UseAIDiscoveryFeedReturn } from './hooks/useAIDiscoveryFeed';

// Components
export { ExploreHeader } from './components/ExploreHeader';
export { SectionHeader } from './components/SectionHeader';
export { CategoryCard } from './components/CategoryCard';
export { DestinationCard } from './components/DestinationCard';
export { EventCard } from './components/EventCard';
export { AroundYouCard } from './components/AroundYouCard';
export { WeekendEscapeCard } from './components/WeekendEscapeCard';
export { TrendingBadge } from './components/TrendingBadge';
export { AIDiscoveryButton } from './components/AIDiscoveryButton';
export { SearchBar } from './components/SearchBar';
export {
  FeedCardSkeleton,
  ExploreScreenSkeleton,
} from './components/LoadingSkeleton';

// Screens
export { ExploreHomeScreen } from './screens/ExploreHomeScreen';
export { CategoryScreen } from './screens/CategoryScreen';
export { SearchScreen } from './screens/SearchScreen';
export { JourneyFeedScreen } from './screens/JourneyFeedScreen';
export { DestinationDetailScreen } from './screens/DestinationDetailScreen';
export { EventDetailScreen } from './screens/EventDetailScreen';
export { NearMeScreen } from './screens/NearMeScreen';
export { default as AIDiscoveryScreen } from './screens/AIDiscoveryScreen';
export { AIDiscoveryFeedScreen } from './screens/AIDiscoveryFeedScreen';

// AI Discovery Engine
export * from './services/ai-discovery';

// Navigation
export {
  ExploreRouter,
  createExploreNavigationCallbacks,
} from './navigation';

export type { ExploreRoute, ExploreNavigationProps } from './navigation';

// Utils
export {
  haversineDistance,
  formatDistance,
  formatPriceLevel,
  formatRating,
  truncateText,
  getDestinationPrimaryImage,
  getCategoryIcon,
  getCategoryColor,
  generateSessionToken,
  formatDateRange,
  isEventHappening,
  isEventUpcoming,
  getSeason,
} from './utils';