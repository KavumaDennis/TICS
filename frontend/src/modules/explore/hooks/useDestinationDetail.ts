/**
 * useDestinationDetail.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for loading full destination details including weather, nearby places,
 * events, reviews, travel requirements, and emergency contacts.
 * Falls back to sample data when Firestore returns empty.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services';
import { DestinationCache } from '@/src/modules/explore/services/discovery/DestinationCache';
import { OpenStreetMapProvider } from '@/src/modules/explore/services/discovery/providers/OpenStreetMapProvider';
import { toDestination } from '@/src/modules/explore/services/discovery/DestinationAggregator';
import {
  enrichDestinations,
} from '@/src/modules/explore/services/discovery/DestinationImageService';
import {
  DESTINATION_FALLBACK_IMAGE,
  resolveDestinationImage,
} from '@/src/modules/explore/utils';
import type {
  Destination,
  Event,
  ServiceResponse,
} from '@/src/modules/explore/types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UseDestinationDetailReturn {
  destination: Destination | null;
  events: Event[];
  relatedDestinations: Destination[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  isSaved: boolean;
  refresh: () => Promise<void>;
  saveDestination: () => Promise<boolean>;
  unsaveDestination: () => Promise<boolean>;
}

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useDestinationDetail(
  destinationId: string
): UseDestinationDetailReturn {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [relatedDestinations, setRelatedDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';

  /* ── Load destination ─────────────────────────────────────────────────────── */

  /**
   * IMAGE PERSISTENCE GUARANTEE — card → detail.
   * A destination without a usable image is enriched live (Wikipedia →
   * Wikimedia Commons → Pexels → Openverse, cached 30 days). If even that
   * fails, the deterministic remote fallback is installed so the detail
   * gallery ALWAYS has an image, exactly like the card did.
   */
  const ensureImage = useCallback(async (dest: Destination): Promise<Destination> => {
    if (resolveDestinationImage(dest as any)) return dest;
    try {
      await enrichDestinations([dest]);
    } catch {
      // fall through to deterministic fallback
    }
    if (!resolveDestinationImage(dest as any)) {
      dest.images = [{ url: DESTINATION_FALLBACK_IMAGE, caption: '', credit: '' }];
    }
    // Keep the cache in sync so a reopen shows the same image instantly.
    DestinationCache.set(dest);
    return dest;
  }, []);

  const loadDestination = useCallback(async () => {
    if (!destinationId) return;
    setLoading(true);
    setError(null);

    try {
      // First check the in-memory cache (for API-derived destinations)
      const cached = DestinationCache.get(destinationId);
      if (cached) {
        setDestination(await ensureImage(cached));
        setLoading(false);
        return;
      }

      // Then try Firestore
      const destResult = await ExploreService.getDestinationById(destinationId);

      if (destResult.data) {
        setDestination(await ensureImage(destResult.data));

        // Load events for this destination
        const eventsResult = await ExploreService.loadEvents({
          destinationId,
          pageSize: 5,
        });
        setEvents(eventsResult.data);

        // Load related destinations
        if (destResult.data.relatedDestinationIds?.length) {
          const relatedPromises = destResult.data.relatedDestinationIds.map(
            (id) => ExploreService.getDestinationById(id)
          );
          const relatedResults = await Promise.all(relatedPromises);
          setRelatedDestinations(
            relatedResults
              .filter((r): r is ServiceResponse<Destination> => r.data !== null)
              .map((r) => r.data!)
          );
        }
      } else {
        // Firestore returned null — for dynamic OSM destinations this is
        // EXPECTED (their ids are tics:openstreetmap:... and they don't exist
        // in Firestore). Resolve the destination LIVE from OSM by id before
        // giving up: "destination not found" is never an acceptable response
        // for a card the user just tapped.
        let liveDest: Destination | null = null;
        try {
          if (/^tics:openstreetmap:|^escape_tics:openstreetmap:/.test(destinationId)) {
            const osmId = destinationId.replace(/^escape_/, '');
            const ticsDest = await OpenStreetMapProvider.getById?.(osmId);
            if (ticsDest) {
              liveDest = toDestination(ticsDest);
            }
          }
        } catch (osmErr) {
          console.warn('[useDestinationDetail] live OSM lookup failed:', osmErr);
        }

        if (liveDest) {
          setDestination(await ensureImage(liveDest));
          DestinationCache.set(liveDest);
        } else {
          setError('Destination not found');
        }
      }

      // Track recently viewed
      if (userId) {
        ExploreService.trackRecentlyViewed(userId, destinationId);
        ExploreService.trackAnalyticsEvent(userId, 'destination_viewed', {
          destinationId,
          destinationName: destination?.name || '',
        });
      }
    } catch (err) {
      console.error('[useDestinationDetail] Error:', err);
      // On error, show error state
      setError('Failed to load destination');
    } finally {
      setLoading(false);
    }
  }, [destinationId, userId, ensureImage]);

  /* ── Load on mount ────────────────────────────────────────────────────────── */

  useEffect(() => {
    loadDestination();
  }, [loadDestination]);

  /* ── Refresh ──────────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    await loadDestination();
  }, [loadDestination]);

  /* ── Save / Unsave ────────────────────────────────────────────────────────── */

  const saveDestination = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setSaving(true);
    const success = await ExploreService.saveDestination(userId, destinationId, destination);
    if (success) {
      setIsSaved(true);
      ExploreService.trackAnalyticsEvent(userId, 'destination_saved', { destinationId });
    }
    setSaving(false);
    return success;
  }, [userId, destinationId, destination]);

  const unsaveDestination = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setSaving(true);
    const success = await ExploreService.unsaveDestination(userId, destinationId);
    if (success) {
      setIsSaved(false);
    }
    setSaving(false);
    return success;
  }, [userId, destinationId]);

  return {
    destination,
    events,
    relatedDestinations,
    loading,
    error,
    saving,
    isSaved,
    refresh,
    saveDestination,
    unsaveDestination,
  };
}