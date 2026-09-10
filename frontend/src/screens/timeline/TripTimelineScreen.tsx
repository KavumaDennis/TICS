/**
 * TripTimelineScreen — Type-Aware Timeline
 *
 * Automatically adapts timeline steps based on trip type:
 *   LOCAL:        Leave → Breakfast → Visit → Lunch → Return
 *   REGIONAL:     Leave → Border → Immigration → Currency → Fuel → Accommodation
 *   INTERNATIONAL: Airport → Check-in → Security → Immigration → Boarding → Transit → Arrival → Hotel
 */

import { airlineName } from '@/src/utils/airlineDisplay';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import Card from '@/src/components/Card';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useWeatherStore } from '@/src/store/weatherStore';
import { useTripStatus } from '@/src/hooks/useTripStatus';
import { useTripType, TripType } from '@/src/hooks/useTripType';
import { STATUS_META } from '@/src/utils/tripStatus';
import { SafeText } from '@/src/components/responsive/SafeText';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type StepKind =
  | 'departure' | 'arrival' | 'stop' | 'border' | 'immigration'
  | 'currency' | 'fuel' | 'accommodation' | 'checkin' | 'security'
  | 'boarding' | 'inflight' | 'transit' | 'hotel' | 'local_transport'
  | 'activity' | 'meal' | 'return' | 'customs' | 'baggage' | 'lastmile'
  | 'generic';

type TimelineStep = {
  key: string;
  kind: StepKind;
  time: string;
  title: string;
  meta: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  iconColor: string;
  iconBg: string;
  connectorColor: string;
  badge?: string;
};

/* ─── Step config per kind ──────────────────────────────────────────────── */

