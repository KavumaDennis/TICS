import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { Platform } from 'react-native';

const ONBOARDING_KEY = 'tics_onboarding_completed_v1';

/* =========================
   STORAGE LAYER
========================= */

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {}
    return;
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return;
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {}
    return;
  }

  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return;
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

/* =========================
   STATE
========================= */

type AppState = {
  hydrated: boolean;
  booting: boolean;
  onboardingCompleted: boolean;

  hydrate: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  booting: false,
  onboardingCompleted: false,

  /* =========================
     APP HYDRATION FLOW
  ========================= */

  hydrate: async () => {
    if (get().booting) return;

    set({ booting: true });

    try {
      const value = await storageGet(ONBOARDING_KEY);

      set({
        onboardingCompleted: value === '1',
      });
    } finally {
      set({
        hydrated: true,
        booting: false,
      });
    }
  },

  /* =========================
     ONBOARDING ACTIONS
  ========================= */

  completeOnboarding: async () => {
    await storageSet(ONBOARDING_KEY, '1');

    set({
      onboardingCompleted: true,
    });
  },

  resetOnboarding: async () => {
    await storageDelete(ONBOARDING_KEY);

    set({
      onboardingCompleted: false,
    });
  },
}));