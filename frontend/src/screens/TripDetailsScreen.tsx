/**
 * TripDetailsScreen — Type-Aware Trip Details
 *
 * Automatically adapts its content based on trip.type (LOCAL, REGIONAL, INTERNATIONAL).
 * Classification happens in TripClassificationService, NOT in the UI.
 * Each trip type shows/hides relevant sections with zero empty placeholders.
 */

import { Fontisto, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useTripType, TripType } from '@/src/hooks/useTripType';
import { STATUS_META } from '@/src/utils/tripStatus';
import DestinationCarousel from '@/src/components/DestinationCarousel';
import { SafeText } from '@/src/components/responsive/SafeText';

type Tab = 'overview' | 'flights' | 'connections';

function toCode(v?: string): string {
  if (!v) return '---';
  const first = v.trim().split(/\s+/)[0] ?? '';
  if (/^[A-Z]{3}$/.test(first)) return first;
  return v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, '-') || '---';
}

/* ─── Trip Type Badge ────────────────────────────────────────────────────── */

function TripTypeBadge({ type }: { type: TripType }) {
  const config = {
    [TripType.LOCAL]: { label: 'Local Trip', color: '#22C55E', bg: 'rgba(34,197,94,0.15)', icon: 'car-outline' },
    [TripType.REGIONAL]: { label: 'Regional Trip', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: 'earth-outline' },
    [TripType.INTERNATIONAL]: { label: 'International', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', icon: 'airplane-outline' },
  }[type];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: config.bg }}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, color: config.color }}>{config.label}</SafeText>
    </View>
  );
}

/* ─── Local Trip Info Section ──────────────────────────────────────────── */

function LocalTripInfo({ trip }: { trip: any }) {
  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="car-outline" size={16} color="#22C55E" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8 }}>
          LOCAL ROAD TRIP
        </SafeText>
      </View>

      <View className="flex-col items- justify-between">
        <View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }} numberOfLines={1} ellipsizeMode="tail">{trip.from}</SafeText>
        </View>
        <View className='my-2 ml-1 flex-row items-center'>
          <View className='h-6 w-1.5 rounded absolute bg-tics-amber' />
          {/* <FontAwesome6 name="car-rear" size={16} color="black" className='ml-4' /> */}
          <View className='p-1 px-3 ml-3  rounded-full bg-tics-amber/25 border border-tics-amber/20'>
            <Text className='text-tics-amber text-xs' style={{ fontFamily: 'ShareTech_400Regular'}}>Your destination</Text>
          </View>
        </View>
        <View>
          <Text style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }} numberOfLines={2} ellipsizeMode="tail">{trip.to}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <InfoChip icon="speedometer-outline" label="Distance" value="~85 km" />
        <InfoChip icon="time-outline" label="Driving" value="~1h 30m" />
        <InfoChip icon="flash-outline" label="Fuel est." value="~UGX 35,000" />
        <InfoChip icon="business-outline" label="Parking" value="Available" />
      </View>
    </View>
  );
}

/* ─── Regional Trip Info Section ────────────────────────────────────────── */

function RegionalTripInfo({ trip, classification }: { trip: any; classification: any }) {
  const destInfo = classification?.destinationCountryInfo;
  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="earth-outline" size={16} color="#F59E0B" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12, letterSpacing: 0.8 }}>
          REGIONAL CROSSING
        </SafeText>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16 }}>{trip.from}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{classification?.originCountry || ''}</SafeText>
        </View>
        <Ionicons name="arrow-forward" size={16} color="#F59E0B" />
        <View style={{ alignItems: 'flex-end' }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 16 }}>{trip.to}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{classification?.destinationCountry || ''}</SafeText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {destInfo?.currency && <InfoChip icon="cash-outline" label="Currency" value={destInfo.currency} />}
        <InfoChip icon="documents-outline" label="Passport" value="Required" />
        <InfoChip icon="trail-sign-outline" label="Border" value="Crossing required" />
        <InfoChip icon="car-outline" label="Drive" value="Permitted" />
      </View>
    </View>
  );
}

/* ─── International Trip Info Section ───────────────────────────────────── */

