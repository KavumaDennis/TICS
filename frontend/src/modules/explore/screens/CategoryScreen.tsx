/**
 * CategoryScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Expanded category page with featured, trending, popular, nearby, weekend,
 * recommended, upcoming events, related categories, pagination, filtering,
 * and sorting. Never falls back to hardcoded sample data.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExploreService } from '@/src/modules/explore/services';
import { ExploreEngine } from '@/src/modules/explore/services/ExploreEngine';
import { enrichDestinations } from '@/src/modules/explore/services/discovery/DestinationImageService';
import { getCurrentPosition } from '@/src/services/LocationService';
import { DestinationCard } from '@/src/modules/explore/components/DestinationCard';
import { SectionHeader } from '@/src/modules/explore/components/SectionHeader';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import { DestinationCache } from '@/src/modules/explore/services/discovery/DestinationCache';
import { categoryMatchesKeywords } from '@/src/modules/explore/services/discovery/CategoryDiscoveryEngine';
import type { ExploreCategory, Destination, Event } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ── Screen ──────────────────────────────────────────────────────────────────── */

interface CategoryScreenProps {
  category: ExploreCategory;
  onNavigateToDestination: (destination: Destination) => void;
  onCoordinateJourney: (destination: Destination) => void;
  onBack: () => void;
}

