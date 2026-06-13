import { create } from 'zustand';

type PushTokenState = {
  devicePushTokens: string[];
  setToken: (token: string) => void;
  removeToken: (token: string) => void;
  clear: () => void;
};

export const usePushTokenStore = create<PushTokenState>((set) => ({
  devicePushTokens: [],

  setToken: (token) =>
    set((state) => ({
      devicePushTokens: Array.from(new Set([...state.devicePushTokens, token])),
    })),

  removeToken: (token) =>
    set((state) => ({
      devicePushTokens: state.devicePushTokens.filter((t) => t !== token),
    })),

  clear: () => set({ devicePushTokens: [] }),
}));