const STEP_STYLE: Record<StepKind, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  connectorColor: string;
  defaultTag: string;
  tagColor: string;
  tagBg: string;
}> = {
  departure: {
    icon: 'airplane-outline', iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)',
    connectorColor: 'rgba(59,130,246,0.4)', defaultTag: 'On Track', tagColor: '#3B82F6', tagBg: 'rgba(59,130,246,0.12)',
  },
  arrival: {
    icon: 'location-outline', iconColor: '#22C55E', iconBg: 'rgba(34,197,94,0.40)',
    connectorColor: 'rgba(34,197,94,0.3)', defaultTag: 'Landing', tagColor: '#22C55E', tagBg: 'rgba(34,197,94,0.12)',
  },
  stop: {
    icon: 'pause-circle-outline', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)',
    connectorColor: 'rgba(245,158,11,0.3)', defaultTag: 'Stop', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
  },
  border: {
    icon: 'trail-sign-outline', iconColor: '#F97316', iconBg: 'rgba(249,115,22,0.40)',
    connectorColor: 'rgba(249,115,22,0.3)', defaultTag: 'Border', tagColor: '#F97316', tagBg: 'rgba(249,115,22,0.12)',
  },
  immigration: {
    icon: 'document-text-outline', iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.40)',
    connectorColor: 'rgba(139,92,246,0.3)', defaultTag: 'Immigration', tagColor: '#8B5CF6', tagBg: 'rgba(139,92,246,0.12)',
  },
  currency: {
    icon: 'cash-outline', iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.40)',
    connectorColor: 'rgba(20,184,166,0.3)', defaultTag: 'Currency', tagColor: '#14B8A6', tagBg: 'rgba(20,184,166,0.12)',
  },
  fuel: {
    icon: 'flash-outline', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)',
    connectorColor: 'rgba(245,158,11,0.3)', defaultTag: 'Fuel', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
  },
  accommodation: {
    icon: 'bed-outline', iconColor: '#EC4899', iconBg: 'rgba(236,72,153,0.40)',
    connectorColor: 'rgba(236,72,153,0.3)', defaultTag: 'Stay', tagColor: '#EC4899', tagBg: 'rgba(236,72,153,0.12)',
  },
  checkin: {
    icon: 'person-circle-outline', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)',
    connectorColor: 'rgba(245,158,11,0.3)', defaultTag: 'Check-in', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
  },
  security: {
    icon: 'shield-checkmark-outline', iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.40)',
    connectorColor: 'rgba(139,92,246,0.3)', defaultTag: 'Security', tagColor: '#8B5CF6', tagBg: 'rgba(139,92,246,0.12)',
  },
  boarding: {
    icon: 'enter-outline', iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)',
    connectorColor: 'rgba(59,130,246,0.3)', defaultTag: 'Boarding', tagColor: '#3B82F6', tagBg: 'rgba(59,130,246,0.12)',
  },
  inflight: {
    icon: 'airplane', iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.40)',
    connectorColor: 'rgba(96,165,250,0.25)', defaultTag: 'Monitoring', tagColor: '#60A5FA', tagBg: 'rgba(96,165,250,0.1)',
  },
  transit: {
    icon: 'swap-horizontal-outline', iconColor: '#A78BFA', iconBg: 'rgba(167,139,250,0.40)',
    connectorColor: 'rgba(167,139,250,0.3)', defaultTag: 'Transit', tagColor: '#A78BFA', tagBg: 'rgba(167,139,250,0.12)',
  },
  hotel: {
    icon: 'bed-outline', iconColor: '#EC4899', iconBg: 'rgba(236,72,153,0.40)',
    connectorColor: 'rgba(236,72,153,0.3)', defaultTag: 'Hotel', tagColor: '#EC4899', tagBg: 'rgba(236,72,153,0.12)',
  },
  local_transport: {
    icon: 'car-outline', iconColor: '#A855F7', iconBg: 'rgba(168,85,247,0.40)',
    connectorColor: 'rgba(168,85,247,0.3)', defaultTag: 'Transport', tagColor: '#A855F7', tagBg: 'rgba(168,85,247,0.12)',
  },
  activity: {
    icon: 'walk-outline', iconColor: '#22C55E', iconBg: 'rgba(34,197,94,0.40)',
    connectorColor: 'rgba(34,197,94,0.3)', defaultTag: 'Activity', tagColor: '#22C55E', tagBg: 'rgba(34,197,94,0.12)',
  },
  meal: {
    icon: 'restaurant-outline', iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)',
    connectorColor: 'rgba(245,158,11,0.3)', defaultTag: 'Meal', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
  },
  return: {
    icon: 'return-down-back-outline', iconColor: '#64748B', iconBg: 'rgba(100,116,139,0.40)',
    connectorColor: 'rgba(100,116,139,0.3)', defaultTag: 'Return', tagColor: '#64748B', tagBg: 'rgba(100,116,139,0.12)',
  },
  customs: {
    icon: 'document-text-outline', iconColor: '#F97316', iconBg: 'rgba(249,115,22,0.40)',
    connectorColor: 'rgba(249,115,22,0.3)', defaultTag: 'Customs', tagColor: '#F97316', tagBg: 'rgba(249,115,22,0.12)',
  },
  baggage: {
    icon: 'briefcase-outline', iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.40)',
    connectorColor: 'rgba(20,184,166,0.3)', defaultTag: 'Baggage', tagColor: '#14B8A6', tagBg: 'rgba(20,184,166,0.12)',
  },
  lastmile: {
    icon: 'car-outline', iconColor: '#A855F7', iconBg: 'rgba(168,85,247,0.40)',
    connectorColor: 'rgba(168,85,247,0.3)', defaultTag: 'Last Mile', tagColor: '#A855F7', tagBg: 'rgba(168,85,247,0.12)',
  },
  generic: {
    icon: 'ellipse-outline', iconColor: '#94A3B8', iconBg: 'rgba(148,163,184,0.40)',
    connectorColor: 'rgba(148,163,184,0.2)', defaultTag: 'Scheduled', tagColor: '#94A3B8', tagBg: 'rgba(148,163,184,0.1)',
  },
};

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

/* ─── Timeline Builders ─────────────────────────────────────────────────── */

