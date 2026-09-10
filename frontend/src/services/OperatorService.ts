/**
 * OperatorService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the Traveler ↔ Operator relationship. Travelers select a tour
 * operator who becomes responsible for managing their rides during the trip.
 * Only the selected operator can assign drivers for that traveler.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import type { OperatorDoc, TravelerOperatorDoc } from '@/src/firebase/lastMileTypes';
import { notifyOperatorNewTraveler } from './NotificationService';

/* ── Fetch all available operators ────────────────────────────────────────── */

export async function fetchOperators(): Promise<(OperatorDoc & { id: string })[]> {
  const db = getFirebaseFirestore();
  // Operators are stored in the 'users' collection with role == 'operator'
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'operator'),
    limit(50),
  );
  const snap = await getDocs(q);
  const operators = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (OperatorDoc & { id: string })[];

  // Filter to only active operators (or those without active field for backward compatibility)
  return operators.filter((op) => op.active !== false);
}

/* ── Select an operator for a trip ────────────────────────────────────────── */

export async function selectOperator(
  travelerId: string,
  operatorId: string,
  operatorName: string,
  operatorPhone: string | undefined,
  operatorLogo: string | undefined,
  tripId: string,
  travelerName?: string,
): Promise<string> {
  const db = getFirebaseFirestore();

  // Deactivate any previous active operator for this traveler+trip
  const prevQ = query(
    collection(db, 'travelerOperators'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    where('active', '==', true),
  );
  const prevSnap = await getDocs(prevQ);
  await Promise.all(
    prevSnap.docs.map((d) =>
      updateDoc(doc(db, 'travelerOperators', d.id), { active: false, updatedAt: serverTimestamp() }),
    ),
  );

  // Create new relationship
  const ref = doc(collection(db, 'travelerOperators'));
  await setDoc(ref, {
    travelerId,
    operatorId,
    operatorName,
    operatorPhone: operatorPhone || '',
    operatorLogo: operatorLogo || '',
    travelerName: travelerName || null,
    tripId,
    assignedAt: serverTimestamp(),
    active: true,
    updatedAt: serverTimestamp(),
  });

  // Notify the operator
  const displayName = travelerName || travelerId;
  await notifyOperatorNewTraveler(operatorId, displayName, tripId).catch(() => {});

  return ref.id;
}

/* ── Get the active operator for a traveler's trip ────────────────────────── */

export async function getActiveOperator(
  travelerId: string,
  tripId: string,
): Promise<(TravelerOperatorDoc & { id: string }) | null> {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'travelerOperators'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    where('active', '==', true),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as TravelerOperatorDoc & { id: string };
}

/* ── Listen to active operator changes in real time ───────────────────────── */

export function listenToActiveOperator(
  travelerId: string,
  tripId: string,
  onData: (operator: (TravelerOperatorDoc & { id: string }) | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'travelerOperators'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    where('active', '==', true),
    limit(1),
  );

  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(null);
        return;
      }
      const d = snap.docs[0];
      onData({ id: d.id, ...d.data() } as TravelerOperatorDoc & { id: string });
    },
    (err) => {
      console.warn('[OperatorService] listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Get all travelers assigned to an operator ────────────────────────────── */

export async function getOperatorTravelers(
  operatorId: string,
): Promise<(TravelerOperatorDoc & { id: string })[]> {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'travelerOperators'),
    where('operatorId', '==', operatorId),
    where('active', '==', true),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (TravelerOperatorDoc & { id: string })[];
}

/* ── Listen to operator's travelers in real time ──────────────────────────── */

export function listenToOperatorTravelers(
  operatorId: string,
  onData: (travelers: (TravelerOperatorDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'travelerOperators'),
    where('operatorId', '==', operatorId),
    where('active', '==', true),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (TravelerOperatorDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[OperatorService] listener error:', err);
      onError?.(err);
    },
  );
}