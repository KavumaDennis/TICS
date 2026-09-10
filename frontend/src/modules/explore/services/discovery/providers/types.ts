/**
 * types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The normalized TICS destination model + DestinationProvider interface.
 *
 * Downstream TICS code (TravelClassifier, TravelRankingEngine, CategoryBalancer,
 * ExploreEngine, hooks, UI) must NOT care whether a destination came from OSM,
 * Wikidata, GeoNames, Firestore or (optionally) Google.
 *
 * This is the shared contract every provider returns and the aggregator merges.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Providers that can back a TICS destination. */
export type DestinationSource =
  | 'openstreetmap'
  | 'wikidata'
  | 'geonames'
  | 'firestore'
  | 'google_places';

/** The normalized destination object every provider produces. */
export interface TICSDestination {
  /** Stable TICS id. Provider ids are wrapped (tics:osm:node:123, ...). */
  id: string;
  /** Provider-native id (e.g. "osm:way/123", "Q12345"). */
  sourceId?: string;

  name: string;

  latitude: number;
  longitude: number;

  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;

  description?: string;

  /** TICS travel category-ish labels, plus provider tags. */
  categories: string[];
  tags?: string[];

  /** NearbyPlace-style type (attraction, restaurant, museum, ...). */
  type?: string;

  imageUrl?: string;
  website?: string;
  phone?: string;
  openingHours?: unknown;
  /** 0 / undefined means "no signal available" — never fabricated. */
  rating?: number;
  reviewCount?: number;

  distanceKm?: number;
  isOpen?: boolean;

  /** Primary source of this record. */
  source: DestinationSource;
  /** Provenance after aggregation merges. */
  sources?: DestinationSource[];
  sourceConfidence?: number;

  /** Data-quality signal, 0..1. */
  qualityScore?: number;

  metadata?: Record<string, unknown>;
}

/** Options shared across provider queries. */
export interface ProviderQueryOptions {
  /** TICS category filter (attractions, restaurants, nature, culture, ...). */
  category?: string;
  radiusKm?: number;
  limit?: number;
  maxDistanceKm?: number;
  /** When searching, an optional hint for locality/biasing. */
  center?: { lat: number; lng: number };
  country?: string;
  /**
   * Strict TOTAL latency budget for this provider call in ms.
   * Local discovery uses ~20000ms; global discovery ~25000ms (sized to the
   * slowest reliably-reachable public Overpass mirror, see
   * OpenStreetMapProvider.ts).
   */
  budgetMs?: number;
}

/** A provider capable of discovering travel-relevant TOI / destinations. */
export interface DestinationProvider {
  readonly name: string;
  /** primary = OSM; enrichment = Wikidata/GeoNames; fallback = Firestore; optional = Google. */
  readonly kind: 'primary' | 'enrichment' | 'fallback' | 'optional';
  isAvailable(): boolean;
  searchNearby(options: {
    lat: number;
    lng: number;
  } & ProviderQueryOptions): Promise<TICSDestination[]>;
  searchByQuery?(
    query: string,
    options?: ProviderQueryOptions
  ): Promise<TICSDestination[]>;
  getById?(id: string, options?: ProviderQueryOptions): Promise<TICSDestination | null>;
}

/**
 * Build a stable TICS id from a provider source and a raw id.
 * Downstream code must never rely on raw OSM ids directly.
 */
export function buildTicsId(source: DestinationSource, rawId: string | number): string {
  return `tics:${source}:${String(rawId)}`;
}

/** Validate that coordinates are within real-world bounds. */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * CENTRALIZED USER-LOCATION VALIDATION.
 *
 * Stricter than isValidCoordinate: (0,0) is the "Gulf of Guinea" null-island
 * sentinel produced by uninitialized GPS state and must NEVER be treated as a
 * real user location. All location-dependent discovery (OSM, Google Places,
 * nearby engines) must gate on this — never on isValidCoordinate alone.
 */
export function isValidUserLocation(lat: unknown, lng: unknown): boolean {
  if (!isValidCoordinate(lat as number, lng as number)) return false;
  // Reject null-island (0,0) sentinel from uninitialized GPS state.
  if (lat === 0 && lng === 0) return false;
  return true;
}
