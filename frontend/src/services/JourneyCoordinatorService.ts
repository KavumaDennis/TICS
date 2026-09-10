/**
 * JourneyCoordinatorService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized service for handling the "Coordinate My Journey" action.
 *
 * Architecture (layered):
 *   TripClassificationService  → Determines LOCAL, REGIONAL, or INTERNATIONAL
 *   JourneyDecisionEngine      → Decides what action to take (create, open planner, etc.)
 *   JourneyCoordinator         → Performs the action (navigation, trip creation)
 *
 * The UI must NOT contain any business logic about trip type classification.
 * All classification, routing, and duplicate detection is centralized here.
 * Reuses existing LocationService, tripStore, and navigation patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as Location from 'expo-location';
import { Alert } from 'react-native';
import type { Destination } from '@/src/modules/explore/types';
import {
  getCurrentPosition,
  hasLocationPermission,
  requestLocationPermission,
} from '@/src/services/LocationService';
import { useTripStore, type Trip } from '@/src/store/tripStore';
import type { AirportEntry } from '@/src/screens/TripInputScreen';
import { searchAirports, getAirportByIATA } from '@/src/services/AirportService';
import { TripClassificationService, trackTripEvent } from '@/src/services/trip';
import { resolveCountryCode } from '@/src/utils/countryCodes';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ENUMS                                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

/**
 * Journey types — extensible for future trip categories.
 * Only LOCAL and INTERNATIONAL are currently used, but the enum
 * structure makes adding REGIONAL, MULTI_CITY, BUSINESS, etc.
 * straightforward without refactoring callers.
 */
export enum JourneyType {
  LOCAL = 'local',
  INTERNATIONAL = 'international',
  ROAD_TRIP = 'road_trip',
  MULTI_CITY = 'multi_city',
  BUSINESS = 'business',
  WEEKEND_ESCAPE = 'weekend_escape',
  GROUP = 'group',
}

/**
 * Actions the coordinator can take after classification + decision.
 */
export enum JourneyAction {
  CREATE_LOCAL = 'create_local',
  OPEN_PLANNER = 'open_planner',
  OPEN_EXISTING = 'open_existing',
  PROMPT_USER = 'prompt_user',
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TYPES                                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface ClassificationResult {
  journeyType: JourneyType;
  currentCountryCode: string;
  destinationCountryCode: string;
  currentCoordinates: { latitude: number; longitude: number } | null;
}

export interface ExistingTripCheck {
  exists: boolean;
  trip: Trip | null;
  lifecyclePhase: 'planning' | 'active' | 'completed' | null;
}

export interface DecisionResult {
  action: JourneyAction;
  existingTrip?: Trip;
  prefillData?: Record<string, any>;
}

export interface PrefillData {
  // Destination
  destinationName: string;
  destinationCountry: string;
  destinationCountryCode: string;
  destinationLat?: number;
  destinationLng?: number;
  destinationTimezone?: string;
  destinationCurrency?: string;
  destinationLanguage?: string;
  destinationAirport?: AirportEntry | null;
  destinationAirportCode?: string;

  // Origin (derived from current location)
  originCountryCode: string;
  originLat?: number;
  originLng?: number;

  // Classification
  journeyType: JourneyType;
  suggestedTravelMode?: string;
  estimatedDistance?: number;
  estimatedDuration?: string;

