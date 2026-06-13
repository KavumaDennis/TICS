/**
 * DisruptionAlertScreen — rich alert detail view.
 * Shows the full alert with:
 * - Dynamic content from alert document
 * - Live flight context (when available)
 * - Live weather context (for weather alerts)
 * - Recommended action
 * - Data source attribution
 * - Ask AI, Share, Save CTAs
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAlertStore } from '@/src/store/alertStore';
import { useTripStore } from '@/src/store/tripStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useSaveStore } from '@/src/store/saveStore';
import { generateShareUpdate } from '@/src/firebase/callables';

/* ── Severity config ─────────────────────────────────────────────────────── */

const SEV = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.30)', border: 'rgba(239,68,68,0.28)', icon: 'alert-circle' as const, label: 'CRITICAL' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.30)', border: 'rgba(245,158,11,0.28)', icon: 'warning' as const, label: 'WARNING' },
  info: { color: '#3B82F6', bg: 'rgba(59,130,246,0.30)', border: 'rgba(59,130,246,0.28)', icon: 'information-circle' as const, label: 'INFO' },
  low: { color: '#22C55E', bg: 'rgba(34,197,94,0.30)', border: 'rgba(34,197,94,0.28)', icon: 'checkmark-circle' as const, label: 'LOW' },
} as const;

const CAT_LABEL: Record<string, string> = {
  flight: 'Flight', weather: 'Weather', transport: 'Transport', general: 'General',
  check_in: 'Check-in', boarding: 'Boarding', gate: 'Gate', baggage: 'Baggage',
};

const SOURCE_LABEL: Record<string, string> = {
  openweather: 'OpenWeather API',
  aviationstack: 'AviationStack API',
  ai: 'TICS AI',
  system: 'TICS Monitoring',
};

