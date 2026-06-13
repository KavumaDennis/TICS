/**
 * recommendationStore.ts
 * Trip-scoped real-time recommendations from Firestore.
 * Keyed by tripId — switching trips = instant data swap.
 */
import { create } from 'zustand';
import {
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { recommendationsCollection } from '@/src/firebase/collections';

export type RecommendationOption = {
  label?: string;
  flight?: string;
  departs?: string;
  arrives?: string;
  price?: string;
};

export type Recommendation = {
  id: string;
  userId: string;
  tripId: string;
  title: string;
  message: string;
  details?: string;        // Expanded detail text shown on detail screen
  kind:
    | 'action'
    | 'smart_tip'
    | 'alternative_route'
    | 'alternative_flight'
    | 'transport'
    | 'weather_advisory'
    | 'time_optimization';
  category?: string;
  urgency?: 'high' | 'medium' | 'low';
  confidenceScore?: number;  // 0–1
  actionText?: string;       // CTA button label
  actionRoute?: string;      // Deep-link target
  options?: RecommendationOption[];
  priceDifference?: string;
  timeDifference?: string;
  expiresAt?: string;
  createdAt?: any;
};

type RecommendationState = {
  byTripId: Record<string, Recommendation[]>;
  loading: boolean;
  error: string | null;
  startRecommendationsListener: (userId: string, tripId: string) => void;
  stopRecommendationsListener: (tripId: string) => void;
};

const unsubByTrip: Record<string, Unsubscribe | undefined> = {};

const VALID_KINDS = new Set([
  'action', 'smart_tip', 'alternative_route', 'alternative_flight',
  'transport', 'weather_advisory', 'time_optimization',
]);

function mapRec(d: any): Recommendation {
  const data: any = d.data ? d.data() : d;
  const id = d.id ?? data.id;
  const kindRaw = typeof data.kind === 'string' ? data.kind : 'action';
  const kind = VALID_KINDS.has(kindRaw) ? kindRaw : 'action';

  return {
    id,
    userId: data.userId ?? '',
    tripId: data.tripId ?? '',
    title: data.title ?? '',
    message: data.message ?? '',
    details: typeof data.details === 'string' ? data.details : undefined,
    kind: kind as Recommendation['kind'],
    category: typeof data.category === 'string' ? data.category : undefined,
    urgency: ['high', 'medium', 'low'].includes(data.urgency) ? data.urgency : undefined,
    confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : undefined,
    actionText: typeof data.actionText === 'string' ? data.actionText : undefined,
    actionRoute: typeof data.actionRoute === 'string' ? data.actionRoute : undefined,
    options: Array.isArray(data.options) ? data.options : undefined,
    priceDifference: typeof data.priceDifference === 'string' ? data.priceDifference : undefined,
    timeDifference: typeof data.timeDifference === 'string' ? data.timeDifference : undefined,
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : undefined,
    createdAt: data.createdAt,
  };
}

export const useRecommendationStore = create<RecommendationState>((set, get) => ({
  byTripId: {},
  loading: false,
  error: null,

  startRecommendationsListener: (userId, tripId) => {
    // Already listening for this trip
    if (unsubByTrip[tripId]) return;

    set({ loading: true, error: null });

    const q = query(
      recommendationsCollection(),
      where('userId', '==', userId),
      where('tripId', '==', tripId),
      orderBy('createdAt', 'desc'),
    );

    unsubByTrip[tripId] = onSnapshot(
      q,
      (snap) => {
        const recs = snap.docs.map(mapRec);
        set((state) => ({
          loading: false,
          byTripId: { ...state.byTripId, [tripId]: recs },
        }));
      },
      (err) => {
        console.warn(`recommendationStore: listener error for ${tripId}`, err);
        set({ loading: false, error: err?.message ?? 'Failed to load recommendations' });
      },
    );
  },

  stopRecommendationsListener: (tripId) => {
    const unsub = unsubByTrip[tripId];
    if (unsub) {
      delete unsubByTrip[tripId];
      try { unsub(); } catch { /* ignore */ }
    }
    set((state) => {
      const next = { ...state.byTripId };
      delete next[tripId];
      return { byTripId: next };
    });
  },
}));
