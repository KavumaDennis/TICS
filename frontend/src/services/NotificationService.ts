/**
 * NotificationService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore-based notification system for the Last Mile Travel Assistance.
 * Creates notifications in the `notifications` collection that both the
 * traveler app and operator dashboard listen to in real time.
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
import type { NotificationDoc } from '@/src/firebase/lastMileTypes';

/* ── Create a notification ────────────────────────────────────────────────── */

export async function createNotification(
  notification: Omit<NotificationDoc, 'id' | 'createdAt'>,
): Promise<string> {
  const db = getFirebaseFirestore();
  const ref = doc(collection(db, 'notifications'));
  await setDoc(ref, {
    ...notification,
    read: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/* ── Listen to notifications for a user ──────────────────────────────────── */

export function listenToNotifications(
  userId: string,
  userType: 'traveler' | 'operator' | 'driver',
  onData: (notifications: (NotificationDoc & { id: string })[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('userType', '==', userType),
    orderBy('createdAt', 'desc'),
    limit(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as (NotificationDoc & { id: string })[];
      onData(items);
    },
    (err) => {
      console.warn('[NotificationService] listener error:', err);
      onError?.(err);
    },
  );
}

/* ── Mark a notification as read ──────────────────────────────────────────── */

export async function markNotificationRead(notificationId: string): Promise<void> {
  const db = getFirebaseFirestore();
  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
  });
}

/* ── Mark all notifications as read for a user ────────────────────────────── */

export async function markAllNotificationsRead(
  userId: string,
  userType: 'traveler' | 'operator' | 'driver',
): Promise<void> {
  const db = getFirebaseFirestore();
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('userType', '==', userType),
    where('read', '==', false),
  );
  const snap = await getDocs(q);
  const batch = snap.docs.map((d) => updateDoc(doc(db, 'notifications', d.id), { read: true }));
  await Promise.all(batch);
}

/* ── Convenience: create common notification types ────────────────────────── */

export async function notifyOperatorAccepted(
  travelerId: string,
  operatorName: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'operator_accepted',
    title: 'Operator Selected',
    message: `${operatorName} has been selected as your tour operator. They will manage your rides during this trip.`,
    data: { tripId, operatorName },
    read: false,
  });
}

export async function notifyDriverAssigned(
  travelerId: string,
  driverName: string,
  operatorName: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'driver_assigned',
    title: 'Driver Assigned',
    message: `${driverName} from ${operatorName} has been assigned to pick you up.`,
    data: { tripId, driverName, operatorName },
    read: false,
  });
}

export async function notifyRideStarted(
  travelerId: string,
  destination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'ride_started',
    title: 'Ride Started',
    message: `Your ride to ${destination} has started. Enjoy the journey!`,
    data: { tripId, destination },
    read: false,
  });
}

export async function notifyRideCompleted(
  travelerId: string,
  destination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'ride_completed',
    title: 'Ride Completed',
    message: `You have arrived at ${destination}. Thank you for riding with us!`,
    data: { tripId, destination },
    read: false,
  });
}

export async function notifyOperatorRideRequested(
  operatorId: string,
  travelerName: string,
  pickup: string,
  destination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: operatorId,
    userType: 'operator',
    type: 'ride_requested',
    title: 'New Ride Request',
    message: `${travelerName} is requesting a ride from ${pickup} to ${destination}.`,
    data: { tripId, travelerName, pickup, destination },
    read: false,
  });
}

export async function notifyOperatorNewTraveler(
  operatorId: string,
  travelerName: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: operatorId,
    userType: 'operator',
    type: 'new_traveler',
    title: 'New Traveler Assigned',
    message: `${travelerName} has selected you as their tour operator.`,
    data: { tripId, travelerName },
    read: false,
  });
}

/* ── Additional notification types ──────────────────────────────────────── */

export async function notifyDriverArriving(
  travelerId: string,
  driverName: string,
  etaMinutes: number,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'driver_arriving',
    title: 'Driver Arriving',
    message: `${driverName} is on their way and will arrive in approximately ${etaMinutes} minutes.`,
    data: { tripId, driverName, etaMinutes },
    read: false,
  });
}

export async function notifyDriverArrived(
  travelerId: string,
  driverName: string,
  vehicle: string,
  plateNumber: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'driver_arrived',
    title: 'Driver Has Arrived',
    message: `${driverName} has arrived in a ${vehicle} (${plateNumber}). Please proceed to the pickup location.`,
    data: { tripId, driverName, vehicle, plateNumber },
    read: false,
  });
}

export async function notifyNearDestination(
  travelerId: string,
  destination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'near_destination',
    title: 'Near Destination',
    message: `You are approaching ${destination}. Please prepare to arrive.`,
    data: { tripId, destination },
    read: false,
  });
}

export async function notifyTravelerArrived(
  operatorId: string,
  travelerName: string,
  destination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: operatorId,
    userType: 'operator',
    type: 'traveler_arrived',
    title: 'Traveler Arrived',
    message: `${travelerName} has arrived at ${destination}.`,
    data: { tripId, travelerName, destination },
    read: false,
  });
}

export async function notifyRideCancelled(
  travelerId: string,
  tripId: string,
  reason?: string,
): Promise<string> {
  return createNotification({
    userId: travelerId,
    userType: 'traveler',
    type: 'ride_cancelled',
    title: 'Ride Cancelled',
    message: reason ? `Your ride has been cancelled: ${reason}` : 'Your ride has been cancelled.',
    data: { tripId, reason },
    read: false,
  });
}

export async function notifyDriverRideCancelled(
  driverId: string,
  travelerName: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: driverId,
    userType: 'driver',
    type: 'ride_cancelled',
    title: 'Ride Cancelled',
    message: `The ride for ${travelerName} has been cancelled.`,
    data: { tripId, travelerName },
    read: false,
  });
}

export async function notifyDriverNewAssignment(
  driverId: string,
  travelerName: string,
  pickupLocation: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: driverId,
    userType: 'driver',
    type: 'new_assignment',
    title: 'New Ride Assignment',
    message: `You have been assigned to pick up ${travelerName} at ${pickupLocation}.`,
    data: { tripId, travelerName, pickupLocation },
    read: false,
  });
}

export async function notifyDriverDestinationUpdated(
  driverId: string,
  travelerName: string,
  newDestination: string,
  tripId: string,
): Promise<string> {
  return createNotification({
    userId: driverId,
    userType: 'driver',
    type: 'destination_updated',
    title: 'Destination Updated',
    message: `${travelerName} has updated the destination to ${newDestination}.`,
    data: { tripId, travelerName, newDestination },
    read: false,
  });
}
