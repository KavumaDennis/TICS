/**
 * DashboardScreen — centralized trip status, synchronized monitoring lifecycle.
 *
 * Completed trips:
 *  - Show muted styling with "Completed" badge
 *  - No glowing indicators, pulse animations, or active monitoring pills
 *  - No live weather/gate/dept refresh
 *  - Show "Trip completed" summary
 *
 * Active trips:
 *  - Full live monitoring, weather, alerts, recommendations
 *  - Dynamic status badge derived from getTripStatus()
 */
import { useMemo, useState, memo } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons, Ionicons, MaterialIcons } from '@expo/vector-icons';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useRecommendationStore } from '@/src/store/recommendationStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { greetingFromEmailOrName, ticsDisplayName } from '@/src/utils/displayName';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { getTripStatus } from '@/src/utils/tripStatus';
import PopularDestinations from '@/src/components/PopularDestinations';

const CONTENT_PADDING = 16; // px-2 on both sides

// Carousel item component - hooks are called at the top level, not inside map
const CarouselItem = memo(function CarouselItem({ t, alertsByTripId, recsByTripId, weatherStoreByTripId, flightStoreByTripId, onPress }: any) {
  const tripAlerts = alertsByTripId[t.id] ?? [];
  const tripRecs = recsByTripId[t.id] ?? [];
  const tripWeather = weatherStoreByTripId[t.id] ?? null;
  const tripFlight = flightStoreByTripId[t.id] ?? null;
  const { isCompleted, isCancelled, statusInfo } = useTripStatus(t, tripAlerts);
  const isCompletedOrCancelled = isCompleted || isCancelled;
  const activeAlerts = tripAlerts.filter((a: any) => a.active && !a.read).length;
  const urgentRecs = tripRecs.filter((r: any) => r.urgency === 'high').length;
  const depIn = t ? timeUntil(t.departureTime) : null;

  // Get status-based colors
  const statusColors: any = {
    upcoming: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6', label: 'Upcoming' },
    boarding: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', label: 'Boarding' },
    active: { bg: 'rgba(34,197,94,0.15)', text: '#22C55E', label: 'Active' },
    airborne: { bg: 'rgba(34,197,94,0.15)', text: '#22C55E', label: 'Airborne ✈' },
    arriving: { bg: 'rgba(20,184,166,0.15)', text: '#14B8A6', label: 'Arriving' },
    delayed: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', label: 'Delayed' },
    completed: { bg: 'rgba(100,116,139,0.15)', text: '#64748B', label: 'Completed' },
    cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'Cancelled' },
  };
  const colors = statusColors[statusInfo.status] || statusColors.upcoming;

  // Use blue accent for all carousel items
  const accentColor = 'blue';

  return (
    <View>
      <Pressable
        onPress={onPress}
        style={{ width: "100%" }}
        className="active:opacity-90">
        <Card accent={accentColor} className="px-6 py-6 rounded-4xl  bg-tics-amber/25 border border-tics-amber/10">
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text
                style={{ fontFamily: 'Syne_500Medium' }}
                className="text-tics-blue text-[13px] font-semibold tracking-wide">ACTIVE TRIP</Text>

              <View className="flex-row items-center justify-between">
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="mt-2 text-[17px] text-tics-text">{t.title}</Text>
                <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.bg }}>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: colors.text, fontSize: 11 }}>
                    {colors.label}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, fontFamily: 'Syne_500Medium', borderBottomWidth: 1, borderBottomColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.12)' : 'rgba(255,255,255,0.12)', fontWeight: '300' }} className={`mt-2 pb-2 text-[12px] ${isCompletedOrCancelled ? 'text-tics-muted/60' : 'text-tics-muted'}`}>
                {dateRange(t.departureTime, t.arrivalTime)}
              </Text>

              {/* Live mini-stats row — only for active trips */}
              {!isCompletedOrCancelled && (
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                  {depIn && (
                    <View>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>DEPARTURE IN</Text>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14, marginTop: 2 }}>{depIn}</Text>
                    </View>
                  )}
                  {tripWeather?.tempC != null && (
                    <View>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>DEST. WEATHER</Text>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: '#FBBF24', fontSize: 14, marginTop: 2 }}>{Math.round(tripWeather.tempC)}°C</Text>
                    </View>
                  )}
                  {tripFlight?.gate && (
                    <View>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>GATE</Text>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: '#60A5FA', fontSize: 14, marginTop: 2 }}>{tripFlight.gate}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Completed trip summary */}
              {isCompletedOrCancelled && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748B', fontSize: 12 }}>
                    {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Card>
      </Pressable>
    </View>
  );
});

