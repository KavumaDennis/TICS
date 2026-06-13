/**
 * SmartRecommendationsScreen
 * Real-time trip-scoped recommendations from the TICS monitoring engine.
 * All content is derived from live flight, weather, and timing data.
 * No static/placeholder content.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Recommendation } from '@/src/store/recommendationStore';
import { useTripStore } from '@/src/store/tripStore';
import { useRecommendationStore } from '@/src/store/recommendationStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useSaveStore } from '@/src/store/saveStore';
import { generateShareUpdate, refreshTripMonitoring } from '@/src/firebase/callables';

/* ── Kind metadata ──────────────────────────────────────────────────────────── */

const KIND_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  action:             { label: 'Action',          icon: 'flash-outline',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  smart_tip:          { label: 'Smart tip',        icon: 'bulb-outline',     color: '#22C55E', bg: 'rgba(34,197,94,0.12)'   },
  alternative_flight: { label: 'Alt. flight',      icon: 'airplane-outline', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  alternative_route:  { label: 'Alt. route',       icon: 'map-outline',      color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)'  },
  transport:          { label: 'Transport',         icon: 'car-outline',      color: '#14B8A6', bg: 'rgba(20,184,166,0.12)'  },
  weather_advisory:   { label: 'Weather',           icon: 'rainy-outline',    color: '#F97316', bg: 'rgba(249,115,22,0.12)'  },
  time_optimization:  { label: 'Timing',            icon: 'timer-outline',    color: '#EC4899', bg: 'rgba(236,72,153,0.12)'  },
};

const URGENCY_CFG = {
  high:   { label: 'URGENT',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)'  },
  medium: { label: 'SOON',    color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  low:    { label: 'INFO',    color: '#22C55E', bg: 'rgba(34,197,94,0.15)'  },
};

type TabId = 'all' | 'weather' | 'flight' | 'timing' | 'tips';

const TABS: Array<{ id: TabId; label: string; kinds: string[] }> = [
  { id: 'all',     label: 'All',     kinds: []                                                             },
  { id: 'weather', label: 'Weather', kinds: ['weather_advisory']                                           },
  { id: 'flight',  label: 'Flight',  kinds: ['action', 'alternative_flight']                              },
  { id: 'timing',  label: 'Timing',  kinds: ['time_optimization', 'transport']                            },
  { id: 'tips',    label: 'Tips',    kinds: ['smart_tip', 'alternative_route']                            },
];

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function SmartRecommendationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const uid = useAuthStore((s) => s.token);

  // Trip switcher — user can flip between trips
  const trips = useTripStore((s) => s.trips);
  const storedActiveId = useTripStore((s) => s.activeTripId);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const trip = useMemo(() => {
    const id = selectedTripId ?? storedActiveId;
    return id ? trips.find((t) => t.id === id) ?? trips[0] ?? null : trips[0] ?? null;
  }, [selectedTripId, storedActiveId, trips]);

  const byTripId = useRecommendationStore((s) => s.byTripId);
  const items = useMemo(() => (trip ? byTripId[trip.id] ?? [] : []), [byTripId, trip]);
  const { save, isSaved } = useSaveStore();

  // Filter + sort: urgency high → medium → low
  const filtered = useMemo(() => {
    const tabMeta = TABS.find((t) => t.id === tab);
    const base = tabMeta?.kinds.length
      ? items.filter((r) => tabMeta.kinds.includes(r.kind))
      : items;
    return [...base].sort((a, b) => {
      const o = { high: 0, medium: 1, low: 2 };
      return (o[a.urgency ?? 'low'] ?? 2) - (o[b.urgency ?? 'low'] ?? 2);
    });
  }, [items, tab]);

  const counts = useMemo(() => ({
    all:     items.length,
    weather: items.filter((r) => r.kind === 'weather_advisory').length,
    flight:  items.filter((r) => ['action', 'alternative_flight'].includes(r.kind)).length,
    timing:  items.filter((r) => ['time_optimization', 'transport'].includes(r.kind)).length,
    tips:    items.filter((r) => ['smart_tip', 'alternative_route'].includes(r.kind)).length,
  }), [items]);

  async function handleRefresh() {
    if (!trip || !uid || refreshing) return;
    setRefreshing(true);
    try {
      await refreshTripMonitoring(trip.id);
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
    } catch {
      await Share.share({
        message: `Recommendations for ${trip?.title}`,
        title: trip?.title ?? 'TICS',
      }).catch(() => {});
    } finally {
      setSharing(false);
    }
  }

  async function handleSave(rec: Recommendation) {
    try {
      await save({
        itemId: rec.id,
        itemType: 'recommendation',
        tripId: rec.tripId,
        data: { title: rec.title, message: rec.message, kind: rec.kind, category: rec.category },
      });
    } catch { /* swallow */ }
  }

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, backgroundColor: '#0a0b1e' }}>

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 18 }}>Smart Recommendations</Text>
          <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 12, marginTop: 1 }}>
            {trip?.title ?? 'No trip selected'} · {items.length} insight{items.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={{ width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            {sharing ? <ActivityIndicator size={14} color="rgba(248,250,252,0.7)" /> : <Ionicons name="share-social-outline" size={18} color="rgba(248,250,252,0.7)" />}
          </Pressable>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }}
          >
            {refreshing ? <ActivityIndicator size={14} color="#000" /> : <Ionicons name="refresh" size={18} color="rgba(10,11,30,0.9)" />}
          </Pressable>
        </View>
      </View>

      {/* ── Trip switcher ── */}
      {trips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: 'center' }}
        >
          {trips.map((t) => {
            const sel = t.id === trip?.id;
            return (
              <Pressable key={t.id} onPress={() => setSelectedTripId(t.id)}>
                <View style={{
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: sel ? '#22C55E' : 'rgba(255,255,255,0.1)',
                  backgroundColor: sel ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                }}>
                  <Text style={{ fontFamily: 'Syne_500Medium', fontSize: 12, color: sel ? '#fff' : 'rgba(148,163,184,0.7)' }}>
                    {t.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Tab filters ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: 'center' }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)}>
              <View style={{
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                borderWidth: 1,
                borderColor: active ? '#22C55E' : 'rgba(255,255,255,0.1)',
                backgroundColor: active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
              }}>
                <Text style={{ fontFamily: 'Syne_700Bold', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.7)' }}>
                  {t.label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Cards ── */}
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 8 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((rec) => {
          const meta = KIND_META[rec.kind] ?? KIND_META.smart_tip!;
          const urgency = URGENCY_CFG[rec.urgency ?? 'low'] ?? URGENCY_CFG.low;
          const saved = isSaved(rec.id);

          return (
            <View
              key={rec.id}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: `${meta.color}28`,
                backgroundColor: meta.bg,
                overflow: 'hidden',
              }}
            >
              {/* Top color accent */}
              <View style={{ height: 3, backgroundColor: meta.color }} />

              <View style={{ padding: 16 }}>
                {/* Kind + urgency row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${meta.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={meta.icon as any} size={17} color={meta.color} />
                    </View>
                    <Text style={{ fontFamily: 'Syne_600SemiBold', color: meta.color, fontSize: 10, letterSpacing: 0.8 }}>
                      {meta.label.toUpperCase()}
                    </Text>
                  </View>
                  {rec.urgency && (
                    <View style={{ borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: urgency.bg }}>
                      <Text style={{ fontFamily: 'Syne_700Bold', color: urgency.color, fontSize: 9, letterSpacing: 0.5 }}>
                        {urgency.label}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 15, lineHeight: 22 }}>
                  {rec.title}
                </Text>

                {/* Message */}
                <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13, lineHeight: 20, marginTop: 6 }} numberOfLines={3}>
                  {rec.message}
                </Text>

                {/* Confidence bar */}
                {rec.confidenceScore != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round(rec.confidenceScore * 100)}%`, height: '100%', backgroundColor: meta.color, borderRadius: 99 }} />
                    </View>
                    <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.5)', fontSize: 10 }}>
                      {Math.round(rec.confidenceScore * 100)}%
                    </Text>
                  </View>
                )}

                {/* Category tag */}
                {rec.category && (
                  <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(148,163,184,0.5)', fontSize: 10, marginTop: 8 }}>
                    {rec.category.toUpperCase()}
                  </Text>
                )}

                {/* Action row */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Pressable
                    onPress={() => router.push(({ pathname: `/recommendations/${rec.id}` } as any))}
                    style={{ flex: 1, borderRadius: 10, backgroundColor: meta.color, paddingVertical: 11, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Syne_700Bold', color: meta.color === '#F59E0B' ? 'rgba(10,11,30,0.9)' : '#fff', fontSize: 12 }}>
                      {rec.actionText ?? 'View details'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleSave(rec)}
                    disabled={saved}
                    style={{ width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', opacity: saved ? 0.45 : 1 }}
                  >
                    <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color="rgba(248,250,252,0.6)" />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push(({ pathname: '/assistant', params: { tripId: rec.tripId } } as any))}
                    style={{ width: 42, height: 42, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="sparkles-outline" size={17} color="rgba(248,250,252,0.6)" />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}

        {/* ── Empty state ── */}
        {!filtered.length && (
          <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 }}>
            <LinearGradient
              colors={['rgba(34,197,94,0.2)', 'rgba(34,197,94,0.04)']}
              style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' }}
            >
              <Ionicons name="analytics-outline" size={36} color="#4ade80" />
            </LinearGradient>
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 17, textAlign: 'center' }}>
              {tab === 'all'
                ? 'Monitoring is warming up'
                : `No ${tab} recommendations yet`}
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>
              {trip
                ? `TICS generates ${tab === 'all' ? 'personalized' : tab} recommendations from live ${tab === 'weather' ? 'weather conditions' : tab === 'flight' ? 'flight data' : tab === 'timing' ? 'departure timing' : 'travel intelligence'} for ${trip.title}. Tap refresh to run a monitoring cycle now.`
                : 'Add a trip to receive AI-powered recommendations based on real-time flight and weather data.'}
            </Text>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 20, paddingVertical: 12 }}
            >
              {refreshing ? <ActivityIndicator size={14} color="#22C55E" /> : <Ionicons name="refresh" size={16} color="#22C55E" />}
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#22C55E', fontSize: 13 }}>
                {refreshing ? 'Running monitoring cycle…' : 'Run monitoring cycle'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
