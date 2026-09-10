/**
 * Explore Journey Feed route
 * Matches expo-router file-based route: /explore/journey-feed
 */

import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { JourneyFeedScreen } from '@/src/modules/explore/screens/JourneyFeedScreen';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreJourneyFeedRoute() {
  const router = useRouter();

  const navigateToDestination = (destination: any) => {
    if (destination?.id) router.push(`/explore/destination/${destination.id}`);
  };
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
        <JourneyFeedScreen
          onNavigateToDestination={navigateToDestination}
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}