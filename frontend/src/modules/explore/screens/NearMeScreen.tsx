/**
 * NearMeScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPLETELY REDESIGNED Near Me experience.
 *
 * This screen no longer loads destinations from the Firestore destinations
 * collection. Instead it uses the user's current GPS location to discover
 * nearby attractions via the Google Places API, enriches them with events
 * from Firestore, ranks them with the NearMeEngine, and presents a beautiful,
 * map-like exploration experience.
 *
 * Architecture:
 *   NearMeScreen
 *     → useNearby()
 *       → NearMeEngine
 *         → NearMeService (Google Places API)
 *         → ExploreService (Firestore events)
 *
 * The UI NEVER calls Google APIs directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNearby } from '@/src/modules/explore/hooks/useNearby';
import { NearMeCard } from '@/src/modules/explore/components/NearMeCard';
import { NearMePlaceDetail } from '@/src/modules/explore/components/NearMePlaceDetail';
import { NearMeFilters } from '@/src/modules/explore/components/NearMeFilters';
import { ExploreScreenSkeleton } from '@/src/modules/explore/components/LoadingSkeleton';
import type { NearbyPlace, NearMeCategory } from '@/src/modules/explore/types/nearme';
import { SafeText } from '@/src/components/responsive/SafeText';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services';
import { useSavedPlaces } from '@/src/modules/explore/hooks/useSavedPlaces';

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface NearMeScreenProps {
  onCoordinateJourney?: (place: NearbyPlace) => void;
  onBack?: () => void;
}

/* ── Category Definitions ───────────────────────────────────────────────────── */

interface CategoryDefinition {
  key: NearMeCategory;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryDefinition[] = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'attractions', label: 'Attractions', icon: 'compass-outline' },
  { key: 'museums', label: 'Museums', icon: 'color-palette-outline' },
  { key: 'parks', label: 'Parks', icon: 'leaf-outline' },
  { key: 'wildlife', label: 'Wildlife', icon: 'paw-outline' },
  { key: 'historical_sites', label: 'Historical', icon: 'business-outline' },
  { key: 'beaches', label: 'Beaches', icon: 'water-outline' },
  { key: 'restaurants', label: 'Restaurants', icon: 'restaurant-outline' },
  { key: 'cafes', label: 'Cafes', icon: 'cafe-outline' },
  { key: 'shopping', label: 'Shopping', icon: 'cart-outline' },
  { key: 'hotels', label: 'Hotels', icon: 'bed-outline' },
  { key: 'religious_sites', label: 'Religious', icon: 'business-outline' },
  { key: 'entertainment', label: 'Entertainment', icon: 'film-outline' },
];

/* ── Component ──────────────────────────────────────────────────────────────── */

