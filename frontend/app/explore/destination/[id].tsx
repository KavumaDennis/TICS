/**
 * Explore Destination Detail route
 * Matches expo-router file-based route: /explore/destination/[id]
 */

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { DestinationDetailScreen } from '@/src/modules/explore/screens/DestinationDetailScreen';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreDestinationDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const coordinateJourney = (destination: any) => {
    if (!destination?.id) return;
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

  return (
    <ThemeProvider value={darkNavTheme}>
      <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
        <DestinationDetailScreen
          destinationId={id}
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}