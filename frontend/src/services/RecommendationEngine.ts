/**
 * RecommendationEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core recommendation engine that generates personalized travel destinations
 * based on user profile, trip history, location, season, weather, and AI trends.
 *
 * Data Flow:
 * 1. Gather user context (profile, trips, location, season, weather)
 * 2. Query Gemini AI for personalized destination suggestions
 * 3. Enrich with Firestore destination metadata
 * 4. Fetch Pexels images for each destination
 * 5. Score and rank destinations
 * 6. Return top 10
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { fetchCountryImages } from '@/src/services/PexelsService';
import { assistantChat } from '@/src/firebase/callables';
import {
  getAllDestinations,
  getDestinationsByCategories,
  type DestinationMetadata,
} from '@/src/services/DestinationsService';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface UserTravelContext {
  uid: string;
  // Profile
  country?: string;
  preferredLanguage?: string;
  savedDestinations?: string[];
  travelPreferences?: string[];
  interests?: string[];
  budget?: { min?: number; max?: number; currency?: string };
  favoriteTravelStyles?: string[];
  // Current trip
  activeTrip?: {
    destination?: string;
    travelDates?: { start: string; end: string };
    transportType?: string;
  } | null;
  // Previous trips - analyzed patterns
  previousTripPatterns?: {
    frequentCategories: string[];
    frequentRegions: string[];
    visitedDestinations: string[];
    travelStyle: string;
  };
  // Location
  currentLat?: number;
  currentLng?: number;
  countryCode?: string;
}

export interface ScoredDestination {
  name: string;
  country: string;
  countryCode: string;
  image: string;
  description: string;
  travelTips: string[];
  bestTimeToVisit: string;
  currency: string;
  language: string;
  timezone: string;
  topAttractions: string[];
  travelCategories: string[];
  estimatedBudget: { min: number; max: number; currency: string } | null;
  score: number;
  scoreBreakdown: {
    proximity: number;
    similarity: number;
    season: number;
    weather: number;
    geminiPopularity: number;
    budget: number;
  };
  reason: string;
  aiInsight: string;
  lat: number;
  lng: number;
}

interface GeminiDestination {
  name: string;
  country: string;
  countryCode: string;
  reason: string;
  popularityScore: number;
  travelCategories: string[];
}

interface GeminiResponse {
  destinations: GeminiDestination[];
}

/* ── Scoring Weights ───────────────────────────────────────────────────────── */

const WEIGHTS = {
  PROXIMITY: 20,
  SIMILARITY: 25,
  SEASON: 20,
  WEATHER: 15,
  GEMINI_POPULARITY: 20,
  BUDGET: 10, // bonus if within budget
  MAX_TOTAL: 110, // budget is bonus
};

/* ── Season Helper ─────────────────────────────────────────────────────────── */

function getCurrentSeason(): { season: string; month: number } {
  const month = new Date().getMonth() + 1; // 1-12
  let season: string;
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  else season = 'winter';
  return { season, month };
}

function getSeasonalDestinations(month: number): string[] {
  // Winter (Dec-Feb): warm destinations
  if (month === 12 || month === 1 || month === 2) {
    return ['Cape Town', 'Sydney', 'Maldives', 'Bali', 'Dubai', 'Zanzibar', 'Miami', 'Rio de Janeiro'];
  }
  // Spring (Mar-May): mild weather destinations
  if (month >= 3 && month <= 5) {
    return ['Paris', 'Rome', 'Tokyo', 'London', 'Amsterdam', 'Barcelona', 'Kyoto'];
  }
  // Summer (Jun-Aug): European summer
  if (month >= 6 && month <= 8) {
    return ['Paris', 'Santorini', 'Rome', 'Barcelona', 'Ibiza', 'Mykonos', 'Nice', 'Maldives'];
  }
  // Fall (Sep-Nov): mild weather
  return ['New York', 'London', 'Paris', 'Tokyo', 'Bali', 'Singapore', 'Hong Kong'];
}

/* ── Weather Check ─────────────────────────────────────────────────────────── */

