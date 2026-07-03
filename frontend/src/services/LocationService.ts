/**
 * LocationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages Expo Location permissions and continuous foreground location
 * watching. Exposes startWatch / stopWatch with a callback pattern.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

export interface TravelerLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

type LocationCallback = (loc: TravelerLocation) => void;

let _sub: Location.LocationSubscription | null = null;
let _watchId: number | null = null; // fallback for web

/**
 * Request foreground location permission.
 * Returns true if granted, false otherwise.
 * On denial, shows an alert directing the user to settings.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Location Permission Needed',
      'Ride tracking requires access to your location to show your live position on the map. Please enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  }
  return true;
}

/**
 * Start watching the user's position continuously.
 * Fires onLocationUpdate every time a new position is available.
 *
 * Options:
 *  - accuracy: Location.Accuracy (default: Location.Accuracy.High)
 *  - timeInterval: minimum time (ms) between updates (default: 3000)
 *  - distanceInterval: minimum distance (m) between updates (default: 5)
 */
export function startWatchingLocation(
  onLocationUpdate: LocationCallback,
  options?: {
    accuracy?: Location.Accuracy;
    timeInterval?: number;
    distanceInterval?: number;
  },
): void {
  if (_sub) {
    console.warn('[LocationService] Already watching location.');
    return;
  }

  const accuracy = options?.accuracy ?? Location.Accuracy.High;
  const timeInterval = options?.timeInterval ?? 3000;
  const distanceInterval = options?.distanceInterval ?? 5;

  _sub = Location.watchPositionAsync(
    {
      accuracy,
      timeInterval,
      distanceInterval,
      mayShowUserSettingsDialog: false,
    },
    (loc) => {
      const coords = loc.coords;
      onLocationUpdate({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        heading: coords.heading,
        speed: coords.speed ?? undefined,
        timestamp: loc.timestamp ?? Date.now(),
      });
    },
  ).catch((err) => {
    console.warn('[LocationService] watchPositionAsync error:', err);
  });
}

/**
 * Stop watching location and clean up the subscription.
 */
export function stopWatchingLocation(): void {
  if (_sub) {
    _sub.then((s) => s.remove()).catch(() => {});
    _sub = null;
  }
  if (_watchId != null) {
    // Clean up web fallback
    _watchId = null;
  }
}

/**
 * Get the current position once (one-shot).
 */
export async function getCurrentPosition(): Promise<TravelerLocation | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const coords = loc.coords;
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading,
      speed: coords.speed ?? undefined,
      timestamp: loc.timestamp ?? Date.now(),
    };
  } catch (err) {
    console.warn('[LocationService] getCurrentPosition error:', err);
    return null;
  }
}

/**
 * Check if location permission is already granted.
 */
export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}
