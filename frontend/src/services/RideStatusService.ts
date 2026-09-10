/**
 * RideStatusService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore read/write for ride tracking status. Keeps the assignment doc
 * synchronised so both the traveler app and operator dashboard see live updates.
 *
 * Collection: assignments/{assignmentId}
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
  where,
  type Unsubscribe,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type RideStatus =
  | 'assigned'
  | 'driver_arrived'
  | 'ride_started'
  | 'near_destination'
  | 'completed'
  | 'cancelled';

export interface AssignmentDoc {
  id: string;
  travelerId: string;
  tripId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverPhoto?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  vehicle?: string;
  plateNumber?: string;
  operatorName?: string;
  operatorId?: string;
  operatorPhone?: string;

  status: RideStatus;

  driverArrivedAt?: any;
  rideStartedAt?: any;
  completedAt?: any;

  destination?: string;
  destinationLat?: number;
  destinationLng?: number;

  currentLat?: number;
  currentLng?: number;
  distanceRemaining?: number;

  createdAt?: any;
  updatedAt?: any;
}

export type AssignmentSnapshot = {
  id: string;
  data: AssignmentDoc;
} | null;

/* ── Listeners ─────────────────────────────────────────────────────────────── */

export function listenToAssignment(
  travelerId: string,
  tripId: string,
  onData: (snap: AssignmentSnapshot) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'assignments'),
    where('travelerId', '==', travelerId),
    where('tripId', '==', tripId),
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
      onData({ id: d.id, data: d.data() as AssignmentDoc });
    },
    (err) => {
      console.warn('[RideStatusService] listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Mutations ─────────────────────────────────────────────────────────────── */

/** Update assignment status + set driverArrivedAt */
export async function markDriverArrived(assignmentId: string): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'assignments', assignmentId), {
    status: 'driver_arrived',
    driverArrivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Save chosen destination + update status to ride_started */
export async function saveDestinationAndStartRide(
  assignmentId: string,
  destination: {
    name: string;
    latitude: number;
    longitude: number;
  },
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'assignments', assignmentId), {
    status: 'ride_started',
    destination: destination.name,
    destinationLat: destination.latitude,
    destinationLng: destination.longitude,
    rideStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Periodically update current location + distance remaining */
export async function updateTravelerLocation(
  assignmentId: string,
  location: { latitude: number; longitude: number },
  distanceRemaining?: number,
): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'assignments', assignmentId), {
    currentLat: location.latitude,
    currentLng: location.longitude,
    distanceRemaining: distanceRemaining ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** Mark as near_destination (auto-detected) */
export async function markNearDestination(assignmentId: string): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'assignments', assignmentId), {
    status: 'near_destination',
    updatedAt: serverTimestamp(),
  });
}

/** Complete the ride and record it in the rides collection for history */
export async function completeRide(
  assignmentId: string,
  finalLocation: { latitude: number; longitude: number },
  rideDurationSeconds: number,
  finalDistanceMeters: number,
  rideStatus: 'completed' | 'cancelled' = 'completed',
): Promise<void> {
  const db = getFirebaseFirestore();
  
  // First get the current assignment data to copy to rides collection
  const assignRef = doc(db, 'assignments', assignmentId);
  const assignSnap = await getDoc(assignRef);
  
  // Update assignment status
  await updateDoc(assignRef, {
    status: rideStatus,
    completedAt: serverTimestamp(),
    currentLat: finalLocation.latitude,
    currentLng: finalLocation.longitude,
    distanceRemaining: 0,
    rideDurationSeconds,
    finalDistanceMeters,
    updatedAt: serverTimestamp(),
  });
  
  // Record in rides collection for history tracking
  if (assignSnap.exists()) {
    const data = assignSnap.data();
    const rideRef = doc(collection(db, 'rides'));
    await setDoc(rideRef, {
      travelerId: data.travelerId || '',
      operatorId: data.operatorId || '',
      operatorName: data.operatorName || '',
      tripId: data.tripId || '',
      assignmentId: assignmentId,
      driverId: data.driverId || '',
      driverName: data.driverName || '',
      driverPhone: data.driverPhone || '',
      vehicle: data.vehicle || '',
      plateNumber: data.plateNumber || '',
      pickupLocation: data.pickupLocation || data.destination || '',
      destination: data.destination || '',
      destinationLat: data.destinationLat || null,
      destinationLng: data.destinationLng || null,
      distanceMeters: finalDistanceMeters || data.distanceRemaining || 0,
      durationSeconds: rideDurationSeconds || 0,
      status: rideStatus,
      startedAt: data.rideStartedAt || null,
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }
}
