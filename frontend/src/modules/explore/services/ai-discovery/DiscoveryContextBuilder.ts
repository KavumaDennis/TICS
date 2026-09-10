/**
 * DiscoveryContextBuilder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a complete user discovery context from all available data sources.
 * Handles gracefully when some data sources are unavailable.
 *
 * Data sources:
 *  - Auth store (uid, name)
 *  - User profile (home country, preferences, interests)
 *  - Saved places
 *  - Trip history (active, upcoming, completed)
 *  - Location (GPS, city, country)
 *  - Weather
 *  - Search history
 *  - Recently viewed destinations
 *  - Recently dismissed/liked recommendations
 *  - Explore analytics
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { doc, getDoc, collection, query, where, getDocs, limit as fbLimit, orderBy as fbOrderBy } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { useAuthStore } from '@/src/store/useAuthStore';
import { ExploreService } from '@/src/modules/explore/services/ExploreService';
import type { DestinationCoordinates, Destination } from '@/src/modules/explore/types';
import type { DiscoveryUserContext } from './types';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const MAX_SAVED = 20;
const MAX_SEARCH_HISTORY = 20;
const MAX_TRIPS = 10;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function haversineDistance(from: DestinationCoordinates, to: DestinationCoordinates): number {
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Reverse geocode coordinates to get city/country.
 * Uses OpenStreetMap Nominatim free API.
 */
async function reverseGeocode(lat: number, lng: number): Promise<{ city?: string; country?: string; countryCode?: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'TICS-TravelApp/1.0' },
      }
    );
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const address = data?.address || {};
    return {
      city: address.city || address.town || address.village || undefined,
      country: address.country || undefined,
      countryCode: address.country_code?.toUpperCase() || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch saved places for a user from Firestore.
 */
async function fetchSavedPlaces(uid: string): Promise<string[]> {
  try {
    const db = getFirebaseFirestore();
    const q = query(
      collection(db, 'users', uid, 'saved'),
      fbOrderBy('savedAt', 'desc'),
      fbLimit(MAX_SAVED)
    );
    const snap = await getDocs(q);
    const names: string[] = [];
    const destinationIds: string[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const name = data?.data?.name || data?.title || data?.itemId;
      if (name && typeof name === 'string') {
        names.push(name);
        if (data?.data?.id) destinationIds.push(data.data.id);
      }
    }
    return [...names, ...destinationIds];
  } catch {
    return [];
  }
}

interface TripFetchResult {
  activeTrip: any;
  upcoming: any;
  completed: any[];
  previousTrips: string[];
  travelHistory: string[];
}

/**
 * Fetch user trips from Firestore (active, upcoming, completed).
 */
async function fetchTrips(uid: string): Promise<TripFetchResult> {
  try {
    const db = getFirebaseFirestore();
    const tripsRef = collection(db, 'trips');
    const q = query(tripsRef, where('userId', '==', uid), fbOrderBy('createdAt', 'desc'), fbLimit(MAX_TRIPS));
    const snap = await getDocs(q);

    let activeTrip: any = null;
    let upcomingTrip: any = null;
    const completedTrips: any[] = [];
    const previousTrips: string[] = [];
    const travelHistory: string[] = [];

    const now = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const tripId = docSnap.id;
      const status = data?.status || 'upcoming';
      const departureTime = typeof data?.departureTime === 'string' ? data.departureTime : '';
      const departureTs = departureTime ? new Date(departureTime).getTime() : 0;

      const destName = data?.to || data?.destination || data?.destinationAirport?.city || '';
      const destCoords: DestinationCoordinates | undefined =
        data?.destinationAirport?.latitude && data?.destinationAirport?.longitude
          ? { lat: data.destinationAirport.latitude, lng: data.destinationAirport.longitude }
          : data?.destinations?.[0]?.lat && data?.destinations?.[0]?.lng
            ? { lat: data.destinations[0].lat, lng: data.destinations[0].lng }
            : undefined;

      const tripType = data?.type || (destCoords ? undefined : 'LOCAL');

      const tripCtx = {
        id: tripId,
        title: data?.title || `Trip to ${destName}` || 'Trip',
        from: data?.from || '',
        to: destName || data?.to || '',
        type: tripType,
        status,
        departureTime,
        arrivalTime: typeof data?.arrivalTime === 'string' ? data.arrivalTime : '',
        destination: destName,
        destinationCoordinates: destCoords,
      };

      if (status === 'active' || status === 'airborne' || status === 'arriving' || status === 'boarding') {
        if (!activeTrip) activeTrip = tripCtx;
      } else if (status === 'upcoming' && departureTs > now) {
        if (!upcomingTrip) upcomingTrip = { ...tripCtx, departureTime };
      } else if (status === 'completed' || (departureTs > 0 && departureTs < now && status === 'upcoming')) {
        completedTrips.push(tripCtx);
        if (destName) {
          previousTrips.push(destName);
          travelHistory.push(destName);
        }
      }
    }

    return {
      activeTrip,
      upcoming: upcomingTrip,
      completed: completedTrips,
      previousTrips,
      travelHistory,
    };
  } catch {
    return { activeTrip: null, upcoming: null, completed: [], previousTrips: [], travelHistory: [] };
  }
}