  // Existing trip (for edit mode)
  existingTripId?: string;
  editMode?: boolean;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  JOURNEY CLASSIFIER                                                         */
/*  Pure logic: determines the journey type from location data.                */
/*  No side effects — no navigation, no trip creation.                         */
/* ════════════════════════════════════════════════════════════════════════════ */

export class JourneyClassifier {
  /**
   * Classify a trip based on current location vs destination country.
   * Always compares ISO country codes, never country names.
   * Returns the journey type and supporting data.
   */
  static async classify(
    destination: Destination,
  ): Promise<{
    classification: ClassificationResult | null;
    error: string | null;
  }> {
    try {
      // Derive country code from the country name if not directly available
      const destinationCountryCode = resolveCountryCode(
        destination.countryCode,
        destination.country
      )?.toUpperCase();
      if (!destinationCountryCode) {
        return {
          classification: null,
          error: 'Destination country code is missing. Cannot classify trip.',
        };
      }

      const { countryCode: currentCountryCode, coordinates } =
        await this.resolveCurrentCountry();

      if (!currentCountryCode) {
        return {
          classification: null,
          error:
            'Unable to determine your current location. Please enable location services or manually select your starting country.',
        };
      }

      // Determine journey type — currently binary, but structured for extension
      const journeyType: JourneyType =
        currentCountryCode === destinationCountryCode
          ? JourneyType.LOCAL
          : JourneyType.INTERNATIONAL;

      console.log('[JourneyClassifier]');
      console.log(`[JourneyClassifier] Current Country: ${currentCountryCode}`);
      console.log(`[JourneyClassifier] Destination Country: ${destinationCountryCode}`);
      console.log(`[JourneyClassifier] Journey Type: ${journeyType}`);

      return {
        classification: {
          journeyType,
          currentCountryCode,
          destinationCountryCode,
          currentCoordinates: coordinates,
        },
        error: null,
      };
    } catch (err) {
      console.error('[JourneyClassifier] Classification error:', err);
      return {
        classification: null,
        error: 'An unexpected error occurred while classifying your trip. Please try again.',
      };
    }
  }

  /* ── Country Resolution ────────────────────────────────────────────────── */

