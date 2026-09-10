/**
 * AIDiscoveryCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Response caching for AI Discovery prompts.
 * Avoids duplicate API calls for identical prompts within the cache TTL.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { AIDiscoveryResponse } from './types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ── Types ───────────────────────────────────────────────────────────────────── */

interface CacheEntry {
  response: AIDiscoveryResponse;
  timestamp: number;
  ttl: number;
}

/* ── Constants ───────────────────────────────────────────────────────────────── */

const CACHE_PREFIX = 'aid_cache_';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

/* ── AIDiscoveryCache ────────────────────────────────────────────────────────── */

export const AIDiscoveryCache = {
  /**
   * Generate a cache key from the prompt and user ID.
   */
  generateKey(prompt: string, userId?: string): string {
    const normalized = prompt.toLowerCase().trim().replace(/\s+/g, ' ');
    return `${CACHE_PREFIX}${userId || 'anon'}_${normalized}`;
  },

  /**
   * Get a cached response if available and not expired.
   */
  async get(prompt: string, userId?: string): Promise<AIDiscoveryResponse | null> {
    try {
      const key = this.generateKey(prompt, userId);
      const raw = await AsyncStorage.getItem(key);

      if (!raw) return null;

      const entry: CacheEntry = JSON.parse(raw);
      const now = Date.now();

      if (now - entry.timestamp > entry.ttl) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return entry.response;
    } catch (err) {
      console.warn('[AIDiscoveryCache] Read error:', err);
      return null;
    }
  },

  /**
   * Cache a response.
   */
  async set(
    prompt: string,
    response: AIDiscoveryResponse,
    userId?: string,
    ttl: number = DEFAULT_TTL
  ): Promise<void> {
    try {
      const key = this.generateKey(prompt, userId);

      const entry: CacheEntry = {
        response,
        timestamp: Date.now(),
        ttl,
      };

      await AsyncStorage.setItem(key, JSON.stringify(entry));

      // Clean up old entries if cache is too large
      await this.cleanup();
    } catch (err) {
      console.warn('[AIDiscoveryCache] Write error:', err);
    }
  },

  /**
   * Clear a specific cached prompt.
   */
  async clear(prompt: string, userId?: string): Promise<void> {
    try {
      const key = this.generateKey(prompt, userId);
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn('[AIDiscoveryCache] Clear error:', err);
    }
  },

  /**
   * Clear all cached AI Discovery responses.
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (err) {
      console.warn('[AIDiscoveryCache] ClearAll error:', err);
    }
  },

  /**
   * Remove expired entries and enforce max cache size.
   */
  async cleanup(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));

      if (cacheKeys.length <= MAX_CACHE_SIZE) return;

      // Get all entries with timestamps
      const entries: Array<{ key: string; timestamp: number }> = [];
      for (const key of cacheKeys) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) {
            const entry: CacheEntry = JSON.parse(raw);
            entries.push({ key, timestamp: entry.timestamp });
          }
        } catch {
          // Skip invalid entries
        }
      }

      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest entries exceeding max size
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      for (const entry of toRemove) {
        await AsyncStorage.removeItem(entry.key);
      }
    } catch (err) {
      console.warn('[AIDiscoveryCache] Cleanup error:', err);
    }
  },
};