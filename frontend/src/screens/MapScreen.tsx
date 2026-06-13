import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View, Platform } from 'react-native';

let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
  } catch {
    // react-native-maps not installed or not available
  }
}

import Card from '@/src/components/Card';
import PersistentTabBar from '@/src/components/PersistentTabBar';
import { useMobilityStore } from '@/src/store/mobilityStore';
import { useTripStore } from '@/src/store/tripStore';

type LatLng = { latitude: number; longitude: number };

/* ─── Known airport coordinates ───────────────────────────── */

const AIRPORT_COORDS: Record<string, { lat: number; lng: number }> = {
  EBB: { lat: 0.0424, lng: 32.4435 },
  NBO: { lat: -1.3192, lng: 36.9278 },
  MBA: { lat: -4.0348, lng: 39.5942 },
  DAR: { lat: -6.8781, lng: 39.2026 },
  KGL: { lat: -1.9686, lng: 30.1395 },
  ADD: { lat: 8.9779, lng: 38.7993 },
  JNB: { lat: -26.1367, lng: 28.2411 },
  CPT: { lat: -33.9649, lng: 18.6017 },
  LOS: { lat: 6.5774, lng: 3.3212 },
  ACC: { lat: 5.6052, lng: -0.1668 },
  CAI: { lat: 30.1219, lng: 31.4056 },
  DXB: { lat: 25.2532, lng: 55.3657 },
  AUH: { lat: 24.4330, lng: 54.6511 },
  DOH: { lat: 25.2609, lng: 51.6138 },
  JED: { lat: 21.6796, lng: 39.1566 },
  IST: { lat: 41.2753, lng: 28.7519 },
  LHR: { lat: 51.4700, lng: -0.4543 },
  CDG: { lat: 49.0097, lng: 2.5479 },
  AMS: { lat: 52.3105, lng: 4.7683 },
  FRA: { lat: 50.0379, lng: 8.5622 },
  JFK: { lat: 40.6413, lng: -73.7781 },
  LAX: { lat: 33.9416, lng: -118.4085 },
  ORD: { lat: 41.9742, lng: -87.9073 },
  ATL: { lat: 33.6407, lng: -84.4277 },
  SFO: { lat: 37.6213, lng: -122.3790 },
  MIA: { lat: 25.7959, lng: -80.2870 },
  SIN: { lat: 1.3644, lng: 103.9915 },
  BKK: { lat: 13.6900, lng: 100.7501 },
  HKG: { lat: 22.3080, lng: 113.9185 },
  HND: { lat: 35.5494, lng: 139.7798 },
  ICN: { lat: 37.4602, lng: 126.4407 },
  DEL: { lat: 28.5562, lng: 77.1000 },
  BOM: { lat: 19.0896, lng: 72.8656 },
  SYD: { lat: -33.9461, lng: 151.1772 },
  GRU: { lat: -23.4356, lng: -46.4731 },
  MEX: { lat: 19.4363, lng: -99.0721 },
  YYZ: { lat: 43.6777, lng: -79.6248 },
  PEK: { lat: 40.0799, lng: 116.6031 },
  PVG: { lat: 31.1443, lng: 121.8083 },
  KUL: { lat: 2.7456, lng: 101.7099 },
};

