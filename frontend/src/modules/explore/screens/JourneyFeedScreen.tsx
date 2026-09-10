/**
 * JourneyFeedScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated Journey Feed screen with tabs: For You, Trending, Nearby, Weekend,
 * Alerts. Combines events, recommendations, weather, travel advisories,
 * popular destinations, and nearby attractions.
 * Uses dark theme matching TICS app UI.
 * Responsive - no text overflow, cards stay within bounds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyFeed } from '@/src/modules/explore/hooks/useJourneyFeed';
import { useExploreAnalytics } from '@/src/modules/explore/hooks/useExploreAnalytics';
import { FeedCardSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import { ExploreService } from '@/src/modules/explore/services';
import type { JourneyFeedItem, Destination } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface JourneyFeedScreenProps {
  onNavigateToDestination: (destination: Destination) => void;
  onCoordinateJourney: (destination: Destination) => void;
  onBack: () => void;
}

type FeedTab = 'for_you' | 'trending' | 'nearby' | 'weekend' | 'alerts';

interface TabConfig {
  key: FeedTab;
  label: string;
  icon: string;
}

/* ── Constants ──────────────────────────────────────────────────────────────── */

const TABS: TabConfig[] = [
  { key: 'for_you', label: 'For You', icon: 'heart-outline' },
  { key: 'trending', label: 'Trending', icon: 'trending-up-outline' },
  { key: 'nearby', label: 'Nearby', icon: 'location-outline' },
  { key: 'weekend', label: 'Weekend', icon: 'sunny-outline' },
  { key: 'alerts', label: 'Alerts', icon: 'warning-outline' },
];

const TYPE_COLORS: Record<string, string> = {
  trending_destination: '#FF6B6B',
  popular_event: '#6C5CE7',
  weather_alert: '#FDCB6E',
  travel_advisory: '#E17055',
  weekend_escape: '#00B894',
  recommended_experience: '#0984E3',
  for_you: '#FD79A8',
  trending_near_you: '#00CEC9',
  seasonal_pick: '#A29BFE',
};

/* ── Screen ─────────────────────────────────────────────────────────────────── */

