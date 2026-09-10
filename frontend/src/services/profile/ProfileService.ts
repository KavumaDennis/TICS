/**
 * ProfileService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates all profile data by combining Firestore documents with
 * computed statistics and explorer level info.
 * The Profile Screen should never perform calculations directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { ExplorerLevelService, type ExplorerLevelInfo } from './ExplorerLevelService';
import { TravelStatsService, type TravelStats } from './TravelStatsService';
import type { Trip } from '@/src/store/tripStore';

export interface ProfileData {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  totalXP: number;
  explorerLevel: ExplorerLevelInfo;
  levelTitle: string;
  travelStats: TravelStats;
  preferences?: Record<string, any>;
}

export const ProfileService = {
  /**
   * Load full profile data for a user from Firestore + computed stats.
   */
  async loadProfile(uid: string, trips?: Trip[]): Promise<ProfileData> {
    const db = getFirebaseFirestore();
    const userSnap = await getDoc(doc(db, 'users', uid));

    if (!userSnap.exists()) {
      throw new Error('User document not found');
    }

    const userData = userSnap.data();
    const totalXP = userData?.totalXP ?? 0;

    // Compute explorer level from XP
    const explorerLevel = ExplorerLevelService.calculate(totalXP);
    const levelTitle = ExplorerLevelService.getLevelTitle(explorerLevel.level);

    // Compute travel stats
    let travelStats: TravelStats;
    if (trips) {
      // Use provided trips (from store) to avoid extra reads
      const savedSnap = await getDocs(
        collection(db, 'users', uid, 'saved'),
      );
      travelStats = TravelStatsService.computeStatsFromTrips(trips, savedSnap.size);
    } else {
      travelStats = await TravelStatsService.computeStats(uid);
    }

    return {
      uid,
      displayName: userData?.name ?? userData?.displayName ?? 'Explorer',
      email: userData?.email ?? '',
      photoURL: userData?.photoURL ?? null,
      totalXP,
      explorerLevel,
      levelTitle,
      travelStats,
      preferences: userData?.preferences ?? {},
    };
  },

  /**
   * Get just the XP and level info for a user (lightweight).
   */
  async loadLevelInfo(uid: string): Promise<{
    totalXP: number;
    explorerLevel: ExplorerLevelInfo;
    levelTitle: string;
  }> {
    const db = getFirebaseFirestore();
    const userSnap = await getDoc(doc(db, 'users', uid));

    const totalXP = userSnap.exists() ? (userSnap.data()?.totalXP ?? 0) : 0;
    const explorerLevel = ExplorerLevelService.calculate(totalXP);
    const levelTitle = ExplorerLevelService.getLevelTitle(explorerLevel.level);

    return { totalXP, explorerLevel, levelTitle };
  },
};

export default ProfileService;