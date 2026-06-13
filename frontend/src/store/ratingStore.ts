/**
 * ratingStore.ts
 * Manages app rating state: user's own rating + global aggregate.
 * User rating: users/{uid}/ratings/app_rating
 * Global aggregate: app_ratings/aggregate
 */
import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { submitAppRating as callSubmitRating } from '@/src/firebase/callables';

export type RatingState = {
  userStars: number | null;       // 1–5 or null if not yet rated
  userFeedback: string | null;
  averageRating: number | null;   // Global average
  totalRatings: number;
  submitting: boolean;
  error: string | null;
  /** Load the user's existing rating and global stats */
  loadRatings: (uid: string) => Promise<void>;
  /** Submit or update rating */
  submitRating: (stars: number, feedback?: string) => Promise<void>;
};

export const useRatingStore = create<RatingState>((set, get) => ({
  userStars: null,
  userFeedback: null,
  averageRating: null,
  totalRatings: 0,
  submitting: false,
  error: null,

  loadRatings: async (uid) => {
    try {
      const db = getFirebaseFirestore();
      const [userRatingSnap, aggSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid, 'ratings', 'app_rating')),
        getDoc(doc(db, 'app_ratings', 'aggregate')),
      ]);

      const userRating = userRatingSnap.exists() ? userRatingSnap.data() : null;
      const agg = aggSnap.exists() ? aggSnap.data() : null;

      set({
        userStars: userRating?.stars ?? null,
        userFeedback: userRating?.feedback ?? null,
        averageRating: agg?.averageRating ?? null,
        totalRatings: agg?.totalRatings ?? 0,
      });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load ratings.' });
    }
  },

  submitRating: async (stars, feedback) => {
    set({ submitting: true, error: null });
    try {
      await callSubmitRating(stars, feedback);
      set({ userStars: stars, userFeedback: feedback ?? null, submitting: false });
      // Reload aggregate stats after submission so the global average updates
      const db = getFirebaseFirestore();
      const aggSnap = await getDoc(doc(db, 'app_ratings', 'aggregate'));
      if (aggSnap.exists()) {
        const agg = aggSnap.data();
        set({ averageRating: agg?.averageRating ?? null, totalRatings: agg?.totalRatings ?? 0 });
      }
    } catch (e: any) {
      set({ submitting: false, error: e?.message ?? 'Failed to submit rating.' });
      throw e;
    }
  },
}));
