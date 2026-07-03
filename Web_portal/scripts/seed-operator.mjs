/**
 * TICS Operator Seed Script
 * 
 * Run: node scripts/seed-operator.mjs
 * 
 * Prerequisites:
 * 1. Go to Firebase Console → Project Settings → Service Accounts
 * 2. Click "Generate New Private Key"
 * 3. Save the JSON file as service-account.json in this directory
 * 4. Run this script
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedOperator() {
  let serviceAccount;
  try {
    const path = join(__dirname, 'service-account.json');
    serviceAccount = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    console.error('❌ Missing service-account.json');
    console.log('Download it from Firebase Console → Project Settings → Service Accounts');
    process.exit(1);
  }

  const app = initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = 'ops@gorillaforestlodge.com';
  const password = 'GorillaForest2026!';
  const name = 'Operations Manager';

  try {
    // Create Firebase Auth user
    const user = await auth.createUser({
      email,
      password,
      displayName: name,
    });
    console.log(`✅ Auth user created: ${user.uid}`);

    // Create Firestore document with operator role
    await db.collection('users').doc(user.uid).set({
      name,
      email,
      role: 'operator',
      lodgeName: 'Gorilla Forest Lodge',
      createdAt: new Date().toISOString(),
    });
    console.log('✅ Firestore operator document created');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Operator Credentials');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.log('⚠️  Operator already exists. Checking Firestore...');
      // Try to find the existing user
      const user = await auth.getUserByEmail(email);
      const doc = await db.collection('users').doc(user.uid).get();
      if (!doc.exists) {
        await db.collection('users').doc(user.uid).set({
          name,
          email,
          role: 'operator',
          lodgeName: 'Gorilla Forest Lodge',
          createdAt: new Date().toISOString(),
        });
        console.log('✅ Firestore document created for existing auth user');
      } else {
        console.log('✅ Operator already fully set up');
      }
    } else {
      console.error('❌ Error:', err.message);
    }
  }

  process.exit(0);
}

seedOperator();