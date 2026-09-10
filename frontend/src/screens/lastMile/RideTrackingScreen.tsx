/**
 * RideTrackingScreen.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Enhanced ride tracking with full driver info, vehicle details, operator info,
 * call/WhatsApp actions, distance, ETA, speed, progress bar, Google Map,
 * change destination, cancel ride, and emergency button.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '@/src/services/LocationService';
import { fetchDirections, haversineDistance, formatDistance, formatDuration } from '@/src/services/DirectionsService';
import {
  listenToAssignment,
  markDriverArrived,
  markNearDestination,
  completeRide,
  updateTravelerLocation,
  saveDestinationAndStartRide,
  type AssignmentDoc,
} from '@/src/services/RideStatusService';
import { updateTravelerGPS } from '@/src/services/RideRequestService';
import type { TravelerLocation } from '@/src/services/LocationService';
import type { DirectionResult } from '@/src/services/DirectionsService';
import { useAuthStore } from '@/src/store/useAuthStore';
import { SafeText } from '@/src/components/responsive/SafeText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ARRIVAL_THRESHOLD_METERS = 30;
const LOCATION_UPDATE_INTERVAL = 4000;
const ROUTE_REFRESH_DISTANCE = 100;

/** Status colors matching the design system */
const STATUS_COLORS = {
  assigned: '#3B82F6',
  driver_arrived: '#22C55E',
  ride_started: '#8B5CF6',
  near_destination: '#F59E0B',
  completed: '#22C55E',
  cancelled: '#EF4444',
} as const;

