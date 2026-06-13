/**
 * RecommendationDetailsScreen — rich, dynamic detail view.
 * Renders different content sections based on recommendation kind.
 * All content comes from the recommendation document — no hardcoded copy.
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
import { LinearGradient } from 'expo-linear-gradient';

import { useRecommendationStore } from '@/src/store/recommendationStore';
import { useTripStore } from '@/src/store/tripStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useSaveStore } from '@/src/store/saveStore';
import { generateShareUpdate } from '@/src/firebase/callables';

/* ── Kind config ────────────────────────────────────────────────────────────── */

const KIND_CFG: Record<string, { label: string; icon: string; color: string }> = {
  action:             { label: 'Action required',  icon: 'flash-outline',    color: '#F59E0B' },
  smart_tip:          { label: 'Smart tip',         icon: 'bulb-outline',     color: '#22C55E' },
  alternative_flight: { label: 'Alternative flight',icon: 'airplane-outline', color: '#3B82F6' },
  alternative_route:  { label: 'Alternative route', icon: 'map-outline',      color: '#8B5CF6' },
  transport:          { label: 'Transport',          icon: 'car-outline',      color: '#14B8A6' },
  weather_advisory:   { label: 'Weather advisory',   icon: 'rainy-outline',    color: '#F97316' },
  time_optimization:  { label: 'Timing',             icon: 'timer-outline',    color: '#EC4899' },
};

const URGENCY_CFG = {
  high:   { label: 'URGENT',  color: '#EF4444' },
  medium: { label: 'SOON',    color: '#F59E0B' },
  low:    { label: 'INFO',    color: '#22C55E' },
};

/* ── Section components ─────────────────────────────────────────────────────── */

function Section({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: `${color}25`, backgroundColor: `${color}07`, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={{ fontFamily: 'Syne_600SemiBold', color, fontSize: 11, letterSpacing: 0.8 }}>
          {title.toUpperCase()}
        </Text>
      </View>
      {children}
    </View>
  );
}

function InfoLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12 }}>{label}</Text>
      <Text style={{ fontFamily: 'Syne_600SemiBold', color: valueColor ?? '#f8fafc', fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────────── */

export default function RecommendationDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const trips = useTripStore((s) => s.trips);
  const byTripId = useRecommendationStore((s) => s.byTripId);

  const { rec, trip } = useMemo(() => {
    for (const t of trips) {
      const found = (byTripId[t.id] ?? []).find((r) => r.id === String(id));
      if (found) return { rec: found, trip: t };
    }
    return { rec: null, trip: null };
  }, [byTripId, id, trips]);

  const weather = useWeatherStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const flight  = useFlightMonitoringStore((s) => trip ? s.byTripId[trip.id] ?? null : null);
  const { save, isSaved } = useSaveStore();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (!rec || !trip) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 16, backgroundColor: '#0a0b1e' }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(148,163,184,0.3)" />
          <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#94a3b8', fontSize: 15, marginTop: 16 }}>
            Recommendation not found
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#475569', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            This recommendation may have expired or been updated. Return to the recommendations screen to see the latest insights.
          </Text>
        </View>
      </View>
    );
  }

  const cfg = KIND_CFG[rec.kind] ?? KIND_CFG.smart_tip!;
  const urgencyCfg = rec.urgency ? (URGENCY_CFG[rec.urgency] ?? null) : null;
  const alreadySaved = isSaved(rec.id);

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        itemId: rec!.id,
        itemType: 'recommendation',
        tripId: trip!.id,
        data: { title: rec!.title, message: rec!.message, kind: rec!.kind, category: rec!.category },
      });
      Alert.alert('Saved', 'Recommendation saved to your collection.');
    } catch { Alert.alert('Error', 'Could not save.'); }
    finally { setSaving(false); }
  }

  async function handleShare() {
    setSharing(true);
    try {
      const { shareText } = await generateShareUpdate(trip!.id);
      await Share.share({ message: shareText, title: trip!.title });
    } catch {
      await Share.share({ message: `${rec!.title}\n${rec!.message}\n\nShared via TICS`, title: rec!.title }).catch(() => {});
    } finally { setSharing(false); }
  }

  // Parse multi-line details into sections
  const detailLines = rec.details
    ? rec.details.split('\n').filter((l) => l.trim().length > 0)
    : [];

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, backgroundColor: '#0a0b1e' }}>
      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${cfg.color}18`, borderWidth: 1, borderColor: `${cfg.color}40`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={cfg.icon as any} size={21} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: cfg.color, fontSize: 10, letterSpacing: 1 }}>{cfg.label.toUpperCase()}</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }} numberOfLines={1}>{trip.title}</Text>
        </View>
        {urgencyCfg && (
          <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${urgencyCfg.color}18` }}>
            <Text style={{ fontFamily: 'Syne_700Bold', color: urgencyCfg.color, fontSize: 10 }}>{urgencyCfg.label}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: `${cfg.color}30`, backgroundColor: `${cfg.color}0A`, padding: 20, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: cfg.color }} />
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 20, lineHeight: 28, marginTop: 4 }}>{rec.title}</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 14, lineHeight: 22, marginTop: 10 }}>{rec.message}</Text>
          {rec.confidenceScore != null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1, height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${Math.round(rec.confidenceScore * 100)}%`, height: '100%', backgroundColor: cfg.color, borderRadius: 99 }} />
              </View>
              <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.6)', fontSize: 11 }}>
                {Math.round(rec.confidenceScore * 100)}% confidence
              </Text>
            </View>
          )}
        </View>

        {/* ── Details section — rendered as a structured breakdown ── */}
        {detailLines.length > 0 && (
          <Section title="Why this matters" icon="information-circle-outline" color={cfg.color}>
            {detailLines.map((line, i) => {
              // Bullet points
              if (line.startsWith('•') || line.startsWith('✓') || line.startsWith('✈') || line.startsWith('🚗') || line.startsWith('🚕') || line.startsWith('🚌') || line.startsWith('🚆') || line.startsWith('💡')) {
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: cfg.color, fontSize: 13, marginTop: 1 }}>
                      {line.charAt(0)}
                    </Text>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#cbd5e1', fontSize: 13, lineHeight: 20, flex: 1 }}>
                      {line.slice(1).trim()}
                    </Text>
                  </View>
                );
              }
              // Section headers
              if (line.endsWith(':') || line.startsWith('Before') || line.startsWith('Benefits') || line.startsWith('What TICS') || line.startsWith('How:')) {
                return (
                  <Text key={i} style={{ fontFamily: 'Syne_600SemiBold', color: cfg.color, fontSize: 12, marginTop: i > 0 ? 12 : 0, marginBottom: 6 }}>
                    {line}
                  </Text>
                );
              }
              return (
                <Text key={i} style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13, lineHeight: 20, marginBottom: 4 }}>
                  {line}
                </Text>
              );
            })}
          </Section>
        )}

        {/* ── Live flight context (for flight-related recs) ── */}
        {['action', 'alternative_flight', 'time_optimization'].includes(rec.kind) && flight && (
          <Section title="Current flight status" icon="airplane-outline" color="#3B82F6">
            <InfoLine label="Flight" value={`${trip.flightNumber ?? '—'}${trip.airline ? ' · ' + trip.airline : ''}`} />
            <InfoLine
              label="Status"
              value={flight.status.charAt(0).toUpperCase() + flight.status.slice(1)}
              valueColor={flight.status === 'active' ? '#22C55E' : flight.status === 'canceled' ? '#EF4444' : '#94a3b8'}
            />
            {flight.gate && <InfoLine label="Gate" value={flight.gate} valueColor="#60A5FA" />}
            {flight.terminal && <InfoLine label="Terminal" value={flight.terminal} valueColor="#A78BFA" />}
            <InfoLine
              label="Delay"
              value={flight.delayMinutes != null && flight.delayMinutes > 0 ? `${flight.delayMinutes} minutes` : 'None reported'}
              valueColor={flight.delayMinutes != null && flight.delayMinutes > 0 ? '#F59E0B' : '#22C55E'}
            />
          </Section>
        )}

        {/* ── Live weather context (for weather recs) ── */}
        {rec.kind === 'weather_advisory' && weather && (
          <Section title="Current weather conditions" icon="partly-sunny-outline" color="#F97316">
            <InfoLine label="Location" value={weather.label} />
            {weather.description && (
              <InfoLine
                label="Conditions"
                value={weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}
              />
            )}
            {weather.tempC != null && (
              <InfoLine
                label="Temperature"
                value={`${Math.round(weather.tempC)}°C${weather.feelsLikeC != null ? ` (feels ${Math.round(weather.feelsLikeC)}°C)` : ''}`}
                valueColor="#FBBF24"
              />
            )}
            {weather.humidity != null && <InfoLine label="Humidity" value={`${weather.humidity}%`} />}
            {weather.windKph != null && <InfoLine label="Wind" value={`${weather.windKph} km/h`} />}
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 11 }}>Disruption risk</Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: weather.riskScore >= 7 ? '#EF4444' : weather.riskScore >= 4 ? '#F59E0B' : '#22C55E', fontSize: 11 }}>
                  {weather.riskScore}/10 · {weather.riskScore >= 7 ? 'Severe' : weather.riskScore >= 4 ? 'Moderate' : weather.riskScore >= 2 ? 'Mild' : 'Low'}
                </Text>
              </View>
              <View style={{ height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <View style={{ width: `${weather.riskScore * 10}%`, height: '100%', backgroundColor: weather.riskScore >= 7 ? '#EF4444' : weather.riskScore >= 4 ? '#F59E0B' : '#22C55E', borderRadius: 99 }} />
              </View>
            </View>
          </Section>
        )}

        {/* ── Alternative flight options ── */}
        {rec.options && rec.options.length > 0 && (
          <Section title="Option comparison" icon="git-compare-outline" color={cfg.color}>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 14, marginBottom: 10 }}>
              <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#64748b', fontSize: 10, marginBottom: 6 }}>CURRENT</Text>
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14 }}>
                {trip.flightNumber ?? 'Your flight'}{trip.airline ? ` · ${trip.airline}` : ''}
              </Text>
              {trip.departureTime && (
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                  Departs {new Date(trip.departureTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
              )}
            </View>
            {rec.options.map((opt, i) => (
              <View key={i} style={{ borderRadius: 12, borderWidth: 1, borderColor: `${cfg.color}40`, backgroundColor: `${cfg.color}0A`, padding: 14, marginBottom: i < rec.options!.length - 1 ? 8 : 0 }}>
                <Text style={{ fontFamily: 'Syne_600SemiBold', color: cfg.color, fontSize: 10, marginBottom: 6 }}>
                  RECOMMENDED{rec.options!.length > 1 ? ` OPTION ${i + 1}` : ''}
                </Text>
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 14 }}>
                  {opt.flight ?? opt.label ?? 'Alternative'}
                </Text>
                {(opt.departs || opt.arrives) && (
                  <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                    {opt.departs ? `Departs ${opt.departs}` : ''}{opt.arrives ? ` · Arrives ${opt.arrives}` : ''}
                  </Text>
                )}
                {opt.price && (
                  <Text style={{ fontFamily: 'Syne_700Bold', color: cfg.color, fontSize: 12, marginTop: 6 }}>
                    {opt.price}
                  </Text>
                )}
              </View>
            ))}
            {(rec.priceDifference || rec.timeDifference) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {rec.priceDifference && (
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 12 }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 10, marginBottom: 4 }}>COST</Text>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 13 }}>{rec.priceDifference}</Text>
                  </View>
                )}
                {rec.timeDifference && (
                  <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', padding: 12 }}>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 10, marginBottom: 4 }}>TIME</Text>
                    <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 13 }}>{rec.timeDifference}</Text>
                  </View>
                )}
              </View>
            )}
          </Section>
        )}

        {/* ── Source metadata ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 }}>
          <Ionicons name="shield-checkmark-outline" size={13} color="rgba(100,116,139,0.6)" />
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#334155', fontSize: 11 }}>
            Generated from live AviationStack + OpenWeather data · {rec.category ?? rec.kind}
          </Text>
        </View>

        {/* ── Actions ── */}
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => router.push(({ pathname: '/assistant', params: { tripId: trip.id } } as any))}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={['#1d4ed8', '#3b82f6']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
            >
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 14 }}>
                {rec.actionText ?? 'Ask AI for help with this'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {sharing ? <ActivityIndicator size={16} color="rgba(248,250,252,0.7)" /> : <Ionicons name="share-social-outline" size={18} color="rgba(248,250,252,0.7)" />}
            <Text style={{ fontFamily: 'Syne_700Bold', color: 'rgba(248,250,252,0.75)', fontSize: 13 }}>
              {sharing ? 'Generating trip update…' : 'Share trip update'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSave}
            disabled={saving || alreadySaved}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: alreadySaved ? 0.5 : 1 }}
          >
            {saving ? <ActivityIndicator size={16} color="rgba(148,163,184,0.6)" /> : <Ionicons name={alreadySaved ? 'bookmark' : 'bookmark-outline'} size={18} color="rgba(148,163,184,0.6)" />}
            <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.7)', fontSize: 13 }}>
              {alreadySaved ? 'Saved to collection' : saving ? 'Saving…' : 'Save for later'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push(({ pathname: `/monitoring/${trip.id}` } as any))}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: `${cfg.color}20`, backgroundColor: `${cfg.color}07`, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <Ionicons name="pulse-outline" size={18} color={cfg.color} />
            <Text style={{ fontFamily: 'Syne_700Bold', color: cfg.color, fontSize: 13 }}>Open monitoring dashboard</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