async function checkDestinationWeather(
  lat: number,
  lng: number
): Promise<{ score: number; isSevere: boolean }> {
  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
  if (!apiKey) return { score: 15, isSevere: false }; // default if no key

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return { score: 15, isSevere: false };

    const data = await res.json();
    const main = data.weather?.[0]?.main?.toLowerCase() ?? '';
    const temp = data.main?.temp ?? 25;

    // Severe weather conditions
    const severeConditions = ['thunderstorm', 'hurricane', 'tornado', 'extreme'];
    if (severeConditions.some((c) => main.includes(c))) {
      return { score: 0, isSevere: true };
    }

    // Score based on temperature
    if (temp >= 20 && temp <= 30) return { score: 15, isSevere: false }; // ideal
    if (temp >= 10 && temp <= 35) return { score: 10, isSevere: false }; // acceptable
    if (main.includes('rain') || main.includes('snow') || main.includes('storm')) {
      return { score: 5, isSevere: false };
    }
    return { score: 8, isSevere: false };
  } catch {
    return { score: 15, isSevere: false };
  }
}

/* ── Distance Calculation (Haversine) ──────────────────────────────────────── */

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ── Proximity Score ───────────────────────────────────────────────────────── */

function calculateProximityScore(
  userLat?: number,
  userLng?: number,
  destLat?: number,
  destLng?: number
): number {
  if (!userLat || !userLng || !destLat || !destLng) return 10; // neutral score
  const dist = haversineDistance(userLat, userLng, destLat, destLng);

  if (dist < 500) return 20; // very close
  if (dist < 1500) return 18; // regional
  if (dist < 3000) return 15; // nearby continent
  if (dist < 8000) return 10; // moderate distance
  return 5; // far away
}

/* ── Similarity Score ──────────────────────────────────────────────────────── */

function calculateSimilarityScore(
  destinationCategories: string[],
  userContext: UserTravelContext
): number {
  const patterns = userContext.previousTripPatterns;
  if (!patterns) return 10;

  let score = 0;
  const frequentCategories = patterns.frequentCategories.map((c) => c.toLowerCase());

  // Check if destination matches frequently visited categories
  for (const cat of destinationCategories) {
    if (frequentCategories.includes(cat.toLowerCase())) {
      score += 8;
    }
  }

  // Check if destination was visited before (slightly negative to promote discovery)
  if (
    patterns.visitedDestinations.some(
      (d) => d.toLowerCase() === userContext.savedDestinations?.find((s) => s.toLowerCase())
    )
  ) {
    score -= 5; // slightly penalize already-visited places
  }

  return Math.min(score, 25);
}

/* ── Season Compatibility Score ─────────────────────────────────────────────── */

function calculateSeasonScore(
  destinationName: string,
  month: number
): number {
  const seasonalDests = getSeasonalDestinations(month);
  if (seasonalDests.some((d) => d.toLowerCase() === destinationName.toLowerCase())) {
    return 20;
  }
  return 10; // neutral - not necessarily bad
}

/* ── Budget Score ──────────────────────────────────────────────────────────── */

function calculateBudgetScore(
  estimatedBudget: { min: number; max: number; currency: string } | null,
  userBudget?: { min?: number; max?: number; currency?: string }
): number {
  if (!estimatedBudget || !userBudget?.max) return 10; // neutral

  const destMid = (estimatedBudget.min + estimatedBudget.max) / 2;
  if (destMid <= userBudget.max) return 10; // within budget
  if (destMid <= userBudget.max * 1.5) return 5; // slightly over
  return 0; // over budget
}

/* ── Gemini AI Integration ─────────────────────────────────────────────────── */

async function callGeminiForDestinations(
  userContext: UserTravelContext
): Promise<GeminiDestination[]> {
  try {
    const prompt = buildGeminiPrompt(userContext);
    const res = await assistantChat({
      message: prompt,
      instruction: 'You are a travel recommendation AI. Generate personalized travel destinations in JSON only. Return ONLY valid JSON, no markdown, no explanation.',
    });

    if (res?.answer) {
      // Try to parse JSON from the response
      const jsonMatch = res.answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed: GeminiResponse = JSON.parse(jsonMatch[0]);
        if (parsed.destinations?.length) {
          return parsed.destinations;
        }
      }
    }

    console.warn('[RecommendationEngine] Unexpected Gemini response format');
    return getFallbackDestinations(userContext);
  } catch (err) {
    console.warn('[RecommendationEngine] Gemini call failed, using fallback:', err);
    return getFallbackDestinations(userContext);
  }
}

