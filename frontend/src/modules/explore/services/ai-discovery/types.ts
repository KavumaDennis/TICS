/**
 * AI Discovery Types
 * ─────────────────────────────────────────────────────────────────────────────
 * Core type definitions for the AI-powered travel discovery engine.
 * These types represent the full discovery pipeline:
 *   User Context → Candidate Data → Personalization → Gemini → Ranking → Feed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  Destination,
  Event,
  NearbyItem,
  WeekendEscape,
  DestinationCoordinates,
} from '@/src/modules/explore/types';

/* ── Discovery Context ──────────────────────────────────────────────────────── */

export interface DiscoveryUserContext {
  uid?: string;
  name?: string;
  email?: string;
  homeCountry?: string;
  homeCity?: string;
  currentLocation?: DestinationCoordinates;
  currentCity?: string;
  currentCountry?: string;
  travelPreferences?: string[];
  interests?: string[];
  budget?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  preferredTravelStyles?: string[];
  savedPlaces?: string[];
  savedDestinationIds?: string[];
  previouslyViewed?: string[];
  previousTrips?: string[];
  completedTrips?: string[];
  activeTrip?: {
    id?: string;
    title?: string;
    from?: string;
    to?: string;
    type?: 'LOCAL' | 'REGIONAL' | 'INTERNATIONAL';
    status?: string;
    departureTime?: string;
    arrivalTime?: string;
    destination?: string;
    destinationCoordinates?: DestinationCoordinates;
  } | null;
  upcomingTrip?: {
    id?: string;
    title?: string;
    from?: string;
    to?: string;
    type?: 'LOCAL' | 'REGIONAL' | 'INTERNATIONAL';
    departureTime?: string;
  } | null;
  searchHistory?: string[];
  recentlyDismissed?: string[];
  recentlyLiked?: string[];
  recentExploreActivity?: string[];
  currentSeason?: string;
  currentDate?: string;
  weather?: {
    tempC?: number;
    condition?: string;
    weatherMain?: string;
    humidity?: number;
    windKph?: number;
  } | null;
  tripStage?: 'pre_departure' | 'during_trip' | 'post_trip' | 'no_trip';
  travelHistory?: string[];
  localVsRegionalVsInternational?: 'local' | 'regional' | 'international' | 'mixed';
}

/* ── Discovery Candidate ────────────────────────────────────────────────────── */

export type DiscoveryCandidateType =
  | 'destination'
  | 'nearby_place'
  | 'event'
  | 'weekend_escape'
  | 'attraction'
  | 'restaurant'
  | 'museum'
  | 'park'
  | 'beach'
  | 'cultural'
  | 'adventure'
  | 'nightlife'
  | 'family'
  | 'romantic'
  | 'hidden_gem'
  | 'regional'
  | 'international';

export interface DiscoveryCandidate {
  id: string;
  title: string;
  type: DiscoveryCandidateType;
  category: string;
  description: string;
  imageUrl?: string;
  coordinates?: DestinationCoordinates;
  distanceKm?: number;
  rating?: number;
  reviewCount?: number;
  popularity?: number;
  priceLevel?: number;
  tags: string[];
  source: 'google_places' | 'openstreetmap' | 'ticketmaster' | 'firestore' | 'weekend_engine' | 'trending_engine';
  destinationId?: string;
  eventId?: string;
  startDate?: string;
  endDate?: string;
  destination?: Destination;
  event?: Event;
  nearbyItem?: NearbyItem;
  weekendEscape?: WeekendEscape;
  travelCategory?: string;
  travelTags?: string[];
  bestTimeToVisit?: string;
  estimatedBudget?: { min?: number; max?: number; currency?: string };
  topAttractions?: string[];
  weatherSuitability?: 'indoor' | 'outdoor' | 'any';
  isOpen?: boolean;
}

/* ── AI Recommendation ──────────────────────────────────────────────────────── */

