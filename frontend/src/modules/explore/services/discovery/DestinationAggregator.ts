/**
 * DestinationAggregator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregation layer for TICS destination discovery.
 *
 * Combines providers (OSM primary + Fir/GeoNames/Wikidata enrichment +
 * Firestore curated + optional Google) and emits NORMALIZED TICSDestination
 * objects. Downstream TICS code (TravelClassifier → TravelRankingEngine →
 * CategoryBalancer → ExploreEngine → hooks → UI) never sees provider-specific
 * shapes.
 *
 * Responsibilities:
 *   - parallel provider requests
 *   - normalization to TICSDestination
 *   - deduplication by coordinate proximity + normalized name + provider IDs
 *   - metadata merge (best description / best image / combined categories)
 *   - source confidence & quality assessment
 *   - graceful failure + fallback (OSM fails → Firestore curated still works)
 *   - non-blocking background enrichment (Wikidata/GeoNames)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Destination, DestinationCoordinates, NearbyItem } from '@/src/modules/explore/types';
import {
  OpenStreetMapProvider,
  FirestoreDestinationProvider,
  GooglePlacesProvider,
  getEnabledDestinationProviders,
  logProviderConfig,
  getLastOsmOutcome,
} from './providers';
import type { ProviderQueryOptions, TICSDestination } from './providers';
import { enrichDestinations as enrichWikimediaDestinations } from './providers/WikidataProvider';

let loggedConfig = false;

/* ── Normalization helpers ────────────────────────────────────────────────── */

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Dedup key uses provider id when available, otherwise normalized name +
 * coordinate proximity (~1 decimal ≈ 11km bucket; prefer tighter 2 decimal).
 * This collapses "Source of the Nile" / "Source of Nile" / "The Source of the Nile".
 */
function dedupKey(d: TICSDestination): string {
  if (d.sourceId) return `${d.source}:${d.sourceId}`;
  const lat = d.latitude.toFixed(2);
  const lng = d.longitude.toFixed(2);
  return `${normalizeName(d.name)}_${lat}_${lng}`;
}

function bestDescription(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function bestImage(a?: string, b?: string): string | undefined {
  return a || b;
}

/** Merge two records for the same physical destination. */
function mergePair(base: TICSDestination, incoming: TICSDestination): TICSDestination {
  const sources = Array.from(new Set([...(base.sources || [base.source]), ...(incoming.sources || [incoming.source])]));
  const categories = Array.from(new Set([...(base.categories || []), ...(incoming.categories || [])]));
  const tags = Array.from(new Set([...(base.tags || []), ...(incoming.tags || [])]));

  // Firestore curated metadata is preferred for editorial quality when present.
  const useFs = incoming.source === 'firestore';
  const preferredDesc = useFs ? bestDescription(incoming.description, base.description) : bestDescription(base.description, incoming.description);
  const preferredImg = useFs ? bestImage(incoming.imageUrl, base.imageUrl) : bestImage(base.imageUrl, incoming.imageUrl);

  return {
    ...base,
    ...incoming,
    name: base.name || incoming.name,
    latitude: base.latitude || incoming.latitude,
    longitude: base.longitude || incoming.longitude,
    description: preferredDesc,
    imageUrl: preferredImg,
    categories,
    tags,
    sources,
    source: base.source,
    sourceConfidence: Math.max(base.sourceConfidence || 0, incoming.sourceConfidence || 0),
    qualityScore: Math.max(base.qualityScore || 0, incoming.qualityScore || 0),
    rating: base.rating ?? incoming.rating,
    reviewCount: base.reviewCount ?? incoming.reviewCount,
    country: base.country || incoming.country,
    countryCode: base.countryCode || incoming.countryCode,
    metadata: { ...(base.metadata || {}), ...(incoming.metadata || {}) },
  };
}

/** Dedup + merge a batch of normalized destinations. */
export function mergeDestinations(dests: TICSDestination[]): TICSDestination[] {
  const byKey = new Map<string, TICSDestination>();
  for (const d of dests) {
    const key = dedupKey(d);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { ...d });
    else byKey.set(key, mergePair(existing, d));
  }
  return Array.from(byKey.values());
}

/* ── Provider logging / background enrichment ────────────────────────────── */

