/**
 * Explore Events route
 * Matches expo-router file-based route: /explore/events
 */

import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { EventsScreen } from '@/src/modules/explore/screens/EventsScreen';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreEventsRoute() {
  const router = useRouter();

  const navigateToEvent = (eventId: string) => {
    if (eventId) router.push(`/explore/event/${eventId}`);
  };
  const coordinateJourney = (event: any) => {
    if (!event?.id) return;
    JourneyCoordinatorService.coordinateJourney(event, {
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

  return (
    <ThemeProvider value={darkNavTheme}>
      <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
        <EventsScreen
          onNavigateToEvent={navigateToEvent}
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}