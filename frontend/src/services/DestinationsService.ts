/**
 * DestinationsService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the Firestore `destinations` collection - metadata for destinations.
 * Each document contains static info like description, currency, language, etc.
 * Used by the recommendation engine to enrich AI-suggested destinations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface DestinationMetadata {
  name: string;
  country: string;
  countryCode: string;
  description: string;
  travelTips: string[];
  bestTimeToVisit: string;
  currency: string;
  language: string;
  timezone: string;
  topAttractions: string[];
  travelCategories: string[];
  estimatedBudget: {
    min: number;
    max: number;
    currency: string;
  } | null;
  lat: number;
  lng: number;
  updatedAt: Timestamp;
}

export interface DestinationDocument {
  id: string;
  data: DestinationMetadata;
}

/* ── Collection Reference ──────────────────────────────────────────────────── */

function destinationsCollectionRef() {
  return collection(getFirebaseFirestore(), 'destinations');
}

/* ── Public Methods ────────────────────────────────────────────────────────── */

/**
 * Fetch a single destination by its name (case-insensitive match).
 * Falls back to fetching all and filtering if indexed match fails.
 */
export async function getDestinationByName(
  name: string
): Promise<DestinationMetadata | null> {
  const db = getFirebaseFirestore();
  try {
    const q = query(
      collection(db, 'destinations'),
      where('name', '==', name),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as DestinationMetadata;
    }

    // Fallback: case-insensitive search
    const allSnap = await getDocs(collection(db, 'destinations'));
    const match = allSnap.docs.find(
      (d) => d.data().name?.toLowerCase() === name.toLowerCase()
    );
    if (match) return match.data() as DestinationMetadata;

    return null;
  } catch (err) {
    console.warn('[DestinationsService] getDestinationByName error:', err);
    return null;
  }
}

/**
 * Fetch all destinations from Firestore.
 */
export async function getAllDestinations(): Promise<DestinationMetadata[]> {
  try {
    const snap = await getDocs(destinationsCollectionRef());
    return snap.docs.map((d) => d.data() as DestinationMetadata);
  } catch (err) {
    console.warn('[DestinationsService] getAllDestinations error:', err);
    return [];
  }
}

/**
 * Fetch destinations matching specific travel categories.
 */
export async function getDestinationsByCategories(
  categories: string[]
): Promise<DestinationMetadata[]> {
  if (!categories.length) return getAllDestinations();

  try {
    const q = query(
      destinationsCollectionRef(),
      where('travelCategories', 'array-contains-any', categories)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as DestinationMetadata);
  } catch (err) {
    console.warn('[DestinationsService] getDestinationsByCategories error:', err);
    // Fallback to all destinations
    return getAllDestinations();
  }
}

/**
 * Bulk seed destinations into Firestore.
 * Useful for initial setup via admin tooling.
 */
export async function seedDestinations(
  destinations: DestinationMetadata[]
): Promise<void> {
  const db = getFirebaseFirestore();
  const batch = destinations.map((dest) => {
    const ref = doc(db, 'destinations', `${dest.countryCode}_${dest.name.replace(/\s+/g, '_')}`);
    return setDoc(ref, { ...dest, updatedAt: Timestamp.now() });
  });
  await Promise.all(batch);
}