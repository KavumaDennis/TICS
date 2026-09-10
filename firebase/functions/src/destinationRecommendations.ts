/**
 * destinationRecommendations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloud Function that generates personalized travel destination recommendations.
 *
 * Architecture:
 * 1. Phone sends user context (country, trips, preferences, location)
 * 2. Function queries Firestore `destinations` collection for candidates
 * 3. Filters by: location proximity, season, budget, categories, travel history
 * 4. Generates top 20 candidates - with strong regional bias
 * 5. Calls Gemini to RANK the top 20 (not generate from scratch)
 * 6. Enriches with weather data and images
 * 7. Caches result in Firestore under users/{uid}/recommendationCache
 * 8. Returns top 10 to the phone
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

const db = admin.firestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface UserContext {
  uid: string;
  country?: string;
  countryCode?: string;
  preferredLanguage?: string;
  savedDestinations?: string[];
  travelPreferences?: string[];
  interests?: string[];
  budget?: { min?: number; max?: number; currency?: string };
  favoriteTravelStyles?: string[];
  activeTrip?: {
    destination?: string;
    travelDates?: { start: string; end: string };
    transportType?: string;
  } | null;
  previousTripPatterns?: {
    frequentCategories: string[];
    frequentRegions: string[];
    visitedDestinations: string[];
    travelStyle: string;
  };
  currentLat?: number;
  currentLng?: number;
}

interface FirestoreDestination {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  image: string;
  pexelsQuery: string;
  description: string;
  travelTips: string[];
  bestTimeToVisit: string;
  currency: string;
  language: string;
  timezone: string;
  topAttractions: string[];
  travelCategories: string[];
  estimatedBudget: { min: number; max: number; currency: string } | null;
  category: string;
  lat: number;
  lng: number;
}

interface ScoreBreakdown {
  proximity: number;
  similarity: number;
  season: number;
  weather: number;
  geminiRanking: number;
  budget: number;
  regionalBonus: number;
}

interface ScoredDestination extends FirestoreDestination {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reason: string;
  reasons: string[];
  aiInsight: string;
  insightExpiresAt?: admin.firestore.Timestamp;
}

interface GeminiRanking {
  name: string;
  rank: number;
  adjustedScore: number;
  reasons: string[];
  matchExplanation: string;
}

interface CachedRecommendation {
  userId: string;
  contextHash: string;
  recommendations: ScoredDestination[];
  createdAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INSIGHT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 25;
const TOP_RESULTS = 10;

const CATEGORIES = [
  { id: 'all', label: 'Recommended for You' },
  { id: 'nearby', label: 'Trending Near You' },
  { id: 'weekend', label: 'Weekend Getaways' },
  { id: 'budget', label: 'Budget Friendly' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'beach', label: 'Beach Escapes' },
  { id: 'business', label: 'Business Destinations' },
  { id: 'culture', label: 'Cultural Hotspots' },
  { id: 'romantic', label: 'Romantic Getaways' },
];

/**
 * REGIONAL BIAS MAP:
 * Maps country codes to regions that should be prioritized.
 * When a user is from a region, destinations in that same region
 * get a significant scoring boost.
 */
