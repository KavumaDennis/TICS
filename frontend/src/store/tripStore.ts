import { create } from 'zustand';
import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { tripsCollection } from '@/src/firebase/collections';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type AirportData = {
  airportCode: string;
  airportName: string;
  city: string;
  countryCode: string;
};

export type Trip = {
  id: string;
  userId: string;
  title: string;
  status?: 'planned' | 'active' | 'completed' | 'canceled';
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  airline?: string | null;
  flightNumber?: string | null;
  /** Structured airport data written by the new trip form */
  departureAirport?: AirportData;
  destinationAirport?: AirportData;
  /** OpenWeather-compatible "City,CC" strings */
  weatherLocationFrom?: string;
  weatherLocationTo?: string;
  monitoringStatus?: 'on_track' | 'at_risk' | 'unknown';
  lastMileStatus?: 'scheduled' | 'none' | 'in_progress' | 'completed';
  timeline?: Array<{ at: string; kind: string; label: string }>;
  hotels?: Array<{
    name?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
    checkInAt?: string;
    checkOutAt?: string;
  }>;
  destinations?: Array<{
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  }>;
};

export type CreateTripInput = Omit<Trip, 'id' | 'userId'>;

/** Centralised mapper so both the listener and refreshTrips produce identical shapes */
function mapTripDoc(id: string, data: any): Trip {
  return {
    id,
    userId: data.userId,
    title: data.title,
    status: data.status ?? 'planned',
    from: data.from,
    to: data.to,
    departureTime: data.departureTime,
    arrivalTime: data.arrivalTime,
    airline: data.airline ?? null,
    flightNumber: data.flightNumber ?? null,
    departureAirport: data.departureAirport ?? undefined,
    destinationAirport: data.destinationAirport ?? undefined,
    weatherLocationFrom: data.weatherLocationFrom ?? undefined,
    weatherLocationTo: data.weatherLocationTo ?? undefined,
    monitoringStatus: data.monitoringStatus ?? 'unknown',
    lastMileStatus: data.lastMileStatus ?? 'none',
    timeline: Array.isArray(data.timeline) ? data.timeline : undefined,
    hotels: Array.isArray(data.hotels) ? data.hotels : undefined,
    destinations: Array.isArray(data.destinations) ? data.destinations : undefined,
  };
}

type TripState = {
  trips: Trip[];
  activeTripId: string | null;
  loading: boolean;
  error: string | null;

  startTripsListener: (userId: string) => void;
  stopTripsListener: () => void;
  refreshTrips: (userId: string) => Promise<void>;
  setActiveTripId: (tripId: string) => void;

  addTrip: (userId: string, input: CreateTripInput) => Promise<Trip | null>;
  updateTrip: (tripId: string, patch: Partial<CreateTripInput>) => Promise<void>;
};

let unsubscribeTrips: Unsubscribe | null = null;

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  activeTripId: null,
  loading: false,
  error: null,

  startTripsListener: (userId) => {
    get().stopTripsListener();
    set({ loading: true, error: null });

    const db = getFirebaseFirestore();
    const q = query(
      tripsCollection(),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    );

    unsubscribeTrips = onSnapshot(
      q,
      (snap) => {
        const trips = snap.docs.map((d) => mapTripDoc(d.id, d.data()));
        set((state) => ({
          trips,
          loading: false,
          activeTripId: state.activeTripId ?? trips[0]?.id ?? null,
        }));
      },
      (err) => set({ loading: false, error: err?.message ?? 'Failed to load trips' }),
    );
  },

  stopTripsListener: () => {
    if (unsubscribeTrips) {
      try { unsubscribeTrips(); } catch {}
      unsubscribeTrips = null;
    }
    set({ trips: [], activeTripId: null, loading: false, error: null });
  },

  refreshTrips: async (userId) => {
    set({ loading: true, error: null });
    try {
      const db = getFirebaseFirestore();
      const q = query(
        tripsCollection(),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const trips = snap.docs.map((d) => mapTripDoc(d.id, d.data()));
      set({ trips, loading: false, activeTripId: trips[0]?.id ?? null });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Failed to refresh trips' });
    }
  },

  setActiveTripId: (tripId) => set({ activeTripId: tripId }),

  addTrip: async (userId, input) => {
    set({ loading: true, error: null });
    try {
      const ref = await addDoc(tripsCollection(), {
        ...input,
        userId,
        monitoringStatus: input.monitoringStatus ?? 'unknown',
        lastMileStatus: input.lastMileStatus ?? 'none',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      set({ loading: false, activeTripId: ref.id });
      return { id: ref.id, userId, ...input };
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Failed to create trip' });
      return null;
    }
  },

  updateTrip: async (tripId, patch) => {
    const db = getFirebaseFirestore();
    await updateDoc(doc(db, 'trips', tripId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },
}));
