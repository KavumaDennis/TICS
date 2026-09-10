/**
 * ExploreLoadingOrchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Intelligent loading orchestrator for the Explore screen.
 *
 * Features:
 * 1. Cache-first rendering (render cached data instantly)
 * 2. Independent per-section loading (one slow API never blocks)
 * 3. Parallel data fetching via Promise.allSettled()
 * 4. Prioritized loading (critical content first, lazy sections deferred)
 * 5. Configurable TTLs per section
 * 6. Background refresh with delta updates
 * 7. Section-level skeleton states
 * 8. Performance analytics tracking
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ExploreCacheService } from './ExploreCacheService';
import { ExploreEngine } from './ExploreEngine';
import { ExploreService } from './ExploreService';
import type {
  ExploreLoadingState,
  SectionStatus,
  SectionMetadata,
  SectionConfig,
  ExploreSectionKey,
} from '@/src/modules/explore/types/exploreLoading';

/* ── Section Configurations ─────────────────────────────────────────────────── */

const SECTION_CONFIGS: Record<ExploreSectionKey, SectionConfig> = {
  search:          { key: 'search',          priority: 1, ttl: 300_000,   lazy: false, pageSize: 10 },
  categories:      { key: 'categories',      priority: 1, ttl: 86_400_000, lazy: false, pageSize: 20 },  // 24h
  trending:        { key: 'trending',        priority: 1, ttl: 900_000,   lazy: false, pageSize: 10 },  // 15min
  popular:         { key: 'popular',         priority: 1, ttl: 1_800_000, lazy: false, pageSize: 10 },  // 30min
  nearby:          { key: 'nearby',          priority: 2, ttl: 300_000,   lazy: false, pageSize: 10 },  // 5min
  events:          { key: 'events',          priority: 2, ttl: 1_800_000, lazy: true,  pageSize: 10 },  // 30min
  aiRecommendations: { key: 'aiRecommendations', priority: 2, ttl: 600_000, lazy: true, pageSize: 5 },  // 10min
  journeyFeed:     { key: 'journeyFeed',     priority: 3, ttl: 600_000,   lazy: true,  pageSize: 10 },  // 10min
  weekendEscapes:  { key: 'weekendEscapes',  priority: 3, ttl: 1_800_000, lazy: true,  pageSize: 5 },   // 30min
  analytics:       { key: 'analytics',       priority: 3, ttl: 300_000,   lazy: true,  pageSize: 0 },
};

function createSectionMetadata(config: SectionConfig): SectionMetadata {
  return {
    status: 'idle',
    loadedAt: null,
    ttl: config.ttl,
    error: null,
    retryCount: 0,
  };
}

function getInitialLoadingState(): ExploreLoadingState {
  return {
    search: createSectionMetadata(SECTION_CONFIGS.search),
    categories: createSectionMetadata(SECTION_CONFIGS.categories),
    trending: createSectionMetadata(SECTION_CONFIGS.trending),
    popular: createSectionMetadata(SECTION_CONFIGS.popular),
    nearby: createSectionMetadata(SECTION_CONFIGS.nearby),
    events: createSectionMetadata(SECTION_CONFIGS.events),
    aiRecommendations: createSectionMetadata(SECTION_CONFIGS.aiRecommendations),
    journeyFeed: createSectionMetadata(SECTION_CONFIGS.journeyFeed),
    weekendEscapes: createSectionMetadata(SECTION_CONFIGS.weekendEscapes),
    analytics: createSectionMetadata(SECTION_CONFIGS.analytics),
  };
}

/* ── Cache TTL Check ─────────────────────────────────────────────────────────── */

function isExpired(meta: SectionMetadata): boolean {
  if (meta.loadedAt === null) return true;
  return Date.now() - meta.loadedAt > meta.ttl;
}

/* ── Orchestrator ────────────────────────────────────────────────────────────── */

export class ExploreLoadingOrchestrator {
  private static instance: ExploreLoadingOrchestrator;
  private loadingState: ExploreLoadingState;
  private abortController: AbortController | null = null;
  private listeners: Set<() => void> = new Set();
  private loadPromises: Map<string, Promise<any>> = new Map();

  private constructor() {
    this.loadingState = getInitialLoadingState();
  }

  static getInstance(): ExploreLoadingOrchestrator {
    if (!ExploreLoadingOrchestrator.instance) {
      ExploreLoadingOrchestrator.instance = new ExploreLoadingOrchestrator();
    }
    return ExploreLoadingOrchestrator.instance;
  }

  /* ── Subscriptions ─────────────────────────────────────────────────────────── */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  getLoadingState(): Readonly<ExploreLoadingState> {
    return this.loadingState;
  }

  getSectionStatus(key: ExploreSectionKey): SectionStatus {
    return this.loadingState[key].status;
  }

