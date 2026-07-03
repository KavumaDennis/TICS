/**
 * TICS Emulator Seed Script
 * 
 * Run: node scripts/seed-emulator.mjs
 * 
 * Prerequisites:
 * 1. Start Firebase emulators: npx firebase emulators:start
 * 2. Run this script
 * 
 * This creates an operator in the local emulator's Auth and Firestore.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'emulator-key',
  authDomain: 'tics-455d5.firebaseapp.com',
  projectId: 'tics-455d5',
};

const app = initializeApp(firebaseConfig, 'seed');

// Connect to emulators
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });

const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);

const email = 'ops@gorillaforestlodge.com';
const password = 'GorillaForest2026!';
const name = 'Operations Manager';

async function seed() {
  console.log('🌱 Seeding operator to Firebase Emulators...\n');

  // Create in Auth
  let uid;
  try {
    // First try to sign in (user might already exist)
    const existing = await signInWithEmailAndPassword(auth, email, password);
    uid = existing.user.uid;
    console.log('✅ Operator already exists in Auth:', uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Create new user
      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        uid = userCred.user.uid;
        console.log('✅ Created operator in Auth:', uid);
      } catch (createErr) {
        console.error('❌ Failed to create auth user:', createErr.message);
        process.exit(1);
      }
    } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
      // User exists but wrong password - just sign in with known creds
      console.log('⚠️  Operator auth user exists (different password). Using existing UID...');
      // We can still proceed - the user exists
      try {
        // Try to get user via sign-in with correct password
        const existing = await signInWithEmailAndPassword(auth, email, 'GorillaForest2026!');
        uid = existing.user.uid;
      } catch {
        uid = 'manual-seed-uid';
        console.log('⚠️  Using fallback UID. Create the user in Emulator UI at http://localhost:4000');
      }
    } else {
      console.error('❌ Auth error:', err.code, err.message);
      process.exit(1);
    }
  }

  if (!uid) {
    console.error('❌ Could not determine UID');
    process.exit(1);
  }

  // Sign in to get proper auth context for Firestore writes
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Signed in for Firestore write');
  } catch (err) {
    console.error('❌ Could not sign in:', err.message);
    process.exit(1);
  }

  // Create/update Firestore document
  const userRef = doc(db, 'users', uid);
  const existingDoc = await getDoc(userRef);

  if (existingDoc.exists()) {
    console.log('✅ Operator Firestore document already exists');
    const data = existingDoc.data();
    console.log('   Name:', data.name);
    console.log('   Role:', data.role);
  } else {
    await setDoc(userRef, {
      name,
      email,
      role: 'operator',
      lodgeName: 'Gorilla Forest Lodge',
      createdAt: new Date().toISOString(),
    });
    console.log('✅ Created operator Firestore document');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Operator Credentials');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  UID:      ${uid}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🌱 Seed complete! Login at http://localhost:5173\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});