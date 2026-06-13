import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type FlightMonitoring = {
  tripId: string;
  flightNumber?: string | null;
  airline?: string | null;
  status: 'scheduled' | 'active' | 'landed' | 'canceled' | 'unknown';
  delayMinutes: number | null;
  gate: string | null;
  terminal: string | null;
  departureActual?: string | null;   // ISO string from AviationStack
  arrivalActual?: string | null;
  updatedAt?: any;
};

type FlightMonitoringState = {
  byTripId: Record<string, FlightMonitoring>;
  startFlightMonitoringListener: (tripId: string) => void;
  stopFlightMonitoringListener: (tripId: string) => void;
};

const unsubByTrip: Record<string, Unsubscribe | undefined> = {};

function parse(tripId: string, data: any): FlightMonitoring | null {
  if (!data) return null;

  const statusRaw = String(data.status ?? 'unknown');
  const status: FlightMonitoring['status'] =
    statusRaw === 'scheduled' || statusRaw === 'active' ||
    statusRaw === 'landed'    || statusRaw === 'canceled'
      ? statusRaw : 'unknown';

  return {
    tripId,
    flightNumber: typeof data.flightNumber === 'string' ? data.flightNumber : null,
    airline: typeof data.airline === 'string' ? data.airline : null,
    status,
    delayMinutes: typeof data.delayMinutes === 'number' ? data.delayMinutes : null,
    gate: typeof data.gate === 'string' ? data.gate : null,
    terminal: typeof data.terminal === 'string' ? data.terminal : null,
    departureActual: typeof data.departureActual === 'string' ? data.departureActual : null,
    arrivalActual: typeof data.arrivalActual === 'string' ? data.arrivalActual : null,
    updatedAt: data.updatedAt,
  };
}

export const useFlightMonitoringStore = create<FlightMonitoringState>((set, get) => ({
  byTripId: {},

  startFlightMonitoringListener: (tripId) => {
    const db = getFirebaseFirestore();

    // Prevent duplicate listeners
    if (unsubByTrip[tripId]) return;

    unsubByTrip[tripId] = onSnapshot(
      doc(db, 'flight_monitoring', tripId),

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
        console.warn('Flight monitoring listener error:', error);
      }
    );
  },

  stopFlightMonitoringListener: (tripId) => {
    const unsub = unsubByTrip[tripId];

    if (unsub) {
      delete unsubByTrip[tripId];
      try {
        unsub();
      } catch (e) {
        console.warn('Error unsubscribing flight monitoring:', e);
      }
    }

    set((state) => {
      const next = { ...state.byTripId };
      delete next[tripId];
      return { byTripId: next };
    });
  },
}));