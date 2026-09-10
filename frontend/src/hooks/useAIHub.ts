/**
 * useAIHub.ts
 * Hook that provides data and actions for the AI Hub bottom sheet.
 * Lazy-loads AI data only when the sheet is opened.
 * Caches summary data to avoid refetching while the sheet remains open.
 */
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';

import { useAssistantStore } from '@/src/store/assistantStore';
import { useAIDiscovery } from '@/src/modules/explore/hooks/useAIDiscovery';
import { useUserDocStore } from '@/src/store/userDocStore';
import { useTripStore } from '@/src/store/tripStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useAIHubStore } from '@/src/store/aiHubStore';

export type AIHubData = {
  insights: string[];
  tripStatus: 'none' | 'active' | 'local';
  suggestions: string[];
  lastConversation: { text: string; date: string } | null;
  discoveryItem: any | null;
  recentActivities: { label: string; time: string }[];
};

export type AIHubActions = {
  openAssistant: () => void;
  startDiscovering: () => void;
  onSuggestionTap: (suggestion: string) => void;
};

export type UseAIHubReturn = {
  data: AIHubData;
  actions: AIHubActions;
  loading: boolean;
  refresh: () => Promise<void>;
  open: boolean;
  setOpen: (open: boolean) => void;
  handleOpen: () => Promise<void>;
  handleClose: () => void;
};

/**
 * Derive quick insights from existing stores/services.
 */
function deriveInsights(): string[] {
  const insights: string[] = [];
  // Weather insight
  try {
    const weather = require('@/src/store/weatherStore').useWeatherStore.getState();
    const active = weather.activeTripWeather;
    if (active?.rainExpected) {
      insights.push(`🌧 Rain expected in ${active.city || 'your area'} after ${active.rainAfter || '6 PM'}.`);
    }
  } catch { /* ignore */ }

  // Flights insight
  try {
    const flightStore = require('@/src/store/flightMonitoringStore').useFlightMonitoringStore.getState();
    const activeFlight = flightStore.activeFlight;
    if (activeFlight?.priceDrop) {
      insights.push(`✈ Flights to ${activeFlight.destination || 'Nairobi'} are cheaper this week.`);
    }
  } catch { /* ignore */ }

  // Events insight
  try {
    const alerts = require('@/src/store/alertStore').useAlertStore.getState();
    const eventAlerts = alerts.userAlerts.filter((a: any) => a.type === 'event' && a.active);
    if (eventAlerts.length > 0) {
      insights.push(`🎉 ${eventAlerts.length} event${eventAlerts.length > 1 ? 's' : ''} happening nearby this weekend.`);
    }
  } catch { /* ignore */ }

  // Recommendations insight
  try {
    const recs = require('@/src/store/recommendationStore').useRecommendationStore.getState();
    const newRecs = recs.recommendations.filter((r: any) => r.isNew);
    if (newRecs.length > 0) {
      insights.push(`🏞 ${newRecs.length} new attraction${newRecs.length > 1 ? 's' : ''} discovered nearby.`);
    }
  } catch { /* ignore */ }

  if (insights.length === 0) {
    insights.push('⭐ Personalized recommendations available.');
  }

  return insights.slice(0, 5);
}

/**
 * Derive contextual suggestions based on current trip state.
 */
function deriveSuggestions(tripStatus: 'none' | 'active' | 'local'): string[] {
  switch (tripStatus) {
    case 'active':
      return ['Monitor Trip', 'Flight Status', 'Route Updates', 'Weather', 'AI Recommendations'];
    case 'local':
      return ['Nearby Attractions', 'Fuel Stations', 'Restaurants', 'Traffic', 'Weekend Activities'];
    case 'none':
    default:
      return ['Plan a Trip', 'Explore Nearby', 'Ask AI'];
  }
}

/**
 * Get recent activities from user doc and stores.
 */
function deriveRecentActivities(userDoc: any): { label: string; time: string }[] {
  const activities: { label: string; time: string }[] = [];

  if (userDoc?.lastItineraryCreatedAt) {
    activities.push({
      label: 'Last itinerary created',
      time: new Date(userDoc.lastItineraryCreatedAt).toLocaleDateString(),
    });
  }

  if (userDoc?.lastDestinationViewed) {
    activities.push({
      label: `Viewed ${userDoc.lastDestinationViewed}`,
      time: 'Recently',
    });
  }

  if (userDoc?.lastCoordinatedJourneyAt) {
    activities.push({
      label: 'Coordinated a journey',
      time: new Date(userDoc.lastCoordinatedJourneyAt).toLocaleDateString(),
    });
  }

  const saved = userDoc?.savedDestinations || userDoc?.savedPlaces || [];
  if (Array.isArray(saved) && saved.length > 0) {
    const last = saved[saved.length - 1];
    activities.push({
      label: `Saved ${last.name || last.destinationName || 'a destination'}`,
      time: 'Recently',
    });
  }

  return activities.slice(0, 4);
}

