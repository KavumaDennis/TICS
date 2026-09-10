/**
 * BookingsDetailsScreen — dynamic booking overview.
 * Flight: from live flightMonitoringStore + trip data
 * Hotel: from trip.hotels[] array + redirect to booking platform
 * Transport: dynamic last-mile routing from mobility/transport stores
 */
import { airlineName } from '@/src/utils/airlineDisplay';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useMobilityStore } from '@/src/store/mobilityStore';
import { useTripStore } from '@/src/store/tripStore';
import { useTransportStore, selectTransportOpts } from '@/src/store/transportStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useTripType } from '@/src/hooks/useTripType';
import { useAuthStore } from '@/src/store/useAuthStore';
import { fetchOperators, selectOperator, getActiveOperator } from '@/src/services/OperatorService';
import { notifyOperatorAccepted } from '@/src/services/NotificationService';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import type { OperatorDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

type TabKey = 'flight' | 'operator' | 'transport';

const TAB_ICON: Record<TabKey, string> = {
  flight: 'airplane',
  operator: 'business',
  transport: 'car',
};

const TAB_COLOR: Record<TabKey, string> = {
  flight: '#3B82F6',
  operator: '#8B5CF6',
  transport: '#22C55E',
};

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={{ borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: ok ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: ok ? '#22C55E' : '#F59E0B', fontSize: 11 }}>{label}</SafeText>
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{label}</SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: valueColor ?? '#f8fafc', fontSize: 13 }}>{value}</SafeText>
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

const STAR_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#22C55E'];

function StarRating({ rating }: { rating?: number }) {
  const r = rating ?? 0;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(r) ? 'star' : 'star-outline'}
          size={12}
          color={i <= Math.round(r) ? STAR_COLORS[Math.min(i - 1, 4)] : '#64748b'}
        />
      ))}
    </View>
  );
}

