/**
 * TravelMonitoringScreen
 * Real-time trip monitoring dashboard.
 * - Overview tab: flight card, timeline, weather with risk score
 * - Flight tab: live gate/terminal/delay from AviationStack
 * - Connections tab: route & risk
 * - Share button: generates dynamic update via Cloud Function
 * - Refresh button: triggers full monitoring cycle
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Card from '@/src/components/Card';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { refreshTripMonitoring, generateShareUpdate } from '@/src/firebase/callables';

type TabKey = 'overview' | 'flight' | 'connections';

/* ── Utilities ──────────────────────────────────────────────────────────────── */

/** Extract the 3-letter IATA code from "EBB Entebbe" or fallback to first 3 chars */
function toCode(v?: string): string {
  if (!v) return '---';
  const firstToken = v.trim().split(/\s+/)[0] ?? '';
  if (/^[A-Z]{3}$/.test(firstToken)) return firstToken;
  const alpha = v.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return alpha.slice(0, 3).padEnd(3, '-') || '---';
}

/** Format duration in minutes to "Xh Ym" */
function formatMins(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4">
      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px]">
        {label}
      </Text>
      <Text style={{ fontFamily: 'Syne_600SemiBold', color: valueColor ?? 'rgba(248,250,252,0.9)' }} className="text-[13px]">
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ value, positive }: { value: string; positive: boolean }) {
  return (
    <View className={['rounded-full border px-3 py-1', positive ? 'border-tics-green/35 bg-tics-green/15' : 'border-tics-amber/35 bg-tics-amber/15'].join(' ')}>
      <Text style={{ fontFamily: 'Syne_500Medium' }} className={['text-[11px]', positive ? 'text-tics-green' : 'text-tics-amber'].join(' ')}>
        {value}
      </Text>
    </View>
  );
}

/** Weather risk color */
function riskColor(score: number): string {
  if (score >= 7) return '#EF4444';
  if (score >= 4) return '#F59E0B';
  if (score >= 2) return '#3B82F6';
  return '#22C55E';
}