export function useAIHub(): UseAIHubReturn {
  const router = useRouter();
  const open = useAIHubStore((s) => s.open);
  const setOpen = useAIHubStore((s) => s.setOpen);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIHubData>({
    insights: [],
    tripStatus: 'none',
    suggestions: [],
    lastConversation: null,
    discoveryItem: null,
    recentActivities: [],
  });
  const cacheTimestamp = useRef<number>(0);
  const CACHE_TTL = 60_000; // 1 minute cache

  const userDoc = useUserDocStore((s) => s.doc);
  const trips = useTripStore((s) => s.trips);
  const aiDiscovery = useAIDiscovery();
  const assistantMessages = useAssistantStore((s) => s.messages);
  const token = useAuthStore((s) => s.token);

  // Detect trip status
  const detectTripStatus = useCallback((): 'none' | 'active' | 'local' => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const hasActive = trips.some((t: any) => {
      if (!t.departureTime) return false;
      const dep = new Date(t.departureTime);
      const end = t.returnTime ? new Date(t.returnTime) : new Date(dep.getTime() + 7 * 24 * 60 * 60 * 1000);
      return dep <= now && end >= now;
    });

    if (hasActive) return 'active';

    const hasLocal = trips.some((t: any) => {
      if (!t.departureTime) return false;
      const dep = new Date(t.departureTime);
      const daysUntil = Math.floor((dep.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      return daysUntil >= 0 && daysUntil <= 3;
    });

    if (hasLocal || trips.length > 0) return 'local';
    return 'none';
  }, [trips]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const tripStatus = detectTripStatus();
      const insights = deriveInsights();
      const suggestions = deriveSuggestions(tripStatus);

      // Get last conversation
      const lastAssistantMsg = assistantMessages.length > 0
        ? assistantMessages[assistantMessages.length - 1]
        : null;
      const lastConversation = lastAssistantMsg
        ? { text: lastAssistantMsg.text.slice(0, 80), date: 'Recent' }
        : null;

      // Get discovery item from AI discovery response
      let discoveryItem: any | null = null;
      const response = (aiDiscovery as any).response;
      if (response?.items && response.items.length > 0) {
        discoveryItem = response.items[0];
      }

      const recentActivities = deriveRecentActivities(userDoc);

      setData({
        insights,
        tripStatus,
        suggestions,
        lastConversation,
        discoveryItem,
        recentActivities,
      });
      cacheTimestamp.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, [detectTripStatus, assistantMessages, userDoc]);

  // Open handler: refresh if cache is stale
  const handleOpen = useCallback(async () => {
    const now = Date.now();
    if (now - cacheTimestamp.current > CACHE_TTL || data.insights.length === 0) {
      await refresh();
    }
    setOpen(true);
  }, [refresh, data.insights.length]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const actions: AIHubActions = {
    openAssistant: () => {
      handleClose();
      router.push('/(tabs)/assistant');
    },
    startDiscovering: () => {
      handleClose();
      router.push('/explore');
    },
    onSuggestionTap: (suggestion: string) => {
      handleClose();
      // Route based on suggestion text
      if (suggestion.includes('Trip') || suggestion.includes('Plan')) {
        router.push('/trip/add');
      } else if (suggestion.includes('Explore') || suggestion.includes('Nearby')) {
        router.push('/explore');
      } else if (suggestion.includes('Ask AI') || suggestion.includes('AI')) {
        router.push('/(tabs)/assistant');
      } else if (suggestion.includes('Monitor')) {
        const activeTrip = trips.find((t: any) => t.active);
        if (activeTrip?.id) router.push(`/trips/${activeTrip.id}`);
      } else {
        router.push('/(tabs)/assistant');
      }
    },
  };

  return {
    data,
    actions,
    loading,
    refresh,
    open,
    setOpen,
    handleOpen,
    handleClose,
  };
}

export default useAIHub;