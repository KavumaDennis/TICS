/**
 * RideTrackingScreen.tsx
 * Full-screen live tracking map with driver info, route, distance, ETA.
 * Uses react-native-maps, expo-location, and Google Directions API.
 * 
 * Workflow:
 * 1. Driver assigned — shows "Driver Has Arrived" button
 * 2. Tap → marks driver_arrived, navigates to destination-select
 * 3. After destination set → ride_started → live tracking begins
 * 4. Within 30m of destination → near_destination shows "Arrived" button
 * 5. Tap "Arrived" → marks completed → navigates to ride-complete
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '@/src/services/LocationService';
import { fetchDirections, haversineDistance, formatDistance, formatDuration } from '@/src/services/DirectionsService';
import { listenToAssignment, markDriverArrived, markNearDestination, completeRide, updateTravelerLocation } from '@/src/services/RideStatusService';
import type { TravelerLocation } from '@/src/services/LocationService';
import type { DirectionResult } from '@/src/services/DirectionsService';
import { useAuthStore } from '@/src/store/useAuthStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ARRIVAL_THRESHOLD_METERS = 30;

export default function RideTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assignmentId, tripId } = useLocalSearchParams<{ assignmentId: string; tripId?: string }>();
  const uid = useAuthStore((s) => s.token);

  const [assignment, setAssignment] = useState<any>(null);
  const [currentLoc, setCurrentLoc] = useState<TravelerLocation | null>(null);
  const [route, setRoute] = useState<DirectionResult | null>(null);
  const [rideStep, setRideStep] = useState<'idle' | 'driver_arrived' | 'tracking' | 'near_destination' | 'completed'>('idle');
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rideStartTime, setRideStartTime] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [initialRegion, setInitialRegion] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<boolean>(false);
  const destLatRef = useRef<number | null>(null);
  const destLngRef = useRef<number | null>(null);

  // Listen to assignment changes from Firestore
  useEffect(() => {
    if (!assignmentId || !uid) return;
    const unsub = listenToAssignment(uid, tripId || assignmentId, (snap) => {
      if (snap) {
        setAssignment(snap.data);
        setLoading(false);

        // Sync ride step from Firestore assignment status
        const data = snap.data;
        if (data.status === 'completed') {
          setRideStep('completed');
          stopWatchingLocation();
        } else if (data.status === 'near_destination') {
          setRideStep('near_destination');
        } else if (data.status === 'ride_started' && data.destinationLat) {
          setRideStep('tracking');
          setRideStartTime(Date.now());
          destLatRef.current = data.destinationLat ?? null;
          destLngRef.current = data.destinationLng ?? null;
        } else if (data.status === 'driver_arrived') {
          setRideStep('driver_arrived');
        } else if (data.status === 'assigned') {
          setRideStep('idle');
        }
      } else {
        setLoading(false);
      }
    });
    return () => { 
      unsub(); 
      stopWatchingLocation(); 
      locationSubRef.current = false;
    };
  }, [assignmentId, uid, tripId]);

  // Request location permission and start tracking when ride starts
  useEffect(() => {
    if (rideStep !== 'tracking' && rideStep !== 'near_destination') {
      if (locationSubRef.current) {
        stopWatchingLocation();
        locationSubRef.current = false;
      }
      return;
    }
    if (locationSubRef.current) return;

    (async () => {
      const ok = await requestLocationPermission();
      if (!ok) return;

      startWatchingLocation((loc) => {
        setCurrentLoc(loc);

        // Update Firestore with current location periodically
        if (assignmentId) {
          updateTravelerLocation(assignmentId, { 
            latitude: loc.latitude, 
            longitude: loc.longitude 
          }).catch(() => {});
        }

        const dLat = destLatRef.current;
        const dLng = destLngRef.current;

        // Fetch route on first location if we have destination
        if (dLat && dLng && !route && mapRef.current) {
          fetchDirections(
            loc.latitude, loc.longitude,
            dLat, dLng
          ).then((r) => {
            if (r) {
              setRoute(r);
              setDistance(r.distanceMeters);
              setDuration(r.durationSeconds);
            }
          });
        }

        // Update distance remaining
        if (dLat && dLng) {
          const d = haversineDistance(loc.latitude, loc.longitude, dLat, dLng);
          setDistance(d);

          // Re-fetch route periodically to update ETA
          if (route && prevLocRef.current) {
            const moved = haversineDistance(
              loc.latitude, loc.longitude,
              prevLocRef.current.latitude, prevLocRef.current.longitude
            );
            if (moved > 100 && dLat && dLng) {
              fetchDirections(loc.latitude, loc.longitude, dLat, dLng).then((r) => {
                if (r) {
                  setRoute(r);
                  setDuration(r.durationSeconds);
                }
              });
            }
          }

          prevLocRef.current = loc;

          // Auto-detect arrival within threshold
          if (d <= ARRIVAL_THRESHOLD_METERS && rideStep === 'tracking' && assignmentId) {
            markNearDestination(assignmentId).catch(() => {});
            setRideStep('near_destination');
          }
        }
      }, { timeInterval: 4000, distanceInterval: 10 });
      locationSubRef.current = true;
    })();

    return () => { 
      stopWatchingLocation(); 
      locationSubRef.current = false; 
    };
  }, [rideStep]);

  // Store previous location for distance comparison
  const prevLocRef = useRef<TravelerLocation | null>(null);

  // Elapsed timer during tracking
  useEffect(() => {
    if (rideStep !== 'tracking' || !rideStartTime) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - rideStartTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [rideStep, rideStartTime]);

  // Set initial map region from destination
  useEffect(() => {
    if (assignment?.destinationLat && !initialRegion) {
      setInitialRegion({
        latitude: assignment.destinationLat,
        longitude: assignment.destinationLng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  }, [assignment?.destinationLat, assignment?.destinationLng]);

  // ── Handler: Driver Has Arrived ─────────────────────────────────
  const handleDriverArrived = async () => {
    if (!assignmentId) return;
    try {
      await markDriverArrived(assignmentId);
      setRideStep('driver_arrived');
      router.push({ 
        pathname: '/last-mile/destination-select' as any, 
        params: { assignmentId } 
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update status');
    }
  };

  // ── Handler: User taps Arrived (near destination) ────────────────
  const handleArrived = async () => {
    if (!assignmentId || !currentLoc) return;
    try {
      const rideDuration = rideStartTime ? Math.floor((Date.now() - rideStartTime) / 1000) : 0;
      await completeRide(
        assignmentId, 
        { latitude: currentLoc.latitude, longitude: currentLoc.longitude }, 
        rideDuration, 
        distance
      );
      setRideStep('completed');
      stopWatchingLocation();
      locationSubRef.current = false;
      const tId = tripId || assignment?.tripId || '';
      router.replace({ 
        pathname: '/last-mile/ride-complete' as any, 
        params: { tripId: tId } 
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to complete ride');
    }
  };

  const handleBack = () => router.back();

  // ── Loading state ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b1e', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 14 }}>Loading ride data...</Text>
      </View>
    );
  }

  // ── Completed state ────────────────────────────────────────────────
  if (rideStep === 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b1e', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
        </View>
        <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 22 }}>Ride Complete!</Text>
        <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          Redirecting to summary...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
      {/* Map */}
      {initialRegion && (
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
          initialRegion={initialRegion}
          showsUserLocation={rideStep === 'tracking' || rideStep === 'near_destination'}
          followsUserLocation={rideStep === 'tracking'}
          showsCompass
          rotateEnabled
        >
          {assignment?.destinationLat && (
            <Marker 
              coordinate={{ 
                latitude: assignment.destinationLat, 
                longitude: assignment.destinationLng 
              }} 
              title="Destination" 
              description={assignment.destination || ''} 
              pinColor="#8B5CF6" 
            />
          )}
          {route?.polylinePoints && route.polylinePoints.length > 1 && (
            <Polyline 
              coordinates={route.polylinePoints} 
              strokeColor="#8B5CF6" 
              strokeWidth={4} 
              lineDashPattern={[1]} 
            />
          )}
        </MapView>
      )}

      {/* Top bar: back button + driver info */}
      <View style={{ 
        position: 'absolute', 
        top: insets.top + 8, 
        left: 16, 
        right: 16, 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        zIndex: 10 
      }}>
        <Pressable 
          onPress={handleBack} 
          style={{ 
            width: 42, 
            height: 42, 
            borderRadius: 21, 
            backgroundColor: 'rgba(10,11,30,0.85)', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        {assignment?.driverName && (
          <View style={{ 
            borderRadius: 20, 
            backgroundColor: 'rgba(10,11,30,0.85)', 
            paddingHorizontal: 14, 
            paddingVertical: 8, 
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: 8 
          }}>
            <Ionicons name="person-circle" size={20} color="#22C55E" />
            <Text style={{ fontFamily: 'Syne_600SemiBold', color: '#f8fafc', fontSize: 12 }}>
              {assignment.driverName}
            </Text>
          </View>
        )}
      </View>

      {/* Tracking overlay: distance, ETA, elapsed */}
      {(rideStep === 'tracking' || rideStep === 'near_destination') && (
        <LinearGradient 
          colors={['rgba(10,11,30,0.95)', 'rgba(10,11,30,0.98)']} 
          style={{ 
            position: 'absolute', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            paddingTop: 16, 
            paddingBottom: insets.bottom + 20, 
            paddingHorizontal: 20, 
            borderTopLeftRadius: 24, 
            borderTopRightRadius: 24 
          }}
        >
          {/* Stats row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }}>DISTANCE</Text>
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 20, marginTop: 4 }}>
                {formatDistance(distance)}
              </Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }}>ETA</Text>
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 20, marginTop: 4 }}>
                {duration > 0 ? formatDuration(duration) : '...'}
              </Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: 'Syne_500Medium', color: '#64748b', fontSize: 11 }}>ELAPSED</Text>
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#60A5FA', fontSize: 20, marginTop: 4 }}>
                {formatDuration(elapsed)}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ 
            height: 4, 
            borderRadius: 2, 
            backgroundColor: 'rgba(255,255,255,0.1)', 
            marginBottom: 16, 
            overflow: 'hidden' 
          }}>
            <View style={{ 
              height: '100%', 
              borderRadius: 2, 
              backgroundColor: '#8B5CF6', 
              width: route?.distanceMeters 
                ? `${Math.max(3, Math.min(97, (1 - distance / route.distanceMeters) * 100))}%` 
                : '3%' 
            }} />
          </View>

          {/* Near destination: large Arrived button */}
          {rideStep === 'near_destination' && (
            <Pressable 
              onPress={handleArrived} 
              style={{ 
                borderRadius: 24, 
                backgroundColor: '#22C55E', 
                padding: 18, 
                alignItems: 'center',
                shadowColor: '#22C55E',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 8
              }}
            >
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 18 }}>Arrived</Text>
              <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>
                Tap to complete your ride
              </Text>
            </Pressable>
          )}

          {/* Tracking info */}
          {rideStep === 'tracking' && (
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
              {assignment?.destination ? `Heading to ${assignment.destination}` : 'Tracking your ride...'}
            </Text>
          )}
        </LinearGradient>
      )}

      {/* Driver Has Arrived button — shown when assignment status is 'assigned' */}
      {rideStep === 'idle' && (
        <View style={{ 
          position: 'absolute', 
          bottom: insets.bottom + 40, 
          left: 20, 
          right: 20, 
          zIndex: 10 
        }}>
          <Pressable 
            onPress={handleDriverArrived} 
            style={{ 
              borderRadius: 24, 
              backgroundColor: '#3B82F6', 
              padding: 20, 
              alignItems: 'center',
              shadowColor: '#3B82F6',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 8
            }}
          >
            <Ionicons name="car" size={24} color="#fff" />
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 18, marginTop: 6 }}>
              Driver Has Arrived
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
              Tap when the driver picks you up
            </Text>
          </Pressable>
        </View>
      )}

      {/* Driver arrived state already navigated away — show fallback */}
      {rideStep === 'driver_arrived' && (
        <View style={{ 
          position: 'absolute', 
          bottom: insets.bottom + 40, 
          left: 20, 
          right: 20, 
          zIndex: 10,
          alignItems: 'center'
        }}>
          <View style={{ 
            borderRadius: 24, 
            backgroundColor: 'rgba(245,158,11,0.2)', 
            borderWidth: 1,
            borderColor: 'rgba(245,158,11,0.3)',
            padding: 20, 
            alignItems: 'center',
            width: '100%'
          }}>
            <Ionicons name="time" size={24} color="#F59E0B" />
            <Text style={{ fontFamily: 'Syne_700Bold', color: '#f8fafc', fontSize: 16, marginTop: 6 }}>
              Select Your Destination
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium', color: '#94a3b8', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Choose where you'd like the driver to take you
            </Text>
            <Pressable
              onPress={() => router.push({ 
                pathname: '/last-mile/destination-select' as any, 
                params: { assignmentId } 
              } as any)}
              style={{ 
                marginTop: 14,
                borderRadius: 20, 
                backgroundColor: '#F59E0B', 
                paddingVertical: 12,
                paddingHorizontal: 32,
                alignItems: 'center'
              }}
            >
              <Text style={{ fontFamily: 'Syne_700Bold', color: '#fff', fontSize: 14 }}>
                Select Destination
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}