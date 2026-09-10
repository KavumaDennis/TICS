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
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { queryClient } from '@/src/modules/explore/utils/queryClient';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import 'react-native-reanimated';
import '../src/nativewind';
import '../src/styles/global.css';
import {
  useFonts,
  ShareTech_400Regular,
} from '@expo-google-fonts/share-tech';

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
import AIHubTab from '@/src/components/AIHubButton';
import AIHubBottomSheet from '@/src/components/AIHubBottomSheet';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ShareTech_400Regular,
  });

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


  usePushNotifications();

  // Hydrate on mount
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { appHydrate(); }, [appHydrate]);

  //Hide na d show status bar on android for immersive mode
  useEffect(() => {
    if (Platform.OS !== "android") return;

    async function enableImmersiveMode() {
      try {
        await NavigationBar.setVisibilityAsync("hidden");
        await NavigationBar.setBehaviorAsync("overlay-swipe");
        await NavigationBar.setBackgroundColorAsync("#00000000");
      } catch (e) {
        console.log("NavigationBar:", e);
      }
    }

    enableImmersiveMode();
  }, []);

  // Safety net – force hydration to complete after 15 seconds no matter what.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hydrated || !appHydrated) {
        console.warn("[ROOT] Forcing hydration complete after timeout");
        if (!hydrated) useAuthStore.setState({ hydrated: true });
        if (!appHydrated) useAppStore.setState({ hydrated: true });
      }
    }, 15_000);
    return () => clearTimeout(t);
  }, [hydrated, appHydrated]);

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
    loadRatings(uid).catch(() => { });

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


  console.log("fontsLoaded:", fontsLoaded);
  console.log("hydrated:", hydrated);
  console.log("appHydrated:", appHydrated);

  if (!fontsLoaded || !hydrated || !appHydrated) {
    return null;
  };



  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider value={darkNavTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: darkNavTheme.colors.background },
          animation: "fade",
          animationDuration: 4000,
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
        <Stack.Screen name="trip/email-sync" />
        <Stack.Screen name="trip/booking-import" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="last-mile/[tripId]" />
        <Stack.Screen name="last-mile/tracking" />
        <Stack.Screen name="last-mile/operator-details" />
        <Stack.Screen name="last-mile/destination-select" />
        <Stack.Screen name="last-mile/ride-complete" />
        <Stack.Screen name="operator/select" />
        <Stack.Screen name="operator/recovery-trip/[tripId]" />
        <Stack.Screen name="explore" />
        <Stack.Screen name="explore/search" />
        <Stack.Screen name="explore/category/[id]" />
        <Stack.Screen name="explore/destination/[id]" />
        <Stack.Screen name="explore/event/[id]" />
        <Stack.Screen name="explore/journey-feed" />
        <Stack.Screen name="explore/nearby" />
        <Stack.Screen name="explore/weekend-escapes" />
        <Stack.Screen name="explore/events" />
        <Stack.Screen name="explore/discovery" />
      </Stack>
      <StatusBar hidden />
      {/* Global AI Hub elements */}
      <AIHubTab />
      <AIHubBottomSheet />
    </ThemeProvider>
    </QueryClientProvider>
  );
}