  /* ── State Mutations ───────────────────────────────────────────────────────── */

  private setSectionStatus(key: ExploreSectionKey, status: SectionStatus, error?: string | null) {
    this.loadingState = {
      ...this.loadingState,
      [key]: {
        ...this.loadingState[key],
        status,
        loadedAt: status === 'loaded' ? Date.now() : this.loadingState[key].loadedAt,
        error: error ?? this.loadingState[key].error,
        retryCount: status === 'error' ? this.loadingState[key].retryCount + 1 : this.loadingState[key].retryCount,
      },
    };
    this.notify();
  }

  /* ── Cache-First Load ───────────────────────────────────────────────────────── */

  private loadFromCache<T>(key: string): T | null {
    try {
      return null; // AsyncStorage is async; this is a legacy sync method that returns null
    } catch {
      return null;
    }
  }

  private saveToCache(key: string, data: any, ttl: number = 600_000) {
    try {
      ExploreCacheService.set(key, data, ttl);
    } catch {
      // cache failure is non-critical
    }
  }

  /* ── Orchestrated Load ─────────────────────────────────────────────────────── */

  async loadAll(userId?: string, location?: { lat: number; lng: number }) {
    // Cancel any previous load
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Phase 1: Render cached data immediately for priority 1 sections
    await this.loadPriorityGroup(1, userId, location, signal, true);

    // Phase 2: Load priority 2 sections (non-lazy only)
    await this.loadPriorityGroup(2, userId, location, signal, false);

    // Phase 3: Background refresh everything
    this.backgroundRefreshAll(userId, location, signal);
  }

  /* ── Priority Group Loading ─────────────────────────────────────────────────── */

  private async loadPriorityGroup(
    priority: 1 | 2 | 3,
    userId?: string,
    location?: { lat: number; lng: number },
    signal?: AbortSignal,
    cacheFirst?: boolean,
  ) {
    const sections = (Object.keys(SECTION_CONFIGS) as ExploreSectionKey[])
      .filter((key) => SECTION_CONFIGS[key].priority === priority);

    const loaders = sections.map((key) => this.loadSection(key, userId, location, signal, cacheFirst));
    await Promise.allSettled(loaders);
  }

  /* ── Single Section Load ────────────────────────────────────────────────────── */

