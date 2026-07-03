/**
 * BookingsDetailsScreen — dynamic booking overview.
 * Flight: from live flightMonitoringStore + trip data
 * Hotel: from trip.hotels[] array + redirect to booking platform
 * Transport: dynamic last-mile routing from mobility/transport stores
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useMobilityStore } from '@/src/store/mobilityStore';
import { useTripStore } from '@/src/store/tripStore';
import { useTransportStore, selectTransportOpts } from '@/src/store/transportStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';

type TabKey = 'flight' | 'hotel' | 'transport';

const TAB_ICON: Record<TabKey, string> = {
  flight: 'airplane',
  hotel: 'bed',
  transport: 'car',
};

const TAB_COLOR: Record<TabKey, string> = {
  flight: '#3B82F6',
  hotel: '#8B5CF6',
  transport: '#22C55E',
};

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: ok ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
      <Text style={{ fontFamily: 'Syne_700Bold', color: ok ? '#22C55E' : '#F59E0B', fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{label}</Text>
      <Text style={{ fontFamily: 'Syne_600SemiBold', color: valueColor ?? '#f8fafc', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

/** Format seconds to "Xh Ym" */
function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function BookingsDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [tab, setTab] = useState<TabKey>('flight');

  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(() => trips.find((t) => String(t.id) === String(tripId)) ?? null, [tripId, trips]);

  // CENTRALIZED trip status — single source of truth
  const { isCompleted, isCancelled, statusInfo } = useTripStatus(trip);

  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const mobility = useMobilityStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const transport = useTransportStore(selectTransportOpts(trip?.id));
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const hotel = trip?.hotels?.[0] ?? null;

  // Status pill: use centralized status from getTripStatus()
  const isCompletedOrCancelled = isCompleted || isCancelled;
  const statusLabel = statusInfo.label;
  const statusOk = !isCompletedOrCancelled && statusInfo.status !== 'delayed';

  /** Build a hotel booking deep link for the user's destination */
  const hotelBookingUrl = useMemo(() => {
    const dest = trip?.to ?? '';
    if (!dest) return null;
    // Use Google Hotels search as a universal redirect
    return `https://www.google.com/travel/hotels?q=hotels+in+${encodeURIComponent(dest)}`;
  }, [trip?.to]);

  function TabPill({ id, label }: { id: TabKey; label: string }) {
    const active = tab === id;
    const color = TAB_COLOR[id];
    return (
      <Pressable onPress={() => setTab(id)} style={{ flex: 1 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 13, borderRadius: 99,
        }}
          className={`${active ? "bg-tics-amber/35 border border-tics-amber/20" : ""} border border-tics-amber/20`}
        >
          <Ionicons name={TAB_ICON[id] as any} size={15} color={active ? color : 'rgba(148,163,184,0.6)'} />
          <Text style={{ fontFamily: 'Syne_600SemiBold', fontSize: 12, color: active ? '#f8fafc' : 'rgba(148,163,184,0.7)' }}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View
        className='p-2 mb-4 flex-row items-center justify-between gap-2 bg-tics-amber/25 border border-tics-amber/10 rounded-full'
        style={{ flexDirection: 'row', alignItems: 'center'}}>
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 17 }}>Bookings</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }} numberOfLines={1}>
            {trip?.title ?? ''}
          </Text>
        </View>
      </View>

      {/* Tab strip */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 8, marginBottom: 16 }}>
        <TabPill id="flight" label="Flight" />
        <TabPill id="hotel" label="Hotel" />
        <TabPill id="transport" label="Transport" />
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {/* ─── FLIGHT TAB ─── */}
        {tab === 'flight' && (
          <View style={{ gap: 12 }}>
            <View className='rounded-4xl bg-tics-amber/25 border border-tics-amber/10' style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#60A5FA', fontSize: 12, letterSpacing: 0.8 }}>FLIGHT BOOKING</Text>
                <StatusPill label={statusLabel} ok={statusOk} />
              </View>

              <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18, marginBottom: 4 }}>
                {trip?.airline ?? 'Airline'} {trip?.flightNumber ?? '—'}
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                {trip?.from ?? '—'} → {trip?.to ?? '—'}
              </Text>

              <Row label="Departure" value={trip?.departureTime ? new Date(trip.departureTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
              <Row label="Arrival" value={trip?.arrivalTime ? new Date(trip.arrivalTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
              {flight && (
                <>
                  <Row label="Gate" value={flight.gate ?? 'TBC'} valueColor={flight.gate ? '#60A5FA' : undefined} />
                  <Row label="Terminal" value={flight.terminal ?? 'TBC'} valueColor={flight.terminal ? '#A78BFA' : undefined} />
                  <Row
                    label="Delay"
                    value={flight.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None'}
                    valueColor={flight.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E'}
                  />
                  <Row
                    label="Status"
                    value={flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}
                    valueColor={flight.status === 'active' ? '#22C55E' : flight.status === 'canceled' ? '#EF4444' : '#94a3b8'}
                  />
                </>
              )}

              {/* Weather at destination */}
              {weather && weather.tempC != null && (
                <View className='flex-wrap rounded-3xl' style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(251,191,36,0.15)', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="partly-sunny" size={16} color="#FBBF24" className='self-start' />
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }} className='flex-wrap'>
                    Destination: {Math.round(weather.tempC)}°C, {weather.description ?? ''} — {weather.riskSummary ?? 'No weather risk'}
                  </Text>
                </View>
              )}
            </View>

            <Pressable onPress={() => trip && router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
              <View className='rounded-full bg-tics-amber/35 border border-tics-amber/20 py-6 items-center'>
                <Text style={{ fontFamily: 'Syne_700Bold' }} className="ml-2 text-tics-text text-[15px]">Open monitoring</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ─── HOTEL TAB ─── */}
        {tab === 'hotel' && (
          <View style={{ gap: 12 }}>
            {hotel ? (
              <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.08)', padding: 20 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#A78BFA', fontSize: 12, letterSpacing: 0.8, marginBottom: 14 }}>
                  HOTEL BOOKING
                </Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18, marginBottom: 4 }}>
                  {hotel.name ?? 'Saved hotel'}
                </Text>
                {hotel.checkInAt && <Row label="Check-in" value={new Date(hotel.checkInAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />}
                {hotel.checkOutAt && <Row label="Check-out" value={new Date(hotel.checkOutAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />}
                {hotel.lat != null && hotel.lng != null && (
                  <View style={{ marginTop: 12 }}>
                    <Row label="Coordinates" value={`${hotel.lat.toFixed(4)}, ${hotel.lng.toFixed(4)}`} valueColor="#A78BFA" />
                  </View>
                )}
              </View>
            ) : (
              <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 24, alignItems: 'center', gap: 12 }}>
                <Ionicons name="bed-outline" size={36} color="rgba(248,250,252,0.15)" />
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 15 }}>No hotel saved</Text>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                  Find and book hotels near your destination.
                </Text>
              </View>
            )}

            {/* Book hotel button — redirects to booking platform */}
            {hotelBookingUrl && (
              <Pressable onPress={() => Linking.openURL(hotelBookingUrl)}>
                <View className='py-6 rounded-full' style={{ borderWidth: 1, borderColor: 'rgba(139,92,246,0.1)', backgroundColor: 'rgba(139,92,246,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="search" size={18} color="#A78BFA" />
                  <Text style={{ fontFamily: 'Syne_700Bold', color: '#A78BFA', fontSize: 13 }}>
                    {hotel ? 'Find better rates' : `Search hotels in ${trip?.to ?? 'destination'}`}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        )}

        {/* ─── TRANSPORT TAB ─── */}
        {tab === 'transport' && (
          <View style={{ gap: 12 }}>
            {/* Dynamic last-mile routing info from mobility store */}
            {mobility?.bestRoute ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.07)', padding: 18 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#4ADE80', fontSize: 12, letterSpacing: 0.8, marginBottom: 10 }}>BEST ROUTE</Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 16 }}>
                  {`${fmtDuration(mobility.bestRoute.durationSec)} · ${(mobility.bestRoute.distanceMeters / 1000).toFixed(1)} km`}
                </Text>
                {mobility.origin?.label && mobility.destination?.label && (
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    {mobility.origin.label} → {mobility.destination.label}
                  </Text>
                )}
                <Pressable onPress={() => trip && router.push(({ pathname: `/trips/${trip.id}/map` } as any))} style={{ marginTop: 12 }}>
                  <View style={{ borderRadius: 10, backgroundColor: '#22C55E', paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#052e16', fontSize: 13 }}>View on map</Text>
                  </View>
                </Pressable>
              </View>
            ) : mobility ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.15)', backgroundColor: 'rgba(34,197,94,0.05)', padding: 18, alignItems: 'center', gap: 8 }}>
                <Ionicons name="map-outline" size={28} color="#4ADE80" />
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>Route data available</Text>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11, textAlign: 'center' }}>
                  Your origin and destination are set. Route estimation will appear as you approach arrival.
                </Text>
              </View>
            ) : (
              <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(34,197,94,0.15)', backgroundColor: 'rgba(34,197,94,0.05)', padding: 18, alignItems: 'center', gap: 8 }}>
                <Ionicons name="navigate-outline" size={28} color="#4ADE80" />
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13 }}>Last-mile routing</Text>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11, textAlign: 'center' }}>
                  TICS will calculate the best route from the airport to your final destination once monitoring is active.
                </Text>
              </View>
            )}



            {/* Last-mile coordination link */}
            <Pressable onPress={() => trip && router.push(({ pathname: `/last-mile/${trip.id}` } as any))}>
              <View className='py-6 rounded-full' style={{ borderWidth: 1, borderColor: 'rgba(59,130,246,0.1)', backgroundColor: 'rgba(59,130,246,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <Ionicons name="navigate-outline" size={18} color="#60A5FA" />
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#60A5FA', fontSize: 13 }}>Full last-mile coordination</Text>
              </View>
            </Pressable>
          </View>
        )}

      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}