/**
 * Explore Event Detail route
 * Matches expo-router file-based route: /explore/event/[id]
 */

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { EventDetailScreen } from '@/src/modules/explore/screens/EventDetailScreen';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreEventDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

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
        <EventDetailScreen
          eventId={id}
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}