/* ─── City name → coordinate lookup ──────────────────────── */

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  entebbe: { lat: 0.0512, lng: 32.4637 },
  kampala: { lat: 0.3476, lng: 32.5825 },
  nairobi: { lat: -1.2921, lng: 36.8219 },
  mombasa: { lat: -4.0435, lng: 39.6682 },
  'dar es salaam': { lat: -6.7924, lng: 39.2083 },
  kigali: { lat: -1.9403, lng: 29.8739 },
  'addis ababa': { lat: 9.0250, lng: 38.7469 },
  johannesburg: { lat: -26.2041, lng: 28.0473 },
  'cape town': { lat: -33.9249, lng: 18.4241 },
  lagos: { lat: 6.5244, lng: 3.3792 },
  accra: { lat: 5.6037, lng: -0.1870 },
  cairo: { lat: 30.0444, lng: 31.2357 },
  dubai: { lat: 25.2048, lng: 55.2708 },
  doha: { lat: 25.2854, lng: 51.5310 },
  istanbul: { lat: 41.0082, lng: 28.9784 },
  london: { lat: 51.5074, lng: -0.1278 },
  paris: { lat: 48.8566, lng: 2.3522 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  frankfurt: { lat: 50.1109, lng: 8.6821 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  singapore: { lat: 1.3521, lng: 103.8198 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  seoul: { lat: 37.5665, lng: 126.9780 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  sydney: { lat: -33.8688, lng: 151.2093 },
};

function resolveCoords(location: string): { lat: number; lng: number } | null {
  if (!location) return null;
  const trimmed = location.trim();

  // New format: "EBB Entebbe" — first 3-letter token is the IATA code
  const firstToken = trimmed.split(/\s+/)[0] ?? '';
  if (/^[A-Z]{3}$/.test(firstToken) && AIRPORT_COORDS[firstToken]) {
    return AIRPORT_COORDS[firstToken]!;
  }

  const upper = trimmed.replace(/[^a-zA-Z]/g, '').toUpperCase();

  // Try exact IATA code match (3 uppercase letters)
  if (upper.length === 3 && AIRPORT_COORDS[upper]) return AIRPORT_COORDS[upper]!;

  // Try code embedded in string (e.g. "EBB Entebbe" or "JFK New York")
  for (const code of Object.keys(AIRPORT_COORDS)) {
    if (trimmed.toUpperCase().includes(code)) return AIRPORT_COORDS[code]!;
  }

  // Try city name match
  const lower = trimmed.toLowerCase();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(city)) return coords;
  }

  // Try first word before comma: "Dubai, AE" → "dubai"
  const beforeComma = trimmed.split(',')[0]?.toLowerCase().trim();
  if (beforeComma && CITY_COORDS[beforeComma]) return CITY_COORDS[beforeComma]!;

  return null;
}

/* ─── Polyline decoder ─────────────────────────────────── */

function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coordinates;
}

/* ─── Great circle arc between two points ─────────────── */

function generateArc(from: LatLng, to: LatLng, segments = 50): LatLng[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(from.latitude);
  const lng1 = toRad(from.longitude);
  const lat2 = toRad(to.latitude);
  const lng2 = toRad(to.longitude);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng1 - lng2) / 2), 2)
    )
  );

  const points: LatLng[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push({
      latitude: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
      longitude: toDeg(Math.atan2(y, x)),
    });
  }
  return points;
}

/* ─── Screen ──────────────────────────────────────────── */

