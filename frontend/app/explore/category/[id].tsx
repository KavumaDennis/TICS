/**
 * Explore Category route
 * Matches expo-router file-based route: /explore/category/[id]
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { darkNavTheme } from '@/src/constants/theme';
import { CategoryScreen } from '@/src/modules/explore/screens/CategoryScreen';
import { ExploreService } from '@/src/modules/explore/services';
import type { ExploreCategory } from '@/src/modules/explore/types';
import { SafeText } from '@/src/components/responsive/SafeText';
import { JourneyCoordinatorService } from '@/src/services/JourneyCoordinatorService';

export default function ExploreCategoryRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [category, setCategory] = useState<ExploreCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await ExploreService.getCategoryById(id);
        if (!cancelled) {
          setCategory(result.data);
          setError(result.error);
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load category');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : error || !category ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <SafeText style={{ color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 16 }}>
              {error || 'Category not found'}
            </SafeText>
          </View>
        ) : (
          <CategoryScreen
            category={category}
            onNavigateToDestination={navigateToDestination}
            onCoordinateJourney={coordinateJourney}
            onBack={() => router.back()}
          />
        )}
      </View>
    </ThemeProvider>
  );
}