function ensureConfigLogged(): void {
  if (!loggedConfig) {
    logProviderConfig();
    loggedConfig = true;
  }
}

/** Fire-and-forget enrichment so the UI renders cached results immediately. */
function enrichInBackground(dests: TICSDestination[]): void {
  if (!dests.length) return;
  try {
    void enrichWikimediaDestinations(dests).catch(() => undefined);
  } catch {
    // never let enrichment break the pipeline
  }
}

/* ── Category filter (client-side safety net) ────────────────────────────── */

function matchesCategory(d: TICSDestination, category?: string): boolean {
  if (!category || category === 'all') return true;
  const c = category.toLowerCase();
  const hay = [d.type || '', ...(d.categories || []), ...(d.tags || []), d.name]
    .join(' ')
    .toLowerCase();
  return hay.includes(c);
}

/* ── Nearby aggregation ──────────────────────────────────────────────────── */

export interface NearbyAggregateOptions extends ProviderQueryOptions {
  lat: number;
  lng: number;
}

/**
 * OSM-first nearby discovery. Runs providers in parallel, merges + dedupes,
 * then returns normalized TICSDestination objects sorted by distance.
 */
export async function nearby({
  lat,
  lng,
  radiusKm = 50,
  category,
  limit = 30,
  budgetMs,
}: NearbyAggregateOptions): Promise<TICSDestination[]> {
  ensureConfigLogged();
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];

  const radius = radiusKm || 50;
  // OSM total budget: fall back to the provider's own default (LOCAL_BUDGET_MS,
  // sized from live measurements of public Overpass latency). Do NOT hard-code
  // a short budget here — a 5s hard cap aborts failover before ANY endpoint
  // can answer (measured: primary needs ~2-16s, slow mirror ~14s).
  const osmBudget = budgetMs;
  const results = await Promise.allSettled([
    OpenStreetMapProvider.searchNearby({ lat, lng, radiusKm: radius, category, limit: limit * 2, budgetMs: osmBudget }),
    FirestoreDestinationProvider.searchNearby({ lat, lng, radiusKm: radius, limit }),
    GooglePlacesProvider.isAvailable()
      ? GooglePlacesProvider.searchNearby({ lat, lng, radiusKm: radius, limit })
      : Promise.resolve([] as TICSDestination[]),
  ]);

  const raw: TICSDestination[] = [];
  const providerResult: Record<string, number> = {};
  results.forEach((res, idx) => {
    const names = ['OSM', 'Firestore', 'Google'];
    if (res.status === 'fulfilled') {
      providerResult[names[idx]] = res.value.length;
      raw.push(...res.value);
    } else {
      providerResult[names[idx]] = -1; // failed
    }
  });

  const merged = mergeDestinations(raw);
  const filtered = merged.filter((d) => matchesCategory(d, category));
  filtered.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

  enrichInBackground(filtered);

  const osmOutcome = getLastOsmOutcome().status;
  console.log(
    `[DestinationAggregator] Raw candidates: ${raw.length} | OSM ${providerResult.OSM} (${osmOutcome}) · Firestore ${providerResult.Firestore} · Google ${providerResult.Google ?? 0} | After deduplication: ${merged.length} | Filtered: ${filtered.length}`
  );
  return filtered.slice(0, limit);
}

/** Reject malformed / coordinateless records before they reach the UI. */
function hasUsableCoordinates(d: TICSDestination): boolean {
  // (0,0) is a valid coordinate but is what providers emit when they have NO
  // location — treat it as missing rather than shipping "Null Island".
  return !(d.latitude === 0 && d.longitude === 0);
}

/* ── Search aggregation ──────────────────────────────────────────────────── */

/**
 * Search across OSM / Wikidata / GeoNames / Firestore (+ optional Google).
 * Prioritizes exact destination matches (e.g. "Paris, France") above generic
 * POIs that merely contain the query in their name.
 */
export async function search(query: string, options: ProviderQueryOptions = {}): Promise<TICSDestination[]> {
  ensureConfigLogged();
  const q = query.trim();
  if (q.length < 2) return [];

  const providers = getEnabledDestinationProviders();
  const results = await Promise.allSettled(
    providers
      .filter((p) => p.searchByQuery)
      .map((p) => p.searchByQuery!(q, options))
  );

  const raw: TICSDestination[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled') raw.push(...res.value);
  }
  const merged = mergeDestinations(raw).filter(hasUsableCoordinates);
  const ranked = rankSearchResults(merged, q);
  console.log(`[DestinationAggregator] Search "${q}" -> ${ranked.length} unique destinations`);
  return ranked.slice(0, options.limit || 15);
}

