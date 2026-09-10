import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../lib/firebase';
import type { OperatorUser } from '../types';
interface AuthState {
  user: any;
  operator: OperatorUser | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, lodgeName?: string, country?: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  operator: null,
  loading: true,
  error: null,
  initialized: false,
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const auth = getFirebaseAuth();
      const result = await signInWithEmailAndPassword(auth, email, password);
      const db = getFirebaseFirestore();
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) throw new Error('Operator account not found');
      const data = userDoc.data() as OperatorUser;
      if (data.role !== 'operator' && data.role !== 'admin')
        throw new Error('Access denied: operator role required');
      set({ user: result.user, operator: { ...data, uid: result.user.uid }, loading: false });
    } catch (err: any) {
      const message = err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential'
        ? 'Invalid email or password' : err.message || 'Login failed';
      set({ error: message, loading: false });
      throw new Error(message);
    }
  },
  register: async (email, password, name, lodgeName, country) => {
    set({ loading: true, error: null });
    try {
      const auth = getFirebaseAuth();
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const db = getFirebaseFirestore();
      const userData: OperatorUser = {
        name, email, role: 'operator',
        lodgeName: lodgeName || '', country: country || '', createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', result.user.uid), userData);
      set({ user: result.user, operator: { ...userData, uid: result.user.uid }, loading: false });
    } catch (err: any) {
      const message = err.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists' : err.message || 'Registration failed';
      set({ error: message, loading: false });
      throw new Error(message);
    }
  },
  logout: async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
    set({ user: null, operator: null });
  },
  checkAuth: async () => {
    const auth = getFirebaseAuth();
    return new Promise<void>((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const db = getFirebaseFirestore();
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              const data = userDoc.data() as OperatorUser;
              if (data.role === 'operator' || data.role === 'admin') {
                set({ user, operator: { ...data, uid: user.uid }, loading: false, initialized: true });
              } else { set({ user: null, operator: null, loading: false, initialized: true }); }
            } else { set({ user: null, operator: null, loading: false, initialized: true }); }
          } catch { set({ user: null, operator: null, loading: false, initialized: true }); }
        } else { set({ user: null, operator: null, loading: false, initialized: true }); }
        resolve();
      });
    });
  },
  clearError: () => set({ error: null }),
}));