/** Operator selection component shown in the Hotel tab */
function OperatorSelection({ tripId, trip }: { tripId?: string; trip: any }) {
  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [operators, setOperators] = useState<(OperatorDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState<(OperatorDoc & { id: string }) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [currentOperator, setCurrentOperator] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !tripId) return;
    (async () => {
      try {
        const [ops, active] = await Promise.all([
          fetchOperators(),
          getActiveOperator(uid, tripId),
        ]);
        console.log(`[OperatorSelection] Loaded ${ops.length} operators from Firestore`);
        setOperators(ops);
        if (active) {
          setCurrentOperator(active.operatorName || active.operatorId);
        }
      } catch (e: any) {
        console.error('[OperatorSelection] Failed to load operators:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, tripId]);

  const handleSelect = async () => {
    if (!selectedOp || !uid || !tripId) return;
    setConfirming(true);
    try {
      await selectOperator(
        uid,
        selectedOp.id,
        selectedOp.name,
        selectedOp.phone,
        selectedOp.logoUrl,
        tripId,
        user?.name || user?.email || undefined,
      );
      await notifyOperatorAccepted(uid, selectedOp.name, tripId);
      Alert.alert(
        'Operator Selected',
        `${selectedOp.name} will now manage your rides during this trip.`,
        [{ text: 'OK' }],
      );
      setCurrentOperator(selectedOp.name);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to select operator');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {currentOperator && (
        <View className='rounded-full' style={{ padding: 14, backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.1)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 13 }}>
              Currently assigned to {currentOperator}
            </SafeText>
          </View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
            You can switch to a different operator below.
          </SafeText>
        </View>
      )}

      {loading ? (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginTop: 12 }}>
            Loading tour operators...
          </SafeText>
        </View>
      ) : operators.length === 0 ? (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 24, alignItems: 'center', gap: 12 }}>
          <Ionicons name="business-outline" size={40} color="rgba(248,250,252,0.15)" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14 }}>
            No operators available
          </SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            Please check back later when tour operators register on the platform.
          </SafeText>
        </View>
      ) : (
        <>
          <View className='rounded-full p-4 px-5 bg-tics-amber/35 border border-tics-amber/20' style={{ }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 4 }}>
              TOUR OPERATORS
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
              Select a tour operator who will manage your rides during this trip
            </SafeText>
          </View>

          {operators.map((item) => {
            const isSelected = selectedOp?.id === item.id;
            const displayName = item.lodgeName || item.name;
            const displayRating = item.averageRating || item.rating;
            const displayTotalRatings = item.totalRatings;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedOp(isSelected ? null : item)}
                style={{
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(59,130,246,0.5)' : '',
                  backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : '#fff',
                }}
                className='rounded-4xl p-3 items-center'
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  {/* Logo */}
                  <View
                    className='rounded-full overflow-hidden'
                    style={{
                      width: 46, height: 46,
                      backgroundColor: '#1e56cd',
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                    {item.logoUrl || item.profileImage ? (
                      <View style={{ width: 46, height: 46, overflow: 'hidden' }}>
                        <Image source={{ uri: item.logoUrl || item.profileImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      </View>
                    ) : (
                      <Ionicons name="business" size={26} color="#fff" />
                    )}
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1, gap: 3 }}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#1e56cd', fontSize: 15 }}>
                      {displayName}
                    </SafeText>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {item.name !== displayName && (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
                          {item.name}
                        </SafeText>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <StarRating rating={displayRating} />
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
                          {displayRating?.toFixed(1) || 'N/A'}
                          {displayTotalRatings != null && displayTotalRatings > 0 ? ` (${displayTotalRatings})` : ''}
                        </SafeText>
                      </View>
                    </View>
                    {item.description ? (
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
                        {item.description}
                      </SafeText>
                    ) : null}
                    {item.languages ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {item.languages?.slice(0, 3).map((lang, i) => (
                          <View key={i} style={{ borderRadius: 99, backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 8, paddingVertical: 2 }}>
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 9 }}>{lang}</SafeText>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      {item.country && (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
                          <Ionicons name="location" size={10} color="#64748b" /> {item.country}
                        </SafeText>
                      )}
                      {item.availableDrivers != null && (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 10 }}>
                          <Ionicons name="people" size={10} color="#22C55E" /> {item.availableDrivers} drivers
                        </SafeText>
                      )}
                    </View>
                    {item.phone && (
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 10 }}>
                        <Ionicons name="call" size={10} color="#60A5FA" /> {item.phone}
                      </SafeText>
                    )}
                  </View>

                  {isSelected && (
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Confirm button */}
          {selectedOp && (
            <Pressable
              onPress={handleSelect}
              disabled={confirming}
              style={{
                alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 6,
              }}
              className='rounded-full bg-tics-amber/35 border border-tics-amber/20 p-6'
            >
              {confirming ? (
                <ActivityIndicator size={18} color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15 }}>
                    Select {selectedOp.lodgeName || selectedOp.name}
                  </SafeText>
                </>
              )}
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

/** ── Transport Tab Content: mini last-mile logic ──────────────────────────── */

function TransportTabContent({ trip, tripId }: { trip: any; tripId?: string }) {
  const router = useRouter();
  const uid = useAuthStore((s) => s.token);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const mobility = useMobilityStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const { isLocal: isLocalTrip } = useTripType(trip);
  const [activeOperator, setActiveOperator] = useState<any>(null);
  const [latestRideRequest, setLatestRideRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const REQUEST_STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
    pending: { icon: 'time', color: '#F59E0B', label: 'Pending — operator reviewing' },
    accepted: { icon: 'checkmark-circle', color: '#3B82F6', label: 'Accepted — driver being assigned' },
    assigned: { icon: 'car', color: '#22C55E', label: 'Assigned — driver on the way' },
    in_progress: { icon: 'navigate', color: '#22C55E', label: 'In Progress' },
    completed: { icon: 'checkmark-done', color: '#64748b', label: 'Completed' },
    cancelled: { icon: 'close-circle', color: '#EF4444', label: 'Cancelled' },
  };

  // Load operator + ride request data
  useEffect(() => {
    if (!uid || !tripId) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const [op, rideReqs] = await Promise.all([
          getActiveOperator(uid, tripId).catch(() => null),
          getDocs(query(
            collection(getFirebaseFirestore(), 'rideRequests'),
            where('travelerId', '==', uid),
            where('tripId', '==', tripId),
            orderBy('createdAt', 'desc'),
            limit(1),
          )).catch(() => null),
        ]);
        if (cancelled) return;
        if (op) setActiveOperator(op);
        if (rideReqs && !rideReqs.empty) {
          const doc = rideReqs.docs[0];
          setLatestRideRequest({ id: doc.id, ...doc.data() });
        }
      } catch (e) {
        console.warn('[TransportTab] load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [uid, tripId]);

  const lastMileSet = activeOperator || latestRideRequest;
  const destination = latestRideRequest?.destination || trip?.to || '';
  const driverName = latestRideRequest?.driverName || activeOperator?.operatorName || '';
  const driverPhone = latestRideRequest?.driverPhone || activeOperator?.operatorPhone || '';
  const rideStatus = latestRideRequest?.status || null;
  const rideStatusMeta = rideStatus ? REQUEST_STATUS_META[rideStatus as string] : null;

  return (
    <View style={{ gap: 12 }}>
      {/* Header card */}
      <View className='rounded-4xl bg-tics-amber/25 border border-tics-amber/10' style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Ionicons name="navigate-outline" size={18} color="#22C55E" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8 }}>
            LAST-MILE TRANSPORT
          </SafeText>
        </View>

        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16, marginBottom: 4 }}>
          {trip?.to ?? 'No destination set'}
        </SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          {trip?.destinationAirport?.airportName ?? 'Airport'} → Final destination
        </SafeText>

        <Row label="Arrival time" value={trip?.arrivalTime ? new Date(trip.arrivalTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
        <Row
          label="Status"
          value={trip?.lastMileStatus === 'completed' ? 'Completed' : trip?.lastMileStatus === 'in_progress' ? 'In Progress' : trip?.lastMileStatus === 'scheduled' ? 'Scheduled' : 'Not arranged'}
          valueColor={trip?.lastMileStatus === 'completed' ? '#22C55E' : trip?.lastMileStatus === 'in_progress' ? '#3B82F6' : trip?.lastMileStatus === 'scheduled' ? '#F59E0B' : '#94a3b8'}
        />
        {trip?.destinationAirport?.latitude && trip?.destinationAirport?.longitude && (
          <Row
            label="Coordinates"
            value={`${trip.destinationAirport.latitude.toFixed(4)}, ${trip.destinationAirport.longitude.toFixed(4)}`}
            valueColor="#94a3b8"
          />
        )}

        {/* Weather context */}
        {weather && weather.tempC != null && (
          <View 
          className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'
          style={{ marginTop: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="partly-sunny" size={16} color="#FBBF24" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, flex: 1 }}>
              {Math.round(weather.tempC)}°C {weather.description ? `· ${weather.description}` : ''}
            </SafeText>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', padding: 24 }}>
          <ActivityIndicator size="small" color="#22C55E" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
            Loading last-mile details...
          </SafeText>
        </View>
      ) : lastMileSet ? (
        <>
          {/* Driver & destination details */}
          <View className='rounded-4xl' style={{ padding: 18, borderWidth: 1, borderColor: 'rgba(34,197,94,0.1)', backgroundColor: 'rgba(34,197,94,0.2)' }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#4ADE80', fontSize: 12, letterSpacing: 0.8 }}>LAST MILE SET</SafeText>
            </View>

            {rideStatusMeta && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 99, backgroundColor: `${rideStatusMeta.color}20`, alignSelf: 'flex-start' }}>
                <Ionicons name={rideStatusMeta.icon as any} size={14} color={rideStatusMeta.color} />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: rideStatusMeta.color, fontSize: 11 }}>{rideStatusMeta.label}</SafeText>
              </View>
            )}

            <View style={{ gap: 8 }}>
              {/* Destination */}
              <View className="flex-row items-center gap-3 rounded-full bg-white/5 p-3">
                <Ionicons name="location" size={18} color="#4ADE80" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, flex: 1 }} numberOfLines={2}>
                  {destination || 'Destination set'}
                </SafeText>
              </View>

              {/* Driver name */}
              {driverName ? (
                <View className="flex-row items-center gap-3 rounded-full bg-white/5 p-3">
                  <Ionicons name="person" size={18} color="#60A5FA" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, flex: 1 }}>
                    {driverName}
                  </SafeText>
                </View>
              ) : null}

              {/* Driver phone */}
              {driverPhone ? (
                <Pressable
                  className="flex-row items-center gap-3 rounded-full bg-white/5 p-3"
                  onPress={() => Linking.openURL(`tel:${driverPhone}`)}
                >
                  <Ionicons name="call" size={18} color="#22C55E" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 13, flex: 1 }}>
                    {driverPhone}
                  </SafeText>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Mobility best route if available */}
          {mobility?.bestRoute && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.07)', padding: 18 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#4ADE80', fontSize: 12, letterSpacing: 0.8, marginBottom: 10 }}>BEST ROUTE</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16 }}>
                {`${fmtDuration(mobility.bestRoute.durationSec)} · ${(mobility.bestRoute.distanceMeters / 1000).toFixed(1)} km`}
              </SafeText>
              {mobility.origin?.label && mobility.destination?.label && (
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {mobility.origin.label} → {mobility.destination.label}
                </SafeText>
              )}
              <Pressable onPress={() => trip && router.push(({ pathname: `/trips/${trip.id}/map` } as any))} style={{ marginTop: 12 }}>
                <View style={{ borderRadius: 99, backgroundColor: '#22C55E', paddingVertical: 10, alignItems: 'center' }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#052e16', fontSize: 13 }}>View on map</SafeText>
                </View>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <>
          {/* Destination not yet set */}
          <View className='rounded-4xl' style={{ padding: 18, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', backgroundColor: 'rgba(245,158,11,0.06)' }}>
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12, letterSpacing: 0.8 }}>DESTINATION NOT YET SET</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, lineHeight: 20 }}>
              {trip?.to
                ? `Your last-mile transport to ${trip.to} hasn't been arranged yet. Set up coordination to get a driver assigned.`
                : 'Add a destination to enable last-mile transport planning.'}
            </SafeText>
          </View>

          {/* Mobility route if available */}
          {mobility?.bestRoute && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.07)', padding: 18 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#4ADE80', fontSize: 12, letterSpacing: 0.8, marginBottom: 10 }}>BEST ROUTE</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16 }}>
                {`${fmtDuration(mobility.bestRoute.durationSec)} · ${(mobility.bestRoute.distanceMeters / 1000).toFixed(1)} km`}
              </SafeText>
              {mobility.origin?.label && mobility.destination?.label && (
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  {mobility.origin.label} → {mobility.destination.label}
                </SafeText>
              )}
              <Pressable onPress={() => trip && router.push(({ pathname: `/trips/${trip.id}/map` } as any))} style={{ marginTop: 12 }}>
                <View style={{ borderRadius: 99, backgroundColor: '#22C55E', paddingVertical: 10, alignItems: 'center' }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#052e16', fontSize: 13 }}>View on map</SafeText>
                </View>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Last-mile coordination link — only for regional/international trips */}
      {!isLocalTrip && (
        <Pressable onPress={() => trip && router.push(({ pathname: `/last-mile/${trip.id}` } as any))}>
          <View className='py-6 rounded-full bg-tics-amber/35 border border-tics-amber/20' style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>Full last-mile coordination</SafeText>
          </View>
        </Pressable>
      )}
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
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 12, color: active ? '#f8fafc' : 'rgba(148,163,184,0.7)' }}>
            {label}
          </SafeText>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 p-1">
      {/* Header */}
      <View
        className='p-2 mb-4 flex-row items-center justify-between gap-2 bg-tics-amber/25 border border-tics-amber/10 rounded-full'
        style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => router.back()}
          style={{ height: 46, width: 46 }}
          className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20"
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Bookings</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }} numberOfLines={1}>
            {trip?.title ?? ''}
          </SafeText>
        </View>
      </View>

      {/* Tab strip */}
      <View className="px-1" style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <TabPill id="flight" label="Flight" />
        <TabPill id="operator" label="Operator" />
        <TabPill id="transport" label="Transport" />
      </View>

      <ScrollView className="px-1" contentContainerStyle={{ gap: 14, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {/* ─── FLIGHT TAB ─── */}
        {tab === 'flight' && (
          <View style={{ gap: 12 }}>
            <View className='rounded-4xl bg-tics-amber/25 border border-tics-amber/10' style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 12, letterSpacing: 0.8 }}>FLIGHT BOOKING</SafeText>
                <StatusPill label={statusLabel} ok={statusOk} />
              </View>

              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 18, marginBottom: 4 }}>
                {airlineName(trip?.airline) || 'Airline'} {trip?.flightNumber ?? '—'}
              </SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
                {trip?.from ?? '—'} → {trip?.to ?? '—'}
              </SafeText>

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
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }} className='flex-wrap'>
                    Destination: {Math.round(weather.tempC)}°C, {weather.description ?? ''} — {weather.riskSummary ?? 'No weather risk'}
                  </SafeText>
                </View>
              )}
            </View>

            <Pressable onPress={() => trip && router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
              <View className='rounded-full bg-tics-amber/35 border border-tics-amber/20 py-6 items-center'>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="ml-2 text-tics-text text-[15px]">Open monitoring</SafeText>
              </View>
            </Pressable>
          </View>
        )}

        {/* ─── OPERATOR TAB ─── */}
        {tab === 'operator' && (
          <OperatorSelection tripId={tripId} trip={trip} />
        )}

        {/* ─── TRANSPORT TAB ─── */}
        {tab === 'transport' && (
          <TransportTabContent trip={trip} tripId={tripId} />
        )}

      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}