export interface AIRecommendation {
  id: string;
  title: string;
  type: DiscoveryCandidateType;
  category: string;
  description: string;
  imageUrl?: string;
  coordinates?: DestinationCoordinates;
  distanceKm?: number;
  rating?: number;
  reviewCount?: number;
  popularity?: number;
  priceLevel?: number;
  tags: string[];
  source: DiscoveryCandidate['source'];
  destinationId?: string;
  eventId?: string;
  startDate?: string;
  endDate?: string;
  destination?: Destination;
  event?: Event;
  nearbyItem?: NearbyItem;
  weekendEscape?: WeekendEscape;
  reason: string;
  bestTimeToVisit?: string;
  bestFor: string[];
  relevanceScore: number;
  confidence: number;
  isAIReasoned: boolean;
  weatherSuitability?: 'indoor' | 'outdoor' | 'any';
  tripTypeSuitability?: ('local' | 'regional' | 'international')[];
  noveltyScore?: number;
  diversityScore?: number;
}

/* ── Discovery Section ──────────────────────────────────────────────────────── */

export type DiscoverySectionType =
  | 'for_you'
  | 'near_you'
  | 'this_weekend'
  | 'hidden_gems'
  | 'trending'
  | 'because_you_like'
  | 'perfect_for_your_trip'
  | 'explore_something_new';

export interface DiscoverySection {
  id: string;
  type: DiscoverySectionType;
  title: string;
  subtitle: string;
  recommendations: AIRecommendation[];
  source: 'ai' | 'ranked' | 'cached' | 'fallback';
  generatedAt: number;
}

/* ── Discovery Feed ─────────────────────────────────────────────────────────── */

export interface DiscoveryFeed {
  sections: DiscoverySection[];
  generatedAt: number;
  source: 'ai' | 'ranked' | 'cached' | 'fallback';
  context: DiscoveryUserContext;
  providersUsed: string[];
  errors: string[];
  isStale: boolean;
}

/* ── Discovery Options ──────────────────────────────────────────────────────── */

export interface DiscoveryOptions {
  userId?: string;
  location?: DestinationCoordinates;
  forceRefresh?: boolean;
  maxSections?: number;
  maxRecommendationsPerSection?: number;
  useCache?: boolean;
  cacheTTL?: number;
}

/* ── Discovery Analytics ────────────────────────────────────────────────────── */

export type DiscoveryAnalyticsEvent =
  | 'discovery_loaded'
  | 'discovery_generated'
  | 'discovery_viewed'
  | 'discovery_clicked'
  | 'discovery_saved'
  | 'discovery_dismissed'
  | 'discovery_coordinated'
  | 'discovery_shared'
  | 'discovery_refreshed';

export interface DiscoveryInteraction {
  userId: string;
  event: DiscoveryAnalyticsEvent;
  recommendationId: string;
  recommendationTitle: string;
  sectionType: DiscoverySectionType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/* ── Discovery Cache ────────────────────────────────────────────────────────── */

export interface DiscoveryCacheEntry {
  feed: DiscoveryFeed;
  cachedAt: number;
  ttl: number;
  userId?: string;
  locationKey?: string;
}

/* ── Gemini Discovery Response ─────────────────────────────────────────────── */

export interface GeminiDiscoveryResponse {
  recommendations: Array<{
    candidateId: string;
    title: string;
    type: DiscoveryCandidateType;
    category: string;
    reason: string;
    bestTimeToVisit?: string;
    bestFor: string[];
    relevanceScore: number;
    confidence: number;
    weatherSuitability?: 'indoor' | 'outdoor' | 'any';
    tripTypeSuitability?: ('local' | 'regional' | 'international')[];
    noveltyScore?: number;
  }>;
  sectionAssignments?: Record<string, string[]>;
  followUpSuggestions?: string[];
}

/* ── Discovery Error ────────────────────────────────────────────────────────── */

export interface DiscoveryError {
  code: 'NO_INTERNET' | 'GEMINI_UNAVAILABLE' | 'PLACES_UNAVAILABLE' | 'LOCATION_UNAVAILABLE' | 'WEATHER_UNAVAILABLE' | 'EVENTS_UNAVAILABLE' | 'FIREBASE_UNAVAILABLE' | 'UNKNOWN';
  message: string;
  retryable: boolean;
}