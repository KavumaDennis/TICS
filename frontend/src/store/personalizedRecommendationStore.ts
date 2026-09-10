/**
 * personalizedRecommendationStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin Zustand store that calls the Cloud Function for recommendations.
 * All heavy lifting (scoring, Gemini ranking, weather, images, caching) is
 * done server-side. The phone just sends user context and receives results.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '@/src/firebase/firebaseApp';
import { getCurrentPosition, hasLocationPermission } from '@/src/services/LocationService';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useTripStore } from '@/src/store/tripStore';
import { useUserDocStore } from '@/src/store/userDocStore';
import type { UserTravelContext } from '@/src/services/RecommendationEngine';

/* ── Types ─────────────────────────────────────────────────────────────────── */

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
    geminiRanking: number;
    budget: number;
  };
  reason: string;
  reasons: string[];
  aiInsight: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  label: string;
}

export interface PersonalizedRecommendationState {
  recommendations: ScoredDestination[];
  categorized: Record<string, ScoredDestination[]>;
  categories: Category[];
  activeCategory: string;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  isCached: boolean;

  loadRecommendations: (userId: string) => Promise<void>;
  refreshRecommendations: (userId: string) => Promise<void>;
  clearRecommendations: () => void;
  setActiveCategory: (categoryId: string) => void;
  logInteraction: (destinationName: string, action: 'viewed' | 'saved' | 'ignored' | 'booked') => Promise<void>;
}

/* ── Country Name → Code Mapping ─────────────────────────────────────────── */

const COUNTRY_CODE_MAP: Record<string, string> = {
  uganda: 'UG', kenya: 'KE', tanzania: 'TZ', rwanda: 'RW', burundi: 'BI',
  'south sudan': 'SS', ethiopia: 'ET', somalia: 'SO', djibouti: 'DJ', eritrea: 'ER',
  nigeria: 'NG', ghana: 'GH', 'ivory coast': 'CI', senegal: 'SN', mali: 'ML',
  'south africa': 'ZA', namibia: 'NA', botswana: 'BW', zimbabwe: 'ZW', mozambique: 'MZ',
  zambia: 'ZM', malawi: 'MW', angola: 'AO',
  morocco: 'MA', algeria: 'DZ', tunisia: 'TN', egypt: 'EG', libya: 'LY',
  france: 'FR', 'united kingdom': 'GB', germany: 'DE', italy: 'IT', spain: 'ES',
  'united states': 'US', canada: 'CA', mexico: 'MX', brazil: 'BR', argentina: 'AR',
  china: 'CN', japan: 'JP', india: 'IN', australia: 'AU', 'new zealand': 'NZ',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', turkey: 'TR', russia: 'RU',
  singapore: 'SG', indonesia: 'ID', thailand: 'TH', vietnam: 'VN', malaysia: 'MY',
  philippines: 'PH', 'south korea': 'KR',
  'dr congo': 'CD', congo: 'CG', cameroon: 'CM', gabon: 'GA',
};

function resolveCountryCode(data: Record<string, any> | null): string | undefined {
  if (!data) return undefined;
  if (data.countryCode) return data.countryCode as string;
  if (data.country) {
    const country = String(data.country).toLowerCase().trim();
    if (COUNTRY_CODE_MAP[country]) return COUNTRY_CODE_MAP[country];
    for (const [name, code] of Object.entries(COUNTRY_CODE_MAP)) {
      if (country.includes(name) || name.includes(country)) return code;
    }
  }
  return undefined;
}

/* ── Helper: Build user context from existing stores ───────────────────────── */

async function buildUserContext(userId: string): Promise<UserTravelContext> {
  const authStore = useAuthStore.getState();
  const userDocStore = useUserDocStore.getState();
  const tripStore = useTripStore.getState();

  const userDoc = userDocStore.doc;
  const trips = tripStore.trips;
  const activeTrip = trips.find((t) => t.status === 'active' || t.status === 'upcoming');

  const completedTrips = trips.filter((t) => t.status === 'completed' || t.completedAt);
  const visitedDestinations = completedTrips
    .map((t) => t.destinationAirport?.city || t.to)
    .filter(Boolean) as string[];

  const frequentCategories: string[] = [];
  const frequentRegions: string[] = [];
  completedTrips.forEach((t) => {
    const dest = t.destinationAirport?.countryCode;
    if (dest) frequentRegions.push(dest);
  });

  let travelStyle = 'general';
  const hasBeach = completedTrips.some((t) => ['Maldives', 'Bali', 'Zanzibar', 'Phuket'].includes(t.to));
  const hasSafari = completedTrips.some((t) => ['Nairobi', 'Serengeti', 'Kruger'].includes(t.to));
  const hasBusiness = completedTrips.some((t) => ['Singapore', 'Dubai', 'London', 'New York'].includes(t.to));

  if (hasBeach) { frequentCategories.push('beach'); travelStyle = 'beach'; }
  if (hasSafari) { frequentCategories.push('safari'); travelStyle = 'safari'; }
  if (hasBusiness) { frequentCategories.push('business'); travelStyle = 'business'; }

  let currentLat: number | undefined;
  let currentLng: number | undefined;
  try {
    if (await hasLocationPermission()) {
      const pos = await getCurrentPosition();
      if (pos) { currentLat = pos.latitude; currentLng = pos.longitude; }
    }
  } catch { /* ignore */ }

  const userData = userDoc as Record<string, any> | null;

  return {
    uid: userId,
    country: userData?.country || undefined,
    countryCode: resolveCountryCode(userData),
    preferredLanguage: userData?.preferredLanguage || undefined,
    savedDestinations: userData?.savedDestinations || [],
    travelPreferences: userData?.travelPreferences || userData?.interests || [],
    interests: userData?.interests || [],
    budget: userData?.budget || undefined,
    favoriteTravelStyles: userData?.favoriteTravelStyles || userData?.travelStyles || [],
    activeTrip: activeTrip ? {
      destination: activeTrip.destinationAirport?.city || activeTrip.to,
      travelDates: { start: activeTrip.departureTime, end: activeTrip.arrivalTime },
      transportType: activeTrip.flightNumber ? 'flight' : 'other',
    } : null,
    previousTripPatterns: { frequentCategories, frequentRegions, visitedDestinations, travelStyle },
    currentLat,
    currentLng,
  };
}