function buildLocalTimeline(trip: any, dep: Date | null, arr: Date | null): TimelineStep[] {
  const steps: TimelineStep[] = [];

  if (dep) {
    steps.push({
      key: 'leave', kind: 'departure', time: fmt(dep),
      title: `Leave ${trip.from}`, meta: 'Start your road trip',
      tag: 'Departure', tagColor: '#3B82F6', tagBg: 'rgba(59,130,246,0.12)',
      iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)', connectorColor: 'rgba(59,130,246,0.3)',
    });
    steps.push({
      key: 'breakfast', kind: 'meal', time: fmt(addMinutes(dep, 90)),
      title: 'Stop for breakfast', meta: 'Enjoy a meal along the way',
      tag: 'Stop', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
      iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)', connectorColor: 'rgba(245,158,11,0.3)',
    });
    steps.push({
      key: 'visit', kind: 'activity', time: fmt(addMinutes(dep, 150)),
      title: `Visit ${trip.to}`, meta: 'Explore the destination',
      tag: 'Activity', tagColor: '#22C55E', tagBg: 'rgba(34,197,94,0.12)',
      iconColor: '#22C55E', iconBg: 'rgba(34,197,94,0.40)', connectorColor: 'rgba(34,197,94,0.3)',
    });
    steps.push({
      key: 'lunch', kind: 'meal', time: fmt(addMinutes(dep, 300)),
      title: 'Lunch', meta: 'Local cuisine experience',
      tag: 'Meal', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
      iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)', connectorColor: 'rgba(245,158,11,0.3)',
    });
    steps.push({
      key: 'return', kind: 'return', time: fmt(addMinutes(dep, 600)),
      title: 'Return', meta: 'Head back home',
      tag: 'Return', tagColor: '#64748B', tagBg: 'rgba(100,116,139,0.12)',
      iconColor: '#64748B', iconBg: 'rgba(100,116,139,0.40)', connectorColor: 'rgba(100,116,139,0.3)',
    });
  }

  return steps;
}

function buildRegionalTimeline(trip: any, dep: Date | null, arr: Date | null): TimelineStep[] {
  const steps: TimelineStep[] = [];

  if (dep) {
    steps.push({
      key: 'depart', kind: 'departure', time: fmt(dep),
      title: `Leave ${trip.from}`, meta: 'Start your regional journey',
      tag: 'Departure', tagColor: '#3B82F6', tagBg: 'rgba(59,130,246,0.12)',
      iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)', connectorColor: 'rgba(59,130,246,0.3)',
    });
    steps.push({
      key: 'border', kind: 'border', time: fmt(addMinutes(dep, 120)),
      title: 'Border crossing', meta: 'Present passport and vehicle documents',
      tag: 'Required', tagColor: '#F97316', tagBg: 'rgba(249,115,22,0.12)',
      iconColor: '#F97316', iconBg: 'rgba(249,115,22,0.40)', connectorColor: 'rgba(249,115,22,0.3)',
    });
    steps.push({
      key: 'immigration', kind: 'immigration', time: fmt(addMinutes(dep, 150)),
      title: 'Immigration', meta: 'Passport stamping and entry processing',
      tag: 'Required', tagColor: '#8B5CF6', tagBg: 'rgba(139,92,246,0.12)',
      iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.40)', connectorColor: 'rgba(139,92,246,0.3)',
    });
    steps.push({
      key: 'currency', kind: 'currency', time: fmt(addMinutes(dep, 180)),
      title: 'Currency exchange', meta: 'Convert to local currency',
      tag: 'Optional', tagColor: '#14B8A6', tagBg: 'rgba(20,184,166,0.12)',
      iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.40)', connectorColor: 'rgba(20,184,166,0.3)',
    });
    steps.push({
      key: 'fuel', kind: 'fuel', time: fmt(addMinutes(dep, 240)),
      title: 'Fuel stop', meta: 'Refuel before continuing',
      tag: 'Stop', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
      iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)', connectorColor: 'rgba(245,158,11,0.3)',
    });
    if (arr) {
      steps.push({
        key: 'arrive', kind: 'arrival', time: fmt(arr),
        title: `Arrive at ${trip.to}`, meta: 'Destination reached',
        tag: 'Arrival', tagColor: '#22C55E', tagBg: 'rgba(34,197,94,0.12)',
        iconColor: '#22C55E', iconBg: 'rgba(34,197,94,0.40)', connectorColor: 'rgba(34,197,94,0.3)',
      });
      steps.push({
        key: 'accommodation', kind: 'accommodation', time: fmt(addMinutes(arr, 30)),
        title: 'Check into accommodation', meta: 'Settle in and rest',
        tag: 'Stay', tagColor: '#EC4899', tagBg: 'rgba(236,72,153,0.12)',
        iconColor: '#EC4899', iconBg: 'rgba(236,72,153,0.40)', connectorColor: 'rgba(236,72,153,0.3)',
      });
    }
  }

  return steps;
}