/**
 * Fetch search history from AsyncStorage.
 */
async function fetchSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem('@tics_search_history');
    if (!raw) return [];
    const history = JSON.parse(raw);
    return (history || []).slice(0, MAX_SEARCH_HISTORY).map((h: any) => (typeof h === 'string' ? h : h?.query || ''));
  } catch {
    return [];
  }
}

/**
 * Fetch user profile data.
 */
async function fetchUserProfile(uid: string): Promise<Partial<DiscoveryUserContext>> {
  try {
    const db = getFirebaseFirestore();
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return {};

    const data = snap.data();
    const profile: Partial<DiscoveryUserContext> = {};

    if (data?.country) profile.homeCountry = data.country;
    if (data?.city) profile.homeCity = data.city;
    if (Array.isArray(data?.travelPreferences)) profile.travelPreferences = data.travelPreferences.slice(0, 10);
    if (Array.isArray(data?.interests)) profile.interests = data.interests.slice(0, 10);
    if (Array.isArray(data?.preferredTravelStyles)) profile.preferredTravelStyles = data.preferredTravelStyles.slice(0, 10);
    if (data?.budget) {
      profile.budget = {
        min: typeof data.budget.min === 'number' ? data.budget.min : undefined,
        max: typeof data.budget.max === 'number' ? data.budget.max : undefined,
        currency: data.budget.currency || 'USD',
      };
    }
    if (data?.name) profile.name = data.name;
    if (data?.email) profile.email = data.email;

    return profile;
  } catch {
    return {};
  }
}

/* ── DiscoveryContextBuilder ───────────────────────────────────────────────── */

