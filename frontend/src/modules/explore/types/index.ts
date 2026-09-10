/**
 * Explore Module Types
 * ─────────────────────────────────────────────────────────────────────────────
 * Core type definitions for the Explore module following the TICS architecture.
 * All types are strongly typed and reusable across screens, hooks, and services.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ── Category Types ─────────────────────────────────────────────────────────── */

export interface ExploreCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  imageUrl: string;
  color: string;
  parentCategoryId: string | null;
  subcategories: string[];
  tags: string[];
  featured: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ── Destination Types ──────────────────────────────────────────────────────── */

export interface DestinationCoordinates {
  lat: number;
  lng: number;
}

export interface DestinationImage {
  url: string;
  caption: string;
  credit: string;
}

export interface DestinationWeatherSummary {
  current: {
    temp: number;
    condition: string;
    icon: string;
    humidity: number;
    windSpeed: number;
  };
  forecast: Array<{
    date: string;
    tempHigh: number;
    tempLow: number;
    condition: string;
    icon: string;
  }>;
}

export interface DestinationTravelTip {
  category: string;
  tip: string;
  priority: 'essential' | 'recommended' | 'optional';
}

export interface NearbyPlace {
  id: string;
  name: string;
  type: 'hotel' | 'airport' | 'restaurant' | 'attraction' | 'museum' | 'park' | 'landmark' | 'event';
  distance: number;
  rating: number;
  priceLevel: number;
  imageUrl: string;
  coordinates: DestinationCoordinates;
  address: string;
  phone: string;
  website: string;
  openingHours: string;
}

export interface DestinationReview {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  text: string;
  date: Date;
  images: string[];
  helpful: number;
}

export interface TravelRequirement {
  type: 'visa' | 'vaccination' | 'travel_insurance' | 'eta' | 'passport_validity';
  title: string;
  description: string;
  required: boolean;
  link: string;
}

