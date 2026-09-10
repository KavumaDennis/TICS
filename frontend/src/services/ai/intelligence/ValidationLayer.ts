/**
 * ValidationLayer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates, deduplicates, ranks, and caches AI-generated content.
 *
 * This layer sits between Gemini and the UI, ensuring:
 * 1. JSON is valid and complete
 * 2. Duplicates are removed
 * 3. Results are ranked by priority and confidence
 * 4. Responses are cached for performance
 * 5. Falls back to rule/template engine only when AI fails
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AggregatedContext } from './ContextAggregator';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  VALIDATED OUTPUT TYPES                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface AIResponseItem {
  title: string;
  description: string;
  reasoning: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidenceScore: number;
  suggestedActions: string[];
  category: string;
  /** Unique content hash for deduplication */
  contentHash?: string;
}

export interface ValidationResult {
  valid: boolean;
  items: AIResponseItem[];
  errors: string[];
  source: 'ai' | 'cache' | 'fallback';
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CONTENT CACHE                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */

interface CacheEntry {
  items: AIResponseItem[];
  contextHash: string;
  timestamp: number;
  ttl: number; // milliseconds
}

const responseCache = new Map<string, CacheEntry>();

const CACHE_TTL = {
  recommendations: 5 * 60 * 1000, // 5 minutes
  alerts: 2 * 60 * 1000, // 2 minutes
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  VALIDATION LAYER                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

export class ValidationLayer {
  /**
   * Validate and process AI-generated JSON response.
   * Returns validated, deduplicated, ranked items.
   */
  validate(
    rawJson: string,
    context: AggregatedContext,
    type: 'recommendations' | 'alerts',
  ): ValidationResult {
    const errors: string[] = [];
    let items: AIResponseItem[] = [];

    // Step 1: Parse JSON
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) {
        errors.push('Response is not a JSON array');
        return { valid: false, items: [], errors, source: 'ai' };
      }
      items = parsed;
    } catch (e) {
      errors.push(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`);
      return { valid: false, items: [], errors, source: 'ai' };
    }

    // Step 2: Validate each item
    const validated: AIResponseItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemErrors: string[] = [];

      // Required fields
      if (!item.title || typeof item.title !== 'string') {
        itemErrors.push(`Item ${i}: missing or invalid 'title'`);
      }
      if (!item.description || typeof item.description !== 'string') {
        itemErrors.push(`Item ${i}: missing or invalid 'description'`);
      }
      if (!item.reasoning || typeof item.reasoning !== 'string') {
        itemErrors.push(`Item ${i}: missing or invalid 'reasoning'`);
      }

      // Priority validation
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      if (!validPriorities.includes(item.priority)) {
        item.priority = 'medium'; // Default to medium
      }

      // Confidence score validation
      if (typeof item.confidenceScore !== 'number' || item.confidenceScore < 0 || item.confidenceScore > 1) {
        item.confidenceScore = 0.5; // Default
      }

      // Suggested actions validation
      if (!Array.isArray(item.suggestedActions) || item.suggestedActions.length === 0) {
        item.suggestedActions = type === 'recommendations'
          ? ['View Details', 'Save', 'Dismiss']
          : ['Acknowledge', 'Dismiss'];
      }

      // Category validation
      if (!item.category || typeof item.category !== 'string') {
        item.category = type === 'recommendations' ? 'nearby_experiences' : 'general';
      }

      // Generate content hash for deduplication
      item.contentHash = this.generateHash(item);

      if (itemErrors.length === 0) {
        validated.push(item);
      } else {
        errors.push(...itemErrors);
      }
    }

    // Step 3: Deduplicate
    const deduplicated = this.deduplicate(validated);

    // Step 4: Rank by priority and confidence
    const ranked = this.rank(deduplicated);

    // Step 5: Limit results
    const maxResults = type === 'recommendations' ? 10 : 8;
    const final = ranked.slice(0, maxResults);

    return {
      valid: errors.length === 0 || final.length > 0,
      items: final,
      errors,
      source: 'ai',
    };
  }

  /**
   * Try to get cached results for a context.
   */
  getCached(
    context: AggregatedContext,
    type: 'recommendations' | 'alerts',
  ): AIResponseItem[] | null {
    const hash = this.hashContext(context);
    const cacheKey = `${type}:${hash}`;
    const entry = responseCache.get(cacheKey);

    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.items;
    }

    // Expired
    if (entry) responseCache.delete(cacheKey);
    return null;
  }

  /**
   * Cache validated results.
   */
  cache(
    items: AIResponseItem[],
    context: AggregatedContext,
    type: 'recommendations' | 'alerts',
  ): void {
    const hash = this.hashContext(context);
    const cacheKey = `${type}:${hash}`;

    responseCache.set(cacheKey, {
      items,
      contextHash: hash,
      timestamp: Date.now(),
      ttl: CACHE_TTL[type],
    });

    // Cleanup old cache entries
    this.cleanupCache();
  }

  /**
   * Invalidate cache for a specific type or all.
   */
  invalidateCache(type?: 'recommendations' | 'alerts'): void {
    if (type) {
      for (const key of responseCache.keys()) {
        if (key.startsWith(type)) responseCache.delete(key);
      }
    } else {
      responseCache.clear();
    }
  }

  /**
   * Generate a content hash for deduplication.
   */
  private generateHash(item: AIResponseItem): string {
    const str = `${item.title.toLowerCase()}|${item.description.toLowerCase()}|${item.category}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Remove duplicate items based on content hash.
   */
  private deduplicate(items: AIResponseItem[]): AIResponseItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.contentHash!)) return false;
      seen.add(item.contentHash!);
      return true;
    });
  }

  /**
   * Rank items by priority (critical first) then confidence score.
   */
  private rank(items: AIResponseItem[]): AIResponseItem[] {
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...items].sort((a, b) => {
      const aOrder = priorityOrder[a.priority] ?? 3;
      const bOrder = priorityOrder[b.priority] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.confidenceScore - a.confidenceScore;
    });
  }

  /**
   * Hash the context for cache key generation.
   */
  private hashContext(context: AggregatedContext): string {
    const relevant = {
      type: context.trip.type,
      stage: context.trip.stage,
      mode: context.trip.transportMode,
      destination: context.trip.destination.countryCode,
      weather: context.weather ? `${context.weather.temperature}-${context.weather.condition}` : 'none',
      roadConditions: context.roadConditions.length,
      nearbyPlaces: context.location.nearbyPlaces.length,
      events: context.location.events.length,
      userCategories: context.user.favoriteCategories,
      budget: context.user.budget.max,
    };
    let hash = 0;
    const str = JSON.stringify(relevant);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clean up expired cache entries.
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of responseCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        responseCache.delete(key);
      }
    }
  }
}

export const validationLayer = new ValidationLayer();
export default validationLayer;