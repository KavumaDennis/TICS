/**
 * ContextAggregator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Collects and structures all trip context data to pass to Gemini.
 *
 * Aggregates:
 * - Trip type (Local, Regional, International)
 * - Trip stage
 * - Transport mode
 * - Current location
 * - Destination
 * - Weather
 * - Traffic/road conditions
 * - Nearby places
 * - Events
 * - User preferences
 * - Budget
 * - Trip history
 * - Saved destinations
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TripClassificationService, TripType } from '@/src/services/trip/TripClassificationService';
import type { Trip } from '@/src/store/tripStore';
import type { TravelerLocation } from '@/src/services/LocationService';
import {
  TripStage,
  TransportMode,
  RecommendationCategory,
  type WeatherData,
  type UserPreferences,
  type NearbyPlace,
  type RoadCondition,
  type TravelDocument,
  type SafetyInformation,
  type ItineraryEvent,
} from './TripIntelligenceContext';

/* ════════════════════════════════════════════════════════════════════════════ */
/*  AGGREGATED CONTEXT - The full structured context sent to Gemini            */
/* ════════════════════════════════════════════════════════════════════════════ */

export interface AggregatedContext {
  trip: {
    type: TripType;
    stage: TripStage;
    transportMode: TransportMode;
    title: string;
    origin: {
      name: string;
      country: string;
      countryCode: string;
      city?: string;
      coordinates?: { lat: number; lng: number };
    };
    destination: {
      name: string;
      country: string;
      countryCode: string;
      city?: string;
      coordinates?: { lat: number; lng: number };
      timezone?: string;
      currency?: string;
      language?: string;
    };
    departureTime?: string;
    arrivalTime?: string;
    flightNumber?: string;
    airline?: string;
  };
  location: {
    current: {
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
    } | null;
    nearbyPlaces: NearbyPlace[];
    events: Array<{
      id: string;
      name: string;
      date: string;
      location: string;
      category: string;
    }>;
  };
  weather: WeatherData | null;
  roadConditions: RoadCondition[];
  user: {
    preferences: string[];
    travelStyle: string[];
    budget: { min?: number; max?: number; currency?: string };
    savedDestinations: string[];
    tripHistory: string[];
    favoriteCategories: RecommendationCategory[];
    previousInteractions: Array<{
      type: string;
      itemId: string;
      timestamp: number;
    }>;
    dismissedAlerts: string[];
    likedRecommendations: string[];
  };
  itinerary: ItineraryEvent[];
  documents: TravelDocument[];
  safety: SafetyInformation | null;
  timestamp: string;
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  CONTEXT AGGREGATOR                                                        */
/* ════════════════════════════════════════════════════════════════════════════ */

export class ContextAggregator {
  /**
   * Aggregate all context data into a single structured object.
   * This is the ONLY source of truth for AI context.
   */
  async aggregate(options: {
    trip: Trip | null;
    currentLocation?: TravelerLocation | null;
    weather?: WeatherData | null;
    nearbyPlaces?: NearbyPlace[];
    events?: Array<{ id: string; name: string; date: string; location: string; category: string; description?: string }>;
    roadConditions?: RoadCondition[];
    userPreferences?: Partial<UserPreferences>;
  }): Promise<AggregatedContext> {
    const { trip, currentLocation, weather, nearbyPlaces, events, roadConditions, userPreferences } = options;

    // 1. Classify trip
    const classification = this.classifyTrip(trip);

    // 2. Detect stage and mode
    const stage = this.detectStage(trip);
    const mode = this.detectTransportMode(trip, classification.tripType);

    // 3. Extract location info
    const origin = this.buildOriginInfo(trip);
    const destination = this.buildDestinationInfo(trip, classification);

    return {
      trip: {
        type: classification.tripType,
        stage,
        transportMode: mode,
        title: trip?.title || 'Untitled Trip',
        origin,
        destination,
        departureTime: trip?.departureTime,
        arrivalTime: trip?.arrivalTime,
        flightNumber: trip?.flightNumber || undefined,
        airline: trip?.airline || undefined,
      },
      location: {
        current: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          heading: currentLocation.heading,
          speed: currentLocation.speed,
        } : null,
        nearbyPlaces: nearbyPlaces || [],
        events: (events || []).map(e => ({
          id: e.id,
          name: e.name,
          date: e.date,
          location: e.location,
          category: e.category,
        })),
      },
      weather: weather || null,
      roadConditions: roadConditions || [],
      user: {
        preferences: userPreferences?.travelStyle || [],
        travelStyle: userPreferences?.travelStyle || [],
        budget: userPreferences?.budget || {},
        savedDestinations: userPreferences?.savedDestinations || [],
        tripHistory: userPreferences?.tripHistory || [],
        favoriteCategories: userPreferences?.favoriteCategories || [],
        previousInteractions: userPreferences?.previousInteractions || [],
        dismissedAlerts: userPreferences?.dismissedAlerts || [],
        likedRecommendations: userPreferences?.likedRecommendations || [],
      },
      itinerary: this.buildItinerary(trip),
      documents: this.buildDocuments(classification.tripType),
      safety: this.buildSafetyInfo(classification.tripType),
      timestamp: new Date().toISOString(),
    };
  }