export function CategoryScreen({
  category,
  onNavigateToDestination,
  onCoordinateJourney,
  onBack,
}: CategoryScreenProps) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'popularity' | 'rating'>('popularity');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // First check in-memory cache for API-derived destinations matching this category
      const cachedAll: Destination[] = DestinationCache.getAll();
      // Keyword matching: category slugs are plural ("beaches", "museums")
      // while dynamic OSM destinations carry singular types ("beach",
      // "museum") and broad travel categories ("Nature", "Culture", ...).
      // categoryMatchesKeywords() compares against a keyword map built from
      // the actual OSM vocabulary (with stem fallback), so dynamic OSM places
      // reliably appear under their category.
      const cachedForCategory = cachedAll.filter((d: Destination) => {
        const hay = [
          d.name,
          (d as any).type,
          ...(d.categories || []),
          ...((d as any).tags || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return categoryMatchesKeywords(category.slug, hay);
      });

      // Then also try Firestore for curated destinations
      const [destResult, eventResult] = await Promise.all([
        ExploreService.loadDestinationsByCategory(category.slug, isRefresh ? undefined : cursor ?? undefined),
        ExploreService.loadEvents({ category: category.slug, pageSize: 5 }),
      ]);

      const firestoreDestinations = destResult.data && destResult.data.length > 0
        ? destResult.data
        : [];

      // Merge: prefer Firestore unique IDs, fill gaps with cache
      const combined = [...firestoreDestinations];
      const existingIds = new Set(firestoreDestinations.map(d => d.id));
      for (const cached of cachedForCategory) {
        if (!existingIds.has(cached.id)) {
          combined.push(cached);
        }
      }

      if (isRefresh) {
        setDestinations(combined);
      } else {
        setDestinations((prev) => {
          const merged = [...prev, ...combined];
          const unique = new Map<string, Destination>();
          for (const d of merged) unique.set(d.id, d);
          return Array.from(unique.values());
        });
      }

      // LIVE OSM FETCH — the DestinationCache only holds what the last
      // discover() run cached, so most categories start thin or empty. When
      // the merged result is thin, query OSM live around the user's real
      // location and keep the places that actually belong to this category.
      if (combined.length < 5) {
        try {
          const pos = await getCurrentPosition();
          if (pos) {
            const osmItems = await ExploreEngine.getNearbyPlaces({
              lat: pos.latitude,
              lng: pos.longitude,
              radiusKm: 100,
              pageSize: 30,
            });
            const osmDestinations = osmItems
              .filter((item) => {
                const text = [
                  item.name, (item as any).type, (item as any).travelCategory, ...(item.tags || []),
                ]
                  .filter(Boolean)
                  .join(' ');
                return categoryMatchesKeywords(category.slug, text);
              })
              .map((item) => ({
                id: item.destinationId || item.id,
                name: item.name,
                slug: item.name?.toLowerCase().replace(/\s+/g, '-') || '',
                description: item.description || '',
                country: '',
                countryCode: '',
                city: '',
                coordinates: item.coordinates,
                images: item.imageUrl ? [{ url: item.imageUrl, caption: '', credit: '' }] : [],
                categories: [((item as any).travelCategory || category.name)],
                travelTips: [],
                nearbyAirport: null,
                nearbyHotels: [],
                nearbyAttractions: [],
                weatherSummary: null,
                bestSeason: '',
                bestTimeToVisit: '',
                popularity: item.rating || 0,
                rating: item.rating || 0,
                reviewCount: item.reviewCount || 0,
                reviews: [],
                travelRequirements: [],
                emergencyContacts: [],
                currency: '',
                language: '',
                timezone: '',
                timezoneOffset: '',
                estimatedBudget: null,
                topAttractions: [],
                relatedDestinationIds: [],
                featured: false,
                trending: false,
                active: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              } as Destination));

            if (osmDestinations.length > 0) {
              // Resolve real photos for the dynamic category places.
              await enrichDestinations(osmDestinations).catch(() => undefined);
              setDestinations((prev) => {
                const unique = new Map<string, Destination>();
                for (const d of [...prev, ...osmDestinations]) unique.set(d.id, d);
                return Array.from(unique.values());
              });
              setHasMore(true);
              console.log(`[CategoryScreen] live OSM added ${osmDestinations.length} destinations for "${category.slug}"`);
            }
          }
        } catch (osmErr) {
          console.warn('[CategoryScreen] live OSM category fetch failed:', osmErr);
        }
      }
      setEvents(eventResult.data || []);
      setHasMore(destResult.hasMore || cachedForCategory.length > 0);
      setCursor(destResult.lastCursor);
    } catch (err) {
      console.error('[CategoryScreen] Error:', err);
      // On error, don't use fallback - show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category.slug, cursor]);

  useEffect(() => {
    loadData(true);
  }, [category.slug]);

  const sortedDestinations = [...destinations].sort((a, b) => {
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return (b.popularity || 0) - (a.popularity || 0);
  });

  if (loading && !destinations.length) {
    return (
      <View className="flex-1 bg-[#0a0b1e] p-1">
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <TouchableOpacity onPress={onBack}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="arrow-back" size={24} color="rgba(248,250,252,0.9)" />
          </TouchableOpacity>
          <SafeText className="text-tics-text text-[17px] font-sharetech">{category.name}</SafeText>
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
        <View className="flex-1">
          <SafeText className="text-tics-text text-[17px] font-sharetech">{category.name}</SafeText>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#0984E3" />
        }
        contentContainerClassName="pb-5"
      >
        {/* Category Info */}
        <View className="px-2">
          <SafeText className="text-sm text-tics-text font-sharetech leading-5">{category.description}</SafeText>
        </View>

        {/* Sort Options */}
        <View className="flex-row px-1 py-3 gap-2">
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 rounded-full border border-tics-amber/20 gap-1.5 ${sortBy === 'popularity' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('popularity')}
          >
            <SafeText className={`text-xs font-sharetech ${sortBy === 'popularity' ? 'text-white' : 'text-tics-muted'}`}>Popular</SafeText>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center px-4 py-3 rounded-full border border-tics-amber/20 gap-1.5 ${sortBy === 'rating' ? 'bg-tics-amber/35' : ''}`}
            onPress={() => setSortBy('rating')}
          >
            <SafeText className={`text-xs font-sharetech ${sortBy === 'rating' ? 'text-white' : 'text-tics-muted'}`}>Top Rated</SafeText>
          </TouchableOpacity>
        </View>

        {/* All Destinations */}
        {sortedDestinations.length > 0 ? (
          <View className="">
            <SectionHeader title={`All ${category.name}`} subtitle={`${sortedDestinations.length} destinations`} />
            {sortedDestinations.map((dest) => (
              <DestinationCard
                key={dest.id}
                destination={dest}
                onPress={onNavigateToDestination}
                onCoordinatePress={onCoordinateJourney}
              />
            ))}
            {hasMore && (
              <TouchableOpacity className="mx-4 mt-4 bg-gray-100 rounded-lg py-3 items-center" onPress={() => loadData()}>
                <SafeText className="text-sm text-[#0984E3] font-semibold">Load More</SafeText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="items-center justify-center pt-20 px-8">
            <Ionicons name="search-outline" size={48} color="#CCC" />
            <SafeText className="text-lg font-semibold text-gray-400 mt-4">No destinations found</SafeText>
            <SafeText className="text-sm text-gray-300 text-center mt-2">
              No destinations available in this category yet
            </SafeText>
          </View>
        )}

        {/* Upcoming Events */}
        {events.length > 0 && (
          <View className="mt-6">
            <SectionHeader title="Upcoming Events" />
            {events.slice(0, 3).map((event) => (
              <View key={event.id} className="mx-4 mb-3 p-3.5 bg-gray-50 rounded-xl">
                <SafeText className="text-base font-semibold text-[#1A1A2E]">{event.title}</SafeText>
                <SafeText className="text-sm text-gray-500 mt-1">{new Date(event.startDate).toLocaleDateString()}</SafeText>
                <SafeText className="text-sm text-gray-400 mt-1">{event.city}, {event.country}</SafeText>
              </View>
            ))}
          </View>
        )}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}