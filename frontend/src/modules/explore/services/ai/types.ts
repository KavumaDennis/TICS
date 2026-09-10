/**
 * AI Discovery Types
 * ─────────────────────────────────────────────────────────────────────────────
 * Core type definitions for the AI Discovery feature.
 * All types are strongly typed and reusable across the AI pipeline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, Event, DestinationCoordinates } from '@/src/modules/explore/types';

/* ── Intent Types ──────────────────────────────────────────────────────────── */

export type TravelIntent =
  | 'destination_recommendations'
  | 'weekend_escape'
  | 'family_vacation'
  | 'honeymoon'
  | 'business_travel'
  | 'adventure_travel'
  | 'wildlife'
  | 'cultural_experiences'
  | 'beach_holiday'
  | 'luxury_travel'
  | 'budget_travel'
  | 'food_tourism'
  | 'festivals'
  | 'events'
  | 'road_trip'
  | 'solo_travel'
  | 'group_travel'
  | 'nearby_experiences'
  | 'general';

export const INTENT_LABELS: Record<TravelIntent, string> = {
  destination_recommendations: 'Destination Recommendations',
  weekend_escape: 'Weekend Escape',
  family_vacation: 'Family Vacation',
  honeymoon: 'Honeymoon',
  business_travel: 'Business Travel',
  adventure_travel: 'Adventure Travel',
  wildlife: 'Wildlife',
  cultural_experiences: 'Cultural Experiences',
  beach_holiday: 'Beach Holiday',
  luxury_travel: 'Luxury Travel',
  budget_travel: 'Budget Travel',
  food_tourism: 'Food Tourism',
  festivals: 'Festivals',
  events: 'Events',
  road_trip: 'Road Trip',
  solo_travel: 'Solo Travel',
  group_travel: 'Group Travel',
  nearby_experiences: 'Nearby Experiences',
  general: 'General Travel',
};

/* ── Entity Types ──────────────────────────────────────────────────────────── */

export interface ExtractedEntities {
  budget?: number;
  currency?: string;
  duration?: string;
  travelStyle?: string;
  season?: string;
  month?: string;
  currentLocation?: string;
  destination?: string;
  radius?: number;
  preference?: string;
  groupSize?: number;
  interests?: string[];
  dates?: {
    start?: string;
    end?: string;
  };
  accommodation?: string;
  transportation?: string;
}

/* ── Budget Estimate ───────────────────────────────────────────────────────── */

export interface BudgetEstimate {
  min: number;
  max: number;
  currency: string;
  breakdown?: {
    accommodation: number;
    food: number;
    transport: number;
    activities: number;
    misc: number;
  };
}

/* ── Weather Info ──────────────────────────────────────────────────────────── */

export interface WeatherInfo {
  temperature: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    date: string;
    tempHigh: number;
    tempLow: number;
    condition: string;
  }>;
}

/* ── Place Types ───────────────────────────────────────────────────────────── */

export interface Place {
  id: string;
  name: string;
  type: string;
  rating: number;
  distance?: number;
  imageUrl?: string;
  coordinates: DestinationCoordinates;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  priceLevel?: number;
}

/* ── AI Recommendation ─────────────────────────────────────────────────────── */

export interface AIRecommendation {
  destination: Destination;
  confidence: number;
  explanation: string;
  estimatedBudget: BudgetEstimate;
  weather?: WeatherInfo;
  nearbyAttractions: Place[];
  events: Event[];
  recommendedDuration: string;
  travelTips: string[];
  bestTimeToVisit: string;
  travelStyle: string;
  matchReasons: string[];
}

/* ── AI Discovery Response ─────────────────────────────────────────────────── */

export interface AIDiscoveryResponse {
  recommendations: AIRecommendation[];
  intent: TravelIntent;
  entities: ExtractedEntities;
  query: string;
  totalResults: number;
  processingTime: number;
  source: 'ai' | 'fallback' | 'cache';
  conversationId: string;
  followUpSuggestions: string[];
}

/* ── Conversation Context ──────────────────────────────────────────────────── */

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  recommendations?: AIRecommendation[];
}

export interface ConversationContext {
  id: string;
  messages: ConversationMessage[];
  lastIntent?: TravelIntent;
  lastEntities?: ExtractedEntities;
  lastRecommendations?: AIRecommendation[];
  createdAt: number;
  updatedAt: number;
}

/* ── User Context ──────────────────────────────────────────────────────────── */

export interface AIUserContext {
  uid?: string;
  name?: string;
  country?: string;
  preferredTravelStyles?: string[];
  previousTrips?: string[];
  savedDestinations?: string[];
  currentLocation?: DestinationCoordinates;
  budgetPreferences?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  searchHistory?: string[];
  favoriteCategories?: string[];
}

/* ── Discovery Options ─────────────────────────────────────────────────────── */

export interface AIDiscoveryOptions {
  userId?: string;
  location?: DestinationCoordinates;
  preferences?: Record<string, unknown>;
  season?: string;
  weather?: string;
  radiusKm?: number;
  maxResults?: number;
  useCache?: boolean;
  cacheTTL?: number;
}

/* ── Analytics Events ──────────────────────────────────────────────────────── */

export type AIDiscoveryAnalyticsEvent =
  | 'ai_discovery_opened'
  | 'ai_prompt_submitted'
  | 'ai_suggestion_selected'
  | 'ai_recommendation_viewed'
  | 'ai_coordinate_journey_clicked'
  | 'ai_journey_created'
  | 'ai_follow_up_asked'
  | 'ai_fallback_engine_used'
  | 'ai_cache_hit'
  | 'ai_error';

/* ── Error Types ───────────────────────────────────────────────────────────── */

export interface AIDiscoveryError {
  code: 'NO_INTERNET' | 'GEMINI_UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'EMPTY_RESULTS' | 'UNKNOWN';
  message: string;
  retryable: boolean;
}

/* ── Suggested Prompt ──────────────────────────────────────────────────────── */

export interface SuggestedPrompt {
  id: string;
  text: string;
  icon: string;
  category: string;
  intent?: TravelIntent;
}