/**
 * SmartRecommendationsScreen
 * Real-time trip-scoped recommendations from the TICS monitoring engine.
 * All content is derived from live flight, weather, and timing data.
 * No static/placeholder content.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { useAssistantStore } from '@/src/store/assistantStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useAlertModal } from '@/src/components/AlertModal';
import { generateShareUpdate, refreshTripMonitoring } from '@/src/firebase/callables';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ── Kind metadata ──────────────────────────────────────────────────────────── */

const KIND_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  action: { label: 'Action', icon: 'flash-outline', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  smart_tip: { label: 'Smart tip', icon: 'bulb-outline', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  alternative_flight: { label: 'Alt. flight', icon: 'airplane-outline', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  alternative_route: { label: 'Alt. route', icon: 'map-outline', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  transport: { label: 'Transport', icon: 'car-outline', color: '#14B8A6', bg: 'rgba(20,184,166,0.12)' },
  weather_advisory: { label: 'Weather', icon: 'rainy-outline', color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  time_optimization: { label: 'Timing', icon: 'timer-outline', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
};

const URGENCY_CFG = {
  high: { label: 'URGENT', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  medium: { label: 'SOON', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  low: { label: 'INFO', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
};

type TabId = 'all' | 'weather' | 'flight' | 'timing' | 'tips';

const TABS: Array<{ id: TabId; label: string; kinds: string[] }> = [
  { id: 'all', label: 'All', kinds: [] },
  { id: 'weather', label: 'Weather', kinds: ['weather_advisory'] },
  { id: 'flight', label: 'Flight', kinds: ['action', 'alternative_flight'] },
  { id: 'timing', label: 'Timing', kinds: ['time_optimization', 'transport'] },
  { id: 'tips', label: 'Tips', kinds: ['smart_tip', 'alternative_route'] },
];

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function SmartRecommendationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const uid = useAuthStore((s) => s.token);
  const { modal: alertModal, showAlert: showAlertModal } = useAlertModal();

  // Trip switcher — user can flip between trips
  const trips = useTripStore((s) => s.trips);
  const storedActiveId = useTripStore((s) => s.activeTripId);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const trip = useMemo(() => {
    const id = selectedTripId ?? storedActiveId;
    return id ? trips.find((t) => t.id === id) ?? trips[0] ?? null : trips[0] ?? null;
  }, [selectedTripId, storedActiveId, trips]);

  // Trip status awareness — completed trips show archived recommendations
  const { isCompleted, isCancelled, showLiveRecommendations } = useTripStatus(trip);
  const isCompletedOrCancelled = isCompleted || isCancelled;

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
    all: items.length,
    weather: items.filter((r) => r.kind === 'weather_advisory').length,
    flight: items.filter((r) => ['action', 'alternative_flight'].includes(r.kind)).length,
    timing: items.filter((r) => ['time_optimization', 'transport'].includes(r.kind)).length,
    tips: items.filter((r) => ['smart_tip', 'alternative_route'].includes(r.kind)).length,
  }), [items]);

  // ── Auto-load recommendations when screen mounts and none exist yet ──
  const autoLoadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!trip || !uid || refreshing || isCompletedOrCancelled) return;
    // Only auto-load once per trip session to avoid repeated calls
    if (autoLoadedRef.current.has(trip.id)) return;
    // Only auto-load when there's no data yet
    if (items.length > 0) return;

    autoLoadedRef.current.add(trip.id);
    (async () => {
      setRefreshing(true);
      try {
        await refreshTripMonitoring(trip.id);
      } catch {
        // Silently fail — user can still tap the refresh button
      } finally {
        setRefreshing(false);
      }
    })();
  }, [trip?.id, uid, items.length, isCompletedOrCancelled]);

  async function handleRefresh() {
    if (!trip || !uid || refreshing || isCompletedOrCancelled) return;
    setRefreshing(true);
    try {
      await refreshTripMonitoring(trip.id);
    } catch (e: any) {
      // If Firebase function is unavailable, do a local refresh of recommendations
      if (e?.message === 'Unavailable' || e?.code === 'unavailable') {
        showAlertModal('Refresh limited', 'Could not reach server. Showing cached recommendations.', [{ text: 'OK', style: 'primary' }]);
      } else {
        showAlertModal('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);
      }
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
      // Fallback: share without Firebase function
      const fallbackMessage = [
        `📍 ${trip.title}`,
        `From: ${trip.from || 'Origin'} → To: ${trip.to || 'Destination'}`,
        trip.departureTime ? `📅 ${new Date(trip.departureTime).toLocaleDateString()}` : '',
        '',
        'Powered by TICS — Travel Intelligence & Coordination System',
      ].filter(Boolean).join('\n');
      
      try {
        await Share.share({
          message: fallbackMessage,
          title: trip?.title ?? 'TICS Trip',
        });
      } catch {
        // User cancelled share - do nothing
      }
    } finally {
      setSharing(false);
    }
  }

  const { toggleSave } = useSaveStore();

  async function handleToggleSave(rec: Recommendation) {
    try {
      await toggleSave({
        itemId: rec.id,
        itemType: 'recommendation',
        tripId: rec.tripId,
        data: { title: rec.title, message: rec.message, kind: rec.kind, category: rec.category },
      });
    } catch { /* swallow */ }
  }

  async function handleAskAIDestinationTips(rec: Recommendation) {
    // Navigate to assistant with destination tips via store
    const msg = `[Destination Tips Request]\nI'm traveling to ${trip?.to ?? 'my destination'}${trip?.departureTime ? ` on ${new Date(trip.departureTime).toLocaleDateString()}` : ''}. Can you provide personalized advice including:\n1. Local transportation tips\n2. Weather preparation based on current conditions\n3. Safety considerations\n4. Cultural etiquette and local customs\n5. Packing suggestions\n6. Nearby attractions or things to do`;
    useAssistantStore.getState().setPendingMessage(msg, rec.tripId);
    router.push('/assistant' as any);
  }

  async function handleClearCompleted() {
    if (!trip || !uid) return;
    try {
      const db = getFirebaseFirestore();
      const batch = writeBatch(db);

      // Clear recommendations for this trip from flat collection
      const recSnap = await getDocs(collection(db, 'recommendations'));
      recSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.tripId === trip.id) batch.delete(d.ref);
      });

      // Clear from trip subcollection
      const tripRecSnap = await getDocs(collection(db, 'trips', trip.id, 'recommendations'));
      tripRecSnap.docs.forEach((d) => batch.delete(d.ref));

      await batch.commit();
      showAlertModal('Cleared', `Recommendations cleared for "${trip.title}".`, [{ text: 'OK', style: 'primary' }]);
    } catch (e: any) {
      showAlertModal('Error', e?.message ?? 'Could not clear recommendations.', [{ text: 'OK', style: 'primary' }]);
    }
  }

  return (
    <View className='p-1' style={{ flex: 1, backgroundColor: '#0a0b1e' }}>

      {/* ── Header ── */}
      <View className='bg-tics-amber/25 border border-tics-amber/10 rounded-full p-2' style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            height: 46, width: 46,
            alignItems: 'center', justifyContent: 'center'
          }}
          className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'>

          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setShowOptions(true)}
            style={{
              height: 46, width: 46,
              alignItems: 'center', justifyContent: 'center'
            }}
            className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#f8fafc" />
          </Pressable>
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={{
              height: 46, width: 46,
              alignItems: 'center', justifyContent: 'center'
            }}
            className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'>
            {sharing ? <ActivityIndicator size={14} color="rgba(248,250,252,0.7)" /> : <Ionicons name="share-social-outline" size={18} color="rgba(248,250,252,0.7)" />}
          </Pressable>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={{
              height: 46, width: 46,
              alignItems: 'center', justifyContent: 'center'
            }}
            className='bg-tics-amber/35 border border-tics-amber/20 rounded-full'
          >
            {refreshing ? <ActivityIndicator size={14} color="#fff" /> : <Ionicons name="refresh" size={18} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <View className="mt-2 px-1" style={{ flex: 1, maxHeight: 50 }} >
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 18 }}>Smart Recommendations</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 1 }}>
          {trip?.title ?? 'No trip selected'} · {items.length} insight{items.length !== 1 ? 's' : ''}
        </SafeText>
      </View>

      {/* ── Trip switcher ── */}
      {trips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44 }}
          className="px-1"
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
        >
          {trips.map((t) => {
            const sel = t.id === trip?.id;
            return (
              <Pressable key={t.id} onPress={() => setSelectedTripId(t.id)}>
                <View
                  className={`p-4 rounded-full ${sel ? "bg-tics-amber/35 border border-tics-amber/20" : ""} border border-tics-amber/20`}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 12, color: sel ? '#fff' : 'rgba(148,163,184,0.7)' }}>
                    {t.title}
                  </SafeText>
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
        style={{ maxHeight: 50, marginBottom: 8 }}
        className="px-1"
        contentContainerStyle={{ gap: 8, alignItems: 'center' }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const count = counts[t.id];
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)}>
              <View
                className={`rounded-full p-3 px-4 mt-1 ${active ? "bg-tics-green/35 border border-tics-green/20" : ""} border border-tics-amber/20`}
              >
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 12, color: active ? '#fff' : 'rgba(148,163,184,0.7)' }}>
                  {t.label}{count > 0 ? ` (${count})` : ''}
                </SafeText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Cards ── */}
      <ScrollView
        className="px-1"
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((rec) => {
          const meta = KIND_META[rec.kind] ?? KIND_META.smart_tip!;
          const urgency = URGENCY_CFG[rec.urgency ?? 'low'] ?? URGENCY_CFG.low;
          const saved = isSaved(rec.id);

          return (
            <View
              key={rec.id}
              className='rounded-4xl'
              style={{
                backgroundColor: meta.bg,
                overflow: 'hidden',
              }}
            >
              {/* Top color accent */}

              <View style={{ padding: 16 }}>
                {/* Kind + urgency row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View className='rounded-full' style={{ width: 34, height: 34, backgroundColor: `${meta.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={meta.icon as any} size={17} color={meta.color} />
                    </View>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: meta.color, fontSize: 10, letterSpacing: 0.8 }}>
                      {meta.label.toUpperCase()}
                    </SafeText>
                  </View>
                  {rec.urgency && (
                    <View className='rounded-full' style={{ paddingHorizontal: 9, paddingVertical: 3, backgroundColor: urgency.bg }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: urgency.color, fontSize: 9, letterSpacing: 0.5 }}>
                        {urgency.label}
                      </SafeText>
                    </View>
                  )}
                </View>

                {/* Title */}
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 15, lineHeight: 22 }}>
                  {rec.title}
                </SafeText>

                {/* Message */}
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, lineHeight: 20, marginTop: 6 }} numberOfLines={3}>
                  {rec.message}
                </SafeText>

                {/* Confidence bar */}
                {rec.confidenceScore != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round(rec.confidenceScore * 100)}%`, height: '100%', backgroundColor: meta.color, borderRadius: 99 }} />
                    </View>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(148,163,184,0.5)', fontSize: 10 }}>
                      {Math.round(rec.confidenceScore * 100)}%
                    </SafeText>
                  </View>
                )}

                {/* Category tag */}
                {rec.category && (
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(148,163,184,0.5)', fontSize: 10, marginTop: 8 }}>
                    {rec.category.toUpperCase()}
                  </SafeText>
                )}

                {/* Action row */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Pressable
                    onPress={() => router.push(({ pathname: `/recommendations/${rec.id}` } as any))}
                    className='rounded-full'
                    style={{ flex: 1, backgroundColor: meta.color, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: meta.color === '#F59E0B' ? 'rgba(10,11,30,0.9)' : '#fff', fontSize: 12 }}>
                      {rec.actionText ?? 'View details'}
                    </SafeText>
                  </Pressable>
                  <Pressable
                    onPress={() => handleToggleSave(rec)}
                    className='rounded-full'
                    style={{ width: 46, height: 46, borderWidth: 1, borderColor: saved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)', backgroundColor: saved ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color={saved ? '#22C55E' : 'rgba(248,250,252,0.6)'} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleAskAIDestinationTips(rec)}
                    className='rounded-full'
                    style={{ width: 46, height: 46, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', backgroundColor: 'rgba(34,197,94,0.07)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="compass-outline" size={17} color="#22C55E" />
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
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17, textAlign: 'center' }}>
              {tab === 'all'
                ? 'Monitoring is warming up'
                : `No ${tab} recommendations yet`}
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>
              {trip
                ? `TICS generates ${tab === 'all' ? 'personalized' : tab} recommendations from live ${tab === 'weather' ? 'weather conditions' : tab === 'flight' ? 'flight data' : tab === 'timing' ? 'departure timing' : 'travel intelligence'} for ${trip.title}. Tap refresh to run a monitoring cycle now.`
                : 'Add a trip to receive AI-powered recommendations based on real-time flight and weather data.'}
            </SafeText>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.1)', paddingHorizontal: 20, paddingVertical: 12 }}
            >
              {refreshing ? <ActivityIndicator size={14} color="#22C55E" /> : <Ionicons name="refresh" size={16} color="#22C55E" />}
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 13 }}>
                {refreshing ? 'Running monitoring cycle…' : 'Run monitoring cycle'}
              </SafeText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Options Modal */}
      <Modal transparent visible={showOptions} animationType="fade">
        <View className="flex-1 bg-black/60 items-center justify-center px-2">
          <View className="w-full bg-tics-bg2 rounded-4xl p-6 border border-[#96C7B3]/30">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-xl text-tics-red mb-2">
              Recommendations
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-gray-500 mb-6">
              Actions
            </SafeText>

            {isCompletedOrCancelled && (
              <Pressable
                onPress={() => {
                  setShowOptions(false);
                  handleClearCompleted();
                }}
                className="bg-tics-red rounded-xl py-4 mb-3"
              >
                <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center font-semibold text-black">
                  Clear completed trip recommendations
                </SafeText>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                setShowOptions(false);
                handleRefresh();
              }}
              className="bg-tics-amber/35 border border-tics-amber/20 rounded-full py-6 mb-3"
            >
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-tics-text font-semibold">
                Refresh monitoring
              </SafeText>
            </Pressable>

            <Pressable
              onPress={() => setShowOptions(false)}
              className="py-6 bg-tics-red rounded-full border border-tics-red/20"
            >
              <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-black">
                Cancel
              </SafeText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
