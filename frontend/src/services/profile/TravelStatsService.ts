/**
 * TravelStatsService.ts
 * Computes travel statistics dynamically from Firestore data.
 * Uses the app's centralized trip status engine (tripStatus.ts)
 * for consistent active/completed classification across the entire app.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/src/firebase/firebaseApp';
import { tripsCollection } from '@/src/firebase/collections';
import { isTripCompleted } from '@/src/utils/tripStatus';
import { TripClassificationService, type TripType } from '@/src/services/trip/TripClassificationService';
import type { Trip } from '@/src/store/tripStore';

export interface TravelStats {
  upcomingTrips: number;
  completedTrips: number;
  countriesVisited: number;
  countriesList: string[];
  savedPlaces: number;
  totalTrips: number;
}

/** Extract country code from trip using multiple signals */
function extractCountryCode(trip: Trip): string | null {
  if (trip.destinations && trip.destinations.length > 0) {
    for (const d of trip.destinations) {
      if (d.country) return d.country.trim().toUpperCase();
    }
  }
  if (trip.destinationAirport?.countryCode) {
    return trip.destinationAirport.countryCode.trim().toUpperCase();
  }
  if (trip.to) {
    const toUpper = trip.to.trim().toUpperCase();
    const countryInfo = TripClassificationService.getCountryInfo(toUpper);
    if (countryInfo) return toUpper;

    if (trip.from) {
      try {
        const result = TripClassificationService.classify({
          originCountry: trip.from,
          destinationCountry: trip.to,
        });
        if (result.destinationCountry && result.destinationCountry.length === 2) {
          const destInfo = TripClassificationService.getCountryInfo(result.destinationCountry);
          if (destInfo) return result.destinationCountry;
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

/** Guess country code from a location string like "Kampala, Uganda" */
function guessCountryCode(location: string): string | null {
  if (!location) return null;
  const parts = location.split(',').map((p) => p.trim());
  const lastPart = parts[parts.length - 1].toLowerCase();

  const countryNameToCode: Record<string, string> = {
    'uganda': 'UG', 'kenya': 'KE', 'tanzania': 'TZ', 'rwanda': 'RW',
    'burundi': 'BI', 'south sudan': 'SS', 'ethiopia': 'ET', 'somalia': 'SO',
    'djibouti': 'DJ', 'eritrea': 'ER', 'south africa': 'ZA', 'nigeria': 'NG',
    'ghana': 'GH', 'egypt': 'EG', 'morocco': 'MA', 'united kingdom': 'GB',
    'uk': 'GB', 'england': 'GB', 'france': 'FR', 'germany': 'DE',
    'italy': 'IT', 'spain': 'ES', 'netherlands': 'NL', 'switzerland': 'CH',
    'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
    'portugal': 'PT', 'ireland': 'IE', 'poland': 'PL', 'austria': 'AT',
    'hungary': 'HU', 'greece': 'GR', 'turkey': 'TR', 'russia': 'RU',
    'ukraine': 'UA', 'romania': 'RO', 'belgium': 'BE', 'china': 'CN',
    'india': 'IN', 'japan': 'JP', 'south korea': 'KR', 'korea': 'KR',
    'singapore': 'SG', 'malaysia': 'MY', 'thailand': 'TH', 'vietnam': 'VN',
    'indonesia': 'ID', 'philippines': 'PH', 'uae': 'AE',
    'united arab emirates': 'AE', 'dubai': 'AE', 'saudi arabia': 'SA',
    'israel': 'IL', 'pakistan': 'PK', 'bangladesh': 'BD', 'sri lanka': 'LK',
    'nepal': 'NP', 'iran': 'IR', 'iraq': 'IQ', 'kazakhstan': 'KZ',
    'united states': 'US', 'usa': 'US', 'america': 'US', 'canada': 'CA',
    'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'colombia': 'CO',
    'chile': 'CL', 'peru': 'PE', 'australia': 'AU', 'new zealand': 'NZ',
    'fiji': 'FJ',
  };

  if (/^[A-Z]{2}$/.test(lastPart.toUpperCase())) {
    return lastPart.toUpperCase();
  }
  return countryNameToCode[lastPart] || null;
}

export const TravelStatsService = {
  /**
   * Compute all travel statistics from Firestore.
   */
  async computeStats(uid: string): Promise<TravelStats> {
    const db = getFirebaseFirestore();

    // Load trips
    const tripsQuery = query(tripsCollection(), where('userId', '==', uid));
    const tripsSnap = await getDocs(tripsQuery);
    const trips: Trip[] = tripsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Trip));

    // Load saved destinations from user doc
    let savedPlaces = 0;
    try {
      const userDocSnap = await getDocs(collection(db, 'users'));
      const userDoc = userDocSnap.docs.find((d) => d.id === uid);
      if (userDoc?.exists()) {
        const data = userDoc.data();
        // Try multiple possible field names
        const saved = data?.savedDestinations || data?.savedPlaces || data?.saved || [];
        savedPlaces = Array.isArray(saved) ? saved.length : 0;
      }
    } catch (err) {
      console.warn('[TravelStats] Error loading saved places:', err);
    }

    return this.computeStatsFromTrips(trips, savedPlaces);
  },

  /**
   * Compute stats from an already-loaded array of trips.
   */
  computeStatsFromTrips(trips: Trip[], savedPlaces: number = 0): TravelStats {
    const completedTrips = trips.filter((t) => isTripCompleted(t)).length;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const upcomingTrips = trips.filter((t) => {
      if (isTripCompleted(t)) return false;
      if (!t.departureTime) return true;
      const depDate = new Date(new Date(t.departureTime).getFullYear(), new Date(t.departureTime).getMonth(), new Date(t.departureTime).getDate());
      return depDate >= today;
    }).length;

    const countriesSet = new Set<string>();
    trips
      .filter((t) => isTripCompleted(t))
      .forEach((t) => {
        const country = extractCountryCode(t);
        if (country) {
          const info = TripClassificationService.getCountryInfo(country);
          const displayName = info?.name ?? country;
          countriesSet.add(displayName);
        }
      });

    const countriesList = Array.from(countriesSet).sort();

    return {
      upcomingTrips,
      completedTrips,
      countriesVisited: countriesSet.size,
      countriesList,
      savedPlaces,
      totalTrips: trips.length,
    };
  },
};

export default TravelStatsService;