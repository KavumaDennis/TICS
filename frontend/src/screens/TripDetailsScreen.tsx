/**
 * TripDetailsScreen — tab-filtered single screen with centralized trip status.
 *
 * Completed trips:
 *  - Replace "On Track" with "Completed"
 *  - Disable live monitoring state
 *  - Stop showing active flight tracking
 *  - Stop showing "Monitoring active"
 *  - Stop real-time banners
 *  - Show "Trip completed successfully"
 *  - Timeline shows: departed → arrived → completed
 */
import { Fontisto, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { STATUS_META } from '@/src/utils/tripStatus';
import DestinationCarousel from '@/src/components/DestinationCarousel';

type Tab = 'overview' | 'flights' | 'connections';

function toCode(v?: string): string {
  if (!v) return '---';
  const first = v.trim().split(/\s+/)[0] ?? '';
  if (/^[A-Z]{3}$/.test(first)) return first;
  return v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, '-') || '---';
}

export default function TripDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');

  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(() => trips.find((t) => t.id === id) ?? null, [id, trips]);
  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const alerts = useMemo(() => (trip ? alertsByTripId[trip.id] ?? [] : []), [trip?.id, alertsByTripId[trip?.id ?? '']]);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  // Centralized trip status - pass alerts explicitly to avoid store subscription
  const {
    statusInfo,
    label,
    isCompleted,
    isCancelled,
    isDelayed,
    canMonitor,
    showLiveTracking,
    showLiveAlerts,
  } = useTripStatus(trip, alerts);

  const isCompletedOrCancelled = isCompleted || isCancelled;
  const activeAlert = useMemo(() => alerts.find((a) => a.active && !a.read && showLiveAlerts) ?? null, [alerts, showLiveAlerts]);

  if (!trip) {
    return (
      <View className="flex-1 px-6" style={{ paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20 mb-4">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[14px]">Trip not found</Text>
      </View>
    );
  }

  function TabPill({ id: tabId, label: tabLabel }: { id: Tab; label: string }) {
    const active = tab === tabId;
    return (
      <Pressable
        onPress={() => setTab(tabId)}
        style={{
          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 99,
        }}
        className={`${active ? "bg-tics-amber/35 border border-tics-amber/20" : ""} border border-tics-amber/20`}
      >
        <Text style={{ fontFamily: 'Syne_500Medium', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.9)' }}>
          {tabLabel}
        </Text>
      </Pressable>
    );
  }

  // Status badge logic - use centralized statusInfo
  const statusBadge = useMemo(() => {
    return {
      label: statusInfo.label,
      color: statusInfo.color,
      bg: statusInfo.bgColor,
    };
  }, [statusInfo]);

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-[17px] text-tics-text" numberOfLines={1}>{trip.title}</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
            {trip.flightNumber ?? ''}{trip.airline ? ` · ${trip.airline}` : ''}
          </Text>
        </View>
        {canMonitor && (
          <Pressable
            onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
          >
            <Ionicons name="pulse" size={17} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* In-page tab filters — NOT navigation links */}
      <View className="flex-row gap-2 px-2 pb-4">
        <TabPill id="overview" label="Overview" />
        <TabPill id="flights" label="Flights" />
        <TabPill id="connections" label="Connections" />
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8 }} showsVerticalScrollIndicator={false}>

          {/* ═══ OVERVIEW TAB ═══ */}
          {tab === 'overview' && (
            <>
              {/* Flight summary */}
              <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    {trip.flightNumber ? <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{trip.flightNumber}</Text> : null}
                    {trip.airline ? <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{trip.airline}</Text> : null}
                  </View>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: statusBadge.bg }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', fontSize: 11, color: statusBadge.color }}>
                      {statusBadge.label}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 26 }}>{toCode(trip.from)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>{trip.from}</Text>
                  </View>
                  <Fontisto name="plane" size={18} color={isCompletedOrCancelled ? '#64748B' : '#3B82F6'} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 26 }}>{toCode(trip.to)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>{trip.to}</Text>
                  </View>
                </View>

                {isCompletedOrCancelled && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748B', fontSize: 13, textAlign: 'center' }}>
                      {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                    </Text>
                  </View>
                )}

                <View style={{ borderTopWidth: 1, borderTopColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.2)' : 'rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Departure</Text>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 17, marginTop: 4 }}>
                      {new Date(trip.departureTime).toLocaleString([], { timeStyle: 'short' })}
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      {new Date(trip.departureTime).toLocaleString([], { dateStyle: 'medium' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Arrival</Text>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 17, marginTop: 4 }}>
                      {new Date(trip.arrivalTime).toLocaleString([], { timeStyle: 'short' })}
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      {new Date(trip.arrivalTime).toLocaleString([], { dateStyle: 'medium' })}
                    </Text>
                  </View>
                </View>
              </View>

              {showLiveTracking && (
                <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} style={{ opacity: 1 }}>
                  <View
                    className="border border-[#96C7B3]/50 bg-white/[0.06] rounded-4xl"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Ionicons name="partly-sunny" size={18} color="#FBBF24" />
                      <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 11 }}>WEATHER AT DESTINATION</Text>
                    </View>
                    {weather ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 22 }}>
                            {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : '—'}
                          </Text>
                          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 3 }}>
                            {weather.description ?? ''}{weather.label ? ` · ${weather.label}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="rgba(248,250,252,0.3)" />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12 }}>
                        Tap refresh on monitoring screen to load weather
                      </Text>
                    )}
                  </View>
                </Pressable>
              )}

              <Pressable onPress={() => router.push('/alerts-center' as any)}>
                <View
                  style={{
                    borderWidth: activeAlert ? 0 : 1,
                    borderColor: activeAlert ? '' : 'rgb(150 199 179 / 0.5)',
                    backgroundColor: activeAlert ? 'rgba(239,68,68,0.30)' : isCompletedOrCancelled ? 'rgba(100,116,139,0.10)' : 'rgba(255,255,255,0.06)',
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                  className="rounded-full"
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeAlert ? '#EF4444' : isCompletedOrCancelled ? '#64748B' : 'rgba(255,255,255,0.3)' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: activeAlert ? '#EF4444' : isCompletedOrCancelled ? '#64748B' : '#94a3b8', fontSize: 14 }}>
                      {activeAlert ? activeAlert.title : isCompletedOrCancelled ? 'No active alerts' : 'No active alerts'}
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 3 }} numberOfLines={2}>
                      {activeAlert
                        ? activeAlert.message
                        : isCompletedOrCancelled
                          ? 'This trip has been completed.'
                          : 'Monitoring is running for this trip.'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(248,250,252,0.25)" />
                </View>
              </Pressable>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/timeline/${trip.id}` as any)}>
                  <View className="rounded-full p-6 bg-tics-amber/35 border border-tics-amber/20" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Ionicons name="timer-outline" size={18} color="#fff" />
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 13 }}>Timeline</Text>
                  </View>
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(({ pathname: `/bookings/${trip.id}` } as any))}>
                  <View className="border border-[#96C7B3]/50 bg-white/[0.06] rounded-full p-6" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Ionicons name="document-text-outline" size={18} color="rgba(248,250,252,0.8)" />
                    <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(248,250,252,0.8)', fontSize: 13 }}>Bookings</Text>
                  </View>
                </Pressable>
              </View>
            </>
          )}

          {/* ═══ FLIGHTS TAB ═══ */}
          {tab === 'flights' && (
            <View style={{ gap: 12 }}>
              <View style={{ padding: 18 }}
                className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10">
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: isCompletedOrCancelled ? '#64748B' : '#60A5FA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>
                  {isCompletedOrCancelled ? 'FLIGHT SUMMARY' : 'LIVE FLIGHT DATA'}
                </Text>
                {[
                  { label: 'Flight', value: trip.flightNumber ?? '—' },
                  { label: 'Airline', value: trip.airline ?? '—' },
                  {
                    label: 'Status',
                    value: isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : flight?.status ? flight.status.charAt(0).toUpperCase() + flight.status.slice(1) : 'Scheduled',
                    color: isCompleted ? '#64748B' : isCancelled ? '#EF4444' : flight?.status === 'active' ? '#22C55E' : flight?.status === 'canceled' ? '#EF4444' : '#94a3b8',
                  },
                  { label: 'Gate', value: showLiveTracking && flight?.gate ? flight.gate : '—', color: flight?.gate ? '#60A5FA' : undefined },
                  { label: 'Terminal', value: showLiveTracking && flight?.terminal ? flight.terminal : '—', color: flight?.terminal ? '#A78BFA' : undefined },
                  {
                    label: 'Delay',
                    value: showLiveTracking && flight?.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None',
                    color: flight?.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E',
                  },
                ].map((row, i) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < 5 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{row.label}</Text>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: row.color ?? '#f8fafc', fontSize: 13 }}>{row.value}</Text>
                  </View>
                ))}

                {isCompletedOrCancelled && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748B', fontSize: 12, lineHeight: 18 }}>
                      {isCompleted ? 'This flight has been completed. View the timeline for the full journey.' : 'This flight was cancelled.'}
                    </Text>
                  </View>
                )}
              </View>
              {canMonitor && (
                <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
                  <View className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-6" style={{ alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 13 }}>Open full monitoring</Text>
                  </View>
                </Pressable>
              )}
            </View>
          )}

          {/* ═══ CONNECTIONS TAB ═══ */}
          {tab === 'connections' && (
            <View style={{ gap: 12 }}>
              <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 18 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: isCompletedOrCancelled ? '#64748B' : '#A78BFA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>ROUTE</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 22 }}>{toCode(trip.from)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                      {new Date(trip.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={{ flex: 1, height: 1, backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.3)' : 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                  <Ionicons name="airplane" size={16} color={isCompletedOrCancelled ? '#64748B' : '#8B5CF6'} />
                  <View style={{ flex: 1, height: 1, backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.3)' : 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 22 }}>{toCode(trip.to)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                      {new Date(trip.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
                  {Array.isArray(trip.timeline) && trip.timeline.length > 1 ? 'Multi-leg route' : 'Direct flight'}
                </Text>
              </View>

              {Array.isArray(trip.timeline) && trip.timeline.length > 0 ? (
                trip.timeline.map((step: any, i: number) => (
                  <View key={i} className="rounded-4xl" style={{ borderWidth: 1, borderColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.15)' : 'rgba(255,255,255,0.08)', backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.04)' : 'rgba(255,255,255,0.04)', padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Ionicons name="ellipse" size={8} color={isCompletedOrCancelled ? '#64748B' : '#8B5CF6'} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Syne_600SemiBold', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 13 }}>{step.label}</Text>
                      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        {new Date(step.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View className="rounded-full" style={{ borderWidth: 1, borderColor: isCompletedOrCancelled ? 'rgba(150, 199, 179, 0.5)' : 'rgba(255,255,255,0.08)', backgroundColor: isCompletedOrCancelled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)', padding: 14 }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                    No layovers saved. Add connecting flights to your timeline for full connection intelligence.
                  </Text>
                </View>
              )}

              {/* ── Last Mile Coordination ── */}
              {!isCompletedOrCancelled && (
                <Pressable
                  onPress={() => router.push(({ pathname: `/last-mile/${trip.id}` } as any))}
                  className="active:opacity-90"
                >
                  <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 18 }}>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#22C55E', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>
                      LAST MILE
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="car" size={20} color="#22C55E" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 14 }}>
                          Ground Transport
                        </Text>
                        <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          {trip.to ? `From ${trip.to} to your final destination` : 'Set up your last-mile pickup'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <Pressable
                        onPress={() => router.push(({ pathname: `/last-mile/${trip.id}` } as any))}
                        className="bg-tics-amber/35 border border-tics-amber/20 flex-1 items-center p-4 rounded-full"
                      >
                        <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 11 }}>Coordinate</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(({ pathname: `/trips/${trip.id}/map` } as any))}
                        className="border border-[#96C7B3]/50 bg-white/[0.06] flex-1 items-center p-4 rounded-full"
                      >
                        <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(248,250,252,0.8)', fontSize: 11 }}>View Map</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              )}
            </View>
          )}

          {/* images from the country the trip is allocated */}
          <DestinationCarousel trip={trip} />

        </ScrollView>
      </View>
      <PersistentTabBar />
    </View>
  );
}