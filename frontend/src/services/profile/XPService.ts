/**
 * XPService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages XP rewards for travel actions and updates totalXP in Firestore.
 * XP is the only persistent value — levels are derived by ExplorerLevelService.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/**
 * XP reward values for each travel action.
 */
export const XP_REWARDS = {
  COMPLETE_TRIP: 500,
  COMPLETE_LOCAL_TRIP: 100,
  COMPLETE_REGIONAL_TRIP: 250,
  COMPLETE_INTERNATIONAL_TRIP: 500,
  VISIT_NEW_COUNTRY: 300,
  SAVE_DESTINATION: 20,
  COORDINATE_JOURNEY: 25,
  USE_AI_PLANNER: 40,
  IMPORT_BOOKING: 75,
  LEAVE_REVIEW: 50,
  UPLOAD_PHOTOS: 30,
  TRAVEL_STREAK_DAILY: 10,
} as const;

/** Maximum daily XP from streak bonus to prevent abuse */
export const MAX_DAILY_STREAK_XP = 100;

/** Set of countries the user has already visited (for new country bonus) */
const visitedCountriesCache = new Map<string, Set<string>>();

export const XPService = {
  /**
   * Award XP to a user and update their totalXP in Firestore.
   * Uses a transaction to ensure atomic updates.
   */
  async awardXP(uid: string, amount: number, reason: string): Promise<number> {
    const db = getFirebaseFirestore();
    const userRef = doc(db, 'users', uid);

    let newTotal = 0;
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User document not found');

      const currentXP = userSnap.data()?.totalXP ?? 0;
      newTotal = currentXP + amount;

      transaction.update(userRef, {
        totalXP: newTotal,
        updatedAt: serverTimestamp(),
        lastXpReason: reason,
        lastXpAwarded: amount,
      });
    });

    console.log(`[XPService] Awarded +${amount} XP to ${uid} for "${reason}". Total: ${newTotal}`);
    return newTotal;
  },

  /**
   * Award XP for completing a trip, classified by type.
   */
  async awardTripCompletionXP(uid: string, tripType: 'LOCAL' | 'REGIONAL' | 'INTERNATIONAL'): Promise<number> {
    let amount: number;
    let reason: string;

    switch (tripType) {
      case 'LOCAL':
        amount = XP_REWARDS.COMPLETE_LOCAL_TRIP;
        reason = 'Completed local trip';
        break;
      case 'REGIONAL':
        amount = XP_REWARDS.COMPLETE_REGIONAL_TRIP;
        reason = 'Completed regional trip';
        break;
      case 'INTERNATIONAL':
        amount = XP_REWARDS.COMPLETE_INTERNATIONAL_TRIP;
        reason = 'Completed international trip';
        break;
      default:
        amount = XP_REWARDS.COMPLETE_TRIP;
        reason = 'Completed trip';
    }

    return this.awardXP(uid, amount, reason);
  },

  /**
   * Award XP for visiting a new country (only once per country).
   */
  async awardNewCountryXP(uid: string, countryCode: string): Promise<number | null> {
    // Check cache first
    const userVisited = visitedCountriesCache.get(uid);
    if (userVisited?.has(countryCode)) return null;

    // Check Firestore for past visits
    const db = getFirebaseFirestore();
    const userRef = doc(db, 'users', uid);

    let shouldAward = false;
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) return;

      const visitedCountries: string[] = userSnap.data()?.visitedCountries ?? [];
      if (!visitedCountries.includes(countryCode)) {
        shouldAward = true;
        const updated = [...visitedCountries, countryCode];
        transaction.update(userRef, {
          visitedCountries: updated,
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (!shouldAward) return null;

    // Update cache
    if (!visitedCountriesCache.has(uid)) {
      visitedCountriesCache.set(uid, new Set());
    }
    visitedCountriesCache.get(uid)!.add(countryCode);

    return this.awardXP(uid, XP_REWARDS.VISIT_NEW_COUNTRY, `Visited new country: ${countryCode}`);
  },

  /**
   * Award XP for saving a destination.
   */
  async awardSaveDestinationXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.SAVE_DESTINATION, 'Saved a destination');
  },

  /**
   * Award XP for coordinating a journey.
   */
  async awardCoordinateJourneyXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.COORDINATE_JOURNEY, 'Coordinated a journey');
  },

  /**
   * Award XP for using the AI Planner.
   */
  async awardAIPlannerXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.USE_AI_PLANNER, 'Used AI Planner');
  },

  /**
   * Award XP for importing a booking.
   */
  async awardImportBookingXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.IMPORT_BOOKING, 'Imported a booking');
  },

  /**
   * Award XP for leaving a review.
   */
  async awardReviewXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.LEAVE_REVIEW, 'Left a review');
  },

  /**
   * Award XP for uploading travel photos.
   */
  async awardUploadPhotosXP(uid: string): Promise<number> {
    return this.awardXP(uid, XP_REWARDS.UPLOAD_PHOTOS, 'Uploaded travel photos');
  },

  /**
   * Award XP for daily travel streak, capped to prevent abuse.
   */
  async awardStreakXP(uid: string, streakDays: number): Promise<number> {
    const amount = Math.min(
      streakDays * XP_REWARDS.TRAVEL_STREAK_DAILY,
      MAX_DAILY_STREAK_XP,
    );
    return this.awardXP(uid, amount, `Travel streak (${streakDays} days)`);
  },

  /**
   * Clear the visited countries cache for a user (for testing/reset).
   */
  clearVisitedCountriesCache(uid: string): void {
    visitedCountriesCache.delete(uid);
  },
};

export default XPService;