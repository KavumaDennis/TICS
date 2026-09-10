/**
 * useSavedPlaces.ts
 * Hook for managing saved places with optimistic UI updates.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services';
import type { Destination } from '@/src/modules/explore/types';

interface UseSavedPlacesReturn {
  savedIds: Set<string>;
  isSaved: (id: string) => boolean;
  toggleSave: (destination: Destination) => Promise<boolean>;
  save: (destination: Destination) => Promise<boolean>;
  unsave: (id: string) => Promise<boolean>;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSavedPlaces(): UseSavedPlacesReturn {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((s: any) => s.user);
  const userId = user?.uid ?? '';

  const refresh = useCallback(async () => {
    if (!userId) {
      setSavedIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { collection, getDocs, query, where } = await import('firebase/firestore');
      const { getFirebaseFirestore } = await import('@/src/firebase/firebaseApp');
      const db = getFirebaseFirestore();
      const q = query(collection(db, 'savedPlaces'), where('userId', '==', userId));
      const snap = await getDocs(q);
      const ids = snap.docs.map((d) => d.data().destinationId).filter(Boolean);
      setSavedIds(new Set(ids));
    } catch (err) {
      console.error('[useSavedPlaces] Error loading saved places:', err);
      setSavedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);

  const save = useCallback(async (destination: Destination): Promise<boolean> => {
    if (!userId) return false;
    setSavedIds((prev) => { const n = new Set(prev); n.add(destination.id); return n; });
    const success = await ExploreService.saveDestination(userId, destination.id, destination);
    if (!success) {
      setSavedIds((prev) => { const n = new Set(prev); n.delete(destination.id); return n; });
    }
    return success;
  }, [userId]);

  const unsave = useCallback(async (id: string): Promise<boolean> => {
    if (!userId) return false;
    setSavedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    const success = await ExploreService.unsaveDestination(userId, id);
    if (!success) {
      setSavedIds((prev) => { const n = new Set(prev); n.add(id); return n; });
    }
    return success;
  }, [userId]);

  const toggleSave = useCallback(async (destination: Destination): Promise<boolean> => {
    if (savedIds.has(destination.id)) return unsave(destination.id);
    return save(destination);
  }, [savedIds, save, unsave]);

  return { savedIds, isSaved, toggleSave, save, unsave, loading, refresh };
}