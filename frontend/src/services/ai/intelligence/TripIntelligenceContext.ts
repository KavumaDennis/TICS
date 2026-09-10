/**
 * TripIntelligenceContext.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared intelligence context consumed by both AI Alerts and AI Recommendations.
 *
 * Every recommendation and alert is generated using:
 *   Trip Context → Trip Classification → Trip Stage → User Preferences →
 *   Current Location → Weather → Destination Intelligence → AI Output
 *
 * This service eliminates duplicated logic between alerts and recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TripClassificationService, TripType } from '@/src/services/trip/TripClassificationService';
import type { Trip } from '@/src/store/tripStore';
import type { TravelerLocation } from '@/src/services/LocationService';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ENUMS                                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

export enum TripStage {
  PLANNING = 'planning',
  PREPARING = 'preparing',
  TRAVELLING = 'travelling',
  ARRIVING = 'arriving',
  EXPLORING = 'exploring',
  RETURNING = 'returning',
  COMPLETED = 'completed',
}

export enum TransportMode {
  CAR = 'car',
  BUS = 'bus',
  TRAIN = 'train',
  FLIGHT = 'flight',
  MOTORCYCLE = 'motorcycle',
  WALKING = 'walking',
  CYCLING = 'cycling',
  BOAT = 'boat',
}

export enum AlertPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum RecommendationCategory {
  NAVIGATION = 'navigation',
  SAFETY = 'safety',
  WEATHER = 'weather',
  BUDGET = 'budget',
  FOOD = 'food',
  ACCOMMODATION = 'accommodation',
  EVENTS = 'events',
  NEARBY_EXPERIENCES = 'nearby_experiences',
  HEALTH = 'health',
  TRANSPORT = 'transport',
  DOCUMENTS = 'documents',
  SHOPPING = 'shopping',
  PHOTOGRAPHY = 'photography',
  ADVENTURE = 'adventure',
  FAMILY = 'family',
  BUSINESS = 'business',
  NIGHTLIFE = 'nightlife',
  CULTURE = 'culture',
  ENTERTAINMENT = 'entertainment',
  EMERGENCY = 'emergency',
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  WEATHER INTERFACE                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface WeatherData {
  temperature: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  isSevere: boolean;
  forecast: Array<{
    date: string;
    tempHigh: number;
    tempLow: number;
    condition: string;
  }>;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  USER PREFERENCES                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface UserPreferences {
  savedDestinations: string[];
  tripHistory: string[];
  favoriteCategories: RecommendationCategory[];
  travelStyle: string[];
  budget: { min?: number; max?: number; currency?: string };
  dismissedAlerts: string[];
  likedRecommendations: string[];
  previousInteractions: Array<{
    type: 'alert_dismissed' | 'recommendation_liked' | 'recommendation_saved' | 'journey_created';
    itemId: string;
    timestamp: number;
  }>;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  NEARBY PLACE                                                              */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface NearbyPlace {
  id: string;
  name: string;
  type: string;
  rating: number;
  distance: number;
  coordinates: { lat: number; lng: number };
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  priceLevel?: number;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ROAD CONDITIONS                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface RoadCondition {
  road: string;
  condition: 'good' | 'fair' | 'poor' | 'closed';
  congestion: 'none' | 'light' | 'moderate' | 'heavy';
  incident?: string;
  lastUpdated: string;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRAVEL DOCUMENTS                                                         */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface TravelDocument {
  type: string;
  name: string;
  required: boolean;
  expiryDate?: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing';
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SAFETY INFORMATION                                                       */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface SafetyInformation {
  overallRisk: 'low' | 'moderate' | 'high';
  advisories: string[];
  emergencyNumbers: Array<{ service: string; number: string }>;
  safeAreas: string[];
  areasToAvoid: string[];
  healthRecommendations: string[];
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  ITINERARY EVENT                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface ItineraryEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string;
  type: 'flight' | 'hotel' | 'activity' | 'meeting' | 'transfer' | 'other';
  notes?: string;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRIP INTELLIGENCE CONTEXT                                                 */
/*  The complete context object consumed by all AI services.                  */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface TripIntelligenceContext {
  /** Trip type classification */
  tripType: TripType;
  /** Current stage of the journey */
  currentStage: TripStage;
  /** Origin location info */
  origin: {
    country: string;
    countryCode: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  /** Destination location info */
  destination: {
    country: string;
    countryCode: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
    timezone?: string;
    currency?: string;
    language?: string;
  };
  /** Transport mode */
  transportMode: TransportMode;
  /** Current weather at location */
  weather: WeatherData | null;
  /** User preferences and history */
  userPreferences: UserPreferences;
  /** Budget information */
  budget: { min?: number; max?: number; currency?: string };
  /** Nearby places of interest */
  nearbyPlaces: NearbyPlace[];
  /** Current user location */
  currentLocation: TravelerLocation | null;
  /** Trip itinerary */
  itinerary: ItineraryEvent[];
  /** Local events */
  events: Array<{
    id: string;
    name: string;
    date: string;
    location: string;
    category: string;
    description?: string;
  }>;
  /** Road conditions (for driving trips) */
  roadConditions: RoadCondition[];
  /** Required travel documents */
  travelDocuments: TravelDocument[];
  /** Safety information */
  safetyInformation: SafetyInformation | null;
  /** Whether the context is still loading */
  loading: boolean;
  /** Any error during context building */
  error: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  DEFAULT CONTEXT                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

const DEFAULT_CONTEXT: TripIntelligenceContext = {
  tripType: TripType.LOCAL,
  currentStage: TripStage.PLANNING,
  origin: { country: '', countryCode: '' },
  destination: { country: '', countryCode: '' },
  transportMode: TransportMode.CAR,
  weather: null,
  userPreferences: {
    savedDestinations: [],
    tripHistory: [],
    favoriteCategories: [],
    travelStyle: [],
    budget: {},
    dismissedAlerts: [],
    likedRecommendations: [],
    previousInteractions: [],
  },
  budget: {},
  nearbyPlaces: [],
  currentLocation: null,
  itinerary: [],
  events: [],
  roadConditions: [],
  travelDocuments: [],
  safetyInformation: null,
  loading: false,
  error: null,
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRIP STAGE DETECTION                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

function detectTripStage(trip: Trip | null, currentLocation: TravelerLocation | null): TripStage {
  if (!trip) return TripStage.PLANNING;

  const status = trip.status;
  const now = Date.now();
  const departure = trip.departureTime ? new Date(trip.departureTime).getTime() : null;
  const arrival = trip.arrivalTime ? new Date(trip.arrivalTime).getTime() : null;

  // Completed or cancelled
  if (status === 'completed' || status === 'canceled') {
    return TripStage.COMPLETED;
  }

  // Planning phase: no departure time set or departure is > 7 days away
  if (!departure || (departure - now > 7 * 24 * 60 * 60 * 1000)) {
    return TripStage.PLANNING;
  }

  // Preparing phase: departure is within 7 days
  if (departure - now > 24 * 60 * 60 * 1000 && departure - now <= 7 * 24 * 60 * 60 * 1000) {
    return TripStage.PREPARING;
  }

  // Travelling phase: between departure and arrival
  if (departure && arrival && now >= departure && now <= arrival) {
    // Check if arriving soon (within 2 hours of arrival)
    if (arrival - now <= 2 * 60 * 60 * 1000) {
      return TripStage.ARRIVING;
    }
    return TripStage.TRAVELLING;
  }

  // After arrival but before departure back
  if (arrival && now > arrival) {
    // Check if there's a return leg
    // For now, assume exploring if past arrival
    return TripStage.EXPLORING;
  }

  // If active but no clear timing, check status
  if (status === 'active' || status === 'boarding' || status === 'airborne') {
    return TripStage.TRAVELLING;
  }

  return TripStage.PLANNING;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  TRANSPORT MODE DETECTION                                                  */
/* ════════════════════════════════════════════════════════════════════════════ */

function detectTransportMode(trip: Trip | null, tripType: TripType): TransportMode {
  if (!trip) return TransportMode.CAR;

  // Check trip data for transport hints
  const toLower = (trip.to || '').toLowerCase();
  const fromLower = (trip.from || '').toLowerCase();
  const titleLower = (trip.title || '').toLowerCase();

  // Flight indicators
  if (
    trip.flightNumber ||
    trip.airline ||
    trip.departureAirport ||
    trip.destinationAirport ||
    titleLower.includes('flight') ||
    titleLower.includes('fly') ||
    (tripType === TripType.INTERNATIONAL && !trip.flightNumber && !trip.airline)
  ) {
    return TransportMode.FLIGHT;
  }

  // Bus indicators
  if (
    titleLower.includes('bus') ||
    titleLower.includes('coach') ||
    toLower.includes('bus station')
  ) {
    return TransportMode.BUS;
  }

  // Train indicators
  if (
    titleLower.includes('train') ||
    titleLower.includes('rail') ||
    toLower.includes('station')
  ) {
    return TransportMode.TRAIN;
  }

  // Boat indicators
  if (
    titleLower.includes('ferry') ||
    titleLower.includes('boat') ||
    titleLower.includes('cruise')
  ) {
    return TransportMode.BOAT;
  }

  // Default: car for local/regional, flight for international
  if (tripType === TripType.INTERNATIONAL) return TransportMode.FLIGHT;
  if (tripType === TripType.REGIONAL) return TransportMode.CAR;
  return TransportMode.CAR;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CONTEXT BUILDER                                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

export class TripIntelligenceContextBuilder {
  private context: TripIntelligenceContext = { ...DEFAULT_CONTEXT };

  /**
   * Build the full intelligence context from a trip and optional data sources.
   * This is the primary entry point for creating a shared context.
   */
  async build(options: {
    trip: Trip | null;
    currentLocation?: TravelerLocation | null;
    weather?: WeatherData | null;
    nearbyPlaces?: NearbyPlace[];
    events?: Array<{ id: string; name: string; date: string; location: string; category: string; description?: string }>;
    roadConditions?: RoadCondition[];
    userPreferences?: Partial<UserPreferences>;
  }): Promise<TripIntelligenceContext> {
    const { trip, currentLocation, weather, nearbyPlaces, events, roadConditions, userPreferences } = options;

    // 1. Classify the trip
    const classification = this.classifyTrip(trip);

    // 2. Detect trip stage
    const currentStage = detectTripStage(trip, currentLocation || null);

    // 3. Detect transport mode
    const transportMode = detectTransportMode(trip, classification.tripType);

    // 4. Build origin/destination info
    const origin = this.buildOriginInfo(trip, classification);
    const destination = this.buildDestinationInfo(trip, classification);

    // 5. Build user preferences
    const mergedPreferences: UserPreferences = {
      savedDestinations: userPreferences?.savedDestinations || [],
      tripHistory: userPreferences?.tripHistory || [],
      favoriteCategories: userPreferences?.favoriteCategories || [],
      travelStyle: userPreferences?.travelStyle || [],
      budget: userPreferences?.budget || {},
      dismissedAlerts: userPreferences?.dismissedAlerts || [],
      likedRecommendations: userPreferences?.likedRecommendations || [],
      previousInteractions: userPreferences?.previousInteractions || [],
    };

    // 6. Build travel documents based on trip type
    const travelDocuments = this.buildTravelDocuments(classification.tripType, destination.countryCode);

    // 7. Build safety information
    const safetyInformation = this.buildSafetyInfo(classification.tripType, destination.countryCode);

    // 8. Build itinerary from trip data
    const itinerary = this.buildItinerary(trip);

    this.context = {
      tripType: classification.tripType,
      currentStage,
      origin,
      destination,
      transportMode,
      weather: weather || null,
      userPreferences: mergedPreferences,
      budget: mergedPreferences.budget,
      nearbyPlaces: nearbyPlaces || [],
      currentLocation: currentLocation || null,
      itinerary,
      events: events || [],
      roadConditions: roadConditions || [],
      travelDocuments,
      safetyInformation,
      loading: false,
      error: null,
    };

    return this.context;
  }

  /**
   * Classify the trip using the existing TripClassificationService.
   */
  private classifyTrip(trip: Trip | null): {
    tripType: TripType;
    originCountry: string;
    destinationCountry: string;
    isSameCountry: boolean;
    isNeighboring: boolean;
  } {
    if (!trip) {
      return {
        tripType: TripType.LOCAL,
        originCountry: '',
        destinationCountry: '',
        isSameCountry: true,
        isNeighboring: false,
      };
    }

    // If trip already has a type, use it
    if (trip.type) {
      const tripType = trip.type as unknown as TripType;
      return {
        tripType,
        originCountry: '',
        destinationCountry: '',
        isSameCountry: tripType === TripType.LOCAL,
        isNeighboring: tripType === TripType.REGIONAL,
      };
    }

    // Extract country codes from trip data
    const originCode = this.extractCountryCode(trip.from) || 'UG';
    const destCode = this.extractCountryCode(trip.to) || '';

    if (!destCode) {
      return {
        tripType: TripType.LOCAL,
        originCountry: originCode,
        destinationCountry: '',
        isSameCountry: true,
        isNeighboring: false,
      };
    }

    const result = TripClassificationService.classify({
      originCountry: originCode,
      destinationCountry: destCode,
      originCity: trip.from,
      destinationCity: trip.to,
    });

    return {
      tripType: result.tripType,
      originCountry: result.originCountry,
      destinationCountry: result.destinationCountry,
      isSameCountry: result.isSameCountry,
      isNeighboring: result.isNeighboringCountry,
    };
  }

  /**
   * Extract a country code from a location string.
   */
  private extractCountryCode(location: string): string | null {
    if (!location) return null;

    const parts = location.split(',').map((p) => p.trim());
    const lastPart = parts[parts.length - 1].toLowerCase();

    const countryNameToCode: Record<string, string> = {
      'uganda': 'UG', 'kenya': 'KE', 'tanzania': 'TZ', 'rwanda': 'RW',
      'burundi': 'BI', 'south sudan': 'SS', 'ethiopia': 'ET', 'somalia': 'SO',
      'djibouti': 'DJ', 'eritrea': 'ER', 'drc': 'CD', 'congo': 'CD',
      'south africa': 'ZA', 'nigeria': 'NG', 'ghana': 'GH', 'egypt': 'EG',
      'morocco': 'MA', 'united kingdom': 'GB', 'uk': 'GB', 'france': 'FR',
      'germany': 'DE', 'italy': 'IT', 'spain': 'ES', 'netherlands': 'NL',
      'switzerland': 'CH', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK',
      'china': 'CN', 'india': 'IN', 'japan': 'JP', 'south korea': 'KR',
      'singapore': 'SG', 'thailand': 'TH', 'united states': 'US', 'usa': 'US',
      'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR', 'australia': 'AU',
      'new zealand': 'NZ', 'uae': 'AE', 'dubai': 'AE', 'turkey': 'TR',
      'russia': 'RU', 'saudi arabia': 'SA', 'israel': 'IL',
    };

    if (/^[A-Z]{2}$/.test(lastPart.toUpperCase())) {
      return lastPart.toUpperCase();
    }

    return countryNameToCode[lastPart] || null;
  }

  /**
   * Build origin location info.
   */
  private buildOriginInfo(trip: Trip | null, classification: { originCountry: string }): TripIntelligenceContext['origin'] {
    const fromParts = (trip?.from || '').split(',').map((p) => p.trim());
    return {
      country: fromParts[fromParts.length - 1] || '',
      countryCode: classification.originCountry,
      city: fromParts.length > 1 ? fromParts[0] : undefined,
    };
  }

  /**
   * Build destination location info.
   */
  private buildDestinationInfo(trip: Trip | null, classification: { destinationCountry: string; tripType: TripType }): TripIntelligenceContext['destination'] {
    const toParts = (trip?.to || '').split(',').map((p) => p.trim());
    const countryInfo = classification.destinationCountry
      ? TripClassificationService.getCountryInfo(classification.destinationCountry)
      : null;

    return {
      country: toParts[toParts.length - 1] || '',
      countryCode: classification.destinationCountry,
      city: toParts.length > 1 ? toParts[0] : undefined,
      timezone: countryInfo?.timezone,
      currency: countryInfo?.currency,
      language: countryInfo?.language,
    };
  }

  /**
   * Build travel documents based on trip type.
   */
  private buildTravelDocuments(tripType: TripType, destinationCountry: string): TravelDocument[] {
    const documents: TravelDocument[] = [];

    if (tripType === TripType.LOCAL) {
      documents.push(
        { type: 'id', name: 'National ID', required: true, status: 'valid' },
        { type: 'license', name: 'Driving Permit', required: false, status: 'valid' },
      );
    } else if (tripType === TripType.REGIONAL) {
      documents.push(
        { type: 'id', name: 'National ID', required: true, status: 'valid' },
        { type: 'passport', name: 'Passport', required: true, status: 'valid' },
        { type: 'visa', name: 'Visa (if required)', required: false, status: 'missing' },
        { type: 'insurance', name: 'Travel Insurance', required: true, status: 'valid' },
        { type: 'vehicle', name: 'Vehicle Documents', required: false, status: 'valid' },
      );
    } else {
      documents.push(
        { type: 'passport', name: 'Passport', required: true, status: 'valid' },
        { type: 'visa', name: 'Visa', required: true, status: 'missing' },
        { type: 'vaccination', name: 'Vaccination Certificate', required: false, status: 'missing' },
        { type: 'insurance', name: 'Travel Insurance', required: true, status: 'valid' },
        { type: 'boarding_pass', name: 'Boarding Pass', required: true, status: 'missing' },
        { type: 'hotel_voucher', name: 'Hotel Reservation', required: false, status: 'missing' },
      );
    }

    return documents;
  }

  /**
   * Build safety information based on trip type and destination.
   */
  private buildSafetyInfo(tripType: TripType, destinationCountry: string): SafetyInformation | null {
    if (tripType === TripType.LOCAL) {
      return {
        overallRisk: 'low',
        advisories: ['Standard safety precautions apply'],
        emergencyNumbers: [
          { service: 'Police', number: '999' },
          { service: 'Ambulance', number: '999' },
          { service: 'Fire', number: '999' },
        ],
        safeAreas: [],
        areasToAvoid: [],
        healthRecommendations: ['Carry a basic first aid kit'],
      };
    }

    if (tripType === TripType.REGIONAL) {
      return {
        overallRisk: 'moderate',
        advisories: [
          'Check border crossing requirements',
          'Ensure vehicle has valid insurance for cross-border travel',
          'Carry emergency cash in local currency',
        ],
        emergencyNumbers: [
          { service: 'Police', number: '999' },
          { service: 'Ambulance', number: '999' },
          { service: 'Embassy', number: 'Contact your embassy' },
        ],
        safeAreas: [],
        areasToAvoid: [],
        healthRecommendations: [
          'Check vaccination requirements',
          'Carry mosquito repellent',
          'Drink bottled water',
        ],
      };
    }

    return {
      overallRisk: 'moderate',
      advisories: [
        'Register with your embassy upon arrival',
        'Keep digital copies of all travel documents',
        'Share your itinerary with family or friends',
      ],
      emergencyNumbers: [
        { service: 'Police', number: '112' },
        { service: 'Ambulance', number: '112' },
        { service: 'Embassy', number: 'Contact your embassy' },
      ],
      safeAreas: [],
      areasToAvoid: [],
      healthRecommendations: [
        'Check required vaccinations 6 weeks before travel',
        'Pack a travel health kit',
        'Ensure travel insurance covers medical evacuation',
      ],
    };
  }

  /**
   * Build itinerary from trip data.
   */
  private buildItinerary(trip: Trip | null): ItineraryEvent[] {
    if (!trip) return [];

    const events: ItineraryEvent[] = [];

    // Add departure as a transfer event
    if (trip.departureTime) {
      events.push({
        id: 'departure',
        title: `Departure from ${trip.from || 'Origin'}`,
        startTime: trip.departureTime,
        endTime: trip.departureTime,
        location: trip.from || '',
        type: 'transfer',
      });
    }

    // Add arrival
    if (trip.arrivalTime) {
      events.push({
        id: 'arrival',
        title: `Arrival at ${trip.to || 'Destination'}`,
        startTime: trip.arrivalTime,
        endTime: trip.arrivalTime,
        location: trip.to || '',
        type: 'transfer',
      });
    }

    // Add hotels
    if (trip.hotels) {
      trip.hotels.forEach((hotel, index) => {
        if (hotel.name) {
          events.push({
            id: `hotel-${index}`,
            title: `Stay at ${hotel.name}`,
            startTime: hotel.checkInAt || trip.arrivalTime,
            endTime: hotel.checkOutAt || '',
            location: hotel.name,
            type: 'hotel',
          });
        }
      });
    }

    return events;
  }

  /**
   * Get the current context.
   */
  getContext(): TripIntelligenceContext {
    return this.context;
  }

  /**
   * Reset the context to defaults.
   */
  reset(): void {
    this.context = { ...DEFAULT_CONTEXT };
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SINGLETON EXPORT                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

export const tripIntelligenceContext = new TripIntelligenceContextBuilder();
export default tripIntelligenceContext;