function WeatherRiskBar({ score }: { score: number }) {
  const color = riskColor(score);
  const label = score >= 7 ? 'Severe' : score >= 4 ? 'Moderate' : score >= 2 ? 'Mild' : 'Clear';
  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between mb-1">
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">Weather risk</Text>
        <Text style={{ fontFamily: 'Syne_700Bold', color, fontSize: 11 }}>{label} ({score}/10)</Text>
      </View>
      <View className="h-2 rounded-full bg-white/10 overflow-hidden">
        <View style={{ width: `${score * 10}%`, height: '100%', backgroundColor: color, borderRadius: 99 }} />
      </View>
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────────── */

export default function TravelMonitoringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [tab, setTab] = useState<TabKey>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const uid = useAuthStore((s) => s.token);
  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(
    () => trips.find((t) => String(t.id) === String(tripId)) ?? trips[0] ?? null,
    [tripId, trips],
  );

  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const now = Date.now();
  const departureMs = trip ? Date.parse(trip.departureTime) : NaN;
  const arrivalMs = trip ? Date.parse(trip.arrivalTime) : NaN;

  const progress = useMemo(() => {
    if (!Number.isFinite(departureMs) || !Number.isFinite(arrivalMs) || arrivalMs <= departureMs) return 0;
    if (now <= departureMs) return 0;
    if (now >= arrivalMs) return 1;
    return (now - departureMs) / (arrivalMs - departureMs);
  }, [arrivalMs, departureMs, now]);

  const remainingLabel = useMemo(() => {
    if (!Number.isFinite(arrivalMs)) return '—';
    const mins = Math.max(0, Math.round((arrivalMs - now) / 60_000));
    return formatMins(mins);
  }, [arrivalMs, now]);

  const hoursUntilDep = Number.isFinite(departureMs)
    ? Math.max(0, (departureMs - now) / 3_600_000)
    : null;

  const onTime = trip?.monitoringStatus !== 'at_risk';

  const flightStatusColor: Record<string, string> = {
    scheduled: '#3B82F6', active: '#22C55E', landed: '#14B8A6',
    canceled: '#EF4444', unknown: '#94A3B8',
  };

  async function handleRefresh() {
    if (!trip || !uid || refreshing) return;
    setRefreshing(true);
    try {
      await refreshTripMonitoring(trip.id);
      Alert.alert('Updated', 'Weather, flight and alerts refreshed.');
    } catch (e: any) {
      Alert.alert('Refresh failed', e?.message ?? 'Please try again.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleShare() {
    if (!trip) return;
    setSharing(true);
    try {
      const { shareText } = await generateShareUpdate(trip.id);
      await Share.share({ message: shareText, title: trip.title });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message ?? 'Could not generate share update.');
    } finally {
      setSharing(false);
    }
  }

  function Pill(key: TabKey, label: string) {
    const active = tab === key;
    return (
      <Pressable key={key} onPress={() => setTab(key)} className={['rounded-full px-4 py-2', active ? 'bg-tics-blue' : ''].join(' ')}>
        <Text style={{ fontFamily: 'Syne_500Medium' }} className={['text-center text-[12px]', active ? 'text-tics-text' : 'text-tics-muted'].join(' ')}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>

      {/* ── Header ── */}
      <View className="flex-row px-2 items-center justify-between mb-4">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.06]"
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>

        <View className="items-center">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[17px]">
            Travel Monitoring
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-0.5 text-tics-muted text-[11px]">
            {trip?.airline ?? trip?.flightNumber ?? 'Flight tracking'}
          </Text>
        </View>

        <View className="flex-row gap-2">
          {/* Share */}
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            className="h-11 w-11 items-center justify-center rounded-xl bg-tics-amber"
          >
            {sharing
              ? <ActivityIndicator size={14} color="rgba(248,250,252,0.75)" />
              : <Ionicons name="share-social-outline" size={17} color="rgba(10,11,30,0.85)" />}
          </Pressable>
          {/* Refresh */}
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            className="h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-tics-amber"
          >
            {refreshing
              ? <ActivityIndicator size={14} color="#000" />
              : <Ionicons name="refresh" size={17} color="rgba(10,11,30,0.85)" />}
          </Pressable>
        </View>
      </View>

      {/* ── Tab pills ── */}
      <View className="flex-row gap-2 px-2 mb-4">
        {Pill('overview', 'Overview')}
        {Pill('flight', 'Flight')}
        {Pill('connections', 'Connections')}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 112, gap: 16, paddingHorizontal: 8 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════════════════════════
            FLIGHT PROGRESS CARD — always visible in all tabs
        ══════════════════════════════════════════════════════════ */}
        <Card accent="blue" className="px-5 py-5 bg-tics-blue/30 rounded-2xl">
          <View className="flex-row items-center justify-between">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px]">
              {trip?.flightNumber ?? 'Flight'}{trip?.airline ? ` · ${trip.airline}` : ''}
            </Text>
            <StatusBadge value={onTime ? 'On Track' : 'At Risk'} positive={onTime} />
          </View>

          {/* Route */}
          <View className="mt-5 flex-row items-center justify-between">
            <View>
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[26px]">
                {toCode(trip?.from)}
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-muted text-[11px]" numberOfLines={1}>
                {trip?.from ?? '—'}
              </Text>
            </View>
            <View className="items-center flex-1 px-2">
              <Ionicons name="airplane" size={22} color="#3b82f6" />
              {hoursUntilDep != null && hoursUntilDep > 0 && (
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-muted text-[9px]">
                  {hoursUntilDep < 1 ? `${Math.round(hoursUntilDep * 60)}m away` : `${Math.round(hoursUntilDep)}h away`}
                </Text>
              )}
            </View>
            <View className="items-end">
              <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[26px]">
                {toCode(trip?.to)}
              </Text>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-muted text-[11px]" numberOfLines={1}>
                {trip?.to ?? '—'}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <View className="h-2 rounded-full bg-tics-blue" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>

          {/* Gate / Terminal / Remaining */}
          <View className="mt-4 flex-row justify-between">
            <View>
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] uppercase tracking-wide">Gate</Text>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: flight?.gate ? '#60A5FA' : 'rgba(248,250,252,0.3)' }} className="mt-1 text-[18px]">
                {flight?.gate ?? '—'}
              </Text>
            </View>
            <View className="items-center">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] uppercase tracking-wide">Terminal</Text>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: flight?.terminal ? '#A78BFA' : 'rgba(248,250,252,0.3)' }} className="mt-1 text-[18px]">
                {flight?.terminal ?? '—'}
              </Text>
            </View>
            <View className="items-end">
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] uppercase tracking-wide">Remaining</Text>
              <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="mt-1 text-tics-text text-[18px]">
                {remainingLabel}
              </Text>
            </View>
          </View>

          {/* Delay banner */}
          {flight?.delayMinutes != null && flight.delayMinutes > 0 && (
            <View className="mt-4 flex-row items-center gap-3 rounded-xl border border-tics-amber/30 bg-tics-amber/10 px-4 py-3">
              <Ionicons name="warning-outline" size={18} color="#F59E0B" />
              <View className="flex-1">
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-amber text-[12px]">
                  Delayed {flight.delayMinutes} minutes
                </Text>
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mt-0.5">
                  Status: {flight.status} · Check airline app for latest
                </Text>
              </View>
            </View>
          )}

          {/* No flight data prompt */}
          {!flight && (
            <Pressable onPress={handleRefresh} disabled={refreshing} className="mt-4 active:opacity-70">
              <View className="flex-row items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                {refreshing
                  ? <ActivityIndicator size={14} color="rgba(248,250,252,0.4)" />
                  : <Ionicons name="refresh-outline" size={15} color="rgba(248,250,252,0.4)" />}
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] flex-1">
                  {refreshing ? 'Loading flight data…' : 'Tap to fetch live gate, terminal & delay'}
                </Text>
              </View>
            </Pressable>
          )}
        </Card>

        {/* ══════════════════════════════════════════════════════════
            OVERVIEW TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <>
            {/* Timeline summary */}
            <Card accent="green" className="py-5">
              <View className="flex-row items-center justify-between mb-4">
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">Timeline</Text>
                {trip && (
                  <Pressable
                    onPress={() => router.push(({ pathname: `/timeline/${trip.id}` } as any))}
                    className="flex-row items-center gap-1 bg-tics-amber/20 border border-tics-amber/35 rounded-full px-3 py-1"
                  >
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-[12px] text-tics-muted">Full view</Text>
                    <Ionicons name="chevron-forward" size={12} color="rgba(248,250,252,0.55)" />
                  </Pressable>
                )}
              </View>
              <View className="gap-3">
                {[
                  {
                    label: 'Departure',
                    value: trip?.departureTime ? new Date(trip.departureTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                    color: '#3B82F6',
                  },
                  {
                    label: 'Monitoring Status',
                    value: onTime ? 'On Track' : 'At Risk',
                    color: onTime ? '#22C55E' : '#F59E0B',
                  },
                  {
                    label: 'Arrival',
                    value: trip?.arrivalTime ? new Date(trip.arrivalTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
                    color: '#22C55E',
                  },
                ].map((row) => (
                  <View key={row.label} className="flex-row items-center justify-between rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4">
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px]">{row.label}</Text>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: row.color }} className="text-[12px]">{row.value}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Weather card */}
            <Card accent="blue" className="py-5">
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="partly-sunny" size={20} color="#FBBF24" />
                  <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">
                    Weather at Destination
                  </Text>
                </View>
                {weather?.tempC != null && (
                  <View className="rounded-full border border-tics-amber/35 bg-tics-amber/15 px-3 py-1">
                    <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-amber text-[14px]">
                      {Math.round(weather.tempC)}°C
                    </Text>
                  </View>
                )}
              </View>

              {weather ? (
                <View className="mt-3 gap-2">
                  <InfoRow label="Location" value={weather.label} />
                  {weather.description && (
                    <InfoRow
                      label="Conditions"
                      value={weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}
                    />
                  )}
                  {weather.tempC != null && (
                    <InfoRow label="Temperature" value={`${Math.round(weather.tempC)}°C${weather.feelsLikeC != null ? ` · feels ${Math.round(weather.feelsLikeC)}°C` : ''}`} valueColor="#FBBF24" />
                  )}
                  {weather.humidity != null && (
                    <InfoRow label="Humidity" value={`${weather.humidity}%`} />
                  )}
                  {weather.windKph != null && (
                    <InfoRow label="Wind" value={`${weather.windKph} km/h`} />
                  )}
                  {/* Risk bar */}
                  <WeatherRiskBar score={weather.riskScore} />
                  {/* AI summary */}
                  {weather.riskSummary && (
                    <View className="mt-2 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-3">
                      <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] leading-5">
                        {weather.riskSummary}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Pressable
                  onPress={handleRefresh}
                  disabled={refreshing}
                  className="mt-4 flex-row items-center gap-2 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4 active:opacity-70"
                >
                  {refreshing
                    ? <ActivityIndicator size={16} color="#FBBF24" />
                    : <Ionicons name="cloud-outline" size={20} color="rgba(248,250,252,0.3)" />}
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] flex-1">
                    {refreshing ? 'Loading weather…' : `Tap to load weather at ${trip?.to ?? 'destination'}`}
                  </Text>
                  {!refreshing && <Ionicons name="refresh-outline" size={14} color="rgba(248,250,252,0.25)" />}
                </Pressable>
              )}
            </Card>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            FLIGHT TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === 'flight' && (
          <Card accent="blue" className="py-5">
            <View className="flex-row items-center gap-2 mb-4">
              <Ionicons name="airplane" size={18} color="#3B82F6" />
              <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">Flight Monitoring</Text>
            </View>

            {flight ? (
              <View className="gap-3">
                <InfoRow
                  label="Status"
                  value={flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}
                  valueColor={flightStatusColor[flight.status] ?? '#94A3B8'}
                />
                <InfoRow label="Gate" value={flight.gate ?? 'Not assigned'} valueColor={flight.gate ? '#60A5FA' : undefined} />
                <InfoRow label="Terminal" value={flight.terminal ?? 'Not assigned'} valueColor={flight.terminal ? '#A78BFA' : undefined} />
                <InfoRow
                  label="Delay"
                  value={flight.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} minutes` : 'None reported'}
                  valueColor={flight.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E'}
                />
                {flight.departureActual && (
                  <InfoRow
                    label="Actual departure"
                    value={new Date(flight.departureActual).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    valueColor="#60A5FA"
                  />
                )}

                {flight.delayMinutes != null && flight.delayMinutes >= 30 && (
                  <View className="mt-2 rounded-xl border border-tics-amber/30 bg-tics-amber/10 px-4 py-3 gap-1">
                    <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-amber text-[12px]">
                      ⚠ {flight.delayMinutes >= 120 ? 'Significant' : 'Moderate'} delay — {flight.delayMinutes} minutes
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] leading-5">
                      {flight.delayMinutes >= 120
                        ? 'Consider contacting your airline about rebooking or lounge access.'
                        : 'Monitor the airline app for gate and boarding time updates.'}
                    </Text>
                  </View>
                )}

                {flight.status === 'canceled' && (
                  <View className="mt-2 rounded-xl border border-tics-red/30 bg-tics-red/10 px-4 py-3 gap-1">
                    <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-red text-[12px]">
                      Flight canceled
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] leading-5">
                      Contact your airline immediately. You are entitled to a full refund or free rebooking.
                    </Text>
                  </View>
                )}

                {/* Ask AI CTA */}
                <Pressable
                  onPress={() => trip && router.push(({ pathname: '/assistant', params: { tripId: trip.id } } as any))}
                  className="mt-2 flex-row items-center justify-center gap-2 rounded-xl border border-tics-blue/30 bg-tics-blue/10 px-4 py-3"
                >
                  <Ionicons name="sparkles-outline" size={16} color="#60A5FA" />
                  <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-blue text-[12px]">
                    Ask AI about this flight
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="gap-3">
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] leading-5">
                  {trip?.flightNumber
                    ? `Waiting for live data for flight ${trip.flightNumber}. Tap refresh to query AviationStack.`
                    : 'No flight number set for this trip. Add a flight number to enable live gate and delay tracking.'}
                </Text>
                <Pressable
                  onPress={handleRefresh}
                  disabled={refreshing}
                  className="flex-row items-center justify-center gap-2 rounded-xl border border-tics-blue/35 bg-tics-blue/15 px-4 py-4"
                >
                  {refreshing ? <ActivityIndicator size={16} color="#3b82f6" /> : <Ionicons name="refresh" size={18} color="#3B82F6" />}
                  <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-blue text-[13px]">
                    {refreshing ? 'Fetching live data…' : 'Fetch live flight data'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>
        )}

        {/* ══════════════════════════════════════════════════════════
            CONNECTIONS TAB
        ══════════════════════════════════════════════════════════ */}
        {tab === 'connections' && (
          <View className="gap-4">
            <Card accent="purple" className="py-5">
              <View className="flex-row items-center gap-2 mb-4">
                <Ionicons name="git-network-outline" size={18} color="#8B5CF6" />
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">Route & Connections</Text>
              </View>

              {/* Main leg */}
              <View className="rounded-xl bg-tics-purple/30 px-4 py-4 mb-3">
                <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] uppercase tracking-wide mb-3">
                  Main leg
                </Text>
                <View className="flex-row items-center gap-3">
                  <View className="items-center">
                    <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[20px]">{toCode(trip?.from)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] mt-0.5">
                      {trip?.departureTime ? new Date(trip.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </Text>
                  </View>
                  <View className="flex-1 items-center">
                    <View className="flex-row items-center gap-1 w-full">
                      <View className="flex-1 h-px bg-tics-purple/30" />
                      <Ionicons name="airplane" size={16} color="#8B5CF6" />
                      <View className="flex-1 h-px bg-tics-purple/30" />
                    </View>
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] mt-1">
                      {trip?.flightNumber ?? 'Direct'}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[20px]">{toCode(trip?.to)}</Text>
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px] mt-0.5">
                      {trip?.arrivalTime ? new Date(trip.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </Text>
                  </View>
                </View>

                {Number.isFinite(departureMs) && Number.isFinite(arrivalMs) && (
                  <View className="mt-3 pt-3 border-t border-white/10">
                    <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
                      Flight duration:{' '}
                      <Text className="text-tics-text">{formatMins(Math.round((arrivalMs - departureMs) / 60_000))}</Text>
                    </Text>
                  </View>
                )}
              </View>

              {/* Timeline steps */}
              {Array.isArray(trip?.timeline) && trip!.timeline.length > 0 ? (
                <View className="gap-2">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px] mb-1">Saved itinerary steps</Text>
                  {trip!.timeline.map((t: any, i: number) => (
                    <View key={i} className="flex-row items-center gap-3 rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-3">
                      <Ionicons name="ellipse" size={8} color="#8B5CF6" />
                      <View className="flex-1">
                        <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[12px]">{t.label}</Text>
                        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
                          {new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="rounded-xl border border-[#96C7B3]/50 bg-white/[0.06] px-4 py-4">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] leading-5">
                    Direct flight. Multi-leg intelligence activates when you add layovers to your itinerary.
                  </Text>
                </View>
              )}
            </Card>

            {/* Connection risk */}
            <Card accent="none" className="py-5">
              <View className="flex-row items-center gap-2 mb-3">
                <Ionicons name="pulse-outline" size={18} color="#22C55E" />
                <Text style={{ fontFamily: 'Syne_600SemiBold' }} className="text-tics-text text-[14px]">Connection Risk</Text>
              </View>
              <View className="gap-2">
                <InfoRow
                  label="Route type"
                  value={Array.isArray(trip?.timeline) && trip!.timeline.length > 1 ? 'Multi-leg' : 'Direct'}
                  valueColor="#22C55E"
                />
                <InfoRow
                  label="Flight risk"
                  value={onTime ? 'Low' : 'Elevated'}
                  valueColor={onTime ? '#22C55E' : '#F59E0B'}
                />
                {weather && (
                  <InfoRow
                    label="Weather risk"
                    value={weather.riskScore >= 7 ? 'Severe' : weather.riskScore >= 4 ? 'Moderate' : weather.riskScore >= 2 ? 'Mild' : 'Clear'}
                    valueColor={riskColor(weather.riskScore)}
                  />
                )}
              </View>
              {flight?.delayMinutes != null && flight.delayMinutes >= 30 && (
                <View className="mt-3 rounded-xl border border-tics-amber/30 bg-tics-amber/10 px-4 py-3">
                  <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-amber text-[12px] leading-5">
                    ⚠ Current delay of {flight.delayMinutes} min may impact onward connections. Contact your airline.
                  </Text>
                </View>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      <PersistentTabBar />
    </View>
  );
}
