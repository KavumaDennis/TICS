/**
 * firebaseApp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central Firebase initialisation for the TICS Expo app.
 *
 * Environment switching strategy
 * ───────────────────────────────
 *  • __DEV__ === true   → Expo / Metro dev build (physical device or simulator)
 *                         Connects Auth, Firestore and Functions to the local
 *                         Firebase Emulator Suite.
 *
 *  • __DEV__ === false  → Production / EAS build.
 *                         All services connect to live Firebase cloud endpoints.
 *                         No emulator code runs whatsoever.
 *
 * Emulator host configuration
 * ────────────────────────────
 *  IMPORTANT: Android and iOS physical devices cannot reach 'localhost' or
 *  '127.0.0.1' – those addresses resolve to the device itself, not your
 *  workstation.  You must set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST to your
 *  machine's local IPv4 address (e.g. 192.168.1.15).
 *
 *  Find your IP:
 *    macOS / Linux  →  ifconfig | grep "inet "
 *    Windows        →  ipconfig | findstr "IPv4"
 *
 *  Then update .env:
 *    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=192.168.x.x
 *
 *  Emulator ports (match firebase.json / default):
 *    Auth       → 9099
 *    Firestore  → 8080
 *    Functions  → 5001
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  Auth,
} from 'firebase/auth';
// eslint-disable-next-line import/no-unresolved
import { getReactNativePersistence } from '@firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
} from 'firebase/functions';

// ─── Firebase project config (injected at build time via Expo env vars) ───────

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
} as const;

// ─── Emulator host ─────────────────────────────────────────────────────────────
//
//  Resolution order (first truthy value wins):
//  1. EXPO_PUBLIC_FIREBASE_EMULATOR_HOST  – explicit override in .env
//  2. '10.0.2.2'                          – Android emulator → host loopback
//  3. 'localhost'                         – iOS simulator / web
//
//  For physical devices you MUST set option (1) to your workstation's LAN IP.

const EMULATOR_HOST: string =
  process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ||
  (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');

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

let _app:               FirebaseApp | null = null;
let _auth:              Auth        | null = null;
let _emulatorsAttached: boolean            = false;

// ─── App initialisation ───────────────────────────────────────────────────────

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;

  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }

  assertFirebaseConfig();
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
    // Auth was already initialised (e.g. hot-reload); reuse existing instance.
    _auth = getAuth(app);
  }

  return _auth;
}

// ─── Emulator attachment (DEV only, runs exactly once) ────────────────────────

function maybeAttachEmulators(): void {
  // Production builds: bail out immediately – no emulator code ever runs.
  if (!__DEV__) return;

  // Already attached in this JS runtime session.
  if (_emulatorsAttached) return;

  const app  = getFirebaseApp();
  const auth = buildAuth();

  if (__DEV__) {
    console.log(
      `[TICS Firebase] 🔧 DEV mode – connecting to emulators at ${EMULATOR_HOST}`,
    );
  }

  // Auth emulator  ────────────────────────────────────────────────────────────
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
    disableWarnings: true,   // suppresses the yellow banner in the UI
  });

  // Firestore emulator ────────────────────────────────────────────────────────
  connectFirestoreEmulator(getFirestore(app), EMULATOR_HOST, 8080);

  // Functions emulator ────────────────────────────────────────────────────────
  connectFunctionsEmulator(getFunctions(app), EMULATOR_HOST, 5001);

  _emulatorsAttached = true;
}

// ─── Public accessors (API surface is unchanged – zero consumer breakage) ─────

/**
 * Returns the initialised Firebase app singleton.
 * Consumers: rarely needed directly; prefer the typed helpers below.
 */
export function getFirebaseAuth() {
  maybeAttachEmulators();
  return buildAuth();
}

/**
 * Returns a Firestore instance, connected to the emulator in DEV mode.
 */
export function getFirebaseFirestore() {
  maybeAttachEmulators();
  return getFirestore(getFirebaseApp());
}

/**
 * Returns a Functions instance, connected to the emulator in DEV mode.
 */
export function getFirebaseFunctions() {
  maybeAttachEmulators();
  return getFunctions(getFirebaseApp());
}
