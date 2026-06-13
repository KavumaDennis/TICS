import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth';

import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { ensureUserDoc, registerPushToken } from '@/src/firebase/callables';
import { getFirebaseAuth, getFirebaseFirestore } from '@/src/firebase/firebaseApp';

export type AuthUser = {
  uid: string;
  email: string | null;
  name?: string | null;
  premium?: boolean;
};

type AuthState = {
  hydrated: boolean;
  loading: boolean;
  error: string | null;

  token: string | null;
  user: AuthUser | null;

  hydrate: () => Promise<void>;
  logout: () => Promise<void>;

  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  loginWithFirebaseCredential: (
    credential: any,
    fallbackEmail?: string | null,
    fallbackName?: string | null
  ) => Promise<boolean>;

  setDevicePushToken: (token: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  updateProfileName: (name: string) => Promise<boolean>;
};

function toAuthUser(u: User, extra?: Partial<AuthUser>): AuthUser {
  return {
    uid: u.uid,
    email: u.email,
    name: u.displayName ?? extra?.name ?? null,
    premium: extra?.premium ?? false,
  };
}

/**
 * Single-source Firestore user sync
 */
async function syncUserDoc(user: User, fallbackName?: string | null) {
  const db = getFirebaseFirestore();
  const ref = doc(db, 'users', user.uid);

  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;

  const payload = {
    email: user.email ?? existing?.email ?? 'unknown',
    name: user.displayName ?? fallbackName ?? existing?.name ?? null,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, payload, { merge: true });
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  let authUnsub: (() => void) | null = null;

  return {
    hydrated: false,
    loading: false,
    error: null,

    token: null,
    user: null,

    hydrate: async () => {
      const auth = getFirebaseAuth();
      const db = getFirebaseFirestore();

      return new Promise<void>((resolve) => {
        if (authUnsub) authUnsub();

        authUnsub = onAuthStateChanged(auth, async (u) => {
          if (!u) {
            set({ token: null, user: null, hydrated: true });
            return resolve();
          }

          try {
            const snap = await getDoc(doc(db, 'users', u.uid));
            const data = snap.data();

            set({
              token: u.uid,
              user: toAuthUser(u, {
                name: data?.name ?? u.displayName,
                premium: Boolean(data?.premium),
              }),
            });

            await ensureUserDoc();
          } catch {
            set({
              token: u.uid,
              user: toAuthUser(u),
            });
          } finally {
            set({ hydrated: true });
            resolve();
          }
        });
      });
    },

    login: async (email, password) => {
      set({ loading: true, error: null });

      try {
        const auth = getFirebaseAuth();
        const { user } = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        await syncUserDoc(user, email.trim());
        await ensureUserDoc();

        set({
          token: user.uid,
          user: toAuthUser(user),
          loading: false,
        });

        return true;
      } catch (e: any) {
        set({ loading: false, error: e?.message ?? 'Login failed' });
        return false;
      }
    },

    register: async (email, password, name) => {
      set({ loading: true, error: null });

      try {
        const auth = getFirebaseAuth();
        const { user } = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        await syncUserDoc(user, name?.trim() ?? null);
        await ensureUserDoc();

        set({
          token: user.uid,
          user: toAuthUser(user, { name: name?.trim() ?? null }),
          loading: false,
        });

        return true;
      } catch (e: any) {
        set({ loading: false, error: e?.message ?? 'Registration failed' });
        return false;
      }
    },

    loginWithFirebaseCredential: async (
      credential,
      fallbackEmail,
      fallbackName
    ) => {
      set({ loading: true, error: null });

      try {
        const auth = getFirebaseAuth();
        const { user } = await signInWithCredential(auth, credential);

        await syncUserDoc(user, fallbackName ?? null);
        await ensureUserDoc();

        set({
          token: user.uid,
          user: toAuthUser(user),
          loading: false,
        });

        return true;
      } catch (e: any) {
        set({ loading: false, error: e?.message ?? 'Login failed' });
        return false;
      }
    },

    logout: async () => {
      set({ loading: true });

      try {
        await signOut(getFirebaseAuth());
      } finally {
        set({
          token: null,
          user: null,
          loading: false,
        });
      }
    },

    setDevicePushToken: async (token) => {
      const uid = get().token;
      if (!uid) return;

      try {
        await registerPushToken(token);
      } catch {
        const db = getFirebaseFirestore();
        await updateDoc(doc(db, 'users', uid), {
          devicePushTokens: arrayUnion(token),
          updatedAt: serverTimestamp(),
        });
      }
    },

    refreshUserProfile: async () => {
      const uid = get().token;
      const user = get().user;
      if (!uid || !user) return;

      const db = getFirebaseFirestore();

      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = snap.data();

        set({
          user: {
            ...user,
            name: data?.name ?? user.name,
            premium: Boolean(data?.premium),
          },
        });
      } catch {
        // ignore offline
      }
    },

    updateProfileName: async (name) => {
      const uid = get().token;
      const user = get().user;
      if (!uid || !user) return false;

      try {
        const db = getFirebaseFirestore();

        await updateDoc(doc(db, 'users', uid), {
          name: name.trim(),
          updatedAt: serverTimestamp(),
        });

        set({
          user: { ...user, name: name.trim() },
        });

        return true;
      } catch {
        set({ error: 'Could not update profile.' });
        return false;
      }
    },
  };
});