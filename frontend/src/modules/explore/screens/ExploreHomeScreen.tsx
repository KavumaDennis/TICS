/**
 * ExploreHomeScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Main Explore screen - the Travel Discovery Hub of TICS.
 * Multi-layer discovery experience with 11 intelligent sections.
 * Dark theme with NativeWind classes matching the TICS app UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Image, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useExplore } from '@/src/modules/explore/hooks/useExplore';
import { useExploreAnalytics } from '@/src/modules/explore/hooks/useExploreAnalytics';
import { useSearchHistory } from '@/src/modules/explore/hooks/useSearchHistory';
import { useWeekendEscapes } from '@/src/modules/explore/hooks/useWeekendEscapes';
import { useAIDiscoveryFeed } from '@/src/modules/explore/hooks/useAIDiscoveryFeed';
import { getFeedRecommendations } from '@/src/modules/explore/hooks/useAIDiscoveryFeed';
import type { AIRecommendation, DiscoverySection } from '@/src/modules/explore/services/ai-discovery/types';
import { SectionHeader } from '@/src/modules/explore/components/SectionHeader';
import { CategoryCard } from '@/src/modules/explore/components/CategoryCard';
import { DestinationCard } from '@/src/modules/explore/components/DestinationCard';
import { EventCard } from '@/src/modules/explore/components/EventCard';
import { AroundYouCard } from '@/src/modules/explore/components/AroundYouCard';
import { WeekendEscapeCard } from '@/src/modules/explore/components/WeekendEscapeCard';
import { TrendingBadge } from '@/src/modules/explore/components/TrendingBadge';
import { AIDiscoveryButton } from '@/src/modules/explore/components/AIDiscoveryButton';
import { SearchBar } from '@/src/modules/explore/components/SearchBar';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { ExploreLoadingState } from '@/src/modules/explore/hooks/useExplore';
import type {
  ExploreCategory,
  Destination,
  JourneyFeedItem,
  Event,
  WeekendEscape,
  NearbyItem,
  SearchSuggestion,
} from '@/src/modules/explore/types';
import { useRouter } from 'expo-router';
import { SafeText } from '@/src/components/responsive/SafeText';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services';
import { useSavedPlaces } from '@/src/modules/explore/hooks/useSavedPlaces';

interface ExploreHomeScreenProps {
  onNavigateToSearch: (initialQuery?: string) => void;
  onNavigateToCategory: (category: ExploreCategory) => void;
  onNavigateToDestination: (destination: Destination) => void;
  onNavigateToEvent: (eventId: string) => void;
  onNavigateToJourneyFeed: () => void;
  onNavigateToNearby: () => void;
  onNavigateToAIDiscovery: () => void;
  onNavigateToWeekendEscapes: () => void;
  onNavigateToEvents: () => void;
  onCoordinateJourney: (item: Destination | Event | NearbyItem | WeekendEscape) => void;
  userLocation?: { lat: number; lng: number };
}

export function ExploreHomeScreen({
  onNavigateToSearch,
  onNavigateToCategory,
  onNavigateToDestination,
  onNavigateToEvent,
  onNavigateToJourneyFeed,
  onNavigateToNearby,
  onNavigateToAIDiscovery,
  onNavigateToWeekendEscapes,
  onNavigateToEvents,
  onCoordinateJourney,
  userLocation,
}: ExploreHomeScreenProps) {
  const {
    categories,
    trending,
    popular,
    featured,
    recommendations,
    journeyFeed,
    recentlyViewed,
    events,
    nearby,
    weekendEscapes: weekendEscapesFromOrchestrator,
    loading,
    sectionLoading,
    error,
    refresh,
  } = useExplore(userLocation);

  const router = useRouter();

  const analytics = useExploreAnalytics();
  const { searchHistory, popularSearches, addToHistory } = useSearchHistory();
  // 🔥 FIX: Prefer weekendEscapes from DiscoveryOrchestrator (new pipeline), fall back to old hook
  const weekendEscapesFromHook = useWeekendEscapes(userLocation).escapes;
  const weekendEscapes = (weekendEscapesFromOrchestrator?.length > 0) ? weekendEscapesFromOrchestrator : weekendEscapesFromHook;

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // AI Discovery feed (cache-first, background refresh)
  const { feed: aiFeed, trackInteraction: trackAIDiscovery } = useAIDiscoveryFeed({ location: userLocation });
  const aiRecommendations = useMemo(() => getFeedRecommendations(aiFeed), [aiFeed]);
  const aiSections = useMemo(() => aiFeed?.sections || [], [aiFeed]);

  /* ── Handlers ─────────────────────────────────────────────────────────────── */

  const handleCategoryPress = useCallback((category: ExploreCategory) => {
    analytics.trackCategoryOpened(category.id, category.name);
    onNavigateToCategory(category);
  }, [analytics, onNavigateToCategory]);

  const handleDestinationPress = useCallback((destination: Destination) => {
    analytics.trackDestinationViewed(destination.id, destination.name);
    onNavigateToDestination(destination);
  }, [analytics, onNavigateToDestination]);

  const handleEventPress = useCallback((event: Event) => {
    analytics.trackEventOpened(event.id, event.title);
    onNavigateToEvent(event.id);
  }, [analytics, onNavigateToEvent]);

  const handleCoordinateJourney = useCallback((item: Destination | Event | NearbyItem | WeekendEscape) => {
    const id = 'id' in item ? item.id : '';
    const name = 'name' in item ? item.name : 'title' in item ? item.title : '';
    analytics.trackCoordinateJourney(id, name);

    // If the item is a journey feed item (only has id + title), try to enrich
    // it with full destination data from the already-loaded lists
    const itemAny = item as any;
    if (!itemAny.country && !itemAny.countryCode && itemAny.destinationId) {
      const fullDest = [...trending, ...popular, ...recommendations.map(r => r.destination).filter(Boolean)]
        .find((d) => d?.id === itemAny.destinationId);
      if (fullDest) {
        onCoordinateJourney(fullDest);
        return;
      }
    }

    onCoordinateJourney(item);
  }, [analytics, onCoordinateJourney, trending, popular, recommendations]);

  const handleSearch = useCallback(async (query: string) => {
    analytics.trackSearchPerformed(query);
    await addToHistory(query, 0);
    onNavigateToSearch(query);
  }, [analytics, addToHistory, onNavigateToSearch]);

  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    analytics.trackSearchSuggestionSelected(suggestion.id, suggestion.text);
    setSearchQuery(suggestion.text);
    onNavigateToSearch(suggestion.text);
  }, [analytics, onNavigateToSearch]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleAIPress = useCallback(() => {
    analytics.trackAIAssistantOpened();
    onNavigateToAIDiscovery();
  }, [analytics, onNavigateToAIDiscovery]);

  const handleAIDiscoveryPress = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackAIDiscovery('discovery_clicked', rec, section.type);
    if (rec.destinationId) onNavigateToDestination({ id: rec.destinationId, name: rec.title } as Destination);
    else if (rec.eventId) onNavigateToEvent(rec.eventId);
    else if (rec.coordinates) onNavigateToNearby();
  }, [trackAIDiscovery, onNavigateToDestination, onNavigateToEvent, onNavigateToNearby]);

  const handleAIDiscoverySave = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackAIDiscovery('discovery_saved', rec, section.type);
  }, [trackAIDiscovery]);

  const handleAIDiscoveryDismiss = useCallback((rec: AIRecommendation, section: DiscoverySection) => {
    trackAIDiscovery('discovery_dismissed', rec, section.type);
  }, [trackAIDiscovery]);

  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';
  const { isSaved, toggleSave } = useSavedPlaces();

  const handleSaveDestination = useCallback(async (destination: Destination) => {
    if (!userId) return;
    await toggleSave(destination);
  }, [userId, toggleSave]);

  /* ── Loading State ────────────────────────────────────────────────────────── */

  // Only show full-screen skeleton when there is genuinely no usable data
  if (loading && !categories.length && !trending.length && !nearby.length && !popular.length) {
    return (
      <View className="flex-1 bg-[#0a0b1e]">
        <ExploreScreenSkeleton />
      </View>
    );
  }

  /* ── Error State ──────────────────────────────────────────────────────────── */

  if (error && !categories.length) {
    return (
      <View className="flex-1 bg-[#0a0b1e] items-center justify-center px-8">
        <SafeText className="text-5xl mb-4">⚠️</SafeText>
        <SafeText className="text-tics-text text-xl font-bold mb-2 font-sharetech">Oops!</SafeText>
        <SafeText className="text-gray-400 text-sm text-center leading-6 mb-5 font-sharetech">{error}</SafeText>
        <TouchableOpacity className="bg-tics-blue rounded-xl px-8 py-3" onPress={refresh}>
          <SafeText className="text-white font-semibold font-sharetech">Try Again</SafeText>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── Main Content ─────────────────────────────────────────────────────────── */

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <SafeText className="text-tics-text text-[17px] font-sharetech" numberOfLines={1}>Explore destinations</SafeText>
        </View>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />
        }
      >
        {/* 1. Smart Search (Hero Section) */}
        <View className="bg-[#0a0b1e] pb-3 px-1">
          <SafeText className="text-tics-text text-3xl px-1 font-sharetech">Discover Your</SafeText>
          <SafeText className="text-tics-blue text-3xl px-1 mb-2 font-sharetech">Next Adventure</SafeText>

          <SearchBar
            onSearch={handleSearch}
            onSuggestionSelect={handleSuggestionSelect}
            suggestions={searchSuggestions}
            searchHistory={searchHistory}
            popularSearches={popularSearches}
            loading={searchLoading}
          />

          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              className="flex-row items-center bg-[#3B82F6]/20 rounded-full px-3.5 py-3 gap-1.5"
              onPress={onNavigateToNearby}
            >
              <Ionicons name="location-outline" size={18} color="#FFF" />
              <SafeText className="text-white text-[13px] font-semibold font-sharetech">Near Me</SafeText>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center bg-[#3B82F6]/20 rounded-full px-3.5 py-3 gap-1.5"
              onPress={onNavigateToAIDiscovery}
            >
              <Ionicons name="sparkles-outline" size={18} color="#FFF" />
              <SafeText className="text-white text-[13px] font-semibold font-sharetech">AI Discovery</SafeText>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Around You (Location Intelligence) */}
        {nearby.length > 0 ? (
          <View className="mb-5">
            <SectionHeader
              title="Around You"
              subtitle="Discover places near you"
              onViewAll={onNavigateToNearby}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {nearby.slice(0, 10).map((place) => (
                <AroundYouCard
                  key={place.id}
                  place={place}
                  onPress={(item) => onNavigateToDestination({ id: item.destinationId || item.id, name: item.name } as Destination)}
                  onCoordinatePress={(item) => handleCoordinateJourney(item)}
                />
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.nearby ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-32 mb-3" />
            <View className="flex-row gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} className="w-40 h-48 rounded-2xl bg-gray-800/50" />
              ))}
            </View>
          </View>
        ) : userLocation ? (
          <View className="mb-5 px-4">
            <SafeText className="text-gray-400 text-sm text-center py-4 font-sharetech">
              No nearby places found in your area. Try expanding your search radius.
            </SafeText>
          </View>
        ) : null}

        {/* 3. Trending Right Now */}
        {trending.length > 0 ? (
          <View className="mb-6">
            <SectionHeader title="Trending Right Now" subtitle="Most popular destinations right now" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {trending.map((dest) => (
                <View key={dest.id} className="relative">
                  <DestinationCard
                    destination={dest}
                    onPress={handleDestinationPress}
                    onCoordinatePress={handleCoordinateJourney}
                    onSavePress={handleSaveDestination}
                    isSaved={isSaved(dest.id)}
                    compact
                  />
                  <View className="absolute top-2 right-4">
                    <TrendingBadge type="trending" size="small" />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.trending ? (
          <View className="mb-6 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
            <View className="flex-row gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} className="w-40 h-48 rounded-2xl bg-gray-800/50" />
              ))}
            </View>
          </View>
        ) : null}

        {/* 4. Explore Categories */}
        {categories.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Explore Categories" subtitle="Browse by category" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {categories.map((category) => (
                <CategoryCard key={category.id} category={category} onPress={handleCategoryPress} />
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.categories ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-32 mb-3" />
            <View className="flex-row gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} className="items-center">
                  <View className="w-14 h-14 rounded-2xl bg-gray-800/50 mb-2" />
                  <View className="bg-gray-800/50 rounded h-3 w-12" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 5. AI Discovery (Personalized Feed) */}
        {aiSections.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="AI Discovery" subtitle="Personalized for you" onViewAll={onNavigateToAIDiscovery} />
            {aiSections.slice(0, 3).map((section) => (
              <View key={section.id} className="mb-4">
                <SafeText className="text-tics-text text-base font-semibold mb-2 px-1 font-sharetech">{section.title}</SafeText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                  {section.recommendations.slice(0, 5).map((rec) => (
                    <Pressable
                      key={rec.id}
                      onPress={() => handleAIDiscoveryPress(rec, section)}
                      className="w-56 mr-3 p-1 rounded-3xl border border-white/[0.02] bg-tics-amber/25 overflow-hidden active:opacity-80"
                    >
                      {rec.imageUrl ? (
                        <Image source={{ uri: rec.imageUrl }} className="w-full h-28 rounded-[17px]" />
                      ) : (
                        <View className="w-full h-28 bg-tics-amber/10 rounded-[17px] items-center justify-center">
                          <Ionicons name="compass" size={28} color="#F59E0B" />
                        </View>
                      )}
                      <View className="p-2 px-1 pb-1">
                        <View className="flex-row items-center gap-2 mb-1">
                          <View className="bg-tics-blue/10 rounded-full px-2 py-0.5">
                            <SafeText className="text-tics-blue text-[10px] font-sharetech">{rec.category}</SafeText>
                          </View>
                          {rec.distanceKm !== undefined && (
                            <SafeText className="text-gray-400 text-[10px] font-sharetech">
                              {rec.distanceKm < 1 ? `${Math.round(rec.distanceKm * 1000)}m` : `${rec.distanceKm.toFixed(1)}km`}
                            </SafeText>
                          )}
                        </View>
                        <Text className="text-tics-text text-sm font-semibold mb-1 font-sharetech" numberOfLines={1}>{rec.title}</Text>
                        {rec.reason ? (
                          <Text className="text-tics-amber text-[10px] font-sharetech" numberOfLines={2}>💡 {rec.reason}</Text>
                        ) : null}
                        <View className="flex-row items-center gap-2 mt-2">
                          {rec.rating ? (
                            <View className="flex-row items-center bg-tics-blue/10 rounded-full px-2 py-1">
                              <Ionicons name="star" size={12} color="#F59E0B" />
                              <SafeText className="text-tics-amber text-[10px] ml-0.5 font-sharetech">{rec.rating.toFixed(1)}</SafeText>
                            </View>
                          ) : null}
                          <View className="flex-1" />
                          <TouchableOpacity onPress={() => handleAIDiscoveryDismiss(rec, section)} className="p-1 bg-tics-blue/10 rounded-full">
                            <Ionicons name="close" size={14} color="#64748b" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleAIDiscoverySave(rec, section)} className="p-1 bg-tics-blue/10 rounded-full">
                            <Ionicons name={rec.destinationId && isSaved(rec.destinationId) ? 'bookmark' : 'bookmark-outline'} size={14} color={rec.destinationId && isSaved(rec.destinationId) ? '#F59E0B' : '#94a3b8'} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}

        {/* 6. Personalized Recommendations */}
        {recommendations.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Recommended For You" subtitle="Based on your preferences" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {recommendations.map((rec) => (
                rec.destination && (
                  <View key={rec.id} className="relative">
                    <DestinationCard
                      destination={rec.destination}
                      onPress={handleDestinationPress}
                      onCoordinatePress={handleCoordinateJourney}
                      onSavePress={handleSaveDestination}
                      isSaved={isSaved(rec.destination.id)}
                      compact
                    />

                    {rec.reason && (
                      <View className="absolute top-2 right-4">
                        <View className=" bg-orange-500 rounded-md px-2 py-1 self-start">
                          <SafeText className="text-white self-start text-[10px] font-sharetech" numberOfLines={1}>{rec.reason}</SafeText>
                        </View>
                      </View>
                    )}
                  </View>

                )

              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 7. Popular Destinations — compact cards (matches Trending style) */}
        {popular.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Popular Destinations" subtitle="Top-rated destinations worldwide" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {popular.slice(0, 10).map((dest) => (
                <DestinationCard
                  key={dest.id}
                  destination={dest}
                  onPress={handleDestinationPress}
                  onSavePress={handleSaveDestination}
                  isSaved={isSaved(dest.id)}
                  compact
                />
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.popular ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3].map((i) => (
                <View key={i} className="bg-gray-800/50 rounded-[17px] w-[140] h-[180] mr-2.5" />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 8. Events & Festivals */}
        {events.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Events & Festivals" subtitle="Discover exciting events" onViewAll={onNavigateToEvents} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {events.slice(0, 10).map((event) => (
                <View key={event.id} className="relative">
                  <EventCard
                    event={event}
                    onPress={handleEventPress}
                    onCoordinatePress={(e) => handleCoordinateJourney(e)}
                    compact
                  />
                  {event.trending && (
                    <View className="absolute top-2 right-2">
                      <TrendingBadge type="event" size="small" />
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.events ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
            <View className="flex-row gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} className="w-40 h-48 rounded-2xl bg-gray-800/50" />
              ))}
            </View>
          </View>
        ) : null}

        {/* 9. Weekend Escapes */}
        {weekendEscapes.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Weekend Escapes" subtitle="Perfect for short getaways" onViewAll={onNavigateToWeekendEscapes} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {weekendEscapes.slice(0, 10).map((escape) => (
                <WeekendEscapeCard
                  key={escape.id}
                  escape={escape}
                  onPress={(e) => onNavigateToDestination(e.destination)}
                  onCoordinatePress={(e) => handleCoordinateJourney(e)}
                />
              ))}
            </ScrollView>
          </View>
        ) : sectionLoading?.weekendEscapes ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
            <View className="flex-row gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} className="w-40 h-48 rounded-2xl bg-gray-800/50" />
              ))}
            </View>
          </View>
        ) : null}

        {/* 10. Journey Feed */}
        {journeyFeed.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Journey Feed" subtitle="Discover what's happening" onViewAll={onNavigateToJourneyFeed} />
            {journeyFeed.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={item.id}
                className="mx-1 p-2 mb-3 rounded-4xl overflow-hidden bg-tics-amber/25 border border-tics-amber/10"
                onPress={() => {
                  analytics.trackFeedItemViewed(item.id, item.type);
                  if (item.eventId) {
                    onNavigateToEvent(item.eventId);
                  } else {
                    onNavigateToDestination({ id: item.destinationId, name: item.title } as Destination);
                  }
                }}
                activeOpacity={0.9}
              >
                <Image
                  source={{ uri: item.imageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400' }}
                  className="w-full h-[160] rounded-[26px]"
                  defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==' }}
                />
                {item.badge && (
                  <View className="absolute top-4 left-5">
                    <TrendingBadge type={item.badge.icon as any} size="small" />
                  </View>
                )}
                <View className="mt-1.5">
                  <SafeText className="text-tics-text text-base mb-1 font-sharetech" numberOfLines={1}>{item.title}</SafeText>
                  <SafeText className="text-gray-400 text-[13px] leading-[18px] mb-2.5 font-sharetech" numberOfLines={2}>{item.description}</SafeText>
                  <TouchableOpacity
                    className="bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 items-center"
                    onPress={() => handleCoordinateJourney({ id: item.destinationId, name: item.title, destinationId: item.destinationId } as any)}
                  >
                    <SafeText className="text-white text-[13px] font-semibold font-sharetech">{item.cta.label || 'Coordinate Journey'}</SafeText>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : sectionLoading?.journeyFeed ? (
          <View className="mb-5 px-4">
            <View className="bg-gray-800/50 rounded-lg h-6 w-40 mb-3" />
            {[1, 2].map((i) => (
              <View key={i} className="bg-gray-800/50 rounded-2xl h-40 mb-3" />
            ))}
          </View>
        ) : null}

        {/* 11. Continue Exploring */}
        {recentlyViewed.length > 0 ? (
          <View className="mb-5">
            <SectionHeader title="Continue Exploring" subtitle="Pick up where you left off" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
              {recentlyViewed.map((dest, index) => (
                <DestinationCard
                  key={`recent-${dest.id}-${index}`}
                  destination={dest}
                  onPress={handleDestinationPress}
                  compact
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* <View className="h-[100]" /> */}
      </ScrollView>

      {/* 12. AI Discovery Assistant (Floating Button) */}
      <View className="absolute bottom-6 right-5">
        <AIDiscoveryButton onPress={handleAIPress} size="medium" />
      </View>
    </View>
  );
}