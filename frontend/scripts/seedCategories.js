/**
 * seedCategories.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-off seed script for the "exploreCategories" Firestore collection.
 *
 * Prerequisites:
 *   1. A service account key JSON file for the TICS Firebase project.
 *      Download from: Firebase Console → Project Settings → Service Accounts →
 *                     "Generate new private key"
 *      Save it as:   frontend/serviceAccountKey.json (already .gitignored)
 *   2. Run: node scripts/seedCategories.js
 *
 * If you don't have a service account key, you can also set the
 * GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of your key.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');
const fs = require('fs');

// Try to load firebase-admin
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('[seedCategories] ❌ firebase-admin is not installed in frontend/');
  console.error('[seedCategories] Run: cd frontend && npm install firebase-admin');
  process.exit(1);
}

if (!admin || typeof admin.initializeApp !== 'function') {
  console.error('[seedCategories] ❌ firebase-admin loaded incorrectly (admin.initializeApp is not a function)');
  console.error('[seedCategories] This can happen with ESM/CJS interop issues in Node 24.');
  console.error('[seedCategories] Try running from firebase/functions directory instead:');
  console.error('[seedCategories]   cd firebase/functions && node -e "require(\'../../frontend/scripts/seedCategories\')"');
  console.error('[seedCategories] Or use the Firebase CLI:');
  console.error('[seedCategories]   firebase firestore:delete exploreCategories --recursive');
  console.error('[seedCategories]   firebase firestore:import ./seedCategories.json');
  process.exit(1);
}

// Try to load service account key
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');

let serviceAccount = null;
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  try {
    serviceAccount = require(SERVICE_ACCOUNT_PATH);
  } catch (e) {
    console.warn('[seedCategories] ⚠ Could not load serviceAccountKey.json:', e.message);
  }
}

if (!admin.apps || !admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Fall back to GOOGLE_APPLICATION_CREDENTIALS or default project ID
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'tics-455d5';
    admin.initializeApp({
      projectId,
    });
  }
}

const db = admin.firestore();

const CATEGORIES = [
  {
    id: 'beach',
    name: 'Beaches',
    slug: 'beach',
    description: 'Sun, sand & relaxation — tropical coastlines, island paradises, and pristine shorelines.',
    icon: 'water',
    color: '#3B82F6',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    sortOrder: 1,
    featured: true,
    active: true,
  },
  {
    id: 'mountain',
    name: 'Mountains',
    slug: 'mountain',
    description: 'Peaks & adventure — breathtaking alpine scenery, hiking trails, and mountain retreats.',
    icon: 'triangle',
    color: '#10B981',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400',
    sortOrder: 2,
    featured: true,
    active: true,
  },
  {
    id: 'city',
    name: 'Cities',
    slug: 'city',
    description: 'Urban exploration — world-class museums, dining, nightlife, and cultural landmarks.',
    icon: 'business',
    color: '#8B5CF6',
    imageUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400',
    sortOrder: 3,
    featured: true,
    active: true,
  },
  {
    id: 'cultural',
    name: 'Cultural',
    slug: 'cultural',
    description: 'Heritage & traditions — ancient temples, historic sites, festivals, and local customs.',
    icon: 'globe',
    color: '#F59E0B',
    imageUrl: 'https://images.unsplash.com/photo-1524666041070-9d876df3e5d5?w=400',
    sortOrder: 4,
    featured: true,
    active: true,
  },
  {
    id: 'adventure',
    name: 'Adventure',
    slug: 'adventure',
    description: 'Thrills & excitement — safaris, white-water rafting, bungee jumping, and extreme sports.',
    icon: 'compass',
    color: '#EF4444',
    imageUrl: 'https://images.unsplash.com/photo-1530866495561-507c9faab2ed?w=400',
    sortOrder: 5,
    featured: true,
    active: true,
  },
  {
    id: 'wildlife',
    name: 'Wildlife',
    slug: 'wildlife',
    description: 'Nature & animals — national parks, game reserves, bird sanctuaries, and marine life.',
    icon: 'paw',
    color: '#22C55E',
    imageUrl: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=400',
    sortOrder: 6,
    featured: true,
    active: true,
  },
  {
    id: 'nature',
    name: 'Nature',
    slug: 'nature',
    description: 'Natural wonders — waterfalls, forests, canyons, and breathtaking landscapes.',
    icon: 'leaf',
    color: '#059669',
    imageUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400',
    sortOrder: 7,
    featured: true,
    active: true,
  },
  {
    id: 'food',
    name: 'Food & Dining',
    slug: 'food',
    description: 'Culinary journeys — street food, fine dining, wine tasting, and cooking classes.',
    icon: 'restaurant',
    color: '#E17055',
    imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400',
    sortOrder: 8,
    featured: true,
    active: true,
  },
  {
    id: 'historical',
    name: 'Historical',
    slug: 'historical',
    description: 'Step back in time — ancient ruins, castles, battlefields, and UNESCO World Heritage sites.',
    icon: 'time',
    color: '#636E72',
    imageUrl: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=400',
    sortOrder: 9,
    featured: true,
    active: true,
  },
  {
    id: 'luxury',
    name: 'Luxury',
    slug: 'luxury',
    description: 'Premium experiences — five-star resorts, private villas, exclusive tours, and VIP access.',
    icon: 'diamond',
    color: '#FBBF24',
    imageUrl: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400',
    sortOrder: 10,
    featured: true,
    active: true,
  },
  {
    id: 'family',
    name: 'Family',
    slug: 'family',
    description: 'Fun for all ages — theme parks, kid-friendly attractions, and family resorts.',
    icon: 'people',
    color: '#FD79A8',
    imageUrl: 'https://images.unsplash.com/photo-1502784444186-3590a34f0ef5?w=400',
    sortOrder: 11,
    featured: true,
    active: true,
  },
  {
    id: 'wellness',
    name: 'Wellness',
    slug: 'wellness',
    description: 'Rejuvenate body and mind — spas, yoga retreats, hot springs, and meditation centers.',
    icon: 'fitness',
    color: '#A29BFE',
    imageUrl: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400',
    sortOrder: 12,
    featured: true,
    active: true,
  },
];

async function seed() {
  console.log(`[seedCategories] Starting...`);
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const cat of CATEGORIES) {
    const ref = db.collection('exploreCategories').doc(cat.id);
    batch.set(ref, {
      ...cat,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[seedCategories] Queued: ${cat.id} (${cat.name})`);
  }

  await batch.commit();
  console.log(`[seedCategories] ✅ Successfully seeded ${CATEGORIES.length} categories.`);
  console.log(`[seedCategories] Collection: exploreCategories`);
  console.log(`[seedCategories] Run the app and check: [useExplore] Sample categories: [...]`);
}

seed().catch((err) => {
  console.error('[seedCategories] ❌ Error:', err);
  process.exit(1);
});