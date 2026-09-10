/**
 * Explore shell
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the Explore module with the app theme and persistent tab bar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { darkNavTheme } from '@/src/constants/theme';
import AIHubTab from '@/src/components/AIHubButton';
import AIHubBottomSheet from '@/src/components/AIHubBottomSheet';
import { ExploreHomeScreen } from '@/src/modules/explore/screens/ExploreHomeScreen';
import { getCurrentPosition } from '@/src/services/LocationService';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';
import { resolveCountryCode } from '@/src/utils/countryCodes';

export default function ExploreScreen() {
  const router = require('expo-router').useRouter();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>(undefined);

  const navigateToSearch = (initialQuery?: string) => {
    router.push(`/explore/search${initialQuery ? `?q=${encodeURIComponent(initialQuery)}` : ''}`);
  };
  const navigateToCategory = (category: any) => {
    if (category?.id) router.push(`/explore/category/${category.id}`);
  };
  const navigateToDestination = (destination: any) => {
    if (destination?.id) router.push(`/explore/destination/${destination.id}`);
  };
  const navigateToEvent = (eventId: string) => {
    if (eventId) router.push(`/explore/event/${eventId}`);
  };
  const navigateToJourneyFeed = () => router.push('/explore/journey-feed');
  const navigateToNearby = () => router.push('/explore/nearby');
  const navigateToAIDiscovery = () =>
    // Pass the validated session location through so AI discovery never falls
    // back to a hardcoded default while fresh GPS exists.
    router.push(`/explore/discovery${userLocation ? `?lat=${userLocation.lat}&lng=${userLocation.lng}` : ''}`);
  const navigateToAIDiscoveryFeed = () => router.push(`/explore/discovery${userLocation ? `?lat=${userLocation.lat}&lng=${userLocation.lng}` : ''}`);
  const navigateToWeekendEscapes = () => router.push('/explore/weekend-escapes');
  const navigateToEvents = () => router.push('/explore/events');
  const coordinateJourney = (item: any) => {
    if (!item?.id) return;
    // Build a destination-shaped object from various item types
    const countryName = item.country || item.destination?.country || '';
    const destination: any = {
      id: item.id,
      name: item.name || item.title || item.venue?.name || item.city || '',
      country: countryName,
      // Derive country code from the country name when not directly available
      // (e.g. Journey Feed items, Nearby places, Events from Google Places)
      countryCode: resolveCountryCode(item.countryCode || item.destination?.countryCode, countryName) || '',
      city: item.city || '',
      coordinates: item.coordinates || item.destination?.coordinates || { lat: 0, lng: 0 },
      images: item.images || [],
      categories: item.categories || [],
      description: item.description || '',
      slug: item.slug || '',
      travelTips: item.travelTips || [],
      nearbyAirport: item.nearbyAirport || null,
      nearbyHotels: item.nearbyHotels || [],
      nearbyAttractions: item.nearbyAttractions || [],
      weatherSummary: item.weatherSummary || null,
      bestSeason: item.bestSeason || '',
      bestTimeToVisit: item.bestTimeToVisit || '',
      popularity: item.popularity || 0,
      rating: item.rating || 0,
      reviewCount: item.reviewCount || 0,
      reviews: item.reviews || [],
      travelRequirements: item.travelRequirements || [],
      emergencyContacts: item.emergencyContacts || [],
      currency: item.currency || '',
      language: item.language || '',
      timezone: item.timezone || '',
      timezoneOffset: item.timezoneOffset || '',
      estimatedBudget: item.estimatedBudget || null,
      topAttractions: item.topAttractions || [],
      relatedDestinationIds: item.relatedDestinationIds || [],
      featured: item.featured || false,
      trending: item.trending || false,
      active: item.active ?? true,
      createdAt: item.createdAt || new Date(),
      updatedAt: item.updatedAt || new Date(),
    };

    // Use the JourneyCoordinatorService which properly classifies, decides,
    // and creates trips (local trips are created immediately, international
    // trips open the planner with prefill data)
    JourneyCoordinatorService.coordinateJourney(destination, {
      navigateToMonitoring: (tripId: string) => router.push(`/trips/${tripId}`),
      navigateToTripSetup: (prefillData: Record<string, any>) => {
        router.push({
          pathname: '/trip-input',
          params: { prefill: JSON.stringify(prefillData) },
        });
      },
      navigateToTrips: () => router.push('/trips'),
    });
  };

  // Get user location on mount so it can be passed to ExploreHomeScreen
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pos = await getCurrentPosition();
        if (!cancelled && pos) {
          console.log(
            `[LOCATION TRACE]\nsource: device GPS (LocationService.getCurrentPosition — authoritative for this Explore session)\nlatitude: ${pos.latitude}\nlongitude: ${pos.longitude}\naccuracy: ${(pos as any).accuracy ?? 'n/a'}\ntimestamp: ${new Date().toISOString()}\nconsumer: ExploreHomeScreen → useExplore → DiscoveryOrchestrator (OSM, Firestore, Events)`
          );
          setUserLocation({ lat: pos.latitude, lng: pos.longitude });
        }
      } catch (err) {
        console.warn('[ExploreScreen] location fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={darkNavTheme}>
        <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
          <ExploreHomeScreen
            onNavigateToSearch={navigateToSearch}
            onNavigateToCategory={navigateToCategory}
            onNavigateToDestination={navigateToDestination}
            onNavigateToEvent={navigateToEvent}
            onNavigateToJourneyFeed={navigateToJourneyFeed}
            onNavigateToNearby={navigateToNearby}
            onNavigateToAIDiscovery={navigateToAIDiscovery}
            onNavigateToWeekendEscapes={navigateToWeekendEscapes}
            onNavigateToEvents={navigateToEvents}
            onCoordinateJourney={coordinateJourney}
            userLocation={userLocation}
          />

          <PersistentTabBar />
          <AIHubTab />
        </View>

        <AIHubBottomSheet />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
