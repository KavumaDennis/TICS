import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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

export default function DashboardScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const trips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const trip = useMemo(() => trips.find((t) => t.id === activeTripId) ?? trips[0] ?? null, [activeTripId, trips]);

  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const recsByTripId   = useRecommendationStore((s) => s.byTripId);
  const weather        = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const flight         = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const alerts = useMemo(() => (trip ? alertsByTripId[trip.id] ?? [] : []), [alertsByTripId, trip]);
  const recs   = useMemo(() => (trip ? recsByTripId[trip.id]  ?? [] : []), [recsByTripId,   trip]);

  // Rich trip status derived from all live data
  const tripStatus = useMemo(() => {
    if (!trip) return { label: 'No Trip', color: '#94a3b8', ok: false };
    if (flight?.status === 'canceled')                           return { label: 'Canceled',          color: '#EF4444', ok: false };
    if (alerts.some((a) => a.severity === 'critical' && a.active && !a.read))
                                                                 return { label: 'Needs Attention',   color: '#F59E0B', ok: false };
    if (flight?.delayMinutes != null && flight.delayMinutes >= 60)
                                                                 return { label: `Delayed ${flight.delayMinutes}m`, color: '#F59E0B', ok: false };
    if (trip.monitoringStatus === 'at_risk')                     return { label: 'At Risk',            color: '#F59E0B', ok: false };
    if (flight?.status === 'active')                             return { label: 'Airborne ✈',         color: '#22C55E', ok: true  };
    if (flight?.status === 'landed')                             return { label: 'Landed ✓',           color: '#22C55E', ok: true  };
    return { label: 'On Track',   color: '#22C55E', ok: true };
  }, [alerts, trip, flight]);

  const greetingName  = greetingFromEmailOrName(ticsDisplayName(user));
  const activeAlerts  = alerts.filter((a) => a.active && !a.read).length;
  const urgentRecs    = recs.filter((r) => r.urgency === 'high').length;
  const depIn         = trip ? timeUntil(trip.departureTime) : null;

  return (

    <View className="flex-1 pt-10 pb-4">
      <View className="rounded-3xl bg-tics-amber border border-white/20 p-5 ">
        <View className="flex-row items-start justify-between">
          <View className="flex-1">
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
                fontSize: 24,
              }}
              className="text-tics-navy">Good Morning,</Text>
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
                fontSize: 24,
              }}
              className="text-tics-navy text-[26px] tracking-tight capitalize">{greetingName}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push('/alerts-center' as any)}
              className="h-11 w-11 items-center justify-center rounded-full border border-tics-navy/70 bg-tics-navy/[0.06]"
            >
              <Ionicons name="notifications-outline" size={20} color="rgba(10, 11, 30 , 0.7)" />
              {activeAlerts > 0 ? (
                <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-tics-red" />
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push('/profile' as any)}
              className="h-11 w-11 items-center justify-center rounded-full border border-tics-navy/70 bg-tics-navy/[0.06]"
            >
              <Ionicons name="person" size={20} color=" rgba(10, 11, 30 , 0.7)" />
            </Pressable>
          </View>
        </View>
        <View>
          <Text
            style={{
              fontFamily: 'Syne_500Medium',
            }}
            className='text-tics-navy2 mt-1'>
            Here's your travel overview
          </Text>
        </View>
      </View>


      <ScrollView className="px-2 mt-3" showsVerticalScrollIndicator={false}>
        {!uid ? (
          <Card accent="blue" className="py-6">
            <Text style={{
              fontFamily: 'Syne_500Medium',
            }} className="text-tics-text text-[20px]">Welcome to TICS</Text>
            <Text style={{
              fontFamily: 'Syne_500Medium',
            }} className="mt-2 text-tics-muted text-[12px] leading-5">
              Sign in to create trips, receive real-time monitoring, disruption alerts, and smart recommendations.
            </Text>
            <View className="mt-5 flex-row gap-3">
              <Pressable onPress={() => router.push('/auth/login')} className="flex-1 rounded-2xl bg-tics-amber px-5 py-4">
                <Text style={{
                  fontFamily: 'Syne_700Bold',
                }} className="text-center text-[14px] text-[#05210f]">Login</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/auth/register')}
                className="flex-1 rounded-2xl  border border-[#96C7B3]/50 bg-white/[0.06] px-5 py-4"
              >
                <Text style={{
                  fontFamily: 'Syne_500Medium',
                }} className="text-center text-[14px] text-tics-text">Create Account</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        <Pressable
          onPress={() => (trip ? router.push(({ pathname: `/monitoring/${trip.id}` } as any)) : router.push('/trip/add' as any))}
          className="active:opacity-90"
        >
          <Card accent="blue" className="px-6 py-6  bg-tics-blue/30 rounded-2xl">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text
                  style={{ fontFamily: 'Syne_500Medium' }}
                  className="text-tics-blue text-[13px] font-semibold tracking-wide">ACTIVE TRIP</Text>

                <View className='flex-row items-center justify-between'>
                  <Text
                    style={{ fontFamily: 'Syne_600SemiBold' }}
                    className="mt-2 text-tics-text text-[17px]">{trip?.title ?? 'Add your trip'}</Text>
                  <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${tripStatus.color}20` }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: tripStatus.color, fontSize: 11 }}>
                      {tripStatus.label}
                    </Text>
                  </View>
                </View>

                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: 'Syne_500Medium',
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.12)',
                    fontWeight: '300',
                  }}
                  className="mt-2 pb-2 text-tics-muted text-[12px]">
                  {trip ? dateRange(trip.departureTime, trip.arrivalTime) : 'Import or enter your trip to start monitoring.'}
                </Text>

                {/* Live mini-stats row */}
                {trip && (
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
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
              </View>

            </View>
          </Card>
        </Pressable>

        {trip ? (
          <Card accent="none" className="mt-5">
            <View
              className="flex-1 flex-row flex-wrap justify-between gap-3">
              <Pressable
                style={{ width: '48%' }}
                onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} className="active:opacity-90">
                <View className="flex-row items-center rounded-2xl bg-tics-blue/30 px-3 py-3">
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Syne_500Medium', fontWeight: '500' }} className="text-tics-text self-start text-[13px]">Trip Status</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: tripStatus.color }} className="mt-2 self-start py-1 px-2 rounded-full text-[12px]" numberOfLines={1}>
                      {tripStatus.label}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {[
                {
                  key: 'monitoring',
                  icon: 'pulse' as const,
                  label: 'Monitoring',
                  status: flight?.status === 'active' ? 'Airborne ✈' : trip.monitoringStatus === 'at_risk' ? 'Watch closely' : 'On Track',
                  statusColor: flight?.status === 'active' ? '#22C55E' : trip.monitoringStatus === 'at_risk' ? '#F59E0B' : '#3B82F6',
                  statusBg: flight?.status === 'active' ? 'rgba(34,197,94,0.15)' : trip.monitoringStatus === 'at_risk' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                  onPress: () => router.push(({ pathname: `/monitoring/${trip.id}` } as any)),
                },
                {
                  key: 'alerts',
                  icon: 'warning' as const,
                  label: 'Alerts',
                  status: activeAlerts > 0 ? `${activeAlerts} active` : 'All clear',
                  statusColor: activeAlerts > 0 ? '#EF4444' : '#22C55E',
                  statusBg: activeAlerts > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.1)',
                  onPress: () => router.push('/alerts-center' as any),
                },
                {
                  key: 'recs',
                  icon: 'sparkles' as const,
                  label: 'Intelligence',
                  status: urgentRecs > 0 ? `${urgentRecs} urgent` : recs.length > 0 ? `${recs.length} insight${recs.length > 1 ? 's' : ''}` : 'No insights yet',
                  statusColor: urgentRecs > 0 ? '#EF4444' : recs.length > 0 ? '#22C55E' : '#94a3b8',
                  statusBg: urgentRecs > 0 ? 'rgba(239,68,68,0.15)' : recs.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.08)',
                  onPress: () => router.push('/recommendations' as any),
                },
                {
                  key: 'lastmile',
                  icon: 'car' as const,
                  label: 'Last Mile',
                  status: trip.lastMileStatus === 'none' ? 'Plan pickup' : trip.lastMileStatus === 'in_progress' ? 'En route' : 'Arranged',
                  statusColor: trip.lastMileStatus === 'none' ? '#F59E0B' : '#A855F7',
                  statusBg: trip.lastMileStatus === 'none' ? 'rgba(245,158,11,0.15)' : 'rgba(168,85,247,0.15)',
                  onPress: () => router.push(({ pathname: `/last-mile/${trip.id}` } as any)),
                },
              ].map((row) => (
                <Pressable
                  style={{ width: '48%' }}
                  key={row.key} onPress={row.onPress} className="active:opacity-90 w-[48%]">
                  <View className={['flex-row items-center rounded-2xl  bg-tics-blue/30 pl-3 pr-2 py-3'].join(' ')}>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Syne_500Medium', fontWeight: '500' }} className="text-tics-text text-[13px] font-extrabold">{row.label}</Text>
                      <Text
                        style={{ fontFamily: 'Syne_500Medium', backgroundColor: row.statusBg, color: row.statusColor }}
                        className={['mt-2 py-1 px-2 self-start rounded-full text-[12px]'].join(' ')}
                        numberOfLines={1}
                      >{row.status}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : (
          <Card accent="purple" className="py-6">
            <Text
              style={{
                fontFamily: 'Syne_700Bold',
                fontSize: 24,
              }}
              className="text-tics-text text-[15px]">Add your trip</Text>
            <Text
              style={{
                fontFamily: 'Syne_500Medium',
                fontSize: 13,
              }}
              className="mt-2 text-tics-muted text-[12px] leading-5">
              Sync from email, import a booking, or enter manually to unlock monitoring.
            </Text>
            <Pressable
              style={{
                backgroundColor: '#F59E0B',
              }}
              onPress={() => router.push('/trip/add' as any)} className="mt-5 rounded-2xl px-6 py-4">
              <Text
                style={{
                  fontFamily: 'Syne_700Bold',
                }}
                className="text-center text-[13px] text-black">Add Trip</Text>
            </Pressable>
          </Card>
        )}
        <View className="mt-4">
          <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-tics-text text-[20px]'>
            Why Users Love TICS
          </Text>
          <View className='flex-1 flex-row flex-wrap gap-3 justify-between mt-3'>
            <Card className='w-[48%] px-3 py-3 rounded-2xl bg-tics-blue/30 '>
              <View className='w-10 h-10 rounded-full bg-tics-blue/30 border border-tics-blue/20 items-center justify-center'>
                <MaterialCommunityIcons name="reload" size={20} color="#3B82F6" />
              </View>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[14px] text-tics-text py-2'>
                Real-time
                Monitoring
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[11px] text-tics-muted'>
                Stay updated live
              </Text>
            </Card>
            <Card className='w-[48%] px-3 py-3 rounded-2xl bg-tics-blue/30 '>
              <View className='w-10 h-10 rounded-full bg-tics-amber/20 border border-tics-amber/20 items-center justify-center'>
                <MaterialCommunityIcons name="bell-outline" size={20} color="#F59E0B" />
              </View>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[14px] text-tics-text py-2'>
                Proactive alerts
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[11px] text-tics-muted'>
                Builds trust and habit
              </Text>
            </Card>
            <Card className='w-[48%] px-3 py-3 rounded-2xl bg-tics-blue/30 '>
              <View className='w-10 h-10 rounded-full bg-tics-green/20 border border-tics-green/20 items-center justify-center'>
                <Ionicons name="star" size={20} color="#22C55E" />
              </View>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[14px] text-tics-text py-2'>
                AI Recommendations
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[11px] text-tics-muted'>
                Builds trust and habit
              </Text>
            </Card>
            <Card className='flex-1 w-[48%] px-3 py-3 rounded-2xl bg-tics-blue/30 '>
              <View className='w-10 h-10 rounded-full bg-tics-purple/25 border border-tics-purple/20 items-center justify-center'>
                <MaterialIcons name="emoji-transportation" size={20} color="#8B5CF6" />
              </View>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[14px] text-tics-text py-2'>
                Last Mile Coordination
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className='text-[11px] text-tics-muted'>
                End-to-end coverage
              </Text>
            </Card>
          </View>
        </View>
      </ScrollView>

    </View>

  );
}