/* ── Store ─────────────────────────────────────────────────────────────────── */

export const usePersonalizedRecommendationStore = create<PersonalizedRecommendationState>((set, get) => ({
  recommendations: [],
  categorized: {},
  categories: [],
  activeCategory: 'all',
  loading: false,
  error: null,
  lastFetchedAt: null,
  isCached: false,

  loadRecommendations: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      const userContext = await buildUserContext(userId);

      // Call Cloud Function with timeout
      const fn = httpsCallable(getFirebaseFunctions(), 'generateDestinationRecommendations');
      const res = await fn(userContext);
      const data = res.data as any;

      set({
        recommendations: data.recommendations || [],
        categorized: data.categorized || {},
        categories: data.categories || [],
        loading: false,
        error: null,
        lastFetchedAt: Date.now(),
        isCached: data.cached || false,
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to load recommendations';
      const errorCode = err?.code || 'unknown';


      console.error("========== Recommendation Error ==========");
      console.error("message:", err?.message);
      console.error("code:", err?.code);
      console.error("name:", err?.name);
      console.error("stack:", err?.stack);
      console.error("full:", JSON.stringify(err, null, 2));
      console.error(err);


      // Provide user-friendly messages for common Firebase errors
      let displayError: string;
      if (errorCode === 'unavailable' || errorMessage.includes('unavailable')) {
        displayError = 'Recommendations are temporarily unavailable. Please check your internet connection and try again.';
      } else if (errorCode === 'unauthenticated') {
        displayError = 'Please sign in to see personalized recommendations.';
      } else if (errorCode === 'deadline-exceeded') {
        displayError = 'The request timed out. Please try again.';
      } else {
        displayError = errorMessage;
      }

      set({
        loading: false,
        error: displayError,
      });
    }
  },

  refreshRecommendations: async (userId: string) => {
    set({ loading: true, error: null, isCached: false });
    try {
      const userContext = await buildUserContext(userId);
      const fn = httpsCallable(getFirebaseFunctions(), 'generateDestinationRecommendations');
      const res = await fn(userContext);
      const data = res.data as any;

      set({
        recommendations: data.recommendations || [],
        categorized: data.categorized || {},
        categories: data.categories || [],
        loading: false,
        error: null,
        lastFetchedAt: Date.now(),
        isCached: false,
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to refresh recommendations';
      const errorCode = err?.code || 'unknown';

      console.error(`[PersonalizedRecommendationStore] refresh error (${errorCode}):`, errorMessage);

      let displayError: string;
      if (errorCode === 'unavailable' || errorMessage.includes('unavailable')) {
        displayError = 'Recommendations are temporarily unavailable. Please check your internet connection and try again.';
      } else if (errorCode === 'unauthenticated') {
        displayError = 'Please sign in to see personalized recommendations.';
      } else if (errorCode === 'deadline-exceeded') {
        displayError = 'The request timed out. Please try again.';
      } else {
        displayError = errorMessage;
      }

      set({
        loading: false,
        error: displayError,
      });
    }
  },

  clearRecommendations: () => {
    set({
      recommendations: [],
      categorized: {},
      categories: [],
      activeCategory: 'all',
      loading: false,
      error: null,
      lastFetchedAt: null,
      isCached: false,
    });
  },

  setActiveCategory: (categoryId: string) => {
    set({ activeCategory: categoryId });
  },

  logInteraction: async (destinationName: string, action: 'viewed' | 'saved' | 'ignored' | 'booked') => {
    try {
      const fn = httpsCallable(getFirebaseFunctions(), 'logDestinationInteraction');
      await fn({
        destinationName,
        action,
        context: { timestamp: Date.now() },
      });
    } catch (err) {
      console.warn('[PersonalizedRecommendationStore] logInteraction error:', err);
    }
  },
}));