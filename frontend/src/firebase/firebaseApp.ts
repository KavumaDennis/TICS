/**
 * firebaseApp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Firebase initialisation for the TICS Expo app.
 *
 * Production configuration — all services connect to live Firebase cloud
 * endpoints. Emulator code has been removed for EAS production builds.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
} from 'firebase/firestore';
import {
  getFunctions,
} from 'firebase/functions';
import {
  getStorage,
} from 'firebase/storage';

// ─── Firebase project config (injected at build time via Expo env vars) ───────

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
} as const;

console.log("Firebase config:", {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
});

// ─── Guard: ensure all required config values are present ─────────────────────

function assertFirebaseConfig(): void {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `[TICS] Missing Firebase config env vars: ${missing.join(', ')}\n` +
      'Copy .env.example → .env and fill in all EXPO_PUBLIC_FIREBASE_* values.',
    );
  }
}

// ─── Singleton refs ───────────────────────────────────────────────────────────

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

// ─── App initialisation ───────────────────────────────────────────────────────

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }

  assertFirebaseConfig();
  console.log("Firebase Config", firebaseConfig);
  _app = initializeApp(firebaseConfig as any);
  return _app;
}

// ─── Auth initialisation ──────────────────────────────────────────────────────
//  Uses AsyncStorage persistence on native (required for React Native).
//  Falls back to getAuth() if initializeAuth() throws (e.g. already called).

function buildAuth(): Auth {
  if (_auth) return _auth;

  const app = getFirebaseApp();

  if (Platform.OS === 'web') {
    _auth = getAuth(app);
    return _auth;
  }

  try {
    _auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // initializeAuth throws if persistence setup fails (e.g. in production
    // builds where async-storage is tree-shaken). Fall back to getAuth()
    // which uses the default in-memory persistence – completely safe.
    _auth = getAuth(app);
  }

  return _auth;
}

// ─── Public accessors ─────────────────────────────────────────────────────────

/**
 * Returns the initialised Firebase auth singleton connected to production.
 */
export function getFirebaseAuth() {
  return buildAuth();
}

/**
 * Returns a Firestore instance connected to production.
 */
export function getFirebaseFirestore() {
  return getFirestore(getFirebaseApp());
}

/**
 * Returns a Functions instance connected to production.
 */
export function getFirebaseFunctions() {
  return getFunctions(getFirebaseApp());
}

/**
 * Returns a Storage instance connected to production.
 */
export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}