/* ── Info row helper ─────────────────────────────────────────────────────── */
function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{label}</Text>
      <Text style={{ fontFamily: 'Syne_600SemiBold', color: color ?? '#f8fafc', fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */
export default function DisruptionAlertScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const trips = useTripStore((s) => s.trips);
  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const { save, isSaved } = useSaveStore();
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { alert, trip } = useMemo(() => {
    for (const t of trips) {
      const found = (alertsByTripId[t.id] ?? []).find((a) => String(a.id) === String(id));
      if (found) return { alert: found, trip: t };
    }
    return { alert: null, trip: null };
  }, [alertsByTripId, id, trips]);

  // Live context from stores
  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const sevKey = (alert?.severity ?? 'info') as keyof typeof SEV;
  const cfg = SEV[sevKey] ?? SEV.info;
  const catLabel = CAT_LABEL[alert?.category ?? 'general'] ?? 'Alert';
  const alreadySaved = alert ? isSaved(alert.id) : false;

  const timeLabel = alert?.createdAt?.toDate
    ? new Date(alert.createdAt.toDate()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  // Should we show flight context?
  const showFlight = flight && ['flight', 'gate', 'boarding', 'check_in'].includes(alert?.category ?? '');
  // Should we show weather context?
  const showWeather = weather && alert?.category === 'weather';

  /* ── Handlers ── */
  async function handleShare() {
    if (!trip) return;
    setSharing(true);
    try {
      const { shareText } = await generateShareUpdate(trip.id);
      await Share.share({ message: shareText, title: `TICS: ${trip.title}` });
    } catch {
      await Share.share({
        message: `${alert?.title ?? 'Alert'}\n${alert?.message ?? ''}\n\nShared via TICS`,
        title: alert?.title ?? 'TICS Alert',
      }).catch(() => { });
    } finally { setSharing(false); }
  }

  async function handleSave() {
    if (!alert || !trip) return;
    setSaving(true);
    try {
      await save({
        itemId: alert.id, itemType: 'alert', tripId: trip.id,
        data: { title: alert.title, message: alert.message, severity: alert.severity, category: alert.category },
      });
      Alert.alert('Saved', 'Alert saved to your collection.');
    } catch { Alert.alert('Error', 'Could not save alert.'); }
    finally { setSaving(false); }
  }

  /* ── Not found ── */
  if (!alert) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b1e', paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Ionicons name="notifications-off-outline" size={48} color="rgba(148,163,184,0.25)" />
          <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 15, marginTop: 16 }}>Alert not found</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#475569', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            This alert may have been resolved or cleared. Return to Alerts Center to see current alerts.
          </Text>
        </View>
      </View>
    );
  }

  /* ── Main render ── */
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0b1e', paddingTop: insets.top + 8 }}>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingBottom: 14 }}>
        <Pressable className='border border-[#96C7B3]/50 bg-white/[0.06]' onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <LinearGradient
          colors={[cfg.bg.replace('0.10', '0.22'), cfg.bg.replace('0.10', '0.06')] as [string, string]}
          style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: cfg.border }}
        >
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: cfg.color, fontSize: 10, letterSpacing: 1 }}>
            {catLabel.toUpperCase()} · {cfg.label}
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }} numberOfLines={1}>
            {trip?.title ?? 'Your trip'}
          </Text>
        </View>
        {/* Read indicator */}
        {!alert.read && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={{ backgroundColor: cfg.bg, borderRadius: 20, padding: 20, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: cfg.color }} />
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 20, lineHeight: 28, marginTop: 4 }}>
            {alert.title}
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 14, lineHeight: 22, marginTop: 10 }}>
            {alert.message}
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(100,116,139,0.7)', fontSize: 11, marginTop: 12 }}>
            {timeLabel}
          </Text>
        </View>

        {/* ── Recommended action ── */}
        {alert.recommendation && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', backgroundColor: 'rgba(251,191,36,0.07)', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="bulb-outline" size={16} color="#FBBF24" />
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#FBBF24', fontSize: 11, letterSpacing: 0.8 }}>
                RECOMMENDED ACTION
              </Text>
            </View>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#f8fafc', fontSize: 13, lineHeight: 20 }}>
              {alert.recommendation}
            </Text>
          </View>
        )}

        {/* ── Live flight context (for flight/gate/boarding alerts) ── */}
        {showFlight && flight && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(59,130,246,0.22)', backgroundColor: 'rgba(59,130,246,0.07)', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="airplane-outline" size={15} color="#60A5FA" />
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#60A5FA', fontSize: 11, letterSpacing: 0.8 }}>LIVE FLIGHT STATUS</Text>
            </View>
            <InfoRow label="Flight" value={`${trip?.flightNumber ?? '—'}${trip?.airline ? ' · ' + trip.airline : ''}`} />
            <InfoRow
              label="Status"
              value={flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}
              color={flight.status === 'active' ? '#22C55E' : flight.status === 'canceled' ? '#EF4444' : '#94a3b8'}
            />
            <InfoRow label="Gate" value={flight.gate ?? 'TBC'} color={flight.gate ? '#60A5FA' : '#64748b'} />
            <InfoRow label="Terminal" value={flight.terminal ?? 'TBC'} color={flight.terminal ? '#A78BFA' : '#64748b'} />
            <InfoRow
              label="Delay"
              value={flight.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None'}
              color={flight.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E'}
            />
          </View>
        )}

        {/* ── Live weather context (for weather alerts) ── */}
        {showWeather && weather && (
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(249,115,22,0.22)', backgroundColor: 'rgba(249,115,22,0.07)', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="partly-sunny-outline" size={15} color="#F97316" />
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#F97316', fontSize: 11, letterSpacing: 0.8 }}>LIVE WEATHER CONDITIONS</Text>
            </View>
            <InfoRow label="Location" value={weather.label} />
            {weather.description && (
              <InfoRow label="Conditions" value={weather.description.charAt(0).toUpperCase() + weather.description.slice(1)} />
            )}
            {weather.tempC != null && (
              <InfoRow
                label="Temperature"
                value={`${Math.round(weather.tempC)}°C${weather.feelsLikeC != null ? ` (feels ${Math.round(weather.feelsLikeC)}°C)` : ''}`}
                color="#FBBF24"
              />
            )}
            {weather.windKph != null && <InfoRow label="Wind" value={`${weather.windKph} km/h`} />}
            {/* Risk bar */}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Disruption risk</Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: weather.riskScore >= 6 ? '#EF4444' : weather.riskScore >= 3 ? '#F59E0B' : '#22C55E', fontSize: 11 }}>
                  {weather.riskScore}/10
                </Text>
              </View>
              <View style={{ height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${weather.riskScore * 10}%`, height: '100%', backgroundColor: weather.riskScore >= 6 ? '#EF4444' : weather.riskScore >= 3 ? '#F59E0B' : '#22C55E', borderRadius: 99 }} />
              </View>
            </View>
          </View>
        )}

        {/* ── Source attribution ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
          <Ionicons name="shield-checkmark-outline" size={13} color="rgba(100,116,139,0.5)" />
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#334155', fontSize: 11 }}>
            Source: {SOURCE_LABEL[alert.source ?? 'system'] ?? 'TICS Monitoring'} · {catLabel}
          </Text>
        </View>

        {/* ── Action buttons ── */}
        <View style={{ gap: 10 }}>
          {/* Ask AI */}
          <Pressable
            onPress={() => router.push(({ pathname: '/assistant', params: { tripId: trip?.id } } as any))}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: cfg.border, backgroundColor: cfg.bg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <Ionicons name="sparkles-outline" size={18} color={cfg.color} />
            <Text style={{ fontFamily: 'Syne_700Bold', color: cfg.color, fontSize: 13 }}>Ask AI about this alert</Text>
          </Pressable>

          {/* Share */}
          <Pressable
            className='border border-[#96C7B3]/50 bg-white/[0.06]'
            onPress={handleShare}
            disabled={sharing}
            style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {sharing ? <ActivityIndicator size={16} color="rgba(248,250,252,0.7)" /> : <Ionicons name="share-social-outline" size={18} color="rgba(248,250,252,0.7)" />}
            <Text style={{ fontFamily: 'Syne_700Bold', color: 'rgba(248,250,252,0.8)', fontSize: 13 }}>
              {sharing ? 'Generating update…' : 'Share trip update'}
            </Text>
          </Pressable>

          {/* Save */}
          <Pressable
            className='border border-[#96C7B3]/50 bg-white/[0.06]'
            onPress={handleSave}
            disabled={saving || alreadySaved}
            style={{ borderRadius: 16, backgroundColor: alreadySaved ? 'rgba(255,255,255,0.3)' : 'rgb(255 255 255 / 0.06) ', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {saving ? <ActivityIndicator size={16} color="rgba(148,163,184,0.6)" /> : <Ionicons name={alreadySaved ? 'bookmark' : 'bookmark-outline'} size={18} color="rgba(148,163,184,0.6)" />}
            <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.7)', fontSize: 13 }}>
              {alreadySaved ? 'Saved to collection' : saving ? 'Saving…' : 'Save for later'}
            </Text>
          </Pressable>

          {/* View full monitoring */}
          {trip && (
            <Pressable
              className='border border-[#96C7B3]/50 bg-white/[0.06]'
              onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}
              style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            >
              <Ionicons name="pulse-outline" size={18} color="rgba(148,163,184,0.6)" />
              <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.6)', fontSize: 13 }}>View monitoring dashboard</Text>
            </Pressable>
          )}
        </View>

      </ScrollView>
    </View>
  );
}
