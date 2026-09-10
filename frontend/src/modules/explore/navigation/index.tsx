/**
 * Explore Navigation
 * ─────────────────────────────────────────────────────────────────────────────
 * Navigation router for the Explore module. Uses composition pattern -
 * screens receive navigation callbacks as props rather than being coupled
 * to a specific navigation library.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import type { ExploreCategory, Destination, Event, NearbyItem, WeekendEscape } from '@/src/modules/explore/types';
import { ExploreHomeScreen } from '@/src/modules/explore/screens/ExploreHomeScreen';
import { resolveCountryCode } from '@/src/utils/countryCodes';
import { CategoryScreen } from '@/src/modules/explore/screens/CategoryScreen';
import { SearchScreen } from '@/src/modules/explore/screens/SearchScreen';
import { JourneyFeedScreen } from '@/src/modules/explore/screens/JourneyFeedScreen';
import { DestinationDetailScreen } from '@/src/modules/explore/screens/DestinationDetailScreen';
import { EventDetailScreen } from '@/src/modules/explore/screens/EventDetailScreen';
import { NearMeScreen } from '@/src/modules/explore/screens/NearMeScreen';
import { AIDiscoveryFeedScreen } from '@/src/modules/explore/screens/AIDiscoveryFeedScreen';
import { WeekendEscapesScreen } from '@/src/modules/explore/screens/WeekendEscapesScreen';
import { EventsScreen } from '@/src/modules/explore/screens/EventsScreen';

/* ── Route Types ────────────────────────────────────────────────────────────── */

export type ExploreRoute =
  | { name: 'ExploreHome' }
  | { name: 'Category'; params: { category: ExploreCategory } }
  | { name: 'DestinationDetail'; params: { destinationId: string } }
  | { name: 'EventDetail'; params: { eventId: string } }
  | { name: 'JourneyFeed' }
  | { name: 'Nearby' }
  | { name: 'Search'; params?: { initialQuery?: string } }
  | { name: 'AIDiscovery' }
  | { name: 'WeekendEscapes' }
  | { name: 'Events' }
  | { name: 'CoordinateJourney'; params: { destination: Destination } };

/* ── Navigation Props ───────────────────────────────────────────────────────── */

export interface ExploreNavigationProps {
  onNavigate: (route: ExploreRoute) => void;
  onBack: () => void;
  onCoordinateJourney: (destination: Destination) => void;
}

/* ── Navigation Callback Builder ────────────────────────────────────────────── */

