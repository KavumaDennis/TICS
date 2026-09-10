/**
 * seedDestinations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Node.js script to seed the `destinations` collection in Firestore.
 * Uses Firebase Admin SDK - run this server-side.
 *
 * Usage:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS env var to your service account key
 *   2. node src/scripts/seedDestinations.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { initializeApp, getApps, cert } = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
// Try loading project ID from .env
const envPath = path.join(__dirname, '..', '..', '.env');
let PROJECT_ID = 'tics-455d5';
let credential;

try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/FIREBASE_PROJECT_ID=(.+)/);
    if (match) PROJECT_ID = match[1].trim();
  }
} catch {}

// Try to load service account from env var or find it in Downloads
const saEnvVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saEnvVar && fs.existsSync(saEnvVar)) {
  console.log(`[SeedDestinations] Using service account: ${saEnvVar}`);
  credential = cert(require(saEnvVar));
} else {
  // Search for service account file in common locations
  const homeDir = require('os').homedir();
  const searchPaths = [
    path.join(homeDir, 'Downloads'),
    path.join(homeDir, 'Desktop'),
    __dirname,
  ];
  
  for (const dir of searchPaths) {
    try {
      const files = fs.readdirSync(dir);
      const keyFile = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
      if (keyFile) {
        const keyPath = path.join(dir, keyFile);
        console.log(`[SeedDestinations] Found service account: ${keyPath}`);
        credential = cert(require(keyPath));
        break;
      }
    } catch {}
  }
}

if (!credential) {
  console.warn('[SeedDestinations] WARNING: No service account found. Run with GOOGLE_APPLICATION_CREDENTIALS set.');
  console.warn('[SeedDestinations] Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key');
  console.warn('[SeedDestinations] Then run: set GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json');
  process.exit(1);
}

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({ credential, projectId: PROJECT_ID });
}

const db = getFirestore();

const SEED_DATA = [
  // ── Europe ──
  {
    name: 'Paris',
    country: 'France',
    countryCode: 'FR',
    description: 'The City of Light — world capital of art, fashion, gastronomy, and culture.',
    travelTips: [
      'Book museum tickets online in advance to skip queues at the Louvre.',
      'Learn a few French phrases; locals appreciate the effort.',
      'Visit Montmartre early morning to avoid crowds.',
      'Get a Navigo card for unlimited metro travel.',
    ],
    bestTimeToVisit: 'April–June & September–October for mild weather and fewer crowds.',
    currency: 'Euro (€)',
    language: 'French',
    timezone: 'CET (UTC+1)',
    topAttractions: ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral', 'Sacré-Cœur Basilica', 'Palace of Versailles'],
    travelCategories: ['culture', 'romantic', 'food', 'art', 'history', 'shopping'],
    estimatedBudget: { min: 1500, max: 5000, currency: 'EUR' },
    lat: 48.8566,
    lng: 2.3522,
  },
  {
    name: 'London',
    country: 'United Kingdom',
    countryCode: 'GB',
    description: 'A city steeped in history, from royal palaces and world-class museums to a thriving arts and food scene.',
    travelTips: [
      'Use an Oyster card for the cheapest Tube fares.',
      'Many top museums like the British Museum are free.',
      'Book theatre tickets in advance for best prices.',
      'Walk along the South Bank for iconic river views.',
    ],
    bestTimeToVisit: 'March–May & September–November for mild weather and fewer tourists.',
    currency: 'Pound Sterling (£)',
    language: 'English',
    timezone: 'GMT (UTC+0)',
    topAttractions: ['Big Ben', 'Tower of London', 'Buckingham Palace', 'British Museum', 'London Eye'],
    travelCategories: ['culture', 'history', 'shopping', 'food', 'business'],
    estimatedBudget: { min: 1200, max: 4000, currency: 'GBP' },
    lat: 51.5074,
    lng: -0.1278,
  },
  {
    name: 'Rome',
    country: 'Italy',
    countryCode: 'IT',
    description: 'The Eternal City — a living museum of ancient ruins, Renaissance art, and incredible Italian cuisine.',
    travelTips: [
      'Book Colosseum tickets weeks in advance.',
      'Visit the Vatican Museum on Friday evenings for fewer crowds.',
      'Toss a coin in Trevi Fountain for good luck.',
      'Stay in Trastevere for authentic Roman evenings.',
    ],
    bestTimeToVisit: 'April–June & September–October for pleasant walking weather.',
    currency: 'Euro (€)',
    language: 'Italian',
    timezone: 'CET (UTC+1)',
    topAttractions: ['Colosseum', 'Vatican City', 'Trevi Fountain', 'Roman Forum', 'Pantheon'],
    travelCategories: ['history', 'culture', 'food', 'romantic', 'art'],
    estimatedBudget: { min: 1000, max: 3500, currency: 'EUR' },
    lat: 41.9028,
    lng: 12.4964,
  },
  {
    name: 'Santorini',
    country: 'Greece',
    countryCode: 'GR',
    description: 'A stunning Greek island famous for its blue-domed churches, white-washed buildings, and volcanic sunsets.',
    travelTips: [
      'Stay in Fira or Imerovigli for more affordable caldera views.',
      'Book sunset dinner spots weeks in advance.',
      'Rent an ATV to explore the island.',
      'Visit in shoulder season (May/Sept) for pleasant weather.',
    ],
    bestTimeToVisit: 'June–September for warm weather and sunset views.',
    currency: 'Euro (€)',
    language: 'Greek',
    timezone: 'EET (UTC+2)',
    topAttractions: ['Oia Sunset Viewpoint', 'Red Beach', 'Fira Town', 'Akrotiri Ruins', 'Wine Tasting Tours'],
    travelCategories: ['beach', 'romantic', 'food', 'culture', 'photography'],
    estimatedBudget: { min: 1200, max: 4000, currency: 'EUR' },
    lat: 36.3932,
    lng: 25.4615,
  },
  {
    name: 'Barcelona',
    country: 'Spain',
    countryCode: 'ES',
    description: 'A vibrant Mediterranean city blending Gothic architecture with modernist masterpieces by Gaudí.',
    travelTips: [
      'Book Sagrada Familia tickets months in advance.',
      'Explore the Gothic Quarter on foot.',
      'Try authentic paella by the beach.',
      'Use the metro — it\'s efficient and affordable.',
    ],
    bestTimeToVisit: 'May–June & September–October for warm weather without peak crowds.',
    currency: 'Euro (€)',
    language: 'Spanish, Catalan',
    timezone: 'CET (UTC+1)',
    topAttractions: ['Sagrada Familia', 'Park Güell', 'La Rambla', 'Gothic Quarter', 'Casa Batlló'],
    travelCategories: ['beach', 'culture', 'food', 'art', 'nightlife'],
    estimatedBudget: { min: 800, max: 3000, currency: 'EUR' },
    lat: 41.3874,
    lng: 2.1686,
  },

  // ── Asia ──
  {
    name: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    description: 'A dazzling blend of ultramodern and traditional — neon-lit skyscrapers meet ancient temples.',
    travelTips: [
      'Get a Suica or Pasmo card for seamless train travel.',
      'Visit Tsukiji Outer Market for fresh sushi.',
      'Learn basic Japanese phrases for a better experience.',
      'Use Google Maps for navigating the complex train system.',
    ],
    bestTimeToVisit: 'March–May for cherry blossoms or October–November for autumn colors.',
    currency: 'Japanese Yen (¥)',
    language: 'Japanese',
    timezone: 'JST (UTC+9)',
    topAttractions: ['Shibuya Crossing', 'Senso-ji Temple', 'Tokyo Skytree', 'Meiji Shrine', 'Akihabara'],
    travelCategories: ['culture', 'food', 'technology', 'shopping', 'history'],
    estimatedBudget: { min: 1500, max: 5000, currency: 'USD' },
    lat: 35.6762,
    lng: 139.6503,
  },
  {
    name: 'Bali',
    country: 'Indonesia',
    countryCode: 'ID',
    description: 'The Island of the Gods — lush rice terraces, ancient temples, vibrant arts, and surf breaks.',
    travelTips: [
      'Rent a scooter for the most authentic way to explore.',
      'Always carry cash — many places don\'t accept cards.',
      'Visit temples respectfully with sarongs.',
      'Stay in Ubud for culture, Seminyak for nightlife.',
    ],
    bestTimeToVisit: 'April–October (dry season) for sunny days and calm seas.',
    currency: 'Indonesian Rupiah (IDR)',
    language: 'Indonesian / Balinese',
    timezone: 'WITA (UTC+8)',
    topAttractions: ['Tegallalang Rice Terraces', 'Uluwatu Temple', 'Ubud Monkey Forest', 'Tanah Lot Temple', 'Mount Batur'],
    travelCategories: ['beach', 'culture', 'spa', 'nature', 'yoga', 'surf'],
    estimatedBudget: { min: 500, max: 2000, currency: 'USD' },
    lat: -8.3405,
    lng: 115.092,
  },
  {
    name: 'Singapore',
    country: 'Singapore',
    countryCode: 'SG',
    description: 'A futuristic city-state where Chinese, Malay, and Indian cultures blend with stunning modern architecture.',
    travelTips: [
      'Hawker centers offer the best and cheapest local food.',
      'The MRT is efficient and covers the whole island.',
      'Respect strict laws — no chewing gum, strict littering fines.',
      'Visit Gardens by the Bay at sunset for magical views.',
    ],
    bestTimeToVisit: 'February–April for the driest weather.',
    currency: 'Singapore Dollar (SGD)',
    language: 'English, Mandarin, Malay, Tamil',
    timezone: 'SGT (UTC+8)',
    topAttractions: ['Marina Bay Sands', 'Gardens by the Bay', 'Sentosa Island', 'Chinatown', 'Little India'],
    travelCategories: ['business', 'food', 'shopping', 'culture', 'modern'],
    estimatedBudget: { min: 1000, max: 4000, currency: 'SGD' },
    lat: 1.3521,
    lng: 103.8198,
  },
  {
    name: 'Dubai',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    description: 'A futuristic oasis in the desert — home to the world\'s tallest building, luxury shopping, and breathtaking architecture.',
    travelTips: [
      'Visit the Dubai Miracle Garden from November to May.',
      'Book Burj Khalifa tickets online for sunset slots.',
      'Dress modestly in public areas.',
      'Use the metro to avoid traffic jams.',
    ],
    bestTimeToVisit: 'November–March when temperatures are mild (20–30°C).',
    currency: 'UAE Dirham (AED)',
    language: 'Arabic',
    timezone: 'GST (UTC+4)',
    topAttractions: ['Burj Khalifa', 'Palm Jumeirah', 'Dubai Mall', 'Burj Al Arab', 'Dubai Desert Safari'],
    travelCategories: ['luxury', 'shopping', 'business', 'food', 'modern'],
    estimatedBudget: { min: 1500, max: 8000, currency: 'USD' },
    lat: 25.2048,
    lng: 55.2708,
  },

  // ── Africa ──
  {
    name: 'Nairobi',
    country: 'Kenya',
    countryCode: 'KE',
    description: 'The Green City in the Sun — Kenya\'s vibrant capital, gateway to East African safaris.',
    travelTips: [
      'Visit the Giraffe Centre early morning for fewer crowds.',
      'Use ride-hailing apps like Uber or Bolt for safe transport.',
      'Try nyama choma at a local carnivore restaurant.',
      'Book safari trips through reputable operators.',
    ],
    bestTimeToVisit: 'June–October & January–February for wildlife viewing.',
    currency: 'Kenyan Shilling (KES)',
    language: 'Swahili / English',
    timezone: 'EAT (UTC+3)',
    topAttractions: ['Nairobi National Park', 'Elephant Orphanage', 'Giraffe Centre', 'Karen Blixen Museum', 'Nairobi National Museum'],
    travelCategories: ['safari', 'culture', 'nature', 'business', 'history'],
    estimatedBudget: { min: 500, max: 2000, currency: 'USD' },
    lat: -1.2921,
    lng: 36.8219,
  },
  {
    name: 'Cape Town',
    country: 'South Africa',
    countryCode: 'ZA',
    description: 'Where the Atlantic meets the Indian Ocean — stunning beaches, iconic Table Mountain, and vibrant culture.',
    travelTips: [
      'Take the aerial cableway up Table Mountain — check weather first.',
      'Visit Boulders Beach for the penguin colony.',
      'Drive Chapman\'s Peak for stunning coastal views.',
      'Explore the V&A Waterfront for shopping and dining.',
    ],
    bestTimeToVisit: 'November–March (summer) for warm, sunny days.',
    currency: 'South African Rand (ZAR)',
    language: '11 official languages including Zulu, Xhosa, Afrikaans, English',
    timezone: 'SAST (UTC+2)',
    topAttractions: ['Table Mountain', 'Cape of Good Hope', 'Boulders Beach Penguins', 'V&A Waterfront', 'Robben Island'],
    travelCategories: ['nature', 'beach', 'culture', 'wine', 'adventure'],
    estimatedBudget: { min: 600, max: 2500, currency: 'USD' },
    lat: -33.9249,
    lng: 18.4241,
  },
  {
    name: 'Zanzibar',
    country: 'Tanzania',
    countryCode: 'TZ',
    description: 'A tropical paradise of white-sand beaches, turquoise waters, and rich Swahili culture.',
    travelTips: [
      'Stay in Nungwi for beautiful beaches, Stone Town for culture.',
      'Take a spice tour — Zanzibar is the Spice Island.',
      'Try fresh seafood at Forodhani Night Market.',
      'Respect local customs; dress modestly in Stone Town.',
    ],
    bestTimeToVisit: 'June–October & January–March for dry, sunny weather.',
    currency: 'Tanzanian Shilling (TZS)',
    language: 'Swahili / English',
    timezone: 'EAT (UTC+3)',
    topAttractions: ['Stone Town', 'Nungwi Beach', 'Prison Island', 'Spice Plantations', 'Jozani Forest'],
    travelCategories: ['beach', 'culture', 'history', 'diving', 'spice'],
    estimatedBudget: { min: 500, max: 2000, currency: 'USD' },
    lat: -6.1659,
    lng: 39.2026,
  },
  {
    name: 'Marrakech',
    country: 'Morocco',
    countryCode: 'MA',
    description: 'A sensory feast of vibrant souks, stunning palaces, and the gateway to the Sahara Desert.',
    travelTips: [
      'Haggle respectfully in the souks — it\'s expected.',
      'Stay in a traditional riad for an authentic experience.',
      'Try tagine and mint tea at a local cafe.',
      'Book a guided tour of the medina to get your bearings.',
    ],
    bestTimeToVisit: 'March–May & September–November for pleasant temperatures.',
    currency: 'Moroccan Dirham (MAD)',
    language: 'Arabic / Berber / French',
    timezone: 'WET (UTC+0)',
    topAttractions: ['Jemaa el-Fnaa', 'Bahia Palace', 'Koutoubia Mosque', 'Majorelle Garden', 'Souks of Marrakech'],
    travelCategories: ['culture', 'food', 'shopping', 'history', 'desert'],
    estimatedBudget: { min: 400, max: 1500, currency: 'USD' },
    lat: 31.6295,
    lng: -7.9811,
  },

  // ── Americas ──
  {
    name: 'New York',
    country: 'United States',
    countryCode: 'US',
    description: 'The city that never sleeps — a global hub for finance, culture, entertainment, and dining.',
    travelTips: [
      'Get a MetroCard or OMNY for unlimited 7-day subway access.',
      'Book Broadway tickets in advance for best prices.',
      'Visit Central Park early morning for a peaceful experience.',
      'Walk the High Line for unique city views.',
    ],
    bestTimeToVisit: 'April–June & September–November for pleasant weather.',
    currency: 'US Dollar ($)',
    language: 'English',
    timezone: 'EST (UTC-5)',
    topAttractions: ['Statue of Liberty', 'Times Square', 'Central Park', 'Empire State Building', 'Broadway'],
    travelCategories: ['business', 'culture', 'food', 'shopping', 'art', 'theatre'],
    estimatedBudget: { min: 2000, max: 7000, currency: 'USD' },
    lat: 40.7128,
    lng: -74.006,
  },
  {
    name: 'Rio de Janeiro',
    country: 'Brazil',
    countryCode: 'BR',
    description: 'A vibrant city of stunning beaches, dramatic mountains, and infectious samba rhythms.',
    travelTips: [
      'Stay in Copacabana or Ipanema for beach access.',
      'Take the cog train up to Christ the Redeemer early.',
      'Learn basic Portuguese for a better experience.',
      'Use Uber for safer transportation.',
    ],
    bestTimeToVisit: 'December–March for summer weather and festivals.',
    currency: 'Brazilian Real (BRL)',
    language: 'Portuguese',
    timezone: 'BRT (UTC-3)',
    topAttractions: ['Christ the Redeemer', 'Sugarloaf Mountain', 'Copacabana Beach', 'Ipanema Beach', 'Maracanã Stadium'],
    travelCategories: ['beach', 'culture', 'music', 'nature', 'festival'],
    estimatedBudget: { min: 800, max: 3000, currency: 'USD' },
    lat: -22.9068,
    lng: -43.1729,
  },
  {
    name: 'Cancun',
    country: 'Mexico',
    countryCode: 'MX',
    description: 'A Caribbean paradise with stunning turquoise waters, ancient Mayan ruins, and vibrant nightlife.',
    travelTips: [
      'Book a day trip to Chichén Itzá early to beat crowds.',
      'Use the R1 bus for cheap travel along the hotel zone.',
      'Bring reef-safe sunscreen for the cenotes.',
      'Try authentic cochinita pibil tacos.',
    ],
    bestTimeToVisit: 'December–April for dry, sunny weather.',
    currency: 'Mexican Peso (MXN)',
    language: 'Spanish',
    timezone: 'EST (UTC-5)',
    topAttractions: ['Chichén Itzá', 'Cancun Underwater Museum', 'Playa Delfines', 'Isla Mujeres', 'Xcaret Park'],
    travelCategories: ['beach', 'history', 'culture', 'food', 'nightlife'],
    estimatedBudget: { min: 700, max: 3000, currency: 'USD' },
    lat: 21.1619,
    lng: -86.8515,
  },

  // ── Oceania ──
  {
    name: 'Sydney',
    country: 'Australia',
    countryCode: 'AU',
    description: 'Australia\'s harbour city — iconic Opera House, stunning beaches, and a laid-back outdoor lifestyle.',
    travelTips: [
      'Take the Manly Ferry for breathtaking harbour views.',
      'Visit Bondi Beach early to secure a good spot.',
      'Book Opera House tickets for a performance, not just a tour.',
      'Explore the Rocks district for history and pubs.',
    ],
    bestTimeToVisit: 'October–April (warm months) for beach weather.',
    currency: 'Australian Dollar (AUD)',
    language: 'English',
    timezone: 'AEDT (UTC+11)',
    topAttractions: ['Sydney Opera House', 'Sydney Harbour Bridge', 'Bondi Beach', 'Taronga Zoo', 'The Rocks'],
    travelCategories: ['beach', 'nature', 'culture', 'food', 'outdoor'],
    estimatedBudget: { min: 1500, max: 5000, currency: 'AUD' },
    lat: -33.8688,
    lng: 151.2093,
  },
  {
    name: 'Maldives',
    country: 'Maldives',
    countryCode: 'MV',
    description: 'Paradise on Earth — crystal-clear turquoise waters, overwater bungalows, and incredible marine life.',
    travelTips: [
      'Book a resort with a house reef for the best snorkeling.',
      'Visit during the dry season for perfect weather.',
      'Pack reef-safe sunscreen to protect coral.',
      'Consider local island guesthouses for budget stays.',
    ],
    bestTimeToVisit: 'November–April (dry season) for perfect beach weather.',
    currency: 'Maldivian Rufiyaa (MVR)',
    language: 'Dhivehi',
    timezone: 'MVT (UTC+5)',
    topAttractions: ['Male Atoll', 'Biyadhoo Island', 'Manta Point', 'Dhigali Haa', 'Sunset Fishing'],
    travelCategories: ['beach', 'diving', 'romantic', 'luxury', 'nature'],
    estimatedBudget: { min: 2000, max: 10000, currency: 'USD' },
    lat: 3.2028,
    lng: 73.2207,
  },
];

async function runSeed() {
  console.log(`[SeedDestinations] Seeding ${SEED_DATA.length} destinations to Firestore...`);
  
  const batch = db.batch();
  const collectionRef = db.collection('destinations');
  
  for (const dest of SEED_DATA) {
    const docId = `${dest.countryCode}_${dest.name.replace(/\s+/g, '_')}`;
    const docRef = collectionRef.doc(docId);
    batch.set(docRef, {
      ...dest,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ ${dest.name} (${dest.countryCode})`);
  }
  
  await batch.commit();
  console.log(`\n✅ Successfully seeded ${SEED_DATA.length} destinations!`);
}

runSeed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});