const REGIONS: Record<string, { name: string; countries: string[] }> = {
  east_africa: { name: 'East Africa', countries: ['UG', 'KE', 'TZ', 'RW', 'BI', 'SS', 'ET', 'SO', 'DJ', 'ER'] },
  west_africa: { name: 'West Africa', countries: ['NG', 'GH', 'CI', 'SN', 'ML', 'BF', 'NE', 'TG', 'BJ', 'SL', 'LR', 'GN', 'GM', 'GW', 'CV', 'MR'] },
  southern_africa: { name: 'Southern Africa', countries: ['ZA', 'NA', 'BW', 'ZW', 'MZ', 'ZM', 'MW', 'AO', 'LS', 'SZ'] },
  north_africa: { name: 'North Africa', countries: ['MA', 'DZ', 'TN', 'LY', 'EG', 'SD'] },
  central_africa: { name: 'Central Africa', countries: ['CD', 'CG', 'GA', 'GQ', 'CM', 'CF', 'TD', 'ST'] },
  europe: { name: 'Europe', countries: ['FR', 'GB', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'IE', 'GR', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'RS', 'SK', 'SI', 'LT', 'LV', 'EE', 'IS', 'LU', 'MT', 'CY', 'AL', 'MK', 'BA', 'ME', 'XK', 'AD', 'LI', 'MC', 'SM', 'VA'] },
  asia: { name: 'Asia', countries: ['JP', 'KR', 'CN', 'TW', 'HK', 'MO', 'IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'TH', 'VN', 'ID', 'PH', 'MY', 'SG', 'KH', 'LA', 'MM', 'BN', 'TL', 'MN', 'KZ', 'UZ', 'TM', 'KG', 'TJ', 'AF', 'IR', 'IQ', 'SA', 'AE', 'QA', 'KW', 'OM', 'BH', 'JO', 'LB', 'IL', 'PS', 'YE', 'SY', 'TR', 'GE', 'AM', 'AZ'] },
  north_america: { name: 'North America', countries: ['US', 'CA', 'MX', 'GT', 'BZ', 'SV', 'HN', 'NI', 'CR', 'PA'] },
  south_america: { name: 'South America', countries: ['BR', 'AR', 'CL', 'PE', 'CO', 'EC', 'VE', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF'] },
  oceania: { name: 'Oceania', countries: ['AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'WS', 'TO', 'FM', 'MH', 'PW', 'KI', 'TV', 'NR'] },
  caribbean: { name: 'Caribbean', countries: ['CU', 'DO', 'PR', 'JM', 'TT', 'HT', 'BS', 'BB', 'LC', 'VC', 'GD', 'AG', 'DM', 'KN', 'KY', 'BM', 'AW', 'CW', 'BQ', 'SX', 'MF', 'GP', 'MQ', 'TC', 'VG', 'VI', 'AI', 'MS', 'BL'] },
};

function getUserRegion(countryCode: string | undefined): string | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  for (const [regionName, region] of Object.entries(REGIONS)) {
    if (region.countries.includes(cc)) return regionName;
  }
  return null;
}

function getRegionalDestinations(regionName: string | null): string[] {
  if (!regionName || !REGIONS[regionName]) return [];
  return REGIONS[regionName].countries;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getCurrentSeason(): { season: string; month: number } {
  const month = new Date().getMonth() + 1;
  let season: string;
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';
  return { season, month };
}

function getSeasonalDestinations(month: number): string[] {
  if (month === 12 || month === 1 || month === 2) {
    return ['Cape Town', 'Sydney', 'Maldives', 'Bali', 'Dubai', 'Zanzibar', 'Miami', 'Rio de Janeiro', 'Mombasa', 'Dar es Salaam'];
  }
  if (month >= 3 && month <= 5) {
    return ['Paris', 'Rome', 'Tokyo', 'London', 'Amsterdam', 'Barcelona', 'Kyoto', 'Nairobi', 'Marrakech'];
  }
  if (month >= 6 && month <= 8) {
    return ['Paris', 'Santorini', 'Rome', 'Barcelona', 'Ibiza', 'Mykonos', 'Nice', 'Maldives', 'Zanzibar', 'Cape Town'];
  }
  return ['New York', 'London', 'Paris', 'Tokyo', 'Bali', 'Singapore', 'Hong Kong', 'Dubai', 'Nairobi'];
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function hashContext(context: UserContext): string {
  const relevant = {
    uid: context.uid,
    country: context.country,
    countryCode: context.countryCode,
    travelPreferences: context.travelPreferences?.sort(),
    interests: context.interests?.sort(),
    savedDestinations: context.savedDestinations?.sort(),
    budget: context.budget,
    favoriteTravelStyles: context.favoriteTravelStyles?.sort(),
    activeTrip: context.activeTrip?.destination ? { destination: context.activeTrip.destination } : null,
    previousTripPatterns: context.previousTripPatterns ? {
      frequentCategories: context.previousTripPatterns.frequentCategories?.sort(),
      frequentRegions: context.previousTripPatterns.frequentRegions?.sort(),
      travelStyle: context.previousTripPatterns.travelStyle,
    } : null,
    currentLat: context.currentLat ? Math.round(context.currentLat * 10) : undefined,
    currentLng: context.currentLng ? Math.round(context.currentLng * 10) : undefined,
  };
  let hash = 0;
  const str = JSON.stringify(relevant);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/* ── Scoring Functions ─────────────────────────────────────────────────────── */

function calculateProximityScore(userLat?: number, userLng?: number, destLat?: number, destLng?: number): number {
  if (!userLat || !userLng || !destLat || !destLng) return 8; // neutral without GPS
  const dist = haversineDistance(userLat, userLng, destLat, destLng);
  if (dist < 300) return 25;   // Very close - boosted
  if (dist < 800) return 22;   // Regional - boosted
  if (dist < 1500) return 18;
  if (dist < 3000) return 14;
  if (dist < 6000) return 10;
  if (dist < 10000) return 6;
  return 3; // Far away
}

/**
 * REGIONAL BONUS: Big boost for destinations in the same region as the user.
 * This ensures users in Uganda see Nairobi, Kigali, Zanzibar etc. at the top.
 */
function calculateRegionalBonus(userCountryCode: string | undefined, destCountryCode: string): number {
  if (!userCountryCode) return 0;
  const userRegion = getUserRegion(userCountryCode);
  const destRegion = getUserRegion(destCountryCode);
  if (!userRegion || !destRegion) return 0;

  // Same region = big boost
  if (userRegion === destRegion) {
    // Extra boost for African regions where regional travel is common
    if (['east_africa', 'west_africa', 'southern_africa', 'central_africa', 'north_africa'].includes(userRegion)) {
      return 30; // Massive boost for intra-African travel
    }
    return 20; // Standard regional boost
  }

  // Nearby region (same continent) = small boost
  const continentMap: Record<string, string> = {
    east_africa: 'africa', west_africa: 'africa', southern_africa: 'africa', north_africa: 'africa', central_africa: 'africa',
    europe: 'europe', asia: 'asia', north_america: 'americas', south_america: 'americas', caribbean: 'americas',
    oceania: 'oceania',
  };
  if (continentMap[userRegion] && continentMap[destRegion] && continentMap[userRegion] === continentMap[destRegion]) {
    return 5;
  }

  return 0;
}

function calculateSimilarityScore(categories: string[], context: UserContext): number {
  const patterns = context.previousTripPatterns;
  if (!patterns) return 10;
  let score = 0;
  const frequentCategories = patterns.frequentCategories.map((c) => c.toLowerCase());
  for (const cat of categories) {
    if (frequentCategories.includes(cat.toLowerCase())) score += 8;
  }
  return Math.min(score, 25);
}

function calculateSeasonScore(destinationName: string, month: number): number {
  const seasonal = getSeasonalDestinations(month);
  if (seasonal.some((d) => d.toLowerCase() === destinationName.toLowerCase())) return 20;
  return 10;
}

function calculateBudgetScore(
  estimatedBudget: { min: number; max: number; currency: string } | null,
  userBudget?: { min?: number; max?: number; currency?: string }
): number {
  if (!estimatedBudget || !userBudget?.max) return 10;
  const destMid = (estimatedBudget.min + estimatedBudget.max) / 2;
  if (destMid <= userBudget.max) return 10;
  if (destMid <= userBudget.max * 1.5) return 5;
  return 0;
}

function getUserCategoryPreferences(context: UserContext): string[] {
  const prefs: string[] = [];
  if (context.travelPreferences) prefs.push(...context.travelPreferences);
  if (context.favoriteTravelStyles) prefs.push(...context.favoriteTravelStyles);
  if (context.previousTripPatterns?.frequentCategories) prefs.push(...context.previousTripPatterns.frequentCategories);
  if (context.interests) prefs.push(...context.interests);
  return [...new Set(prefs.map((p) => p.toLowerCase()))];
}

/* ── Weather Check ─────────────────────────────────────────────────────────── */

async function checkDestinationWeather(lat: number, lng: number, apiKey: string): Promise<{ score: number; isSevere: boolean }> {
  if (!apiKey) return { score: 15, isSevere: false };
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return { score: 15, isSevere: false };
    const data: any = await res.json();
    const main = (data.weather?.[0]?.main ?? '').toLowerCase();
    const temp = data.main?.temp ?? 25;
    const severe = ['thunderstorm', 'hurricane', 'tornado', 'extreme'];
    if (severe.some((c) => main.includes(c))) return { score: 0, isSevere: true };
    if (temp >= 20 && temp <= 30) return { score: 15, isSevere: false };
    if (temp >= 10 && temp <= 35) return { score: 10, isSevere: false };
    if (main.includes('rain') || main.includes('snow') || main.includes('storm')) return { score: 5, isSevere: false };
    return { score: 8, isSevere: false };
  } catch {
    return { score: 15, isSevere: false };
  }
}

/* ── Image Resolution ──────────────────────────────────────────────────────── */

async function resolveImage(dest: FirestoreDestination): Promise<string> {
  if (dest.image && dest.image.startsWith('http')) return dest.image;

  const cacheRef = db.collection('country_images').doc(dest.countryCode);
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      const data = snap.data() as { images?: string[] };
      if (data.images?.length) return data.images[0];
    }
  } catch { /* proceed */ }

  try {
    const apiKey = process.env.EXPO_PUBLIC_PEXELS_API_KEY || '';
    if (apiKey && dest.pexelsQuery) {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(dest.pexelsQuery)}&per_page=3&orientation=landscape`;
      const res = await fetch(url, { headers: { Authorization: apiKey } });
      if (res.ok) {
        const data: any = await res.json();
        if (data.photos?.length) {
          const urls = data.photos.slice(0, 3).map((p: any) => p.src.large);
          await cacheRef.set({ country: dest.country, images: urls, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return urls[0];
        }
      }
    }
  } catch { /* proceed */ }

  const fallbacks: Record<string, string> = {
    FR: 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600',
    JP: 'https://images.pexels.com/photos/2614818/pexels-photo-2614818.jpeg?auto=compress&cs=tinysrgb&w=600',
    US: 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600',
    AE: 'https://images.pexels.com/photos/1470502/pexels-photo-1470502.jpeg?auto=compress&cs=tinysrgb&w=600',
    ID: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=600',
    GB: 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600',
    ZA: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600',
    IT: 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600',
    AU: 'https://images.pexels.com/photos/1878293/pexels-photo-1878293.jpeg?auto=compress&cs=tinysrgb&w=600',
    GR: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=600',
    MV: 'https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=600',
    KE: 'https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600',
    TZ: 'https://images.pexels.com/photos/11577976/pexels-photo-11577976.jpeg?auto=compress&cs=tinysrgb&w=600',
    RW: 'https://images.pexels.com/photos/773471/pexels-photo-773471.jpeg?auto=compress&cs=tinysrgb&w=600',
    UG: 'https://images.pexels.com/photos/12844035/pexels-photo-12844035.jpeg?auto=compress&cs=tinysrgb&w=600',
    ET: 'https://images.pexels.com/photos/1559819/pexels-photo-1559819.jpeg?auto=compress&cs=tinysrgb&w=600',
    MA: 'https://images.pexels.com/photos/5964820/pexels-photo-5964820.jpeg?auto=compress&cs=tinysrgb&w=600',
    ES: 'https://images.pexels.com/photos/1388030/pexels-photo-1388030.jpeg?auto=compress&cs=tinysrgb&w=600',
    NG: 'https://images.pexels.com/photos/1645232/pexels-photo-1645232.jpeg?auto=compress&cs=tinysrgb&w=600',
    GH: 'https://images.pexels.com/photos/10589668/pexels-photo-10589668.jpeg?auto=compress&cs=tinysrgb&w=600',
    BR: 'https://images.pexels.com/photos/1531660/pexels-photo-1531660.jpeg?auto=compress&cs=tinysrgb&w=600',
    MX: 'https://images.pexels.com/photos/805412/pexels-photo-805412.jpeg?auto=compress&cs=tinysrgb&w=600',
    SG: 'https://images.pexels.com/photos/971349/pexels-photo-971349.jpeg?auto=compress&cs=tinysrgb&w=600',
    IN: 'https://images.pexels.com/photos/753639/pexels-photo-753639.jpeg?auto=compress&cs=tinysrgb&w=600',
  };
  return fallbacks[dest.countryCode] || 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600';
}

/* ── Gemini Ranking ────────────────────────────────────────────────────────── */

async function rankWithGemini(
  candidates: ScoredDestination[],
  context: UserContext,
  apiKey: string
): Promise<ScoredDestination[]> {
  if (!apiKey || candidates.length === 0) return candidates;

  const { season, month } = getCurrentSeason();
  const monthName = new Date(0, month - 1).toLocaleString('en', { month: 'long' });

  const destinationsList = candidates.map((d, i) =>
    `${i + 1}. ${d.name}, ${d.country} (${d.countryCode}) - Score: ${d.score} - RegionalBonus: ${d.scoreBreakdown.regionalBonus}`
  ).join('\n');

  const prompt = `You are a travel ranking AI. Rank these ${candidates.length} destinations for this specific traveler.

TRAVELER PROFILE:
- From: ${context.country || 'Unknown'} (${context.countryCode || 'N/A'})
- Interests: ${context.interests?.join(', ') || 'Not specified'}
- Budget: ${context.budget?.max ? `Up to ${context.budget.currency || 'USD'} ${context.budget.max}` : 'Not specified'}

TRAVEL HISTORY:
- Frequent categories: ${context.previousTripPatterns?.frequentCategories?.join(', ') || 'First-time traveler'}
- Travel style: ${context.previousTripPatterns?.travelStyle || 'General'}

CURRENT CONTEXT:
- Season: ${season} (${monthName})
- Current location: ${context.currentLat ? `${context.currentLat}, ${context.currentLng}` : context.country || 'Unknown'}

DESTINATIONS TO RANK:
${destinationsList}

IMPORTANT: Prioritize destinations that are REGIONALLY RELEVANT to this traveler. If they're from East Africa, regional destinations like Nairobi, Kigali, Dar es Salaam should rank higher than distant ones like Paris or Barcelona.

Return ONLY valid JSON:
{
  "rankings": [
    {
      "name": "Nairobi",
      "rank": 1,
      "adjustedScore": 95,
      "reasons": ["Regional hub close to your location", "Excellent safari and culture", "Great weather this month"],
      "matchExplanation": "Nairobi is ideal for you — it's a short flight from Uganda, has excellent connectivity, and the wildlife viewing is at its peak this season."
    }
  ]
}

adjustedScore ranges 0-100. Provide 1-3 concise reasons per destination.`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!resp.ok) {
      logger.warn(`Gemini ranking returned ${resp.status}, using algorithmic scores`);
      return candidates;
    }

    const json: any = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Gemini ranking: no JSON found in response');
      return candidates;
    }

    const parsed: { rankings?: GeminiRanking[] } = JSON.parse(jsonMatch[0]);
    if (!parsed.rankings?.length) return candidates;

    const rankingMap = new Map(parsed.rankings.map((r: GeminiRanking) => [r.name, r]));
    for (const dest of candidates) {
      const rank = rankingMap.get(dest.name);
      if (rank) {
        dest.score += Math.round((rank.adjustedScore / 100) * 20);
        dest.scoreBreakdown.geminiRanking = Math.round((rank.adjustedScore / 100) * 20);
        dest.reasons = rank.reasons || [];
        dest.reason = rank.reasons?.[0] || dest.reason;
        dest.aiInsight = rank.matchExplanation || dest.aiInsight;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  } catch (err) {
    logger.warn('Gemini ranking error:', err);
    return candidates;
  }
}

/* ── Generate Reasons ──────────────────────────────────────────────────────── */

function generateReasons(dest: ScoredDestination, context: UserContext, month: number): string[] {
  const reasons: string[] = [];

  if (dest.scoreBreakdown.proximity >= 18) reasons.push('Close to your current location');
  if (dest.scoreBreakdown.regionalBonus >= 20) {
    const userRegion = getUserRegion(context.countryCode);
    if (userRegion === 'east_africa') {
      reasons.push('Popular destination in East Africa');
    } else {
      reasons.push(`Popular in your region`);
    }
  }

  if (dest.scoreBreakdown.similarity >= 15) {
    const style = context.previousTripPatterns?.travelStyle;
    if (style === 'beach' && dest.travelCategories.includes('beach')) {
      reasons.push('Similar to your previous beach trips');
    } else if (style === 'safari' && dest.travelCategories.includes('safari')) {
      reasons.push('Matches your safari travel style');
    } else if (style === 'business' && dest.travelCategories.includes('business')) {
      reasons.push('Great for business travel');
    } else {
      reasons.push('Matches your travel preferences');
    }
  }

  const seasonalDests = getSeasonalDestinations(month);
  if (seasonalDests.some((d) => d.toLowerCase() === dest.name.toLowerCase())) {
    const monthName = new Date(0, month - 1).toLocaleString('en', { month: 'long' });
    reasons.push(`Perfect destination for ${monthName} travel`);
  }

  if (dest.scoreBreakdown.budget >= 10) reasons.push('Fits your budget');
  if (dest.travelCategories.includes('beach')) reasons.push('Beautiful beaches');
  if (dest.travelCategories.includes('safari')) reasons.push('Incredible wildlife experiences');
  if (dest.travelCategories.includes('adventure')) reasons.push('Perfect for adventure seekers');
  if (dest.travelCategories.includes('culture')) reasons.push('Rich cultural experiences');
  if (dest.travelCategories.includes('nature')) reasons.push('Stunning natural landscapes');

  return reasons.slice(0, 3);
}

/* ── AI Insight Generation (30-day cached) ─────────────────────────────────── */

async function generateAIInsight(
  dest: ScoredDestination,
  context: UserContext,
  apiKey: string
): Promise<{ insight: string; expiresAt: admin.firestore.Timestamp }> {
  if (!apiKey) return { insight: dest.reason, expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + INSIGHT_TTL_MS) };

  const { season } = getCurrentSeason();
  const prompt = `Generate a 2-3 sentence personalized travel insight about why ${dest.name}, ${dest.country} is ideal for this traveler.

Traveler: from ${context.country || 'Unknown'}, located in ${context.countryCode || 'N/A'}
Season: ${season}
Reason recommended: ${dest.reasons?.[0] || dest.reason}
Distance: ${dest.scoreBreakdown.proximity > 15 ? 'nearby' : 'further away'}
Region: ${dest.scoreBreakdown.regionalBonus > 0 ? 'same region as traveler' : 'different region'}

Return ONLY the insight text, no prefixes, no markdown. Example: "Nairobi is ideal for your July trip — it's a short flight from Kampala, the weather is perfect for safari, and you'll find direct connections from Entebbe Airport."`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 256 },
        }),
      }
    );

    if (resp.ok) {
      const json: any = await resp.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) {
        return {
          insight: text.trim(),
          expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + INSIGHT_TTL_MS),
        };
      }
    }
  } catch { /* proceed */ }

  return {
    insight: dest.reason,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + INSIGHT_TTL_MS),
  };
}

/* ── Main Recommendation Pipeline ──────────────────────────────────────────── */

export const generateDestinationRecommendations = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const context = req.data as UserContext;
    if (!context?.uid) throw new HttpsError('invalid-argument', 'User context is required.');

    const { month } = getCurrentSeason();
    const geminiApiKey: string = GEMINI_API_KEY.value() || process.env.GEMINI_API_KEY || '';
    const weatherApiKey: string = process.env.OPENWEATHER_API_KEY || '';

    logger.info(`[DestinationRecs] Generating for ${uid} from ${context.country || 'unknown'} (${context.countryCode || '??'})`);

    try {
      // Step 0: Check cache
      const cacheRef = db.collection('users').doc(uid).collection('recommendationCache');
      const cacheSnap = await cacheRef.orderBy('createdAt', 'desc').limit(1).get();
      if (!cacheSnap.empty) {
        const cache = cacheSnap.docs[0].data() as CachedRecommendation;
        const age = Date.now() - cache.createdAt.toMillis();
        const currentHash = hashContext(context);
        if (age < CACHE_TTL_MS && cache.contextHash === currentHash) {
          logger.info(`[DestinationRecs] Cache hit for ${uid}`);
          return { recommendations: cache.recommendations, categories: CATEGORIES, cacheAge: age };
        }
        await cacheSnap.docs[0].ref.delete();
      }

      // Step 1: Fetch ALL destinations from Firestore
      const destsSnap = await db.collection('destinations').get();
      const allDestinations = destsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as FirestoreDestination[];

      if (allDestinations.length === 0) {
        throw new HttpsError('unavailable', 'No destinations found in database. Seed the destinations collection first.');
      }

      // Step 2: Get user category preferences
      const userPrefs = getUserCategoryPreferences(context);

      // Step 3: Filter candidates by category/preference
      let candidates = allDestinations;
      if (userPrefs.length > 0) {
        const preferred = allDestinations.filter((d) =>
          d.travelCategories.some((cat) => userPrefs.includes(cat.toLowerCase()))
        );
        if (preferred.length >= 5) {
          candidates = [...preferred, ...allDestinations.filter((d) => !preferred.includes(d))];
        }
      }

      // Step 4: Score each candidate with REGIONAL BIAS (no API calls - fast scoring)
      const userRegion = getUserRegion(context.countryCode);
      logger.info(`[DestinationRecs] User region: ${userRegion}, countryCode: ${context.countryCode}`);

      const scored: ScoredDestination[] = [];
      for (const dest of candidates) {
        const proximityScore = calculateProximityScore(context.currentLat, context.currentLng, dest.lat, dest.lng);
        const similarityScore = calculateSimilarityScore(dest.travelCategories, context);
        const seasonScore = calculateSeasonScore(dest.name, month);
        const budgetScore = calculateBudgetScore(dest.estimatedBudget, context.budget);
        const regionalBonus = calculateRegionalBonus(context.countryCode, dest.countryCode);

        // Use neutral weather score (15) initially; actual weather check is deferred to top candidates only
        const baseScore = proximityScore + similarityScore + seasonScore + 15 + budgetScore + regionalBonus;

        scored.push({
          ...dest,
          image: dest.image || '',
          score: baseScore,
          scoreBreakdown: {
            proximity: proximityScore,
            similarity: similarityScore,
            season: seasonScore,
            weather: 15, // placeholder – will be refined for top candidates
            geminiRanking: 0,
            budget: budgetScore,
            regionalBonus,
          },
          reason: '',
          reasons: [],
          aiInsight: '',
        });
      }

      // Step 5: Sort by score and get top 25 candidates
      scored.sort((a, b) => b.score - a.score);
      const top25 = scored.slice(0, MAX_CANDIDATES);

      // Step 5b: Enrich top 25 candidates with weather & images (CONCURRENTLY – no sequential API calls)
      logger.info(`[DestinationRecs] Enriching ${top25.length} candidates with weather + images...`);
      const enrichmentResults = await Promise.allSettled(
        top25.map(async (dest) => {
          const [weather, image] = await Promise.all([
            dest.lat && dest.lng
              ? checkDestinationWeather(dest.lat, dest.lng, weatherApiKey)
              : Promise.resolve({ score: 15, isSevere: false }),
            resolveImage(dest),
          ]);
          return { dest, weather, image };
        })
      );

      // Apply enrichment results and filter out severe weather
      const enriched: ScoredDestination[] = [];
      for (const result of enrichmentResults) {
        if (result.status === 'rejected') {
          // If enrichment failed, keep the candidate with neutral defaults
          continue;
        }
        const { dest, weather, image } = result.value;
        if (weather.isSevere) continue; // Skip destinations with severe weather
        dest.scoreBreakdown.weather = weather.score;
        // Adjust score: replace neutral 15 with actual weather score
        dest.score = dest.score - 15 + weather.score;
        dest.image = image;
        enriched.push(dest);
      }

      // Use enriched set, or fall back to original top25 if enrichment emptied the list
      const finalCandidates = enriched.length >= 5 ? enriched : top25;

      logger.info(`[DestinationRecs] Top 5 after scoring: ${finalCandidates.slice(0, 5).map((d) => `${d.name}(${d.countryCode}):${d.score}(regional:${d.scoreBreakdown.regionalBonus})`).join(', ')}`);

      // Step 6: Gemini ranks the top candidates
      const ranked = await rankWithGemini(finalCandidates, context, geminiApiKey);

      // Step 7: Generate reasons and AI insights for top 10
      const top10 = ranked.slice(0, TOP_RESULTS);
      for (const dest of top10) {
        if (!dest.reasons?.length) {
          dest.reasons = generateReasons(dest, context, month);
        }
        dest.reason = dest.reasons?.[0] || dest.reason || 'Recommended for you';
        const { insight, expiresAt } = await generateAIInsight(dest, context, geminiApiKey);
        dest.aiInsight = insight;
        dest.insightExpiresAt = expiresAt;
      }

      // Step 8: Cache the results
      await cacheRef.add({
        userId: uid,
        contextHash: hashContext(context),
        recommendations: top10,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + CACHE_TTL_MS),
      } as CachedRecommendation);

      // Cleanup old cache
      const allCache = await cacheRef.orderBy('createdAt', 'desc').get();
      if (allCache.docs.length > 3) {
        const batch = db.batch();
        allCache.docs.slice(3).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      const categorized = assignToCategories(top10, context);

      return { recommendations: top10, categories: CATEGORIES, categorized, cached: false };
    } catch (err) {
      logger.error(`[DestinationRecs] Error for ${uid}:`, err);
      throw new HttpsError('internal', 'Failed to generate recommendations. Please try again.');
    }
  }
);

/* ── Categorize Recommendations ────────────────────────────────────────────── */

function assignToCategories(recommendations: ScoredDestination[], context: UserContext): Record<string, ScoredDestination[]> {
  const categorized: Record<string, ScoredDestination[]> = {
    all: recommendations, nearby: [], weekend: [], budget: [], adventure: [], beach: [], business: [], culture: [], romantic: [],
  };

  for (const dest of recommendations) {
    if (dest.scoreBreakdown.proximity >= 15 || dest.scoreBreakdown.regionalBonus >= 15) categorized.nearby.push(dest);
    if (dest.scoreBreakdown.proximity >= 10 && !dest.travelCategories.includes('business')) categorized.weekend.push(dest);
    if (dest.estimatedBudget && context.budget?.max) {
      const destMid = (dest.estimatedBudget.min + dest.estimatedBudget.max) / 2;
      if (destMid <= (context.budget.max * 0.7)) categorized.budget.push(dest);
    }
    if (dest.travelCategories.some((c) => ['adventure', 'nature', 'safari', 'diving', 'surf', 'hiking'].includes(c))) categorized.adventure.push(dest);
    if (dest.travelCategories.includes('beach')) categorized.beach.push(dest);
    if (dest.travelCategories.includes('business')) categorized.business.push(dest);
    if (dest.travelCategories.some((c) => ['culture', 'history', 'art', 'food'].includes(c))) categorized.culture.push(dest);
    if (dest.travelCategories.includes('romantic')) categorized.romantic.push(dest);
  }

  for (const key of Object.keys(categorized)) {
    const seen = new Set<string>();
    categorized[key] = categorized[key].filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    }).slice(0, 6);
  }

  return categorized;
}

/* ── Log User Interaction ──────────────────────────────────────────────────── */

export const logDestinationInteraction = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { destinationName, action, context: interactionContext } = req.data as {
    destinationName: string;
    action: 'viewed' | 'saved' | 'ignored' | 'booked';
    context?: Record<string, unknown>;
  };

  if (!destinationName || !action) throw new HttpsError('invalid-argument', 'destinationName and action are required.');
  if (!['viewed', 'saved', 'ignored', 'booked'].includes(action)) throw new HttpsError('invalid-argument', 'invalid action');

  await db.collection('users').doc(uid).collection('destinationInteractions').add({
    userId: uid, destinationName, action,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    context: interactionContext || {},
  });

  const scoreDocId = destinationName.replace(/\s+/g, '_').toLowerCase();
  const scoreIncrement = action === 'booked' ? 20 : action === 'saved' ? 10 : action === 'viewed' ? 2 : -5;

  await db.collection('users').doc(uid).collection('destinationScores').doc(scoreDocId).set({
    destinationName,
    score: admin.firestore.FieldValue.increment(scoreIncrement),
    lastAction: action,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (action === 'saved' || action === 'booked') {
    const cacheSnap = await db.collection('users').doc(uid).collection('recommendationCache').get();
    const batch = db.batch();
    cacheSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  return { ok: true };
});