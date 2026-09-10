/**
 * useJourneyFeed.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for the journey feed - an Instagram-style travel feed with events,
 * weather alerts, travel advisories, trending destinations, and more.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ExploreService } from '@/src/modules/explore/services';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import type { JourneyFeedItem } from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseJourneyFeedReturn {
  items: JourneyFeedItem[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useJourneyFeed(): UseJourneyFeedReturn {
  const [items, setItems] = useState<JourneyFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  /* ── Load feed ────────────────────────────────────────────────────────────── */

  const loadFeed = useCallback(async (isRefresh = false) => {
    if (loadingRef.current && !isRefresh) return;
    loadingRef.current = true;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      // Try cache first on initial load
      if (isRefresh) {
        const cached = await ExploreCacheService.getCachedJourneyFeed();
        if (cached) {
          setItems(cached);
        }
      }

      const result = await ExploreService.loadJourneyFeed({
        cursor: isRefresh ? undefined : cursorRef.current ?? undefined,
      });

      if (isRefresh) {
        setItems(result.data);
      } else {
        setItems((prev) => [...prev, ...result.data]);
      }

      setHasMore(result.hasMore);
      cursorRef.current = result.lastCursor;

      // Update cache
      if (isRefresh && result.data.length) {
        ExploreCacheService.setCachedJourneyFeed(result.data);
      }
    } catch (err) {
      console.error('[useJourneyFeed] Error:', err);
      setError('Failed to load journey feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, []);

  /* ── Load on mount ────────────────────────────────────────────────────────── */

  useEffect(() => {
    loadFeed(true);
  }, [loadFeed]);

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    cursorRef.current = null;
    await loadFeed(true);
  }, [loadFeed]);

  /* ── Load more ────────────────────────────────────────────────────────────── */

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;
    await loadFeed(false);
  }, [hasMore, loadFeed]);

  return {
    items,
    loading,
    error,
    refreshing,
    hasMore,
    refresh,
    loadMore,
  };
}