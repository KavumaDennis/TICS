/**
 * EventsScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated screen for Events & Festivals with filtering and sorting options.
 * Shows upcoming events, festivals, concerts, and cultural celebrations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvents } from '@/src/modules/explore/hooks/useEvents';
import { EventCard } from '@/src/modules/explore/components/EventCard';
import { SectionHeader } from '@/src/modules/explore/components/SectionHeader';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { Event } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';

interface EventsScreenProps {
  onNavigateToEvent: (eventId: string) => void;
  onCoordinateJourney: (event: Event) => void;
  onBack: () => void;
}

type SortOption = 'date' | 'popularity' | 'rating';
type FilterOption = 'all' | 'upcoming' | 'this_week' | 'this_month' | 'trending';

export function EventsScreen({
  onNavigateToEvent,
  onCoordinateJourney,
  onBack,
}: EventsScreenProps) {
  const { events, loading, refresh, loadMore } = useEvents({ global: true });
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const handleEventPress = useCallback((event: Event) => {
    onNavigateToEvent(event.id);
  }, [onNavigateToEvent]);

  const handleCoordinatePress = useCallback((event: Event) => {
    onCoordinateJourney(event);
  }, [onCoordinateJourney]);

  // Sort events
  const sortedEvents = [...events].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      case 'popularity':
        return (b.popularity || 0) - (a.popularity || 0);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      default:
        return 0;
    }
  });

  // Filter events
  const now = new Date();
  const filteredEvents = sortedEvents.filter(event => {
    if (filterBy === 'all') return true;

    const eventDate = new Date(event.startDate);
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    switch (filterBy) {
      case 'upcoming':
        return eventDate > now;
      case 'this_week':
        return eventDate >= now && eventDate <= weekFromNow;
      case 'this_month':
        return eventDate >= now && eventDate <= monthFromNow;
      case 'trending':
        return event.trending;
      default:
        return true;
    }
  });

  if (loading && !events.length) {
    return (
      <View className="flex-1 bg-[#0a0b1e] p-1">
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <TouchableOpacity
            onPress={onBack}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="arrow-back" size={24} color="rgba(248,250,252,0.9)" />
          </TouchableOpacity>
          <SafeText className="text-lg font-bold text-[#1A1A2E]">Events & Festivals</SafeText>
          <View className="w-10" />
        </View>
        <ExploreScreenSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <TouchableOpacity
          onPress={onBack}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="arrow-back" size={24} color="rgba(248,250,252,0.9)" />
        </TouchableOpacity>
        <SafeText className="text-tics-text text-[17px] font-sharetech">Events & Festivals</SafeText>
        <View className="w-10" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#0984E3" />
        }
        contentContainerClassName="pb-5"
      >
        {/* Description */}
        <View className="px-2">
          <SafeText className="text-sm text-tics-text font-sharetech leading-5">
            Discover exciting events, festivals, concerts, and cultural celebrations
          </SafeText>
        </View>

        {/* Sort Options */}
        <View className="flex-row px-1 py-3 gap-2">
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'date' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('date')}
          >
            <Ionicons name="calendar-outline" size={16} color={sortBy === 'date' ? '#FFF' : 'rgba(226,232,240,0.72)'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'date' ? 'text-white' : 'text-tics-muted'}`}>Date</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'popularity' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('popularity')}
          >
            <Ionicons name="trending-up-outline" size={16} color={sortBy === 'popularity' ? '#FFF' : 'rgba(226,232,240,0.72)'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'popularity' ? 'text-white' : 'text-tics-muted'}`}>Popular</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'rating' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('rating')}
          >
            <Ionicons name="star-outline" size={16} color={sortBy === 'rating' ? '#FFF' : 'rgba(226,232,240,0.72)'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'rating' ? 'text-white' : 'text-tics-muted'}`}>Top Rated</SafeText>
          </TouchableOpacity>
        </View>

        {/* Filter Options */}
        <View className="px-1 pb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {(['all', 'upcoming', 'this_week', 'this_month', 'trending'] as FilterOption[]).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  className={`px-4 py-2.5 rounded-full ${filterBy === filter ? 'bg-tics-amber/35' : 'bg-gray-100'}`}
                  onPress={() => setFilterBy(filter)}
                >
                  <SafeText className={`text-xs font-sharetech ${filterBy === filter ? 'text-white' : 'text-gray-600'}`}>
                    {filter === 'all' ? 'All' : filter.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SafeText>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Results Count */}
        <View className="px-2 py-2">
          <SafeText className="text-sm font-sharetech text-gray-600">
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'} found
          </SafeText>
        </View>

        {/* Events List */}
        {filteredEvents.length > 0 ? (
          <View className="mt-1">
            {filteredEvents.map((event) => (
              <View key={event.id} className="mx-1 mb-4">
                <EventCard
                  event={event}
                  onPress={handleEventPress}
                  onCoordinatePress={handleCoordinatePress}
                />
              </View>
            ))}
            <TouchableOpacity className="mx-4 mt-4 bg-gray-100 rounded-full py-3 items-center" onPress={loadMore}>
              <SafeText className="text-sm text-[#0984E3] font-sharetech">Load More</SafeText>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="items-center justify-center pt-20 px-8">
            <Ionicons name="calendar-outline" size={48} color="#CCC" />
            <SafeText className="text-lg font-semibold text-gray-400 mt-4">No events found</SafeText>
            <SafeText className="text-sm text-gray-300 text-center mt-2">Try adjusting your filters</SafeText>
          </View>
        )}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}