function buildGeminiPrompt(userContext: UserTravelContext): string {
  const { season, month } = getCurrentSeason();
  const monthName = new Date(0, month - 1).toLocaleString('en', { month: 'long' });

  return `Generate the best travel destinations for this traveler considering their profile, travel history, current location, interests, season, and global travel trends.

User Profile:
- Country: ${userContext.country || 'Unknown'}
- Interests: ${userContext.interests?.join(', ') || 'Not specified'}
- Travel preferences: ${userContext.travelPreferences?.join(', ') || 'Not specified'}
- Favorite travel styles: ${userContext.favoriteTravelStyles?.join(', ') || 'Not specified'}
- Saved destinations: ${userContext.savedDestinations?.join(', ') || 'None'}
- Budget: ${userContext.budget?.max ? `Up to ${userContext.budget.currency || 'USD'} ${userContext.budget.max}` : 'Not specified'}

Travel History Patterns:
- Frequent categories: ${userContext.previousTripPatterns?.frequentCategories?.join(', ') || 'First-time traveler'}
- Frequent regions: ${userContext.previousTripPatterns?.frequentRegions?.join(', ') || 'Various'}
- Travel style: ${userContext.previousTripPatterns?.travelStyle || 'General'}

Current Context:
- Season: ${season} (${monthName})
- Current location: ${userContext.currentLat ? `${userContext.currentLat}, ${userContext.currentLng}` : userContext.country || 'Unknown'}
- Active trip destination: ${userContext.activeTrip?.destination || 'No active trip'}

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "destinations": [
    {
      "name": "City Name",
      "country": "Country Name",
      "countryCode": "CC",
      "reason": "Brief 1-line explanation why this destination fits this traveler",
      "popularityScore": 85,
      "travelCategories": ["beach", "culture"]
    }
  ]
}

Generate 15 diverse destinations that are globally distributed. Include a mix of well-known and emerging destinations. Each popularityScore should be 0-100.`;
}

function getFallbackDestinations(userContext: UserTravelContext): GeminiDestination[] {
  const { month } = getCurrentSeason();
  const seasonal = getSeasonalDestinations(month);

  // Regional bias based on user's country
  const country = (userContext.country || '').toLowerCase();
  let regionalDests: GeminiDestination[] = [];

  if (['uganda', 'kenya', 'tanzania', 'rwanda', 'ethiopia', 'south sudan', 'burundi'].includes(country)) {
    regionalDests = [
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', reason: 'Regional hub with excellent connectivity', popularityScore: 85, travelCategories: ['safari', 'culture', 'business'] },
      { name: 'Kigali', country: 'Rwanda', countryCode: 'RW', reason: 'Cleanest city in Africa, vibrant culture', popularityScore: 78, travelCategories: ['culture', 'nature', 'safari'] },
      { name: 'Dar es Salaam', country: 'Tanzania', countryCode: 'TZ', reason: 'Coastal gateway to Zanzibar and Serengeti', popularityScore: 82, travelCategories: ['beach', 'safari', 'culture'] },
      { name: 'Addis Ababa', country: 'Ethiopia', countryCode: 'ET', reason: 'Historical capital with unique cuisine and culture', popularityScore: 75, travelCategories: ['culture', 'history', 'food'] },
    ];
  } else if (['united states', 'canada', 'mexico'].includes(country)) {
    regionalDests = [
      { name: 'Cancun', country: 'Mexico', countryCode: 'MX', reason: 'Popular beach destination with Mayan ruins nearby', popularityScore: 88, travelCategories: ['beach', 'history', 'culture'] },
      { name: 'Toronto', country: 'Canada', countryCode: 'CA', reason: 'Multicultural city with world-class attractions', popularityScore: 80, travelCategories: ['culture', 'food', 'urban'] },
    ];
  }

  // Combine seasonal with regional, remove duplicates
  const allDests = [...regionalDests];
  const seen = new Set(allDests.map((d) => d.name.toLowerCase()));

  const seasonalDests: GeminiDestination[] = seasonal.map((name) => ({
    name,
    country: name,
    countryCode: '',
    reason: `Perfect destination for ${new Date(0, month - 1).toLocaleString('en', { month: 'long' })} travel`,
    popularityScore: 70 + Math.floor(Math.random() * 20),
    travelCategories: ['general'],
  }));

  for (const dest of seasonalDests) {
    if (!seen.has(dest.name.toLowerCase())) {
      allDests.push(dest);
      seen.add(dest.name.toLowerCase());
    }
  }

  return allDests.slice(0, 15);
}

