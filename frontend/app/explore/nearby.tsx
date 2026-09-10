/**
 * Explore Nearby route
 * Matches expo-router file-based route: /explore/nearby
 */

import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { NearMeScreen } from '@/src/modules/explore/screens/NearMeScreen';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreNearbyRoute() {
  const router = useRouter();

  const coordinateJourney = (place: any) => {
    if (!place?.id) return;
    JourneyCoordinatorService.coordinateJourney(place, {
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
        <NearMeScreen
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}