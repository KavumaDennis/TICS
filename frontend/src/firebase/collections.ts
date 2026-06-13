import { collection } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';

/* ── Top-level flat collections (legacy + active) ─────────────────────────── */

export function usersCollection() {
  return collection(getFirebaseFirestore(), 'users');
}

export function tripsCollection() {
  return collection(getFirebaseFirestore(), 'trips');
}

export function alertsCollection() {
  return collection(getFirebaseFirestore(), 'alerts');
}

export function riskAlertsCollection() {
  return collection(getFirebaseFirestore(), 'risk_alerts');
}

export function recommendationsCollection() {
  return collection(getFirebaseFirestore(), 'recommendations');
}

export function transportOptionsCollection() {
  return collection(getFirebaseFirestore(), 'transport_options');
}

export function flightMonitoringCollection() {
  return collection(getFirebaseFirestore(), 'flight_monitoring');
}

export function weatherMonitoringCollection() {
  return collection(getFirebaseFirestore(), 'weather_monitoring');
}

export function mobilityCollection() {
  return collection(getFirebaseFirestore(), 'mobility');
}

export function notificationsCollection() {
  return collection(getFirebaseFirestore(), 'notifications');
}

export function assistantConversationsCollection() {
  return collection(getFirebaseFirestore(), 'assistant_conversations');
}

export function appRatingsCollection() {
  return collection(getFirebaseFirestore(), 'app_ratings');
}

/* ── Trip-scoped subcollections (new architecture) ────────────────────────── */

export function tripAlertsCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'alerts');
}

export function tripRecommendationsCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'recommendations');
}

export function tripWeatherCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'weather_monitoring');
}

export function tripFlightCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'flight_monitoring');
}

export function tripMonitoringCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'monitoring');
}

export function tripSharedUpdatesCollection(tripId: string) {
  return collection(getFirebaseFirestore(), 'trips', tripId, 'sharedUpdates');
}

/* ── User-scoped subcollections ───────────────────────────────────────────── */

export function userSavedCollection(uid: string) {
  return collection(getFirebaseFirestore(), 'users', uid, 'saved');
}

export function userRatingsCollection(uid: string) {
  return collection(getFirebaseFirestore(), 'users', uid, 'ratings');
}
