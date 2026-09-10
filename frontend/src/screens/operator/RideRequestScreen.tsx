/**
 * RideRequestScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Country-wide ride request screen. Traveler can request a ride at any time
 * during their trip, specifying pickup location, destination, and optional notes.
 * Only their selected operator receives the request.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useAuthStore } from '@/src/store/useAuthStore';
import { getActiveOperator } from '@/src/services/OperatorService';
import { createRideRequest, listenToTravelerRideRequests } from '@/src/services/RideRequestService';
import { getCurrentPosition } from '@/src/services/LocationService';
import type { RideRequestDoc } from '@/src/firebase/lastMileTypes';
import { SafeText } from '@/src/components/responsive/SafeText';

export default function RideRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const uid = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState('');
  const [loadingOp, setLoadingOp] = useState(true);
  const [recentRequests, setRecentRequests] = useState<(RideRequestDoc & { id: string })[]>([]);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);

  useEffect(() => {
    if (!uid || !tripId) return;
    (async () => {
      const active = await getActiveOperator(uid, tripId);
      if (active) {
        setOperatorId(active.operatorId);
        setOperatorName(active.operatorName || 'your operator');
      } else {
        setOperatorId(null);
      }
      setLoadingOp(false);
    })();

    const unsub = listenToTravelerRideRequests(uid, tripId, (requests) => {
      setRecentRequests(requests.filter(r => r.status === 'pending' || r.status === 'accepted'));
    });
    return () => unsub();
  }, [uid, tripId]);

  const handleUseCurrentLocation = async () => {
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
  };

  const handleSubmit = async () => {
    if (!uid || !operatorId || !tripId) {
      Alert.alert('No Operator', 'Please select a tour operator first in the Bookings screen.');
      return;
    }
    if (!pickupLocation.trim() || !destination.trim()) {
      Alert.alert('Required', 'Please enter pickup and destination locations.');
      return;
    }

    setSubmitting(true);
    try {
      const id = await createRideRequest(
        uid,
        operatorId,
        tripId,
        pickupLocation.trim(),
        pickupCoords?.lat,
        pickupCoords?.lng,
        destination.trim(),
        destCoords?.lat,
        destCoords?.lng,
        notes.trim(),
        user?.name || user?.email || 'Traveler',
      );
      Alert.alert(
        'Ride Requested',
        `Your request has been sent to ${operatorName}. They will assign a driver shortly.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create ride request');
    } finally {
      setSubmitting(false);
    }
  };

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
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 17 }}>Request a Ride</SafeText>
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>
            {operatorName ? `Sent to ${operatorName}` : 'Select an operator first'}
          </SafeText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: 14, paddingHorizontal: 8, paddingBottom: 120 }}>
        {loadingOp ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <ActivityIndicator size="small" color="#60A5FA" />
          </View>
        ) : !operatorId ? (
          <View className='rounded-4xl p-8 items-center' style={{ borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.08)' }}>
            <Ionicons name="alert-circle" size={36} color="#F59E0B" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 14, marginTop: 12 }}>
              No Tour Operator Selected
            </SafeText>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
              Please go to the Bookings screen to select a tour operator first.
            </SafeText>
            <Pressable
              onPress={() => router.push({ pathname: '/operator/select' as any, params: { tripId } } as any)}
              className='mt-4 bg-tics-amber/35 border border-tics-amber/20 rounded-full p-4'
            >
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 13 }}>
                Select Operator
              </SafeText>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Current Location */}
            <View className='rounded-4xl bg-tics-amber/25 border border-tics-amber/10' style={{ padding: 20 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 }}>
                RIDE DETAILS
              </SafeText>

              {/* Pickup */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <SafeText className='ml-2' style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8 }}>
                    PICKUP LOCATION
                  </SafeText>
                  <Pressable onPress={handleUseCurrentLocation}>
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: useCurrentLocation ? '#22C55E' : '#60A5FA', fontSize: 10 }}>
                      <Ionicons name="locate" size={12} color={useCurrentLocation ? '#22C55E' : '#60A5FA'} /> Use current
                    </SafeText>
                  </Pressable>
                </View>
                <TextInput
                  className='rounded-full p-5'
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.25)',
                    color: '#f8fafc',
                    fontSize: 14,
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
                <SafeText className='ml-2' style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
                  DESTINATION
                </SafeText>
                <TextInput
                  className='rounded-full p-5'
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.25)',
                    color: '#f8fafc',
                    fontSize: 14,
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
                <SafeText className='ml-2' style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 10, letterSpacing: 0.8, marginBottom: 6 }}>
                  NOTES (OPTIONAL)
                </SafeText>
                <TextInput
                  className='rounded-3xl p-4'
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.25)',
                    color: '#f8fafc',
                    fontSize: 14,
                    fontFamily: 'ShareTech_400Regular',
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                  placeholder="e.g. I have 2 bags, please wait at reception"
                  placeholderTextColor="#64748b"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !pickupLocation.trim() || !destination.trim()}
                className='rounded-full p-6'
                style={{
                  backgroundColor: (submitting || !pickupLocation.trim() || !destination.trim()) ? 'rgba(59,130,246,0.2)' : '#3B82F6',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {submitting ? (
                  <ActivityIndicator size={18} color="#fff" />
                ) : (
                  <>
                    <Ionicons name="navigate" size={18} color="#fff" />
                    <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 15 }}>
                      Request Ride
                    </SafeText>
                  </>
                )}
              </Pressable>
            </View>

            {/* Recent/Pending Requests */}
            {recentRequests.length > 0 && (
              <View className='rounded-4xl bg-tics-amber/25 border border-tics-amber/10' style={{ padding: 20 }}>
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 11, letterSpacing: 0.8, marginBottom: 12 }}>
                  PENDING REQUESTS
                </SafeText>
                {recentRequests.map((req, i) => (
                  <View key={req.id || i} style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: i < recentRequests.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                  }}>
                    <Ionicons name="time" size={16} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#e2e8f0', fontSize: 12 }}>
                        {req.pickupLocation} → {req.destination}
                      </SafeText>
                      <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 10, textTransform: 'capitalize', marginTop: 2 }}>
                        Status: {req.status}
                      </SafeText>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <PersistentTabBar />
    </View>
  );
}

export { RideRequestScreen };
