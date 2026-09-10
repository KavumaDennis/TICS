/**
 * Explore loading state types
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-section loading states for progressive loading architecture.
 * Each section loads independently so one slow API never blocks the screen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Loading state for a single section */
export type SectionStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'stale';

/** Metadata tracked per section */
export interface SectionMetadata {
  status: SectionStatus;
  loadedAt: number | null;   // timestamp when data was last loaded
  ttl: number;               // cache TTL in milliseconds
  error: string | null;      // last error message
  retryCount: number;        // retry attempts
}

/** Loading state for the entire Explore screen */
export interface ExploreLoadingState {
  search: SectionMetadata;
  categories: SectionMetadata;
  trending: SectionMetadata;
  popular: SectionMetadata;
  nearby: SectionMetadata;
  events: SectionMetadata;
  aiRecommendations: SectionMetadata;
  journeyFeed: SectionMetadata;
  weekendEscapes: SectionMetadata;
  analytics: SectionMetadata;
}

/** Section key type */
export type ExploreSectionKey = keyof ExploreLoadingState;

/** Priority levels for loading order */
export type LoadPriority = 1 | 2 | 3;

/** Section configuration with priority and TTL */
export interface SectionConfig {
  key: ExploreSectionKey;
  priority: LoadPriority;
  ttl: number;            // milliseconds
  lazy: boolean;          // true = only load when visible
  pageSize: number;       // initial fetch limit
}