function rankSearchResults(dests: TICSDestination[], query: string): TICSDestination[] {
  const q = normalizeName(query);
  const scored = dests.map((d) => {
    const n = normalizeName(d.name);
    let score = 0;
    if (n === q) score += 100;
    else if (n.startsWith(q)) score += 60;
    else if (n.includes(q)) score += 30;
    if (d.type === 'city' || d.categories?.includes('City')) score += 25;
    if (d.country) score += 10;
    score += (d.qualityScore || 0) * 15;
    score += Math.min((d.metadata?.sitelinks as number) || 0, 50) / 3;
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.d.distanceKm ?? 1e9) - (b.d.distanceKm ?? 1e9));
  return scored.map((s) => s.d);
}

/* ── Conversion to existing TICS models ──────────────────────────────────── */

const NEARBY_TYPES: Record<string, NearbyItem['type']> = {
  museum: 'museum',
  art_gallery: 'museum',
  park: 'park',
  restaurant: 'restaurant',
  cafe: 'restaurant',
  bar: 'restaurant',
  hotel: 'hotel',
  lodging: 'hotel',
  airport: 'airport',
  beach: 'beach',
  castle: 'historical_site',
  monument: 'historical_site',
  historic_site: 'historical_site',
  archaeological_site: 'historical_site',
  place_of_worship: 'historical_site',
  landmark: 'historical_site',
  theme_park: 'attraction',
  amusement_park: 'attraction',
  theater: 'theater',
  movie_theater: 'theater',
  entertainment: 'attraction',
};

function mapType(type?: string): NearbyItem['type'] {
  if (type && NEARBY_TYPES[type]) return NEARBY_TYPES[type];
  return 'attraction';
}

/** Convert normalized destinations into the existing NearbyItem model. */
export function toNearbyItems(
  dests: TICSDestination[],
  center?: DestinationCoordinates
): NearbyItem[] {
  return dests.map((d) => {
    let distance = d.distanceKm;
    if (typeof distance !== 'number' && center) {
      distance = haversine(center.lat, center.lng, d.latitude, d.longitude);
    }
    return {
      id: d.id,
      name: d.name,
      type: mapType(d.type),
      description: d.description || '',
      imageUrl: d.imageUrl || '',
      coordinates: { lat: d.latitude, lng: d.longitude },
      distance: Math.round((distance ?? 0) * 100) / 100,
      rating: d.rating ?? 0,
      reviewCount: d.reviewCount ?? 0,
      priceLevel: 1,
      openingHours: typeof d.openingHours === 'string' ? d.openingHours : '',
      phone: d.phone || '',
      website: d.website || '',
      tags: [...(d.tags || []), ...(d.categories || [])],
      destinationId: d.id,
      isOpen: d.isOpen,
    } as NearbyItem;
  });
}

/** Convert a normalized destination into the Destination model used by sections. */
export function toDestination(d: TICSDestination): Destination {
  return {
    id: d.id,
    name: d.name,
    slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: d.description || '',
    country: d.country || '',
    countryCode: d.countryCode || '',
    city: d.city || '',
    coordinates: { lat: d.latitude, lng: d.longitude },
    images: d.imageUrl ? [{ url: d.imageUrl, caption: '', credit: '' }] : [],
    categories: d.categories,
    travelTips: [],
    nearbyAirport: null,
    nearbyHotels: [],
    nearbyAttractions: [],
    weatherSummary: null,
    bestSeason: '',
    bestTimeToVisit: '',
    popularity: d.rating ?? 0,
    rating: d.rating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    reviews: [],
    travelRequirements: [],
    emergencyContacts: [],
    currency: '',
    language: '',
    timezone: '',
    timezoneOffset: '',
    estimatedBudget: null,
    topAttractions: [],
    relatedDestinationIds: [],
    featured: false,
    trending: false,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export const DestinationAggregator = {
  nearby,
  search,
  toNearbyItems,
  toDestination,
  mergeDestinations,
};