/* ── AI Insight Generation ─────────────────────────────────────────────────── */

async function generateAIInsight(
  destination: ScoredDestination,
  userContext: UserTravelContext
): Promise<string> {
  try {
    const res = await assistantChat({
      message: `Generate a 2-3 sentence personalized travel insight for ${destination.name}, ${destination.country}.`,
      instruction: `You are a travel AI. Generate a brief personalized insight about why ${destination.name} is ideal for this traveler based on: 
      - Traveler's country: ${userContext.country || 'Unknown'}
      - Season: ${getCurrentSeason().season}
      - Reason recommended: ${destination.reason}
      - Current month: ${new Date(0, getCurrentSeason().month - 1).toLocaleString('en', { month: 'long' })}
      Keep it concise, specific, and actionable. Return ONLY the insight text, no prefixes.`,
    });
    return res?.answer || destination.reason;
  } catch {
    return destination.reason;
  }
}

/* ── Main Recommendation Pipeline ──────────────────────────────────────────── */

export async function getPersonalizedRecommendations(
  userContext: UserTravelContext
): Promise<{
  recommendations: ScoredDestination[];
  loading: boolean;
  error: string | null;
}> {
  try {
    // Step 1: Get Gemini suggestions
    const geminiDests = await callGeminiForDestinations(userContext);

    if (!geminiDests.length) {
      return {
        recommendations: [],
        loading: false,
        error: 'No destinations could be generated. Please try again.',
      };
    }

    // Step 2: Fetch Firestore metadata for suggested destinations
    let firestoreDests = await getAllDestinations();
    const destMap = new Map<string, DestinationMetadata>();
    for (const d of firestoreDests) {
      destMap.set(d.name.toLowerCase(), d);
      destMap.set(`${d.name.toLowerCase()}_${d.countryCode.toLowerCase()}`, d);
    }

    // Also try fetching by categories if user has preferences
    if (userContext.travelPreferences?.length) {
      const categoryDests = await getDestinationsByCategories(userContext.travelPreferences);
      for (const d of categoryDests) {
        if (!destMap.has(d.name.toLowerCase())) {
          destMap.set(d.name.toLowerCase(), d);
        }
      }
    }

    // Step 3: Score and rank destinations
    const { month } = getCurrentSeason();
    const scored: ScoredDestination[] = [];

    for (const gemini of geminiDests) {
      const metadata = destMap.get(gemini.name.toLowerCase()) ||
                       destMap.get(`${gemini.name.toLowerCase()}_${gemini.countryCode.toLowerCase()}`);

      // Proximity score
      const proximityScore = calculateProximityScore(
        userContext.currentLat,
        userContext.currentLng,
        metadata?.lat,
        metadata?.lng
      );

      // Similarity score
      const categories = gemini.travelCategories?.length
        ? gemini.travelCategories
        : metadata?.travelCategories || ['general'];
      const similarityScore = calculateSimilarityScore(categories, userContext);

      // Season score
      const seasonScore = calculateSeasonScore(gemini.name, month);

      // Weather score (async)
      let weatherScore = 15;
      if (metadata?.lat && metadata?.lng) {
        const weather = await checkDestinationWeather(metadata.lat, metadata.lng);
        if (weather.isSevere) continue; // Skip destinations with severe weather
        weatherScore = weather.score;
      }

      // Gemini popularity score (map 0-100 to 0-20)
      const geminiScore = Math.round((gemini.popularityScore / 100) * 20);

      // Budget score
      const budgetScore = calculateBudgetScore(
        metadata?.estimatedBudget || null,
        userContext.budget
      );

      const totalScore = proximityScore + similarityScore + seasonScore +
                        weatherScore + geminiScore + budgetScore;

      // Fetch Pexels image
      let image = '';
      try {
        const images = await fetchCountryImages(
          gemini.country || gemini.name,
          gemini.countryCode
        );
        image = images.length > 0 ? images[0] : '';
      } catch {
        // No image available - proceed without
      }

      scored.push({
        name: gemini.name,
        country: gemini.country || metadata?.country || gemini.name,
        countryCode: gemini.countryCode || metadata?.countryCode || '',
        image,
        description: metadata?.description || `${gemini.name} offers a unique travel experience waiting to be discovered.`,
        travelTips: metadata?.travelTips || [],
        bestTimeToVisit: metadata?.bestTimeToVisit || 'Year-round destination',
        currency: metadata?.currency || 'Local currency',
        language: metadata?.language || 'Local language',
        timezone: metadata?.timezone || 'Local timezone',
        topAttractions: metadata?.topAttractions || [],
        travelCategories: categories,
        estimatedBudget: metadata?.estimatedBudget || null,
        score: totalScore,
        scoreBreakdown: {
          proximity: proximityScore,
          similarity: similarityScore,
          season: seasonScore,
          weather: weatherScore,
          geminiPopularity: geminiScore,
          budget: budgetScore,
        },
        reason: gemini.reason,
        aiInsight: '', // Filled in later
        lat: metadata?.lat || 0,
        lng: metadata?.lng || 0,
      });
    }

    // Step 4: Sort by score descending and take top 10
    scored.sort((a, b) => b.score - a.score);
    const top10 = scored.slice(0, 10);

    // Step 5: Generate AI insights for top 10 (in parallel)
    const insightPromises = top10.map((dest) =>
      generateAIInsight(dest, userContext).then((insight) => {
        dest.aiInsight = insight;
        return dest;
      })
    );
    await Promise.all(insightPromises);

    return {
      recommendations: top10,
      loading: false,
      error: null,
    };
  } catch (err) {
    console.error('[RecommendationEngine] Error:', err);
    return {
      recommendations: [],
      loading: false,
      error: err instanceof Error ? err.message : 'Failed to generate recommendations',
    };
  }
}