function InternationalTripInfo({ trip, classification }: { trip: any; classification: any }) {
  const info = classification?.destinationCountryInfo;
  return (
    <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="airplane-outline" size={16} color="#3B82F6" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#3B82F6', fontSize: 12, letterSpacing: 0.8 }}>
          INTERNATIONAL TRAVEL
        </SafeText>
      </View>

      {/* Route */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 22 }}>{toCode(trip.from)}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }} numberOfLines={1} ellipsizeMode="tail">{trip.from}</SafeText>
        </View>
        <Fontisto name="plane" size={18} color="#3B82F6" />
        <View style={{ alignItems: 'flex-end' }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 22 }}>{toCode(trip.to)}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }} numberOfLines={1} ellipsizeMode="tail">{trip.to}</SafeText>
        </View>
      </View>

      {/* Destination info grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {info?.currency && <InfoChip icon="cash-outline" label="Currency" value={info.currency} />}
        {info?.language && <InfoChip icon="chatbubbles-outline" label="Language" value={info.language} />}
        {info?.timezone && <InfoChip icon="time-outline" label="Timezone" value={info.timezone} />}
        <InfoChip icon="documents-outline" label="Passport" value="Required" />
        <InfoChip icon="airplane-outline" label="Visa" value="Check required" />
      </View>
    </View>
  );
}

/* ─── Info Chip ──────────────────────────────────────────────────────────── */

function InfoChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View className='rounded-full p-1 pr-3' style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
      <View className='bg-white/[0.06] p-2 rounded-full'>
        <Ionicons name={icon as any} size={12} color="#94a3b8" />
      </View>
      <View>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 8 }}>{label}</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 10 }}>{value}</SafeText>
      </View>
    </View>
  );
}

/* ─── Section Header ─────────────────────────────────────────────────────── */

function SectionHeader({ title, icon, color }: { title: string; icon?: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 }}>
      {icon && <Ionicons name={icon as any} size={16} color={color || '#94a3b8'} />}
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: color || '#94a3b8', fontSize: 12, letterSpacing: 0.8 }}>
        {title.toUpperCase()}
      </SafeText>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
    </View>
  );
}

/* ─── Section Visibility Rules ───────────────────────────────────────────── */

interface SectionConfig {
  local: boolean;
  regional: boolean;
  international: boolean;
}

const SECTIONS: Record<string, SectionConfig> = {
  passport: { local: false, regional: true, international: true },
  visa: { local: false, regional: true, international: true },
  immigration: { local: false, regional: true, international: true },
  currencyExchange: { local: false, regional: true, international: true },
  flightInfo: { local: false, regional: false, international: true },
  travelInsurance: { local: false, regional: true, international: true },
  vaccination: { local: false, regional: false, international: true },
  packingChecklist: { local: false, regional: false, international: true },
  borderCrossing: { local: false, regional: true, international: false },
  drivingInfo: { local: true, regional: true, international: false },
  parking: { local: true, regional: false, international: false },
  fuelEstimate: { local: true, regional: true, international: false },
  roadConditions: { local: true, regional: true, international: false },
  nearbyAttractions: { local: true, regional: true, international: false },
  localTransport: { local: false, regional: false, international: true },
  nearbyServices: { local: true, regional: true, international: false },
  documents: { local: false, regional: true, international: true },
};

function shouldShow(section: string, type: TripType): boolean {
  const config = SECTIONS[section];
  if (!config) return true;
  return config[type.toLowerCase() as keyof SectionConfig] ?? true;
}

