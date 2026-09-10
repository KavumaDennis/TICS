/**
 * useProgressiveExplore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Progressive loading hook for the Explore screen.
 *
 * Uses the ExploreLoadingOrchestrator to achieve:
 * - Cache-first rendering (instant content from cache)
 * - Independent per-section loading (one slow API never blocks)
 * - Prioritized loading (critical content first)
 * - Section-level skeleton states
 * - Background refresh after initial render
 * - Viewport-triggered lazy loading
 * - Performance analytics
 *
 * The hook returns section data and loading states so the UI can render
 * each section independently with its own skeleton/error/loaded state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { exploreOrchestrator, ExploreLoadingOrchestrator } from '@/src/modules/explore/services/ExploreLoadingOrchestrator';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import type {
  ExploreCategory,
  Destination,
  Event,
  WeekendEscape,
  NearbyItem,
  ExploreRecommendation,
  JourneyFeedItem,
} from '@/src/modules/explore/types';
import type {
  ExploreLoadingState,
  ExploreSectionKey,
  SectionStatus,
} from '@/src/modules/explore/types/exploreLoading';

/* ── Section Data Interface ─────────────────────────────────────────────────── */

export interface ExploreSectionData {
  categories: ExploreCategory[];
  trending: Destination[];
  popular: Destination[];
  nearby: NearbyItem[];
  events: Event[];
  aiRecommendations: ExploreRecommendation[];
  journeyFeed: JourneyFeedItem[];
  weekendEscapes: WeekendEscape[];
}

/* ── Hook Return Type ───────────────────────────────────────────────────────── */

export interface UseProgressiveExploreReturn {
  /** Per-section loading states */
  loadingState: ExploreLoadingState;
  /** Per-section data */
  data: ExploreSectionData;
  /** Overall interactive flag (true when priority 1 sections are loaded) */
  isInteractive: boolean;
  /** Overall loading flag (true only on very first load with no cache) */
  isLoading: boolean;
  /** Trigger viewport-based loading for a lazy section */
  onSectionVisible: (key: ExploreSectionKey) => void;
  /** Retry a failed section */
  retrySection: (key: ExploreSectionKey) => Promise<void>;
  /** Manual full refresh */
  refresh: () => Promise<void>;
  /** Preload priority 1 data (called from other screens) */
  preload: () => Promise<void>;
}

const INITIAL_DATA: ExploreSectionData = {
  categories: [],
  trending: [],
  popular: [],
  nearby: [],
  events: [],
  aiRecommendations: [],
  journeyFeed: [],
  weekendEscapes: [],
};

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useProgressiveExplore(
  userId?: string,
  location?: { lat: number; lng: number },
): UseProgressiveExploreReturn {
  const [loadingState, setLoadingState] = useState<ExploreLoadingState>(
    () => exploreOrchestrator.getLoadingState() as ExploreLoadingState,
  );
  const [data, setData] = useState<ExploreSectionData>(() => loadAllFromCache());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const mountedRef = useRef(true);

  // Determine if the screen is interactive (priority 1 sections available)
  const isInteractive =
    loadingState.categories.status === 'loaded' ||
    loadingState.trending.status === 'loaded' ||
    loadingState.popular.status === 'loaded' ||
    (data.categories.length > 0 || data.trending.length > 0 || data.popular.length > 0);

  const isLoading = !hasLoadedOnce && !isInteractive;

  /* ── Load all available data from cache ────────────────────────────────────── */

  function loadAllFromCache(): ExploreSectionData {
    return {
      categories: data?.categories ?? [],
      trending: [],
      popular: [],
      nearby: [],
      events: [],
      aiRecommendations: [],
      journeyFeed: [],
      weekendEscapes: [],
    };
  }

  /* ── Subscribe to orchestrator state changes ──────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = exploreOrchestrator.subscribe(() => {
      if (!mountedRef.current) return;
      const newState = exploreOrchestrator.getLoadingState() as ExploreLoadingState;
      setLoadingState(newState);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  /* ── Run initial load ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (hasLoadedOnce) return;

    exploreOrchestrator.loadAll(userId, location).finally(() => {
      if (mountedRef.current) setHasLoadedOnce(true);
    });
  }, [userId, location, hasLoadedOnce]);

  /* ── Viewport-Triggered Loading ───────────────────────────────────────────── */

  const onSectionVisible = useCallback(
    (key: ExploreSectionKey) => {
      exploreOrchestrator.loadLazySection(key);
    },
    [],
  );

  /* ── Retry Failed Section ──────────────────────────────────────────────────── */

  const retrySection = useCallback(
    async (key: ExploreSectionKey) => {
      await exploreOrchestrator.retrySection(key, userId, location);
    },
    [userId, location],
  );

  /* ── Full Refresh ──────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    exploreOrchestrator.reset();
    await exploreOrchestrator.loadAll(userId, location);
  }, [userId, location]);

  /* ── Preload (called from Home/Trips/Profile) ─────────────────────────────── */

  const preload = useCallback(async () => {
    await exploreOrchestrator.preloadPriority1Data(userId, location);
  }, [userId, location]);

  return {
    loadingState,
    data,
    isInteractive,
    isLoading,
    onSectionVisible,
    retrySection,
    refresh,
    preload,
  };
}

export default useProgressiveExplore;