export interface EmergencyContact {
  service: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface Destination {
  id: string;
  name: string;
  slug: string;
  description: string;
  country: string;
  countryCode: string;
  city: string;
  coordinates: DestinationCoordinates;
  images: DestinationImage[];
  categories: string[];
  travelTips: DestinationTravelTip[];
  nearbyAirport: NearbyPlace | null;
  nearbyHotels: NearbyPlace[];
  nearbyAttractions: NearbyPlace[];
  weatherSummary: DestinationWeatherSummary | null;
  bestSeason: string;
  bestTimeToVisit: string;
  popularity: number;
  rating: number;
  reviewCount: number;
  reviews: DestinationReview[];
  travelRequirements: TravelRequirement[];
  emergencyContacts: EmergencyContact[];
  currency: string;
  language: string;
  timezone: string;
  timezoneOffset: string;
  estimatedBudget: {
    min: number;
    max: number;
    currency: string;
  } | null;
  topAttractions: string[];
  relatedDestinationIds: string[];
  featured: boolean;
  trending: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ── Event Types ────────────────────────────────────────────────────────────── */

export interface EventVenue {
  name: string;
  address: string;
  coordinates: DestinationCoordinates;
  capacity: number;
  website: string;
  phone: string;
}

export interface Event {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription: string;
  category: string;
  subcategory: string;
  country: string;
  city: string;
  coordinates: DestinationCoordinates;
  venue: EventVenue;
  images: DestinationImage[];
  startDate: Date;
  endDate: Date;
  ticketUrl: string;
  ticketPrice: string;
  organizer: string;
  website: string;
  popularity: number;
  rating: number;
  destinationId: string;
  relatedEventIds: string[];
  tags: string[];
  featured: boolean;
  trending: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ── Journey Feed Types ─────────────────────────────────────────────────────── */

export type FeedItemType =
  | 'trending_destination'
  | 'popular_event'
  | 'weather_alert'
  | 'travel_advisory'
  | 'weekend_escape'
  | 'recommended_experience'
  | 'trending_near_you'
  | 'for_you'
  | 'seasonal_pick'
  | 'traffic_update'
  | 'travel_tip'
  | 'road_condition';

export interface JourneyFeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  description: string;
  imageUrl: string;
  destinationId: string;
  eventId: string | null;
  source: 'destination' | 'event' | 'alert' | 'recommendation' | 'weather' | 'traffic';
  priority: number;
  expiryDate: Date | null;
  cta: {
    label: string;
    action: 'coordinate_journey' | 'view_destination' | 'view_event' | 'view_alert';
  };
  metadata: Record<string, unknown>;
  badge?: {
    label: string;
    icon: string;
    color: string;
  };
  createdAt: Date;
}

/* ── Search Types ───────────────────────────────────────────────────────────── */

export type SearchResultType =
  | 'country'
  | 'city'
  | 'hotel'
  | 'airport'
  | 'event'
  | 'museum'
  | 'park'
  | 'restaurant'
  | 'landmark'
  | 'festival'
  | 'sports_venue'
  | 'business_event'
  | 'destination';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  name: string;
  description: string;
  imageUrl: string;
  country: string;
  city: string;
  coordinates: DestinationCoordinates;
  rating: number;
  priceLevel: number;
  distance: number | null;
  destinationId: string | null;
  metadata: Record<string, unknown>;
}

export interface SearchSuggestion {
  id: string;
  text: string;
  type: SearchResultType;
  subtext: string;
  icon: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
}

export interface PopularSearchItem {
  id: string;
  query: string;
  searchCount: number;
  category?: SearchResultType;
}

/* ── Place / Nearby Types ───────────────────────────────────────────────────── */

export interface NearbyItem {
  id: string;
  name: string;
  type: NearbyPlaceType;
  description: string;
  imageUrl: string;
  coordinates: DestinationCoordinates;
  distance: number;
  rating: number;
  reviewCount: number;
  priceLevel: number;
  openingHours: string;
  phone: string;
  website: string;
  tags: string[];
  destinationId: string | null;
  isOpen?: boolean;
}

export type NearbyPlaceType =
  | 'museum'
  | 'restaurant'
  | 'park'
  | 'event'
  | 'hotel'
  | 'airport'
  | 'landmark'
  | 'attraction'
  | 'festival'
  | 'sports_venue'
  | 'mall'
  | 'theater'
  | 'historical_site'
  | 'beach'
  | 'shopping';

export type NearbySortOption = 'distance' | 'popularity' | 'rating';

/* ── Recommendation Types ───────────────────────────────────────────────────── */

export interface ExploreRecommendation {
  id: string;
  destinationId: string;
  type: 'for_you' | 'trending_near_you' | 'weekend_picks' | 'popular_nearby' | 'continue_exploring';
  title: string;
  description: string;
  reason: string;
  reasonCategory: 'interest' | 'trending' | 'seasonal' | 'location' | 'budget' | 'adventure' | 'honeymoon' | 'family';
  score: number;
  expiresAt: Date | null;
  destination: Destination | null;
}

/* ── Weekend Escape Types ───────────────────────────────────────────────────── */

export interface WeekendEscape {
  id: string;
  destinationId: string;
  type: 'day_trip' | 'weekend' | 'road_trip' | 'adventure';
  distance: number;
  travelTime: string;
  reason: string;
  destination: Destination;
}

/* ── Analytics Types ────────────────────────────────────────────────────────── */

export type ExploreAnalyticsEvent =
  | 'destination_viewed'
  | 'category_opened'
  | 'event_opened'
  | 'coordinate_journey_clicked'
  | 'destination_saved'
  | 'search_performed'
  | 'recommendation_opened'
  | 'journey_created'
  | 'feed_item_viewed'
  | 'nearby_item_viewed'
  | 'ai_assistant_opened'
  | 'weekend_escape_selected'
  | 'search_suggestion_selected'
  | 'destination_shared'
  | 'event_saved';

/* ── Response Types ─────────────────────────────────────────────────────────── */

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  lastCursor: string | null;
}

export interface ServiceResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface ExploreState {
  categories: ExploreCategory[];
  trending: Destination[];
  popular: Destination[];
  featured: Destination[];
  recommendations: ExploreRecommendation[];
  journeyFeed: JourneyFeedItem[];
  recentlyViewed: Destination[];
  nearby: NearbyItem[];
  events: Event[];
  weekendEscapes: WeekendEscape[];
  loading: boolean;
  error: string | null;
}

/* ── Section State Types ────────────────────────────────────────────────────── */

export interface SectionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  isEmpty: boolean;
}

export interface ExploreSectionsState {
  search: SectionState<SearchSuggestion>;
  aroundYou: SectionState<NearbyItem>;
  trending: SectionState<Destination>;
  categories: SectionState<ExploreCategory>;
  recommendations: SectionState<ExploreRecommendation>;
  popular: SectionState<Destination>;
  events: SectionState<Event>;
  weekendEscapes: SectionState<WeekendEscape>;
  journeyFeed: SectionState<JourneyFeedItem>;
  continueExploring: SectionState<Destination>;
}