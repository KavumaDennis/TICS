/**
 * Root layout — boots all Firestore real-time listeners.
 *
 * Architecture:
 *  • Trips listener starts on auth, loads ALL trips for the user.
 *  • Per-trip listeners (alerts, recs, weather, flight, mobility) are started
 *    for EVERY trip returned — not just the active trip. This ensures data for
 *    all trips persists across navigation and switching the active trip instantly
 *    reflects live data without a cold-start fetch.
 *  • Listeners are keyed by tripId so switching trips has zero latency.
 *  • Cleanup runs when auth state changes (logout).
 */
import { useEffect, useRef } from 'react';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../src/nativewind';
import '../src/styles/global.css';
import {
  useFonts,
  Syne_400Regular,
  Syne_500Medium,
  Syne_600SemiBold,
  Syne_700Bold,
} from '@expo-google-fonts/syne';

import { darkNavTheme } from '@/src/constants/theme';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import { useAppStore } from '@/src/store/appStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useRecommendationStore } from '@/src/store/recommendationStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useMobilityStore } from '@/src/store/mobilityStore';
import { useSaveStore } from '@/src/store/saveStore';
import { useRatingStore } from '@/src/store/ratingStore';
import { useTransportStore } from '@/src/store/transportStore';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Syne_400Regular,
    Syne_500Medium,
    Syne_600SemiBold,
    Syne_700Bold,
  });

  usePushNotifications();

  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const appHydrate = useAppStore((s) => s.hydrate);
  const appHydrated = useAppStore((s) => s.hydrated);
  const uid = useAuthStore((s) => s.token);

  // Trip store
  const startTripsListener = useTripStore((s) => s.startTripsListener);
  const stopTripsListener = useTripStore((s) => s.stopTripsListener);
  const trips = useTripStore((s) => s.trips);

  // Per-trip stores
  const startAlertsListener = useAlertStore((s) => s.startAlertsListener);
  const stopAlertsListener = useAlertStore((s) => s.stopAlertsListener);
  const startUserAlertsListener = useAlertStore((s) => s.startUserAlertsListener);
  const stopUserAlertsListener = useAlertStore((s) => s.stopUserAlertsListener);
  const startRecsListener = useRecommendationStore((s) => s.startRecommendationsListener);
  const stopRecsListener = useRecommendationStore((s) => s.stopRecommendationsListener);
  const startWeather = useWeatherStore((s) => s.startWeatherListener);
  const stopWeather = useWeatherStore((s) => s.stopWeatherListener);
  const startFlight = useFlightMonitoringStore((s) => s.startFlightMonitoringListener);
  const stopFlight = useFlightMonitoringStore((s) => s.stopFlightMonitoringListener);
  const startMobility = useMobilityStore((s) => s.startMobilityListener);
  const stopMobility = useMobilityStore((s) => s.stopMobilityListener);
  const startTransport = useTransportStore((s) => s.startListener);
  const stopTransport = useTransportStore((s) => s.stopListener);

  // User-level stores
  const startUserDoc = useUserDocStore((s) => s.startUserDocListener);
  const stopUserDoc = useUserDocStore((s) => s.stopUserDocListener);
  const startSaved = useSaveStore((s) => s.startListener);
  const stopSaved = useSaveStore((s) => s.stopListener);
  const loadRatings = useRatingStore((s) => s.loadRatings);

  // Track which tripIds have active per-trip listeners
  const activeTripListeners = useRef<Set<string>>(new Set());

  // Hydrate on mount
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { appHydrate(); }, [appHydrate]);

  // Auth-level listeners (start/stop on uid change)
  useEffect(() => {
    if (!uid) {
      stopTripsListener();
      stopUserAlertsListener();
      stopUserDoc();
      stopSaved();
      activeTripListeners.current.forEach((id) => {
        stopAlertsListener(id);
        stopRecsListener(id);
        stopWeather(id);
        stopFlight(id);
        stopMobility(id);
        stopTransport(id);
      });
      activeTripListeners.current.clear();
      return;
    }

    startTripsListener(uid);
    startUserAlertsListener(uid);
    startUserDoc(uid);
    startSaved(uid);
    loadRatings(uid).catch(() => {});

    return () => {
      stopTripsListener();
      stopUserAlertsListener();
      stopUserDoc();
      stopSaved();
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Per-trip listeners — start for every new trip, stop for removed trips.
   * Ensures all trips have live data keyed by tripId.
   */
  useEffect(() => {
    if (!uid) return;

    const currentIds = new Set(trips.map((t) => t.id));

    // Start listeners for newly added trips
    currentIds.forEach((id) => {
      if (!activeTripListeners.current.has(id)) {
        startAlertsListener(uid, id);
        startRecsListener(uid, id);
        startWeather(id);
        startFlight(id);
        startMobility(id);
        startTransport(id);
        activeTripListeners.current.add(id);
      }
    });

    // Stop listeners for removed trips
    activeTripListeners.current.forEach((id) => {
      if (!currentIds.has(id)) {
        stopAlertsListener(id);
        stopRecsListener(id);
        stopWeather(id);
        stopFlight(id);
        stopMobility(id);
        stopTransport(id);
        activeTripListeners.current.delete(id);
      }
    });
  }, [trips, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fontsLoaded || !hydrated || !appHydrated) return null;

  return (
    <ThemeProvider value={darkNavTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: darkNavTheme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding/splash" />
        <Stack.Screen name="onboarding/intro" />
        <Stack.Screen name="onboarding/monitoring" />
        <Stack.Screen name="onboarding/recommendations" />
        <Stack.Screen name="onboarding/coordination" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="trip-input" />
        <Stack.Screen name="trips/[id]" />
        <Stack.Screen name="trips/[id]/map" />
        <Stack.Screen name="saved" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
