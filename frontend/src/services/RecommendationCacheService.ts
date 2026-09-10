/**
 * RecommendationCacheService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages caching of personalized recommendations in Firestore.
 * Cache is stored under `users/{uid}/recommendationCache/{cacheId}`.
 * Refresh triggers: location change > 500km, trip change, preference update,
 * cache age > 24 hours.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  doc,
  getDoc,
  getDocs,
  query,
  collection,
  setDoc,
  deleteDoc,
  Timestamp,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import type { ScoredDestination, UserTravelContext } from '@/src/services/RecommendationEngine';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface RecommendationCacheEntry {
  userId: string;
  contextHash: string;
  recommendations: ScoredDestination[];
  userContext: UserTravelContext;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  ttlHours: number;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const CACHE_TTL_HOURS = 24;
const CACHE_TTL_MS = CACHE_TTL_HOURS * 60 * 60 * 1000;
const LOCATION_CHANGE_THRESHOLD_KM = 500;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/**
 * Create a deterministic hash from the user context to detect changes.
 */
function hashContext(context: UserTravelContext): string {
  const relevant = {
    uid: context.uid,
    country: context.country,
    travelPreferences: context.travelPreferences?.sort(),
    interests: context.interests?.sort(),
    savedDestinations: context.savedDestinations?.sort(),
    budget: context.budget,
    favoriteTravelStyles: context.favoriteTravelStyles?.sort(),
    activeTrip: context.activeTrip?.destination
      ? { destination: context.activeTrip.destination }
      : null,
    previousTripPatterns: context.previousTripPatterns
      ? {
          frequentCategories: context.previousTripPatterns.frequentCategories?.sort(),
          frequentRegions: context.previousTripPatterns.frequentRegions?.sort(),
          travelStyle: context.previousTripPatterns.travelStyle,
        }
      : null,
    currentLat: context.currentLat ? Math.round(context.currentLat * 10) : undefined,
    currentLng: context.currentLng ? Math.round(context.currentLng * 10) : undefined,
  };
  // Simple hash based on JSON string
  let hash = 0;
  const str = JSON.stringify(relevant);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Determine if the location has changed significantly.
 */
function hasLocationChanged(
  oldContext: UserTravelContext,
  newContext: UserTravelContext
): boolean {
  if (!oldContext.currentLat || !oldContext.currentLng) return false;
  if (!newContext.currentLat || !newContext.currentLng) return true;

  const R = 6371;
  const dLat = ((newContext.currentLat - oldContext.currentLat) * Math.PI) / 180;
  const dLng = ((newContext.currentLng - oldContext.currentLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((oldContext.currentLat * Math.PI) / 180) *
      Math.cos((newContext.currentLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance > LOCATION_CHANGE_THRESHOLD_KM;
}

/* ── Public API ────────────────────────────────────────────────────────────── */

/**
 * Try to load cached recommendations for a user.
 * Returns null if cache is expired, context changed, or doesn't exist.
 */
export async function getCachedRecommendations(
  userId: string,
  currentContext: UserTravelContext
): Promise<{
  recommendations: ScoredDestination[];
  context: UserTravelContext;
} | null> {
  try {
    const db = getFirebaseFirestore();
    const cacheRef = collection(db, 'users', userId, 'recommendationCache');
    const q = query(cacheRef, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const data = snap.docs[0].data() as RecommendationCacheEntry;

    // Check expiry
    const age = Date.now() - data.createdAt.toMillis();
    if (age > CACHE_TTL_MS) {
      // Cache expired - delete it
      await deleteDoc(snap.docs[0].ref);
      return null;
    }

    const oldContext = data.userContext;

    // Check location change
    if (hasLocationChanged(oldContext, currentContext)) {
      await deleteDoc(snap.docs[0].ref);
      return null;
    }

    // Check context hash
    const oldHash = data.contextHash;
    const newHash = hashContext(currentContext);
    if (oldHash !== newHash) {
      // Context changed (preferences, trips, etc.)
      await deleteDoc(snap.docs[0].ref);
      return null;
    }

    return {
      recommendations: data.recommendations,
      context: data.userContext,
    };
  } catch (err) {
    console.warn('[RecommendationCache] getCached error:', err);
    return null;
  }
}

/**
 * Save recommendations to the cache.
 */
export async function cacheRecommendations(
  userId: string,
  recommendations: ScoredDestination[],
  userContext: UserTravelContext
): Promise<void> {
  try {
    const db = getFirebaseFirestore();
    const cacheRef = doc(collection(db, 'users', userId, 'recommendationCache'));

    const entry: RecommendationCacheEntry = {
      userId,
      contextHash: hashContext(userContext),
      recommendations,
      userContext,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      ttlHours: CACHE_TTL_HOURS,
    };

    await setDoc(cacheRef, entry);

    // Clean up old cache entries (keep only last 3)
    await cleanupOldCache(userId);
  } catch (err) {
    console.warn('[RecommendationCache] cache error:', err);
  }
}

/**
 * Invalidate all cached recommendations for a user.
 * Called when preferences change significantly.
 */
export async function invalidateRecommendationCache(
  userId: string
): Promise<void> {
  try {
    const db = getFirebaseFirestore();
    const cacheRef = collection(db, 'users', userId, 'recommendationCache');
    const snap = await getDocs(cacheRef);

    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('[RecommendationCache] invalidate error:', err);
  }
}

/**
 * Remove old cache entries, keeping only the most recent.
 */
async function cleanupOldCache(userId: string): Promise<void> {
  try {
    const db = getFirebaseFirestore();
    const cacheRef = collection(db, 'users', userId, 'recommendationCache');
    const q = query(cacheRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.docs.length > 3) {
      const deletePromises = snap.docs.slice(3).map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
  } catch {
    // Non-critical cleanup, ignore errors
  }
}