import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import Card from '@/src/components/Card';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useTripStore } from '@/src/store/tripStore';
import { useFlightMonitoringStore } from '@/src/store/flightMonitoringStore';
import { useWeatherStore } from '@/src/store/weatherStore';

/* ─── Types ─────────────────────────────────────────── */

type StepKind =
  | 'checkin'
  | 'security'
  | 'boarding'
  | 'departure'
  | 'inflight'
  | 'arrival'
  | 'customs'
  | 'baggage'
  | 'lastmile'
  | 'hotel'
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
  badge?: string; // e.g. "Delayed 45 min"
};

/* ─── Step config per kind ───────────────────────────── */

const STEP_STYLE: Record<StepKind, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  connectorColor: string;
  defaultTag: string;
  tagColor: string;
  tagBg: string;
}> = {
  checkin: {
    icon: 'person-circle-outline',
    iconColor: '#F59E0B',
    iconBg: 'rgba(245,158,11,0.15)',
    connectorColor: 'rgba(245,158,11,0.3)',
    defaultTag: 'Check-in',
    tagColor: '#F59E0B',
    tagBg: 'rgba(245,158,11,0.12)',
  },
  security: {
    icon: 'shield-checkmark-outline',
    iconColor: '#8B5CF6',
    iconBg: 'rgba(139,92,246,0.15)',
    connectorColor: 'rgba(139,92,246,0.3)',
    defaultTag: 'Security',
    tagColor: '#8B5CF6',
    tagBg: 'rgba(139,92,246,0.12)',
  },
  boarding: {
    icon: 'enter-outline',
    iconColor: '#3B82F6',
    iconBg: 'rgba(59,130,246,0.15)',
    connectorColor: 'rgba(59,130,246,0.3)',
    defaultTag: 'Boarding',
    tagColor: '#3B82F6',
    tagBg: 'rgba(59,130,246,0.12)',
  },
  departure: {
    icon: 'airplane-outline',
    iconColor: '#3B82F6',
    iconBg: 'rgba(59,130,246,0.18)',
    connectorColor: 'rgba(59,130,246,0.4)',
    defaultTag: 'On Track',
    tagColor: '#3B82F6',
    tagBg: 'rgba(59,130,246,0.12)',
  },
  inflight: {
    icon: 'airplane',
    iconColor: '#60A5FA',
    iconBg: 'rgba(96,165,250,0.12)',
    connectorColor: 'rgba(96,165,250,0.25)',
    defaultTag: 'Monitoring',
    tagColor: '#60A5FA',
    tagBg: 'rgba(96,165,250,0.1)',
  },
  arrival: {
    icon: 'location-outline',
    iconColor: '#22C55E',
    iconBg: 'rgba(34,197,94,0.15)',
    connectorColor: 'rgba(34,197,94,0.3)',
    defaultTag: 'Landing',
    tagColor: '#22C55E',
    tagBg: 'rgba(34,197,94,0.12)',
  },
  customs: {
    icon: 'document-text-outline',
    iconColor: '#F97316',
    iconBg: 'rgba(249,115,22,0.15)',
    connectorColor: 'rgba(249,115,22,0.3)',
    defaultTag: 'Customs',
    tagColor: '#F97316',
    tagBg: 'rgba(249,115,22,0.12)',
  },
  baggage: {
    icon: 'briefcase-outline',
    iconColor: '#14B8A6',
    iconBg: 'rgba(20,184,166,0.15)',
    connectorColor: 'rgba(20,184,166,0.3)',
    defaultTag: 'Baggage',
    tagColor: '#14B8A6',
    tagBg: 'rgba(20,184,166,0.12)',
  },
  lastmile: {
    icon: 'car-outline',
    iconColor: '#A855F7',
    iconBg: 'rgba(168,85,247,0.15)',
    connectorColor: 'rgba(168,85,247,0.3)',
    defaultTag: 'Last Mile',
    tagColor: '#A855F7',
    tagBg: 'rgba(168,85,247,0.12)',
  },
  hotel: {
    icon: 'bed-outline',
    iconColor: '#EC4899',
    iconBg: 'rgba(236,72,153,0.15)',
    connectorColor: 'rgba(236,72,153,0.3)',
    defaultTag: 'Hotel',
    tagColor: '#EC4899',
    tagBg: 'rgba(236,72,153,0.12)',
  },
  generic: {
    icon: 'ellipse-outline',
    iconColor: '#94A3B8',
    iconBg: 'rgba(148,163,184,0.12)',
    connectorColor: 'rgba(148,163,184,0.2)',
    defaultTag: 'Scheduled',
    tagColor: '#94A3B8',
    tagBg: 'rgba(148,163,184,0.1)',
  },
};

