/**
 * weatherStore.ts
 * Listens to weather_monitoring/{tripId} (flat collection written by Cloud
 * Functions).  All data is trip-scoped and keyed by tripId in the store.
 */
import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type WeatherSummary = {
  tripId: string;
  /** Resolved city name from OpenWeather */
  label: string;
  tempC: number | null;
  feelsLikeC: number | null;
  humidity: number | null;
  description: string | null;
  weatherMain: string | null;   // e.g. "Rain", "Clear", "Thunderstorm"
  windKph: number | null;
  /** Computed 0–10 risk score */
  riskScore: number;
  /** Human-readable summary generated server-side */
  riskSummary: string | null;
  updatedAt?: any;
};

type WeatherState = {
  byTripId: Record<string, WeatherSummary | null>;
  startWeatherListener: (tripId: string) => void;
  stopWeatherListener: (tripId: string) => void;
};

const unsubByTrip: Record<string, Unsubscribe | undefined> = {};

function parseWeather(tripId: string, data: any): WeatherSummary {
  const locLabel = data?.locations?.[0]?.label ?? data?.location ?? 'Destination';
  const current = data?.current ?? {};

  // Support both the new flat shape and the legacy nested shape
  const tempC: number | null =
    typeof current.temp === 'number' ? current.temp :
    typeof data?.tempC === 'number' ? data.tempC : null;

  const feelsLikeC: number | null =
    typeof current.feelsLike === 'number' ? current.feelsLike :
    typeof data?.feelsLikeC === 'number' ? data.feelsLikeC : null;

  const humidity: number | null =
    typeof current.humidity === 'number' ? current.humidity :
    typeof data?.humidity === 'number' ? data.humidity : null;

  const weatherArr = Array.isArray(current.weather) ? current.weather : [];
  const description: string | null = weatherArr[0]?.description ?? data?.description ?? null;
  const weatherMain: string | null = weatherArr[0]?.main ?? data?.weatherMain ?? null;

  const windKph: number | null =
    typeof data?.windKph === 'number' ? data.windKph : null;

  const riskScore: number =
    typeof data?.riskScore === 'number' ? data.riskScore : 0;

  const riskSummary: string | null =
    typeof data?.riskSummary === 'string' ? data.riskSummary : null;

  return {
    tripId,
    label: typeof locLabel === 'string' && locLabel.trim() ? locLabel.trim() : 'Destination',
    tempC,
    feelsLikeC,
    humidity,
    description,
    weatherMain,
    windKph,
    riskScore,
    riskSummary,
    updatedAt: data?.updatedAt,
  };
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  byTripId: {},

  startWeatherListener: (tripId) => {
    // Prevent duplicate listeners
    if (unsubByTrip[tripId]) return;

    const db = getFirebaseFirestore();

    unsubByTrip[tripId] = onSnapshot(
      doc(db, 'weather_monitoring', tripId),
      (snap) => {
        if (!snap.exists()) {
          set((s) => ({ byTripId: { ...s.byTripId, [tripId]: null } }));
          return;
        }
        set((s) => ({
          byTripId: { ...s.byTripId, [tripId]: parseWeather(tripId, snap.data()) },
        }));
      },
      (err) => {
        console.warn(`weatherStore: listener error for ${tripId}`, err);
        set((s) => ({ byTripId: { ...s.byTripId, [tripId]: null } }));
      },
    );
  },

  stopWeatherListener: (tripId) => {
    unsubByTrip[tripId]?.();
    delete unsubByTrip[tripId];
    set((s) => {
      const next = { ...s.byTripId };
      delete next[tripId];
      return { byTripId: next };
    });
  },
}));