/* ════════════════════════════ MAIN SCREEN ════════════════════════════════ */

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

  // Trip type classification
  const tripTypeInfo = useTripType(trip);
  const { tripType, isLocal, isRegional, isInternational, classification, destinationCountryName } = tripTypeInfo;

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
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[14px]">Trip not found</SafeText>
      </View>
    );
  }

  function TabPill({ id: tabId, label: tabLabel }: { id: Tab; label: string }) {
    const active = tab === tabId;
    return (
      <Pressable
        onPress={() => setTab(tabId)}
        style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 99 }}
        className={`${active ? "bg-tics-amber/35 border border-tics-amber/20" : ""} border border-tics-amber/20`}
      >
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.9)' }}>
          {tabLabel}
        </SafeText>
      </Pressable>
    );
  }

  const statusBadge = useMemo(() => ({
    label: statusInfo.label,
    color: statusInfo.color,
    bg: statusInfo.bgColor,
  }), [statusInfo]);

  /* ── Render appropriate trip info based on type ──────────────────────── */

  function renderTripInfoSection() {
    if (isLocal) return <LocalTripInfo trip={trip} />;
    if (isRegional) return <RegionalTripInfo trip={trip} classification={classification} />;
    if (isInternational) return <InternationalTripInfo trip={trip} classification={classification} />;
    return null;
  }

  return (
    <>
      <View className="flex-1 p-1">
        {/* Header */}
        <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
          <Pressable onPress={() => router.back()} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
            <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
          </Pressable>
          <View className="flex-1 shrink">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[16px] text-tics-text" numberOfLines={1} ellipsizeMode="tail">{trip.title}</SafeText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px]" numberOfLines={1} ellipsizeMode="tail">
                {trip.flightNumber ?? ''}{trip.airline ? ` · ${typeof trip.airline === 'string' ? trip.airline : (trip.airline as any)?.name ?? ''}` : ''}
              </SafeText>
              {trip.title.length > 20 && <TripTypeBadge type={tripType} />}
            </View>
          </View>
          {canMonitor && (
            <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
              <Ionicons name="pulse" size={17} color="#fff" />
            </Pressable>
          )}
        </View>

        {/* In-page tab filters */}
        <View className="flex-row gap-2 px-1 pb-4">
          <TabPill id="overview" label="Overview" />
          <TabPill id="flights" label={isLocal ? "Route" : "Flights"} />
          <TabPill id="connections" label="Connections" />
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView className="px-1" contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>

            {/* ═══ OVERVIEW TAB ═══ */}
            {tab === 'overview' && (
              <>
                {/* Trip type specific info */}
                {renderTripInfoSection()}

                {/* Core flight/route info (shown for all types) */}
                {!isCompletedOrCancelled && (
                  <View className="bg-tics-amber/25 border border-tics-amber/10 rounded-4xl" style={{ padding: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        {trip.flightNumber ? <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{trip.flightNumber}</SafeText> : null}
                        {trip.airline ? <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{typeof trip.airline === 'string' ? trip.airline : (trip.airline as any)?.name ?? ''}</SafeText> : null}
                      </View>
                      <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: statusBadge.bg }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 11, color: statusBadge.color }}>{statusBadge.label}</SafeText>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 26 }}>{toCode(trip.from)}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{trip.from}</SafeText>
                      </View>
                      <Fontisto name={isLocal ? "car" : "plane"} size={18} color={isCompletedOrCancelled ? '#64748B' : isLocal ? '#22C55E' : '#3B82F6'} />
                      <View style={{ alignItems: 'flex-end' }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 26 }}>{toCode(trip.to)}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{trip.to}</SafeText>
                      </View>
                    </View>

                    {isCompletedOrCancelled && (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748B', fontSize: 13, textAlign: 'center' }}>
                          {isCompleted ? 'Trip completed successfully' : 'Trip was cancelled'}
                        </SafeText>
                      </View>
                    )}

                    <View style={{ borderTopWidth: 1, borderTopColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.2)' : 'rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>Departure</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 17, marginTop: 4 }}>
                          {new Date(trip.departureTime).toLocaleString([], { timeStyle: 'short' })}
                        </SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {new Date(trip.departureTime).toLocaleString([], { dateStyle: 'medium' })}
                        </SafeText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>Arrival</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 17, marginTop: 4 }}>
                          {new Date(trip.arrivalTime).toLocaleString([], { timeStyle: 'short' })}
                        </SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                          {new Date(trip.arrivalTime).toLocaleString([], { dateStyle: 'medium' })}
                        </SafeText>
                      </View>
                    </View>
                  </View>
                )}

                {/* Weather section (show for all types) */}
                {showLiveTracking && (
                  <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} style={{ opacity: 1 }}>
                    <View className="p-3 border border-tics-amber/40 bg-white/[0.06] rounded-4xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Ionicons name="partly-sunny" size={18} color="#FBBF24" />
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>WEATHER AT DESTINATION</SafeText>
                      </View>
                      {weather ? (
                        <View className='flex-row items-center justify-between bg-tics-amber/35 rounded-full px-4 py-2'>
                          <View className='flex-row gap-3 items-center'>
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 22 }}>
                              {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : '—'}
                            </SafeText>
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 3 }}>
                              {weather.description ?? ''}{weather.label ? ` · ${weather.label}` : ''}
                            </SafeText>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="rgba(248,250,252,0.3)" />
                        </View>
                      ) : (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12 }}>
                          Tap refresh on monitoring screen to load weather
                        </SafeText>
                      )}
                    </View>
                  </Pressable>
                )}

                {/* ── LOCAL: Nearby & Services Section ── */}
                {isLocal && (
                  <>
                    <SectionHeader title="Journey Info" icon="car-outline" color="#22C55E" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <InfoChip icon="restaurant-outline" label="Restaurants" value="Nearby" />
                      <InfoChip icon="bed-outline" label="Hotels" value="Available" />
                      <InfoChip icon="flash-outline" label="Fuel" value="Stations nearby" />
                      <InfoChip icon="trail-sign-outline" label="Attractions" value="Visit nearby" />
                      <InfoChip icon="car-outline" label="Traffic" value="Live updates" />
                      <InfoChip icon="calendar-outline" label="Activities" value="Weekend plans" />
                    </View>
                  </>
                )}

                {/* ── REGIONAL: Border & Documents Section ── */}
                {isRegional && (
                  <>
                    <SectionHeader title="Border Crossing" icon="trail-sign-outline" color="#F59E0B" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <InfoChip icon="documents-outline" label="Documents" value="Passport + ID" />
                      <InfoChip icon="cash-outline" label="Currency" value={classification?.destinationCountryInfo?.currency || 'Exchange'} />
                      <InfoChip icon="car-outline" label="Driving" value="Permit required" />
                      <InfoChip icon="alert-circle-outline" label="Advisories" value="Check travel" />
                      <InfoChip icon="call-outline" label="Emergency" value="Local contacts" />
                      <InfoChip icon="wifi-outline" label="Roaming" value="SIM needed" />
                    </View>
                  </>
                )}

                {/* ── INTERNATIONAL: Travel Essentials Section ── */}
                {isInternational && (
                  <>
                    <SectionHeader title="Travel Essentials" icon="airplane-outline" color="#3B82F6" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <InfoChip icon="documents-outline" label="Passport" value="Check validity" />
                      <InfoChip icon="card-outline" label="Visa" value="Verify status" />
                      <InfoChip icon="medkit-outline" label="Vaccinations" value="Check required" />
                      <InfoChip icon="umbrella-outline" label="Insurance" value="Recommended" />
                      <InfoChip icon="cash-outline" label="Currency" value={classification?.destinationCountryInfo?.currency || 'Exchange'} />
                      <InfoChip icon="chatbubbles-outline" label="Language" value={classification?.destinationCountryInfo?.language || 'Check'} />
                      <InfoChip icon="time-outline" label="Timezone" value={classification?.destinationCountryInfo?.timezone || ''} />
                      <InfoChip icon="power-outline" label="Plug Type" value="Adapter needed" />
                      <InfoChip icon="briefcase-outline" label="Packing" value="See checklist" />
                      <InfoChip icon="bed-outline" label="Hotel" value="Booked?" />
                    </View>
                  </>
                )}

                {/* Alert section */}
                <Pressable onPress={() => router.push('/alerts-center' as any)}>
                  <View style={{
                    borderWidth: activeAlert ? 0 : 1,
                    borderColor: activeAlert ? '' : 'rgb(30 86 205 / 0.3)',
                    backgroundColor: activeAlert ? 'rgba(239,68,68,0.30)' : isCompletedOrCancelled ? 'rgba(100,116,139,0.15)' : 'rgba(255,255,255,0.06)',
                    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
                  }} className="rounded-4xl">
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeAlert ? '#EF4444' : isCompletedOrCancelled ? '#64748B' : 'rgba(255,255,255,0.3)' }} />
                    <View style={{ flex: 1 }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: activeAlert ? '#EF4444' : isCompletedOrCancelled ? '#64748B' : '#94a3b8', fontSize: 14 }}>
                        {activeAlert ? activeAlert.title : isCompletedOrCancelled ? 'No active alerts' : 'No active alerts'}
                      </SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 3 }} numberOfLines={2}>
                        {activeAlert ? activeAlert.message : isCompletedOrCancelled ? 'This trip has been completed.' : 'Monitoring is running for this trip.'}
                      </SafeText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="rgba(248,250,252,0.25)" />
                  </View>
                </Pressable>

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/timeline/${trip.id}` as any)}>
                    <View className="rounded-full p-6 bg-tics-amber/35 border border-tics-amber/20" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Ionicons name="timer-outline" size={18} color="#fff" />
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>Timeline</SafeText>
                    </View>
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(({ pathname: `/bookings/${trip.id}` } as any))}>
                    <View className="bg-white/[0.05] border border-tics-amber/50 rounded-full p-6" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Ionicons name="document-text-outline" size={18} color="#1e56cd" />
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#1e56cd', fontSize: 13 }}>Bookings</SafeText>
                    </View>
                  </Pressable>
                </View>

                {/* Coordinate Journey CTA — only for regional/international trips (last-mile coordination) */}
                {!isLocal && (
                  <Pressable onPress={() => router.push(({ pathname: `/last-mile/${trip.id}` } as any))} className="active:opacity-90">
                    <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 18 }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>
                        COORDINATE JOURNEY
                      </SafeText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="car" size={20} color="#22C55E" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14 }}>
                            Ground Transport
                          </SafeText>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                            {trip.to ? `From ${trip.to} to your final destination` : 'Set up your last-mile pickup'}
                          </SafeText>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                      </View>
                    </View>
                  </Pressable>
                )}
              </>
            )}

            {/* ═══ FLIGHTS / ROUTE TAB ═══ */}
            {tab === 'flights' && (
              <View style={{ gap: 12 }}>
                <View style={{ padding: 18 }} className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10">
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#64748B' : isLocal ? '#22C55E' : '#60A5FA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>
                    {isLocal ? 'ROUTE DETAILS' : isCompletedOrCancelled ? 'FLIGHT SUMMARY' : 'LIVE FLIGHT DATA'}
                  </SafeText>

                  {isLocal ? (
                    /* Local: show driving route info */
                    [
                      { label: 'From', value: trip.from },
                      { label: 'To', value: trip.to },
                      { label: 'Distance', value: '~85 km' },
                      { label: 'Est. Driving', value: '~1h 30m' },
                      { label: 'Status', value: isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : 'Active', color: isCompleted ? '#64748B' : isCancelled ? '#EF4444' : '#22C55E' },
                    ].map((row, i) => (
                      <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{row.label}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: (row as any).color ?? '#f8fafc', fontSize: 13 }}>{row.value}</SafeText>
                      </View>
                    ))
                  ) : (
                    /* Regional/International: show flight info */
                    [
                      { label: 'Flight', value: trip.flightNumber ?? '—' },
                      { label: 'Airline', value: typeof trip.airline === 'string' ? trip.airline : (trip.airline as any)?.name ?? '—' },
                      { label: 'Status', value: isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : flight?.status ? flight.status.charAt(0).toUpperCase() + flight.status.slice(1) : 'Scheduled', color: isCompleted ? '#64748B' : isCancelled ? '#EF4444' : flight?.status === 'active' ? '#22C55E' : flight?.status === 'canceled' ? '#EF4444' : '#94a3b8' },
                      ...(isInternational ? [
                        { label: 'Gate', value: showLiveTracking && flight?.gate ? flight.gate : '—', color: flight?.gate ? '#60A5FA' : undefined },
                        { label: 'Terminal', value: showLiveTracking && flight?.terminal ? flight.terminal : '—', color: flight?.terminal ? '#A78BFA' : undefined },
                      ] : []),
                      ...(isRegional ? [
                        { label: 'Border Crossing', value: 'Required', color: '#F59E0B' },
                        { label: 'Documents', value: 'Passport + ID' },
                      ] : []),
                      { label: 'Delay', value: showLiveTracking && flight?.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None', color: flight?.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E' },
                    ].map((row, i, arr) => (
                      <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{row.label}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: (row as any).color ?? '#f8fafc', fontSize: 13 }}>{row.value}</SafeText>
                      </View>
                    ))
                  )}

                  {isCompletedOrCancelled && (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748B', fontSize: 12, lineHeight: 18 }}>
                        {isCompleted ? 'This trip has been completed. View the timeline for the full journey.' : 'This trip was cancelled.'}
                      </SafeText>
                    </View>
                  )}
                </View>

                {canMonitor && (
                  <Pressable onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}>
                    <View className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-6" style={{ alignItems: 'center' }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>Open full monitoring</SafeText>
                    </View>
                  </Pressable>
                )}
              </View>
            )}

            {/* ═══ CONNECTIONS TAB ═══ */}
            {tab === 'connections' && (
              <View style={{ gap: 12 }}>
                <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 18 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#64748B' : '#A78BFA', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>ROUTE</SafeText>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 22 }}>{toCode(trip.from)}</SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        {new Date(trip.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </SafeText>
                    </View>
                    <View style={{ flex: 1, height: 1, backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.3)' : 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                    <Ionicons name={isLocal ? "car" : "airplane"} size={16} color={isCompletedOrCancelled ? '#64748B' : '#8B5CF6'} />
                    <View style={{ flex: 1, height: 1, backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.3)' : 'rgba(139,92,246,0.3)', marginHorizontal: 10 }} />
                    <View style={{ alignItems: 'flex-end' }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 22 }}>{toCode(trip.to)}</SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        {new Date(trip.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </SafeText>
                    </View>
                  </View>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
                    {Array.isArray(trip.timeline) && trip.timeline.length > 1 ? 'Multi-leg route' : isLocal ? 'Direct road trip' : 'Direct flight'}
                  </SafeText>
                </View>

                {Array.isArray(trip.timeline) && trip.timeline.length > 0 ? (
                  trip.timeline.map((step: any, i: number) => (
                    <View key={i} className="rounded-4xl" style={{ borderWidth: 1, borderColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.15)' : 'rgba(255,255,255,0.08)', backgroundColor: isCompletedOrCancelled ? 'rgba(100,116,139,0.04)' : 'rgba(255,255,255,0.04)', padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Ionicons name="ellipse" size={8} color={isCompletedOrCancelled ? '#64748B' : '#8B5CF6'} />
                      <View style={{ flex: 1 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: isCompletedOrCancelled ? '#94a3b8' : '#f8fafc', fontSize: 13 }}>{step.label}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                          {new Date(step.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </SafeText>
                      </View>
                    </View>
                  ))
                ) : (
                  <View className="rounded-full" style={{ borderWidth: 1, borderColor: isCompletedOrCancelled ? 'rgba(30,86,205, 0.5)' : 'rgba(255,255,255,0.08)', backgroundColor: isCompletedOrCancelled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)', padding: 14 }}>
                    <Text style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                      {isLocal ? 'No stops saved. Add stops along your route.' : 'No layovers saved. Add connecting flights for full connection intelligence.'}
                    </Text>
                  </View>
                )}

                {!isCompletedOrCancelled && !isLocal && (
                  <Pressable onPress={() => router.push(({ pathname: `/last-mile/${trip.id}` } as any))} className="active:opacity-90">
                    <View className="rounded-4xl bg-tics-amber/25 border border-tics-amber/10" style={{ padding: 18 }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12, letterSpacing: 0.8, marginBottom: 12 }}>
                        LAST MILE
                      </SafeText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="car" size={20} color="#22C55E" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14 }}>Ground Transport</SafeText>
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                            {trip.to ? `From ${trip.to} to your final destination` : 'Set up your last-mile pickup'}
                          </SafeText>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        <Pressable onPress={() => router.push(({ pathname: `/last-mile/${trip.id}` } as any))} className="bg-tics-amber/35 border border-tics-amber/20 flex-1 items-center p-6 rounded-full">
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>Coordinate</SafeText>
                        </Pressable>
                        <Pressable onPress={() => router.push(({ pathname: `/trips/${trip.id}/map` } as any))} className="bg-white/[0.05] border border-tics-amber/50 flex-1 items-center p-6 rounded-full">
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(248,250,252,0.8)', fontSize: 13 }}>View Map</SafeText>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                )}
              </View>
            )}

            <DestinationCarousel trip={trip} />

          </ScrollView>
        </View>
      </View>
      <PersistentTabBar />
    </>
  );
}