/* ─── Kind inference ─────────────────────────────────── */

function inferKind(kind: string, label: string): StepKind {
  const k = (kind + label).toLowerCase();
  if (k.includes('check') || k.includes('checkin')) return 'checkin';
  if (k.includes('secur')) return 'security';
  if (k.includes('board')) return 'boarding';
  if (k.includes('depart') || k.includes('takeoff')) return 'departure';
  if (k.includes('flight') || k.includes('in-flight') || k.includes('inflight')) return 'inflight';
  if (k.includes('arriv') || k.includes('land')) return 'arrival';
  if (k.includes('custom') || k.includes('immigrat') || k.includes('passport')) return 'customs';
  if (k.includes('baggage') || k.includes('luggage') || k.includes('bag')) return 'baggage';
  if (k.includes('last') || k.includes('pickup') || k.includes('taxi') || k.includes('transfer')) return 'lastmile';
  if (k.includes('hotel') || k.includes('accommodation') || k.includes('stay')) return 'hotel';
  return 'generic';
}

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ─── Screen ─────────────────────────────────────────── */

export default function TripTimelineScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trips = useTripStore((s) => s.trips);
  const trip = useMemo(
    () => trips.find((t) => String(t.id) === String(tripId)) ?? null,
    [tripId, trips]
  );

  const flight = useFlightMonitoringStore((s) => (trip ? s.byTripId[trip.id] ?? null : null));
  const weather = useWeatherStore((s) => (trip ? s.byTripId[trip.id] ?? null : null));

  const dep = trip ? new Date(trip.departureTime) : null;
  const arr = trip ? new Date(trip.arrivalTime) : null;

  /* ── Build steps ──────────────────────────────────────── */
  const steps: TimelineStep[] = useMemo(() => {
    const atRisk = trip?.monitoringStatus === 'at_risk';
    const gate = flight?.gate ?? null;
    const terminal = flight?.terminal ?? null;
    const delayMin = flight?.delayMinutes ?? null;
    const flightStatus = flight?.status ?? 'unknown';

    // If trip has a saved timeline array, use it as base
    const savedTimeline = Array.isArray(trip?.timeline) && trip!.timeline.length > 0
      ? trip!.timeline
          .filter((t: any) => typeof t?.at === 'string' && typeof t?.label === 'string')
          .map((t: any) => {
            const kind = inferKind(String(t.kind ?? ''), String(t.label));
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

    // Auto-generate from trip fields
    const now = Date.now();
    const depMs = dep?.getTime() ?? 0;

    const result: TimelineStep[] = [];

    // Check-in (3h before departure)
    if (dep) {
      const checkinTime = addMinutes(dep, -180);
      result.push({
        key: 'checkin',
        kind: 'checkin',
        time: fmt(checkinTime),
        title: 'Check-in opens',
        meta: trip?.flightNumber ? `${trip.airline ?? ''} ${trip.flightNumber}`.trim() : 'Online or airport desk',
        tag: 'Do this first',
        tagColor: '#F59E0B',
        tagBg: 'rgba(245,158,11,0.12)',
        iconColor: '#F59E0B',
        iconBg: 'rgba(245,158,11,0.15)',
        connectorColor: 'rgba(245,158,11,0.3)',
      });
    }

    // Security (2h before departure)
    if (dep) {
      result.push({
        key: 'security',
        kind: 'security',
        time: fmt(addMinutes(dep, -120)),
        title: 'Security screening',
        meta: terminal ? `Terminal ${terminal}` : 'Allow 45–60 min',
        tag: 'Be early',
        tagColor: '#8B5CF6',
        tagBg: 'rgba(139,92,246,0.12)',
        iconColor: '#8B5CF6',
        iconBg: 'rgba(139,92,246,0.15)',
        connectorColor: 'rgba(139,92,246,0.3)',
      });
    }

    // Boarding (45min before departure)
    if (dep) {
      result.push({
        key: 'boarding',
        kind: 'boarding',
        time: fmt(addMinutes(dep, -45)),
        title: 'Boarding',
        meta: gate ? `Gate ${gate}${terminal ? ` · Terminal ${terminal}` : ''}` : 'Check departure board',
        tag: gate ? `Gate ${gate}` : 'Pending',
        tagColor: '#3B82F6',
        tagBg: 'rgba(59,130,246,0.12)',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59,130,246,0.18)',
        connectorColor: 'rgba(59,130,246,0.3)',
      });
    }

    // Departure
    const depDelayLabel = delayMin != null && delayMin > 0 ? `+${delayMin} min delay` : null;
    result.push({
      key: 'departure',
      kind: 'departure',
      time: dep ? fmt(dep) : '—',
      title: 'Flight departure',
      meta: trip?.flightNumber
        ? `${trip.airline ?? ''} ${trip.flightNumber}`.trim()
        : 'Scheduled departure',
      tag: atRisk ? 'Watch closely' : delayMin && delayMin >= 30 ? 'Delayed' : 'On Track',
      tagColor: atRisk || (delayMin && delayMin >= 30) ? '#F59E0B' : '#22C55E',
      tagBg: atRisk || (delayMin && delayMin >= 30) ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
      iconColor: '#3B82F6',
      iconBg: 'rgba(59,130,246,0.18)',
      connectorColor: 'rgba(59,130,246,0.4)',
      badge: depDelayLabel ?? undefined,
    });

    // In flight
    result.push({
      key: 'inflight',
      kind: 'inflight',
      time: '···',
      title: 'In flight',
      meta: `Live monitoring & disruption alerts${now > depMs ? ' · Currently airborne' : ''}`,
      tag: flightStatus === 'active' ? 'Airborne' : flightStatus === 'landed' ? 'Landed' : 'Monitoring',
      tagColor: '#60A5FA',
      tagBg: 'rgba(96,165,250,0.1)',
      iconColor: '#60A5FA',
      iconBg: 'rgba(96,165,250,0.12)',
      connectorColor: 'rgba(96,165,250,0.25)',
    });

    // Arrival
    const weatherNote = weather?.tempC != null
      ? ` · ${Math.round(weather.tempC)}°C ${weather.description ?? ''}`
      : '';
    result.push({
      key: 'arrival',
      kind: 'arrival',
      time: arr ? fmt(arr) : '—',
      title: 'Arrival',
      meta: trip?.to ? `Landing · ${trip.to}${weatherNote}` : 'Landing',
      tag: flightStatus === 'landed' ? 'Landed ✓' : 'Expected',
      tagColor: '#22C55E',
      tagBg: 'rgba(34,197,94,0.12)',
      iconColor: '#22C55E',
      iconBg: 'rgba(34,197,94,0.15)',
      connectorColor: 'rgba(34,197,94,0.3)',
    });

    // Customs
    if (arr) {
      result.push({
        key: 'customs',
        kind: 'customs',
        time: fmt(addMinutes(arr, 15)),
        title: 'Immigration & Customs',
        meta: 'Have your passport and documents ready',
        tag: 'Required',
        tagColor: '#F97316',
        tagBg: 'rgba(249,115,22,0.12)',
        iconColor: '#F97316',
        iconBg: 'rgba(249,115,22,0.15)',
        connectorColor: 'rgba(249,115,22,0.3)',
      });
    }

    // Baggage
    if (arr) {
      result.push({
        key: 'baggage',
        kind: 'baggage',
        time: fmt(addMinutes(arr, 35)),
        title: 'Baggage claim',
        meta: 'Collect checked bags at the carousel',
        tag: 'After landing',
        tagColor: '#14B8A6',
        tagBg: 'rgba(20,184,166,0.12)',
        iconColor: '#14B8A6',
        iconBg: 'rgba(20,184,166,0.15)',
        connectorColor: 'rgba(20,184,166,0.3)',
      });
    }

    // Last-mile
    result.push({
      key: 'lastmile',
      kind: 'lastmile',
      time: arr ? fmt(addMinutes(arr, 55)) : '—',
      title: 'Ground transport',
      meta: 'Ride hailing, taxi or shuttle coordination',
      tag: trip?.lastMileStatus === 'none' ? 'Plan now' : 'Arranged',
      tagColor: '#A855F7',
      tagBg: 'rgba(168,85,247,0.12)',
      iconColor: '#A855F7',
      iconBg: 'rgba(168,85,247,0.15)',
      connectorColor: 'rgba(168,85,247,0.3)',
    });

    return result;
  }, [trip, flight, weather, dep, arr]);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <View className="flex-1 pt-10">
      {/* Header */}
      <View className="pb-3 px-2 border-b border-[#96C7B3]/50 pt-3">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.06]"
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View className="mt-3">
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[22px]">
            Trip Timeline
          </Text>
          <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-1 text-tics-muted text-[12px]">
            {trip?.title ?? ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 112, paddingHorizontal: 8, paddingTop: 12, gap: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Date header */}
        <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[12px] uppercase tracking-widest mb-4">
          {dep
            ? dep.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : '—'}
        </Text>

        {/* Steps */}
        {steps.map((step, idx) => {
          const style = STEP_STYLE[step.kind];
          const isLast = idx === steps.length - 1;

          return (
            <View key={step.key} className="flex-row" style={{ marginBottom: isLast ? 0 : 0 }}>
              {/* Left: icon + connector */}
              <View className="items-center mr-4" style={{ width: 44 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: step.iconBg,
                    borderWidth: 1,
                    borderColor: step.iconColor + '40',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={style.icon} size={20} color={step.iconColor} />
                </View>
                {!isLast && (
                  <View
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 24,
                      backgroundColor: step.connectorColor,
                      marginTop: 4,
                      marginBottom: 4,
                      borderRadius: 1,
                    }}
                  />
                )}
              </View>

              {/* Right: card */}
              <View className="flex-1" style={{ paddingBottom: isLast ? 0 : 16 }}>
                <View 
                className='border border-[#96C7B3]/50 bg-white/[0.06]'
                style={{
                  borderRadius: 14,
                  overflow: 'hidden',
                }}>
                  {/* Left accent stripe */}
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: step.iconColor }} />
                  <View style={{ paddingLeft: 14, paddingRight: 12, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }}>
                          {step.time}
                        </Text>
                        <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 15, marginTop: 2 }}>
                          {step.title}
                        </Text>
                        <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                          {step.meta}
                        </Text>
                        {step.badge ? (
                          <View style={{ marginTop: 6, alignSelf: 'flex-start', borderRadius: 99, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: 'Syne_500Medium', color: '#F59E0B', fontSize: 10 }}>
                              ⚠ {step.badge}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, backgroundColor: step.tagBg, borderColor: step.tagColor + '50', flexShrink: 0, marginTop: 2 }}>
                        <Text style={{ fontFamily: 'Syne_500Medium', color: step.tagColor, fontSize: 10 }}>
                          {step.tag}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        {/* Last-mile CTA */}
        <Pressable
          onPress={() => trip && router.push(({ pathname: `/last-mile/${trip.id}` } as any))}
          className="mt-4 rounded-2xl bg-tics-amber px-6 py-4"
        >
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-center text-[13px] text-black">
            Open Last-Mile Coordination
          </Text>
        </Pressable>
      </ScrollView>

      <PersistentTabBar />
    </View>
  );
}