function buildInternationalTimeline(trip: any, dep: Date | null, arr: Date | null, flight: any): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const gate = flight?.gate ?? null;
  const terminal = flight?.terminal ?? null;
  const delayMin = flight?.delayMinutes ?? null;

  if (dep) {
    steps.push({
      key: 'airport_arrival', kind: 'checkin', time: fmt(addMinutes(dep, -180)),
      title: 'Airport arrival', meta: terminal ? `Terminal ${terminal}` : 'Arrive 3 hours early',
      tag: 'Be early', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
      iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)', connectorColor: 'rgba(245,158,11,0.3)',
    });
    steps.push({
      key: 'checkin', kind: 'checkin', time: fmt(addMinutes(dep, -150)),
      title: 'Check-in', meta: trip?.flightNumber ? `${airlineName(trip.airline)} ${trip.flightNumber}`.trim() : 'Online or airport desk',
      tag: 'Do this first', tagColor: '#F59E0B', tagBg: 'rgba(245,158,11,0.12)',
      iconColor: '#F59E0B', iconBg: 'rgba(245,158,11,0.40)', connectorColor: 'rgba(245,158,11,0.3)',
    });
    steps.push({
      key: 'security', kind: 'security', time: fmt(addMinutes(dep, -120)),
      title: 'Security screening', meta: terminal ? `Terminal ${terminal}` : 'Allow 45–60 min',
      tag: 'Be early', tagColor: '#8B5CF6', tagBg: 'rgba(139,92,246,0.12)',
      iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.40)', connectorColor: 'rgba(139,92,246,0.3)',
    });
    steps.push({
      key: 'immigration', kind: 'immigration', time: fmt(addMinutes(dep, -90)),
      title: 'Immigration (outbound)', meta: 'Passport control for international travel',
      tag: 'Required', tagColor: '#8B5CF6', tagBg: 'rgba(139,92,246,0.12)',
      iconColor: '#8B5CF6', iconBg: 'rgba(139,92,246,0.40)', connectorColor: 'rgba(139,92,246,0.3)',
    });
    steps.push({
      key: 'boarding', kind: 'boarding', time: fmt(addMinutes(dep, -45)),
      title: 'Boarding', meta: gate ? `Gate ${gate}${terminal ? ` · Terminal ${terminal}` : ''}` : 'Check departure board',
      tag: gate ? `Gate ${gate}` : 'Pending', tagColor: '#3B82F6', tagBg: 'rgba(59,130,246,0.12)',
      iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)', connectorColor: 'rgba(59,130,246,0.3)',
    });
    steps.push({
      key: 'departure', kind: 'departure', time: fmt(dep),
      title: 'Flight departure', meta: trip?.flightNumber ? `${airlineName(trip.airline)} ${trip.flightNumber}`.trim() : 'Scheduled departure',
      tag: delayMin && delayMin >= 30 ? 'Delayed' : 'On Track',
      tagColor: delayMin && delayMin >= 30 ? '#F59E0B' : '#22C55E',
      tagBg: delayMin && delayMin >= 30 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
      iconColor: '#3B82F6', iconBg: 'rgba(59,130,246,0.40)', connectorColor: 'rgba(59,130,246,0.4)',
      badge: delayMin && delayMin > 0 ? `+${delayMin} min delay` : undefined,
    });
    steps.push({
      key: 'inflight', kind: 'inflight', time: '···',
      title: 'In flight', meta: 'Live monitoring & disruption alerts',
      tag: 'Monitoring', tagColor: '#60A5FA', tagBg: 'rgba(96,165,250,0.1)',
      iconColor: '#60A5FA', iconBg: 'rgba(96,165,250,0.40)', connectorColor: 'rgba(96,165,250,0.25)',
    });
  }

  if (arr) {
    steps.push({
      key: 'arrival', kind: 'arrival', time: fmt(arr),
      title: 'Arrival', meta: trip?.to ? `Landing at ${trip.to}` : 'Landing',
      tag: 'Expected', tagColor: '#22C55E', tagBg: 'rgba(34,197,94,0.12)',
      iconColor: '#22C55E', iconBg: 'rgba(34,197,94,0.40)', connectorColor: 'rgba(34,197,94,0.3)',
    });
    steps.push({
      key: 'customs', kind: 'customs', time: fmt(addMinutes(arr, 15)),
      title: 'Immigration & Customs', meta: 'Have your passport and documents ready',
      tag: 'Required', tagColor: '#F97316', tagBg: 'rgba(249,115,22,0.12)',
      iconColor: '#F97316', iconBg: 'rgba(249,115,22,0.40)', connectorColor: 'rgba(249,115,22,0.3)',
    });
    steps.push({
      key: 'baggage', kind: 'baggage', time: fmt(addMinutes(arr, 35)),
      title: 'Baggage claim', meta: 'Collect checked bags at the carousel',
      tag: 'After landing', tagColor: '#14B8A6', tagBg: 'rgba(20,184,166,0.12)',
      iconColor: '#14B8A6', iconBg: 'rgba(20,184,166,0.40)', connectorColor: 'rgba(20,184,166,0.3)',
    });
    steps.push({
      key: 'hotel', kind: 'hotel', time: fmt(addMinutes(arr, 90)),
      title: 'Hotel check-in', meta: 'Settle into your accommodation',
      tag: 'Stay', tagColor: '#EC4899', tagBg: 'rgba(236,72,153,0.12)',
      iconColor: '#EC4899', iconBg: 'rgba(236,72,153,0.40)', connectorColor: 'rgba(236,72,153,0.3)',
    });
    steps.push({
      key: 'local_transport', kind: 'local_transport', time: fmt(addMinutes(arr, 120)),
      title: 'Local transport', meta: 'Explore the city — metro, taxi, or walking',
      tag: 'Explore', tagColor: '#A855F7', tagBg: 'rgba(168,85,247,0.12)',
      iconColor: '#A855F7', iconBg: 'rgba(168,85,247,0.40)', connectorColor: 'rgba(168,85,247,0.3)',
    });
  }

  return steps;
}

