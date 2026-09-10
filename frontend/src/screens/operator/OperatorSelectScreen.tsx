/**
 * OperatorSelectScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tour operator selection screen. Replaces the Hotels tab in Bookings.
 * Travelers browse and select a tour operator who will manage their rides.
 * Displays operators from the Firestore users collection where role == "operator".
 *
 * ACCORDION STYLE: Only basic info shown initially. Full details expand when
 * an operator is selected/tapped.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useAuthStore } from '@/src/store/useAuthStore';
import { fetchOperators, selectOperator, getActiveOperator } from '@/src/services/OperatorService';
import { notifyOperatorAccepted } from '@/src/services/NotificationService';
import type { OperatorDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

const STAR_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#22C55E'];

function StarRating({ rating }: { rating?: number }) {
  const r = rating ?? 0;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(r) ? 'star' : 'star-outline'}
          size={12}
          color={i <= Math.round(r) ? STAR_COLORS[Math.min(i - 1, 4)] : '#64748b'}
        />
      ))}
    </View>
  );
}

export default function OperatorSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [operators, setOperators] = useState<(OperatorDoc & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState<(OperatorDoc & { id: string }) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [currentOperator, setCurrentOperator] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !tripId) return;
    (async () => {
      try {
        const [ops, active] = await Promise.all([
          fetchOperators(),
          getActiveOperator(uid, tripId),
        ]);
        setOperators(ops);
        if (active) {
          setCurrentOperator(active.operatorName || active.operatorId);
        }
      } catch (e: any) {
        console.error('Failed to load operators:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, tripId]);

  const handleSelect = async () => {
    if (!selectedOp || !uid || !tripId) return;
    setConfirming(true);
    try {
      await selectOperator(
        uid,
        selectedOp.id,
        selectedOp.name,
        selectedOp.phone,
        selectedOp.logoUrl,
        tripId,
        user?.name || user?.email || undefined,
      );
      await notifyOperatorAccepted(uid, selectedOp.name, tripId);
      Alert.alert(
        'Operator Selected',
        `${selectedOp.name} will now manage your rides during this trip.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to select operator');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View className="flex-1 p-1" >
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
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Select Tour Operator</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
            Choose who manages your rides
          </SafeText>
        </View>
      </View>

      {currentOperator && (
        <View className='mx-2 mb-4 p-4 rounded-4xl bg-tics-green/15 border border-tics-green/20'>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 13 }}>
              Currently assigned to {currentOperator}
            </SafeText>
          </View>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
            You can switch to a different operator below.
          </SafeText>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#60A5FA" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginTop: 12 }}>
            Loading operators...
          </SafeText>
        </View>
      ) : (
        <FlatList
          data={operators}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingBottom: 100 }}
          ListEmptyComponent={
            <View className='rounded-4xl p-8 items-center' style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <Ionicons name="business-outline" size={40} color="rgba(248,250,252,0.15)" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
                No operators available
              </SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                Please check back later when operators register on the platform.
              </SafeText>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selectedOp?.id === item.id;
            const displayName = item.lodgeName || item.name;
            const displayRating = item.averageRating || item.rating;
            const displayTotalRatings = item.totalRatings;

            return (
              <Pressable
                onPress={() => setSelectedOp(isSelected ? null : item)}
                style={{
                  borderWidth: 1,
                  borderColor: isSelected ? 'rgba(59,130,246,0.4)' : 'rgba(150, 199, 179, 0.35)',
                  backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.04)',
                  padding: 16,
                }}
                className="rounded-4xl"
              >
                {/* ── Always visible: basic info ──────────────────────── */}
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {/* Logo */}
                  <View style={{
                    width: 46, height: 46, borderRadius: 16,
                    backgroundColor: 'rgba(59,130,246,0.15)',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {item.logoUrl || item.profileImage ? (
                      <View style={{ width: 60, height: 60, overflow: 'hidden' }}>
                        <Image source={{ uri: item.logoUrl || item.profileImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      </View>
                    ) : (
                      <Ionicons name="business" size={28} color="#60A5FA" />
                    )}
                  </View>

                  {/* Basic info */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 15 }}>
                      {displayName}
                    </SafeText>
                    {item.name !== displayName && (
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
                        {item.name}
                      </SafeText>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <StarRating rating={displayRating} />
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
                        {displayRating?.toFixed(1) || 'N/A'}
                        {displayTotalRatings != null && displayTotalRatings > 0 ? ` (${displayTotalRatings})` : ''}
                      </SafeText>
                    </View>
                    {/* Country & drivers - always visible */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      {item.country && (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10 }}>
                          <Ionicons name="location" size={10} color="#64748b" /> {item.country}
                        </SafeText>
                      )}
                      {item.availableDrivers != null && (
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 10 }}>
                          <Ionicons name="people" size={10} color="#22C55E" /> {item.availableDrivers} drivers
                        </SafeText>
                      )}
                    </View>
                  </View>

                  {/* Expand/collapse indicator */}
                  <View style={{ justifyContent: 'center' }}>
                    <Ionicons
                      name={isSelected ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={isSelected ? '#60A5FA' : '#64748b'}
                    />
                  </View>
                </View>

                {/* ── Accordion: expanded details when selected ────────── */}
                {isSelected && (
                  <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                    {/* Description */}
                    {item.description && (
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
                        {item.description}
                      </SafeText>
                    )}

                    {/* Languages */}
                    {item.languages && item.languages.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {item.languages.map((lang, i) => (
                          <View key={i} style={{ borderRadius: 99, backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 10, paddingVertical: 3 }}>
                            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10 }}>{lang}</SafeText>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Phone */}
                    {item.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="call" size={14} color="#60A5FA" />
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#e2e8f0', fontSize: 12 }}>{item.phone}</SafeText>
                      </View>
                    )}

                    {/* Website */}
                    {item.website && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="globe" size={14} color="#60A5FA" />
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 12 }}>{item.website}</SafeText>
                      </View>
                    )}

                    {/* Select button */}
                    <Pressable
                      onPress={handleSelect}
                      disabled={confirming}
                      className="rounded-full mt-3"
                      style={{
                        backgroundColor: '#3B82F6',
                        paddingVertical: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 8,
                      }}
                    >
                      {confirming ? (
                        <ActivityIndicator size={16} color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>
                            Select {displayName}
                          </SafeText>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <PersistentTabBar />
    </View>
  );
}

export { OperatorSelectScreen };