export function createExploreNavigationCallbacks(
  navigate: (route: ExploreRoute) => void,
  goBack: () => void,
  coordinateJourney: (destination: Destination) => void
) {
  return {
    onNavigateToSearch: (initialQuery?: string) =>
      navigate({ name: 'Search', params: { initialQuery } }),
    onNavigateToCategory: (category: ExploreCategory) =>
      navigate({ name: 'Category', params: { category } }),
    onNavigateToDestination: (destination: Destination) =>
      navigate({ name: 'DestinationDetail', params: { destinationId: destination.id } }),
    onNavigateToEvent: (eventId: string) =>
      navigate({ name: 'EventDetail', params: { eventId } }),
    onNavigateToJourneyFeed: () => navigate({ name: 'JourneyFeed' }),
    onNavigateToNearby: () => navigate({ name: 'Nearby' }),
    onNavigateToAIDiscovery: () => navigate({ name: 'AIDiscovery' }),
    onNavigateToWeekendEscapes: () => navigate({ name: 'WeekendEscapes' }),
    onNavigateToEvents: () => navigate({ name: 'Events' }),
    onCoordinateJourney: (item: any) => {
      // Build a destination-shaped object from various item types
      // (Destination, Event, NearbyPlace, WeekendEscape, etc.)
      // For events, use venue/city as destination name (not the long event title)
      const destinationName = item?.name || item?.venue?.name || item?.city || item?.title || '';
      const countryName = item?.country || item?.destination?.country || '';
      const destination: Destination = {
        id: item?.id || '',
        name: destinationName,
        country: countryName,
        // Derive country code from the country name when not directly available
        countryCode: resolveCountryCode(item?.countryCode || item?.destination?.countryCode, countryName) || '',
        city: item?.city || '',
        coordinates: item?.coordinates || item?.destination?.coordinates || { lat: 0, lng: 0 },
        images: item?.images || [],
        categories: item?.categories || [],
        description: item?.description || '',
        slug: item?.slug || '',
        travelTips: item?.travelTips || [],
        nearbyAirport: item?.nearbyAirport || null,
        nearbyHotels: item?.nearbyHotels || [],
        nearbyAttractions: item?.nearbyAttractions || [],
        weatherSummary: item?.weatherSummary || null,
        bestSeason: item?.bestSeason || '',
        bestTimeToVisit: item?.bestTimeToVisit || '',
        popularity: item?.popularity || 0,
        rating: item?.rating || 0,
        reviewCount: item?.reviewCount || 0,
        reviews: item?.reviews || [],
        travelRequirements: item?.travelRequirements || [],
        emergencyContacts: item?.emergencyContacts || [],
        currency: item?.currency || '',
        language: item?.language || '',
        timezone: item?.timezone || '',
        timezoneOffset: item?.timezoneOffset || '',
        estimatedBudget: item?.estimatedBudget || null,
        topAttractions: item?.topAttractions || [],
        relatedDestinationIds: item?.relatedDestinationIds || [],
        featured: item?.featured || false,
        trending: item?.trending || false,
        active: item?.active ?? true,
        createdAt: item?.createdAt || new Date(),
        updatedAt: item?.updatedAt || new Date(),
      };
      coordinateJourney(destination);
    },
    onBack: goBack,
  };
}

/* ── Router Component ───────────────────────────────────────────────────────── */

interface ExploreRouterProps {
  route: ExploreRoute;
  onNavigate: (route: ExploreRoute) => void;
  onBack: () => void;
  onCoordinateJourney: (destination: Destination) => void;
  userLocation?: { lat: number; lng: number };
}

export function ExploreRouter({ route, onNavigate, onBack, onCoordinateJourney, userLocation }: ExploreRouterProps) {
  const callbacks = createExploreNavigationCallbacks(onNavigate, onBack, onCoordinateJourney);

  switch (route.name) {
    case 'ExploreHome':
      return <ExploreHomeScreen {...callbacks} userLocation={userLocation} />;

    case 'Category':
      return (
        <CategoryScreen
          category={route.params.category}
          onNavigateToDestination={callbacks.onNavigateToDestination}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    case 'Search':
      return (
        <SearchScreen
          initialQuery={route.params?.initialQuery}
          onNavigateToDestination={callbacks.onNavigateToDestination}
          onNavigateToEvent={callbacks.onNavigateToEvent}
          onBack={callbacks.onBack}
        />
      );

    case 'JourneyFeed':
      return (
        <JourneyFeedScreen
          onNavigateToDestination={callbacks.onNavigateToDestination}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    case 'DestinationDetail':
      return (
        <DestinationDetailScreen
          destinationId={route.params.destinationId}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    case 'EventDetail':
      return (
        <EventDetailScreen
          eventId={route.params.eventId}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    case 'Nearby':
      return (
        <NearMeScreen
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    case 'AIDiscovery':
      return <AIDiscoveryFeedScreen userLocation={userLocation} />;

    case 'WeekendEscapes':
      return (
        <WeekendEscapesScreen
          onNavigateToDestination={callbacks.onNavigateToDestination}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
          userLocation={userLocation}
        />
      );

    case 'Events':
      return (
        <EventsScreen
          onNavigateToEvent={callbacks.onNavigateToEvent}
          onCoordinateJourney={callbacks.onCoordinateJourney}
          onBack={callbacks.onBack}
        />
      );

    default:
      return <ExploreHomeScreen {...callbacks} />;
  }
}