export function JourneyFeedScreen({
  onNavigateToDestination,
  onCoordinateJourney,
  onBack,
}: JourneyFeedScreenProps) {
  const [activeTab, setActiveTab] = useState<FeedTab>('for_you');
  const { items, loading, refreshing, hasMore, refresh, loadMore } = useJourneyFeed();
  const analytics = useExploreAnalytics();

  const handleItemPress = useCallback((item: JourneyFeedItem) => {
    analytics.trackFeedItemViewed(item.id, item.type);
    onNavigateToDestination({ id: item.destinationId, name: item.title } as Destination);
  }, [analytics, onNavigateToDestination]);

  const handleCoordinate = useCallback(async (item: JourneyFeedItem) => {
    analytics.trackCoordinateJourney(item.destinationId, item.title);

    // Try to load the full destination so the JourneyCoordinator has
    // the country code needed for classification
    if (item.destinationId) {
      try {
        const result = await ExploreService.getDestinationById(item.destinationId);
        if (result.data) {
          onCoordinateJourney(result.data);
          return;
        }
      } catch (err) {
        console.warn('[JourneyFeedScreen] Failed to load destination for coordinate:', err);
      }
    }

    // Fallback: pass the partial item (country code will be derived from name if possible)
    onCoordinateJourney({ id: item.destinationId, name: item.title } as Destination);
  }, [analytics, onCoordinateJourney]);

  const filteredItems = items.filter((item) => {
    if (activeTab === 'for_you') return item.type === 'for_you' || item.type === 'recommended_experience';
    if (activeTab === 'trending') return item.type === 'trending_destination' || item.type === 'popular_event' || item.type === 'trending_near_you';
    if (activeTab === 'nearby') return item.type === 'trending_near_you';
    if (activeTab === 'weekend') return item.type === 'weekend_escape' || item.type === 'seasonal_pick';
    if (activeTab === 'alerts') return item.type === 'weather_alert' || item.type === 'travel_advisory';
    return true;
  });

  /* ── Render Feed Card ────────────────────────────────────────────────── */

  const renderFeedCard = useCallback(({ item }: { item: JourneyFeedItem }) => {
    const typeColor = TYPE_COLORS[item.type] || '#0984E3';
    return (
      <TouchableOpacity
        className="mx-4 mt-4 rounded-2xl bg-white/[0.07] border border-white/[0.12]"
        onPress={() => handleItemPress(item)}
        activeOpacity={0.9}
      >
        <Image
          source={{ uri: item.imageUrl || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400' }}
          style={{ width: '100%', height: 160, aspectRatio: 16 / 9 }}
          defaultSource={{ uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg==' }}
        />
        {item.badge && (
          <View className="absolute top-2.5 left-2.5">
            <View className="bg-orange-500 rounded-md px-2 py-1">
              <SafeText className="text-white text-[10px] font-sharetech">🔥 Trending</SafeText>
            </View>
          </View>
        )}
        <View className="p-3.5">
          <SafeText className="text-tics-text text-base mb-1 font-sharetech" numberOfLines={2} ellipsizeMode="tail">{item.title}</SafeText>
          <SafeText className="text-gray-400 text-[13px] leading-[18px] mb-2.5 font-sharetech" numberOfLines={3} ellipsizeMode="tail">{item.description}</SafeText>
          <TouchableOpacity
            className="bg-tics-blue rounded-lg py-2.5 items-center"
            onPress={() => handleCoordinate(item)}
          >
            <SafeText className="text-white text-[13px] font-sharetech px-2" numberOfLines={1} ellipsizeMode="tail">{item.cta.label || 'Coordinate Journey'}</SafeText>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [handleItemPress, handleCoordinate]);

  /* ── Render Tab ──────────────────────────────────────────────────────── */

  const renderTab = (tab: TabConfig) => {
    const isActive = activeTab === tab.key;
    return (
      <TouchableOpacity
        key={tab.key}
        className={`flex-row items-center px-4 py-3 border border-tics-amber/25 rounded-full mr-2 ${isActive ? 'bg-tics-amber/35' : ''}`}
        onPress={() => setActiveTab(tab.key)}
      >
        <Ionicons
          name={tab.icon as any}
          size={16}
          color={isActive ? '#FFF' : '#94a3b8'}
        />
        <SafeText className={`text-xs font-sharetech ml-1.5 ${isActive ? 'text-white' : 'text-tics-muted'}`}>
          {tab.label}
        </SafeText>
      </TouchableOpacity>
    );
  };

  /* ── Loading State ───────────────────────────────────────────────────── */

  if (loading && !items.length) {
    return (
      <View className="flex-1 bg-[#0a0b1e]">
        <View className="flex-row items-center px-4 py-2 border-b border-tics-amber/10">
          <TouchableOpacity onPress={onBack} style={{ width: 40, height: 40 }} className="items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="rgba(248,250,252,0.9)" />
          </TouchableOpacity>
          <SafeText className="text-lg text-tics-text font-sharetech flex-1 text-center" numberOfLines={1} ellipsizeMode="tail">Journey Feed</SafeText>
          <View style={{ width: 40 }} />
        </View>
        <FeedCardSkeleton />
      </View>
    );
  }

  /* ── Main Render ─────────────────────────────────────────────────────── */

  return (
    <View className="flex-1 bg-[#0a0b1e]">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <TouchableOpacity onPress={onBack}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="arrow-back" size={24} color="rgba(248,250,252,0.9)" />
        </TouchableOpacity>
        <SafeText className="text-lg text-tics-text font-sharetech flex-1" numberOfLines={1} ellipsizeMode="tail">Journey Feed</SafeText>
        <TouchableOpacity
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="options-outline" size={24} color="rgba(248,250,252,0.9)" />
        </TouchableOpacity>
      </View>

      <View className="border-b border-tics-amber/10">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-3 py-2"
        >
          {TABS.map((tab) => renderTab(tab))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredItems}
        renderItem={renderFeedCard}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#3B82F6" />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          hasMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#3B82F6" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center justify-center pt-20 px-8">
              <Ionicons name="newspaper-outline" size={48} color="#666" />
              <SafeText className="text-lg font-sharetech text-gray-400 mt-4">No feed items yet</SafeText>
              <SafeText className="text-sm text-gray-500 font-sharetech text-center mt-2">Pull to refresh and discover new experiences</SafeText>
            </View>
          ) : null
        }
      />
    </View>
  );
}