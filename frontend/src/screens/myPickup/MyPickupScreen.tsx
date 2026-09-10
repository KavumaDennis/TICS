/**
 * MyPickupScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaced the old "My Pickup" screen with a "Request a Ride" feature.
 * Travelers can press a single "Request Ride" button to create a ride request
 * that goes directly to their selected tour operator.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { getActiveOperator } from '@/src/services/OperatorService';
import { createRideRequest, listenToTravelerRideRequests } from '@/src/services/RideRequestService';
import { getCurrentPosition } from '@/src/services/LocationService';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import type { RideRequestDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function MyPickupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const trips = useTripStore((s) => s.trips);

  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [loadingOp, setLoadingOp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recentRequests, setRecentRequests] = useState<(RideRequestDoc & { id: string })[]>([]);
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Find the most recent active trip
  const activeTrip = trips
    .filter(t => t.status !== 'completed' && t.status !== 'canceled')
    .sort((a, b) => new Date(b.departureTime || '').getTime() - new Date(a.departureTime || '').getTime())[0];

  useEffect(() => {
    if (!uid) return;

    const tId = activeTrip?.id;
    if (tId) {
      setActiveTripId(tId);

      (async () => {
        const active = await getActiveOperator(uid, tId);
        if (active) {
          setOperatorId(active.operatorId);
          setOperatorName(active.operatorName || 'your operator');
        } else {
          setOperatorId(null);
        }
        setLoadingOp(false);
      })();

      const unsub = listenToTravelerRideRequests(uid, tId, (requests) => {
        setRecentRequests(requests.filter(r => r.status === 'pending' || r.status === 'accepted' || r.status === 'assigned'));
      });

      return () => unsub();
    } else {
      setLoadingOp(false);
    }
  }, [uid, activeTrip?.id]);

  const handleUseCurrentLocation = useCallback(async () => {
    try {
      const loc = await getCurrentPosition();
      if (loc) {
        setPickupCoords({ lat: loc.latitude, lng: loc.longitude });
        setPickupLocation(`${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);
        setUseCurrentLocation(true);
      } else {
        Alert.alert('Error', 'Could not get current location. Please enter manually.');
      }
    } catch {
      Alert.alert('Error', 'Location permission required. Please enter manually.');
    }
  }, []);

  const handleRequestRide = useCallback(async () => {
    if (!uid || !operatorId || !activeTripId) {
      if (!operatorId) {
        Alert.alert(
          'No Operator Selected',
          'Please go to the Bookings screen and select a tour operator first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Select Operator', onPress: () => router.push({ pathname: '/operator/select' as any, params: { tripId: activeTripId } } as any) },
          ]
        );
      }
      return;
    }
    if (!pickupLocation.trim() || !destination.trim()) {
      Alert.alert('Required', 'Please enter pickup and destination locations.');
      return;
    }

    setSubmitting(true);
    try {
      await createRideRequest(
        uid,
        operatorId,
        activeTripId,
        pickupLocation.trim(),
        pickupCoords?.lat,
        pickupCoords?.lng,
        destination.trim(),
        undefined,
        undefined,
        notes.trim(),
        user?.name || user?.email || 'Traveler',
      );

      Alert.alert(
        'Ride Requested!',
        `Your request has been sent to ${operatorName}. They will assign a driver shortly.`,
        [{ text: 'OK' }],
      );

      // Reset form
      setPickupLocation('');
      setDestination('');
      setNotes('');
      setPickupCoords(null);
      setUseCurrentLocation(false);
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create ride request');
    } finally {
      setSubmitting(false);
    }
  }, [uid, operatorId, activeTripId, pickupLocation, destination, notes, pickupCoords, operatorName, user, router]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: 'time' };
      case 'accepted': return { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', icon: 'checkmark-circle' };
      case 'assigned': return { color: '#22C55E', bg: 'rgba(34,197,94,0.15)', icon: 'car' };
      case 'in_progress': return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', icon: 'navigate' };
      default: return { color: '#64748b', bg: 'rgba(100,116,139,0.15)', icon: 'ellipse' };
    }
  };

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 18 }}>Request a Ride</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
            {operatorName ? `Your operator: ${operatorName}` : activeTrip ? 'Select an operator first' : 'No active trip'}
          </SafeText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 112 }} showsVerticalScrollIndicator={false}>
        {!activeTrip ? (
          /* No active trip */
          <View style={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', padding: 24, alignItems: 'center', gap: 12 }}>
            <Ionicons name="car-outline" size={48} color="rgba(248,250,252,0.15)" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14 }}>
              No active trip
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              Create a trip first to request rides during your stay.
            </SafeText>
          </View>
        ) : !operatorId ? (
          /* No operator selected */
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.08)', padding: 24, alignItems: 'center', gap: 12 }}>
            <Ionicons name="alert-circle" size={40} color="#F59E0B" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 14 }}>
              No Tour Operator Selected
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              Please go to the Bookings screen to select a tour operator who will manage your rides during this trip.
            </SafeText>
            <Pressable
              onPress={() => router.push({ pathname: '/operator/select' as any, params: { tripId: activeTripId } } as any)}
              style={{ marginTop: 8, borderRadius: 20, backgroundColor: '#F59E0B', paddingVertical: 14, paddingHorizontal: 32 }}
            >
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>
                Select Operator
              </SafeText>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Trip context */}
            <View style={{ borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.10)', padding: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.20)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="airplane" size={16} color="#A78BFA" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 13 }}>
                  {activeTrip.title || activeTrip.to}
                </SafeText>
              </View>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                Assigned to: {operatorName}
              </SafeText>
            </View>

            {/* Request Ride Button (or form) */}
            {!showForm ? (
              <Pressable
                onPress={() => setShowForm(true)}
                style={{
                  borderRadius: 24, backgroundColor: '#3B82F6', padding: 24, alignItems: 'center',
                  shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
                }}
              >
                <Ionicons name="car" size={32} color="#fff" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 20, marginTop: 8 }}>
                  Request a Ride
                </SafeText>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  Tap to request a ride anywhere, anytime
                </SafeText>
              </Pressable>
            ) : (
              /* Ride Request Form */
              <View style={{ borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)', padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                <Pressable
                  onPress={() => setShowForm(false)}
                  style={{ alignSelf: 'flex-end', marginBottom: 8 }}
                >
                  <Ionicons name="close" size={20} color="#94a3b8" />
                </Pressable>

                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>
                  WHERE WOULD YOU LIKE TO GO?
                </SafeText>

                {/* Pickup */}
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8 }}>
                      PICKUP LOCATION
                    </SafeText>
                    <Pressable onPress={handleUseCurrentLocation}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: useCurrentLocation ? '#22C55E' : '#60A5FA', fontSize: 10 }}>
                        <Ionicons name="locate" size={12} color={useCurrentLocation ? '#22C55E' : '#60A5FA'} /> Use current
                      </SafeText>
                    </Pressable>
                  </View>
                  <TextInput
                    style={{
                      borderRadius: 16, padding: 16,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                      color: '#f8fafc', fontSize: 14,
                      fontFamily: 'ShareTech_400Regular',
                    }}
                    placeholder="e.g. Kampala Serena Hotel"
                    placeholderTextColor="#64748b"
                    value={pickupLocation}
                    onChangeText={setPickupLocation}
                  />
                </View>

                {/* Destination */}
                <View style={{ marginBottom: 14 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
                    DESTINATION
                  </SafeText>
                  <TextInput
                    style={{
                      borderRadius: 16, padding: 16,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                      color: '#f8fafc', fontSize: 14,
                      fontFamily: 'ShareTech_400Regular',
                    }}
                    placeholder="e.g. Uganda Museum, Kampala"
                    placeholderTextColor="#64748b"
                    value={destination}
                    onChangeText={setDestination}
                  />
                </View>

                {/* Notes */}
                <View style={{ marginBottom: 14 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
                    NOTES (OPTIONAL)
                  </SafeText>
                  <TextInput
                    style={{
                      borderRadius: 16, padding: 16,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                      color: '#f8fafc', fontSize: 14,
                      fontFamily: 'ShareTech_400Regular',
                      minHeight: 80, textAlignVertical: 'top',
                    }}
                    placeholder="e.g. I have 2 bags, please wait at reception"
                    placeholderTextColor="#64748b"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                </View>

                {/* Submit */}
                <Pressable
                  onPress={handleRequestRide}
                  disabled={submitting || !pickupLocation.trim() || !destination.trim()}
                  style={{
                    borderRadius: 20,
                    backgroundColor: (submitting || !pickupLocation.trim() || !destination.trim()) ? 'rgba(59,130,246,0.2)' : '#3B82F6',
                    padding: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator size={18} color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="navigate" size={18} color="#fff" />
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15 }}>
                        Send Request
                      </SafeText>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {/* Recent / Pending Requests */}
            {recentRequests.length > 0 && (
              <View style={{ borderRadius: 18, backgroundColor: 'rgba(245,158,11,0.08)', padding: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' }}>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 11, letterSpacing: 0.8, marginBottom: 12 }}>
                  YOUR RIDE REQUESTS
                </SafeText>
                {recentRequests.map((req, i) => {
                  const badge = getStatusBadge(req.status);
                  return (
                    <Pressable
                      key={req.id || i}
                      onPress={() => {
                        if (req.status === 'assigned' || req.status === 'in_progress') {
                        // Navigate to tracking if ride is active
                        router.push({
                          pathname: '/last-mile/tracking' as any,
                            params: { assignmentId: req.id, tripId: activeTripId },
                          } as any);
                        }
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 12,
                        borderBottomWidth: i < recentRequests.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: badge.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={badge.icon as any} size={16} color={badge.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#e2e8f0', fontSize: 12 }} numberOfLines={1}>
                          {req.pickupLocation} → {req.destination}
                        </SafeText>
                        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: badge.color, fontSize: 10, marginTop: 2, textTransform: 'capitalize' }}>
                          {req.status.replace('_', ' ')}
                        </SafeText>
                      </View>
                      {(req.status === 'assigned' || req.status === 'in_progress') && (
                        <Ionicons name="chevron-forward" size={16} color="#64748b" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}
