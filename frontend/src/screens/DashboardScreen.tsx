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
import { useMemo, useState, memo, useEffect } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import Card from '@/src/components/Card';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useRecommendationStore } from '@/src/store/recommendationStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import { useRideTrackingStore } from '@/src/store/rideTrackingStore';
import { listenToAssignment } from '@/src/services/RideStatusService';
import { listenToActiveOperator } from '@/src/services/OperatorService';
import { greetingFromEmailOrName, ticsDisplayName } from '@/src/utils/displayName';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useTripType } from '@/src/hooks/useTripType';
import { getTripStatus } from '@/src/utils/tripStatus';
import PopularDestinations from '@/src/components/PopularDestinations';
import DestinationInsights from '@/src/components/DestinationInsights';
import { SafeText } from '@/src/components/responsive/SafeText';

const CONTENT_PADDING = 16; // px-2 on both sides

// Carousel item component - hooks are called at the top level, not inside map
const CarouselItem = memo(function CarouselItem({ t, alertsByTripId, recsByTripId, weatherStoreByTripId, flightStoreByTripId, onPress }: any) {
  const tripAlerts = alertsByTripId[t.id] ?? [];
  const tripRecs = recsByTripId[t.id] ?? [];
  const tripWeather = weatherStoreByTripId[t.id] ?? null;
  const tripFlight = flightStoreByTripId[t.id] ?? null;
  const { isCompleted, isCancelled, statusInfo } = useTripStatus(t, tripAlerts);
  const { isLocal } = useTripType(t);
  const isCompletedOrCancelled = isCompleted || isCancelled;
  const activeAlerts = tripAlerts.filter((a: any) => a.active && !a.read).length;
  const urgentRecs = tripRecs.filter((r: any) => r.urgency === 'high').length;
  const depIn = t ? timeUntil(t.departureTime) : null;

  // Calculate trip progress percentage
  const tripProgress = useMemo(() => {
    if (!t.departureTime || !t.arrivalTime) return 0;
    const now = Date.now();
    const dep = Date.parse(t.departureTime);
    const arr = Date.parse(t.arrivalTime);
    if (now <= dep) return 0;
    if (now >= arr) return 100;
    return Math.round(((now - dep) / (arr - dep)) * 100);
  }, [t.departureTime, t.arrivalTime]);

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
              <SafeText
                style={{ fontFamily: 'ShareTech_400Regular' }}
                className="text-tics-blue text-[13px] font-semibold tracking-wide">ACTIVE TRIP</SafeText>

              <View className="flex-row items-center justify-between">
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-2 text-[17px] text-tics-text">{t.title}</SafeText>
                <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.bg }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: colors.text, fontSize: 11 }}>
                    {colors.label}
                  </SafeText>
                </View>
              </View>

              <SafeText style={{ fontSize: 13, fontFamily: 'ShareTech_400Regular', borderBottomWidth: 1, borderBottomColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.12)' : 'rgba(255,255,255,0.12)', fontWeight: '300' }} className={`mt-2 pb-2 text-[12px] ${isCompletedOrCancelled ? 'text-tics-muted/60' : 'text-tics-muted'}`}>
                {dateRange(t.departureTime, t.arrivalTime)}
              </SafeText>

              {/* Live mini-stats row — only for active trips */}
              {!isCompletedOrCancelled && (
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                  {depIn && (
                    <View>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>
                        {depIn.startsWith('Departed') ? 'DEPARTED' : 'DEPARTURE IN'}
                      </SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: depIn.startsWith('Departed') ? '#F59E0B' : '#f8fafc', fontSize: 14, marginTop: 2 }}>{depIn}</SafeText>
                    </View>
                  )}
                  {tripWeather?.tempC != null && (
                    <View>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>DEST. WEATHER</SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#FBBF24', fontSize: 14, marginTop: 2 }}>{Math.round(tripWeather.tempC)}°C</SafeText>
                    </View>
                  )}
                  {tripFlight?.gate && (
                    <View>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>GATE</SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 14, marginTop: 2 }}>{tripFlight.gate}</SafeText>
                    </View>
                  )}
                </View>
              )}

              {/* Trip progress bar */}
              {!isCompletedOrCancelled && depIn && (
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 9 }}>
                      {depIn.startsWith('Departed') ? 'In progress' : 'Not yet started'}
                    </SafeText>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 9 }}>
                      {tripProgress}%
                    </SafeText>
                  </View>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ 
                      height: '100%', 
                      width: `${Math.min(tripProgress, 100)}%`, 
                      backgroundColor: tripProgress > 0 ? '#22C55E' : '#3B82F6',
                      borderRadius: 2,
                    }} />
                  </View>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 9, marginTop: 4 }}>
                    {t.departureTime && t.arrivalTime
                      ? `${new Date(t.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${new Date(t.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </SafeText>
                </View>
              )}

              {/* Completed trip summary */}
              {isCompletedOrCancelled && (
                <View style={{ marginTop: 10 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748B', fontSize: 12 }}>
                    {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                  </SafeText>
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
  const now = Date.now();
  const depTime = Date.parse(isoStr);
  const ms = depTime - now;
  if (ms <= 0) {
    // Departed — show time since departure
    const elapsed = now - depTime;
    const h = Math.floor(elapsed / 3_600_000);
    const m = Math.floor((elapsed % 3_600_000) / 60_000);
    if (h >= 24) return `Departed ${Math.floor(h / 24)}d ago`;
    if (h > 0) return `Departed ${h}h ${m}m ago`;
    return `Departed ${m}m ago`;
  }
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
  const userDoc = useUserDocStore((s) => s.doc);
  const trips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const [selectedTripIndex, setSelectedTripIndex] = useState(0);

  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const recsByTripId = useRecommendationStore((s) => s.byTripId);
  const weatherStoreByTripId = useWeatherStore((s) => s.byTripId);
  const flightStoreByTripId = useFlightMonitoringStore((s) => s.byTripId);
  const rideAssignment = useRideTrackingStore((s) => s.assignment);
  const [activeOperator, setActiveOperator] = useState<{ id: string; operatorId: string; operatorName?: string } | null>(null);

  // Sort trips: most recent first (by departure time DESC)
  const sortedTrips = useMemo(() => {
    if (!trips.length) return [];
    return [...trips].sort((a, b) => {
      const aTime = a.departureTime ? new Date(a.departureTime).getTime() : 0;
      const bTime = b.departureTime ? new Date(b.departureTime).getTime() : 0;
      return bTime - aTime;
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

  // Split display vs reference trip:
  //   displayTrip — only active trips shown in the card area; null when no active trips
  //   latestTrip — the most recent trip overall, used by quick actions even if completed
  const displayTrip = activeTrips[selectedTripIndex] ?? null;
  const latestTrip = sortedTrips[0] ?? null;
  // Use displayTrip for the card rendering and monitoring cards
  const trip = displayTrip;
  const weather = useMemo(() => (trip ? weatherStoreByTripId[trip.id] ?? null : null), [trip?.id, weatherStoreByTripId]);
  const flight = useMemo(() => (trip ? flightStoreByTripId[trip.id] ?? null : null), [trip?.id, flightStoreByTripId]);

  // Calculate trip progress percentage for the single trip card
  const tripProgress = useMemo(() => {
    if (!trip?.departureTime || !trip?.arrivalTime) return 0;
    const now = Date.now();
    const dep = Date.parse(trip.departureTime);
    const arr = Date.parse(trip.arrivalTime);
    if (now <= dep) return 0;
    if (now >= arr) return 100;
    return Math.round(((now - dep) / (arr - dep)) * 100);
  }, [trip?.departureTime, trip?.arrivalTime]);

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

  // Listen to active operator for the current trip
  useEffect(() => {
    if (!uid || !trip?.id) return;
    const unsub = listenToActiveOperator(uid, trip.id, (op) => {
      setActiveOperator(op ? { id: op.id, operatorId: op.operatorId, operatorName: op.operatorName } : null);
    });
    return () => { unsub(); };
  }, [uid, trip?.id]);

  // Listen to ride assignment for the current trip
  useEffect(() => {
    if (!uid || !trip?.id) return;
    const unsub = listenToAssignment(uid, trip.id, (snap) => {
      if (snap) {
        useRideTrackingStore.getState().setAssignment(snap.id, snap.data);
      } else {
        useRideTrackingStore.getState().clearAssignment();
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [uid, trip?.id]);

  // Trip type classification
  const { isLocal: isLocalTrip } = useTripType(trip);
  const isLastMileApplicable = !isLocalTrip; // Local trips are road trips — no last-mile needed

  // Use CENTRALIZED status label — single source of truth across ALL screens.
  // The getTripStatus() function in tripStatus.ts handles all status derivation.
  // Do NOT override with custom logic here; use statusInfo.label everywhere.
  const dashboardStatusLabel = statusInfo.label;

  const greetingName = greetingFromEmailOrName(ticsDisplayName(user));
  const profilePhotoURL = (userDoc as any)?.photoURL ?? null;
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

  // Quick Actions — replaces the old "Why Users Love TICS" section
  // Uses latestTrip (not displayTrip) so they reference the latest completed trip when no active trip
  const quickActions = useMemo(() => {
    const refTrip = latestTrip; // reference trip for navigation
    const actions = [
      {
        key: 'add-trip',
        icon: 'plus-circle-outline' as const,
        iconFamily: 'MaterialCommunityIcons' as const,
        label: 'Add Trip',
        subtitle: 'Sync or enter manually',
        color: '#3B82F6',
        bgColor: 'rgba(59,130,246,0.15)',
        onPress: () => router.push('/trip/add' as any),
        disabled: !uid,
      },
      {
        key: 'contact-operator',
        icon: 'headset' as const,
        iconFamily: 'MaterialCommunityIcons' as const,
        label: 'Contact Operator',
        subtitle: 'Get help & support',
        color: '#F59E0B',
        bgColor: 'rgba(245,158,11,0.15)',
        onPress: () => {
          if (refTrip) {
            router.push(({ pathname: `/last-mile/operator-details`, params: { tripId: refTrip.id } } as any));
          } else {
            router.push('/operator/select' as any);
          }
        },
        disabled: !uid,
      },
      {
        key: 'last-mile',
        icon: 'car' as const,
        iconFamily: 'MaterialCommunityIcons' as const,
        label: 'Last Mile',
        subtitle: 'Request a ride',
        color: '#22C55E',
        bgColor: 'rgba(34,197,94,0.15)',
        onPress: () => {
          if (refTrip) {
            router.push(({ pathname: `/last-mile/${refTrip.id}` } as any));
          } else {
            router.push('/trip/add' as any);
          }
        },
        disabled: !uid,
      },
      {
        key: 'recovery-trip',
        icon: 'shield-check' as const,
        iconFamily: 'MaterialCommunityIcons' as const,
        label: 'Recovery Trip',
        subtitle: 'Handle disruptions',
        color: '#EF4444',
        bgColor: 'rgba(239,68,68,0.15)',
        onPress: () => {
          if (refTrip) {
            router.push(({ pathname: `/operator/recovery-trip/${refTrip.id}` } as any));
          } else {
            router.push('/trip/add' as any);
          }
        },
        disabled: !uid,
      },
    ];

    return (
      <>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-amber ml-1">
          Quick Actions
        </SafeText>
        <View className="flex-row flex-wrap gap-3 justify-between mt-3">
          {actions.map((action) => {
            const IconComponent = action.iconFamily === 'MaterialCommunityIcons' ? MaterialCommunityIcons : Ionicons;
            return (
              <Pressable
                key={action.key}
                style={{ width: '48%' }}
                onPress={action.onPress}
                disabled={action.disabled}
                className="active:opacity-90"
              >
                <View
                  className={`p-3 rounded-3xl bg-tics-amber/35 border border-tics-amber/20 ${action.disabled ? 'opacity-50' : ''}`}
                  style={{
                    borderWidth: 1,
                    borderColor: action.bgColor.replace('0.15', '0.1'),
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: action.color.replace(')', ',0.2)').replace('rgb', 'rgba'),
                    }}
                  >
                    <IconComponent name={action.icon as any} size={20} color="#fff" />
                  </View>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[14px] text-tics-text py-2">
                    {action.label}
                  </SafeText>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[11px] text-tics-muted">
                    {action.subtitle}
                  </SafeText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }, [uid, latestTrip, router]);

  return (
    <View className="flex-1 pb-4 p-1">
      <View className="rounded-4xl bg-tics-amber/35 border border-tics-amber/20 p-5">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                fontSize: 24,
              }}
              className="text-tics-text">{greeting},</SafeText>
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                fontSize: 24,
              }}
              className="text-tics-text text-[26px] tracking-tight capitalize">{greetingName}</SafeText>
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
              className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20 overflow-hidden"
            >
              {profilePhotoURL ? (
                <View style={{ width: 46, height: 46, overflow: 'hidden' }}>
                  <Image source={{ uri: profilePhotoURL }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ) : (
                <Ionicons name="person" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
        <View>
          <SafeText
            style={{
              fontFamily: 'ShareTech_400Regular',
            }}
            className="text-tics-muted mt-1">
            Here's your travel overview
          </SafeText>
        </View>
      </View>

      <ScrollView className="px-1 mt-3" showsVerticalScrollIndicator={false}>
        {!uid ? (
          <Card accent="blue" className="py-6">
            <SafeText style={{
              fontFamily: 'ShareTech_400Regular',
            }} className="text-tics-amber text-[22px]">Welcome to TICS</SafeText>
            <Text style={{
              fontFamily: 'ShareTech_400Regular',
            }} className="mt-2 text-tics-muted text-[12px] leading-5">
              Sign in to create trips, receive real-time monitoring, disruption alerts, and smart recommendations.
            </Text>
            <View className="mt-5 flex-row gap-3">
              <Pressable onPress={() => router.push('/auth/login')} className="flex-1 items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20 px-5 py-4">
                <SafeText style={{
                  fontFamily: 'ShareTech_400Regular',
                }} className="text-center text-[14px] text-tics-text">Login</SafeText>
              </Pressable>
              <Pressable
                onPress={() => router.push('/auth/register')}
                className="flex-1 rounded-full border border-tics-amber/50 bg-white/[0.06] p-6"
              >
                <SafeText style={{
                  fontFamily: 'ShareTech_400Regular',
                }} className="text-center text-[14px] text-tics-text">Create Account</SafeText>
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
                  <SafeText
                    style={{ fontFamily: 'ShareTech_400Regular' }}
                    className={`text-[13px] font-semibold tracking-wide ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-blue'}`}>
                    {isCompletedOrCancelled ? 'COMPLETED TRIP' : 'ACTIVE TRIP'}</SafeText>

                  <View className="flex-row items-center justify-between">
                    <SafeText
                      style={{ fontFamily: 'ShareTech_400Regular' }}
                      className={`mt-2 text-[17px] ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-text'}`}>{trip.title}</SafeText>
                    <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: statusInfo.bgColor }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: statusInfo.color, fontSize: 11 }}>
                        {dashboardStatusLabel}
                      </SafeText>
                    </View>
                  </View>

                  <SafeText
                    style={{
                      fontSize: 13,
                      fontFamily: 'ShareTech_400Regular',
                      borderBottomWidth: 1,
                      borderBottomColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.12)' : 'rgba(255,255,255,0.12)',
                      fontWeight: '300',
                    }}
                    className={`mt-2 pb-2 text-[12px] ${isCompletedOrCancelled ? 'text-tics-muted/60' : 'text-tics-muted'}`}>
                    {dateRange(trip.departureTime, trip.arrivalTime)}
                  </SafeText>

                  {/* Live mini-stats row — only for active trips */}
                  {showLiveTracking && (
                    <View style={{ flexDirection: 'row', justifyContent: "space-between", gap: 16, marginTop: 10 }}>
                      {depIn && (
                        <View>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>
                            {depIn.startsWith('Departed') ? 'DEPARTED' : 'DEPARTURE IN'}
                          </SafeText>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: depIn.startsWith('Departed') ? '#F59E0B' : '#f8fafc', fontSize: 14, marginTop: 2 }}>{depIn}</SafeText>
                        </View>
                      )}
                      {weather?.tempC != null && (
                        <View>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>DEST. WEATHER</SafeText>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#FBBF24', fontSize: 14, marginTop: 2 }}>{Math.round(weather.tempC)}°C</SafeText>
                        </View>
                      )}
                      {flight?.gate && (
                        <View>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 10 }}>GATE</SafeText>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 14, marginTop: 2 }}>{flight.gate}</SafeText>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Trip progress bar */}
                  {showLiveTracking && !isCompletedOrCancelled && depIn && (
                    <View style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 9 }}>
                          {depIn.startsWith('Departed') ? 'In progress' : 'Not yet started'}
                        </SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 9 }}>
                          {tripProgress}%
                        </SafeText>
                      </View>
                      <View className='rounded-full' style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)',overflow: 'hidden' }}>
                        <View
                        className='rounded-full'
                         style={{ 
                          height: '100%', 
                          width: `${Math.min(tripProgress, 100)}%`, 
                          backgroundColor: tripProgress > 0 ? '#22C55E' : '#3B82F6',
                        }} />
                      </View>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 9, marginTop: 4 }}>
                        {trip.departureTime && trip.arrivalTime
                          ? `${new Date(trip.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${new Date(trip.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </SafeText>
                    </View>
                  )}

                  {/* Completed trip summary */}
                  {isCompletedOrCancelled && (
                    <View style={{ marginTop: 10 }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748B', fontSize: 12 }}>
                        {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                      </SafeText>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          </Pressable>
        ) : (
          <Card accent="purple" className="py-6">
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
              }}
              className="text-tics-amber ml-1 text-[22px]">Add your trip</SafeText>
            <SafeText
              style={{
                fontFamily: 'ShareTech_400Regular',
                fontSize: 13,
              }}
              className="mt-2 ml-1 text-tics-muted text-[12px] leading-5">
              Sync from email, import a booking, or enter manually to unlock monitoring.
            </SafeText>
            <Pressable
              onPress={() => router.push('/trip/add' as any)} className="mt-5 rounded-full p-6 bg-tics-amber/35 border border-tics-amber/20">
              <SafeText
                style={{
                  fontFamily: 'ShareTech_400Regular',
                }}
                className="text-center text-[13px] text-white">Add Trip</SafeText>
            </Pressable>
          </Card>
        )}

        {trip ? (
          <Card accent="none" className="mt-5">
            <View className="flex-row flex-wrap justify-between gap-3">
              {/* Trip Status card — always visible */}

              {/* <Pressable
                style={{ width: '48%' }}
                onPress={() => router.push(({ pathname: `/trips/${trip.id}` } as any))}
                className="active:opacity-90">
                <View className="flex-row items-center rounded-3xl bg-tics-amber/25 border border-tics-amber/10 px-3 py-3">
                  <View className="flex-1">
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontWeight: '500' }} className="text-tics-text self-start text-[13px]">Trip Status</SafeText>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', backgroundColor: statusInfo.bgColor, borderWidth: 1, borderColor: statusInfo.bgColor, color: statusInfo.color }} className="mt-3 self-start py-1 px-2 rounded-full text-[12px]" numberOfLines={1}>
                      {dashboardStatusLabel}
                    </SafeText>
                  </View>
                </View>
              </Pressable> */}

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
                  status: isLocalTrip
                    ? 'Road trip'
                    : isCompletedOrCancelled
                      ? 'Completed'
                      : !activeOperator
                        ? 'No operator'
                        : !rideAssignment?.driverId
                          ? 'Not arranged'
                          : 'Arranged',
                  statusColor: isLocalTrip ? '#22C55E' : isCompletedOrCancelled ? 'rgba(150,199,179,0.6)' : !activeOperator ? '#EF4444' : !rideAssignment?.driverId ? '#F59E0B' : '#22C55E',
                  statusBg: isLocalTrip ? 'rgba(34,197,94,0.1)' : isCompletedOrCancelled ? 'rgba(150,199,179,0.4)' : !activeOperator ? 'rgba(239,68,68,0.15)' : !rideAssignment?.driverId ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.1)',
                  onPress: () => isLocalTrip
                    ? router.push(({ pathname: `/trips/${trip.id}` } as any))
                    : isCompletedOrCancelled
                      ? router.push(({ pathname: `/trips/${trip.id}` } as any))
                      : router.push(({ pathname: `/last-mile/${trip.id}` } as any)),
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
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontWeight: '500' }} className={`text-[13px] font-extrabold ${isCompletedOrCancelled ? 'text-tics-muted' : 'text-tics-text'}`}>{row.label}</SafeText>
                      <SafeText
                        style={{ fontFamily: 'ShareTech_400Regular', backgroundColor: row.statusBg, borderWidth: 1, borderColor: row.statusBg, color: row.statusColor }}
                        className="mt-3 py-1 px-2 self-start rounded-full text-[12px]"
                        numberOfLines={1}
                      >{row.status}</SafeText>
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
          <DestinationInsights />
        </View>

        <View className="mt-5">
          {quickActions}
        </View>
      </ScrollView>
    </View>
  );
}
