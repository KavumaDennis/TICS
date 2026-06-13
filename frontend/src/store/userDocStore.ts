import { create } from 'zustand';
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type UserDoc = {
  uid: string;
  email?: string;
  name?: string | null;
  travel_behavior?: {
    rating?: number;
    flights?: number;
    trips?: number;
  };
  updatedAt?: any;
};

type UserDocState = {
  uid: string | null;
  doc: UserDoc | null;
  loading: boolean;
  error: string | null;
  startUserDocListener: (uid: string) => void;
  stopUserDocListener: () => void;
};

let unsub: Unsubscribe | null = null;

export const useUserDocStore = create<UserDocState>((set, get) => ({
  uid: null,
  doc: null,
  loading: false,
  error: null,

  startUserDocListener: (uid) => {
    get().stopUserDocListener();

    set({
      uid,
      doc: null,
      loading: true,
      error: null,
    });

    const db = getFirebaseFirestore();

    unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) {
          set({
            loading: false,
            doc: null,
          });
          return;
        }

        const data = snap.data() as Omit<UserDoc, 'uid'>;

        set({
          loading: false,
          doc: {
            uid,
            ...data,
          },
        });
      },
      (err) => {
        set({
          loading: false,
          error: err?.message ?? 'Failed to load profile.',
        });
      }
    );
  },

  stopUserDocListener: () => {
    unsub?.();
    unsub = null;

    set({
      uid: null,
      doc: null,
      loading: false,
      error: null,
    });
  },
}));