export default function RideTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { assignmentId, tripId, destName, destLat, destLng, driverArrived } = useLocalSearchParams<{ 
    assignmentId: string; 
    tripId?: string;
    destName?: string;
    destLat?: string;
    destLng?: string;
    driverArrived?: string;
  }>();
  const uid = useAuthStore((s) => s.token);

  const driverAlreadyArrived = driverArrived === 'true';
  const hasDestParams = !!destLat && !!destLng;
  const destCoord = hasDestParams ? {
    latitude: parseFloat(destLat!),
    longitude: parseFloat(destLng!),
  } : null;

  const [assignment, setAssignment] = useState<AssignmentDoc | null>(
    hasDestParams ? { destination: destName || '', destinationLat: destCoord!.latitude, destinationLng: destCoord!.longitude } as any : null
  );
  const [currentLoc, setCurrentLoc] = useState<TravelerLocation | null>(null);
  const [route, setRoute] = useState<DirectionResult | null>(null);
  const [rideStep, setRideStep] = useState<'idle' | 'driver_arrived' | 'tracking' | 'near_destination' | 'completed'>(
    hasDestParams || driverAlreadyArrived ? 'tracking' : 'idle'
  );
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rideStartTime, setRideStartTime] = useState<number>(0);
  const [loading, setLoading] = useState(!hasDestParams);
  const [initialRegion, setInitialRegion] = useState<any>(
    destCoord
      ? { ...destCoord, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      : { latitude: 0.3136, longitude: 32.5811, latitudeDelta: 0.5, longitudeDelta: 0.5 }
  );
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showInfoOverlay, setShowInfoOverlay] = useState(true);

  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<boolean>(false);
  const destLatRef = useRef<number | null>(null);
  const destLngRef = useRef<number | null>(null);
  const prevLocRef = useRef<TravelerLocation | null>(null);
  const cachedGpsRef = useRef<TravelerLocation | null>(null);
  const retryCountRef = useRef(0);

  const progressAnim = useSharedValue(0);
  const fadeAnim = useSharedValue(1);

  const animatedProgress = useAnimatedStyle(() => ({
    width: `${withSpring(progressAnim.value * 100)}%` as any,
  }));

  // Listen to assignment changes
  useEffect(() => {
    if (!assignmentId || !uid) return;
    const unsub = listenToAssignment(uid, tripId || assignmentId, (snap) => {
      if (snap) {
        setAssignment(snap.data);
        setLoading(false);

        const data = snap.data;
        console.log('Assignment status changed:', data.status, 'destination:', data.destinationLat, data.destinationLng);
        
        if (data.status === 'completed') {
          setRideStep('completed');
          stopWatchingLocation();
        } else if (data.status === 'near_destination') {
          setRideStep('near_destination');
        } else if (data.status === 'ride_started') {
          setRideStep('tracking');
          setRideStartTime(Date.now());
          if (data.destinationLat) {
            destLatRef.current = data.destinationLat;
            destLngRef.current = data.destinationLng ?? null;
          }
        } else if (data.status === 'driver_arrived') {
          setRideStep('driver_arrived');
        } else if (data.status === 'assigned') {
          if (data.destinationLat != null) {
            destLatRef.current = data.destinationLat;
            destLngRef.current = data.destinationLng ?? null;
            setInitialRegion({
              latitude: data.destinationLat,
              longitude: data.destinationLng ?? 0,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            });
          }
          setRideStep('tracking');
          setRideStartTime(Date.now());
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, uid, tripId]);

  // Start GPS tracking
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
        setSpeed(loc.speed ?? 0);
        cachedGpsRef.current = loc;

        if (assignmentId && uid) {
          updateTravelerGPS(uid, loc.latitude, loc.longitude, loc.heading ?? undefined, loc.speed ?? undefined, loc.accuracy ?? undefined).catch(() => {
            setIsOffline(true);
            retryCountRef.current++;
            if (retryCountRef.current > 3) {
              cachedGpsRef.current = loc;
            }
          });
        }

        if (assignmentId) {
          updateTravelerLocation(assignmentId, {
            latitude: loc.latitude,
            longitude: loc.longitude,
          }).catch(() => setIsOffline(true));
        }

        const dLat = destLatRef.current || assignment?.destinationLat || null;
        const dLng = destLngRef.current || assignment?.destinationLng || null;

        if (dLat != null && dLng != null && !route) {
          fetchDirections(loc.latitude, loc.longitude, dLat, dLng).then((r) => {
            if (r) {
              setRoute(r);
              setDistance(r.distanceMeters);
              setDuration(r.durationSeconds);
            } else {
              const directDist = haversineDistance(loc.latitude, loc.longitude, dLat, dLng);
              setDistance(directDist);
              const estimatedDuration = (directDist / 1000) / 30 * 3600;
              setDuration(estimatedDuration);
            }
          });
        }

        if (dLat != null && dLng != null) {
          const d = haversineDistance(loc.latitude, loc.longitude, dLat, dLng);
          setDistance(d);

          if (route?.distanceMeters) {
            const pct = Math.max(0, Math.min(1, 1 - d / route.distanceMeters));
            setProgress(pct);
            progressAnim.value = pct;
          } else if (distance > 0) {
            const initialDist = distance;
            const pct = Math.max(0, Math.min(1, 1 - d / initialDist));
            setProgress(pct);
            progressAnim.value = pct;
          }

          if (route && prevLocRef.current) {
            const moved = haversineDistance(
              loc.latitude, loc.longitude,
              prevLocRef.current.latitude, prevLocRef.current.longitude
            );
            if (moved > ROUTE_REFRESH_DISTANCE && dLat && dLng) {
              fetchDirections(loc.latitude, loc.longitude, dLat, dLng).then((r) => {
                if (r) {
                  setRoute(r);
                  setDuration(r.durationSeconds);
                }
              });
            }
          }

          prevLocRef.current = loc;

          if (d <= ARRIVAL_THRESHOLD_METERS && rideStep === 'tracking' && assignmentId) {
            markNearDestination(assignmentId).catch(() => { });
            setRideStep('near_destination');
          }
        }
      }, { timeInterval: LOCATION_UPDATE_INTERVAL, distanceInterval: 10 });
      locationSubRef.current = true;
    })();

    return () => {
      stopWatchingLocation();
      locationSubRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideStep, assignmentId, uid]);

  // Elapsed timer
  useEffect(() => {
    if (rideStep !== 'tracking' || !rideStartTime) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - rideStartTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [rideStep, rideStartTime]);

  // Handlers
  const handleDriverArrived = useCallback(async () => {
    if (!assignmentId) return;
    try {
      await markDriverArrived(assignmentId);
      setRideStep('tracking');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update status');
    }
  }, [assignmentId]);

  const handleArrived = useCallback(async () => {
    if (!assignmentId || !currentLoc) return;
    try {
      const rideDuration = rideStartTime ? Math.floor((Date.now() - rideStartTime) / 1000) : 0;
      await completeRide(
        assignmentId,
        { latitude: currentLoc.latitude, longitude: currentLoc.longitude },
        rideDuration,
        distance,
      );
      setRideStep('completed');
      stopWatchingLocation();
      locationSubRef.current = false;
      const tId = tripId || assignment?.tripId || '';
      router.replace({
        pathname: '/last-mile/ride-complete' as any,
        params: { tripId: tId },
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to complete ride');
    }
  }, [assignmentId, assignment?.tripId, currentLoc, distance, rideStartTime, router, tripId]);

  const handleCallDriver = useCallback(() => {
    const phone = assignment?.driverPhone;
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    }
  }, [assignment?.driverPhone]);

  const handleWhatsApp = useCallback(() => {
    const phone = assignment?.driverPhone;
    if (phone) {
      Linking.openURL(`https://wa.me/${phone.replace(/[^\d]/g, '')}`);
    }
  }, [assignment?.driverPhone]);

  const handleChangeDestination = useCallback(() => {
    router.push({
      pathname: '/last-mile/destination-select' as any,
      params: { assignmentId },
    } as any);
  }, [assignmentId, router]);

  const handleCancelRide = useCallback(() => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              if (assignmentId) {
                await completeRide(assignmentId, { latitude: 0, longitude: 0 }, 0, 0);
              }
              router.back();
            } catch { }
          },
        },
      ],
    );
  }, [assignmentId, router]);

  const handleEmergency = useCallback(() => {
    Alert.alert(
      'Emergency',
      'Contact emergency services?\n\nThis will call the local emergency number.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Emergency',
          style: 'destructive',
          onPress: () => Linking.openURL('tel:112'),
        },
      ],
    );
  }, []);

  const toggleInfoOverlay = useCallback(() => {
    setShowInfoOverlay(prev => !prev);
  }, []);

  const currentSpeedKmh = speed * 3.6;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b1e', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
          Loading ride data...
        </SafeText>
      </View>
    );
  }

  if (rideStep === 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0b1e', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
        </View>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 22 }}>Ride Complete!</SafeText>
        <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          You have arrived at {assignment?.destination || 'your destination'}
        </SafeText>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
          <Pressable onPress={() => router.back()} className="flex-1 bg-tics-amber/35 border border-tics-amber/20 rounded-full p-5" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>Go Back</SafeText>
          </Pressable>
          <Pressable onPress={() => { router.replace({ pathname: '/last-mile/destination-select' as any, params: { assignmentId } } as any); }} className="flex-1 rounded-full p-5" style={{ backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 14 }}>Set Destination</SafeText>
          </Pressable>
        </View>
        {isOffline && (
          <View style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.15)' }}>
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 12 }}>⚠ Offline - Data will sync when connected</SafeText>
          </View>
        )}
      </View>
    );
  }
  
  const hasDriverInfo = assignment?.driverName || assignment?.vehicle || assignment?.driverPhone;

  // Always show markers when we have an assignment
  const showMarkers = !!assignment;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0b1e' }}>
      {isOffline && (
        <View style={{ position: 'absolute', top: insets.top + 60, left: 16, right: 16, zIndex: 20, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
          <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#F59E0B', fontSize: 11, flex: 1 }}>No internet connection - retrying...</SafeText>
        </View>
      )}

      {/* Map - always render */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
        initialRegion={initialRegion}
        showsUserLocation={showMarkers}
        followsUserLocation={showMarkers}
        showsCompass
        rotateEnabled
        showsTraffic
      >
        {/* Destination marker - always show when assignment data exists */}
        {showMarkers && (
          <Marker
            coordinate={
              assignment?.destinationLat && assignment?.destinationLng
                ? { latitude: assignment.destinationLat, longitude: assignment.destinationLng }
                : { latitude: initialRegion.latitude + 0.01, longitude: initialRegion.longitude + 0.01 }
            }
            title="Drop-off"
            description={assignment?.destination || 'Arranged location'}
            pinColor="#8B5CF6"
          />
        )}
        
        {/* Origin marker (current location detected by GPS) */}
        {currentLoc && showMarkers && (
          <Marker
            coordinate={{
              latitude: currentLoc.latitude,
              longitude: currentLoc.longitude,
            }}
            title="Your Location"
            description="Current position"
            pinColor="#3B82F6"
          />
        )}
        
        {/* Route polyline with dashed pattern to show journey waypoints */}
        {route?.polylinePoints && route.polylinePoints.length > 1 && (
          <Polyline
            coordinates={route.polylinePoints}
            strokeColor="#8B5CF6"
            strokeWidth={5}
            lineDashPattern={[8, 12]} // Creates dashed line effect: 8px dash, 12px gap
          />
        )}
      </MapView>

      {/* Top bar */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(10,11,30,0.85)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color="#f8fafc" />
        </Pressable>
        {assignment?.destination && (rideStep === 'tracking' || rideStep === 'near_destination') && (
          <View style={{ borderRadius: 20, backgroundColor: 'rgba(10,11,30,0.85)', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '50%' }}>
            <Ionicons name="location" size={16} color="#8B5CF6" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 11 }} numberOfLines={1}>{assignment.destination}</SafeText>
          </View>
        )}
        {assignment?.driverName && (
          <View style={{ borderRadius: 20, backgroundColor: 'rgba(10,11,30,0.85)', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="person-circle" size={20} color="#22C55E" />
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 12 }}>{assignment.driverName}</SafeText>
          </View>
        )}
      </View>
      
      {/* Map overlay action buttons */}
      {(rideStep === 'tracking' || rideStep === 'idle' || rideStep === 'driver_arrived') && !assignment?.destination && (
        <View style={{ position: 'absolute', top: insets.top + 56, right: 8, zIndex: 10, gap: 6 }}>
          <Pressable onPress={handleChangeDestination} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(139,92,246,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 }}>
            <Ionicons name="location-outline" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={handleCancelRide} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(239,68,68,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
      )}
      
      {(rideStep === 'tracking') && assignment?.destination && (
        <View style={{ position: 'absolute', top: insets.top + 56, left: 8, zIndex: 10, gap: 6 }}>
          <Pressable onPress={handleChangeDestination} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(139,92,246,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 }}>
            <Ionicons name="swap-horizontal" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={handleCancelRide} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(239,68,68,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#EF4444', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 }}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
      )}

      {(rideStep === 'tracking' || rideStep === 'near_destination') && (
        <Pressable onPress={toggleInfoOverlay} style={{ position: 'absolute', bottom: showInfoOverlay ? 340 : 100, right: 8, zIndex: 15, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(10,11,30,0.8)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
          <Ionicons name={showInfoOverlay ? 'chevron-down' : 'chevron-up'} size={18} color="#94a3b8" />
        </Pressable>
      )}

      {(rideStep === 'tracking' || rideStep === 'near_destination') && showInfoOverlay && (
        <LinearGradient colors={['rgba(10,11,30,0.95)', 'rgba(10,11,30,0.98)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 16, paddingBottom: insets.bottom + 20, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}>DISTANCE</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 20, marginTop: 4 }}>{formatDistance(distance)}</SafeText>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}>ETA</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 20, marginTop: 4 }}>{duration > 0 ? formatDuration(duration) : '...'}</SafeText>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}>SPEED</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 20, marginTop: 4 }}>{currentSpeedKmh > 0 ? `${currentSpeedKmh.toFixed(0)} km/h` : '—'}</SafeText>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}>ELAPSED</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 20, marginTop: 4 }}>{formatDuration(elapsed)}</SafeText>
            </View>
          </View>

          <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16, overflow: 'hidden' }}>
            <Animated.View style={[{ height: '100%', borderRadius: 2, backgroundColor: '#8B5CF6' }, animatedProgress]} />
          </View>

          {hasDriverInfo && (
            <View style={{ borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={22} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#f8fafc', fontSize: 14 }}>{assignment?.driverName || 'Driver'}</SafeText>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                    {assignment?.vehicle && <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}><Ionicons name="car" size={10} color="#94a3b8" /> {assignment.vehicle}</SafeText>}
                    {assignment?.plateNumber && <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 11 }}>{assignment.plateNumber}</SafeText>}
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Pressable onPress={handleCallDriver} style={{ flex: 1, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.15)', padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="call" size={16} color="#60A5FA" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#60A5FA', fontSize: 12 }}>Call</SafeText>
                </Pressable>
                <Pressable onPress={handleWhatsApp} style={{ flex: 1, borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.15)', padding: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Ionicons name="logo-whatsapp" size={16} color="#22C55E" />
                  <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#22C55E', fontSize: 12 }}>WhatsApp</SafeText>
                </Pressable>
              </View>
            </View>
          )}

          {assignment?.operatorName && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#64748b', fontSize: 11 }}><Ionicons name="business" size={10} color="#64748b" /> {assignment.operatorName}</SafeText>
            </View>
          )}

          {rideStep === 'near_destination' && (
            <Pressable onPress={handleArrived} style={{ borderRadius: 24, backgroundColor: '#22C55E', padding: 18, alignItems: 'center', shadowColor: '#22C55E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}>
              <Ionicons name="location" size={24} color="#fff" />
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 18, marginTop: 4 }}>Arrived</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 }}>Tap to complete your ride</SafeText>
            </Pressable>
          )}

          {rideStep === 'tracking' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={handleChangeDestination} style={{ flex: 1, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.15)', padding: 14, alignItems: 'center', gap: 4 }}>
                <Ionicons name="swap-horizontal" size={20} color="#A78BFA" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#A78BFA', fontSize: 11 }}>Change Dest</SafeText>
              </Pressable>
              <Pressable onPress={handleCancelRide} style={{ flex: 1, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.15)', padding: 14, alignItems: 'center', gap: 4 }}>
                <Ionicons name="close-circle" size={20} color="#EF4444" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#EF4444', fontSize: 11 }}>Cancel</SafeText>
              </Pressable>
              <Pressable onPress={handleEmergency} style={{ flex: 1, borderRadius: 16, backgroundColor: 'rgba(239,68,68,0.25)', padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#EF4444', fontSize: 11 }}>Emergency</SafeText>
              </Pressable>
            </View>
          )}

          {rideStep === 'tracking' && (
            <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              {assignment?.destination ? `Heading to ${assignment.destination}` : 'Tracking your ride...'}
            </SafeText>
          )}
        </LinearGradient>
      )}

      {rideStep === 'idle' && !driverAlreadyArrived && (
        <View style={{ position: 'absolute', bottom: insets.bottom + 2, left: 8, right: 8, zIndex: 10 }}>
          <Pressable onPress={handleDriverArrived} style={{ alignItems: 'center' }} className='rounded-full p-2 bg-tics-amber/20 border border-tics-amber/10 flex-row gap-3'>
            <View style={{ width: 46, height: 46 }} className='rounded-full bg-tics-amber/35 border border-tics-amber/20 items-center justify-center'>
              <Ionicons name="car" size={24} color="#fff" />
            </View>
            <View>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: '#fff', fontSize: 17, marginTop: 6 }}>Driver Has Arrived</SafeText>
              <SafeText style={{ fontFamily: 'ShareTech_400Regular', color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>Tap when the driver picks you up</SafeText>
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}