  /**
   * Resolve the user's current country using this priority:
   * 1. GPS coordinates → reverse geocode → ISO country code
   * 2. Fallback: user's configured home country
   * 3. If neither available, return null (caller must handle)
   *
   * Cache is intentionally short-lived (30s) to avoid stale classifications
   * when the user crosses borders. The country lookup is inexpensive compared
   * to making an incorrect trip decision.
   */
  private static async resolveCurrentCountry(): Promise<{
    countryCode: string | null;
    coordinates: { latitude: number; longitude: number } | null;
  }> {
    // 1. Check short-lived cache (30 seconds max)
    const cached = getCachedCountry();
    if (cached) {
      console.log('[JourneyClassifier] Using cached country:', cached);
      return { countryCode: cached, coordinates: null };
    }

    // 2. Try GPS
    const hasPermission = await hasLocationPermission();
    if (!hasPermission) {
      console.log('[JourneyClassifier] No location permission. Requesting...');
      const granted = await requestLocationPermission();
      if (!granted) {
        console.warn('[JourneyClassifier] Location permission denied by user');
        return { countryCode: null, coordinates: null };
      }
    }

    const position = await getCurrentPosition();
    if (position) {
      const countryCode = await reverseGeocodeToCountryCode(
        position.latitude,
        position.longitude,
      );
      if (countryCode) {
        setCachedCountry(countryCode);
        console.log('[JourneyClassifier] GPS Country:', countryCode);
        return {
          countryCode,
          coordinates: {
            latitude: position.latitude,
            longitude: position.longitude,
          },
        };
      }
      console.warn('[JourneyClassifier] Reverse geocode failed for GPS position');
    } else {
      console.warn('[JourneyClassifier] GPS unavailable');
    }

    // 3. Fallback to home country
    const homeCountry = await getUserHomeCountry();
    if (homeCountry) {
      console.log('[JourneyClassifier] GPS unavailable. Using Home Country fallback:', homeCountry);
      trackAnalytics('gps_fallback_used', { fallbackCountry: homeCountry });
      setCachedCountry(homeCountry);
      return { countryCode: homeCountry, coordinates: null };
    }

    // 4. Neither available
    console.warn('[JourneyClassifier] Could not determine current country from GPS or home country');
    return { countryCode: null, coordinates: null };
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  JOURNEY DECISION ENGINE                                                    */
/*  Pure logic: decides what action to take based on classification + state.   */
/*  No side effects — no navigation, no trip creation.                         */
/* ════════════════════════════════════════════════════════════════════════════ */

export class JourneyDecisionEngine {
  /**
   * Decide what action to take given the classification and existing trips.
   *
   * Rules:
   * - Local + no existing trip → CREATE_LOCAL
   * - Local + existing planning trip → OPEN_EXISTING (planner)
   * - Local + existing active trip → OPEN_EXISTING (monitoring)
   * - Local + existing completed trip → CREATE_LOCAL (allow new)
   * - International + no existing trip → OPEN_PLANNER (with prefill)
   * - International + existing planning trip → OPEN_EXISTING (planner)
   * - International + existing active trip → OPEN_EXISTING (monitoring)
   * - International + existing completed trip → OPEN_PLANNER (allow new)
   */
  static async decide(
    classification: ClassificationResult,
    destination: Destination,
  ): Promise<DecisionResult> {
    const existingCheck = await checkExistingTrip(destination);

    // Handle existing non-completed trips
    if (existingCheck.exists && existingCheck.trip) {
      if (existingCheck.lifecyclePhase !== 'completed') {
        console.log('[JourneyDecisionEngine] Existing trip found — opening existing');
        console.log(`[JourneyDecisionEngine] Status: ${existingCheck.trip.status}`);
        console.log(`[JourneyDecisionEngine] Phase: ${existingCheck.lifecyclePhase}`);

        trackAnalytics('duplicate_trip_detected', {
          tripId: existingCheck.trip.id,
          phase: existingCheck.lifecyclePhase,
        });

        return {
          action: JourneyAction.OPEN_EXISTING,
          existingTrip: existingCheck.trip,
        };
      }
      console.log('[JourneyDecisionEngine] Existing completed trip — allowing new trip');
    }

    // Build prefill data for the planner
    const prefillData = await buildPrefillData(destination, classification);

    // Decide based on journey type
    if (classification.journeyType === JourneyType.LOCAL) {
      console.log('[JourneyDecisionEngine] Decision: CREATE_LOCAL');
      return {
        action: JourneyAction.CREATE_LOCAL,
        prefillData,
      };
    }

    console.log('[JourneyDecisionEngine] Decision: OPEN_PLANNER');
    return {
      action: JourneyAction.OPEN_PLANNER,
      prefillData,
    };
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  JOURNEY COORDINATOR                                                        */
/*  Performs the actual actions: trip creation, navigation, etc.               */
/*  This is the only layer with side effects.                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

export class JourneyCoordinator {
  /**
   * Execute the decision — create trips, navigate screens, etc.
   */
  static async execute(
    decision: DecisionResult,
    navigation: {
      navigateToMonitoring: (tripId: string) => void;
      navigateToTripSetup: (prefillData: Record<string, any>) => void;
      navigateToTrips: () => void;
    },
  ): Promise<void> {
    const { navigateToMonitoring, navigateToTripSetup, navigateToTrips } = navigation;

    switch (decision.action) {
      case JourneyAction.CREATE_LOCAL:
        await this.executeCreateLocal(decision, navigateToMonitoring);
        break;

      case JourneyAction.OPEN_PLANNER:
        this.executeOpenPlanner(decision, navigateToTripSetup);
        break;

      case JourneyAction.OPEN_EXISTING:
        this.executeOpenExisting(decision, navigateToMonitoring, navigateToTripSetup);
        break;

      case JourneyAction.PROMPT_USER:
        // Handled at the coordinator level
        break;
    }
  }

  /* ── Create Local Trip ─────────────────────────────────────────────────── */

  private static async executeCreateLocal(
    decision: DecisionResult,
    navigateToMonitoring: (tripId: string) => void,
  ): Promise<void> {
    try {
      console.log('[JourneyCoordinator] Action: CREATE_LOCAL');

      const { useAuthStore } = await import('@/src/store/useAuthStore');
      const uid = useAuthStore.getState().token;
      if (!uid) {
        Alert.alert('Authentication Required', 'Please sign in to create a trip.');
        return;
      }

      const tripStore = useTripStore.getState();
      const prefill = decision.prefillData;

      const now = new Date();
      const departureTime = now.toISOString();
      const arrivalTime = new Date(now.getTime() + 3600000).toISOString();

      const trip = await tripStore.addTrip(uid, {
        title: `Trip to ${prefill?.destinationName || 'Destination'}`,
        from: `Current Location`,
        to: `${prefill?.destinationName || ''}, ${prefill?.destinationCountry || ''}`,
        status: 'active' as any,
        departureTime,
        arrivalTime,
        monitoringEnabled: true,
        monitoringStatus: 'on_track',
        lastMileStatus: 'pending',
        destinations: [
          {
            city: prefill?.destinationName || '',
            country: prefill?.destinationCountry || '',
            lat: prefill?.destinationLat,
            lng: prefill?.destinationLng,
          },
        ],
        weatherLocationTo: `${prefill?.destinationName || ''},${prefill?.destinationCountryCode || ''}`,
      } as any);

      if (trip) {
        console.log(`[JourneyCoordinator] Local trip created: ${trip.id}`);
        trackAnalytics('tracking_started', { tripId: trip.id, journeyType: 'local' });
        navigateToMonitoring(trip.id);
      } else {
        Alert.alert('Trip Creation Failed', 'Could not create your trip. Please try again.');
      }
    } catch (err) {
      console.error('[JourneyCoordinator] Local trip creation error:', err);
      Alert.alert('Error', 'An error occurred while creating your journey.');
    }
  }

  /* ── Open Planner ──────────────────────────────────────────────────────── */

  private static executeOpenPlanner(
    decision: DecisionResult,
    navigateToTripSetup: (prefillData: Record<string, any>) => void,
  ): void {
    console.log('[JourneyCoordinator] Action: OPEN_PLANNER');
    trackAnalytics('planner_opened', { journeyType: decision.prefillData?.journeyType });
    navigateToTripSetup(decision.prefillData || {});
  }

  /* ── Open Existing ─────────────────────────────────────────────────────── */

  private static executeOpenExisting(
    decision: DecisionResult,
    navigateToMonitoring: (tripId: string) => void,
    navigateToTripSetup: (prefillData: Record<string, any>) => void,
  ): void {
    const trip = decision.existingTrip;
    if (!trip) return;

    const status = trip.status;
    if (
      status === 'active' ||
      status === 'boarding' ||
      status === 'airborne' ||
      status === 'arriving'
    ) {
      console.log('[JourneyCoordinator] Opening active journey');
      navigateToMonitoring(trip.id);
    } else {
      console.log('[JourneyCoordinator] Opening existing planner');
      navigateToTripSetup({ existingTripId: trip.id, editMode: true });
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ANALYTICS                                                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

/**
 * Track journey coordination events for analytics.
 * Uses the existing analytics infrastructure if available.
 */
function trackAnalytics(event: string, properties?: Record<string, any>): void {
  try {
    console.log(`[Analytics] ${event}`, properties || '');
    // The app's analytics system can be integrated here
    // e.g., ExploreAnalytics.trackEvent(event, properties);
  } catch {
    // Analytics should never crash the app
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PREFILL DATA BUILDER                                                       */
/* ════════════════════════════════════════════════════════════════════════════ */

/**
 * Build comprehensive prefill data for the trip setup screen.
 * Populates everything the app already knows so the user only
 * needs to enter personal preferences (dates, budget, etc.).
 */
async function buildPrefillData(
  destination: Destination,
  classification: ClassificationResult,
): Promise<PrefillData> {
  // Look up destination airport
  const destinationAirport = await findDestinationAirport(destination);

  // Calculate approximate distance (Haversine formula)
  const estimatedDistance = classification.currentCoordinates && destination.coordinates
    ? calculateHaversineDistance(
        classification.currentCoordinates.latitude,
        classification.currentCoordinates.longitude,
        destination.coordinates.lat,
        destination.coordinates.lng,
      )
    : undefined;

  // Estimate travel duration (rough: 800 km/h for flights, 100 km/h for driving)
  const estimatedDuration = estimatedDistance
    ? classification.journeyType === JourneyType.LOCAL
      ? `${Math.round(estimatedDistance / 100)}h` // driving speed
      : `${Math.round(estimatedDistance / 800)}h` // flight speed
    : undefined;

  return {
    // Destination
    destinationName: destination.name || destination.city || '',
    destinationCountry: destination.country || '',
    destinationCountryCode: resolveCountryCode(destination.countryCode, destination.country) || '',
    destinationLat: destination.coordinates?.lat,
    destinationLng: destination.coordinates?.lng,
    destinationTimezone: destination.timezone || destination.timezoneOffset || '',
    destinationCurrency: destination.currency || '',
    destinationLanguage: destination.language || '',
    destinationAirport: destinationAirport || null,
    destinationAirportCode: destinationAirport?.code || '',

    // Origin
    originCountryCode: classification.currentCountryCode,
    originLat: classification.currentCoordinates?.latitude,
    originLng: classification.currentCoordinates?.longitude,

    // Classification
    journeyType: classification.journeyType,
    suggestedTravelMode: classification.journeyType === JourneyType.INTERNATIONAL ? 'flight' : 'driving',
    estimatedDistance,
    estimatedDuration,
  };
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */

/* ── Location Cache ────────────────────────────────────────────────────────── */

/**
 * Short-lived in-memory cache for the current location's country code.
 * TTL is 30 seconds to prevent stale classifications when crossing borders.
 * The country lookup is inexpensive compared to making an incorrect trip decision.
 */
let _cachedCurrentCountry: {
  countryCode: string;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 30_000; // 30 seconds — intentionally short

function getCachedCountry(): string | null {
  if (
    _cachedCurrentCountry &&
    Date.now() - _cachedCurrentCountry.timestamp < CACHE_TTL_MS
  ) {
    return _cachedCurrentCountry.countryCode;
  }
  return null;
}

function setCachedCountry(countryCode: string): void {
  _cachedCurrentCountry = { countryCode, timestamp: Date.now() };
}

function clearCachedCountry(): void {
  _cachedCurrentCountry = null;
}

/* ── User Home Country Fallback ────────────────────────────────────────────── */

async function getUserHomeCountry(): Promise<string | null> {
  try {
    const { useAuthStore } = await import('@/src/store/useAuthStore');
    const authState = useAuthStore.getState();
    const uid = authState.token;
    if (!uid) return null;

    const { getFirebaseFirestore } = await import('@/src/firebase/firebaseApp');
    const { doc, getDoc } = await import('firebase/firestore');
    const db = getFirebaseFirestore();
    const userDoc = await getDoc(doc(db, 'users', uid));
    const data = userDoc.data();
    return data?.homeCountry ?? null;
  } catch (err) {
    console.warn('[JourneyCoordinator] Error fetching home country:', err);
    return null;
  }
}

/* ── Reverse Geocoding ─────────────────────────────────────────────────────── */

async function reverseGeocodeToCountryCode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const geocode = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    if (geocode.length > 0 && geocode[0].isoCountryCode) {
      return geocode[0].isoCountryCode.toUpperCase();
    }
    console.warn('[JourneyCoordinator] Reverse geocode returned no country code');
    return null;
  } catch (err) {
    console.warn('[JourneyCoordinator] Reverse geocoding failed:', err);
    return null;
  }
}

/* ── Duplicate Trip Detection ──────────────────────────────────────────────── */

/**
 * Check if a trip for the same destination already exists.
 * Uses destination + trip status + trip type for matching.
 * Allows multiple completed trips to the same destination.
 */
async function checkExistingTrip(
  destination: Destination,
): Promise<ExistingTripCheck> {
  try {
    const trips = useTripStore.getState().trips;
    if (!trips || trips.length === 0) {
      return { exists: false, trip: null, lifecyclePhase: null };
    }

    // Match by destination name or city — must have a non-empty match string
    const destinationMatch = destination.name?.toLowerCase().trim();
    const cityMatch = destination.city?.toLowerCase().trim();

    // If both match strings are empty, skip duplicate check entirely
    if (!destinationMatch && !cityMatch) {
      return { exists: false, trip: null, lifecyclePhase: null };
    }

    const existing = trips.find((trip) => {
      // Skip completed trips — allow multiple historical journeys
      if (trip.status === 'completed' || trip.status === 'canceled') {
        return false;
      }

      const tripTo = (trip.to || '').toLowerCase();
      // Only check non-empty strings to avoid false matches
      if (destinationMatch && tripTo.includes(destinationMatch)) return true;
      if (cityMatch && tripTo.includes(cityMatch)) return true;
      if (destinationMatch) {
        const compacted = destinationMatch.replace(/\s+/g, '');
        if (compacted && tripTo.includes(compacted)) return true;
      }
      return false;
    });

    if (!existing) {
      return { exists: false, trip: null, lifecyclePhase: null };
    }

    // Determine lifecycle phase from status
    let phase: ExistingTripCheck['lifecyclePhase'] = 'planning';
    const status = existing.status;
    if (
      status === 'active' ||
      status === 'boarding' ||
      status === 'airborne' ||
      status === 'arriving'
    ) {
      phase = 'active';
    } else if (status === 'completed' || status === 'canceled') {
      phase = 'completed';
    } else {
      phase = 'planning';
    }

    console.log('[JourneyCoordinator] Existing trip found');
    console.log(`[JourneyCoordinator] Status: ${existing.status}`);
    console.log(`[JourneyCoordinator] Lifecycle Phase: ${phase}`);

    return { exists: true, trip: existing, lifecyclePhase: phase };
  } catch (err) {
    console.warn('[JourneyCoordinator] Duplicate check error:', err);
    return { exists: false, trip: null, lifecyclePhase: null };
  }
}

/* ── Airport Lookup ────────────────────────────────────────────────────────── */

async function findDestinationAirport(
  destination: Destination,
): Promise<AirportEntry | null> {
  try {
    const searchQuery = destination.city || destination.name;
    const airports = await searchAirports(searchQuery);
    if (airports.length > 0) {
      return airports[0];
    }

    if (destination.nearbyAirport?.name) {
      const nearbyAirports = await searchAirports(destination.nearbyAirport.name);
      if (nearbyAirports.length > 0) {
        return nearbyAirports[0];
      }
    }

    return null;
  } catch (err) {
    console.warn('[JourneyCoordinator] Airport lookup failed:', err);
    return null;
  }
}

/* ── Haversine Distance ────────────────────────────────────────────────────── */

/**
 * Calculate the great-circle distance between two points on Earth.
 * Returns distance in kilometers.
 */
function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  PUBLIC API — JourneyCoordinatorService                                     */
/*  The single entry point for the UI layer.                                   */
/* ════════════════════════════════════════════════════════════════════════════ */

/**
 * Coordinate My Journey — the single entry point for the entire workflow.
 *
 * @param destination - The destination object the user selected
 * @param navigation - Navigation callbacks for different screens
 *
 * The UI simply calls this method. All business logic is handled internally
 * by the layered architecture (Classifier → DecisionEngine → Coordinator).
 */
export async function coordinateJourney(
  destination: Destination,
  navigation: {
    navigateToMonitoring: (tripId: string) => void;
    navigateToTripSetup: (prefillData: Record<string, any>) => void;
    navigateToTrips: () => void;
  },
): Promise<void> {
  try {
    console.log('═══════════════════════════════════════════════════');
    console.log('[JourneyCoordinator] Starting journey coordination');
    console.log(`[JourneyCoordinator] Destination: ${destination.name} (${destination.countryCode})`);
    console.log('═══════════════════════════════════════════════════');

    trackAnalytics('coordinate_journey_clicked', {
      destinationId: destination.id,
      destinationName: destination.name,
      destinationCountry: destination.countryCode,
    });

    // Step 1: Classify the trip
    const { classification, error: classificationError } =
      await JourneyClassifier.classify(destination);

    if (!classification || classificationError) {
      Alert.alert(
        'Unable to Start Journey',
        classificationError ||
          'Could not determine your trip type. Please ensure location services are enabled and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Try Again',
            onPress: () => coordinateJourney(destination, navigation),
          },
        ],
      );
      return;
    }

    // Track classification
    trackAnalytics(
      classification.journeyType === JourneyType.LOCAL
        ? 'trip_classified_local'
        : 'trip_classified_international',
      {
        currentCountry: classification.currentCountryCode,
        destinationCountry: classification.destinationCountryCode,
      },
    );

    // Step 2: Decide what to do
    const decision = await JourneyDecisionEngine.decide(classification, destination);

    // Step 3: Execute the decision
    await JourneyCoordinator.execute(decision, navigation);
  } catch (err) {
    console.error('[JourneyCoordinator] Fatal error:', err);
    Alert.alert(
      'Unexpected Error',
      'An unexpected error occurred. Please try again later.',
    );
  }
}

/* ── Exported convenience for UI layer ─────────────────────────────────────── */

export const JourneyCoordinatorService = {
  coordinateJourney,
  JourneyType,
  JourneyAction,
  JourneyClassifier,
  JourneyDecisionEngine,
  JourneyCoordinator,
};