/**
 * EventCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory cache for Ticketmaster events so detail screens can find them.
 * Ticketmaster events have IDs like "tm_xxx" which don't exist in Firestore.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Event } from '@/src/modules/explore/types';

const eventCache = new Map<string, Event>();
const MAX_CACHE_SIZE = 200;

export const EventCache = {
  set(event: Event): void {
    if (eventCache.size >= MAX_CACHE_SIZE) {
      const firstKey = eventCache.keys().next().value;
      if (firstKey) eventCache.delete(firstKey);
    }
    eventCache.set(event.id, event);
  },

  setMany(events: Event[]): void {
    for (const event of events) {
      this.set(event);
    }
  },

  get(id: string): Event | undefined {
    return eventCache.get(id);
  },

  clear(): void {
    eventCache.clear();
  },
};