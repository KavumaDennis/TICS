/**
 * RecoveryTripScreen.tsx
 * Recovery trip screen with SafeText for overflow prevention.
 */
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, useEffect } from 'react';
import { Pressable, ScrollView, Text, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeText } from '@/src/components/responsive/SafeText';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import {
  RecoveryPlan,
  RecoveryAction,
  DisruptionEvent,
  detectDisruption,
  completeAction,
  isPlanComplete,
  buildMonitoringContext,
} from '@/src/services/RecoveryService';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useWeatherStore } from '@/src/store/weatherStore';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: '#22C55E', bg: 'rgba(34,197,94,0.15)', label: 'LOW' },
  warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', label: 'WARNING' },
  info: { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', label: 'INFO' },
  critical: { color: '#DC2626', bg: 'rgba(220,38,38,0.20)', label: 'CRITICAL' },
};

export default function RecoveryTripScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [tripId, trips]);

  const [disruption, setDisruption] = useState<DisruptionEvent | null>(null);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const flight = useFlightMonitoringStore.getState().byTripId[trip.id] ?? null;
        const weather = useWeatherStore.getState().byTripId[trip.id] ?? null;
        const ctx = buildMonitoringContext(trip);
        const ev = detectDisruption(ctx);
        if (ev.type !== 'none' && !cancelled) {
          setDisruption(ev);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [trip]);

  const complete = async (action: RecoveryAction) => {
    if (!plan) return;
    setCompletingIds((prev) => new Set(prev).add(action.id));
    try {
      await completeAction(action, plan);
      setPlan((prev) =>
        prev
          ? {
            ...prev,
            actions: prev.actions.map((a) => (a.id === action.id ? { ...a, completed: true } : a)),
          }
          : null,
      );
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  };

  if (!trip) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#94a3b8" />
        <SafeText className="text-tics-muted text-[16px] mt-4 text-center">Trip not found</SafeText>
        <Pressable onPress={() => router.back()} className="mt-6 rounded-full bg-tics-amber/35 border border-tics-amber/20 px-6 py-3">
          <SafeText className="text-tics-text text-[14px]">Go Back</SafeText>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#F59E0B" />
        <SafeText className="text-tics-muted text-[14px] mt-4">Analyzing disruption...</SafeText>
      </View>
    );
  }

  if (!disruption || !plan) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <MaterialCommunityIcons name="check-circle-outline" size={64} color="#22C55E" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', }} className="text-tics-text text-[16px] mt-4 text-center">No active disruptions</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', }} className="text-tics-muted text-[14px] mt-2 text-center">Your trip is proceeding normally</SafeText>
        <Pressable onPress={() => router.back()}  className="mt-6 rounded-full bg-tics-amber/35 border border-tics-amber/20 px-10 p-6 ">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', }} className="text-tics-text text-[14px]">Return to Trip</SafeText>
        </Pressable>
      </View>
    );
  }

  const sev = SEVERITY_CONFIG[disruption.severity] || SEVERITY_CONFIG.warning;

  return (
    <View className="flex-1 bg-[#0a0b1e]">
      <View className="p-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full mb-3">
        <Pressable onPress={() => router.back()} style={{ height: 46, width: 46 }} className="items-center justify-center rounded-full bg-tics-amber/35 border border-tics-amber/20">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="flex-1">
          <SafeText className="text-[16px] text-tics-text font-bold" numberOfLines={1}>Recovery Plan</SafeText>
          <SafeText className="text-[11px] text-tics-muted" numberOfLines={1}>{trip.title}</SafeText>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: sev.bg }}>
          <SafeText style={{ color: sev.color, fontSize: 11 }}>{sev.label}</SafeText>
        </View>
      </View>

      <ScrollView className="px-1" contentContainerStyle={{ gap: 16, paddingBottom: 100 }}>
        <View className="rounded-4xl border border-tics-amber/40 bg-white/[0.06] p-5">
          <View className="flex-row items-center gap-3 mb-3">
            <MaterialCommunityIcons name="alert-outline" size={24} color={sev.color} />
            <SafeText className="text-tics-text text-[16px] font-bold" numberOfLines={3}>{disruption.message}</SafeText>
          </View>
          {(disruption.details.delayMinutes ?? 0) > 0 && (
            <View className="mt-3 flex-row items-center gap-2">
              <Ionicons name="time-outline" size={16} color="#F59E0B" />
              <SafeText className="text-tics-amber text-[14px]">Delay: {disruption.details.delayMinutes} minutes</SafeText>
            </View>
          )}
          {plan.newETA && (
            <View className="mt-2 flex-row items-center gap-2">
              <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
              <SafeText className="text-tics-blue text-[14px]">New arrival: {new Date(plan.newETA).toLocaleString()}</SafeText>
            </View>
          )}
        </View>

        <View className="rounded-4xl border border-tics-amber/40 bg-white/[0.06] p-5">
          <View className="flex-row items-center justify-between mb-4">
            <SafeText className="text-tics-text text-[14px] font-bold">RECOVERY ACTIONS</SafeText>
            <SafeText className="text-tics-muted text-[12px]">
              {plan.actions.filter((a) => a.completed).length}/{plan.actions.length}
            </SafeText>
          </View>

          <View className="gap-3">
            {plan.actions.map((action) => {
              const busy = completingIds.has(action.id);
              return (
                <Pressable
                  key={action.id}
                  onPress={() => complete(action)}
                  disabled={action.completed || busy}
                  className={[
                    'rounded-2xl border p-4 flex-row items-center gap-3',
                    action.completed ? 'border-tics-green/30 bg-tics-green/10' : 'border-tics-amber/30 bg-white/[0.04]',
                  ].join(' ')}
                >
                  <View className={['w-6 h-6 rounded-full border-2 items-center justify-center', action.completed ? 'border-tics-green bg-tics-green/20' : 'border-tics-amber/50'].join(' ')}>
                    {action.completed && <Ionicons name="checkmark" size={14} color="#22C55E" />}
                  </View>
                  <View className="flex-1">
                    <SafeText className={['text-[13px] font-medium', action.completed ? 'text-tics-green' : 'text-tics-text'].join(' ')} numberOfLines={2}>
                      {action.label}
                    </SafeText>
                    <SafeText className="text-tics-muted text-[11px] mt-0.5" numberOfLines={2}>
                      {action.description}
                    </SafeText>
                  </View>
                  {!action.completed && (
                    <View className={['px-3 py-1 rounded-full border', 'border-white/10 bg-white/[0.04]'].join(' ')}>
                      <SafeText className="text-[10px] uppercase" numberOfLines={1}>
                        {action.target}
                      </SafeText>
                    </View>
                  )}
                  {busy && <ActivityIndicator size="small" color="#F59E0B" />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="rounded-4xl border border-tics-amber/40 bg-white/[0.06] p-5">
          <SafeText className="text-tics-text text-[14px] font-bold mb-3">TRIP SUMMARY</SafeText>
          <View className="gap-2">
            <View className="flex-row justify-between">
              <SafeText className="text-tics-muted text-[12px]">From</SafeText>
              <SafeText className="text-tics-text text-[12px]" numberOfLines={1}>{trip.from}</SafeText>
            </View>
            <View className="flex-row justify-between">
              <SafeText className="text-tics-muted text-[12px]">To</SafeText>
              <SafeText className="text-tics-text text-[12px]" numberOfLines={1}>{trip.to}</SafeText>
            </View>
            <View className="flex-row justify-between">
              <SafeText className="text-tics-muted text-[12px]">Status</SafeText>
              <SafeText className="text-tics-amber text-[12px]" numberOfLines={1}>{isPlanComplete(plan) ? 'Recovered' : 'Recovering'}</SafeText>
            </View>
          </View>
        </View>

        <Pressable onPress={() => router.push({ pathname: `/trip-details/${trip.id}` } as any)}>
          <View className="rounded-full bg-tics-amber/35 border border-tics-amber/20 p-4 items-center">
            <SafeText className="text-tics-text text-[13px]">View Full Trip Details</SafeText>
          </View>
        </Pressable>
      </ScrollView>

      <PersistentTabBar />
    </View>
  );
}