export const DiscoveryContextBuilder = {
  /**
   * Build the complete user discovery context.
   * Never throws - degrades gracefully if any source is unavailable.
   */
  async buildContext(options: {
    userId?: string;
    location?: DestinationCoordinates;
  } = {}): Promise<DiscoveryUserContext> {
    const uid = options.userId;
    const location = options.location;

    // Start with basic context that never fails
    const context: DiscoveryUserContext = {
      uid,
      currentDate: formatDate(new Date()),
      currentSeason: getCurrentSeason(),
      tripStage: 'no_trip',
      localVsRegionalVsInternational: 'mixed',
    };

    // ── Auth user ──────────────────────────────────────────────────────────
    if (uid) {
      try {
        const authState = useAuthStore.getState();
        if (authState.user) {
          context.name = authState.user.name || undefined;
          context.email = authState.user.email || undefined;
        }
      } catch {}
    }

    // ── Location ───────────────────────────────────────────────────────────
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      context.currentLocation = location;

      // Reverse geocode for city/country
      try {
        const geo = await reverseGeocode(location.lat, location.lng);
        if (geo) {
          context.currentCity = geo.city;
          context.currentCountry = geo.country;
          if (!context.homeCountry) context.homeCountry = geo.country;
        }
      } catch {}
    }

    // ── User profile ───────────────────────────────────────────────────────
    if (uid) {
      try {
        const profile = await fetchUserProfile(uid);
        Object.assign(context, profile);
      } catch {}
    }

    // ── Saved places ───────────────────────────────────────────────────────
    if (uid) {
      try {
        const saved = await fetchSavedPlaces(uid);
        if (saved.length > 0) {
          context.savedPlaces = saved;
          const savedIds = saved.filter((s) => s.startsWith('dest_') && s.length > 5);
          if (savedIds.length > 0) context.savedDestinationIds = savedIds;
        }
      } catch {}
    }

    // ── Previously viewed destinations ─────────────────────────────────────
    if (uid) {
      try {
        const recentlyViewed = await ExploreService.getRecentlyViewed(uid);
        if (recentlyViewed.length > 0) {
          context.previouslyViewed = recentlyViewed.map((d: Destination) => d.name);
        }
      } catch {}
    }

    // ── Trips ──────────────────────────────────────────────────────────────
    if (uid) {
      try {
        const trips = await fetchTrips(uid);
        context.activeTrip = trips.activeTrip;
        context.upcomingTrip = trips.upcoming;
        context.previousTrips = trips.previousTrips;
        context.travelHistory = trips.travelHistory;
        context.completedTrips = (trips.completed || []).map((t: any) => t.to).filter(Boolean);

        // Determine trip stage
        if (context.activeTrip) {
          const depTime = context.activeTrip.departureTime ? new Date(context.activeTrip.departureTime).getTime() : 0;
          const now = Date.now();
          if (depTime > 0 && now < depTime) {
            context.tripStage = 'pre_departure';
          } else {
            context.tripStage = 'during_trip';
          }
        } else if (context.upcomingTrip) {
          context.tripStage = 'pre_departure';
        } else if (context.completedTrips && context.completedTrips.length > 0) {
          context.tripStage = 'post_trip';
        }

        // Determine local vs regional vs international
        const activeTripType = context.activeTrip?.type;
        if (activeTripType === 'LOCAL') context.localVsRegionalVsInternational = 'local';
        else if (activeTripType === 'REGIONAL') context.localVsRegionalVsInternational = 'regional';
        else if (activeTripType === 'INTERNATIONAL') context.localVsRegionalVsInternational = 'international';
      } catch {}
    }

    // ── Search history ─────────────────────────────────────────────────────
    try {
      const history = await fetchSearchHistory();
      if (history.length > 0) context.searchHistory = history;
    } catch {}

    // ── Recently dismissed / liked (from cache or store) ───────────────────
    try {
      const dismissKey = `@tics_discovery_dismissed_${uid || 'guest'}`;
      const likeKey = `@tics_discovery_liked_${uid || 'guest'}`;
      const AsyncStorageModule = require('@react-native-async-storage/async-storage').default;
      const [dismissedRaw, likedRaw] = await Promise.all([
        AsyncStorageModule.getItem(dismissKey),
        AsyncStorageModule.getItem(likeKey),
      ]);
      if (dismissedRaw) context.recentlyDismissed = JSON.parse(dismissedRaw).slice(0, 20);
      if (likedRaw) context.recentlyLiked = JSON.parse(likedRaw).slice(0, 20);
    } catch {}

    // ── Weather (best effort) ──────────────────────────────────────────────
    if (location) {
      try {
        const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
        if (apiKey) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lng}&units=metric&appid=${apiKey}`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);
          if (response.ok) {
            const data = await response.json();
            const main = data?.weather?.[0]?.main?.toLowerCase() || '';
            context.weather = {
              tempC: typeof data?.main?.temp === 'number' ? data.main.temp : undefined,
              condition: data?.weather?.[0]?.description || undefined,
              weatherMain: main,
              humidity: typeof data?.main?.humidity === 'number' ? data.main.humidity : undefined,
              windKph: typeof data?.wind?.speed === 'number' ? Math.round(data.wind.speed * 3.6) : undefined,
            };
          }
        }
      } catch {}
    }

    // ── Recent explore activity (from analytics) ───────────────────────────
    if (uid) {
      try {
        const db = getFirebaseFirestore();
        const q = query(
          collection(db, 'exploreAnalytics'),
          where('userId', '==', uid),
          fbOrderBy('timestamp', 'desc'),
          fbLimit(20)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          context.recentExploreActivity = snap.docs
            .map((d) => {
              const data = d.data();
              return data?.event || data?.metadata?.category || '';
            })
            .filter(Boolean);
        }
      } catch {}
    }

    return context;
  },

  /**
   * Get current date and season synchronously for non-async contexts.
   */
  getCurrentSeason,
  formatDate,

  /**
   * Calculate distance between two coordinates.
   */
  haversineDistance,
};