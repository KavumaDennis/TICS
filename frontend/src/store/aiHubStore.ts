/**
 * aiHubStore — lightweight Zustand store for AI Hub visibility.
 *
 * AIHubTab writes to this store, AIHubBottomSheet reads from it.
 * Ensures both components share the same visibility state.
 */

import { create } from 'zustand';

interface AIHubStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useAIHubStore = create<AIHubStore>((set) => ({
  open: false,
  setOpen: (open: boolean) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));