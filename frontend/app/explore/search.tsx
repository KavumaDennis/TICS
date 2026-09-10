/**
 * Explore Search route
 * Matches expo-router file-based route: /explore/search
 */

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { SearchScreen } from '@/src/modules/explore/screens/SearchScreen';

export default function ExploreSearchRoute() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();

  const navigateToDestination = (destination: any) => {
    if (destination?.id) router.push(`/explore/destination/${destination.id}`);
  };
  const navigateToEvent = (eventId: string) => {
    if (eventId) router.push(`/explore/event/${eventId}`);
  };

  return (
    <ThemeProvider value={darkNavTheme}>
      <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
        <SearchScreen
          initialQuery={q}
          onNavigateToDestination={navigateToDestination}
          onNavigateToEvent={navigateToEvent}
          onBack={() => router.back()}
        />
      </View>
    </ThemeProvider>
  );
}