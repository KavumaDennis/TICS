/**
 * useSearch.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for explore search functionality with autocomplete support,
 * debounced input, search history, and combined Google Places + Firestore results.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SearchService } from '@/src/modules/explore/services/SearchService';
import { ExploreService } from '@/src/modules/explore/services';
import { ExploreCacheService } from '@/src/modules/explore/services/ExploreCacheService';
import { DestinationCache } from '@/src/modules/explore/services/discovery/DestinationCache';
import { SEARCH_CONFIG } from '@/src/modules/explore/constants';
import type { SearchSuggestion, SearchResult, Destination } from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseSearchReturn {
  query: string;
  results: SearchResult[];
  suggestions: SearchSuggestion[];
  recentSearches: string[];
  loading: boolean;
  hasSearched: boolean;
  setQuery: (text: string) => void;
  performSearch: (text: string) => Promise<void>;
  clearSearch: () => void;
  clearHistory: () => Promise<void>;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useSearch(): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionToken = useRef<string>(
    `tics_${Date.now()}_${Math.random().toString(36).substring(2)}`
  );
  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';

  /* ── Load recent searches on mount ────────────────────────────────────────── */

  useEffect(() => {
    loadRecentSearches();
  }, []);

  const loadRecentSearches = async () => {
    const cached = await ExploreCacheService.getCachedSearchHistory();
    setRecentSearches(cached);
  };

  /* ── Debounced autocomplete ───────────────────────────────────────────────── */

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (query.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      setSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const autoSuggestions = await SearchService.getAutocompleteSuggestions(
          query,
          sessionToken.current
        );
        setSuggestions(autoSuggestions);
      } catch (err) {
        console.error('[useSearch] Autocomplete error:', err);
      }
    }, SEARCH_CONFIG.DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);

  /* ── Perform full search ──────────────────────────────────────────────────── */

  const performSearch = useCallback(async (text: string) => {
    if (text.length < SEARCH_CONFIG.MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const searchResults = await SearchService.performSearch(text);
      const combined = [...searchResults.destinations, ...searchResults.events];
      setResults(combined);

      // Cache destination results so the detail screen can render them
      // even when they come from Google Places (not in Firestore).
      const destCacheEntries: Destination[] = searchResults.destinations
        .filter((r) => r.id && r.name)
        .map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: r.description || '',
          country: r.country || '',
          countryCode: '',
          city: r.city || '',
          coordinates: r.coordinates || { lat: 0, lng: 0 },
          images: r.imageUrl ? [{ url: r.imageUrl, caption: '', credit: '' }] : [],
          categories: [],
          travelTips: [],
          nearbyAirport: null,
          nearbyHotels: [],
          nearbyAttractions: [],
          weatherSummary: null,
          bestSeason: '',
          bestTimeToVisit: '',
          popularity: 0,
          rating: r.rating || 0,
          reviewCount: 0,
          reviews: [],
          travelRequirements: [],
          emergencyContacts: [],
          currency: '',
          language: '',
          timezone: '',
          timezoneOffset: '',
          estimatedBudget: null,
          topAttractions: [],
          relatedDestinationIds: [],
          featured: false,
          trending: false,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Destination));
      DestinationCache.setMany(destCacheEntries);

      // Track search and save to history
      if (userId) {
        ExploreService.saveSearchQuery(userId, text);
        ExploreService.trackAnalyticsEvent(userId, 'search_performed', { query: text });
      }
      ExploreCacheService.addToCachedSearchHistory(text);
      loadRecentSearches();
    } catch (err) {
      console.error('[useSearch] Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /* ── Clear search ─────────────────────────────────────────────────────────── */

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setHasSearched(false);
    sessionToken.current = `tics_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }, []);

  /* ── Clear history ────────────────────────────────────────────────────────── */

  const clearHistory = useCallback(async () => {
    if (userId) {
      await ExploreService.clearSearchHistory(userId);
    }
    await ExploreCacheService.setCachedSearchHistory([]);
    setRecentSearches([]);
  }, [userId]);

  return {
    query,
    results,
    suggestions,
    recentSearches,
    loading,
    hasSearched,
    setQuery,
    performSearch,
    clearSearch,
    clearHistory,
  };
}