export default function MapScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Try mobility store first (ground transport polyline)
  const mobility = useMobilityStore((s) => (id ? s.byTripId[String(id)] ?? null : null));
  const polyline = mobility?.bestRoute?.polyline ?? null;
  const mobilityPoints = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);
  const mobilityOrigin = mobility?.origin;
  const mobilityDest = mobility?.destination;

  // Fallback: use trip departure/destination for flight arc
  const trip = useTripStore((s) => {
    if (!id) return null;
    return s.trips.find((t) => t.id === String(id)) ?? null;
  });

  const fromCoords = useMemo(() => (trip?.from ? resolveCoords(trip.from) : null), [trip?.from]);
  const toCoords = useMemo(() => (trip?.to ? resolveCoords(trip.to) : null), [trip?.to]);

  // Generate a great-circle arc for the flight path
  const flightArc = useMemo(() => {
    if (!fromCoords || !toCoords) return [];
    return generateArc(
      { latitude: fromCoords.lat, longitude: fromCoords.lng },
      { latitude: toCoords.lat, longitude: toCoords.lng }
    );
  }, [fromCoords, toCoords]);

  // Determine which points to show
  const hasGroundRoute = mobilityPoints.length > 0;
  const hasFlightRoute = flightArc.length > 0;
  const hasAnyRoute = hasGroundRoute || hasFlightRoute;

  const allPoints = hasGroundRoute ? mobilityPoints : flightArc;

  const initialRegion = useMemo(() => {
    if (hasGroundRoute && mobilityPoints[0]) {
      return { latitude: mobilityPoints[0].latitude, longitude: mobilityPoints[0].longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }
    if (hasFlightRoute && fromCoords && toCoords) {
      const midLat = (fromCoords.lat + toCoords.lat) / 2;
      const midLng = (fromCoords.lng + toCoords.lng) / 2;
      const dLat = Math.abs(fromCoords.lat - toCoords.lat) * 1.5;
      const dLng = Math.abs(fromCoords.lng - toCoords.lng) * 1.5;
      return { latitude: midLat, longitude: midLng, latitudeDelta: Math.max(dLat, 10), longitudeDelta: Math.max(dLng, 10) };
    }
    if (mobilityOrigin) return { latitude: mobilityOrigin.lat, longitude: mobilityOrigin.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    return { latitude: 0.3476, longitude: 32.5825, latitudeDelta: 40, longitudeDelta: 40 };
  }, [fromCoords, hasFlightRoute, hasGroundRoute, mobilityOrigin, mobilityPoints, toCoords]);

  return (
    <View className="flex-1 px-2 pt-10">
      {/* Header */}
      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-xl border border-[#96C7B3]/50 bg-white/[0.05]"
          >
            <Ionicons name="chevron-back" size={20} color="rgba(234,242,255,0.9)" />
          </Pressable>
          <View className="h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-tics-blue">
            <FontAwesome5 name="map-marker-alt" size={18} color="black" />
          </View>
        </View>
        <View>
          <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[16px]">
            Route
          </Text>
          {trip && (
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[11px]">
              {trip.from} → {trip.to}
            </Text>
          )}
        </View>
      </View>

      {hasAnyRoute ? (
        <View className="mt-3 flex-1 overflow-hidden rounded-2xl border border-white/10">
          {Platform.OS === 'web' || !MapView ? (
            <View className="flex-1 items-center justify-center bg-[#1E293B]">
              <Ionicons name="map-outline" size={48} color="rgba(248,250,252,0.2)" />
              <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[14px] text-center px-4 mt-4">
                Map view is not available on web. Use a mobile device to see the route.
              </Text>
            </View>
          ) : (
            <MapView style={{ flex: 1 }} initialRegion={initialRegion}>
              {/* Ground route markers */}
              {hasGroundRoute && mobilityOrigin && Marker && (
                <Marker coordinate={{ latitude: mobilityOrigin.lat, longitude: mobilityOrigin.lng }} title={mobilityOrigin.label} />
              )}
              {hasGroundRoute && mobilityDest && Marker && (
                <Marker coordinate={{ latitude: mobilityDest.lat, longitude: mobilityDest.lng }} title={mobilityDest.label} />
              )}

              {/* Flight markers */}
              {hasFlightRoute && !hasGroundRoute && fromCoords && Marker && (
                <Marker
                  coordinate={{ latitude: fromCoords.lat, longitude: fromCoords.lng }}
                  title={trip?.from ?? 'Departure'}
                  pinColor="#3B82F6"
                />
              )}
              {hasFlightRoute && !hasGroundRoute && toCoords && Marker && (
                <Marker
                  coordinate={{ latitude: toCoords.lat, longitude: toCoords.lng }}
                  title={trip?.to ?? 'Destination'}
                  pinColor="#22C55E"
                />
              )}

              {/* Route line */}
              {allPoints.length > 1 && Polyline && (
                <Polyline
                  coordinates={allPoints}
                  strokeWidth={hasGroundRoute ? 4 : 3}
                  strokeColor={hasGroundRoute ? '#60a5fa' : '#3B82F6'}
                  lineDashPattern={hasGroundRoute ? undefined : [10, 6]}
                />
              )}
            </MapView>
          )}
        </View>
      ) : (
        <Card className="mt-10 py-6">
          <View className="items-center">
            <Ionicons name="navigate-outline" size={40} color="rgba(248,250,252,0.2)" />
            <Text style={{ fontFamily: 'Syne_700Bold' }} className="text-tics-text text-[14px] mt-4">
              No route data yet
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="mt-2 text-tics-muted text-[12px] leading-5 text-center px-4">
              {trip
                ? `Route from ${trip.from} to ${trip.to} will appear here once coordinates are available. Try creating a new trip with the airport selector for automatic route mapping.`
                : 'This view shows the flight path or ground transport route for your trip.'}
            </Text>
          </View>
        </Card>
      )}

      {/* Route info bar */}
      {hasAnyRoute && trip && (
        <View className="mt-3 mb-4 flex-row items-center gap-3 rounded-xl border border-[#96C7B3]/50 bg-white/[0.05] px-4 py-3">
          <Ionicons name={hasGroundRoute ? 'car' : 'airplane'} size={18} color="#3B82F6" />
          <View className="flex-1">
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-text text-[12px]">
              {trip.from} → {trip.to}
            </Text>
            <Text style={{ fontFamily: 'Syne_500Medium' }} className="text-tics-muted text-[10px]">
              {hasGroundRoute ? 'Ground transport route' : 'Flight path (great circle)'}
              {trip.flightNumber ? ` · ${trip.flightNumber}` : ''}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
