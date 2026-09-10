/**
 * useSearchHistory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for managing search history with AsyncStorage persistence.
 * Provides recent searches, popular searches, and history management.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SearchHistoryItem, PopularSearchItem } from '@/src/modules/explore/types';
import { SEARCH_CONFIG, CACHE_KEYS } from '@/src/modules/explore/constants';

/* ── Storage Keys ───────────────────────────────────────────────────────────── */

const STORAGE_KEYS = {
  SEARCH_HISTORY: '@tics_search_history',
  POPULAR_SEARCHES: '@tics_popular_searches',
} as const;

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseSearchHistoryReturn {
  searchHistory: SearchHistoryItem[];
  popularSearches: PopularSearchItem[];
  addToHistory: (query: string, resultCount: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  removeFromHistory: (id: string) => Promise<void>;
  loading: boolean;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useSearchHistory(): UseSearchHistoryReturn {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [popularSearches, setPopularSearches] = useState<PopularSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Load from storage ────────────────────────────────────────────────────── */

  const loadFromStorage = useCallback(async () => {
    try {
      const [historyJson, popularJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY),
        AsyncStorage.getItem(STORAGE_KEYS.POPULAR_SEARCHES),
      ]);

      if (historyJson) {
        const history = JSON.parse(historyJson) as SearchHistoryItem[];
        setSearchHistory(history.sort((a, b) => (b.timestamp as unknown as number) - (a.timestamp as unknown as number)).slice(0, SEARCH_CONFIG.MAX_RECENT_SEARCHES));
      }

      if (popularJson) {
        setPopularSearches(JSON.parse(popularJson));
      } else {
        // Default popular searches
        const defaultPopular: PopularSearchItem[] = [
          { id: '1', query: 'Paris', searchCount: 1250, category: 'city' },
          { id: '2', query: 'Dubai', searchCount: 980, category: 'city' },
          { id: '3', query: 'Kampala', searchCount: 850, category: 'city' },
          { id: '4', query: 'Beaches', searchCount: 720, category: 'destination' },
          { id: '5', query: 'National Parks', searchCount: 650, category: 'destination' },
          { id: '6', query: 'Safari', searchCount: 580, category: 'destination' },
          { id: '7', query: 'Museums', searchCount: 490, category: 'museum' },
          { id: '8', query: 'Weekend Getaways', searchCount: 420, category: 'destination' },
        ];
        setPopularSearches(defaultPopular);
        await AsyncStorage.setItem(STORAGE_KEYS.POPULAR_SEARCHES, JSON.stringify(defaultPopular));
      }
    } catch (err) {
      console.error('[useSearchHistory] Error loading from storage:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Load on mount ────────────────────────────────────────────────────────── */

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  /* ── Add to history ───────────────────────────────────────────────────────── */

  const addToHistory = useCallback(async (query: string, resultCount: number) => {
    try {
      const newItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: query.trim(),
        timestamp: Date.now(),
        resultCount,
      };

      const updated = [newItem, ...searchHistory]
        .filter((item, index, self) => self.findIndex((i) => i.query.toLowerCase() === item.query.toLowerCase()) === index)
        .sort((a, b) => (b.timestamp as unknown as number) - (a.timestamp as unknown as number))
        .slice(0, SEARCH_CONFIG.MAX_RECENT_SEARCHES);

      setSearchHistory(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(updated));

      // Update popular searches count
      const existingPopular = popularSearches.find((p) => p.query.toLowerCase() === query.toLowerCase());
      if (existingPopular) {
        existingPopular.searchCount += 1;
      } else {
        setPopularSearches((prev) => {
          const updated = [...prev, { id: Date.now().toString(), query, searchCount: 1 }];
          AsyncStorage.setItem(STORAGE_KEYS.POPULAR_SEARCHES, JSON.stringify(updated));
          return updated.sort((a, b) => b.searchCount - a.searchCount).slice(0, 20);
        });
      }
    } catch (err) {
      console.error('[useSearchHistory] Error adding to history:', err);
    }
  }, [searchHistory, popularSearches]);

  /* ── Clear history ────────────────────────────────────────────────────────── */

  const clearHistory = useCallback(async () => {
    try {
      setSearchHistory([]);
      await AsyncStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
    } catch (err) {
      console.error('[useSearchHistory] Error clearing history:', err);
    }
  }, []);

  /* ── Remove from history ──────────────────────────────────────────────────── */

  const removeFromHistory = useCallback(async (id: string) => {
    try {
      const updated = searchHistory.filter((item) => item.id !== id);
      setSearchHistory(updated);
      await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(updated));
    } catch (err) {
      console.error('[useSearchHistory] Error removing from history:', err);
    }
  }, [searchHistory]);

  /* ── Return ───────────────────────────────────────────────────────────────── */

  return {
    searchHistory,
    popularSearches,
    addToHistory,
    clearHistory,
    removeFromHistory,
    loading,
  };
}