function dateRange(departureIso?: string, arrivalIso?: string) {
  if (!departureIso || !arrivalIso) return '—';
  const d1 = new Date(departureIso);
  const d2 = new Date(arrivalIso);
  const a = d1.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const b = d2.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${a} — ${b}`;
}

function timeUntil(isoStr?: string): string {
  if (!isoStr) return '';
  const ms = Date.parse(isoStr) - Date.now();
  if (ms <= 0) return 'Now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.ceil(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 22) return 'Good Evening';
  return 'Good Night';
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();

  const PAGE_WIDTH = width - CONTENT_PADDING;

  const CARD_GAP = 2;
  const CARD_WIDTH = PAGE_WIDTH - CARD_GAP * 2;

  const greeting = useMemo(() => getGreeting(), []);

  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const trips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const [selectedTripIndex, setSelectedTripIndex] = useState(0);

  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const recsByTripId = useRecommendationStore((s) => s.byTripId);
  const weatherStoreByTripId = useWeatherStore((s) => s.byTripId);
  const flightStoreByTripId = useFlightMonitoringStore((s) => s.byTripId);

  // Sort trips: active first, then by departure time
  const sortedTrips = useMemo(() => {
    if (!trips.length) return [];
    return [...trips].sort((a, b) => {
      const aTime = a.departureTime ? new Date(a.departureTime).getTime() : 0;
      const bTime = b.departureTime ? new Date(b.departureTime).getTime() : 0;
      return aTime - bTime;
    });
  }, [trips]);

  // Filter to only show ACTIVE trips in carousel (exclude completed/cancelled)
  const activeTrips = useMemo(() => sortedTrips.filter(t => {
    // Use centralized status function to check if trip is completed
    // Pass flight and alerts data for accurate status calculation
    const tripFlight = flightStoreByTripId[t.id] ?? null;
    const tripAlerts = alertsByTripId[t.id] ?? [];
    const statusInfo = getTripStatus(t, tripFlight, tripAlerts);
    return statusInfo.status !== 'completed';
  }), [sortedTrips, flightStoreByTripId, alertsByTripId]);

  const trip = activeTrips[selectedTripIndex] ?? null;
  const weather = useMemo(() => (trip ? weatherStoreByTripId[trip.id] ?? null : null), [trip?.id, weatherStoreByTripId]);
  const flight = useMemo(() => (trip ? flightStoreByTripId[trip.id] ?? null : null), [trip?.id, flightStoreByTripId]);

  // Centralized trip status
  const {
    statusInfo,
    label,
    isActive,
    isCompleted,
    isCancelled,
    canMonitor,
    showLiveTracking,
    showLiveAlerts,
    showLiveRecommendations,
  } = useTripStatus(trip);

  const alerts = useMemo(() => (trip ? alertsByTripId[trip.id] ?? [] : []), [alertsByTripId, trip]);
  const recs = useMemo(() => (trip ? recsByTripId[trip.id] ?? [] : []), [recsByTripId, trip]);

  // Use CENTRALIZED status label — single source of truth across ALL screens.
  // The getTripStatus() function in tripStatus.ts handles all status derivation.
  // Do NOT override with custom logic here; use statusInfo.label everywhere.
  const dashboardStatusLabel = statusInfo.label;

  const greetingName = greetingFromEmailOrName(ticsDisplayName(user));
  const activeAlerts = alerts.filter((a) => a.active && !a.read).length;
  const urgentRecs = recs.filter((r) => r.urgency === 'high').length;
  const depIn = trip ? timeUntil(trip.departureTime) : null;

  const isCompletedOrCancelled = isCompleted || isCancelled;

  // Monitoring status for the dashboard card
  const monitoringStatus = useMemo(() => {
    if (!trip || isCompletedOrCancelled) return { label: 'Archived', color: '#64748B', bg: 'rgba(100,116,139,0.15)' };
    if (flight?.status === 'active') return { label: 'Airborne ✈', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' };
    if (trip.monitoringStatus === 'at_risk') return { label: 'Watch closely', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' };
    return { label: 'On Track', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' };
  }, [trip, isCompletedOrCancelled, flight]);

  // Static content — memoized so it doesn't re-render on every store change
  const staticFeatures = useMemo(() => (
    <>
      <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-amber ml-1">
        Why Users Love TICS
      </Text>
      <View className="flex-1 flex-row flex-wrap gap-3 justify-between mt-3">

        <Card className="p-3 rounded-3xl w-[48%] bg-tics-amber/25 border border-tics-amber/10">
          <View className="w-10 h-10 rounded-full bg-tics-blue/30 border border-tics-blue/20 items-center justify-center">
            <MaterialCommunityIcons name="reload" size={20} color="#3B82F6" />
          </View>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-tics-text py-2">
            Real-time
            Monitoring
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[11px] text-tics-muted">
            Stay updated live
          </Text>
        </Card>

        <Card className="p-3 rounded-3xl w-[48%] bg-tics-amber/25 border border-tics-amber/10">
          <View className="w-10 h-10 rounded-full bg-tics-amber/20 border border-tics-amber/20 items-center justify-center">
            <MaterialCommunityIcons name="bell-outline" size={20} color="#F59E0B" />
          </View>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-tics-text py-2">
            Proactive alerts
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[11px] text-tics-muted">
            Builds trust and habit
          </Text>
        </Card>

        <Card className="p-3 rounded-3xl w-[48%] bg-tics-amber/25 border border-tics-amber/10">
          <View className="w-10 h-10 rounded-full bg-tics-green/20 border border-tics-green/20 items-center justify-center">
            <Ionicons name="star" size={20} color="#22C55E" />
          </View>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-tics-text py-2">
            AI Recommendations
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[11px] text-tics-muted">
            Builds trust and habit
          </Text>
        </Card>

        <Card className="p-3 rounded-3xl w-[48%] bg-tics-amber/25 border border-tics-amber/10">
          <View className="w-10 h-10 rounded-full bg-tics-purple/25 border border-tics-purple/20 items-center justify-center">
            <MaterialIcons name="emoji-transportation" size={20} color="#8B5CF6" />
          </View>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[14px] text-tics-text py-2">
            Last Mile Coordination
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[11px] text-tics-muted">
            End-to-end coverage
          </Text>
        </Card>

      </View>
    </>
  ), []);

  return (
    <View className="flex-1 pt-10 pb-4">
      <View className="rounded-4xl bg-tics-amber/35 border border-tics-amber/20 p-5">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
                fontSize: 24,
              }}
              className="text-tics-text">{greeting},</Text>
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
                fontSize: 24,
              }}
              className="text-tics-text text-[26px] tracking-tight capitalize">{greetingName}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push('/alerts-center' as any)}
              style={{ width: 46, height: 46 }}
              className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
            >
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {activeAlerts > 0 && showLiveAlerts ? (
                <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-tics-red" />
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push('/profile' as any)}
              style={{ width: 46, height: 46 }}
              className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
            >
              <Ionicons name="person" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View>
          <Text
            style={{
              fontFamily: 'Syne_500Medium',
            }}
            className="text-tics-muted mt-1">
            Here's your travel overview
          </Text>
        </View>
      </View>

      <ScrollView className="px-2 mt-3" showsVerticalScrollIndicator={false}>
        {!uid ? (
          <Card accent="blue" className="py-6">
            <Text style={{
              fontFamily: 'Syne_500Medium',
            }} className="text-tics-amber text-[22px]">Welcome to TICS</Text>
            <Text style={{
              fontFamily: 'Syne_500Medium',
            }} className="mt-2 text-tics-muted text-[12px] leading-5">
              Sign in to create trips, receive real-time monitoring, disruption alerts, and smart recommendations.
            </Text>
            <View className="mt-5 flex-row gap-3">
              <Pressable onPress={() => router.push('/auth/login')} className="flex-1 items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20 px-5 py-4">
                <Text style={{
                  fontFamily: 'Syne_700Bold',
                }} className="text-center text-[14px] text-tics-text">Login</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/auth/register')}
                className="flex-1 rounded-full border border-[#96C7B3]/50 bg-white/[0.06] p-6"
              >
                <Text style={{
                  fontFamily: 'Syne_500Medium',
                }} className="text-center text-[14px] text-tics-text">Create Account</Text>
              </Pressable>
            </View>
          </Card>
        ) : activeTrips.length > 1 ? (
          /* Swipeable trip carousel - only active trips */
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              snapToInterval={PAGE_WIDTH}
              decelerationRate="fast"
              contentContainerStyle={{
                paddingHorizontal: 0,
              }}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / PAGE_WIDTH
                );
                setSelectedTripIndex(index);
              }}
              className="mt-2"
            >
              {activeTrips.map((t) => (
                <View
                  key={t.id}
                  style={{
                    width: PAGE_WIDTH,
                    justifyContent: "center",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: CARD_WIDTH,
                      marginHorizontal: CARD_GAP,
                    }}
                  >
                    <CarouselItem
                      t={t}
                      alertsByTripId={alertsByTripId}
                      recsByTripId={recsByTripId}
                      weatherStoreByTripId={weatherStoreByTripId}
                      flightStoreByTripId={flightStoreByTripId}
                      onPress={() => router.push(({ pathname: `/trips/${t.id}` } as any))}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Dot indicators */}
            {activeTrips.length > 1 && (
              <View className="flex-row justify-center gap-2 mt-3">
                {activeTrips.map((_, idx) => (
                  <View
                    key={idx}
                    style={{
                      width: idx === selectedTripIndex ? 24 : 8,
                      height: 8,
                      borderWidth: idx === selectedTripIndex ? 0 : 1,
                      borderColor: idx === selectedTripIndex ? "" : "rgb(150,199,179,0.5)",
                      borderRadius: 4,
                      backgroundColor: idx === selectedTripIndex ? 'rgba(150,199,179,0.55)' : 'rgba(148,163,184,0.3)',
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : trip ? (
          /* Single trip - show normal card */

          <Pressable
            onPress={() => router.push(({ pathname: `/trips/${trip.id}` } as any))}
            className="active:opacity-90 mt-1"
          >
            <Card accent={isCompletedOrCancelled ? 'none' : 'blue'} className="px-6 py-6 bg-tics-amber/25 border border-tics-amber/10 rounded-4xl ">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text
                    style={{ fontFamily: 'Syne_500Medium' }}
                    className={`text-[13px] font-semibold tracking-wide ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-blue'}`}>
                    {isCompletedOrCancelled ? 'COMPLETED TRIP' : 'ACTIVE TRIP'}</Text>

                  <View className="flex-row items-center justify-between">
                    <Text
                      style={{ fontFamily: 'Syne_600SemiBold' }}
                      className={`mt-2 text-[17px] ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-text'}`}>{trip.title}</Text>
                    <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: statusInfo.bgColor }}>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: statusInfo.color, fontSize: 11 }}>
                        {dashboardStatusLabel}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: 'Syne_500Medium',
                      borderBottomWidth: 1,
                      borderBottomColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.12)' : 'rgba(255,255,255,0.12)',
                      fontWeight: '300',
                    }}
                    className={`mt-2 pb-2 text-[12px] ${isCompletedOrCancelled ? 'text-tics-muted/60' : 'text-tics-muted'}`}>
                    {dateRange(trip.departureTime, trip.arrivalTime)}
                  </Text>

                  {/* Live mini-stats row — only for active trips */}
                  {showLiveTracking && (
                    <View style={{ flexDirection: 'row', justifyContent: "space-between", gap: 16, marginTop: 10 }}>
                      {depIn && (
                        <View>
                          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>DEPARTURE IN</Text>
                          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14, marginTop: 2 }}>{depIn}</Text>
                        </View>
                      )}
                      {weather?.tempC != null && (
                        <View>
                          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>DEST. WEATHER</Text>
                          <Text style={{ fontFamily: 'Syne_700Bold', color: '#FBBF24', fontSize: 14, marginTop: 2 }}>{Math.round(weather.tempC)}°C</Text>
                        </View>
                      )}
                      {flight?.gate && (
                        <View>
                          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 10 }}>GATE</Text>
                          <Text style={{ fontFamily: 'Syne_700Bold', color: '#60A5FA', fontSize: 14, marginTop: 2 }}>{flight.gate}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Completed trip summary */}
                  {isCompletedOrCancelled && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748B', fontSize: 12 }}>
                        {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          </Pressable>
        ) : (
          <Card accent="purple" className="py-6">
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
              }}
              className="text-tics-text text-[22px]">Add your trip</Text>
            <Text
              style={{
                fontFamily: 'Syne_500Medium',
                fontSize: 13,
              }}
              className="mt-2 text-tics-muted text-[12px] leading-5">
              Sync from email, import a booking, or enter manually to unlock monitoring.
            </Text>
            <Pressable
              onPress={() => router.push('/trip/add' as any)} className="mt-5 rounded-full p-6 bg-tics-amber/35 border border-tics-amber/20">
              <Text
                style={{
                  fontFamily: 'Syne_700Bold',
                }}
                className="text-center text-[13px] text-white">Add Trip</Text>
            </Pressable>
          </Card>
        )}

        {trip ? (
          <Card accent="none" className="mt-5">
            <View className="flex-1 flex-row flex-wrap justify-between gap-3">
              {/* Trip Status card — always visible */}

              <Pressable
                style={{ width: '48%' }}
                onPress={() => router.push(({ pathname: `/trips/${trip.id}` } as any))}
                className="active:opacity-90">
                <View className="flex-row items-center rounded-3xl bg-tics-amber/25 border border-tics-amber/10 px-3 py-3">
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Syne_500Medium', fontWeight: '500' }} className="text-tics-text self-start text-[13px]">Trip Status</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', backgroundColor: statusInfo.bgColor, borderWidth: 1, borderColor: statusInfo.bgColor, color: statusInfo.color }} className="mt-3 self-start py-1 px-2 rounded-full text-[12px]" numberOfLines={1}>
                      {dashboardStatusLabel}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {[
                {
                  key: 'monitoring',
                  icon: 'pulse' as const,
                  label: 'Monitoring',
                  status: isCompletedOrCancelled ? 'Archived' : monitoringStatus.label,
                  statusColor: isCompletedOrCancelled ? 'rgba(150,199,179,0.6)' : monitoringStatus.color,
                  statusBg: isCompletedOrCancelled ? 'rgba(150,199,179,0.4)' : monitoringStatus.bg,
                  onPress: () => canMonitor ? router.push(({ pathname: `/monitoring/${trip.id}` } as any)) : router.push(({ pathname: `/trips/${trip.id}` } as any)),
                  disabled: isCompletedOrCancelled,
                },
                {
                  key: 'alerts',
                  icon: 'warning' as const,
                  label: 'Alerts',
                  status: isCompletedOrCancelled ? 'Archived' : activeAlerts > 0 ? `${activeAlerts} active` : 'All clear',
                  statusColor: isCompletedOrCancelled ? 'rgba(150,199,179,0.6)' : activeAlerts > 0 ? '#EF4444' : '#22C55E',
                  statusBg: isCompletedOrCancelled ? 'rgba(150,199,179,0.4)' : activeAlerts > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
                  onPress: () => router.push('/alerts-center' as any),
                },
                {
                  key: 'recs',
                  icon: 'sparkles' as const,
                  label: 'Intelligence',
                  status: isCompletedOrCancelled
                    ? 'Archived'
                    : urgentRecs > 0
                      ? `${urgentRecs} urgent`
                      : recs.length > 0
                        ? `${recs.length} insight${recs.length > 1 ? 's' : ''}`
                        : 'No insights yet',
                  statusColor: isCompletedOrCancelled ? 'rgba(150,199,179,0.6)' : urgentRecs > 0 ? '#EF4444' : recs.length > 0 ? '#22C55E' : '#94a3b8',
                  statusBg: isCompletedOrCancelled ? 'rgba(150,199,179,0.4)' : urgentRecs > 0 ? 'rgba(239,68,68,0.15)' : recs.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.08)',
                  onPress: () => router.push('/recommendations' as any),
                },
                {
                  key: 'lastmile',
                  icon: 'car' as const,
                  label: 'Last Mile',
                  status: isCompletedOrCancelled
                    ? 'Completed'
                    : trip.lastMileStatus === 'none'
                      ? 'Plan pickup'
                      : trip.lastMileStatus === 'in_progress'
                        ? 'En route'
                        : 'Arranged',
                  statusColor: isCompletedOrCancelled ? 'rgba(150,199,179,0.6)' : trip.lastMileStatus === 'none' ? '#F59E0B' : '#A855F7',
                  statusBg: isCompletedOrCancelled ? 'rgba(150,199,179,0.4)' : trip.lastMileStatus === 'none' ? 'rgba(245,158,11,0.15)' : 'rgba(168,85,247,0.15)',
                  onPress: () => isCompletedOrCancelled ? router.push(({ pathname: `/trips/${trip.id}` } as any)) : router.push(({ pathname: `/last-mile/${trip.id}` } as any)),
                },
              ].map((row) => (
                <Pressable
                  style={{ width: '48%' }}
                  key={row.key}
                  onPress={row.onPress}
                  className="active:opacity-90"
                >
                  <View className="flex-row items-center rounded-3xl bg-tics-amber/25 border border-tics-amber/10 pl-3 pr-2 py-3">
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Syne_500Medium', fontWeight: '500' }} className={`text-[13px] font-extrabold ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-text'}`}>{row.label}</Text>
                      <Text
                        style={{ fontFamily: 'Syne_500Medium', backgroundColor: row.statusBg, borderWidth: 1, borderColor: row.statusBg, color: row.statusColor }}
                        className="mt-3 py-1 px-2 self-start rounded-full text-[12px]"
                        numberOfLines={1}
                      >{row.status}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : (
          <View>
            <PopularDestinations />
          </View>
        )}

        <View className="mt-5">
          {staticFeatures}
        </View>
      </ScrollView>
    </View>
  );
}