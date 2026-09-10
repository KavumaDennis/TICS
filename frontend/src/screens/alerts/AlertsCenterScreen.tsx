import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import Card from '@/src/components/Card';
import type { Alert } from '@/src/store/alertStore';
import { useAlertStore } from '@/src/store/alertStore';
import { useTripStore } from '@/src/store/tripStore';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useAlertModal } from '@/src/components/AlertModal';
import { refreshTripMonitoring } from '@/src/firebase/callables';
import { SafeText } from '@/src/components/responsive/SafeText';

type TabKey = 'all' | 'active' | 'updates';

/* ── Per-severity styling ─────────────────────────────────────────────────── */

function severityStyles(sev: Alert['severity'] | string) {
  switch (sev) {
    case 'critical':
      return {
        icon: 'alert-circle' as const,
        color: '#EF4444',
        cardBg: 'rgba(239,68,68,0.30)',
        tagBg: '#EF4444',
        tagText: '#fff',
        iconGradient: ['rgba(239,68,68,0.18)', 'rgba(239,68,68,0.06)'] as [string, string],
        label: 'CRITICAL',
      };
    case 'warning':
      return {
        icon: 'warning' as const,
        color: '#F59E0B',
        cardBg: 'rgba(245,158,11,0.30)',
        tagBg: '#F59E0B',
        tagText: '#000',
        iconGradient: ['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.06)'] as [string, string],
        label: 'WARNING',
      };
    case 'info':
      return {
        icon: 'information-circle' as const,
        color: '#3B82F6',
        cardBg: 'rgba(59,130,246,0.30)',
        tagBg: '#3B82F6',
        tagText: '#fff',
        iconGradient: ['rgba(59,130,246,0.18)', 'rgba(59,130,246,0.06)'] as [string, string],
        label: 'INFO',
      };
    default:
      // low / unknown
      return {
        icon: 'checkmark-circle' as const,
        color: '#22C55E',
        cardBg: 'rgba(34,197,94,0.30)',
        tagBg: '#22C55E',
        tagText: '#000',
        iconGradient: ['rgba(34,197,94,0.18)', 'rgba(34,197,94,0.06)'] as [string, string],
        label: 'LOW',
      };
  }
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function AlertsCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('all');
  const [refreshing, setRefreshing] = useState(false);
  const uid = useAuthStore((s) => s.token);

  const { modal: alertModal, showAlert: showRefreshAlert } = useAlertModal();
  const { modal: optionsModal, showAlert: showOptionsAlert } = useAlertModal();

  // Allow switching between trips in this screen
  const trips = useTripStore((s) => s.trips);
  const storedActiveTripId = useTripStore((s) => s.activeTripId);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Resolve which trip to show — prefer local selection, fall back to active
  const trip = useMemo(() => {
    const id = selectedTripId ?? storedActiveTripId;
    return id ? trips.find((t) => t.id === id) ?? trips[0] ?? null : trips[0] ?? null;
  }, [selectedTripId, storedActiveTripId, trips]);

  // Trip status awareness
  const { isCompleted, isCancelled, showLiveAlerts } = useTripStatus(trip);
  const isCompletedOrCancelled = isCompleted || isCancelled;

  const alertsByTripId = useAlertStore((s) => s.alertsByTripId);
  const alerts = useMemo(() => {
    if (!trip) return [];
    return alertsByTripId[trip.id] ?? [];
  }, [alertsByTripId, trip]);

  // For completed trips, only show historical alerts (mark all as read/not active)
  const adjustedAlerts = useMemo(() => {
    if (isCompletedOrCancelled) {
      return alerts.map((a) => ({ ...a, active: false }));
    }
    return alerts;
  }, [alerts, isCompletedOrCancelled]);

  // ── Auto-load alerts when screen mounts and no alerts exist yet ──
  const autoLoadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!trip || !uid || refreshing || isCompletedOrCancelled) return;
    // Only auto-load once per trip session to avoid repeated calls
    if (autoLoadedRef.current.has(trip.id)) return;
    // Only auto-load when there's no data yet
    if (alerts.length > 0) return;

    autoLoadedRef.current.add(trip.id);
    (async () => {
      setRefreshing(true);
      try {
        await refreshTripMonitoring(trip.id);
        if (uid && trip) useAlertStore.getState().startAlertsListener(uid, trip.id);
      } catch {
        // Silently fail — user can still tap the refresh button
      } finally {
        setRefreshing(false);
      }
    })();
  }, [trip?.id, uid, alerts.length, isCompletedOrCancelled]);

  async function handleRefresh() {
    if (!trip || !uid || refreshing || isCompletedOrCancelled) return;
    setRefreshing(true);
    try {
      await refreshTripMonitoring(trip.id);
      if (uid && trip) useAlertStore.getState().startAlertsListener(uid, trip.id);
    } catch (e: any) {
      if (e?.message === 'Unavailable' || e?.code === 'unavailable') {
        showRefreshAlert('Refresh limited', 'Could not reach server. Showing cached data.', [{ text: 'OK', style: 'primary' }]);
      } else {
        showRefreshAlert('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const counts = useMemo(() => ({
    all: adjustedAlerts.length,
    active: adjustedAlerts.filter((a) => a.active && !a.read).length,
    updates: adjustedAlerts.filter((a) => a.read || !a.active).length,
  }), [adjustedAlerts]);

  // Tab filter only — no severity filter row
  const filtered = useMemo(() => {
    if (tab === 'active') return adjustedAlerts.filter((a) => a.active && !a.read);
    if (tab === 'updates') return adjustedAlerts.filter((a) => a.read || !a.active);
    return adjustedAlerts;
  }, [adjustedAlerts, tab]);

  function TabChip({ id, label, count }: { id: TabKey; label: string; count: number }) {
    const isActive = tab === id;
    return (
      <Pressable onPress={() => setTab(id)} className="active:opacity-90">
        <View
          className={[
            'rounded-full border px-6 py-3',
            isActive ? 'border-tics-red bg-tics-red' : 'border border-tics-amber/20',
          ].join(' ')}
        >
          <SafeText
            style={{ fontFamily: 'ShareTech_400Regular' }}
            className={`text-[11px] ${isActive ? 'text-white' : 'text-tics-muted'}`}
          >
            {label}{count > 0 ? ` (${count})` : ''}
          </SafeText>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 p-1">

      {/* ── Header ── */}
      <View className="p-2 mb-4 flex-row items-center justify-between gap-1 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.back()}
            style={{ height: 46, width: 46 }}
            className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          {/* <View
            style={{ height: 46, width: 46 }}
            className="items-center justify-center rounded-full border border-tics-red/50">
            <Ionicons name="notifications-outline" size={18} color="#EF4444" />
          </View> */}
        </View>

        <View className="px-2 pb-1">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[17px] text-white">Alerts Center</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-[13px] text-slate-400">
            {trip?.title ?? 'No active trips'}
          </SafeText>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={{ height: 46, width: 46 }}
            className="bg-tics-amber/35 border border-tics-amber/20 rounded-full items-center justify-center"
          >
            {refreshing
              ? <ActivityIndicator size={16} color="#96C7B3" />
              : <Ionicons name="refresh" size={18} color="#fff" />}
          </Pressable>
          <Pressable
            onPress={() => showOptionsAlert('Alerts', 'Actions', [
              { text: 'Mark all read', style: 'primary', onPress: () => { if (trip) useAlertStore.getState().markAllRead(trip.id); } },
              { text: 'Clear tab filter', onPress: () => setTab('all') },
              { text: 'Cancel', style: 'cancel' },
            ])}
            style={{ height: 46, width: 46 }}
            className="bg-tics-amber/35 border border-tics-amber/20 rounded-full items-center justify-center"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* ── Title ── */}


      {/* ── Trip switcher (shows when user has multiple trips) ── */}
      {trips.length > 1 && (
        <ScrollView
          className="mb-1 px-1"
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44 }}
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
        >
          {trips.map((t) => {
            const isSelected = t.id === trip?.id;
            return (
              <Pressable key={t.id} onPress={() => setSelectedTripId(t.id)}>
                <View style={{
                  borderWidth: 1,
                }}
                className={`p-4 rounded-full ${isSelected ? "bg-tics-amber/35 border border-tics-amber/20" : ""} border border-tics-amber/20`}
                >
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 12, color: isSelected ? '#fff' : 'rgba(148,163,184,0.8)' }}>
                    {t.title}
                  </SafeText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ── Tab chips (All / Active / Updates) ── */}
      <View className="flex-row gap-3 mt-2 px-1">
        <TabChip id="all" label="All" count={counts.all} />
        <TabChip id="active" label="Active" count={counts.active} />
        <TabChip id="updates" label="Updates" count={counts.updates} />
      </View>

      {/* ── Count + mark all read ── */}
      <View className="p-2 mx-1 flex-row items-center justify-between gap-1 bg-tics-amber/25 border border-tics-amber/10 rounded-full px-2 mt-3">
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[12px] text-slate-400 ml-2">
          {filtered.length ? `${filtered.length} in view` : 'No alerts in this view'}
        </SafeText>
        <Pressable
          onPress={() => trip ? useAlertStore.getState().markAllRead(trip.id).catch(() => { }) : undefined}
          className="p-2 z-10 flex-row items-center justify-between gap-1 bg-tics-amber/25 border border-tics-amber/10 rounded-full px-4 py-3"
        >
          <Ionicons name="checkmark-done" size={17} color="#f8fafc" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-[12px] text-white">Mark all read</SafeText>
        </Pressable>
      </View>

      {/* ── Alert cards — severity shown as TAG on each card ── */}
      <ScrollView
        className="mt-3 flex-1 px-1"
        contentContainerStyle={{ gap: 12, paddingBottom: 12, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((a) => {
          const s = severityStyles(a.severity);
          return (
            <Pressable
              key={a.id}
              onPress={() => router.push(({ pathname: `/alerts/${a.id}` } as any))}
              className="active:opacity-80"
            >
              <View
                style={{
                  backgroundColor: s.cardBg,
                  padding: 16,
                }}
                className='rounded-4xl'
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <LinearGradient
                    colors={s.iconGradient}
                    style={{
                      width: 40,
                      height: 40,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    className='rounded-full'
                  >
                    <Ionicons name={s.icon} size={20} color={s.color} />
                  </LinearGradient>

                  {/* Content */}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    {/* Title + severity tag on same row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <SafeText
                        style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14, flex: 1 }}
                        numberOfLines={2}
                      >
                        {a.title ?? 'Alert'}
                      </SafeText>
                      {/* Colored severity tag — NOT a filter, just a label */}
                      <View
                        style={{
                          backgroundColor: s.tagBg,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                        className='rounded-full'
                      >
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: s.tagText, fontSize: 10 }}>
                          {s.label}
                        </SafeText>
                      </View>
                    </View>

                    <SafeText
                      style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, lineHeight: 20, marginTop: 6 }}
                    >
                      {a.message ?? ''}
                    </SafeText>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Empty state */}
        {!filtered.length && (
          <Card accent="none" className="items-center px-6 py-14">
            <LinearGradient
              colors={['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.05)']}
              style={{
                width: 72, height: 72, borderRadius: 36,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.25)',
              }}
            >
              <Ionicons name="notifications-off-outline" size={32} color="#f87171" />
            </LinearGradient>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[16px] text-white">
              Nothing to review
            </SafeText>
            <Text style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-3 text-center text-[13px] leading-5 text-slate-400">
              When monitoring detects delays, gate changes, or weather impacts they show up here with severity tags and clear next steps.
            </Text>
          </Card>
        )}
      </ScrollView>
      {alertModal}
      {optionsModal}
    </View>
  );
}
