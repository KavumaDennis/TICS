/**
 * TripDetailsScreen — tab-filtered single screen (no page navigation).
 * Overview / Flights / Connections are in-page tabs, not links.
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
  const alerts = useAlertStore((s) => trip ? s.alertsByTripId[trip.id] ?? [] : []);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const activeAlert = useMemo(() => alerts.find((a) => a.active && !a.read) ?? null, [alerts]);
  const onTime = trip?.monitoringStatus !== 'at_risk';

  if (!trip) {
    return (
      <View className="flex-1 px-6" style={{ paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] mb-4">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[14px]">Trip not found</Text>
      </View>
    );
  }

  function TabPill({ id: tabId, label }: { id: Tab; label: string }) {
    const active = tab === tabId;
    return (
      <Pressable
        onPress={() => setTab(tabId)}
        style={{
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
          backgroundColor: active ? '#3B82F6' : '',
        }}
      >
        <Text style={{ fontFamily: 'Syne_500Medium', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.9)' }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-2 pb-3">
        <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.06]">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]" numberOfLines={1}>{trip.title}</Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
            {trip.flightNumber ?? ''}{trip.airline ? ` · ${trip.airline}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}
          className="h-11 w-11 items-center justify-center rounded-xl bg-tics-amber"
        >
          <Ionicons name="pulse" size={17} color="rgba(10,11,30,0.9)" />
        </Pressable>
      </View>

      {/* In-page tab filters — NOT navigation links */}
      <View className="flex-row gap-2 px-2 pb-4">
        <TabPill id="overview" label="Overview" />
        <TabPill id="flights" label="Flights" />
        <TabPill id="connections" label="Connections" />
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab === 'overview' && (
          <>
            {/* Flight summary */}
            <View style={{ borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.30)', padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {trip.flightNumber ? <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{trip.flightNumber}</Text> : null}
                  {trip.airline ? <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{trip.airline}</Text> : null}
                </View>
                <View
                  className='border border-tics-green/35' style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: onTime ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
                  <Text style={{ fontFamily: 'Syne_700Bold', fontSize: 11, color: onTime ? '#22C55E' : '#F59E0B' }}>
                    {onTime ? 'On Track' : 'At Risk'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 26 }}>{toCode(trip.from)}</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>{trip.from}</Text>
                </View>
                <Fontisto name="plane" size={18} color="#3B82F6" />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 26 }}>{toCode(trip.to)}</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>{trip.to}</Text>
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Departure</Text>
                  <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 17, marginTop: 4 }}>
                    {new Date(trip.departureTime).toLocaleString([], { timeStyle: 'short' })}
                  </Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                    {new Date(trip.departureTime).toLocaleString([], { dateStyle: 'medium' })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Arrival</Text>
                  <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 17, marginTop: 4 }}>
                    {new Date(trip.arrivalTime).toLocaleString([], { timeStyle: 'short' })}
                  </Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                    {new Date(trip.arrivalTime).toLocaleString([], { dateStyle: 'medium' })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Weather */}
            <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} style={{ opacity: 1 }}>
              <View
                className="border border-[#96C7B3]/50 bg-white/[0.06]"
                style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', padding: 16 }}>
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

            {/* Active alert */}
            <Pressable onPress={() => router.push('/alerts-center' as any)}>
              <View
                style={{ borderRadius: 16, borderWidth: activeAlert ? 0 : 1, borderColor: activeAlert ? '' : 'rgb(150 199 179 / 0.5)', backgroundColor: activeAlert ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.06)', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeAlert ? '#EF4444' : 'rgba(255,255,255,0.3)' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: activeAlert ? '#EF4444' : '#94a3b8', fontSize: 14 }}>
                    {activeAlert ? activeAlert.title : 'No active alerts'}
                  </Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 3 }} numberOfLines={2}>
                    {activeAlert ? activeAlert.message : 'Monitoring is running for this trip.'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(248,250,252,0.25)" />
              </View>
            </Pressable>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/timeline/${trip.id}` as any)}>
                <View style={{ borderRadius: 14, backgroundColor: '#F59E0B', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="timer-outline" size={18} color="rgba(10,11,30,0.9)" />
                  <Text style={{ fontFamily: 'Syne_700Bold', color: 'rgba(10,11,30,0.9)', fontSize: 13 }}>Timeline</Text>
                </View>
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(({ pathname: `/bookings/${trip.id}` } as any))}>
                <View className='border border-[#96C7B3]/50 bg-white/[0.06]' style={{ borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.07)', padding: 18 }}>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#60A5FA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>LIVE FLIGHT DATA</Text>
              {[
                { label: 'Flight', value: trip.flightNumber ?? '—' },
                { label: 'Airline', value: trip.airline ?? '—' },
                { label: 'Status', value: flight?.status ? flight.status.charAt(0).toUpperCase() + flight.status.slice(1) : 'Pending sync', color: flight?.status === 'active' ? '#22C55E' : flight?.status === 'canceled' ? '#EF4444' : '#94a3b8' },
                { label: 'Gate', value: flight?.gate ?? 'TBC', color: flight?.gate ? '#60A5FA' : undefined },
                { label: 'Terminal', value: flight?.terminal ?? 'TBC', color: flight?.terminal ? '#A78BFA' : undefined },
                { label: 'Delay', value: flight?.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None', color: flight?.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E' },
              ].map((row, i) => (
                <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < 5 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{row.label}</Text>
                  <Text style={{ fontFamily: 'Syne_600SemiBold', color: row.color ?? '#f8fafc', fontSize: 13 }}>{row.value}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
              <View style={{ borderRadius: 14, backgroundColor: '#3B82F6', paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 13 }}>Open full monitoring</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ═══ CONNECTIONS TAB ═══ */}
        {tab === 'connections' && (
          <View style={{ gap: 12 }}>
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', backgroundColor: 'rgba(139,92,246,0.07)', padding: 18 }}>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#A78BFA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>ROUTE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 22 }}>{toCode(trip.from)}</Text>
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {new Date(trip.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                <Ionicons name="airplane" size={16} color="#8B5CF6" />
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 22 }}>{toCode(trip.to)}</Text>
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
                <View key={i} style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Ionicons name="ellipse" size={8} color="#8B5CF6" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 13 }}>{step.label}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                      {new Date(step.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 14 }}>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                  No layovers saved. Add connecting flights to your timeline for full connection intelligence.
                </Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}
