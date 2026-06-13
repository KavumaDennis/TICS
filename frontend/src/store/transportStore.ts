/**
 * transportStore.ts
 * Loads transport_options from Firestore, scoped by tripId.
 *
 * Critical: selectors that return arrays must be STABLE (same reference when
 * unchanged) to avoid Zustand's "getSnapshot should be cached" infinite loop.
 * We return the array from state directly — never create a new [] inline.
 */
import { create } from 'zustand';
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type TransportOption = {
  id: string;
  tripId: string;
  title: string;
  kind: 'ride_hailing' | 'taxi' | 'shuttle' | 'rental_car' | 'public_transit';
  etaMinutes?: number;
  estimatedCost?: string;
  status?: 'available' | 'limited' | 'unavailable';
};

// Stable empty array — reused so Zustand doesn't see a new reference every render
const EMPTY: TransportOption[] = [];

type TransportState = {
  byTripId: Record<string, TransportOption[]>;
  startListener: (tripId: string) => void;
  stopListener: (tripId: string) => void;
};

const unsubByTrip: Record<string, Unsubscribe | undefined> = {};

export const useTransportStore = create<TransportState>((set) => ({
  byTripId: {},

  startListener: (tripId) => {
    // Prevent duplicate listeners
    if (unsubByTrip[tripId]) return;

    const db = getFirebaseFirestore();
    // NOTE: no orderBy — avoids needing a composite index and prevents the
    // "Property userId is undefined" emulator error caused by a missing index.
    const q = query(
      collection(db, 'transport_options'),
      where('tripId', '==', tripId),
    );

    unsubByTrip[tripId] = onSnapshot(
      q,
      (snap) => {
        const opts: TransportOption[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            tripId: data.tripId ?? tripId,
            title: data.title ?? 'Transport',
            kind: data.kind ?? 'ride_hailing',
            etaMinutes: typeof data.etaMinutes === 'number' ? data.etaMinutes : undefined,
            estimatedCost: typeof data.estimatedCost === 'string' ? data.estimatedCost : undefined,
            status: data.status ?? 'available',
          };
        });
        set((s) => ({ byTripId: { ...s.byTripId, [tripId]: opts } }));
      },
      (err) => {
        // Silently swallow — transport options are optional
        console.warn(`transportStore: ${tripId}`, err?.message ?? err);
      },
    );
  },

  stopListener: (tripId) => {
    unsubByTrip[tripId]?.();
    delete unsubByTrip[tripId];
    set((s) => {
      const next = { ...s.byTripId };
      delete next[tripId];
      return { byTripId: next };
    });
  },
}));

/**
 * Stable selector — returns the stored array or the shared EMPTY constant.
 * Using this avoids creating a new [] on every render which breaks Zustand's
 * getSnapshot caching and causes "Maximum update depth exceeded".
 */
export function selectTransportOpts(tripId: string | undefined) {
  return (s: TransportState) => (tripId ? s.byTripId[tripId] ?? EMPTY : EMPTY);
}
