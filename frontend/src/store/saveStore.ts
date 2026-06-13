/**
 * saveStore.ts
 * Manages persisted "save for later" items scoped to the current user.
 * Items are stored under users/{uid}/saved/{savedId} in Firestore.
 */
import { create } from 'zustand';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { saveItem as callSaveItem } from '@/src/firebase/callables';

export type SavedItem = {
  savedId: string;
  uid: string;
  itemId: string;
  itemType: 'alert' | 'recommendation' | 'insight';
  tripId: string;
  data: Record<string, unknown>;
  tags: string[];
  savedAt?: any;
};

type SaveState = {
  items: SavedItem[];
  loading: boolean;
  error: string | null;
  /** Start real-time listener for saved items */
  startListener: (uid: string) => void;
  stopListener: () => void;
  /** Save an item — calls Firebase function and updates local state optimistically */
  save: (input: {
    itemId: string;
    itemType: SavedItem['itemType'];
    tripId: string;
    data: Record<string, unknown>;
  }) => Promise<void>;
  /** Check if an item is already saved */
  isSaved: (itemId: string) => boolean;
};

let unsub: Unsubscribe | null = null;

export const useSaveStore = create<SaveState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  startListener: (uid) => {
    get().stopListener();
    set({ loading: true, error: null });

    const db = getFirebaseFirestore();
    const q = query(
      collection(db, 'users', uid, 'saved'),
      orderBy('savedAt', 'desc'),
    );

    unsub = onSnapshot(
      q,
      (snap) => {
        const items: SavedItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            savedId: d.id,
            uid: data.uid ?? uid,
            itemId: data.itemId ?? '',
            itemType: data.itemType ?? 'recommendation',
            tripId: data.tripId ?? '',
            data: data.data ?? {},
            tags: Array.isArray(data.tags) ? data.tags : [],
            savedAt: data.savedAt,
          };
        });
        set({ items, loading: false });
      },
      (err) => set({ loading: false, error: err.message }),
    );
  },

  stopListener: () => {
    unsub?.();
    unsub = null;
    set({ items: [], loading: false, error: null });
  },

  save: async ({ itemId, itemType, tripId, data }) => {
    try {
      await callSaveItem({ itemId, itemType, tripId, data });
      // Firestore listener will update the list automatically
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to save item.' });
      throw e;
    }
  },

  isSaved: (itemId) => get().items.some((i) => i.itemId === itemId),
}));
