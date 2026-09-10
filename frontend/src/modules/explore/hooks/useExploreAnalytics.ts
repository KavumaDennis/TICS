/**
 * useExploreAnalytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for tracking explore analytics events with automatic user ID binding.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services';
import type { ExploreAnalyticsEvent } from '@/src/modules/explore/types';

/* ── Hook ───────────────────────────────────────────────────────────────────── */

export function useExploreAnalytics() {
  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';

  const track = useCallback(
    (event: ExploreAnalyticsEvent, metadata: Record<string, unknown> = {}) => {
      if (!userId) return;
      ExploreService.trackAnalyticsEvent(userId, event, metadata);
    },
    [userId]
  );

  const trackDestinationViewed = useCallback(
    (destinationId: string, destinationName: string) => {
      track('destination_viewed', { destinationId, destinationName });
    },
    [track]
  );

  const trackCategoryOpened = useCallback(
    (categoryId: string, categoryName: string) => {
      track('category_opened', { categoryId, categoryName });
    },
    [track]
  );

  const trackEventOpened = useCallback(
    (eventId: string, eventTitle: string) => {
      track('event_opened', { eventId, eventTitle });
    },
    [track]
  );

  const trackCoordinateJourney = useCallback(
    (destinationId: string, destinationName: string) => {
      track('coordinate_journey_clicked', { destinationId, destinationName });
    },
    [track]
  );

  const trackDestinationSaved = useCallback(
    (destinationId: string) => {
      track('destination_saved', { destinationId });
    },
    [track]
  );

  const trackSearchPerformed = useCallback(
    (query: string) => {
      track('search_performed', { query });
    },
    [track]
  );

  const trackRecommendationOpened = useCallback(
    (recommendationId: string) => {
      track('recommendation_opened', { recommendationId });
    },
    [track]
  );

  const trackFeedItemViewed = useCallback(
    (feedItemId: string, feedItemType: string) => {
      track('feed_item_viewed', { feedItemId, feedItemType });
    },
    [track]
  );

  const trackNearbyItemViewed = useCallback(
    (itemId: string, itemType: string) => {
      track('nearby_item_viewed', { itemId, itemType });
    },
    [track]
  );

  const trackSearchSuggestionSelected = useCallback(
    (suggestionId: string, suggestionText: string) => {
      track('search_suggestion_selected', { suggestionId, suggestionText });
    },
    [track]
  );

  const trackAIAssistantOpened = useCallback(() => {
    track('ai_assistant_opened', {});
  }, [track]);

  const trackWeekendEscapeSelected = useCallback(
    (escapeId: string) => {
      track('weekend_escape_selected', { escapeId });
    },
    [track]
  );

  const trackDestinationShared = useCallback(
    (destinationId: string) => {
      track('destination_shared', { destinationId });
    },
    [track]
  );

  const trackEventSaved = useCallback(
    (eventId: string) => {
      track('event_saved', { eventId });
    },
    [track]
  );

  return {
    track,
    trackDestinationViewed,
    trackCategoryOpened,
    trackEventOpened,
    trackCoordinateJourney,
    trackDestinationSaved,
    trackSearchPerformed,
    trackRecommendationOpened,
    trackFeedItemViewed,
    trackNearbyItemViewed,
    trackSearchSuggestionSelected,
    trackAIAssistantOpened,
    trackWeekendEscapeSelected,
    trackDestinationShared,
    trackEventSaved,
  };
}
