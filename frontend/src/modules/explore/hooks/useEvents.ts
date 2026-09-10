/**
 * useEvents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for discovering events and festivals.
 * Provides upcoming events with filtering and sorting capabilities.
 * Falls back to curated sample events when no data is available.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { ExploreEngine } from '@/src/modules/explore/services/ExploreEngine';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import type { Event } from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseEventsReturn {
  events: Event[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

interface UseEventsOptions {
  global?: boolean; // Fetch global events instead of local
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useEvents(options: UseEventsOptions = {}): UseEventsReturn {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  /* ── Load events ─────────────────────────────────────────────────────────── */

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from engine (no cache for events - always show fresh data)
      const result = await ExploreEngine.loadEvents({ 
        pageSize: 20,
        // If global mode, we'll fetch events from Ticketmaster worldwide
        ...(options.global && { global: true }), // Get global events from Ticketmaster API
      });
      
      if (result && result.data && result.data.length > 0) {
        setEvents(result.data);
        setHasMore(result.hasMore || false);
        await ExploreCacheService.setCachedEvents(result.data);
        console.log('[useEvents] Loaded', result.data.length, 'events from engine (global:', options.global, ')');
      } else {
        // No events available - show empty state
        setEvents([]);
        setHasMore(false);
        console.log('[useEvents] No events available from engine (global:', options.global, ')');
      }
    } catch (err) {
      console.error('[useEvents] Error loading events:', err);
      // On error, show empty state instead of fallback
      setEvents([]);
      setError('Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [options.global]);

  /* ── Load on mount ───────────────────────────────────────────────────────── */

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    // Clear cache to ensure fresh data
    await ExploreCacheService.clearAllExploreCache();
    console.log('[useEvents] Cache cleared for refresh');
    await loadEvents();
  }, [loadEvents]);

  /* ── Load more ────────────────────────────────────────────────────────────── */

  const loadMore = useCallback(async () => {
    // Implementation for pagination if needed
    console.log('[useEvents] Load more not yet implemented');
  }, []);

  /* ── Return ───────────────────────────────────────────────────────────────── */

  return {
    events,
    loading,
    error,
    refresh,
    loadMore,
    hasMore,
  };
}