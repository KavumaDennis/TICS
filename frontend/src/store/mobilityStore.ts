import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type Mobility = {
  tripId: string;
  origin?: { lat: number; lng: number; label: string };
  destination?: { lat: number; lng: number; label: string };
  bestRoute?: { durationSec: number; distanceMeters: number; polyline: string };
  routeOptions?: Array<{ durationSec: number; distanceMeters: number; polyline: string; summary?: string }>;
  updatedAt?: any;
};

type MobilityState = {
  byTripId: Record<string, Mobility>;
  startMobilityListener: (tripId: string) => void;
  stopMobilityListener: (tripId: string) => void;
};

const unsubByTrip: Record<string, Unsubscribe | undefined> = {};

function parse(tripId: string, data: any): Mobility | null {
  if (!data) return null;

  const best = data.bestRoute;

  const safeBest =
    best &&
    typeof best.durationSec === 'number' &&
    typeof best.distanceMeters === 'number' &&
    typeof best.polyline === 'string'
      ? {
          durationSec: best.durationSec,
          distanceMeters: best.distanceMeters,
          polyline: best.polyline,
        }
      : undefined;

  const safeRouteOptions = Array.isArray(data.routeOptions)
    ? data.routeOptions
        .filter(
          (r: any) =>
            r &&
            typeof r.durationSec === 'number' &&
            typeof r.distanceMeters === 'number' &&
            typeof r.polyline === 'string'
        )
        .map((r: any) => ({
          durationSec: r.durationSec,
          distanceMeters: r.distanceMeters,
          polyline: r.polyline,
          summary: typeof r.summary === 'string' ? r.summary : undefined,
        }))
    : undefined;

  return {
    tripId,
    origin: data.origin,
    destination: data.destination,
    bestRoute: safeBest,
    routeOptions: safeRouteOptions,
    updatedAt: data.updatedAt,
  };
}

export const useMobilityStore = create<MobilityState>((set, get) => ({
  byTripId: {},

  startMobilityListener: (tripId) => {
    const db = getFirebaseFirestore();

    // prevent duplicate listeners
    if (unsubByTrip[tripId]) return;

    unsubByTrip[tripId] = onSnapshot(
      doc(db, 'mobility', tripId),

      (snap) => {
        if (!snap.exists()) return;

        const parsed = parse(tripId, snap.data());
        if (!parsed) return;

        set((state) => ({
          byTripId: {
            ...state.byTripId,
            [tripId]: parsed,
          },
        }));
      },

      (error) => {
        console.warn('Mobility listener error:', error);
      }
    );
  },

  stopMobilityListener: (tripId) => {
    const unsub = unsubByTrip[tripId];

    if (unsub) {
      delete unsubByTrip[tripId];
      try {
        unsub();
      } catch (e) {
        console.warn('Error unsubscribing mobility:', e);
      }
    }

    set((state) => {
      const next = { ...state.byTripId };
      delete next[tripId];
      return { byTripId: next };
    });
  },
}));