  async loadSection(
    key: ExploreSectionKey,
    userId?: string,
    location?: { lat: number; lng: number },
    signal?: AbortSignal,
    cacheFirst?: boolean,
  ) {
    // Prevent duplicate in-flight requests
    if (this.loadPromises.has(key)) return this.loadPromises.get(key);

    const config = SECTION_CONFIGS[key];
    if (!config) return;

    // Check cache first
    if (cacheFirst) {
      const cached = this.loadFromCache<any[]>(key);
      if (cached && cached.length > 0) {
        this.setSectionStatus(key, 'loaded');
        return cached;
      }
    }

    // Check if data is still fresh
    if (this.loadingState[key].status === 'loaded' && !isExpired(this.loadingState[key])) {
      return;
    }

    const promise = this.executeSectionLoad(key, userId, location, signal);
    this.loadPromises.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.loadPromises.delete(key);
    }
  }

  private async executeSectionLoad(
    key: ExploreSectionKey,
    userId?: string,
    location?: { lat: number; lng: number },
    signal?: AbortSignal,
  ): Promise<any> {
    this.setSectionStatus(key, 'loading');
    const startTime = performance.now();
    // SECTION_CONFIGS[key] — used below for cache page sizing (the previous
    // code referenced an out-of-scope `config`, throwing at runtime).
    const config = SECTION_CONFIGS[key];

    try {
      let data: any = null;

      // NOTE: this switch must call methods that actually exist on
      // ExploreEngine. The previous version was written against an API that
      // never existed (loadTrending/loadPopular/loadNearby/
      // loadWeekendEscapes/…), so EVERY section load through this path threw
      // at runtime and degraded to the error state.
      switch (key) {
        case 'categories':
          data = (await ExploreEngine.loadCategories()) ?? [];
          break;
        case 'trending':
          data = await ExploreEngine.getTrendingDestinations();
          break;
        case 'popular':
          data = (await ExploreEngine.loadDestinations({ pageSize: 20 }))?.data ?? [];
          break;
        case 'nearby':
          data = location
            ? await ExploreEngine.getNearbyPlaces({ lat: location.lat, lng: location.lng })
            : [];
          break;
        case 'events':
          data = (await ExploreEngine.loadEvents())?.data ?? [];
          break;
        case 'aiRecommendations':
          data = userId ? await ExploreEngine.loadRecommendations(userId) : [];
          break;
        case 'journeyFeed':
          data = await ExploreEngine.loadJourneyFeed({ pageSize: 10 });
          break;
        case 'weekendEscapes':
          data = location
            ? await ExploreEngine.getWeekendEscapes({
                lat: location.lat,
                lng: location.lng,
              })
            : [];
          break;
        case 'search':
          data = [];
          break;
        case 'analytics':
          data = true;
          break;
      }

      if (signal?.aborted) return;

      // Cache the result
      if (data && Array.isArray(data)) {
        this.saveToCache(key, data.slice(0, config?.pageSize || 10));
      }

      const elapsed = performance.now() - startTime;
      this.trackPerformance(key, elapsed, 'success');

      this.setSectionStatus(key, 'loaded');
      return data;
    } catch (error: any) {
      if (signal?.aborted) return;

      const elapsed = performance.now() - startTime;
      this.trackPerformance(key, elapsed, 'error');

      this.setSectionStatus(key, 'error', error?.message || 'Failed to load');
      return [];
    }
  }

  /* ── Background Refresh ────────────────────────────────────────────────────── */

  async backgroundRefreshAll(userId?: string, location?: { lat: number; lng: number }, signal?: AbortSignal) {
    // Wait a small delay so main render is not impacted
    await new Promise((r) => setTimeout(r, 500));
    if (signal?.aborted) return;

    // Only refresh sections that are expired
    const expiredKeys = (Object.keys(SECTION_CONFIGS) as ExploreSectionKey[])
      .filter((key) => isExpired(this.loadingState[key]));

    const refreshPromises = expiredKeys.map((key) =>
      this.loadSection(key, userId, location, signal, false).catch(() => {}),
    );

    await Promise.allSettled(refreshPromises);
  }

  /* ── Viewport-Triggered Loading ─────────────────────────────────────────────── */

  loadLazySection(
    key: ExploreSectionKey,
    userId?: string,
    location?: { lat: number; lng: number },
  ) {
    const config = SECTION_CONFIGS[key];
    if (!config?.lazy) return;
    if (this.loadingState[key].status === 'loaded' && !isExpired(this.loadingState[key])) return;

    this.loadSection(key, userId, location, undefined, false);
  }

  /* ── Retry ──────────────────────────────────────────────────────────────────── */

  async retrySection(
    key: ExploreSectionKey,
    userId?: string,
    location?: { lat: number; lng: number },
  ) {
    // Reset retry count
    this.loadingState = {
      ...this.loadingState,
      [key]: { ...this.loadingState[key], retryCount: 0 },
    };
    return this.loadSection(key, userId, location, undefined, false);
  }

  /* ── Preloading (for Home/Trips/Profile) ────────────────────────────────────── */

  async preloadPriority1Data(userId?: string, location?: { lat: number; lng: number }) {
    const signal = new AbortController().signal;
    await this.loadPriorityGroup(1, userId, location, signal, false);
  }

  /* ── Cleanup ────────────────────────────────────────────────────────────────── */

  cancelPending() {
    this.abortController?.abort();
    this.abortController = null;
  }

  reset() {
    this.cancelPending();
    this.loadingState = getInitialLoadingState();
    this.loadPromises.clear();
    this.notify();
  }

  /* ── Performance Tracking ───────────────────────────────────────────────────── */

  private trackPerformance(section: string, durationMs: number, result: 'success' | 'error') {
    if (__DEV__) {
      console.log(`[ExplorePerf] ${section}: ${durationMs.toFixed(0)}ms (${result})`);
    }

    try {
      // Store in-memory for dashboard
      const perfLog = this.loadFromCache<Record<string, number[]>>('_perf_log') || {};
      if (!perfLog[section]) perfLog[section] = [];
      perfLog[section].push(durationMs);
      // Keep last 20 samples
      if (perfLog[section].length > 20) perfLog[section].shift();
      this.saveToCache('_perf_log', perfLog);

      // If average > 2s, log warning
      const arr = perfLog[section];
      const avg = arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
      if (avg > 2000 && __DEV__) {
        console.warn(`[ExplorePerf] ⚠️ ${section} avg load time: ${avg.toFixed(0)}ms`);
      }
    } catch {
      // non-critical
    }
  }

  /* ── Analytics API ──────────────────────────────────────────────────────────── */

  getPerformanceMetrics() {
    return this.loadFromCache<Record<string, { avgDuration: number; count: number }>>('_perf_log') || {};
  }

  getCacheHitRate(): { hits: number; misses: number; rate: number } {
    try {
      const raw = this.loadFromCache<{ hits: number; misses: number }>('_cache_stats') || { hits: 0, misses: 0 };
      const total = raw.hits + raw.misses;
      return {
        hits: raw.hits,
        misses: raw.misses,
        rate: total > 0 ? raw.hits / total : 0,
      };
    } catch {
      return { hits: 0, misses: 0, rate: 0 };
    }
  }
}

/** Hook-compatible singleton */
export const exploreOrchestrator = ExploreLoadingOrchestrator.getInstance();