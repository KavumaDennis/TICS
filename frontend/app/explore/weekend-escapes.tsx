/**
 * Explore Weekend Escapes route
 * Matches expo-router file-based route: /explore/weekend-escapes
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { WeekendEscapesScreen } from '@/src/modules/explore/screens/WeekendEscapesScreen';
import { getCurrentPosition } from '@/src/services/LocationService';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreWeekendEscapesRoute() {
  const router = useRouter();
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pos = await getCurrentPosition();
        if (!cancelled && pos) {
          setUserLocation({ lat: pos.latitude, lng: pos.longitude });
        }
      } catch (err) {
        console.warn('[ExploreWeekendEscapes] location fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <WeekendEscapesScreen
          onNavigateToDestination={navigateToDestination}
          onCoordinateJourney={coordinateJourney}
          onBack={() => router.back()}
          userLocation={userLocation}
        />
      </View>
    </ThemeProvider>
  );
}