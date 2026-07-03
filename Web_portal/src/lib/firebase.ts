import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const EMULATOR_HOST = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;
let _emulatorsAttached = false;

function getApp(): FirebaseApp {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }
  _app = initializeApp(firebaseConfig);
  return _app;
}

function attachEmulators(): void {
  if (_emulatorsAttached) return;
  const useEmulator = import.meta.env.VITE_USE_EMULATORS === 'true';

  if (useEmulator) {
    console.log(`[Web Portal] 🔧 Connecting to Firebase emulators at ${EMULATOR_HOST}`);

    connectAuthEmulator(getAuth(getApp()), `http://${EMULATOR_HOST}:9099`, {
      disableWarnings: true,
    });

    connectFirestoreEmulator(getFirestore(getApp()), EMULATOR_HOST, 8080);
    connectFunctionsEmulator(getFunctions(getApp()), EMULATOR_HOST, 5001);

    _emulatorsAttached = true;
  }
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  attachEmulators();
  _auth = getAuth(getApp());
  return _auth;
}

export function getFirebaseFirestore(): Firestore {
  if (_db) return _db;
  attachEmulators();
  _db = getFirestore(getApp());
  return _db;
}

export function getFirebaseFunctions(): Functions {
  if (_functions) return _functions;
  attachEmulators();
  _functions = getFunctions(getApp());
  return _functions;
}