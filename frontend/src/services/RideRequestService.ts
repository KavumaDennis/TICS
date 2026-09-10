/**
 * RideRequestService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages ride requests, ride history, and continuous ride tracking for the
 * Country-wide Last Mile Travel Assistance System.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import type { RideRequestDoc, RideDoc, TripHistoryDoc } from '@/src/firebase/lastMileTypes';
import {
  notifyOperatorRideRequested,
  notifyRideStarted,
  notifyRideCompleted,
} from './NotificationService';

/* ── Create a ride request ────────────────────────────────────────────────── */

export async function createRideRequest(
  travelerId: string,
  operatorId: string,
  tripId: string,
  pickupLocation: string,
  pickupLat: number | undefined,
  pickupLng: number | undefined,
  destination: string,
  destinationLat: number | undefined,
  destinationLng: number | undefined,
  notes: string,
  travelerName?: string,
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = doc(collection(db, 'rideRequests'));

  await setDoc(ref, {
    travelerId,
    operatorId,
    tripId,
    pickupLocation,
    pickupLat: pickupLat ?? null,
    pickupLng: pickupLng ?? null,
    destination,
    destinationLat: destinationLat ?? null,
    destinationLng: destinationLng ?? null,
    notes: notes || '',
    status: 'pending',
    travelerName: travelerName || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Notify operator
  await notifyOperatorRideRequested(
    operatorId,
    travelerName || travelerId,
    pickupLocation,
    destination,
    tripId,
  ).catch(() => {});

  return ref.id;
}

/* ── Listen to ride requests for an operator ──────────────────────────────── */

export function listenToOperatorRideRequests(
  operatorId: string,
  onData: (requests: (RideRequestDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'rideRequests'),
    where('operatorId', '==', operatorId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (RideRequestDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[RideRequestService] listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Listen to ride requests for a traveler ───────────────────────────────── */

export function listenToTravelerRideRequests(
  travelerId: string,
  tripId: string,
  onData: (requests: (RideRequestDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'rideRequests'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (RideRequestDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[RideRequestService] listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Update ride request status ───────────────────────────────────────────── */

export async function updateRideRequestStatus(
  rideRequestId: string,
  status: RideRequestDoc['status'],
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'rideRequests', rideRequestId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/* ── Record a completed ride ──────────────────────────────────────────────── */

export async function recordRide(
  ride: Omit<RideDoc, 'id' | 'createdAt'> & { id?: string },
): Promise<string> {
  const db = getFirebaseFirestore();

  if (ride.id) {
    await setDoc(doc(db, 'rides', ride.id), {
      ...ride,
      updatedAt: serverTimestamp(),
    });
    return ride.id;
  }

  const ref = doc(collection(db, 'rides'));
  await setDoc(ref, {
    ...ride,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/* ── Ride history for a traveler's trip ───────────────────────────────────── */

export async function getRideHistory(
  travelerId: string,
  tripId: string,
): Promise<(RideDoc & { id: string })[]> {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'rides'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    orderBy('completedAt', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (RideDoc & { id: string })[];
}

/* ── Listen to ride history in real time ──────────────────────────────────── */

export function listenToRideHistory(
  travelerId: string,
  tripId: string,
  onData: (rides: (RideDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'rideRequests'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (RideDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[RideRequestService] history listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Trip Timeline ────────────────────────────────────────────────────────── */

export async function getTripTimeline(
  travelerId: string,
  tripId: string,
): Promise<(TripHistoryDoc & { id: string })[]> {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'tripHistory'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    orderBy('order', 'asc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as (TripHistoryDoc & { id: string })[];
}

export function listenToTripTimeline(
  travelerId: string,
  tripId: string,
  onData: (entries: (TripHistoryDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'tripHistory'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
    orderBy('order', 'asc'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (TripHistoryDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[RideRequestService] timeline listener error:', err);
      onError?.(err);
    },
  );
}

export async function addTimelineEntry(
  entry: Omit<TripHistoryDoc, 'id' | 'createdAt'>,
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = doc(collection(db, 'tripHistory'));
  await setDoc(ref, {
    ...entry,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/* ── Traveler Location (live GPS) ─────────────────────────────────────────── */

export async function updateTravelerGPS(
  travelerId: string,
  lat: number,
  lng: number,
  heading?: number,
  speed?: number,
  accuracy?: number,
): Promise<void> {
  const db = getFirebaseFirestore();
  await setDoc(doc(db, 'travelerLocations', travelerId), {
    travelerId,
    lat,
    lng,
    heading: heading ?? null,
    speed: speed ?? null,
    accuracy: accuracy ?? null,
    timestamp: serverTimestamp(),
  });
}

export function listenToTravelerGPS(
  travelerId: string,
  onData: (loc: { lat: number; lng: number; heading?: number; speed?: number } | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  return onSnapshot(
    doc(db, 'travelerLocations', travelerId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
      });
    },
    (err) => {
      console.warn('[RideRequestService] GPS listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Driver Location (live GPS) ───────────────────────────────────────────── */

export async function updateDriverGPS(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number,
  speed?: number,
): Promise<void> {
  const db = getFirebaseFirestore();
  await setDoc(doc(db, 'driverLocations', driverId), {
    driverId,
    lat,
    lng,
    heading: heading ?? null,
    speed: speed ?? null,
    timestamp: serverTimestamp(),
  });
}

export function listenToDriverGPS(
  driverId: string,
  onData: (loc: { lat: number; lng: number; heading?: number; speed?: number } | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  return onSnapshot(
    doc(db, 'driverLocations', driverId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data();
      onData({
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
      });
    },
    (err) => {
      console.warn('[RideRequestService] driver GPS listener error:', err);
      onError?.(err);
    },
  );
}