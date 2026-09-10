/**
 * WeekendEscapesScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated screen for weekend escapes with filtering and sorting options.
 * Shows destinations perfect for short getaways.
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
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWeekendEscapes } from '@/src/modules/explore/hooks/useWeekendEscapes';
import { DestinationCard } from '@/src/modules/explore/components/DestinationCard';
import { SectionHeader } from '@/src/modules/explore/components/SectionHeader';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { Destination } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';
import { router } from 'expo-router';

interface WeekendEscapesScreenProps {
  onNavigateToDestination: (destination: Destination) => void;
  onCoordinateJourney: (destination: Destination) => void;
  onBack: () => void;
  userLocation?: { lat: number; lng: number };
}

type SortOption = 'distance' | 'rating' | 'popularity';
type FilterOption = 'all' | 'day_trip' | 'weekend' | 'road_trip' | 'adventure';

export function WeekendEscapesScreen({
  onNavigateToDestination,
  onCoordinateJourney,
  onBack,
  userLocation,
}: WeekendEscapesScreenProps) {
  const { escapes, loading, refresh, loadMore } = useWeekendEscapes(userLocation);
  const [sortBy, setSortBy] = useState<SortOption>('distance');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  const handleDestinationPress = useCallback((destination: Destination) => {
    onNavigateToDestination(destination);
  }, [onNavigateToDestination]);

  const handleCoordinatePress = useCallback((destination: Destination) => {
    onCoordinateJourney(destination);
  }, [onCoordinateJourney]);

  // Sort escapes
  const sortedEscapes = [...escapes].sort((a, b) => {
    switch (sortBy) {
      case 'distance':
        return a.distance - b.distance;
      case 'rating':
        return (b.destination.rating || 0) - (a.destination.rating || 0);
      case 'popularity':
        return (b.destination.popularity || 0) - (a.destination.popularity || 0);
      default:
        return 0;
    }
  });

  // Filter escapes
  const filteredEscapes = filterBy === 'all'
    ? sortedEscapes
    : sortedEscapes.filter(escape => escape.type === filterBy);

  if (loading && !escapes.length) {
    return (
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-4 py-2 border-b border-gray-200">
          <TouchableOpacity onPress={onBack} className="w-10 h-10 justify-center items-center">
            <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
          </TouchableOpacity>
          <SafeText className="text-lg font-bold text-[#1A1A2E]">Weekend Escapes</SafeText>
          <View className="w-10" />
        </View>
        <ExploreScreenSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0b1e] p-1">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <SafeText className="text-tics-text text-[17px] font-sharetech">Weekend Escapes</SafeText>
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
        <View className="p-3 py-3">
          <SafeText className="text-sm text-tics-text font-sharetech">
            Discover perfect weekend getaways and short trips near you
          </SafeText>
        </View>

        {/* Sort Options */}
        <View className="flex-row px-1 py-1 gap-2">
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'distance' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('distance')}
          >
            <Ionicons name="location-outline" size={16} color={sortBy === 'distance' ? '#FFF' : '#666'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'distance' ? 'text-white' : 'text-tics-muted'}`}>Nearest</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'rating' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('rating')}
          >
            <Ionicons name="star-outline" size={16} color={sortBy === 'rating' ? '#FFF' : '#666'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'rating' ? 'text-white' : 'text-tics-muted'}`}>Top Rated</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 font-sharetech border border-tics-amber/20 rounded-full gap-1.5 ${sortBy === 'popularity' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('popularity')}
          >
            <Ionicons name="trending-up-outline" size={16} color={sortBy === 'popularity' ? '#FFF' : '#666'} />
            <SafeText className={`text-xs font-sharetech ${sortBy === 'popularity' ? 'text-white' : 'text-tics-muted'}`}>Popular</SafeText>
          </TouchableOpacity>
        </View>

        {/* Filter Options */}
        <View className="px-1 py-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {(['all', 'day_trip', 'weekend', 'road_trip', 'adventure'] as FilterOption[]).map((filter) => (
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
        <View className="px-4 py-2">
          <SafeText className="text-sm text-tics-muted font-sharetech">
            {filteredEscapes.length} {filteredEscapes.length === 1 ? 'escape' : 'escapes'} found
          </SafeText>
        </View>

        {/* Weekend Escapes List */}
        {filteredEscapes.length > 0 ? (
          <View className="mt-1">
            {filteredEscapes.map((escape) => (
              <View key={escape.id} className="mx-4 mb-4">
                <View className="flex-row justify-between items-center mb-2 px-1">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons
                      name={getTypeIcon(escape.type)}
                      size={16}
                      color="#0984E3"
                    />
                    <SafeText className="text-xs text-[#0984E3] font-semibold capitalize">
                      {escape.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SafeText>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={14} color="#666" />
                    <SafeText className="text-xs text-gray-600 font-semibold">{escape.distance.toFixed(1)} km</SafeText>
                  </View>
                </View>
                <DestinationCard
                  destination={escape.destination}
                  onPress={handleDestinationPress}
                  onCoordinatePress={handleCoordinatePress}
                />
                {escape.reason && (
                  <View className="mt-2 px-3 py-2 bg-blue-50 rounded-lg">
                    <SafeText className="text-xs text-gray-600 leading-4 italic">{escape.reason}</SafeText>
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity className="mx-4 mt-4 bg-gray-100 rounded-lg py-3 items-center" onPress={loadMore}>
              <SafeText className="text-sm text-[#0984E3] font-semibold">Load More</SafeText>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="items-center justify-center pt-20 px-8">
            <Ionicons name="sunny-outline" size={48} color="#CCC" />
            <SafeText className="text-lg font-semibold text-gray-400 mt-4">No weekend escapes found</SafeText>
            <SafeText className="text-sm text-gray-300 text-center mt-2">Try adjusting your filters</SafeText>
          </View>
        )}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}

function getTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'day_trip':
      return 'sunny-outline';
    case 'weekend':
      return 'calendar-outline';
    case 'road_trip':
      return 'car-outline';
    case 'adventure':
      return 'compass-outline';
    default:
      return 'location-outline';
  }
}