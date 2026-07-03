/**
 * DirectionsService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches navigation routes from the Google Directions API.
 * Returns polyline, distance, and duration between origin and destination.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { decodePolyline } from '@/src/utils/polyline';

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  startAddress: string;
  endAddress: string;
}

export interface DirectionResult {
  polylinePoints: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationSeconds: number;
  legs: RouteLeg[];
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
}

/* ── Fetch directions ───────────────────────────────────────────────────────── */

export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<DirectionResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[DirectionsService] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set');
    return null;
  }

  const origin = `${originLat},${originLng}`;
  const dest = `${destLat},${destLng}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&key=${apiKey}&mode=driving`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.warn('[DirectionsService] API returned:', data.status);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];
    if (!leg) return null;

    const polylinePoints = decodePolyline(route.overview_polyline?.points ?? '');

    return {
      polylinePoints,
      distanceMeters: leg.distance?.value ?? 0,
      durationSeconds: leg.duration?.value ?? 0,
      legs: [
        {
          distanceMeters: leg.distance?.value ?? 0,
          durationSeconds: leg.duration?.value ?? 0,
          startAddress: leg.start_address ?? '',
          endAddress: leg.end_address ?? '',
        },
      ],
    };
  } catch (err) {
    console.warn('[DirectionsService] fetch error:', err);
    return null;
  }
}

/**
 * Calculate straight-line distance between two coordinates in meters
 * using the Haversine formula. Used for arrival detection.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance for display.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration (seconds) for display (e.g. "12 min" or "1h 23m").
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
