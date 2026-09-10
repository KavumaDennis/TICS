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
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { useAlertStore } from '@/src/store/alertStore';
import { useTripStore } from '@/src/store/tripStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useSaveStore } from '@/src/store/saveStore';
import { useAssistantStore } from '@/src/store/assistantStore';
import { generateShareUpdate } from '@/src/firebase/callables';
import { useAlertModal } from '@/src/components/AlertModal';
import { SafeText } from '@/src/components/responsive/SafeText';

const SEV = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.35)', border: 'rgba(239,68,68,0.25)', icon: 'alert-circle' as const, label: 'CRITICAL' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.35)', border: 'rgba(245,158,11,0.25)', icon: 'warning' as const, label: 'WARNING' },
  info: { color: '#3B82F6', bg: 'rgba(59,130,246,0.35)', border: 'rgba(59,130,246,0.25)', icon: 'information-circle' as const, label: 'INFO' },
  low: { color: '#22C55E', bg: 'rgba(34,197,94,0.35)', border: 'rgba(34,197,94,0.25)', icon: 'checkmark-circle' as const, label: 'LOW' },
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

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12 }}>{label}</SafeText>
      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: color ?? '#f8fafc', fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{value}</SafeText>
    </View>
  );
}

export default function DisruptionAlertScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { modal: alertModal, showAlert } = useAlertModal();

  const trips = useTripStore((s) => s.trips);
  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const { toggleSave, isSaved } = useSaveStore();
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  const { alert, trip } = useMemo(() => {
    for (const t of trips) {
      const found = (alertsByTripId[t.id] ?? []).find((a) => String(a.id) === String(id));
      if (found) return { alert: found, trip: t };
    }
    return { alert: null, trip: null };
  }, [alertsByTripId, id, trips]);

  const flight = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);

  const alreadySaved = alert ? isSaved(alert.id) : false;
  const sevKey = (alert?.severity ?? 'info') as keyof typeof SEV;
  const cfg = SEV[sevKey] ?? SEV.info;
  const catLabel = CAT_LABEL[alert?.category ?? 'general'] ?? 'Alert';

  const timeLabel = alert?.createdAt?.toDate
    ? new Date(alert.createdAt.toDate()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  const showFlight = flight && ['flight', 'gate', 'boarding', 'check_in'].includes(alert?.category ?? '');
  const showWeather = weather && alert?.category === 'weather';

  async function handleShare() {
    if (!trip) return;
    setSharing(true);
    try {
      const { shareText } = await generateShareUpdate(trip.id);
      await Share.share({ message: shareText, title: `TICS: ${trip.title}` });
    } catch {
      const fallback = [`📍 ${trip?.title || 'Trip'}`, `${alert?.title || 'Alert'}`, alert?.message || '', '', 'Powered by TICS'].filter(Boolean).join('\n');
      await Share.share({ message: fallback, title: alert?.title ?? 'TICS Alert' }).catch(() => { });
    } finally { setSharing(false); }
  }

  async function handleToggleSave() {
    if (!alert || !trip) return;
    setSaving(true);
    try {
      await toggleSave({ itemId: alert.id, itemType: 'alert', tripId: trip.id, data: { title: alert.title, message: alert.message, severity: alert.severity, category: alert.category } });
      showAlert(alreadySaved ? 'Removed' : 'Saved', alreadySaved ? 'Alert removed from your collection.' : 'Alert saved to your collection.', [{ text: 'OK', style: 'primary' }]);
    } catch { showAlert('Error', 'Could not update saved status.', [{ text: 'OK', style: 'primary' }]); }
    finally { setSaving(false); }
  }

  if (!alert) {
    return (
      <View
        style={{ flex: 1, backgroundColor: '#0a0b1e', }}
        className='bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2'
      >
        <Pressable onPress={() => router.back()} style={{ width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Ionicons name="chevron-back" size={20} color="#96C7B3" />
        </Pressable>
        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <Ionicons name="notifications-off-outline" size={48} color="rgba(148,163,184,0.25)" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 15, marginTop: 16 }}>Alert not found</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#475569', fontSize: 12, marginTop: 8, textAlign: 'center' }}>This alert may have been resolved or cleared. Return to Alerts Center to see current alerts.</SafeText>
        </View>
      </View>
    );
  }

  return (
    <View className='p-1' style={{ flex: 1, backgroundColor: '#0a0b1e', }}>
      {alertModal}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}
        className='bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2 gap-2 mb-3'
      >
        <Pressable
          className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'
          onPress={() => router.back()}
          style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color="#96C7B3" />
        </Pressable>
        <LinearGradient
          colors={[cfg.bg.replace('0.10', '0.22'), cfg.bg.replace('0.10', '0.06')] as [string, string]}
          style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: cfg.border }}
          className='rounded-full'
        >
          <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: cfg.color, fontSize: 10, letterSpacing: 1 }}>{catLabel.toUpperCase()} · {cfg.label}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }} numberOfLines={1}>{trip?.title ?? 'Your trip'}</SafeText>
        </View>
        {!alert.read && (<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cfg.color }} />)}
      </View>

      <ScrollView className='px-1' contentContainerStyle={{ gap: 14, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View className='rounded-4xl' style={{ backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border, padding: 20, overflow: 'hidden' }}>
          {/* <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: cfg.color }} /> */}
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 20, lineHeight: 28, marginTop: 4 }}>{alert.title}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14, lineHeight: 22, marginTop: 10 }}>{alert.message}</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(100,116,139,0.7)', fontSize: 11, marginTop: 12 }}>{timeLabel}</SafeText>
        </View>

        {alert.recommendation && (
          <View className='rounded-4xl p-5' style={{ borderWidth: 1, borderColor: 'rgba(251,191,36,0.10)', backgroundColor: 'rgba(251,191,36,0.15)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="bulb-outline" size={16} color="#FBBF24" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#FBBF24', fontSize: 11, letterSpacing: 0.8 }}>RECOMMENDED ACTION</SafeText>
            </View>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13, lineHeight: 20 }}>{alert.recommendation}</SafeText>
          </View>
        )}

        {showFlight && flight && (
          <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(59,130,246,0.10)', backgroundColor: 'rgba(59,130,246,0.15)', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="airplane-outline" size={15} color="#60A5FA" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 11, letterSpacing: 0.8 }}>LIVE FLIGHT STATUS</SafeText>
            </View>
            <InfoRow label="Flight" value={`${trip?.flightNumber ?? '—'}${trip?.airline ? ' · ' + trip.airline : ''}`} />
            <InfoRow label="Status" value={flight.status.charAt(0).toUpperCase() + flight.status.slice(1)} color={flight.status === 'active' ? '#22C55E' : flight.status === 'canceled' ? '#EF4444' : '#94a3b8'} />
            <InfoRow label="Gate" value={flight.gate ?? 'TBC'} color={flight.gate ? '#60A5FA' : '#64748b'} />
            <InfoRow label="Terminal" value={flight.terminal ?? 'TBC'} color={flight.terminal ? '#A78BFA' : '#64748b'} />
            <InfoRow label="Delay" value={flight.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} min` : 'None'} color={flight.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E'} />
          </View>
        )}

        {showWeather && weather && (
          <View className='rounded-4xl' style={{ borderWidth: 1, borderColor: 'rgba(249,115,22,0.10)', backgroundColor: 'rgba(249,115,22,0.15)', padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="partly-sunny-outline" size={15} color="#F97316" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F97316', fontSize: 11, letterSpacing: 0.8 }}>LIVE WEATHER CONDITIONS</SafeText>
            </View>
            <InfoRow label="Location" value={weather.label} />
            {weather.description && (<InfoRow label="Conditions" value={weather.description.charAt(0).toUpperCase() + weather.description.slice(1)} />)}
            {weather.tempC != null && (<InfoRow label="Temperature" value={`${Math.round(weather.tempC)}°C${weather.feelsLikeC != null ? ` (feels ${Math.round(weather.feelsLikeC)}°C)` : ''}`} color="#FBBF24" />)}
            {weather.windKph != null && <InfoRow label="Wind" value={`${weather.windKph} km/h`} />}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>Disruption risk</SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: weather.riskScore >= 6 ? '#EF4444' : weather.riskScore >= 3 ? '#F59E0B' : '#22C55E', fontSize: 11 }}>{weather.riskScore}/10</SafeText>
              </View>
              <View style={{ height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${weather.riskScore * 10}%`, height: '100%', backgroundColor: weather.riskScore >= 6 ? '#EF4444' : weather.riskScore >= 3 ? '#F59E0B' : '#22C55E', borderRadius: 99 }} />
              </View>
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
          <Ionicons name="shield-checkmark-outline" size={13} color="rgba(100,116,139,0.5)" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#334155', fontSize: 11 }}>Source: {SOURCE_LABEL[alert.source ?? 'system'] ?? 'TICS Monitoring'} · {catLabel}</SafeText>
        </View>

        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => {
              // Navigate to assistant with alert context via store
              const msg = `[Alert Analysis Request]\nAlert Title: ${alert.title}\nAlert Message: ${alert.message}\nSeverity: ${alert.severity}\nCategory: ${alert.category ?? 'general'}\nSource: ${alert.source ?? 'system'}\n\nPlease analyze this alert and explain:\n1. What this alert means for my trip\n2. How it may affect my journey\n3. Potential risks I should be aware of\n4. Recommended actions I should take`;
              useAssistantStore.getState().setPendingMessage(msg, trip?.id ?? null);
              router.push('/assistant' as any);
            }}
            className='rounded-full p-6'
            style={{ borderWidth: 1, borderColor: cfg.border, backgroundColor: cfg.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="sparkles-outline" size={18} color={cfg.color} />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: cfg.color, fontSize: 13 }}>Ask AI about this alert</SafeText>
          </Pressable>

          <Pressable
            onPress={() => {
              // Navigate to assistant with destination tips via store
              const msg = `[Destination Tips Request]\nI'm traveling to ${trip?.to ?? 'my destination'}. Can you provide personalized advice including:\n1. Local transportation tips\n2. Weather preparation based on current conditions\n3. Safety considerations\n4. Cultural etiquette and local customs\n5. Packing suggestions\n6. Nearby attractions or things to do`;
              useAssistantStore.getState().setPendingMessage(msg, trip?.id ?? null);
              router.push('/assistant' as any);
            }}
            className='rounded-full p-6'
            style={{ borderWidth: 1, borderColor: 'rgba(34,197,94,0.1)', backgroundColor: 'rgba(34,197,94,0.30)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="compass-outline" size={18} color="#22C55E" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 13 }}>Ask AI for destination tips</SafeText>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Pressable className='border border-tics-amber/20 bg-tics-amber/35 p-6 rounded-full flex-1' onPress={handleShare} disabled={sharing} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {sharing ? <ActivityIndicator size={16} color="rgba(248,250,252,0.7)" /> : <Ionicons name="share-social-outline" size={18} color="rgba(248,250,252,0.7)" />}
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(248,250,252,0.8)', fontSize: 13 }}>{sharing ? 'Generating update…' : 'Share trip update'}</SafeText>
            </Pressable>
            <Pressable className='border border-tics-amber/40 bg-white/[0.06] p-6 rounded-full self-start' onPress={handleToggleSave} disabled={saving} style={{ backgroundColor: alreadySaved ? 'rgba(34,197,94,0.30)' : 'rgb(255 255 255 / 0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {saving ? <ActivityIndicator size={16} color="rgba(148,163,184,0.6)" /> : <Ionicons name={alreadySaved ? 'bookmark' : 'bookmark-outline'} size={18} color={alreadySaved ? '#22C55E' : 'rgba(148,163,184,0.6)'} />}

            </Pressable>
          </View>
          {trip && (
            <Pressable className='border border-tics-amber/20 bg-tics-amber/35 p-6 rounded-full' onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Ionicons name="pulse-outline" size={18} color="rgba(226,232,240,0.72)" />
              <SafeText className='text-tics-muted' style={{ fontFamily: 'ShareTech_400Regular', fontSize: 13 }}>View monitoring dashboard</SafeText>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
