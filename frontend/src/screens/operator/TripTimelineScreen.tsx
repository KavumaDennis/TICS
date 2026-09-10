/**
 * TripTimelineScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual timeline of a traveler's entire trip journey. Shows each movement
 * from airport arrival through hotels, attractions, restaurants, and rides.
 * Each entry links to its corresponding ride details.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useAuthStore } from '@/src/store/useAuthStore';
import { listenToTripTimeline } from '@/src/services/RideRequestService';
import type { TripHistoryDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  flight_arrival: { icon: 'airplane', color: '#3B82F6' },
  hotel_checkin: { icon: 'bed', color: '#8B5CF6' },
  ride: { icon: 'car', color: '#22C55E' },
  attraction: { icon: 'camera', color: '#F59E0B' },
  meal: { icon: 'restaurant', color: '#EF4444' },
  other: { icon: 'ellipse', color: '#64748b' },
};

export default function TripTimelineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const uid = useAuthStore((s) => s.token);

  const [entries, setEntries] = useState<(TripHistoryDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !tripId) return;
    const unsub = listenToTripTimeline(uid, tripId, (items) => {
      setEntries(items);
      setLoading(false);
    });
    return () => unsub();
  }, [uid, tripId]);

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View className='p-2 mb-4 flex-row items-center gap-3 bg-tics-amber/25 border border-tics-amber/10 rounded-full'>
        <Pressable
          onPress={() => router.back()}
          className="bg-tics-amber/35 border border-tics-amber/20 rounded-full"
          style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={20} color="rgba(248,250,252,0.9)" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Trip Timeline</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </SafeText>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 100 }}
        ListEmptyComponent={
          !loading ? (
            <View className='rounded-4xl p-8 items-center' style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <Ionicons name="time-outline" size={40} color="rgba(248,250,252,0.15)" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
                No timeline events yet
              </SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                Your trip journey will be recorded here as you travel.
              </SafeText>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
          const isLast = index === entries.length - 1;

          return (
            <Pressable
              onPress={() => {
                if (item.rideId) {
                  router.push({ pathname: '/last-mile/tracking' as any, params: { assignmentId: item.rideId, tripId } } as any);
                }
              }}
              style={{ flexDirection: 'row', paddingLeft: 8 }}
            >
              {/* Timeline line + dot */}
              <View style={{ alignItems: 'center', width: 32 }}>
                {!isLast && (
                  <View style={{ flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                )}
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: `${cfg.color}20`,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2, borderColor: cfg.color,
                  marginVertical: 4,
                }}>
                  <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                </View>
                {!isLast && (
                  <View style={{ flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                )}
              </View>

              {/* Content */}
              <View style={{
                flex: 1,
                marginLeft: 12,
                marginBottom: isLast ? 0 : 16,
                padding: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
              }}>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13 }}>
                  {item.title}
                </SafeText>
                {item.subtitle && (
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {item.subtitle}
                  </SafeText>
                )}
                {item.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="location" size={12} color="#64748b" />
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
                      {item.location}
                    </SafeText>
                  </View>
                )}
                {item.timestamp && (
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 9, marginTop: 4 }}>
                    {item.timestamp?.toDate ? 
                      new Date(item.timestamp.toDate()).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) :
                      '—'}
                  </SafeText>
                )}
                {item.rideId && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="chevron-forward" size={12} color="#60A5FA" />
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 10 }}>
                      View ride details
                    </SafeText>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />
      <PersistentTabBar />
    </View>
  );
}

export { TripTimelineScreen };