/**
 * Get a specific destination by name with scoring context.
 */
export async function getDestinationDetail(
  name: string,
  userContext: UserTravelContext
): Promise<ScoredDestination | null> {
  try {
    // Get from Firestore metadata
    const dests = await getAllDestinations();
    const metadata = dests.find(
      (d) => d.name.toLowerCase() === name.toLowerCase()
    );

    if (!metadata) return null;

    // Fetch image
    let image = '';
    try {
      const images = await fetchCountryImages(metadata.country, metadata.countryCode);
      image = images.length > 0 ? images[0] : '';
    } catch {
      // proceed without image
    }

    // Generate insight
    const insight = await generateAIInsight(
      {
        name: metadata.name,
        country: metadata.country,
        countryCode: metadata.countryCode,
        image,
        description: metadata.description,
        travelTips: metadata.travelTips,
        bestTimeToVisit: metadata.bestTimeToVisit,
        currency: metadata.currency,
        language: metadata.language,
        timezone: metadata.timezone,
        topAttractions: metadata.topAttractions,
        travelCategories: metadata.travelCategories,
        estimatedBudget: metadata.estimatedBudget,
        score: 0,
        scoreBreakdown: { proximity: 0, similarity: 0, season: 0, weather: 0, geminiPopularity: 0, budget: 0 },
        reason: 'Selected destination',
        aiInsight: '',
        lat: metadata.lat,
        lng: metadata.lng,
      },
      userContext
    );

    return {
      name: metadata.name,
      country: metadata.country,
      countryCode: metadata.countryCode,
      image,
      description: metadata.description,
      travelTips: metadata.travelTips,
      bestTimeToVisit: metadata.bestTimeToVisit,
      currency: metadata.currency,
      language: metadata.language,
      timezone: metadata.timezone,
      topAttractions: metadata.topAttractions,
      travelCategories: metadata.travelCategories,
      estimatedBudget: metadata.estimatedBudget,
      score: 0,
      scoreBreakdown: { proximity: 0, similarity: 0, season: 0, weather: 0, geminiPopularity: 0, budget: 0 },
      reason: 'Selected destination',
      aiInsight: insight,
      lat: metadata.lat,
      lng: metadata.lng,
    };
  } catch (err) {
    console.warn('[RecommendationEngine] getDestinationDetail error:', err);
    return null;
  }
}