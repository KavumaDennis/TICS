/**
 * BookingsDetailsScreen — dynamic booking overview.
 * Flight: from live flightMonitoringStore + trip data
 * Hotel: from trip.hotels[] array
 * Transport: from transportStore
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useMobilityStore } from '@/src/store/mobilityStore';
import { useTripStore } from '@/src/store/tripStore';
import { useTransportStore, selectTransportOpts } from '@/src/store/transportStore';
import { useWeatherStore } from '@/src/store/weatherStore';

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

export default function BookingsDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [tab, setTab] = useState<TabKey>('flight');

  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(() => trips.find((t) => String(t.id) === String(tripId)) ?? null, [tripId, trips]);

  const flight   = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const mobility = useMobilityStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const transport = useTransportStore(selectTransportOpts(trip?.id));
  const weather  = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const hotel = trip?.hotels?.[0] ?? null;
  const onTime = trip?.monitoringStatus !== 'at_risk';

  function TabPill({ id, label }: { id: TabKey; label: string }) {
    const active = tab === id;
    const color = TAB_COLOR[id];
    return (
      <Pressable onPress={() => setTab(id)} style={{ flex: 1 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 10, borderRadius: 12, borderWidth: 1,
          borderColor: active ? `${color}50` : 'rgba(255,255,255,0.08)',
          backgroundColor: active ? `${color}15` : 'rgba(255,255,255,0.04)',
        }}>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18 }}>Bookings</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }} numberOfLines={1}>
            {trip?.title ?? ''}
          </Text>
        </View>
      </View>

      {/* Tab strip */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 }}>
        <TabPill id="flight"    label="Flight"    />
        <TabPill id="hotel"     label="Hotel"     />
        <TabPill id="transport" label="Transport" />
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {/* ─── FLIGHT TAB ─── */}
        {tab === 'flight' && (
          <View style={{ gap: 12 }}>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)', backgroundColor: 'rgba(59,130,246,0.08)', padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#60A5FA', fontSize: 12, letterSpacing: 0.8 }}>FLIGHT BOOKING</Text>
                <StatusPill label={onTime ? 'On Track' : 'At Risk'} ok={onTime} />
              </View>

              <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18, marginBottom: 4 }}>
                {trip?.airline ?? 'Airline'} {trip?.flightNumber ?? '—'}
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                {trip?.from ?? '—'} → {trip?.to ?? '—'}
              </Text>

              <Row label="Departure" value={trip?.departureTime ? new Date(trip.departureTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
              <Row label="Arrival"   value={trip?.arrivalTime   ? new Date(trip.arrivalTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
              {flight && (
                <>
                  <Row label="Gate"     value={flight.gate     ?? 'TBC'} valueColor={flight.gate     ? '#60A5FA' : undefined} />
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
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.1)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="partly-sunny" size={16} color="#FBBF24" />
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>
                    Destination: {Math.round(weather.tempC)}°C, {weather.description ?? ''} — {weather.riskSummary ?? 'No weather risk'}
                  </Text>
                </View>
              )}
            </View>

            <Pressable onPress={() => trip && router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
              <View style={{ borderRadius: 14, backgroundColor: '#3B82F6', paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 13 }}>Open monitoring</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* ─── HOTEL TAB ─── */}
        {tab === 'hotel' && (
          <View style={{ gap: 12 }}>
            {hotel ? (
              <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.08)', padding: 20 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#A78BFA', fontSize: 12, letterSpacing: 0.8, marginBottom: 14 }}>
                  HOTEL BOOKING
                </Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18, marginBottom: 4 }}>
                  {hotel.name ?? 'Saved hotel'}
                </Text>
                {hotel.checkInAt  && <Row label="Check-in"  value={new Date(hotel.checkInAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />}
                {hotel.checkOutAt && <Row label="Check-out" value={new Date(hotel.checkOutAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} />}
                {hotel.lat != null && hotel.lng != null && (
                  <View style={{ marginTop: 12 }}>
                    <Row label="Coordinates" value={`${hotel.lat.toFixed(4)}, ${hotel.lng.toFixed(4)}`} valueColor="#A78BFA" />
                  </View>
                )}
              </View>
            ) : (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 24, alignItems: 'center', gap: 12 }}>
                <Ionicons name="bed-outline" size={36} color="rgba(248,250,252,0.15)" />
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 15 }}>No hotel saved</Text>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                  Add hotel details to your trip to enable last-mile routing and check-in reminders.
                </Text>
                <Pressable onPress={() => router.push('/trip/add' as any)}>
                  <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(139,92,246,0.12)', paddingHorizontal: 20, paddingVertical: 10 }}>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#A78BFA', fontSize: 13 }}>Update trip details</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ─── TRANSPORT TAB ─── */}
        {tab === 'transport' && (
          <View style={{ gap: 12 }}>
            {/* Route if available */}
            {mobility?.bestRoute && (
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
            )}

            {/* Transport options */}
            {transport.length > 0 ? (
              transport.map((opt) => {
                const color = opt.kind === 'public_transit' ? '#14B8A6' : opt.kind === 'taxi' ? '#F59E0B' : '#3B82F6';
                return (
                  <View key={opt.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: `${color}25`, backgroundColor: `${color}08`, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: `${color}20`, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={opt.kind === 'public_transit' ? 'train' : opt.kind === 'taxi' ? 'car' : 'car-sport'} size={18} color={color} />
                      </View>
                      <View>
                        <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 14 }}>{opt.title}</Text>
                        <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                          {opt.etaMinutes != null ? `~${opt.etaMinutes} min` : 'ETA varies'}
                          {opt.estimatedCost ? ` · ${opt.estimatedCost}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(34,197,94,0.15)' }}>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: '#22C55E', fontSize: 11 }}>
                        {opt.status ?? 'Available'}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                  Transport options appear here when your arrival is within 3 hours. They are generated automatically by TICS monitoring.
                </Text>
              </View>
            )}

            {/* Last-mile coordination link */}
            <Pressable onPress={() => trip && router.push(({ pathname: `/last-mile/${trip.id}` } as any))}>
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.07)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
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

/* helper for last-mile screen reuse */
function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