/* ─── Screen ────────────────────────────────────────────────────────────── */

export default function TripTimelineScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(() => trips.find((t) => String(t.id) === String(tripId)) ?? null, [tripId, trips]);

  const { isCompleted, isCancelled, statusInfo } = useTripStatus(trip);
  const isCompletedOrCancelled = isCompleted || isCancelled;

  // Trip type classification
  const tripTypeInfo = useTripType(trip);
  const { tripType, isLocal, isRegional, isInternational } = tripTypeInfo;

  const flight = useFlightMonitoringStore((s) => (trip ? s.byTripId[trip.id] ?? null : null));
  const weather = useWeatherStore((s) => (trip ? s.byTripId[trip.id] ?? null : null));

  const dep = trip ? new Date(trip.departureTime) : null;
  const arr = trip ? new Date(trip.arrivalTime) : null;

  /* ── Build steps based on trip type ──────────────────────────────────── */
  const steps: TimelineStep[] = useMemo(() => {
    // If trip has a saved timeline array, use it as base
    const savedTimeline = Array.isArray(trip?.timeline) && trip!.timeline.length > 0
      ? trip!.timeline
          .filter((t: any) => typeof t?.at === 'string' && typeof t?.label === 'string')
          .map((t: any) => {
            const kind = 'generic' as StepKind;
            const style = STEP_STYLE[kind];
            return {
              key: `${t.at}_${t.kind ?? 'item'}`,
              kind,
              time: fmt(new Date(t.at)),
              title: String(t.label),
              meta: String(t.kind ?? 'timeline'),
              tag: style.defaultTag,
              tagColor: style.tagColor,
              tagBg: style.tagBg,
              iconColor: style.iconColor,
              iconBg: style.iconBg,
              connectorColor: style.connectorColor,
            } as TimelineStep;
          })
      : null;

    if (savedTimeline) return savedTimeline;

    // Auto-generate based on trip type
    let generated: TimelineStep[];
    if (isLocal) {
      generated = buildLocalTimeline(trip, dep, arr);
    } else if (isRegional) {
      generated = buildRegionalTimeline(trip, dep, arr);
    } else {
      generated = buildInternationalTimeline(trip, dep, arr, flight);
    }

    // Add completed/cancelled marker
    if (isCompletedOrCancelled) {
      const completedTime = arr ? addMinutes(arr, 60) : (dep ? addMinutes(dep, 240) : new Date());
      generated.push({
        key: 'completed',
        kind: 'generic',
        time: fmt(completedTime),
        title: isCompleted ? 'Trip complete' : 'Trip cancelled',
        meta: isCompleted ? 'All trip phases completed successfully' : 'This trip was cancelled',
        tag: isCompleted ? 'Completed ✓' : 'Cancelled ✗',
        tagColor: '#64748B',
        tagBg: 'rgba(100,116,139,0.12)',
        iconColor: '#64748B',
        iconBg: 'rgba(100,116,139,0.40)',
        connectorColor: 'rgba(100,116,139,0.2)',
      });
    }

    return generated;
  }, [trip, flight, dep, arr, isCompletedOrCancelled, isCompleted, isLocal, isRegional, isInternational]);

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <View className="flex-1 p-1">
      {/* Header */}
      <View className="p-2 mb-2 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full">
        <Pressable onPress={() => router.back()} style={{ height: 46, width: 46 }} className="items-center justify-center bg-tics-amber/35 border border-tics-amber/20 rounded-full">
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="">
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-text text-[17px]">Trip Timeline</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="mt-1 text-tics-muted text-[12px]">{trip?.title ?? ''}</SafeText>
        </View>
        {/* Trip type badge */}
        <View style={{ marginLeft: 'auto', marginRight: 8 }}>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
            backgroundColor: isLocal ? 'rgba(34,197,94,0.15)' : isRegional ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
          }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', fontSize: 10, color: isLocal ? '#22C55E' : isRegional ? '#F59E0B' : '#3B82F6' }}>
              {isLocal ? 'LOCAL' : isRegional ? 'REGIONAL' : 'INTERNATIONAL'}
            </SafeText>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 8, paddingTop: 12, gap: 0 }} showsVerticalScrollIndicator={false}>
        {/* Date header */}
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[12px] uppercase tracking-widest mb-4">
          {dep ? dep.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
        </SafeText>

        {/* Step count */}
        <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-tics-muted text-[11px] mb-4">
          {steps.length} steps · {isLocal ? 'Road trip' : isRegional ? 'Regional journey' : 'International flight'}
        </SafeText>

        {/* Vertical timeline */}
        {steps.map((step, index) => {
          const style = STEP_STYLE[step.kind];
          const isLast = index === steps.length - 1;
          return (
            <View key={step.key} className="flex-row" style={{ marginBottom: 0 }}>
              <View className="items-center" style={{ width: 44 }}>
                {index > 0 && <View style={{ width: 2, flex: 1, backgroundColor: step.connectorColor, marginBottom: -2 }} />}
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: step.iconBg, borderWidth: 1, borderColor: step.iconColor + '10', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <Ionicons name={style.icon} size={20} color={step.iconColor} />
                </View>
                {!isLast && <View style={{ width: 2, flex: 1, backgroundColor: step.connectorColor, marginTop: -2 }} />}
              </View>

              <View className="flex-1" style={{ marginLeft: 12, marginBottom: 16, marginTop: index === 0 ? 0 : -8 }}>
                <View className="border border-tics-amber/10 bg-tics-amber/25" style={{ overflow: 'hidden', borderBottomRightRadius: 24, borderTopRightRadius: 24 }}>
                  <View style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 3, backgroundColor: step.iconColor }} />
                  <View style={{ paddingLeft: 14, paddingRight: 12, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}>{step.time}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 15, marginTop: 2 }}>{step.title}</SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 4 }}>{step.meta}</SafeText>
                        {step.badge ? (
                          <View style={{ marginTop: 6, alignSelf: 'flex-start', borderRadius: 99, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', paddingHorizontal: 8, paddingVertical: 2 }}>
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 10 }}>⚠ {step.badge}</SafeText>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, backgroundColor: step.tagBg, borderColor: step.tagColor + '50', flexShrink: 0, marginTop: 2 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: step.tagColor, fontSize: 10 }}>{step.tag}</SafeText>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {/* Last-mile CTA — only for regional/international trips */}
        {!isLocal && (
          <Pressable onPress={() => trip && router.push(({ pathname: `/last-mile/${trip.id}` } as any))} className="mt-4 bg-tics-amber/35 border border-tics-amber/20 rounded-full p-6">
            <SafeText style={{ fontFamily: 'ShareTech_400Regular' }} className="text-center text-[13px] text-tics-text">
              Open Last-Mile Coordination
            </SafeText>
          </Pressable>
        )}
      </ScrollView>

      <PersistentTabBar />
    </View>
  );
}