  private classifyTrip(trip: Trip | null): { tripType: TripType; originCountry: string; destinationCountry: string; isSameCountry: boolean; isNeighboring: boolean } {
    if (!trip) return { tripType: TripType.LOCAL, originCountry: '', destinationCountry: '', isSameCountry: true, isNeighboring: false };
    if (trip.type) {
      const tt = trip.type as unknown as TripType;
      return { tripType: tt, originCountry: '', destinationCountry: '', isSameCountry: tt === TripType.LOCAL, isNeighboring: tt === TripType.REGIONAL };
    }
    const oCode = this.extractCountryCode(trip.from) || 'UG';
    const dCode = this.extractCountryCode(trip.to) || '';
    if (!dCode) return { tripType: TripType.LOCAL, originCountry: oCode, destinationCountry: '', isSameCountry: true, isNeighboring: false };
    const r = TripClassificationService.classify({ originCountry: oCode, destinationCountry: dCode, originCity: trip.from, destinationCity: trip.to });
    return { tripType: r.tripType, originCountry: r.originCountry, destinationCountry: r.destinationCountry, isSameCountry: r.isSameCountry, isNeighboring: r.isNeighboringCountry };
  }

  private detectStage(trip: Trip | null): TripStage {
    if (!trip) return TripStage.PLANNING;
    const status = trip.status;
    const now = Date.now();
    const dep = trip.departureTime ? new Date(trip.departureTime).getTime() : null;
    const arr = trip.arrivalTime ? new Date(trip.arrivalTime).getTime() : null;
    if (status === 'completed' || status === 'canceled') return TripStage.COMPLETED;
    if (!dep || (dep - now > 7 * 86400000)) return TripStage.PLANNING;
    if (dep - now > 86400000 && dep - now <= 7 * 86400000) return TripStage.PREPARING;
    if (dep && arr && now >= dep && now <= arr) {
      if (arr - now <= 7200000) return TripStage.ARRIVING;
      return TripStage.TRAVELLING;
    }
    if (arr && now > arr) return TripStage.EXPLORING;
    if (status === 'active' || status === 'boarding' || status === 'airborne') return TripStage.TRAVELLING;
    return TripStage.PLANNING;
  }

  private detectTransportMode(trip: Trip | null, tripType: TripType): TransportMode {
    if (!trip) return TransportMode.CAR;
    const t = (trip.title || '').toLowerCase();
    const to = (trip.to || '').toLowerCase();
    if (trip.flightNumber || trip.airline || trip.departureAirport || trip.destinationAirport || t.includes('flight') || t.includes('fly') || (tripType === TripType.INTERNATIONAL && !trip.flightNumber && !trip.airline)) return TransportMode.FLIGHT;
    if (t.includes('bus') || t.includes('coach') || to.includes('bus station')) return TransportMode.BUS;
    if (t.includes('train') || t.includes('rail') || to.includes('station')) return TransportMode.TRAIN;
    if (t.includes('ferry') || t.includes('boat') || t.includes('cruise')) return TransportMode.BOAT;
    if (tripType === TripType.INTERNATIONAL) return TransportMode.FLIGHT;
    if (tripType === TripType.REGIONAL) return TransportMode.CAR;
    return TransportMode.CAR;
  }

  private extractCountryCode(loc: string): string | null {
    if (!loc) return null;
    const parts = loc.split(',').map(p => p.trim());
    const last = parts[parts.length - 1].toLowerCase();
    const map: Record<string, string> = {
      'uganda': 'UG', 'kenya': 'KE', 'tanzania': 'TZ', 'rwanda': 'RW',
      'burundi': 'BI', 'south sudan': 'SS', 'ethiopia': 'ET', 'somalia': 'SO',
      'drc': 'CD', 'congo': 'CD', 'south africa': 'ZA', 'nigeria': 'NG',
      'ghana': 'GH', 'egypt': 'EG', 'morocco': 'MA', 'united kingdom': 'GB',
      'uk': 'GB', 'france': 'FR', 'germany': 'DE', 'italy': 'IT', 'spain': 'ES',
      'china': 'CN', 'india': 'IN', 'japan': 'JP', 'south korea': 'KR',
      'singapore': 'SG', 'thailand': 'TH', 'united states': 'US', 'usa': 'US',
      'canada': 'CA', 'mexico': 'MX', 'brazil': 'BR', 'australia': 'AU',
      'new zealand': 'NZ', 'uae': 'AE', 'dubai': 'AE', 'turkey': 'TR',
      'russia': 'RU', 'saudi arabia': 'SA', 'israel': 'IL',
    };
    if (/^[A-Z]{2}$/.test(last.toUpperCase())) return last.toUpperCase();
    return map[last] || null;
  }

