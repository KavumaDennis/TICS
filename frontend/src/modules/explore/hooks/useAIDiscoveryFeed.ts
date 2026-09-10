/**
 * useAIDiscoveryFeed.ts - AI Discovery feed hook
 * Implements cache-first rendering with background refresh.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { AIDiscoveryEngine } from '@/src/modules/explore/services/ai-discovery/AIDiscoveryEngine';
import { withTimeout, PROVIDER_TIMEOUTS } from '@/src/modules/explore/utils/withTimeout';
import { DiscoveryCacheService } from '@/src/modules/explore/services/ai-discovery/DiscoveryCacheService';
import { DiscoveryPersonalizationService } from '@/src/modules/explore/services/ai-discovery/DiscoveryPersonalizationService';
import type { DiscoveryFeed, DiscoveryOptions, AIRecommendation, DiscoverySectionType } from '@/src/modules/explore/services/ai-discovery/types';

export interface AIDiscoveryFeedState {
  feed: DiscoveryFeed | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
}

export interface UseAIDiscoveryFeedReturn extends AIDiscoveryFeedState {
  refresh: () => Promise<void>;
  trackInteraction: (event: 'discovery_clicked' | 'discovery_viewed' | 'discovery_saved' | 'discovery_dismissed' | 'discovery_coordinated' | 'discovery_shared', recommendation: AIRecommendation, sectionType: DiscoverySectionType, metadata?: Record<string, unknown>) => Promise<void>;
  clearCache: () => Promise<void>;
}

const INITIAL_STATE: AIDiscoveryFeedState = { feed: null, loading: true, refreshing: false, error: null, hasLoadedOnce: false };

export function useAIDiscoveryFeed(options: Omit<DiscoveryOptions, 'userId'> = {}): UseAIDiscoveryFeedReturn {
  const [state, setState] = useState<AIDiscoveryFeedState>(INITIAL_STATE);
  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid;
  const hasMountedRef = useRef(false);

  const buildOptions = useCallback((): DiscoveryOptions => ({ ...options, userId }), [options, userId]);

  const loadFeed = useCallback(async (forceRefresh = false) => {
    const discoveryOptions = buildOptions();
    const cached = await DiscoveryCacheService.getImmediate(discoveryOptions);
    if (cached && !forceRefresh) {
      setState((prev) => ({ ...prev, feed: cached, loading: false, refreshing: false, error: null, hasLoadedOnce: true }));
    }
    try {
      // Strict background budget: AI discovery must NEVER hang for tens of
      // seconds. The engine itself already falls back to rule-based ranking
      // when Gemini fails/times out; this caps the whole operation.
      const freshFeed = await withTimeout(
        AIDiscoveryEngine.discover({ ...discoveryOptions, forceRefresh }),
        PROVIDER_TIMEOUTS.GEMINI * 3,
        'ai_discovery_budget'
      );
      if (!hasMountedRef.current) return; // cancelled — screen unmounted
      setState({ feed: freshFeed, loading: false, refreshing: false, error: null, hasLoadedOnce: true });
    } catch (err: any) {
      if (!hasMountedRef.current) return;
      setState((prev) => ({ ...prev, loading: false, refreshing: false, error: err?.message || 'Failed to load AI Discovery', hasLoadedOnce: prev.hasLoadedOnce }));
    }
  }, [buildOptions]);

  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    loadFeed();
  }, [loadFeed]);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, refreshing: true }));
    await loadFeed(true);
  }, [loadFeed]);

  const trackInteraction = useCallback(async (event: 'discovery_clicked' | 'discovery_viewed' | 'discovery_saved' | 'discovery_dismissed' | 'discovery_coordinated' | 'discovery_shared', recommendation: AIRecommendation, sectionType: DiscoverySectionType, metadata: Record<string, unknown> = {}) => {
    await DiscoveryPersonalizationService.trackInteraction({ userId, event, recommendation, sectionType, metadata });
  }, [userId]);

  const clearCache = useCallback(async () => {
    await DiscoveryCacheService.clear(userId);
    setState(INITIAL_STATE);
    hasMountedRef.current = false;
    await loadFeed();
  }, [userId, loadFeed]);

  return { ...state, refresh, trackInteraction, clearCache };
}

export function getFeedRecommendations(feed: DiscoveryFeed | null): AIRecommendation[] {
  if (!feed) return [];
  return feed.sections.flatMap((s: any) => s.recommendations);
}

export function getSectionRecommendations(feed: DiscoveryFeed | null, sectionType: DiscoverySectionType): AIRecommendation[] {
  if (!feed) return [];
  return feed.sections.find((s: any) => s.type === sectionType)?.recommendations || [];
}