export function NearMeScreen({
  onCoordinateJourney,
  onBack,
}: NearMeScreenProps) {
  const {
    places,
    events,
    loading,
    refreshing,
    error,
    location,
    gpsStatus,
    hasMore,
    isOffline,
    activeCategory,
    sortBy,
    filters,
    viewMode,
    setActiveCategory,
    setSortBy,
    setFilters,
    resetFilters,
    setViewMode,
    loadMore,
    refresh,
    requestLocationPermission,
    getPlaceDetails,
    trackPlaceViewed,
    trackCoordinateJourney,
    trackSavePlace,
    trackSharePlace,
    trackDirectionsStarted,
    trackMapViewOpened,
  } = useNearby();

  console.log('[DEBUG] Step 7: NearMeScreen render - places:', places.length, 'location:', location);

  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  /* ── Place Selection ──────────────────────────────────────────────────────── */

  const handlePlacePress = useCallback(async (place: NearbyPlace) => {
    trackPlaceViewed(place);
    // Get full details for the place
    const details = await getPlaceDetails(place.placeId);
    setSelectedPlace(details || place);
  }, [getPlaceDetails, trackPlaceViewed]);

  const handleCloseDetail = useCallback(() => {
    setSelectedPlace(null);
  }, []);

  /* ── Actions ──────────────────────────────────────────────────────────────── */

  const handleCoordinateJourney = useCallback((place: NearbyPlace) => {
    trackCoordinateJourney(place);
    if (onCoordinateJourney) {
      // Enrich the place with country info from the current location
      // so the JourneyCoordinator can derive the country code
      onCoordinateJourney({
        ...place,
        country: location?.country || '',
        countryCode: location?.countryCode || '',
      } as any);
    } else {
      // Open Google Maps for directions
      const url = `https://www.google.com/maps/dir/?api=1&destination=${place.coordinates.lat},${place.coordinates.lng}&travelmode=driving`;
      Linking.openURL(url);
    }
  }, [onCoordinateJourney, trackCoordinateJourney, location]);

  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';
  const { isSaved, toggleSave } = useSavedPlaces();

  const handleSave = useCallback(async (place: NearbyPlace) => {
    trackSavePlace(place);
    if (!userId) return;
    await toggleSave({
      id: place.placeId,
      name: place.name,
      country: '',
      countryCode: '',
      images: place.imageUrl ? [{ url: place.imageUrl, caption: '', credit: '' }] : [],
      description: place.description || place.vicinity || '',
      rating: place.rating || 0,
      coordinates: place.coordinates,
    } as any);
  }, [trackSavePlace, userId, toggleSave]);

  const handleShare = useCallback((place: NearbyPlace) => {
    trackSharePlace(place);
    const url = `https://www.google.com/maps/search/?api=1&query=${place.coordinates.lat},${place.coordinates.lng}&query_place_id=${place.placeId}`;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`);
  }, [trackSharePlace]);

  const handleDirections = useCallback((place: NearbyPlace, mode: 'walking' | 'driving') => {
    trackDirectionsStarted(place, mode);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.coordinates.lat},${place.coordinates.lng}&travelmode=${mode}`;
    Linking.openURL(url);
  }, [trackDirectionsStarted]);

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestLocationPermission();
    if (granted) {
      setShowPermissionPrompt(false);
      refresh();
    }
  }, [requestLocationPermission, refresh]);

  const handleToggleView = useCallback(() => {
    if (viewMode === 'list') {
      trackMapViewOpened();
    }
    setViewMode(viewMode === 'list' ? 'map' : 'list');
  }, [viewMode, setViewMode, trackMapViewOpened]);

  /* ── Active filter count badge ────────────────────────────────────────────── */

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.openNow) count++;
    if (filters.free) count++;
    if (filters.familyFriendly) count++;
    if (filters.indoor) count++;
    if (filters.outdoor) count++;
    if (filters.accessible) count++;
    if (filters.maxDistance < 50) count++;
    if (filters.minRating > 0) count++;
    return count;
  }, [filters]);

  /* ── Render Place Card ────────────────────────────────────────────────────── */

  const renderPlaceCard = useCallback(({ item }: { item: NearbyPlace }) => (
    <NearMeCard
      place={item}
      onPress={handlePlacePress}
      onCoordinateJourney={handleCoordinateJourney}
      onSave={handleSave}
      onShare={handleShare}
      isSaved={isSaved(item.placeId)}
    />
  ), [handlePlacePress, handleCoordinateJourney, handleSave, handleShare, isSaved]);

  const keyExtractor = useCallback((item: NearbyPlace) => item.id, []);

  const onEndReached = useCallback(() => {
    if (hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  /* ── Permission Denied State ──────────────────────────────────────────────── */

  if (gpsStatus === 'denied' || gpsStatus === 'blocked') {
    return (
      <View className="flex-1 bg-[#0a0b1e]">
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <TouchableOpacity onPress={onBack} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
          </TouchableOpacity>
          <SafeText className="text-tics-text text-lg font-sharetech">Near Me</SafeText>
          <View className="w-10" />
        </View>

        <View className="flex-1 items-center justify-center px-8">
          <View className="bg-[#1a1b2e] rounded-2xl p-8 items-center w-full max-w-sm">
            <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center mb-4">
              <Ionicons name="location-outline" size={32} color="#EF4444" />
            </View>
            <SafeText className="text-white text-xl font-bold text-center font-sharetech">Location Access Needed</SafeText>
            <SafeText className="text-gray-400 text-sm text-center mt-2 leading-5 font-sharetech">
              {gpsStatus === 'denied'
                ? 'We need your location to discover amazing places near you.'
                : 'Location access is blocked. Please enable it in your device settings.'}
            </SafeText>
            <TouchableOpacity
              className="bg-[#3B82F6] rounded-xl py-3 px-8 mt-6 w-full items-center"
              onPress={handleRequestPermission}
            >
              <SafeText className="text-white text-[15px] font-semibold font-sharetech">Enable Location</SafeText>
            </TouchableOpacity>
            <TouchableOpacity
              className="mt-3 py-2"
              onPress={onBack}
            >
              <SafeText className="text-gray-400 text-[13px] font-sharetech">Go Back</SafeText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  /* ── Loading State ────────────────────────────────────────────────────────── */

  if (loading && places.length === 0) {
    return (
      <View className="flex-1 bg-[#0a0b1e]">
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <TouchableOpacity onPress={onBack} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="arrow-back" size={24} color="#F8FAFC" />
          </TouchableOpacity>
          <SafeText className="text-tics-text text-lg font-sharetech">Near Me</SafeText>
          <View className="w-10" />
        </View>
        <ExploreScreenSkeleton />
      </View>
    );
  }

  /* ── Main Screen ──────────────────────────────────────────────────────────── */

  return (
    <View className="flex-1 bg-[#0a0b1e]">
      {/* Selected Place Detail View */}
      {selectedPlace ? (
        <NearMePlaceDetail
          place={selectedPlace}
          onClose={handleCloseDetail}
          onCoordinateJourney={handleCoordinateJourney}
          onSave={handleSave}
          onShare={handleShare}
          onDirections={handleDirections}
        />
      ) : (
        <>
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <View className="p-1 pb-3 border-b border-white/[0.08]">
            <View className=" p-2 flex-row items-center justify-between gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
              <View className="flex-row items-center justify-between gap-2">
                <TouchableOpacity onPress={onBack} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
                  <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
                </TouchableOpacity>
                <View>

                  <SafeText className="text-tics-text font-sharetech">Discover amazing places around you</SafeText>
                </View>
              </View>

              <View className="flex-row items-center gap-2">
                {/* GPS Status */}
                <View className={`w-2 h-2 rounded-full ${gpsStatus === 'granted' || gpsStatus === 'undetermined' ? 'bg-green-500' : 'bg-red-500'}`} />

                {/* Refresh button */}
                <TouchableOpacity
                  style={{ height: 46, width: 46 }}
                  className="rounded-full bg-tics-amber/35 border border-tics-amber/20 items-center justify-center"
                  onPress={handleRefresh}
                >
                  <Ionicons name="refresh-outline" size={18} color="#F8FAFC" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Location and view toggle */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="location-outline" size={14} color="#3B82F6" />
                <SafeText className="text-[#3B82F6] text-[13px] font-medium font-sharetech">
                  {location ? `${location.city}, ${location.country}` : 'Detecting location...'}
                </SafeText>
              </View>

              {__DEV__ && location && (
                <SafeText className="text-gray-600 text-[10px] font-sharetech">
                  ({location.lat.toFixed(4)}, {location.lng.toFixed(4)})
                </SafeText>
              )}

              <View className="flex-row items-center gap-1.5">
                {/* Filters button */}
                <TouchableOpacity
                  className="flex-row items-center px-3 py-1.5 rounded-full bg-tics-amber/25 border border-tics-amber/10 relative"
                  onPress={() => setShowFilters(true)}
                >
                  <Ionicons name="funnel-outline" size={14} color="#F8FAFC" />
                  <SafeText className="text-gray-300 text-[12px] ml-1 font-sharetech">Filters</SafeText>
                  {activeFilterCount > 0 && (
                    <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#3B82F6] items-center justify-center">
                      <SafeText className="text-white text-[9px] font-bold font-sharetech">{activeFilterCount}</SafeText>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Map/List Toggle */}
                <TouchableOpacity
                  className="w-8 h-8 rounded-full bg-tics-amber/25 border border-tics-amber/10 items-center justify-center"
                  onPress={handleToggleView}
                >
                  <Ionicons
                    name={viewMode === 'list' ? 'map-outline' : 'list-outline'}
                    size={16}
                    color="#F8FAFC"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Category Chips ─────────────────────────────────────────────── */}
          <View className="border-b border-white/[0.08]">
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={CATEGORIES}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  key={item.key}
                  className={`flex-row items-center px-3.5 py-3 rounded-full ${activeCategory === item.key
                    ? 'bg-tics-amber/35 border border-tics-amber/20'
                    : 'border border-tics-amber/20'
                    }`}
                  onPress={() => setActiveCategory(item.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={activeCategory === item.key ? '#FFF' : '#888'}
                  />
                  <SafeText
                    className={`text-[12px] font-medium ml-1.5 ${activeCategory === item.key ? 'text-tics-text' : 'text-tics-muted'
                      } font-sharetech`}
                  >
                    {item.label}
                  </SafeText>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* ── Offline Banner ─────────────────────────────────────────────── */}
          {isOffline && (
            <View className="bg-yellow-500/20 px-4 py-2 flex-row items-center gap-2">
              <Ionicons name="cloud-offline-outline" size={16} color="#FBBF24" />
              <SafeText className="text-yellow-400 text-[12px] flex-1 font-sharetech">
                You're offline. Showing cached results.
              </SafeText>
            </View>
          )}

          {/* ── Error Banner ───────────────────────────────────────────────── */}
          {error && !isOffline && (
            <View className="bg-red-500/20 px-4 py-2 flex-row items-center gap-2">
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
              <SafeText className="text-red-400 text-[12px] flex-1 font-sharetech">{error}</SafeText>
              <TouchableOpacity onPress={handleRefresh}>
                <SafeText className="text-red-400 text-[12px] font-medium font-sharetech">Retry</SafeText>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Events Banner ──────────────────────────────────────────────── */}
          {events.length > 0 && (
            <View className="bg-[#3B82F6]/10 px-4 py-2.5 border-b border-[#3B82F6]/20">
              <View className="flex-row items-center gap-2">
                <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                <SafeText className="text-[#3B82F6] text-[13px] font-medium font-sharetech">
                  {events.length} event{events.length > 1 ? 's' : ''} happening nearby
                </SafeText>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={events.slice(0, 5)}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ marginTop: 6, gap: 8 }}
                renderItem={({ item }) => (
                  <View className="bg-white/[0.05] rounded-lg px-3 py-1.5">
                    <SafeText className="text-gray-300 text-[11px] font-medium font-sharetech">{item.title}</SafeText>
                    <SafeText className="text-gray-500 text-[10px] mt-0.5 capitalize font-sharetech">{item.category}</SafeText>
                  </View>
                )}
              />
            </View>
          )}

          {/* ── Map View ──────────────────────────────────────────────────── */}
          {viewMode === 'map' && (
            <View className="flex-1 items-center justify-center bg-[#0a0b1e]">
              <View className="items-center px-8">
                <Ionicons name="map-outline" size={64} color="#555" />
                <SafeText className="text-gray-400 text-lg font-semibold mt-4 font-sharetech">Map View</SafeText>
                <SafeText className="text-gray-600 text-sm text-center mt-2 font-sharetech">
                  {places.length} places found nearby
                </SafeText>
                <TouchableOpacity
                  className="bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 px-6 mt-6 flex-row items-center gap-2"
                  onPress={() => {
                    if (location) {
                      const url = `https://www.google.com/maps/@${location.lat},${location.lng},14z`;
                      Linking.openURL(url);
                    }
                  }}
                >
                  <Ionicons name="open-outline" size={18} color="#FFF" />
                  <SafeText className="text-white text-[14px] font-semibold font-sharetech">Open in Google Maps</SafeText>
                </TouchableOpacity>
                <TouchableOpacity
                  className="mt-3 py-2"
                  onPress={() => setViewMode('list')}
                >
                  <SafeText className="text-gray-400 text-[13px] font-sharetech">Switch to List View</SafeText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── List View ──────────────────────────────────────────────────── */}
          {viewMode === 'list' && (
            <FlatList
              data={places}
              renderItem={renderPlaceCard}
              keyExtractor={keyExtractor}
              showsVerticalScrollIndicator={false}
              onEndReached={onEndReached}
              onEndReachedThreshold={0.3}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor="#3B82F6"
                  colors={['#3B82F6']}
                  progressBackgroundColor="#1a1b2e"
                />
              }
              contentContainerStyle={{
                paddingTop: 16,
                paddingBottom: Platform.OS === 'ios' ? 120 : 100,
              }}
              ListHeaderComponent={
                places.length > 0 ? (
                  <View className="flex-row items-center justify-between px-4 mb-3">
                    <SafeText className="text-gray-400 text-[13px] font-sharetech">
                      {places.length} place{places.length !== 1 ? 's' : ''} found
                    </SafeText>
                    <TouchableOpacity
                      className="flex-row items-center gap-1"
                      onPress={() => setShowFilters(true)}
                    >
                      <Ionicons name="swap-vertical-outline" size={14} color="#3B82F6" />
                      <SafeText className="text-[#3B82F6] text-[12px] font-medium capitalize font-sharetech">
                        Sort: {sortBy.replace('_', ' ')}
                      </SafeText>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                !loading ? (
                  <View className="items-center justify-center pt-20 px-8">
                    <Ionicons name="location-outline" size={56} color="#555" />
                    <SafeText className="text-gray-500 text-lg font-semibold mt-4 font-sharetech">No places found</SafeText>
                    <SafeText className="text-gray-600 text-sm text-center mt-1.5 font-sharetech">
                      Try a different category or adjust your filters
                    </SafeText>
                    {(activeFilterCount > 0 || activeCategory !== 'all') && (
                      <TouchableOpacity
                        className="mt-4 bg-white/[0.07] rounded-full px-5 py-2.5"
                        onPress={resetFilters}
                      >
                        <SafeText className="text-gray-300 text-[13px] font-sharetech">Reset Filters</SafeText>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null
              }
              ListFooterComponent={
                loading && places.length > 0 ? (
                  <View className="py-4 items-center">
                    <SafeText className="text-gray-500 text-[13px] font-sharetech">Loading more places...</SafeText>
                  </View>
                ) : null
              }
            />
          )}


        </>
      )}

      {/* ── Filters Modal ─────────────────────────────────────────────────── */}
      <NearMeFilters
        filters={filters}
        sortBy={sortBy}
        isVisible={showFilters}
        onClose={() => setShowFilters(false)}
        onApplyFilters={setFilters}
        onApplySort={setSortBy}
        onReset={resetFilters}
      />
    </View>
  );
}