  private buildOriginInfo(trip: Trip | null): AggregatedContext['trip']['origin'] {
    const p = (trip?.from || '').split(',').map(s => s.trim());
    return { name: trip?.from || '', country: p[p.length - 1] || '', countryCode: '', city: p.length > 1 ? p[0] : undefined };
  }

  private buildDestinationInfo(trip: Trip | null, classification: { destinationCountry: string }): AggregatedContext['trip']['destination'] {
    const p = (trip?.to || '').split(',').map(s => s.trim());
    const ci = classification.destinationCountry ? TripClassificationService.getCountryInfo(classification.destinationCountry) : null;
    return { name: trip?.to || '', country: p[p.length - 1] || '', countryCode: classification.destinationCountry, city: p.length > 1 ? p[0] : undefined, timezone: ci?.timezone, currency: ci?.currency, language: ci?.language };
  }

  private buildItinerary(trip: Trip | null): ItineraryEvent[] {
    if (!trip) return [];
    const events: ItineraryEvent[] = [];
    if (trip.departureTime) events.push({ id: 'departure', title: `Depart from ${trip.from || 'Origin'}`, startTime: trip.departureTime, endTime: trip.departureTime, location: trip.from || '', type: 'transfer' });
    if (trip.arrivalTime) events.push({ id: 'arrival', title: `Arrive at ${trip.to || 'Destination'}`, startTime: trip.arrivalTime, endTime: trip.arrivalTime, location: trip.to || '', type: 'transfer' });
    if (trip.hotels) trip.hotels.forEach((h, i) => { if (h.name) events.push({ id: `hotel-${i}`, title: `Stay at ${h.name}`, startTime: h.checkInAt || trip.arrivalTime, endTime: h.checkOutAt || '', location: h.name, type: 'hotel' }); });
    return events;
  }

  private buildDocuments(tripType: TripType): TravelDocument[] {
    if (tripType === TripType.LOCAL) return [{ type: 'id', name: 'National ID', required: true, status: 'valid' }, { type: 'license', name: 'Driving Permit', required: false, status: 'valid' }];
    if (tripType === TripType.REGIONAL) return [
      { type: 'id', name: 'National ID', required: true, status: 'valid' },
      { type: 'passport', name: 'Passport', required: true, status: 'valid' },
      { type: 'visa', name: 'Visa (if required)', required: false, status: 'missing' },
      { type: 'insurance', name: 'Travel Insurance', required: true, status: 'valid' },
      { type: 'vehicle', name: 'Vehicle Documents', required: false, status: 'valid' },
    ];
    return [
      { type: 'passport', name: 'Passport', required: true, status: 'valid' },
      { type: 'visa', name: 'Visa', required: true, status: 'missing' },
      { type: 'vaccination', name: 'Vaccination Certificate', required: false, status: 'missing' },
      { type: 'insurance', name: 'Travel Insurance', required: true, status: 'valid' },
      { type: 'boarding_pass', name: 'Boarding Pass', required: true, status: 'missing' },
      { type: 'hotel_voucher', name: 'Hotel Reservation', required: false, status: 'missing' },
    ];
  }

  private buildSafetyInfo(tripType: TripType): SafetyInformation | null {
    if (tripType === TripType.LOCAL) return { overallRisk: 'low', advisories: ['Standard safety precautions apply'], emergencyNumbers: [{ service: 'Police', number: '999' }, { service: 'Ambulance', number: '999' }, { service: 'Fire', number: '999' }], safeAreas: [], areasToAvoid: [], healthRecommendations: ['Carry a basic first aid kit'] };
    if (tripType === TripType.REGIONAL) return { overallRisk: 'moderate', advisories: ['Check border crossing requirements', 'Ensure vehicle has valid insurance for cross-border travel', 'Carry emergency cash in local currency'], emergencyNumbers: [{ service: 'Police', number: '999' }, { service: 'Ambulance', number: '999' }, { service: 'Embassy', number: 'Contact your embassy' }], safeAreas: [], areasToAvoid: [], healthRecommendations: ['Check vaccination requirements', 'Carry mosquito repellent', 'Drink bottled water'] };
    return { overallRisk: 'moderate', advisories: ['Register with your embassy upon arrival', 'Keep digital copies of all travel documents', 'Share your itinerary with family or friends'], emergencyNumbers: [{ service: 'Police', number: '112' }, { service: 'Ambulance', number: '112' }, { service: 'Embassy', number: 'Contact your embassy' }], safeAreas: [], areasToAvoid: [], healthRecommendations: ['Check required vaccinations 6 weeks before travel', 'Pack a travel health kit', 'Ensure travel insurance covers medical evacuation'] };
  }
}

export const contextAggregator = new ContextAggregator();
export default contextAggregator;